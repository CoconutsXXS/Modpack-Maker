window.instance = {name: ''}

let instanceListeners = [];
window.addInstanceListener = (f) => instanceListeners.push(f);

window.loadInstance = async (name) =>
{
    if(name == '')
    {
        name = await window.popup('text', 'Name the new instance.');
        document.getElementById('instance-name').value = name;
    }

    await getInstance(name, (i, m) =>
    {
        for(let [i, e] of m.entries())
        {
            if(e.missing){m.splice(i, 1)}
        }
        window.instance.mods = m;
        if(window?.instance?.onModUpdate) { window.instance.onModUpdate(i, m) }
    }, (i, s) =>
    {
        for(let [i, e] of s.entries())
        {
            if(e.missing){s.splice(i, 1)}
        }
        window.instance.rp = s;
        if(window?.instance?.onRPUpdate) { window.instance.onRPUpdate(i, s) }
    }, (i, s) =>
    {
        for(let [i, e] of s.entries())
        {
            if(e.missing){s.splice(i, 1)}
        }
        window.instance.shaders = s;
        if(window?.instance?.onShaderUpdate) { window.instance.onShaderUpdate(i, s) }
    }, (r) =>
    {
        console.log(r);
        if(r.type = "download")
        {
            window.web[r.website=="modrinth"?"downloadModrinth":"downloadCurseforge"](r.link);
        }
    }).then(r =>
    {
        window.instance = r;
        console.log(JSON.parse(JSON.stringify(instanceListeners)));
        for(let i of instanceListeners) { i(r); }
    })
}
if(instanceToLoad!=undefined)
{
    document.addEventListener('DOMContentLoaded', () =>
    {
        window.loadInstance(window.instanceToLoad)
    })
}