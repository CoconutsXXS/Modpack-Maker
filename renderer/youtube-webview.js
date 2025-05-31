console.log('INJECTED YT')
console.log(window.captions)
setInterval(() =>
{
    try{modify();}catch(err){console.error(err)}
    if(description == null) { try{descTry();}catch(err){console.warn(err)} }
}, 1000/60);

let lastDescription = null;
let description = null;
let lastScrappedChapter = null;
let scrappedChapter = false;
let modButton = null;
let gallery = null;
let backButton = null;
function modify()
{
    window.scrollX = 0;
    if(window.location.href != window.originalLocation)
    {
        // window.location.assign(window.originalLocation);
        description = null; scrappedChapter = false;
        window.electron.sendToHost('new');
    }

    if(document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-right-controls > button.ytp-size-button.ytp-button") && 
    document.querySelector("#player-container.style-scope.ytd-watch-flexy") &&
    document.querySelector("#player-container.style-scope.ytd-watch-flexy").parentNode != document.querySelector("#player-full-bleed-container"))
    { document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-right-controls > button.ytp-size-button.ytp-button").click(); }

    // Subtitle
    let t = document.querySelector("#movie_player > div.html5-video-container > video").currentTime;
    window.electron.sendToHost('time', t);

    // Chapter
    if(document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-left-controls > div:nth-child(6) > button") && document.querySelector(".style-scope.ytd-engagement-panel-section-list-renderer > #contents.style-scope.ytd-macro-markers-list-renderer") && !scrappedChapter)
    {
        if(!document.querySelector(".style-scope.ytd-engagement-panel-section-list-renderer > #contents.style-scope.ytd-macro-markers-list-renderer").checkVisibility())
        { document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-left-controls > div:nth-child(6) > button").click(); }

        if(document.querySelector(".style-scope.ytd-engagement-panel-section-list-renderer > #contents.style-scope.ytd-macro-markers-list-renderer") &&
        document.querySelector(".style-scope.ytd-engagement-panel-section-list-renderer > #contents.style-scope.ytd-macro-markers-list-renderer").checkVisibility() && !scrappedChapter)
        {
            let chapters = [];
            for(let c of document.querySelector(".style-scope.ytd-engagement-panel-section-list-renderer > #contents.style-scope.ytd-macro-markers-list-renderer").childNodes)
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
                window.electron.sendToHost('chapters', chapters);
                lastScrappedChapter = chapters;
                scrappedChapter = true;
                console.log('chapters =',chapters)
                setTimeout(() => scrappedChapter = false, 3000);

                if(document.querySelector(".style-scope.ytd-engagement-panel-section-list-renderer > #contents.style-scope.ytd-macro-markers-list-renderer").checkVisibility())
                { document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-left-controls > div:nth-child(6) > button").click(); }
            }
        }
    }

    // New button
    if(document.querySelector("#top-level-buttons-computed > yt-button-view-model") != undefined && (modButton==null || !document.body.contains(modButton)))
    {
        modButton = document.querySelector("#top-level-buttons-computed > yt-button-view-model").cloneNode(true);
        modButton.firstChild.style.display = 'none'
        document.querySelector("#top-level-buttons-computed > yt-button-view-model").parentNode.insertBefore(modButton, document.querySelector("#top-level-buttons-computed > yt-button-view-model"))
        modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__button-text-content").innerText = 'Mod Link';
        modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > yt-icon").replaceWith(document.createElement("img"))
        modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > img").style.width = modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > img").style.height = '24px'
        modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > img").style.borderRadius = '8px';
        modButton.onclick = () => { window.electron.sendToHost('open-mod') }

        modButton.title = 'View Mod'
        modButton.setAttribute('data-title-no-tooltip', 'View Mod');
        modButton.setAttribute('aria-keyshortcuts', '');
    }
    if(gallery==undefined || !document.body.contains(gallery))
    {
        gallery = document.createElement('div');
        document.querySelector('#above-the-fold.style-scope.ytd-watch-metadata').insertBefore(gallery, document.querySelector('#above-the-fold.style-scope.ytd-watch-metadata > #bottom-row'))
        gallery.style.display = 'flex';
        gallery.style.width = '100%';
        gallery.style.overflowX = 'scroll'
        gallery.id = 'mod-gallery';
        gallery.style.display = 'none'
    }
    if(backButton==null)
    {
        backButton = document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-left-controls > button").cloneNode(true);
        document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-left-controls > button").parentNode.appendChild(backButton);
        backButton.style.rotate = '180deg';
        backButton.title = 'Back'
        backButton.setAttribute('data-title-no-tooltip', 'Back');
        backButton.setAttribute('aria-keyshortcuts', '');

        let escapeHTMLPolicy = trustedTypes.createPolicy("forceInner", {
            createHTML: (to_escape) => to_escape
        })
        backButton.innerHTML = escapeHTMLPolicy.createHTML(`<svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%"><use class="ytp-svg-shadow" xlink:href="#ytp-id-58"></use><path class="ytp-svg-fill" d="M 12,26 18.5,22 18.5,14 12,10 z M 18.5,22 25,18 25,18 18.5,14 z" id="ytp-id-58"></path></svg>`);

        backButton.onclick = () =>
        {
            window.electron.sendToHost('back');
            window.location.href = 'about:blank';
        }
    }
}

window.updateMod = function(name, icon, images, compatible)
{
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

    // outline: green 3px solid;
    modButton.firstChild.onmouseenter = () => { modButton.firstChild.firstChild.style.outline = (compatible?'green':'red')+' 3px solid' }
    modButton.firstChild.onmouseleave = () => { modButton.firstChild.firstChild.style.outline = 'none' }
}

window.scrollTo({top: 0})

function descTry()
{
    document.querySelector("#description-interaction").click();
    let desc = '';
    if(!document.querySelector("#description-inline-expander > yt-attributed-string > span")){return}
    for(let c of document.querySelector("#description-inline-expander > yt-attributed-string > span")?.childNodes)
    {
        if(c.nodeName != 'SPAN'){continue;}
        if(c.querySelector("a")) { desc+=c.querySelector("a").href+'\n'; }
        else{desc+=c.innerText+'\n'}
    }
    document.querySelector("#description-inline-expander > #collapse.button.style-scope.ytd-text-inline-expander").click()
    if(desc != '' && lastDescription != desc) { description = lastDescription = desc; window.electron.sendToHost('description', description); console.log('UPDATED DESC:',desc) }
}