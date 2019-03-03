/**
 * ZTP GUI Web App
 * Author: Tim Dorssers
 * Version: 1.1
 */

function createDropdown(value, id, callback) {
    // Create block for editable drop-down list
    var div = document.createElement('DIV');
    div.className = 'dropdown';
    // First element is a text box
    var ele = document.createElement('INPUT');
    ele.id = id;
    ele.type = 'text';
    if (value) ele.value = value;
    ele.addEventListener('change', callback, false);
    div.appendChild(ele);
    // Second element is a drop-down list
    var ele = document.createElement('SELECT');
    ele.addEventListener('change', function() {
        this.previousElementSibling.value = this.value;
        this.previousElementSibling.focus();
        if (callback) callback();
    }, false);
    ele.className = 'picker';
    addOptionsFromTable(ele);
    div.appendChild(ele);
    return div;
}

function addOptionsFromTable(select) {
    // First option is blank
    select.appendChild(document.createElement('OPTION'));
    var table = document.getElementById('table_file');
    if (table === null) return;
    for (var row = 1; row < table.rows.length; row++) {
        var ele = document.createElement('OPTION');
        // Value of element in first cell of each table row will be the option text
        ele.text = table.rows.item(row).cells[0].childNodes[0].data;
        select.appendChild(ele);
    }
}

function updateOptionsFromTable() {
    // All drop-down lists
    var pickers = document.getElementsByClassName('picker');
    for (var i = 0; i < pickers.length; i++) {
        // Remove all options
        while (pickers[i].options.length) {
            pickers[i].remove(0);
        }
        addOptionsFromTable(pickers[i]);
    }
}

function createTableRow(table, object, key) {
    var id = table.id + '_' + key;
    var row = table.insertRow(-1);
    // First cell is the object key name
    var cell = row.insertCell(-1);
    cell.className = 'min';
    cell.innerHTML = key;
    // Second cell is the object value
    switch (key) {
        case 'save':
            var ele = document.createElement('INPUT');
            ele.type = 'checkbox';
            if (object[key]) ele.checked = true;
            break;
        case 'cli':
        case 'template':
            var ele = document.createElement('TEXTAREA');
            ele.addEventListener('input', function() {
                // Auto resize text area
                var breaks = this.value.match(/\n/g);
                var lines = breaks ? breaks.length + 2 : 2;
                this.rows = (lines < 10) ? lines : 10;
            }, false);
            if (object[key]) {
                ele.innerHTML = object[key];
                // Set initial text area height
                var breaks = object[key].match(/\n/g);
                var lines = breaks ? breaks.length + 2 : 2;
                ele.rows = (lines < 10) ? lines : 10;
            }
            break;
        case 'install':
            var ele = createDropdown(object[key], id, function() {
                // Auto fill version input if version can be extracted from file name
                var version = document.getElementById(table.id + '_version');
                var match = /\.(\d+.\d+.\d+\w?)\./g.exec(document.getElementById(id).value);
                if (match) version.value = match[1].replace(/\b0+(\d)/g, '$1');
            });
            break;
        case 'config':
            var ele = createDropdown(object[key], id, null);
            break;
        default:
            var ele = document.createElement('INPUT');
            ele.id = id;
            ele.type = 'text';
            if (object[key]) ele.value = object[key];
    }
    row.insertCell(-1).appendChild(ele);
}

function createCellWithButton(row, name, callback, id) {
    var cell = row.insertCell(-1);
    cell.className = 'min';
    var ele = document.createElement('INPUT');
    ele.type = 'button';
    ele.value = name;
    if (id) ele.id = id;
    ele.addEventListener('click', callback, false);
    cell.appendChild(ele);
}

function createCellWithText(row, value) {
    var ele = document.createElement('INPUT');
    ele.type = 'text';
    ele.value = value;
    row.insertCell(-1).appendChild(ele);
}

function createNestedTableRow(table, index, object, key) {
    var row = table.insertRow(index);
    createCellWithText(row, key);
    createCellWithText(row, object[key]);
    createCellWithButton(row, 'Insert Below', function() {addRow(this)}, null);
    createCellWithButton(row, 'Remove', function() {removeRow(this)}, null);
}

function removeRow(button) {
    var tr = button.parentNode.parentNode;
    var table = tr.parentNode.parentNode;
    // Prevent deletion of first row
    if (table.rows.length > 1) table.deleteRow(tr.rowIndex);
}

