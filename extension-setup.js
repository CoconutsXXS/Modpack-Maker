const { app } = require('electron');
const fs = require("fs");
const path = require("path");
const os = require("os");
const config = require('./config');

module.exports = 
{
    firefox: () =>
    {
        // Déterminer dossier du manifeste selon OS
        let hostDir;
        if (process.platform === "win32")
        {
            hostDir = path.join(os.homedir(), "AppData/Roaming/Mozilla/NativeMessagingHosts");
        }
        else if (process.platform === "darwin")
        {
            hostDir = path.join(os.homedir(), "Library/Application Support/Mozilla/NativeMessagingHosts");
        }
        else
        {
            hostDir = path.join(os.homedir(), ".mozilla/native-messaging-hosts");
        }
        if (!fs.existsSync(hostDir)) fs.mkdirSync(hostDir, { recursive: true });


        // Host data
        let hostData =
        {
            appData: path.join(app.getPath('appData'), 'Modpack Maker')
        }
        fs.writeFileSync(path.join(config.directories.extension, "host.json"), JSON.stringify(hostData), {recursive: true});

        // Manifest
        const hostPath = path.join(config.directories.extension, "host.mjs");
        fs.copyFileSync(path.join(__dirname, "host.mjs"), hostPath);

        const manifestPath = path.join(hostDir, "modpack_maker.json");

        const manifest =
        {
            name: "modpack_maker",
            description: "Native Modpack-Maker host",
            path: hostPath,
            type: "stdio",
            allowed_extensions: ["modpack_maker@example.com"]
        };

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        console.log("Installed Firefox host.");
    }
}