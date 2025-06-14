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

        return ipcRenderer.invoke('setItemData', 'mod', this.name, data)
    }
    deleteMod = function(name)
    {
        this.setModData({filename: name, missing: true})
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/mods/'+name+'.jar')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/mods/'+name+'.disabled')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/mods/'+name);
    }

    setRPData = function(data)
    {
        data = JSON.parse(JSON.stringify(data))
        let i = this.mods.findIndex(m => m.filename == data.filename);
        if(i>=0) { this.mods[i] = Object.assign(this.mods[i], data); }
        else { this.mods.push(data); }

        return ipcRenderer.invoke('setItemData', 'rp', this.name, data)
    }
    deleteRP = function(name)
    {
        this.setModData({filename: name, missing: true})
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/resourcepacks/'+name+'.zip')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/resourcepacks/'+name+'.disabled')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/resourcepacks/'+name);
    }

    setShaderData = function(data)
    {
        data = JSON.parse(JSON.stringify(data))
        let i = this.mods.findIndex(m => m.filename == data.filename);
        if(i>=0) { this.mods[i] = Object.assign(this.mods[i], data); }
        else { this.mods.push(data); }

        return ipcRenderer.invoke('setItemData', 'shader', this.name, data)
    }
    deleteShader = function(name)
    {
        this.setModData({filename: name, missing: true})
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/shaderpacks/'+name+'.zip')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/shaderpacks/'+name+'.disabled')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/shaderpacks/'+name);
    }

    saveFile = function(path, data)
    {
        return ipcRenderer.invoke('writeRawData', path, data)
    }

    getConfigs = function() { return ipcRenderer.invoke('readFolder', 'Modpack\ Maker/instances/'+this.name+'/minecraft/config') }
    getConfig = function(p) { return ipcRenderer.invoke('readFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/config/'+p) }
    setConfig = function(p, d) { return ipcRenderer.invoke('writeFile', 'Modpack\ Maker/instances/'+this.name+'/minecraft/config/'+p, d) }
    save = function(d) { console.log(JSON.parse(JSON.stringify(d))); return ipcRenderer.invoke('saveInstance', JSON.parse(JSON.stringify(d))) }
}

contextBridge.exposeInMainWorld('getInstance', async (name, onModUpdate = (i, m) => {}, onRPUpdate = (i, m) => {}, onShaderUpdate = (i, m) => {}) =>
{
    ipcRenderer.send('getInstance', name)

    let object = null;
    await new Promise(async (resolve) =>
    {
        // ipcRenderer.once(name+'-instance-buffer', (event, buffer) =>
        // {
        //     console.log(new Date().toTimeString())
        //     object = JSON.parse( new TextDecoder().decode(new Uint8Array(buffer)) );
        //     resolve();
        // });

        const chunks = [];
        let index = 0;
        while (true)
        {
            const chunk = await ipcRenderer.invoke(name+'-request-buffer-chunk', index);
            if (chunk.byteLength === 0) break;
            chunks.push(new Uint8Array(chunk));
            index++;
        }

        const totalLength = chunks.reduce((acc, cur) => acc + cur.length, 0);
        const fullBuffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks)
        {
            fullBuffer.set(chunk, offset);
            offset += chunk.length;
        }

        object = JSON.parse(new TextDecoder().decode(fullBuffer));
        resolve();
    });
    
    let instance = Object.assign(new Instance(), object);
    ipcRenderer.on('modUpdate', (event, mods) => { instance.mods = mods; onModUpdate(instance, mods); })
    ipcRenderer.on('RPUpdate', (event, rp) => { instance.rp = rp; onRPUpdate(instance, rp); })
    ipcRenderer.on('shaderUpdate', (event, shaders) => { instance.shaders = shaders; onShaderUpdate(instance, shaders); })

    console.log('getInstance', instance)
    return instance;
});
contextBridge.exposeInMainWorld('importInstance', async (link, metadata) => { ipcRenderer.invoke('importInstance', link, metadata) })

contextBridge.exposeInMainWorld('saveInstance', (i) => { return ipcRenderer.invoke('saveInstance', JSON.parse(JSON.stringify(i))); })

contextBridge.exposeInMainWorld('launch', async (name, listeners = {log, close, network, windowOpen}) =>
{
    let i = await ipcRenderer.invoke('launch', name);

    ipcRenderer.on(i+'log', (event, t, c) => listeners.log(t, c))
    ipcRenderer.on(i+'close', (event, c) => listeners.close(c))
    ipcRenderer.on(i+'network', (event, m) => listeners.network(m.split(':')[0], m.substring(m.split(':')[0].length+1, m.length)));
    ipcRenderer.on(i+'window-open', (event, w, i) => listeners.windowOpen(w, i));


    // return new Promise(resolve =>
    // {
    //     ipcRenderer.on(i+'window-open', event => resolve(i));
    // })
    return i;
})

contextBridge.exposeInMainWorld('resizeGame', function(i, x, y, width, height, windowDependent){ipcRenderer.send(i+'resize', x, y, width, height, windowDependent)})
contextBridge.exposeInMainWorld('closeGame', function(i){ipcRenderer.send(i+'kill')})
contextBridge.exposeInMainWorld('download', (url, directory, filename, createDirectory = true) => { return ipcRenderer.invoke('download', url, directory, filename, createDirectory); })

contextBridge.exposeInMainWorld('ephemeralLaunch', (loader, version, mods) => { ipcRenderer.send('ephemeralLaunch', loader, version, mods) })

contextBridge.exposeInMainWorld('jarData', async (path, subPath) => { return await ipcRenderer.invoke('jarData', path, subPath); })