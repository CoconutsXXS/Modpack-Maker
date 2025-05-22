const { contextBridge, ipcRenderer } = require('electron')
window.onModUpdate = (i, m) => {}

contextBridge.exposeInMainWorld('openInstanceSelector', async () => { return await ipcRenderer.send('openInstanceSelector') })
contextBridge.exposeInMainWorld('instanceList', async () => { return await ipcRenderer.invoke('instanceList') })
contextBridge.exposeInMainWorld('openInstance', (name) => { ipcRenderer.send('openInstance', name) })

ipcRenderer.on('openInstance', (event, name) => { try{window.loadInstance(name);}catch{contextBridge.exposeInMainWorld('instanceToLoad', name)} })

class Instance
{
    setModData = function(data)
    {
        data = JSON.parse(JSON.stringify(data))
        let i = this.mods.findIndex(m => m.filename == data.filename);
        if(i>=0) { this.mods[i] = Object.assign(this.mods[i], data); }
        else { this.mods.push(data); }

        return ipcRenderer.invoke('setModData', this.name, data)
    }
    deleteMod = function(name)
    {
        this.setModData({filename: name, missing: true})
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/mods/'+name+'.jar')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/mods/'+name+'.disabled')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/mods/'+name);
    }
    getConfigs = function() { return ipcRenderer.invoke('readFolder', 'Modpack\ Maker/instances/'+this.name+'/minecraft/config') }
    getConfig = function(p) { return ipcRenderer.invoke('readFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/config/'+p) }
    setConfig = function(p, d) { return ipcRenderer.invoke('writeFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/config/'+p, d) }
    save = function(d) { console.log(JSON.parse(JSON.stringify(d))); return ipcRenderer.invoke('saveInstance', JSON.parse(JSON.stringify(d))) }
}

contextBridge.exposeInMainWorld('getInstance', async (name, onModUpdate = (i, m) => {}) =>
{
    let instance = Object.assign(new Instance(), await ipcRenderer.invoke('getInstance', name));
    ipcRenderer.on('modUpdate', (event, mods) => { instance.mods = mods; onModUpdate(instance, mods); })

    return instance;
});
contextBridge.exposeInMainWorld('importInstance', async (link) => { ipcRenderer.invoke('importInstance', link) })

contextBridge.exposeInMainWorld('saveInstance', (i) => { return ipcRenderer.invoke('saveInstance', JSON.parse(JSON.stringify(i))); })

contextBridge.exposeInMainWorld('launch', async (name, listeners = {log, close, network, windowOpen}) =>
{
    let i = await ipcRenderer.invoke('launch', name);

    ipcRenderer.on(i+'log', (event, t, c) => listeners.log(t, c))
    ipcRenderer.on(i+'close', (event, c) => listeners.close(c))
    ipcRenderer.on(i+'network', (event, m) => listeners.network(m.split(':')[0], m.substring(m.split(':')[0].length+1, m.length)));
    ipcRenderer.on(i+'window-open', (event, w) => listeners.windowOpen(w));


    // return new Promise(resolve =>
    // {
    //     ipcRenderer.on(i+'window-open', event => resolve(i));
    // })
    return i;
})

contextBridge.exposeInMainWorld('resizeGame', function(i, x, y, width, height, windowDependent){ipcRenderer.send(i+'resize', x, y, width, height, windowDependent)})
contextBridge.exposeInMainWorld('download', (url, directory, filename, createDirectory = true) => { return ipcRenderer.invoke('download', url, directory, filename, createDirectory); })

contextBridge.exposeInMainWorld('ephemeralLaunch', (loader, version, mods) => { ipcRenderer.send('ephemeralLaunch', loader, version, mods) })

contextBridge.exposeInMainWorld('jarData', async (path, subPath) => { return await ipcRenderer.invoke('jarData', path, subPath); })