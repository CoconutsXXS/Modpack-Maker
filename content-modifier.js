const fs = require('fs')
const fsPromise = require('fs/promises')
const { unzip, ZipEntry } = require('unzipit');
const zlib = require('zlib');
const nbt = require('prismarine-nbt');
const toml = require('toml');
const jarReader = require('./jar-reader');
const similarity = require('similarity');
const javaParser = require("./java-parser");
const JSZip = require("jszip");
const mcFunction = require("@spyglassmc/mcfunction");
const lodash = require("lodash")
const path = require("path")
const {sep} = require("path")
var chokidar = require('chokidar');
const decompiler = require("./decompiler")
const pako = require("pako")
const xmclNbt = require('@xmcl/nbt')


const config = require('./config');
const parseMCA = require('./mca-parser');

function toNBT(value)
{
  const asIntegerType = (n, forceInt = false) => {
    if (!Number.isInteger(n)) return { type: 'float', value: n };
    if (forceInt) return { type: 'int', value: Number(n) };
    if (n >= -128 && n <= 127) return { type: 'byte', value: Number(n) };
    if (n >= -32768 && n <= 32767) return { type: 'short', value: Number(n) };
    return { type: 'int', value: Number(n) };
  };

  if (value === null || value === undefined) return { type: 'string', value: '' };
  if (typeof value === 'number') {
    return asIntegerType(value, true);
  }
  if (typeof value === 'string') return { type: 'string', value };
  if (typeof value === 'boolean') return { type: 'byte', value: value ? 1 : 0 };

  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'list', value: { type: 'end', value: [] } };

    const allObjects = value.every(v => v && typeof v === 'object' && !Array.isArray(v));
    const allPrimitives = value.every(v => ['number','string','boolean'].includes(typeof v));

    if (allObjects) {
      const arr = value.map(elem => {
        const compound = {};
        for (const [k,v] of Object.entries(elem)) compound[k] = toNBT(v);
        return compound;
      });
      return { type: 'list', value: { type: 'compound', value: arr } };
    }

    if (allPrimitives) {
      const first = value[0];
      if (typeof first === 'number') {
        const raw = value.map(n => Number(n));
        // if (raw.every(x => x >= -128 && x <= 127)) return { type: 'list', value: { type: 'byte', value: raw } };
        // if (raw.every(x => x >= -32768 && x <= 32767)) return { type: 'list', value: { type: 'short', value: raw } };
        return { type: 'list', value: { type: 'int', value: raw } };
      }
      if (typeof first === 'string') return { type: 'list', value: { type: 'string', value: value.slice() } };
      if (typeof first === 'boolean') return { type: 'list', value: { type: 'byte', value: value.map(b => b?1:0) } };
    }

    // tableau mixte
    const arr = value.map(v => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const obj = {};
        for (const [k,vv] of Object.entries(v)) obj[k] = toNBT(vv);
        return obj;
      } else {
        return { value: toNBT(v) };
      }
    });
    return { type: 'list', value: { type: 'compound', value: arr } };
  }

  if (typeof value === 'object') {
    const comp = {};
    for (const [k,v] of Object.entries(value)) comp[k] = toNBT(v);
    return { type: 'compound', value: comp };
  }

  return { type: 'string', value: String(value) };
}


