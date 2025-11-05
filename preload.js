const { contextBridge, ipcRenderer } = require('electron')

window.onModUpdate = (i, m) => {}

let sep = ipcRenderer.sendSync("sep");
contextBridge.exposeInMainWorld("sep", () => { return sep });

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
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker'+sep+'instances'+sep+this.name+sep+'minecraft'+sep+'mods'+sep+name+'.jar')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker'+sep+'instances'+sep+this.name+sep+'minecraft'+sep+'mods'+sep+name+'.disabled')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker'+sep+'instances'+sep+this.name+sep+'minecraft'+sep+'mods'+sep+name);
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
        this.setRPData({filename: name, missing: true})
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker'+sep+'instances'+sep+this.name+sep+'minecraft'+sep+'resourcepacks'+sep+name+'.zip')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker'+sep+'instances'+sep+this.name+sep+'minecraft'+sep+'resourcepacks'+sep+name+'.disabled')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker'+sep+'instances'+sep+this.name+sep+'minecraft'+sep+'resourcepacks'+sep+name);
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
        this.setShaderData({filename: name, missing: true})
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker'+sep+'instances'+sep+this.name+sep+'minecraft'+sep+'shaderpacks'+sep+name+'.zip')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker'+sep+'instances'+sep+this.name+sep+'minecraft'+sep+'shaderpacks'+sep+name+'.disabled')
        ipcRenderer.invoke('deleteFile', 'Modpack\ Maker'+sep+'instances'+sep+this.name+sep+'minecraft'+sep+'shaderpacks'+sep+name);
    }

    saveFile = function(path, data)
    {
        return ipcRenderer.invoke('writeRawData', path, data)
    }

    getConfigs = function() { return ipcRenderer.invoke('readFolder', 'Modpack\ Maker'+sep+'instances'+sep+this.name+sep+'minecraft'+sep+'config') }
    getConfig = function(p) { return ipcRenderer.invoke('readFile', 'Modpack\ Maker'+sep+'instances'+sep+this.name+sep+'minecraft'+sep+'config'+sep+p) }
    setConfig = function(p, d) { return ipcRenderer.invoke('writeFile', 'Modpack\ Maker'+sep+'instances'+sep+this.name+sep+'minecraft'+sep+'config'+sep+p, d) }
    save = function(d) { return ipcRenderer.invoke('saveInstance', JSON.parse(JSON.stringify(d))) }
}

contextBridge.exposeInMainWorld('getInstance', async (name, onModUpdate = (i, m) => {}, onRPUpdate = (i, m) => {}, onShaderUpdate = (i, m) => {}, onRequestUpdate = (i, m) => {}, onLoadingUpdate = (i, l) => {}) =>
{
    ipcRenderer.send('getInstance', name)
    
    ipcRenderer.on('requestUpdate', (event, r) => { onRequestUpdate(r); })

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
    ipcRenderer.on('loadingUpdate', (event, l) => { instance.loading = l; onLoadingUpdate(instance, l); })

    return instance;
});
contextBridge.exposeInMainWorld('importInstance', async (link, metadata) => { ipcRenderer.invoke('importInstance', link, metadata) })

contextBridge.exposeInMainWorld('saveInstance', (i) => { return ipcRenderer.invoke('saveInstance', JSON.parse(JSON.stringify(i))); })

contextBridge.exposeInMainWorld('launch', async (name, listeners = {log, close, network, windowOpen}, world) =>
{
    let i = await ipcRenderer.invoke('launch', name, world);

    ipcRenderer.on(i+'log', (event, t, c) => listeners.log(t, c))
    ipcRenderer.on(i+'close', (event, c) => listeners.close(c))
    ipcRenderer.on(i+'network', (event, m) => listeners.network(m.split(':')[0], m.substring(m.split(':')[0].length+1, m.length)));
    ipcRenderer.on(i+'window-open', (event, w, i) => listeners.windowOpen(w, i));
    ipcRenderer.on(i+'process-launch', (event) => listeners.processLaunch());


    // return new Promise(resolve =>
    // {
    //     ipcRenderer.on(i+'window-open', event => resolve(i));
    // })
    return i;
})

