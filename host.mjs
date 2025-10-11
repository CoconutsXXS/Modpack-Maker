#!/usr/bin/env -S /usr/local/bin/node
// TODO ^^^ adapt to system

import fs from "node:fs/promises";
import path from "path";
import { Writable } from 'stream';
import { spawn } from 'child_process';
import { exec } from "child_process";

console.error = console.warn = console.log = async (...messages) =>
{
	await fs.appendFile("/tmp/host.log", messages + "\n");
}


const TARGET =
{
  win: "CoconutsXXS.ModpackMaker",
  mac: "fr.coconuts.modpackmaker",
  linux: "modpackmaker",
};

function locateApp(cb)
{
	const p = process.platform;

	if (p === "darwin")
	{
		exec(`mdfind "kMDItemCFBundleIdentifier == '${TARGET.mac}'"`, (err, out) => cb(err, out.trim().split("\n")[0].trim() || null));
	}
	else if(p === "win32")
	{
		const ps = `powershell -Command "` + `($pkg = Get-AppxPackage -Name '${TARGET.win}').InstallLocation"`;
		exec(ps, (err, out) => cb(err, out.trim() || null));
	}
	else
	{
		exec(`which ${TARGET.linux}`, (err, out) => cb(err, out.trim() || null));
	}
}
async function launchApp(silent = true)
{
	// if(silent)
	// {
	// 	let data = JSON.parse(await fs.readFile(path.join(baseData.appData, ".browser-requests.json")));
	// 	data.push
	// 	({
	// 		type: "silent"
	// 	});
	// 	await fs.writeFile(path.join(baseData.appData, ".browser-requests.json"), JSON.stringify(data));
	// }

	locateApp((err, path) =>
	{
		if (err) console.error(err);
		else if(path)
		{
			const platform = process.platform;

			if(platform === 'darwin')
			{
				spawn('open', [path], { detached: true, stdio: 'ignore' }).unref();
			}
			else if(platform === 'win32')
			{
				// Exemple pour UWP : adapter le PackageFamilyName si besoin
				const family = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App';
				spawn('explorer.exe', [`shell:AppsFolder\\${family}`], { detached: true, stdio: 'ignore' }).unref();
			}
			else
			{
				spawn(path, [], { detached: true, stdio: 'ignore' }).unref();
			}
		}
		else console.log("App not found");
	});
}

async function getMessage()
{
	const header = new Uint32Array(1);
	await readFullAsync(1, header);
	const message = await readFullAsync(header[0]);
	return message;
}
async function readFullAsync(length, buffer = new Uint8Array(65536))
{
	const data = [];
	while (data.length < length) {
		const input = await fs.open("/dev/stdin");
		const { bytesRead } = await input.read({ buffer });
		await input.close();
		if (bytesRead === 0) {
		break;
		}
		data.push(...buffer.subarray(0, bytesRead));
	}
	return new Uint8Array(data);
}
async function sendMessage(message)
{
    const stdout = process.stdout;

    // Convertir la string en Buffer
    const messageBuffer = Buffer.from(message, 'utf8');
    
    // Préparer l'en-tête (4 bytes pour la longueur)
    const header = Buffer.alloc(4);
    header.writeUInt32LE(messageBuffer.length, 0);

    // Fonction pour écrire un buffer de manière asynchrone
    function writeAsync(stream, buffer) {
        return new Promise((resolve, reject) => {
            const ok = stream.write(buffer, (err) => {
                if (err) reject(err);
                else resolve();
            });
            if (!ok) {
                stream.once('drain', resolve);
            }
        });
    }

    // Écrire l'en-tête puis le message
    await writeAsync(stdout, header);
    await writeAsync(stdout, messageBuffer);
}

const MAX_FRAGMENT_SIZE = 100 * 1024;
async function sendLargeMessage(message)
{
	const messageBuffer = Buffer.from(message, 'utf8');
	const totalBytes = messageBuffer.length;
	const fragmentCount = Math.ceil(totalBytes / MAX_FRAGMENT_SIZE);

	for (let i = 0; i < fragmentCount; i++)
	{
		const start = i * MAX_FRAGMENT_SIZE;
		const end   = Math.min(start + MAX_FRAGMENT_SIZE, totalBytes);
		const chunk = messageBuffer.slice(start, end).toString('base64');

		const payload = JSON.stringify
		({
			index: i,
			total: fragmentCount,
			base64: chunk
		});
		await sendMessage(payload);
	}
}

let baseData = null;
while (true)
{try{
	let message = await getMessage()
	if(Buffer.from(message).length==0){continue}

	if(baseData == null){baseData = JSON.parse(await fs.readFile("./host.json"))}

	const listeners =
	{
		read: async (value) =>
		{
			await console.log(value)
			let stat = await fs.stat(path.join(baseData.appData, value));
			if(stat.isFile())
			{
				if(value.endsWith(".json"))
				{
					return await fs.readFile(path.join(baseData.appData, value), 'utf8');
				}
				else
				{ return (await fs.readFile(path.join(baseData.appData, value))).toJSON(); }
			}
			else
			{
				return JSON.stringify(await fs.readdir(path.join(baseData.appData, value)));
			}
		},
		write: async (value) =>
		{
			await fs.writeFile(path.join(baseData.appData, value.path), value.content);
		},
		save: async (value) =>
		{
			let savedList = JSON.parse(await fs.readFile(path.join(baseData.appData, "saves", 'saved.json')));

			for(let [i, e] of savedList.entries())
			{
				let noDateA = JSON.parse(JSON.stringify(value));
				let noDateB = JSON.parse(JSON.stringify(e));
				noDateA.date = noDateB.date = null;
				if(JSON.stringify(noDateA) == JSON.stringify(noDateB)) { savedList.splice(i, 1); }
			}
			savedList.push(value);

			await fs.writeFile(path.join(baseData.appData, "saves", 'saved.json'), JSON.stringify(savedList));
		},
		unsave: async (value) =>
		{
			let savedList = JSON.parse(await fs.readFile(path.join(baseData.appData, "saves", 'saved.json')));
			for(let [i, e] of savedList.entries())
			{
				if(e.url == value) { savedList.splice(i, 1); }
			}
			await fs.writeFile(path.join(baseData.appData, "saves", 'saved.json'), JSON.stringify(savedList));
		},
		isSaved: async (value) =>
		{
			let savedList = JSON.parse(await fs.readFile(path.join(baseData.appData, "saves", 'saved.json')));
			return JSON.stringify({result: savedList.find(s => s.url == value)!=undefined});
		},
		launch: async (v) =>
		{
			try{await launchApp()}catch(err){console.error(err)}
			return null;
		}
	}

	message = JSON.parse(Buffer.from(message).toString("utf-8"));

	if(listeners[message.name])
	{
		await console.log(message.name);
		try
		{
			console.log("start")
			let r = await listeners[message.name](message.value);
			console.log("send", typeof(r), r?.length)
			if(r!=undefined && r!=null){await sendLargeMessage(r);}
			else { await sendLargeMessage(''); }
			console.log("end")
		}
		catch(err){console.error(err)}
	}
}catch (e){ await console.error(e); process.exit(1); }}