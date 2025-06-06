import similarity from 'https://cdn.skypack.dev/similarity'

Object.filter = (obj, predicate) => 
    Object.keys(obj)
          .filter( key => predicate({value: obj[key], key: key}) )
          .reduce( (res, key) => (res[key] = obj[key], res), {} );

let currentDirectory = ''
window.setupExplorer = (directory = '', container, files, onMove = (from, to) => {}, onSelect = (f) => {}, deleteEvent=()=>{}, activationEvent=()=>{}, propertieName = null) =>
{
    let elements = [];
    for(let d of files)
    {
        elements.push({name: d.name, folder: (d.folder!=undefined?d.folder:false), path: d.path.split('/').filter(p => p!=''), icon: d.icon, filename: d.filename, disabled: d.disabled});
    }
    elements = elements.sort((a, b) => {return a.path.length-b.path.length});

    let hierarchy = {};
    for(let e of elements)
    {
        // ALready Fodler
        if(e.folder)
        {
            let propPath = ''; for(let el of e.path) { propPath+=el+'/'; }
            hierarchy[propPath+e.name] =
            {
                name: e.name,
                folder: true,
                children: () => { return Object.filter(hierarchy, c => c.key.startsWith(propPath+e.name) && c.key != propPath+e.name) },
                path: propPath.split('/').filter(l => l!=''),
                filename: e.name,
                disabled: e.disabled
            }
            continue
        }

        let propPath = '';
        // for(let f of e.path)
        // {
        //     let location = propPath;
        //     propPath += f;
        //     propPath += '/';
        //     let currentPropPath = propPath;
        //     hierarchy[propPath] =
        //     {
        //         name: f,
        //         folder: true,
        //         children: () => { return Object.filter(hierarchy, c => c.key.startsWith(currentPropPath) && c.key != currentPropPath) },
        //         path: location.split('/').filter(l => l!=''),
        //         filename: f,
        //         disabled: e.disabled
        //     }
        // }
        if(propPath == '') { hierarchy[e.name] = {name: e.name, folder: e.folder, path: e.path, icon: e.icon, filename: e.filename, disabled: e.disabled}; }
        else { hierarchy[propPath+e.name] = {name: e.name, folder: e.folder, path: e.path, icon: e.icon, filename: e.filename, disabled: e.disabled}; }
    }

    for(let e of Object.values(hierarchy))
    {
        if(!e.folder){continue;}
        e.children = e.children();
    }


    // Element building
    let selected = null;
    container.addEventListener('mouseleave', () => { if(selected){selected.onmouseenter()} })
    function reloadExplorer(directory = [])
    {
        // Save previous scroll
        let lastScroll = [];
        for(let c of container.childNodes)
        {
            if(c.nodeName != 'DIV'){continue;}
            lastScroll.push(c.scrollTop)
        }
        console.log(lastScroll)

        directory = directory.filter(e=>e!='')
        if(directory[directory.length-1] != ''){directory.push('');}
        let pathDir = ''; for(let p of directory){pathDir+=p+'/';}pathDir.substring(0, pathDir.length-1);
        currentDirectory = pathDir

        // directory.push('')
        container.innerHTML = '';

        let progressionPath = [];
        let index = 0;
        for(let d of directory)
        {
            let subContainer = document.createElement('div');
            // Add all children
            for(let e of Object.values(hierarchy))
            {
                if(JSON.stringify(e.path) != JSON.stringify(progressionPath.filter(p=>p!=''))){ continue;}
    
                let b = document.createElement('button');
                b.innerText = e.name;
                b.style.opacity = e.disabled?'0.5':'1'
                if(e.icon)
                {
                    b.setAttribute('icon', '')
                    b.style.setProperty('--custom-icon', 'url('+e.icon+')')
                }
                subContainer.appendChild(b);

                if(e.folder)
                {
                    b.setAttribute('folder', '')
                    b.addEventListener('click', () =>
                    {
                        reloadExplorer(Array.from(e.path).concat([e.name]));
                    })
                }
                else if(propertieName!=null)
                {
                    if(window[propertieName] == undefined){window[propertieName] = [];}
                    window[propertieName].push({data: e, element: b});
                }

                // Over Event
                b.onmouseenter = () => { onSelect(e); }
                b.onclick = () => { if(selected){selected.removeAttribute('selected');} selected = b; b.setAttribute('selected', ''); }

                // Delete Button
                let db = document.createElement('button');
                b.appendChild(db);
                db.onclick = () => { deleteEvent(e); }
                // Active Button
                let ab = document.createElement('button');
                ab.style.backgroundImage = `url("./resources/${e.disabled?'disabled':'enabled'}.png")`
                b.appendChild(ab);
                ab.onclick = () =>
                {
                    ab.style.backgroundImage = `url("./resources/${(ab.style.backgroundImage == 'url("./resources/enabled.png")')?'disabled':'enabled'}.png")`;
                    activationEvent(e);
                }

                let mousePressed = false;
                b.addEventListener('mousedown', () => {mousePressed=true;})
                document.addEventListener('mouseup',up); b.addEventListener('mouseup',up)
                function up()
                {
                    mousePressed=false;
                    if(lastClosest!=null)
                    {
                        lastClosest.parentNode.insertBefore(b, lastClosest)
                        b.style.position = 'relative';
                        b.style.width = '100%'; b.style.top = b.style.left ='unset';
                        b.style.opacity = '1';
                        b.style.background = '';

                        move(e, directory.filter(p=>p!='').slice(0, Array.prototype.indexOf.call(lastClosest.parentNode.parentNode.childNodes, lastClosest.parentNode)))
                        function move(e, dest)
                        {
                            let fromPath = ''; for(let part of e.path.filter(p=>p!='')){fromPath+=part+'/'}
                            let path = ''; for(let part of dest){path+=part+'/'}

                            if(fromPath == path){return}
    
                            if(Object.getOwnPropertyDescriptor(hierarchy, fromPath+e.name))
                            {
                                Object.defineProperty(hierarchy, (path+e.name), Object.getOwnPropertyDescriptor(hierarchy, fromPath+e.name));
                            }
                            else { console.warn(fromPath+e.name+' do not exist...'); }
                            delete hierarchy[fromPath+e.name];
                            hierarchy[path+e.name].path = dest;


                            if(e.folder && e.children)
                            {
                                Object.values(hierarchy).filter(o =>
                                {
                                    // console.log(JSON.stringify(o.path) == JSON.stringify((fromPath+e.name).split('/').filter(z=>z!='')))
                                    // console.log(JSON.stringify(o.path), JSON.stringify((fromPath+e.name).split('/').filter(z=>z!='')))
                                    JSON.stringify(o.path) == JSON.stringify((fromPath+e.name).split('/').filter(z=>z!=''))
                                })
                                for(let c of Object.values(hierarchy).filter(o => JSON.stringify(o.path) == JSON.stringify((fromPath+e.name).split('/').filter(z=>z!=''))))
                                {
                                    move(c, dest.concat([e.name]));
                                }
                            }
    
                            onMove(fromPath+e.filename, path+e.filename)
                        }

                        reloadExplorer(directory)
                    }
                    if(ghost!=null) { ghost.remove();  }
                    ghost=mouseStart=lastClosest=buttonStart=null;
                }

                let mouseStart
                let buttonStart
                let ghost;
                let lastClosest
                document.addEventListener('mousemove', (e) =>
                {
                    if(!mousePressed){return}
                    let mousePosition = {x: e.clientX+document.documentElement.scrollLeft-document.body.clientLeft, y: e.clientY+document.documentElement.scrollTop-document.body.clientTop}
                    if(mouseStart==null) { mouseStart = mousePosition; }
                    if(b.style.position !='fixed' || buttonStart == null)
                    {                    
                        b.style.width = b.getBoundingClientRect().width+'px';
    
                        buttonStart = {x:b.getBoundingClientRect().x,y:b.getBoundingClientRect().y}

                        ghost = b.cloneNode(true)
                        b.parentNode.insertBefore(ghost, b);
                        ghost.style.opacity = '0.5';

                        b.style.position = 'fixed';
                        b.style.top = buttonStart.y+'px'; b.style.left = buttonStart.x+'px';
                        b.style.transition = 'all 0ms'
                        b.style.opacity = '0.5';
                        b.style.background = 'transparent';
                        b.style.color = '#ffffff';
                    }
                    else
                    {
                        ghost.style.display = 'none'
                        b.style.top = buttonStart.y - (mouseStart.y-mousePosition.y) - b.parentNode.getBoundingClientRect().y + 'px';
                        b.style.left = buttonStart.x - (mouseStart.x-mousePosition.x) - b.parentNode.getBoundingClientRect().x + 'px';

                        // let pos = b.getBoundingClientRect();

                        // Detect Closest
                        let closest = [];
                        // for(let sub of container.childNodes)
                        // {
                        //     if(sub.nodeName != 'DIV'){continue;}
                        //     closest = closest.concat(Array.from(sub.childNodes).filter(c=>c!=ghost&&c!=b&&c.nodeName=='BUTTON').sort((a,b) =>
                        //     {
                        //         // let apos = a.getBoundingClientRect(); let bpos = b.getBoundingClientRect(); origin
                        //         let apos = {x: a.getBoundingClientRect().x+a.getBoundingClientRect().width/2, y: a.getBoundingClientRect().y+a.getBoundingClientRect().height/2}; // center
                        //         let bpos = {x: b.getBoundingClientRect().x+b.getBoundingClientRect().width/2, y: b.getBoundingClientRect().y+b.getBoundingClientRect().height/2}; // center
                        //         // return (Math.abs(pos.x-apos.x)+Math.abs(pos.y-apos.y))-(Math.abs(pos.x-bpos.x)+Math.abs(pos.y-bpos.y)) // to button
                        //         return (Math.abs(mousePosition.x-apos.x)+Math.abs(mousePosition.y-apos.y))-(Math.abs(mousePosition.x-bpos.x)+Math.abs(mousePosition.y-bpos.y)) // to mouse
                        //     }))
                        // }
                        closest = Array.from(Array.from(container.childNodes).filter(a =>
                        {
                            let ap = a.getBoundingClientRect();
                            return ap.x<mousePosition.x && (ap.x+ap.width)>mousePosition.x
                        })[0].childNodes).filter(c=>c!=ghost&&c!=b&&c.nodeName=='BUTTON').sort((a,b) =>
                        {
                            let apos = {x: a.getBoundingClientRect().x+a.getBoundingClientRect().width/2, y: a.getBoundingClientRect().y+a.getBoundingClientRect().height/2}; // center
                            let bpos = {x: b.getBoundingClientRect().x+b.getBoundingClientRect().width/2, y: b.getBoundingClientRect().y+b.getBoundingClientRect().height/2}; // center
                            return (Math.abs(mousePosition.x-apos.x)+Math.abs(mousePosition.y-apos.y))-(Math.abs(mousePosition.x-bpos.x)+Math.abs(mousePosition.y-bpos.y)) // to mouse
                        })
                        
                        let hasChanged = closest[0]!=lastClosest;
                        ghost.style.display = 'block';
                        if(hasChanged)
                        {
                            lastClosest = closest[0];
                            lastClosest.parentNode.insertBefore(ghost, lastClosest)

                            // if(lastClosest.getAttribute('folder') == '') { lastClosest.onclick(); }    
                        }
                    }
                })
            }

            // Add Button
            let currentPath = ''; for(let p of progressionPath){currentPath+='/'+p;}
            let addButton = document.createElement('button');
            addButton.setAttribute('add', '')
            addButton.innerText = 'Add...';
            addButton.onclick = () =>
            {
                let newButton = document.createElement('button');
                let input = document.createElement('input');
                input.type = 'text';
                newButton.setAttribute('folder', '')
                newButton.appendChild(input);
                subContainer.insertBefore(newButton, subContainer.childNodes[subContainer.childNodes.length-1]);
                input.focus();

                let finished = false;
                input.addEventListener('focusout', () => { if(finished){return} newButton.remove(); })
                input.addEventListener('keypress', (e) =>
                {
                    if(e.key == "Enter" && input.value.length > 0)
                    {
                        finished=true;
                        // window.instance.virtualDirectories.push({path: currentPath, name: input.value, folder: true, parent: 'mods'});
                        // window.instance.save(window.instance)
                        let pathNameClean = '';
                        for(let y of (currentPath+'/'+input.value).split('/').filter(r=>r!='')){ pathNameClean+=y+'/'; }
                        while(pathNameClean.startsWith('/')){pathNameClean = pathNameClean.substring(1)}
                        while(pathNameClean.endsWith('/')){pathNameClean = pathNameClean.substring(0, pathNameClean.length-1)}
                        // console.log('create folder '+pathNameClean)

                        hierarchy[pathNameClean] =
                        {
                            path: currentPath.split('/').filter(p=>p!=''),
                            name: input.value,
                            folder: true,
                            children: Object.filter(hierarchy, c => c.key.startsWith(pathNameClean) && c.key != pathNameClean)
                        }
                        window.instance.virtualDirectories.push({path: currentPath, name: input.value, parent: 'mods'})
                        window.instance.save(window.instance);

                        newButton.innerHTML = '';
                        newButton.innerText = input.value;
                        reloadExplorer(directory)
                        newButton.addEventListener('click', () =>
                        {
                            reloadExplorer(currentPath.split('/').concat([input.value]))
                            // window.loadModsExplorer(currentPath+'/'+input.value)
                        })
                    }
                })
            }
            subContainer.appendChild(addButton)
            container.appendChild(subContainer)
            if(lastScroll[index] != undefined) { subContainer.scrollTo({top: lastScroll[index]}) }
            progressionPath.push(d);
            index++;
        }
    }

    reloadExplorer(directory.split('/'));
}

