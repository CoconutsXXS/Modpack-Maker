const minecraftVersionReg = /^\d+\.\d+\.\d+$/;
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

// List
var filterContainer;
setInterval(async () =>
{
    if(!window.location.href.startsWith("https://modrinth.com/shaders") && !window.location.href.startsWith("https://modrinth.com/resourcepacks") && !window.location.href.startsWith("https://modrinth.com/mods") && !window.location.href.startsWith("https://modrinth.com/datapack")){return;}
    if(document.contains(filterContainer)){return;}

    filterContainer = document.querySelector("div.rounded-2xl:nth-child(3)").cloneNode(true);
    filterContainer.querySelector("h3").innerText = "Instance";
    filterContainer.querySelector("button:first-of-type").onclick = () =>
    {
        filterContainer.querySelector(".accordion-content").className = filterContainer.querySelector(".accordion-content").className=="accordion-content"?"accordion-content open":"accordion-content";
        if(filterContainer.querySelector(".accordion-content").className=="accordion-content open")
        {
            filterContainer.querySelector("button:first-of-type").querySelector("svg").classList.add("rotate-180");
        }
        else
        {
            filterContainer.querySelector("button:first-of-type").querySelector("svg").classList.remove("rotate-180");
        }
    }

    filterContainer.style.width = '100%'
    if(document.querySelector(".max-h-\\[250px\\]")){document.querySelector(".max-h-\\[250px\\]").style.display = "none"}

    // Iterate
    let childClone = filterContainer.querySelector(".search-filter-option.group.flex.gap-1.items-center").cloneNode(true);
    let parent = filterContainer.querySelector(".p-1.flex.flex-col.gap-1");
    console.log(parent)
    while(parent.firstChild){parent.firstChild.remove()}

    let sub = await browser.runtime.sendMessage({ action: "app", content:
    {
        name: "read",
        value: "instances"
    }});

    console.log(sub);
    for(let s of sub)
    {
        if(s==".DS_Store"){continue;}
        let c = childClone.cloneNode(true);
        c.querySelector("button:last-of-type").remove();
        c.querySelector("button").innerText = s;
        c.querySelector("button").className = "flex border-none cursor-pointer !w-full items-center gap-2 truncate rounded-xl px-2 py-2 [@media(hover:hover)]:py-1 text-sm font-semibold transition-all hover:text-contrast focus-visible:text-contrast active:scale-[0.98] bg-transparent text-secondary hover:bg-button-bg focus-visible:bg-button-bg [&>svg.check-icon]:hover:text-brand [&>svg.check-icon]:focus-visible:text-brand"; //"flex border-none cursor-pointer !w-full items-center gap-2 truncate rounded-xl px-2 py-2 [@media(hover:hover)]:py-1 text-sm font-semibold transition-all hover:text-contrast focus-visible:text-contrast active:scale-[0.98] bg-brand-highlight text-contrast hover:brightness-125"

        c.onclick = async (ev) =>
        {
            if(c.getAttribute('pressed') == "true")
            {
                c.setAttribute('pressed', 'false')
                c.querySelector("button").className = "flex border-none cursor-pointer !w-full items-center gap-2 truncate rounded-xl px-2 py-2 [@media(hover:hover)]:py-1 text-sm font-semibold transition-all hover:text-contrast focus-visible:text-contrast active:scale-[0.98] bg-transparent text-secondary hover:bg-button-bg focus-visible:bg-button-bg [&>svg.check-icon]:hover:text-brand [&>svg.check-icon]:focus-visible:text-brand"; //"flex border-none cursor-pointer !w-full items-center gap-2 truncate rounded-xl px-2 py-2 [@media(hover:hover)]:py-1 text-sm font-semibold transition-all hover:text-contrast focus-visible:text-contrast active:scale-[0.98] bg-brand-highlight text-contrast hover:brightness-125"

                while(document.querySelector("div.experimental-styles-within:nth-child(3)").querySelectorAll("button").length > 0)
                {
                    for(let b of document.querySelector("div.experimental-styles-within:nth-child(3)").querySelectorAll("button")) { await b.click(); }
                }
            }
            else
            {
                for(let child of parent.childNodes)
                {
                    if(child.getAttribute('pressed') == "true"){child.onclick()}
                }

                let instanceData = await browser.runtime.sendMessage({ action: "app", content:
                {
                    name: "read",
                    value: "instances/"+s+"/.instance-data.json"
                }});

                // Clear
                while(document.querySelector("div.experimental-styles-within:nth-child(3)").querySelectorAll("button").length > 0)
                {
                    for(let b of document.querySelector("div.experimental-styles-within:nth-child(3)").querySelectorAll("button")) { await b.click(); }
                }
                await new Promise((resolve) => setTimeout(resolve, 10));

                // Version
                Array.from(document.querySelector(".max-h-\\[19rem\\] > div:nth-child(1)").childNodes).filter(c => c.querySelector!=undefined).find(c => c?.querySelector(".truncate .text-sm").innerText==instanceData.version.number).querySelector("button").click();
                await new Promise((resolve) => setTimeout(resolve, 10));

                // Loader
                Array.from(document.querySelector("div.rounded-2xl:nth-child(2) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1)").childNodes).filter(c => c.querySelector!=undefined).find(c => c?.querySelector(".truncate .text-sm").innerText.toLowerCase()==instanceData.loader.name.toLowerCase()).querySelector("button").click();
                if(instanceData.mods.find(m => m.sinytra)!=undefined)
                { Array.from(document.querySelector("div.rounded-2xl:nth-child(2) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1)").childNodes).filter(c => c.querySelector!=undefined).find(c => c?.querySelector(".truncate .text-sm").innerText.toLowerCase()=="fabric").querySelector("button").click(); }
                await new Promise((resolve) => setTimeout(resolve, 10));

                c.setAttribute('pressed', 'true')
                c.querySelector("button").className = "flex border-none cursor-pointer !w-full items-center gap-2 truncate rounded-xl px-2 py-2 [@media(hover:hover)]:py-1 text-sm font-semibold transition-all hover:text-contrast focus-visible:text-contrast active:scale-[0.98] bg-brand-highlight text-contrast hover:brightness-125";
            }
        }

        parent.appendChild(c);
    }
    
    document.querySelector(".normal-page__sidebar > div:nth-child(1)").insertBefore(filterContainer, document.querySelector(".normal-page__sidebar > div:nth-child(1)").firstChild);
}, 100)

