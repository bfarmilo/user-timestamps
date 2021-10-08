// document.querySelector('button').addEventListener('click', function() {
//  chrome.extension.sendMessage({action: 'message', content:"Changed by page"}, function(message){});
// });
/* document.querySelector('button').addEventListener('click', function () {
    sendObjectToDevTools({ content: "Changed by page" });
}); */

document.addEventListener('click', function (e) {
    sendObjectToDevTools({ action: 'Clicked', what:`${e.target.tagName}: ${e.target.innerText || e.target.id || e.target.className}` });
});

document.addEventListener('keydown', function (e) {
    sendObjectToDevTools({ action: 'Typed', keyVal: e.key })
})

function sendObjectToDevTools(message) {
    // The callback here can be used to execute something on receipt
    chrome.runtime.sendMessage(message, function (message) { console.log(message.content)});
}