// Parsing
async function readZipEntry(path, value)
{
    if(!value){return value;}

    if(path.endsWith(".json") || path.endsWith(".mcmeta")) { return await value.text(); }
    else if(path.endsWith(".nbt"))
    {
        let buffer = Buffer.from(await value.arrayBuffer());

        // fs.writeFileSync('/Users/coconuts/Desktop/Projets/Modpack-Maker/game-launcher/nbt-structure-preset.json', JSON.stringify((await nbt.parse(buffer, 'big')).parsed, null, 4))

        return {parsed: await jarReader.parseNbt(buffer), accurate: (await nbt.parse(buffer)).parsed, buffer};
    }
    else if(path.endsWith(".class"))
    {
        return {text: (await decompiler.decompileClass(await value.arrayBuffer())).file}
        try
        {
            return {data: javaParser.parse(await value.arrayBuffer()), buffer: Buffer.from(await value.arrayBuffer())};
        }
        catch(err) { return {data: Buffer.from(await value.arrayBuffer()).toString(), buffer: Buffer.from(await value.arrayBuffer())} }
    }
    else if(path.endsWith(".mcfunction") || path.endsWith(".MF") || path.endsWith('.properties') || path.endsWith('.txt'))
    {
        return await value.text();
    }
    else if(path.endsWith(".png"))
    {
        let buffer = Buffer.from(await value.arrayBuffer());
        return {
            buffer,
            url: buffer.toString('base64')
        }
    }
    else if(path.endsWith(".toml"))
    {
        value = await value.text();
        return {
            raw: value,
            parsed: toml.parse(value.replaceAll(/^([ \t]*)([A-Za-z0-9_\-]+(?:\.[A-Za-z0-9_\-]+)+)([ \t]*)=/gm, (match, indent, key, space) => `${indent}"${key}"${space}=`))
        }
    }
    else if(!path.endsWith("/") && value.arrayBuffer){value = Buffer.from(await value.arrayBuffer());}

    return value;
}
const decoder = new TextDecoder()
async function readFile(path)
{
    if(!fs.existsSync(path)){return null;}

    if(path.endsWith(".json") || path.endsWith(".mcmeta") || path.endsWith(".mcfunction") || path.endsWith(".MF") || path.endsWith('.properties') || path.endsWith('.txt'))
    {
        return fs.readFileSync(path, 'utf-8')
    }
    
    const value = fs.readFileSync(path)
    if(path.endsWith(".nbt"))
    {
        let buffer = Buffer.from(value.buffer);

        // fs.writeFileSync('/Users/coconuts/Desktop/Projets/Modpack-Maker/game-launcher/nbt-structure-preset.json', JSON.stringify((await nbt.parse(buffer, 'big')).parsed, null, 4))

        return {parsed: await jarReader.parseNbt(buffer), accurate: (await nbt.parse(buffer)).parsed, buffer};
    }
    else if(path.endsWith(".class"))
    {
        return {text: (await decompiler.decompileClass(value.buffer)).file}
    }
    else if(path.endsWith(".png"))
    {
        let buffer = Buffer.from(value.buffer);
        return {
            buffer,
            url: buffer.toString('base64')
        }
    }
    else if(path.endsWith(".toml"))
    {
        return {
            raw: value,
            parsed: toml.parse(value.replaceAll(/^([ \t]*)([A-Za-z0-9_\-]+(?:\.[A-Za-z0-9_\-]+)+)([ \t]*)=/gm, (match, indent, key, space) => `${indent}"${key}"${space}=`))
        }
    }
    else if(!path.endsWith("/") && value.arrayBuffer){value = Buffer.from(value.buffer);}

    return value;
}
async function toBuffer(path, value, fail = false)
{
    if(value.constructor.name != "ZipEntry")
    {
        if(value.constructor.name == "Object" && (path[path.length-1].endsWith(".json") || path[path.length-1].endsWith(".mcmeta")))
        {
            value = Buffer.from(value);
        }
        else if(value.constructor.name == "Object" && path[path.length-1].endsWith(".nbt"))
        {
            if(value.buffer != undefined)
            {
                // Convert Buffer
                if(!Buffer.isBuffer(value.buffer)){value.buffer = Buffer.from(value.buffer);}
                // Update parsed
                value.parsed = await jarReader.parseNbt(value.buffer)

                value = value.buffer;
            }
            else
            {
                console.warn("Risked NBT loss convertion for ", path);
                let correctNbt = toNBT(value.parsed);
                correctNbt.name = '';
                value = nbt.writeUncompressed(correctNbt, "big");
            }
        }
        else if(value.constructor.name == "Object" && path[path.length-1].endsWith(".class"))
        {
            value = value.buffer;
            if(!Buffer.isBuffer(value))
            { try{value = Buffer.from(value)}catch(err){} }
        }
        else if(value.constructor.name == "Object" && (path[path.length-1].endsWith(".mcfunction") || path[path.length-1].endsWith(".MF") || path[path.length-1].endsWith(".toml")) || path[path.length-1].endsWith(".properties") || path[path.length-1].endsWith(".txt"))
        {
            value = Buffer.from(value, "utf8")
        }
        else if(value.constructor.name == "Object" && path[path.length-1].endsWith(".png"))
        {
            if(value.buffer)
            {
                value = value.buffer
                if(!Buffer.isBuffer(value)){value = Buffer.from(value)}
            }
            else
            {
                value = Buffer.from(value.url, "base64");
            }
        }
        else
        {
            try{value = Buffer.from(value)}catch(err){}
            if(fail) { return {result: value, failed: true} }
        }

        if(fail) { value = {result: value, failed: false} }

        return value;
    }
    else if(fail) { return {result: Buffer.from(await value.arrayBuffer()), failed: true}; }
    else
    {
        return Buffer.from(await value.arrayBuffer());
    }
}


