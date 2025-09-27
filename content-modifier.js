const fs = require('fs')
const { unzip, ZipEntry } = require('unzipit');
const zlib = require('zlib');
const nbt = require('prismarine-nbt');
const minecraftData = require('minecraft-data')
const jarReader = require('./jar-reader');
const similarity = require('similarity');
const javaParser = require("./java-parser");
const JSZip = require("jszip");
const { WorldReader, RegionReader, RegionWriter } = require('@xmcl/world')

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
    if(path.endsWith(".json")) { return await value.json(); }
    else if(path.endsWith(".nbt")) { return {parsed: await jarReader.parseNbt(Buffer.from(await value.arrayBuffer())), buffer: Buffer.from(await value.arrayBuffer())}; }
    else if(path.endsWith(".class"))
    {
        return {data: "TODO", buffer: Buffer.from(await value.arrayBuffer())}
        try
        {
            return {data: javaParser.parse(await value.arrayBuffer()), buffer: Buffer.from(await value.arrayBuffer())};
        }
        catch(err) { return {data: Buffer.from(await value.arrayBuffer()).toString(), buffer: Buffer.from(await value.arrayBuffer())} }
    }
    else if(!path.endsWith("/")){value = Buffer.from(await value.arrayBuffer());}

    return value;
}
async function toBuffer(path, value, fail = false)
{
    if(value.constructor.name != "ZipEntry")
    {
        if(value.constructor.name == "Object" && path[path.length-1].endsWith(".json"))
        {
            value = Buffer.from(JSON.stringify(value));
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
    const result = {};

    for (let [path, value] of Object.entries(obj))
    {
        value = await modifyValue(path, value);

        const keys = path.split('/');
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


module.exports =
{
    modData: async (path) =>
    {
        let jar = await jarReader.jar(path, null, true);

        // Iterate Data per Mods
        let modsId = [];
        for(let [k, v] of Object.entries(jar).filter(([k,v]) => (k.startsWith("data/") && k!="data/") || (k.startsWith("assets/") && k!="assets/")))
        {
            if(modsId.includes(k.split("/")[1])){continue;}

            modsId.push(k.split("/")[1]);
        }
        let modsLongId = new Array(modsId.length);
        for(let [p, d] of Object.entries(jar).filter(([k,v]) => !k.startsWith("META-INF/") && !k.startsWith("packs/") && !k.startsWith("assets/") && !k.startsWith("data/")))
        {
            if(p.split("/").length >= 3 && p.split("/")[2].length > 0)
            {
                let i = "";
                for (let index = 0; index < 3; index++)
                {
                    i += (index==0?"":".")+p.split("/")[index];
                }
                if(modsLongId.includes(i)){continue;}
                modsLongId[modsId.findIndex(m=> m == modsId.sort((a,b)=>similarity(b, p.split("/")[2])-similarity(a, p.split("/")[2]))[0] )] = i;
            }
        }

        // Search & Parse Data
        let mods = [];
        for(let [i, m] of modsId.entries())
        {
            // Data
            let data = (await expandPaths(Object.fromEntries(Object.entries(jar).filter(([k,v]) => k.startsWith("data/"+m+"/") && k!="data/"+m+"/")), async (path, value) => { return readZipEntry(path, value) }));
            if(data.data){data = data.data[m]}

            // Assets
            let assets = (await expandPaths(Object.fromEntries(Object.entries(jar).filter(([k,v]) => k.startsWith("assets/"+m+"/") && k!="assets/"+m+"/")), async (path, value) => { return readZipEntry(path, value) }));
            if(assets.assets){assets = assets.assets[m]}

            // Classes
            let classes = {};
            if(modsLongId[i] != null)
            {
                classes = (await expandPaths(Object.fromEntries(Object.entries(jar).filter(([k,v]) => k.startsWith(modsLongId[i].replaceAll(".", "/")))), async (path, value) => { return readZipEntry(path, value) }))[modsLongId[i].split(".")[0]][modsLongId[i].split(".")[1]][modsLongId[i].split(".")[2]];
            }

            mods.push
            ({
                name: m,
                id: modsLongId[i],
                data,
                assets,
                classes
            })
        }

        let otherData = (await expandPaths(Object.fromEntries(Object.entries(jar).filter(([k,v]) =>
        {
            for(let id of modsLongId) { if(id && id.split('.')[0] == k.split("/")[0]){return false;} }
            return !k.startsWith("data/") && !k.startsWith("assets/") && !k.startsWith("classes/")
        })), async (path, value) => { return readZipEntry(path, value) }));

        return {mods, data: otherData};
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

    readZipEntry: readZipEntry,
    toBuffer: toBuffer
}