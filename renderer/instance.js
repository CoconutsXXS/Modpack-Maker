window.instance = {name: ''}

let instanceListeners = [];
window.addInstanceListener = (f) => instanceListeners.push(f);

let loadingListeners = [];
window.addLoadingListeners = (f) => loadingListeners.push(f);

window.loadInstance = async (name) =>
{
    if(name == '')
    {
        name = await window.popup('text', 'Name the new instance.');
        document.getElementById('instance-name').value = name;
    }

    let count = {mods: 0, rp: 0, shaders: 0}
    await getInstance(name, async (i, m) =>
    {
        for(let [i, e] of m.entries())
        {
            if(e.missing){m.splice(i, 1)}
        }

        count.mods++;
        console.log(count.mods+"<"+window.instance.mods.length+" || "+(window.downloadingInstance!=undefined&&window.downloadingInstance==false))
        if(window.downloadingInstance!=undefined&&window.downloadingInstance==false){return;}

        window.instance.mods = m;
        await new Promise(resolve => setTimeout(resolve, 0));
        if(window?.instance?.onModUpdate) { window.instance.onModUpdate(i, m) }
    }, async (i, s) =>
    {
        for(let [i, e] of s.entries())
        {
            if(e.missing){s.splice(i, 1)}
        }

        count.rp++;
        if(window.downloadingInstance!=undefined&&window.downloadingInstance==false){return;}

        window.instance.rp = s;
        await new Promise(resolve => setTimeout(resolve, 0));
        if(window?.instance?.onRPUpdate) { window.instance.onRPUpdate(i, s) }
    }, async (i, s) =>
    {
        for(let [i, e] of s.entries())
        {
            if(e.missing){s.splice(i, 1)}
        }

        count.shaders++;
        if(window.downloadingInstance!=undefined&&window.downloadingInstance==false){return;}

        window.instance.shaders = s;
        await new Promise(resolve => setTimeout(resolve, 0));
        if(window?.instance?.onShaderUpdate) { window.instance.onShaderUpdate(i, s) }
    }, (r) =>
    {
        if(r.type = "download")
        {
            window.web[r.website=="modrinth"?"downloadModrinth":"downloadCurseforge"](r.link);
        }
    }, (i, l) =>
    {
        window.instance.loading = l;
        for(let i of loadingListeners) { i(l); }
        
    }).then(r =>
    {
        window.instance = r;
        // console.log(JSON.parse(JSON.stringify(instanceListeners)));
        for(let i of instanceListeners) { i(r); }
    })
}

if(instanceToLoad)
{
    document.addEventListener('DOMContentLoaded', () =>
    {
        window.loadInstance(window.instanceToLoad)
    })
}