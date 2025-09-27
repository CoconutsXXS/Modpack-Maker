let infoPanel = document.getElementById('mod-info-panel');

function filifyMods(mods, arrayPropertie = 'mods', setData = 'setModData', deleteElement = 'deleteMod', parentFolder = 'mods')
{
    mods = mods.filter(m=>!m.missing)
    let files = [];
    // Files
    for(let k in mods)
    {
        let m = mods[k];
        files.push
        ({
            name: m.name || m.title || m.filename,
            active: !m.disabled,
            path: m.virtualPath,
            index: m.hierarchyIndex,
            icon: m.icon,
            filename: m.filename,
            onSelect: ()=>
            {
                // Title, desc, icon
                infoPanel.querySelector('div:first-of-type > h2').innerText = mods[k]?.title;
                infoPanel.querySelector('div:first-of-type > img').src = mods[k].icon?m.icon:'';
                infoPanel.querySelector('p:first-of-type').innerText = mods[k]?.description;
                infoPanel.querySelector('p:last-of-type').innerText = mods[k]?("version: "+mods[k].version):'';

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
                infoPanel.querySelector('#supporting').childNodes[0].style.filter = `brightness(${mods[k].clientRequired?0.8:0.3})`
                infoPanel.querySelector('#supporting').childNodes[0].setAttribute('hover-info', mods[k].clientRequired?'Required in Client Side':'Unrequired in Client Side');
                infoPanel.querySelector('#supporting').childNodes[1].style.filter = `brightness(${mods[k].serverRequired?0.8:0.3})`
                infoPanel.querySelector('#supporting').childNodes[1].setAttribute('hover-info', mods[k].clientRequired?'Required in Server Side':'Unrequired in Server Side');
                window.loadHoverInfo();

                infoPanel.querySelector('#supporting').childNodes[2].childNodes[1].innerText = mods[k].dependencies?mods[k].dependencies.length.toString():'0'
                let dependents = mods.filter(mod => mod.dependencies?.find(d=>d.id==mods[k].id||d.filename==mods[k].filename||d.slug==mods[k].slug)!=null).length;
                infoPanel.querySelector('#supporting').childNodes[3].childNodes[1].innerText = dependents.toString();

                infoPanel.querySelector('#actions').childNodes[1].style.backgroundImage = `url(./resources/${mods[k].disabled?'disabled':'enabled'}.png)`
                // Disable
                infoPanel.querySelector('#actions').childNodes[1].onclick = async () =>
                {
                    mods[k].disabled = !mods[k].disabled;
                    if(mods[k].disabled==undefined){mods[k].disabled = true;}
                    await window.instance.setModData(mods[k])

                    infoPanel.querySelector('#actions').childNodes[1].style.backgroundImage = `url(./resources/${mods[k].disabled?'disabled':'enabled'}.png)`
                }
                // Config
                infoPanel.querySelector('#actions').childNodes[0].onclick = async () =>
                {
                    let p = 'Modpack\ Maker/instances/'+window.instance.name+'/minecraft/mods/'+(mods[k].filename.endsWith('.jar')?mods[k].filename.substring(0,mods[k].filename.length-4):(mods[k].filename.endsWith('.disabled')?mods[k].filename.substring(0, mods[k].filename.length-9):mods[k].filename))+(mods[k].disabled?'.disabled':'.jar');

                    window.configPanel((await window.instance.getConfigs()).sort((a,b) =>
                    {
                        return Math.max(similarity(a, f.name.toLowerCase().replace(' ','')),
                        similarity(a, f.name.toLowerCase().replace(' ','')+'-common'),
                        similarity(a, f.name.toLowerCase().replace(' ','')+'-client'),
                        similarity(a, f.name.toLowerCase().replace(' ','')+'-server')) -
                        Math.max(similarity(a, f.name.toLowerCase().replace(' ','')),
                        similarity(b, f.name.toLowerCase().replace(' ','')+'-common'),
                        similarity(b, f.name.toLowerCase().replace(' ','')+'-client'),
                        similarity(b, f.name.toLowerCase().replace(' ','')+'-server'))
                    }).reverse()[0])
                }
                // Delete
                infoPanel.querySelector('#actions').childNodes[2].onclick = async () =>
                {
                    window.instance.deleteMod(mods[k].filename);
                }
                // Website
                if(typeof(mods[k].originURL) == 'string')
                {
                    infoPanel.querySelector('#actions').childNodes[3].style.display = 'block';
                    infoPanel.querySelector('#actions').childNodes[3].style.backgroundImage = `url(${new URL(mods[k].originURL).host=='modrinth.com'?'./resources/website-logos/modrinth.png':'./resources/website-logos/curseforge.png'})`
                    infoPanel.querySelector('#actions').childNodes[3].onclick = async () =>
                    {
                        Array.from(document.getElementById('center-panel').childNodes[1].childNodes).find(e=>e.innerText=='Web').click();
                        switch(new URL(mods[k].originURL).host)
                        {
                            case 'modrinth.com':
                            {
                                window.web.loadModrinth(document.getElementById('web-window').querySelector('webview'), mods[k].originURL);
                                break;
                            }
                            case 'www.curseforge.com':
                            {
                                window.web.loadCurseforge(document.getElementById('web-window').querySelector('webview'), mods[k].originURL);
                                break;
                            }
                        }
                    }
                }
                else { infoPanel.querySelector('#actions').childNodes[3].style.display = 'none'; }

                // Edit
                infoPanel.querySelector('#actions').childNodes[4].style.display = 'block';
                infoPanel.querySelector('#actions').childNodes[4].onclick = async () =>
                {
                    Array.from(document.getElementById('center-panel').childNodes[1].childNodes).find(e=>e.innerText=='Content').click();
                    await window.openModContent("mods/"+mods[k].filename)
                }
            },
            onMove: (from, to, index)=>
            {
                console.log(from, to, index)
                mods[k].hierarchyIndex = index;
                mods[k].virtualPath = to;

                window.instance[setData](mods[k])
            },
            onSetActive: (active)=>
            {
                console.log(mods[k].filename, active)
                mods[k].disabled = !active;

                window.instance[setData](mods[k])
            }, onDelete: ()=>
            {
                console.log('destroy')

                if(m.folder)
                {
                    window.instance.virtualDirectories.splice(window.instance.virtualDirectories.findIndex(d => d.filename == m.filename && d.path == m.path), 1)

                    // Move all children
                    let count = 0;
                    for(let mod of window.instance.mods)
                    {
                        if(mod.virtualPath==undefined){continue}
                        if(m.path == mod.virtualPath.substring(0, mod.virtualPath.lastIndexOf('/')) && m.name == mod.virtualPath.split('/')[mod.virtualPath.split('/').length-1])
                        {
                            mod.virtualPath = '';
                            window.instance.setModData(mod)
                            count++;
                        }
                    }

                    window.instance.save(window.instance);
                    return;
                }

                window.instance[arrayPropertie].splice(window.instance[arrayPropertie].findIndex(d => d.filename == m.filename && d.path == m.path), 1)
                window.instance[deleteElement](m.filename);
            }
        })
    }
    // Folders
    for(let k in window.instance.virtualDirectories)
    {
        let d = window.instance.virtualDirectories[k]
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
                window.instance.virtualDirectories[k].path = to;
                window.instance.virtualDirectories[k].hierarchyIndex = index;
            },
            onSetActive: (active)=>{console.log(active)},
            onDelete: ()=>{console.log('destroy')}
        })
    }

    return files;
}

