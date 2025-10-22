const { app, desktopCapturer, BrowserWindow } = require('electron');
const { download } = require("grape-electron-dl");
const { Client, Authenticator } = require('minecraft-launcher-core');
const { Auth } = require("msmc");
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

const xmcl = require("@xmcl/core")
const xmclInstaller = require("@xmcl/installer")
const curseforge = require('@meza/curseforge-fingerprint');

const config = require('./config');
const Download = require('./download');
const jarReader = require('./jar-reader');
const { default: bufferToDataUrl } = require('buffer-to-data-url');
const { platform, arch } = require('node:os');
const { EventEmitter } = require('node:stream');
const similarity = require('similarity');

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
            else if(e=="change" && !fs.existsSync(p))
            {
                let i = this.mods.findIndex(m => m.filename==Instance.cleanModName(f));

                if(this.mods[i]!=undefined)
                {
                    this.mods[i].missing = !fs.existsSync(Instance.cleanModName(p))&&!fs.existsSync(Instance.cleanModName(p)+'.jar')&&!fs.existsSync(Instance.cleanModName(p)+'.disabled');
                    this.save()
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
            else if(e=="change" && !fs.existsSync(p))
            {
                let i = this.rp.findIndex(m => m.filename==Instance.cleanShaderName(f));

                if(this.rp[i]!=undefined)
                {
                    this.rp[i].missing = !fs.existsSync(Instance.cleanShaderName(p))&&!fs.existsSync(Instance.cleanShaderName(p)+'.zip')&&!fs.existsSync(Instance.cleanShaderName(p)+'.disabled');
                    this.save()
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
            else if(e=="change" && !fs.existsSync(p))
            {
                let i = this.shaders.findIndex(m => m.filename==Instance.cleanShaderName(f));

                if(this.shaders[i]!=undefined)
                {
                    this.shaders[i].missing = !fs.existsSync(Instance.cleanShaderName(p))&&!fs.existsSync(Instance.cleanShaderName(p)+'.zip')&&!fs.existsSync(Instance.cleanShaderName(p)+'.disabled');
                    this.save()
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
            windowOpen: function(window, windowSource, process){},
            processLaunch: function(process){},
            network: function(m){}
        }, port = 1337, world = null)
    {
        if(!fs.existsSync(this.path)){fs.mkdirSync(this.path, {recursive: true});}

        if(!this.version.type){this.version.type='release'}

        launchMinecraft(this.path, this.version, this.loader, 
            {
                min: Number(this.memory.min.slice(0, this.memory.min.length-1)),
                max: Number(this.memory.max.slice(0, this.memory.max.length-1))
            },
            world,
            listeners
        )
    }

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
    sinytra = false

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
                dependencies: null,
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
        if(workingPath!=null && this.mods[i].fileVerified)
        {
            this.analyseModJar = async function (r)
            {
                return new Promise(async (resolve, reject) =>
                {
                    if(r==null){resolve(); return;}

                    try
                    {
                        // Try Logo
                        try{this.mods[i].icon = await bufferToDataUrl('image/png', Buffer.from(await r["logo.png"]?.arrayBuffer()))}catch(err){}
                        try{this.mods[i].icon = await bufferToDataUrl('image/png', Buffer.from(await r["icon.png"]?.arrayBuffer()))}catch(err){}


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
                jarReader.jar(workingPath, null, true).then(async r =>
                {
                    await this.analyseModJar(r)

                    // Only if the mod lack of data
                    if(this.mods[i].title&&this.mods[i].icon){return}

                    // Online Metadata
                    let cleanFilename = data.filename.replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
                    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
                    .replace(/[_\-]+/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase())
                    .replace(/v?\d+(\.\d+){0,3}/gi, '')
                    .replace(/\b(forge|fabric|quilt|neoforge|liteloader|rift|modloader|loader|mc)\b/gi, '')
                    .replace(/[\+\-\_\(\)\[\]]+/g, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim()
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/\b\w/g, c => c.toUpperCase())
                    .trim();

                    let flavorIndex = 0;
                    switch(this.loader.name)
                    {
                        case 'forge': {flavorIndex=1;break;}
                        case 'fabric': {flavorIndex=4;break;}
                        case 'neoforge': {flavorIndex=6;break;}
                        case 'quilt': {flavorIndex=5;break;}
                    }

                    let curseforgeResult = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&classId=6&filterText=${data.title?data.title:cleanFilename}&pageSize=1&sortField=1&version=${this.version.number}&gameVersionTypeId=${flavorIndex}${this.sinytra?'%2C4':''}`)).json()).data[0]
                    if(curseforgeResult && curseforgeResult?.name)
                    {
                        // console.log("Curseforge comparing", (data.title?data.title:cleanFilename), 'to', curseforgeResult.name, similarity((data.title?data.title:cleanFilename),curseforgeResult.name))

                        if(similarity((data.title?data.title:cleanFilename),curseforgeResult.name) > 0.8)
                        {
                            console.log(curseforgeResult.name, JSON.parse(JSON.stringify(this.mods[i])), curseforgeResult)
                            this.mods[i].title ??= curseforgeResult.name
                            this.mods[i].slug ??= curseforgeResult.slug
                            this.mods[i].icon ??= curseforgeResult.avatarUrl
                            this.mods[i].description ??= curseforgeResult.summary

                            this.mods[i].clientRequired ??= curseforgeResult.isClientCompatible
                            this.mods[i].originURL ??= `https://www.curseforge.com/minecraft/mc-mods/${curseforgeResult.slug}`
                            this.mods[i].source ??= 'curseforge'
                            this.mods[i].originalData ??= curseforgeResult
                            this.mods[i].sinytra ??= data.filename=='sinytra-connector'

                            let categories = []; for(let i of curseforgeResult.categories){categories.push(i.name)}
                            this.mods[i].categories ??= categories
                        }
                    }

                    let modrinthResult = (await (await fetch(`https://api.modrinth.com/v2/search?limit=1&index=relevance&query=${data.title?data.title:cleanFilename}&facets=[[%22project_type:mod%22],[%22categories:${this.loader.name}%22${this.sinytra&&this.loader.name=='forge'?",%22categories:fabric%22":''}],[%22versions:${this.version.number}%22]]`)).json()).hits[0]
                    if(modrinthResult && modrinthResult?.title)
                    {
                        // console.log("Modrinth comparing", (data.title?data.title:cleanFilename), 'to', modrinthResult.title, similarity((data.title?data.title:cleanFilename),modrinthResult.title))

                        if(similarity((data.title?data.title:cleanFilename), modrinthResult.title) > 0.8)
                        {
                            this.mods[i].title ??= modrinthResult.title
                            this.mods[i].slug ??= modrinthResult.slug
                            this.mods[i].description ??= modrinthResult.description
                            this.mods[i].icon ??= modrinthResult.icon_url
                            
                            this.mods[i].clientRequired ??= modrinthResult.client_side=='required'
                            this.mods[i].serverRequired ??= modrinthResult.server_side=='required'
                            this.mods[i].serverSupport ??= modrinthResult.server_side!='unsupported'

                            this.mods[i].originURL ??= `https://www.curseforge.com/minecraft/mc-mods/${modrinthResult.slug}`
                            this.mods[i].source ??= 'curseforge'
                            this.mods[i].originalData ??= modrinthResult
                            this.mods[i].sinytra ??= data.filename=='connector'

                            this.mods[i].categories ??= modrinthResult.categories
                        }
                    }

                    if(og != JSON.stringify(this.mods))
                    {
                        console.log(this.mods[i])
                        this.save();
                        if(needUpdate) { this.onModUpdate(this.mods); }
                    }
                })
            }catch(err){}

            this.mods[i].fileVerified=true;
        }
    
        // Virtual Path
        if(data.virtualPath != undefined && data.virtualPath != "" && this.virtualDirectories.find(d => d.path == data.virtualPath.substring(0, data.virtualPath.lastIndexOf(sep)) && d.name == data.virtualPath.split(sep)[data.virtualPath.split(sep).length-1]) == undefined)
        {
            console.log('Created virtual directory for mod', data)
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
            dependencies: null,
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
                dependencies: null,
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
            else { console.log("rp file not found:",workingPath) }
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
            dependencies: null,
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
                dependencies: null,
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
        if(!fs.existsSync(path.join(config.directories.instances, this.name)))
        {fs.mkdirSync(path.join(config.directories.instances, this.name))}

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


    static async ephemeralInstance(loader, version, mods, listeners =
        {
            log: function(type, content){},
            close: function(code){},
            windowOpen: function(window, windowSource, process){},
            processLaunch: function(process){},
            network: function(m){},
            download: function(p){}
        })
    {
        listeners = Object.assign
        ({
            log: function(type, content){},
            close: function(code){},
            windowOpen: function(window, windowSource, process){},
            processLaunch: function(process){},
            network: function(m){},
            download: function(p){}
        }, listeners)

        console.log("Launching ephemeral instance:", loader, version)

        const p = await fs.mkdtempSync(path.join(os.tmpdir(), 'ephemeral-instances-'));

        if(fs.existsSync(p)){fs.rmSync(p, { recursive: true, force: true });}
        fs.mkdirSync(p, {recursive: true});
    
        // World
        try { fs.cpSync(path.join(rootPath(), ".Test World"), path.join(p, "saves/Test World"), {recursive: true}); }
        catch(err){fs.writeFileSync(path.join("tmp","err.txt"), JSON.stringify(err)); return}

        // Install Mods
        await new Promise((resolve) =>
        {
            let progress = 0
            for(let m of mods)
            {
                if(!m.type){m.type="mods"}
                Download.download(m.url, path.join(p, m.type, m.filename)).then(() =>
                {
                    progress++;
                    listeners.download(progress/mods.length)
                    if(progress==mods.length){resolve()}
                })
            }
        })

        launchMinecraft(p, version, loader, {min: 2, max: 8}, {type: "singleplayer", identifier: "Test World"}, listeners)
        return;

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


        // if(loader.name != "fabric" && loader.name != "quilt")
        // {
        //     const resolvedVersion = await xmcl.Version.parse(p, version.number);
        //     let versionString = version.number;

        //     // Loader Install
        //     if(loader.name == "forge")
        //     {
        //         // versionString = await xmclInstaller.installForgeTask({ version: this.loader.version, mcversion: this.version.number }, this.path).startAndWait
        //         console.log("forge", loader.version, p, {side: 'client'})
        //         versionString = await xmclInstaller.installNeoForgedTask("forge", loader.version, p, {side: 'client'}).startAndWait
        //         ({
        //             onStart: (t) => { console.log("Started forge installation.") },
        //             onUpdate: (t, s) => { console.log("Installing...", (t.progress/t.total)*100) },
        //             onCancelled: (t) => { console.log("Forge installation canceled.") },
        //             onPaused: (t) => { console.log("Forge installation paused.") },
        //             onResumed: (t) => { console.log("Forge installation resumed.") },
        //             onFailed: (t) => { console.error("Forge installation failed.") },
        //             onSucceed: (t) => { console.log("Forge installed successfully.") },
        //         })
        //     }
        //     else if(loader.name == "neoforge")
        //     {
        //         versionString = await xmclInstaller.installNeoForgedTask("neoforge", loader.version, p, {side: 'client'}).startAndWait
        //         ({
        //             onStart: (t) => { console.log("Started neoforge installation.") },
        //             onUpdate: (t, s) => { console.log("Installing...", (t.progress/t.total)*100) },
        //             onCancelled: (t) => { console.log("Neoforge installation canceled.") },
        //             onPaused: (t) => { console.log("Neoforge installation paused.") },
        //             onResumed: (t) => { console.log("Neoforge installation resumed.") },
        //             onFailed: (t) => { console.error("Neoforge installation failed.") },
        //             onSucceed: (t) => { console.log("Neoforge installed successfully.") },
        //         })
        //     }
        //     else if(loader.name == "fabric")
        //     {
        //         console.log("Installing fabric.")
        //         versionString = await xmclInstaller.installFabric({minecraftVersion: version.number, version: loader.version, minecraft: p, side: "client"});
        //         console.log("Fabric installed.")

        //         // console.log("Installing fabric.")
        //         // versionString = await xmclInstaller.installFabricByLoaderArtifact(await xmclInstaller.getFabricLoaderArtifact(this.version.number, this.loader.version), this.path);
        //         // console.log("Fabric installed.")
        //     }
        //     else if(loader.name == "quilt")
        //     {
        //         console.log("Installing quilt.")
        //         versionString = await xmclInstaller.installQuiltVersion({minecraftVersion: version.number, version: loader.version, minecraft: p, side: "client"})
        //         console.log("Quilt installed.")
        //     }

        //     await xmclInstaller.installDependenciesTask(resolvedVersion).startAndWait
        //     ({
        //         onStart: (t) => { console.log("Started dependencies installation.") },
        //         onUpdate: (t, s) => { console.log("Installing...", (t.progress/t.total)*100) },
        //         onCancelled: (t) => { console.log("Dependencies installation canceled.") },
        //         onPaused: (t) => { console.log("Dependencies installation paused.") },
        //         onResumed: (t) => { console.log("Dependencies installation resumed.") },
        //         onFailed: (t) => { console.error("Dependencies installation failed.") },
        //         onSucceed: (t) => { console.log("Dependencies installed successfully.") },
        //     })


        //     // Issues Tracker
        //     for(let issue of (await xmcl.diagnose(resolvedVersion.id, resolvedVersion.minecraftDirectory)).issues)
        //     {
        //         switch(issue.role)
        //         {
        //             case "assetIndex":
        //             {
        //                 console.log("Assets index is "+issue.type+", installing...\n(hint: "+issue.hint+")")
        //                 await xmclInstaller.installAssetsTask(resolvedVersion).startAndWait
        //                 ({
        //                     onStart: (t) => { console.log("Started assets index installation.") },
        //                     onUpdate: (t, s) => { console.log("Installing...", (t.progress/t.total)*100) },
        //                     onCancelled: (t) => { console.log("Assets index installation canceled.") },
        //                     onPaused: (t) => { console.log("Assets index installation paused.") },
        //                     onResumed: (t) => { console.log("Assets index installation resumed.") },
        //                     onFailed: (t) => { console.error("Assets index installation failed.") },
        //                     onSucceed: (t) => { console.log("Assets index installed successfully.") },
        //                 })
                        
        //                 break;
        //             }
        //             case "asset":
        //             {
        //                 console.log("Assets are "+issue.type+", installing...\n(hint: "+issue.hint+")")
        //                 await xmclInstaller.installAssetsTask(resolvedVersion).startAndWait
        //                 ({
        //                     onStart: (t) => { console.log("Started assets installation.") },
        //                     onUpdate: (t, s) => { console.log("Installing...", (t.progress/t.total)*100) },
        //                     onCancelled: (t) => { console.log("Assets installation canceled.") },
        //                     onPaused: (t) => { console.log("Assets installation paused.") },
        //                     onResumed: (t) => { console.log("Assets installation resumed.") },
        //                     onFailed: (t) => { console.error("Assets installation failed.") },
        //                     onSucceed: (t) => { console.log("Assets installed successfully.") },
        //                 })

        //                 break;
        //             }
        //             case "library":
        //             {
        //                 console.log("Libraries are "+issue.type+", installing...\n(hint: "+issue.hint+")")
        //                 await xmclInstaller.installLibrariesTask(resolvedVersion).startAndWait
        //                 ({
        //                     onStart: (t) => { console.log("Started libraries installation.") },
        //                     onUpdate: (t, s) => { console.log("Installing...", (t.progress/t.total)*100) },
        //                     onCancelled: (t) => { console.log("Libraries installation canceled.") },
        //                     onPaused: (t) => { console.log("Libraries installation paused.") },
        //                     onResumed: (t) => { console.log("Libraries installation resumed.") },
        //                     onFailed: (t) => { console.error("Libraries installation failed.") },
        //                     onSucceed: (t) => { console.log("Libraries installed successfully.") },
        //                 })
                        
        //                 break;
        //             }
        //             case "minecraftJar":
        //             {
        //                 console.log("Minecraft jar is "+issue.type+", installing...\n(hint: "+issue.hint+")")
        //                 // await xmclInstaller.install(resolvedVersion)
                        
        //                 break;
        //             }
        //             case "versionJson":
        //             {
        //                 console.log("Version json is "+issue.type+", installing...\n(hint: "+issue.hint+")")
        //                 // await xmclInstaller.install(resolvedVersion)
                        
        //                 break;
        //             }
        //         }
        //     }

        //     console.log("version string:", versionString)

        //     a={
        //         root: p,
        //         version: version,
        //         memory: {max: '4G', min: '2G'},
        //         authorization: await Authenticator.getAuth("tester"),
        //         forge: loader.name=='forge'||loader.name=='neoforge'?path.join(p, 'versions', `${loader.name}-${version.number}-${loader.version}`, `${loader.name}-${version.number}-${loader.version}.jar`):null,
        //         quickPlay: {type: "singleplayer", identifier: "Test World"},
        //         javaPath: javaPath?javaPath:'java',
        //         overrides: {detached: true}
        //     }

        //     let process = await xmcl.launch
        //     ({
        //         gamePath: p,
        //         javaPath: javaPath?javaPath:'java',

        //         version: versionString,
        //         versionName: this.version.number,
        //         versionType: this.version.type,

        //         minMemory: Number(this.memory.min.slice(0, this.memory.min.length-1))*1024,
        //         maxMemory: Number(this.memory.max.slice(0, this.memory.min.length-1))*1024,
                
        //         extraMCArgs: world?["quickPlaySingleplayer", world]:[]
        //     })

        //     let pid = process?.pid;

        //     // Listeners
        //     listeners.processLaunch(process);

        //     let watcher = xmcl.createMinecraftProcessWatcher(process, new EventEmitter())

        //     watcher.on('error', (e) => { console.error("error",e); listeners.log('error', e) });
        //     watcher.on('minecraft-exit', (e) => { console.log("minecraft-exit",e); listeners.log('close', "Exit code: "+e.code); if(e.crashReport){listeners.log('close', e.crashReport)} });

        //     watcher.on("message", (e) => listeners.log('message', e))
        //     watcher.on("error", (e) => listeners.log('error', e))
        //     watcher.on("close", (e) => {listeners.close(e)})

        //     process.on("message", (e) => listeners.log('message', e))
        //     process.on("error", (e) => listeners.log('error', e))
        //     process.on("close", (e) => {listeners.close(e)})

        //     // Window
        //     watcher.on('minecraft-window-ready', async (e) =>
        //     {
        //         console.log("minecraft-window-ready",e);
        //         listeners.log('data', "Window ready");

        //         let sources = await desktopCapturer.getSources({ types: ['window'] });
        
        //         let mcSource = sources.find(source => source.id==pid || source.name.startsWith('Minecraft'));
        //         if(!mcSource) { console.warn("Window not found...") }

        //         listeners.windowOpen(windowManager.getWindows().find(w => w.processId == pid), mcSource, () => {process.kill('SIGINT')});
        //     });
        // }
        // else
        // {
        //     const launcher = new Client();

        //     // Install Loader
        //     version.custom = await installLoader(p, loader, version)

        //     if(version.custom == undefined)
        //     { console.error("Custom Version Failed!"); return; }

        //     // Settings
        //     let options =
        //     {
        //         root: p,
        //         version: version,
        //         memory: {max: '4G', min: '2G'},
        //         authorization: await Authenticator.getAuth("tester"),
        //         forge: loader.name=='forge'||loader.name=='neoforge'?path.join(p, 'versions', `${loader.name}-${version.number}-${loader.version}`, `${loader.name}-${version.number}-${loader.version}.jar`):null,
        //         quickPlay: {type: "singleplayer", identifier: "Test World"},
        //         javaPath: javaPath?javaPath:'java',
        //         overrides: {detached: true}
        //     }
        //     console.log(options)

        //     // Asset Move
        //     launcher.on('debug', (e) =>
        //     {
        //         if(e == '[MCLC]: Downloaded assets')
        //         {
        //             fs.cpSync(path.join(p,'assets'), resourcePath+sep+'assets', {recursive:true})
        //             fs.cpSync(path.join(p,'libraries'), resourcePath+sep+'libraries', {recursive:true})

        //             fs.cpSync(path.join(p,'versions'), path.join(config.directories.resources, 'versions'), {recursive:true})
        //         }
        //     });

        //     // Prepare Events
        //     launcher.on('debug', (e) => console.log('debug', e));
        //     launcher.on('data', (e) => console.log('data', e));
        //     launcher.on('close', (e) => console.log('close', e));
        //     launcher.on('error', (e) => console.log('error', e));
        //     launcher.on('close', (e) => {console.close(e);launcher.removeAllListeners();})


        //     // Launch
        //     let childProcess = await launcher.launch(options);

        //     if(!childProcess) { console.error("Process is null..."); return; }
        // }

        if(loader.name != "fabric" && loader.name != "quilt")
        {
            const versionResourcePath = path.join(config.directories.resources, `${version.number}-${version.type}`)
            if(!fs.existsSync(versionResourcePath)){fs.mkdirSync(versionResourcePath, {recursive:true})}

            let resolvedVersion = null;

            // Minecraft Version Files
            try
            {
                resolvedVersion = await xmcl.Version.parse(p, version.number)
            }
            catch
            {
                if(fs.existsSync(path.join(versionResourcePath, "versions", version.number)))
                {
                    if(!fs.existsSync(path.join(p, "versions")))
                    { fs.mkdirSync(path.join(p, "versions")) }

                    fs.cpSync(path.join(versionResourcePath, "versions", version.number), path.join(p, "versions", version.number), {force: true, recursive: true})
                }

                resolvedVersion = await xmclInstaller.installVersionTask((await xmclInstaller.getVersionList()).versions.find(v=>v.id==version.number&&v.type==version.type), p).startAndWait
                ({
                    onStart: (t) => { console.log("Started Minecraft installation.") },
                    onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Minecraft Installation"}) },
                    onCancelled: (t) => { console.log("Minecraft installation canceled.") },
                    onPaused: (t) => { console.log("Minecraft installation paused.") },
                    onResumed: (t) => { console.log("Minecraft installation resumed.") },
                    onFailed: (t, err) => { console.error("Minecraft installation failed.", err) },
                    onSucceed: (t) => { console.log("Minecraft installed successfully."); listeners.log('installation', {progress: 100, type: "Minecraft Installation"}) },
                })

                fs.cpSync(path.join(p, "versions", version.number), path.join(versionResourcePath, "versions", version.number), {force: true, recursive: true})
            }
            let versionString = version.number;

            // Loader Install
            if(!fs.existsSync(path.join(p, "versions", `${version.number}-${loader.name}-${loader.version}`)) && loader.name != "vanilla")
            {
                if(fs.existsSync(path.join(config.directories.resources, `${version.number}-${loader.name}-${loader.version}`)))
                {
                    versionString = `${version.number}-${loader.name}-${loader.version}`
                    fs.cpSync(path.join(config.directories.resources, `${version.number}-${loader.name}-${loader.version}`), path.join(p, "versions", `${version.number}-${loader.name}-${loader.version}`), {force: true, recursive: true})
                }
                else
                {
                    if(loader.name == "forge")
                    {
                        try
                        {
                            versionString = await xmclInstaller.installNeoForgedTask("forge", loader.version, p, {side: 'client'}).startAndWait
                            ({
                                onStart: (t) => { console.log("Started forge installation.") },
                                onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Forge Installation"}) },
                                onCancelled: (t) => { console.log("Forge installation canceled.") },
                                onPaused: (t) => { console.log("Forge installation paused.") },
                                onResumed: (t) => { console.log("Forge installation resumed.") },
                                onFailed: (t) => { console.error("Forge installation failed.") },
                                onSucceed: (t) => { console.log("Forge installed successfully."); listeners.log('installation', {progress: 100, type: "Forge Installation"}) },
                            })

                        }
                        catch
                        {
                            versionString = await xmclInstaller.installForgeTask({ version: loader.version, mcversion: version.number }, p).startAndWait
                            ({
                                onStart: (t) => { console.log("Started forge installation.") },
                                onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Forge Installation"}) },
                                onCancelled: (t) => { console.log("Forge installation canceled.") },
                                onPaused: (t) => { console.log("Forge installation paused.") },
                                onResumed: (t) => { console.log("Forge installation resumed.") },
                                onFailed: (t) => { console.error("Forge installation failed.") },
                                onSucceed: (t) => { console.log("Forge installed successfully."); listeners.log('installation', {progress: 100, type: "Forge Installation"}) },
                            })
                        }
                    }
                    else if(loader.name == "neoforge")
                    {
                        versionString = await xmclInstaller.installNeoForgedTask("neoforge", loader.version, p, {side: 'client'}).startAndWait
                        ({
                            onStart: (t) => { console.log("Started neoforge installation.") },
                            onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Neoforge Installation"}) },
                            onCancelled: (t) => { console.log("Neoforge installation canceled.") },
                            onPaused: (t) => { console.log("Neoforge installation paused.") },
                            onResumed: (t) => { console.log("Neoforge installation resumed.") },
                            onFailed: (t) => { console.error("Neoforge installation failed.") },
                            onSucceed: (t) => { console.log("Neoforge installed successfully."); listeners.log('installation', {progress: 100, type: "Neoforge Installation"}) },
                        })
                    }
                    else if(loader.name == "fabric")
                    {
                        console.log("Installing fabric.")
                        versionString = await xmclInstaller.installFabric({minecraftVersion: version.number, version: loader.version, minecraft: p, side: "client"});
                        console.log("Fabric installed.")

                        // console.log("Installing fabric.")
                        // versionString = await xmclInstaller.installFabricByLoaderArtifact(await xmclInstaller.getFabricLoaderArtifact(this.version.number, this.loader.version), p);
                        // console.log("Fabric installed.")
                    }
                    else if(this.loader.name == "quilt")
                    {
                        console.log("Installing quilt.")
                        versionString = await xmclInstaller.installQuiltVersion({minecraftVersion: version.number, version: loader.version, minecraft: p, side: "client"})
                        console.log("Quilt installed.")
                    }

                    try
                    {
                        await xmclInstaller.installDependenciesTask(resolvedVersion).startAndWait
                        ({
                            onStart: (t) => { console.log("Started dependencies installation.") },
                            onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Dependencies Installation"}) },
                            onCancelled: (t) => { console.log("Dependencies installation canceled.") },
                            onPaused: (t) => { console.log("Dependencies installation paused.") },
                            onResumed: (t) => { console.log("Dependencies installation resumed.") },
                            onFailed: (t, err) => { console.error("Dependencies installation failed.", err) },
                            onSucceed: (t, r) => { console.log("Dependencies installed successfully.", r); listeners.log('installation', {progress: 100, type: "Dependencies Installation"}) },
                        })
                    }
                    catch(err)
                    {
                        console.warn("Dependencies installation failed:", err)
                    }

                    fs.cpSync(path.join(p, "versions", `${version.number}-${loader.name}-${loader.version}`), path.join(config.directories.resources, `${version.number}-${loader.name}-${loader.version}`), {force: true, recursive: true})
                }

            }
            else if(loader.name != "vanilla")
            {
                versionString = `${version.number}-${loader.name}-${loader.version}`
            }

            // Issues Tracker
            let issues = (await xmcl.diagnose(resolvedVersion.id, resolvedVersion.minecraftDirectory)).issues.filter(i=>!(i.role=="minecraftJar"&&i.type=="corrupted"))
            while(issues.length > 0)
            {
                switch(issues[0].role)
                {
                    case "assetIndex":
                    {
                        console.log("Assets index is "+issues[0].type+", installing...\n(hint: "+issues[0].hint+")")

                        if(fs.existsSync(path.join(versionResourcePath, "assets")))
                        {
                            if(!fs.existsSync(path.join(p, "assets")))
                            { fs.mkdirSync(path.join(p, "assets")) }

                            fs.cpSync(path.join(versionResourcePath, "assets"), path.join(p, "assets"), {force: true, recursive: true})
                        }

                        await xmclInstaller.installAssetsTask(resolvedVersion).startAndWait
                        ({
                            onStart: (t) => { console.log("Started assets index installation.") },
                            onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Assets Index Installation"}) },
                            onCancelled: (t) => { console.log("Assets index installation canceled.") },
                            onPaused: (t) => { console.log("Assets index installation paused.") },
                            onResumed: (t) => { console.log("Assets index installation resumed.") },
                            onFailed: (t, err) => { console.error("Assets index installation failed.", err) },
                            onSucceed: (t, r) => { console.log("Assets index installed successfully.", r); listeners.log('installation', {progress: 100, type: "Assets Index Installation"}) },
                        })
                        
                        fs.cpSync(path.join(p, "assets"), path.join(versionResourcePath, "assets"), {force: true, recursive: true})

                        break;
                    }
                    case "asset":
                    {
                        console.log("Assets are "+issues[0].type+", installing...\n(hint: "+issues[0].hint+")")

                        if(fs.existsSync(path.join(versionResourcePath, "assets")))
                        {
                            if(!fs.existsSync(path.join(p, "assets")))
                            { fs.mkdirSync(path.join(p, "assets")) }

                            fs.cpSync(path.join(versionResourcePath, "assets"), path.join(p, "assets"), {force: true, recursive: true})
                        }

                        await xmclInstaller.installAssetsTask(resolvedVersion).startAndWait
                        ({
                            onStart: (t) => { console.log("Started assets installation.") },
                            onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Assets Installation"}) },
                            onCancelled: (t) => { console.log("Assets installation canceled.") },
                            onPaused: (t) => { console.log("Assets installation paused.") },
                            onResumed: (t) => { console.log("Assets installation resumed.") },
                            onFailed: (t, err) => { console.error("Assets installation failed.", err) },
                            onSucceed: (t, r) => { console.log("Assets installed successfully.", r); listeners.log('installation', {progress: 100, type: "Assets Installation"}) },
                        })

                        fs.cpSync(path.join(p, "assets"), path.join(versionResourcePath, "assets"), {force: true, recursive: true})

                        break;
                    }
                    case "library":
                    {
                        console.log("Libraries are "+issues[0].type+", installing...\n(hint: "+issues[0].hint+")")

                        if(fs.existsSync(path.join(versionResourcePath, "libraries")))
                        {
                            if(!fs.existsSync(path.join(p, "libraries")))
                            { fs.mkdirSync(path.join(p, "libraries")) }

                            fs.cpSync(path.join(versionResourcePath, "libraries"), path.join(p, "libraries"), {force: true, recursive: true})
                        }

                        await xmclInstaller.installLibrariesTask(resolvedVersion).startAndWait
                        ({
                            onStart: (t) => { console.log("Started libraries installation.") },
                            onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Libraries Installation"}) },
                            onCancelled: (t) => { console.log("Libraries installation canceled.") },
                            onPaused: (t) => { console.log("Libraries installation paused.") },
                            onResumed: (t) => { console.log("Libraries installation resumed.") },
                            onFailed: (t, err) => { console.error("Libraries installation failed.", err) },
                            onSucceed: (t, r) => { console.log("Libraries installed successfully.", r); listeners.log('installation', {progress: 100, type: "Libraries Installation"}) },
                        })

                        fs.cpSync(path.join(p, "libraries"), path.join(versionResourcePath, "libraries"), {force: true, recursive: true})
                        
                        break;
                    }
                    case "minecraftJar":
                    {
                        if(issues[0].type == "missing")
                        {
                            console.log("Minecraft jar is "+issues[0].type+".\n(hint: "+issues[0].hint+")")

                            if(fs.existsSync(path.join(versionResourcePath, "versions", version.number)))
                            {
                                if(!fs.existsSync(path.join(p, "versions")))
                                { fs.mkdirSync(path.join(p, "versions")) }

                                fs.cpSync(path.join(versionResourcePath, "versions", version.number), path.join(p, "versions", version.number), {force: true, recursive: true})
                            }

                            resolvedVersion = await xmclInstaller.installVersionTask((await xmclInstaller.getVersionList()).versions.find(v=>v.id==version.number&&v.type==version.type), p).startAndWait
                            ({
                                onStart: (t) => { console.log("Started Minecraft installation.") },
                                onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Minecraft Installation"}) },
                                onCancelled: (t) => { console.log("Minecraft installation canceled.") },
                                onPaused: (t) => { console.log("Minecraft installation paused.") },
                                onResumed: (t) => { console.log("Minecraft installation resumed.") },
                                onFailed: (t, err) => { console.error("Minecraft installation failed.", err) },
                                onSucceed: (t) => { console.log("Minecraft installed successfully."); listeners.log('installation', {progress: 100, type: "Minecraft Installation"}) },
                            })

                            fs.cpSync(path.join(p, "versions", version.number), path.join(versionResourcePath, "versions", version.number), {force: true, recursive: true})
                        }
                        else if(issues[0].type == "corrupted")
                        {
                            console.log("Minecraft jar modified...")
                        }
                        
                        break;
                    }
                    case "versionJson":
                    {
                        console.log("Version json is "+issues[0].type+", installing...\n(hint: "+issues[0].hint+")")
                        // await xmclInstaller.install(resolvedVersion)
                        
                        break;
                    }
                    default:
                    {
                        console.warn("Unknown issue:", issues[0])
                    }
                }

                issues = (await xmcl.diagnose(resolvedVersion.id, resolvedVersion.minecraftDirectory)).issues.filter(i=>!(i.role=="minecraftJar"&&i.type=="corrupted"))
            }

            console.log("version string:", versionString)

            let process = await xmcl.launch
            ({
                gamePath: p,
                javaPath: javaPath?javaPath:'java',

                version: versionString,
                versionName: version.number,
                versionType: version.type,

                minMemory: 6*1024,
                maxMemory: 12*1024,
                
                extraMCArgs: ["--quickPlaySingleplayer", "Test World", "--quickPlaySingleplayer \"Test World\""],
                prechecks: []
            })

            let pid = process?.pid;

            // Listener
            const xmlParser = new XMLParser
            ({
                ignoreAttributes: false,
                attributeNamePrefix: "@_",
                removeNSPrefix: true,
                cdataPropName: "__cdata",
            });

            process.stdout.on('data', (buffer) =>
            {
                let d = xmlParser.parse(buffer.toString("utf8"));

                try
                {
                    if(d.Event)
                    {
                        d = d.Event;
                        if(Array.isArray(d))
                        {
                            for(let subD of d)
                            {
                                listeners.log('object-data',
                                {
                                    level: subD['@_level'],
                                    thread: subD['@_thread'],
                                    logger: subD['@_logger'],
                                    time: new Date(subD['@_timestamp']),
                                    text: subD['Message']['__cdata'],
                                })
                            }
                        }
                        else
                        {
                            if(!d['Message']){console.log(d)}
                            listeners.log('object-data',
                            {
                                level: d['@_level'],
                                thread: d['@_thread'],
                                logger: d['@_logger'],
                                time: new Date(d['@_timestamp']),
                                text: d['Message']['__cdata'],
                            })
                        }
                    }
                    else
                    {
                        let dataBlocks = buffer.toString("utf8").split(': ')[0].match(/\[(.*?)\]/g);
                        if(dataBlocks)
                        {
                            let text = buffer.toString("utf8").split(': ')
                            text.shift();
                            text = text.join(': ')

                            listeners.log('object-data',
                            {
                                thread: dataBlocks[1].split("/")[0].slice(1),
                                level: dataBlocks[1].split("/")[1].slice(0, dataBlocks[1].split("/")[1].length-1),
                                logger: dataBlocks[2].split("/")[0].slice(1),
                                time: new Date(),
                                text
                            })
                        }
                        else
                        {
                            listeners.log('data', buffer.toString("utf8"));
                        }
                    }
                }
                catch(err)
                {
                    console.log(err, d)
                }
            })

            listeners.processLaunch(process);

            let watcher = xmcl.createMinecraftProcessWatcher(process, new EventEmitter())

            watcher.on('error', (e) => { console.error("error",e); listeners.log('error', e) });
            watcher.on('minecraft-exit', (e) => { console.log("minecraft-exit",e); listeners.log('close', "Exit code: "+e.code); if(e.crashReport){listeners.log('close', e.crashReport)} });
            process.on("close", (e) => {listeners.close(e)})

            // Window
            watcher.on('minecraft-window-ready', async (e) =>
            {
                let sources = await desktopCapturer.getSources({ types: ['window'] });
        
                let mcSource = sources.find(source => source.id==pid || source.name.startsWith('Minecraft'));
                if(!mcSource) { console.warn("Window not found...") }

                listeners.windowOpen(windowManager.getWindows().find(w => w.processId == pid), mcSource, process);
            });
        }
        else
        {
            const launcher = new Client();

            // Install Loader
            version.custom = await installLoader(p, loader, version)

            if(version.custom == undefined)
            { console.error("Custom Version Failed!"); return; }

            // Settings
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
            console.log(options)

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
            launcher.on('debug', (e) => console.log('debug', e));
            launcher.on('data', (e) => console.log('data', e));
            launcher.on('close', (e) => console.log('close', e));
            launcher.on('error', (e) => console.log('error', e));
            launcher.on('close', (e) => {console.close(e);launcher.removeAllListeners();})


            // Launch
            let childProcess = await launcher.launch(options);

            if(!childProcess) { console.error("Process is null..."); return; }
        }
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

        let meta = {name: metadata.title};
        meta.icon = metadata?.icon;

        // Modrinth
        if(url.hostname == "modrinth.com")
        {
            // Find Modpack Version
            const version = (await (await fetch('https://api.modrinth.com/v2/project'+'/'+url.pathname.split('/')[url.pathname.split('/').length-1]+'/'+'version')).json())
            .sort((a,b) => { return new Date(b.date_published) - new Date(a.date_published); })[0];
            let file = version.files.filter(f=>f.primary)[0];

            // Metadata
            let meta = (await (await fetch('https://api.modrinth.com/v2/project'+'/'+url.pathname.split('/')[url.pathname.split('/').length-1])).json());
            meta.description = meta.description;
            meta.version = {}
            meta.version.number = version.game_versions[0];
            meta.loader = {}
            meta.loader.name = version.loaders[0]!=undefined?version.loaders[0]:'vanilla';
            // Set last loader version
            switch(meta.loader.name)
            {
                case 'forge':
                {
                    const data = new XMLParser().parse(await (await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')).text());
                    meta.loader.version = data.metadata.versioning.versions.version.filter(e => e.split('-')[0] == meta.version.number.toString())[0].split('-')[1];
                    break;
                }
                case 'neoforge':
                {
                    const data = new XMLParser().parse(await (await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')).text());
                    meta.loader.version = data.metadata.versioning.versions.version.filter(e => '1.'+e.split('-')[0].substring(0, e.split('-')[0].lastIndexOf('.')) == meta.version.number.toString()).reverse()[0];
                    break;
                }
                case 'fabric':
                {
                    const data = await (await fetch('https://meta.fabricmc.net/v2/versions/loader'+'/'+meta.version.number.toString())).json();
                    meta.loader.version = data[0].loader.version;
                    break;
                }
                default: { break; }
            }

            let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "modrinth-instance-download"));
            await Download.download(decodeURI(file.url), path.join(tmpDir, 'original.zip'))

            return new Promise(async (resolve) =>
            {
                await modrinthDownload(path.join(tmpDir, 'original.zip'), meta, (i) => { ready(i.name); resolve(i)})
                fs.rmdirSync(tmpDir);
            })
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
            meta.description = meta.summary;
            meta.version = {}
            meta.version.number = version.gameVersions[0];
            meta.loader = {}
            meta.loader.name = version.gameVersions[1].toLowerCase();
            // Set last loader version
            switch(meta.loader.name)
            {
                case 'forge':
                {
                    const data = new XMLParser().parse(await (await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')).text());
                    meta.loader.version = data.metadata.versioning.versions.version.filter(e => e.split('-')[0] == meta.version.number.toString())[0].split('-')[1];
                    break;
                }
                case 'neoforge':
                {
                    const data = new XMLParser().parse(await (await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')).text());
                    meta.loader.version = data.metadata.versioning.versions.version.filter(e => '1.'+e.split('-')[0].substring(0, e.split('-')[0].lastIndexOf('.')) == meta.version.number.toString()).reverse()[0];
                    break;
                }
                case 'fabric':
                {
                    const data = await (await fetch('https://meta.fabricmc.net/v2/versions/loader'+'/'+meta.version.number.toString())).json();
                    meta.loader.version = data[0].loader.version;
                    break;
                }
                default: { break; }
            }

            // Download zip
            let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curseforge-instance-download"));
            await Download.download(decodeURI(`https://www.curseforge.com/api/v1/mods/${id}/files/${version.id}/download`), path.join(tmpDir, 'original.zip'))

            return new Promise(async (resolve) =>
            {
                await curseforgeDownload(path.join(tmpDir, 'original.zip'), meta, (i) => { console.log(i, i.name); ready(i.name); resolve(i) })
                fs.rmdirSync(tmpDir);
            })
        }
    }

    static curseforgeDownload=curseforgeDownload
    static modrinthDownload=modrinthDownload
}

// LAUNCH
async function launchMinecraft(p, version, loader, memory, world, listeners =
    {
        log: function(type, content){},
        close: function(code){},
        windowOpen: function(window, windowSource, process){},
        processLaunch: function(process){},
        network: function(m){}
    })
{
    if(!fs.existsSync(p)){fs.mkdirSync(p, {recursive: true});}

    if(version.type==null){version.type = 'release'}

    // Java Version
    let javaVersion = (await (await fetch((await (await fetch("https://piston-meta.mojang.com/mc/game/version_manifest.json")).json()).versions.find(v=>v.id==version.number).url)).json()).javaVersion.majorVersion
    let javaPath = findJavaExecutable(javaVersion);

    if(!javaPath)
    {
        await downloadJava(javaVersion)
        javaPath = findJavaExecutable(javaVersion);
    }

    // XMLC Launch
    if(loader.name != "fabric" && loader.name != "quilt")
    {
        const versionResourcePath = path.join(config.directories.resources, `${version.number}-${version.type}`)
        if(!fs.existsSync(versionResourcePath)){fs.mkdirSync(versionResourcePath, {recursive:true})}

        let resolvedVersion = null;

        // Minecraft Version Files
        if(fs.existsSync(path.join(versionResourcePath, "versions", version.number)))
        {
            if(!fs.existsSync(path.join(p, "versions")))
            { fs.mkdirSync(path.join(p, "versions")) }

            fs.cpSync(path.join(versionResourcePath, "versions", version.number), path.join(p, "versions", version.number), {force: true, recursive: true})
        }

        try
        {
            resolvedVersion = await xmcl.Version.parse(p, version.number)
        }
        catch
        {
            const cmxlVersion = (await xmclInstaller.getVersionList()).versions.find(v=>v.id==version.number&&v.type==version.type);
            resolvedVersion = await xmclInstaller.installVersionTask(cmxlVersion, p).startAndWait
            ({
                onStart: (t) => { console.log("Started Minecraft installation.") },
                onUpdate: (t, s) => { listeners?.log('installation', {progress: (t.progress/t.total)*100, type: "Minecraft Installation"}) },
                onCancelled: (t) => { console.log("Minecraft installation canceled.") },
                onPaused: (t) => { console.log("Minecraft installation paused.") },
                onResumed: (t) => { console.log("Minecraft installation resumed.") },
                onFailed: (t, err) => { console.error("Minecraft installation failed.", err) },
                onSucceed: (t) => { console.log("Minecraft installed successfully."); listeners?.log('installation', {progress: 100, type: "Minecraft Installation"}) },
            })

            fs.cpSync(path.join(p, "versions", version.number), path.join(versionResourcePath, "versions", version.number), {force: true, recursive: true})
        }
        let versionString = version.number;

        // Loader Install
        if(!fs.existsSync(path.join(p, "versions", `${version.number}-${loader.name}-${loader.version}`)) && loader.name != "vanilla")
        {
            if(fs.existsSync(path.join(config.directories.resources, `${version.number}-${loader.name}-${loader.version}`)))
            {
                versionString = `${version.number}-${loader.name}-${loader.version}`
                fs.cpSync(path.join(config.directories.resources, `${version.number}-${loader.name}-${loader.version}`, "versions"), path.join(p, "versions", `${version.number}-${loader.name}-${loader.version}`), {force: true, recursive: true})
                fs.cpSync(path.join(config.directories.resources, `${version.number}-${loader.name}-${loader.version}`, "libraries"), path.join(p, "libraries"), {force: true, recursive: true})
                fs.cpSync(path.join(config.directories.resources, `${version.number}-${loader.name}-${loader.version}`, "assets"), path.join(p, "assets"), {force: true, recursive: true})
            }
            else
            {
                if(loader.name == "forge")
                {
                    try
                    {
                        versionString = await xmclInstaller.installNeoForgedTask("forge", loader.version, p, {side: 'client'}).startAndWait
                        ({
                            onStart: (t) => { console.log("Started forge installation.") },
                            onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Forge Installation"}) },
                            onCancelled: (t) => { console.log("Forge installation canceled.") },
                            onPaused: (t) => { console.log("Forge installation paused.") },
                            onResumed: (t) => { console.log("Forge installation resumed.") },
                            onFailed: (t) => { console.error("Forge installation failed.") },
                            onSucceed: (t) => { console.log("Forge installed successfully."); listeners.log('installation', {progress: 100, type: "Forge Installation"}) },
                        })

                    }
                    catch
                    {
                        versionString = await xmclInstaller.installForgeTask({ version: loader.version, mcversion: version.number }, p).startAndWait
                        ({
                            onStart: (t) => { console.log("Started forge installation.") },
                            onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Forge Installation"}) },
                            onCancelled: (t) => { console.log("Forge installation canceled.") },
                            onPaused: (t) => { console.log("Forge installation paused.") },
                            onResumed: (t) => { console.log("Forge installation resumed.") },
                            onFailed: (t) => { console.error("Forge installation failed.") },
                            onSucceed: (t) => { console.log("Forge installed successfully."); listeners.log('installation', {progress: 100, type: "Forge Installation"}) },
                        })
                    }
                }
                else if(loader.name == "neoforge")
                {
                    versionString = await xmclInstaller.installNeoForgedTask("neoforge", loader.version, p, {side: 'client'}).startAndWait
                    ({
                        onStart: (t) => { console.log("Started neoforge installation.") },
                        onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Neoforge Installation"}) },
                        onCancelled: (t) => { console.log("Neoforge installation canceled.") },
                        onPaused: (t) => { console.log("Neoforge installation paused.") },
                        onResumed: (t) => { console.log("Neoforge installation resumed.") },
                        onFailed: (t) => { console.error("Neoforge installation failed.") },
                        onSucceed: (t) => { console.log("Neoforge installed successfully."); listeners.log('installation', {progress: 100, type: "Neoforge Installation"}) },
                    })
                }
                else if(loader.name == "fabric")
                {
                    console.log("Installing fabric.")
                    versionString = await xmclInstaller.installFabric({minecraftVersion: version.number, version: loader.version, minecraft: p, side: "client"});
                    console.log("Fabric installed.")

                    // console.log("Installing fabric.")
                    // versionString = await xmclInstaller.installFabricByLoaderArtifact(await xmclInstaller.getFabricLoaderArtifact(this.version.number, this.loader.version), p);
                    // console.log("Fabric installed.")
                }
                else if(this.loader.name == "quilt")
                {
                    console.log("Installing quilt.")
                    versionString = await xmclInstaller.installQuiltVersion({minecraftVersion: version.number, version: loader.version, minecraft: p, side: "client"})
                    console.log("Quilt installed.")
                }

                try
                {
                    await xmclInstaller.installDependenciesTask(resolvedVersion).startAndWait
                    ({
                        onStart: (t) => { console.log("Started dependencies installation.") },
                        onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Dependencies Installation"}) },
                        onCancelled: (t) => { console.log("Dependencies installation canceled.") },
                        onPaused: (t) => { console.log("Dependencies installation paused.") },
                        onResumed: (t) => { console.log("Dependencies installation resumed.") },
                        onFailed: (t, err) => { console.error("Dependencies installation failed.", err) },
                        onSucceed: (t, r) => { console.log("Dependencies installed successfully.", r); listeners.log('installation', {progress: 100, type: "Dependencies Installation"}) },
                    })
                }
                catch(err)
                {
                    console.warn("Dependencies installation failed:", err)
                }

                fs.cpSync(path.join(p, "versions", `${version.number}-${loader.name}-${loader.version}`), path.join(config.directories.resources, `${version.number}-${loader.name}-${loader.version}`, "versions"), {force: true, recursive: true})
                fs.cpSync(path.join(p, "libraries"), path.join(config.directories.resources, `${version.number}-${loader.name}-${loader.version}`, "libraries"), {force: true, recursive: true})
                fs.cpSync(path.join(p, "assets"), path.join(config.directories.resources, `${version.number}-${loader.name}-${loader.version}`, "assets"), {force: true, recursive: true})
            }

        }
        else if(loader.name != "vanilla")
        {
            versionString = `${version.number}-${loader.name}-${loader.version}`
        }

        // Issues Tracker
        console.log("Diagnosing...")
        let issues = (await xmcl.diagnose(resolvedVersion.id, resolvedVersion.minecraftDirectory)).issues.filter(i=>!(i.role=="minecraftJar"&&i.type=="corrupted"))
        while(issues.length > 0)
        {
            try
            {
                switch(issues[0].role)
                {
                    case "assetIndex":
                    {
                        console.log("Assets index is "+issues[0].type+", installing...\n(hint: "+issues[0].hint+")")

                        if(fs.existsSync(path.join(versionResourcePath, "assets")))
                        {
                            if(!fs.existsSync(path.join(p, "assets")))
                            { fs.mkdirSync(path.join(p, "assets")) }

                            fs.cpSync(path.join(versionResourcePath, "assets"), path.join(p, "assets"), {force: true, recursive: true})
                        }

                        await xmclInstaller.installAssetsTask(resolvedVersion).startAndWait
                        ({
                            onStart: (t) => { console.log("Started assets index installation.") },
                            onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Assets Index Installation"}) },
                            onCancelled: (t) => { console.log("Assets index installation canceled.") },
                            onPaused: (t) => { console.log("Assets index installation paused.") },
                            onResumed: (t) => { console.log("Assets index installation resumed.") },
                            onFailed: (t, err) => { console.error("Assets index installation failed.", err) },
                            onSucceed: (t, r) => { console.log("Assets index installed successfully.", r); listeners.log('installation', {progress: 100, type: "Assets Index Installation"}) },
                        })
                        
                        fs.cpSync(path.join(p, "assets"), path.join(versionResourcePath, "assets"), {force: true, recursive: true})

                        break;
                    }
                    case "asset":
                    {
                        console.log("Assets are "+issues[0].type+", installing...\n(hint: "+issues[0].hint+")")

                        if(fs.existsSync(path.join(versionResourcePath, "assets")))
                        {
                            if(!fs.existsSync(path.join(p, "assets")))
                            { fs.mkdirSync(path.join(p, "assets")) }

                            fs.cpSync(path.join(versionResourcePath, "assets"), path.join(p, "assets"), {force: true, recursive: true})
                        }

                        await xmclInstaller.installAssetsTask(resolvedVersion).startAndWait
                        ({
                            onStart: (t) => { console.log("Started assets installation.") },
                            onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Assets Installation"}) },
                            onCancelled: (t) => { console.log("Assets installation canceled.") },
                            onPaused: (t) => { console.log("Assets installation paused.") },
                            onResumed: (t) => { console.log("Assets installation resumed.") },
                            onFailed: (t, err) => { console.error("Assets installation failed.", err) },
                            onSucceed: (t, r) => { console.log("Assets installed successfully.", r); listeners.log('installation', {progress: 100, type: "Assets Installation"}) },
                        })

                        fs.cpSync(path.join(p, "assets"), path.join(versionResourcePath, "assets"), {force: true, recursive: true})

                        break;
                    }
                    case "library":
                    {
                        console.log("Libraries are "+issues[0].type+", installing...\n(hint: "+issues[0].hint+")")

                        if(fs.existsSync(path.join(versionResourcePath, "libraries")))
                        {
                            if(!fs.existsSync(path.join(p, "libraries")))
                            { fs.mkdirSync(path.join(p, "libraries")) }

                            fs.cpSync(path.join(versionResourcePath, "libraries"), path.join(p, "libraries"), {recursive: true})
                        }
                        if(fs.existsSync(path.join(config.directories.resources, `${version.number}-${loader.name}-${loader.version}`, "libraries")))
                        {
                            if(!fs.existsSync(path.join(p, "libraries")))
                            { fs.mkdirSync(path.join(p, "libraries")) }

                            fs.cpSync(path.join(config.directories.resources, `${version.number}-${loader.name}-${loader.version}`, "libraries"), path.join(p, "libraries"), {recursive: true})
                        }

                        if((await xmcl.diagnose(resolvedVersion.id, resolvedVersion.minecraftDirectory)).issues.filter(i=>!(i.role=="minecraftJar"&&i.type=="corrupted"))[0].role!=issues[0].role)
                        {break;}
                        
                        await xmclInstaller.installLibrariesTask(resolvedVersion).startAndWait
                        ({
                            onStart: (t) => { console.log("Started libraries installation.") },
                            onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Libraries Installation"}) },
                            onCancelled: (t) => { console.log("Libraries installation canceled.") },
                            onPaused: (t) => { console.log("Libraries installation paused.") },
                            onResumed: (t) => { console.log("Libraries installation resumed.") },
                            onFailed: (t, err) => { console.error("Libraries installation failed.", err) },
                            onSucceed: (t, r) => { console.log("Libraries installed successfully.", r); listeners.log('installation', {progress: 100, type: "Libraries Installation"}) },
                        })

                        fs.cpSync(path.join(p, "libraries"), path.join(versionResourcePath, "libraries"), {force: true, recursive: true})
                        
                        break;
                    }
                    case "minecraftJar":
                    {
                        if(issues[0].type == "missing")
                        {
                            console.log("Minecraft jar is "+issues[0].type+".\n(hint: "+issues[0].hint+")")

                            if(fs.existsSync(path.join(versionResourcePath, "versions", version.number)))
                            {
                                if(!fs.existsSync(path.join(p, "versions")))
                                { fs.mkdirSync(path.join(p, "versions")) }

                                fs.cpSync(path.join(versionResourcePath, "versions", version.number), path.join(p, "versions", version.number), {force: true, recursive: true})
                            }

                            resolvedVersion = await xmclInstaller.installVersionTask((await xmclInstaller.getVersionList()).versions.find(v=>v.id==version.number&&v.type==version.type), p).startAndWait
                            ({
                                onStart: (t) => { console.log("Started Minecraft installation.") },
                                onUpdate: (t, s) => { listeners.log('installation', {progress: (t.progress/t.total)*100, type: "Minecraft Installation"}) },
                                onCancelled: (t) => { console.log("Minecraft installation canceled.") },
                                onPaused: (t) => { console.log("Minecraft installation paused.") },
                                onResumed: (t) => { console.log("Minecraft installation resumed.") },
                                onFailed: (t, err) => { console.error("Minecraft installation failed.", err) },
                                onSucceed: (t) => { console.log("Minecraft installed successfully."); listeners.log('installation', {progress: 100, type: "Minecraft Installation"}) },
                            })

                            fs.cpSync(path.join(p, "versions", version.number), path.join(versionResourcePath, "versions", version.number), {force: true, recursive: true})
                        }
                        else if(issues[0].type == "corrupted")
                        {
                            console.log("Minecraft jar modified...")
                        }
                        
                        break;
                    }
                    case "versionJson":
                    {
                        console.log("Version json is "+issues[0].type+", installing...\n(hint: "+issues[0].hint+")")
                        // await xmclInstaller.install(resolvedVersion)
                        
                        break;
                    }
                    default:
                    {
                        console.warn("Unknown issue:", issues[0])
                    }
                }                
            }
            catch(err){console.warn(err);}

            issues = (await xmcl.diagnose(resolvedVersion.id, resolvedVersion.minecraftDirectory)).issues.filter(i=>!(i.role=="minecraftJar"&&i.type=="corrupted"))
        }

        console.log("version string:", versionString)

        let process = await xmcl.launch
        ({
            gamePath: p,
            javaPath: javaPath?javaPath:'java',

            version: versionString,
            versionName: version.number,
            versionType: version.type,

            minMemory: memory.min*1024,
            maxMemory: memory.max*1024,
            
            extraMCArgs: world?[world.type=="singleplayer"?"--quickPlaySingleplayer":"--quickPlayMultiplayer", world.identifier, `${world.type=="singleplayer"?"--quickPlaySingleplayer":"--quickPlayMultiplayer"} ${world.identifier}`]:[],
            prechecks: []
        })

        let pid = process?.pid;

        // Listener
        const xmlParser = new XMLParser
        ({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            removeNSPrefix: true,
            cdataPropName: "__cdata",
        });

        process.stdout.on('data', (buffer) =>
        {
            let d = xmlParser.parse(buffer.toString("utf8"));

            try
            {
                if(d.Event)
                {
                    d = d.Event;
                    if(Array.isArray(d))
                    {
                        for(let subD of d)
                        {
                            listeners.log('object-data',
                            {
                                level: subD['@_level'],
                                thread: subD['@_thread'],
                                logger: subD['@_logger'],
                                time: new Date(subD['@_timestamp']),
                                text: subD['Message']['__cdata'],
                            })
                        }
                    }
                    else
                    {
                        if(!d['Message']){console.log(d)}
                        listeners.log('object-data',
                        {
                            level: d['@_level'],
                            thread: d['@_thread'],
                            logger: d['@_logger'],
                            time: new Date(d['@_timestamp']),
                            text: d['Message']['__cdata'],
                        })
                    }
                }
                else
                {
                    let dataBlocks = buffer.toString("utf8").split(': ')[0].match(/\[(.*?)\]/g);
                    if(dataBlocks)
                    {
                        let text = buffer.toString("utf8").split(': ')
                        text.shift();
                        text = text.join(': ')

                        listeners.log('object-data',
                        {
                            thread: dataBlocks[1].split("/")[0].slice(1),
                            level: dataBlocks[1].split("/")[1].slice(0, dataBlocks[1].split("/")[1].length-1),
                            logger: dataBlocks[2].split("/")[0].slice(1),
                            time: new Date(),
                            text
                        })
                    }
                    else
                    {
                        listeners.log('data', buffer.toString("utf8"));
                    }
                }
            }
            catch(err)
            {
                console.log(err, d)
            }
        })

        listeners.processLaunch(process);

        let watcher = xmcl.createMinecraftProcessWatcher(process, new EventEmitter())

        watcher.on('error', (e) => { console.error("error",e); listeners.log('error', e) });
        watcher.on('minecraft-exit', (e) => { console.log("minecraft-exit",e); listeners.log('close', "Exit code: "+e.code); if(e.crashReport){listeners.log('close', e.crashReport)} });
        process.on("close", (e) => {listeners.close(e)})

        // Window
        watcher.on('minecraft-window-ready', async (e) =>
        {
            let sources = await desktopCapturer.getSources({ types: ['window'] });
    
            let mcSource = sources.find(source => source.id==pid || source.name.startsWith('Minecraft'));
            if(!mcSource) { console.warn("Window not found...") }

            listeners.windowOpen(windowManager.getWindows().find(w => w.processId == pid), mcSource, process);
        });
    }
    // MCLC Launch
    else
    {
        // Resource Path (download optimization)
        let resourcePath = path.join(config.directories.resources, version.number+'-'+version.type)
        if(!fs.existsSync(resourcePath+sep+'assets')){fs.mkdirSync(resourcePath+sep+'assets', {recursive: true});}
        else{fs.cpSync(resourcePath+sep+'assets', path.join(p,'assets'), {recursive:true})}
        if(!fs.existsSync(resourcePath+sep+'libraries')){fs.mkdirSync(resourcePath+sep+'libraries', {recursive: true});}
        else{fs.cpSync(resourcePath+sep+'libraries', path.join(p,'libraries'), {recursive:true})}

        if(fs.existsSync(path.join(config.directories.resources, 'versions', version.number)))
        { fs.cpSync(path.join(config.directories.resources, 'versions', version.number), path.join(p,'versions',version.number), {recursive:true}) }

        const launcher = new Client();

        // Install Loader
        version.custom = await installLoader(p, loader, version)

        if(version.custom == undefined)
        { console.error("Custom Version Failed!"); return; }

        // Settings
        let options =
        {
            root: p,
            version: version,
            memory: {max: memory.max+'G', min: memory.min+'G'},
            authorization: await Authenticator.getAuth("tester"),
            forge: loader.name=='forge'||loader.name=='neoforge'?path.join(p, 'versions', `${loader.name}-${version.number}-${loader.version}`, `${loader.name}-${version.number}-${loader.version}.jar`):null,
            quickPlay: world!=undefined?world:null,
            javaPath: javaPath?javaPath:'java',
            overrides: {detached: true}
        }
        console.log(options)

        // Asset Move
        launcher.on('debug', (e, ...args) =>
        {
            if(e == '[MCLC]: Downloaded assets')
            {
                fs.cpSync(path.join(p,'assets'), resourcePath+sep+'assets', {recursive:true})
                fs.cpSync(path.join(p,'libraries'), resourcePath+sep+'libraries', {recursive:true})

                fs.cpSync(path.join(p,'versions'), path.join(config.directories.resources, 'versions'), {recursive:true})
            }
        });

        // Prepare Events
        launcher.on('debug', (e) => listeners?.log('debug', e));
        launcher.on('data', (e) => listeners?.log('data', e));
        launcher.on('close', (e) => listeners?.log('close', e));
        launcher.on('error', (e) => listeners?.log('error', e));
        launcher.on('close', (e) => {listeners?.close(e);launcher.removeAllListeners();})

        // Launch
        let childProcess = await launcher.launch(options);

        if(!childProcess) { console.error("Process is null..."); return; }
    }
}


// Instance Download
async function curseforgeDownload(zipPath, meta, instanceListener)
{
    let zip = fs.readFileSync(zipPath)
    const {entries} = await unzip(zip);

    if(!entries['manifest.json'])
    {
        if(entries['modrinth.index.json']) { await modrinthDownload(zipPath, meta, instanceListener); return; }
        console.error("No manifest.json")
        return;
    }

    const manifest = await entries['manifest.json'].json();

    meta.name = manifest.name
    if(!meta.version){meta.version={}}
    if(!meta.loader){meta.loader={}}
    meta.version.number = manifest.minecraft.version
    meta.loader.name = manifest.minecraft.modLoaders[0].id.split("-")[0]
    meta.loader.version = manifest.minecraft.modLoaders[0].id.split("-")[1]

    let i = new Instance(meta);

    let p = path.join(config.directories.instances, i.name);
    fs.mkdirSync(path.join(p,'minecraft'),{recursive:true});

    i.save();

    if(instanceListener){instanceListener(i)}

    if(!fs.existsSync(path.join(p, 'minecraft/mods'))){fs.mkdirSync(path.join(p, 'minecraft/mods'));}
    if(!fs.existsSync(path.join(p, 'minecraft/resourcepacks'))){fs.mkdirSync(path.join(p, 'minecraft/resourcepacks'));}
    if(!fs.existsSync(path.join(p, 'minecraft/shaderpacks'))){fs.mkdirSync(path.join(p, 'minecraft/shaderpacks'));}


    // Download content
    // Mod Download or Transfert
    let loadingIndex = i.setLoading({type: "instance-download", value: 0})
    let downloaded = 0;
    let total = manifest.files.length+Object.entries(entries).filter(([e,v]) => e.startsWith(manifest.overrides+'/') && e != manifest.overrides+'/' && !e.endsWith('/')).length
    for(let f of manifest.files)
    {
        let dest = "mods"
        getRedirectLocation(`https://www.curseforge.com/api/v1/mods/${f.projectID}/files/${f.fileID}/download`).then(async fileUrl =>
        {
            if(fileUrl.slice(0, fileUrl.lastIndexOf("?")).endsWith(".zip"))
            {
                dest = "resourcepacks";
            }
            let r = await Download.download(fileUrl, path.join(p, 'minecraft', dest), true, false)

            if(dest == "resourcepacks")
            {
                const {entries} = await unzip(fs.readFileSync(r));
                if(entries["shaders"+sep]){ fs.renameSync(r, path.join(p, 'minecraft', "shaderpacks", r.slice(r.lastIndexOf(sep)))) }
            }
            
            downloaded++;
            i.setLoading({type: "instance-download", value: Math.round((downloaded/total)*1000)/1000, index: loadingIndex})
        })
    }
    // Other Files
    for(let [e, v] of Object.entries(entries).filter(([e,v]) => e.startsWith(manifest.overrides+'/') && e != manifest.overrides+'/' && !e.endsWith('/')))
    {
        try
        {
            e = e.slice(manifest.overrides.length+1, e.length);
            console.log(e)

            let folderPath = e.split('/')
            folderPath.pop()

            if(!fs.existsSync(path.join(p, 'minecraft', ...folderPath)))
            { fs.mkdirSync(path.join(p, 'minecraft', ...folderPath), {recursive:true}) }

            v.arrayBuffer().then(arrayBuffer =>
            {
                fs.writeFileSync(path.join(p, 'minecraft', ...e.split('/')), Buffer.from(arrayBuffer))

                downloaded++
                i.setLoading({type: "instance-download", value: Math.round((downloaded/total)*1000)/1000, index: loadingIndex})
            })
        }
        catch(err) { console.warn(err) }
    }

    i.save();
}
async function modrinthDownload(zipPath, meta, instanceListener)
{
    let zip = fs.readFileSync(zipPath)

    const {entries} = await unzip(zip);

    if(!entries['modrinth.index.json'])
    {
        if(entries['manifest.json']) { await curseforgeDownload(zipPath, meta, instanceListener); return; }
        console.error("No modrinth.index.json")
        return;
    }

    const manifest = await entries['modrinth.index.json'].json();

    meta.name = manifest.name
    if(!meta.version){meta.version={}}
    if(!meta.loader){meta.loader={}}
    meta.version.number = manifest.dependencies.minecraft
    meta.loader.name = Object.entries(manifest.dependencies).filter(e=>e[0]!='minecraft')[0][0]
    meta.loader.version = Object.entries(manifest.dependencies).filter(e=>e[0]!='minecraft')[0][1]

    let i = new Instance(meta);

    let p = path.join(config.directories.instances, i.name);
    fs.mkdirSync(path.join(p,'minecraft'),{recursive:true});

    i.save();

    if(instanceListener){instanceListener(i)}

    // Download content
    let total = 0;
    for(let f of manifest.files)
    {
        if(entries[f.path] != undefined) { continue; }
        total += f.fileSize;
    }
    let loaded = 0;
    let loadingIndex = i.setLoading({type: "instance-download", value: 0})

    // Mod Download or Transfert
    for(let f of manifest.files)
    {
        if(fs.existsSync(path.join(p, 'minecraft', f.path))){loaded+=f.fileSize; continue;}

        if(entries[f.path] != undefined)
        {
            entries[f.path].arrayBuffer().then(arrayBuffer =>
            {
                fs.writeFileSync(path.join(p, 'minecraft', f.path), arrayBuffer)
            })
        }
        else if(f.downloads != undefined)
        {
            if(f.downloads[0] == undefined){continue;}

            Download.download(decodeURI(f.downloads[0]), path.join(p, 'minecraft', f.path), false, false).then(() =>
            {
                loaded+=f.fileSize;
                i.setLoading({type: "instance-download", value: Math.round((loaded/total)*1000)/1000, index: loadingIndex})
            })
        }
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
                fs.writeFileSync(path.join(p, 'minecraft', e[0].slice(10)), Buffer.from(await e[1].arrayBuffer()))
            }
            catch(err) { console.warn(err) }
        }
    }

    i.save();
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

            console.log("Downloaded",link,'to',path.join(targetPath, targetName))

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
        case 'quilt':
        {
            version.custom = `quilt-${version.number}-${loader.version}`;

            const targetPath = path.join(config.directories.resources, "versions", `quilt-${version.number}-${loader.version}`);
            const targetName = `quilt-${version.number}-${loader.version}.json`;

            file = path.join(targetPath, targetName);
            targetFile = path.join(root, 'versions', `quilt-${version.number}-${loader.version}`, targetName);

            if(fs.existsSync(path.join(targetPath, targetName))){break;}
            if(!fs.existsSync(targetPath)){fs.mkdirSync(targetPath, {recursive:true});}

            const link = `https://meta.quiltmc.org/v3/versions/loader/${version.number}/${loader.version}/profile/json`;

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
    else if(fs.existsSync(path.join(config.directories.jre, `java-${targetMajorVersion}`, 'bin', 'javaw.exe')))
    { return path.join(config.directories.jre, `java-${targetMajorVersion}`, 'bin', 'javaw.exe') }
    else if(fs.existsSync(path.join(config.directories.jre, `java-${targetMajorVersion}`, 'bin', 'java.exe')))
    { return path.join(config.directories.jre, `java-${targetMajorVersion}`, 'bin', 'java.exe') }
    else if(fs.existsSync(path.join(config.directories.jre, `java-${targetMajorVersion}`, 'bin', 'java')))
    { return path.join(config.directories.jre, `java-${targetMajorVersion}`, 'bin', 'java') }


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

    let res = await fetch(link, { method: "HEAD" })
    if(!res.ok){arch="x64"; link = `https://api.adoptium.net/v3/binary/latest/${version}/ga/${os}/${arch}/jre/hotspot/normal/adoptium?project=jdk`}
    

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
    else if(fs.existsSync(path.join(config.directories.jre, `java-${version}`, 'bin', 'javaw.exe')))
    { return path.join(config.directories.jre, `java-${version}`, 'bin', 'javaw.exe') }
    else if(fs.existsSync(path.join(config.directories.jre, `java-${version}`, 'bin', 'java.exe')))
    { return path.join(config.directories.jre, `java-${version}`, 'bin', 'java.exe') }
    else if(fs.existsSync(path.join(config.directories.jre, `java-${version}`, 'bin', 'java')))
    { return path.join(config.directories.jre, `java-${version}`, 'bin', 'java') }
}

const lwjglVersion = "3.3.1"
async function fixLibraries(libraryPath, instance)
{
    let resourcePath = path.join(__dirname, "lwjgl", `${platform()}-${arch()}.zip`)
    if(!fs.existsSync(resourcePath)){return [];}

    if(platform()!="linux"){return []}

    let win = BrowserWindow.getAllWindows()[0] || BrowserWindow.getFocusedWindow();
    let createdWin = win==undefined;
    if(createdWin)
    {
        win = new BrowserWindow({});
        win.hide();
    }

    if(!fs.existsSync(path.join(config.directories.resources, "lwjgl"))){fs.mkdirSync(path.join(config.directories.resources, "lwjgl"))}
    let movedResourcePath = path.join(config.directories.resources, "lwjgl", `${platform()}-${arch()}.zip`)
    if(!fs.existsSync(movedResourcePath))
    {
        fs.copyFileSync(resourcePath, movedResourcePath);
    }

    let extractedTemp = fs.mkdtempSync(path.join(os.tmpdir(), "lwjgl-"))

    console.log(extractedTemp)
    await extract(movedResourcePath,
    {
        dir: extractedTemp,
        onEntry: (entry, zipfile) =>
        {
            console.log(`Extracting: ${entry.fileName}`);
        }
    })

    if(!fs.existsSync(libraryPath)){fs.mkdirSync(libraryPath)}
    for(let f of fs.readdirSync(extractedTemp))
    {
        if(!f.endsWith(".jar")){continue}
        let ogPath = path.join(extractedTemp, f);
        let dirList = [f.split(".")[0].split("-")[0]+(f.split(".")[0].split("-")[1]?("-"+f.split(".")[0].split("-")[1]):""), lwjglVersion];

        if(!fs.existsSync(path.join(libraryPath, "org", "lwjgl", ...dirList)))
        {fs.mkdirSync(path.join(libraryPath, "org", "lwjgl", ...dirList), {recursive: true})}

        if(f.endsWith("-natives-linux-arm64.jar"))
        {
            let tempDir = libraryPath + "-tmp";
            fs.mkdirSync(tempDir, { recursive: true });
            await extract(ogPath, { dir: tempDir });

            let stack = [tempDir];
            while (stack.length)
            {
                let cur = stack.pop();
                for (let f of fs.readdirSync(cur, { withFileTypes: true }))
                {
                    let fullPath = path.join(cur, f.name);
                    if(f.isDirectory())
                    {
                        stack.push(fullPath);
                    }
                    else if(f.name.endsWith(".so"))
                    {
                        fs.mkdirSync(libraryPath, { recursive: true });
                        fs.renameSync(fullPath, path.join(libraryPath, f.name));
                    }
                }
            }

            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        continue

        let filename = f.split(".")[0].split("-")[0]+(f.split(".")[0].split("-")[1]?("-"+f.split(".")[0].split("-")[1]):"")+"-"+lwjglVersion+f.slice((f.split(".")[0].split("-")[0]+(f.split(".")[0].split("-")[1]?("-"+f.split(".")[0].split("-")[1]):"")).length, f.length);
        if(f.slice(6, f.length)=="jar"){filename="lwjgl-"+lwjglVersion+".jar"}
        dirList.push(filename)

        console.log(path.join(...dirList))
        fs.copyFileSync(ogPath, path.join(libraryPath, "org", "lwjgl", ...dirList))
    }

    fs.copyFileSync(path.join(__dirname, "lwjgl", "libglfw.so"), path.join(libraryPath, "libglfw.so"))

    return ["-Djava.library.path="+path.join(instance.path, 'versions', instance.version.number, "natives")];
}

module.exports = Instance;