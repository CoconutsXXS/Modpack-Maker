let webviewListener = null;

window.web = 
{
    loadModrinth: async function(webview, link)
    {
        document.addEventListener('keypress', e => {if(e.key == 'f'){webview.openDevTools()}})

        // webview.src = `https://modrinth.com/mod/${slug}`;
        webview.src = link;
        let url = new URL(link);
        let type = url.pathname.split('/')[1];
        let cleanType = type; if(cleanType=='resourcepack'||cleanType=='mod'){cleanType += 's'} if(cleanType=='shader'){cleanType = 'shaderpacks'}

        const sourceCode = await (await fetch('renderer/modrinth-webview.js')).text();

        webview.addEventListener('dom-ready', modify);
        async function modify()
        {
            webview.setZoomLevel(-1);

            if(webviewListener) { webview.removeEventListener('ipc-message', webviewListener) }

            webviewListener = async (event) =>
            {
                console.log(event.channel)

                switch(event.channel)
                {
                    case 'download':
                    {                  
                        for(var f of await findModrinthFile(link.split('/')[link.split('/').length-1], type=='mod'))
                        {
                            if(!f.primary){continue}

                            // Metadata
                            let meta = await (await fetch("https://api.modrinth.com/v2/project/"+f.url.split('/')[4])).json();
                            if(meta.project_type != type){continue}

                            let images = []; for(let i of meta.gallery){images.push(i.raw_url)}

                            // Mods
                            if(type=='mod')
                            {
                                let dependencies = []; for(let d of f.dependencies)
                                {
                                    let meta = await (await fetch("https://api.modrinth.com/v2/project/"+d.project_id)).json();
                                    dependencies.push({id: d.project_id, title: meta.title, slug: meta.slug})
                                }

                                await window.instance.setModData
                                ({
                                    filename: f.filename,
                                    title: meta.title,
                                    categories	: meta.categories,
                                    id: meta.id,
                                    clientRequired: meta.client_side=='required',
                                    serverRequired: meta.server_side=='required',
                                    serverSupport: meta.server_side!='unsupported',
                                    description: meta.description,
                                    longDescription: meta.body,
                                    slug: meta.slug,
                                    images,
                                    icon: meta.icon_url,
                                    dependencies
                                })
                            }

                            await download(f.url, window.instance.path+'/'+cleanType, f.filename);
                        }

                        break;
                    }
                    case 'quick-test':
                    {
                        let mods = [];
                        for(var f of await findModrinthFile(m.originalData.slug))
                        {
                            if(!f.primary){continue}
                            mods.push({url:f.url, filename:f.filename})
                        }
                        
                        await ephemeralLaunch(window.instance.loader, window.instance.version, mods);

                        break;
                    }
                }
            }
            webview.addEventListener('ipc-message', webviewListener);

            await webview.insertCSS
            (
                `#__nuxt > div.layout > main > div.experimental-styles-within > div:nth-child(4) { display:none; }
                .layout > header.experimental-styles-within.desktop-only {
                display: none !important;
                }
                .layout > footer {
                display: none !important;
                }
                .new-page.sidebar,
                .new-page.sidebar .normal-page__content,
                .new-page.sidebar .normal-page__content > section {
                max-width: 100% !important;
                }`
            )
            await webview.executeJavaScript(`window.originalLocation = "${link}";`, true)
            await webview.executeJavaScript(sourceCode, true)
        };

    },
    loadCurseforge: async function(webview, link)
    {
        document.addEventListener('keypress', e => {if(e.key == 'f'){webview.openDevTools()}})

        webview.src = link;

        // Type
        let url = new URL(link);
        let type = url.pathname.split('/')[2];
        let cleanType = type;

        let classId = 6
        switch(type)
        {
            case 'mc-mods': { classId = 6; cleanType = 'mods'; break; }
            case 'shaders': { classId = 6552; cleanType = 'shaderpacks'; break; }
            case 'texture-packs': { classId = 12; cleanType = 'resourcepacks'; break; }
        }


        const sourceCode = await (await fetch('renderer/curseforge-webview.js')).text();

        webview.addEventListener('dom-ready', modify);
        async function modify()
        {
            webview.setZoomLevel(-0.5);
            if(webviewListener) { webview.removeEventListener('ipc-message', webviewListener) }

            webviewListener = async (event) =>
            {
                console.log(event.channel)

                switch(event.channel)
                {
                    case 'download':
                    {
                        console.log(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${link.split('/')[link.split('/').length-1]}&classId=${classId}`)
                        for(var f of await findCurseforgeFile((await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${link.split('/')[link.split('/').length-1]}&classId=${classId}`)).json()).data[0].id, cleanType == 'mods'))
                        {
                            if(!f.primary){continue}

                            // Metadata
                            if(!f.slug) { f.slug = link.split('/')[link.split('/').length-1]; }
                            let meta = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${(f.slug)}&classId=${classId}`)).json()).data[0]

                            console.log(cleanType)
                            if(cleanType == 'mods')
                            {
                                let categories = []; for(let i of meta.categories){categories.push(i.name)}
                                let dependencies = []; for(let d of f.dependencies)
                                {
                                    dependencies.push({id: d.project_id, filename: d.filename, slug: d.slug, title: d.title})
                                }
                                await window.instance.setModData
                                ({
                                    filename: f.filename,
                                    title: meta.name,
                                    categories,
                                    id: meta.id,
                                    clientRequired: (meta.isClientCompatible || f.client)?(meta.isClientCompatible || f.client):true,
                                    serverRequired: f.server?f.server:true,
                                    // serverSupport: meta.server_side!='unsupported',
                                    description: meta.summary,
                                    // longDescription: meta.body,
                                    slug: meta.slug,
                                    images: await loadImages(meta.slug, meta.name),
                                    icon: meta.avatarUrl,
                                    dependencies
                                })
                            }

                            console.log('Downloading '+f.filename)
                            await download(f.url, window.instance.path+'/'+cleanType, f.filename)
                        }

                        break;
                    }
                    case 'quick-test':
                    {
                        let mods = [];
                        let modId = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${(link.split('/')[link.split('/').length-1])}`)).json()).data[0].id
                        for(var f of await findCurseforgeFile(modId))
                        {
                            if(!f.primary){continue}
                            mods.push({url:f.url, filename:f.filename})
                        }
                        
                        await ephemeralLaunch(window.instance.loader, window.instance.version, mods);

                        break;
                    }
                }
            }
            webview.addEventListener('ipc-message', webviewListener);


            await webview.insertCSS
            (
                `#__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div > *.btn-cta:not(.download-cta) { display: none !important; }
                #__next > div > footer,
                #__next > div > header,
                #__next > div > main > div.game-header,
                #__next > div > main > div.ads-layout > div.ads-layout-content > div > form,
                #__next > div > main > div.ads-layout > div.ads-layout-content > div > nav { display: none; }
                #__next > div > main,
                #__next > div > footer {
                overflow-x: hidden !important;
                }
                #__next > div > main > div.ads-layout {
                grid-template-columns: 0 auto 0 !important;
                }
                #__next,
                #__next > div > main > div.ads-layout > div.ads-layout-content,
                #__next > div > main > div.ads-layout > div.ads-layout-content > div {
                max-width: 100% !important;
                min-width: 100% !important;
                }
                #__next > div > main > div.ads-layout > div.ads-layout-content > div {
                margin: 25px !important;
                min-width: calc(100% - 50px) !important;
                grid-template-columns: 3fr 1fr !important;
                }
                #__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div > button {
                background-color: #f16436 !important;
                border: none !important;
                }
                #__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div > a:first-of-type {background-color: #f16436 !important;}
                #__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div > a {
                border: none !important;
                }
                aside > div.aside-box.project-details-box.is-modal-open {
                margin-top: -50px !important;
                }
                *::-webkit-scrollbar
                {
                    width: 8px;
                    height: 8px;
                    background: linear-gradient(-180deg, #0f0f1e, #020207) no-repeat center center fixed;
                }
                *::-webkit-scrollbar-thumb
                {
                    background: #f3f3ff50;
                }
                #__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div > button#button-quick-test{background-color: #32a912 !important;}
                #__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div > button#button-download-version-select{background-color: #333333 !important;}
                `
            )
            await webview.executeJavaScript(`window.originalLocation = "${link}";`, true)
            await webview.executeJavaScript(sourceCode, true)
        };
    },

    downloadModrinth: async function(link)
    {
        for(var f of await findModrinthFile(link.split('/')[link.split('/').length-1]))
        {
            if(!f.primary){continue}

            // Metadata
            let meta = await (await fetch("https://api.modrinth.com/v2/project/"+f.url.split('/')[4])).json();
            if(meta.project_type != 'mod'){continue}

            let images = []; for(let i of meta.gallery){images.push(i.raw_url)}
            let dependencies = []; for(let d of f.dependencies)
            {
                let meta = await (await fetch("https://api.modrinth.com/v2/project/"+d.project_id)).json();
                dependencies.push({id: d.project_id, title: meta.title, slug: meta.slug})
            }

            await window.instance.setModData
            ({
                filename: f.filename,
                title: meta.title,
                categories	: meta.categories,
                id: meta.id,
                clientRequired: meta.client_side=='required',
                serverRequired: meta.server_side=='required',
                serverSupport: meta.server_side!='unsupported',
                description: meta.description,
                longDescription: meta.body,
                slug: meta.slug,
                images,
                icon: meta.icon_url,
                dependencies
            })

            await download(f.url, window.instance.path+'/mods', f.filename);
        }
    },
    downloadCurseforge: async function(link)
    {
        for(var f of await findCurseforgeFile((await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${link.split('/')[link.split('/').length-1]}&classId=6`)).json()).data[0].id))
        {
            if(!f.primary){continue}

            // Metadata
            if(!f.slug) { f.slug = link.split('/')[link.split('/').length-1]; }
            let meta = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${(f.slug)}&classId=6`)).json()).data[0]
            console.log(meta)

            let categories = []; for(let i of meta.categories){categories.push(i.name)}
            let dependencies = []; for(let d of f.dependencies)
            {
                dependencies.push({id: d.project_id, filename: d.filename, slug: d.slug, title: d.title})
            }
            await window.instance.setModData
            ({
                filename: f.filename,
                title: meta.name,
                categories,
                id: meta.id,
                clientRequired: (meta.isClientCompatible || f.client)?(meta.isClientCompatible || f.client):true,
                serverRequired: f.server?f.server:true,
                // serverSupport: meta.server_side!='unsupported',
                description: meta.summary,
                // longDescription: meta.body,
                slug: meta.slug,
                images: await loadImages(meta.slug, meta.name),
                icon: meta.avatarUrl,
                dependencies
            })

            console.log('Downloading '+f.filename)
            await download(f.url, window.instance.path+'/mods', f.filename)
        }
    }
}



