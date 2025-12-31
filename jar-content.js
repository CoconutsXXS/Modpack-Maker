const { spawn, exec, execSync } = require('child_process');
const { promises: fs, existsSync, createReadStream, createWriteStream } = require("fs")
const path = require("path")
const unzipper = require('unzipper');
const yazl = require('yazl');
const extract = require("extract-zip");
const os = require('os');

const { parseBuffer } = require("./jar-content-parser")
const config = require("./config")

async function decompileInstance(instance, version, includes = {minecraft: true, mods: true, packs: true, libraries: false, onlyJava: true})
{
    // Paths
    const instancePath = path.join(config.directories.instances, instance)
    if(!existsSync(instancePath)){return}

    const combinePath = path.join(config.directories.combinedInstances, instance)
    if(existsSync(combinePath)){await fs.rm(combinePath, {recursive: true})}
    await fs.mkdir(combinePath, {recursive: true})

    const decompilePath = path.join(config.directories.decompiledInstances, instance)
    if(existsSync(decompilePath)){await fs.rm(decompilePath, {recursive: true})}
    await fs.mkdir(decompilePath, {recursive: true})

    // Copy
    if(includes.libraries)
    {
        await libraryWalk(path.join(instancePath, "minecraft", "libraries"))
        async function libraryWalk(parent)
        {
            for(const c of await fs.readdir( parent ))
            {
                const p = path.join(parent, c);

                if(p.endsWith("net"+path.sep+"minecraft")){continue}

                if((await fs.stat( p )).isDirectory())
                {
                    await libraryWalk(p)
                }
                else if(p.endsWith(".jar"))
                {
                    try
                    {
                        await createReadStream(p).pipe(unzipper.Parse()).on('entry', async entry =>
                        {
                            const type = entry.type;

                            if(type === 'File' && (!includes.onlyJava || entry.path.endsWith('.class')))
                            {
                                const dest = path.join(combinePath, entry.path);
                                await fs.mkdir(path.dirname(dest), { recursive: true });
                                await entry.pipe(createWriteStream(dest))
                            }
                            else
                            {
                                entry.autodrain();
                            }
                        })
                        .promise()
                    }
                    catch(err){console.warn(err)}
                }
            }
        }            
    }
    if(includes.minecraft)
    {
        const minecraftDecompiledPath = await decompileMinecraft(version);

        await createReadStream(minecraftDecompiledPath).pipe(unzipper.Parse()).on('entry', async entry =>
        {
            const type = entry.type;

            if(type === 'File' && (!includes.onlyJava || entry.path.endsWith('.class')))
            {
                const dest = path.join(combinePath, entry.path);

                await fs.mkdir(path.dirname(dest), { recursive: true });
                await entry.pipe(createWriteStream(dest))
            }
            else
            {
                entry.autodrain();
            }
        })
        .promise()
    }
    if(includes.mods)
    {
        const modsPath = path.join(instancePath, "minecraft", "mods");
        for(const mods of await fs.readdir( modsPath ))
        {
            if(!mods.endsWith(".jar")){continue}

            await createReadStream(path.join(modsPath, mods)).pipe(unzipper.Parse()).on('entry', async entry =>
            {
                const type = entry.type;

                if(type === 'File' && (!includes.onlyJava || entry.path.endsWith('.class')))
                {
                    const dest = path.join(combinePath, entry.path);
                    await fs.mkdir(path.dirname(dest), { recursive: true });
                    await entry.pipe(createWriteStream(dest))
                }
                else
                {
                    entry.autodrain();
                }
            })
            .promise()
        }
    }
    if(includes.packs)
    {
        // TODO: Use actual hierarchy priority
        const packsPath = path.join(combinePath, "packs");
        if(!existsSync(packsPath)){fs.mkdir(packsPath, {recursive: true})}

        const rpPath = path.join(instancePath, "minecraft", "resourcepacks");
        for(const rp of await fs.readdir( rpPath ))
        {
            if(rp.endsWith(".zip"))
            {
                await extract( path.join(rpPath, rp), { dir: path.join(packsPath, rp) } )
            }
            else if((await fs.stat( path.join(rpPath, rp) )).isDirectory())
            {
                await fs.cp(path.join(rpPath, rp), packsPath, { recursive: true, force: false })
            }
        }
    }

    // Decompile
    await run(await getJava('22'), ['-jar', path.resolve(__dirname, "fernflower.jar"), '-r', combinePath, decompilePath]);

    return decompilePath
}

