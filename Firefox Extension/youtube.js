// Similarity
var cache = []
var codes = []

function levenshtein(value, other, insensitive)
{
  var length
  var lengthOther
  var code
  var result
  var distance
  var distanceOther
  var index
  var indexOther

  if (value === other) {
    return 0
  }

  length = value.length
  lengthOther = other.length

  if (length === 0) {
    return lengthOther
  }

  if (lengthOther === 0) {
    return length
  }

  if (insensitive) {
    value = value.toLowerCase()
    other = other.toLowerCase()
  }

  index = 0

  while (index < length) {
    codes[index] = value.charCodeAt(index)
    cache[index] = ++index
  }

  indexOther = 0

  while (indexOther < lengthOther) {
    code = other.charCodeAt(indexOther)
    result = distance = indexOther++
    index = -1

    while (++index < length) {
      distanceOther = code === codes[index] ? distance : distance + 1
      distance = cache[index]
      cache[index] = result =
        distance > result
          ? distanceOther > result
            ? result + 1
            : distanceOther
          : distanceOther > distance
          ? distance + 1
          : distanceOther
    }
  }

  return result
}
function similarity(a, b, options)
{
  var left = a || ''
  var right = b || ''
  var insensitive = !(options || {}).sensitive
  var longest = Math.max(left.length, right.length)

  return longest === 0
    ? 1
    : (longest - levenshtein(left, right, insensitive)) / longest
}

