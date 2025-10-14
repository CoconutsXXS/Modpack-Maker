import { stdin, stdout } from "process";
import fs from "node:fs/promises";
import path from "path";
import { tmpdir } from "node:os";

let buffer = Buffer.alloc(0);

stdin.on("data", (chunk) =>
{
	buffer = Buffer.concat([buffer, chunk]);

	while (buffer.length >= 4)
	{
		const length = buffer.readUInt32LE(0);

		if (buffer.length < 4 + length)
		{
			break;
		}

		const messageBuffer = buffer.slice(4, 4 + length);
		buffer = buffer.slice(4 + length);

		handleMessage(messageBuffer);
	}
});

stdin.on("error", (err) =>
{
	console.error("Stdin error:", err);
	process.exit(1);
});

stdin.resume();

function sendMessage(message)
{
	if(typeof message === "string")
	{
		message = Buffer.from(message, "utf8");
	}
	const header = Buffer.alloc(4);
	header.writeUInt32LE(message.length, 0);
	stdout.write(header);
	stdout.write(message);
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

async function log(...message)
{
	// DEBUG ONLY
	// await fs.appendFile(path.join(tmpdir(), 'host.log'), message.join(" ") + '\n');
}
let baseData = null;
async function handleMessage(messageBuffer)
{
	try
	{
		if(baseData == null){baseData = JSON.parse(await fs.readFile("./host.json"))}

		const messageText = messageBuffer.toString("utf8");
		const message = JSON.parse(messageText);

		await log(messageText)

		const listeners =
		{
			read: async (value) =>
			{
				let stat = await fs.stat(path.join(baseData.appData, value));
				await log("Reading", path.join(baseData.appData, value))
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

		if(listeners[message.name])
		{
			await log(message.name);
			try
			{
				log("start")
				let r = await listeners[message.name](message.value);
				log("send", typeof(r), r?.length)
				if(r!=undefined && r!=null){await sendLargeMessage(r);}
				else { await sendLargeMessage(''); }
				log("end")
			}
			catch(err){log(err)}
		}


		sendMessage(JSON.stringify({ received: message }));
	}
	catch (err)
	{
		await log("Message handling error:", err, "\nstack", JSON.stringify(err.stack, null, 4));
	}
}