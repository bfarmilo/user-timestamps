// document.querySelector('button').addEventListener('click', function() {
//  chrome.extension.sendMessage({action: 'message', content:"Changed by page"}, function(message){});
// });
/* document.querySelector('button').addEventListener('click', function () {
    sendObjectToDevTools({ content: "Changed by page" });
}); */

console.log('Devtools: messageback-script loaded');

window.addEventListener('click', function (e) {
    console.log('Devtools: Click Event Detected');
    sendObjectToDevTools({ action: 'Clicked', what: `${e.target.tagName}: ${e.target.id || e.target.innerText.slice(31) || e.target.className}` });
});

window.addEventListener('keydown', function (e) {
    console.log('Devtools: Keypress detected');
    sendObjectToDevTools({ action: 'Typed', keyVal: e.key })
})

function sendObjectToDevTools(message) {
    // The callback here can be used to execute something on receipt
    chrome.runtime.sendMessage(message);
}
