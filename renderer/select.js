let instanceButton = document.getElementById('container').childNodes[1].cloneNode(true); document.getElementById('container').childNodes[1].remove();

async function list()
{
    document.getElementById('container').innerHTML = '';
    let list = await instanceList();
    for(let i of list)
    {
        let b = instanceButton.cloneNode(true);
        b.childNodes[1].src = i.icon?i.icon:'https://static.wikia.nocookie.net/logopedia/images/3/3c/Minecraft_icon_2021.svg/revision/latest/scale-to-width-down/250?cb=20230427140314';
        b.childNodes[3].childNodes[1].innerText = i.title;
        b.childNodes[3].childNodes[3].innerText = i.description;
        b.childNodes[3].childNodes[5].innerHTML = `${i.modsCount?i.modsCount:0} mods<br>${i.resourcepacksCount?i.resourcepacksCount:0} resourcepacks<br>${i.shadersCount?i.shadersCount:0} shaders`;
        document.getElementById('container').appendChild(b)
        console.log(b)

        b.childNodes[1].onclick = () =>
        {
            openInstance(i.title)
        }
    }
    document.getElementById('container').style.display = 'block';
}
async function networkList()
{
    // let list = await instanceList();
    // console.log(await instanceList())
    // for(let i of list)
    // {
    //     let b = instanceButton.cloneNode(true);
    //     b.childNodes[1].src = i.icon?i.icon:'https://static.wikia.nocookie.net/logopedia/images/3/3c/Minecraft_icon_2021.svg/revision/latest/scale-to-width-down/250?cb=20230427140314';
    //     b.childNodes[3].childNodes[1].innerText = i.title;
    //     b.childNodes[3].childNodes[3].innerText = i.description;
    //     b.childNodes[3].childNodes[5].innerHTML = `${i.modsCount?i.modsCount:0} mods<br>${i.resourcepacksCount?i.resourcepacksCount:0} resourcepacks<br>${i.shadersCount?i.shadersCount:0} shaders`;
    //     document.getElementById('container').appendChild(b)

    //     b.childNodes[1].onclick = () =>
    //     {
    //         openInstance(i.title)
    //     }
    // }
}

document.addEventListener('DOMContentLoaded', () =>
{
    window.setupTab(document.getElementById('tab'),
    [
        {select: () => { list(); }, deselect: () => {document.getElementById('container').style.display = 'none';}},
        {select: () => {document.getElementById('container').style.display = 'block'; networkList(); }, deselect: () => {document.getElementById('container').style.display = 'none';}},
        {select: () => {openInstance('')}, deselect: () => {}}
    ]);
})