function addRow(button) {
    var tr = button.parentNode.parentNode;
    var table = tr.parentNode.parentNode;
    // Insert empty row below current row
    createNestedTableRow(table, tr.rowIndex + 1, {'':''}, '');
}

function createNestedTable(table, object, key) {
    var row = table.insertRow(-1);
    // First cell is the object key name
    row.insertCell(-1).innerHTML = key;
    // Second cell is the nested table
    var ele = document.createElement('TABLE');
    ele.id = table.id + '_' + key;
    if (typeof object[key] !== 'undefined' && object[key] !== null) {
        // Create rows if object is not empty
        for (var i in object[key]) {
            createNestedTableRow(ele, -1, object[key], i);
        }
    } else {
        // Create empty row in case of no or null object
        createNestedTableRow(ele, -1, {'':''}, '');
    }
    row.insertCell(-1).appendChild(ele);
}

function removeContent(ele) {
    // Remove all children from DOM element
    while (ele.firstChild) {
        ele.removeChild(ele.firstChild);
    }
}

function createContent(data) {
    for (var index = 0; index < data.length; index++) {
        var table = document.createElement('TABLE');
        // Table ID is used later to recontruct the array of objects
        table.id = 'table_' + createContent.lastIndex;
        if ('stack' in data[index]) {
            createNestedTable(table, data[index], 'stack');
        } else {
            createTableRow(table, data[index], 'base_url');
        }
        createTableRow(table, data[index], 'version');
        createTableRow(table, data[index], 'install');
        createTableRow(table, data[index], 'config');
        createNestedTable(table, data[index], 'subst');
        createTableRow(table, data[index], 'save');
        createTableRow(table, data[index], 'cli');
        createTableRow(table, data[index], 'template');
        if ('stack' in data[index]) {
            // Create paragraph for table
            var box = document.createElement('P');
            box.className = 'box';
            box.appendChild(table);
            // Create remove stack button
            var ele = document.createElement('INPUT');
            ele.type = 'button';
            ele.value = 'Remove Stack';
            ele.addEventListener('click', removeTable('table_' + createContent.lastIndex), false);
            box.appendChild(ele);
            // Put the paragraph in the stacks block
            document.getElementById('stacks').appendChild(box);
        } else {
            // Put the table in the defaults block
            document.getElementById('defaults').appendChild(table);
        }
        createContent.lastIndex++;
    }
}

function removeTable(id) {
    return function() {
        var table = document.getElementById(id);
        // Remove paragraph containing table
        table.parentNode.parentNode.removeChild(table.parentNode);
    }
}

function addTable() {
    createContent([{"stack":null}]);
}

function displayError(xhttp) {
    if (xhttp.status == 500 && xhttp.getResponseHeader('Content-type') == 'application/json') {
        alert(JSON.parse(xhttp.responseText));
    } else if (xhttp.status) {
        alert(xhttp.statusText);
    }
}

function submitData(exportCsv) {
    var data = [];
    var tables = document.getElementsByTagName('TABLE');
    for (var i = 0; i < tables.length; i++) {
        //var tableId = tables[i].id;
        //if (tableId === null) continue;
        // Split the table ID into array index and key name
        var refName = tables[i].id.split('_');
        if (isNaN(refName[1])) continue;
        if (refName.length > 2) {
            // Nested table with two text boxes in a row
            var object = {}, len = 0;
            for (var row = 0; row < tables[i].rows.length; row++) {
                var key = tables[i].rows.item(row).cells[0].childNodes[0].value;
                var value = tables[i].rows.item(row).cells[1].childNodes[0].value;
                if (key) {
                    object[key] = value;
                    len++;
                }
            }
            if (len) {
                data[refName[1]][refName[2]] = object;
            } else if (refName[2] == 'stack') {
                alert("Stack cannot be empty. Data not saved.");
                return;
            }
        } else {
            // Regular table with a key name and a text or check box in a row
            var object = {};
            for (var row = 0; row < tables[i].rows.length; row++) {
                var key = tables[i].rows.item(row).cells[0].innerHTML;
                var ele = tables[i].rows.item(row).cells[1].childNodes[0];
                if (ele.type == 'checkbox') {
                    if (ele.checked) object[key] = true;
                } else if (ele.type == 'text' || ele.tagName == 'TEXTAREA') {
                    if (ele.value) object[key] = ele.value;
                } else if (ele.tagName == 'DIV') {
                    if (ele.childNodes[0].value) object[key] = ele.childNodes[0].value;
                }
            }
            data[refName[1]] = object;
        }
    }
    // Remove undefined array elements
    for (var i = data.length - 1; i >= 0; i--) {
        if (typeof data[i] === 'undefined') data.splice(i, 1);
    }
    // Upload JSON data and display status when finished
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            // Open URL if exporting to CSV, otherwise display HTTP status
            (exportCsv && this.status == 200) ? window.open('/csv', '_blank') : displayError(this);
        }
    };
    xhttp.open("POST", "/data", true);
    xhttp.setRequestHeader("Content-type", "application/json");
    xhttp.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhttp.send(JSON.stringify(data));
}

