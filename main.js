/**
 * ZTP GUI Web App
 * Author: Tim Dorssers
 * Version: 1.0
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
        ele.text = table.rows.item(row).cells[0].childNodes[0].value;
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
        case 'template':
            var ele = document.createElement('TEXTAREA');
            ele.className = 'wide';
            ele.rows = 5;
            if (object[key]) ele.innerHTML = object[key];
            break;
        case 'install':
            var ele = createDropdown(object[key], id, function () {
                // Auto fill version input if version can be extracted from file name
                var version = document.getElementById(table.id + '_version');
                var match = document.getElementById(id).value.match(/(\d+.\d+.\d+\w?)/g);
                if (match) version.value = match[0].replace(/\b0+(\d)/g, '$1');
            });
            break;
        case 'config':
            var ele = createDropdown(object[key], id, null);
            break;
        default:
            var ele = document.createElement('INPUT');
            ele.className = 'wide';
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

function createCellWithText(row, value, readOnly) {
    var ele = document.createElement('INPUT');
    ele.className = 'wide';
    ele.type = 'text';
    ele.value = value;
    ele.readOnly = readOnly;
    row.insertCell(-1).appendChild(ele);
}

function createNestedTableRow(table, index, object, key) {
    var row = table.insertRow(index);
    createCellWithText(row, key, false);
    createCellWithText(row, object[key], false);
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
    ele.className = 'wide';
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

function createContent(data) {
    if (typeof createContent.lastIndex === 'undefined') createContent.lastIndex = 0;
    for (var index in data) {
        var table = document.createElement('TABLE');
        // Table ID is used later to recontruct the array of objects
        table.id = 'table_' + createContent.lastIndex;
        table.className = 'wide';
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
        var tableId = tables[i].id;
        if (tableId === null) continue;
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
            if (exportCsv && this.status == 200) {
                window.open('/csv', '_blank');
            } else {
                displayError(this);
            }
        }
    };
    xhttp.open("POST", "/data", true);
    xhttp.setRequestHeader("Content-type", "application/json");
    xhttp.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhttp.send(JSON.stringify(data));
}

function loadData() {
    window.onbeforeunload = function() {return ""};
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            if (this.status == 200) {
                // Parse retrieved JSON data
                var data = JSON.parse(this.responseText);
                // Look for a defaults object
                var gotDefaults = false;
                for (var index in data) {
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
    loadList();
}

function openFile(url) {
    return function() {
        window.open(url, '_blank');
    }
}

function loadList() {
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            // Parse retrieved JSON data
            var files = JSON.parse(this.responseText);
            // Create table with file list
            var table = document.createElement('TABLE');
            table.className = 'wide';
            table.id = 'table_file';
            if (files.length) {
                var row = table.insertRow(-1);
                row.className = 'center';
                row.insertCell(-1).innerHTML = 'path';
                row.insertCell(-1).innerHTML = 'size';
            }
            for (var index in files) {
                var row = table.insertRow(-1);
                createCellWithText(row, files[index].file, true);
                createCellWithText(row, files[index].size, true);
                createCellWithButton(row, 'Download', openFile('/file/' + files[index].file), null);
                createCellWithButton(row, 'Remove', function() {deleteFile(this)}, null);
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
    xhttp.open("DELETE", "/file/" + tr.cells[0].childNodes[0].value, true);
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
        window.scrollTo(0, document.body.scrollHeight);
        uploadFile(browse.files[i], i);
    }
}

function uploadFile(file, i) {
    var bar = document.getElementById('bar_' + i);
    var cancel = document.getElementById('cancel_' + i);
    var tr = bar.parentNode.parentNode.parentNode;
    var data = new FormData();
    data.append('folder', document.getElementById('folder').value);
    data.append('upload', file);
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            if (this.status != 200) displayError(this);
            // Remove progress bar
            tr.parentNode.removeChild(tr);
            if (document.getElementById('table_progress').rows.length == 0) {
                // No more progress bars so remove table and reload list
                var table = document.getElementById('table_file');
                if (table !== null) table.parentNode.removeChild(table);
                document.getElementById('form_upload').reset();
                loadList();
            }
        }
    };
    xhttp.upload.addEventListener('progress', function(e) {
        bar.innerHTML = bar.style.width = Math.round((e.loaded * 100) / e.total) + '%';
    }, false);
    xhttp.open('POST', '/file');
    xhttp.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhttp.send(data);
    cancel.addEventListener('click', function() {xhttp.abort()}, false);
}

function importCsv() {
    var data = new FormData();
    data.append('upload', document.getElementById('hiddenfile').files[0]);
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) displayError(this);
    };
    xhttp.open("POST", "/csv", true);
    xhttp.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhttp.send(data);
    document.getElementById('form_import').reset();
}