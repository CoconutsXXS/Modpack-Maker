window.addLoadingListeners((loaders) =>
{
    for(let l of loaders)
    {
        if(l.type == 'instance-download')
        {
            document.getElementById("loading-screen").style.display = (l.value==1)?"none":"block"
            if(l.value==1)
            {
                if(window.downloadingInstance)
                {
                    if(window?.instance?.onModUpdate) { window.instance.onModUpdate(window.instance, window.instance.mods) }
                    if(window?.instance?.onRPUpdate) { window.instance.onRPUpdate(window.instance, window.instance.rp) }
                    if(window?.instance?.onShaderUpdate) { window.instance.onShaderUpdate(window.instance, window.instance.shaders) }
                }
                window.downloadingInstance = false; continue
            }
            window.downloadingInstance = true;
            document.querySelector("#loading-screen h1").innerText = "Downloading"
            document.querySelector("#loading-screen .loading").style.background = `linear-gradient(to right, var(--overline) 0%, var(--overline) ${l.value*100}%, var(--primary-color) ${l.value*100}%, var(--primary-color) 100%)`
        }
    }
})