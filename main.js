const { app, BrowserWindow, ipcMain, screen, session } = require('electron');
const path = require('node:path')
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
const fs = require('fs')

const config = require('./config');
const Instance = require('./instance');
const Download = require('./download');

app.whenReady().then(selectWindow)
app.on('activate', () =>
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
    const win = new BrowserWindow
    ({
      width: screen.getAllDisplays()[0].bounds.width-64,
      height: screen.getAllDisplays()[0].bounds.height-64,
      frame: false,
      roundedCorners: false,
      thickFrame: false,
      backgroundColor: '#000000',
      webPreferences:
      {
        preload: path.join(__dirname, 'preload.js'),
        webviewTag: true,
        contextIsolation: true
      }
    });
    win.loadFile('index.html')

    // Blocker
    // let blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    // blocker.enableBlockingInSession(session.defaultSession);    

    return win;
}
async function selectWindow()
{    
    const win = new BrowserWindow
    ({
      width: screen.getAllDisplays()[0].bounds.width/2,
      height: screen.getAllDisplays()[0].bounds.height/2,
      frame: false,
      roundedCorners: false,
      thickFrame: false,
      backgroundColor: '#000000',
      webPreferences:
      {
        preload: path.join(__dirname, 'preload.js'),
        webviewTag: true,
        contextIsolation: true
      }
    });
    win.loadFile('select.html')

    // Blocker
    let blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    blocker.enableBlockingInSession(session.defaultSession);
}

// Listing
ipcMain.on('openInstanceSelector', (event) => selectWindow)
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
    i.onModUpdate = (mods) => event.sender.send('modUpdate', mods);
    return JSON.parse(JSON.stringify(i));
});
ipcMain.handle('setModData', (event, instanceName, data) =>
{
    if(loadedInstances.find(i => i.name == instanceName))
    {
        loadedInstances.find(i => i.name == instanceName).instance.setModData(data);
    }
    else { Instance.getInstance(instanceName).setModData(data); }
})

ipcMain.handle('saveInstance', (event, i) => { return new Instance(i).save(); });
ipcMain.handle('download', async (event, url, directory, filename, createDirectory = true) =>
{
    await Download.download(url, path.join(directory, filename));
})

let instanceIndex = 0;
ipcMain.handle('launch', (event, name) =>
{
    let i = instanceIndex; instanceIndex++;
    let instance = Instance.getInstance(name);
    instance.launch(
        {
            log: (t, c) => event.sender.send(i+'log', t, c),
            close: (c) => event.sender.send(i+'close', c),
            windowOpen: (w, s) =>
            {
                console.log(`Window opened: `, w)
                event.sender.send(i+'window-open', s);

                ipcMain.on(i+'resize', (event, x, y, width, height, windowDependent) =>
                {
                    if(windowDependent)
                    {
                        let focusedAppWindow = BrowserWindow.getFocusedWindow()?BrowserWindow.getFocusedWindow():BrowserWindow.getAllWindows()[0];
                        w.setBounds({x: focusedAppWindow.getBounds().x+x, y: focusedAppWindow.getBounds().y+y, width, height});
                    }
                    else { w.setBounds({x, y, width, height}); }
                });
            },
            network: (m) => event.sender.send(i+'network', m)
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
ipcMain.handle('jarData', async (event, p, dataPath) => { return await reader.jar(p, dataPath) })
ipcMain.handle('readFolder', (event, p) => { return fs.readdirSync(path.join(app.getPath('appData'), p)); })
ipcMain.handle('readFile', (event, p) => { return reader.autoData(path.join(app.getPath('appData'), p)); })
ipcMain.handle('writeFile', (event, p, d) => { return reader.saveData(path.join(app.getPath('appData'), p), d); })
ipcMain.handle('deleteFile', (event, n) => { if(!fs.existsSync(path.join(app.getPath('appData'), n))){return} try{ return fs.unlinkSync(path.join(app.getPath('appData'), n)); }catch(err){console.warn(err)} })