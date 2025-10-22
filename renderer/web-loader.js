let webviewListener = null;

window.web = 
{
    loadModrinth: async function(webview, link)
    {
        // document.addEventListener('keypress', e => {if(e.key == 'f'){webview.openDevTools()}})

        let url = new URL(link);

        // No project
        if(url.pathname.split('/')[1] == "project")
        {
            let r = await fetch(link)

            link = r.headers.get("Location") || r.headers.get("location") || r.url;
            url = new URL(link);
        }

        webview.src = link;
        let type = url.pathname.split('/')[1];
        let cleanType = type;
        if(cleanType=='resourcepack'||cleanType=='mod'){cleanType += 's'} if(cleanType=='shader'){cleanType = 'shaderpacks'} if(cleanType=="datapack"){cleanType="mods"}


        const sourceCode = await (await fetch('scripts/modrinth-webview.js')).text();

        webview.addEventListener('dom-ready', modify);
        async function modify()
        {
            webview.setZoomLevel(-1);

            if(webviewListener) { webview.removeEventListener('ipc-message', webviewListener) }

            // Mod Data
            let m = {slug: url.pathname.split('/')[2], id: url.pathname.split('/')[2]};

            webviewListener = async (event) =>
            {
                switch(event.channel)
                {
                    case 'download':
                    {
                        let r = await window.web.downloadModrinth(link, event.args[0], event.args[1]);
                        if(!r){webview.executeJavaScript('window.incompatible()');}
                        break;
                        for(var f of await findModrinthFile(link.split('/')[link.split('/').length-1], type=='mod', false, event.args[0]))
                        {
                            console.log(f)
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
                            else
                            {
                                await window.instance[cleanType=='resourcepacks'?'setRPData':'setShaderData']
                                ({
                                    filename: f.filename,
                                    title: meta.title,
                                    categories: meta.categories,
                                    id: meta.id,
                                    description: meta.description,
                                    longDescription: meta.body,
                                    slug: meta.slug,
                                    images,
                                    icon: meta.icon_url
                                })
                            }

                            await download(f.url, window.instance.path+'/'+cleanType, f.filename);
                        }
                        break;
                    }
                    case 'quick-test':
                    {
                        let mods = [];
                        let bea = new window.BackgroundEvent("Finding file(s)...")
                        for(var f of await findModrinthFile(m.slug))
                        {
                            if(!f.primary){continue}
                            mods.push({url:f.url, filename:f.filename})
                        }
                        bea.delete()

                        let bec = new window.BackgroundEvent("Downloading files...")
                        await ephemeralLaunch(window.instance.loader, window.instance.version, mods, (p) =>
                        {
                            bec.update(p)
                            if(p==1){bec.delete()}
                        });

                        break;
                    }
                    case 'version-select':
                    {
                        let versions = await findModrinthFile(link.split('/')[link.split('/').length-1], (type=='mod'||type=="datapack"), true);
                        let allVersions = await findModrinthFile(link.split('/')[link.split('/').length-1], false, true, null, true);
                        webview.executeJavaScript('window.versionSelect('+JSON.stringify(versions).replaceAll(`'`, `\\'`)+', '+JSON.stringify(allVersions).replaceAll(`'`, `\\'`)+')')
                        break;
                    }
                    case 'save':
                    {
                        await ipcInvoke('addSaved', event.args[0]);
                        break;
                    }
                    case 'unsave':
                    {
                        await ipcInvoke('deleteSaved', event.args[0]);
                        break;
                    }
                    case "remove":
                    {
                        if(window.instance[cleanType=="mods"?"mods":cleanType=="resourcepacks"?"rp":"shaders"].find(mod => !mod.missing&&((m.slug == mod.slug&&m.slug!=undefined) || (m.id == mod.id&&m.id!=undefined) || (m.name == mod.title&&m.name!=undefined))) == undefined)
                        { console.log("mod not found")}
                        
                        window.instance[cleanType=='mods'?"deleteMod":cleanType=='resourcepacks'?"deleteRP":"deleteShader"](window.instance[cleanType=="mods"?"mods":cleanType=="resourcepacks"?"rp":"shaders"].find(mod => !mod.missing&&((m.slug == mod.slug&&m.slug!=undefined) || (m.id == mod.id&&m.id!=undefined) || (m.name == mod.title&&m.name!=undefined))).filename);
                        window.instance[cleanType=="mods"?"mods":cleanType=="resourcepacks"?"rp":"shaders"].splice(window.instance[cleanType=="mods"?"mods":cleanType=="resourcepacks"?"rp":"shaders"].findIndex(mod => !m.missing&&(m.slug == mod.slug&&m.slug!=undefined) || (m.id == mod.id&&m.id!=undefined) || (m.name == mod.title&&m.name!=undefined)), 1);
                        break;
                    }
                    case "name":
                    {
                        m.name = event.args[0];
                        break;
                    }
                }
            }
            webview.addEventListener('ipc-message', webviewListener);

            await webview.insertCSS
            (`#__nuxt > div.layout > main > div:nth-child(5) > div.new-page.sidebar > div.normal-page__content{ max-width: calc(100vw - 360px) !important; }
            #__nuxt > div.layout > main > div.experimental-styles-within > div:nth-child(4) { display:none; }
            .layout > header.experimental-styles-within.desktop-only {
            display: none !important;
            }
            .layout > footer {
            display: none !important;
            }
            .new-page.sidebar,
            .new-page.sidebar .normal-page__content,
            .new-page.sidebar .normal-page__content > section { max-width: 100% !important; }
            #versionPanel
            {
                position: fixed; left: 50%; top: 50%; translate: -50% -50%; width: 50%; max-height: 90%; min-height: 128px;
                background-color: var(--color-raised-bg);
                border-radius: var(--radius-lg);
                box-shadow: var(--shadow-card);
                z-index: 1000;
                padding: 16px;
                overflow-y: scroll;
            }
            #versionPanel::-webkit-scrollbar { display: none; }
            #panelBack{top:0;left:0;position: fixed; width:100vw; height:100vh; background: #00000050; z-index: 999;}
            #versionPanel > button
            {
                width:100%;
                height: 36px;
                display:flex;
                background: #33363d;
                color: --dark-color-text;
                border-radius: 36px;
                margin-bottom: 4px;
                padding: 9px;
                padding-left: 12px;
                cursor: pointer;
            }
            #versionPanel > button:hover{ background-color: #1bd96a; }
            #versionPanel > button:last-child{margin-bottom:0;}`)
            await webview.executeJavaScript(`window.originalLocation = "${link}";`, true)
            await webview.executeJavaScript(`window.isSaved = ${((await ipcInvoke('savedList')).find(s=>s.url==link)==undefined)?'false':'true'};`, true)

            webview.executeJavaScript(sourceCode, true)

            // Mods modif listener to update
            let modUpdateOG = window.instance[cleanType=='mods'?"onModUpdate":cleanType=='resourcepacks'?"onRPUpdate":"onShaderUpdate"];
            window.instance[cleanType=='mods'?"onModUpdate":cleanType=='resourcepacks'?"onRPUpdate":"onShaderUpdate"] = (i, mods) =>
            {
                modUpdateOG(i, mods);
                webview.executeJavaScript(`window.updateDownloaded(${(mods.find(mod => !mod.missing&&((m.slug == mod.slug&&m.slug!=undefined) || (m.id == mod.id&&m.id!=undefined) || (m.name == mod.title&&m.name!=undefined))) == undefined)?'false':'true'});`, true)
            }
            console.log(window.instance[cleanType=="mods"?"mods":cleanType=="resourcepacks"?"rp":"shaders"], m)
            await webview.executeJavaScript(`window.updateDownloaded(${(window.instance[cleanType=="mods"?"mods":cleanType=="resourcepacks"?"rp":"shaders"].find(mod => !mod.missing&&((m.slug == mod.slug&&m.slug!=undefined) || (m.id == mod.id&&m.id!=undefined) || (m.name == mod.title&&m.name!=undefined))) == undefined)?'false':'true'});`, true)
        };

    },
    loadCurseforge: async function(webview, link)
    {
        // document.addEventListener('keypress', e => {if(e.key == 'f'){webview.openDevTools()}})

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


        const sourceCode = await (await fetch('scripts/curseforge-webview.js')).text();

        let m = {slug: url.pathname.split('/')[3], id: url.pathname.split('/')[3]};

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
                        let r = await window.web.downloadCurseforge(link, event.args[0], event.args[1]);
                        if(!r){webview.executeJavaScript('window.incompatible()');}
                        break;

                        await window.web.downloadCurseforge(link, !document.getElementById("filter-version-browsing").checked, event.args[0]);
                        break;

                        for(var f of await findCurseforgeFile((await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${link.split('/')[link.split('/').length-1]}&classId=${classId}`)).json()).data[0].id, cleanType == 'mods', false, null, event.args[0]))
                        {
                            if(!f.primary){continue}

                            // Metadata
                            if(!f.slug) { f.slug = link.split('/')[link.split('/').length-1]; }
                            let meta = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${(f.slug)}&classId=${classId}`)).json()).data[0]

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
                                    dependencies,
                                    version: cleanType
                                });
                            }
                            else
                            {
                                let categories = []; for(let i of meta.categories){categories.push(i.name)}
                                await window.instance[cleanType=='resourcepacks'?'setRPData':'setShaderData']
                                ({
                                    filename: f.filename,
                                    title: meta.name,
                                    categories,
                                    id: meta.id,
                                    description: meta.summary,
                                    // longDescription: meta.body,
                                    slug: meta.slug,
                                    images: await loadImages(meta.slug, meta.name),
                                    icon: meta.avatarUrl,
                                    version: cleanType
                                })
                            }
                            console.log('Downloading '+f.filename)
                            await download(f.url, window.instance.path+'/'+cleanType, f.filename)
                        }

                        break;
                    }
                    case 'quick-test':
                    {
                        let bea = new window.BackgroundEvent("Finding file(s)...")

                        let mods = [];
                        let modId = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${(link.split('/')[link.split('/').length-1])}`)).json()).data[0].id
                        bea.update(0.5)
                        for(var f of await findCurseforgeFile(modId))
                        {
                            if(!f.primary){continue}
                            mods.push({url:f.url, filename:f.filename})
                        }

                        bea.delete()

                        let bec = new window.BackgroundEvent("Downloading files...")
                        await ephemeralLaunch(window.instance.loader, window.instance.version, mods, (p) =>
                        {
                            bec.update(p)
                            if(p==1){bec.delete()}
                        });

                        break;
                    }
                    case 'version-select':
                    {
                        let modId = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${(link.split('/')[link.split('/').length-1])}`)).json()).data[0].id

                        let versions = await findCurseforgeFile(modId, true, true);
                        let allVersions = await findCurseforgeFile(modId, false, true, null, true);
                        webview.executeJavaScript('window.versionSelect('+JSON.stringify(versions).replaceAll(`'`, `\\'`).replaceAll("\n", "\\n")+', '+JSON.stringify(allVersions).replaceAll(`'`, `\\'`).replaceAll("\n", "\\n")+')')

                        break;
                    }
                    case 'save':
                    {
                        await ipcInvoke('addSaved', event.args[0]);
                        break;
                    }
                    case 'unsave':
                    {
                        await ipcInvoke('deleteSaved', event.args[0]);
                        break;
                    }
                    case "remove":
                    {
                        if(window.instance[cleanType=="mods"?"mods":cleanType=="resourcepacks"?"rp":"shaders"].find(mod => !mod.missing&&((m.slug == mod.slug&&m.slug!=undefined) || (m.id == mod.id&&m.id!=undefined) || (m.name == mod.title&&m.name!=undefined))) == undefined)
                        { console.log("mod not found")}
                        
                        window.instance[cleanType=='mods'?"deleteMod":cleanType=='resourcepacks'?"deleteRP":"deleteShader"](window.instance[cleanType=="mods"?"mods":cleanType=="resourcepacks"?"rp":"shaders"].find(mod => !mod.missing&&((m.slug == mod.slug&&m.slug!=undefined) || (m.id == mod.id&&m.id!=undefined) || (m.name == mod.title&&m.name!=undefined))).filename);
                        window.instance[cleanType=="mods"?"mods":cleanType=="resourcepacks"?"rp":"shaders"].splice(window.instance[cleanType=="mods"?"mods":cleanType=="resourcepacks"?"rp":"shaders"].findIndex(mod => !m.missing&&(m.slug == mod.slug&&m.slug!=undefined) || (m.id == mod.id&&m.id!=undefined) || (m.name == mod.title&&m.name!=undefined)), 1);
                        break;
                    }
                    case "name":
                    {
                        m.name = event.args[0];
                        break;
                    }
                }
            }
            webview.addEventListener('ipc-message', webviewListener);


            await webview.insertCSS
            (
                `
                #versionPanel
                {
                    position: fixed;
                    left: 50%;
                    top: 50%;
                    max-width: 50vw;
                    translate: -50% -50%;
                    background: var(--rt-color-dark);
                    padding: 8px;
                    display: block;
                    max-height: 80%;
                    overflow-y: auto;
                }
                #versionPanel > button
                {
                    padding: 8px;
                    border-radius: 1px;
                    font-size: 16px;
                    color: #fff;
                    font-family: 'latoLocalFont';
                    display: block;
                    margin-top: 8px;
                    width: 100%;
                    background: #333;
                }
                #versionPanel > button:first-of-type { margin-top: 0; }
                div.ads-layout-content > div > aside > div > div:nth-child(3) > div { padding-top:8px;padding-bottom:8px; }
                div.ads-layout-content > div > aside > div > div:nth-child(3) > div:first-of-type { padding-top:32px; }
                div.ads-layout-content > div > aside > div > div:nth-child(3) > div:last-of-type { padding-bottom:32px; }
                div > footer,
                div > header,
                div > main > div.game-header,
                div.ads-layout-content > div > form,
                div.ads-layout-content > div > nav { display: none; }
                div > main,
                div > footer {
                overflow-x: hidden !important;
                }
                div > main > div.ads-layout {
                grid-template-columns: 0 auto 0 !important;
                }
                #__next,
                div.ads-layout-content,
                div.ads-layout-content > div {
                max-width: 100% !important;
                min-width: 100% !important;
                }
                div.ads-layout-content > div {
                margin: 25px !important;
                min-width: calc(100% - 50px) !important;
                grid-template-columns: 3fr 1fr !important;
                }
                div.ads-layout-content > div > aside > div > div:nth-child(3) > div > button {
                border: none !important;
                }
                div.ads-layout-content > div > aside > div > div:nth-child(3) > div > a:first-of-type {background-color: #f16436 !important;}
                div.ads-layout-content > div > aside > div > div:nth-child(3) > div > a {
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
                div.ads-layout-content > div > aside > div > div:nth-child(3) > div > button#button-quick-test{background-color: #32a912 !important;}
                div.ads-layout-content > div > aside > div > div:nth-child(3) > div > button#button-download-version-select{background-color: #333333 !important;}
                `
            )
            await webview.executeJavaScript(`window.originalLocation = "${link}";`, true)
            await webview.executeJavaScript(`window.isSaved = ${((await ipcInvoke('savedList')).find(s=>s.url==link)==undefined)?'false':'true'};`, true)

            webview.executeJavaScript(sourceCode, true)

            // Mods modif listener to update
            let modUpdateOG = window.instance[cleanType=='mods'?"onModUpdate":cleanType=='resourcepacks'?"onRPUpdate":"onShaderUpdate"];
            window.instance[cleanType=='mods'?"onModUpdate":cleanType=='resourcepacks'?"onRPUpdate":"onShaderUpdate"] = (i, mods) =>
            {
                modUpdateOG(i, mods);
                webview.executeJavaScript(`window.updateDownloaded(${(mods.find(mod => !mod.missing&&((m.slug == mod.slug&&m.slug!=undefined) || (m.id == mod.id&&m.id!=undefined) || (m.name == mod.title&&m.name!=undefined))) == undefined)?'false':'true'});`, true)
            }
            console.log(window.instance[cleanType=="mods"?"mods":cleanType=="resourcepacks"?"rp":"shaders"], m)
            await webview.executeJavaScript(`window.updateDownloaded(${(window.instance[cleanType=="mods"?"mods":cleanType=="resourcepacks"?"rp":"shaders"].find(mod => !mod.missing&&((m.slug == mod.slug&&m.slug!=undefined) || (m.id == mod.id&&m.id!=undefined) || (m.name == mod.title&&m.name!=undefined))) == undefined)?'false':'true'});`, true)
        };
    },

    downloadModrinth: async function(link, noVersionCheck = false, version = null)
    {
        // for(var f of await findModrinthFile(link.split('/')[link.split('/').length-1]))
        // {
        //     if(!f.primary){continue}

        //     // Metadata
        //     let meta = await (await fetch("https://api.modrinth.com/v2/project/"+f.url.split('/')[4])).json();
        //     if(meta.project_type != 'mod'){continue}

        //     let images = []; for(let i of meta.gallery){images.push(i.raw_url)}
        //     let dependencies = []; for(let d of f.dependencies)
        //     {
        //         let meta = await (await fetch("https://api.modrinth.com/v2/project/"+d.project_id)).json();
        //         dependencies.push({id: d.project_id, title: meta.title, slug: meta.slug})
        //     }

        //     await window.instance.setModData
        //     ({
        //         filename: f.filename,
        //         title: meta.title,
        //         categories	: meta.categories,
        //         id: meta.id,
        //         clientRequired: meta.client_side=='required',
        //         serverRequired: meta.server_side=='required',
        //         serverSupport: meta.server_side!='unsupported',
        //         description: meta.description,
        //         longDescription: meta.body,
        //         slug: meta.slug,
        //         images,
        //         icon: meta.icon_url,
        //         dependencies
        //     })

        //     await download(f.url, window.instance.path+'/mods', f.filename);
        // }

        // Clean Link

        while(link.split("/").length > 5)
        { link = link.slice(0, link.lastIndexOf('/')) }

        let url = new URL(link);

        // No project
        if(url.pathname.split('/')[1] == "project")
        {
            let r = await fetch(link)

            console.log(Array.from(r.headers.entries()))
            link = r.headers.get("Location") || r.headers.get("location") || r.url;
            console.log("redirection:", link)
            url = new URL(link);
        }

        let type = url.pathname.split('/')[1];
        let cleanType = type; if(cleanType=='resourcepack'||cleanType=='mod'){cleanType += 's'} if(cleanType=='shader'){cleanType = 'shaderpacks'} if(cleanType=="datapack"){cleanType="mods"}

        let virtualPath = '';
        if(window.explorerTab==cleanType){virtualPath=window.explorerPath}

        let sinytra = link.split('/')[link.split('/').length-1]=='connector'&&cleanType=='mods'

        let foundList = await findModrinthFile(link.split('/')[link.split('/').length-1], (type=='mod'||type=="datapack"), false, null, noVersionCheck, version);
        if(foundList.length == 0){return false;}

        for(var f of foundList)
        {
            if(!f.primary){continue}

            try{deleteMod(f.filename);}catch(err){}

            // Metadata
            let meta = await (await fetch("https://api.modrinth.com/v2/project/"+f.url.split('/')[4])).json();
            if(meta.project_type != type){continue}

            let images = []; for(let i of meta.gallery){images.push(i.raw_url)}

            // Mods
            if((type=='mod'||type=="datapack"))
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
                    dependencies,
                    sinytra,
                    virtualPath,
                    originURL: f.originURL,
                    version: f.versionData.version_number
                })
            }
            else
            {
                await window.instance[cleanType=='resourcepacks'?'setRPData':'setShaderData']
                ({
                    filename: f.filename,
                    title: meta.title,
                    categories: meta.categories,
                    id: meta.id,
                    description: meta.description,
                    longDescription: meta.body,
                    slug: meta.slug,
                    images,
                    icon: meta.icon_url,
                    virtualPath,
                    originURL: f.originURL,
                    version: f.versionData.version_number
                })
            }

            let be = new window.BackgroundEvent(meta.title, meta.icon_url)
            listenDownload(f.url, (p) =>
            {
                be.update(p.percent)
            })
            download(f.url, window.instance.path+sep()+cleanType, f.filename).then(() => be.delete());
        }

        return true
    },
    downloadCurseforge: async function(link, noVersionCheck = false, version = null)
    {
        // for(var f of await findCurseforgeFile((await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${link.split('/')[link.split('/').length-1]}&classId=6`)).json()).data[0].id))
        // {
        //     if(!f.primary){continue}

        //     // Metadata
        //     if(!f.slug) { f.slug = link.split('/')[link.split('/').length-1]; }
        //     let meta = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${(f.slug)}&classId=6`)).json()).data[0]
        //     console.log(meta)

        //     let categories = []; for(let i of meta.categories){categories.push(i.name)}
        //     let dependencies = []; for(let d of f.dependencies)
        //     {
        //         dependencies.push({id: d.project_id, filename: d.filename, slug: d.slug, title: d.title})
        //     }
        //     await window.instance.setModData
        //     ({
        //         filename: f.filename,
        //         title: meta.name,
        //         categories,
        //         id: meta.id,
        //         clientRequired: (meta.isClientCompatible || f.client)?(meta.isClientCompatible || f.client):true,
        //         serverRequired: f.server?f.server:true,
        //         // serverSupport: meta.server_side!='unsupported',
        //         description: meta.summary,
        //         // longDescription: meta.body,
        //         slug: meta.slug,
        //         images: await loadImages(meta.slug, meta.name),
        //         icon: meta.avatarUrl,
        //         dependencies
        //     })

        //     console.log('Downloading '+f.filename)
        //     await download(f.url, window.instance.path+'/mods', f.filename)
        // }

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

        let virtualPath = '';
        if(window.explorerTab==cleanType){virtualPath=window.explorerPath}

        let sinytra = link.split('/')[link.split('/').length-1]=='sinytra-connector'&&cleanType=='mods'

        let foundList = await findCurseforgeFile((await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${link.split('/')[link.split('/').length-1]}&classId=${classId}`)).json()).data[0].id, cleanType == 'mods', false, link, null, noVersionCheck, version);
        if(foundList.length == 0){return false;}

        for(var f of foundList)
        {
            if(!f.primary){continue}

            try{deleteMod(f.filename);}catch(err){}

            // Metadata
            if(!f.slug) { f.slug = link.split('/')[link.split('/').length-1]; }
            let meta = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${(f.slug)}&classId=${classId}`)).json()).data[0]

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
                    dependencies,
                    sinytra,
                    virtualPath,
                    originURL: f.originURL,
                    version: f.filename,
                })
            }
            else
            {
                let categories = []; for(let i of meta.categories){categories.push(i.name)}
                await window.instance[cleanType=='resourcepacks'?'setRPData':'setShaderData']
                ({
                    filename: f.filename,
                    title: meta.name,
                    categories,
                    id: meta.id,
                    description: meta.summary,
                    // longDescription: meta.body,
                    slug: meta.slug,
                    images: await loadImages(meta.slug, meta.name),
                    icon: meta.avatarUrl,
                    virtualPath,
                    originURL: f.originURL,
                    version: f.filename,
                })
            }

            let be = new window.BackgroundEvent(meta.name, meta.avatarUrl)
            listenDownload(f.url, (p) =>
            {
                be.update(p.percent)
                console.log(p)
            })
            download(f.url, window.instance.path+sep()+cleanType, f.filename).then(() => be.delete());
        }

        return true
    },

    findModrinthFile: findModrinthFile,
    findCurseforgeFile: findCurseforgeFile,
    findModrinthFileWithParameters: findModrinthFileWithParameters,
    findCurseforgeFileWithParameters: findCurseforgeFileWithParameters,
    findModrinthSlug: findModrinthSlug,
    findCurseforgeId: findCurseforgeId
}



