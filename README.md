[![published](https://static.production.devnetcloud.com/codeexchange/assets/images/devnet-published.svg)](https://developer.cisco.com/codeexchange/github/repo/tdorssers/ztp)

# Zero Touch Provisioning

Cisco has introduced [ZTP](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/prog/configuration/169/b_169_programmability_cg/zero_touch_provisioning.html) on IOS XE 16.5.1 onwards to give a device the capability to download and run a Python script in a Linux Guest Shell to perform software upgrade and configuration tasks on the device.

If your hardware and/or software does not support ZTP, you can use the [alternative](autoinstall) AutoInstall implementation.

![](media/ztp.png)

First step is to check if whether there is a startup config present, if not, then the second step is to perform a DHCP request. The third step is to download the script specified in the DHCP reply. The forth and final step is to run the Python script in the Guest Shell environment. The Guest Shell remains enabled after the script has been executed.

## Overview

By default, the Guest Shell has access to the network via the RP management port. When a device is connected to the network through the front-panel ports, the Guest Shell has no network connection. *script.py* uses CLI commands such as `copy` and `more` to access the network.

*script.py* has the following functionality built-in:
- Downloads and installs IOS XE software from a given URL, if needed
- Changes Boot Mode to installed, if device is in bundled boot mode
- Performs stack renumbering, based on a specified list of serial numbers and switch numbers
- Sets switch priorities, highest priority on the top switch
- Handles stack version mismatches using *auto upgrade*
- Turns on the blue beacons of a switch in case serial numbers are missing or are extra
- Downloads instruction data (such as serial numbers and configuration templates) in JSON formatted text
- Can also use instruction data embedded in the script
- Applies a configuration template, optionally using $-based placeholders for variable substitution
- Can also download an external template file from a given URL
- Executes commands upon script completion, such as for Smart Licensing registration
- Sends script and command output as JSON text to a URL (refer to GUI App for details)
- Can save the device configuration, if the workflow has completed successfully
- Sends logging to a specified syslog server for script monitoring

## Using

*script.py* needs 4 variables to be filled in by the user:
- SYSLOG is an IP address string of the syslog server, an empty string disables syslog
- LOGAPI is a string with URL to log API, an empty string disables status messaging
- JSON is a string with URL of the JSON encoded DATA object as specified below. Empty string disables downloading of external device data.
- DATA is a list of dicts that defines device data. Empty list disables the internal data of the script. To specify device defaults, omit the key named *stack* from one dict. Valid keys and values are:

  Key | Value
  --- | ---
  *stack* | dict with target switch number as key and serial number as value
  *version* | string with target version used to determine if upgrade is needed
  *base_url* | string with base URL to optionally join with install/config URL
  *install* | string with URL of target IOS to download
  *config* | string with URL of configuration template to download
  *subst* | dict with keys that match the placeholders in the template
  *cli* | string of final IOS commands, or Python if within {{...}}
  *save* | boolean to indicate to save configuration at script completion
  *template* | string holding configuration template with $-based placeholders

Default settings are inherited by all stacks, but stack settings have preference. For example: if the default version is 16.6.5 and the stack version is 16.9.2, then the latter is used. When the variable DATA is filled, the script, IOS XE images and configurations can be served by any HTTP server. The configuration template does not support multi-line banners, this is a limitation of ZTP. Example configuration of *script.py*:

```python
SYSLOG = '10.0.0.1'
LOGAPI = ''
JSON = ''
DATA = [{
        'version': '16.6.5',
        'install': 'http://10.0.0.1/cat9k_iosxe.16.06.05.SPA.bin',
        'save': True,
        'template': '''hostname $name
            ip domain name lab
            ip name-server 8.8.8.8
            interface range $uplink1 , $uplink2
             description uplink'''
    }, {
        'stack': {1: 'FCW0000D0LR', 2: 'FCW0000G0L7', 3: 'FOC0000X0DW'},
        'subst': {'name': 'switch1', 'uplink1': 'Gi1/0/1', 'uplink2': 'Gi2/0/1'}
    }, {
        'stack': {1: 'FCW0000D0LT'},
        'subst': {'name': 'switch2', 'uplink1': 'Gi1/0/1', 'uplink2': 'Gi1/0/2'},
        'version': '16.9.2',
        'install': 'http://10.0.0.1/cat9k_iosxe.16.09.02.SPA.bin',
        'cli': 'license smart register idtoken ****'
    }
]
```

Instead of entering the data directly into *script.py*, the GUI app can be used to enter the data and serve the files. The same key names of the list of dicts that defines device data, are displayed in the GUI app. Example configuration of *script.py*:

```python
SYSLOG = '10.0.0.1'
LOGAPI = 'http://10.0.0.1:8080/log'
JSON = 'http://10.0.0.1:8080/data'
DATA = []
```

Python expressions can be used in the final *cli* command string. For example to use the serial number in a file name:

`copy run http://10.0.0.1:8080/file/{{ztp['serial']}}.conf`

Or to pause the command execution for a moment:

`{{time.sleep(10)}}`

## GUI App

The GUI App consists of two components:
- A RESTful web server backend *app.py* based on [Bottle](http://bottlepy.org/) (a micro web framework for Python) and [Waitress](http://waitress.readthedocs.io/) a production-quality pure-Python WSGI server
- An AJAX web client written in pure JavaScript (*index.html*, *main.js* and *style.css*)

Simply put, the client retrieves instruction data from the server and stores new instruction data on the server entered by the user. Then *script.py* retrieves that instruction data, executes it and stores the output on the server:

![](media/api.png)

The REST APIs provided by *app.py* are:

Call | Description
--- | ---
*GET /file/<name>* | used to serve files and subdirectories, such as IOS XE images or configurations
*DELETE /file/<name>* | the request removes the specified file from disk
*PUT /file/<name>* | can be used to upload files from IOS to the server
*POST /file* | used by the AJAX client form to upload a file to the server
*GET /list* | the server sends a JSON text list of all files in the script directory and subdirectories 
*GET /data* | upon receiving the request, the server sends the dataset as JSON text to the client/switch
*POST /data* | the client sends the dataset as JSON text to the server using the HTML POST method
*GET /csv* | upon receiving the request, the server flattens the dataset and exports it as a CSV file
*POST /csv* | the client sends the CSV file with the flattened dataset to the server for importing
*GET /log* | upon receiving the request, the server sends the log entries as JSON text to the client
*PUT /log* | used by *script.py* to send ZTP workflow output as JSON text to the server

*app.py* validates the format of the data for every API call. Error messages from failed API calls are presented in the GUI by returning an HTTP 500 response with a message string. Files are served from the current working directory. The directory listing API returns subdirectories and hides related script files.

On the Home tab, the GUI lists all logged runs of *script.py*. The GUI displays text boxes for every key value in the DATA list of dicts on the Settings tab. The *install* and *config* text boxes are drop-down lists with the files in the working directory. The *version* text box is filled in automatically if the IOS XE version can be extracted from the file name. The GUI also supports uploading of multiple selected files on the Files tab:

![](media/gui.png)
![](media/gui2.png)
![](media/gui3.png)

## Installation

Configure a DHCP server to serve a range with option 67 set to: `http://x.x.x.x:8080/file/script.py`, where x.x.x.x is the IP address of the machine hosting *app.py*. Sample configuration on a Cisco device:
```
ip dhcp excluded-address 10.0.0.1
ip dhcp pool ztp_pool
 network 10.0.0.0 255.255.255.0
 default-router 10.0.0.1
 option 67 ascii http://10.0.0.1:8080/file/script.py
```

Install [Bottle](https://pypi.org/project/bottle/) and [Waitress](https://pypi.org/project/waitress/) using [PIP](https://pypi.org/project/pip/):

`pip install bottle waitress`

or on Ubuntu as follows:

`sudo apt-get install python-bottle python-waitress`

Put *app.py*, *index.html*, *main.js*, *style.css* and *script.py* in a directory and start the server backend on Linux as follows:

`nohup python app.py &`

The app can be run on Windows as well. Python 2.7+ and 3.4+ are supported.

As an alternative the app can also be used in a Docker container by running the following commands:
```
docker build -t ztp .
docker run --rm -e ZTP_IP=192.168.0.4 -e ZTP_PORT=8080 -p 8080:8080 --name ztp ztp
```

## Testing

The script has been successfully tested on the following platforms running 16.6.x and higher software:
- Cisco Catalyst 9300 Series Switches
- Cisco Catalyst 9400 Series Switches
- Cisco Catalyst 9500 Series Switches

The following platforms have known issues with 16.6.x software that are resolved in 16.8.x and higher software:
- Cisco Catalyst 3650 Series Switches
- Cisco Catalyst 3850 Series Switches

Platforms running 16.12.4 software have a known issue [CSCvw63161](https://quickview.cloudapps.cisco.com/quickview/bug/CSCvw63161) and you can use the [alternative](autoinstall) AutoInstall implementation as a workaround.
