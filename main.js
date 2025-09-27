const { app, BrowserWindow, ipcMain, screen, session } = require('electron');
const path = require('node:path')
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
const fs = require('fs')
const {unzip} = require('unzipit');

const config = require('./config');
const Instance = require('./instance');
const Download = require('./download');
const Saves = require('./saves.js');
const contentModifier = require("./content-modifier.js")

ElectronBlocker.fromPrebuiltFull(fetch).then(b=>b.enableBlockingInSession(session.defaultSession))

// Extension Host
require("./extension-setup.js").firefox();
const isSilent = require("./browser-request.js");

app.whenReady().then(async () =>
{
    // let data = await require("./content-modifier.js").modData("/Users/coconuts/Library/Application Support/Modpack Maker/instances/Structure Test/minecraft/mods/aether-1.20.1-1.5.2-neoforge.jar");
    // let directoryObject = await require("./content-modifier.js").modDataToDirectoryObject(data, "/Users/coconuts/Library/Application Support/Modpack Maker/instances/Structure Test/minecraft/mods/aether-1.20.1-1.5.2-neoforge.jar")
    // await require("./content-modifier.js").writeDirectoryObject(directoryObject, "./Test.zip");
    
    // return;
    if(isSilent()){return;}

    selectWindow()
})
app.on('activate', async () =>
{
    if (BrowserWindow.getAllWindows().length === 0) selectWindow()
})
app.on('window-all-closed', () =>
{
    if (process.platform !== 'darwin') app.quit()
})

// Blocker
app.on('web-contents-created', function (webContentsCreatedEvent, contents)
{
    if(contents.getType() === 'webview')
    {
        contents.on('new-window', function (newWindowEvent, url)
        {
            newWindowEvent.preventDefault();
        });
    }
});

async function mainWindow()
{
    const load = new BrowserWindow
    ({
        width: 128,
        height: 128,
        frame: false,
        transparent: true,
        movable: false,
        minimizable: false,
        resizable: false,
        hasShadow: false
    }); load.loadFile('load.html');
    let finishedLoading = false;
    (async () =>
    {
        await setTimeout(1500/2);
        finishedLoading = true
    })()

    const win = new BrowserWindow
    ({
        width: screen.getAllDisplays()[0].bounds.width-64,
        height: screen.getAllDisplays()[0].bounds.height-64,
        x: (screen.getAllDisplays()[0].bounds.width-(screen.getAllDisplays()[0].bounds.width-64))/2,
        y: (screen.getAllDisplays()[0].bounds.height-(screen.getAllDisplays()[0].bounds.height-64))/2,
        webPreferences:
        {
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: true,
            contextIsolation: true,
            sandbox: false,
        nodeIntegration: false
        },

        frame: false,
        titleBarStyle: 'hidden',
        titleBarOverlay:
        {
            color: '#202225',
            symbolColor: '#ffffff',
            height: 28
        },

        roundedCorners: false,
        backgroundColor: '#000000',
        // transparent: true,
        // vibrancy: 'fullscreen-ui',
        // backgroundMaterial: 'acrylic',

        darkTheme: true,

        minimizable: true,
        maximizable: true,
        closable: true,
        show: false
    });

    // Debug
    // win.show();

    win.webContents.on('did-finish-load', async () =>
    {
        while(!finishedLoading){await setTimeout(100)}
        win.show();
        load.close();
    });

    win.loadFile('index.html')

    // win.once('closed', () => { if(BrowserWindow.getAllWindows().length==0){selectWindow()} })

    return win;
}
let selectorWindow = null;
async function selectWindow()
{
    if(!selectorWindow?.isDestroyed() && selectorWindow?.isFocusable()) { selectorWindow.close(); }

    const win = selectorWindow = new BrowserWindow
    ({
        width: screen.getAllDisplays()[0].bounds.width/2,
        height: screen.getAllDisplays()[0].bounds.height/2,
        frame: false,
        thickFrame: false,
        webPreferences:
        {
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: true,
            contextIsolation: true
        },
        
        roundedCorners: false,
        backgroundColor: '#000000',
        // transparent: true,
        // vibrancy: 'fullscreen-ui',
        // backgroundMaterial: 'acrylic',

        darkTheme: true,
        hasShadow: false
    });
    win.loadFile('select.html')
}

