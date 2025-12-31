const { spawn } = require('child_process');
const nbt = require('prismarine-nbt');
const { promises: fs, existsSync, createReadStream, createWriteStream } = require("fs")
const path = require("path")
const os = require('os');
const config = require('./config');

const textDecoder = new TextDecoder()

module.exports = 
{
    async parseBuffer(buffer, location, decompiledPath = null, extension = null)
    {
        if(!buffer) { return null; }
        if(location && !extension) { extension = location.slice(location.lastIndexOf('.')+1) }
        extension = extension.toLowerCase();

        if(["class"].includes(extension))
        {
            // Single decompile
            if(!location || !decompiledPath || !existsSync(path.join(decompiledPath, location.slice(0, location.lastIndexOf('.')+1)+'java')))
            {
                if(!location) { return null; }

                const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'decompile'));

                const original = path.join(tmp, "original.class");
                await fs.writeFile(original, buffer)

                const out = path.join(tmp, 'src');
                await fs.mkdir(out);

                await run(await getJava('22'), ['-jar', path.resolve(__dirname, "fernflower.jar"), original, out]);

                const javaBuffer = (await fs.readFile(path.join(out, 'original.java'))).buffer
                return textDecoder.decode(javaBuffer);
            }
            else if(existsSync(path.join(decompiledPath, location.slice(0, location.lastIndexOf('.')+1)+'java')))
            {
                const buffer = (await fs.readFile(path.join(decompiledPath, location.slice(0, location.lastIndexOf('.')+1)+'java'))).buffer
                return textDecoder.decode(buffer);
            }
            else
            {
                return textDecoder.decode(buffer);
            }
        }
        else if(["nbt"].includes(extension))
        {
            const parsed = (await nbt.parse(buffer)).parsed
            const simplified = nbt.simplify(parsed);

            let size = {x: 0, y: 0, z: 0}
            if(simplified.size)
            {
                size = {x: simplified.size[0], y: simplified.size[1], z: simplified.size[2]}
            }

            let blocks = [];
            if(simplified.blocks)
            {
                for(let b of simplified.blocks)
                {
                    blocks.push
                    ({
                        position: {x: b.pos[0], y: b.pos[1], z: b.pos[2]},
                        id: simplified.palette[b.state].Name,
                        properties: simplified.palette[b.state].Properties
                    })
                }                
            }

            let entities = [];
            if(simplified.entities)
            {
                for(let b of simplified.entities)
                {
                    entities.push
                    ({
                        blockPosition: {x: b.blockPos[0], y: b.blockPos[1], z: b.blockPos[2]},
                        position: {x: b.pos[0], y: b.pos[1], z: b.pos[2]},
                        data: b.nbt
                    })
                }                
            }

            let result =
            {
                blocks,
                size,
                entities
            };
            Object.assign(result, simplified);

            return {
                simplified: result,
                raw: parsed
            }
        }
        else if(["png", "jpeg", "jpg"].includes(extension))
        {
            return buffer.toString('base64')
        }
        else
        {
            return textDecoder.decode(buffer)
        }
    },
    rawNbtToBuffer(raw)
    {
        return nbt.writeUncompressed(raw, 'big')
    }
}

