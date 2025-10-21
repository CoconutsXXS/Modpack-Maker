let packButton = document.getElementById('container').childNodes[1].cloneNode(true); document.getElementById('container').childNodes[1].remove();

let selected = [];
async function packsList()
{
    selected = [];
    let packs = await ipcInvoke('packList', window?.minecraft, window?.loader);

    document.getElementById('container').innerHTML = '';
    for(let p of packs)
    {
        let b = packButton.cloneNode(true);
        b.childNodes[1].src = p.icon?p.icon:'https://static.wikia.nocookie.net/logopedia/images/3/3c/Minecraft_icon_2021.svg/revision/latest/scale-to-width-down/250?cb=20230427140314';
        b.childNodes[3].childNodes[1].innerText = p.name;
        b.childNodes[3].childNodes[3].innerText = p.description;
        b.childNodes[3].childNodes[5].innerHTML = `${p.content.filter(c=>c.path=='mods').length} mods<br>${p.content.filter(c=>c.path=='resourcepacks').length} resourcepacks<br>${p.content.filter(c=>c.path=='shaderpacks').length} shaders`;
        document.getElementById('container').appendChild(b)

        b.onclick = () =>
        {
            if(b.hasAttribute('selected'))
            { 
                selected.splice(selected.findIndex[s=>s==p], 1);
                b.removeAttribute('selected');
                return
            }
            // for(let b of Array.from(document.getElementById('container').childNodes).filter(c=>c.nodeName=="BUTTON"))
            // { b.removeAttribute('selected') }
            b.setAttribute('selected', '');
            selected.push(p);
        }
    }
}

let currentTab = 'packs';
document.addEventListener('DOMContentLoaded', () =>
{
    window.setupTab(document.getElementById('tab'),
    [
        {select: () => { packsList(); currentTab = 'packs' }, deselect: () => {}},
        {select: () => { packsList(); }, deselect: () => {}},
        {select: () => { packsList(); }, deselect: () => {}},
        {select: () => { packsList(); }, deselect: () => {}},
    ]);
})

document.getElementById('finish').onclick = async () =>
{
    switch(currentTab)
    {
        case 'packs':
        {
            await ipcSend('finishSavesSelection', selected)
            break;
        }
        default: {break;}
    }
}