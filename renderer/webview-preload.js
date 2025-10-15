const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron',
{
    sendToHost: (channel, data) => ipcRenderer.sendToHost(channel, data),
    onMessage: (channel, callback) => { ipcRenderer.on(channel, (event, args) => callback(args)); },
    // fetchTxt: async (url) => { console.log("fetching",url,fetch); return await (await fetch(url)).text(); }
    fetchTxt: async (url) => { return await ipcRenderer.invoke("fetch-text", url) }
});

// Prevent window change
// history.pushState = function(state, title, url)
// {
//     window.location.reload();
//     const stack = new Error().stack;
//     console.log('pushState:', state, title, url);
//     return null;
// };
// history.replaceState = function(state, title, url)
// {
//     window.location.reload();
//     const stack = new Error().stack;
//     console.log('replaceState:', state, title, url);
//     return null;
// };

// window.location.assign = function(url) {};
// window.location.replace = function(url) {};
// Object.defineProperty(window.location, 'href',
// {
//     set: function(url) {}
// });
// Object.defineProperty(window, 'location',
// {
//     set: function(url) {},
//     configurable: true
// });