function loadData() {
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
			removeContent(document.getElementById('stacks'));
			removeContent(document.getElementById('defaults'));
            createContent.lastIndex = 0;
            if (this.status == 200) {
                // Parse retrieved JSON data
                var data = JSON.parse(this.responseText);
                // Look for a defaults object
                var gotDefaults = false;
                for (var index = 0; index < data.length; index++) {
                    if (!('stack' in data[index])) gotDefaults = true;
                }
                // Put an empty defaults object at head of the array
                if (!gotDefaults) data.unshift({});
                createContent(data);
            } else {
                // Just display an empty defaults object in case of error
                createContent([{}]);
                displayError(this);
            }
        }
    };
    xhttp.open("GET", "/data", true);
    xhttp.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhttp.send();
}

function createLink(txt, url, callback) {
    var a = document.createElement('A');
    a.href = url ? url : '#';
    if (callback === null) a.target = '_blank';
    a.addEventListener('click', callback, false);
    a.innerHTML = txt;
    return a;
}

function loadList() {
    var table = document.getElementById('table_file');
    if (table !== null) table.parentNode.removeChild(table);
    document.getElementById('form_upload').reset();
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            // Parse retrieved JSON data
            var files = JSON.parse(this.responseText);
            if (files.length == 0) return;
            // Create table with file list
            var table = document.createElement('TABLE');
            table.id = 'table_file';
            var row = table.insertRow(-1);
            ['path', 'size', 'action'].forEach(function(key) {
                var cell = document.createElement('TH');
                cell.innerHTML = key;
                row.appendChild(cell);
            });
            for (var index = 0; index < files.length; index++) {
                var row = table.insertRow(-1);
                row.insertCell(-1).innerHTML = files[index].file;
                row.insertCell(-1).innerHTML = files[index].size;
                var cell = row.insertCell(-1);
                cell.appendChild(createLink('Download', '/file/' + files[index].file, null));
                cell.appendChild(document.createTextNode(' '));
                cell.appendChild(createLink('Remove', null, function() {deleteFile(this)}));
            }
            document.getElementById('files').appendChild(table);
            updateOptionsFromTable();
        }
    };
    xhttp.open("GET", "/list", true);
    xhttp.setRequestHeader('X-Requested-With','XMLHttpRequest');
    xhttp.send();
}

function deleteFile(button) {
    event.preventDefault()  // Prevent default action for anchor tag
    var tr = button.parentNode.parentNode;
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            if (this.status == 200) {
                var table = tr.parentNode.parentNode;
                if (table.rows.length > 2) {
                    // Remove row from table
                    table.deleteRow(tr.rowIndex);
                    updateOptionsFromTable();
                } else {
                    table.parentNode.removeChild(table);
                }
            } else {
                displayError(this);
            }
        }
    };
    // First cell in row is the file name
    xhttp.open("DELETE", "/file/" + tr.cells[0].childNodes[0].data, true);
    xhttp.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhttp.send();
}

function upload() {
    var table = document.getElementById('table_progress');
    var browse = document.getElementById('browse');
    for (var i = 0; i < browse.files.length; i++) {
        var row = table.insertRow(-1);
        // First cell is the filename
        var cell = row.insertCell(-1);
        cell.className = 'min';
        var ele = document.createElement('SPAN');
        ele.innerHTML = browse.files[i].name;
        cell.appendChild(ele);
        // Second cell is the progress bar
        var progress = document.createElement('DIV');
        progress.className = 'progress';
        progress.id = 'progress_' + i;
        var bar = document.createElement('DIV');
        bar.className = 'bar';
        bar.id = 'bar_' + i;
        bar.innerHTML = '0%';
        progress.appendChild(bar);
        row.insertCell(-1).appendChild(progress);
        // Third cell is the cancel button
        createCellWithButton(row, 'Cancel', null, 'cancel_' + i);
        // Resize file list
        var height = 265 + table.scrollHeight;
        document.getElementById('files').style.maxHeight = 'calc(100vh - ' + height + 'px)';
        uploadFile(browse.files[i], i);
    }
}

