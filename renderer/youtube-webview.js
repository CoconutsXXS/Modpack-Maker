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
            }
        }
    }
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