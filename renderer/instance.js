window.instance = {name: 'Vanilla 1.20.1'}

let instanceListeners = [];
window.addInstanceListener = (f) => instanceListeners.push(f);

window.loadInstance = async (name) =>
{
    await getInstance(name, (i, m) =>
    {
        window.instance.mods = m;
        console.log(window.instance.onModUpdate)
        if(window.instance.onModUpdate) { window.instance.onModUpdate(i, m) }
    }).then(r =>
    {
        window.instance = r;
        for(let i of instanceListeners) { i(r); }
    })
}
if(instanceToLoad!=undefined){window.loadInstance(window.instanceToLoad)}