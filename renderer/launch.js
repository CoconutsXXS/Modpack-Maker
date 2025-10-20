let playButton = document.getElementById('play-button');
let stopButton = document.getElementById('stop-button');
let consoleContainer = document.getElementById('console-window');
var classContainer = document.getElementById('class-window').childNodes[3];
var classSearchInput = document.getElementById('class-window').childNodes[1].childNodes[1];

function randomFromSeed(str, extra = 0)
{
    let h = BigInt(0x9e3779b97f4a7c15) + BigInt(extra);
    for (let i = 0; i < str.length; i++) {
      h ^= BigInt(str.charCodeAt(i));
      h = (h * BigInt(0xbf58476d1ce4e5b9)) & BigInt("0xFFFFFFFFFFFFFFFF");
      h ^= h >> 31n;
      h = (h * BigInt(0x94d049bb133111eb)) & BigInt("0xFFFFFFFFFFFFFFFF");
      h ^= h >> 27n;
    }
    return Number(h & ((1n << 53n) - 1n)) / 2 ** 53; // [0,1)
  }


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
function searchClass()
{
    if(classSearchInput.value == classFilter){return;}
    if(classSearchInput.value == '')
    {
        classFilter = null;
        classContainer.childNodes[0].innerText = classLog;
    }
    else { filterClass(classSearchInput.value); }

    for(let b of document.getElementById('class-window').childNodes[1].childNodes)
    {
        if(b.nodeType != 1 || b == classSearchInput){continue;}
        b.style.display = (b.innerText.startsWith(classSearchInput.value) && document.activeElement == classSearchInput && classSearchInput.value != '')?'block':'none'
    }
}
document.onclick = classSearchInput.oninput = searchClass;



