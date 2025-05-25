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
        window.instance.mods = m;
        if(window?.instance?.onModUpdate) { window.instance.onModUpdate(i, m) }
    }, (i, s) =>
    {
        window.instance.rp = s;
        if(window?.instance?.onRPUpdate) { window.instance.onRPUpdate(i, s) }
    }, (i, s) =>
    {
        window.instance.shaders = s;
        if(window?.instance?.onShaderUpdate) { window.instance.onShaderUpdate(i, s) }
    }).then(r =>
    {
        window.instance = r;
        for(let i of instanceListeners) { i(r); }
    })
}
if(instanceToLoad!=undefined){window.loadInstance(window.instanceToLoad)}