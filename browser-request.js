const fs = require('fs');
var chokidar = require('chokidar');

const config = require('./config');
const Instance = require('./instance');

let isSilent = false

if(!fs.existsSync(config.directories.browserRequests)){fs.writeFileSync(config.directories.browserRequests, "[]", {recursive: true})}

let watcher = chokidar.watch(config.directories.browserRequests, {persistent: true});
watcher.on('all', (e, p, s) =>
{
    // Delete
    if(e=='unlink')
    {
        
    }
    // Add (or init)
    if(e=='add' || e=="change")
    {
        let parsed = [];
        try{parsed=JSON.parse(fs.readFileSync(config.directories.browserRequests))}
        catch(err){fs.writeFileSync(config.directories.browserRequests, "[]")}
        
        for(let r of JSON.parse(fs.readFileSync(config.directories.browserRequests)))
        {
            (async () =>
            {
                console.log("Browser request:",r.type)
                switch(r.type)
                {
                    case "ephemeral-instance":
                    {
                        Instance.ephemeralInstance(r.loader, r.version, r.mods);
                        break;
                    }
                    case "silent":
                    {
                        isSilent = true
                        break;
                    }
                    default: { console.warn("Unrecognized browser request:",r); break;}
                }
            })()
            fs.writeFileSync(config.directories.browserRequests, "[]", {recursive: true});
        }
    }
})

module.exports = () => {return isSilent;}