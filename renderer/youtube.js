// import ytSearch from 'https://cdn.skypack.dev/youtube-search-api'
import YouTube from "https://cdn.skypack.dev/youtube-sr";
import { getSubtitles } from 'https://cdn.skypack.dev/youtube-captions-scraper'
import similarity from 'https://cdn.skypack.dev/similarity'

let webview = document.getElementById('youtube-integration');
const sourceCode = await (await fetch('renderer/youtube-webview.js')).text();
const urlRegex = /\b(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/g;

// Search
// let result = (await ytSearch.GetListByKeyword("Minecraft Mod Showcase", false, 60, [{type: "video"}])).items.filter(i =>
// {
//     console.log(i)
//     let array = i.length.simpleText.split(":");
//     let seconds = parseInt(array[0], 10) * 60 + parseInt(array[1], 10)
//     return seconds > 120
// });
// let videoId = result[0].id
// console.log(result)
// // videoId = 'Gc60OdjxaV0'

// EgQQARgD

// async function fetchYouTubeResults(url)
// {
//     const res = await fetch(url,
//     {
//         headers:
//         {
//             'User-Agent': 'Mozilla/5.0',
//             'Accept-Language': 'en-US,en;q=0.9'
//         }
//     });

//     const html = await res.text();

//     const match = html.match(/var ytInitialData = (.*?);\s*<\/script>/s);
//     if (!match) { return []; }

//     const ytInitialData = JSON.parse(match[1]);

//     const contents = ytInitialData.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;

//     const videoItems = [];

//     for (const content of contents)
//     {
//         const items = content.itemSectionRenderer?.contents || [];
//         for (const item of items)
//         {
//             const v = item.videoRenderer;
//             if (v) { videoItems.push(v) }
//         }
//     }

//     return videoItems;
// }
// console.log(await fetchYouTubeResults('https://www.youtube.com/results?search_query=Minecraft+Mod+Showcase&sp=EgQQARgD'))

async function getInitialData(html)
{
    const ytInitialDataMatch = html.match(/var ytInitialData = (.*?);\s*<\/script>/s);
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const clientVersionMatch = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);

    if (!ytInitialDataMatch || !apiKeyMatch || !clientVersionMatch)
    {
        throw new Error('Failed to extract required data from HTML');
    }

    return{
        ytInitialData: JSON.parse(ytInitialDataMatch[1]),
        apiKey: apiKeyMatch[1],
        clientVersion: clientVersionMatch[1],
    };
}
function extractVideos(data)
{
    const contents = data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;

    const videos = [];

    for (const content of contents)
    {
        const items = content.itemSectionRenderer?.contents || [];
        for (const item of items)
        {
            const v = item.videoRenderer;
            if(v) { videos.push(v) }
        }
    }

    const continuation = contents
        .flatMap(c => c.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || [])
        .filter(Boolean)[0];

    return { videos, continuation };
}
async function fetchNextVideos(continuation, apiKey, clientVersion)
{
    const url = `https://www.youtube.com/youtubei/v1/search?key=${apiKey}`;
    const body =
    {
        context: {
        client:
        {
            clientName: "WEB",
            clientVersion
        }
        },
        continuation
    };

    const res = await fetch(url,
    {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': clientVersion,
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'en-US,en;q=0.9'
        },
        body: JSON.stringify(body)
    });

    const json = await res.json();

    const continuationItems = json.onResponseReceivedCommands?.[0]?.appendContinuationItemsAction?.continuationItems || json.onResponseReceivedCommands?.[1]?.appendContinuationItemsAction?.continuationItems;

    if (!continuationItems) throw new Error('No continuation items found');

    const videos = [];
    let nextContinuation = null;

    for (const item of continuationItems[0].itemSectionRenderer.contents)
    {
        if (item.videoRenderer)
        {
            const v = item.videoRenderer;
            videos.push(v)
        }
        else if (item.continuationItemRenderer)
        {
            nextContinuation = item.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        }
    }

    return { videos, continuation: nextContinuation };
}
async function searchYouTube(searchUrl, maxResults = 50, update)
{
    const res = await fetch(searchUrl,
    {
        headers:
        {
            'User-Agent': 'Mozilla/5.0',
            'Accept-Language': 'en-US,en;q=0.9'
        }
    });
    const html = await res.text();

    const { ytInitialData, apiKey, clientVersion } = await getInitialData(html);

    const allVideos = [];

    let { videos, continuation } = extractVideos(ytInitialData);
    allVideos.push(...videos);

    update(allVideos);

    while (continuation && allVideos.length < maxResults)
    {
        const result = await fetchNextVideos(continuation, apiKey, clientVersion);
        allVideos.push(...result.videos);
        update(result.videos);
        continuation = result.continuation;
    }
}

let videoElement = document.querySelector('#youtube-search > div > div:first-of-type').cloneNode(true);
document.querySelector('#youtube-search > div > div:first-of-type').remove();

