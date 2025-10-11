setInterval(() =>
{
    if(document.getElementById('#__next > div > main > div.game-header') == undefined || document.getElementById('#__next > div > main > div.game-header').style.display != 'none')
    {
        try{modify()}catch(err){console.error(err)}
    }
}, 1000/60);

window.versionSelect = async function(versions)
{
    versions = JSON.parse(versions);
    console.log(versions);

    let back = document.createElement('div'); back.id = 'panelBack'
    document.body.appendChild(back);
    back.onclick = () => {back.remove(); panel.remove();}
    let panel = document.createElement('div'); panel.id = 'versionPanel';
    document.body.appendChild(panel)

    for(let v of versions.reverse())
    {
        let e = document.createElement('button');
        panel.appendChild(e);
        e.innerText = `${v.displayName}`
        e.onclick = () => { window.electron.sendToHost('download', v.fileName); back.remove(); panel.remove(); }
    }
}

try{
    var downloaded = false;
}
catch(err){}

function modify()
{
    // document.querySelector("div.ads-layout-content > div > ul > li:nth-child(3)").style.display = 'none';
    // for (let i = 0; i < document.querySelector("div.ads-layout-content > div > ul").childNodes.length; i++)
    // {
    //     if(document.querySelector("div.ads-layout-content > div > ul").childNodes[i].querySelector("a").innerHTML == "")
    //     { document.querySelector("div.ads-layout-content > div > ul").childNodes[i].remove() }
    // }

    // Modify & Add Buttons
    // try with <button>
    try
    {
        if(document.querySelector("aside > div > div:nth-child(3) > div > div > button")&&document.querySelector("aside > div > div:nth-child(3) > div > div > button").id != "button-main-download")
        {
            document.querySelector("aside > div > div:nth-child(3) > div > div > button").replaceWith(document.querySelector("aside > div > div:nth-child(3) > div > div > button").cloneNode(true));
            document.querySelector("aside > div > div:nth-child(3) > div > div > button").id = "button-main-download"

            window.updateDownloaded(downloaded);
        }
        if(!document.getElementById('button-download-version-select') && document.querySelector("aside > div > div:nth-child(3) > div"))
        {
            let c = document.querySelector("aside > div > div:nth-child(3) > div").cloneNode(true);
            c.querySelector(".split-button").firstChild.querySelector('span').innerText = 'Previous Versions';
            c.querySelector(".split-button").firstChild.querySelector('svg').remove();
            c.querySelector(".split-button").firstChild.style.backgroundColor = '#333333';
            c.querySelector(".split-button").firstChild.id = 'button-download-version-select'
            c.querySelector(".split-button").firstChild.onclick = async (e) => { e.preventDefault(); window.electron.sendToHost('version-select', {}); }
            for(let child of Array.from(c.childNodes)){if(child == c.querySelector(".split-button")){continue;}else{child.remove()}}

            document.querySelector("div.ads-layout-content > div > aside > div > div:nth-child(3)").appendChild(c);
        }
        if(!document.getElementById('button-quick-test') && document.querySelector("aside > div > div:nth-child(3) > div"))
        {
            let c = document.querySelector("aside > div > div:nth-child(3) > div").cloneNode(true);
            c.querySelector(".split-button").firstChild.querySelector('span').innerText = 'Quick Test';
            c.querySelector(".split-button").firstChild.querySelector('svg').remove();
            c.querySelector(".split-button").firstChild.style.backgroundColor = '#32a912';
            c.querySelector(".split-button").firstChild.id = 'button-quick-test'
            c.querySelector(".split-button").firstChild.onclick = async (e) => { e.preventDefault(); window.electron.sendToHost('quick-test', {}); }
            for(let child of Array.from(c.childNodes)){if(child == c.querySelector(".split-button")){continue;}else{child.remove()}}

            document.querySelector("div.ads-layout-content > div > aside > div > div:nth-child(3)").appendChild(c);
        }

        // Save
        if(document.querySelector(".btn-favorite") && document.querySelector(".btn-favorite").id != "favourite")
        {
            document.querySelector(".btn-favorite").replaceWith(document.querySelector(".btn-favorite").cloneNode(true));
            document.querySelector(".btn-favorite").id = "favourite"
            document.querySelector(".btn-favorite").style.backgroundColor = window.isSaved?"rgb(241, 100, 54)":"var(--surface-tertiery)";
            document.querySelector(".btn-favorite").style.opacity = "1";
            document.querySelector(".btn-favorite").style.pointerEvents = "all";
            document.querySelector(".btn-favorite").onclick = (ev) =>
            {
                ev.preventDefault();

                if(!window.isSaved)
                {
                    window.electron.sendToHost('save',
                    {
                        url: location.protocol + '//' + location.host + location.pathname,
                        name: document.querySelector("h1").innerText,
                        description: document.querySelector(".project-summary").innerHTML,
                        icon: document.querySelector(".author-info > img").src,
                        date: new Date()
                    });

                    window.isSaved = true;
                }
                else
                {
                    window.electron.sendToHost('unsave', location.protocol + '//' + location.host + location.pathname);
                    window.isSaved = false;
                }

                document.querySelector(".btn-favorite").style.backgroundColor = window.isSaved?"rgb(241, 100, 54)":"var(--surface-tertiery)";
            }
        }
    }
    catch(err)
    {
        console.warn(err);
        return;
        document.querySelector("aside > div > div:nth-child(3) > div > a").onclick = (e) =>
        {
            e.preventDefault();
            window.electron.sendToHost('download', {});
            let i = setInterval(() =>
            {
                if(document.querySelector("div.ads-layout-content > div > div.modal-container"))
                {
                    document.querySelector("div.ads-layout-content > div > div.modal-container").style.display = 'none'
                    clearInterval(i);
                }
            }, 1000/60)
        }
        if(!document.getElementById('button-download-version-select'))
        {
            let c = document.querySelector("aside > div > div:nth-child(3) > div > a").cloneNode(true);
            c.querySelector('span').innerText = 'Previous Versions';
            c.querySelector('svg').remove();
            c.style.backgroundColor = '#333333';
            c.id = 'button-download-version-select'
            c.onclick = async (e) => { e.preventDefault(); window.electron.sendToHost('version-select', {}); }

            document.querySelector("aside > div > div:nth-child(3) > div").appendChild(c);
        }
        if(!document.getElementById('button-quick-test'))
        {
            let c = document.querySelector("aside > div > div:nth-child(3) > div > a").cloneNode(true);
            c.querySelector('span').innerText = 'Quick Test';
            c.querySelector('svg').remove();
            c.style.backgroundColor = '#32a912';
            c.id = 'button-quick-test'
            c.onclick = async (e) => { e.preventDefault(); window.electron.sendToHost('quick-test', {}); }

            document.querySelector("aside > div > div:nth-child(3) > div").appendChild(c);
        }
    }
}
try{modify()}catch(err){console.error(err)}

