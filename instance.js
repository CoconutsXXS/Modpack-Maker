const { app, desktopCapturer, BrowserWindow } = require('electron');
const { download } = require("grape-electron-dl");
const { Client, Authenticator } = require('minecraft-launcher-core');
const launcher = new Client();
const path = require('node:path')
const fs = require('fs')
const { windowManager } = require('node-window-manager');
var chokidar = require('chokidar');
const { unzip } = require('unzipit');
const { XMLParser } = require("fast-xml-parser");
const es = require('event-stream');
const os = require("os");
const _ = require("lodash")
const { execSync } = require("child_process")
const tar = require("tar")
const {sep} = require("path")
const extract = require("extract-zip");

const config = require('./config');
const Download = require('./download');
const jarReader = require('./jar-reader');
const { default: bufferToDataUrl } = require('buffer-to-data-url');
const { platform } = require('node:os');

function rootPath()
{
  if(app.isPackaged) { return __dirname.slice(0, __dirname.lastIndexOf(sep)) }
  return __dirname;
}

class Instance
{
    constructor(data = {})
    {
        Object.assign(this, data);
        this.path = path.join(config.directories.instances, this.name, "minecraft");
        if(!fs.existsSync(this.path)) { fs.mkdirSync(this.path, {recursive:true}); }
        if(data == {} || this.name==''){return this;}

        for(let k of Object.keys(data))
        {
            if(this[k] == undefined) { this[k] = data[k]; }
        }

        // Mods Files
        // No double mod + clear missing
        let noDuplicatedModList = [];
        for(let m of this.mods)
        {
            if(noDuplicatedModList.find(mod => mod.filename == m.filename || m.missing)){continue;}
            noDuplicatedModList.push(m);
        }
        this.mods = noDuplicatedModList;
        // Delete data if do not exist
        for(let m of this.mods)
        {
            if(fs.existsSync(path.join(this.path, 'mods', m.filename)) || fs.existsSync(path.join(this.path, 'mods', m.filename+'.disabled')) || fs.existsSync(path.join(this.path, 'mods', m.filename+'.jar'))){continue}
            this.setModData({filename: m.filename, missing: true}, true)
        }
        // Create data if exist
        if(!fs.existsSync(path.join(this.path, 'mods'))) { fs.mkdirSync(path.join(this.path, 'mods'), {recursive:true}); }
        
        let modWatcher = chokidar.watch(path.join(this.path, 'mods'), {persistent: true});

        let modCount = 0;
        modWatcher.on('all', (e, p, s) =>
        {
            if(p.substring(path.join(this.path, 'mods').length+1, p.length).includes(sep)){return}
            let f = p.split(sep)[p.split(sep).length-1];

            modCount++;
            if(modCount<this.mods.length && this.mods.findIndex(m => m.filename==Instance.cleanModName(f))){return}
            
            // Delete
            if(e=='unlink')
            {
                let i = this.mods.findIndex(m => m.filename==Instance.cleanModName(f));

                if(this.mods[i]!=undefined)
                {
                    this.mods[i].missing = !fs.existsSync(Instance.cleanModName(p))&&!fs.existsSync(Instance.cleanModName(p)+'.jar')&&!fs.existsSync(Instance.cleanModName(p)+'.disabled');
                    this.save()
                }
            }
            // Add (or init)
            else if(e==='add')
            {
                let i = this.mods.findIndex(m => m.filename==Instance.cleanModName(f));
                if(i>=0)
                {
                    this.mods[i].missing = false;
                    this.mods[i].disabled = f.endsWith('.disabled')
                }
                else 
                {
                    this.setModData({filename: f, missing: false, disabled: f.endsWith('.disabled')}, true)
                }
            }
            else { return; }


            this.onModUpdate(this.mods)
        })

        // Resourcepack Files
        // No double mod + clear missing
        noDuplicatedModList = [];
        for(let m of this.rp)
        {
            if(noDuplicatedModList.find(mod => mod.filename == m.filename || m.missing)){continue;}
            noDuplicatedModList.push(m);
        }
        this.rp = noDuplicatedModList;
        // Delete data if do not exist
        for(let m of this.rp)
        {
            if(fs.existsSync(path.join(this.path, 'resourcepacks', m.filename)) || fs.existsSync(path.join(this.path, 'resourcepacks', m.filename+'.disabled')) || fs.existsSync(path.join(this.path, 'resourcepacks', m.filename+'.zip'))){continue}
            this.onRPUpdate({filename: m.filename, missing: true}, true)
        }
        // Create data if exist
        if(!fs.existsSync(path.join(this.path, 'resourcepacks'))) { fs.mkdirSync(path.join(this.path, 'resourcepacks'), {recursive:true}); }
        
        let rpWatcher = chokidar.watch(path.join(this.path, 'resourcepacks'), {persistent: true});
        let rpCount = 0;
        rpWatcher.on('all', (e, p, s) =>
        {
            let f = p.split(sep)[p.split(sep).length-1];

            if(p.substring(path.join(this.path, 'resourcepacks').length+1, p.length).includes(sep)){return}
            
            rpCount++;
            if(rpCount<this.rp.length && this.rp.findIndex(m => m.filename==Instance.cleanModName(f))){return}

            // Delete
            if(e=='unlink')
            {
                let i = this.rp.findIndex(m => m.filename==Instance.cleanShaderName(f));

                if(this.rp[i]!=undefined)
                {
                    this.rp[i].missing = !fs.existsSync(Instance.cleanShaderName(p))&&!fs.existsSync(Instance.cleanShaderName(p)+'.zip')&&!fs.existsSync(Instance.cleanShaderName(p)+'.disabled');
                    this.save()
                }
            }
            // Add (or init)
            else if(e==='add')
            {
                let i = this.rp.findIndex(m => m.filename==Instance.cleanShaderName(f));
                if(i>=0)
                {
                    this.rp[i].missing = false;
                    this.rp[i].disabled = f.endsWith('.disabled')
                }
                else 
                {
                    this.setRPData({filename: f, missing: false, disabled: f.endsWith('.disabled')}, true)
                }
            }
            else { return; }

            this.onRPUpdate(this.rp)
        })

        // Shader Files
        // No double mod + clear missing
        noDuplicatedModList = [];
        for(let m of this.shaders)
        {
            if(noDuplicatedModList.find(mod => mod.filename == m.filename || m.missing)){continue;}
            noDuplicatedModList.push(m);
        }
        this.shaders = noDuplicatedModList;
        // Delete data if do not exist
        for(let m of this.shaders)
        {
            if(fs.existsSync(path.join(this.path, 'shaderpacks', m.filename)) || fs.existsSync(path.join(this.path, 'shaderpacks', m.filename+'.disabled')) || fs.existsSync(path.join(this.path, 'shaderpacks', m.filename+'.zip'))){continue}
            this.onShaderUpdate({filename: m.filename, missing: true}, true)
        }
        // Create data if exist
        if(!fs.existsSync(path.join(this.path, 'shaderpacks'))) { fs.mkdirSync(path.join(this.path, 'shaderpacks'), {recursive:true}); }
        
        let shaderWatcher = chokidar.watch(path.join(this.path, 'shaderpacks'), {persistent: true});
        let shaderCount = 0;
        shaderWatcher.on('all', (e, p, s) =>
        {
            let f = p.split(sep)[p.split(sep).length-1];

            if(p.substring(path.join(this.path, 'shaderpacks').length+1, p.length).includes(sep)){return}
            
            shaderCount++;
            if(shaderCount<this.rp.length && this.shaders.findIndex(m => m.filename==Instance.cleanModName(f))){return}

            // Delete
            if(e=='unlink')
            {
                let i = this.shaders.findIndex(m => m.filename==Instance.cleanShaderName(f));

                if(this.shaders[i]!=undefined)
                {
                    this.shaders[i].missing = !fs.existsSync(Instance.cleanShaderName(p))&&!fs.existsSync(Instance.cleanShaderName(p)+'.zip')&&!fs.existsSync(Instance.cleanShaderName(p)+'.disabled');
                    this.save()
                }
            }
            // Add (or init)
            else if(e==='add')
            {
                let i = this.shaders.findIndex(m => Instance.cleanShaderName(m.filename)==Instance.cleanShaderName(f));
                if(i>=0)
                {
                    this.shaders[i].missing = false;
                    this.shaders[i].disabled = f.endsWith('.disabled')
                }
                else 
                {
                    this.setShaderData({filename: f, missing: false, disabled: f.endsWith('.disabled')}, true)
                }
            }
            else { return; }

            this.onShaderUpdate(this.shaders)
        })


        // Download Request
        if(!fs.existsSync(path.join(config.directories.instances, this.name, '.request.json')))
        { fs.writeFileSync(path.join(config.directories.instances, this.name, '.request.json'), '[]'); }

        let requestWatcher = chokidar.watch(path.join(config.directories.instances, this.name, '.request.json'), {persistent: true});
        requestWatcher.on('all', (e, p, s) =>
        {
            if(p != path.join(config.directories.instances, this.name, '.request.json') || !fs.existsSync(p)){return;}
            for(let r of JSON.parse(fs.readFileSync(p)))
            {
                this.onRequestUpdate(r);
            }
            fs.writeFileSync(p, '[]');
        });

        // Loadings
        if(!fs.existsSync(path.join(config.directories.instances, this.name, '.loadings.json')))
        { fs.writeFileSync(path.join(config.directories.instances, this.name, '.loadings.json'), '[]'); }
        let loadingsWatcher = chokidar.watch(path.join(config.directories.instances, this.name, '.loadings.json'), {persistent: true});
        loadingsWatcher.on('all', (e, p, s) =>
        {
            if(p != path.join(config.directories.instances, this.name, '.loadings.json') || !fs.existsSync(p)){return;}
            this.onLoadingUpdate(JSON.parse(fs.readFileSync(p)));
        });

        return this;
    }

