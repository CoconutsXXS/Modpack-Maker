const { app, BrowserWindow, ipcMain, screen, session } = require('electron');
const path = require('node:path')
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
const fs = require('fs')

const config = require('./config');
const Instance = require('./instance');
const Download = require('./download');

ElectronBlocker.fromPrebuiltFull(fetch).then(b=>b.enableBlockingInSession(session.defaultSession))

app.whenReady().then(selectWindow)
app.on('activate', async () =>
{
    if (BrowserWindow.getAllWindows().length === 0) mainWindow()
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
        console.log(contents.getType())
        contents.on('new-window', function (newWindowEvent, url)
        {
            console.log('block');
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
            contextIsolation: true
        },

        frame: false,
        titleBarStyle: 'hidden',
        titleBarOverlay:
        {
            color: '#202225',
            symbolColor: '#ffffff',
            height: 28
        },

        // roundedCorners: false,
        backgroundColor: '#00000000',
        transparent: true,
        vibrancy: 'fullscreen-ui',
        backgroundMaterial: 'acrylic',
        darkTheme: true,

        minimizable: true,
        maximizable: true,
        closable: true,
        show: false
    });
    win.loadFile('index.html')

    win.webContents.on('did-finish-load', async () =>
    {
        while(!finishedLoading){await setTimeout(100)}
        win.show();
        load.close();
    });

    win.once('closed', () => { if(BrowserWindow.getAllWindows().length==0){selectWindow()} })

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
        roundedCorners: false,
        thickFrame: false,
        webPreferences:
        {
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: true,
            contextIsolation: true
        },
        
        backgroundColor: '#00000000',
        transparent: true,
        vibrancy: 'fullscreen-ui',
        backgroundMaterial: 'acrylic',
        darkTheme: true,
        hasShadow: false
    });
    win.loadFile('select.html')
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
ipcMain.handle('getInstance', (event, name) =>
{
    let i = Instance.getInstance(name);
    loadedInstances.push({name: name, instance: i})
    i.onModUpdate = (mods) => event.sender.isDestroyed()?null:event.sender.send('modUpdate', mods);
    i.onRPUpdate = (rp) => event.sender.isDestroyed()?null:event.sender.send('RPUpdate', rp);;
    i.onShaderUpdate = (shaders) => event.sender.isDestroyed()?null:event.sender.send('shaderUpdate', shaders);;
    return JSON.parse(JSON.stringify(i));
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
ipcMain.handle('launch', (event, name) =>
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
                ipcMain.on(i+'kill', (event) => {k()});
            },
            network: (m) => event.sender.isDestroyed()?null:event.sender.send(i+'network', m)
        }
    , 1337+i)
    return i
})

ipcMain.on('ephemeralLaunch', async (event, loader, version, mods) =>
{
    await Instance.ephemeralInstance(loader, version, mods);
})

// Data
const reader = require('./jar-reader.js');
const { setTimeout } = require('node:timers/promises');
ipcMain.handle('jarData', async (event, p, dataPath) => { return await reader.jar(p, dataPath) })
ipcMain.handle('readFolder', (event, p) => { return fs.readdirSync(path.join(app.getPath('appData'), p), {recursive:true}).filter(r=>fs.statSync(path.join(app.getPath('appData'), p, r)).isFile()); })
ipcMain.handle('readFile', (event, p) => { return reader.autoData(path.join(app.getPath('appData'), p)); })
ipcMain.handle('writeFile', (event, p, d) => { return reader.saveData(path.join(app.getPath('appData'), p), d); })
ipcMain.handle('deleteFile', (event, n) => { if(!fs.existsSync(path.join(app.getPath('appData'), n))){return} try{ return fs.unlinkSync(path.join(app.getPath('appData'), n)); }catch(err){console.warn(err)} })