contextBridge.exposeInMainWorld('getCombined', (name, version = null) => 
{
    // const msgpack = require('@msgpack/msgpack');

    return new Promise((resolve) =>
    {
        let totalSize = 0;
        let finalBuffer = null;
        let receivedChunks = 0;

        const startEvent = (event, { totalSize: ts }) =>
        {
            totalSize = ts;
            finalBuffer = new Uint8Array(totalSize);
        };
        ipcRenderer.on('shared-buffer-start', startEvent);

        const chunkEvent = (event, { chunk, offset }) =>
        {
            if (!finalBuffer) return;
            finalBuffer.set(new Uint8Array(chunk), offset);
            receivedChunks++;
        }
        ipcRenderer.on('shared-buffer-chunk', chunkEvent);

        const endEvent = () =>
        {
            ipcRenderer.removeListener('shared-buffer-start', startEvent)
            ipcRenderer.removeListener('shared-buffer-chunk', chunkEvent)
            ipcRenderer.removeListener('shared-buffer-end', endEvent)
            
            resolve(finalBuffer)
            // const obj = msgpack.decode(finalBuffer);
            // console.log(obj)
        };
        ipcRenderer.on('shared-buffer-end', endEvent);

        ipcRenderer.invoke("getCombined", name, version)
    })
});

contextBridge.exposeInMainWorld('resizeGame', function(i, x, y, width, height, windowDependent){ipcRenderer.send(i+'resize', x, y, width, height, windowDependent)})
contextBridge.exposeInMainWorld('closeGame', function(i){ipcRenderer.send(i+'kill')})
contextBridge.exposeInMainWorld('killGame', function(i){ipcRenderer.send(i+'kill-force')})
contextBridge.exposeInMainWorld('pauseGame', function(i){ipcRenderer.send(i+'pause')})
contextBridge.exposeInMainWorld('resumeGame', function(i){ipcRenderer.send(i+'resume')})

contextBridge.exposeInMainWorld('download', (url, directory, filename, createDirectory = true) => { return ipcRenderer.invoke('download', url, directory, filename, createDirectory); })
contextBridge.exposeInMainWorld('listenDownload', (url, callback) =>
{
    ipcRenderer.invoke('listenDownload', url);
    ipcRenderer.on("downloadProgress", (event, u, progress) =>
    {
        if(u!=url){return}
        callback(progress)
    })
})

contextBridge.exposeInMainWorld('ephemeralLaunch', async (loader, version, mods, progressListener) =>
{
    let index = await ipcRenderer.invoke('ephemeralLaunch', loader, version, mods)
    ipcRenderer.on(index+"-ephemeralInstanceProgress", (event, p) => { progressListener(p) })
})

// contextBridge.exposeInMainWorld('jarData', async (path, subPath) => { return await ipcRenderer.invoke('jarData', path, subPath); })

contextBridge.exposeInMainWorld('addPackListener', async (name, callback) =>
{
    let index = await ipcRenderer.invoke('addPackListener', name)
    ipcRenderer.on('packUpdate', (event, i, pack) => { if(i!=index){return} callback(pack) })
    return;
})

// Region
contextBridge.exposeInMainWorld('readRegion', async (path) =>
{
    const r = await ipcRenderer.invoke('readRegion', path);

    return (x, z) => {return ipcRenderer.invoke(r+'-region-chunk', x, z);}
    // if(!i){return null}

    // const chunks = [];
    // let index = 0;
    // while (true)
    // {
    //     const chunk = await ipcRenderer.invoke(i+'-region-buffer-chunk', index);
    //     if (chunk.byteLength === 0) break;
    //     chunks.push(new Uint8Array(chunk));
    //     console.log(chunk)
    //     index++;
    // }

    // const totalLength = chunks.reduce((acc, cur) => acc + cur.length, 0);
    // const fullBuffer = new Uint8Array(totalLength);
    // let offset = 0;
    // for (const chunk of chunks)
    // {
    //     fullBuffer.set(chunk, offset);
    //     offset += chunk.length;
    // }

    // try
    // {
    //     console.log("fullBuffer", fullBuffer)
    //     const decoded = new TextDecoder().decode(fullBuffer);
    //     console.log("decoded", decoded)
    //     if(!decoded){return null;}
    //     const json = JSON.parse(decoded);
    //     console.log("json", json)
    //     if(!json){return null}
    //     return json;
    // }
    // catch(err) { console.error(err) }
})


contextBridge.exposeInMainWorld('setWindowPropertie', (k, v) => {ipcRenderer.send('windowPropertie', k, v)})

contextBridge.exposeInMainWorld('ipcSend', (channel, ...args) => {ipcRenderer.send(channel, ...args)})
contextBridge.exposeInMainWorld('ipcInvoke', (channel, ...args) => { return ipcRenderer.invoke(channel, ...args)})


// Save Window
ipcRenderer.on('instance', (event, minecraft, loader) =>
{
    console.log(minecraft, loader)
    window.minecraft = minecraft;
    window.loader = loader;
})