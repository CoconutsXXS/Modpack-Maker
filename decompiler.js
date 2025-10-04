const { spawn, exec, execSync } = require('child_process');
const { promises: fs, existsSync, createWriteStream } = require('fs');
const path = require('path');
const os = require('os');
const extract = require('extract-zip')
const https = require('https');
const { Readable } = require("stream");

function run(cmd, args, opts = {})
{
    return new Promise((resolve, reject) =>
    {
        const p = spawn(cmd, args, { stdio: opts.stdio || 'inherit', shell: false });
        p.on('error', reject);
        p.on('message', (...args) => console.log)
        p.on('close', (code) =>
        {
            if (code === 0) resolve();
            else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`));
        });
    });
}
async function asyncExec(command, options, log = false)
{
    return new Promise((resolve) =>
    {
        exec(command, options, (...args) => { if(log){console.log(...args)} resolve(...args) })
    })
}
async function asyncSpawn(command, args, options, onMessage = (m)=>{}, log = false)
{
    return new Promise((resolve) =>
    {
        let childProcess = spawn(command, args, options)

        childProcess.stdout.setEncoding('utf8');
        childProcess.stdout.on('data', function(data)
        {
            onMessage(data.toString())
        });

        childProcess.stderr.setEncoding('utf8');
        childProcess.stderr.on('data', function(data)
        {
            onMessage(data.toString())
        });

        childProcess.on('close', function(code)
        {
            resolve();
        });
    })
}
async function findSingleFileRecursive(dir, ext, p = "/")
{
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries)
    {
        const full = path.join(dir, e.name);
        if(e.isDirectory())
        {
            const found = await findSingleFileRecursive(full, ext, path.join(p, e.name));
            if (found) return {file: found.file, path: found.path};
        }
        else if(e.isFile() && full.endsWith(ext))
        {
            return {file: full, path: path.join(p, e.name)};
        }
    }
    return null;
}
async function recusriveDirectory(p, file = (f) => {}, directory = (d) => {})
{
    for(let e of await fs.readdir(p, { withFileTypes: true }))
    {
        if(e.isDirectory()) { await directory(path.join(p, e.name)); await recusriveDirectory(path.join(p,e.name), file, directory); }
        else if(e.isFile()) { await file(path.join(p, e.name)); }
    }
}

async function main()
{
    const jarPath = "/Users/coconuts/Library/Application Support/Modpack Maker/instances/Structure Test/minecraft/mods/aether-1.20.1-1.5.2-neoforge.jar";
    const classFile = "/Users/coconuts/Downloads/Aether.class";
    const cfrJar = path.resolve(__dirname, 'cfr-0.152.jar');

    if(!classFile)
    {
        console.error('ERREUR: précise --class path/to/MyClass.class');
        return
    }
    if(!existsSync(cfrJar))
    {
        console.error(`ERREUR: cfr.jar introuvable à ${cfrJar}. Télécharge cfr.jar et indique --cfr path/to/cfr.jar`);
        return
    }
    if(!existsSync(classFile))
    {
        console.error(`ERREUR: class introuvable: ${classFile}`);
        return
    }
    if(jarPath && !existsSync(jarPath))
    {
        console.error(`ERREUR: jar introuvable: ${jarPath}`);
        return
    }

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'decompile-'));
    const decompOut = path.join(tmp, 'src');
    await fs.mkdir(decompOut);

    // cfr peut décompiler le .class directement
    await run('java', ['-jar', cfrJar, '--outputdir', decompOut, classFile]);

    // trouver le .java décompilé
    const javaFile = await findSingleFileRecursive(decompOut, '.java');
    if(!javaFile)
    {
        console.error('ERREUR: .java non trouvé après décompilation');
        return
    }
    console.log('Fichier Java trouvé :', javaFile);

    // MODIFY

    // Recompilation
    const compiledOut = path.join(tmp, 'classes');
    await fs.mkdir(compiledOut);
    console.log('2) (Re)compilation avec javac ->', compiledOut);

    // Si on a un jar d'origine, on le met au classpath pour résoudre d'éventuelles dépendances
    const cp = jarPath ? jarPath : '';
    const javacArgs = [];
    if (cp) javacArgs.push('-classpath', cp);
    javacArgs.push('-d', compiledOut, javaFile);

    await run('javac', javacArgs);

    // Trouver le .class recompilé correspondant (même nom)
    // On suppose que le .class compilé a le même nom de fichier que le .java (MyClass.class)
    const javaBase = path.basename(javaFile, '.java');
    const compiledClassFile = await findSingleFileRecursive(compiledOut, `${javaBase}.class`);
    if(!compiledClassFile)
    {
        console.error('ERREUR: .class recompilé non trouvé');
        process.exit(1);
    }
    console.log('Classe recompilée trouvée :', compiledClassFile);

    // Replace dans le jar si demandé
    if(jarPath)
    {
        console.log('3) Remplacement dans le jar:', jarPath);
        // il faut connaître le chemin interne du .class dans le jar (package path). On calcule la partie relative depuis compiledOut
        const relPath = path.relative(compiledOut, compiledClassFile).replace(/\\/g, '/'); // ex: com/example/MyClass.class
        // commande jar update:
        // jar uf original.jar -C compiledOut com/example/MyClass.class
        await run('jar', ['uf', jarPath, '-C', compiledOut, relPath]);
        console.log('Jar mis à jour. Classe remplacée:', relPath);
    }
    else
    {
        // si pas de jar fourni, on peut remplacer le .class source sur le disque
        const destClass = path.join(path.dirname(classFile), path.basename(compiledClassFile));
        await fs.copyFile(compiledClassFile, destClass);
        console.log(`Aucun jar fourni — .class recompilé copié sur ${destClass}`);
    }

    console.log('Terminé. Dossier temporaire (garde si tu veux):', tmp);
}


async function deleteFolderRecursive(dirPath)
{
    if(existsSync(dirPath))
    {
        let file = await fs.readFile(dirPath)
        file.forEach(async (file) =>
        {
            const curPath = path.join(dirPath, file);
            if (await fs.lstat(curPath).isDirectory())
            {
                deleteFolderRecursive(curPath);
            }
            else
            {
                await fs.unlink(curPath);
            }
        });
        await fs.rmdir(dirPath);
        console.log(`Dossier supprimé : ${dirPath}`);
    }
}

module.exports = 
{
    decompileClass: async function(buffer)
    {
        if(!Buffer.isBuffer(buffer)){buffer = Buffer.from(buffer);}
        if(!Buffer.isBuffer(buffer)){ console.warn("Cannot decompile, invalid buffer."); return; }

        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'decompile-'));

        const original = path.join(tmp, "original");
        await fs.writeFile(original, buffer)

        const destinationOut = path.join(tmp, 'src');
        await fs.mkdir(destinationOut);

        await run('java', ['-jar', path.resolve(__dirname, 'cfr.jar'), '--outputdir', destinationOut, original]);

        let result = await findSingleFileRecursive(destinationOut, '.java');
        result.file = (await fs.readFile(result.file)).toString();

        return result;
    },
    decompile: async function(jarPath)
    {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'decompile-'));

        const destinationOut = path.join(tmp, 'src');
        await fs.mkdir(destinationOut);

        await run('java', ['-jar', path.resolve(__dirname, 'procyon.jar'), '-jar', jarPath, '-o', destinationOut]);

        return destinationOut;
    },
    compile: async function(classFile, classPath, jarTarget, parameters = {minecraft: '1.20.1', forge: '47.0.0', java: '17', group: 'com.aetherteam', version: '1.5.2', name: 'aether', gradle: '8.5'})
    {
        // I just gave up... 🥀
        return

        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'compile-'));

        // Copy Jar & Extract
        let jarCopy = path.join(tmp, "jar.jar")
        await fs.copyFile(jarTarget, jarCopy)

        let decompiled = path.join(tmp, "jar")
        await fs.mkdir(path.join(tmp, "jar/src/main/java"), {recursive: true})
        await fs.mkdir(path.join(tmp, "jar/src/main/resources"), {recursive: true})
        await fs.mkdir(path.join(tmp, "jar/libs"), {recursive: true})

        // await asyncExec(`java -jar ${path.resolve(__dirname, 'jd-cli.jar')} -od ${path.join(tmp, "jar/src/main/resources")} ${jarCopy}`)
        await asyncExec(`java -jar ${path.resolve(__dirname, 'vineflower.jar')} -dgs=1 ${jarCopy} ${path.join(tmp, "first-decompile")}`)

        // await fs.copyFile(jarTarget, jarCopy)

        // await extract(jarCopy, {dir: path.join(tmp, "jar/src/main/resources")});

        // Dependencies
        let dependenciesList = "";
        let dependenciesArgs = "";
        for(let jar of JSON.parse(await fs.readFile(path.join(tmp, "first-decompile/META-INF/jarjar/metadata.json"))).jars)
        {
            console.log(jar)
            await fs.rename(path.join(path.join(tmp, "first-decompile/", jar.path)), path.join(path.join(tmp, "jar/libs", jar.path.slice(jar.path.lastIndexOf("/")))))

            dependenciesList += `\ncompileOnly files('${path.join("libs", jar.path.slice(jar.path.lastIndexOf("/")))}')`
            // if(jar.isObfuscated){dependenciesList += `\nruntimeOnly files('${path.join("libs", jar.path.slice(jar.path.lastIndexOf("/")))}')`}
            // else{dependenciesList += `\nimplementation '${jar.identifier.group}:${jar.identifier.artifact}:${jar.version.artifactVersion}'`}

            dependenciesArgs += `--add-external ${path.join(path.join(tmp, "jar/libs", jar.path.slice(jar.path.lastIndexOf("/"))))} \\ `
        }

        await asyncExec(`java -jar ${path.resolve(__dirname, 'vineflower.jar')} ${dependenciesArgs} -dgs=1 ${jarCopy} ${path.join(tmp, "jar/src/main/resources")}`)

        // for(let f of await fs.readdir(path.join(tmp, "jar/src/main/resources/META-INF/jarjar")))
        // {
        //     await fs.rename(path.join(path.join(tmp, "jar/src/main/resources/META-INF/jarjar", f)), path.join(path.join(tmp, "jar/libs", f)))
        //     if(f.slice(f.lastIndexOf(".")) == ".jar")
        //     {
        //         dependenciesList += `\nimplementation files('${path.join("libs", f)}')`
        //     }
        // }

        // Detect group/file.class and add to java/
        for(let f of await fs.readdir(path.join(tmp, "jar/src/main/resources")))
        {
            if((await fs.stat(path.join(path.join(tmp, "jar/src/main/resources", f)))).isDirectory())
            {
                let ok = false;
                await recusriveDirectory(path.join(tmp, "jar/src/main/resources", f), (f)=>{if(f.slice(f.lastIndexOf("."))==".java"){ok=true;}})
                if(ok)
                {
                    await fs.rename(path.join(path.join(tmp, "jar/src/main/resources", f)), path.join(path.join(tmp, "jar/src/main/java", f)))
                }
            }
        }

        // // Convert .class to java
        // await recusriveDirectory(path.join(tmp, "jar/src/main/java"), async (f) =>
        // {
        //     await fs.writeFile(f.slice(0, f.lastIndexOf('.'))+".java", (await this.decompileClass(await fs.readFile(f))).file);
        //     await fs.unlink(f);
        // })

        console.log(decompiled)

        // Settings
        function generateGradleBuild(errorMessage = true)
        {
            return `buildscript {
    repositories {
        maven {
            name = "forge"
            url = "https://maven.minecraftforge.net/"
        }
        mavenCentral()
    }
    dependencies {
        classpath "net.minecraftforge.gradle:ForgeGradle:6.0.+"
    }
}

apply plugin: "net.minecraftforge.gradle"
apply plugin: "java"

group = '${parameters.group}'
version = '${parameters.version}'
archivesBaseName = '${parameters.name}'

repositories {
    maven {
        name = 'Forge'
        url = uri('https://maven.minecraftforge.net')
    }
    mavenCentral()
}

configurations.all {
    resolutionStrategy {
        eachDependency { details ->
            def group = details.requested.group
            def name = details.requested.name
            def version = details.requested.version
            def artifactPath = file("libs/\${name}-\${version}.jar")
            if (!artifactPath.exists()) {
                ${errorMessage?`println "DEPENDENCY TO ADD \${group}:\${name}:\${version}\\n"`:''}
            }
        }
    }
}
sourceSets {
    main {
        java {
            exclude 'top/theillusivec4/curios/common/integration/**'
            exclude 'com/aetherteam/aether/integration/**'
            exclude 'com/aetherteam/nitrogen/integration/**'
        }
    }
}

tasks.withType(JavaCompile)
{
    options.failOnError = true
}

dependencies {
    minecraft 'net.minecraftforge:forge:${parameters.minecraft}-${parameters.forge}'${dependenciesList}
}

minecraft {
    mappings channel: 'official', version: '${parameters.minecraft}'
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(${parameters.java})
    }
}`
        }
        await fs.writeFile(path.join(decompiled, "build.gradle"), generateGradleBuild())
        await fs.writeFile(path.join(decompiled, "settings.gradle"), `rootProject.name = '${parameters.name}'`)

        // Cleanup Gradle
        await deleteFolderRecursive(path.join(decompiled, 'gradle', 'wrapper'));
        if(existsSync(path.join(decompiled, 'gradlew'))) { await fs.unlink(path.join(decompiled, 'gradlew')) }
        if(existsSync(path.join(decompiled, 'gradlew.bat'))) { await fs.unlink(path.join(decompiled, 'gradlew.bat')) }

        // SDKMAN 
        if (!existsSync(path.join(process.env.HOME, '.sdkman')))
        {
            console.log('SDKMAN installation...');
            await asyncExec(`curl -s "https://get.sdkman.io" | bash`, { shell: '/bin/bash' });
        }

        const sdkmanInit = path.join(process.env.HOME, '.sdkman', 'bin', 'sdkman-init.sh');
        if(!existsSync(sdkmanInit)) { throw new Error('sdkman-init.sh unfound after installation.'); }

        // Install Gradle
        const installGradleScript = `source "${sdkmanInit}"\nsdk install gradle ${parameters.gradle}\ngradle -v`

        console.log('Gradle', parameters.gradle, 'installation via SDKMAN...');
        await asyncExec(installGradleScript, { shell: '/bin/bash' });

        const blank = await fs.mkdtemp(path.join(os.tmpdir(), 'empty-gradle-'));

        console.log('Gradle init...');
        await asyncExec("gradle init", { cwd: blank })

        console.log('Gradle wrapping...');
        await asyncExec(`gradle wrapper --gradle-version ${parameters.gradle}`, { cwd: blank })

        await fs.rename(path.join(blank, "gradle/"), path.join(decompiled, "gradle/"))
        await fs.rename(path.join(blank, "gradlew"), path.join(decompiled, "gradlew"))
        await fs.rename(path.join(blank, "gradlew.bat"), path.join(decompiled, "gradlew.bat"))

        console.log('Building...');

        const env = { ...process.env };
        let javaHome = null;
        if (process.platform != 'win32') {javaHome = execSync(`/usr/libexec/java_home -v ${parameters.java}`).toString().trim()}
        if (javaHome) {env.JAVA_HOME = javaHome}
        await asyncSpawn(process.platform === "win32"?"gradlew.bat":"./gradlew", ['build'], { cwd: decompiled, env, shell: true }, (m) =>
        {
            for(let p of m.split("\n"))
            {
                if(!p.includes('DEPENDENCY TO ADD ')){continue}
                p = p.replace("DEPENDENCY TO ADD ", '').replaceAll('\n','');
                if(p.length == ""){continue;}
                dependenciesList += `\ncompileOnly "${p}"`
            }
        })

        await fs.writeFile(path.join(decompiled, "build.gradle"), generateGradleBuild(false))
        console.log(path.join(decompiled, "build.gradle"))


        let missingDependencies = [];
        await asyncSpawn(process.platform === "win32"?"gradlew.bat":"./gradlew", ['build'], { cwd: decompiled, env, shell: true }, (m) =>
        {
            const cannotFindSymbolRegex = /error: cannot find symbol[\s\S]*?symbol:\s*(?:class|method|variable)?\s*(\S+)/g;
            const packageDoesNotExistRegex = /error: package (\S+) does not exist/g;

            let match;
            const missingSymbols = [];

            while((match = cannotFindSymbolRegex.exec(m)) !== null)
            {
                missingSymbols.push(match[1]);
            }
            while((match = packageDoesNotExistRegex.exec(m)) !== null)
            {
                missingSymbols.push(match[1]);
            }

            missingDependencies = missingDependencies.concat(missingSymbols)
        })

        console.log(missingDependencies)

        let jdepsResult = path.join(tmp, "jdeps.txt")
        await asyncExec(`jdeps -verbose:class build/classes/java/main > ${jdepsResult}`)
        console.log(jdepsResult)

        // await asyncSpawn(process.platform === "win32"?"gradlew.bat":"./gradlew", ['build'], { cwd: decompiled, env, shell: true }, (m) =>
        // {
        //     console.log(m)
        // })



        // console.log(`cd ${decompiled}\nJAVA_HOME=$(/usr/libexec/java_home -v ${parameters.java}) ${process.platform === "win32"?"gradlew.bat":"./gradlew"} build`)
        // await asyncSpawn(`JAVA_HOME=$(/usr/libexec/java_home -v ${parameters.java}) ${process.platform === "win32"?"gradlew.bat":"./gradlew"} build`, { cwd: decompiled }, (m) =>
        // {
        //     console.log(m);
        // })

        // for(let jar of await fs.readdir(path.join(decompiled, "build", "libs")))
        // {
        //     console.log(path.join(decompiled, "build", "libs", jar))
        // }
    }
}