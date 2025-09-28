import {EditorView, basicSetup} from 'cdn/codemirror'
import {json} from 'cdn/@codemirror/lang-json'
import {oneDark} from 'cdn/@codemirror/theme-one-dark'
import { keymap } from "cdn/@codemirror/view";
import { indentMore, indentLess } from "cdn/@codemirror/commands";
import { indentUnit } from "cdn/@codemirror/language";

// Core Functions
let editorTheme = EditorView.theme
({
    "&":
    {
        color: "white",
        backgroundColor: "#00000000"
    },
    ".cm-gutters":
    {
        backgroundColor: "#020207",
        color: "#ddd",
        border: "none"
    }
}, {dark: true})

// Elements
let section = document.querySelector(".content-explorer-section").cloneNode(true); document.querySelector(".content-explorer-section").remove();
let codeEditor = document.getElementById("code-editor"); codeEditor.style.display = "none";

let modEditor = document.getElementById("mod-content-editor"); modEditor.style.display = "none";
let nbtEditor = document.getElementById("nbt-editor"); document.getElementById("nbt-editor").style.display = "none";
let noEditor = document.getElementById("no-editor"); noEditor.style.display = "none";
let imgEditor = document.getElementById("image-editor"); imgEditor.style.display = "none";

// Expend/Unexpend
document.querySelector("#content-editor .unexpend").onclick = () =>
{
    document.querySelector("#mod-content-editor").style.display = "none";
    document.querySelector("#content-editor .expend").style.display = "block";
}
document.querySelector("#content-editor .expend").onclick = () =>
{
    document.querySelector("#mod-content-editor").style.display = "flex";
    document.querySelector("#content-editor .unexpend").style.display = "block";
    document.querySelector("#content-editor .expend").style.display = "none";
}