async function decompileMinecraft(version)
{
    const dir = path.join(config.directories.unobfuscated, version+'.jar');
    if(existsSync(dir)) { return dir; }
    await fs.mkdir(dir, {recursive: true})

    const javaVersion = (await (await fetch((await (await fetch("https://piston-meta.mojang.com/mc/game/version_manifest.json")).json()).versions.find(v=>v.id==version).url)).json()).javaVersion.majorVersion

    await run(path.normalize(await getJava(javaVersion)), ['-jar', path.normalize(path.resolve(__dirname, 'minecraft-decompiler.jar')), '--version', version, '--decompile', '--side', 'CLIENT', '--output', dir])

    fs.rm(path.resolve(__dirname, 'downloads'), { recursive: true, force: true })
    
    return dir;
}

const zipCache = {}

module.exports = class InstanceContent
{
    name;
    version;
    path;

    elements = {}
    indexer = {}
    hierarchyIndexer = {}
    zips = {}

    decompiledPath;

    // Creation
    static async from(name, verion, decompiled)
    {
        const r = new InstanceContent()
        await r.from(name, verion, decompiled)
        console.log(r)
        return r;
    }
    
    async from(name, version, decompile = false)
    {
        this.name = name;
        this.path = path.join(config.directories.instances, name, "minecraft")

        if(!version && existsSync(path.join(config.directories.instances, name, '.instance-data.json'))) { version = JSON.parse(await fs.readFile(path.join(config.directories.instances, name, '.instance-data.json')))?.version?.number }
        if(!version){return}
        this.version = version;

        if(decompile)
        { this.decompiledPath = await fs.mkdtemp(path.join(os.tmpdir(), name+"-decompiled")) }

        if(!existsSync(this.path)){return}

        // Minecraft
        {
            const p = path.join("versions", version, version+'.jar');
            const content = []

            const directory = await unzipper.Open.file( await decompileMinecraft(version) );

            for(const f of directory.files)
            {
                if(f.type != "File"){continue}
                content[f.path] = f

                const indexer = this.indexer[f.path] || []
                indexer.push(p)
                this.indexer[f.path] = indexer
                setProp(this.hierarchyIndexer, f.path.split('/'), indexer)

                if(decompile && (f.path.endsWith(".class") || f.path.endsWith(".java")))
                {
                    const decompilePath = path.join(this.decompiledPath, f.path);
                    if(!existsSync(path.dirname(decompilePath))) { await fs.mkdir(path.dirname(decompilePath), { recursive: true }) }
                    await fs.writeFile(decompilePath, await f.buffer())
                }
            }

            this.elements[p] = content
        }

        // Mods
        for(const c of await fs.readdir( path.join(this.path, "mods") ))
        {
            if(!c.endsWith('.jar')){continue}

            const p = path.join("mods", c);
            const content = []

            const zip = await unzipper.Open.file( path.join(this.path, p) );
            for(const f of zip.files)
            {
                if(f.type != "File"){continue}
                content[f.path] = f
                const indexer = this.indexer[f.path] || []
                indexer.push(p)
                this.indexer[f.path] = indexer
                setProp(this.hierarchyIndexer, f.path.split('/'), indexer)

                if(decompile && (f.path.endsWith(".class") || f.path.endsWith(".java")))
                {
                    const decompilePath = path.join(this.decompiledPath, f.path);
                    if(!existsSync(path.dirname(decompilePath))) { await fs.mkdir(path.dirname(decompilePath), { recursive: true }) }
                    await fs.writeFile(decompilePath, await f.buffer())
                }
            }

            this.elements[p] = content
            zipCache[path.join(this.path, p)] = zip
        }

        // Resourcepacks
        for(const c of await fs.readdir( path.join(this.path, "resourcepacks") ))
        {
            const p = path.join("resourcepacks", c);
            const content = []

            if(c.endsWith('.zip'))
            {
                const zip = await unzipper.Open.file( path.join(this.path, p) );
                for(const f of zip.files)
                {
                    if(f.type != "File"){continue}
                    content[f.path] = f
                    const indexer = this.indexer[f.path] || []
                    indexer.push(p)
                    this.indexer[f.path] = indexer
                    setProp(this.hierarchyIndexer, f.path.split('/'), indexer)
                }
                zipCache[path.join(this.path, p)] = zip
            }
            else if((await fs.stat(path.join(this.path, p))).isDirectory())
            {
                await packWalk( path.join(this.path, p) )
                async function packWalk(parent)
                {
                    for(const c of await fs.readdir( parent ))
                    {
                        const sp = path.join(parent, c);

                        if((await fs.stat( sp )).isDirectory())
                        {
                            await packWalk(sp)
                        }
                        else
                        {
                            const entryPath = sp.slice(this.path.length)
                            const keys = entryPath.split('/');
                            content[entryPath] = entry
                            const indexer = this.indexer[entryPath] || []
                            indexer.push(p)
                            this.indexer[entryPath] = indexer
                            setProp(this.hierarchyIndexer, keys, indexer)
                        }
                    }
                }  
            }

            this.elements[p] = content
        }

        if(decompile)
        {
            await run(await getJava('22'), ['-jar', path.resolve(__dirname, "fernflower.jar"), '-r', this.decompiledPath, this.decompiledPath]);
        }
    }

    // Files
    async get(location, resolver = files => files[0])
    {
        const index = this.indexer[location]
        if(!index) { return null }

        const elementPath = await resolver(index)
        if(!elementPath) { return null }

        const element = this.elements[elementPath]
        if(!element) { return null }

        const entry = element[location]
        if(!entry) { return null }

        const buffer = await entry?.buffer();
        if(!buffer) { return null }

        return {
            entry,
            buffer,
            origin: elementPath,
            path: location,
            value: await parseBuffer(buffer, location, this.decompiledPath, null)
        };
    }

    async write(origin, files)
    {
        if((await fs.stat(path.join(this.path, origin))).isFile())
        {
            const directory = zipCache[origin] ? zipCache[origin] : await unzipper.Open.file(path.join(this.path, origin));
            const zip = new yazl.ZipFile();

            // Build Content
            for (const entry of directory.files)
            {
                if(entry.type != "File" || files.includes(f=>f.location == entry.path)) { continue }

                zip.addBuffer(await entry.buffer(), entry.path);
            }

            // Build Modified Content
            for (const f of files)
            {
                zip.addBuffer(Buffer.from(f.buffer), f.location);
            }

            zip.outputStream.pipe(createWriteStream(path.join(this.path, origin)));
            zip.end();
        }
        else
        {
            for (const f of files)
            {
                await fs.writeFile(path.join(this.path, origin, f.location), Buffer.from(f.buffer));
            }
        }
    }
}

function getProp(obj, keys)
{
    let current = obj;
    keys.slice(0, -1).forEach(k =>
    {
        if (!(k in current)) return undefined;
        current = current[k];
    });
    return current[keys[keys.length - 1]]
}
function setProp(obj, keys, value)
{
    let current = obj;
    keys.slice(0, -1).forEach(k =>
    {
        if (!(k in current)) current[k] = {};
        current = current[k];
    });
    current[keys[keys.length - 1]] = value;
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