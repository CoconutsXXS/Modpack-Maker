setInterval(() =>
{
    if(document.getElementById('#__next > div > main > div.game-header') == undefined || document.getElementById('#__next > div > main > div.game-header').style.display != 'none')
    {
        try{modify()}catch(err){console.error(err)}
    }
}, 1000/60);

function modify()
{
    // document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > ul > li:nth-child(3)").style.display = 'none';
    // for (let i = 0; i < document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > ul").childNodes.length; i++)
    // {
    //     if(document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > ul").childNodes[i].querySelector("a").innerHTML == "")
    //     { document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > ul").childNodes[i].remove() }
    // }

    // Modify & Add Buttons
    // try with <button>
    try
    {
        document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div > button").onclick = (e) =>
        {
            e.preventDefault();
            window.electron.sendToHost('download', {});
            let i = setInterval(() =>
            {
                if(document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div.modal-container"))
                {
                    document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div.modal-container").style.display = 'none'
                    clearInterval(i);
                }
            }, 1000/60)
        }
        if(!document.getElementById('button-download-version-select'))
        {
            let c = document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div > button").cloneNode(true);
            c.querySelector('span').innerText = 'Previous Versions';
            c.querySelector('svg').remove();
            c.style.backgroundColor = '#333333';
            c.id = 'button-download-version-select'
            c.onclick = async (e) => { e.preventDefault(); window.electron.sendToHost('version-select', {}); }

            document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div").appendChild(c);
        }
        if(!document.getElementById('button-quick-test'))
        {
            let c = document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div > button").cloneNode(true);
            c.querySelector('span').innerText = 'Quick Test';
            c.querySelector('svg').remove();
            c.style.backgroundColor = '#32a912';
            c.id = 'button-quick-test'
            c.onclick = async (e) => { e.preventDefault(); window.electron.sendToHost('quick-test', {}); }

            document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div").appendChild(c);
        }
    }
    catch
    {
        document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div > a").onclick = (e) =>
        {
            e.preventDefault();
            window.electron.sendToHost('download', {});
            let i = setInterval(() =>
            {
                if(document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div.modal-container"))
                {
                    document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div.modal-container").style.display = 'none'
                    clearInterval(i);
                }
            }, 1000/60)
        }
        if(!document.getElementById('button-download-version-select'))
        {
            let c = document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div > a").cloneNode(true);
            c.querySelector('span').innerText = 'Previous Versions';
            c.querySelector('svg').remove();
            c.style.backgroundColor = '#333333';
            c.id = 'button-download-version-select'
            c.onclick = async (e) => { e.preventDefault(); window.electron.sendToHost('version-select', {}); }

            document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div").appendChild(c);
        }
        if(!document.getElementById('button-quick-test'))
        {
            let c = document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div > a").cloneNode(true);
            c.querySelector('span').innerText = 'Quick Test';
            c.querySelector('svg').remove();
            c.style.backgroundColor = '#32a912';
            c.id = 'button-quick-test'
            c.onclick = async (e) => { e.preventDefault(); window.electron.sendToHost('quick-test', {}); }

            document.querySelector("#__next > div > main > div.ads-layout > div.ads-layout-content > div > div > div.actions > div").appendChild(c);
        }
    }
}
try{modify()}catch(err){console.error(err)}

window.versionSelect = async function(versions)
{
    versions = JSON.parse(versions);
    console.log(versions);

    let panel = document.createElement('div');
    panel.id = 'versionPanel';
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