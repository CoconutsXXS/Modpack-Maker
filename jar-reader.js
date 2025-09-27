const { app } = require('electron');
const fs = require('fs')
const { unzip } = require('unzipit');
const toml = require('toml');
const path = require('node:path')
const StreamZip = require('node-stream-zip');

module.exports = 
{
    jar: async function(p, dataPath=null, normalPath=false)
    {
        let entries = (await unzip( fs.readFileSync(path.join(normalPath?'':app.getPath('appData'), p)) )).entries;

        if(dataPath==null){return entries;}

        try { return await entries[dataPath].json() }
        catch(err)
        {
            try
            {
                if(!dataPath) { return entries; }
                if(entries[dataPath]==undefined){return undefined;}
                let arrayBuffer = await entries[dataPath].arrayBuffer();
    
                return handleData(Buffer.from(arrayBuffer), dataPath.split('.')[dataPath.split('.').length-1])
            }
            catch(err)
            {
                console.warn('No type found for', dataPath, err)
                return '';
            }
        }
    },
    autoData: function(path)
    {
        console.log(path)
        return handleData(fs.readFileSync(path), path.split('.')[path.split('.').length-1])
    },
    saveData: function(path, d)
    {
        fs.writeFileSync(path, encodeData(d, path.split('.')[path.split('.').length-1]))
    },
    writeRawData: function(path, d)
    {
        fs.writeFileSync(path, Buffer.from(d))
    },
    handleData,
    unzipSave: async function(from, dest)
    {
        if(!fs.existsSync(dest)){fs.mkdirSync(dest, {recursive:true})}

        const waitForFileReady = (minSize = 1e6, timeout = 10000) => new Promise((resolve, reject) => {
            const start = Date.now();
            (function check() {
            fs.stat(from, (err, stats) => {
                if (err) return reject(err);
                if (stats.size >= minSize) return resolve();
                if (Date.now() - start > timeout) return reject(new Error('ZIP file not fully available'));
                setTimeout(check, 2000);
            });
            })();
        });

        await waitForFileReady();

        // Extraire le ZIP
        return new Promise((resolve, reject) =>
        {
            const zip = new StreamZip.async({ file: from });
            zip.extract(null, dest)
            .then(() => zip.close())
            .then(resolve)
            .catch(async err => {
                await zip.close().catch(() => {});
                reject(err);
            });
        });
        // const unziped = await unzip(buffer);
        // for (const [name, entry] of Object.entries(unziped.entries))
        // {
        //     const fullPath = path.join(dest, name);
        //     if (entry.isDirectory)
        //     {
        //         fs.mkdirSync(fullPath, { recursive: true });
        //     }
        //     else
        //     {
        //         fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        //         fs.writeFileSync(fullPath, Buffer.from(await entry.arrayBuffer()))
        //     }
        // }
    }
}

function handleData(buffer, type)
{
    if(buffer==undefined){return null}
    switch(type)
    {
        case 'toml':
        {
            return parseTomlWithComments(buffer.toString('utf-8'));
        }
    }
    return buffer;
}
function encodeData(data, type)
{
    switch(type)
    {
        case 'toml':
        {
            let toml = '';
            writeValue(data, (s) => { toml+=s; })
            function writeValue(o, onChange)
            {
                for(let k of Object.keys(o))
                {
                    if(o[k].value!=undefined && o[k].comments!=undefined)
                    {
                        let s = '\n';
                        for(let c of (o[k].comments.value==undefined?o[k].comments:o[k].comments.value)){s+='#'+c+'\n'}
                        switch(typeof(o[k].value))
                        {
                            case 'string': { o[k].value = `'${o[k].value}'` }
                            case 'float': { o[k].value = `${o[k].value}` }
                        }
                        if(Array.isArray(o[k].value)) { o[k].value = JSON.stringify(o[k].value).replaceAll('"', "'") }
                        onChange(s+`${k} = ${o[k].value}`)
                    }
                    else
                    {
                        onChange(`\n\n[${k}]`);
                        writeValue(o[k], (s) => { toml+=s.replaceAll('\n', '\n    '); })
                    }
                }        
            }
            return toml;
        }
    }
    return buffer.toString('utf-8');
}

function parseTomlWithComments(content)
{
    const parsed = toml.parse(content);
    const lines = content.split('\n');

    const commentMap = {};
    let currentSection = '';
    let pendingComments = [];

    for (let line of lines)
    {
        const trimmed = line.trim();

        if (trimmed.startsWith('#'))
        {
            pendingComments.push(trimmed.slice(1).trim());
        }
        else if (trimmed.startsWith('[') && trimmed.endsWith(']'))
        {
            currentSection = trimmed.slice(1, -1);
            pendingComments = [];
        }
        else
        {
            const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=/);
            if (match) {
            const key = match[1];
            if (!commentMap[currentSection])
            {
                commentMap[currentSection] = {};
            }

            commentMap[currentSection][key] = {
                comments: pendingComments.length > 0 ? [...pendingComments] : null
            };

            pendingComments = [];
            }
        }
    }

    // Fusionner les commentaires dans la structure originale
    function mergeWithComments(data, section = null)
    {
        const result = {};
        const sectionComments = commentMap[section || ''] || {};

        for (const [key, value] of Object.entries(data))
        {
            if (typeof value === 'object' && !Array.isArray(value))
            {
                result[key] = mergeWithComments(value, key);
            }
            else
            {
                result[key] =
                {
                    value,
                    comments: sectionComments[key]?.comments || null
                };
            }
        }
        return result;
    }

    return mergeWithComments(parsed);
}