function abortUpload(xhttp) {
    return function() {xhttp.abort()};
}

function uploadFile(file, i) {
    var bar = document.getElementById('bar_' + i);
    var tr = bar.parentNode.parentNode.parentNode;
    // Prepare form fields to be sent by xhttp
    var data = new FormData();
    data.append('folder', document.getElementById('folder').value);
    data.append('upload', file);
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            if (this.status != 200) displayError(this);
            // Remove progress bar
            tr.parentNode.removeChild(tr);
            // Resize file list
            var table = document.getElementById('table_progress');
            var height = 265 + table.scrollHeight;
            document.getElementById('files').style.maxHeight = 'calc(100vh - ' + height + 'px)';
            // Reload list if this was the progress bar
            if (table.rows.length == 0) loadList();
        }
    };
    xhttp.upload.addEventListener('progress', function(e) {
        bar.innerHTML = bar.style.width = Math.round((e.loaded * 100) / e.total) + '%';
    }, false);
    xhttp.open('POST', '/file');
    xhttp.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhttp.send(data);
    var cancel = document.getElementById('cancel_' + i);
    cancel.addEventListener('click', abortUpload(xhttp), false);
}

function importCsv() {
    var data = new FormData();
    data.append('upload', document.getElementById('hiddenfile').files[0]);
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            // Reload data when import was successful, otherwise display error
            (this.status == 200) ? loadData() : displayError(this);
        }
    };
    xhttp.open("POST", "/csv", true);
    xhttp.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhttp.send(data);
    document.getElementById('form_import').reset();
}

function loadLog() {
    var log = document.getElementById('log');
    removeContent(log);
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            if (this.status == 200) {
                // Parse retrieved JSON data
                var entries = JSON.parse(this.responseText);
                if (entries.length == 0) {
                    var p = document.createElement('P');
                    p.innerHTML = 'No data';
                    log.appendChild(p);
                    return;
                }
                // Create table with log entries
                var table = document.createElement('TABLE');
                table.id = 'table_log';
                var row = table.insertRow(-1);
                ['ip', 'time', 'serial', 'version', 'status', 'view'].forEach(function(key) {
                    var cell = document.createElement('TH');
                    cell.innerHTML = key;
                    row.appendChild(cell);
                });
                for (var index = 0; index < entries.length; index++) {
                    var row = table.insertRow(-1);
                    row.insertCell(-1).innerHTML = entries[index]['ip'];
                    row.insertCell(-1).innerHTML = entries[index]['time'];
                    row.insertCell(-1).innerHTML = entries[index]['serial'];
                    row.insertCell(-1).innerHTML = entries[index]['version'];
                    row.insertCell(-1).innerHTML = entries[index]['status'];
                    var cell = row.insertCell(-1);
                    ['logbuf', 'cli'].forEach(function(key) {
                        if (typeof entries[index][key] !== 'undefined') {
                            cell.appendChild(createLink(key, null, openModal(key, entries[index][key])));
                            cell.appendChild(document.createTextNode(' '));
                        }
                    });
                }
                log.appendChild(table);
            } else {
                var p = document.createElement('P');
                p.innerHTML = 'No data';
                log.appendChild(p);
                displayError(this);
            }
        }
    };
    xhttp.open("GET", "/log", true);
    xhttp.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhttp.send();
}

function clearLog() {
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            // Reload log entries when clear was successful, otherwise display error
            (this.status == 200) ? loadLog() : displayError(this);
        }
    };
    xhttp.open("DELETE", "/log", true);
    xhttp.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhttp.send();
}

function openPage(evt, name) {
    var tabcontent = document.getElementsByClassName("tabcontent");
    for (var i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    var tablinks = document.getElementsByClassName("tablinks");
    for (var i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(name).style.display = "block";
    evt.currentTarget.className += " active";
}

function openModal(head, txt) {
    return function() {
        event.preventDefault();  // Prevent default action for anchor tag
        document.getElementById('modalhead').innerHTML = head;
        var modalcontent = document.getElementById('modalcontent');
        removeContent(modalcontent);
        // Add content
        var pre = document.createElement('PRE');
        pre.innerHTML = txt;
        modalcontent.appendChild(pre);
        // Display modal frame
        var modal = document.getElementById('modal');
        modal.style.display = 'block';
        // Close the modal by clicking outside of the modal frame
        window.onclick = function(event) {
            if (event.target == modal) modal.style.display = "none";
        };
    }
}