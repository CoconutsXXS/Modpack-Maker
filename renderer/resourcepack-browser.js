let result = [];

// Web search
const parser = new DOMParser();
async function searchResourcepack(text = '')
{
    let searchResult = [];

    // Modrinth
    let modrinth = await (await fetch(`https://api.modrinth.com/v2/search?limit=40&index=relevance&query=${text}&facets=[[%22project_type:resourcepack%22],[%22versions:${window.instance.version.number}%22]]`)).json()
    for(let h of modrinth.hits)
    {
        searchResult.push
        ({
            name: h.title,
            icon: h.icon_url,
            description: h.description,
            versions: h.versions,
            source: 'modrinth',
            images: h.gallery,
            url: `https://modrinth.com/resourcepack/${h.slug}`,
            originalData: h
        })
    }

    // Curseforge
    let curseforge = await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&classId=12&filterText=${text}&gameVersion=${window.instance.version.number}&pageSize=40&sortField=1`)).json()
    if(!curseforge.data){curseforge.data=[];}
    for(let d of curseforge.data)
    {
        async function loadImages()
        {
            let i = [];
            let page = parser.parseFromString(await (await fetch(`https://www.curseforge.com/minecraft/texture-packs/${d.slug}/gallery`)).text(), "text/html");

            if(page.querySelector('.images-gallery > ul:nth-child(1)'))
            {
                for(let c of page.querySelector('.images-gallery > ul:nth-child(1)').childNodes)
                {
                    if(!c.querySelector("a > img")){continue;}
    
                    i.push(c.querySelector("a > img").src);
                }
            }

            if(result.find(r=>r.name==d.name))
            {
                if(i < result[result.findIndex(r=>r.name==d.name)].images) { return []; }
            }
            result[result.findIndex(r=>r.name==d.name)].images = i;
            return i;
        }

        if(searchResult.find(r=>r.name==d.name))
        {
            searchResult[searchResult.findIndex(r=>r.name==d.name)].secondarySource = 'curseforge';
            searchResult[searchResult.findIndex(r=>r.name==d.name)].loadImages = loadImages;
            continue;
        }

        searchResult.push
        ({
            name: d.name,
            icon: d.avatarUrl,
            description: d.summary,
            versions: [d.gameVersion],
            clientRequired: d.isClientCompatible,
            serverRequired: null,
            source: 'curseforge',
            loadImages: loadImages,
            url: `https://www.curseforge.com/minecraft/texture-packs/${d.slug}`,
            originalData: d
        })
    }

    // MinecraftShader
    let minecraftShaderPage = parser.parseFromString(await (await fetch(`https://minecraftshader.com/platform/java-edition/?loader=iris&search=${text}`)).text(), "text/html");

    let i = 2;
    for (let c of minecraftShaderPage.querySelector('#post-container').childNodes)
    {
        if(c.className != 'col-md-6'){continue;}

        let img = minecraftShaderPage.querySelector(`#post-container > div:nth-child(${i}) > div > div.thumbnail > a > img`)?.src
        if(img == undefined) { img = minecraftShaderPage.querySelector(`#post-container > div:nth-child(${i}) > div > div.thumbnail > a > picture > img`).src; }
        if(img == undefined) { continue; }

        searchResult.push
        ({
            name: minecraftShaderPage.querySelector(`div.col-md-6:nth-child(${i}) > div:nth-child(1) > div:nth-child(2) > h2:nth-child(1) > a:nth-child(1)`).innerText,
            icon: img,
            source: 'minecraftShader',
            url: minecraftShaderPage.querySelector(`div.col-md-6:nth-child(${i}) > div:nth-child(1) > div:nth-child(2) > h2:nth-child(1) > a:nth-child(1)`).href,
            description: minecraftShaderPage.querySelector(`div.col-md-6:nth-child(${i}) > div:nth-child(1) > div:nth-child(2) > p:nth-child(2)`).innerText
        })

        i++
    }

    return searchResult;
}

// Elements
let searchInput = document.getElementById('resourcepacks-settings').querySelector('input:first-of-type');

let modSample = document.querySelector('#resourcepack-download-list > div:first-child').cloneNode(true);
document.querySelector('#resourcepack-download-list > div:first-child').remove();

let webview = document.getElementById('web-window').querySelector('webview');

