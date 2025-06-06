let playButton = document.getElementById('play-button');
let stopButton = document.getElementById('stop-button');
let consoleContainer = document.getElementById('console-window');
var classContainer = document.getElementById('class-window').childNodes[3];
var classShearchInput = document.getElementById('class-window').childNodes[1].childNodes[1];


// Class Tab Variables & Functions
let classLog = '';
let fullClassLog = '';
let classFilter = null;
function filterClass(classStart)
{
    classFilter = classStart;
    let finalUpdated = '';
    for(let c of fullClassLog.split('\n'))
    {
        if(c.startsWith(classStart)){finalUpdated+='\n'+c}
    }
    classContainer.childNodes[0].innerText = finalUpdated
}
function shearchClass()
{
    if(classShearchInput.value == classFilter){return;}
    if(classShearchInput.value == '')
    {
        classFilter = null;
        classContainer.childNodes[0].innerText = classLog;
    }
    else { filterClass(classShearchInput.value); }

    for(let b of document.getElementById('class-window').childNodes[1].childNodes)
    {
        if(b.nodeType != 1 || b == classShearchInput){continue;}
        b.style.display = (b.innerText.startsWith(classShearchInput.value) && document.activeElement == classShearchInput && classShearchInput.value != '')?'block':'none'
    }
}
document.onclick = classShearchInput.oninput = shearchClass;



