let infoPanel = document.getElementById('mod-info-panel');
const minecraftVersionReg = /^\d+\.\d+\.\d+$/;

// Pack
async function importSave(pack)
{
    for(let c of pack.content)
    {
        if(c.needDownload)
        {
            switch(new URL(c.url).host)
            {
                case 'modrinth.com':
                {
                    window.web.downloadModrinth(c.url);
                    break;
                }
                case 'www.curseforge.com':
                {
                    window.web.downloadCurseforge(c.url);
                    break;
                }
            }
        }
        else
        {
            await ipcInvoke('writeFile', 'Modpack\ Maker'+sep()+'instances'+sep()+window.instance.name+sep()+'minecraft'+sep()+c.path, c.data)
        }
    }
}

let listPanel = document.querySelector('#saves-panel > #select');
let container = listPanel.querySelector("#container")
let packEditor = document.getElementById("pack-editor")
let viewPanel = document.querySelector('#saves-panel > #view'); viewPanel.style.display = 'none'
let packButtonList = listPanel.childNodes[5];
let packButton = packButtonList.childNodes[1].cloneNode(true); packButtonList.childNodes[1].remove();

// async function viewPack(p)
// {
//     viewPanel.style.display = 'block';
//     listPanel.style.display = 'none';

//     viewPanel.querySelector('div:first-of-type > h2').innerText = p.name;

//     let files = [];
//     // Files
//     for(let k in p.content)
//     {
//         let m = p.content[k];
//         files.push
//         ({
//             name: m.name,
//             active: true,
//             path: m.path+sep()+m.virtualPath,
//             index: m.hierarchyIndex||0,
//             icon: m.icon,
//             filename: m.name,
//             folder: m.folder,
//             onSelect: ()=>
//             {

//             },
//             onMove: (from, to, index)=>
//             {
                
//             },
//             onSetActive: (active)=>
//             {
                
//             }, onDelete: ()=>
//             {
                
//             }
//         })
//     }
//     // Folder
//     for(let m of files)
//     {
//         let currentPath = '';
//         if(m.folder || m.path == undefined){continue;}
//         for(let p of m.path.split(sep()))
//         {
//             if(p==''){continue;}
//             let basePath = currentPath;
//             if(currentPath.length>0){currentPath+=sep()}
//             currentPath += p;

//             if(currentPath.replaceAll(sep(),'')==''){continue;}

//             if(!files.includes(f=>f.name==currentPath.split(sep())[currentPath.split(sep()).length-1] && f.path==basePath&& f.folder))
//             {
//                 files.push
//                 ({
//                     name: currentPath.split(sep())[currentPath.split(sep()).length-1],
//                     active: true,
//                     path: m.basePath,
//                     index: 0,
//                     filename: currentPath.split(sep())[currentPath.split(sep()).length-1],
//                     folder: true,
//                     onSelect: ()=>
//                     {

//                     },
//                     onMove: (from, to, index)=>
//                     {
                        
//                     },
//                     onSetActive: (active)=>
//                     {
                        
//                     }, onDelete: ()=>
//                     {
                        
//                     }
//                 })
//             }
//         }
//     }

//     console.log(files);
//     let explorer = window.setupExplorer(document.querySelector('#saves-panel > #view > #pack-explorer'), files, (f) =>
//     {
//         f.onSelect = ()=> { console.log('select') }
//         f.onMove = (from, to, index)=>{console.log(from, to, index)}
//         f.onSetActive = (active)=>{console.log(active)}
//         f.onDelete = ()=>{console.log('destroy')}
//         return f;
//     })
// }

