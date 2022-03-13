""" ZTP API Web App
This script implements a simple API to serve the ZTP data object, using the
Bottle micro web framework and the Waitress HTTP server. There is a file serving
and listing API, as well as a CSV import and export API.
An AJAX web frontend app provides a GUI for data entry using these APIs. This
script validates the format of the data for every API call. Error messages of
failed API calls are presented in the GUI.

Author:  Tim Dorssers
Version: 1.2
"""

import io
import os
import re
import csv
import sys
import json
import time
import codecs
import logging
import email.utils
try:
    from urlparse import urlparse
except ImportError:
    from urllib.parse import urlparse
from collections import OrderedDict
import bottle

BASE_URL = 'http://10.0.0.1:8080/file/'  # Default base URL
UPLOAD_DIR = 'uploaded'  # Default upload folder
HIDE = r'\..*|autoinstall|media'  # Folders to hide

@bottle.hook('before_request')
def log():
    """ Logs request from client to stderr """
    ra, qs = bottle.request.remote_addr, bottle.request.query_string
    path = bottle.request.path + '?' + qs if qs else bottle.request.path
    logging.info('%s - %s %s', ra, bottle.request.method, path)

def error(msg, code=500):
    """ Sends HTTP status with error message string by raising HTTPResponse """
    raise bottle.HTTPResponse(body=json.dumps(str(msg)), status=code,
                              headers={'Content-type': 'application/json'})

@bottle.route('/')
@bottle.route('/<filename>')
def index(filename='index.html'):
    """ Frontend GUI app """
    return bottle.static_file(filename, root='.')

@bottle.get('/file/<filepath:path>')
def get_file(filepath):
    """ Serves files and subfolders """
    return bottle.static_file(filepath, root='.')

@bottle.delete('/file/<filepath:path>')
def delete_file(filepath):
    """ Removes specified file """
    filepath = os.path.normpath(filepath)
    try:
        with open('data.json') as infile:
            data = validate(json.load(infile, object_pairs_hook=OrderedDict))

        # Check string object values for filepath
        for obj, name in (item for my in data for item in my.items()):
            if hasattr(name, 'split') and filepath == os.path.normpath(name):
                error("Cannot delete. '%s' is used by '%s' object" % (name, obj))
    except (ValueError, IOError):
        pass

    try:
        os.remove(filepath)
    except OSError as e:
        error(e)

@bottle.put('/file/<filepath:path>')
def put_file(filepath):
    """ Handles file upload """
    folder, filename = os.path.split(filepath)
    folder = folder or UPLOAD_DIR
    upload = bottle.FileUpload(bottle.request.body, None, filename=filename)
    try:
        if folder and not os.path.exists(folder):
            os.makedirs(folder)

        upload.save(os.path.join(folder, upload.filename), overwrite=True)
    except (OSError, IOError) as e:
        error(e)

@bottle.post('/file')
def post_file():
    """ Handles form data for file uploading """
    folder = bottle.request.forms.get('folder') or UPLOAD_DIR
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
    result = []
    for root, dirs, files in os.walk('.'):
        # Don't visit hidden directories
        dirs[:] = [name for name in dirs if not re.match(HIDE, name)]
        if root != '.':
            for name in files:
                filename = os.path.join(root, name)
                result.append({'file': filename.replace('\\', '/'),
                               'size': os.path.getsize(filename)})

    # Prepare response header
    bottle.response.content_type = 'application/json'
    bottle.response.expires = 0
    bottle.response.set_header('Pragma', 'no-cache')
    bottle.response.set_header('Cache-Control',
                               'no-cache, no-store, must-revalidate')
    return json.dumps(result)