playButton.addEventListener('click', async () =>
{
    // Button Loading
    playButton.removeAttribute('pause');
    playButton.removeAttribute('play');
    playButton.setAttribute('load', '');

    // Save
    await window.instance.save(window.instance);

    // Logs
    let threads = [{name: 'main', color: '#5555ff'},{name: 'Render thread', color: '#8855aa'},{name: 'Server thread', color: '#aa5555'}];
    let logTypes = [{name: 'INFO', color: '#dddddd', softColor: 'unset'},{name: 'WARN', color: '#dddd00', softColor: '#aaaa55'},{name: 'ERROR', color: '#dd0000', softColor: '#AA5555'},{name: 'DEBUG', color: '#55dd55', softColor: '#33aa33'}]

    // Launch
    const i = await launch(window.instance.name,
        {
            log: (t, c) =>
            {
                // Prepare Element
                var el = document.createElement('p');
                if(t == 'progress')
                {
                    let loadText = ''; for (let i = 0; i < 64; i++) { loadText+='·'; }
                    for (let i = 0; i < Math.floor(c.task/c.total * 64); i++)
                    {
                        loadText = loadText.substring(0, i)+'#'+loadText.substring(i+1);
                    }

                    el.innerHTML = `<span style="color:#f3f3ff55">[PROGRESS]</span> <span style="color:#f3f3ff55">${c.type}:</span> ${loadText} - ${Math.floor(c.task/c.total * 100)}%`;
                    if(consoleContainer.childNodes.length > 0 && consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerText.startsWith(`[PROGRESS] ${c.type}: `))
                    {
                        consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerHTML = el.innerHTML;
                        el.remove();
                        return
                    }
                }
                else if(t == 'loaderProgress')
                {
                    let loadText = ''; for (let i = 0; i < 64; i++) { loadText+='·'; }
                    for (let i = 0; i < Math.floor(c.task/c.total * 64); i++)
                    {
                        loadText = loadText.substring(0, i)+'#'+loadText.substring(i+1);
                    }

                    el.innerHTML = `<span style="color:#f3f3ff55">[PROGRESS]</span> <span style="color:#f3f3ff55">loader download: :</span> ${loadText} - ${Math.floor(c.task/c.total * 100)}%`;
                    if(consoleContainer.childNodes.length > 0 && consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerText.startsWith(`[PROGRESS] loader download: `))
                    {
                        consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerHTML = el.innerHTML;
                        el.remove();
                        return
                    }
                }
                else { el.innerText = `[${t.toUpperCase()}] ${c}`; }

                if(typeof(c)=='string')
                {
                    let finalContent = '';
                    for(let c of el.innerText.split('\n'))
                    {
                        let thread = c.split(':')[2].match((/\[(.*?)\]/))[1].split('/')[0];
                        let type = c.split(':')[2].match((/\[(.*?)\]/))[1].split('/')[1];

                        if(threads.find(t=>t.name==thread) == undefined)
                        {
                            threads.push({name: thread, color: '#'+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')})
                        }
                        if(logTypes.find(t=>t.name==type) == undefined)
                        {
                            logTypes.push({name: type, color: '#'+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')})
                        }
                        c='<span style="color:#f3f3ff55">'+c.replace(`[${c.split(':')[2].match((/\[(.*?)\]/))[1]}]: `, `<span style="color:${threads.find(t=>t.name==thread).color}">[${thread}/<span style="color:${logTypes.find(t=>t.name==type).color}">${type}</span>]</span>: </span><span style="color:${logTypes.find(t=>t.name==type).softColor}">`)
                        c+='</span>'
                        finalContent = c+'\n';
                    }

                    for(let m of window.instance.mods)
                    {
                        if(m.modId==undefined){continue;}
                        for(let match of finalContent.matchAll(`${m.modId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`+`[a-z0-9/_\\-.]+`+`(?:\\.[a-z0-9]+)?`+`(?:-[a-z0-9_\\-.]+)?`))
                        {
                            finalContent = finalContent.slice(0, match.index)+ `<b style="cursor:pointer;" onclick="window.modButtonList.find(m=>m.data.filename=='${m.filename}').element.onmouseenter(); window.modButtonList.find(m=>m.data.filename=='${m.filename}').element.click();">` + match[0] + '</b>'+finalContent.slice(match.index + match[0].length, finalContent.length)
                        }
                    }
                    for(let match of finalContent.matchAll(/minecraft:[a-z0-9/_\-.]+(?:\.[a-z0-9]+)?(?:-[a-z0-9_\-.]+)?/g))
                    {
                        finalContent = finalContent.slice(0, match.index)+ '<u>' + match[0] + '</u>'+finalContent.slice(match.index + match[0].length, finalContent.length)
                    }

                    el.innerHTML = finalContent;
                }
            
                if(consoleContainer.childNodes.length > 0)
                {
                    let text = consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerText;
                    if(text.endsWith(el.innerText))
                    {
                        let start = text.slice(0, text.length-el.innerText.length);
                        if(start == 0) { consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerText = '(2) '+text; }
                        else if(start.startsWith("(") && start.endsWith(') ')) { consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerText = `(${Number(start.substring(1).slice(0, -2)) + 1}) `+el.innerText; }
            
                        return;
                    }
                }
                
                if(consoleContainer.scrollTop == (consoleContainer.scrollHeight - consoleContainer.offsetHeight))
                {
                    consoleContainer.appendChild(el);
                    consoleContainer.scrollTop = (consoleContainer.scrollHeight - consoleContainer.offsetHeight)
                }
                else { consoleContainer.appendChild(el); }
            },
            close: c =>
            {
                playButton.removeAttribute('pause');
                playButton.removeAttribute('load');
                playButton.setAttribute('play', '');            
            },
            network: (i, c) =>
            {
                switch(i)
                {
                    case "class_log":
                    {
                        // Add Tab
                        let classStart = c.split('/')[0]+'/'+c.split('/')[1];
                
                        if(Object.entries(document.getElementById('class-window').childNodes[1].childNodes).find(c => c[1].innerText == classStart) == undefined)
                        {
                            let b = document.createElement('button'); b.innerText = classStart; b.style.display = 'none';
                            document.getElementById('class-window').childNodes[1].appendChild(b);
                
                            b.onclick = () => { classShearchInput.value = classStart; shearchClass(); }
                        }
                
                        // Add Line
                        if(classFilter == null || classStart == classFilter)
                        {
                            if(classLog.length > 100000) { classLog = '...'+classLog.substring(c.length) }
                            if(classContainer.childNodes[0].innerText.length > 100000) { classContainer.childNodes[0].innerText = '...'+classContainer.childNodes[0].innerText.substring(c.length) }
                
                            classLog += c+'\n';
                            fullClassLog += c+'\n';
                            if(classContainer.scrollTop == classContainer.scrollHeight - classContainer.offsetHeight)
                            {
                                classContainer.childNodes[0].innerText += c+'\n';
                                classContainer.scrollTop = classContainer.scrollHeight - classContainer.offsetHeight
                            }
                            else { classContainer.childNodes[0].innerText += c+'\n'; }        
                        }

                        break;
                    }
                }
            },
            windowOpen: async (w, i) =>
            {
                // Button Pausable
                playButton.removeAttribute('load');
                playButton.removeAttribute('play');
                playButton.setAttribute('pause', '');

                stopButton.onclick = () => { closeGame(i); }

                return;

                // Resize
                window.oncenterpanelresize(document.getElementById('center-panel').getBoundingClientRect())

                // Stream
                const stream = await navigator.mediaDevices.getUserMedia
                ({
                    audio: false,
                    video:
                    {
                        mandatory:
                        {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: w.id
                        },

                        maxWidth: 1920,
                        maxHeight: 1080,

                        maxFrameRate: 120,

                        minWidth: 1280,
                        minHeight: 720,
                    }
                });

                const gameWindow = document.getElementById('game-window');
                gameWindow.srcObject = stream;
                gameWindow.onloadedmetadata = () => gameWindow.play();

            },
        }
    )

    // Resize
    window.oncenterpanelresize = (rect) => resizeGame(i, rect.x, rect.y+26, rect.width, rect.height-26, true);
});