    static getInstance(name)
    {
        if(!fs.existsSync( path.join(config.directories.instances, name) )) { console.log(`Instance "${name}" do not exist, creating it.`); fs.mkdirSync( path.join(config.directories.instances, name) ) }
        if(!fs.existsSync( path.join(config.directories.instances, name, '.instance-data.json') ))
        {
            let result = new Instance({name});
            if(name!='')
            {
                fs.writeFileSync( path.join(config.directories.instances, name, '.instance-data.json'), JSON.stringify(result));
                console.log(`Instance "${name}" do not provide data json file, creating one...`);
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
            windowOpen: function(window, windowSource, kill){},
            network: function(m){}
        }, port = 1337, world = null)
    {
        if(!fs.existsSync(this.path)){fs.mkdirSync(this.path, {recursive: true});}

        // Install Loader
        this.version.custom = await installLoader(this.path, this.loader, this.version, listeners)

        if(this.version.custom == undefined && this.loader.name != "vanilla")
        { console.error("Custom Version Failed!"); return; }

        // Resource Path (download optimization)
        let resourcePath = path.join(config.directories.resources, this.version.number+'-'+this.version.type)
        if(!fs.existsSync(resourcePath+sep+'assets')){fs.mkdirSync(resourcePath+sep+'assets', {recursive: true});}
        else{fs.cpSync(resourcePath+sep+'assets', path.join(this.path,'assets'), {recursive:true})}
        if(!fs.existsSync(resourcePath+sep+'libraries')){fs.mkdirSync(resourcePath+sep+'libraries', {recursive: true});}
        else{fs.cpSync(resourcePath+sep+'libraries', path.join(this.path,'libraries'), {recursive:true})}

        if(fs.existsSync(path.join(config.directories.resources, 'versions', this.version.number)))
        { fs.cpSync(path.join(config.directories.resources, 'versions', this.version.number), path.join(this.path,'versions',this.version.number), {recursive:true}) }

        // Java Version
        let javaVersion = (await (await fetch((await (await fetch("https://piston-meta.mojang.com/mc/game/version_manifest.json")).json()).versions.find(v=>v.id==this.version.number).url)).json()).javaVersion.majorVersion
        let javaPath = findJavaExecutable(javaVersion);
        if(!javaPath)
        {
            javaPath = await downloadJava(javaVersion, listeners)
        }

        // Settings
        let options =
        {
            root: this.path,
            version: this.version,
            memory: this.memory,
            authorization: await Authenticator.getAuth("dev"),
            forge: this.loader.name=='forge'||this.loader.name=='neoforge'?path.join(this.path, 'versions', `${this.loader.name}-${this.version.number}-${this.loader.version}`, `${this.loader.name}-${this.version.number}-${this.loader.version}.jar`):null,
            // clientPackage: null,
            // customArgs: [`-javaagent:${config.javaAgent}`],
            // overrides:
            // {
            //     // assetRoot: resourcePath+sep+'assets',
            //     // assetIndex: resourcePath+sep+'assets/indexes',
            //     // libraryRoot: resourcePath+sep+'libraries',
            //     // directory: path.join(config.directories.resources, 'versions')
            // }
            // quickPlay: {type: "singleplayer", identifier: "Structure Edition"}
            quickPlay: world!=undefined?world:null,
            javaPath: javaPath?javaPath:'java',
            overrides: {detached: true}
        }
        console.log(options)

        // Asset Move
        launcher.on('debug', (e) =>
        {
            if(e == '[MCLC]: Downloaded assets')
            {
                fs.cpSync(path.join(this.path,'assets'), resourcePath+sep+'assets', {recursive:true})
                fs.cpSync(path.join(this.path,'libraries'), resourcePath+sep+'libraries', {recursive:true})
                fs.cpSync(path.join(this.path,'versions'), path.join(config.directories.resources, 'versions'), {recursive:true})
            }
        });

        // Prepare Events
        launcher.on('progress', (e) => listeners.log('progress', e));
        launcher.on('debug', (e) => listeners.log('debug', e));
        launcher.on('data', (e) => listeners.log('data', e));
        launcher.on('close', (e) => listeners.log('close', e));
        launcher.on('error', (e) => listeners.log('error', e));
        launcher.on('close', (e) => {listeners.close(e);launcher.removeAllListeners();})


        // Launch
        let process = await launcher.launch(options);
        let pid = process?.pid;
        let windowSource = null;

        if(!process) { console.error("No process, crashed") }

        // Crashlog
        let crashLogWatcher = chokidar.watch(path.join(this.path), {persistent: true});
        crashLogWatcher.on('add', (p) =>
        {
            if(p.split(sep)[p.split(sep).length-1] != `hs_err_pid${pid}.log`){return}

            let s = fs.createReadStream(p)
            .pipe(es.split())
            .pipe(es.mapSync(function(line)
            {
                s.pause();
                console.log(line)
                listeners.log('data', line)
                s.resume();
            })
        );
        })

        // Network (need java agent)
        // let networkListeners = [];
        // const server = net.createServer((socket) =>
        // {    
        //     socket.on('data', (data) =>
        //     {
        //         listeners.network(data.toString().trim());

        //         for (let i = 0; i < networkListeners.length; i++)
        //         {
        //             const l = networkListeners[i];
        //             if(!l || l.msg != data.toString().trim()){continue;}
        //             l.event();
        //             if(l.single) { delete networkListeners[i]; }
        //         }
        //     });
        //     socket.on('error', (err) => console.error(`Server error ${err.code}`))
        //     socket.on('close', () => console.log('Minecraft disconnected'));
        // });
        // net.
        // server.listen(port, '127.0.0.1');

        
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
                    if(win.processId != pid){continue;}
    
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
                    if(!process){resolve(); return;}
                    if(w.processId == process.pid)
                    {
                        windowManager.removeListener('window-activated', listener);
                        await trySource();
                        resolve();
                    }
                }

                // networkListeners.push
                // ({
                //     msg: 'forge_loading',
                //     event: async () => {
                //         windowManager.removeListener('window-activated', listener);
                //         await trySource();
                //         resolve();
                //     },
                //     single: true
                // });
    
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

        listeners.windowOpen(windowManager.getWindows().find(w => w.processId == pid), windowSource, () => {process.kill('SIGINT')});
    }
    // async launch(listeners =
    //     {
    //         log: function(type, content){},
    //         close: function(code){},
    //         windowOpen: function(window, windowSource){},
    //         network: function(m){}
    //     }, port = 1337)
    // {
    //     //All modules can be accessed from the main GMLL index file
    //     const gmll = require("gmll");
    //     //GMLL supports sub modules
    //     const { setRoot } = require("gmll/config");
    //     //Import the auth class
    //     const { Auth } = require("msmc");
    //     //Changes where GMLL puts the ".minecraft" gmll creates (will default to a folder called .minecraft in the same folder in your root process directory)
    //     setRoot(".MC");
    //     gmll.init().then(async () =>
    //     {
    //         //Create a new auth manager
    //         const authManager = new Auth("select_account");
    //         //Launch using the 'raw' gui framework (can be 'electron' or 'nwjs')
    //         const xboxManager = await authManager.launch("raw");
    //         //Generate the minecraft login token
    //         const token = await xboxManager.getMinecraft();
    //         //GMLL uses the concept of instances. Essentially containerized minecraft installations
    //         var int = new gmll.Instance();
    //         //Launch with a token retrieved by msmc
    //         int.launch(token.gmll());
    //     });
    //     const {Instance} = require("gmll/objects/instance");

