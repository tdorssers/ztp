""" ZTP API Web App
This script implements a simple API to serve the ZTP data object, using the
Bottle micro web framework and the Waitress HTTP server. There is a file serving
and listing API, as well as a CSV import and export API.
An AJAX web frontend app provides a GUI for data entry using these APIs. This
script validates the format of the data for every API call. Error messages of
failed API calls are presented in the GUI.

Author:  Tim Dorssers
Version: 1.1
"""

import io
import os
import csv
import sys
import json
import time
import bottle
import codecs
import logging
from collections import OrderedDict

HIDE = ['app.py', 'data.json', 'index.html', 'main.js',
        'log.json', 'style.css', 'script.py']

def log(req):
    """ Logs request from client to stderr """
    qs = '?' + req.query_string if len(req.query_string) else ''
    logging.info('%s - %s %s%s' % (req.remote_addr, req.method, req.path, qs))

def error(msg):
    """ Sends HTTP 500 with error message string by raising HTTPResponse """
    raise bottle.HTTPResponse(body=json.dumps(str(msg)), status=500,
                              headers={'Content-type': 'application/json'})

@bottle.route('/')
@bottle.route('/<filename>')
def index(filename='index.html'):
    """ Frontend GUI app """
    log(bottle.request)
    return bottle.static_file(filename, root='.')

@bottle.get('/file/<filepath:path>')
def get_file(filepath):
    """ Serves files and subfolders """
    log(bottle.request)
    return bottle.static_file(filepath, root='.')

@bottle.delete('/file/<filepath:path>')
def delete_file(filepath):
    """ Removes specified file """
    log(bottle.request)
    if any(name in filepath for name in HIDE):
        error('Cannot remove %s' % filepath)
    else:
        try:
            os.remove(filepath)
        except OSError as e:
            error(e)

@bottle.put('/file/<filepath:path>')
def put_file(filepath):
    """ Handles file upload """
    log(bottle.request)
    folder, fname = os.path.split(filepath)
    upload = bottle.FileUpload(bottle.request.body, None, filename=fname)
    try:
        if folder and not os.path.exists(folder):
            os.makedirs(folder)

        upload.save(os.path.join(folder, upload.filename), overwrite=True)
    except (OSError, IOError) as e:
        error(e)

@bottle.post('/file')
def post_file():
    """ Handles form data for file uploading """
    log(bottle.request)
    folder = bottle.request.forms.get('folder')
    upload = bottle.request.files.get('upload')
    try:
        if folder and not os.path.exists(folder):
            os.makedirs(folder)

        upload.save(os.path.join(folder, upload.filename), overwrite=True)
    except (OSError, IOError) as e:
        error(e)

@bottle.route('/list')
def get_list():
    """ Compiles a list of files and sends it to the web server """
    log(bottle.request)
    flist = []
    for root, dirs, files in os.walk('.'):
        # Don't visit hidden directories
        dirs[:] = [name for name in dirs if not name.startswith('.')]
        # Exclude specific and hidden files
        for name in files:
            if not name in HIDE and not name.startswith('.'):
                fname = os.path.join(root, name)
                fsize = os.path.getsize(fname)
                flist.append({'file': fname.replace('\\', '/'), 'size': fsize})

    # Prepare response header
    bottle.response.content_type = 'application/json'
    bottle.response.expires = 0
    bottle.response.set_header('Pragma', 'no-cache')
    bottle.response.set_header('Cache-Control',
                               'no-cache, no-store, must-revalidate')
    return json.dumps(flist)

@bottle.get('/data')
def get_data():
    """ Parses JSON file into an OrderedDict and sends it to the web server """
    log(bottle.request)
    # Prepare response header
    bottle.response.content_type = 'application/json'
    bottle.response.expires = 0
    bottle.response.set_header('Pragma', 'no-cache')
    bottle.response.set_header('Cache-Control',
                               'no-cache, no-store, must-revalidate')
    # Load, validate and send JSON data
    try:
        if os.path.exists('data.json'):
            with open('data.json') as infile:
                data = json.load(infile, object_pairs_hook=OrderedDict)
                validate(data)
                return json.dumps(data)
        else:
            return json.dumps([{}])

    except (ValueError, IOError) as e:
        error(e)

@bottle.post('/data')
def post_data():
    """ Parses posted JSON data into an OrderedDict and writes to file """
    log(bottle.request)
    if bottle.request.content_type == 'application/json':
        # Load, validate and write JSON data
        try:
            data = json.loads(bottle.request.body.getvalue(),
                              object_pairs_hook=OrderedDict)
            validate(data)
            with open('data.json', 'w') as outfile:
                json.dump(data, outfile, indent=4)
        except (ValueError, IOError) as e:
            error(e)

