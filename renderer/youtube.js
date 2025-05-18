import ytSearch from 'https://cdn.skypack.dev/youtube-search-api'
import { getSubtitles } from 'https://cdn.skypack.dev/youtube-captions-scraper'
import similarity from 'https://cdn.skypack.dev/similarity'

let webview = document.getElementById('youtube-integration');
const sourceCode = await (await fetch('renderer/youtube-webview.js')).text();
const urlRegex = /\b(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/g;

// Search
let result = (await ytSearch.GetListByKeyword("Minecraft Mods Review Top", true, 30, [{type: "video"}])).items.filter(i =>
{
    let array = i.length.simpleText.split(":");
    let seconds = parseInt(array[0], 10) * 60 + parseInt(array[1], 10)
    return seconds > 120
});
let videoId = result[0].id
videoId = 'Gc60OdjxaV0'
console.log(result[0])

// Cations
let captions = await getSubtitles({videoID: videoId})

// Launch
webview.src = `https://www.youtube.com/watch?v=${videoId}`
    
// Listeners
webview.addEventListener('dom-ready', async () =>
{
    console.log('DOM Ready')
    await webview.insertCSS
    (`
        #content > ytd-mini-guide-renderer { display: none; }
        #header#header#header#header { margin: 0; }
        #masthead-container#masthead-container {
            display: none !important;
        }
        #page-manager#page-manager {
            margin: 0 !important;
        }
        ytd-comments {
            max-height: 500px;
            overflow: auto;
        }
        #secondary#secondary {
            min-height: calc(100% - 48px) !important;
        }
        #primary#primary {
            min-width: calc(100% - 48px) !important;
        }
        #primary-inner#primary-inner {
            margin-top: 24px !important;
        }
        ytd-watch-flexy[full-bleed-player] #full-bleed-container.ytd-watch-flexy#full-bleed-container.ytd-watch-flexy{
            min-height: calc(100vh - 24px);
        }

        ytd-watch-flexy[flexy][use-larger-max-player-value]:not([full-bleed-player][full-bleed-no-max-width-columns]) #columns.ytd-watch-flexy {
            display: block;
        }
        ytd-watch-flexy[cinematics-enabled] #secondary.ytd-watch-flexy#secondary.ytd-watch-flexy {
            width: 100%;
            padding: 24px;
        }
        #guide { display: none; }
        #subscribe-button > ytd-subscribe-button-renderer > yt-smartimation > div.smartimation__border { pointer-events: none; }
    `)
    await webview.executeJavaScript(`window.originalLocation = "${webview.src}";`, true)
    await webview.executeJavaScript(`window.videoId = "${videoId}";`, true)
    await webview.executeJavaScript('window.captions = JSON.parse(`'+JSON.stringify(captions)+'`);', true)
    await webview.executeJavaScript(sourceCode, true)
})


// Description & Chapter & Links
let currentChapter = null;
let description = '';
let chapters = [];
let links = [];
let time = 0;
webview.addEventListener('ipc-message', async (event) =>
{
    switch(event.channel)
    {
        case 'time':
        {
            time = event.args[0];
            if(chapters.length > 0 && chapters.sort((a,b) => b.time-a.time).find(a => a.time < time) != currentChapter)
            {
                console.log(chapters, links)
                currentChapter = chapters.sort((a,b) => b.time-a.time).find(a => a.time < time);
                if(!currentChapter) { console.log('error during chapter detection, chapter =', chapters, 'time = ', time); break; }
                console.log(currentChapter.name)
                let l = links.sort((a,b) => similarity(np(b.before), np(currentChapter.name), {sensitive: true}) - similarity(np(a.before), np(currentChapter.name), {sensitive: true}))[0];

                if(similarity(np(l.before), np(currentChapter.name), {sensitive: true}) < 0.5) { return }

                let url = new URL(l.url);
                document.addEventListener('keypress', e => {if(e.key == 's'){document.getElementById('bottom-webview').openDevTools()}})
                window.web[url.hostname=='www.curseforge.com'?'loadCurseforge':'loadModrinth'](document.getElementById('bottom-webview'), l.url)
                Array.from(document.getElementById('bottom-panel').childNodes[1].childNodes[1].childNodes).find(e=>e.innerText=='Web').click();
            }

            break;
        }
        case 'description':
        {
            // Register all Mods Links and Chapter
            description = event.args[0];

            let linkText = description.match(urlRegex)
            let nolinkText = description.split(urlRegex)
            let link = []
            description.replace(urlRegex, function(url)
            {
                link.push(url);
                return url;
            })

            let final = [];
            let i = 0;
            for(let e of linkText)
            {
                i++;

                e = e.replaceAll('\n','');
                if(!e.startsWith('https://') && !e.startsWith('http://')) { e = 'https://'+e; }

                let baseUrl = new URL(e);
                let href = decodeURIComponent(baseUrl.searchParams.get("q"));
                let url = (href==null||href=='null')?baseUrl:new URL(href);

                // Google Doc Scrapping
                if(url.hostname == 'docs.google.com' && url.pathname.startsWith('/document/d'))
                {
                    let doc = await (await fetch(`https://docs.google.com/document/d/${url.pathname.split('/')[3]}/export?format=txt`)).text();
                    console.log(doc)

                    let linkText = doc.match(urlRegex)
                    let nolinkText = doc.split(urlRegex)
                    let index2 = 0;
                    for(let l of linkText)
                    {
                        index2++;

                        let before = null;
                        if(nolinkText.filter(p=>!urlRegex.test(p))[index2-1])
                        {
                            let previousList = nolinkText.filter(p=>!urlRegex.test(p))[index2-1].split('\n').filter(p=>p.replaceAll(' ', '')!='');

                            let substract = 2
                            while(previousList.length==0 && nolinkText.filter(p=>!urlRegex.test(p)).length > index2-substract && index2-substract >= 0)
                            {
                                previousList = nolinkText.filter(p=>!urlRegex.test(p))[index2-substract].split('\n').filter(p=>p.replaceAll(' ', '')!='');
                                substract++;
                            }
    
                            before = previousList[previousList.length-1].replace(/^\d+\s*[\-\.]\s*/, '').replace(/[\-\:\s]*$/, '').trim();
                        }
                        
                        final.push
                        ({
                            url: l,
                            before
                        })
                    }
                }

                // Time Chapter
                if(url.hostname == 'www.youtube.com' && url.pathname == '/watch' && url.searchParams.get("v") == videoId)
                {
                    let chapterTime = 0;
                    if(url.searchParams.get("t") != null) { chapterTime = Number(url.searchParams.get("t").replace('s','')); }
                    chapters.push({name: nolinkText.filter(p=>!urlRegex.test(p))[i].split('\n').filter(p=>p!='')[0].replace(/^\d+\s*[\-\.]\s*/, '').replace(/[\-\:\s]*$/, '').trim(), time: chapterTime});
                }

                if(url.hostname != 'www.curseforge.com' && url.hostname != 'modrinth.com') { continue; }

                let before = null;
                if(nolinkText.filter(p=>!urlRegex.test(p))[i-1])
                {
                    let previousList = nolinkText.filter(p=>!urlRegex.test(p))[i-1].split('\n').filter(p=>p!='');

                    let substract = 2
                    while(previousList.length==0 && nolinkText.filter(p=>!urlRegex.test(p)).length > i-substract && i-substract >= 0)
                    {
                        previousList = nolinkText.filter(p=>!urlRegex.test(p))[i-substract].split('\n').filter(p=>p!='');
                        substract++;
                    }

                    before = previousList[previousList.length-1].replace(/^\d+\s*[\-\.]\s*/, '').replace(/[\-\:\s]*$/, '').trim();
                }
                final.push
                ({
                    url: url.href,
                    before
                })
            }
            links = final;

            break;
        }
        case 'chapters':
        {
            chapters = event.args[0]
        }
        case 'new':
        {
            let url = new URL(webview.src);
            console.log(url)

            await webview.executeJavaScript(`window.originalLocation = "${webview.src}";`, true)
            if(url.hostname == 'www.youtube.com' && url.pathname == '/watch' && url.searchParams.get('v').length > 0)
            {
                await webview.executeJavaScript(`window.videoId = "${url.searchParams.get('v')}";`, true)  
                // chapters = [];
                // description = '';
            }
        }
    }
});

// no parenthese
function np(s) { return s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s{2,}/g, ' ').trim(); }

document.addEventListener('keypress', e => {if(e.key == 'd'){webview.openDevTools()}})