function run(cmd, args, opts = {})
{
    return new Promise((resolve, reject) =>
    {
        const p = spawn(cmd, args, { stdio: opts.stdio || 'inherit', shell: false });
        p.on('error', (err) => {console.error(err); reject(err)});
        p.on('message', (...args) => console.log)
        p.on('close', (code) =>
        {
            if (code === 0) resolve();
            else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`));
        });
    });
}
async function getJava(version, listeners = null)
{
    version = version.toString()

    if(existsSync(path.join(config.directories.jre, `java-${version}`, 'Contents','Home','bin','java')))
    { return path.join(config.directories.jre, `java-${version}`, 'Contents','Home','bin','java') }
    else if(existsSync(path.join(config.directories.jre, `java-${version}`, 'bin', 'javaw.exe')))
    { return path.join(config.directories.jre, `java-${version}`, 'bin', 'javaw.exe') }
    else if(existsSync(path.join(config.directories.jre, `java-${version}`, 'bin', 'java.exe')))
    { return path.join(config.directories.jre, `java-${version}`, 'bin', 'java.exe') }
    else if(existsSync(path.join(config.directories.jre, `java-${version}`, 'bin', 'java')))
    { return path.join(config.directories.jre, `java-${version}`, 'bin', 'java') }

    let win = BrowserWindow.getAllWindows()[0] || BrowserWindow.getFocusedWindow();
    let createdWin = win==undefined;
    if(createdWin)
    {
        win = new BrowserWindow({});
        win.hide();
    }

    // https://api.adoptium.net/v3/binary/latest/<major_version>/<release_type>/<os>/<arch>/<image_type>/<jvm_impl>/<heap_size>/<vendor>?project=jdk
    let os = 'windows';
    switch(platform)
    {
        case "win32": os = "windows"; break;
        case "darwin": os = "mac"; break;
        case "linux": os = "linux"; break;
        default: throw new Error(`Unsupported os: ${platform}`);
    }

    let arch = "aarch64";
    switch (process.arch)
    {
        case 'x64': arch = 'x64'; break;
        case 'arm64': arch = 'aarch64'; break;
        case 'arm': arch = 'arm'; break;
        default: throw new Error(`Unsupported arch: ${process.arch}`);
    }

    await fs.mkdir(path.join(config.directories.jre, `java-${version}`), {recursive: true})

    let link = `https://api.adoptium.net/v3/binary/latest/${version}/ga/${os}/${arch}/jre/hotspot/normal/adoptium?project=jdk`

    let res = await fetch(link, { method: "HEAD" })
    if(!res.ok){arch="x64"; link = `https://api.adoptium.net/v3/binary/latest/${version}/ga/${os}/${arch}/jre/hotspot/normal/adoptium?project=jdk`}
    

    await download(win, link, {filename: `java-${version}.tar`, directory: config.directories.jre, onProgress: async (progress) =>
    {
        if(listeners) { listeners.log('javaProgress', Math.round(progress.percent*100).toString()) }
    }});

    // await new Promise((resolve, reject) =>
    // {
    //     fs.createReadStream(path.join(config.directories.jre, `java-${version}.tar`))
    //         .pipe(unzipper.Extract({ path: path.join(config.directories.jre, `java-${version}`) }))
    //         .on("close", resolve)
    //         .on("error", reject);
    // });

    try
    {
        await tar.x
        ({
            file: path.join(config.directories.jre, `java-${version}.tar`),
            cwd: path.join(config.directories.jre, `java-${version}`),
            gzip: true
        });
    }
    catch(err)
    {
        await extract(path.join(config.directories.jre, `java-${version}.tar`), { dir: path.join(config.directories.jre, `java-${version}`) });
    }

    // Direct Directory
    const baseDir = path.join(config.directories.jre, `java-${version}`);
    const subDirs = await fs.readdir(baseDir);

    if (subDirs.length === 1)
    {
        const nestedDir = path.join(baseDir, subDirs[0]);
        const items = await fs.readdir(nestedDir);

        for(const item of items)
        {
            await fs.rename(path.join(nestedDir, item), path.join(baseDir, item));
        }

        await fs.rmdir(nestedDir);
    }

    await fs.unlink(path.join(config.directories.jre, `java-${version}.tar`))

    if(createdWin) { win.close(); }

    if(existsSync(path.join(config.directories.jre, `java-${version}`, 'Contents','Home','bin','java')))
    { return path.join(config.directories.jre, `java-${version}`, 'Contents','Home','bin','java') }
    else if(existsSync(path.join(config.directories.jre, `java-${version}`, 'bin', 'javaw.exe')))
    { return path.join(config.directories.jre, `java-${version}`, 'bin', 'javaw.exe') }
    else if(existsSync(path.join(config.directories.jre, `java-${version}`, 'bin', 'java.exe')))
    { return path.join(config.directories.jre, `java-${version}`, 'bin', 'java.exe') }
    else if(existsSync(path.join(config.directories.jre, `java-${version}`, 'bin', 'java')))
    { return path.join(config.directories.jre, `java-${version}`, 'bin', 'java') }
}