async function findModrinthFile(slug, useLoader = true, list = false, versionNumber = null, noVersionCheck = false, version = null)
{
    const versions = (await (await fetch('https://api.modrinth.com/v2/project/'+slug+'/version')).json())
    .sort((a,b) => { return new Date(b.date_published) - new Date(a.date_published); });

    var version = versions[list?'filter':'find'](v =>
    {
        if(useLoader && !v.loaders.includes(window.instance.loader.name)){return false;}
        if(versionNumber != null && v.version_number != versionNumber){return false;}
        if(version && v.version_number != version){return false}
        return v.game_versions.includes(window.instance.version.number) || noVersionCheck
    });
    if(!version || version.length==0)
    {
        if(window.instance.sinytra && window.instance.loader.name=='forge')
        {
            version = versions[list?'filter':'find'](v =>
            {
                if(useLoader && !v.loaders.includes(window.instance.loader.name) && !v.loaders.includes('fabric')){return false;}
                if(versionNumber != null && v.version_number != versionNumber){return false;}
                if(version && v.version_number != version){return false}
                return v.game_versions.includes(window.instance.version.number || noVersionCheck)
            });
            if(!version || version.length==0) {  }
        }
        if(!version || version.length==0) { return []; }
    }
    if(list){return version}

    let files = version.files;
    for (let i = 0; i < files.length; i++) 
    {
        files[i].dependencies = version.dependencies;
        files[i].originURL = `https://modrinth.com/project/${slug}`;
        files[i].versionData = version;
    }
    for(let d of version.dependencies.filter(d => d.dependency_type=='required'))
    {
        let dependencieFiles = await findModrinthFile(d.project_id);
        for (let i = 0; i < dependencieFiles.length; i++) { dependencieFiles[i].originURL = `https://modrinth.com/project/${d.project_id}`; }
        files = files.concat(dependencieFiles)
    }

    return files;
}
async function findCurseforgeFile(id, useLoader = true, list = false, originURL = null, name = null, noVersionCheck = false, version = null)
{
    // https://www.curseforge.com/api/v1/mods/1193072/files?pageIndex=0&pageSize=20&sort=dateCreated&sortDescending=true&gameVersionId=9990&removeAlphas=true
    let versions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=0&pageSize=60&sort=dateCreated&sortDescending=true&gameVersion=${window.instance.version.number}&removeAlphas=false`)).json()).data
    .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });

    // Add 50+ versions
    let i = 1;
    while(true)
    {
        let newVersions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=${i}&pageSize=60&sort=dateCreated&sortDescending=true&gameVersion=${window.instance.version.number}&removeAlphas=false`)).json()).data
        .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });
        if(newVersions.length == 0){break;}

        versions = versions.concat(newVersions);
        i++;
    }

    const dependenciesData = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/dependencies?index=0&pageSize=60&type=RequiredDependency`)).json()).data;

    var version = versions[list?'filter':'find'](v =>
    {
        if(!useLoader){return true;}
        let valid = v.gameVersions.includes(window.instance.loader.name.charAt(0).toUpperCase() + window.instance.loader.name.slice(1));
        if(!valid && window.instance.loader.name == 'forge' && v.gameVersions.includes('NeoForge')) { valid = true; }
        if(!v.gameVersions.includes(window.instance.version.number) && !noVersionCheck) { valid = false; }
        if(version && v.fileName != version) { valid = false; }
        if(name != null && v.fileName != name){valid = false;}
        return valid;
    });
    if(!version || version.length==0)
    {
        if(window.instance.sinytra && window.instance.loader.name=='forge')
        {
            version = versions[list?'filter':'find'](v =>
            {
                if(!useLoader){return true;}
                let valid = v.gameVersions.includes(window.instance.loader.name.charAt(0).toUpperCase() + window.instance.loader.name.slice(1)) || v.gameVersions.includes('Fabric');
                if(!valid && window.instance.loader.name == 'fabric') { valid = true; }
                if(!v.gameVersions.includes(window.instance.version.number) && !noVersionCheck) { valid = false; }
                if(version && v.fileName != version) { valid = false; }
                if(name != null && v.fileName != name){valid = false;}
                return valid;
            });
            if(!version || version.length==0) {  }
        }
        if(!version || version.length==0) { return []; }
    }
    if(list){return version}

    let dependencies = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/dependencies?index=0&pageSize=60&type=RequiredDependency`)).json()).data;

    let files =
    [{
        url: `https://www.curseforge.com/api/v1/mods/${id}/files/${version.id}/download`,
        filename: version.fileName,
        primary: true,
        id,
        dependencies,
        client: version.gameVersions.includes('Client'),
        server: version.gameVersions.includes('Server'),
        originURL: originURL
    }];

    for(let d of dependencies)
    {
        let r = await findCurseforgeFile(d.id, useLoader, false, `https://www.curseforge.com/minecraft/mc-mods/${dependenciesData.find(de=>de.id==d.id).slug}`);
        console.log(dependenciesData.find(de=>de.id==d.id));
        for(let i = 0; i < r.length; i++) { r[i].slug = d.slug; r[i].title = d.title; }
        files = files.concat(r)
    }

    return files;
}

