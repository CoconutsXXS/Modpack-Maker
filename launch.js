const { Client, Authenticator } = require('minecraft-launcher-core');
const launcher = new Client();
const fs = require('fs')
const { windowManager } = require('node-window-manager');
const nut = require('@nut-tree-fork/nut-js');

module.exports =
{
    launchInstance: async (name, listeners =
        {
            log: function(type, content){},
            close: function(code){},
            windowOpen: function(window){}
        }) =>
    {
        let directory = path.join(instanceDirectory, name, "minecraft");
        if(!fs.existsSync(directory)){fs.mkdir(directory, {recursive: true});}
        
        let data = JSON.parse(fs.readFileSync(path.join(instanceDirectory, name, ".instance-data.json")));

        // Install Loader
        switch(data.loader.name)
        {
            case 'vanilla':
            {
                delete data.version.custom;
                break;
            }
            case 'forge':
            {
                delete data.version.custom;

                const targetPath = path.join(directory, "versions", `forge-${data.version.number}-${data.loader.version}`);
                const targetName = `forge-${data.version.number}-${data.loader.version}.jar`;

                if(fs.existsSync(path.join(targetPath, targetName))){break;}
                if(!fs.existsSync(targetPath)){fs.mkdirSync(targetPath, {recursive:true});}

                let link = `https://maven.minecraftforge.net/net/minecraftforge/forge/${data.version.number}-${data.loader.version}/forge-${data.version.number}-${data.loader.version}`;

                const needUniversal = parseInt(data.version.number.split('.')[1]) <= 12 && (data.version.number.split('-')[0] !== '1.12.2' || (parseInt(data.version.number.split('.').pop()) <= 2847));
                if(needUniversal) { link += '-universal.jar'; } else { link += '-installer.jar';  }
                
                await download(mainWindow, link, {filename: targetName, directory: targetPath, onProgress: async (progress) =>
                {
                    event.sender.send('log', 'loaderProgress', Math.round(progress.percent*100).toString())
                }});
                break;
            }
            case 'fabric':
            {
                data.version.custom = `fabric-${data.version.number}-${data.loader.version}`;

                const targetPath = path.join(directory, "versions", `fabric-${data.version.number}-${data.loader.version}`);
                const targetName = `fabric-${data.version.number}-${data.loader.version}.json`;

                if(fs.existsSync(path.join(targetPath, targetName))){break;}
                if(!fs.existsSync(targetPath)){fs.mkdirSync(targetPath, {recursive:true});}

                const link = `https://meta.fabricmc.net/v2/versions/loader/${data.version.number}/${data.loader.version}/profile/json`;
                console.log(link)

                await download(mainWindow, link, {filename: targetName, directory: targetPath, onProgress: async (progress) =>
                {
                    event.sender.send('log', 'loaderProgress', Math.round(progress.percent*100).toString())
                }});
                break;
            }
        }

        // Settings
        let options =
        {
            root: directory,
            version: data.version,
            memory: data.memory,
            authorization: await Authenticator.getAuth("dev"),
            forge: data.loader.name=='forge'?path.join(directory, 'versions', `forge-${data.version.number}-${data.loader.version}`, `forge-${data.version.number}-${data.loader.version}.jar`):undefined,
            clientPackage: null,
            customArgs: [`-javaagent:${app.getAppPath()}/java-agent/build/libs/MinecraftAgent-0.0.1-SNAPSHOT.jar`]          
        }

        // Prepare Events
        launcher.on('progress', (e) => listeners.log('progress', e));
        launcher.on('debug', (e) => listeners.log('debug', e));
        launcher.on('data', (e) => listeners.log('data', e));
        launcher.on('close', (e) => listeners.log('close', e));
        launcher.on('error', (e) => listeners.log('error', e));
        launcher.on('close', (e) => listeners.close(e))


        // Launch
        let minecraftProcess = await launcher.launch(options);
        console.log(minecraftProcess)
        
        let result =
        {
            pid: minecraftProcess.pid
        }

        // Wait for Window
        async function trySource()
        {
            let sources = await desktopCapturer.getSources({ types: ['window'] });
    
            let mcSource = sources.find(source => source.name.startsWith('Minecraft'));
            if(!mcSource) { return false; }
                
            result.windowSource = mcSource;

            if(mainWindow.isFocused())
            {
                app.focus({steal: true});
            }
            else
            {
                for(let win of windowManager.getWindows())
                {
                    if(win.processId != minecraftProcess.pid){continue;}
    
                    win.hide();
                }
            }
            return true;
        }
        // Wait for Forge laoding window apparition
        if(instanceData.loader.name=='forge')
        {
            await new Promise((resolve) =>
            {
                addGameListener('forge_loading', async () =>
                {
                    await trySource();
                    resolve();
                }, true);
            })
        }
        // Listening to new windows
        else
        {
            await new Promise((resolve) =>
            {
                let listener = async (w) =>
                {
                    if(w.processId == minecraftProcess.pid)
                    {
                        windowManager.removeListener('window-activated', listener);
                        await trySource();
                        resolve();
                    }
                }
    
                windowManager.addListener('window-activated', listener);
            })
        }
        // Check at intervals if still not detected
        if(result.windowSource == undefined)
        {
            await new Promise(async (resolve) =>
            {
                let interval = setInterval(async () =>
                {
                    if(await trySource()) { resolve(); clearInterval(interval); }
                }, 1000);
            })
        }
        listeners.windowOpen(result.windowSource);
    }
}

async function inputOnWindow(win, action, x, y, width, height, sync = false)
{    
    if(sync)
    {
        win.setBounds({x: mainWindow.getBounds().x + x+1, y: mainWindow.getBounds().y + y+1, width: width, height: height});
    }
    const bounds = win.getBounds();

    let oldMousePosition = null
    if(sync)
    {
        const pidWin = windowManager.getWindows().find(w => w.processId === minecraftProcess.pid);
        if(pidWin)
        {
            pidWin.bringToTop()
        }else{win.bringToTop()}
        
        await nut.mouse.setPosition(await nut.mouse.getPosition());
        await action();
    }
    else
    {
        oldMousePosition = await nut.mouse.getPosition();

        const relX = (oldMousePosition.x - mainWindow.getBounds().x - x) / width;
        const relY = (oldMousePosition.y - mainWindow.getBounds().y - y) / height;

        const absX = Math.floor(bounds.x + (bounds.width * relX));
        const absY = Math.floor(bounds.y + (bounds.height * relY));

        const pidWin = windowManager.getWindows().find(w => w.processId === minecraftProcess.pid);
        if(pidWin)
        {
            pidWin.bringToTop()
        }else{win.bringToTop()}
        
        await nut.mouse.setPosition(new nut.Point(absX, absY));
        await action();
    }

    if(mainWindow)
    {
        app.focus({steal: true})
        mainWindow.focus()

        if(oldMousePosition != null) { await nut.mouse.setPosition(new nut.Point(oldMousePosition.x, oldMousePosition.y)); }
    }
}