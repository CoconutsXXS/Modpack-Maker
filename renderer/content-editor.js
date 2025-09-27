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
        backgroundColor: "#00000000",
        color: "#ddd",
        border: "none"
    }
}, {dark: true})

// Elements
let section = document.querySelector(".content-explorer-section").cloneNode(true); document.querySelector(".content-explorer-section").remove();
let codeEditor = document.getElementById("code-editor"); codeEditor.style.display = "none";

let modEditor = document.getElementById("mod-content-editor"); modEditor.style.display = "none";
let nbtEditor = document.getElementById("nbt-editor"); document.getElementById("nbt-editor").style.display = "none";

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
            }
            else
            {
                explorer(v, open, path, iteration+1);
            }
        }
    }
}
async function fileEditor(data, filename, onChange = (value)=>{}, onExit = () => {})
{
    if(filename.endsWith(".json"))
    {
        modEditor.style.display = "none";
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
        codeEditor.querySelector(".exit-options > button:last-of-type").onclick = () =>
        {
            codeEditor.style.display = "none"
            editor.dom.remove();
            onExit();
        }
    }
    else if(filename.endsWith(".nbt"))
    {
        modEditor.style.display = "none";
        nbtEditor.style.display = "block";

        nbtEditor.querySelector("span.filename").innerText = filename.slice(0, filename.length-4);

        await ipcInvoke("addEditionWorld", window.instance.name);
        await launch(
            window.instance.name,
            {
                log: (t, c) => {},
                close: async c =>
                {
                    nbtEditor.style.display = "none";

                    // Save
                    let data =
                    {
                        parsed: await ipcInvoke("readFile", 'Modpack\ Maker/instances/'+window.instance.name+'/minecraft/saves/.Structure Edition/generated/minecraft/structures/'+filename),
                        buffer: await ipcInvoke("readRawFile", 'Modpack\ Maker/instances/'+window.instance.name+'/minecraft/saves/.Structure Edition/generated/minecraft/structures/'+filename)
                    };
                    onChange(data)
                    onExit()
                },
                network: (i, c) => {},
                windowOpen: async (w, i) => {},
            },
            {type: "singleplayer", identifier: ".Structure Edition"}
        )

        ipcInvoke('writeBuffer', 'Modpack\ Maker/instances/'+window.instance.name+'/minecraft/saves/.Structure Edition/generated/minecraft/structures/'+filename, data.buffer)
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
            explorer(o, (keys) =>
            {
                fileEditor(getProp(data.mods[i], keys), keys[keys.length-1], (value) => { setProp(data.mods[i], keys, value) }, () => { modEditor.style.display = "flex"; codeEditor.style.display = "none"; })
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