async function findModrinthFileWithParameters(slug, loader, minecraftVersion, checkLoader = true, sinytra=false, list = false)
{
    console.log(slug, 'https://api.modrinth.com/v2/project/'+slug+'/version')
    const versions = (await (await fetch('https://api.modrinth.com/v2/project/'+slug+'/version')).json())
    .sort((a,b) => { return new Date(b.date_published) - new Date(a.date_published); });

    var version = versions[list?'filter':'find'](v =>
    {
        if(!v.loaders.includes(loader) && checkLoader){return false;}
        return v.game_versions.includes(minecraftVersion)
    });
    if(!version || version.length==0)
    {
        if(sinytra && loader=='forge')
        {
            version = versions[list?'filter':'find'](v =>
            {
                if(!v.loaders.includes(loader) && !v.loaders.includes('fabric') && checkLoader){return false;}
                return v.game_versions.includes(minecraftVersion)
            });
            if(!version || version.length==0) {  }
        }
        if(!version || version.length==0) { return []; }
    }
    if(list){return version}

    let files = version.files;
    for (let i = 0; i < files.length; i++) 
    {
        files[i].dependencies = version.dependencies;
        files[i].originURL = `https://modrinth.com/project/${slug}`;
        files[i].versionData = version;
    }
    for(let d of version.dependencies.filter(d => d.dependency_type=='required'))
    {
        let dependencieFiles = await findModrinthFileWithParameters(d.project_id, loader, minecraftVersion, checkLoader, sinytra);
        for (let i = 0; i < dependencieFiles.length; i++) { dependencieFiles[i].originURL = `https://modrinth.com/project/${d.project_id}`; }
        files = files.concat(dependencieFiles)
    }

    return files;
}
async function findCurseforgeFileWithParameters(id, loader, minecraftVersion, list = false, sinytra = false, originURL = null)
{
    // https://www.curseforge.com/api/v1/mods/1193072/files?pageIndex=0&pageSize=20&sort=dateCreated&sortDescending=true&gameVersionId=9990&removeAlphas=true
    let versions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=0&pageSize=60&sort=dateCreated&sortDescending=true&gameVersion=${window.instance.version.number}&removeAlphas=false`)).json()).data
    .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });

    // Add 50+ versions
    let i = 1;
    while(true)
    {
        let newVersions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=${i}&pageSize=60&sort=dateCreated&sortDescending=true&gameVersion=${window.instance.version.number}&removeAlphas=false`)).json()).data
        .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });
        console.log(newVersions.length)
        if(newVersions.length == 0){break;}

        versions = versions.concat(newVersions);
        i++;
    }

    const dependenciesData = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/dependencies?index=0&pageSize=60&type=RequiredDependency`)).json()).data;

    var version = versions[list?'filter':'find'](v =>
    {
        let valid = v.gameVersions.includes(loader.charAt(0).toUpperCase() + loader.slice(1));
        if(!valid && loader == 'forge' && v.gameVersions.includes('NeoForge')) { valid = true; }
        if(!v.gameVersions.includes(minecraftVersion)) { valid = false; }
        return valid;
    });
    if(!version || version.length==0)
    {
        if(sinytra && loader=='forge')
        {
            version = versions[list?'filter':'find'](v =>
            {
                let valid = v.gameVersions.includes(loader.charAt(0).toUpperCase() + loader.slice(1)) || v.gameVersions.includes('Fabric');
                if(!valid && loader == 'fabric') { valid = true; }
                if(!v.gameVersions.includes(minecraftVersion)) { valid = false; }
                return valid;
            });
            if(!version || version.length==0) {  }
        }
        if(!version || version.length==0) { return []; }
    }
    if(list){return version}

    let dependencies = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/dependencies?index=0&pageSize=60&type=RequiredDependency`)).json()).data;

    let files =
    [{
        url: `https://www.curseforge.com/api/v1/mods/${id}/files/${version.id}/download`,
        filename: version.fileName,
        primary: true,
        id,
        dependencies,
        client: version.gameVersions.includes('Client'),
        server: version.gameVersions.includes('Server'),
        originURL: originURL
    }];

    for(let d of dependencies)
    {
        let r = await findCurseforgeFileWithParameters(d.id, loader, minecraftVersion, false, sinytra, `https://www.curseforge.com/minecraft/mc-mods/${dependenciesData.find(de=>de.id==d.id).slug}`);
        console.log(dependenciesData.find(de=>de.id==d.id));
        for(let i = 0; i < r.length; i++) { r[i].slug = d.slug; r[i].title = d.title; }
        files = files.concat(r)
    }

    return files;
}