async function displaySearch(text = '')
{
    if(text!=''){text = ' '+text}
    webview.style.display = 'none';
    document.getElementById('youtube-search').style.display = 'block';

    document.querySelector('#youtube-search > div').innerHTML = '';
    await searchYouTube(`https://www.youtube.com/results?search_query=%23minecraft+%23mod+%23top${text.replace(/%20/g, '+')}&sp=EgQQARgD`, 60, resultHandler);
    await searchYouTube(`https://www.youtube.com/results?search_query=%23minecraft+%23mod+%23top${text.replace(/%20/g, '+')}&sp=EgQQARgC`, 60, resultHandler);
    
    function resultHandler(r)
    {
        for(let v of r)
        {
            let array = v.lengthText.simpleText.split(":");
            let seconds = parseInt(array[0], 10) * 60 + parseInt(array[1], 10)
            if(seconds<120){continue}

            let e = videoElement.cloneNode(true);
            document.querySelector('#youtube-search > div').appendChild(e);
            let thumbnail = v.thumbnail.thumbnails.sort((a,b)=>(a.width+a.height)-(b.width+b.height))[0].url;
            e.querySelector('div:first-of-type').style.backgroundImage = `url("${thumbnail}")`;
            e.querySelector('img:first-of-type').src = thumbnail;
            e.querySelector('h4:first-of-type').innerText = v.title.runs[0].text;
            e.onclick = () => { loadVideo(v.videoId) }
        }
    }
}
displaySearch();

document.getElementById('youtube-search').querySelector('input').onkeydown = (ev) => { if(ev.key == 'Enter'){displaySearch(document.getElementById('youtube-search').querySelector('input').value);} }