// Data structure utily
async function iterateDirectoryObject(obj, path = [], callbackFile = async (p, v) => {}, callbackDirectory = async (p, v) => {})
{
    if(/^[^\\\/:\*\?"<>\|]+(\.[a-zA-Z0-9]+)+$/.test(path[path.length-1])){return;}

    for (const key in obj)
    {
        if (obj.hasOwnProperty(key))
        {
            const currentPath = [...path, key];
            const value = obj[key];

            await (/^[^\\\/:\*\?"<>\|]+(\.[a-zA-Z0-9]+)+$/.test(key)?callbackFile:callbackDirectory)(currentPath, value);
            if (value !== null && typeof value === 'object' && !Array.isArray(value))
            {
                await iterateDirectoryObject(value, currentPath, callbackFile, callbackDirectory);
            }
        }
    }
}
function setProp(obj, keys, value)
{
    let current = obj;
    keys.slice(0, -1).forEach(k =>
    {
        if (!(k in current)) current[k] = {};
        current = current[k];
    });
    current[keys[keys.length - 1]] = value;
}

async function expandPaths(obj, modifyValue = (path, value) => {return value;})
{
    if(!obj){return;}

    const result = {};

    for (let [p, value] of Object.entries(obj))
    {
        value = await modifyValue(p, value);

        const keys = p.split("/");
        let current = result;

        keys.forEach((key, index) =>
        {
            if(key.length==0){return;}
            if (index === keys.length - 1)
            {
                current[key] = value;
            }
            else
            {
                if (typeof current[key] !== 'object' || current[key] === null)
                {
                    current[key] = {};
                }
                current = current[key];
            }
        });
    }

    return result;
}

function setProp(obj, keys, value)
{
    let current = obj;
    keys.slice(0, -1).forEach(k =>
    {
        if (!(k in current)) current[k] = {};
        current = current[k];
    });
    current[keys[keys.length - 1]] = value;
}
function getProp(obj, keys)
{
    let current = obj;
    keys.slice(0, -1).forEach(k =>
    {
        if (!(k in current)) return undefined;
        current = current[k];
    });
    return current[keys[keys.length - 1]]
}

// Cache
let jarList = [];
async function getJar(path, expend = false)
{
    if(jarList.find(j=>j.path==path&&j.expend==expend))
    {
        return jarList.find(j=>j.path==path&&j.expend==expend).jar;
    }

    let jar = null;
    try{jar = expend?await expandPaths((await unzip( fs.readFileSync(path))).entries, () => { return null; }):((await unzip( await fsPromise.readFile(path))).entries);}catch(err){return null;}
    if(jar==null){return null;}

    jarList.push({path, jar, expend})

    let watcher = chokidar.watch(path, {persistent: true});
    watcher.on('all', async (e, p, s) =>
    {
        if(e=='unlink')
        {
            jarList = jarList.splice(jarList.findIndex(j=>j.path==path&&j.expend==expend))
        }
        else if(e==="change")
        {
            try
            {
                if(expend) { jarList[jarList.findIndex(j=>j.path==path&&j.expend==expend)].jar = await expandPaths((await unzip( await fsPromise.readFile(p))).entries, () => { return null; }); }
                else { jarList[jarList.findIndex(j=>j.path==path&&j.expend==expend)].jar = (await unzip( await fsPromise.readFile(p))).entries; }
            }
            catch(err){}
        }
    })

    return jar;
}

function minecraftVersion(name, version)
{
    if(fs.existsSync(path.join(config.directories.instances, name,"minecraft", "versions", version, version+".jar"))){return path.join(config.directories.instances, name,"minecraft", "versions", version, version+".jar")}
    else if(fs.existsSync(path.join(config.directories.resources, "versions", version, version+".jar"))){return path.join(config.directories.resources, "versions", version, version+".jar")}
    else { console.warn("Minecraft version not found for",name,version); return ""; }
}

module.exports =
{
    getJar: getJar,
    readZipEntry: readZipEntry,

    isMinecraftInstalled: async(name, version) =>
    {
        return fs.existsSync(path.join(config.directories.instances, name, "minecraft", "versions", version, version+".jar")) || fs.existsSync(path.join(config.directories.resources, "versions", version, version+".jar"));
    },
    minecraftVersion: minecraftVersion,

    fullModData: async (path) =>
    {
        let jar = await jarReader.jar(path, null, true);
        console.log("jar", jar)

        // Iterate Data per Mods
        let registeredMods = [];
        for(let [k, v] of Object.entries(jar).filter(([k,v]) => (k.startsWith("data/") && k!="data/") || (k.startsWith("assets/") && k!="assets/")))
        {
            if(registeredMods.find(m => m.id == k.split("/")[1]) != undefined){continue;}

            registeredMods.push({id: k.split("/")[1], displayName: k.split("/")[1]})
        }

        // Retrive by File
        if(jar["META-INF/mods.toml"])
        {
            let tomlText = (await readZipEntry("META-INF/mods.toml", jar["META-INF/mods.toml"])).replaceAll(/^([ \t]*)([A-Za-z0-9_\-]+(?:\.[A-Za-z0-9_\-]+)+)([ \t]*)=/gm, (match, indent, key, space) => `${indent}"${key}"${space}=`);
            let modsData = toml.parse(tomlText);
            for(let m of modsData.mods)
            {
                let icon = null;
                if(m.logoFile && jar[m.logoFile])
                {
                    icon = "data:image/png;base64,"+(await readZipEntry(m.logoFile, jar[m.logoFile])).url;
                }

                let d = {id: m.modId, displayName: m.displayName, description: m.description, icon};
                if(registeredMods.find(e=>e.id==m.modId)!=undefined)
                {
                    registeredMods[registeredMods.findIndex(e=>e.id==m.modId)] = d;
                }
                else { registeredMods.push(d); }
            }
        }

        for(let [p, d] of Object.entries(jar).filter(([k,v]) => !k.startsWith("META-INF/") && !k.startsWith("resourcepacks/") && !k.startsWith("packs/") && !k.startsWith("assets/") && !k.startsWith("data/")))
        {
            if(p.split("/").length >= 3 && p.split("/")[2].length > 0)
            {
                let i = "";
                for (let index = 0; index < 3; index++)
                {
                    i += (index==0?"":".")+p.split("/")[index];
                }
                if(registeredMods.find(m=>m.longId==i)!=undefined){continue;}

                // Find most similar id
                let biggest = {index: -1, similarity: 0}
                for (let i = 0; i < registeredMods.length; i++)
                {
                    let s = similarity(registeredMods[i].id, p.split("/")[2]);
                    if(biggest.similarity < s)
                    { biggest = {index: i, similarity: s}; }
                }
                if(biggest.index == -1){continue;}

                registeredMods[biggest.index].longId = i;
            }
        }

        // Search & Parse Data
        let mods = [];
        for(let m of registeredMods)
        {
            // Data
            let data = (await expandPaths(Object.fromEntries(Object.entries(jar).filter(([k,v]) => k.startsWith("data"+"/"+m.id+"/") && k!="data"+"/"+m.id+"/")), async (path, value) => { return readZipEntry(path, value) }));
            if(data.data){data = data.data[m.id]}

            // Assets
            let assets = (await expandPaths(Object.fromEntries(Object.entries(jar).filter(([k,v]) => k.startsWith("assets"+"/"+m.id+"/") && k!="assets"+"/"+m.id+"/")), async (path, value) => { return readZipEntry(path, value) }));
            if(assets.assets){assets = assets.assets[m.id]}

            // Classes
            let classes = {};
            if(m.longId != undefined)
            {
                classes = (await expandPaths(Object.fromEntries(Object.entries(jar).filter(([k,v]) => k.startsWith(m.longId.replaceAll(".", "/")))), async (path, value) => { return readZipEntry(path, value) }))[m.longId.split(".")[0]][m.longId.split(".")[1]][m.longId.split(".")[2]];
            }

            mods.push
            ({
                name: m.displayName,
                icon: m.icon,
                description: m.description,
                id: m.longId,
                data,
                assets,
                classes
            })
        }

        let resourcepacks = (await expandPaths(Object.fromEntries(Object.entries(jar).filter(([k,v]) => k.startsWith("resourcepacks/"))), async (path, value) => { return readZipEntry(path, value) }));

        let otherData = (await expandPaths(Object.fromEntries(Object.entries(jar).filter(([k,v]) =>
        {
            for(let {id} of registeredMods) { if(id && id.split('.')[0] == k.split("/")[0]){return false;} }
            return !k.startsWith("data/") && !k.startsWith("assets/") && !k.startsWith("classes/")
        })), async (path, value) => { return readZipEntry(path, value) }));

        return {mods, data: otherData, resourcepacks};
    },
    // modDataToDirectPathDirectoryObject: async (mods, path) =>
    // {
    //     let og = await jarReader.jar(path, null, true);
    //     let jar = {};

    //     for(const mod of mods)
    //     {
    //         let stringPath = '';
    //         iterateDirectoryObject(mod.data, [], (p, v) =>
    //         {
    //             // FILE
    //             // Path
    //             stringPath = "data/"+mod.name+"/";
    //             for(let part of p){stringPath += part + "/"}
    //             stringPath = stringPath.slice(0, stringPath.length-1);

    //             // Content
    //             if(v.constructor.name != "ZipEntry")
    //             {
    //                 if(v.constructor.name == "Object" && stringPath.endsWith(".json"))
    //                 {
    //                     v = Buffer.from(JSON.stringify(v));
    //                 }
    //                 else if(v.constructor.name == "Object" && stringPath.endsWith(".nbt"))
    //                 {
    //                     let correctNbt = toNBT(v);
    //                     correctNbt.name = '';
    //                     v = nbt.writeUncompressed(correctNbt, "big");
    //                 }
    //             }

    //             jar[stringPath] = v;
    //         }, (p, v) =>
    //         {
    //             // DIRECTORY
    //             // Path
    //             stringPath = "data/"+mod.name+"/";
    //             for(let part of p){stringPath += part + "/"}
    //             stringPath = stringPath.slice(0, stringPath.length-1);
    //         });

    //         iterateDirectoryObject(mod.assets, [], (p, v) =>
    //         {
    //             // FILE
    //             // Path
    //             stringPath = "assets/"+mod.name+"/";
    //             for(let part of p){stringPath += part + "/"}
    //             stringPath = stringPath.slice(0, stringPath.length-1);

    //             // Content
    //             if(v.constructor.name != "ZipEntry")
    //             {
    //                 if(v.constructor.name == "Object" && stringPath.endsWith(".json"))
    //                 {
    //                     v = Buffer.from(JSON.stringify(v));
    //                 }
    //                 else if(v.constructor.name == "Object" && stringPath.endsWith(".nbt"))
    //                 {
    //                     let correctNbt = toNBT(v);
    //                     correctNbt.name = '';
    //                     v = nbt.writeUncompressed(correctNbt, "big");
    //                 }
    //             }

    //             jar[stringPath] = v;
    //         }, (p, v) =>
    //         {
    //             // DIRECTORY
    //             // Path
    //             stringPath = "data/"+mod.name+"/";
    //             for(let part of p){stringPath += part + "/"}
    //             stringPath = stringPath.slice(0, stringPath.length-1);
    //         });
    //     }
    // },
    modDataToDirectoryObject: async (mod) =>
    {
        let jar =
        {
            data: {},
            assets: {}
        };

        for(const m of mod.mods)
        {
            if(m.data && Object.entries(m.data).length>0)
            {
                jar.data[m.name] = {};
                await iterateDirectoryObject(m.data, [], async (p, v) =>
                {
                    // FILE
                    setProp(jar.data[m.name], p, await toBuffer(p, v));
                });
            }

            if(m.assets && Object.entries(m.assets).length>0)
            {
                jar.assets[m.name] = {};
                await iterateDirectoryObject(m.assets, [], async (p, v) =>
                {
                    setProp(jar.assets[m.name], p, await toBuffer(p, v));
                });
            }

            if(m.id)
            {
                if(m.classes && Object.entries(m.classes).length>0)
                {
                    setProp(jar, [m.id.split(".")[0], m.id.split(".")[1], m.id.split(".")[2]], {})
                    await iterateDirectoryObject(m.classes, [], async (p, v) =>
                    {
                        setProp(jar[m.id.split(".")[0]][m.id.split(".")[1]][m.id.split(".")[2]], p, await toBuffer(p, v));
                    });
                }
            }
        }

        for(const [k, m] of Object.entries(mod.data))
        {
            let buffer = await toBuffer([k], m, true);
            if(buffer.failed && !/^[^\\\/:\*\?"<>\|]+(\.[a-zA-Z0-9]+)+$/.test(k))
            {
                // Directory
                jar[k] = {};
                await iterateDirectoryObject(m, [], async (p, v) =>
                {
                    // FILE
                    setProp(jar[k], p, await toBuffer(p, v));
                });
            }
            else
            {
                // File
                jar[k] = buffer.result;
            }
        }

        for(const [k, m] of Object.entries(mod.resourcepacks))
        {
            if(!jar.resourcepacks) { jar.resourcepacks = {}; }
            
            let buffer = await toBuffer([k], m, true);
            if(buffer.failed && !/^[^\\\/:\*\?"<>\|]+(\.[a-zA-Z0-9]+)+$/.test(k))
            {
                // Directory
                jar.resourcepacks[k] = {};
                await iterateDirectoryObject(m, [], async (p, v) =>
                {
                    // FILE
                    setProp(jar.resourcepacks[k], p, await toBuffer(p, v));
                });
            }
            else
            {
                // File
                jar.resourcepacks[k] = buffer.result;
            }
        }

        return jar;
    },
    writeDirectoryObject: async (directoryObject, path) =>
    {
        const zip = new JSZip();
        let main = zip.folder(path.replace(/^.*[\\/]/, ''));

        function addToZip(zip, obj, currentPath = "")
        {
            if(!obj){return}
            for (const [name, value] of Object.entries(obj))
            {
                const path = currentPath ? `${currentPath}/${name}` : name;

                if (value instanceof Buffer || Buffer.isBuffer(value))
                {
                    zip.file(path, value);
                }
                else if(typeof(value) == "object")
                {
                    const folder = zip.folder(path);
                    addToZip(folder, value);
                }
                else
                {
                    console.warn("Not Buffer and not Directory element. Ignoring... Converting to buffer", path, value);
                    // zip.file(path, Buffer.from(value));
                }
            }
        }
        addToZip(main, directoryObject)

        // main.file("Hello.txt", "Hello World\n");

        const content = await main.generateAsync({type:"arraybuffer"});
        fs.writeFileSync(path, Buffer.from(content))
    },
    combineContent: async (name, version, parseFiles = false) =>
    {
        let r = {};

        if(!version && fs.existsSync(path.join(config.directories.instances, name, ".instance-data.json")))
        { version = (await JSON.parse(await fsPromise.readFile(path.join(config.directories.instances, name, ".instance-data.json")))).version.number }
        else if(!version) { console.error("Cannot resolve",name,"version..."); return }

        // List every Jar including Minecraft
        let sub = [];
        sub.push(minecraftVersion(name, version))
        for(let p of fs.readdirSync(path.join(config.directories.instances, name, "minecraft/mods")))
        {
            if(p == ".DS_Store"){continue;}
            sub.push(path.join(config.directories.instances, name, "minecraft/mods", p))
        }
        for(let p of fs.readdirSync(path.join(config.directories.instances, name, "minecraft/resourcepacks")))
        {
            if(p == ".DS_Store"){continue;}
            sub.push(path.join(config.directories.instances, name, "minecraft/resourcepacks", p))
        }

        for(let p of sub)
        {
            if(p == minecraftVersion(name, version))
            {
                p = await decompiler.decompileMinecraft( version )
            }

            let jar = await getJar(p);
            // Ignore disableds
            // if(!jar || jar == null)
            // {
            //     if(p.endsWith(".disabled")) { jar = await getJar(p.slice(0, p.lastIndexOf("."))) }
            //     else { jar = await getJar(p+'.disasbled') }
            // }
            if(!jar || jar == null){jar = await getJar(p.replaceAll(/(["\s'$`\\])/g,'\\$1'))}
            if(!jar || jar == null){console.warn("Invalid/Disabled .jar/.zip path:", p); continue;}

            // Native Minecraft Jar
            if(p == minecraftVersion(name, version))
            {
                await decompiler.decompileMinecraft( version )
                // (async () =>
                // {
                //     let decompiledClass

                //     await new Promise(async resolve =>
                //     {
                //         const list = Object.entries(jar).filter(([p])=>p.endsWith(".class") && !p.includes("/"));

                //         let processing = 0;
                //         let count = 0;
                //         const total = list.length

                //         for(let [p, v] of list)
                //         {
                //             while(processing >= 512)
                //             {
                //                 await new Promise(resolve => setTimeout(resolve, 10))
                //             }

                //             console.log("Processing")

                //             processing++;
                //             // jar[p] = null; delete jar[p];
                //             jar[p].arrayBuffer().then(buffer =>
                //             {
                //                 decompiler.decompileClass( Buffer.from(buffer)).then(data =>
                //                 {
                //                     const decompiled = data.file.slice(data.file.lastIndexOf(' */')+3)
                //                     if(!decompiled){ processing--; count++; return}

                //                     decompiledClass += decompiled;

                //                     if(decompiled.includes('EntityModel') || decompiled.includes('BlockEntityRenderer') || decompiled.includes('net.minecraft.client.render.entity.model') || decompiled.includes('net.minecraft.client.render.block.entity'))
                //                     {
                //                         console.log(data, decompiled)
                //                     }

                //                     count++;
                //                     processing--;
                //                     if(count == total)
                //                     { resolve() }

                //                     console.log("Processed", count/total * 100)
                //                 })
                //             })
                //         }
                //     })

                //     console.log(decompiledClass)
                // })()
            }


            let content = await expandPaths(jar, async (path, value) => { return parseFiles?readZipEntry(path, value):null; });
            r = lodash.merge(r, content)
        }

        return r;
    },

    retrieveModFileById: async (name, id = "minecraft:worldgen/placed_feature/basalt_blobs", version) =>
    {
        if(!version && fs.existsSync(path.join(config.directories.instances, name, ".instance-data.json")))
        { version = (await JSON.parse(await fsPromise.readFile(path.join(config.directories.instances, name, ".instance-data.json")))).version.number }
        else if(!version) { console.error("Cannot resolve",name,"version..."); return }

        // List every Jar including Minecraft
        let sub = [];
        sub.push(minecraftVersion(name, version))
        for(let p of fs.readdirSync(path.join(config.directories.instances, name, "minecraft/mods")))
        {
            if(p == ".DS_Store"){continue;}
            sub.push(path.join(config.directories.instances, name, "minecraft/mods", p))
        }
        for(let p of fs.readdirSync(path.join(config.directories.instances, name, "minecraft/resourcepacks")))
        {
            if(p == ".DS_Store"){continue;}
            sub.push(path.join(config.directories.instances, name, "minecraft/resourcepacks", p))
        }


        let realPath = "/"+id.split(":")[0];
        for(let part of id.split(":")[1].split("/")){realPath+="/"+part}

        let result = [];

        for(let p of sub)
        {
            let jar = await getJar(p);
            if(!jar || jar == null)
            {
                if(p.endsWith(".disabled")) { jar = await getJar(p.slice(0, p.lastIndexOf("."))) }
                else { jar = await getJar(p+'.disasbled') }
            }
            if(!jar || jar == null){jar = await getJar(p.replaceAll(/(["\s'$`\\])/g,'\\$1'))}
            if(!jar || jar == null){console.error("Invalid .jar path:", p); continue;}

            for(let r of Object.entries(jar).filter(([k, v]) => k.startsWith("data"+realPath) || k.startsWith("assets"+realPath)))
            {
                result.push
                ({
                    jarFile: p,
                    path: r[0],
                    value: await readZipEntry(r[0], r[1]),
                    original: p == minecraftVersion(name, version)
                })
            }
        }

        return result;
    },
    retrieveModFileByPath: async (name, truePath = "", version) =>
    {
        if(!version && fs.existsSync(path.join(config.directories.instances, name, ".instance-data.json")))
        { version = (await JSON.parse(await fsPromise.readFile(path.join(config.directories.instances, name, ".instance-data.json")))).version.number }
        else if(!version) { console.error("Cannot resolve",name,"version..."); return }

        // List every Jar including Minecraft
        let sub = [];
        sub.push(minecraftVersion(name, version))
        for(let p of fs.readdirSync(path.join(config.directories.instances, name, "minecraft/mods")))
        {
            if(p == ".DS_Store"){continue;}
            sub.push(path.join(config.directories.instances, name, "minecraft/mods", p))
        }
        for(let p of fs.readdirSync(path.join(config.directories.instances, name, "minecraft/resourcepacks")))
        {
            if(p == ".DS_Store"){continue;}
            sub.push(path.join(config.directories.instances, name, "minecraft/resourcepacks", p))
        }

        let result = [];

        for(let p of sub)
        {
            let jar = await getJar(p);
            if(!jar || jar == null)
            {
                if(p.endsWith(".disabled")) { jar = await getJar(p.slice(0, p.lastIndexOf("."))) }
                else { jar = await getJar(p+'.disasbled') }
            }
            if(!jar || jar == null){jar = await getJar(p.replaceAll(/(["\s'$`\\])/g,'\\$1'))}
            if(!jar || jar == null){console.error("Invalid .jar path:", p); continue;}

            if(jar[truePath])
            {
                result.push
                ({
                    jarFile: p,
                    path: truePath,
                    value: await readZipEntry(truePath, jar[truePath]),
                    original: p == minecraftVersion(name, version)
                })
            }
        }

        return result;
    },
    retrieveModFileByKeys: async (name, keys = [], version) =>
    {
        if(!version && fs.existsSync(path.join(config.directories.instances, name, ".instance-data.json")))
        { version = (await JSON.parse(await fsPromise.readFile(path.join(config.directories.instances, name, ".instance-data.json")))).version.number }
        else if(!version) { console.error("Cannot resolve",name,"version..."); return }

        // List every Jar including Minecraft
        let sub = [];
        sub.push( path.join(config.directories.unobfuscated, version+'.jar') )
        for(let p of fs.readdirSync(path.join(config.directories.instances, name, "minecraft/mods")))
        {
            if(p == ".DS_Store"){continue;}
            sub.push(path.join(config.directories.instances, name, "minecraft/mods", p))
        }
        for(let p of fs.readdirSync(path.join(config.directories.instances, name, "minecraft/resourcepacks")))
        {
            if(p == ".DS_Store"){continue;}
            sub.push(path.join(config.directories.instances, name, "minecraft/resourcepacks", p))
        }

        let result = [];

        for(let p of sub)
        {
            let jar = await getJar(p);
            if(!jar || jar == null)
            {
                console.log(p)
                if(p.endsWith(".disabled")) { jar = await getJar(p.slice(0, p.lastIndexOf("."))) }
                else { jar = await getJar(p+'.disasbled') }
            }
            if(!jar || jar == null){jar = await getJar(p.replaceAll(/(["\s'$`\\])/g,'\\$1'))}
            if(!jar || jar == null){console.error("Invalid .jar path:", p); continue;}

            let truePath = "";
            for(let k of keys) { truePath += k+"/"; }
            truePath = truePath.slice(0, truePath.length-1)

            if(jar[truePath])
            {
                result.push
                ({
                    jarFile: p,
                    path: truePath,
                    value: await readZipEntry(truePath, jar[truePath]),
                    original: p == minecraftVersion(name, version)
                })
            }
        }

        return result;
    },

    extractFileByKeys: async (jarPath, keys = []) =>
    {
        let jar = await getJar(jarPath);
        if(!jar){jar = await getJar(jarPath.replaceAll(/(["\s'$`\\])/g,'\\$1'))}
        if(!jar){console.error("Invalid .jar path:", jarPath)}

        let truePath = "";
        for(let k of keys) { truePath += k+"/"; }
        truePath = truePath.slice(0, truePath.length-1)

        return await readZipEntry(truePath, jar[truePath]);
    },
    extractFileByPath: async (jarPath, truePath) =>
    {
        let jar = await getJar(jarPath);
        if(!jar){jar = await getJar(jarPath.replaceAll(/(["\s'$`\\])/g,'\\$1'))}
        if(!jar){console.error("Invalid .jar path:", jarPath)}

        return await readZipEntry(truePath, jar[truePath]);
    },

    writeJarPropertie: async (jarPath, properties) =>
    {
        let jar = await getJar(jarPath);
        if(!jar){jar = await getJar(jarPath.replaceAll(/(["\s'$`\\])/g,'\\$1'))}
        if(!jar){console.error("Invalid .jar path:", jarPath)}

        for(let p of properties)
        {
            let keyPath = "";
            for(let k of p.keys){keyPath+="/"+k} keyPath = keyPath.slice(1);

            console.log("jar",jar)
            console.log(jarPath, properties)

            jar[keyPath] = await toBuffer(p.keys, p.value)
        }

        const zip = new JSZip();
        let main = zip.folder(jarPath.replace(/^.*[\\/]/, ''));

        async function addToZip(zip, obj, currentPath = "")
        {
            if(!obj){return}
            for (const [name, value] of Object.entries(obj))
            {
                const path = currentPath ? `${currentPath}/${name}` : name;

                if (value instanceof Buffer || Buffer.isBuffer(value))
                {
                    zip.file(path, value);
                }
                else if(value.constructor.name == "ZipEntry")
                {
                    zip.file(path, Buffer.from(await value.arrayBuffer()));
                }
                else if(typeof(value) == "object")
                {
                    const folder = zip.folder(path);
                    addToZip(folder, value);
                }
                else
                {
                    console.warn("Not Buffer and not Directory element. Ignoring...", path, value);
                    // zip.file(path, Buffer.from(value));
                }
            }
        }
        await addToZip(main, jar)

        const content = await main.generateAsync({type:"arraybuffer"});
        fs.writeFileSync(jarPath, Buffer.from(content))
    },

    readRegion: async (p) =>
    {
        return await parseMCA(p)
    },
    readNbt: async (p, raw = false) =>
    {
        return await nbt[raw?"parseAs":"parseUncompressed"](fs.readFileSync(p), 'big')
    },
    readDat: async (p, raw = false) =>
    {
        return xmclNbt.deserialize(fs.readFileSync(p), { compressed: "gzip" })
    },

    writeNbt: async (d, p) =>
    {
        fs.writeFileSync(p, nbt.writeUncompressed(d, 'big'))
    },

    readZipEntry: readZipEntry,
    toBuffer: toBuffer,

    readFile: readFile
}