    //     if(!fs.existsSync(this.path)){fs.mkdirSync(this.path, {recursive: true});}

    //     // Install Loader
    //     this.version.custom = await installLoader(this.path, this.loader, this.version, listeners)

    //     // Resource Path (download optimization)
    //     let resourcePath = path.join(config.directories.resources, this.version.number+'-'+this.version.type)
    //     if(!fs.existsSync(resourcePath+sep+'assets')){fs.mkdirSync(resourcePath+sep+'assets', {recursive: true});}
    //     else{fs.cpSync(resourcePath+sep+'assets', path.join(this.path,'assets'), {recursive:true})}
    //     if(!fs.existsSync(resourcePath+sep+'libraries')){fs.mkdirSync(resourcePath+sep+'libraries', {recursive: true});}
    //     else{fs.cpSync(resourcePath+sep+'libraries', path.join(this.path,'libraries'), {recursive:true})}
    //     if(!fs.existsSync(path.join(config.directories.resources, 'versions'))){fs.mkdirSync(path.join(config.directories.resources, 'versions'), {recursive: true});}
    //     // else { fs.cpSync(path.join(config.directories.resources, 'versions'), path.join(this.path,'versions'), {recursive:true}) }

    //     // Settings
    //     let options =
    //     {
    //         root: this.path,
    //         version: this.version,
    //         memory: this.memory,
    //         authorization: await Authenticator.getAuth("dev"),
    //         forge: this.loader.name=='forge'||this.loader.name=='neoforge'?path.join(this.path, 'versions', `${this.loader.name}-${this.version.number}-${this.loader.version}`, `${this.loader.name}-${this.version.number}-${this.loader.version}.jar`):null,
    //         clientPackage: null,
    //         customArgs: [`-javaagent:${config.javaAgent}`],
    //         overrides:
    //         {
    //             // assetRoot: resourcePath+sep+'assets',
    //             // assetIndex: resourcePath+sep+'assets/indexes',
    //             // libraryRoot: resourcePath+sep+'libraries',
    //             // directory: path.join(config.directories.resources, 'versions')
    //         }
    //     }

    //     // Asset Move
    //     launcher.on('debug', (e) =>
    //     {
    //         if(e == '[MCLC]: Downloaded assets')
    //         {
    //             fs.cpSync(path.join(this.path,'assets'), resourcePath+sep+'assets', {recursive:true})
    //             fs.cpSync(path.join(this.path,'libraries'), resourcePath+sep+'libraries', {recursive:true})
    //             fs.cpSync(path.join(this.path,'versions'), path.join(config.directories.resources, 'versions'), {recursive:true})
    //         }
    //     });

    //     // Prepare Events
    //     launcher.on('progress', (e) => listeners.log('progress', e));
    //     launcher.on('debug', (e) => listeners.log('debug', e));
    //     launcher.on('data', (e) => listeners.log('data', e));
    //     launcher.on('close', (e) => listeners.log('close', e));
    //     launcher.on('error', (e) => listeners.log('error', e));
    //     launcher.on('close', (e) => listeners.close(e))


    //     // Launch
    //     let process = await launcher.launch(options);
    //     let windowSource = null;

    //     // Network
    //     let networkListeners = [];
    //     const server = net.createServer((socket) =>
    //     {    
    //         socket.on('data', (data) =>
    //         {
    //             listeners.network(data.toString().trim());

    //             for (let i = 0; i < networkListeners.length; i++)
    //             {
    //                 const l = networkListeners[i];
    //                 if(!l || l.msg != data.toString().trim()){continue;}
    //                 l.event();
    //                 if(l.single) { delete networkListeners[i]; }
    //             }
    //         });
    //         socket.on('error', (err) => console.error(`Server error ${err.code}`))
    //         socket.on('close', () => console.log('Minecraft disconnected'));
    //     });
    //     server.listen(port, '127.0.0.1');

        
    //     // Wait for Window
    //     async function trySource()
    //     {
    //         let sources = await desktopCapturer.getSources({ types: ['window'] });
    
    //         let mcSource = sources.find(source => source.name.startsWith('Minecraft'));
    //         if(!mcSource) { return false; }
                
    //         windowSource = mcSource;

    //         let isAppFocused = false;
    //         for(var w of BrowserWindow.getAllWindows()) { if(w.isFocused()){isAppFocused=true;break;} }

    //         if(isAppFocused)
    //         {
    //             app.focus({steal: true});
    //         }
    //         else
    //         {
    //             for(let win of windowManager.getWindows())
    //             {
    //                 if(win.processId != process.pid){continue;}
    
    //                 win.hide();
    //             }
    //         }
    //         return true;
    //     }
    //     // Wait for Forge laoding window apparition
    //     if(this.loader.name=='forge')
    //     {
    //         await new Promise((resolve) =>
    //         {
    //             let listener = async (w) =>
    //             {
    //                 if(w.processId == process.pid)
    //                 {
    //                     windowManager.removeListener('window-activated', listener);
    //                     await trySource();
    //                     resolve();
    //                 }
    //             }

    //             networkListeners.push
    //             ({
    //                 msg: 'forge_loading',
    //                 event: async () => {
    //                     windowManager.removeListener('window-activated', listener);
    //                     await trySource();
    //                     resolve();
    //                 },
    //                 single: true
    //             });
    
    //             windowManager.addListener('window-activated', listener);    
    //         })
    //     }
    //     // Listening to new windows
    //     else
    //     {
    //         await new Promise((resolve) =>
    //         {
    //             let listener = async (w) =>
    //             {
    //                 if(w.processId == process.pid)
    //                 {
    //                     windowManager.removeListener('window-activated', listener);
    //                     await trySource();
    //                     resolve();
    //                 }
    //             }
    
    //             windowManager.addListener('window-activated', listener);
    //         })
    //     }
    //     // Check at intervals if still not detected
    //     if(windowSource == undefined)
    //     {
    //         await new Promise(async (resolve) =>
    //         {
    //             let interval = setInterval(async () =>
    //             {
    //                 if(await trySource()) { resolve(); clearInterval(interval); }
    //             }, 1000);
    //         })
    //     }

    //     listeners.windowOpen(windowManager.getWindows().find(w => w.processId == process.pid), windowSource);
    // }

    // Data
    name = '';
    description = '';
    version = {number: '1.20.1', type: 'release'}
    memory = {max: '6G', min: '4G'}
    loader = {name: 'vanilla', version: ''}
    path = path.join(config.directories.instances, this.name, "minecraft")


    loading = [];
    onLoadingUpdate = (loadings) => {}

    virtualDirectories = [];
    mods = [];
    onModUpdate = (mods) => {}
    rp = [];
    onRPUpdate = (rps) => {}
    shaders = [];
    onShaderUpdate = (shaders) => {}

    jarModifications = []

    onRequestUpdate = (list) => {}

    save()
    {
        if(this.name == ''){return}
        if(!fs.existsSync( path.join(config.directories.instances, this.name) )) { fs.mkdirSync(path.join(config.directories.instances, this.name)) }
        fs.writeFileSync( path.join(config.directories.instances, this.name, '.instance-data.json'), JSON.stringify(this));
    }

