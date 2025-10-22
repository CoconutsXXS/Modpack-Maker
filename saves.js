const path = require('node:path')
const fs = require('fs')
const chokidar = require('chokidar');

const config = require('./config');


if(!fs.existsSync(path.join(config.directories.saves, 'packs'))){fs.mkdirSync(path.join(config.directories.saves, 'packs'), {recursive:true})}
let packsWatcher = chokidar.watch(path.join(config.directories.saves, 'packs'), {persistent: true});
packsWatcher.on('all', (e, p, s) =>
{
    // Delete
    if(e=='unlink')
    {
        
    }
    // Add (or init)
    if(e==='add')
    {
        if(!p.endsWith('.json')){return}
        let data = JSON.parse(fs.readFileSync(p));

        data.getDownloadList = function(minecraft, loader)
        {
            let r = [];
            for(let c of data.content)
            {
                if(data.versions && data.versions.include(v=>v.loader==loader&&v.number==minecraft))
                {
                    r.push({url: c.url, path: c.path, data:
                    {
                        name: c.name,
                        description: c.description,
                        icon: c.icon,
                        originURL: c.originURL
                    }})
                }
            }

            return r;
        }

        Saves.packs.push(data)
    }
})

if(!fs.existsSync(path.join(config.directories.saves, 'saved.json'))){ fs.writeFileSync(path.join(config.directories.saves, 'saved.json'), "[]", {recursive:true}); }
let savedWatcher = chokidar.watch(path.join(config.directories.saves, 'saved.json'), {persistent: true});
savedWatcher.on('all', (e, p, s) =>
{
    // Delete
    if(e=='unlink')
    {
        fs.writeFileSync(path.join(config.directories.saves, 'saved.json'), "[]", {recursive:true});
        Saves.saved = [];
    }
    // Add (or init)
    if(e==='add'||e==="change")
    {
        if(!p.endsWith('.json')){return}
        Saves.saved = JSON.parse(fs.readFileSync(p));
    }
})

class Saves
{
    static packs = [];
    static favourites = [];
    static saved = [];
    static videos = [];

    // Pack
    static addPack = async function(name, data =
        {
            name: "",
            description: "",
            content: [],
            virtualDirectories: []
        })
    {
        data.name = name;
        if(name==''){return;}
        fs.writeFileSync(path.join(config.directories.saves, 'packs', name+'.json'), JSON.stringify(data));
    }
    static renamePack = async function(oldN, newN)
    {
        let ogN = newN;
        let i = 1;
        while(fs.existsSync(path.join(config.directories.saves, 'packs', newN+'.json')))
        {
            newN=ogN+"_"+i;
            i++;
        }

        fs.renameSync(path.join(config.directories.saves, 'packs', oldN+'.json'), path.join(config.directories.saves, 'packs', newN+'.json'));

        let d = JSON.parse(fs.readFileSync(path.join(config.directories.saves, 'packs', newN+'.json')));
        d.name = newN;
        fs.writeFileSync(path.join(config.directories.saves, 'packs', newN+'.json'), JSON.stringify(d));
    }
    static addPackListener(name, callback)
    {
        if(!fs.existsSync(path.join(config.directories.saves, 'packs', name+'.json')))
        {
            fs.writeFileSync(path.join(config.directories.saves, 'packs', name+'.json'), JSON.stringify
            ({
                name: name,
                description: "",
                content: [],
                virtualDirectories: []
            }));
        }
        let watcher = chokidar.watch(path.join(config.directories.saves, 'packs', name+'.json'), {persistent: true});

        watcher.on('all', (e, p, s) =>
        {
            if(e=='unlink')
            {
                
            }
            else if(e==='add' || e==="change")
            {
                callback(JSON.parse(fs.readFileSync(path.join(config.directories.saves, 'packs', name+'.json'))))
            }
        })
    }

    // Saved
    static addSaved = function(data =
        {
            name: "",
            description: "",
            icon: "",
            url: ""
        })
    {
        for(let [i, e] of Saves.saved.entries())
        {
            if(JSON.stringify(e) == JSON.stringify(data)) { Saves.saved.splice(i, 1); }
        }
        Saves.saved.push(data);
        fs.writeFileSync(path.join(config.directories.saves, 'saved.json'), JSON.stringify(Saves.saved));
    }
    static deleteSaved = function(url)
    {
        for(let [i, e] of Saves.saved.entries())
        {
            if(e.url == url) { Saves.saved.splice(i, 1); }
        }
        fs.writeFileSync(path.join(config.directories.saves, 'saved.json'), JSON.stringify(Saves.saved));
    }
}

module.exports = Saves;