let event = null;
async function loadVideo(videoId)
{
    // videoId = 'Gc60OdjxaV0'
    // Listeners
    if(event!=null){webview.removeEventListener('dom-ready',event)}
    event = async () =>
    {
        if(event!=null){webview.removeEventListener('dom-ready',event)}
        webview.style.display = 'flex';
        document.getElementById('youtube-search').style.display = 'none';

        await webview.insertCSS
        (`
            #mod-gallery
            {
                display: flex;
                width: 100%;
                overflow-x: scroll;
                height: auto;
                max-height: 50vh;
                margin-top: 8px;
            }
            #mod-gallery > img
            {
                border-radius: 12px;
                margin-right: 8px;
                height: fit-content;
                max-width: 50vw;
            }
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
                width: calc(100% - 48px); !important;
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
                width: calc(100% - 48px);
                padding: 24px;
            }
            #guide { display: none; }
            #subscribe-button > ytd-subscribe-button-renderer > yt-smartimation > div.smartimation__border { pointer-events: none; }
        `)
        await webview.executeJavaScript(`window.originalLocation = "${webview.src}";`, true)
        await webview.executeJavaScript(`window.videoId = "${videoId}";`, true)
        await webview.executeJavaScript(sourceCode, true)

        // Cations
        let captions = await getSubtitles({videoID: videoId})
        await webview.executeJavaScript('window.captions = JSON.parse(`'+JSON.stringify(captions)+'`);', true)
    }
    webview.addEventListener('dom-ready', event)

    // Launch
    webview.src = `https://www.youtube.com/watch?v=${videoId}`

    // Mod Display
    let lastURL = null;
    async function setCurrentMod(baseUrl)
    {
        if(lastURL==baseUrl){return true;}
        let url = new URL(baseUrl);
        openFunction = function()
        {
            document.addEventListener('keypress', e => {if(e.key == 's'){document.getElementById('bottom-webview').openDevTools()}})
            window.web[url.hostname=='www.curseforge.com'?'loadCurseforge':'loadModrinth'](document.getElementById('bottom-webview'), baseUrl)
            Array.from(document.getElementById('bottom-panel').childNodes[1].childNodes[1].childNodes).find(e=>e.innerText=='Web').click();
        }

        // Youtube Button Update
        // let page = new DOMParser().parseFromString(await (await fetch(url)).text(), 'text/html');
        if(url.hostname=='www.curseforge.com')
        {
            let i = [];
            let res = await fetch(`https://www.curseforge.com/minecraft/${url.pathname.split('/')[2]}/${url.pathname.split('/')[3]}/gallery`);
            console.log(res.url, res.ok, res.status)
            if(!res.ok){return false;}
            let galPage = new DOMParser().parseFromString(await (res).text(), "text/html");
            if(galPage.querySelector('.images-gallery > ul:nth-child(1)'))
            {
                for(let c of galPage.querySelector('.images-gallery > ul:nth-child(1)').childNodes)
                {
                    if(!c.querySelector("a > img")){continue;}
    
                    i.push(c.querySelector("a > img").src);
                }
            }

            let type = url.pathname.split('/')[2];
            let cleanType = type;
            let classId = 6
            switch(type)
            {
                case 'mc-mods': { classId = 6; cleanType = 'mods'; break; }
                case 'shaders': { classId = 6552; cleanType = 'shaderpacks'; break; }
                case 'texture-packs': { classId = 12; cleanType = 'resourcepacks'; break; }
            }
            let files = await window.web.findCurseforgeFile((await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${url.pathname.split('/')[3]}&classId=${classId}`)).json()).data[0].id, cleanType == 'mods')

            await webview.executeJavaScript(`window.updateMod("${galPage.querySelector("#__next > div > main > div.ads-layout > div > div > div > div.name-container > h1").innerText}", "${galPage.querySelector(".project-header > #row-image").src}", ${JSON.stringify(i)}, ${files.length>0});`, true)
        }
        else
        {
            let i = [];
            
            let res = await fetch(`https://modrinth.com/${url.pathname.split('/')[1]}/${url.pathname.split('/')[2]}/gallery`);
            console.log(res.url, res.ok, res.status)
            if(!res.ok){return false;}
            let galPage = new DOMParser().parseFromString(await (res).text(), "text/html");
            if(galPage.querySelector('.items'))
            {
                for(let c of galPage.querySelector('.items').childNodes)
                {
                    if(c.nodeName != 'DIV'){continue}
                    if(!c.querySelector("a:nth-child(1) > img:nth-child(1)")){continue;}
    
                    i.push(c.querySelector("a:nth-child(1) > img:nth-child(1)").src);
                }
            }

            let files = await window.web.findModrinthFile(url.pathname.split('/')[2], url.pathname.split('/')[1]=='mod');

            await webview.executeJavaScript(`window.updateMod("${galPage.querySelector("h1.m-0").innerText}", "${galPage.querySelector(".gap-x-8 > div:nth-child(1) > img:nth-child(1)").src}", ${JSON.stringify(i)}, ${files.length>0});`, true)
        }

        lastURL=baseUrl
        return true;
    }

    // Description & Chapter & Links
    let currentChapter = null;
    let description = '';
    let chapters = [];
    let links = [];
    let time = 0;
    let openFunction = null
    webview.addEventListener('ipc-message', async (event) =>
    {
        switch(event.channel)
        {
            case 'back':
            {
                if(event!=null){webview.removeEventListener('dom-ready',event)}
                webview.style.display = 'none';
                document.getElementById('youtube-search').style.display = 'block';
                break;
            }
            case 'time':
            {
                time = event.args[0];
                if(chapters.length > 0 && chapters.sort((a,b) => b.time-a.time).find(a => a.time < time) != currentChapter)
                {
                    currentChapter = chapters.sort((a,b) => b.time-a.time).find(a => a.time < time);
                    if(!currentChapter) { console.log('no chapter found, chapter =', chapters, 'time = ', time); break; }
                    console.log(currentChapter.name)
                    let l = links.sort((a,b) => similarity(np(b.before), np(currentChapter.name), {sensitive: true}) - similarity(np(a.before), np(currentChapter.name), {sensitive: true}))[0];

                    console.log(currentChapter, links)
                    console.log("similar = ", l, similarity(np(l.before), np(currentChapter.name), {sensitive: true}))
                    if(similarity(np(l.before), np(currentChapter.name), {sensitive: true}) < 0.5) { return }

                    setCurrentMod(l.url);
                }

                break;
            }
            case 'open-mod': { if(openFunction!=null){openFunction()} }
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

                // If it's an only one mod showcase
                let usualLinks = links.filter(l=>new URL(l.url).hostname == 'www.curseforge.com'||new URL(l.url).hostname == 'modrinth.com');
                let modLinks = usualLinks.filter(l=>new URL(l.url).pathname.split('/')[1] == "mod" || new URL(l.url).pathname.split('/')[2] == "mc-mods")
                let rpLinks = usualLinks.filter(l=>new URL(l.url).pathname.split('/')[1] == "resourcepack" || new URL(l.url).pathname.split('/')[2] == "texture-packs")
                let shaderLinks = usualLinks.filter(l=>new URL(l.url).pathname.split('/')[1] == "shader" || new URL(l.url).pathname.split('/')[2] == "shaders")

                if(modLinks.filter.length <= 2 && (modLinks.filter(l=>new URL(l.url).hostname == 'www.curseforge.com').length == 1 || modLinks.filter(l=>new URL(l.url).hostname == 'modrinth.com').length == 1))
                {
                    let finish = false;
                    for(let l of modLinks.filter(l=>new URL(l.url).hostname == 'modrinth.com'))
                    {
                        if(finish){break;}
                        finish = await setCurrentMod(l.url);
                    }
                    for(let l of modLinks.filter(l=>new URL(l.url).hostname == 'www.curseforge.com'))
                    {
                        if(finish){break;}
                        finish = await setCurrentMod(l.url);
                    }
                }

                break;
            }
            case 'chapters':
            {
                chapters = event.args[0]
            }
            case 'new':
            {
                let url = new URL(webview.src);

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
}

// no parenthese
function np(s) { return s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s{2,}/g, ' ').trim(); }

document.addEventListener('keypress', e => {if(e.key == 'd'){webview.openDevTools()}})