// Page
let downloadButton;
setInterval(async () =>
{
    if(!window.location.href.startsWith("https://modrinth.com/mod/") && !window.location.href.startsWith("https://modrinth.com/resourcepack/") && !window.location.href.startsWith("https://modrinth.com/shader/")){return;}
    if(document.contains(downloadButton) || !document.querySelector(".gap-x-8 > div:nth-child(2) > div.hidden:nth-child(1)")){return;}
    
    downloadButton = document.querySelector(".gap-x-8 > div:nth-child(2) > div.hidden:nth-child(1)").cloneNode(true);
    document.querySelector(".gap-x-8 > div:nth-child(2)").insertBefore(downloadButton, document.querySelector(".gap-x-8 > div:nth-child(2)").querySelectorAll(":scope > div")[1]);

    let observer = new MutationObserver(modifyButton);
    function modifyButton()
    {
        observer.disconnect();

        // Remove Listener
        let n = downloadButton.cloneNode(true);
        downloadButton.parentNode.replaceChild(n, downloadButton);
        downloadButton = n;
        downloadButton.removeAttribute("data-v-a886e155")

        while(downloadButton.querySelector("button").firstChild){downloadButton.querySelector("button").firstChild.remove()}
        downloadButton.querySelector("button").innerText = "";

        let span = document.createElement("span");
        span.innerText = "Download";

        let img = document.createElement("img");
        img.src = browser.runtime.getURL("icon.png")
        img.width = img.height = 24
        downloadButton.querySelector("button").appendChild(img)

        downloadButton.querySelector("button").style.backgroundColor = "#333399";
        downloadButton.querySelector("button").style.color = "#f3f3ffaa";

        downloadButton.querySelector("button").appendChild(span);

        downloadButton.onclick = async () =>
        {
            document.querySelector(".gap-x-8 > div:nth-child(2) > div.hidden:nth-child(1) button").click();
            while(!document.querySelector(".shown.modal-overlay")){await new Promise((resolve) => setTimeout(resolve, 10))}
            console.log(document.querySelector(".modal-container"));

            document.querySelector(".shown.modal-overlay").style.background = "#11113385";

            // btn-wrapper text-base
            while(document.querySelector(".modal-container .mx-auto.flex.flex-col.gap-4").childNodes.length==0){await new Promise((resolve) => setTimeout(resolve, 10))}
            for(let c of document.querySelector(".modal-container .mx-auto.flex.flex-col.gap-4").childNodes){c.remove();}
            while(document.querySelector(".modal-container .overflow-y-auto.p-6").childNodes.length==0){await new Promise((resolve) => setTimeout(resolve, 10))}
            for(let c of document.querySelector(".modal-container .overflow-y-auto.p-6 ").childNodes){c.remove();}
            while(!document.querySelector(".modal-container .overflow-y-auto.p-6 .mx-auto.flex.w-fit.flex-col.gap-2")){await new Promise((resolve) => setTimeout(resolve, 10))}
            document.querySelector(".modal-container .overflow-y-auto.p-6 .mx-auto.flex.w-fit.flex-col.gap-2").remove();

            let sub = await browser.runtime.sendMessage({ action: "app", content:
            {
                name: "read",
                value: "instances"
            }});

            let cleanLink = window.location.origin;
            for (let i = 1; i < 3; i++)
            {
                cleanLink += "/"+window.location.pathname.split("/")[i];
            }

            let buttons = [];
            let buttonName = [];
            for(let s of sub)
            {
                if(s==".DS_Store"){continue;}

                let c = document.createElement("button");
                c.onclick = async () =>
                {
                    let requestList = await browser.runtime.sendMessage({ action: "app", content:
                    {
                        name: "read",
                        value: "instances/"+s+"/.request.json"
                    }});

                    requestList.push
                    ({
                        type: "download",
                        website: "modrinth",
                        link: cleanLink
                    })

                    await browser.runtime.sendMessage({ action: "app", content:
                    {
                        name: "write",
                        value: {path: "instances/"+s+"/.request.json", content: JSON.stringify(requestList)}
                    }});

                    c.innerHTML = '';
                    c.innerText = s;
                    c.style.opacity = '0.8';
                    let sp = document.createElement("span");
                    sp.innerText = " already downloaded";
                    sp.style.color = "#ffffff50"
                    sp.style.fontWeight = "normal"
                    c.appendChild(sp)

                    document.querySelector(".grid-cols-\\[auto_min-content\\] > div:nth-child(2) > button:nth-child(1)").click();
                }

                c.style.setProperty('--_bg', 'var(--color-button-bg)');
                c.style.setProperty('--_text', 'var(--color-base)');
                c.style.setProperty('--_hover-bg', 'var(--color-button-bg)');
                c.style.setProperty('--_hover-text', 'var(--color-base)');
                c.style.setProperty('--_height', '2.25rem');
                c.style.setProperty('--_radius', '0.75rem');
                c.style.setProperty('--_padding-x', 'calc(0.75rem - 0.125rem)');
                c.style.setProperty('--_padding-y', '0.5rem');
                c.style.setProperty('--_gap', '0.375rem');
                c.style.setProperty('--_font-weight', '600');
                c.style.setProperty('--_icon-size', '1.25rem');

                Object.assign(c.style,
                {
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--_gap)',
                    height: 'var(--_height)',
                    minWidth: 'var(--_width)',
                    padding: 'var(--_padding-y) var(--_padding-x)',
                    backgroundColor: 'var(--_bg)',
                    color: 'var(--_text)',
                    border: '2px solid transparent',
                    borderRadius: 'var(--_radius)',
                    fontWeight: 'var(--_font-weight)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'scale .125s ease-in-out, background-color .25s ease-in-out, color .25s ease-in-out',
                    width: "100%",
                    marginBottom: "0.5em"
                });

                c.innerText = s;
                document.querySelector(".modal-container .overflow-y-auto.p-6").appendChild(c);

                buttons.push(c);
                buttonName.push(s)
            }

            for (let i = 0; i < buttons.length; i++)
            {
                const s = buttonName[i];
                
                let instanceData = await browser.runtime.sendMessage({ action: "app", content:
                {
                    name: "read",
                    value: "instances/"+s+"/.instance-data.json"
                }});

                let validFiles = await findModrinthFile(instanceData, cleanLink, window.location.pathname.split("/")[1]=="mod")

                if(instanceData.mods.find(m=>m.originURL==cleanLink||m.url==cleanLink||validFiles.find(f=>f.filename==m.filename)!=undefined||m.title==document.querySelector("h1").innerText||m.slug==window.location.pathname.split("/")[2])!=undefined)
                {
                    buttons[i].style.opacity = '0.8';
                    let sp = document.createElement("span");
                    sp.innerText = " already downloaded";
                    sp.style.color = "#ffffff50"
                    sp.style.fontWeight = "normal"
                    buttons[i].appendChild(sp)
                }
                if(validFiles.length == 0)
                {
                    buttons[i].style.outline = 'solid var(--banner-error-border) 2px';
                    buttons[i].disabled = true;
                    let sp = document.createElement("span");
                    sp.innerText = " incompatible";
                    sp.style.color = "#ffffff50"
                    sp.style.fontWeight = "normal"
                    buttons[i].appendChild(sp)
                }
            }
        }

        observer.observe(downloadButton.querySelector("button"), {childList: true, subtree: true, attributes: true, characterData: true});
    }
    modifyButton()
    console.log(downloadButton.onclick)
}, 100)