@bottle.get('/csv')
def get_csv():
    """ Converts JSON file to CSV and sends it to web server """
    log(bottle.request)
    with open('data.json') as infile:
        data = json.load(infile, object_pairs_hook=OrderedDict)
        validate(data)
        # Flatten JSON data
        flat_data = []
        for dct in data:
            flat = OrderedDict()
            for k in dct:
                if isinstance(dct[k], OrderedDict):
                    for kk in dct[k]:
                        flat[str(k) + '/' + str(kk)] = dct[k][kk]
                else:
                    flat[k] = dct[k]
            flat_data.append(flat)

        # Find column names
        columns = [k for row in flat_data for k in row]
        columns = list(OrderedDict.fromkeys(columns).keys())
        # Write CSV to buffer
        if sys.version_info >= (3, 0, 0):
            csvbuf = io.StringIO()
        else:
            csvbuf = io.BytesIO()

        writer = csv.DictWriter(csvbuf, fieldnames=columns, delimiter=';')
        writer.writeheader()
        writer.writerows(flat_data)
        # Prepare response header
        bottle.response.content_type = 'text/csv'
        bottle.response.expires = 0
        bottle.response.set_header('Pragma', 'no-cache')
        bottle.response.set_header('Cache-Control',
                                   'no-cache, no-store, must-revalidate')
        bottle.response.set_header('Content-Disposition',
                                   'attachment; filename="export.csv"')
        return csvbuf.getvalue()

@bottle.post('/csv')
def post_data():
    """ Converts uploaded CSV to JSON data and writes to file """
    log(bottle.request)
    upload = bottle.request.files.get('upload')
    reader = csv.reader(codecs.iterdecode(upload.file, 'utf-8'), delimiter=';')
    headers = next(reader)
    data = []
    for row in reader:
        dct = OrderedDict(zip(headers, row))
        # Construct original cubic data structure
        cubic = OrderedDict()
        for k in dct:
            # Split keys
            kk = k.split('/')
            if dct[k] and len(kk) == 2:
                if kk[0] in cubic:
                    cubic[kk[0]].update(OrderedDict([(kk[1], dct[k])]))
                else:
                    cubic[kk[0]] = OrderedDict([(kk[1], dct[k])])
            else:
                if dct[k] == "True":
                    cubic[k] = True
                elif dct[k]:
                    cubic[k] = dct[k]
        data.append(cubic)

    # Validate and write JSON data
    try:
        validate(data)
        with open('data.json', 'w') as outfile:
            json.dump(data, outfile, indent=4)
    except (ValueError, IOError) as e:
        error(e)

@bottle.get('/log')
def log_get():
    """ Parses JSON log file and sends it to the web server """
    log(bottle.request)
    logbuf = []
    try:
        if os.path.exists('log.json'):
            with open('log.json') as infile:
                logbuf = json.load(infile)
    except (ValueError, IOError) as e:
        error(e)

    # Prepare response header
    bottle.response.content_type = 'application/json'
    bottle.response.expires = 0
    bottle.response.set_header('Pragma', 'no-cache')
    bottle.response.set_header('Cache-Control',
                               'no-cache, no-store, must-revalidate')
    # Send log buffer
    return json.dumps(logbuf)

@bottle.post('/log')
@bottle.put('/log')
def log_put():
    """ Appends JSON log entries to file """
    log(bottle.request)
    logbuf = []
    try:
        if os.path.exists('log.json'):
            with open('log.json') as infile:
                logbuf = json.load(infile)
    except (ValueError, IOError) as e:
        error(e)

    try:
        msg = json.loads(bottle.request.body.getvalue())
        if not isinstance(msg, dict):
            error('Expected JSON object')

        msg['ip'] = bottle.request.remote_addr
        msg['time'] = time.strftime('%x %X')
        logbuf.append(msg)
        # Write log buffer to file
        with open('log.json', 'w') as outfile:
            json.dump(logbuf, outfile, indent=4)
    except (ValueError, IOError) as e:
        error(e)

@bottle.delete('/log')
def log_delete():
    """ Empties JSON log file """
    log(bottle.request)
    # Just write empty list to file
    try:
        with open('log.json', 'w') as outfile:
            json.dump([], outfile)
    except (ValueError, IOError) as e:
        error(e)

def validate(data):
    """ Raises ValueError if data is invalid """
    if not isinstance(data, list):
        raise ValueError('Expecting JSON array of objects')

    num_defaults = 0
    stack_values = []
    for my in data:
        if not isinstance(my, OrderedDict):
            raise ValueError('Expecting JSON array of objects')

        if 'stack' in my:
            if not isinstance(my['stack'], OrderedDict):
                raise ValueError('Stack must be JSON object')

            # Make list of keys that are not a natural number
            nan = [k for k in my['stack'] if not k.isdigit()]
            if len(nan):
                raise ValueError("'stack' object name must be a number")

            # Make list of blank values
            empty = [v for v in my['stack'].values() if not v or v.isspace()]
            if len(empty):
                raise ValueError("Empty 'stack' object value not allowed")

            # Check for duplicate values
            if (len(set(my['stack'].values())) != len(my['stack'].values())
                or any(v in stack_values for v in my['stack'].values())):
                    raise ValueError("'stack' object values must be unique")

            stack_values.extend(my['stack'].values())
        else:
            num_defaults += 1

        if 'subst' in my and not isinstance(my['subst'], OrderedDict):
            raise ValueError("'subst' must be JSON object")

        # Make list of dict lengths
        val_len = [len(v) for v in my.values() if isinstance(v, OrderedDict)]
        if 0 in val_len:
            raise ValueError('Empty JSON object not allowed')

        # Make list of blank keys
        empty = [k for k in my if not k or k.isspace()]
        if len(empty):
            raise ValueError('Empty JSON object name not allowed')

    if num_defaults > 1:
        raise ValueError('Maximum of one object without stack key is allowed')

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s - %(levelname)s - %(message)s')

    bottle.run(host='0.0.0.0', port=8080, server='waitress')
