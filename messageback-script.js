// document.querySelector('button').addEventListener('click', function() {
//  chrome.extension.sendMessage({action: 'message', content:"Changed by page"}, function(message){});
// });
/* document.querySelector('button').addEventListener('click', function () {
    sendObjectToDevTools({ content: "Changed by page" });
}); */

console.log('Devtools: messageback-script loaded');

window.addEventListener('click', function (e) {
    console.log('Devtools: Click Event Detected');
    sendObjectToDevTools({
        action: 'Clicked',
        what: {
            tag: e.target.tagName,
            nodeId: e.target.id,
            innerText: e.target.innerText.slice(0, 31),
            className: e.target.className
        }
    });
});

window.addEventListener('keydown', function (e) {
    console.log('Devtools: Keypress detected');
    sendObjectToDevTools({ action: 'Typed', keyVal: e.key })
})

function sendObjectToDevTools(message) {
    // The callback here can be used to execute something on receipt
    chrome.runtime.sendMessage(message, function (response) { console.log(response) });
}