// Update Listener & Wait for Instance to load Explorer
// Mods
window.addInstanceListener(() =>
{
    let explorer = window.setupExplorer(document.getElementById('mods-explorer'), filifyMods(window.instance.mods, 'mods', 'setModData', 'deleteMod', 'mods'), (f) =>
    {
        f.onSelect = ()=> {  }
        f.onMove = (from, to, index)=>{}
        f.onSetActive = (active)=>{}
        f.onDelete = ()=>{}
        return f;
    })

    explorer.addNewFolderListener((f) =>
    {
        window.instance.virtualDirectories.push
        ({
            name: f.name,
            path: f.path,
            hierarchyIndex: f.hierarchyIndex,
            parent: 'mods'
        });
        window.instance.save(window.instance);
    })

    window.instance.onModUpdate = (instance, mods) =>
    {
        if(instance.name != window.instance.name){return;}
        explorer.update(filifyMods(mods, 'mods', 'setModData', 'deleteMod', 'mods'))
    }
})
// Resource Packs
window.addInstanceListener(() =>
{
    let explorer = window.setupExplorer(document.getElementById('rp-explorer'), filifyMods(window.instance.rp, 'rp', 'setRPData', 'deleteRP', 'resourcepacks'), (f) =>
    {
        f.onSelect = ()=> { console.log('select') }
        f.onMove = (from, to, index)=>{console.log(from, to, index)}
        f.onSetActive = (active)=>{console.log(active)}
        f.onDelete = ()=>{console.log('destroy')}
        return f;
    })

    explorer.addNewFolderListener((f) =>
    {
        window.instance.virtualDirectories.push
        ({
            name: f.name,
            path: f.path,
            hierarchyIndex: f.hierarchyIndex,
            parent: 'resourcepacks'
        });
        window.instance.save(window.instance);
    })

    window.instance.onRPUpdate = (instance, rp) =>
    {
        if(instance.name != window.instance.name){return;}
        explorer.update(filifyMods(rp, 'rp', 'setRPData', 'deleteRP', 'resourcepacks'))
    }
})
// Shader Packs
window.addInstanceListener(() =>
{
    let explorer = window.setupExplorer(document.getElementById('shaders-explorer'), filifyMods(window.instance.shaders, 'shaders', 'setShaderData', 'deleteShader', 'shaderpacks'), (f) =>
    {
        f.onSelect = ()=> { console.log('select') }
        f.onMove = (from, to, index)=>{console.log(from, to, index)}
        f.onSetActive = (active)=>{console.log(active)}
        f.onDelete = ()=>{console.log('destroy')}
        return f;
    })

    console.log(filifyMods(window.instance.shaders, 'shaders', 'setShaderData', 'deleteShader', 'shaderpacks'))

    explorer.addNewFolderListener((f) =>
    {
        window.instance.virtualDirectories.push
        ({
            name: f.name,
            path: f.path,
            hierarchyIndex: f.hierarchyIndex,
            parent: 'shaderpacks'
        });
        window.instance.save(window.instance);
    })

    window.instance.onShaderUpdate = (instance, shaders) =>
    {
        if(instance.name != window.instance.name){return;}
        explorer.update(filifyMods(shaders, 'shaders', 'setShaderData', 'deleteShader', 'shaderpacks'))
    }
})