window.updateDownloaded = (l) =>
{
    downloaded=l;
    if(!document.getElementById('button-main-download')){return;}

    if(l)
    {
        document.getElementById('button-main-download').querySelector("span").innerText = 'Remove'
        document.getElementById('button-main-download').style.opacity = '0.8'

        document.getElementById('button-main-download').onclick = async (e) =>
        {
            e.preventDefault();
            window.electron.sendToHost('remove');
        }
    }
    else
    {
        document.getElementById('button-main-download').querySelector("span").innerText = 'Add'
        document.getElementById('button-main-download').style.opacity = '1'

        document.getElementById('button-main-download').onclick = async (e) =>
        {
            e.preventDefault();
            window.electron.sendToHost('download');
        }
    }
}

history.replaceState = function(state, title, url)
{
    console.log('replaceState:', state, title, url);
    return handleNavigation(state, title, url);
};
function handleNavigation(state, title, url)
{
    let futurUrl = window.location.origin+state.forward;
    if(futurUrl == window.originalLocation || futurUrl == window.originalLocation+'/comment' || futurUrl == window.originalLocation+'/gallery' || futurUrl == window.originalLocation+'/relations/dependencies' || state.forward == null)
    { try{modify()}catch(err){console.error(err)} return }

    console.log('prevent, load back:',window.location.origin+state.current)
    window.location.assign(window.location.origin+state.current);
    modify();
    return null;
}