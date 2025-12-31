const linkElem = document.createElement('link');
linkElem.setAttribute('rel', 'stylesheet');
linkElem.setAttribute('href', browser.runtime.getURL('/curseforge.css'));
document.body.appendChild(linkElem);

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

(async () =>
{while(true)
{
    if(document.getElementById('instance-download')!=undefined && document.querySelector("aside > div > div:nth-child(3) > div > div > button")!=undefined){await new Promise(resolve=>setTimeout(resolve,100));continue;}
    document.getElementById('instance-download')?.remove();
    document.getElementById('button-quick-test')?.remove();

    try
    {
        // while(!document.querySelector(".project-actions")){await new Promise(resolve=>setTimeout(resolve,100))}

        // while(!document.querySelector("aside > div > div:nth-child(3) > div > div > button")){ await new Promise(resolve=>setTimeout(resolve,100))}
        // document.querySelector("aside > div > div:nth-child(3) > div > div > button").id = "button-main-download"

        while(document.getElementById('instance-download') || !document.querySelector("aside > div > div:nth-child(3) > div .split-button")){await new Promise(resolve=>setTimeout(resolve,100))}
        {
            let c = document.querySelector("aside > div > div:nth-child(3) > div.project-actions").cloneNode(true);
            c.innerHTML = `<div class="split-button"><button class=" btn-cta download-btn"><svg class="smaller-icon"><use href="/images/sprite.svg#icon-cf"></use></svg><span>Download</span></button></div><button class="  btn-favorite btn-secondary btn-icon disabled" data-tooltip="Favorite" aria-label="Add Project to Favorites" id="favourite" style="background-color: var(--surface-tertiery); opacity: 1; pointer-events: all;"><svg viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.9666 8.42435L12 2L9.03344 8.42435L2 9.25735L7.2 14.0608L5.81966 21L12 17.5444L18.1803 21L16.8 14.0608L22 9.25735L14.9666 8.42435ZM17.455 10.733L13.62 10.2788L12 6.77065L10.38 10.2788L6.545 10.733L9.38018 13.352L8.62688 17.139L12 15.253L15.3731 17.139L14.6198 13.352L17.455 10.733Z" fill="currentColor"></path></svg></button><a rel="nofollow" href="https://www.curseforge.com/api/v1/auth/login?returnUrl=https://www.curseforge.com/minecraft/mc-mods/keerdm-zombie-apocalypse-essentials&amp;registrationCompletedUrl=https://www.curseforge.com/signup/confirmation"><button class=" btn-follow btn-secondary btn-icon" data-tooltip="Follow" aria-label="Follow Project"><svg id="icon-heart-hollow" viewBox="0 0 20 20"><path d="M9.6941 16.9374C9.62723 16.9127 9.53909 16.8717 9.49824 16.8463C9.42695 16.802 8.95707 16.3331 8.09859 15.4496C7.87709 15.2216 7.51874 14.8535 7.30226 14.6316C7.08578 14.4097 6.37073 13.6734 5.71326 12.9954C4.58389 11.8845 3.25642 10.4905 2.48892 9.36636C2.13406 8.65228 1.99699 8.02266 2.0228 7.22523C2.03618 6.81185 2.07224 6.5603 2.16992 6.19884C2.5997 4.60848 3.87669 3.40511 5.47619 3.08321C5.70034 3.0381 5.80914 3.03061 6.24425 3.03031C6.68463 3.03 6.78594 3.03699 7.01613 3.08359C7.36409 3.15403 7.7708 3.29157 8.05941 3.4364C8.60401 3.70969 8.8496 3.90051 9.48306 4.54257L10.003 5.06955L10.4969 4.56536C11.1428 3.90603 11.3875 3.71377 11.9217 3.44582C12.2282 3.29213 12.6291 3.15542 12.9839 3.08359C13.2141 3.03699 13.3154 3.03 13.7558 3.03031C14.1909 3.03061 14.2997 3.03811 14.5238 3.08321C16.3665 3.45405 17.7424 4.97367 17.9598 6.87788C18.0767 7.90148 17.8074 9.00769 17.2362 9.85023C16.996 10.2045 16.9947 10.206 15.46 11.7857C15.0537 12.2039 14.022 13.2667 13.1673 14.1475C10.3816 17.0183 10.5913 16.8106 10.3802 16.9078C10.2042 16.9889 9.87173 17.0033 9.6941 16.9375V16.9374Z" fill="none" stroke="currentColor" stroke-width="2"></path></svg></button></a>`;

            c.querySelector(".split-button").firstChild.querySelector('span').innerText = '';
            // c.querySelector(".split-button").firstChild.style.backgroundColor = '#333399';

            c.querySelector(".split-button").firstChild.querySelector('svg').remove();
            c.querySelector(".split-button").firstChild.id = 'instance-download'
            c.querySelector(".split-button").firstChild.onclick = async (e) => { e.preventDefault(); window.electron.sendToHost('version-select', {}); }
            // for(let child of Array.from(c.childNodes)){if(child == c.querySelector(".split-button")){continue;}else{child.remove()}}

            let span = document.createElement("span");
            span.innerText = "Download";

            let img = document.createElement("img");
            img.src = browser.runtime.getURL("icon.png")
            img.width = img.height = 24;
            img.style.maxWidth = '24px'
            c.querySelector("button").appendChild(img)

            c.querySelector("button").style.backgroundColor = "#333399";
            c.querySelector("button").style.color = "#f3f3ffaa";

            c.querySelector("button").appendChild(span);

            c.querySelector("button").onclick = async () =>
            {
                // From Button Method:
                // document.querySelector("aside > div > div:nth-child(3) > div > div > button").click();
                // await new Promise(resolve=>setTimeout(resolve,1))
                // while(!document.querySelector(".modal-inner-content")){await new Promise(resolve=>setTimeout(resolve,10))}

                // Manual Method:
                let m = document.createElement("div");
                m.classList.add("modal-container")
                m.innerHTML = `<section class="modal is-modal-open project-download-modal"><button class="btn-close" aria-label="Close Modal"><svg><use href="/images/sprite.svg#icon-modal-close"></use></svg></button><div class="title-container"><div class="project-avatar"><img alt="Keerdm's Zombie Apocalypse Essentials" src="https://media.forgecdn.net/avatars/thumbnails/1037/262/256/256/638562066445883182.png"></div><div class="text-container"><span>Download</span><h1>Keerdm's Zombie Apocalypse Essentials</h1></div></div><div class="modal-content "><div class="modal-inner-content"><button style="display: flex; flex-direction: row; align-items: center; justify-content: center; background-color: rgb(46, 46, 104); color: var(--text-primary); border: 2px solid transparent; cursor: pointer; white-space: nowrap; transition: scale 0.125s ease-in-out, background-color 0.25s ease-in-out, color 0.25s ease-in-out; width: 100%; margin-bottom: 0.5em; height: 2em; opacity: 0.8;">Apocalypse<span style="color: rgba(255, 255, 255, 0.314); font-weight: normal;">&nbsp;already downloaded</span></button><button style="display: flex; flex-direction: row; align-items: center; justify-content: center; background-color: rgb(46, 46, 104); color: var(--text-primary); border: 2px solid transparent; cursor: pointer; white-space: nowrap; transition: scale 0.125s ease-in-out, background-color 0.25s ease-in-out, color 0.25s ease-in-out; width: 100%; margin-bottom: 0.5em; height: 2em; outline: solid var(--banner-error-border) 2px;" disabled="">Fabric Fabric<span style="color: rgba(255, 255, 255, 0.314); font-weight: normal;">&nbsp;incompatible</span></button><button style="display: flex; flex-direction: row; align-items: center; justify-content: center; background-color: rgb(46, 46, 104); color: var(--text-primary); border: 2px solid transparent; cursor: pointer; white-space: nowrap; transition: scale 0.125s ease-in-out, background-color 0.25s ease-in-out, color 0.25s ease-in-out; width: 100%; margin-bottom: 0.5em; height: 2em; outline: solid var(--banner-error-border) 2px;" disabled="">Shaderless Aestetic<span style="color: rgba(255, 255, 255, 0.314); font-weight: normal;">&nbsp;incompatible</span></button><button style="display: flex; flex-direction: row; align-items: center; justify-content: center; background-color: rgb(46, 46, 104); color: var(--text-primary); border: 2px solid transparent; cursor: pointer; white-space: nowrap; transition: scale 0.125s ease-in-out, background-color 0.25s ease-in-out, color 0.25s ease-in-out; width: 100%; margin-bottom: 0.5em; height: 2em; outline: solid var(--banner-error-border) 2px;" disabled="">Ultra Unimmersive<span style="color: rgba(255, 255, 255, 0.314); font-weight: normal;">&nbsp;incompatible</span></button></div></div></section>`
                m.querySelector("button.btn-close").onclick = () => {m.remove();}

                document.querySelector("main").appendChild(m);
                document.querySelector(".modal-inner-content").innerHTML = "";

                // modal-inner-content

                // DOWNLOAD
                let sub = await browser.runtime.sendMessage({ action: "app", content:
                {
                    name: "read",
                    value: "instances"
                }});

                let cleanLink = window.location.origin;
                for (let i = 1; i < 4; i++)
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
                            website: "curseforge",
                            link: cleanLink
                        })

                        await browser.runtime.sendMessage({ action: "app", content:
                        {
                            name: "write",
                            value: {path: "instances/"+s+"/.request.json", content: JSON.stringify(requestList)}
                        }});

                        c.innerHTML = "";
                        c.innerText = s;
                        c.style.opacity = '0.8';
                        let sp = document.createElement("span");
                        sp.innerHTML = "&nbsp;already downloaded";
                        sp.style.color = "#ffffff50"
                        sp.style.fontWeight = "normal"
                        c.appendChild(sp)

                        m.remove();
                    }

                    Object.assign(c.style,
                    {
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgb(46, 46, 104)',
                        color: 'var(--text-primary)',
                        border: '2px solid transparent',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'scale .125s ease-in-out, background-color .25s ease-in-out, color .25s ease-in-out',
                        width: "100%",
                        marginBottom: "0.5em",
                        height: "2em"
                    });

                    c.innerText = s;
                    document.querySelector(".modal-inner-content").appendChild(c);

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

                    let validFiles = await findCurseforgeFile(instanceData, cleanLink, window.location.pathname.split("/")[2]=="mc-mods")

                    if(instanceData.mods.find(m=>m.originURL==cleanLink||m.url==cleanLink||validFiles.find(f=>f.filename==m.filename)!=undefined||m.title==document.querySelector("h1").innerText||m.slug==window.location.pathname.split("/")[2])!=undefined)
                    {
                        buttons[i].style.opacity = '0.8';
                        let sp = document.createElement("span");
                        sp.innerHTML = "&nbsp;already downloaded";
                        sp.style.color = "#ffffff50"
                        sp.style.fontWeight = "normal"
                        buttons[i].appendChild(sp)
                    }
                    if(validFiles.length == 0)
                    {
                        buttons[i].style.outline = 'solid var(--banner-error-border) 2px';
                        buttons[i].disabled = true;
                        let sp = document.createElement("span");
                        sp.innerHTML = "&nbsp;incompatible";
                        sp.style.color = "#ffffff50"
                        sp.style.fontWeight = "normal"
                        buttons[i].appendChild(sp)
                    }
                }
            }

            // Favourite
            while(!c.querySelector(".btn-favorite")){await new Promise(resolve=>setTimeout(resolve,100))}
            c.querySelector(".btn-favorite").style.backgroundColor = "#333399";

            let cleanLink = window.location.origin;
            for (let i = 1; i < 4; i++)
            {
                cleanLink += "/"+window.location.pathname.split("/")[i];
            }

            let saved = (await browser.runtime.sendMessage({ action: "app", content:
            {
                name: "isSaved",
                value: cleanLink
            }})).result;

            c.querySelector(".btn-favorite svg > path").setAttribute("fill-rule", saved?"nonzero":"evenodd");

            c.querySelector(".btn-favorite").onclick = () =>
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
                            description: document.querySelector(".project-summary").innerText,
                            icon: document.querySelector("div.author-info:nth-child(1) > img:nth-child(1)").src,
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

                c.querySelector(".btn-favorite svg > path").setAttribute("fill-rule", saved?"nonzero":"evenodd");
            }


            // Pack
            while(!c.querySelector("a > button > svg")){await new Promise(resolve=>setTimeout(resolve,100))}
            c.querySelector("a > button > svg").style.strokeWidth = '1.7';
            c.querySelector("a > button > svg").style.color = "var(--text-primary)";
            c.querySelector("a > button > svg").innerHTML = ""
            c.querySelector("a > button").setAttribute("aria-label", "Add to a Pack")
            c.querySelector("a > button").setAttribute("data-tooltip", "Add to a Pack")

            const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path1.setAttribute("d", "M12 22v-9M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.66 1.66 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z");
            path1.setAttribute("fill","none")
            path1.setAttribute("stroke","currentColor")
            path1.style.scale = '0.8'
            c.querySelector("a > button > svg").appendChild(path1);

            const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path2.setAttribute("d", "M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13");
            path2.setAttribute("fill","none")
            path2.setAttribute("stroke","currentColor")
            path2.style.scale = '0.8'
            c.querySelector("a > button > svg").appendChild(path2);

            const path3 = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path3.setAttribute("d", "M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.64 1.64 0 0 0 1.63 0z");
            path3.setAttribute("fill","none")
            path3.setAttribute("stroke","currentColor")
            path3.style.scale = '0.8'
            c.querySelector("a > button > svg").appendChild(path3);

            c.querySelector("a > button").onclick = async () =>
            {
                // document.querySelector("aside > div > div:nth-child(3) > div > div > button").click();
                // await new Promise(resolve=>setTimeout(resolve,1))
                // while(!document.querySelector(".modal-inner-content")){await new Promise(resolve=>setTimeout(resolve,10))}
                // document.querySelector(".modal-inner-content").innerHTML = "";

                // Manual Method:
                let m = document.createElement("div");
                m.classList.add("modal-container")
                m.innerHTML = `<section class="modal is-modal-open project-download-modal"><button class="btn-close" aria-label="Close Modal"><svg><use href="/images/sprite.svg#icon-modal-close"></use></svg></button><div class="title-container"><div class="project-avatar"><img alt="Keerdm's Zombie Apocalypse Essentials" src="https://media.forgecdn.net/avatars/thumbnails/1037/262/256/256/638562066445883182.png"></div><div class="text-container"><span>Download</span><h1>Keerdm's Zombie Apocalypse Essentials</h1></div></div><div class="modal-content "><div class="modal-inner-content"><button style="display: flex; flex-direction: row; align-items: center; justify-content: center; background-color: rgb(46, 46, 104); color: var(--text-primary); border: 2px solid transparent; cursor: pointer; white-space: nowrap; transition: scale 0.125s ease-in-out, background-color 0.25s ease-in-out, color 0.25s ease-in-out; width: 100%; margin-bottom: 0.5em; height: 2em; opacity: 0.8;">Apocalypse<span style="color: rgba(255, 255, 255, 0.314); font-weight: normal;">&nbsp;already downloaded</span></button><button style="display: flex; flex-direction: row; align-items: center; justify-content: center; background-color: rgb(46, 46, 104); color: var(--text-primary); border: 2px solid transparent; cursor: pointer; white-space: nowrap; transition: scale 0.125s ease-in-out, background-color 0.25s ease-in-out, color 0.25s ease-in-out; width: 100%; margin-bottom: 0.5em; height: 2em; outline: solid var(--banner-error-border) 2px;" disabled="">Fabric Fabric<span style="color: rgba(255, 255, 255, 0.314); font-weight: normal;">&nbsp;incompatible</span></button><button style="display: flex; flex-direction: row; align-items: center; justify-content: center; background-color: rgb(46, 46, 104); color: var(--text-primary); border: 2px solid transparent; cursor: pointer; white-space: nowrap; transition: scale 0.125s ease-in-out, background-color 0.25s ease-in-out, color 0.25s ease-in-out; width: 100%; margin-bottom: 0.5em; height: 2em; outline: solid var(--banner-error-border) 2px;" disabled="">Shaderless Aestetic<span style="color: rgba(255, 255, 255, 0.314); font-weight: normal;">&nbsp;incompatible</span></button><button style="display: flex; flex-direction: row; align-items: center; justify-content: center; background-color: rgb(46, 46, 104); color: var(--text-primary); border: 2px solid transparent; cursor: pointer; white-space: nowrap; transition: scale 0.125s ease-in-out, background-color 0.25s ease-in-out, color 0.25s ease-in-out; width: 100%; margin-bottom: 0.5em; height: 2em; outline: solid var(--banner-error-border) 2px;" disabled="">Ultra Unimmersive<span style="color: rgba(255, 255, 255, 0.314); font-weight: normal;">&nbsp;incompatible</span></button></div></div></section>`
                m.querySelector("button.btn-close").onclick = () => {m.remove();}

                document.querySelector("main").appendChild(m);
                document.querySelector(".modal-inner-content").innerHTML = "";

                // DOWNLOAD
                let sub = await browser.runtime.sendMessage({ action: "app", content:
                {
                    name: "read",
                    value: "saves/packs"
                }});

                let cleanLink = window.location.origin;
                for (let i = 1; i < 4; i++)
                {
                    cleanLink += "/"+window.location.pathname.split("/")[i];
                }

                for(let s of sub)
                {
                    if(s==".DS_Store"){continue;}

                    // --_bg: var(--color-button-bg); --_text: var(--color-base); --_hover-bg: var(--color-button-bg); --_hover-text: var(--color-base); --_height: 2.25rem; --_width: auto; --_radius: 0.75rem; --_padding-x: calc(0.75rem - 0.125rem); --_padding-y: 0.5rem; --_gap: 0.375rem; --_font-weight: 600; --_icon-size: 1.25rem;
                    let c = document.createElement("button");

                    Object.assign(c.style,
                    {
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgb(46, 46, 104)',
                        color: 'var(--text-primary)',
                        border: '2px solid transparent',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'scale .125s ease-in-out, background-color .25s ease-in-out, color .25s ease-in-out',
                        marginBottom: "0.5em",
                        height: "2em",
                        marginBottom: "0.5em",
                        height: "32px",
                        marginRight: ".5em",
                        paddingLeft: ".5em",
                        paddingRight: ".5em",
                        display: "inline",
                        paddingTop: ".35em"
                    });

                    c.innerText = s.substring(0, s.length-5);
                    document.querySelector(".modal-inner-content").appendChild(c);

                    let pack = await browser.runtime.sendMessage({ action: "app", content:
                    {
                        name: "read",
                        value: "saves/packs/"+s
                    }});

                    if(pack.content.find(m=>m.url==cleanLink||m.name==document.querySelector("h1").innerText||m.title==document.querySelector("h1").innerText||m.slug==window.location.pathname.split("/")[2])!=undefined)
                    {
                        c.style.opacity = '0.8';
                        let s = document.createElement("span");
                        s.innerHTML = "&nbsp;already downloaded";
                        s.style.color = "#ffffff50"
                        s.style.fontWeight = "normal"
                        c.appendChild(s)
                        document.querySelector(".modal-inner-content").insertBefore(c, document.querySelector(".modal-inner-content").lastChild);
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
                            description: document.querySelector(".project-summary").innerText,
                            icon: document.querySelector("div.author-info:nth-child(1) > img:nth-child(1)").src,
                            url: cleanLink,
                            slug: window.location.pathname.split("/")[3],
                            type: window.location.pathname.split("/")[2]=="mc-mods"?"mods":(window.location.pathname.split("/")[1]=="shaders"?"shaderpacks":"resourcepacks")
                        });

                        c.innerHTML='';
                        c.innerText = s.substring(0, s.length-5);
                        c.style.opacity = '0.8';
                        let sp = document.createElement("span");
                        sp.innerHTML = "&nbsp;already downloaded";
                        sp.style.color = "#ffffff50"
                        sp.style.fontWeight = "normal"
                        c.appendChild(sp)

                        await browser.runtime.sendMessage({ action: "app", content:
                        {
                            name: "write",
                            value: {path: "saves/packs/"+s, content: JSON.stringify(pack)}
                        }});
                    }
                }

            }

            c.querySelector("a").href = "";
            c.appendChild(c.querySelector("a > button"));
            c.querySelector("a").remove();


            document.querySelector("div.ads-layout-content > div > aside > div > div:nth-child(3)").appendChild(c);
        }

        while(document.getElementById('button-quick-test') || !document.querySelector("aside > div > div:nth-child(3) > div")){await new Promise(resolve=>setTimeout(resolve,100))}
        {
            let c = document.querySelector("aside > div > div:nth-child(3) > div.project-actions").cloneNode(true);
            c.innerHTML = `<div class="split-button"><button class=" btn-cta download-btn"><svg class="smaller-icon"><use href="/images/sprite.svg#icon-cf"></use></svg><span>Download</span></button></div><button class="  btn-favorite btn-secondary btn-icon disabled" data-tooltip="Favorite" aria-label="Add Project to Favorites" id="favourite" style="background-color: var(--surface-tertiery); opacity: 1; pointer-events: all;"><svg viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.9666 8.42435L12 2L9.03344 8.42435L2 9.25735L7.2 14.0608L5.81966 21L12 17.5444L18.1803 21L16.8 14.0608L22 9.25735L14.9666 8.42435ZM17.455 10.733L13.62 10.2788L12 6.77065L10.38 10.2788L6.545 10.733L9.38018 13.352L8.62688 17.139L12 15.253L15.3731 17.139L14.6198 13.352L17.455 10.733Z" fill="currentColor"></path></svg></button><a rel="nofollow" href="https://www.curseforge.com/api/v1/auth/login?returnUrl=https://www.curseforge.com/minecraft/mc-mods/keerdm-zombie-apocalypse-essentials&amp;registrationCompletedUrl=https://www.curseforge.com/signup/confirmation"><button class=" btn-follow btn-secondary btn-icon" data-tooltip="Follow" aria-label="Follow Project"><svg id="icon-heart-hollow" viewBox="0 0 20 20"><path d="M9.6941 16.9374C9.62723 16.9127 9.53909 16.8717 9.49824 16.8463C9.42695 16.802 8.95707 16.3331 8.09859 15.4496C7.87709 15.2216 7.51874 14.8535 7.30226 14.6316C7.08578 14.4097 6.37073 13.6734 5.71326 12.9954C4.58389 11.8845 3.25642 10.4905 2.48892 9.36636C2.13406 8.65228 1.99699 8.02266 2.0228 7.22523C2.03618 6.81185 2.07224 6.5603 2.16992 6.19884C2.5997 4.60848 3.87669 3.40511 5.47619 3.08321C5.70034 3.0381 5.80914 3.03061 6.24425 3.03031C6.68463 3.03 6.78594 3.03699 7.01613 3.08359C7.36409 3.15403 7.7708 3.29157 8.05941 3.4364C8.60401 3.70969 8.8496 3.90051 9.48306 4.54257L10.003 5.06955L10.4969 4.56536C11.1428 3.90603 11.3875 3.71377 11.9217 3.44582C12.2282 3.29213 12.6291 3.15542 12.9839 3.08359C13.2141 3.03699 13.3154 3.03 13.7558 3.03031C14.1909 3.03061 14.2997 3.03811 14.5238 3.08321C16.3665 3.45405 17.7424 4.97367 17.9598 6.87788C18.0767 7.90148 17.8074 9.00769 17.2362 9.85023C16.996 10.2045 16.9947 10.206 15.46 11.7857C15.0537 12.2039 14.022 13.2667 13.1673 14.1475C10.3816 17.0183 10.5913 16.8106 10.3802 16.9078C10.2042 16.9889 9.87173 17.0033 9.6941 16.9375V16.9374Z" fill="none" stroke="currentColor" stroke-width="2"></path></svg></button></a>`;
            c.querySelector(".split-button").firstChild.querySelector('span').innerText = 'Quick Test';
            c.querySelector(".split-button").firstChild.querySelector('svg').remove();
            c.querySelector(".split-button").firstChild.style.backgroundColor = '#32a912';
            c.querySelector(".split-button").firstChild.id = 'button-quick-test'
            for(let child of Array.from(c.childNodes)){if(child == c.querySelector(".split-button")){continue;}else{child.remove()}}

            document.querySelector("div.ads-layout-content > div > aside > div > div:nth-child(3)").appendChild(c);

            c.querySelector(".split-button").firstChild.onclick = async (e) =>
            {
                let cleanLink = window.location.origin;
                for (let i = 1; i < 4; i++)
                {
                    cleanLink += "/"+window.location.pathname.split("/")[i];
                }

                // Find Last Loader/version
                let allFiles = await allCurseforgeVersion(cleanLink)

                // Find files
                let validFiles = await findCurseforgeFile({loader: {name: allFiles[0].gameVersions.findLast(g=>!minecraftVersionReg.test(g)&&g.toLowerCase()!="server"&&g.toLowerCase()!="client")}, version: {number: allFiles[0].gameVersions.findLast(g=>minecraftVersionReg.test(g))}}, cleanLink, window.location.pathname.split("/")[2]=="mc-mods");
                console.log("validFiles", validFiles);

                // Convert
                let mods = [];
                for(let f of validFiles)
                {
                    if(!f.primary){continue}
                    mods.push({url:f.url, filename:f.filename})
                }

                // Loader Last Version
                let versionList = [];

                switch(allFiles[0].gameVersions.findLast(g=>!minecraftVersionReg.test(g)&&g.toLowerCase()!="server"&&g.toLowerCase()!="client").toLowerCase())
                {
                    case 'vanilla': { loaderVersionSelect.style.display = 'none'; break; }
                    case 'forge':
                    {
                        let text = await (await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')).text();
                        const data = parseXml(text)

                        if(!Array.isArray(data.metadata.versioning.versions.version))
                        {data.metadata.versioning.versions.version = [data.metadata.versioning.versions.version]}
                    
                        for(let v of data.metadata.versioning.versions.version.filter(e => e["#text"].split('-')[0] == allFiles[0].game_versions[0]))
                        {
                            versionList.push(v["#text"].split('-')[1]);
                        }

                        if(versionList.length == 0){versionList = [data.metadata.versioning.versions.version[0]["#text"].split('-')[1]]}

                        break;
                    }
                    case 'neoforge':
                    {
                        let text = await (await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')).text();
                        const data = parseXml(text)

                        if(!Array.isArray(data.metadata.versioning.versions.version))
                        {data.metadata.versioning.versions.version = [data.metadata.versioning.versions.version]}
                    
                        for(let v of data.metadata.versioning.versions.version.filter(e => '1.'+e["#text"].split('-')[0].substring(0, e["#text"].split('-')[0].lastIndexOf('.')) == allFiles[0].game_versions[0]).reverse())
                        {
                            versionList.push(v["#text"]);
                        }

                        if(versionList.length == 0){versionList = [data.metadata.versioning.versions.version[0]["#text"]]}

                        break;
                    }
                    case 'fabric':
                    {
                        const data = await (await fetch('https://meta.fabricmc.net/v2/versions/loader/'+allFiles[0].gameVersions.findLast(g=>minecraftVersionReg.test(g)).toString())).json();

                        for(let v of data)
                        {
                            versionList.push(v.loader.version);
                        }

                        break;
                    }
                }

                let data = await browser.runtime.sendMessage({ action: "app", content:
                {
                    name: "read",
                    value: ".browser-requests.json"
                }});
                data.push
                ({
                    type: "silent"
                });
                data.push
                ({
                    type: "ephemeral-instance",
                    loader:
                    {
                        name: allFiles[0].gameVersions.findLast(g=>!minecraftVersionReg.test(g)&&g.toLowerCase()!="server"&&g.toLowerCase()!="client").toLowerCase(),
                        version: versionList[0]
                    },
                    version:
                    {
                        number: allFiles[0].gameVersions.findLast(g=>minecraftVersionReg.test(g)),
                        type: "release"
                    },
                    mods
                });
                await browser.runtime.sendMessage({ action: "app", content:
                {
                    name: "write",
                    value: {path: ".browser-requests.json", content: JSON.stringify(data)}
                }});

                browser.runtime.sendMessage({ action: "app", content:
                {
                    name: "launch",
                    value: {}
                }});
            }
        }
    }
    catch(err)
    {
        console.error(err);
    }
}})()