async function introImmersionWindow()
{
    const win = new BrowserWindow
    ({
        width: screen.getPrimaryDisplay().bounds.width,
        height: screen.getPrimaryDisplay().bounds.height,
        titleBarOverlay: false,
        backgroundColor: '#000',
        // closable: false,
        minimizable: false,
        fullscreenable: false,
        frame: false,
        resizable: false,
        hasShadow: false,
        movable: false,
        roundedCorners: false,
        alwaysOnTop: true,
        webPreferences:
        {
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: true,
            contextIsolation: true
        },
    });
    win.loadFile('immersion-intro/immersion-intro.html')

    let hidable = false;
    win.on('hide', (event) => {if(hidable){return} event.preventDefault(); app.show(); app.focus()})
    ipcMain.on('setHidable', (event, v) => {hidable=v})

    ipcMain.on('windowPropertie', (event, k, v) =>
    {
        try{win[k](v);}catch{win[k]=v}
    })
    ipcMain.handle('unzipInstance1', async () =>
    {
        await reader.unzipSave(app.getAppPath()+'/immersion-intro/Ultra Unimmersive.zip', config.directories.instances)
    })
    ipcMain.handle('unzipInstance2', async () =>
    {
        await reader.unzipSave(app.getAppPath()+'/immersion-intro/Ultra Immersive.zip', config.directories.instances)
    })
}

// Listing
ipcMain.on('openInstanceSelector', (event) => {selectWindow()})
ipcMain.handle('instanceList', (event) =>
{
    return Instance.instanceList();
})
ipcMain.on('openInstance', async (event, name) =>
{
    let win = await mainWindow();
    win.webContents.send('openInstance', name);
})

// Instance
let loadedInstances = [];
ipcMain.on('getInstance', (event, name) =>
{
    let i = Instance.getInstance(name);
    console.log(i)
    loadedInstances.push({name: name, instance: i})
    i.onModUpdate = (mods) => event.sender.isDestroyed()?null:event.sender.send('modUpdate', mods);
    i.onRPUpdate = (rp) => event.sender.isDestroyed()?null:event.sender.send('RPUpdate', rp);;
    i.onShaderUpdate = (shaders) => event.sender.isDestroyed()?null:event.sender.send('shaderUpdate', shaders);
    i.onRequestUpdate = (list) => event.sender.isDestroyed()?null:event.sender.send('requestUpdate', list);

    const buffer = new TextEncoder().encode(JSON.stringify(i)).buffer.slice(0);
    const chunkSize = 1.8*1024**2;
    let d = new Date();
    
    try{ipcMain.removeHandler(name+'-request-buffer-chunk')}catch{}
    ipcMain.handle(name+'-request-buffer-chunk', (event, chunkIndex) =>
    {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, buffer.byteLength);
        if(chunkIndex * chunkSize/buffer.byteLength){console.log((new Date() - d)/1000)}
        return buffer.slice(start, end);
    });

    return null;

    // return JSON.parse(JSON.stringify(i));
});
ipcMain.handle('setItemData', (event, item='mod', instanceName, data) =>
{
    let fn = item=='mod'?'setModData':(item=='shader'?'setShaderData':'setRPData')
    console.log(fn, data)
    if(loadedInstances.find(i => i.name == instanceName))
    {
        loadedInstances.find(i => i.name == instanceName).instance[fn](data);
    }
    else { Instance.getInstance(instanceName)[fn](data); }
})

ipcMain.handle('saveInstance', (event, d) =>
{
    if(loadedInstances.find(i => i.name == d.name))
    {
        loadedInstances.find(i => i.name == d.name).instance = Object.assign(loadedInstances.find(i => i.name == d.name).instance, d);
        loadedInstances.find(i => i.name == d.name).instance.save();
    }
    else { Object.assign(Instance.getInstance(d.name), d).save(); }
})

ipcMain.handle('download', async (event, url, directory, filename, createDirectory = true) =>
{
    await Download.download(url, path.join(directory, filename));
})

ipcMain.handle('importInstance', async (event, link, metadata) =>
{
    return await Instance.importInstance(link, metadata)
})