// Filter Tab
let sourceFilter = ['modrinth', 'curseforge', 'minecraftShader']

window.setupTab(document.getElementById('resourcepack-browser-filter'),
[
    {
        select: () => { if(!sourceFilter.find(e=>e=='modrinth')){sourceFilter.push('modrinth');displayResult()} },
        deselect: () => { if(sourceFilter.find(e=>e=='modrinth')){delete sourceFilter[sourceFilter.findIndex(e=>e=='modrinth')];displayResult()} }
    },
    {
        select: () => { if(!sourceFilter.find(e=>e=='curseforge')){sourceFilter.push('curseforge');displayResult()} },
        deselect: () => { if(sourceFilter.find(e=>e=='curseforge')){delete sourceFilter[sourceFilter.findIndex(e=>e=='curseforge')];displayResult()} }
    },
    {
        select: () => { if(!sourceFilter.find(e=>e=='minecraftShader')){sourceFilter.push('minecraftShader');displayResult()} },
        deselect: () => { if(sourceFilter.find(e=>e=='minecraftShader')){delete sourceFilter[sourceFilter.findIndex(e=>e=='minecraftShader')];displayResult()} }
    }
], 0, true, true);

// Display event
searchInput.onkeydown = async (e) =>
{
    if(e.key != 'Enter'){return;}

    result = await searchResourcepack(searchInput.value);
    displayResult()
}
window.addInstanceListener(() => searchInput.onkeydown({key:'Enter'}))

let selected = null;
let webviewListener = null;
webview.addEventListener('will-navigate', (event) => { event.preventDefault(); });

function displayResult()
{
    document.querySelector('#resourcepack-download-list').innerHTML = '';
    let i = 0;
    for(let m of result)
    {
        if(!sourceFilter.find(e=>e==m.source) && !sourceFilter.find(e=>e==m.secondarySource)){i++; continue;}

        let e = modSample.cloneNode(true);
        e.querySelector('img').src = m.icon;
        e.querySelector('div > h4').innerText = m.name;
        e.querySelector('div > p').innerText = m.description;
        e.querySelector('div > div > div > div').style.backgroundImage = `url(./resources/website-logos/${m.source}.png)`;
        if(m.secondarySource)
        { 
            let c = e.querySelector('div > div > div > div').cloneNode(true);
            c.style.backgroundImage = `url(./resources/website-logos/${m.secondarySource}.png)`;
            e.querySelector('div > div > div').insertBefore(c, e.querySelector('div > div > div > div'));
        }
        if(window.instance.mods.find(mod => (m.slug == mod.slug&&m.slug!=undefined) || (m.id == mod.id&&m.id!=undefined) || (m.name == mod.name&&m.name!=undefined)) != undefined) { e.setAttribute('installed',''); }

        // Event
        let index = i;
        e.onmouseenter = () => quickView(result[index])
        e.onclick = async (event) =>
        {
            if(event.detail != 1){return}
            Array.from(document.getElementById('center-panel').childNodes[1].childNodes).find(e=>e.innerText=='Web').click();
            // webview.src = result[index].url;

            if(selected) { selected.removeAttribute('selected'); }
            selected = e;
            e.setAttribute('selected', '');

            switch(m.source)
            {
                case 'modrinth':
                {
                    window.web.loadModrinth(webview, result[index].url);
                    // const sourceCode = await (await fetch('renderer/modrinth-webview.js')).text();

                    // webview.addEventListener('dom-ready', modify);
                    // async function modify()
                    // {
                    //     webview.setZoomLevel(-1);

                    //     if(webviewListener) { webview.removeEventListener('ipc-message', webviewListener) }

                    //     webviewListener = async (event) =>
                    //     {
                    //         console.log(event.channel)

                    //         switch(event.channel)
                    //         {
                    //             case 'download':
                    //             {
                    //                 for(var f of await findModrinthFile(m.originalData.slug))
                    //                 {
                    //                     if(!f.primary){continue}
                    //                     await window.instance.save(window.instance);
                    //                     console.log(await window.instance.setModData({filename: f.filename}))
                    //                     console.log(await download(f.url, window.instance.path+'/mods', f.filename));
                    //                     window.instance = await getInstance(window.instance.name)
                    //                     console.log(window.instance)
                    //                     window.loadModsExplorer();
                    //                 }

                    //                 break;
                    //             }
                    //             case 'quick-test':
                    //             {
                    //                 let mods = [];
                    //                 for(var f of await findModrinthFile(m.originalData.slug))
                    //                 {
                    //                     if(!f.primary){continue}
                    //                     mods.push({url:f.url, filename:f.filename})
                    //                 }
                                    
                    //                 console.log(window.instance.loader, window.instance.version, mods)
                    //                 await ephemeralLaunch(window.instance.loader, window.instance.version, mods);

                    //                 break;
                    //             }
                    //         }
                    //     }
                    //     webview.addEventListener('ipc-message', webviewListener);

                    //     await webview.executeJavaScript(`window.originalLocation = "${result[index].url}";`, true)
                    //     await webview.executeJavaScript(sourceCode, true)
                    // };

                    break;
                }
                case 'curseforge':
                {
                    window.web.loadCurseforge(webview, result[index].url);
                    // const sourceCode = await (await fetch('renderer/curseforge-webview.js')).text();

                    // webview.addEventListener('dom-ready', modify);
                    // async function modify()
                    // {
                    //     webview.setZoomLevel(-0.5);
                    //     if(webviewListener) { webview.removeEventListener('ipc-message', webviewListener) }

                    //     webviewListener = async (event) =>
                    //     {
                    //         console.log(event.channel)

                    //         switch(event.channel)
                    //         {
                    //             case 'download':
                    //             {
                    //                 console.log(m)
                    //                 for(var f of await findCurseforgeFile(m.originalData.id, m.originalData.slug))
                    //                 {
                    //                     if(!f.primary){continue}
                    //                     download(f.url, window.instance.path+'/mods', f.filename)
                    //                 }

                    //                 break;
                    //             }
                    //         }
                    //     }
                    //     webview.addEventListener('ipc-message', webviewListener);

                    //     await webview.executeJavaScript(`window.originalLocation = "${result[index].url}";`, true)
                    //     await webview.executeJavaScript(sourceCode, true)
                    // };

                    break;
                }
            }
        }
        switch(m.source)
        {
            case 'modrinth': { e.ondblclick = async () => { await window.web.downloadModrinth(result[index].url); e.setAttribute('installed',''); }; break; }
            case 'curseforge': { e.ondblclick = async () => { await window.web.downloadCurseforge(result[index].url); e.setAttribute('installed',''); }; break; }
        }
        

        document.querySelector('#resourcepack-download-list').appendChild(e)
        i++;
    }
}

