const { BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('fs')
const { download } = require("grape-electron-dl");

const config = require('./config');

class Download
{
    static downloadData = null;
    static async download(url, dest)
    {
        // Safely create/repair
        if(!fs.existsSync(config.directories.download)) { fs.mkdirSync(config.directories.download, {recursive:true}); }

        if(this.downloadData == null)
        {
            if(!fs.existsSync(path.join(config.directories.download, '.download-data.json')))
            {
                fs.writeFileSync(path.join(config.directories.download, '.download-data.json'), '[]');
                this.downloadData = [];    
            }
            else
            {
                this.downloadData = JSON.parse(fs.readFileSync(path.join(config.directories.download, '.download-data.json')))
            }
        }

        if(!fs.existsSync(dest.substring(0, dest.lastIndexOf('/')))) { fs.mkdirSync(dest.substring(0, dest.lastIndexOf('/')), {recursive: true}); }

        // Check if exist
        if(this.downloadData.find(d => d.url == url))
        {
            let data = this.downloadData.find(d => d.url == url);
            if(fs.existsSync(data.path))
            {
                fs.copyFileSync(data.path, dest);
                return;
            }
        }

        return new Promise(async (resolve) =>
        {
            let directory = dest.substring(0, dest.lastIndexOf('/'));
            let filename = dest.replace(/^.*[\\/]/, '');

            if(!fs.existsSync(directory+'/')) { fs.mkdirSync(directory+'/', {recursive:true}) }

            await download(BrowserWindow.getAllWindows()[0], url, {filename: filename, directory: directory, onCancel: i => console.warn(i)});
            try
            {
                fs.copyFileSync(dest, path.join(config.directories.download, filename));
                this.downloadData.push({url: url, path: path.join(config.directories.download, filename)});
                fs.writeFileSync(path.join(config.directories.download, '.download-data.json'), JSON.stringify(this.downloadData))
            }
            catch(err) { console.warn(err) }
            resolve();
        })
    }
}

module.exports = Download;