let testButton;
setInterval(async () =>
{
    if(!window.location.href.startsWith("https://modrinth.com/mod/") && !window.location.href.startsWith("https://modrinth.com/resourcepack/") && !window.location.href.startsWith("https://modrinth.com/shader/")){return;}
    if(document.contains(testButton) || !document.querySelector(".gap-x-8 > div:nth-child(2) > div.hidden:nth-child(1)")){return;}
    
    testButton = document.querySelector(".gap-x-8 > div:nth-child(2) > div.hidden:nth-child(1)").cloneNode(true);
    document.querySelector(".gap-x-8 > div:nth-child(2)").insertBefore(testButton, document.querySelector(".gap-x-8 > div:nth-child(2)").querySelectorAll(":scope > div")[2]);

    let observer = new MutationObserver(modifyButton);
    function modifyButton()
    {
        observer.disconnect();

        // Remove Listener
        let n = testButton.cloneNode(true);
        testButton.parentNode.replaceChild(n, testButton);
        testButton = n;
        testButton.removeAttribute("data-v-a886e155")

        while(testButton.querySelector("button").firstChild){testButton.querySelector("button").firstChild.remove()}
        testButton.querySelector("button").innerText = "";

        let span = document.createElement("span");
        span.innerText = "Quick Test";

        // let img = document.createElement("img");
        // img.src = browser.runtime.getURL("icon.png")
        // img.width = img.height = 24
        // testButton.querySelector("button").appendChild(img)

        testButton.querySelector("button").style.backgroundColor = "#7984e660";
        testButton.querySelector("button").style.color = "#f3f3ffaa";
        testButton.querySelector("button").style.transition = "all 1s ease-in-out"

        testButton.querySelector("button").appendChild(span);

        testButton.onclick = async () =>
        {
            testButton.querySelector("button").style.background = `linear-gradient(90deg, #7984e6)`;
            testButton.querySelector("button").style.backgroundPositionX = `-${testButton.querySelector("button").getBoundingClientRect().width-3}px`
            testButton.querySelector("button").style.backgroundPositionY = `-3px`
            testButton.querySelector("button").style.backgroundRepeat = "no-repeat"
            testButton.querySelector("button").style.backgroundSize = "calc(100% + 5px) calc(100% + 5px)"

            let cleanLink = window.location.origin;
            for (let i = 1; i < 3; i++)
            {
                cleanLink += "/"+window.location.pathname.split("/")[i];
            }

            // Find Last Loader/version
            let allFiles = await allModrinthVersion(cleanLink);
            testButton.querySelector("button").style.backgroundPositionX = `-${testButton.querySelector("button").getBoundingClientRect().width/2-3}px`

            // Find files
            let validFiles = await findModrinthFile({loader: {name: allFiles[0].loaders[0]}, version: {number: allFiles[0].game_versions[0]}}, cleanLink, window.location.pathname.split("/")[1]=="mod");

            testButton.querySelector("button").style.backgroundPositionX = `-${testButton.querySelector("button").getBoundingClientRect().width/3-3}px`

            // Convert
            let mods = [];
            for(let f of validFiles)
            {
                if(!f.primary){continue}
                mods.push({url:f.url, filename:f.filename})
            }

            // Loader Last Version
            let versionList = [];

            switch(allFiles[0].loaders[0])
            {
                case 'vanilla': { loaderVersionSelect.style.display = 'none'; break; }
                case 'forge':
                {
                    let text = await (await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')).text();
                    const data = parseXml(text)
                
                    for(let v of data.metadata.versioning.versions.version.filter(e => e["#text"].split('-')[0] == allFiles[0].game_versions[0]))
                    {
                        versionList.push(v["#text"].split('-')[1]);
                    }

                    break;
                }
                case 'neoforge':
                {
                    let text = await (await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')).text();
                    const data = parseXml(text)
                
                    for(let v of data.metadata.versioning.versions.version.filter(e => '1.'+e["#text"].split('-')[0].substring(0, e["#text"].split('-')[0].lastIndexOf('.')) == allFiles[0].game_versions[0]).reverse())
                    {
                        versionList.push(v["#text"]);
                    }

                    break;
                }
                case 'fabric':
                {
                    const data = await (await fetch('https://meta.fabricmc.net/v2/versions/loader/'+allFiles[0].game_versions[0])).json();

                    for(let v of data)
                    {
                        versionList.push(v.loader.version);
                    }

                    break;
                }
            }

            testButton.querySelector("button").style.backgroundPositionX = `-${testButton.querySelector("button").getBoundingClientRect().width/4-3}px`

            setTimeout(() => {testButton.querySelector("button").style.backgroundPositionX = "-3px"}, 1000);

            browser.runtime.sendMessage({ action: "app", content:
            {
                name: "launch",
                value: {}
            }});

            let data = await browser.runtime.sendMessage({ action: "app", content:
            {
                name: "read",
                value: ".browser-requests.json"
            }});
            data.push
            ({
                type: "ephemeral-instance",
                loader:
                {
                    name: allFiles[0].loaders[0],
                    version: versionList[0]
                },
                version:
                {
                    number: allFiles[0].game_versions[0],
                    type: "release"
                },
                mods
            });
            await browser.runtime.sendMessage({ action: "app", content:
            {
                name: "write",
                value: {path: ".browser-requests.json", content: JSON.stringify(data)}
            }});
        }

        observer.observe(testButton.querySelector("button"), {childList: true, subtree: true, attributes: true, characterData: true});
    }
    modifyButton()
    console.log(testButton.onclick)
}, 100)

let saveButton;
setInterval(async () =>
{
    if(!window.location.href.startsWith("https://modrinth.com/mod/") && !window.location.href.startsWith("https://modrinth.com/resourcepack/") && !window.location.href.startsWith("https://modrinth.com/shader/")){return;}
    if(!document.contains(downloadButton) || document.contains(saveButton) || !document.querySelector(".gap-x-8 > div:nth-child(2) > div:nth-child(4)")){return;}

    saveButton = document.querySelector(".gap-x-8 > div:nth-child(2) > div:nth-child(4)").cloneNode(true);
    document.querySelector(".gap-x-8 > div:nth-child(2)").insertBefore(saveButton, document.querySelector(".gap-x-8 > div:nth-child(2) > div:nth-child(4)"));

    let cleanLink = window.location.origin;
    for (let i = 1; i < 3; i++)
    {
        cleanLink += "/"+window.location.pathname.split("/")[i];
    }

    let saved = (await browser.runtime.sendMessage({ action: "app", content:
    {
        name: "isSaved",
        value: cleanLink
    }})).result;

    saveButton.querySelector("button").style.backgroundColor = "#333399";
    packButton.querySelector("svg").style.color = "var(--color-base)";
    saveButton.querySelector("svg").setAttribute("fill", saved?"currentColor":"none");

    saveButton.onclick = () =>
    {
        if(!saved)
        {
            browser.runtime.sendMessage({ action: "app", content:
            {
                name: "save",
                value:
                {
                    url: cleanLink,
                    name: document.querySelector("h1").innerText,
                    description: document.querySelector(".line-clamp-2").innerText,
                    icon: document.querySelector(".gap-x-8 > div:nth-child(1) > img:nth-child(1)").src,
                    date: new Date()
                }
            }})
            saved = true;
        }
        else
        {
            browser.runtime.sendMessage({ action: "app", content:
            {
                name: "unsave",
                value: cleanLink
            }})
            saved = false;
        }

        console.log(saved, saved?"fill":"none", saveButton.querySelector("svg"), saveButton.querySelector("svg").style.fill)
        saveButton.querySelector("svg").setAttribute("fill", saved?"currentColor":"none");
    }
}, 100)

let packButton;
setInterval(async () =>
{
    let target = document.querySelector(".gap-x-8 > div:nth-child(2) > div:nth-child(5)");
    if(!window.location.href.startsWith("https://modrinth.com/mod/") && !window.location.href.startsWith("https://modrinth.com/resourcepack/") && !window.location.href.startsWith("https://modrinth.com/shader/")){return;}
    if(!document.contains(downloadButton) || document.contains(packButton) || !target){return;}

    packButton = target.cloneNode(true);
    document.querySelector(".gap-x-8 > div:nth-child(2)").insertBefore(packButton, target);

    let cleanLink = window.location.origin;
    for (let i = 1; i < 3; i++)
    {
        cleanLink += "/"+window.location.pathname.split("/")[i];
    }

    packButton.querySelector("button").style.backgroundColor = "#333399";
    // packButton.querySelector("svg").setAttribute("fill", saved?"currentColor":"none");

    while(packButton.querySelector("svg").firstChild){packButton.querySelector("svg").firstChild.remove()}

    packButton.querySelector("svg").style.strokeWidth = '1.7';
    packButton.querySelector("svg").style.color = "var(--color-base)";

    const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path1.setAttribute("d", "M12 22v-9M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.66 1.66 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z");
    packButton.querySelector("svg").appendChild(path1);

    const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path2.setAttribute("d", "M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13");
    packButton.querySelector("svg").appendChild(path2);

    const path3 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path3.setAttribute("d", "M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.64 1.64 0 0 0 1.63 0z");
    packButton.querySelector("svg").appendChild(path3);


    packButton.onclick = async () =>
    {
        document.querySelector(".gap-x-8 > div:nth-child(2) > div.hidden:nth-child(1) button").click();
        while(!document.querySelector(".shown.modal-overlay")){await new Promise((resolve) => setTimeout(resolve, 10))}
        console.log(document.querySelector(".modal-container"));

        document.querySelector(".shown.modal-overlay").style.background = "#11113385";

        // btn-wrapper text-base
        while(document.querySelector(".modal-container .mx-auto.flex.flex-col.gap-4").childNodes.length==0){await new Promise((resolve) => setTimeout(resolve, 10))}
        for(let c of document.querySelector(".modal-container .mx-auto.flex.flex-col.gap-4").childNodes){c.remove();}
        while(document.querySelector(".modal-container .overflow-y-auto.p-6").childNodes.length==0){await new Promise((resolve) => setTimeout(resolve, 10))}
        for(let c of document.querySelector(".modal-container .overflow-y-auto.p-6 ").childNodes){c.remove();}
        while(!document.querySelector(".modal-container .overflow-y-auto.p-6 .mx-auto.flex.w-fit.flex-col.gap-2")){await new Promise((resolve) => setTimeout(resolve, 10))}
        document.querySelector(".modal-container .overflow-y-auto.p-6 .mx-auto.flex.w-fit.flex-col.gap-2").remove();

        let sub = await browser.runtime.sendMessage({ action: "app", content:
        {
            name: "read",
            value: "saves/packs"
        }});

        let cleanLink = window.location.origin;
        for (let i = 1; i < 3; i++)
        {
            cleanLink += "/"+window.location.pathname.split("/")[i];
        }

        for(let s of sub)
        {
            if(s==".DS_Store"){continue;}

            // --_bg: var(--color-button-bg); --_text: var(--color-base); --_hover-bg: var(--color-button-bg); --_hover-text: var(--color-base); --_height: 2.25rem; --_width: auto; --_radius: 0.75rem; --_padding-x: calc(0.75rem - 0.125rem); --_padding-y: 0.5rem; --_gap: 0.375rem; --_font-weight: 600; --_icon-size: 1.25rem;
            let c = document.createElement("button");
            c.style.setProperty('--_bg', 'var(--color-button-bg)');
            c.style.setProperty('--_text', 'var(--color-base)');
            c.style.setProperty('--_hover-bg', 'var(--color-button-bg)');
            c.style.setProperty('--_hover-text', 'var(--color-base)');
            c.style.setProperty('--_height', '2.25rem');
            c.style.setProperty('--_radius', '0.75rem');
            c.style.setProperty('--_padding-x', 'calc(0.75rem - 0.125rem)');
            c.style.setProperty('--_padding-y', '0.5rem');
            c.style.setProperty('--_gap', '0.375rem');
            c.style.setProperty('--_font-weight', '600');
            c.style.setProperty('--_icon-size', '1.25rem');

            Object.assign(c.style,
            {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--_gap)',
                height: 'var(--_height)',
                minWidth: 'var(--_width)',
                padding: 'var(--_padding-y) var(--_padding-x)',
                backgroundColor: 'var(--_bg)',
                color: 'var(--_text)',
                border: '2px solid transparent',
                borderRadius: 'var(--_radius)',
                fontWeight: 'var(--_font-weight)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'scale .125s ease-in-out, background-color .25s ease-in-out, color .25s ease-in-out',
                marginBottom: "0.5em",
                height: "32px",
                borderRadius: "16px",
                marginRight: ".5em",
                display: "inline",
                paddingTop: ".35em"
            });

            c.innerText = s.substring(0, s.length-5);
            document.querySelector(".modal-container .overflow-y-auto.p-6").appendChild(c);

            let pack = await browser.runtime.sendMessage({ action: "app", content:
            {
                name: "read",
                value: "saves/packs/"+s
            }});

            if(pack.content.find(m=>m.url==cleanLink||m.name==document.querySelector("h1").innerText||m.title==document.querySelector("h1").innerText||m.slug==window.location.pathname.split("/")[2])!=undefined)
            {
                c.style.opacity = '0.8';
                let s = document.createElement("span");
                s.innerText = " already included";
                s.style.color = "#ffffff50"
                s.style.fontWeight = "normal"
                c.appendChild(s)
                document.querySelector(".modal-container .overflow-y-auto.p-6").insertBefore(c, document.querySelector(".modal-container .overflow-y-auto.p-6").lastChild);
            }

            c.onclick = async () =>
            {
                pack = await browser.runtime.sendMessage({ action: "app", content:
                {
                    name: "read",
                    value: "saves/packs/"+s
                }});

                pack.content.push
                ({
                    title: document.querySelector("h1").innerText,
                    name: document.querySelector("h1").innerText,
                    description: document.querySelector(".line-clamp-2").innerText,
                    icon: document.querySelector(".gap-x-8 > div:nth-child(1) > img:nth-child(1)").src,
                    url: cleanLink,
                    slug: window.location.pathname.split("/")[2],
                    type: (window.location.pathname.split("/")[1]=="mod"||window.location.pathname.split("/")[1]=="datapack")?"mods":(window.location.pathname.split("/")[1]=="shader"?"shaderpacks":"resourcepacks")
                });

                c.innerHTML='';
                c.innerText = s.substring(0, s.length-5);
                c.style.opacity = '0.8';
                let span = document.createElement("span");
                span.innerText = " already included";
                span.style.color = "#ffffff50"
                span.style.fontWeight = "normal"
                c.appendChild(span)
                document.querySelector(".modal-container .overflow-y-auto.p-6").insertBefore(c, document.querySelector(".modal-container .overflow-y-auto.p-6").lastChild);

                await browser.runtime.sendMessage({ action: "app", content:
                {
                    name: "write",
                    value: {path: "saves/packs/"+s, content: JSON.stringify(pack)}
                }});
            }
        }
    }
}, 100)


// Linked to web-loader.js
async function findModrinthFile(instance, link, useLoader = true, list = false, versionNumber = null)
{
    console.log(link)
    let slug = link.split('/')[link.split('/').length-1];
    const versions = (await (await fetch('https://api.modrinth.com/v2/project/'+slug+'/version')).json())
    .sort((a,b) => { return new Date(b.date_published) - new Date(a.date_published); });

    var version = versions[list?'filter':'find'](v =>
    {
        if(useLoader && !v.loaders.includes(instance.loader.name)){return false;}
        if(versionNumber != null && v.version_number != versionNumber){return false;}
        return v.game_versions.includes(instance.version.number)
    });
    if(!version || version.length==0)
    {
        if(instance.sinytra && instance.loader.name=='forge')
        {
            version = versions[list?'filter':'find'](v =>
            {
                if(useLoader && !v.loaders.includes(instance.loader.name) && !v.loaders.includes('fabric')){return false;}
                if(versionNumber != null && v.version_number != versionNumber){return false;}
                return v.game_versions.includes(instance.version.number)
            });
            if(!version || version.length==0) {  }
        }
        if(!version || version.length==0) { return []; }
    }
    if(list){return version}

    let files = version.files;
    for (let i = 0; i < files.length; i++) 
    {
        files[i].dependencies = version.dependencies;
        files[i].originURL = `https://modrinth.com/project/${slug}`;
        files[i].versionData = version;
    }
    for(let d of version.dependencies.filter(d => d.dependency_type=='required'))
    {
        console.log(d)
        let dependencieFiles = await findModrinthFile(instance, `https://modrinth.com/project/${d.project_id}`);
        for (let i = 0; i < dependencieFiles.length; i++) { dependencieFiles[i].originURL = `https://modrinth.com/project/${d.project_id}`; }
        files = files.concat(dependencieFiles)
    }

    return files;
}
async function allModrinthVersion(link)
{
    let slug = link.split('/')[link.split('/').length-1];
    const versions = (await (await fetch('https://api.modrinth.com/v2/project/'+slug+'/version')).json())
    .sort((a,b) => { return new Date(b.date_published) - new Date(a.date_published); });

    return versions;
}