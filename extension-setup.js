const { exec, execSync } = require("child_process");
const { app } = require('electron');
const fs = require("fs");
const path = require("path");
const os = require("os");
const config = require('./config');

const version = "0.1.22";

// chmod +x ".../extension/host.mjs"

module.exports = 
{
    firefox: async () =>
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
            appData: path.join(app.getPath('appData'), 'Modpack Maker'),
            version
        }

        if(!fs.existsSync(config.directories.extension)){fs.mkdirSync(config.directories.extension, {recursive: true})}

        let checkedVersion = false;
        if(fs.existsSync(path.join(config.directories.extension, "host.json"))) {checkedVersion = JSON.parse(fs.readFileSync(path.join(config.directories.extension, "host.json"))).version == version};
        fs.writeFileSync(path.join(config.directories.extension, "host.json"), JSON.stringify(hostData), {recursive: true});

        const manifestPath = path.join(hostDir, "modpack_maker.json");

        // Manifest
        const hostPath = path.join(config.directories.extension, "host.mjs");
        fs.copyFileSync(path.join(__dirname, "host.mjs"), hostPath);

        let nodePath = execSync('node -p "process.execPath"').toString().split("\n")[0];
        let hostScript = fs.readFileSync(path.join(__dirname, "host.mjs")).toString("utf8");
        console.log(nodePath)
        hostScript = "#!"+nodePath+"\n"+hostScript

        console.log(hostScript)
        fs.writeFileSync(hostPath, hostScript);

        const manifest =
        {
            name: "modpack_maker",
            description: "Native Modpack-Maker host",
            path: hostPath,
            type: "stdio",
            allowed_extensions: ["modpack_maker@example.com"]
        };

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        try{execSync(`chmod +x "${hostPath}"`)}catch(err){console.warn(err)}

        if(checkedVersion){return}

        const addonPath = path.join(__dirname, "modpack_maker.xpi");

        // Construct the "file://" URL (Firefox understands this)
        const fileUrl = `file://${addonPath.replace(/\\/g, "/")}`;

        exec(`${process.platform==="win32"?'start firefox':(process.platform=='darwin'?'open -a Firefox':'firefox')} "${fileUrl}"`, (err) =>
        {
            if(err) {console.error("Failed to open Firefox:", err)}
        });

        console.log("Successfully installed Firefox extension version",version)
    }
}