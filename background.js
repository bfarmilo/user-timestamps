// Chrome automatically creates a background.html page for this to execute.
// This can access the inspected page via executeScript
// 
// Can use:
// chrome.tabs.*
// chrome.runtime.*

const connections = {};


chrome.runtime.onConnect.addListener(function (port) {

    var extensionListener = function (message, sender, sendResponse) {

        if (message.action == 'init') {
            connections[message.tabId] = port;
            return;
        }

        if (message.tabId && message.content) {

                //Evaluate script in inspectedPage
                if(message.action === 'code') {
                    chrome.tabs.executeScript(message.tabId, {code: message.content}); 

                //Attach script to inspectedPage
                } else if (message.action === 'script') {
                    chrome.scripting.executeScript(message.tabId, { file: message.content });

                //Pass message to inspectedPage
            } else {
                chrome.tabs.sendMessage(message.tabId, message, sendResponse);
            }

            // This accepts messages from the inspectedPage and 
            // sends them to the panel
        } else {
            port.postMessage(message);
        }
    }

    // Listens to messages sent from the panel
    port.onMessage.addListener(extensionListener);

    port.onDisconnect.addListener(function () {
        port.onMessage.removeListener(extensionListener);
        console.log
        const tabs = Object.keys(connections);
        const matchingTab = tabs.filter(tab => connections[tab] == port);
        if (matchingTab.length) delete connections[matchingTab[0]];
    });

});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (sender.tab) {
        let tabId = sender.tab.id;
        if (tabId in connections) {
            // it's just a message for the target page, so pass it along
            connections[tabId].postMessage(request);
        } else {
            console.log('sender.tab not a known connection, must be from devtools');
            /* if (request.tabId in connections && request.action === 'script') {
                    chrome.scripting.executeScript(request.tabId, {file: request.content});
            } */
        }
    }
    return true;
});