let instanceIndex = 0;
ipcMain.handle('launch', (event, name, world = null) =>
{
    let i = instanceIndex; instanceIndex++;
    let instance = Instance.getInstance(name);
    instance.launch(
        {
            log: (t, c) => event.sender.isDestroyed()?null:event.sender.send(i+'log', t, c),
            close: (c) => event.sender.isDestroyed()?null:event.sender.send(i+'close', c),
            windowOpen: (w, s, k) =>
            {
                console.log(`Window opened: `, w)
                event.sender.isDestroyed()?null:event.sender.send(i+'window-open', s, i);

                ipcMain.on(i+'resize', (event, x, y, width, height, windowDependent) =>
                {
                    if(windowDependent)
                    {
                        let focusedAppWindow = BrowserWindow.getFocusedWindow()?BrowserWindow.getFocusedWindow():BrowserWindow.getAllWindows()[0];
                        w.setBounds({x: focusedAppWindow.getBounds().x+x, y: focusedAppWindow.getBounds().y+y, width, height});
                    }
                    else { w.setBounds({x, y, width, height}); }
                });
                ipcMain.on(i+'kill', (event) => { k()});
            },
            network: (m) => event.sender.isDestroyed()?null:event.sender.send(i+'network', m)
        }
    , 1337+i, world)
    return i
})

ipcMain.on('ephemeralLaunch', async (event, loader, version, mods) =>
{
    await Instance.ephemeralInstance(loader, version, mods);
})

// Content Edition
ipcMain.handle('readModContent', async (event, p) =>
{
    return await contentModifier.modData(path.join(app.getPath('appData'), 'Modpack Maker', p));
})
ipcMain.handle('writeModContent', async (event, p, data) =>
{
    let directoryObject = await contentModifier.modDataToDirectoryObject(data)
    await contentModifier.writeDirectoryObject(directoryObject, path.join(app.getPath('appData'), 'Modpack Maker', p));
})

// Saves
ipcMain.handle('packList', (event, minecraft, loader) =>
{
    if(minecraft==undefined||loader==undefined)
    {
        return JSON.parse(JSON.stringify(Saves.packs));
    }
    else
    {
        let r = [];
        for(let p of Saves.packs)
        {
            r.push(p.getDownloadList(minecraft, loader))
        }
        return JSON.parse(JSON.stringify(Saves.packs));
    }
})
ipcMain.handle('addPack', (event, name, data) =>
{
    Saves.addPack(name, data)
})
ipcMain.handle('renamePack', (event, oldN, newN) =>
{
    Saves.renamePack(oldN, newN)
})
let packListenerIndex = 0;
ipcMain.handle('addPackListener', (event, name) =>
{
    let i = packListenerIndex;
    packListenerIndex++;
    Saves.addPackListener(name, (p) => {event.sender.isDestroyed()?null:event.sender.send('packUpdate', i, p)})
    return i;
})
ipcMain.handle('savedList', (event) =>
{
    return JSON.parse(JSON.stringify(Saves.saved));
})
ipcMain.handle('addSaved', (event, args) => { Saves.addSaved(args[0]) })
ipcMain.handle('deleteSaved', (event, args) => { Saves.deleteSaved(args[0]) })

// Data
const reader = require('./jar-reader.js');
const { setTimeout } = require('node:timers/promises');
ipcMain.handle('jarData', async (event, p, dataPath) => { return await reader.jar(p, dataPath) })
ipcMain.handle('readFolder', (event, p) => { return fs.readdirSync(path.join(app.getPath('appData'), p), {recursive:true}).filter(r=>fs.statSync(path.join(app.getPath('appData'), p, r)).isFile()); })
ipcMain.handle('readFile', (event, p) => { return reader.autoData(path.join(app.getPath('appData'), p)); })
ipcMain.handle('writeFile', (event, p, d) => { return reader.saveData(path.join(app.getPath('appData'), p), d); })
ipcMain.handle('writeRawData', (event, p, d) => { return reader.writeRawData(path.join(app.getPath('appData'), p), d); })
ipcMain.handle('deleteFile', (event, n) => { if(!fs.existsSync(path.join(app.getPath('appData'), n))){return} try{ return fs.unlinkSync(path.join(app.getPath('appData'), n)); }catch(err){console.warn(err)} })