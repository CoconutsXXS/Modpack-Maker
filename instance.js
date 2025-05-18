const { app, desktopCapturer, BrowserWindow } = require('electron');
const { download } = require("grape-electron-dl");
const { Client, Authenticator } = require('minecraft-launcher-core');
const launcher = new Client();
const path = require('node:path')
const fs = require('fs')
const { windowManager } = require('node-window-manager');
const nut = require('@nut-tree-fork/nut-js');
const net = require('net');
var chokidar = require('chokidar');

const zlib = require('zlib');
const nbt = require('prismarine-nbt');
const minecraftData = require('minecraft-data')

const config = require('./config');
const Download = require('./download');


class Instance
{
    constructor(data = {})
    {
        Object.assign(this, data);
        this.path = path.join(config.directories.instances, this.name, "minecraft");
        if(data == {} || this.name==''){return this;}

        // Everything :)
        for(let k of Object.keys(data))
        {
            if(this[k] == undefined) { this[k] = data[k]; }
        }

        // Mods Files
        if(fs.existsSync(path.join(this.path, 'mods')))
        {
            let files = fs.readdirSync(path.join(this.path, 'mods'));
            for(let f of files)
            {
                let i = this.mods.findIndex(m => m.filename==Instance.cleanModName(f));
                if(i>=0)
                {
                    this.setModData({filename: this.mods[i].filename, missing: false, disabled: f.endsWith('.disabled')}, true)
                }
                else 
                {
                    this.setModData({filename: f, missing: false, disabled: f.endsWith('.disabled')}, true)
                }
            }
        }
        else { fs.mkdirSync(path.join(this.path, 'mods'), {recursive:true}); }
        let watcher = chokidar.watch(path.join(this.path, 'mods'), {persistent: true});
        watcher.on('all', (e, p, s) =>
        {
            // let files = fs.readdirSync(path.join(this.path, 'mods'));
            // for(let f of files)
            // {
            //     let i = this.mods.findIndex(m => m.filename==Instance.cleanModName(f));
            //     if(i>=0)
            //     {
            //         this.setModData({filename: this.mods[i].filename, missing: false, disabled: f.endsWith('.disabled')})
            //     }
            //     else 
            //     {
            //         this.setModData({filename: f, missing: false, disabled: f.endsWith('.disabled')})
            //     }
            // }

            this.onModUpdate(this.mods)
        })

        return this;
    }

    static getInstance(name)
    {
        if(!fs.existsSync( path.join(config.directories.instances, name) )) { console.error(`Instance "${name}" do not exist.`); return null; }
        if(!fs.existsSync( path.join(config.directories.instances, name, '.instance-data.json') ))
        {
            let result = new Instance();
            if(name!='')
            {
                fs.writeFileSync( path.join(config.directories.instances, name, '.instance-data.json'), JSON.stringify(result));
                console.warn(`Instance "${name}" do not provide data json file, creating one...`);
            }

            result.name = name;
            result.path = path.join(config.directories.instances, name, "minecraft")
            return result;
        }

        let result = new Instance(JSON.parse(fs.readFileSync( path.join(config.directories.instances, name, '.instance-data.json') )));
        result.name = name;
        result.path = path.join(config.directories.instances, name, "minecraft")

        return result;
    }