function np(s) { return s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s{2,}/g, ' ').trim(); }
const urlRegex = /\b(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/g;

// URL
window.originalLocation = window.location.href;
let videoId = new URL(window.location.href).searchParams.get("v");

// CSS
const linkElem = document.createElement('link');
linkElem.setAttribute('rel', 'stylesheet');
linkElem.setAttribute('href', browser.runtime.getURL('/youtube.css'));
console.log(browser.runtime.getURL('/youtube.css'))
document.body.appendChild(linkElem);


let description = null;
let time = 0;
let chapters = [];
let currentChapter;
let links = [];

let lastScrappedChapter = null;
let modButton = null;
let modSaveButton = null;
let gallery = null;


async function modify()
{
    if(window.location.href != window.originalLocation)
    {
        description = null;
    }

    // Clear
    if(modButton){modButton.remove();modButton=null;}
    if(modSaveButton){modSaveButton.remove();modSaveButton=null;}

    // Cinema
    // if(document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-right-controls > button.ytp-size-button.ytp-button") && 
    // document.querySelector("#player-container.style-scope.ytd-watch-flexy") &&
    // document.querySelector("#player-container.style-scope.ytd-watch-flexy").parentNode != document.querySelector("#player-full-bleed-container"))
    // { document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-right-controls > button.ytp-size-button.ytp-button").click(); }

    // Chapter
    if(!document.querySelector("ytd-engagement-panel-section-list-renderer.style-scope:nth-child(3) > div:nth-child(2) > ytd-macro-markers-list-renderer:nth-child(1) > div:nth-child(1)")){document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-left-controls > div:nth-child(6) > button").click();}
    if(document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-left-controls > div:nth-child(6) > button") && document.querySelector("ytd-engagement-panel-section-list-renderer.style-scope:nth-child(3) > div:nth-child(2) > ytd-macro-markers-list-renderer:nth-child(1) > div:nth-child(1)"))
    {
        // if(!document.querySelector("ytd-engagement-panel-section-list-renderer.style-scope:nth-child(3) > div:nth-child(2) > ytd-macro-markers-list-renderer:nth-child(1) > div:nth-child(1)").checkVisibility() && !scrappedChapter)
        // { document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-left-controls > div:nth-child(6) > button").click(); }

        if(document.querySelector("ytd-engagement-panel-section-list-renderer.style-scope:nth-child(3) > div:nth-child(2) > ytd-macro-markers-list-renderer:nth-child(1) > div:nth-child(1)") &&
        document.querySelector("ytd-engagement-panel-section-list-renderer.style-scope:nth-child(3) > div:nth-child(2) > ytd-macro-markers-list-renderer:nth-child(1) > div:nth-child(1)").checkVisibility())
        {
            chapters = [];

            console.log(document.querySelector("ytd-engagement-panel-section-list-renderer.style-scope:nth-child(3) > div:nth-child(2) > ytd-macro-markers-list-renderer:nth-child(1) > div:nth-child(1)").childNodes);
            console.log(document.querySelector("ytd-engagement-panel-section-list-renderer.style-scope:nth-child(3) > div:nth-child(2) > ytd-macro-markers-list-renderer:nth-child(1) > div:nth-child(1)").childNodes.length)
            for(let c of document.querySelector("ytd-engagement-panel-section-list-renderer.style-scope:nth-child(3) > div:nth-child(2) > ytd-macro-markers-list-renderer:nth-child(1) > div:nth-child(1)").childNodes)
            {
                if(!c.querySelector("#endpoint")) { continue }
                let splited = c.querySelector("#endpoint > #details > #time").innerText.split(':');
                chapters.push
                ({
                    name: c.querySelector("#endpoint > #details > h4.macro-markers.style-scope.ytd-macro-markers-list-item-renderer").innerText,
                    time: (parseInt(splited[0], 10) * 60) + (parseInt(splited[1], 10))
                })
            }

            if(JSON.stringify(lastScrappedChapter) != JSON.stringify(chapters))
            {
                console.log(JSON.stringify(lastScrappedChapter), JSON.stringify(chapters))
                lastScrappedChapter = chapters;
                // setTimeout(() => scrappedChapter = false, 3000);

                // if(document.querySelector("ytd-engagement-panel-section-list-renderer.style-scope:nth-child(3) > div:nth-child(2) > ytd-macro-markers-list-renderer:nth-child(1) > div:nth-child(1)").checkVisibility())
                // { document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-left-controls > div:nth-child(6) > button").click(); }
            }
        }

        document.querySelector("ytd-engagement-panel-section-list-renderer.style-scope:nth-child(3) > div:nth-child(1) > ytd-engagement-panel-title-header-renderer:nth-child(1) > div:nth-child(3) > div:nth-child(7) > ytd-button-renderer:nth-child(1) > yt-button-shape:nth-child(1) > button:nth-child(1)").click();
    }
    else
    {
        console.log("Failed to handle chapters");
        return false;
    }

    // New button
    if(document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0].querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > .ytIconWrapperHost") && document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0] != undefined && document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0].children.length > 0)
    {
        modButton = document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0].cloneNode(true);

        document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0].parentNode.insertBefore(modButton, document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0])
        modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__button-text-content").innerText = 'Mod Link';
        modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > .ytIconWrapperHost").replaceWith(document.createElement("img"))
        // #top-level-buttons-computed > yt-button-view-model > button-view-model > button > div.yt-spec-button-shape-next__icon > span > span > div > svg
        // #top-level-buttons-computed > yt-button-view-model > button-view-model > button > div.yt-spec-button-shape-next__icon
        modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > img").style.width = modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > img").style.height = '24px'
        modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > img").style.borderRadius = '8px';
        modButton.addEventListener("click", () => { document.querySelector("#movie_player > div.html5-video-container > video").pause(); });

        modButton.title = 'View Mod'
        modButton.setAttribute('data-title-no-tooltip', 'View Mod');
        modButton.setAttribute('aria-keyshortcuts', '');
        modButton.setAttribute("id", "new-custom-button")
    }
    else if(modButton==null || !document.body.contains(modButton))
    {
        console.log("Failed to create new buttons");
        return false;
    }


    if(document.querySelectorAll("#button-shape")[0])
    { document.querySelectorAll("#button-shape")[0].remove(); }
    

    if(!modSaveButton && document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0] != undefined && document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0].children.length > 0)
    {
        modSaveButton = document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0].cloneNode(true);

        document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0].parentNode.insertBefore(modSaveButton, document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0])
        modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__button-text-content").innerText = 'Save';


        if(modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > .ytIconWrapperHost"))
        {
            modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > .ytIconWrapperHost").replaceWith(document.createElementNS('http://www.w3.org/2000/svg',"svg"))
        }
        if(modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > img"))
        {
            modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > img").replaceWith(document.createElementNS('http://www.w3.org/2000/svg',"svg"))
        }

        let p = document.createElementNS('http://www.w3.org/2000/svg',"path");
        p.setAttributeNS(null, "d", "M18 4v15.06l-5.42-3.87-.58-.42-.58.42L6 19.06V4h12m1-1H5v18l7-5 7 5V3z");

        modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > svg").appendChild(p);

        modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > svg").setAttributeNS(null, "width", "24");
        modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > svg").setAttributeNS(null, "height", "24");
        modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > svg").style.display = 'inherit'
        modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > svg").style.pointerEvents = 'none'
        modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > svg").style.height = '100%'
        modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > svg").style.width = '100%'

        modSaveButton.title = 'Save'
        modSaveButton.setAttribute('data-title-no-tooltip', 'Save Mod');
        modSaveButton.setAttribute('aria-keyshortcuts', '');
        modSaveButton.setAttribute("id", "new-save-button")
    }
    else if(modSaveButton==null || !document.body.contains(modSaveButton))
    {
        console.log("Failed to create new buttons");
        return false;
    }

    if(gallery==undefined || !document.body.contains(gallery))
    {
        while(document.querySelector('#above-the-fold.style-scope.ytd-watch-metadata > #bottom-row')==undefined || document.querySelector('#above-the-fold.style-scope.ytd-watch-metadata')==undefined)
        {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        gallery = document.createElement('div');
        document.querySelector('#above-the-fold.style-scope.ytd-watch-metadata').insertBefore(gallery, document.querySelector('#above-the-fold.style-scope.ytd-watch-metadata > #bottom-row'))
        gallery.style.display = 'flex';
        gallery.style.width = '100%';
        gallery.style.overflowX = 'scroll'
        gallery.id = 'mod-gallery';
        gallery.style.display = 'none'

        let scroll = gallery.scrollLeft;
        gallery.addEventListener("wheel", (ev) =>
        {
            ev.preventDefault();
            scroll += ev.deltaY;
            if(scroll < 0){scroll=0;}
            if(scroll > gallery.scrollLeftMax){scroll=gallery.scrollLeftMax;}
        })

        let scrolInterval = setInterval(() =>
        {
            if(!gallery){clearInterval(scrolInterval);return;}
            if(scroll == gallery.scrollLeft){return;}
            gallery.scrollLeft = lerp(gallery.scrollLeft, scroll, 0.6);
        }, 1000/60)
        function lerp(a, b, t) { return a+(b-a)*t; }
    }
    else if(!document.body.contains(gallery))
    {
        console.log("Failed to handle gallery");
        return false;
    }

    return true;
}


function scrapDescription()
{
    if(description!=null){return true;}
    if(!document.querySelector("#description-inline-expander > #expanded > yt-attributed-string > span")) { if(!document.querySelector("#description-interaction")){return false} document.querySelector("#description-interaction").click(); }

    if(!document.querySelector("#description-inline-expander > #expanded > yt-attributed-string > span")){return false;}

    let desc = '';

    for(let c of document.querySelector("#description-inline-expander > #expanded > yt-attributed-string > span")?.childNodes)
    {
        if(c.nodeName != 'SPAN' && c.nodeName == 'UL')
        {
            for(let a of c.querySelectorAll('a')){desc+=a.href+'\n';}
        }
        else if(c.nodeName != 'SPAN'){continue;}
        if(c.querySelector("a")) { desc+=c.querySelector("a").href+'\n'; }
        else{desc+=c.innerText+'\n'}
    }

    document.querySelector("#description-inline-expander > #collapse.button.style-scope.ytd-text-inline-expander").click()
    if(desc != '' && description != desc)
    {
        description = desc;
        handleDescription();
    }

    return true
}

async function handleDescription()
{
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
            console.log(`https://docs.google.com/document/d/${url.pathname.split('/')[3]}/export?format=txt`)
            let doc = await (await fetch(`https://docs.google.com/document/d/${url.pathname.split('/')[3]}/export?format=txt`)).text();

            let linkText = doc.match(urlRegex)
            let nolinkText = doc.split(urlRegex)
            let index2 = 0;
            for(let l of linkText)
            {
                index2++;

                let before = null;
                let fullBefore = null;
                if(nolinkText.filter(p=>!urlRegex.test(p))[index2-1])
                {
                    fullBefore = nolinkText.filter(p=>!urlRegex.test(p))[index2-1].split('\n').filter(p=>p.replaceAll(' ', '')!='');

                    let substract = 2
                    while(fullBefore.length==0 && nolinkText.filter(p=>!urlRegex.test(p)).length > index2-substract && index2-substract >= 0)
                    {
                        fullBefore = nolinkText.filter(p=>!urlRegex.test(p))[index2-substract].split('\n').filter(p=>p.replaceAll(' ', '')!='');
                        substract++;
                    }

                    before = fullBefore[fullBefore.length-1].replace(/^\d+\s*[\-\.]\s*/, '').replace(/[\-\:\s]*$/, '').trim();
                }
                
                final.push
                ({
                    url: l,
                    before,
                    fullBefore
                })
            }
        }
        // MC-MOD.GG Scrapping
        if(url.hostname == "mc-mod.gg")
        {
            let doc = new DOMParser().parseFromString(await (await fetch(url.href)).text(), "text/html");;
            for(let c of doc.querySelector("#content").childNodes)
            {
                if(c.nodeName != "DIV"){continue;}
                c.querySelector("span").innerText
                final.push
                ({
                    url: c.querySelector("a").href,
                    before: c.querySelector("span").innerText,
                    fullBefore: [c.querySelector("span").innerText]
                })
            }
        }

        // Time Chapter
        if(url.hostname == 'www.youtube.com' && url.pathname == '/watch' && url.searchParams.get("v") == videoId && nolinkText.filter(p=>!urlRegex.test(p))[i].split('\n').filter(p=>p!='').length > 0)
        {
            let chapterTime = 0;
            if(url.searchParams.get("t") != null) { chapterTime = Number(url.searchParams.get("t").replace('s','')); }
            chapters.push({name: nolinkText.filter(p=>!urlRegex.test(p))[i].split('\n').filter(p=>p!='')[0].replace(/^\d+\s*[\-\.]\s*/, '').replace(/[\-\:\s]*$/, '').trim(), time: chapterTime});
        }

        if(url.hostname != 'www.curseforge.com' && url.hostname != 'modrinth.com') { continue; }

        let before = null;
        let fullBefore = null;
        if(nolinkText.filter(p=>!urlRegex.test(p))[i-1])
        {
            fullBefore = nolinkText.filter(p=>!urlRegex.test(p))[i-1].split('\n').filter(p=>p!='');

            let substract = 2
            while(fullBefore.length==0 && nolinkText.filter(p=>!urlRegex.test(p)).length > i-substract && i-substract >= 0)
            {
                fullBefore = nolinkText.filter(p=>!urlRegex.test(p))[i-substract].split('\n').filter(p=>p!='');
                substract++;
            }

            before = fullBefore[fullBefore.length-1].replace(/^\d+\s*[\-\.]\s*/, '').replace(/[\-\:\s]*$/, '').trim();
        }
        final.push
        ({
            url: url.href,
            before,
            fullBefore
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

    console.log("Links:",links)
}


async function setCurrentMod(baseUrl)
{
    console.log(baseUrl)
    let url = new URL(baseUrl);
    openFunction = function()
    {
        document.addEventListener('keypress', e => {if(e.key == 's'){document.getElementById('web-window').querySelector('webview').openDevTools()}})
        window.web[url.hostname=='www.curseforge.com'?'loadCurseforge':'loadModrinth'](document.getElementById('web-window').querySelector('webview'), baseUrl)
        Array.from(document.getElementById('center-panel').childNodes[1].childNodes).find(e=>e.innerText=='Web').click();
    }

    // Youtube Button Update
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

        updateMod
        (
            url.protocol+'//'+url.host+url.pathname,
            galPage.querySelector(".name-container > h1").innerText,
            galPage.querySelector(".author-info > img").src,
            galPage.querySelector(".project-summary").innerHTML,
            i
        );
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

        updateMod
        (
            url.protocol+'//'+url.host+url.pathname,
            galPage.querySelector("h1.m-0").innerText, 
            galPage.querySelector(".gap-x-8 > div:nth-child(1) > img:nth-child(1)").src, 
            galPage.querySelector("div.flex.gap-4 > div > p").innerText, 
            i
        );
    }

    lastURL=baseUrl
    return true;
}

async function updateMod(url, name, icon, description, images)
{
    if(!modButton || !modSaveButton){return;}
    modButton.firstChild.style.display = 'block'
    modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__button-text-content").innerText = name;
    modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > img").src = icon;

    while(gallery.firstChild) { gallery.removeChild(gallery.lastChild); }
    gallery.style.display = 'none'

    for(let i of images)
    {
        let el = document.createElement('img');
        el.src = i;
        el.fetchPriority = 'low'
        gallery.appendChild(el);
        gallery.style.display = 'flex'
    }

    // Save Button
    let saved = (await browser.runtime.sendMessage({ action: "app", content:
    {
        name: "isSaved",
        value: url
    }})).result

    modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > svg > path").setAttributeNS(null, "d", saved?"M5 3h14v18l-7-5-7 5V3z":"M18 4v15.06l-5.42-3.87-.58-.42-.58.42L6 19.06V4h12m1-1H5v18l7-5 7 5V3z");

    console.log(modButton)
    modButton.onclick = () => {window.open(url, "blank")}

    console.log(modSaveButton.onclick, "modSaveButton.onclick")
    modSaveButton.onclick = (ev) =>
    {
        ev.preventDefault();

        if(!saved)
        {
            browser.runtime.sendMessage({ action: "app", content:
            {
                name: "save",
                value:
                {
                    url,
                    name,
                    description,
                    icon,
                    date: new Date()
                }
            }})
            saved = true;
        }
        else
        {
            browser.runtime.sendMessage({ action: "app", content:
            {
                name: "unsave",
                value: url
            }})
            saved = false;
        }

        modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > svg > path").setAttributeNS(null, "d", saved?"M5 3h14v18l-7-5-7 5V3z":"M18 4v15.06l-5.42-3.87-.58-.42-.58.42L6 19.06V4h12m1-1H5v18l7-5 7 5V3z");
    }
}


function update()
{
    time = document.querySelector("#movie_player > div.html5-video-container > video").currentTime;

    // Chapter Mod Recognition
    // console.log(time, chapters)
    if(chapters.length > 0 && chapters.sort((a,b) => b.time-a.time).find(a => a.time < time) != currentChapter)
    {
        currentChapter = chapters.sort((a,b) => b.time-a.time).find(a => a.time < time);
        if(!currentChapter) { console.log('no chapter found, chapter =', chapters, 'time = ', time); }
        else
        {
            console.log(currentChapter.name)
            let l  = links.sort((a,b) =>
            {
                let ia = 0;
                for(let before of a.fullBefore)
                {
                    ia+=similarity(np(before), np(currentChapter.name), {sensitive: true});
                }
                ia /= a.fullBefore.length;

                let ib = 0;
                for(let before of b.fullBefore)
                {
                    ib+=similarity(np(before), np(currentChapter.name), {sensitive: true});
                }
                ib /= b.fullBefore.length;

                return Math.max(ib, similarity(np(b.before), np(currentChapter.name), {sensitive: true})) - Math.max(ia, similarity(np(a.before), np(currentChapter.name), {sensitive: true}));
            })[0];

            console.log(l);
            if(!l){return;}
            setCurrentMod(l.url);
        }
    }
}


let interval = null;
let intervalFunction = () =>
{
    let href = window.location.href;

    scrapDescription();
    if(description==null){return;}
    // Filter by #
    if(description.includes("#moddedminecraft") || description.includes("#minecraftmods") || (description.includes("#minecraft") && (description.includes("#mods") || description.includes("#modding"))))
    {
        clearInterval(interval);return;
    }

    modify();
    if(description!=null && modButton!=null && links.length>0 && chapters.length > 0)
    {
        clearInterval(interval);
        let subInterval = setInterval(() =>
        {
            if(href != window.location.href || !document.body.contains(modButton))
            {
                if(modButton){modButton.remove();}
                if(modSaveButton){modSaveButton.remove();}
                if(gallery){gallery.remove();}

                description = null;
                time = 0;
                chapters = [];
                currentChapter;
                links = [];

                lastScrappedChapter = null;
                modButton = null;
                modSaveButton = null;
                gallery = null;

                clearInterval(subInterval);

                if(!new URL(window.location.href).searchParams.has("v")){return;}

                if(interval){clearInterval(interval)}
                interval = setInterval(intervalFunction, 200);
                return;
            }
            update();
        }, 100)
    }
};

let videoWait = setInterval(() =>
{
    if(!document.querySelector(".video-stream")){return;}
    clearInterval(videoWait);

    document.querySelector(".video-stream").onloadeddata = (ev) =>
    {
        if(!new URL(window.location.href).searchParams.has("v")){return;}
        window.originalLocation = window.location.href;

        if(modButton){modButton.remove();}
        if(modSaveButton){modSaveButton.remove();}
        if(gallery){gallery.remove();}

        description = null;
        time = 0;
        chapters = [];
        currentChapter;
        links = [];

        lastScrappedChapter = null;
        modButton = null;
        modSaveButton = null;
        gallery = null;


        if(interval){clearInterval(interval)}
        interval = setInterval(intervalFunction, 200);
    }
}, 100);