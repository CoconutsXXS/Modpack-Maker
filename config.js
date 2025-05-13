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
    },
    javaAgent: `${app.getAppPath()}/java-agent/build/libs/MinecraftAgent-0.0.1-SNAPSHOT.jar`
}

if(!fs.existsSync(module.exports.directories.instances)) { fs.mkdirSync(module.exports.directories.instances, {recursive: true}); }