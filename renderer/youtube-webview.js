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
let modSaveButton = null;
let gallery = null;
let backButton = null;
async function modify()
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
        if(!document.querySelector(".style-scope.ytd-engagement-panel-section-list-renderer > #contents.style-scope.ytd-macro-markers-list-renderer").checkVisibility() && !scrappedChapter)
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
                // setTimeout(() => scrappedChapter = false, 3000);

                if(document.querySelector(".style-scope.ytd-engagement-panel-section-list-renderer > #contents.style-scope.ytd-macro-markers-list-renderer").checkVisibility())
                { document.querySelector("#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-left-controls > div:nth-child(6) > button").click(); }
            }
        }
    }
    else if(!scrappedChapter)
    {
        console.log("Failed to handle chapters");
    }

    // New button
    if(document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0] != undefined && document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0].children.length > 0 && (modButton==null || !document.body.contains(modButton) || modButton.children.length == 0))
    {
        modButton = document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0].cloneNode(true);

        document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0].parentNode.insertBefore(modButton, document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0])
        modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__button-text-content").innerText = 'Mod Link';
        modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > .ytIconWrapperHost").replaceWith(document.createElement("img"))
        // #top-level-buttons-computed > yt-button-view-model > button-view-model > button > div.yt-spec-button-shape-next__icon > span > span > div > svg
        // #top-level-buttons-computed > yt-button-view-model > button-view-model > button > div.yt-spec-button-shape-next__icon
        modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > img").style.width = modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > img").style.height = '24px'
        modButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > img").style.borderRadius = '8px';
        modButton.onclick = () => { window.electron.sendToHost('open-mod'); document.querySelector("#movie_player > div.html5-video-container > video").pause(); }

        modButton.title = 'View Mod'
        modButton.setAttribute('data-title-no-tooltip', 'View Mod');
        modButton.setAttribute('aria-keyshortcuts', '');
        modButton.setAttribute("id", "new-custom-button")
    }
    else if(modButton==null || !document.body.contains(modButton))
    {
        console.log("Failed to create new buttons");
    }


    document.querySelectorAll("#button-shape")[0].remove();

    if(document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0] != undefined && document.querySelectorAll("#top-level-buttons-computed > yt-button-view-model")[0].children.length > 0 && (modSaveButton==null || !document.body.contains(modSaveButton) || modSaveButton.children.length == 0))
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

        setInterval(() =>
        {
            if(scroll == gallery.scrollLeft){return;}
            gallery.scrollLeft = lerp(gallery.scrollLeft, scroll, 0.6);
        }, 1000/60)
        function lerp(a, b, t) { return a+(b-a)*t; }
    }
    else if(!document.body.contains(gallery))
    {
        console.log("Failed to handle gallery");
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

window.updateMod = function(url, name, icon, description, images, compatible, saved)
{
    console.log("mod update");

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

    // Save Button
    modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > svg > path").setAttributeNS(null, "d", saved?"M5 3h14v18l-7-5-7 5V3z":"M18 4v15.06l-5.42-3.87-.58-.42-.58.42L6 19.06V4h12m1-1H5v18l7-5 7 5V3z");


    modSaveButton.onclick = (ev) =>
    {
        ev.preventDefault();

        if(!saved)
        {
            window.electron.sendToHost('save',
            {
                url,
                name,
                description,
                icon,
                date: new Date()
            });
            saved = true;
        }
        else
        {
            window.electron.sendToHost('unsave', url);
            saved = false;
        }

        modSaveButton.querySelector("button-view-model > button > div.yt-spec-button-shape-next__icon > svg > path").setAttributeNS(null, "d", saved?"M5 3h14v18l-7-5-7 5V3z":"M18 4v15.06l-5.42-3.87-.58-.42-.58.42L6 19.06V4h12m1-1H5v18l7-5 7 5V3z");
    }
}

// document.querySelectorAll()

window.scrollTo({top: 0})

function descTry()
{
    document.querySelector("#description-interaction").click();
    let desc = '';
    if(!document.querySelector("#description-inline-expander > #expanded > yt-attributed-string > span")){return}
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
    if(desc != '' && lastDescription != desc) { description = lastDescription = desc; window.electron.sendToHost('description', description); console.log('UPDATED DESC:',desc) }
}