// Modrinth File Finder
async function findModrinthFile(slug)
{
    const versions = (await (await fetch('https://api.modrinth.com/v2/project/'+slug+'/version')).json())
    .sort((a,b) => { return new Date(b.date_published) - new Date(a.date_published); });

    var version = versions.find(v => v.loaders.includes(window.instance.loader.name) && v.game_versions.includes(window.instance.version.number));
    if(!version) { return []; }

    return version.files;
}
async function findCurseforgeFile(id)
{
    // https://www.curseforge.com/api/v1/mods/431203/files?pageIndex=0&pageSize=20&sort=dateCreated&sortDescending=true&gameVersionId=9990&removeAlphas=true
    const versions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=0&pageSize=60&sort=dateCreated&sortDescending=true&gameVersion=${window.instance.version.number}&removeAlphas=false`)).json()).data
    .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });

    var version = versions.find(v =>
    {
        let valid = v.gameVersions.includes(window.instance.loader.name.charAt(0).toUpperCase() + window.instance.loader.name.slice(1));
        if(!valid && window.instance.loader.name == 'forge' && v.gameVersions.includes('NeoForge')) { valid = true; }
        if(!v.gameVersions.includes(window.instance.version.number)) { valid = false; }
        return valid;
    });
    if(!version) { return []; }

    let files =
    [{
        url: `https://www.curseforge.com/api/v1/mods/${id}/files/${version.id}/download`,
        filename: version.fileName,
        primary: true
    }];

    return files;
}


// More Info Panel
let infoPanel = document.getElementById('mod-info-panel');
function quickView(m)
{
    if(m.loadImages) { m.loadImages().then((r) => {m.loadImages=null;quickView(m)}) }

    infoPanel.querySelector('div:first-of-type > h2').innerText = m.name;
    infoPanel.querySelector('div:first-of-type > img').src = m.icon;
    infoPanel.querySelector('p').innerText = m.description;

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
}