async function findModrinthSlug(url)
{
    if(typeof(url)=="string"){url = new URL(url);}

    if(url.pathname.split('/')[1] == "project")
    {
        let r = await fetch(url.href)

        url = new URL(r.headers.get("Location") || r.headers.get("location") || r.url);
        console.log("redirection:", url.href)
    }

    let type = url.pathname.split('/')[1];
    let cleanType = type; if(cleanType=='resourcepack'||cleanType=='mod'){cleanType += 's'} if(cleanType=='shader'){cleanType = 'shaderpacks'} if(cleanType=="datapack"){cleanType="mods"}

    return {slug: url.href.split('/')[url.href.split('/').length-1], type}
}
async function findCurseforgeId(url)
{
    if(typeof(url)=="string"){url = new URL(url);}

    let type = url.pathname.split('/')[2];
    let cleanType = type;

    let classId = 6
    switch(type)
    {
        case 'mc-mods': { classId = 6; cleanType = 'mods'; break; }
        case 'shaders': { classId = 6552; cleanType = 'shaderpacks'; break; }
        case 'texture-packs': { classId = 12; cleanType = 'resourcepacks'; break; }
    }

    return {id: (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${link.split('/')[link.split('/').length-1]}&classId=${classId}`)).json()).data[0].id, type: cleanType}
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


// Placeholder
document.querySelectorAll("#web-window > div > div > button")[0].onclick = () =>
{document.querySelector("#bottom-panel > div > .tab > button:nth-child(4)").click(); document.querySelector("#browse-panel > div.tab > button:nth-child(2)").click()}
document.querySelectorAll("#web-window > div > div > button")[1].onclick = () =>
{document.querySelector("#bottom-panel > div > .tab > button:nth-child(4)").click(); document.querySelector("#browse-panel > div.tab > button:nth-child(3)").click()}
document.querySelectorAll("#web-window > div > div > button")[2].onclick = () =>
{document.querySelector("#bottom-panel > div > .tab > button:nth-child(4)").click(); document.querySelector("#browse-panel > div.tab > button:nth-child(4)").click()}
document.querySelectorAll("#web-window > div > div > button")[3].onclick = () =>
{document.querySelector("#center-panel > .tab > button:nth-child(5)").click();}

let o = new MutationObserver(() =>
{
    document.querySelector("#web-window > div").style.display = 'none'
})
o.observe(document.querySelector("#web-window > webview"), {childList: true, attributes: true, subtree: true})