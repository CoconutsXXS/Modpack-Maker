let playButton = document.getElementById('play-button');
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
    await saveInstance(window.instance);

    // Launch
    const i = await launch(window.instance.name,
        {
            log: (t, c) =>
            {
                // Prepare Element
                var el = document.createElement('p');
                if(t == 'progress') { el.innerText = `[PROGRESS] ${c.type}: ${Math.round(c.task/c.total * 100)}%`; }
                else if(t == 'loaderProgress') { el.innerText = `[PROGRESS] loader download: ${c}%`; }
                else { el.innerText = `[${t.toUpperCase()}] ${c}`; }
            
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
            windowOpen: async (w) =>
            {
                // Button Pausable
                playButton.removeAttribute('load');
                playButton.removeAttribute('play');
                playButton.setAttribute('pause', '');

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