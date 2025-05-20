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
            window.close();
        }
    }
    document.getElementById('container').style.display = 'block';
}
async function networkList(text)
{
    let searchResult = [];

    // Modrinth
    let modrinth = await (await fetch(`https://api.modrinth.com/v2/search?limit=40&index=relevance&query=${text}&facets=[[%22project_type:mod%22]]`)).json()
    for(let h of modrinth.hits)
    {
        searchResult.push
        ({
            name: h.title,
            icon: h.icon_url,
            categories: h.display_categories,
            description: h.description,
            versions: h.versions,
            source: 'modrinth',
            images: h.gallery,
            url: `https://modrinth.com/modpack/${h.slug}`,
            originalData: h
        })
    }

    // Curseforge
    let curseforge = await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=40&sortField=1&filterText=${text}&classId=4471`)).json()
    if(!curseforge.data){curseforge.data=[];}
    for(let d of curseforge.data)
    {
        async function loadImages()
        {
            let i = [];
            let page = parser.parseFromString(await (await fetch(`https://www.curseforge.com/minecraft/modpacks/${d.slug}/gallery`)).text(), "text/html");

            if(page.querySelector('.images-gallery > ul:nth-child(1)'))
            {
                for(let c of page.querySelector('.images-gallery > ul:nth-child(1)').childNodes)
                {
                    if(!c.querySelector("a > img")){continue;}
    
                    i.push(c.querySelector("a > img").src);
                }
            }

            if(result.find(r=>r.name==d.name))
            {
                if(i < result[result.findIndex(r=>r.name==d.name)].images) { return []; }
            }
            result[result.findIndex(r=>r.name==d.name)].images = i;
            return i;
        }

        if(searchResult.find(r=>r.name==d.name))
        {
            searchResult[searchResult.findIndex(r=>r.name==d.name)].secondarySource = 'curseforge';
            searchResult[searchResult.findIndex(r=>r.name==d.name)].loadImages = loadImages;
            continue;
        }

        searchResult.push
        ({
            name: d.name,
            icon: d.avatarUrl,
            description: d.summary,
            versions: [d.gameVersion],
            source: 'curseforge',
            loadImages: loadImages,
            url: `https://www.curseforge.com/minecraft/modpacks/${d.slug}`,
            originalData: d
        })
    }

    console.log(searchResult)
    for(let i of searchResult)
    {
        let b = instanceButton.cloneNode(true);
        b.childNodes[1].src = i.icon?i.icon:'https://static.wikia.nocookie.net/logopedia/images/3/3c/Minecraft_icon_2021.svg/revision/latest/scale-to-width-down/250?cb=20230427140314';
        b.childNodes[3].childNodes[1].innerText = i.name;
        b.childNodes[3].childNodes[3].innerText = i.description;
        // b.childNodes[3].childNodes[5].innerHTML = `${i.modsCount?i.modsCount:0} mods<br>${i.resourcepacksCount?i.resourcepacksCount:0} resourcepacks<br>${i.shadersCount?i.shadersCount:0} shaders`;
        document.getElementById('container').appendChild(b)

        b.childNodes[1].onclick = () =>
        {
            // openInstance(i.title)
        }
    }
}

document.addEventListener('DOMContentLoaded', () =>
{
    window.setupTab(document.getElementById('tab'),
    [
        {select: () => { list(); }, deselect: () => {document.getElementById('container').style.display = 'none';}},
        {select: () => {document.getElementById('container').style.display = 'block'; networkList(); }, deselect: () => {document.getElementById('container').style.display = 'none';}},
        {select: () => {openInstance('');window.close();}, deselect: () => {}}
    ]);
})