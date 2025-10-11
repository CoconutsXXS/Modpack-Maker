window.setupExplorer = (container, files, onNewFolder, onDrop, parentDependant = true) =>
{
    let currentPath = '';
    container.innerHTML='';

    // Quick fix
    for(let k in files) { files[k].path = cleanPath(files[k].path) }

    // Create container for diroctories in current path
    let dirElements = [];
    for(let d of currentPath.split(sep()))
    {
        let dirElement = document.createElement('div');
        container.appendChild(dirElement);
        dirElements.push(dirElement);
    }

    let newFolderListeners = [];

    function loadFolderContent(folderPath, erase = true)
    {
        folderPath = (folderPath.startsWith(sep())||folderPath=='')?folderPath:(sep()+folderPath);

        while(dirElements.length < folderPath.split(sep()).length)
        {
            let dirElement = document.createElement('div');

            container.appendChild(dirElement);
            dirElements.push(dirElement);
        }
        if(erase)
        {
            while(dirElements.length > folderPath.split(sep()).length)
            {
                dirElements.pop().remove();
            }
            dirElements[dirElements.length-1].setAttribute('path', cleanPath(folderPath));

            // Check Changed + Add Attributes
            let dirPath = '';
            for (let i = 0; i < dirElements.length; i++)
            {
                dirPath+=sep()+folderPath.split(sep())[i];
                dirPath=cleanPath(dirPath)

                if(dirElements[i].getAttribute('path') != dirPath)
                {
                    dirElements[i].setAttribute('path', dirPath);
                    loadFolderContent(dirPath);
                }
            }
        }

        dirElements[folderPath.split(sep()).length-1].innerHTML = '';

        // Add Button
        let ab = document.createElement('button');
        ab.setAttribute('add', '')
        ab.innerText = 'New Folder...';
        ab.style.minWidth = '100%'
        ab.onclick = () =>
        {
            let newButton = document.createElement('button');
            let input = document.createElement('input');
            input.type = 'text';
            newButton.setAttribute('folder', '')
            newButton.appendChild(input);
            dirElements[folderPath.split(sep()).length-1].insertBefore(newButton, dirElements[folderPath.split(sep()).length-1].lastChild);
            input.focus();

            let finished = false;
            input.addEventListener('focusout', () => { if(finished){return} newButton.remove(); })
            input.addEventListener('keypress', (e) =>
            {
                if(e.key == "Enter" && input.value.length > 0)
                {
                    finished=true;

                    let nf =
                    {
                        name: input.value,
                        active: true,
                        path: cleanPath(folderPath),
                        folder: true,
                        hierarchyIndex: files.filter(f=>cleanPath(f.path) == cleanPath(folderPath)).sort((a,b) => a.index-b.index).length,
                        onSelect: ()=>{console.log('select')}, onMove: (from, to)=>{console.log(from, to)}, onSetActive: (active)=>{console.log(active)}, onDelete: ()=>{console.log('destroy')}
                    }
                    if(files.find(f=>f.name==nf.name&&f.path==nf.path)!=undefined){newButton.remove();return;}
                    files.push(onNewFolder(nf))

                    addFile(files.length-1)
                    newButton.remove();
                    dirElements[folderPath.split(sep()).length-1].appendChild(ab);

                    for(let l of newFolderListeners) { l(nf); }
                }
            })
        }
        dirElements[folderPath.split(sep()).length-1].appendChild(ab);

        // Load Content
        for(let k in files)
        {
            if(cleanPath(files[k].path) != cleanPath(folderPath)){continue}
            addFile(k);
        }

        // Button Add
        function addFile(k)
        {
            if(files[k].index==undefined)
            {
                files[k].index = files.filter(f=>cleanPath(f.path)==cleanPath(folderPath)&&f.index!=undefined).length;
                files[k].onMove(cleanPath(folderPath), cleanPath(folderPath), files[k].index)
            }
            let f = files[k];

            // Create Element
            let b = document.createElement('button');
            b.innerText = f.name;
            b.style.opacity = f.disabled?'0.5':'1'
            b.setAttribute('index', f.index)
            files[k].element = b;

            if(currentPath.split(sep())[folderPath.split(sep()).length] == f.name)
            {
                b.setAttribute('in-path', '');
            }
            else if(b.hasAttribute('in-path'))
            {
                b.removeAttribute('in-path');
            }

            // Delete Button
            let db = document.createElement('button');
            b.appendChild(db);

            db.onclick = () => { f.onDelete(); }
            f.delete = () =>
            {
                files = files.slice(0, k).concat(files.slice(k+1, files.length))
                b.remove();
            }
            // Active Button
            let sab = document.createElement('button');
            sab.style.backgroundImage = `url("./resources/${f.active?'enabled':'disabled'}.png")`
            sab.style.opacity = f.active?'1':'0.5'
            b.appendChild(sab);
            sab.onclick = () => { f.onSetActive(!f.active); }
            f.setActive = (active) =>
            {
                files[k].active = active;
                sab.style.backgroundImage = `url("./resources/${active?'enabled':'disabled'}.png")`
                sab.style.opacity = active?'1':'0.5'
            }


            if(f.icon)
            {
                b.setAttribute('icon', '')
                b.style.setProperty('--custom-icon', 'url('+f.icon+')')
            }
            if(f.folder)
            {
                b.setAttribute('folder', '')
            }
            
            dirElements[folderPath.split(sep()).length-1].appendChild(b);

            // Order
            let unordered = Array.from(dirElements[folderPath.split(sep()).length-1].childNodes);
            dirElements[folderPath.split(sep()).length-1].innerHTML = '';
            for(let e of unordered.sort((a,b) => Number(a.getAttribute('index'))-Number(b.getAttribute('index'))))
            {
                dirElements[folderPath.split(sep()).length-1].appendChild(e);
            }
            dirElements[folderPath.split(sep()).length-1].appendChild(ab);

            // Move
            let fileCurrentPath = folderPath;
            let selected = false;
            let moving = false;
            let mouseInit;
            let posInit;
            let ghost;
            let ogPosGhost;
            let closest = [];

            // Normal Click Event
            b.addEventListener('mousedown', (ev) => 
            {
                if(selected || ev.target != b){return;}
                f.onSelect();
                for(let p of b.parentElement.parentElement.childNodes)
                {
                    for(let o of p.childNodes)
                    {
                        o.removeAttribute('selected')
                    }
                }
                b.setAttribute('selected', '');
                if(f.folder)
                {
                    currentPath = f.path+sep()+f.name;
                    loadFolderContent(f.path+sep()+f.name)

                    for(let o of b.parentElement.childNodes)
                    {
                        o.removeAttribute('in-path')
                    }
                    b.setAttribute('in-path', '');
                }
            })

            // Press
            b.onmousedown = (e) =>
            {
                if(e.target != b){return;}
                selected=true;
                moving=false;
                // Init Mouse Position
                mouseInit =
                {
                    x: e.clientX+document.documentElement.scrollLeft-document.body.clientLeft,
                    y: e.clientY+document.documentElement.scrollTop-document.body.clientTop
                }

                // Transorm to screen-space
                b.style.width = b.getBoundingClientRect().width+'px';

                let bodyRect = document.body.getBoundingClientRect(), elemRect = b.getBoundingClientRect(), offset = elemRect.top - bodyRect.top;
                posInit = 
                {
                    x: b.getBoundingClientRect().x - parentDependant?b.parentElement.parentElement.getBoundingClientRect().x:0,
                    y: parentDependant?(b.getBoundingClientRect().y - b.parentElement.parentElement.getBoundingClientRect().y + b.getBoundingClientRect().height*1.5 - 4):offset
                }

                ghost = document.createElement('div'); ghost.id = 'file-move-indicator'
                ogPosGhost = b.cloneNode(true); ogPosGhost.style.opacity = '0';
                if(b.parentNode != undefined) { b.parentNode.insertBefore(ogPosGhost, b) }

                b.style.position = 'fixed';
                b.style.left = b.style.top = 0;
                b.style.transition = 'all 0'
                b.style.translate = posInit.x + 'px ' + posInit.y + 'px'
            }
            // Release
            document.addEventListener('mouseup', () =>
            {
                b.style.position = 'relative';
                b.style.top = b.style.left ='unset';
                b.style.opacity = '1';
                b.style.removeProperty('background')
                b.style.removeProperty('color')
                b.style.removeProperty('width');
                b.style.removeProperty('pointer-events');
                b.style.translate = '0 0';

                if(!moving)
                {
                    if(ogPosGhost!=undefined){ogPosGhost.remove();}
                    if(ghost!=undefined){ghost.remove();}
                    selected=false;
                    return;
                }
                selected=moving=false;

                // Check if moved
                if(ghost == undefined || ogPosGhost == undefined)
                {
                    if(ogPosGhost!=undefined){ogPosGhost.remove();}
                    if(ghost!=undefined){ghost.remove();}
                    return
                }

                // If out
                if(ghost.parentNode==null)
                {
                    ghost.remove();
                    ghost = ogPosGhost;
                }
                ghost.parentNode.insertBefore(b, ghost)

                for(let c of dirElements){c.removeAttribute('highlight')}
                for(let c of closest){c.removeAttribute('highlight')}

                closest = [];
                ghost.remove();ghost=undefined;
                ogPosGhost.remove();ogPosGhost=undefined

                // Update
                let oldPath = cleanPath(fileCurrentPath);
                let newPath = b.parentNode.getAttribute('path');
                if(newPath == '' || newPath == null) { newPath = ''; }
                else { cleanPath(b.parentNode.getAttribute('path')); }

                fileCurrentPath = newPath
                files[k].path = fileCurrentPath;

                // Index: change other element with the same index
                let oldIndex = files[k].index;
                // Move down
                for (let i = oldIndex; i <= files.filter(f=>cleanPath(f.path)==oldPath&&f.index>=oldIndex).length; i++)
                {
                    let key = files.findIndex(f=>f.index==i && cleanPath(f.path) == oldPath && f!=files[k])
                    console.log(i, files[key], '-')

                    if(files[key] == undefined){continue}
                    files[key].index--;
                    files[key].element.setAttribute('index', files[key].index)
                    files[key].onMove(files[key].path, files[key].path, files[key].index)
                }
                let newIndex = Array.from(b.parentNode.childNodes).findIndex(e=>e==b);
                // Move Up
                for (let i = files.filter(f=>cleanPath(f.path)==fileCurrentPath&&f.index>=newIndex).length; i > newIndex; i--)
                {
                    let key = files.findIndex(f=>f.index==i-1 && cleanPath(f.path) == fileCurrentPath && f!=files[k]);
                    console.log(i, files[key], '+')

                    if(files[key] == undefined){continue}
                    files[key].index++;
                    files[key].element.setAttribute('index', files[key].index)
                    files[key].onMove(files[key].path, files[key].path, files[key].index)
                }
                files[k].index = newIndex;
                b.setAttribute('index', files[k].index)

                files[k].onMove(oldPath, newPath, files[k].index)

                // Update Children if Folder
                if(f.folder)
                {
                    for(let k in files)
                    {
                        if(!cleanPath(files[k].path).startsWith( cleanPath(oldPath+sep()+f.name) )){continue}
                        let ogPath = files[k].path;
                        files[k].path = cleanPath(newPath+sep()+f.name);
                        files[k].onMove(ogPath, files[k].path, files[k].index)
                    }

                    let newFolderPath = folderPath;
                    if(newFolderPath.startsWith(cleanPath(oldPath+sep()+f.name)))
                    {
                        newFolderPath = oldPath;
                    }
                    loadFolderContent(newFolderPath)
                }
            });
            // Move
            document.addEventListener('mousemove', (e) =>
            {
                if(!selected){return}
                moving=true;

                let mousePosition =
                {
                    x: e.clientX+document.documentElement.scrollLeft-document.body.clientLeft,
                    y: e.clientY+document.documentElement.scrollTop-document.body.clientTop
                }
                let mouseMove =
                {
                    x: mouseInit.x-mousePosition.x,
                    y: mouseInit.y-mousePosition.y
                }

                b.style.translate = (posInit.x - mouseMove.x) + 'px ' + (posInit.y - mouseMove.y) + 'px';

                // Graphic
                b.style.opacity = '0.5';
                b.style.background = 'transparent';
                b.style.color = '#ffffff';
                b.style.pointerEvents = 'none';

                // Stick to neighboor
                let folderEl = Array.from(dirElements).filter(a =>
                {
                    let ap = a.getBoundingClientRect();
                    return ap.x<mousePosition.x && (ap.x+ap.width)>mousePosition.x
                })[0];
                closest = folderEl==undefined?[]:Array.from(folderEl.childNodes).filter(c=>c!=ghost&&c!=b&&c.nodeName=='BUTTON'&&!c.hasAttribute('add')).sort((a,b) =>
                {
                    let apos = {x: a.getBoundingClientRect().x+a.getBoundingClientRect().width/2, y: a.getBoundingClientRect().y+a.getBoundingClientRect().height/2}; // center
                    let bpos = {x: b.getBoundingClientRect().x+b.getBoundingClientRect().width/2, y: b.getBoundingClientRect().y+b.getBoundingClientRect().height/2}; // center
                    return (Math.abs(mousePosition.x-apos.x)+Math.abs(mousePosition.y-apos.y))-(Math.abs(mousePosition.x-bpos.x)+Math.abs(mousePosition.y-bpos.y)) // to mouse
                })

                // Hightlight
                for(let c of dirElements){c.removeAttribute('highlight')}
                for(let c of closest){c.removeAttribute('highlight')}

                if(closest.length == 0 || folderEl == undefined)
                {
                    if(folderEl != undefined)
                    {
                        if(folderEl.childNodes.length==0) { folderEl.appendChild(ghost) }
                        else { folderEl.insertBefore(ghost, folderEl.lastChild) }
                        folderEl.setAttribute('highlight', '');
                        ghost.style.display = 'block'
                    }
                    return
                }

                ghost.style.display = closest[0].hasAttribute('folder')?'none':'block'

                if(closest[0].hasAttribute('folder')&&!closest[0]==ogPosGhost) { closest[0].setAttribute('highlight', ''); }
                else { closest[0].parentNode.setAttribute('highlight', ''); }

                // Which is the closest side
                if(Math.abs(closest[0].getBoundingClientRect().y-mousePosition.y) < Math.abs(closest[0].getBoundingClientRect().y+closest[0].getBoundingClientRect().height-mousePosition.y))
                {
                    closest[0].parentNode.insertBefore(ghost, closest[0])
                }
                else
                {
                    closest[0].parentNode.insertBefore(ghost, closest[0].nextSibling)
                }
            })
        }
    }

    // Load root files
    loadFolderContent('')
    // Load each folder of the current path
    for(let f of files.filter(f=>currentPath.startsWith(f.path+sep()+f.name)&&f.folder))
    {
        loadFolderContent(f.path+sep()+f.name)
    }

    return {
        update: (newFiles) =>
        {
            let oldFiles = files;
            // Assign and Conserve Element
            files = newFiles;

            let dirPath = '';
            for (let i = 0; i < dirElements.length; i++)
            {
                dirPath+=sep()+currentPath.split(sep())[i-1];
                dirPath=cleanPath(dirPath)
                if((i-1)<0){dirPath=""}

                // Update only modified folders
                let currentOldList = oldFiles.filter(f=>cleanPath(f.path)==dirPath);
                let currentNewList = newFiles.filter(f=>cleanPath(f.path)==dirPath);
                let changed = currentOldList.length!=currentNewList.length;

                for(let k in currentOldList)
                {
                    if(currentNewList[k] == undefined){continue}
                    currentNewList[k].element = {};
                    if(JSON.stringify(currentOldList[k]) != JSON.stringify(currentNewList[k]))
                    {
                        changed = true;
                        break;
                    }
                }

                if(changed)
                {
                    loadFolderContent(dirPath, false)
                }
            }
        },
        addNewFolderListener: (f) => { newFolderListeners.push(f); }
    }
}

function cleanPath(p)
{
    if(!p){p=sep()}
    
    while(p.startsWith(sep())) { p = p.slice(1) }
    while(p.endsWith(sep())) { p = p.slice(0, p.length-1) }
    return p;
}