    async launch(listeners =
        {
            log: function(type, content){},
            close: function(code){},
            windowOpen: function(window, windowSource){},
            network: function(m){}
        }, port = 1337)
    {
        if(!fs.existsSync(this.path)){fs.mkdirSync(this.path, {recursive: true});}

        // Install Loader
        this.version.custom = await installLoader(this.path, this.loader, this.version, listeners)

        // Resource Path (download optimization)
        let resourcePath = path.join(config.directories.resources, this.version.number+'-'+this.version.type)
        if(!fs.existsSync(resourcePath)){fs.mkdirSync(resourcePath, {recursive: true});}
        if(!fs.existsSync(resourcePath+'/assets/indexes')){fs.mkdirSync(resourcePath+'/assets/indexes', {recursive: true});}
        if(!fs.existsSync(resourcePath+'/assets/objects')){fs.mkdirSync(resourcePath+'/assets/objects', {recursive: true});}
        if(!fs.existsSync(resourcePath+'/libraries')){fs.mkdirSync(resourcePath+'/libraries', {recursive: true});}
        if(!fs.existsSync(path.join(config.directories.resources, 'versions'))){fs.mkdirSync(path.join(config.directories.resources, 'versions', {recursive: true}));}


        // Settings
        let options =
        {
            root: this.path,
            version: this.version,
            memory: this.memory,
            authorization: await Authenticator.getAuth("dev"),
            forge: this.loader.name=='forge'?path.join(this.path, 'versions', `forge-${this.version.number}-${this.loader.version}`, `forge-${this.version.number}-${this.loader.version}.jar`):null,
            clientPackage: null,
            customArgs: [`-javaagent:${config.javaAgent}`],
            overrides:
            {
                assetRoot: resourcePath+'/assets',
                assetIndex: resourcePath+'/assets/indexes',
                libraryRoot: resourcePath+'/libraries',
                directory: path.join(config.directories.resources, 'versions')
            }
        }

        // Prepare Events
        launcher.on('progress', (e) => listeners.log('progress', e));
        launcher.on('debug', (e) => listeners.log('debug', e));
        launcher.on('data', (e) => listeners.log('data', e));
        launcher.on('close', (e) => listeners.log('close', e));
        launcher.on('error', (e) => listeners.log('error', e));
        launcher.on('close', (e) => listeners.close(e))


        // Launch
        let process = await launcher.launch(options);
        let windowSource = null;

        // Network
        let networkListeners = [];
        const server = net.createServer((socket) =>
        {    
            socket.on('data', (data) =>
            {
                listeners.network(data.toString().trim());

                for (let i = 0; i < networkListeners.length; i++)
                {
                    const l = networkListeners[i];
                    if(!l || l.msg != data.toString().trim()){continue;}
                    l.event();
                    if(l.single) { delete networkListeners[i]; }
                }
            });
            socket.on('error', (err) => console.error(`Server error ${err.code}`))
            socket.on('close', () => console.log('Minecraft disconnected'));
        });
        server.listen(port, '127.0.0.1');

        
        // Wait for Window
        async function trySource()
        {
            let sources = await desktopCapturer.getSources({ types: ['window'] });
    
            let mcSource = sources.find(source => source.name.startsWith('Minecraft'));
            if(!mcSource) { return false; }
                
            windowSource = mcSource;

            let isAppFocused = false;
            for(var w of BrowserWindow.getAllWindows()) { if(w.isFocused()){isAppFocused=true;break;} }

            if(isAppFocused)
            {
                app.focus({steal: true});
            }
            else
            {
                for(let win of windowManager.getWindows())
                {
                    if(win.processId != process.pid){continue;}
    
                    win.hide();
                }
            }
            return true;
        }
        // Wait for Forge laoding window apparition
        if(this.loader.name=='forge')
        {
            await new Promise((resolve) =>
            {
                let listener = async (w) =>
                {
                    if(w.processId == process.pid)
                    {
                        windowManager.removeListener('window-activated', listener);
                        await trySource();
                        resolve();
                    }
                }

                networkListeners.push
                ({
                    msg: 'forge_loading',
                    event: async () => {
                        windowManager.removeListener('window-activated', listener);
                        await trySource();
                        resolve();
                    },
                    single: true
                });
    
                windowManager.addListener('window-activated', listener);    
            })
        }
        // Listening to new windows
        else
        {
            await new Promise((resolve) =>
            {
                let listener = async (w) =>
                {
                    if(w.processId == process.pid)
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
        if(windowSource == undefined)
        {
            await new Promise(async (resolve) =>
            {
                let interval = setInterval(async () =>
                {
                    if(await trySource()) { resolve(); clearInterval(interval); }
                }, 1000);
            })
        }

        listeners.windowOpen(windowManager.getWindows().find(w => w.processId == process.pid), windowSource);
    }

    // Data
    name = '';
    description = '';
    version = {number: '1.20.1', type: 'release'}
    memory = {max: '6G', min: '4G'}
    loader = {name: 'vanilla', version: ''}
    path = path.join(config.directories.instances, this.name, "minecraft")

    virtualDirectories = [];
    mods = [];
    onModUpdate = (mods) => {}

    save()
    {
        if(this.name == ''){return}
        if(!fs.existsSync( path.join(config.directories.instances, this.name) )) { fs.mkdirSync(path.join(config.directories.instances, this.name)) }
        fs.writeFileSync( path.join(config.directories.instances, this.name, '.instance-data.json'), JSON.stringify(this));
    }

    // Mods
    static cleanModName(n) { return n.endsWith('.jar')?n.substring(0,n.length-4):(n.endsWith('.disabled')?n.substring(0, n.length-9):n) }
    setModData(data =
        {
            filename: "UNKNOWN FILENAME",
            source: null,
            title: "Missing Title",
            description: "No description...",
            images: [],
            page: null,
            missing: false,
            disabled: false,
            dependencies: [],
            virtualPath: ""
        })
    {
        if(this.name == ''){return}
        data.filename = Instance.cleanModName(data.filename);

        let i = this.mods.findIndex(m => m.filename == data.filename);
        if(i>=0)
        {
            for(let k of Object.keys(this.mods[i]))
            {
                if(data[k] == undefined) { data[k] = this.mods[i][k]; }
            }
            this.mods[i] = data;
        }
        else
        {
            this.mods.push(Object.assign({
                filename: "UNKNOWN FILENAME",
                source: null,
                title: null,
                description: "No description...",
                images: [],
                page: null,
                missing: false,
                disabled: false,
                dependencies: [],
                virtualPath: ""
            }, data));
        }

        // Disabling/Enabling File
        if(fs.existsSync(path.join(this.path, 'mods', data.filename+'.jar')))
        {
            fs.renameSync(path.join(this.path, 'mods', data.filename+'.jar'), path.join(this.path, 'mods', data.filename+(data.disabled?'.disabled':'.jar')))
        }
        else if(fs.existsSync(path.join(this.path, 'mods', data.filename+'.disabled')))
        {
            fs.renameSync(path.join(this.path, 'mods', data.filename+'.disabled'), path.join(this.path, 'mods', data.filename+(data.disabled?'.disabled':'.jar')))
        }
        else if(fs.existsSync(path.join(this.path, 'mods', data.filename)))
        {
            fs.renameSync(path.join(this.path, 'mods', data.filename), path.join(this.path, 'mods', data.filename+(data.disabled?'.disabled':'.jar')))
        }
    
        // Virtual Path
        if(data.virtualPath != undefined && data.virtualPath != ""
            && this.virtualDirectories.find(d => d.path == data.virtualPath.substring(0, data.virtualPath.lastIndexOf('/')) && d.name == data.virtualPath.split('/')[data.virtualPath.split('/').length-1]) == undefined)
        {
            this.virtualDirectories.push({path: data.virtualPath.substring(0, data.virtualPath.lastIndexOf('/')), parent: 'mods', name: data.virtualPath.split('/')[data.virtualPath.split('/').length-1]})
            console.log(this.virtualDirectories)
        }

        this.save();
    }


    static async ephemeralInstance(loader, version, mods)
    {
        //  Create temp instance directory + world
        let p = path.join(config.directories.ephemeralInstances, new Date().toISOString())
        if(!fs.existsSync(p)){fs.mkdirSync(p, {recursive: true});}
    
        // New World
        if(!fs.existsSync(path.join(p, 'saves', 'world'))){fs.mkdirSync(path.join(p, 'saves', 'world'), {recursive: true});}

        let levelData = 
        {
            name: "",
            type: "compound",
            value:
            {
                Data: {
                    type: "compound",
                    value: {
                        Version:
                        {
                            type: "compound",
                            value:
                            {
                                Id: { type: "int", value: minecraftData(version.number.toString()).version.dataVersion },
                                Name: { type: "string", value: version.number.toString() },
                                Series: { type: "string", value: "main" },
                                Snapshot: { type: "byte", value: version.type=='release'?0:1 }
                            }
                        },
                        LevelName: { type: "string", value: 'world' },
                        GameType: { type: "int", value: 1 },
                        hardcore: { type: "byte", value: 0 },
                        allowCommands: { type: "byte", value: 1 },
                        Difficulty: { type: "byte", value: 2 },
                        DataVersion: { type: "int", value: minecraftData(version.number.toString()).version.dataVersion },
                        confirmedExperimentalSettings: { type: 'byte', value: 1 },
                        initialized: { type: 'byte', value: 1 },
                        WasModded: { type: 'byte', value: 1 },    
                    }
                }    
            }
        };

        const buffer = nbt.writeUncompressed(levelData);
        let compressed = zlib.gzipSync(buffer)
        fs.writeFileSync(path.join(p, 'saves', 'world', 'level.dat'), compressed);

        // Loader
        version.custom = await installLoader(p, loader, version)
    
        // Resource Path (download optimization)
        let resourcePath = path.join(config.directories.resources, version.number+'-'+version.type)
        if(!fs.existsSync(resourcePath)){fs.mkdirSync(resourcePath, {recursive: true});}
        if(!fs.existsSync(resourcePath+'/assets/indexes')){fs.mkdirSync(resourcePath+'/assets/indexes', {recursive: true});}
        if(!fs.existsSync(resourcePath+'/assets/objects')){fs.mkdirSync(resourcePath+'/assets/objects', {recursive: true});}
        if(!fs.existsSync(resourcePath+'/libraries')){fs.mkdirSync(resourcePath+'/libraries', {recursive: true});}
        if(!fs.existsSync(path.join(config.directories.resources, 'versions'))){fsmkdirSync(path.join(config.directories.resources, 'versions', {recursive: true}));}   
        
        // Install Mods
        for(let m of mods)
        {
            await Download.download(m.url, path.join(p, 'mods', m.filename))
        }
    
        let process = await launcher.launch
        ({
            root: p,
            version: version,
            memory: {max: '6G', min: '4G'},
            authorization: await Authenticator.getAuth("tester"),
            forge: loader.name=='forge'?path.join(p, 'versions', `forge-${version.number}-${loader.version}`, `forge-${version.number}-${loader.version}.jar`):null,
            clientPackage: null,
            overrides:
            {
                assetRoot: resourcePath+'/assets',
                assetIndex: resourcePath+'/assets/indexes',
                libraryRoot: resourcePath+'/libraries',
                directory: path.join(config.directories.resources, 'versions')
            },
            quickPlay:
            {
                type: 'singleplayer',
                identifier: 'World'
            },
            customArgs: [`-javaagent:${config.javaAgent}`],
        });

        process.on('close', () => fs.unlinkSync(p))
    }

    static instanceList()
    {
        let list = [];
        let folders = fs.readdirSync(config.directories.instances);
        for(let f of folders)
        {
            if(!fs.existsSync(path.join(config.directories.instances, f, '.instance-data.json'))){continue;}
            let data = JSON.parse(fs.readFileSync(path.join(config.directories.instances, f, '.instance-data.json')));
            list.push
            ({
                title: f,
                description: data.description,
                icon: data.icon,
                modsCount: data.mods?.length,
                resourcepacksCount: data.resourcepacks?.length,
                shadersCount: data.shaders?.length
            })
        }
        return list;
    }
}


async function installLoader(root, loader, version, listeners = null)
{
    let file = null;
    let targetFile = null;

    // Install Loader
    switch(loader.name)
    {
        case 'vanilla':
        {
            delete version.custom;
            return null;
            break;
        }
        case 'forge':
        {
            delete version.custom;

            const targetPath = path.join(config.directories.resources, "versions", `forge-${version.number}-${loader.version}`);
            const targetName = `forge-${version.number}-${loader.version}.jar`;

            file = path.join(targetPath, targetName);
            targetFile = path.join(root, 'versions', `forge-${version.number}-${loader.version}`, targetName);

            if(fs.existsSync(path.join(targetPath, targetName))){break;}
            if(!fs.existsSync(targetPath)){fs.mkdirSync(targetPath, {recursive:true});}

            let link = `https://maven.minecraftforge.net/net/minecraftforge/forge/${version.number}-${loader.version}/forge-${version.number}-${loader.version}`;
            if(parseInt(version.number.split('.')[1]) <= 12 && (version.number.split('-')[0] !== '1.12.2' || (parseInt(version.number.split('.').pop()) <= 2847)))
            { link += '-universal.jar'; } else { link += '-installer.jar';  }
            
            await download(BrowserWindow.getAllWindows()[0], link, {filename: targetName, directory: targetPath, onProgress: async (progress) =>
            {
                if(listeners) { listeners.log('loaderProgress', Math.round(progress.percent*100).toString()) }
            }});
            break;
        }
        case 'fabric':
        {
            version.custom = `fabric-${version.number}-${loader.version}`;

            const targetPath = path.join(config.directories.resources, "versions", `fabric-${version.number}-${loader.version}`);
            const targetName = `fabric-${version.number}-${loader.version}.json`;

            file = path.join(targetPath, targetName);
            targetFile = path.join(root, 'versions', `fabric-${version.number}-${loader.version}`, targetName);

            if(fs.existsSync(path.join(targetPath, targetName))){break;}
            if(!fs.existsSync(targetPath)){fs.mkdirSync(targetPath, {recursive:true});}

            const link = `https://meta.fabricmc.net/v2/versions/loader/${version.number}/${loader.version}/profile/json`;

            await download(BrowserWindow.getAllWindows()[0], link, {filename: targetName, directory: targetPath, onProgress: async (progress) =>
            {
                if(listeners) { listeners.log('loaderProgress', Math.round(progress.percent*100).toString()) }
            }});
            break;
        }
    }

    if(file && targetFile)
    {
        if(!fs.existsSync(targetFile.substring(0, targetFile.lastIndexOf('/')))){fs.mkdirSync(targetFile.substring(0, targetFile.lastIndexOf('/')), {recursive:true});}
        fs.copyFileSync(file, targetFile);
    }

    return version.custom;
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

module.exports = Instance;