function parseXml(xml, arrayTags)
{
    let dom = null;
    if (window.DOMParser) dom = (new DOMParser()).parseFromString(xml, "text/xml");
    else if (window.ActiveXObject) {
        dom = new ActiveXObject('Microsoft.XMLDOM');
        dom.async = false;
        if (!dom.loadXML(xml)) throw dom.parseError.reason + " " + dom.parseError.srcText;
    }
    else throw new Error("cannot parse xml string!");

    function parseNode(xmlNode, result) {
        if (xmlNode.nodeName == "#text") {
            let v = xmlNode.nodeValue;
            if (v.trim()) result['#text'] = v;
            return;
        }

        let jsonNode = {},
            existing = result[xmlNode.nodeName];
        if (existing) {
            if (!Array.isArray(existing)) result[xmlNode.nodeName] = [existing, jsonNode];
            else result[xmlNode.nodeName].push(jsonNode);
        }
        else {
            if (arrayTags && arrayTags.indexOf(xmlNode.nodeName) != -1) result[xmlNode.nodeName] = [jsonNode];
            else result[xmlNode.nodeName] = jsonNode;
        }

        if (xmlNode.attributes) for (let attribute of xmlNode.attributes) jsonNode[attribute.nodeName] = attribute.nodeValue;

        for (let node of xmlNode.childNodes) parseNode(node, jsonNode);
    }

    let result = {};
    for (let node of dom.childNodes) parseNode(node, result);

    return result;
}
async function viewPack(name)
{
    packEditor.style.display = 'block';
    container.style.display = "none";

    let pack =
    {
        name: name,
        description: "",
        content: [],
        virtualDirectories: []
    }

    function filifyPacks()
    {
        let files = [];
        // Files
        for(let k in pack.content)
        {
            let m = pack.content[k];
            console.log(m)
            files.push
            ({
                name: m.filename || m.name || m.title,
                active: !m.disabled,
                path: m.virtualPath,
                index: m.hierarchyIndex,
                icon: m.icon,
                filename: m.filename || m.name || m.title,
                onSelect: ()=>
                {
                    // Title, desc, icon
                    infoPanel.style.display = "inline-block"
                    infoPanel.querySelector('div:first-of-type > h2').innerText = pack.content[k]?.title || pack.content[k]?.name || pack.content[k]?.filename;
                    infoPanel.querySelector('div:first-of-type > img').src = pack.content[k].icon?m.icon:'';
                    infoPanel.querySelector('p:first-of-type').innerText = pack.content[k]?.description;
                    infoPanel.querySelector('p:last-of-type').innerText = ""; // TODO: Display avalaible versions

                    // Image
                    infoPanel.querySelector('.content-slider').innerHTML = '';
                    if(m.images)
                    {
                        for(let i of m.images)
                        {
                            let img = document.createElement('img'); img.src = i;
                            img.classList.add('openable-image');
                            infoPanel.querySelector('.content-slider').appendChild(img);   
                        }
                    }

                    // Client, server, dependencies
                    infoPanel.querySelector("#actions").style.display = infoPanel.querySelector("#supporting").style.display = 'grid'
                    infoPanel.querySelector('#supporting').childNodes[0].style.filter = `brightness(${pack.content[k].clientRequired?0.8:0.3})`
                    infoPanel.querySelector('#supporting').childNodes[0].setAttribute('hover-info', pack.content[k].clientRequired?'Required in Client Side':'Unrequired in Client Side');
                    infoPanel.querySelector('#supporting').childNodes[1].style.filter = `brightness(${pack.content[k].serverRequired?0.8:0.3})`
                    infoPanel.querySelector('#supporting').childNodes[1].setAttribute('hover-info', pack.content[k].clientRequired?'Required in Server Side':'Unrequired in Server Side');
                    window.loadHoverInfo();

                    infoPanel.querySelector('#supporting').childNodes[2].childNodes[1].innerText = pack.content[k].dependencies?pack.content[k].dependencies.length.toString():'0'
                    let dependents = pack.content.filter(mod => mod.dependencies?.find(d=>d.id==pack.content[k].id||d.filename==pack.content[k].filename||d.slug==pack.content[k].slug)!=null).length;
                    infoPanel.querySelector('#supporting').childNodes[3].childNodes[1].innerText = dependents.toString();

                    infoPanel.querySelector('#actions').childNodes[1].style.backgroundImage = `url(./resources/${pack.content[k].disabled?'disabled':'enabled'}.png)`
                    // Disable
                    infoPanel.querySelector('#actions').childNodes[1].onclick = async () =>
                    {
                        pack.content[k].disabled = !pack.content[k].disabled;
                        if(pack.content[k].disabled==undefined){pack.content[k].disabled = true;}

                        infoPanel.querySelector('#actions').childNodes[1].style.backgroundImage = `url(./resources/${pack.content[k].disabled?'disabled':'enabled'}.png)`
                        ipcInvoke("addPack", pack.name, pack)
                    }
                    // Config
                    infoPanel.querySelector('#actions').childNodes[0].onclick = async () =>
                    {
                        // TODO: Config
                        // let p = 'Modpack\ Maker/instances/'+window.instance.name+'/minecraft/mods/'+(pack[k].filename.endsWith('.jar')?pack[k].filename.substring(0,pack[k].filename.length-4):(pack[k].filename.endsWith('.disabled')?pack[k].filename.substring(0, pack[k].filename.length-9):pack[k].filename))+(pack[k].disabled?'.disabled':'.jar');

                        // window.configPanel((await window.instance.getConfigs()).sort((a,b) =>
                        // {
                        //     return Math.max(similarity(a, f.name.toLowerCase().replace(' ','')),
                        //     similarity(a, f.name.toLowerCase().replace(' ','')+'-common'),
                        //     similarity(a, f.name.toLowerCase().replace(' ','')+'-client'),
                        //     similarity(a, f.name.toLowerCase().replace(' ','')+'-server')) -
                        //     Math.max(similarity(a, f.name.toLowerCase().replace(' ','')),
                        //     similarity(b, f.name.toLowerCase().replace(' ','')+'-common'),
                        //     similarity(b, f.name.toLowerCase().replace(' ','')+'-client'),
                        //     similarity(b, f.name.toLowerCase().replace(' ','')+'-server'))
                        // }).reverse()[0])
                    }
                    // Delete
                    infoPanel.querySelector('#actions').childNodes[2].onclick = async () =>
                    {
                        pack.content.splice(k, 1);
                        await ipcInvoke("addPack", pack.name, pack)
                    }
                    // Website
                    if(typeof(pack.content[k].url) == 'string')
                    {
                        infoPanel.querySelector('#actions').childNodes[3].style.display = 'block';
                        infoPanel.querySelector('#actions').childNodes[3].style.backgroundImage = `url(${new URL(pack.content[k].url).host=='modrinth.com'?'./resources/website-logos/modrinth.png':'./resources/website-logos/curseforge.png'})`
                        infoPanel.querySelector('#actions').childNodes[3].onclick = async () =>
                        {
                            Array.from(document.getElementById('center-panel').childNodes[1].childNodes).find(e=>e.innerText=='Web').click();
                            switch(new URL(pack.content[k].url).host)
                            {
                                case 'modrinth.com':
                                {
                                    window.web.loadModrinth(document.getElementById('web-window').querySelector('webview'), pack.content[k].url);
                                    break;
                                }
                                case 'www.curseforge.com':
                                {
                                    window.web.loadCurseforge(document.getElementById('web-window').querySelector('webview'), pack.content[k].url);
                                    break;
                                }
                            }
                        }
                    }
                    else { infoPanel.querySelector('#actions').childNodes[3].style.display = 'none'; }
                },
                onMove: (from, to, index)=>
                {
                    pack.content[k].hierarchyIndex = index;
                    pack.content[k].virtualPath = to;
                    ipcInvoke("addPack", pack.name, pack)
                },
                onSetActive: (active)=>
                {
                    pack.content[k].disabled = !active;
                    ipcInvoke("addPack", pack.name, pack)
                },
                onDelete: ()=>
                {
                    if(m.folder)
                    {
                        pack.virtualDirectories.splice(pack.virtualDirectories.findIndex(d => d.filename == m.filename && d.path == m.path), 1)

                        // Move all children
                        let count = 0;
                        for(let [i, e] of pack.content.entries())
                        {
                            if(pack.content[i].virtualPath==undefined){continue}
                            if(m.path == pack.content[i].virtualPath.substring(0, pack.content[i].virtualPath.lastIndexOf(sep())) && m.name == pack.content[i].virtualPath.split(sep())[pack.content[i].virtualPath.split(sep()).length-1])
                            {
                                pack.content[i].virtualPath = '';
                                count++;
                            }
                        }

                        return;
                    }

                    pack.content.splice(k, 1);
                    ipcInvoke("addPack", pack.name, pack)
                }
            })
        }
        // Folders
        for(let k in pack.virtualDirectories)
        {
            let d = pack.virtualDirectories[k]
            if(d.parent!=parentFolder){continue}
            files.push
            ({
                name: d.name || d.filename,
                active: !d.disabled,
                path: d.path,
                folder: true,
                index: d.hierarchyIndex,
                onSelect: ()=>{console.log('select')},
                onMove: (from, to, index)=>
                {
                    console.log(from, to, index)
                    pack.virtualDirectories[k].path = to;
                    pack.virtualDirectories[k].hierarchyIndex = index;
                    ipcInvoke("addPack", pack.name, pack)
                },
                onSetActive: (active)=>{console.log(active)},
                onDelete: ()=>{console.log('destroy')}
            })
        }

        return files;
    }
    
    let explorer = window.setupExplorer(document.getElementById('pack-content-explorer'), filifyPacks(), (f) =>
    {
        f.onSelect = ()=> {  }
        f.onMove = (from, to, index)=>{}
        f.onSetActive = (active)=>{}
        f.onDelete = ()=>{}
        return f;
    }, null, false)

    explorer.addNewFolderListener((f) =>
    {
        pack.virtualDirectories.push
        ({
            name: f.name,
            path: f.path,
            hierarchyIndex: f.hierarchyIndex,
            parent: 'mods'
        });

        ipcInvoke("addPack", pack.name, pack)
    })

    let listeningTo = pack.name;
    addPackListener(pack.name, (p) =>
    {
        if(listeningTo!=pack.name){return;}
        pack = p;
        packEditor.querySelector("input").value = p.name;
        explorer.update(filifyPacks());


        // Table
        updateCompatibility().then(() =>
        {
            packEditor.querySelector("table > tbody").innerHTML = '';
            for(let c of compatibilities)
            {
                let n = document.createElement("tr");
                let l = document.createElement("td"); l.innerText=c.loader; n.appendChild(l)
                let v = document.createElement("td"); v.innerText=c.version; n.appendChild(v)
                let co = document.createElement("td"); co.innerText=c.count; n.appendChild(co)
                packEditor.querySelector("table > tbody").appendChild(n)
            }
        })
    })

    packEditor.querySelector("input").oninput = () =>
    {
        ipcInvoke("renamePack", pack.name, packEditor.querySelector("input").value)
        pack.name = packEditor.querySelector("input").value
    }

    let compatibilities = [];
    async function updateCompatibility()
    {
        let loaders = [];
        // Mods & RessourcePacks
        for(let c of pack.content.filter(c=>c.type!="shaderpacks"))
        {
            let url = new URL(c.url);
            let alreadyAdded = [];
            switch(url.hostname)
            {
                case "modrinth.com":
                {
                    let slug = (await window.web.findModrinthSlug(url)).slug;

                    const versions = (await (await fetch('https://api.modrinth.com/v2/project/'+slug+'/version')).json())
                    .sort((a,b) => { return new Date(b.date_published) - new Date(a.date_published); });

                    for(let v of versions)
                    {
                        for(let version of v.game_versions)
                        {
                            for(let loader of v.loaders)
                            {
                                if(alreadyAdded.find(a=>JSON.stringify(a)==JSON.stringify({version, loader: loader.toLowerCase()}))!=undefined){continue;}
                                if(loaders.find(l=>l==loader)==undefined){loaders.push(loader)}

                                if(compatibilities.find(c=>c.loader==loader.toLowerCase()&&c.version==version)==undefined)
                                { compatibilities.push({version, loader: loader.toLowerCase(), count: 1}) }
                                compatibilities[compatibilities.findIndex(c=>c.loader==loader.toLowerCase()&&c.version==version)].count++;
                                alreadyAdded.push({version, loader: loader.toLowerCase()})
                            }
                        }
                    }
                    break;
                }
                case "www.curseforge.com":
                {
                    let id = (await window.web.findCurseforgeId(url)).id;

                    let versions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=0&pageSize=60&sort=dateCreated&sortDescending=true&removeAlphas=false`)).json()).data
                    .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });

                    // Add 50+ versions
                    let i = 1;
                    while(true)
                    {
                        let newVersions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=${i}&pageSize=60&sort=dateCreated&sortDescending=true&removeAlphas=false`)).json()).data
                        .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });
                        console.log(newVersions.length)
                        if(newVersions.length == 0){break;}

                        versions = versions.concat(newVersions);
                        i++;
                    }

                    for(let v of versions)
                    {
                        for(let version of v.gameVersions.filter(g=>minecraftVersionReg.test(g)))
                        {
                            for(let loader of v.gameVersions.filter(g=>!minecraftVersionReg.test(g)))
                            {
                                if(alreadyAdded.find(a=>JSON.stringify(a)==JSON.stringify({version, loader: loader.toLowerCase()}))!=undefined){continue;}
                                if(loaders.find(l=>l==loader)==undefined){loaders.push(loader)}

                                if(compatibilities.find(c=>c.loader==loader.toLowerCase()&&c.version==version)==undefined)
                                { compatibilities.push({version, loader: loader.toLowerCase(), count: 1}) }
                                compatibilities[compatibilities.findIndex(c=>c.loader==loader.toLowerCase()&&c.version==version)].count++;
                                alreadyAdded.push({version, loader: loader.toLowerCase()})
                            }
                        }
                    }

                    break;
                }
            }
        }        
        // Shaders (no loader dependencies)
        for(let c of pack.content.filter(c=>c.type=="shaderpacks"))
        {
            let url = new URL(c.url);
            let alreadyAdded = [];
            switch(url.hostname)
            {
                case "modrinth.com":
                {
                    let slug = (await window.web.findModrinthSlug(url)).slug;

                    const versions = (await (await fetch('https://api.modrinth.com/v2/project/'+slug+'/version')).json())
                    .sort((a,b) => { return new Date(b.date_published) - new Date(a.date_published); });

                    for(let v of versions)
                    {
                        for(let version of v.game_versions)
                        {
                            for(let loader of loaders)
                            {
                                if(alreadyAdded.find(a=>JSON.stringify(a)==JSON.stringify({version, loader: loader.toLowerCase()}))!=undefined){continue;}

                                if(compatibilities.find(c=>c.loader==loader.toLowerCase()&&c.version==version)==undefined)
                                { compatibilities.push({version, loader: loader.toLowerCase(), count: 1}) }
                                compatibilities[compatibilities.findIndex(c=>c.loader==loader.toLowerCase()&&c.version==version)].count++;
                                alreadyAdded.push({version, loader: loader.toLowerCase()})
                            }
                        }
                    }
                    break;
                }
                case "www.curseforge.com":
                {
                    let id = (await window.web.findCurseforgeId(url)).id;

                    let versions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=0&pageSize=60&sort=dateCreated&sortDescending=true&removeAlphas=false`)).json()).data
                    .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });

                    // Add 50+ versions
                    let i = 1;
                    while(true)
                    {
                        let newVersions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=${i}&pageSize=60&sort=dateCreated&sortDescending=true&removeAlphas=false`)).json()).data
                        .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });
                        console.log(newVersions.length)
                        if(newVersions.length == 0){break;}

                        versions = versions.concat(newVersions);
                        i++;
                    }

                    for(let v of versions)
                    {
                        for(let version of v.gameVersions.filter(g=>minecraftVersionReg.test(g)))
                        {
                            for(let loader of loaders)
                            {
                                if(alreadyAdded.find(a=>JSON.stringify(a)==JSON.stringify({version, loader: loader.toLowerCase()}))!=undefined){continue;}
                                
                                if(compatibilities.find(c=>c.loader==loader.toLowerCase()&&c.version==version)==undefined)
                                { compatibilities.push({version, loader: loader.toLowerCase(), count: 1}) }
                                compatibilities[compatibilities.findIndex(c=>c.loader==loader.toLowerCase()&&c.version==version)].count++;
                                alreadyAdded.push({version, loader: loader.toLowerCase()})
                            }
                        }
                    }

                    break;
                }
            }
        }

        compatibilities=compatibilities.sort((a,b) => b.count-a.count)
    }

    console.log(packEditor.querySelectorAll("div:last-of-type > button"))
    packEditor.querySelectorAll("div:last-of-type > button")[1].onclick = () => { packEditor.style.display = 'none'; container.style.display = "block"; }
    packEditor.querySelectorAll("div:last-of-type > button")[3].onclick = async () =>
    {
        for(let c of pack.content)
        {
            switch(new URL(c.url).hostname)
            {
                case "modrinth.com":
                { await window.web.downloadModrinth(c.url); break; }
                case "www.curseforge.com":
                { await window.web.downloadCurseforge(c.url); break; }
            }
        }
    }
    // Test
    packEditor.querySelectorAll("div:last-of-type > button")[2].onclick = async () =>
    {
        await updateCompatibility();
        
        let mods = [];
        for(let c of pack.content)
        {
            if(c.disabled || c.missing){continue;}
            let url = new URL(c.url);
            switch(url.hostname)
            {
                case "modrinth.com":
                {
                    for(let f of await window.web.findModrinthFileWithParameters((await window.web.findModrinthSlug(url)).slug, compatibilities[0].loader, compatibilities[0].version, c.type!="shaderpacks"))
                    {
                        mods.push({url:f.url, filename:f.filename, type: c.type});
                    }
                    break;
                }
                case "www.curseforge.com":
                {
                    for(let f of await window.web.findCurseforgeFileWithParameters((await window.web.findCurseforgeId(url)).id, compatibilities[0].loader, compatibilities[0].version))
                    {
                        mods.push({url:f.url, filename:f.filename, type: c.type});
                    }
                    break;
                }
            }
        }

        // Loader Last Version
        let versionList = [];

        switch(compatibilities[0].loader.toLowerCase())
        {
            case 'vanilla': { loaderVersionSelect.style.display = 'none'; break; }
            case 'forge':
            {
                let text = await (await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')).text();
                const data = parseXml(text)
            
                for(let v of data.metadata.versioning.versions.version.filter(e => e["#text"].split('-')[0] == compatibilities[0].version.toString()))
                {
                    versionList.push(v["#text"].split('-')[1]);
                }

                break;
            }
            case 'neoforge':
            {
                let text = await (await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')).text();
                const data = parseXml(text)
            
                for(let v of data.metadata.versioning.versions.version.filter(e => '1.'+e["#text"].split('-')[0].substring(0, e["#text"].split('-')[0].lastIndexOf('.')) == compatibilities[0].version.toString()).reverse())
                {
                    versionList.push(v["#text"]);
                }

                break;
            }
            case 'fabric':
            {
                const data = await (await fetch('https://meta.fabricmc.net/v2/versions/loader/'+compatibilities[0].version.toString())).json();

                for(let v of data)
                {
                    versionList.push(v.loader.version);
                }

                break;
            }
        }
        
        await ephemeralLaunch({name: compatibilities[0].loader.toLowerCase(), version: versionList[0]}, {number: compatibilities[0].version, type: "release"}, mods);
    }
}

async function packsList()
{
    let packs = await ipcInvoke('packList', window.instance.version.number, window.instance.loader.name);

    packEditor.style.display = 'none';
    container.style.display = "block";

    packButtonList.innerHTML = '';
    for(let p of packs)
    {
        let b = packButton.cloneNode(true);
        b.childNodes[1].src = p.icon?p.icon:'https://static.wikia.nocookie.net/logopedia/images/3/3c/Minecraft_icon_2021.svg/revision/latest/scale-to-width-down/250?cb=20230427140314';
        b.childNodes[3].childNodes[1].innerText = p.name;
        b.childNodes[3].childNodes[3].innerText = p.description;
        b.childNodes[3].childNodes[5].innerHTML = `${p.content.filter(c=>c.path=='mods').length} mods<br>${p.content.filter(c=>c.path=='resourcepacks').length} resourcepacks<br>${p.content.filter(c=>c.path=='shaderpacks').length} shaders`;
        packButtonList.appendChild(b)

        b.childNodes[1].onclick = () =>
        {
            viewPack(p.name)
            // importSave(p);
        }
    }

    let add = document.createElement("button");
    add.innerText = "+ Create";
    packButtonList.appendChild(add);

    add.onclick = () => viewPack("")
}

// Saved
// savedList
async function savedList()
{
    let saved = await ipcInvoke('savedList');

    packEditor.style.display = 'none';
    container.style.display = "block";

    packButtonList.innerHTML = '';
    for(let p of saved)
    {
        let b = packButton.cloneNode(true);
        b.childNodes[1].src = p.icon?p.icon:'https://static.wikia.nocookie.net/logopedia/images/3/3c/Minecraft_icon_2021.svg/revision/latest/scale-to-width-down/250?cb=20230427140314';
        b.childNodes[3].childNodes[1].innerText = p.name;
        b.childNodes[3].childNodes[3].innerText = p.description;
        b.childNodes[3].childNodes[5].innerHTML = ``;
        packButtonList.appendChild(b)

        b.childNodes[1].onclick = () =>
        {
            if(new URL(p.url).hostname == "modrinth.com")
            { window.web.loadModrinth(document.getElementById('web-window').querySelector('webview'), p.url); }
            else
            { window.web.loadCurseforge(document.getElementById('web-window').querySelector('webview'), p.url); }
            Array.from(document.getElementById('center-panel').childNodes[1].childNodes).find(e=>e.innerText=='Web').click();
        }
    }
}

let currentTab = 'packs';
window.addInstanceListener(() =>
{
    window.setupTab(document.querySelector('#saves-panel > #select > #tab'),
    [
        {select: () => { packsList(); currentTab = 'packs' }, deselect: () => {}},
        {select: () => { savedList(); }, deselect: () => {}},
        {select: () => { packsList(); }, deselect: () => {}},
    ]);
})