// Core Functions
function explorer(o, open, keysPath = [], iteration = 0)
{
    let s = null;
    if(modEditor.querySelectorAll(".content-explorer-section")[iteration])
    {
        s = modEditor.querySelectorAll(".content-explorer-section")[iteration];
        while(modEditor.querySelectorAll(".content-explorer-section")[iteration+1]){modEditor.querySelectorAll(".content-explorer-section")[iteration+1].remove();}
        while(s.querySelector("button")){s.querySelector("button").remove();}
    }
    else
    {
        s = section.cloneNode(true);
        s.querySelector("h3").innerText = ""
        modEditor.appendChild(s)
    }

    for(let [k, v] of Object.entries(o))
    {
        let b = document.createElement("button");
        b.innerText = k;
        s.appendChild(b)

        b.onclick = () =>
        {
            let path = JSON.parse(JSON.stringify(keysPath));
            path.push(k);

            if(/^[^\\\/:\*\?"<>\|]+(\.[a-zA-Z0-9]+)+$/.test(k))
            {
                open(path)

                let directoryPath = path;
                directoryPath.pop();
                explorer(o, open, directoryPath, iteration);
            }
            else
            {
                explorer(v, open, path, iteration+1);
            }
        }
    }
}

let closeEditor = () => {};
async function fileEditor(data, filename, onChange = (value)=>{}, onExit = () => {})
{
    closeEditor();
    if(filename.endsWith(".json") || filename.endsWith(".mcmeta"))
    {
        codeEditor.style.display = "block";

        let value = JSON.stringify(data, null, 4);
        let editor = new EditorView
        ({
            doc: value,
            extensions:
            [
                basicSetup,
                json(),
                editorTheme,
                oneDark,
                indentUnit.of("    "),
                EditorView.updateListener.of(update =>
                {
                    if (update.docChanged)
                    {
                        const doc = update.state.doc;
                        value = doc.toString()
                    }
                }),
                keymap.of
                ([
                    { key: "Tab", run: indentMore },
                    { key: "Shift-Tab", run: indentLess }
                ])
            ],
            parent: codeEditor
        })
                    
        codeEditor.appendChild(codeEditor.querySelector(".exit-options"))
        codeEditor.querySelector(".exit-options > button:first-of-type").onclick = () =>
        {
            try
            {
                onChange(JSON.parse(value))
            }
            catch(err)
            {
                console.warn(err)
                // TODO: Error invalid json
            }
        }

        closeEditor = () =>
        {
            codeEditor.style.display = "none"
            editor.dom.remove();
            onExit();
        }
        codeEditor.querySelector(".exit-options > button:last-of-type").onclick = closeEditor
    }
    else if(filename.endsWith(".mcfunction"))
    {
        codeEditor.style.display = "block";

        let editor = new EditorView
        ({
            doc: data,
            extensions:
            [
                basicSetup,
                editorTheme,
                oneDark,
                indentUnit.of("    "),
                EditorView.updateListener.of(update =>
                {
                    if (update.docChanged)
                    {
                        const doc = update.state.doc;
                        data = doc.toString()
                    }
                }),
                keymap.of
                ([
                    { key: "Tab", run: indentMore },
                    { key: "Shift-Tab", run: indentLess }
                ])
            ],
            parent: codeEditor
        })
                    
        codeEditor.appendChild(codeEditor.querySelector(".exit-options"))
        codeEditor.querySelector(".exit-options > button:first-of-type").onclick = () => {onChange(data)}

        closeEditor = () =>
        {
            codeEditor.style.display = "none"
            editor.dom.remove();
            onExit();
        }
        codeEditor.querySelector(".exit-options > button:last-of-type").onclick = closeEditor
    }
    else if(filename.endsWith(".nbt"))
    {
        nbtEditor.style.display = "block";

        closeEditor = () => { nbtEditor.style.display = "none"; onExit(); }

        nbtEditor.querySelector("p").innerText = `Dimensions x: ${data.parsed.size[0]}, y: ${data.parsed.size[1]}, z: ${data.parsed.size[2]}`

        nbtEditor.querySelector("caption").innerText = filename;
        while(nbtEditor.querySelector("tbody").firstChild){nbtEditor.querySelector("tbody").firstChild.remove();}
        for(let [i, p] of data.parsed.palette.entries())
        {
            let c = document.createElement("tr");
            nbtEditor.querySelector("tbody").appendChild(c);

            c.appendChild(document.createElement("td"));
            c.querySelector("td:last-of-type").innerText = data.parsed.blocks.filter(b=>b.state==i).length

            c.appendChild(document.createElement("td"));
            c.querySelector("td:last-of-type").innerText = p.Name

            c.appendChild(document.createElement("td"));
            c.querySelector("td:last-of-type").innerText = p.Properties?JSON.stringify(p.Properties, null, 4):"";
            c.querySelector("td:last-of-type").style.textAlign = "start"
        }

        while(nbtEditor.querySelector("ul").firstChild){nbtEditor.querySelector("ul").firstChild.remove();}
        for(let entity of data.parsed.entities)
        {
            let e = document.createElement("li");
            e.innerText = entity.nbt.id;
            nbtEditor.querySelector("ul").appendChild(e);
        }
        console.log(data)

        nbtEditor.querySelector("button").onclick = async () =>
        {
            await ipcInvoke("addEditionWorld", window.instance.name);
            await launch(
                window.instance.name,
                {
                    log: (t, c) => {},
                    close: async c =>
                    {
                        // Save
                        let data =
                        {
                            parsed: await ipcInvoke("readFile", 'Modpack\ Maker/instances/'+window.instance.name+'/minecraft/saves/.Structure Edition/generated/minecraft/structures/structure.nbt'),
                            buffer: await ipcInvoke("readRawFile", 'Modpack\ Maker/instances/'+window.instance.name+'/minecraft/saves/.Structure Edition/generated/minecraft/structures/structure.nbt')
                        };
                        onChange(data)

                        ipcInvoke('deleteFolder', 'Modpack\ Maker/instances/'+window.instance.name+'/minecraft/saves/.Structure Edition/');

                        closeEditor();
                    },
                    network: (i, c) => {},
                    windowOpen: async (w, i) => {},
                },
                {type: "singleplayer", identifier: ".Structure Edition"}
            )

            ipcInvoke('writeBuffer', 'Modpack\ Maker/instances/'+window.instance.name+'/minecraft/saves/.Structure Edition/generated/minecraft/structures/structure.nbt', data.buffer);
        }
    }
    else if(filename.endsWith(".png"))
    {
        console.log(data)
        closeEditor = () => { imgEditor.style.display = "none"; onExit(); }
        imgEditor.style.display = "block";

        // External
        document.getElementById("image-editor").querySelector(".download").onclick = async () =>
        {
            await ipcInvoke("downloadBuffer", data.buffer, filename.split("/")[filename.split("/").length-1])
        }

        document.getElementById("image-editor").querySelector(".replace").onclick = async () =>
        {
            document.getElementById("image-editor").querySelector("input").click();

            document.getElementById("image-editor").querySelector("input").onchange = async () =>
            {
                data.buffer = await document.getElementById("image-editor").querySelector("input").files[0].arrayBuffer();
                console.log(data)
                onChange(data);
            }
        }


        // Image
        let canvas = document.getElementById("image-editor").querySelector("canvas")
        let ctx = canvas.getContext('2d');

        document.getElementById("image-editor").querySelector(".save").onclick = async () =>
        {
            data.buffer = ctx.getImageData(0, 0, canvas.width, canvas.height).data
            onChange(data);
        }

        let img = new Image;
        img.onload = (i) =>
        {
            canvas.width = img.width
            canvas.height = img.height
            if(canvas.width * imgEditor.getBoundingClientRect().height < canvas.height * imgEditor.getBoundingClientRect().width) { canvas.style.height = "calc(80% - 32px)"; canvas.style.width = "unset"; }
            else { canvas.style.width = "calc(80% - 32px)"; canvas.style.height = "unset"; }
            ctx.drawImage(img, 0, 0);
        }
        img.src = "data:image/png;base64,"+data.url;

        // Image Editor

        // Color Utily
        function changeHue(rgb, degree)
        {
            var hsl = rgbToHSL(rgb);
            hsl.h = degree;
            if (hsl.h > 360) {
                hsl.h -= 360;
            }
            else if (hsl.h < 0) {
                hsl.h += 360;
            }
            return hslToRGB(hsl);
        }
        function rgbToHSL(rgb)
        {
            rgb = rgb.replace(/^\s*#|\s*$/g, '');

            if(rgb.length == 3){
                rgb = rgb.replace(/(.)/g, '$1$1');
            }

            var r = parseInt(rgb.substr(0, 2), 16) / 255,
                g = parseInt(rgb.substr(2, 2), 16) / 255,
                b = parseInt(rgb.substr(4, 2), 16) / 255,
                cMax = Math.max(r, g, b),
                cMin = Math.min(r, g, b),
                delta = cMax - cMin,
                l = (cMax + cMin) / 2,
                h = 0,
                s = 0;

            if (delta == 0) {
                h = 0;
            }
            else if (cMax == r) {
                h = 60 * (((g - b) / delta) % 6);
            }
            else if (cMax == g) {
                h = 60 * (((b - r) / delta) + 2);
            }
            else {
                h = 60 * (((r - g) / delta) + 4);
            }

            if (delta == 0) {
                s = 0;
            }
            else {
                s = (delta/(1-Math.abs(2*l - 1)))
            }

            return {
                h: h,
                s: s,
                l: l
            }
        }
        function hslToRGB(hsl)
        {
            var h = hsl.h,
                s = hsl.s,
                l = hsl.l,
                c = (1 - Math.abs(2*l - 1)) * s,
                x = c * ( 1 - Math.abs((h / 60 ) % 2 - 1 )),
                m = l - c/ 2,
                r, g, b;

            if (h < 60) {
                r = c;
                g = x;
                b = 0;
            }
            else if (h < 120) {
                r = x;
                g = c;
                b = 0;
            }
            else if (h < 180) {
                r = 0;
                g = c;
                b = x;
            }
            else if (h < 240) {
                r = 0;
                g = x;
                b = c;
            }
            else if (h < 300) {
                r = x;
                g = 0;
                b = c;
            }
            else {
                r = c;
                g = 0;
                b = x;
            }

            r = normalize_rgb_value(r, m);
            g = normalize_rgb_value(g, m);
            b = normalize_rgb_value(b, m);

            return rgbToHex(r,g,b);
        }
        function normalize_rgb_value(color, m)
        {
            color = Math.floor((color + m) * 255);
            if (color < 0) {
                color = 0;
            }
            return color;
        }
        function rgbToHex(r, g, b)
        {
            return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }
        function hexToRgb(hex)
        {
            var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        }

        let Drawers = {};
        initializeDrawer(document.getElementById("content-image-canvas"));
        function initializeDrawer(canvas)
        {
            let id = 0;
            Drawers[id] = {};

            var ctx = canvas.getContext("2d");

            // Tool Selection
            const buttonContainer = document.getElementById("image-editor").querySelector("div:last-child");
            let buttons = buttonContainer.querySelectorAll("button");

            Drawers[id].size = 1;
            Drawers[id].color = buttonContainer.querySelector("input").value;
            Drawers[id].toolId = 0;
            Drawers[id].alphaLock = false;
            Drawers[id].onBack = false;
            Drawers[id].hue = false;
            Drawers[id].canvas = canvas;
            Drawers[id].selectTool = function(element)
            {
                var toolId = Array.from(buttons).indexOf(element);

                console.log("toolId", toolId)

                if(toolId > 1)
                {
                    if(element.attributes.getNamedItem('current') != null)
                    {
                        element.removeAttribute("current");
                    }
                    else if(toolId != 2)
                    {
                        element.setAttribute("current", "");
                    }

                    if(toolId == 5)
                    {
                        Drawers[id].hue = !Drawers[id].hue;
                        if(!Drawers[id].alphaLock && Drawers[id].hue)
                        {
                            buttons[3].click();
                        }
                        return;
                    }
                    else if(toolId == 3)
                    {
                        Drawers[id].alphaLock = !Drawers[id].alphaLock;
                        buttons[4].removeAttribute("current");
                        Drawers[id].onBack = false;
                    }
                    else if (toolId == 4)
                    {
                        Drawers[id].onBack = !Drawers[id].onBack;
                        buttons[3].removeAttribute("current");
                        Drawers[id].alphaLock = false;
                    }
                    else if (toolId == 2)
                    {
                        console.log(buttonContainer.querySelector("input"))
                        buttonContainer.querySelector("input").click();
                    }
                    return;
                }

                Drawers[id].toolId = toolId;


                buttons[1].removeAttribute("current");
                for (let index = 0; index < buttons.length; index++)
                {
                    if(index > 0) { break; }
                    const button = buttons[index];
                    button.removeAttribute("current");
                }

                element.setAttribute("current", "");
            }

            buttons[2].style.backgroundColor = Drawers[id].color;
            buttonContainer.querySelector("input").addEventListener("change", (e) => {Drawers[id].color = e.target.value; buttons[2].style.backgroundColor = e.target.value});
            for (let index = 0; index < buttons.length; index++)
            {
                const element = buttons[index];

                element.addEventListener("click", (e) => Drawers[id].selectTool(e.currentTarget));
            }

            Drawers[id].selectTool(buttons[0]);

            // Slider
            document.getElementById("image-editor").querySelector("input[type='range']").addEventListener("input", (event) =>
            {
                Drawers[id].size = event.currentTarget.value;
            });

            // Draw on Canvas
            const oldCanvas = [];
            ctx.imageSmoothingEnabled= false;

            var press = false;
            canvas.addEventListener("mousemove", (e) => drawEvent(e));
            canvas.addEventListener("mousedown", (e) => drawEvent(e));
            const drawEvent = function(event)
            {
                var rect = event.target.getBoundingClientRect();

                var x = Math.round(((event.clientX - rect.left)/canvas.getBoundingClientRect().width)*canvas.width - 0.5);
                var y = Math.round(((event.clientY - rect.top)/canvas.getBoundingClientRect().height)*canvas.height - 0.5);

                if(Drawers[id].toolId == -1){ return }

                switch(Number(Drawers[id].size))
                {
                    case 1: drawPixel(x, y); break;
                    case 2: drawPixel(x, y);drawPixel(x-1, y);drawPixel(x, y-1);drawPixel(x+1, y);drawPixel(x, y+1); break;
                    case 3: drawPixel(x, y);drawPixel(x-1, y);drawPixel(x-1, y-1);drawPixel(x, y-1);drawPixel(x+1, y);drawPixel(x+1, y+1);drawPixel(x-1, y+1);drawPixel(x+1, y-1);drawPixel(x, y+1); break;
                    case 4: drawPixel(x, y);drawPixel(x-1, y);drawPixel(x-1, y-1);drawPixel(x, y-1);drawPixel(x+1, y);drawPixel(x+1, y+1);drawPixel(x-1, y+1);drawPixel(x+1, y-1);drawPixel(x, y+1); 
                    drawPixel(x-2, y);drawPixel(x, y-2);drawPixel(x+2, y);drawPixel(x, y+2);break;
                    case 5: drawPixel(x, y);drawPixel(x-1, y);drawPixel(x-1, y-1);drawPixel(x, y-1);drawPixel(x+1, y);drawPixel(x+1, y+1);drawPixel(x-1, y+1);drawPixel(x+1, y-1);drawPixel(x, y+1);
                    drawPixel(x-2, y);drawPixel(x-2, y-2);drawPixel(x, y-2);drawPixel(x+2, y);drawPixel(x+2, y+2);drawPixel(x-2, y+2);drawPixel(x+2, y-2);drawPixel(x, y+2); break;
                }

                function drawPixel(x, y)
                {
                    if(press)
                    {
                        if(Drawers[id].toolId == 0)
                        {
                            ctx.globalCompositeOperation = 'source-over';
                            if(Drawers[id].alphaLock){ ctx.globalCompositeOperation = 'source-atop' }
                            if(Drawers[id].onBack){ ctx.globalCompositeOperation = 'destination-over'; }
                        }
                        else if(Drawers[id].toolId == 1){ ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'black'; }

                        ctx.fillStyle = Drawers[id].color;

                        if(Drawers[id].hue)
                        {
                            var p = ctx.getImageData(x, y, 1, 1).data; 
                            var hex = "#" + ("000000" + rgbToHex(p[0], p[1], p[2])).slice(-6);

                            ctx.fillStyle = changeHue(hex, rgbToHSL(Drawers[id].color).h);
                        }

                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            };
            canvas.addEventListener("click", (event) =>
            {
                if(Drawers[id].toolId == -1)
                {
                    var rect = event.target.getBoundingClientRect();

                    var x = Math.round(((event.clientX - rect.left)/canvas.getBoundingClientRect().width)*canvas.width - 0.5);
                    var y = Math.round(((event.clientY - rect.top)/canvas.getBoundingClientRect().height)*canvas.height - 0.5);

                    var p = ctx.getImageData(x, y, 1, 1).data; 
                    var hex = "#" + ("000000" + rgbToHex(p[0], p[1], p[2])).slice(-6);

                    Drawers[id].color = hex;
                    buttons[3].value = hex;

                    // buttonContainer.children.item(8).click();
                }
            });
            canvas.onmousedown = function(event){ press = true; }
            window.onmouseup = async function(event) { press = false; oldCanvas.push(await canvas.toDataURL()); }

            document.onkeydown = async () =>
            {
                var evtobj = window.event? event : e
                if (evtobj.keyCode == 90 && (evtobj.shiftKey || evtobj.metaKey || evtobj.ctrlKey))
                {
                    ctx.globalCompositeOperation = 'source-over';

                    var img = new Image;
                    if(oldCanvas[oldCanvas.length - 2] != undefined)
                    {
                        img.src = oldCanvas[oldCanvas.length - 2];
                        oldCanvas.splice(oldCanvas.length - 2, 2)
                    }
                    else if(oldCanvas[oldCanvas.length - 1] != undefined)
                    {
                        img.src = oldCanvas[oldCanvas.length - 1];
                        oldCanvas.splice(oldCanvas.length - 1, 1)
                    }
                    else
                    {
                        ctx.clearRect(0, 0, 16, 16); updateModel(id); return;
                    }

                    img.onload = () => {ctx.clearRect(0, 0, 16, 16);ctx.drawImage(img, 0, 0, 16, 16); updateModel(id)};
                }
            };
        }
    }
    else
    {
        closeEditor = () => { noEditor.style.display = "none"; onExit(); }
        noEditor.style.display = "block";
        document.getElementById("no-editor").querySelector("p").innerText = filename.split("/")[filename.split("/").length-1] + "\n" + document.getElementById("no-editor").querySelector("p").innerText;
        
        document.getElementById("no-editor").querySelector("button:first-of-type").onclick = async () =>
        {
            await ipcInvoke("downloadBuffer", data, filename.split("/")[filename.split("/").length-1])
        }

        document.getElementById("no-editor").querySelector("button:last-of-type").onclick = async () =>
        {
            document.getElementById("no-editor").querySelector("input").click();

            document.getElementById("no-editor").querySelector("input").onchange = async () =>
            {
                console.log(await document.getElementById("no-editor").querySelector("input").files[0].arrayBuffer())
                onChange(await document.getElementById("no-editor").querySelector("input").files[0].arrayBuffer());
            }
        }
    }
}

window.openModContent = async function(path)
{
    let data = await ipcInvoke("readModContent", "instances/"+window.instance.name +"/minecraft/"+path+".jar")

    modEditor.style.display = "flex";
    // Mods
    let s = section.cloneNode(true);
    s.querySelector("h3").innerText = "Mod Data"
    modEditor.appendChild(s)
    
    for(let [i, m] of data.mods.entries())
    {
        let b = document.createElement("button");
        b.innerText = m.name;
        s.appendChild(b)

        b.onclick = () =>
        {
            let o = {assets: data.mods[i].assets, data: data.mods[i].data, classes: data.mods[i].classes};
            closeEditor();
            while(modEditor.querySelector(".content-explorer-section")){modEditor.querySelector(".content-explorer-section").remove();}
            explorer(o, (keys) =>
            {
                keys = JSON.parse(JSON.stringify(keys))
                fileEditor(getProp(data.mods[i], keys), keys[keys.length-1], (value) => { console.log(keys, value); setProp(data.mods[i], keys, value) }, () => { modEditor.style.display = "flex"; codeEditor.style.display = "none"; })
            })
        }
    }
    // Other Data
    {
        let b = document.createElement("button");
        b.innerText = "Other Files";
        s.appendChild(b)

        b.onclick = () =>
        {
            closeEditor();
            while(modEditor.querySelector(".content-explorer-section")){modEditor.querySelector(".content-explorer-section").remove();}
            explorer(data.data, (keys) =>
            {
                fileEditor(getProp(data.data, keys), keys[keys.length-1], (value) => {setProp(data.data, keys, value)}, () => { modEditor.style.display = "flex"; codeEditor.style.display = "none"; })
            })
        }
    }

    modEditor.querySelector(":scope > button").onclick = async () =>
    {
        await ipcInvoke("writeModContent", "instances/"+window.instance.name +"/minecraft/"+path+".jar", data)
    }
}

function setProp(obj, keys, value)
{
    let current = obj;
    keys.slice(0, -1).forEach(k =>
    {
        if (!(k in current)) current[k] = {};
        current = current[k];
    });
    current[keys[keys.length - 1]] = value;
}
function getProp(obj, keys)
{
    let current = obj;
    keys.slice(0, -1).forEach(k =>
    {
        if (!(k in current)) return undefined;
        current = current[k];
    });
    return current[keys[keys.length - 1]]
}