window.loadModsExplorer = (directory = null) =>
{
    if(!window.instance.mods){return}
    if(directory == null) { directory = currentDirectory; }
    let files = [];
    for(let m of window.instance.mods)
    {
        if(m.missing){continue;}
        files.push({path: m.virtualPath?m.virtualPath:'', name: m.title?m.title:m.filename, icon: m.icon, filename: m.filename, disabled: m.disabled})
    }
    for(let d of window.instance.virtualDirectories.filter(d => d.parent=='mods'))
    {
        files.push({path: d.path, name: d.name, folder: true, filename: d.name})
    }

    document.getElementById('right-panel').querySelector('.tab > button:nth-child(4)').disabled = window.instance.loader.name == 'vanilla' || (window.instance.mods.find(m=>m.title=='Iris'||m.title=='Iris Shaders'||m.title=='Oculus')==undefined);

    window.setupExplorer(directory, document.getElementById('mods-explorer'), files, (from, to) =>
    {
        window.instance.mods[window.instance.mods.findIndex(m => m.filename == from.split('/')[from.split('/').length-1])].virtualPath = to.substring(0, to.lastIndexOf('/'))==''?null:to.substring(0, to.lastIndexOf('/'));
        saveInstance(window.instance)
    }, (f) =>
    {
        // SELECT MOD

        if(f.folder) { return; }
        let infoPanel = document.getElementById('mod-info-panel');
        let m = window.instance.mods.find(m => m.filename == f.filename)

        // Title, desc, icon
        infoPanel.querySelector('div:first-of-type > h2').innerText = m?.title;
        infoPanel.querySelector('div:first-of-type > img').src = m.icon?m.icon:'';
        infoPanel.querySelector('p').innerText = m?.description;

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
        infoPanel.querySelector('#supporting').childNodes[0].style.filter = `brightness(${m.clientRequired?0.8:0.3})`
        infoPanel.querySelector('#supporting').childNodes[0].setAttribute('hover-info', m.clientRequired?'Required in Client Side':'Unrequired in Client Side');
        infoPanel.querySelector('#supporting').childNodes[1].style.filter = `brightness(${m.serverRequired?0.8:0.3})`
        infoPanel.querySelector('#supporting').childNodes[1].setAttribute('hover-info', m.clientRequired?'Required in Server Side':'Unrequired in Server Side');
        window.loadHoverInfo();

        infoPanel.querySelector('#supporting').childNodes[2].childNodes[1].innerText = m.dependencies?m.dependencies.length.toString():'0'
        let dependents = window.instance.mods.filter(mod => mod.dependencies?.find(d=>d.id==m.id||d.filename==m.filename||d.slug==m.slug)!=null).length;
        infoPanel.querySelector('#supporting').childNodes[3].childNodes[1].innerText = dependents.toString();

        infoPanel.querySelector('#actions').childNodes[1].style.backgroundImage = `url(./resources/${m.disabled?'disabled':'enabled'}.png)`
        // Disable
        infoPanel.querySelector('#actions').childNodes[1].onclick = async () =>
        {
            m.disabled = !m.disabled;
            if(m.disabled==undefined){m.disabled = true;}
            await window.instance.setModData(m)

            infoPanel.querySelector('#actions').childNodes[1].style.backgroundImage = `url(./resources/${m.disabled?'disabled':'enabled'}.png)`
        }
        // Config
        infoPanel.querySelector('#actions').childNodes[0].onclick = async () =>
        {
            let p = 'Modpack\ Maker/instances/'+window.instance.name+'/minecraft/mods/'+(m.filename.endsWith('.jar')?m.filename.substring(0,m.filename.length-4):(m.filename.endsWith('.disabled')?m.filename.substring(0, m.filename.length-9):m.filename))+(m.disabled?'.disabled':'.jar');

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
            window.instance.deleteMod(m.filename);
        }
    }, (m) =>
    {
        // Delete
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

            if(count==0){console.log(JSON.parse(JSON.stringify(window.instance))); window.loadModsExplorer()}
            return
        }
        window.instance.deleteMod(m.filename);

    }, async (m) =>
    {
        if(m.folder)
        {
            window.instance.virtualDirectories.splice(window.instance.virtualDirectories.findIndex(d => d.filename == m.filename && d.path == m.path), 1)
            window.instance.save(window.instance);
            return
        }
        // Activation
        m.disabled = !m.disabled;
        if(m.disabled==undefined){m.disabled = true;}
        await window.instance.setModData(m)
    }, "modButtonList")
}
window.loadShadersExplorer = (directory = null) =>
{
    console.log(window.instance.shaders);
    if(!window.instance.shaders){return}
    if(directory == null) { directory = currentDirectory; }
    let files = [];
    for(let m of window.instance.shaders)
    {
        if(m.missing){continue;}
        files.push({path: m.virtualPath?m.virtualPath:'', name: m.title?m.title:m.filename, icon: m.icon, filename: m.filename, disabled: m.disabled})
    }
    for(let d of window.instance.virtualDirectories.filter(d => d.parent=='shaderpacks'))
    {
        files.push({path: d.path, name: d.name, folder: true, filename: d.name})
    }

    window.setupExplorer(directory, document.getElementById('shaders-explorer'), files, (from, to) =>
    {
        window.instance.shaders[window.instance.shaders.findIndex(m => m.filename == from.split('/')[from.split('/').length-1])].virtualPath = to.substring(0, to.lastIndexOf('/'))==''?null:to.substring(0, to.lastIndexOf('/'));
        saveInstance(window.instance)
    }, (f) =>
    {
        // SELECT SHADER

        if(f.folder) { return; }
        let infoPanel = document.getElementById('mod-info-panel');
        let m = window.instance.shaders.find(m => m.filename == f.filename)

        // Title, desc, icon
        infoPanel.querySelector('div:first-of-type > h2').innerText = m?.title;
        infoPanel.querySelector('div:first-of-type > img').src = m.icon?m.icon:'';
        infoPanel.querySelector('p').innerText = m?.description;

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
        infoPanel.querySelector('#supporting').childNodes[0].style.filter = `brightness(${m.clientRequired?0.8:0.3})`
        infoPanel.querySelector('#supporting').childNodes[0].setAttribute('hover-info', m.clientRequired?'Required in Client Side':'Unrequired in Client Side');
        infoPanel.querySelector('#supporting').childNodes[1].style.filter = `brightness(${m.serverRequired?0.8:0.3})`
        infoPanel.querySelector('#supporting').childNodes[1].setAttribute('hover-info', m.clientRequired?'Required in Server Side':'Unrequired in Server Side');
        window.loadHoverInfo();

        infoPanel.querySelector('#supporting').childNodes[2].childNodes[1].innerText = m.dependencies?m.dependencies.length.toString():'0'
        let dependents = window.instance.shaders.filter(shader => shader.dependencies?.find(d=>d.id==m.id||d.filename==m.filename||d.slug==m.slug)!=null).length;
        infoPanel.querySelector('#supporting').childNodes[3].childNodes[1].innerText = dependents.toString();

        infoPanel.querySelector('#actions').childNodes[1].style.backgroundImage = `url(./resources/${m.disabled?'disabled':'enabled'}.png)`
        // Disable
        infoPanel.querySelector('#actions').childNodes[1].onclick = async () =>
        {
            m.disabled = !m.disabled;
            if(m.disabled==undefined){m.disabled = true;}
            await window.instance.setShaderData(m)

            infoPanel.querySelector('#actions').childNodes[1].style.backgroundImage = `url(./resources/${m.disabled?'disabled':'enabled'}.png)`
        }
        // Config
        infoPanel.querySelector('#actions').childNodes[0].onclick = async () =>
        {

        }
        // Delete
        infoPanel.querySelector('#actions').childNodes[2].onclick = async () =>
        {
            window.instance.deleteShader(m.filename);
        }
    }, (m) =>
    {
        // Delete
        if(m.folder)
        {
            window.instance.virtualDirectories.splice(window.instance.virtualDirectories.findIndex(d => d.filename == m.filename && d.path == m.path), 1)

            // Move all children
            for(let shader of window.instance.shaders)
            {
                if(m.path == shader.virtualPath.substring(0, shader.virtualPath.lastIndexOf('/')) && m.name == shader.virtualPath.split('/')[shader.virtualPath.split('/').length-1])
                {
                    shader.virtualPath = '';
                    window.instance.setShaderData(shader)
                }
            }

            window.instance.save(window.instance);
            return
        }
        window.instance.deleteShader(m.filename);

    }, async (m) =>
    {
        if(m.folder)
        {
            window.instance.virtualDirectories.splice(window.instance.virtualDirectories.findIndex(d => d.filename == m.filename && d.path == m.path), 1)
            window.instance.save(window.instance);
            return
        }
        // Activation
        m.disabled = !m.disabled;
        if(m.disabled==undefined){m.disabled = true;}
        await window.instance.setShaderData(m)
    })
}
window.loadRPExplorer = (directory = null) =>
{
    console.log(window.instance.rp);
    if(!window.instance.rp){return}
    if(directory == null) { directory = currentDirectory; }
    let files = [];
    for(let m of window.instance.rp)
    {
        if(m.missing){continue;}
        files.push({path: m.virtualPath?m.virtualPath:'', name: m.title?m.title:m.filename, icon: m.icon, filename: m.filename, disabled: m.disabled})
    }
    for(let d of window.instance.virtualDirectories.filter(d => d.parent=='resourcepacks'))
    {
        files.push({path: d.path, name: d.name, folder: true, filename: d.name})
    }

    window.setupExplorer(directory, document.getElementById('rp-explorer'), files, (from, to) =>
    {
        window.instance.rp[window.instance.rp.findIndex(m => m.filename == from.split('/')[from.split('/').length-1])].virtualPath = to.substring(0, to.lastIndexOf('/'))==''?null:to.substring(0, to.lastIndexOf('/'));
        saveInstance(window.instance)
    }, (f) =>
    {
        // SELECT SHADER

        if(f.folder) { return; }
        let infoPanel = document.getElementById('mod-info-panel');
        let m = window.instance.rp.find(m => m.filename == f.filename)

        // Title, desc, icon
        infoPanel.querySelector('div:first-of-type > h2').innerText = m?.title;
        infoPanel.querySelector('div:first-of-type > img').src = m.icon?m.icon:'';
        infoPanel.querySelector('p').innerText = m?.description;

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
        infoPanel.querySelector('#supporting').childNodes[0].style.filter = `brightness(${m.clientRequired?0.8:0.3})`
        infoPanel.querySelector('#supporting').childNodes[0].setAttribute('hover-info', m.clientRequired?'Required in Client Side':'Unrequired in Client Side');
        infoPanel.querySelector('#supporting').childNodes[1].style.filter = `brightness(${m.serverRequired?0.8:0.3})`
        infoPanel.querySelector('#supporting').childNodes[1].setAttribute('hover-info', m.clientRequired?'Required in Server Side':'Unrequired in Server Side');
        window.loadHoverInfo();

        infoPanel.querySelector('#supporting').childNodes[2].childNodes[1].innerText = m.dependencies?m.dependencies.length.toString():'0'
        let dependents = window.instance.rp.filter(rp => rp.dependencies?.find(d=>d.id==m.id||d.filename==m.filename||d.slug==m.slug)!=null).length;
        infoPanel.querySelector('#supporting').childNodes[3].childNodes[1].innerText = dependents.toString();

        infoPanel.querySelector('#actions').childNodes[1].style.backgroundImage = `url(./resources/${m.disabled?'disabled':'enabled'}.png)`
        // Disable
        infoPanel.querySelector('#actions').childNodes[1].onclick = async () =>
        {
            m.disabled = !m.disabled;
            if(m.disabled==undefined){m.disabled = true;}
            await window.instance.setRPData(m)

            infoPanel.querySelector('#actions').childNodes[1].style.backgroundImage = `url(./resources/${m.disabled?'disabled':'enabled'}.png)`
        }
        // Config
        infoPanel.querySelector('#actions').childNodes[0].onclick = async () =>
        {

        }
        // Delete
        infoPanel.querySelector('#actions').childNodes[2].onclick = async () =>
        {
            window.instance.deleteRP(m.filename);
        }
    }, (m) =>
    {
        // Delete
        if(m.folder)
        {
            window.instance.virtualDirectories.splice(window.instance.virtualDirectories.findIndex(d => d.filename == m.filename && d.path == m.path), 1)

            // Move all children
            for(let rp of window.instance.rp)
            {
                if(m.path == rp.virtualPath.substring(0, rp.virtualPath.lastIndexOf('/')) && m.name == rp.virtualPath.split('/')[rp.virtualPath.split('/').length-1])
                {
                    rp.virtualPath = '';
                    window.instance.setRPData(rp)
                }
            }

            window.instance.save(window.instance);
            return
        }
        window.instance.deleteRP(m.filename);

    }, async (m) =>
    {
        if(m.folder)
        {
            window.instance.virtualDirectories.splice(window.instance.virtualDirectories.findIndex(d => d.filename == m.filename && d.path == m.path), 1)
            window.instance.save(window.instance);
            return
        }
        // Activation
        m.disabled = !m.disabled;
        if(m.disabled==undefined){m.disabled = true;}
        await window.instance.setRPData(m)
    })
}

if(window.instance)
{
    window.instance.onModUpdate = (instance) => {if(instance.name != window.instance.name){return;} console.log('mods updated'); window.loadModsExplorer()};
    window.instance.onRPUpdate = (instance) => {if(instance.name != window.instance.name){return;} console.log('resourecpack updated'); window.loadRPExplorer()};
    window.instance.onShaderUpdate = (instance) => {if(instance.name != window.instance.name){return;} console.log('shaders updated'); window.loadShadersExplorer()};
    window.loadModsExplorer()
    window.loadRPExplorer()
    window.loadShadersExplorer()
}
window.addInstanceListener(() =>
{
    window.instance.onModUpdate = (instance) => {if(instance.name != window.instance.name){return;} console.log('mods updated'); window.loadModsExplorer()};
    window.instance.onShaderUpdate = (instance) => {if(instance.name != window.instance.name){return;} console.log('shaders updated'); window.loadShadersExplorer()};
    window.loadModsExplorer()
    window.loadShadersExplorer()
})