playButton.onclick = launchTrigger;
async function launchTrigger()
{
    // Button Loading
    playButton.removeAttribute('pause');
    playButton.removeAttribute('play');
    playButton.setAttribute('load', '');

    playButton.onclick = null;

    // Save
    await window.instance.save(window.instance);

    // Logs
    let threads = [{name: 'main', color: '#5555ff'},{name: 'Render thread', color: '#8855aa'},{name: 'Server thread', color: '#aa5555'}];
    let logTypes = [{name: 'DATA', color: '#dddddd', softColor: 'var(--text)'},{name: 'INFO', color: '#dddddd', softColor: 'var(--text)'},{name: 'WARN', color: '#dddd00', softColor: '#aaaa55'},{name: 'ERROR', color: '#dd0000', softColor: '#AA5555'},{name: 'DEBUG', color: '#55dd55', softColor: 'var(--text)'}]
    let preLogs = [];

    // Launch
    let closed = false;
    consoleContainer.innerHTML='';
    const i = await launch(window.instance.name,
        {
            log: (t, c) =>
            {
                if(closed){return;}

                let progress = c.task/c.total;
                if(isNaN(progress) && c.task){progress = c.task/100}
                else if(isNaN(progress)){progress = c/100}

                console.log(t, c)

                // [DATA] [15:49:36] [Render thread/WARN] [minecraft/VanillaPackResourcesBuilder]: Assets URL 'union:/Users/coconuts/Library/Application%20Support/Modpack%20Maker/instances/Ultra%20Immersive/minecraft/libraries/net/minecraft/client/1.20.1-20230612.114412/client-1.20.1-20230612.114412-srg.jar%23205!/assets/.mcassetsroot' uses unexpected schema[15:49:36] [Render thread/WARN] [minecraft/VanillaPackResourcesBuilder]: Assets URL 'union:/Users/coconuts/Library/Application%20Support/Modpack%20Maker/instances/Ultra%20Immersive/minecraft/libraries/net/minecraft/client/1.20.1-20230612.114412/client-1.20.1-20230612.114412-srg.jar%23205!/data/.mcassetsroot' uses unexpected schema

                // Prepare Element
                var el = document.createElement('p');
                if(t == "object-data")
                {
                    el.innerHTML = `<span style="opacity: 0.7; color: #${Math.floor(randomFromSeed(c.thread)*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(randomFromSeed(c.thread, 5)*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(randomFromSeed(c.thread, 12)*255/2+255/2).toString(16).padStart(2, '0')}">${c.thread}</span> <span style="opacity: 0.3">at</span> <span style="opacity: 0.5; color: #${Math.floor(randomFromSeed(c.logger)*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(randomFromSeed(c.logger,-2)*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(randomFromSeed(c.logger, 10)*255/2+255/2).toString(16).padStart(2, '0')}">${c.logger}</span><span style="opacity: 0.3">:</span> `;
                    let coloredSpan = document.createElement("span");
                    coloredSpan.style.color = c.level=='INFO'?'#f3f3ff90':(c.level=='WARN'?'#ffbb00c0':(c.level=='ERROR'?'#aa3333':'#55dd55a0'));
                    coloredSpan.innerText = c.text
                    el.appendChild(coloredSpan)
                }
                else if(t == "installation")
                {
                    let loadText = ''; for (let i = 0; i < 100; i++) { loadText+='·'; }
                    for (let i = 0; i < Math.floor(c.progress); i++)
                    {
                        loadText = loadText.substring(0, i)+'#'+loadText.substring(i+1);
                    }

                    el.innerHTML = `<span style="color:#f3f3ff55">[PROGRESS]</span> <span style="color:#f3f3ff55">${c.type}:</span> ${loadText} - ${Math.floor(c.progress)}%`;
                    if(consoleContainer.childNodes.length > 0 && consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerText.startsWith(`[PROGRESS] ${c.type}: `))
                    {
                        consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerHTML = el.innerHTML;
                        el.remove();
                        return
                    }
                }
                else if(t == 'progress')
                {
                    let loadText = ''; for (let i = 0; i < 64; i++) { loadText+='·'; }
                    for (let i = 0; i < Math.floor(progress * 64); i++)
                    {
                        loadText = loadText.substring(0, i)+'#'+loadText.substring(i+1);
                    }

                    el.innerHTML = `<span style="color:#f3f3ff55">[PROGRESS]</span> <span style="color:#f3f3ff55">${c.type}:</span> ${loadText} - ${Math.floor(progress * 100)}%`;
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
                    for (let i = 0; i < Math.floor(progress * 64); i++)
                    {
                        loadText = loadText.substring(0, i)+'#'+loadText.substring(i+1);
                    }

                    el.innerHTML = `<span style="color:#f3f3ff55">[PROGRESS]</span> <span style="color:#f3f3ff55">Loader Download: :</span> ${loadText} - ${Math.floor(progress * 100)}%`;
                    if(consoleContainer.childNodes.length > 0 && consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerText.startsWith(`[PROGRESS] Loader Download: `))
                    {
                        consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerHTML = el.innerHTML;
                        el.remove();
                        return
                    }
                }
                else if(t == 'javaProgress')
                {
                    let loadText = ''; for (let i = 0; i < 64; i++) { loadText+='·'; }
                    for (let i = 0; i < Math.floor(progress * 64); i++)
                    {
                        loadText = loadText.substring(0, i)+'#'+loadText.substring(i+1);
                    }

                    el.innerHTML = `<span style="color:#f3f3ff55">[PROGRESS]</span> <span style="color:#f3f3ff55">Java Downloading: :</span> ${loadText} - ${Math.floor(progress * 100)}%`;
                    if(consoleContainer.childNodes.length > 0 && consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerText.startsWith(`[PROGRESS] Java Downloading: `))
                    {
                        consoleContainer.childNodes[consoleContainer.childNodes.length-1].innerHTML = el.innerHTML;
                        el.remove();
                        return
                    }
                }
                else if(t != "installation") { el.innerText = `[${t.toUpperCase()}] ${c}`; }

                if(typeof(c)=='string')
                {
                    let finalContent = '';

                    for(let c of el.innerText.split('\n'))
                    {
                        let finalType = t.toUpperCase();
                        if(c.split(': ')[0]!=undefined && c.split(': ')[0].match((/\[(.*?)\]/)) != null)
                        {
                            let matches = c.split(': ')[0].match(/\[(.*?)\]/g);
                            for(let k in matches)
                            {
                                let name = matches[k].slice(1, matches[k].length-1);
                                if(name.includes(sep()))
                                {
                                    let thread = name.split(sep())[0];
                                    let type = name.split(sep())[1];

                                    if(threads.find(t=>t.name==thread) == undefined)
                                    {
                                        threads.push({name: thread, color: '#'+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')})
                                    }
                                    if(logTypes.find(t=>t.name==type) == undefined)
                                    {
                                        logTypes.push({name: type, color: '#'+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')})
                                    }
                                    if(type != '' && finalType == t.toUpperCase()){finalType=type}

                                    let lastAdd = ''
                                    if(!c.includes(']: ') && Number(k)==matches.length-1)
                                    {
                                        lastAdd=`<span style="color:${logTypes.find(t=>t.name==finalType)?.softColor}">`;
                                    }

                                    c=c.replace(`[${name}]`, `[<span style="color:${threads.find(t=>t.name==thread).color}">${thread}</span>/<span style="color:${logTypes.find(t=>t.name==type).color}">${type}</span>]`+lastAdd)
                                    continue
                                }

                                if(preLogs.find(p=>p.name==name) == undefined)
                                {
                                    preLogs.push({name: name, color: '#'+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')+Math.floor(Math.random()*255/2+255/2).toString(16).padStart(2, '0')})
                                }
                                if(name.match(/\[\d{2}:\d{2}:\d{2}\]/)!=undefined)
                                {
                                    preLogs[preLogs.findIndex(p=>p.name==name)].color = '#f3f3ff55'
                                }

                                let lastAdd = ''
                                if(!c.includes(']: ') && Number(k)==matches.length-1)
                                {
                                    lastAdd=`<span style="color:${logTypes.find(t=>t.name==finalType)?.softColor}">`;
                                }

                                c=c.replace(`[${name}]`, `[<span style="color:${preLogs.find(p=>p.name==name).color}">${name}</span>]`+lastAdd)
                            }

                            if(c.includes(']: '))
                            {
                                c=c.replace(`]: `, `]: <span style="color:${logTypes.find(t=>t.name==finalType)?.softColor}">`)
                            }
                        }

                        c='<span style="color:#f3f3ff55">'+c+'</span>';
                        finalContent = c+'\n';
                    }

                    for(let m of window.instance.mods)
                    {
                        if(m.modId==undefined){continue;}
                        for(let match of finalContent.matchAll(`${m.modId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`+`[a-z0-9/_\\-.]+`+`(?:\\.[a-z0-9]+)?`+`(?:-[a-z0-9_\\-.]+)?`))
                        {
                            finalContent = finalContent.slice(0, match.index)+ `<span style="cursor:pointer; filter: brightness(2); color: #fff;" onclick="window.modButtonList.find(m=>m.data.filename=='${m.filename}').element.onmouseenter(); window.modButtonList.find(m=>m.data.filename=='${m.filename}').element.click();">` + match[0] + '</span>'+finalContent.slice(match.index + match[0].length, finalContent.length)
                        }
                    }
                    for(let match of finalContent.matchAll(/minecraft:[a-z0-9/_\-.]+(?:\.[a-z0-9]+)?(?:-[a-z0-9_\-.]+)?/g))
                    {
                        finalContent = finalContent.slice(0, match.index)+ '<span style="filter: brightness(2); color: #fff;">' + match[0] + '</span>'+finalContent.slice(match.index + match[0].length, finalContent.length)
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
                playButton.removeAttribute('resume');
                playButton.setAttribute('play', '');
                playButton.setAttribute("soft-hover-info", 'Launch');
                stopButton.removeAttribute("kill")
                stopButton.setAttribute("soft-hover-info", 'Close');
                stopButton.onclick = null;
                closed = true;
                document.querySelector("#game-container > div").style.display = "block"

                playButton.onclick = launchTrigger;
            },
            processLaunch: () =>
            {
                stopButton.setAttribute("soft-hover-info", 'Kill');
                stopButton.setAttribute("kill", '');
                stopButton.onclick = () =>
                {
                    killGame(i);
                    playButton.removeAttribute('pause');
                    playButton.removeAttribute('load');
                    playButton.setAttribute('play', '');      
                    playButton.removeAttribute('resume');
                    stopButton.removeAttribute("kill")
                    stopButton.setAttribute("soft-hover-info", 'Close');
                    playButton.setAttribute("soft-hover-info", 'Launch');
                    stopButton.onclick = null;
                    closed = true;      
                }

                playButton.removeAttribute('pause');
                playButton.removeAttribute('play');
                playButton.removeAttribute('resume');
                playButton.setAttribute('load', '');
                playButton.setAttribute("soft-hover-info", 'Pause');
                playButton.onclick = pause
                function pause()
                {
                    pauseGame(i);
                    playButton.removeAttribute('pause');
                    playButton.removeAttribute('load');
                    playButton.setAttribute('resume', '');
                    playButton.setAttribute("soft-hover-info", 'Resume');
                    playButton.onclick = resume
                }
                function resume()
                {
                    resumeGame(i);
                    playButton.removeAttribute('load');
                    playButton.removeAttribute('play');
                    playButton.removeAttribute('resume');
                    playButton.setAttribute('pause', '');
                    playButton.setAttribute("soft-hover-info", 'Pause');
                    playButton.onclick = pause
                }
            },
            network: (i, c) =>
            {
                switch(i)
                {
                    case "class_log":
                    {
                        // Add Tab
                        let classStart = c.split(sep())[0]+sep()+c.split(sep())[1];
                
                        if(Object.entries(document.getElementById('class-window').childNodes[1].childNodes).find(c => c[1].innerText == classStart) == undefined)
                        {
                            let b = document.createElement('button'); b.innerText = classStart; b.style.display = 'none';
                            document.getElementById('class-window').childNodes[1].appendChild(b);
                
                            b.onclick = () => { classSearchInput.value = classStart; searchClass(); }
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

                stopButton.removeAttribute("kill")
                stopButton.setAttribute("soft-hover-info", 'Close');
                stopButton.onclick = () =>
                {
                    closeGame(i);
                    stopButton.setAttribute("soft-hover-info", 'Kill');
                    stopButton.setAttribute("kill", '');
                    stopButton.onclick = () =>
                    {
                        killGame(i);
                        playButton.removeAttribute('pause');
                        playButton.removeAttribute('load');
                        playButton.setAttribute('play', '');      
                        stopButton.removeAttribute("kill")
                        stopButton.setAttribute("soft-hover-info", 'Close');
                        stopButton.onclick = null;
                        closed = true;      
                    }
                }

                // return;

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
                document.querySelector("#game-container > div").style.display = "none"
            },
        }
    )

    // Resize
    window.oncenterpanelresize = (rect) => resizeGame(i, rect.x, rect.y+26, rect.width, rect.height-26, true);
}