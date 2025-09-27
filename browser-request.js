const fs = require('fs');
var chokidar = require('chokidar');

const config = require('./config');
const Instance = require('./instance');

let isSilent = false

if(!fs.existsSync(config.directories.browserRequests)){fs.writeFileSync(config.directories.browserRequests, "[]", {recursive: true})}

let watcher = chokidar.watch(config.directories.browserRequests, {persistent: true});
watcher.on('all', (e, p, s) =>
{
    console.log(e)
    // Delete
    if(e=='unlink')
    {
        
    }
    // Add (or init)
    if(e==='add' || e==="change")
    {
        for(let r of JSON.parse(fs.readFileSync(config.directories.browserRequests)))
        {
            (async () =>
            {
                switch(r.type)
                {
                    case "ephemeral-instance":
                    {
                        await Instance.ephemeralInstance(r.loader, r.version, r.mods);
                        break;
                    }
                    case "silent":
                    {
                        isSilent = true
                        break;
                    }
                    default: {break;}
                }
            })()
            fs.writeFileSync(config.directories.browserRequests, "[]", {recursive: true});
        }
    }
})

module.exports = () => {return isSilent;}