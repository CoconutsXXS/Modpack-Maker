let nameInput = document.getElementById('instance-name');
let descriptionInput = document.getElementById('instance-description');
let loaderSelector = document.getElementById('minecraft-loader');
let loaderVersionSelector = document.getElementById('minecraft-loader-version');
let minecraftVersionSelector = document.getElementById('minecraft-version');
let sinytraCheckbox = document.getElementById('sinytra');


window.addInstanceListener((i) =>
{
    nameInput.value = i.name;
    descriptionInput.value = i.description;
    loaderSelector.value = i.loader?.name;
    loaderVersionSelector.value = i.loader?.version;
    if(i.sinytra){sinytraCheckbox.parentNode.click()}

    document.getElementById('browse-panel').querySelector('.tab > button:nth-child(2)').disabled = window.instance.loader.name == 'vanilla';
    document.getElementById('browse-panel').querySelector('.tab > button:nth-child(4)').disabled = window.instance.loader.name == 'vanilla' || (window.instance.mods.find(m=>m.title=='Iris'||m.title=='Iris Shaders'||m.title=='Oculus')==undefined);

    loaderVersionSelector.parentNode.style.display = i.loader.name == 'vanilla'?'none':'block'
    sinytraCheckbox.parentNode.style.display = i.loader.name == 'forge'?'block':'none';
    fetch("https://mc-versions-api.net/api/java").then((response) => response.json())
    .then((data) =>
    {
        var lastV = '0';
        var lastG = minecraftVersionSelector;
        for(let v of data.result.reverse())
        {
            let e = document.createElement('option');
            e.label = v;
            e.value = v;
    
            if(v.split('.')[1] != lastV)
            {
                lastV = v.split('.')[1];
                let g = lastG = document.createElement('optgroup');
                g.label = v;
                minecraftVersionSelector.appendChild(g);
                e.label = v+'.0';
            }
    
            lastG.appendChild(e);
        }
    
        minecraftVersionSelector.value = i.version.number
    })
    
    if(window.instance.name == ''){focus(nameInput)}
    nameInput.onkeyup = (ev) => {if(ev.key != "Enter"){return} window.instance .name = nameInput.value; window.instance.save(window.instance); window.loadInstance(window.instance.name);}
    descriptionInput.oninput = () => window.instance.description = descriptionInput.value;
    loaderSelector.onchange = () =>
    {
        window.instance.loader.name = loaderSelector.value; updateLoaderVersionSelector();
        document.getElementById('browse-panel').querySelector('.tab > button:nth-child(2)').disabled = window.instance.loader.name == 'vanilla';
        document.getElementById('browse-panel').querySelector('.tab > button:nth-child(4)').disabled = window.instance.loader.name == 'vanilla' || (window.instance.mods.find(m=>m.title=='Iris'||m.title=='Iris Shaders'||m.title=='Oculus')==undefined);
    };
    minecraftVersionSelector.onchange = () => { window.instance.version.number = minecraftVersionSelector.value; updateLoaderVersionSelector(); }
    loaderVersionSelector.onchange = () => window.instance.loader.version = loaderVersionSelector.value;
    sinytraCheckbox.onclick = () =>
    {
        window.instance.sinytra = sinytraCheckbox.checked;
        if(sinytraCheckbox.checked) { window.web.downloadModrinth(`https://modrinth.com/mod/connector`) }
        let i=0;
        for(let m of window.instance.mods)
        {
            if(m.sinytra){window.instance.mods[i].disabled = !sinytraCheckbox.checked; window.instance.setModData(window.instance.mods[i])}
            i++;
        }
    }

    updateLoaderVersionSelector()    
})


async function updateLoaderVersionSelector()
{
    loaderVersionSelector.parentNode.style.display = window.instance.loader.name == 'vanilla'?'none':'block'
    sinytraCheckbox.parentNode.style.display = window.instance.loader.name == 'forge'?'block':'none';
    window.instance.loader.name = loaderSelector.value;

    if(window.instance.sinytra && window.instance.loader.name != 'forge') { sinytraCheckbox.checked = false; sinytraCheckbox.onclick(); }

    let loaderVersionSelect = loaderVersionSelector;
    let versionList = [];

    loaderVersionSelect.style.display = 'inline-block';
    switch(window.instance.loader.name)
    {
        case 'vanilla': { loaderVersionSelect.style.display = 'none'; break; }
        case 'forge':
        {
            let text = await (await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')).text();
            const data = parseXml(text)
        
            for(let v of data.metadata.versioning.versions.version.filter(e => e["#text"].split('-')[0] == window.instance.version.number.toString()))
            {
                versionList.push(v["#text"].split('-')[1]);
            }

            break;
        }
        case 'neoforge':
        {
            let text = await (await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')).text();
            const data = parseXml(text)
        
            for(let v of data.metadata.versioning.versions.version.filter(e => '1.'+e["#text"].split('-')[0].substring(0, e["#text"].split('-')[0].lastIndexOf('.')) == window.instance.version.number.toString()).reverse())
            {
                versionList.push(v["#text"]);
            }

            break;
        }
        case 'fabric':
        {
            const data = await (await fetch('https://meta.fabricmc.net/v2/versions/loader/'+window.instance.version.number.toString())).json();

            for(let v of data)
            {
                versionList.push(v.loader.version);
            }

            break;
        }
    }


    loaderVersionSelect.innerHTML = ''
    for(let v of versionList)
    {
        let e = document.createElement('option');
        e.label = v;
        e.value = v;

        loaderVersionSelect.appendChild(e);
    }
    window.instance.loader.version = loaderVersionSelect.value = loaderVersionSelect.defaultValue = versionList[0];

    window.instance.save(window.instance);
}
function parseXml(xml, arrayTags)
{
    let dom = null;
    if (window.DOMParser) dom = (new DOMParser()).parseFromString(xml, "text/xml");
    else if (window.ActiveXObject) {
        dom = new ActiveXObject('Microsoft.XMLDOM');
        dom.async = false;
        if (!dom.loadXML(xml)) throw dom.parseError.reason + " " + dom.parseError.srcText;
    }
    else throw new Error("cannot parse xml string!");

    function parseNode(xmlNode, result) {
        if (xmlNode.nodeName == "#text") {
            let v = xmlNode.nodeValue;
            if (v.trim()) result['#text'] = v;
            return;
        }

        let jsonNode = {},
            existing = result[xmlNode.nodeName];
        if (existing) {
            if (!Array.isArray(existing)) result[xmlNode.nodeName] = [existing, jsonNode];
            else result[xmlNode.nodeName].push(jsonNode);
        }
        else {
            if (arrayTags && arrayTags.indexOf(xmlNode.nodeName) != -1) result[xmlNode.nodeName] = [jsonNode];
            else result[xmlNode.nodeName] = jsonNode;
        }

        if (xmlNode.attributes) for (let attribute of xmlNode.attributes) jsonNode[attribute.nodeName] = attribute.nodeValue;

        for (let node of xmlNode.childNodes) parseNode(node, jsonNode);
    }

    let result = {};
    for (let node of dom.childNodes) parseNode(node, result);

    return result;
}