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
const { unzip } = require('unzipit');
const { XMLParser } = require("fast-xml-parser");

const zlib = require('zlib');
const nbt = require('prismarine-nbt');
const minecraftData = require('minecraft-data')

const config = require('./config');
const Download = require('./download');
const jarReader = require('./jar-reader');
const { default: bufferToDataUrl } = require('buffer-to-data-url');


class Instance
{
    constructor(data = {})
    {
        Object.assign(this, data);
        this.path = path.join(config.directories.instances, this.name, "minecraft");
        if(!fs.existsSync(this.path)) { fs.mkdirSync(this.path, {recursive:true}); }
        if(data == {} || this.name==''){return this;}

        // Everything :)
        for(let k of Object.keys(data))
        {
            if(this[k] == undefined) { this[k] = data[k]; }
        }

        // Mods Files
        // Delete data if do not exist
        for(let m of this.mods)
        {
            if(fs.existsSync(path.join(this.path, 'mods', m.filename)) || fs.existsSync(path.join(this.path, 'mods', m.filename+'.disabled')) || fs.existsSync(path.join(this.path, 'mods', m.filename+'.jar'))){continue}
            this.setModData({filename: m.filename, missing: true}, true)
        }
        // Create data if exist
        if(!fs.existsSync(path.join(this.path, 'mods'))) { fs.mkdirSync(path.join(this.path, 'mods'), {recursive:true}); }
        
        let watcher = chokidar.watch(path.join(this.path, 'mods'), {persistent: true});
        watcher.on('all', (e, p, s) =>
        {
            let ogMods = JSON.parse(JSON.stringify(this.mods));
            let f = p.split('/')[p.split('/').length-1];
            
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
            if(e==='add')
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

            if(ogMods != this.mods)
            {
                this.onModUpdate(this.mods)
            }
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
        if(!fs.existsSync(resourcePath+'/assets')){fs.mkdirSync(resourcePath+'/assets', {recursive: true});}
        else{fs.cpSync(resourcePath+'/assets', path.join(this.path,'assets'), {recursive:true})}
        if(!fs.existsSync(resourcePath+'/libraries')){fs.mkdirSync(resourcePath+'/libraries', {recursive: true});}
        else{fs.cpSync(resourcePath+'/libraries', path.join(this.path,'libraries'), {recursive:true})}
        if(!fs.existsSync(path.join(config.directories.resources, 'versions'))){fs.mkdirSync(path.join(config.directories.resources, 'versions'), {recursive: true});}
        // else { fs.cpSync(path.join(config.directories.resources, 'versions'), path.join(this.path,'versions'), {recursive:true}) }

        // Settings
        let options =
        {
            root: this.path,
            version: this.version,
            memory: this.memory,
            authorization: await Authenticator.getAuth("dev"),
            forge: this.loader.name=='forge'||this.loader.name=='neoforge'?path.join(this.path, 'versions', `${this.loader.name}-${this.version.number}-${this.loader.version}`, `${this.loader.name}-${this.version.number}-${this.loader.version}.jar`):null,
            clientPackage: null,
            customArgs: [`-javaagent:${config.javaAgent}`],
            overrides:
            {
                // assetRoot: resourcePath+'/assets',
                // assetIndex: resourcePath+'/assets/indexes',
                // libraryRoot: resourcePath+'/libraries',
                directory: path.join(config.directories.resources, 'versions')
            }
        }

        // Asset Move
        launcher.on('debug', (e) =>
        {
            if(e == '[MCLC]: Downloaded assets')
            {
                fs.cpSync(path.join(this.path,'assets'), resourcePath+'/assets', {recursive:true})
                fs.cpSync(path.join(this.path,'libraries'), resourcePath+'/libraries', {recursive:true})
                fs.cpSync(path.join(this.path,'versions'), path.join(config.directories.resources, 'versions'), {recursive:true})
            }
        });

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
    modExist(n) { return fs.existsSync(path.join(this.path, 'mods', Instance.cleanModName(n)+'.jar'))||fs.existsSync(path.join(this.path, 'mods', Instance.cleanModName(n)+'.disabled'))||fs.existsSync(path.join(this.path, 'mods', Instance.cleanModName(n))) }
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
        let workingPath = null;
        if(fs.existsSync(path.join(this.path, 'mods', data.filename+'.jar')))
        {
            workingPath=path.join(this.path, 'mods', data.filename+(data.disabled?'.disabled':'.jar'));
            fs.renameSync(path.join(this.path, 'mods', data.filename+'.jar'), workingPath)
        }
        else if(fs.existsSync(path.join(this.path, 'mods', data.filename+'.disabled')))
        {
            workingPath=path.join(this.path, 'mods', data.filename+(data.disabled?'.disabled':'.jar'));
            fs.renameSync(path.join(this.path, 'mods', data.filename+'.disabled'), workingPath)
        }
        else if(fs.existsSync(path.join(this.path, 'mods', data.filename)))
        {
            workingPath=path.join(this.path, 'mods', data.filename+(data.disabled?'.disabled':'.jar'))
            fs.renameSync(path.join(this.path, 'mods', data.filename), workingPath)
        }

        // Find metadata in the jar if missing
        if(workingPath!=null && !this.mods[i].fileVerified)
        {
            new Promise(async (resolve) =>
            {
                if(!fs.existsSync(workingPath)){resolve(); return;}

                // META-INF
                let metaTOML = await jarReader.jar(workingPath, 'META-INF/mods.toml', true);
                if(metaTOML != undefined)
                {
                    let meta = metaTOML;

                    if(meta?.mods?.value[0]?.logoFile != undefined)
                    {
                        try{this.mods[i].icon = await bufferToDataUrl('image/png', Buffer.from(await jarReader.jar(workingPath, meta.mods.value[0].logoFile, true)))}
                        catch(err){console.warn(err)}
                    }
                    this.mods[i].description = meta?.mods?.value[0]?.description;
                    this.mods[i].title = meta?.mods?.value[0]?.displayName;
                    this.mods[i].version = meta?.mods?.value[0]?.version;
                    this.mods[i].modId = meta?.mods?.value[0]?.modId;
                    console.log(meta)
                }
                // Fabric JSON
                let fabricModJSON = await jarReader.jar(workingPath, 'fabric.mod.json', true);
                if(fabricModJSON != undefined)
                {
                    let meta = fabricModJSON;
                    this.mods[i].fabricMeta = meta;
                    if(!this.mods[i].title){this.mods[i].title=meta.name}
                    if(this.mods[i].description=='No description...'){this.mods[i].description=meta.description}
                    if(!this.mods[i].id){this.mods[i].id=meta.id}
                    this.mods[i].clientRequired=meta.environment=='client'
                    this.mods[i].serverRequired=meta.environment=='server'

                    let potentialIcon = await jarReader.jar(workingPath, meta.icon, true);
                    if(meta.icon && potentialIcon!=undefined)
                    {
                        this.mods[i].icon = await bufferToDataUrl('image/png', Buffer.from(potentialIcon));
                    }
                }
                // Pack Mcmeta
                let packMcmeta = await jarReader.jar(workingPath, 'pack.mcmeta', true);
                if(packMcmeta != undefined)
                {
                    let meta = packMcmeta;
                    if(typeof(meta.description)=='object') { this.mods[i].description = meta.description.fallback.replace(/§[0-9a-fk-or]/gi, ''); }
                    else if(typeof(meta.description) == 'string') { this.mods[i].description = meta.description.replace(/§[0-9a-fk-or]/gi, ''); }
                }

                // Icon
                if(this.mods[i].icon==undefined)
                {
                    let r = await jarReader.jar(workingPath, null, true)
                    if(Object.entries(r).find(e=>(e[0].startsWith('assets/')&&e[0].endsWith('icon.png')&&e[0].split('/').length==3) || e=='icon.png') != undefined)
                    {
                        this.mods[i].icon = await bufferToDataUrl('image/png', Buffer.from(await Object.entries(r).find(e=>(e[0].startsWith('assets/')&&e[0].endsWith('icon.png')&&e[0].split('/').length==3) || e=='icon.png')[1]?.arrayBuffer()));
                    }
                }

                resolve();
            })

            this.mods[i].fileVerified=true;
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
                modsCount: data.mods?.filter(e=>!e.missing).length,
                resourcepacksCount: data.resourcepacks?.filter(e=>!e.missing).length,
                shadersCount: data.shaders?.filter(e=>!e.missing).length
            })
        }
        return list;
    }

