// This one acts in the context of the panel in the Dev Tools
//
// Can use
// chrome.devtools.*
// chrome.extension.*

// global holding all chapter data, in the form {start, end, action}
const chapterData = [{ start: 0, end: 0, action: 'Start Capture', actionNumber: 0 }];
// used to scale time to the 10 second mark in the video
let videoTimeOffset = Math.round(window.performance.now());
// videoTitle holds the title of the file
let videoTitle = `${(new Date()).toISOString().split('T')[0]}_FullRun`;
// will concatenate all typing until the next click
const typedText = [];
// track previous action to allow concatenation of typeing
let lastAction = 'Start Capture';
// make the connection to the background page persistent
let port;

/** getCurrentTimeStamp is a helper to get a timestamp
 * 
 * @returns {Number} high res time in ms
 */
const getCurrentTimeStamp = () => Math.round((window.performance.now()) - videoTimeOffset);

/** metaTemplate is used to build up the FFMPEG metadata file
 * 
 * 
 * @param {String} mode -> 'HTML' to output HTML Formatted data, otherwise will get plain text
 * @returns {String} FFMPEG-formatted metadata string
 */
const metaTemplate = (mode = 'plain') => {

    const plain = `;FFMETADATA1
videoTitle=${videoTitle}

${chapterData.map(chapter => `[CHAPTER]
TIMEBASE=1/1000
START=${chapter.start}
# chapter ends at ${chapter.end}
END=${chapter.end}
videoTitle=${chapter.action} ${chapter.actionNumber}

`).join('\n')}

[STREAM]`;
    return mode === 'HTML' ? '<div>'.concat(plain.replace(/\n/g, '</div><div>')).concat('</div>') : plain;
}

// This sends an object to the background page 
// where it can be relayed to the inspected page
function sendObjectToInspectedPage(message) {
    message.tabId = chrome.devtools.inspectedWindow.tabId;
    port.postMessage(message);
}

/** writeMetadataToPanel runs the metaTemplate and drops it into the panel
 * 
 */
const writeMetadataToPanel = () => {
    document.querySelector('#metadata').innerHTML = metaTemplate('HTML');
    // also copy to clipboard
    // metaTemplate(videoTitle, 'plain')
}

// set up page listeners for controls

// click the 'Sync 10s' button when the video time hits 10s, this sets up the offset
// TODO (note the +5s button will move the sync to the next 5 second increment)
document.querySelector('#syncnow').addEventListener('click', function () {
    console.log('set offset at 10s');
    videoTimeOffset = Math.round(window.performance.now()) - 10000;
    // now enable end capture button
    document.querySelector('#endcapture').disabled = false;
}, false);

document.querySelector('#endcapture').addEventListener('click', function () {
    //sendObjectToInspectedPage({ action: "script", content: "inserted-script.js" });
    // click the 'End Capture' button to run metaTemplate and put in the panel, option to save-as
    console.log('writing metadata file to window');
    // update end time for last entry
    const lastEntry = chapterData.pop();
    lastEntry.end = getCurrentTimeStamp();
    chapterData.push(lastEntry);
    writeMetadataToPanel();
    // save to file
    saveLogFile(metaTemplate('plain'));
}, false);

// enter a videoTitle in the 'Video File Name' input box to enable sync and start 
document.querySelector('#videotitle').addEventListener('change', function (e) {
    videoTitle = `${(new Date()).toISOString().split('T')[0]}_${e.target.value}_FullRun`;
    // clear the main field
    document.querySelector('#metadata').innerText = '';
    // now enable sync button
    document.querySelector('#syncnow').disabled = false;
}, false);