    // Mods
    static cleanModName(n) { return n.endsWith('.jar')?n.substring(0,n.length-4):(n.endsWith('.disabled')?n.substring(0, n.length-9):n) }
    modExist(n) { return fs.existsSync(path.join(this.path, 'mods', Instance.cleanModName(n)+'.jar'))||fs.existsSync(path.join(this.path, 'mods', Instance.cleanModName(n)+'.disabled'))||fs.existsSync(path.join(this.path, 'mods', Instance.cleanModName(n))) }
    async setModData(data =
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
        let og = JSON.stringify(this.mods);
        data.filename = Instance.cleanModName(data.filename);
        if(data.filename=='.DS_Store'){return;}

        let i = this.mods.findIndex(m => m.filename == data.filename);
        if(i>=0)
        {
            for(let k of Object.keys(this.mods[i]))
            {
                if(data[k] == undefined) { data[k] = this.mods[i][k]; }
            }
            this.mods[i] = data;
            this.mods[i].missing = !this.modExist(this.mods[i].filename);
        }
        else
        {
            i = this.mods.length;
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
        let needUpdate = true;
        let workingPath = path.join(this.path, 'mods', data.filename+(data.disabled?'.disabled':'.jar'));
        if(fs.existsSync(path.join(this.path, 'mods', data.filename+'.jar')))
        {
            needUpdate = path.join(this.path, 'mods', data.filename+'.jar') != workingPath;
            fs.renameSync(path.join(this.path, 'mods', data.filename+'.jar'), workingPath)
        }
        else if(fs.existsSync(path.join(this.path, 'mods', data.filename+'.disabled')))
        {
            needUpdate = path.join(this.path, 'mods', data.filename+'.disabled') != workingPath;
            fs.renameSync(path.join(this.path, 'mods', data.filename+'.disabled'), workingPath)
        }
        else if(fs.existsSync(path.join(this.path, 'mods', data.filename)))
        {
            needUpdate = path.join(this.path, 'mods', data.filename) != workingPath;
            fs.renameSync(path.join(this.path, 'mods', data.filename), workingPath)
        }

        // Find metadata in the jar if missing
        if(workingPath!=null && !this.mods[i].fileVerified)
        {
            this.analyseModJar = async function (r)
            {
                return new Promise(async (resolve, reject) =>
                {
                    if(r==null){resolve(); return;}

                    try
                    {
                        // Jarjar true content
                        for(let subJarKey of Object.keys(r).filter(k=>k.startsWith('META-INF/jarjar'+sep)&&k!='META-INF/jarjar'+sep&&k.endsWith('.jar')))
                        {
                            let entries = (await unzip(await r[subJarKey].arrayBuffer())).entries;
                            await this.analyseModJar(entries)
                        }

                        // META-INF
                        if(r['META-INF/mods.toml']!=undefined)
                        {
                            // let metaTOML = jarReader.handleData(Buffer.from(await r['META-INF/mods.toml']?.arrayBuffer()));
                            let meta = await jarReader.handleData(Buffer.from(await r['META-INF/mods.toml']?.arrayBuffer()), 'toml');

                            if(meta?.mods?.value[0]?.logoFile != undefined)
                            {
                                try{this.mods[i].icon = await bufferToDataUrl('image/png', Buffer.from(await r[meta.mods.value[0].logoFile]?.arrayBuffer()))}
                                catch(err){}
                            }
                            this.mods[i].description = meta?.mods?.value[0]?.description;
                            this.mods[i].title = meta?.mods?.value[0]?.displayName;
                            this.mods[i].version = meta?.mods?.value[0]?.version;
                            this.mods[i].modId = meta?.mods?.value[0]?.modId;
                        }
                        // Fabric JSON
                        let fabricModJSON = await r['fabric.mod.json']?.json();
                        if(fabricModJSON != undefined)
                        {
                            let meta = fabricModJSON;
                            this.mods[i].fabricMeta = meta;
                            if(!this.mods[i].title){this.mods[i].title=meta.name}
                            if(this.mods[i].description=='No description...'){this.mods[i].description=meta.description}
                            if(!this.mods[i].id){this.mods[i].id=meta.id}
                            this.mods[i].clientRequired=meta.environment=='client'
                            this.mods[i].serverRequired=meta.environment=='server'
                            this.mods[i].version = meta.version;
                            this.mods[i].modId = meta.id;

                            let potentialIcon = await r[meta.icon]?.arrayBuffer();
                            if(meta.icon && potentialIcon!=undefined)
                            {
                                this.mods[i].icon = await bufferToDataUrl('image/png', Buffer.from(potentialIcon));
                            }
                        }
                        // Pack Mcmeta
                        // let packMcmeta = await jarReader.jar(workingPath, 'pack.mcmeta', true);
                        if(r['pack.mcmeta']!=undefined)
                        {
                            let meta = await r['pack.mcmeta'].json();
                            if(typeof(meta.description)=='object') { this.mods[i].description = meta.description.fallback.replace(/§[0-9a-fk-or]/gi, ''); }
                            else if(typeof(meta.description) == 'string') { this.mods[i].description = meta.description.replace(/§[0-9a-fk-or]/gi, ''); }
                        }

                        // Icon
                        if(this.mods[i].icon==undefined)
                        {
                            // let r = await jarReader.jar(workingPath, null, true)
                            if(Object.entries(r).find(e=>(e[0].startsWith('assets'+sep)&&e[0].endsWith('icon.png')&&e[0].split(sep).length==3) || e=='icon.png') != undefined)
                            {
                                this.mods[i].icon = await bufferToDataUrl('image/png', Buffer.from(await Object.entries(r).find(e=>(e[0].startsWith('assets'+sep)&&e[0].endsWith('icon.png')&&e[0].split(sep).length==3) || e=='icon.png')[1]?.arrayBuffer()));
                            }
                        }

                        resolve();
                    }
                    catch(err){reject(err)}
                })
            }
            try
            {
                jarReader.jar(workingPath, null, true).then(r => this.analyseModJar(r))
            }catch(err){}

            this.mods[i].fileVerified=true;
        }
    
        // Virtual Path
        if(data.virtualPath != undefined && data.virtualPath != ""
            && this.virtualDirectories.find(d => d.path == data.virtualPath.substring(0, data.virtualPath.lastIndexOf(sep)) && d.name == data.virtualPath.split(sep)[data.virtualPath.split(sep).length-1]) == undefined)
        {
            console.log('created virtual dir for mod', data)
            this.virtualDirectories.push({path: data.virtualPath.substring(0, data.virtualPath.lastIndexOf(sep)), parent: 'mods', name: data.virtualPath.split(sep)[data.virtualPath.split(sep).length-1]})
        }

        if(og != JSON.stringify(this.mods))
        {
            this.save();
            if(needUpdate) { this.onModUpdate(this.mods); }
        }
    }
    // Texturepacks
    rpExist(n) { return fs.existsSync(path.join(this.path, 'resourcepacks', Instance.cleanModName(n)+'.zip'))||fs.existsSync(path.join(this.path, 'resourcepacks', Instance.cleanModName(n)+'.disabled'))||fs.existsSync(path.join(this.path, 'resourcepacks', Instance.cleanModName(n))) }
    setRPData(data =
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
        let og = JSON.stringify(this.rp);
        data.filename = Instance.cleanShaderName(data.filename);

        let i = this.rp.findIndex(m => m.filename == data.filename);
        if(i>=0)
        {
            for(let k of Object.keys(this.rp[i]))
            {
                if(data[k] == undefined) { data[k] = this.rp[i][k]; }
            }
            this.rp[i] = data;
            this.rp[i].missing = !this.rpExist(this.rp[i].filename);
        }
        else
        {
            i = this.rp.length;
            this.rp.push(Object.assign({
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
        let needUpdate = false;
        let workingPath = path.join(this.path, 'resourcepacks', data.filename+(data.disabled?'.disabled':'.zip'));
        if(fs.existsSync(path.join(this.path, 'resourcepacks', data.filename+'.zip')))
        {
            needUpdate = path.join(this.path, 'resourcepacks', data.filename+'.zip') != workingPath
            fs.renameSync(path.join(this.path, 'resourcepacks', data.filename+'.zip'), workingPath)
        }
        else if(fs.existsSync(path.join(this.path, 'resourcepacks', data.filename+'.disabled')))
        {
            needUpdate = path.join(this.path, 'resourcepacks', data.filename+'.disabled') != workingPath
            fs.renameSync(path.join(this.path, 'resourcepacks', data.filename+'.disabled'), workingPath)
        }
        else if(fs.existsSync(path.join(this.path, 'resourcepacks', data.filename)))
        {
            needUpdate = path.join(this.path, 'resourcepacks', data.filename) != workingPath
            fs.renameSync(path.join(this.path, 'resourcepacks', data.filename), workingPath)
        }


        if(workingPath!=null && !this.rp[i].fileVerified)
        {
            if(fs.existsSync(workingPath))
            {
                new Promise(async (resolve) =>
                {
                    try
                    {
                        let unziped = (await unzip( fs.readFileSync(workingPath) )).entries;

                        let packMcmeta = unziped['pack.mcmeta'];
                        if(packMcmeta != undefined)
                        {
                            if(typeof(packMcmeta.description)=='object') { this.rp[i].description = packMcmeta.description.fallback.replace(/§[0-9a-fk-or]/gi, ''); }
                            else if(typeof(packMcmeta.description) == 'string') { this.rp[i].description = packMcmeta.description.replace(/§[0-9a-fk-or]/gi, ''); }
                        }

                        let icon = unziped['pack.png'];
                        if(icon != undefined)
                        {
                            this.rp[i].icon = await bufferToDataUrl('image/png', Buffer.from(await icon.arrayBuffer()));
                        }
                    }
                    catch(err){}

                    resolve();
                });
                this.rp[i].fileVerified=true;                
            }
            else { console.log("rp file not found") }
        }
    
        // Virtual Path
        if(data.virtualPath != undefined && data.virtualPath != ""
            && this.virtualDirectories.find(d => d.path == data.virtualPath.substring(0, data.virtualPath.lastIndexOf(sep)) && d.name == data.virtualPath.split(sep)[data.virtualPath.split(sep).length-1]) == undefined)
        {
            this.virtualDirectories.push({path: data.virtualPath.substring(0, data.virtualPath.lastIndexOf(sep)), parent: 'resourcepacks', name: data.virtualPath.split(sep)[data.virtualPath.split(sep).length-1]})
        }

        if(og != JSON.stringify(this.rp))
        {
            this.save();
            if(needUpdate) { this.onRPUpdate(this.rp); }
        }
    }
    // Shaders
    static cleanShaderName(n) { return n.endsWith('.zip')?n.substring(0,n.length-4):(n.endsWith('.disabled')?n.substring(0, n.length-9):n) }
    shaderExist(n) { return fs.existsSync(path.join(this.path, 'shaderpacks', Instance.cleanModName(n)+'.zip'))||fs.existsSync(path.join(this.path, 'shaderpacks', Instance.cleanModName(n)+'.disabled'))||fs.existsSync(path.join(this.path, 'shaderpacks', Instance.cleanModName(n))) }
    setShaderData(data =
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
        let og = JSON.stringify(this.shaders);
        if(data.filename.endsWith('.txt')){return;}
        data.filename = Instance.cleanShaderName(data.filename);

        let i = this.shaders.findIndex(m => m.filename == data.filename);
        if(i>=0)
        {
            for(let k of Object.keys(this.shaders[i]))
            {
                if(data[k] == undefined) { data[k] = this.shaders[i][k]; }
            }
            this.shaders[i] = data;
            this.shaders[i].missing = !this.shaderExist(this.shaders[i].filename);
        }
        else
        {
            i = this.shaders.length;
            this.shaders.push(Object.assign({
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
        let needUpdate = true;
        let workingPath = path.join(this.path, 'shaderpacks', data.filename+(data.disabled?'.disabled':'.zip'));
        if(fs.existsSync(path.join(this.path, 'shaderpacks', data.filename+'.zip')))
        {
            needUpdate = path.join(this.path, 'shaderpacks', data.filename+'.zip') != workingPath
            fs.renameSync(path.join(this.path, 'shaderpacks', data.filename+'.zip'), workingPath)
        }
        else if(fs.existsSync(path.join(this.path, 'shaderpacks', data.filename+'.disabled')))
        {
            needUpdate = path.join(this.path, 'shaderpacks', data.filename+'.disabled') != workingPath
            fs.renameSync(path.join(this.path, 'shaderpacks', data.filename+'.disabled'), workingPath)
        }
        else if(fs.existsSync(path.join(this.path, 'shaderpacks', data.filename)))
        {
            needUpdate = path.join(this.path, 'shaderpacks', data.filename) != workingPath
            fs.renameSync(path.join(this.path, 'shaderpacks', data.filename), workingPath)
        }

        // if(workingPath!=null && !this.shaders[i].fileVerified)
        // {
        //     new Promise(async (resolve) =>
        //     {
        //         let unziped = (await unzip( fs.readFileSync(workingPath) )).entries;
        //         console.log(unziped)

        //         let packMcmeta = unziped['pack.mcmeta'];
        //         if(packMcmeta != undefined)
        //         {
        //             if(typeof(packMcmeta.description)=='object') { this.shaders[i].description = packMcmeta.description.fallback.replace(/§[0-9a-fk-or]/gi, ''); }
        //             else if(typeof(packMcmeta.description) == 'string') { this.shaders[i].description = packMcmeta.description.replace(/§[0-9a-fk-or]/gi, ''); }
        //         }

        //         let icon = unziped['pack.png'];
        //         if(icon != undefined)
        //         {
        //             this.shaders[i].icon = await bufferToDataUrl('image/png', Buffer.from(await icon.arrayBuffer()));
        //         }

        //         resolve();
        //     });
        //     this.shaders[i].fileVerified=true;
        // }

    
        // Virtual Path
        if(data.virtualPath != undefined && data.virtualPath != ""
            && this.virtualDirectories.find(d => d.path == data.virtualPath.substring(0, data.virtualPath.lastIndexOf(sep)) && d.name == data.virtualPath.split(sep)[data.virtualPath.split(sep).length-1]) == undefined)
        {
            this.virtualDirectories.push({path: data.virtualPath.substring(0, data.virtualPath.lastIndexOf(sep)), parent: 'shaderpacks', name: data.virtualPath.split(sep)[data.virtualPath.split(sep).length-1]})
            console.log(this.virtualDirectories)
        }

        if(og != JSON.stringify(this.shaders))
        {
            this.save();
            if(needUpdate) { this.onShaderUpdate(this.shaders); }
        }
    }

    // Download
    setLoading(o)
    {
        if(this.loading.find(l=>l.index==o.index))
        {
            this.loading[this.loading.findIndex(l=>l.index==o.index)] = o;
            fs.writeFileSync(path.join(config.directories.instances, this.name, ".loadings.json"), JSON.stringify(this.loading))
        }
        else
        {
            this.loading.index = this.loading.length;
            this.loading.push(o);
            fs.writeFileSync(path.join(config.directories.instances, this.name, ".loadings.json"), JSON.stringify(this.loading))
        }
        return this.loading.index;
    }


    static async ephemeralInstance(loader, version, mods)
    {
        console.log("Launching ephemeral instance:", loader, version)

        //  Create temp instance directory + world
        // let p = path.join(config.directories.ephemeralInstances, new Date().toISOString())
        // let p = path.join("/tmp/ephemeral-instances/", "/minecraft")
        const p = await fs.mkdtempSync(path.join(os.tmpdir(), 'ephemeral-instances-'));

        console.log(p)

        // fs.writeFileSync(path.join("tmp","text.txt"), path.join(rootPath(), ".Test World"))
        // fs.writeFileSync(path.join("tmp","text2.txt"), path.join(__dirname, ".Test World"))

        if(fs.existsSync(p)){fs.rmSync(p, { recursive: true, force: true });}
        fs.mkdirSync(p, {recursive: true});
    
        // World
        try { fs.cpSync(path.join(rootPath(), ".Test World"), path.join(p, "saves/Test World"), {recursive: true}); }
        catch(err){fs.writeFileSync(path.join("tmp","err.txt"), JSON.stringify(err)); return}

        // Install Mods
        for(let m of mods)
        {
            if(!m.type){m.type="mods"}
            await Download.download(m.url, path.join(p, m.type, m.filename))
        }

        // Loader
        version.custom = await installLoader(p, loader, version)

        // Java Version
        let javaVersion = (await (await fetch((await (await fetch("https://piston-meta.mojang.com/mc/game/version_manifest.json")).json()).versions.find(v=>v.id==version.number).url)).json()).javaVersion.majorVersion
        let javaPath = findJavaExecutable(javaVersion);

        if(!javaPath)
        {
            await downloadJava(javaVersion)
            javaPath = findJavaExecutable(javaVersion);
        }

        // // New World
        // if(!fs.existsSync(path.join(p, 'saves', 'world'))){fs.mkdirSync(path.join(p, 'saves', 'world'), {recursive: true});}

        // let levelData = 
        // {
        //     name: "",
        //     type: "compound",
        //     value:
        //     {
        //         Data: {
        //             type: "compound",
        //             value: {
        //                 Version:
        //                 {
        //                     type: "compound",
        //                     value:
        //                     {
        //                         Id: { type: "int", value: minecraftData(version.number.toString()).version.dataVersion },
        //                         Name: { type: "string", value: version.number.toString() },
        //                         Series: { type: "string", value: "main" },
        //                         Snapshot: { type: "byte", value: version.type=='release'?0:1 }
        //                     }
        //                 },
        //                 LevelName: { type: "string", value: 'world' },
        //                 GameType: { type: "int", value: 1 },
        //                 hardcore: { type: "byte", value: 0 },
        //                 allowCommands: { type: "byte", value: 1 },
        //                 Difficulty: { type: "byte", value: 2 },
        //                 DataVersion: { type: "int", value: minecraftData(version.number.toString()).version.dataVersion },
        //                 confirmedExperimentalSettings: { type: 'byte', value: 1 },
        //                 initialized: { type: 'byte', value: 1 },
        //                 WasModded: { type: 'byte', value: 1 },    
        //             }
        //         }    
        //     }
        // };

        // const buffer = nbt.writeUncompressed(levelData);
        // let compressed = zlib.gzipSync(buffer)
        // fs.writeFileSync(path.join(p, 'saves', 'world', 'level.dat'), compressed);
    
        // Resource Path (download optimization)
        let resourcePath = path.join(config.directories.resources, version.number+'-'+version.type)
        if(!fs.existsSync(resourcePath+sep+'assets')){fs.mkdirSync(resourcePath+sep+'assets', {recursive: true});}
        else{fs.cpSync(resourcePath+sep+'assets', path.join(p,'assets'), {recursive:true})}
        if(!fs.existsSync(resourcePath+sep+'libraries')){fs.mkdirSync(resourcePath+sep+'libraries', {recursive: true});}
        else{fs.cpSync(resourcePath+sep+'libraries', path.join(p,'libraries'), {recursive:true})}

        if(fs.existsSync(path.join(config.directories.resources, 'versions', version.number)))
        { fs.cpSync(path.join(config.directories.resources, 'versions', version.number), path.join(p,'versions',version.number), {recursive:true}) }


        // Asset Move
        launcher.on('debug', (e) =>
        {
            if(e == '[MCLC]: Downloaded assets')
            {
                fs.cpSync(path.join(p,'assets'), resourcePath+sep+'assets', {recursive:true})
                fs.cpSync(path.join(p,'libraries'), resourcePath+sep+'libraries', {recursive:true})
                fs.cpSync(path.join(p,'versions'), path.join(config.directories.resources, 'versions'), {recursive:true})
            }
        });

        // Prepare Events
        // launcher.on('progress', (e) => console.log('progress', e));
        launcher.on('debug', (e) => console.log('debug', e));
        launcher.on('data', (e) => console.log('data', e));
        launcher.on('close', (e) => console.log('close', e));
        launcher.on('error', (e) => console.log('error', e));
        launcher.on('close', (e) => {console.log(e);launcher.removeAllListeners()})

        let options =
        {
            root: p,
            version: version,
            memory: {max: '4G', min: '2G'},
            authorization: await Authenticator.getAuth("tester"),
            forge: loader.name=='forge'||loader.name=='neoforge'?path.join(p, 'versions', `${loader.name}-${version.number}-${loader.version}`, `${loader.name}-${version.number}-${loader.version}.jar`):null,
            quickPlay: {type: "singleplayer", identifier: "Test World"},
            javaPath: javaPath?javaPath:'java',
            overrides: {detached: true}
        }

        let childProcess = await launcher.launch(options);

        if(!childProcess) { console.error("Process is null..."); return; }
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
                modsCount: data.mods?.filter(e=>!e.missing).length,
                resourcepacksCount: data.resourcepacks?.filter(e=>!e.missing).length,
                shadersCount: data.shaders?.filter(e=>!e.missing).length
            })
        }
        return list;
    }

    static async importInstance(link, metadata, ready = () => {})
    {
        console.log("Importing Instance from",link)
        let url = new URL(link);

        let i = new Instance({name: metadata.title});
        i.icon = metadata?.icon;

        // Modrinth
        if(url.hostname == "modrinth.com")
        {
            // Find Modpack Version
            const version = (await (await fetch('https://api.modrinth.com/v2/project'+sep+url.pathname.split(sep)[url.pathname.split(sep).length-1]+sep+'version')).json())
            .sort((a,b) => { return new Date(b.date_published) - new Date(a.date_published); })[0];
            let file = version.files.filter(f=>f.primary)[0];

            // Metadata
            let meta = (await (await fetch('https://api.modrinth.com/v2/project'+sep+url.pathname.split(sep)[url.pathname.split(sep).length-1])).json());
            i.description = meta.description;
            i.version.number = version.game_versions[0];
            i.loader.name = version.loaders[0]!=undefined?version.loaders[0]:'vanilla';
            // Set last loader version
            switch(i.loader.name)
            {
                case 'forge':
                {
                    const data = new XMLParser().parse(await (await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')).text());
                    i.loader.version = data.metadata.versioning.versions.version.filter(e => e.split('-')[0] == i.version.number.toString())[0].split('-')[1];
                    break;
                }
                case 'neoforge':
                {
                    const data = new XMLParser().parse(await (await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')).text());
                    i.loader.version = data.metadata.versioning.versions.version.filter(e => '1.'+e.split('-')[0].substring(0, e.split('-')[0].lastIndexOf('.')) == i.version.number.toString()).reverse()[0];
                    break;
                }
                case 'fabric':
                {
                    const data = await (await fetch('https://meta.fabricmc.net/v2/versions/loader'+sep+i.version.number.toString())).json();
                    i.loader.version = data[0].loader.version;
                    break;
                }
                default: { break; }
            }
            i.save();

            ready();

            let p = path.join(config.directories.instances, i.name);
            fs.mkdirSync(path.join(p,'minecraft'),{recursive:true});


            // Downlaod zip
            await Download.download(decodeURI(file.url), path.join(p, 'original.zip'))
            let zip = fs.readFileSync(path.join(p, 'original.zip'))

            const {entries} = await unzip(zip);
            const data = await entries['modrinth.index.json'].json();

            // Download content
            let total = 0;
            for(let f of data.files)
            {
                if(entries[f.path] != undefined) { continue; }
                total += f.fileSize;
            }
            let loaded = 0;
            let loadingIndex = i.setLoading({type: "instance-download", value: 0})

            // Mod Download or Transfert
            for(let f of data.files)
            {
                if(fs.existsSync(path.join(p, 'minecraft', f.path))){loaded+=f.fileSize; continue;}

                if(entries[f.path] != undefined)
                {
                    fs.writeFileSync(path.join(p, 'minecraft', f.path), await entries[f.path].arrayBuffer())
                }
                else if(f.downloads != undefined)
                {
                    if(f.downloads[0] == undefined){continue;}

                    await Download.download(decodeURI(f.downloads[0]), path.join(p, 'minecraft', f.path), false, false)
                }

                loaded+=f.fileSize;
                i.setLoading({type: "instance-download", value: Math.round((loaded/total)*1000)/1000, index: loadingIndex})
            }
            // Other Files
            for(let e of Object.entries(entries))
            {
                if(e[0].startsWith('overrides'+sep) && e[0] != 'overrides'+sep)
                {
                    try
                    {
                        if(!fs.existsSync(path.join(p, 'minecraft', e[0].slice(10).substring(0, e[0].slice(10).lastIndexOf(sep)))))
                        { fs.mkdirSync(path.join(p, 'minecraft', e[0].slice(10).substring(0, e[0].slice(10).lastIndexOf(sep))), {recursive:true}) }
                        console.log(e[0].slice(10))
                        fs.writeFileSync(path.join(p, 'minecraft', e[0].slice(10)), Buffer.from(await e[1].arrayBuffer()))
                    }
                    catch(err) { console.warn(err) }
                }
            }

            i.save();
        }
        // Curseforge
        else if(url.hostname == "www.curseforge.com")
        {
            let meta = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${url.pathname.split(sep)[url.pathname.split(sep).length-1]}&classId=4471`)).json()).data[0];
            let id = meta.id;

            // https://www.curseforge.com/api/v1/mods/936875/files?pageIndex=0&pageSize=20&sort=dateCreated&sortDescending=true&removeAlphas=true
            const versions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=0&pageSize=60&sort=dateCreated&sortDescending=true&removeAlphas=false`)).json()).data
            .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });

            var version = versions[0];

            // Metadata
            i.description = meta.summary;
            i.version.number = version.gameVersions[0];
            i.loader.name = version.gameVersions[1].toLowerCase();
            // Set last loader version
            switch(i.loader.name)
            {
                case 'forge':
                {
                    const data = new XMLParser().parse(await (await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')).text());
                    i.loader.version = data.metadata.versioning.versions.version.filter(e => e.split('-')[0] == i.version.number.toString())[0].split('-')[1];
                    break;
                }
                case 'neoforge':
                {
                    const data = new XMLParser().parse(await (await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')).text());
                    i.loader.version = data.metadata.versioning.versions.version.filter(e => '1.'+e.split('-')[0].substring(0, e.split('-')[0].lastIndexOf('.')) == i.version.number.toString()).reverse()[0];
                    break;
                }
                case 'fabric':
                {
                    const data = await (await fetch('https://meta.fabricmc.net/v2/versions/loader'+sep+i.version.number.toString())).json();
                    i.loader.version = data[0].loader.version;
                    break;
                }
                default: { break; }
            }
            i.save();

            ready();

            let p = path.join(config.directories.instances, i.name);
            fs.mkdirSync(path.join(p,'minecraft'),{recursive:true});


            // Download zip
            if(fs.existsSync(path.join(p, 'original.zip'))){fs.unlinkSync(path.join(p, 'original.zip'))}
            await Download.download(decodeURI(`https://www.curseforge.com/api/v1/mods/${id}/files/${version.id}/download`), path.join(p, 'original.zip'))
            let zip = fs.readFileSync(path.join(p, 'original.zip'))
            const {entries} = await unzip(zip);

            const data = await entries['manifest.json'].json();

            if(!fs.existsSync(path.join(p, 'minecraft/mods'))){fs.mkdirSync(path.join(p, 'minecraft/mods'));}
            if(!fs.existsSync(path.join(p, 'minecraft/resourcepacks'))){fs.mkdirSync(path.join(p, 'minecraft/resourcepacks'));}
            if(!fs.existsSync(path.join(p, 'minecraft/shaderpacks'))){fs.mkdirSync(path.join(p, 'minecraft/shaderpacks'));}


            // Download content
            // Mod Download or Transfert
            let loadingIndex = i.setLoading({type: "instance-download", value: 0})
            let downloaded = 0;
            for(let f of data.files)
            {
                let dest = "mods"
                let fileUrl = await getRedirectLocation(`https://www.curseforge.com/api/v1/mods/${f.projectID}/files/${f.fileID}/download`)
                if(fileUrl.slice(0, fileUrl.lastIndexOf("?")).endsWith(".zip"))
                {
                    dest = "resourcepacks";
                }
                Download.download(fileUrl, path.join(p, 'minecraft', dest), true, false)
                .then(async (r) =>
                {
                    if(dest == "resourcepacks")
                    {
                        const {entries} = await unzip(fs.readFileSync(r));
                        if(entries["shaders"+sep]){ fs.renameSync(r, path.join(p, 'minecraft', "shaderpacks", r.slice(r.lastIndexOf(sep)))) }
                    }
                    
                    downloaded++;
                    i.setLoading({type: "instance-download", value: Math.round((downloaded/data.files.length)*1000)/1000, index: loadingIndex})
                })
            }
            // Other Files
            for(let e of Object.entries(entries))
            {
                if(e[0].startsWith('overrides'+sep) && e[0] != 'overrides'+sep && !e[0].endsWith(sep))
                {
                    try
                    {
                        if(!fs.existsSync(path.join(p, 'minecraft', e[0].slice(10).substring(0, e[0].slice(10).lastIndexOf(sep)))))
                        { fs.mkdirSync(path.join(p, 'minecraft', e[0].slice(10).substring(0, e[0].slice(10).lastIndexOf(sep))), {recursive:true}) }

                        fs.writeFileSync(path.join(p, 'minecraft', e[0].slice(10)), Buffer.from(await e[1].arrayBuffer()))
                    }
                    catch(err) { console.warn(err) }
                }
            }

            i.save();
        }
    }
}


async function installLoader(root, loader, version, listeners = null)
{
    let file = null;
    let targetFile = null;

    let win = BrowserWindow.getAllWindows()[0] || BrowserWindow.getFocusedWindow();
    let createdWin = win==undefined;
    if(createdWin)
    {
        win = new BrowserWindow({});
        win.hide();
    }

    // Install Loader
    switch(loader.name)
    {
        case 'vanilla':
        {
            delete version.custom;
            return null;
        }
        case 'forge':
        {
            // delete version.custom;
            version.custom = `forge-${version.number}-${loader.version}`;

            const targetPath = path.join(config.directories.resources, "versions", `forge-${version.number}-${loader.version}`);
            const targetName = `forge-${version.number}-${loader.version}.jar`;

            file = path.join(targetPath, targetName);
            targetFile = path.join(root, 'versions', `forge-${version.number}-${loader.version}`, targetName);

            if(fs.existsSync(path.join(targetPath, targetName))){ break; }
            if(!fs.existsSync(targetPath)){fs.mkdirSync(targetPath, {recursive:true});}

            let link = `https://maven.minecraftforge.net/net/minecraftforge/forge/${version.number}-${loader.version}/forge-${version.number}-${loader.version}`;
            if(parseInt(version.number.split('.')[1]) <= 12 && (version.number.split('-')[0] !== '1.12.2' || (parseInt(version.number.split('.').pop()) <= 2847)))
            { link += '-universal.jar'; } else { link += '-installer.jar';  }
            
            await download(win, link, {filename: targetName, directory: targetPath, onProgress: async (progress) =>
            {
                if(listeners) { listeners.log('loaderProgress', Math.round(progress.percent*100).toString()) }
            }});

            if(!fs.existsSync(path.join(targetPath, targetName)))
            {
                console.warn("Unable to download:",link);
                loader.version = "47.4.0";
                return await installLoader(root, loader, version, listeners);
            }

            break;
        }
        case 'neoforge':
        {
            version.custom = `neoforge-${version.number}-${loader.version}`;

            const targetPath = path.join(config.directories.resources, "versions", `neoforge-${version.number}-${loader.version}`);
            const targetName = `neoforge-${version.number}-${loader.version}.jar`;

            file = path.join(targetPath, targetName);
            targetFile = path.join(root, 'versions', `neoforge-${version.number}-${loader.version}`, targetName);

            if(fs.existsSync(path.join(targetPath, targetName))){break;}
            if(!fs.existsSync(targetPath)){fs.mkdirSync(targetPath, {recursive:true});}

            let link = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loader.version}/neoforge-${loader.version}-installer.jar`;
            
            await download(win, link, {filename: targetName, directory: targetPath, onProgress: async (progress) =>
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

            await download(win, link, {filename: targetName, directory: targetPath, onProgress: async (progress) =>
            {
                if(listeners) { listeners.log('loaderProgress', Math.round(progress.percent*100).toString()) }
            }});
            break;
        }
        default:
        {
            console.log("Unknown loader:", loader)
            break;
        }
    }

    if(file && targetFile)
    {
        if(!fs.existsSync(targetFile.substring(0, targetFile.lastIndexOf(sep)))){fs.mkdirSync(targetFile.substring(0, targetFile.lastIndexOf(sep)), {recursive:true});}
        fs.copyFileSync(file, targetFile);
    }

    if(createdWin) { win.close(); }

    return version.custom;
}

function fixJSONChar(jsonString)
{
  let inString = false;
  let escaped = false;
  let result = '';

  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];

    if (inString) {
      if (escaped) {
        result += char;
        escaped = false;
      } else if (char === '\\') {
        result += char;
        escaped = true;
      } else if (char === '"') {
        inString = false;
        result += char;
      } else if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        // Handle CRLF (\r\n)
        if (jsonString[i + 1] === '\n') {
          result += '\\n';
          i++; // skip \n
        } else {
          result += '\\n';
        }
      } else {
        result += char;
      }
    } else {
      result += char;
      if (char === '"') {
        inString = true;
      }
    }
  }

  return result;
}

async function getRedirectLocation(initialUrl)
{
    const response = await fetch(initialUrl,
    {
        method: 'HEAD',
        redirect: 'manual'
    });

    if(response.status >= 300 && response.status < 400)
    {
        const location = response.headers.get('location');
        const finalUrl = new URL(location, initialUrl).toString();
        return finalUrl;
    }
    else
    {
        return initialUrl;
    }
}


function findJavaExecutable(targetMajorVersion)
{
    targetMajorVersion = targetMajorVersion.toString()

    if(fs.existsSync(path.join(config.directories.jre, `java-${targetMajorVersion}`, 'Contents','Home','bin','java')))
    { return path.join(config.directories.jre, `java-${targetMajorVersion}`, 'Contents','Home','bin','java') }
    else if(fs.existsSync(path.join(config.directories.jre, `java-${targetMajorVersion}`, 'bin', 'java.exe')))
    { return path.join(config.directories.jre, `java-${targetMajorVersion}`, 'bin', 'java.exe') }


    const candidates = [];

    if (process.env.JAVA_HOME)
    {
        const javaPath = path.join(process.env.JAVA_HOME, 'bin', platform() === 'win32' ? 'java.exe' : 'java');
        if (fs.existsSync(javaPath)) candidates.push(javaPath);
    }

    if (platform() === 'win32')
    {
        const possibleRoots = [
            'C:\\Program Files\\Java',
            'C:\\Program Files (x86)\\Java'
        ];
        for (const root of possibleRoots)
        {
            try
            {
                const dirs = execSync(`dir "${root}" /b /ad`, { encoding: 'utf8' }).split(/\r?\n/);
                for (const dir of dirs)
                {
                    if (dir.includes(targetMajorVersion))
                    {
                        const javaPath = path.join(root, dir, 'bin', 'java.exe');
                        if (fs.existsSync(javaPath)) candidates.push(javaPath);
                    }
                }
            }
            catch(err){console.warn(err)}
        }
    }
    else if (platform() === 'darwin')
    {
        // macOS
        try
        {
            const out = execSync('/usr/libexec/java_home -V 2>&1', { encoding: 'utf8' });
            const matches = [...out.matchAll(/([0-9][0-9._]*)[^\n]*?(\/Library\/Java\/JavaVirtualMachines\/[^/\n]+\/Contents\/Home)/g)];

            for(const m of matches)
            {
                const versionStr = m[1];
                const homePath = m[2];
                const major = versionStr.startsWith('1.') ? parseInt(versionStr.split('.')[1], 10) : parseInt(versionStr.split('.')[0], 10);
                if (major === targetMajorVersion)
                {
                    console.log(path.join(homePath, 'bin', 'java'))
                    candidates.push(path.join(homePath, 'bin', 'java'));
                }
            }
        }
        catch(err){console.warn(err)}
    }
    else
    {
        // Linux
        try
        {
            const dirs = execSync('ls /usr/lib/jvm', { encoding: 'utf8' }).split(/\r?\n/);
            for (const dir of dirs)
            {
                if (dir.includes(targetMajorVersion))
                {
                    const javaPath = path.join('/usr/lib/jvm', dir, 'bin', 'java');
                    if (fs.existsSync(javaPath)) candidates.push(javaPath);
                }
            }
        }
        catch(err){console.warn(err)}
    }

    try
    {
        const sysJava = execSync('which java', { encoding: 'utf8' }).trim();
        if (fs.existsSync(sysJava)) candidates.push(sysJava);
    }
    catch(err){console.warn(err)}

    for(const candidate of candidates)
    {
        try
        {
            const versionOut = execSync(`"${candidate}" -version`, { encoding: 'utf8', stderr: 'pipe' });
            if(!versionOut.includes(targetMajorVersion)){continue;}
            return candidate;
        }
        catch(err){console.warn(err)}
    }

    return null;
}
async function downloadJava(version, listeners = null)
{
    let win = BrowserWindow.getAllWindows()[0] || BrowserWindow.getFocusedWindow();
    let createdWin = win==undefined;
    if(createdWin)
    {
        win = new BrowserWindow({});
        win.hide();
    }

    // https://api.adoptium.net/v3/binary/latest/<major_version>/<release_type>/<os>/<arch>/<image_type>/<jvm_impl>/<heap_size>/<vendor>?project=jdk
    let os = 'windows';
    switch(platform())
    {
        case "win32": os = "windows"; break;
        case "darwin": os = "mac"; break;
        case "linux": os = "linux"; break;
        default: throw new Error(`Unsupported os: ${platform()}`);
    }

    let arch = "aarch64";
    switch (process.arch)
    {
        case 'x64': arch = 'x64'; break;
        case 'arm64': arch = 'aarch64'; break;
        case 'arm': arch = 'arm'; break;
        default: throw new Error(`Unsupported arch: ${process.arch}`);
    }

    fs.mkdirSync(path.join(config.directories.jre, `java-${version}`), {recursive: true})

    let link = `https://api.adoptium.net/v3/binary/latest/${version}/ga/${os}/${arch}/jre/hotspot/normal/adoptium?project=jdk`
    await download(win, link, {filename: `java-${version}.tar`, directory: config.directories.jre, onProgress: async (progress) =>
    {
        if(listeners) { listeners.log('javaProgress', Math.round(progress.percent*100).toString()) }
    }});

    // await new Promise((resolve, reject) =>
    // {
    //     fs.createReadStream(path.join(config.directories.jre, `java-${version}.tar`))
    //         .pipe(unzipper.Extract({ path: path.join(config.directories.jre, `java-${version}`) }))
    //         .on("close", resolve)
    //         .on("error", reject);
    // });

    console.log(path.join(config.directories.jre, `java-${version}.tar`))
    try
    {
        await tar.x
        ({
            file: path.join(config.directories.jre, `java-${version}.tar`),
            cwd: path.join(config.directories.jre, `java-${version}`),
            gzip: true
        });
    }
    catch(err)
    {
        await extract(path.join(config.directories.jre, `java-${version}.tar`), { dir: path.join(config.directories.jre, `java-${version}`) });
    }

    // Direct Directory
    const baseDir = path.join(config.directories.jre, `java-${version}`);
    const subDirs = fs.readdirSync(baseDir);

    if (subDirs.length === 1)
    {
        const nestedDir = path.join(baseDir, subDirs[0]);
        const items = fs.readdirSync(nestedDir);

        for(const item of items)
        {
            fs.renameSync(path.join(nestedDir, item), path.join(baseDir, item));
        }

        fs.rmdirSync(nestedDir);
    }

    fs.unlinkSync(path.join(config.directories.jre, `java-${version}.tar`))

    if(createdWin) { win.close(); }

    if(fs.existsSync(path.join(config.directories.jre, `java-${version}`, 'Contents','Home','bin','java')))
    { return path.join(config.directories.jre, `java-${version}`, 'Contents','Home','bin','java') }
    else if(fs.existsSync(path.join(config.directories.jre, `java-${version}`, 'bin', 'java.exe')))
    { return path.join(config.directories.jre, `java-${version}`, 'bin', 'java.exe') }
}

module.exports = Instance;