    static async importInstance(link, progress)
    {
        let url = new URL(link);

        // Modrinth
        if(url.hostname == "modrinth.com")
        {
            // Find Modpack Version
            const version = (await (await fetch('https://api.modrinth.com/v2/project/'+url.pathname.split('/')[url.pathname.split('/').length-1]+'/version')).json())
            .sort((a,b) => { return new Date(b.date_published) - new Date(a.date_published); })[0];
            let file = version.files.filter(f=>f.primary)[0];

            // Metadata
            let meta = (await (await fetch('https://api.modrinth.com/v2/project/'+url.pathname.split('/')[url.pathname.split('/').length-1])).json());
            let i = new Instance({name: meta.title});
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
                    const data = await (await fetch('https://meta.fabricmc.net/v2/versions/loader/'+i.version.number.toString())).json();
                    i.loader.version = data[0].loader.version;
                    break;
                }
                default: { break; }
            }
            i.save();

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
            }
            // Other Files
            for(let e of Object.entries(entries))
            {
                if(e[0].startsWith('overrides/') && e[0] != 'overrides/')
                {
                    try
                    {
                        if(!fs.existsSync(path.join(p, 'minecraft', e[0].slice(10).substring(0, e[0].slice(10).lastIndexOf('/')))))
                        { fs.mkdirSync(path.join(p, 'minecraft', e[0].slice(10).substring(0, e[0].slice(10).lastIndexOf('/'))), {recursive:true}) }
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
            let meta = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${url.pathname.split('/')[url.pathname.split('/').length-1]}&classId=4471`)).json()).data[0];
            let id = meta.id;

            // https://www.curseforge.com/api/v1/mods/936875/files?pageIndex=0&pageSize=20&sort=dateCreated&sortDescending=true&removeAlphas=true
            const versions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=0&pageSize=60&sort=dateCreated&sortDescending=true&removeAlphas=false`)).json()).data
            .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });

            var version = versions[0];

            // Metadata
            let i = new Instance({name: meta.name});
            i.description = meta.summary;
            console.log(version.gameVersions)
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
                    const data = await (await fetch('https://meta.fabricmc.net/v2/versions/loader/'+i.version.number.toString())).json();
                    i.loader.version = data[0].loader.version;
                    break;
                }
                default: { break; }
            }
            i.save();

            let p = path.join(config.directories.instances, i.name);
            fs.mkdirSync(path.join(p,'minecraft'),{recursive:true});


            // Downlaod zip
            await Download.download(decodeURI(`https://www.curseforge.com/api/v1/mods/${id}/files/${version.id}/download`), path.join(p, 'original.zip'))
            let zip = fs.readFileSync(path.join(p, 'original.zip'))
            const {entries} = await unzip(zip);

            const data = await entries['manifest.json'].json();

            // Download content
            // Mod Download or Transfert
            for(let f of data.files)
            {
                if(!fs.existsSync(path.join(p, 'minecraft/mods'))){fs.mkdirSync(path.join(p, 'minecraft/mods'));}

                Download.download(`https://www.curseforge.com/api/v1/mods/${f.projectID}/files/${f.fileID}/download`, path.join(p, 'minecraft/mods'), true, false)
            }
            // Other Files
            for(let e of Object.entries(entries))
            {
                if(e[0].startsWith('overrides/') && e[0] != 'overrides/')
                {
                    try
                    {
                        if(!fs.existsSync(path.join(p, 'minecraft', e[0].slice(10).substring(0, e[0].slice(10).lastIndexOf('/')))))
                        { fs.mkdirSync(path.join(p, 'minecraft', e[0].slice(10).substring(0, e[0].slice(10).lastIndexOf('/'))), {recursive:true}) }
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
            
            console.log(targetPath, targetName)
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

module.exports = Instance;