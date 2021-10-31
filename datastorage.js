
let db;

function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

function startDB(pageName) {
    const request = indexedDB.open(pageName);

    request.onerror = function (e) {
        console.error(e);
    }

    request.onupgradeneeded = function (e) {
        // fires on first open, or upgrade
        objectStore = e.target.result.createObjectStore('log', { keyPath: 'uuid' });
        // create an index on number, just in case
        objectStore.createIndex('req_number', 'req_number', { unique: true });
        // log success
        objectStore.transaction.oncomplete = function (event) {
            console.log('database upgraded');
        }
    }

    request.onsuccess = function (e) {
        db = e.target.result;
        // edit - only clear on clear log. make sure it is cleared out
        // db.transaction('log').objectStore('log').openCursor().onsuccess = e => e.target.result ? clearDatabase() : null;

        // load network timestamps from db and put on screen
        const oldTable = getAllData().then(result => {
            // result is an array of (all) values
            // need to sort by number, then format as { req_number, uuid, timeStamp, protocol, uri, request, response, content }
            result.map(row => {
                const mappedRow = {
                    index: row.req_number,
                    uuid: row.uuid,
                    timeStamp: row.requestTime,
                    protocol: row.protocol,
                    request: {},
                    response: { status: row.status },
                    uri: row.url,
                    content: row.response
                }
                appendRecord(mappedRow);
            });
            createChannel();
        })
        // db error handling
        db.onerror = function (e) {
            console.error(e);
        }
    }
}

function storeRows(data) {
    // store values in the log
    const transaction = db.transaction('log', 'readwrite');
    // set up the completion handler
    transaction.oncomplete = e => console.log('database updated');
    // now try to add one or more rows to the DB
    if (data.length) {
        data.map(row => {
            const writeRequest = transaction.objectStore('log');
            writeRequest.onsuccess = () => console.log(`row ${row[1]} added`);
            const rowData = {};
            ['uuid', 'req_number', 'requestTime', 'protocol', 'url', 'status', 'response'].map((col, idx) => {
                rowData[col] = row[idx];
            });
            writeRequest.add(rowData);
        })
    }
}

function getAllData() {
    return new Promise((resolve, reject) => {
        const result = [];
        const logStore = db.transaction('log').objectStore('log');
        logStore.openCursor().onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                result.push(cursor.value);
                cursor.continue();
            } else {
                console.log('no more entries');
                return resolve(result.sort((a, b) => a.req_number - b.req_number));
            }
        }
    })
}

function clearDatabase() {
    const logStore = db.transaction('log', 'readwrite').objectStore('log');
    logStore.openCursor().onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
            const req = logStore.delete(cursor.key);
            cursor.continue();
        } else {
            console.log('all entries deleted');
        }
    }
}