async function allCurseforgeVersion(link)
{
    let url = new URL(link)
    let classId = 6
    switch(url.pathname.split('/')[2])
    {
        case 'mc-mods': { classId = 6; break; }
        case 'shaders': { classId = 6552; break; }
        case 'texture-packs': { classId = 12; break; }
    }

    let id = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${url.pathname.split('/')[url.pathname.split('/').length-1]}&classId=${classId}`)).json()).data[0].id;

    // https://www.curseforge.com/api/v1/mods/1193072/files?pageIndex=0&pageSize=20&sort=dateCreated&sortDescending=true&gameVersionId=9990&removeAlphas=true
    let versions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=0&pageSize=60&sort=dateCreated&sortDescending=true&removeAlphas=false`)).json()).data
    .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });

    // Add 50+ versions
    let i = 1;
    while(true)
    {
        let newVersions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=${i}&pageSize=60&sort=dateCreated&sortDescending=true&removeAlphas=false`)).json()).data
        .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });
        console.log(newVersions.length)
        if(newVersions.length == 0){break;}

        versions = versions.concat(newVersions);
        i++;
    }

    return versions;
}
async function findCurseforgeFile(instance, link, useLoader = true, list = false, name = null)
{
    let url = new URL(link)
    let classId = 6
    switch(url.pathname.split('/')[2])
    {
        case 'mc-mods': { classId = 6; break; }
        case 'shaders': { classId = 6552; break; }
        case 'texture-packs': { classId = 12; break; }
    }

    let id = (await (await fetch(`https://www.curseforge.com/api/v1/mods/search?gameId=432&index=0&pageSize=1&sortField=1&filterText=${url.pathname.split('/')[url.pathname.split('/').length-1]}&classId=${classId}`)).json()).data[0].id;
    let originURL = link;

    // https://www.curseforge.com/api/v1/mods/1193072/files?pageIndex=0&pageSize=20&sort=dateCreated&sortDescending=true&gameVersionId=9990&removeAlphas=true
    let versions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=0&pageSize=60&sort=dateCreated&sortDescending=true&gameVersion=${instance.version.number}&removeAlphas=false`)).json()).data
    .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });

    // Add 50+ versions
    let i = 1;
    while(true)
    {
        let newVersions = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/files?pageIndex=${i}&pageSize=60&sort=dateCreated&sortDescending=true&gameVersion=${instance.version.number}&removeAlphas=false`)).json()).data
        .sort((a,b) => { return new Date(b.dateModified	) - new Date(a.dateModified	); });
        console.log(newVersions.length)
        if(newVersions.length == 0){break;}

        versions = versions.concat(newVersions);
        i++;
    }

    const dependenciesData = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/dependencies?index=0&pageSize=60&type=RequiredDependency`)).json()).data;

    var version = versions[list?'filter':'find'](v =>
    {
        if(!useLoader){return true;}
        let valid = v.gameVersions.includes(instance.loader.name.charAt(0).toUpperCase() + instance.loader.name.slice(1));
        if(!valid && instance.loader.name == 'forge' && v.gameVersions.includes('NeoForge')) { valid = true; }
        if(!v.gameVersions.includes(instance.version.number)) { valid = false; }
        if(name != null && v.fileName != name){valid = false;}
        return valid;
    });
    if(!version || version.length==0)
    {
        if(instance.sinytra && instance.loader.name=='forge')
        {
            version = versions[list?'filter':'find'](v =>
            {
                if(!useLoader){return true;}
                let valid = v.gameVersions.includes(instance.loader.name.charAt(0).toUpperCase() + instance.loader.name.slice(1)) || v.gameVersions.includes('Fabric');
                if(!valid && instance.loader.name == 'fabric') { valid = true; }
                if(!v.gameVersions.includes(instance.version.number)) { valid = false; }
                if(name != null && v.fileName != name){valid = false;}
                return valid;
            });
            if(!version || version.length==0) {  }
        }
        if(!version || version.length==0) { return []; }
    }
    if(list){return version}

    let dependencies = (await (await fetch(`https://www.curseforge.com/api/v1/mods/${id}/dependencies?index=0&pageSize=60&type=RequiredDependency`)).json()).data;

    let files =
    [{
        url: `https://www.curseforge.com/api/v1/mods/${id}/files/${version.id}/download`,
        filename: version.fileName,
        primary: true,
        id,
        dependencies,
        client: version.gameVersions.includes('Client'),
        server: version.gameVersions.includes('Server'),
        originURL: originURL
    }];

    for(let d of dependencies)
    {
        let r = await findCurseforgeFile(instance, `https://www.curseforge.com/minecraft/mc-mods/${dependenciesData.find(de=>de.id==d.id).slug}`, useLoader, false);
        for(let i = 0; i < r.length; i++) { r[i].slug = d.slug; r[i].title = d.title; }
        files = files.concat(r)
    }

    return files;
}