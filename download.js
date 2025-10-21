const { BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('fs')
const fsPromise = require('fs/promises')
const { download } = require("grape-electron-dl");
const {sep} = require("path")

const config = require('./config');

let downloadListeners = []

class Download
{
    static downloadData = null;
    static async download(url, dest, autoFilename = false, erase = true)
    {
        // Safely create/repair
        if(!fs.existsSync(config.directories.download)) { await fsPromise.mkdir(config.directories.download, {recursive:true}); }

        if(autoFilename) { dest = path.join(dest, decodeURI(new URL(await getRedirectLocation(url)).pathname.split(sep).pop())) }
        if(fs.existsSync(dest) && !erase){return dest}

        if(this.downloadData == null)
        {
            if(!fs.existsSync(path.join(config.directories.download, '.download-data.json')))
            {
                await fsPromise.writeFile(path.join(config.directories.download, '.download-data.json'), '[]');
                this.downloadData = [];    
            }
            else
            {
                this.downloadData = JSON.parse(await fsPromise.readFile(path.join(config.directories.download, '.download-data.json')))
            }
        }

        if(!fs.existsSync(dest.substring(0, dest.lastIndexOf(sep)))) { await fsPromise.mkdir(dest.substring(0, dest.lastIndexOf(sep)), {recursive: true}); }

        // Check if exist
        if(this.downloadData.find(d => d.url == url))
        {
            let data = this.downloadData.find(d => d.url == url);
            if(fs.existsSync(data.path))
            {
                await fsPromise.copyFile(data.path, dest);
                return dest;
            }
        }

        return new Promise(async (resolve) =>
        {
            console.log(dest, dest.substring(0, dest.lastIndexOf(sep)))
            // C:\Users\coconuts\AppData\Roaming\Modpack Maker\instances\Fabulously Optimized\minecraft/mods
            let directory = dest.substring(0, dest.lastIndexOf(sep));
            let filename = dest.replace(/^.*[\\/]/, '');

            if(!fs.existsSync(directory+sep)) { await fsPromise.mkdir(directory+sep, {recursive:true}) }

            if(BrowserWindow.getAllWindows().length > 0)
            {
                // Classic
                await download(BrowserWindow.getAllWindows()[0], url, {filename: filename, directory: directory, onCancel: i => console.warn(i), onProgress: (p) => 
                {
                    if(!downloadListeners[url]){return}
                    for(let c of downloadListeners[url]){c(p)}
                }});
            }
            else
            {
                // New
                let r = await fetch(url);
                await fsPromise.writeFile(path.join(directory, filename), Buffer.from(await r.arrayBuffer()));

                try
                {
                    await fsPromise.copyFile(path.join(directory, filename), path.join(config.directories.download, filename));
                    this.downloadData.push({url: url, path: path.join(config.directories.download, filename)});
                    await fsPromise.writeFile(path.join(config.directories.download, '.download-data.json'), JSON.stringify(this.downloadData))
                }
                catch(err) { console.warn(err) }
            }
            resolve(dest);
        })
    }
    static addDownloadListener(url, callback)
    {
        if(!downloadListeners[url]){downloadListeners[url] = []}
        downloadListeners[url].push(callback)
    }
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

module.exports = Download;