//Works from the devtools, may need to click on page?
const saveLogFile = (payload, fileName = 'metadata.txt') => {
    const content = `
function handleDownload() {
    try {
        const blob = new Blob([\`${payload}\`], {type: 'text/plain'});
        const url = window.URL.createObjectURL(blob);
        document.getElementById("myDownload").href = url;
        setTimeout(() => {
        window.URL.revokeObjectURL(url);
        sendObjectToDevTools({ action: 'Download Complete'})
        }, 10000);
        console.log('download started');
    } catch (err) {
        console.error(err);
    }
}

(function() {
'use strict';
document.body.insertAdjacentHTML(
    "afterEnd",
    \`
    <a id="myDownload" href="#" download="${fileName}">downloading</a>
    \`
);
document.getElementById("myDownload").addEventListener("click", handleDownload);
document.getElementById("myDownload").click();
document.getElementById("myDownload").remove();
})();
`
    sendObjectToInspectedPage({ action: 'code', content });
}

(function createChannel() {
    console.log('channel created');
    //Create a port with background page for continuous message communication
    port = chrome.runtime.connect({
        name: "User-Action" //Given a Name
    });

    // tell the background script to add the inspected window to the list of open connections
    port.postMessage({ action: 'init', tabId: chrome.devtools.inspectedWindow.tabId });
    // Listen to messages from the background page
    // every user action, update the last record to {end:time-videoTimeOffset-1000}, 
    // then push a {start:time-videoTimeOffset-10000, end:<same>+1, action:'Clicked <element.innerHTML>', actionNumber:length}
    port.onMessage.addListener(function (message) {
        if (message.action === 'Download Complete') {
            //clear all values and reset
            typedText.splice(0);
            chapterData.splice(0);
            chapterData.push({ start: 0, end: 0, action: 'Start Capture', actionNumber: 0 });
            videoTimeOffset = Math.round(window.performance.now());
            videoTitle = `${(new Date()).toISOString().split('T')[0]}_FullRun`;
            lastAction = 'Start Capture';
            document.querySelector('#videotitle').value = '';
            document.querySelector('#syncnow').disabled = true;
            document.querySelector('#endcapture').disabled = true;
            return;
        }
        // received a captured event from the running page
        let lastEntry;
        // only process if the action is Clicked or Typed, ie, it is coming from an inspected page
        if (chapterData && (message.action == 'Clicked' || message.action == 'Typed')) {
            if (message.action == 'Clicked') {
                // first update the end time of the last chapter
                lastEntry = chapterData.pop();
                lastEntry.end = getCurrentTimeStamp();
                if (lastAction == 'Typed') {
                    // concatenate the typed string
                    lastEntry.action = `${lastAction} ${typedText.join('')}`;
                    // clear typedText
                    typedText.splice(0);
                }
                chapterData.push(lastEntry);
                // now add in the start of the current chapter, with a placeholder for the end
                chapterData.push({ start: lastEntry.end, end: lastEntry.end + 1, action: `${message.action} ${message.what}`, actionNumber: chapterData.length });
                lastAction = message.action;
                port.postMessage({ action: 'status', content: `captured ${lastEntry.action}` }); //send message to page
            } else if (message.action == 'Typed' && message.keyVal !== 'Enter') {
                if (lastAction == 'Clicked') {
                    // this is the first time a typing event was captured, 
                    // first update the end time of the last chapter
                    lastEntry = chapterData.pop();
                    lastEntry.end = getCurrentTimeStamp();
                    chapterData.push(lastEntry);
                    // then create a new chapter in the DB with a placeholder for action and end
                    chapterData.push({ start: lastEntry.end, end: lastEntry.end + 1, action: message.action, actionNumber: chapterData.length });
                    port.postMessage({ action: 'status', content: `captured ${lastEntry.action}` }); //send message to page
                }
                // add to the typedText, ignore the last enter though
                if (message.keyVal !== 'Enter') typedText.push(message.keyVal);
                console.log(typedText.join(''));
                lastAction = message.action;
            }
        }
    });
}());

// user then manually runs ffmpeg -i ${videoTitle}.mp4 -i metadata.txt -map_metadata 1 ${videoTitle}_Indexed.mp4







