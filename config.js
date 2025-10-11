const { app } = require('electron')
const path = require('node:path')
const fs = require('fs')

module.exports =
{
    directories:
    {
        instances: path.join(app.getPath('appData'), 'Modpack Maker', 'instances'),
        resources: path.join(app.getPath('appData'), 'Modpack Maker', 'resources'),
        ephemeralInstances: path.join(app.getPath('appData'), 'Modpack Maker', '.ephemeral-instances'),
        download: path.join(app.getPath('appData'), 'Modpack Maker', 'download'),
        saves: path.join(app.getPath('appData'), 'Modpack Maker', 'saves'),
        browserRequests: path.join(app.getPath('appData'), 'Modpack Maker', '.browser-requests.json'),
        extension: path.join(app.getPath('appData'), 'Modpack Maker', 'extension'),
        jre: path.join(app.getPath('appData'), 'Modpack Maker', 'JRE')
    },
    javaAgent: `${app.getAppPath()}/agent/agent.jar`
}

if(!fs.existsSync(module.exports.directories.instances)) { fs.mkdirSync(module.exports.directories.instances, {recursive: true}); }