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

/**
 * 
 * @param {String} chapterData -> The text file of chapter metadata  
 * @param {Blob} videoFile -> the movie file (in mkv) as an arrayBuffer
 * @returns {ArrayBuffer} the movie file (in mkv) with chapter data inserted
 */
const applyChaptersToVideo = (chapterData, videoFile) => new Promise(async (resolve, reject) => {
    try {

        const { createWorker } = FFmpeg;
        // now run ffmpeg and return the resulting buffer
        const worker = createWorker({ logger: ({ message }) => console.log(message) });
        await worker.load();
        // load files into virtual file system
        await worker.write('metadata.txt', chapterData);
        await worker.write('input.mp4', videoFile);
        // command is 
        // ffmpeg -i $1/$2.mkv -i $1/metadata.txt -map_metadata 1 -codec copy $1/$2_$3_Full_Run.mkv
        // now run the conversion
        await worker.run(`-loglevel debug -allowed_extensions ALL -i metadata.txt -map_metadata 1 -codec copy`, {
            input: `input.mkv`,
            output: `output.mkv`,
            del: true
        });
        const { data } = await worker.read(`output.mkv`);
        return resolve(data);
    } catch (e) {
        return reject(e);
    }
})

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
title=${videoTitle}

${chapterData.map(chapter => `[CHAPTER]
TIMEBASE=1/1000
START=${chapter.start}
# chapter ends at ${chapter.end}
END=${chapter.end}
title=${chapter.action} ${chapter.actionNumber}

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

/** writeMetadataToPanel writes a compact version of the metadata to the panel
 * 
 */
const writeMetadataToPanel = () => {
    document.querySelector('#metadata').innerHTML = chapterData.map(chapter => {
        const heading = `style="font-weight:bold; font-size:20px; margin: 5px 10px 0px 2px"`;
        const entry = `style="font-size:20px; margin:5px 5px 0px 2px"`;
        const activeData = chapter.display ? Object.keys(chapter.display).filter(key => !!key) : [];
        return `<div>
            <span ${heading}>${chapter.actionNumber}</span><span ${heading}>${chapter.start / 1000}s</span><span ${entry}>${chapter.action}</span>${activeData.map(val => `<span ${entry}>${chapter.display[val]}</span>`)}
        </div>`
    }).join('');
}



// set up page listeners for controls

// click the 'Sync 10s' button when the video time hits 10s, this sets up the offset
// TODO (note the +5s button will move the sync to the next 5 second increment)
document.querySelector('#syncnow').addEventListener('click', function () {
    videoTimeOffset = Math.round(window.performance.now()) - 10000;
    // enable tracking on the target page
    // inject the return message passing script
    sendObjectToInspectedPage({ action: 'script', content: './messageback-script.js' });
    // now enable end capture button
    document.querySelector('#endcapture').disabled = false;
}, false);

document.querySelector('#endcapture').addEventListener('click', function () {
    //sendObjectToInspectedPage({ action: "script", content: "inserted-script.js" });
    // click the 'End Capture' button to run metaTemplate and put in the panel, option to save-as
    // update end time for last entry
    const lastEntry = chapterData.pop();
    lastEntry.end = getCurrentTimeStamp();
    chapterData.push(lastEntry);
    writeMetadataToPanel();
    // save to file
    saveLogFile(metaTemplate('plain'));
    //document.querySelector('#uploader').disabled = false;
}, false);

document.querySelector('#uploader').addEventListener('click', async function () {
    try {
        // get the selected filename for the video file
        const dir = await showDirectoryPicker();
        const status = await dir.requestPermission({ mode: 'readonly' });
        [fileHandle] = await window.showOpenFilePicker('file', {
            startIn: 'desktop',
            types: [{
                accept: { 'video/mkv': ['.mkv'] }
            }]
        });
        const file = await fileHandle.getFile();
        if (file.name.includes('mkv')) {
            const movieData = await applyChaptersToVideo(metaTemplate('plain'), file);
            const newHandle = await dir.getFileHandle('file',
                {
                    types: [{
                        accept: { 'video/mkv': ['.mkv'] }
                    }]
                }
            );
            const writableStream = await newHandle.createWritable();
            await writableStream.write(new Blob(movieData));
            await writableStream.close();
            document.querySelector('#uploader').innerText = 'Indexing Complete'
        }
    } catch (err) {
        document.querySelector('#uploader').innerText = 'Error';
        console.err(err);
    }
}, false)

// enter a videoTitle in the 'Video File Name' input box to enable sync and start 
document.querySelector('#videotitle').addEventListener('change', function (e) {
    videoTitle = `${(new Date()).toISOString().split('T')[0]}_${e.target.value}_FullRun`;
    // clear the main field
    document.querySelector('#metadata').innerText = '';
    //clear out chapterData
    typedText.splice(0);
    chapterData.splice(0);
    chapterData.push({ start: 0, end: 0, action: 'Start Capture', actionNumber: 0 });
    // now enable sync button
    document.querySelector('#syncnow').disabled = false;
}, false);

//Works from the devtools, may need to click on page?
const saveLogFile = (payload, filename = 'metadata.txt') => {
    const blob = new Blob([payload], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename });
    return;
}

(function createChannel() {
    //Create a port with background page for continuous message communication
    port = chrome.runtime.connect({
        name: "User-Action" //Given a Name
    });

    // tell the background script to add the inspected window to the list of open connections
    sendObjectToInspectedPage({ action: 'init' });
    // Listen to messages from the background page
    // every user action, update the last record to {end:time-videoTimeOffset-1000}, 
    // then push a {start:time-videoTimeOffset-10000, end:<same>+1, action:'Clicked <element.innerHTML>', actionNumber:length}
    port.onMessage.addListener(function (message) {

        // capture the injected Download action TODO REMOVE THIS
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

        // Otherwise it's a legit captured event from the running page
        let lastEntry;
        // only process if the action is Clicked or Typed, ie, it is coming from an inspected page
        if (chapterData && (message.action == 'Clicked' || message.action == 'Typed')) {
            if (message.action == 'Clicked') {
                /*
                        action: 'Clicked',
        what: {
            tag: e.target.tagName,
            nodeId: e.target.id,
            innerText: e.target.innerText.slice(31),
            className: e.target.className
        }*/
                // first update the end time of the last chapter
                lastEntry = chapterData.pop();
                lastEntry.end = getCurrentTimeStamp();
                if (lastAction == 'Typed') {
                    // concatenate the typed string
                    lastEntry.typed = typedText.join('');
                    // clear typedText
                    typedText.splice(0);
                }
                chapterData.push(lastEntry);

                const { tag, nodeId, innerText, className } = message.what;
                // now add in the start of the current chapter, with a placeholder for the end
                chapterData.push({ start: lastEntry.end, end: lastEntry.end + 1, action: message.action, actionNumber: chapterData.length, display: { tag, nodeId, innerText, className } });
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
                lastAction = message.action;
            }
            // display the interim data on the panel
            writeMetadataToPanel();
        }
    });
}());

// user then manually runs ffmpeg -i ${videoTitle}.mp4 -i metadata.txt -map_metadata 1 ${videoTitle}_Indexed.mp4