// Modrinth File Finder
async function findModrinthFile(slug, useLoader = true)
{
    console.log(slug, 'https://api.modrinth.com/v2/project/'+slug+'/version')
    const versions = (await (await fetch('https://api.modrinth.com/v2/project/'+slug+'/version')).json())
    .sort((a,b) => { return new Date(b.date_published) - new Date(a.date_published); });

    var version = versions.find(v =>
    {
        if(useLoader && !v.loaders.includes(window.instance.loader.name)){return false;} return v.game_versions.includes(window.instance.version.number)
    });
    if(!version) { return []; }

    let files = version.files;
    for (let i = 0; i < files.length; i++) { files[i].dependencies = version.dependencies; }
    for(let d of version.dependencies.filter(d => d.dependency_type=='required'))
    {
        files = files.concat(await findModrinthFile(d.project_id))
    }

    return files;
}
async function findCurseforgeFile(id, useLoader = true)
{
    // https://www.curseforge.com/api/v1/mods/1193072/files?pageIndex=0&pageSize=20&sort=dateCreated&sortDescending=true&gameVersionId=9990&removeAlphas=true
    const versions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=0&pageSize=60&sort=dateCreated&sortDescending=true&gameVersion=${window.instance.version.number}&removeAlphas=false`)).json()).data
    .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });

    console.log(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=0&pageSize=60&sort=dateCreated&sortDescending=true&gameVersion=${window.instance.version.number}&removeAlphas=false`)
    var version = versions.find(v =>
    {
        if(!useLoader){return true;}
        let valid = v.gameVersions.includes(window.instance.loader.name.charAt(0).toUpperCase() + window.instance.loader.name.slice(1));
        if(!valid && window.instance.loader.name == 'forge' && v.gameVersions.includes('NeoForge')) { valid = true; }
        if(!v.gameVersions.includes(window.instance.version.number)) { valid = false; }
        return valid;
    });
    console.log(version)
    if(!version) { return []; }

    let dependencies = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/dependencies?index=0&pageSize=60&type=RequiredDependency`)).json()).data;

    let files =
    [{
        url: `https://www.curseforge.com/api/v1/mods/${id}/files/${version.id}/download`,
        filename: version.fileName,
        primary: true,
        id,
        dependencies,
        client: version.gameVersions.includes('Client'),
        server: version.gameVersions.includes('Server')
    }];

    for(let d of dependencies)
    {
        let r = await findCurseforgeFile(d.id);
        for(let i = 0; i < r.length; i++) { r[i].slug = d.slug; r[i].title = d.title; }
        files = files.concat(r)
    }

    return files;
}

const parser = new DOMParser();
async function loadImages(slug, name)
{
    let i = [];
    let page = parser.parseFromString(await (await fetch(`https://www.curseforge.com/minecraft/mc-mods/${slug}/gallery`)).text(), "text/html");

    if(page.querySelector('.images-gallery > ul:nth-child(1)'))
    {
        for(let c of page.querySelector('.images-gallery > ul:nth-child(1)').childNodes)
        {
            if(!c.querySelector("a > img")){continue;}

            i.push(c.querySelector("a > img").src);
        }
    }

    return i;
}