@bottle.get('/data')
def get_data():
    """ Parses JSON file into an OrderedDict and sends it to the web server """
    # Prepare response header
    bottle.response.content_type = 'application/json'
    bottle.response.expires = 0
    bottle.response.set_header('Pragma', 'no-cache')
    bottle.response.set_header('Cache-Control',
                               'no-cache, no-store, must-revalidate')
    # Load, validate and send JSON data
    data = [OrderedDict(base_url=BASE_URL)]
    try:
        if os.path.exists('data.json'):
            # Include last modified date in response header
            value = email.utils.formatdate(os.path.getmtime('data.json'),
                                           usegmt=True)
            bottle.response.set_header('Last-Modified', value)
            with open('data.json') as infile:
                data = json.load(infile, object_pairs_hook=OrderedDict)

        return json.dumps(validate(data))
    except (ValueError, IOError) as e:
        error(e)

@bottle.post('/data')
def post_data():
    """ Parses posted JSON data into an OrderedDict and writes to file """
    # Make sure the data has not changed in the meantime
    ius = bottle.parse_date(bottle.request.get_header('If-Unmodified-Since'))
    if ius and int(os.path.getmtime('data.json')) > ius:
        error('Discarding changes because server data was modified', 412)

    if bottle.request.content_type == 'application/json':
        # Load, validate and write JSON data
        try:
            data = validate(json.loads(bottle.request.body.getvalue(),
                                       object_pairs_hook=OrderedDict))
            with open('data.json', 'w') as outfile:
                json.dump(data, outfile, indent=4)
        except (ValueError, IOError) as e:
            error(e)

@bottle.get('/csv')
def get_csv():
    """ Converts JSON file to CSV and sends it to web server """
    with open('data.json') as infile:
        data = validate(json.load(infile, object_pairs_hook=OrderedDict))
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
        csvbuf = io.BytesIO() if sys.version_info[0] < 3 else io.StringIO()
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
def post_csv():
    """ Converts uploaded CSV to JSON data and writes to file """
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

    defaults = OrderedDict()
    stack_values = []
    for my in data:
        if not isinstance(my, OrderedDict):
            raise ValueError('Expecting JSON array of objects')

        if 'stack' in my:
            if not isinstance(my['stack'], OrderedDict):
                raise ValueError("'stack' must be JSON object")

            # Check for keys that are not a natural number
            if any(True for k in my['stack'] if not k.isdigit()):
                raise ValueError("'stack' object name must be a number")

            # Check for blank values
            if any(True for v in my['stack'].values() if not v or v.isspace()):
                raise ValueError("Empty 'stack' object value not allowed")

            # Check for duplicate values
            if (len(set(my['stack'].values())) != len(my['stack'].values())
                    or any(v in stack_values for v in my['stack'].values())):
                raise ValueError("'stack' object values must be unique")

            stack_values.extend(my['stack'].values())
            # Check if either is set
            if (bool('version' in my or 'version' in defaults)
                    != bool('install' in my or 'install' in defaults)):
                raise ValueError("'version' and 'install' are both required")
        else:
            if defaults:
                raise ValueError("Only one object without 'stack' is allowed")
            defaults = my

        if 'subst' in my:
            if not isinstance(my['subst'], OrderedDict):
                raise ValueError("'subst' must be JSON object")

            if any(True for k in my['subst'] if k.startswith('$')):
                raise ValueError("'subst' object name should not start with $")

        if 'base_url' in my:
            result = urlparse(my['base_url'])
            if result.scheme != 'http' or result.path != '/file/':
                raise ValueError("'base_url' format is 'http://change.me:8080/file/'")

        # Check local path existence only
        for key in ('install', 'config'):
            result = urlparse(my.get(key, ''))
            if not result.scheme and result.path:
                if 'base_url' not in my and 'base_url' not in defaults:
                    raise ValueError("'base_url' required for relative paths")

                if not os.path.exists(my[key]):
                    raise ValueError("'%s' not found" % my[key])

        # Check for empty dicts
        if not all(v for v in my.values() if isinstance(v, OrderedDict)):
            raise ValueError('Empty JSON object not allowed')

        # Check for blank keys
        if any(True for k in my if not k or k.isspace()):
            raise ValueError('Empty JSON object name not allowed')

    return data

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s - %(levelname)s - %(message)s')

    bottle.run(host='0.0.0.0', port=8080, server='waitress')
