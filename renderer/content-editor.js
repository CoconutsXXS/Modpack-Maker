import {EditorView, basicSetup} from 'codemirror'
import {Decoration} from "@codemirror/view";
import {EditorState, StateEffect, StateField} from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentMore, indentLess } from "@codemirror/commands";
import {oneDark} from '@codemirror/theme-one-dark'
import { StreamLanguage, indentUnit } from "@codemirror/language";
import {json} from '@codemirror/lang-json'
import {java} from '@codemirror/lang-java'
import {toml} from "@codemirror/legacy-modes/mode/toml"
import Frame from "canvas-to-buffer";

import JarContent from "./content-analyse/jar-content";
import JavaTree from "./content-analyse/java-tree"
import { filter } from 'lodash';
import { initializeScene } from '../game-launcher/renderer';

import * as THREE from "three"
import World from '../game-launcher/world/world';
import { Player } from '../game-launcher/player/controller';
import RAPIER from '@dimforge/rapier3d-compat';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Editor UI
let section = document.createElement("div"); section.className = "content-explorer-section"

let editors =
{
    codeEditor: document.getElementById("code-editor"),
    nbtEditor: document.getElementById("nbt-editor"),
    imgEditor: document.getElementById("image-editor"),
    threeEditor: document.getElementById("three-editor"),
    noEditor: document.getElementById("no-editor"),
    sourceSelection: document.getElementById("multiple-source")
}
editors.codeEditor.style.display = "none"
editors.nbtEditor.style.display = "none"; editors.nbtEditor.querySelectorAll(":scope > button")[0].style.display = "none";
editors.noEditor.style.display = "none"
editors.imgEditor.style.display = "none"
editors.threeEditor.style.display = "none"
const importFileInput = document.querySelector("#editor-container > #file-metadata > div > div > input")
const applyEditor = document.getElementById("apply-editor")
applyEditor.style.display = "none"

const fileOptButtons =
[
    document.querySelector("#file-metadata > div:first-of-type > div:nth-child(1) > button:nth-child(1)"),
    document.querySelector("#file-metadata > div:first-of-type > div:nth-child(1) > button:nth-child(2)"),
    document.querySelector("#file-metadata > div:first-of-type > div:nth-child(2) > button:nth-child(1)"),
    document.querySelector("#file-metadata > div:first-of-type > div:nth-child(2) > button:nth-child(2)"),
    document.querySelector("#file-metadata > div:first-of-type > div:nth-child(3) > button:nth-child(1)"),
    document.querySelector("#file-metadata > div:first-of-type > div:nth-child(3) > button:nth-child(2)"),
    document.querySelector("#file-metadata > div:first-of-type > div:nth-child(4) > button:nth-child(1)"),
    document.querySelector("#file-metadata > div:first-of-type > div:nth-child(4) > button:nth-child(2)"),
]



const editorTheme = EditorView.theme
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


let Drawers = {};

// Three Scene
let threeSetup = null;
const threeCanvas = document.querySelector("#editor-container #three-file-canvas")
async function setupThree(content)
{
    if(threeSetup) { return }
    const data = await initializeScene(threeCanvas, false, false)

    // Light
    data.scene.add( new THREE.AmbientLight(0xffffff, 2) )
    {
        const light = new THREE.DirectionalLight(0xffffff, Math.pow(1, 1.5)*2);
        light.castShadow = true;
        light.shadow.camera.near = 1;
        light.shadow.camera.far = 100;
        light.shadow.camera.right = 50;
        light.shadow.camera.left = -50;
        light.shadow.camera.top	= 50;
        light.shadow.camera.bottom = -50;
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;
        light.shadow.bias = -0.02
        light.position.set(50, 100, 50);
        light.target = data.mainCamera
        data.scene.add(light)
    }

    // World
    data.mcWorld = new World(content, '/Users/coconuts/Library/Application Support/Modpack Maker/instances/test/minecraft', data.addRenderListener, data.mainCamera, true, data.world)
    data.scene.add(data.mcWorld.group)

    // Ground Collider
    const ground = RAPIER.ColliderDesc.cuboid(1024, 32, 1024);
    ground.translation = new RAPIER.Vector3(0, -32, 0);
    data.world.createCollider(ground);

    // Player
    data.player = new Player(-2, 0, -2, data, content)
    document.querySelector("#editor-container #three-editor").appendChild(data.player.gui.container)

    // Camera Mode
    data.setDisabledRendering(true)
    let camera = new THREE.PerspectiveCamera(40, threeCanvas.getBoundingClientRect().width / threeCanvas.getBoundingClientRect().height, 0.1, 1000);

    const controls = new OrbitControls( camera, threeCanvas );
    controls.update();

    let axisHelper = new THREE.AxesHelper(64);
    data.scene.add(axisHelper)
    let grid = new THREE.GridHelper(64, 64);
    grid.position.setY(-0.1)
    data.scene.add(grid)

    camera.position.setZ(-10)

    // const raycaster = new THREE.Raycaster();

    let removeRendererListener = null
    let removeResizeListener = null

    data.enableFreeCamera = () =>
    {
        data.setDisabledRendering(true)

        data.renderer.clear(true, true, true);
        data.player.enabled = false;

        removeRendererListener = data.addRenderListener((clock) =>
        {
            controls.update(clock.getDelta());
            data.renderer.render(data.scene, camera);

            // // Raycast
            // raycatsEvent && raycaster.setFromCamera( pointer, camera );
            // raycatsEvent && raycatsEvent(raycaster.intersectObjects( data.scene.children.filter(c=>c.visible&&c.geometry) )[0])
        })

        removeResizeListener = data.addResizeListener((w, h) =>
        {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        })
    }
    data.disableFreeCamera = () =>
    {
        removeRendererListener();
        removeResizeListener();

        data.setDisabledRendering(false)
        data.player.enabled = true;

        data.renderer.clear(true, true, true);
    }

    fileOptButtons[5].onclick = () =>
    {
        data.player.enabled ? data.enableFreeCamera() : data.disableFreeCamera()
    }

    data.enableFreeCamera()
    threeSetup = data
}

// Nbt In-Game
let nbtEditorIndex = -1;
let nbtEditorOpened = false


async function instanceEditor(name)
{
    const content = await JarContent.get(name, null, false)
    console.log(content)

    // Clean
    let exitEditor = () => {}
    function clean()
    {
        while(document.getElementById("content-explorer").querySelector(".content-explorer-section"))
        {document.getElementById("content-explorer").querySelector(".content-explorer-section").remove()}
        exitEditor();
    }

    // Build explorer
    const parentElement = document.querySelector("#content-explorer > #content-explorer-selector")
    let lastDirectory = []
    function displayDirectory(directory = [], root = [], filters = [], separated = false, hierarchy = null)
    {
        let progressiveDir = hierarchy ? hierarchy : content.hierarchyIndexer
        for(const d of root) { progressiveDir = progressiveDir?.[d] }

        let startIndex = 0;
        for(let i = 0; i < directory.length; i++)
        {
            startIndex++
            if(lastDirectory[i] != directory[i])
            { break; }
        }

        while(container.querySelector("button")) { container.querySelector("button").remove() }

        directory = ['', ...directory]
        for (let i = 0; i < directory.length; i++)
        {
            const dir = directory[i];
            if(i>0) { progressiveDir = progressiveDir?.[dir] }
            if(i<startIndex){continue}

            // Delete if Old
            if(i>directory.length)
            {
                if(parentElement.querySelectorAll(".content-explorer-section")[i])
                { parentElement.querySelectorAll(".content-explorer-section")[i].remove() }
                continue
            }

            // Container
            let container = null;
            if(parentElement.querySelectorAll(".content-explorer-section")[i])
            {
                // Get Container and Clean
                container = parentElement.querySelectorAll(".content-explorer-section")[i];
                while(container.querySelector("button")) { container.querySelector("button").remove() }

                // Remove Old Children
                while(parentElement.querySelectorAll(".content-explorer-section")[i+1]){parentElement.querySelectorAll(".content-explorer-section")[i+1].remove();}

                // Select outline
                for (let index = parentElement.querySelectorAll(".content-explorer-section").length-1; index > i; index--)
                {
                    for(let b of parentElement.querySelectorAll(".content-explorer-section")[index].querySelectorAll("button")){b.removeAttribute("selected")}
                }
            }
            else { container = section.cloneNode(true); parentElement.insertBefore(container, parentElement.lastChild); }

            // Children
            for(const c of Object.keys(progressiveDir).sort((a, b) => a.localeCompare(b)))
            {
                let origins = separated ? progressiveDir[c].origins : progressiveDir[c]

                if(c.slice(c.lastIndexOf('.')+1) == "class" && c.includes('$'))
                { continue; }

                const b = document.createElement("button");

                let span = document.createElement("span");
                span.innerText = c;
                b.appendChild(span);

                let img = document.createElement("img");
                b.insertBefore(img, span);

                // File: list of origins
                if(Array.isArray(origins))
                {
                    if(filters.length > 0 && !origins.find(e => filters.includes(e)))
                    { continue; }

                    const filePath = separated ? progressiveDir[c].location.join('/') : root.concat(directory.slice(1).concat([c])).join('/');

                    const fileSelection = (files, resolveByUI = true) =>
                    {
                        if(filters.length == 0 || files.length == 1) { return files[0] }
                        else if(filters.length > 0)
                        {
                            const avalaibles = files.filter(f => filters.includes(f));

                            if(avalaibles.length == 0) { return null; }
                            else if(avalaibles.length == 1) { return avalaibles[0]; }
                            else if(resolveByUI)
                            {
                                // TODO: selection
                            }

                            return avalaibles[0]
                        }
                        else if(resolveByUI)
                        {
                            // TODO: selection
                        }

                        return files[0]
                    }

                    // Changes Color
                    if(content.modified[filePath])
                    {
                        const s = fileSelection(Object.keys(content.modified[filePath]))
                        if(s && content.modified[filePath][s])
                        {
                            switch(content.modified[filePath][s].type)
                            {
                                case "modify": { span.style.color = '#ffdb3dd1'; break; }
                                case "add": { span.style.color = '#3bf494d1'; break; }
                                case "remove": { span.style.color = '#bb0000d1'; break; }
                            }
                        }
                    }

                    // Logo
                    img.style.scale = '.7'
                    img.style.opacity = '.5'

                    switch(c.slice(c.lastIndexOf('.')+1).toLocaleLowerCase())
                    {
                        case "json": { img.src = 'resources/files/json.png'; break; }
                        case "jpm": { img.src = 'resources/files/json.png'; break; }
                        case "jem": { img.src = 'resources/files/json.png'; break; }
                        case "mcmeta": { img.src = 'resources/files/json.png'; break; }
                        case "java": { img.src = 'resources/files/java.png'; break; }
                        case "class": { img.src = 'resources/files/java.png'; break; }
                        case "toml": { img.src = 'resources/files/toml.png'; break; }
                        case "mf": { img.src = 'resources/files/meta.png'; break; }
                        case "fsh": { img.src = 'resources/files/shader.png'; break; }
                        case "vsh": { img.src = 'resources/files/shader.png'; break; }
                        case "csh": { img.src = 'resources/files/shader.png'; break; }
                        case "nbt": { img.src = 'resources/files/nbt.png'; break; }
                        case "png":
                        {
                            img.src = 'resources/files/image.png';
                            content.get( filePath, fileSelection).then(v =>
                            {
                                if(!v?.value){return}
                                img.src = 'data:image/png;base64,'+v?.value
                            })
                        }
                        default: { img.src = 'resources/file.png'; break; }
                    }

                    b.onclick = async () =>
                    {
                        for(const n of parentElement.querySelectorAll('button[selected]')) { n.removeAttribute('selected') }
                        b.setAttribute("selected", "true")

                        openEditor(await content.get( filePath, fileSelection), () => { span.style.color = '#ffdb3dd1' } )
                    }
                }
                // Directory
                else
                {
                    if(filters.length > 0)
                    {
                        let filtersOk = false;
                        checkChildren(origins)
                        function checkChildren(p)
                        {
                            for(const v of Object.values(p))
                            {
                                const isArr = Array.isArray(v);
                                if(isArr && filters.find(f=>v.includes(f)))
                                { filtersOk = true; return; }
                                else if(!isArr)
                                { checkChildren(v) }
                            }
                        }

                        if(!filtersOk){continue}
                    }

                    img.src = 'resources/folder.png'
                    img.style.scale = '.7'
                    img.style.opacity = '.5'

                    b.onclick = () =>
                    {
                        for(const n of b.parentNode.querySelectorAll('button[selected]')) { n.removeAttribute('selected') }
                        b.setAttribute("selected", "true")
                        displayDirectory( directory.slice(0, i).concat([c]), root, filters, separated, hierarchy)
                    }
                }

                container.appendChild(b)
            }
        }

        directory = directory.slice(1)
        lastDirectory = directory;

        parentElement.scrollTo({left: parentElement.scrollWidth})
    }

    // Build Editor
    let saveEvent = ()=>{}
    function openEditor(file, changeCallback = () => {})
    {
        saveEvent()
        if(!file){return}
        exitEditor();
        for(let [e] of Object.entries(editors)){editors[e].style.display = "none";}
        document.getElementById("editor-container").style.display = "block"
        applyEditor.style.display = "none"

        document.querySelector("#editor-container > #file-metadata > h4 > span:first-of-type").innerText = file.path.slice(0, file.path.lastIndexOf('/')+1)
        document.querySelector("#editor-container > #file-metadata > h4 > span:last-of-type").innerText = file.path.slice(file.path.lastIndexOf('/')+1)
        document.querySelector("#editor-container > #file-metadata > #file-origin-selector").innerHTML = ""
        for(const origin of Object.keys(content.loaded[file.path]))
        {
            const el = document.createElement("option")
            el.value = el.innerText = origin
            document.querySelector("#editor-container > #file-metadata > #file-origin-selector").appendChild(el)
        }
        // #file-origin-selector
        document.querySelector("#editor-container > #file-metadata > #file-origin-selector").value = file.origin

        // Change Origin
        document.querySelector("#editor-container > #file-metadata > #file-origin-selector").onchange = async () =>
        {
            const v = document.querySelector("#editor-container > #file-metadata > #file-origin-selector").value;
            openEditor( await content.get( file.path, () => { return v } ) )
        }

        fileOptButtons[1].disabled = false

        const extension = file.path.slice(file.path.lastIndexOf('.')+1).toLocaleLowerCase()

        let changed = false;
        const ogValue = file.value;
        saveEvent = function()
        {
            if(!changed || ogValue == file.value) { return }
            changed = false;

            if(!textEncoder)
            { var textEncoder = new TextEncoder() }
            const oldBuffer = file.buffer
            file.buffer = textEncoder.encode(file.value)

            if(file.buffer == oldBuffer){return}
            content.set(file.path, file.origin, file.value, file.buffer)

            changeCallback()
        }
        let importEvent = async function(f)
        {
            file.buffer = await f.arrayBuffer();
            file.value = await f.text();
        }

        for(const b of fileOptButtons) { b.style.display = 'none' }

        // Java
        if(["class", "java"].includes(extension))
        {
            editors.codeEditor.style.display = "block";
            fileOptButtons[1].disabled = true

            const setClickableRanges = StateEffect.define();
            const clickableRangesField = StateField.define
            ({
                create: () => [],
                update(ranges, tr)
                {
                    if (tr.docChanged && ranges.length)
                    {
                        ranges = ranges.map(r =>
                        ({
                            ...r,
                            from: tr.changes.mapPos(r.from, 1),
                            to:   tr.changes.mapPos(r.to, -1)
                        })).filter(r => r.from < r.to);
                    }
                    // accept explicit updates
                    for (const e of tr.effects) if (e.is(setClickableRanges)) ranges = e.value;
                    return ranges;
                },
                provide: f => EditorView.decorations.from(f, ranges =>
                    Decoration.set(ranges.map(r => Decoration.mark({ attributes: { "data-clickable-id": r.id }, class: "cm-clickable" }).range(r.from, r.to) ))
                )
            });

            const clickableCallbacks = new Map();

            const ctrlClick = EditorView.domEventHandlers
            ({
                mousedown(e, view)
                {
                    if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return false;
                    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
                    if (pos == null) return false;

                    const ranges = view.state.field(clickableRangesField);
                    const hit = ranges.find(r => pos >= r.from && pos < r.to);
                    if (!hit) return false;

                    e.preventDefault();
                    view.focus();
                    const cb = clickableCallbacks.get(hit.id);
                    if (typeof cb === "function")
                    {
                        try { cb({ view, range: hit, event: e, pos }); }
                        catch (err) { console.error("click handler error", err); }
                    }
                    return true;
                }
            });
            const clickableTheme = EditorView.baseTheme
            ({
                ".cm-clickable": { textDecoration: "underline dotted", cursor: "pointer" },
                ".cm-clickable:hover": { textDecorationStyle: "solid" }
            });

            function setClickableParts(view, ranges = [], callbacks = {})
            {
                const safe = ranges.map(r => ({ id: String(r.id), from: r.from|0, to: r.to|0, meta: r.meta })).filter(r => r.from < r.to);
                Object.entries(callbacks).forEach(([id,fn]) => { if (typeof fn === "function") clickableCallbacks.set(String(id), fn); });
                view.dispatch({ effects: setClickableRanges.of(safe) });
            }

            let editor = new EditorView
            ({
                doc: file.value,
                extensions:
                [
                    basicSetup,
                    java(),
                    editorTheme,
                    oneDark,
                    clickableRangesField,
                    ctrlClick,
                    clickableTheme,
                    indentUnit.of("    "),
                    EditorView.updateListener.of(update =>
                    {
                        if (update.docChanged)
                        {
                            changed = true
                            const doc = update.state.doc;
                            file.value = doc.toString()
                        }
                    }),
                    keymap.of
                    ([
                        { key: "Tab", run: indentMore },
                        { key: "Shift-Tab", run: indentLess }
                    ])
                ],
                parent: editors.codeEditor
            })
 
            let removed = false;
            exitEditor = () => { editor.dom.remove(); removed = true; }

            JavaTree.from(file.value).then(async tree =>
            {
                if(removed){return}

                const parts = []
                await tree.walk(c =>
                {
                    if(c.type == "import_declaration" && c.get("scoped_identifier"))
                    {
                        let identifier = c.get("scoped_identifier");
                        if(!content.indexer[identifier.totalContent.replaceAll('.', '/')+'.class'])
                        { return }
                        parts.push({ id: identifier.totalContent, from: identifier.node.startIndex, to: identifier.node.endIndex })
                    }
                })

                const events = {}
                for(const p of parts)
                {
                    events[p.id] = async ({ view, range }) =>
                    {
                        // view.dispatch({ selection: { anchor: range.from } });
                        openEditor( await content.get( p.id.replaceAll('.', '/')+'.class' ) )

                        p.id.pop()
                        displayDirectory(p.id.split('.'), [])
                    }
                }

                setClickableParts(editor, parts, events);
            });
        }
        // JSON
        else if(["json", 'mcmeta', 'jpm', 'jem'].includes(extension))
        {
            editors.codeEditor.style.display = "block";

            let editor = new EditorView
            ({
                doc: file.value,
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
                            file.value = doc.toString()
                            changed = true
                        }
                    }),
                    keymap.of
                    ([
                        { key: "Tab", run: indentMore },
                        { key: "Shift-Tab", run: indentLess }
                    ])
                ],
                parent: editors.codeEditor
            })

            exitEditor = () => { editor.dom.remove(); }
        }
        // TOML
        else if(['toml'].includes(extension))
        {
            editors.codeEditor.style.display = "block";

            let editor = new EditorView
            ({
                doc: file.value,
                extensions:
                [
                    basicSetup,
                    StreamLanguage.define(toml),
                    editorTheme,
                    oneDark,
                    indentUnit.of("    "),
                    EditorView.updateListener.of(update =>
                    {
                        if (update.docChanged)
                        {
                            const doc = update.state.doc;
                            file.value = doc.toString()
                            changed = true
                        }
                    }),
                    keymap.of
                    ([
                        { key: "Tab", run: indentMore },
                        { key: "Shift-Tab", run: indentLess }
                    ])
                ],
                parent: editors.codeEditor
            })

            exitEditor = () => { editor.dom.remove(); }
        }
        // PNG
        else if(['png'].includes(extension))
        {
            let moving = false;
            editors.imgEditor.style.display = "block";

            // Image
            let canvas = document.getElementById("image-editor").querySelector("canvas")
            let ctx = canvas.getContext('2d');

            exitEditor = () => { editors.imgEditor.style.display = "none"; moving = false; canvas.style.scale = '1'; }

            saveEvent = () =>
            {
                if(!changed) { return }
                changed = false;

                const buffer = new Frame(canvas, ["png"], 1).toBuffer();

                if(file.buffer == buffer){return}

                const newDataURL = bufferToDataURL(buffer)
                if(newDataURL == file.value){return}

                file.value = bufferToDataURL(buffer);
                file.buffer = buffer

                content.set(file.path, file.origin, file.value, file.buffer)
                changeCallback()
            }

            importEvent = async function(f)
            {
                const buffer = await f.arrayBuffer();
                file.buffer = buffer;
                file.value = bufferToDataURL(buffer);
            }

            let img = new Image;
            img.onload = (i) =>
            {
                canvas.width = img.width
                canvas.height = img.height
                if(canvas.width * editors.imgEditor.getBoundingClientRect().height < canvas.height * editors.imgEditor.getBoundingClientRect().width) { canvas.style.height = "calc(80% - 32px)"; canvas.style.width = "unset"; }
                else { canvas.style.width = "calc(80% - 32px)"; canvas.style.height = "unset"; }
                ctx.drawImage(img, 0, 0);

                canvas.style.translate = `-${canvas.getBoundingClientRect().width/2}px -${editors.imgEditor.getBoundingClientRect().height/2-canvas.getBoundingClientRect().height/2}px`
            }
            img.src = "data:image/png;base64,"+file.value;

            // Utilies
            function bufferToDataURL(buffer)
            {
                let binary = "";
                const bytes = new Uint8Array(buffer);

                for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }

                const base64 = btoa(binary);
                return base64
            }
            function dataURLToUint8Array(dataURL)
            {
                const [meta, base64] = dataURL.split(',');
                const binary = atob(base64);
                const len = binary.length;
                const bytes = new Uint8Array(len);

                for (let i = 0; i < len; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }

                return bytes;
            }
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

            // Zoom
            let onMoveCanvas = null
            document.getElementById("image-editor").onwheel = (event) =>
            {
                const f = 1+event.deltaY/2500;
                // canvas.style.scale = Number((isNaN(Number(canvas.style.scale)) || Number(canvas.style.scale) == 0)?1:canvas.style.scale)*f;
                // if(Number(canvas.style.scale) <= 0.1) { canvas.style.scale = "0.1" }

                const oldRect = canvas.getBoundingClientRect()

                const width = oldRect.width * f;
                const height = oldRect.height * f;

                canvas.style.width  = `${width}px`;
                canvas.style.height = `${height}px`;
                canvas.style.translate = (Number(canvas.style.translate.replaceAll("px","").split(" ")[0]) - (width  - oldRect.width)  / 2) + "px " + ((Number(canvas.style.translate.replaceAll("px","").split(" ")[1])?Number(canvas.style.translate.replaceAll("px","").split(" ")[1]):0) - (height - oldRect.height) / 2) + "px";

                if(onMoveCanvas) {onMoveCanvas()}
            }
            document.getElementById("image-editor").onmousedown = (event) => { if(event.button == 1){moving=true;} }

            // Mouse
            let lastPos = null;
            window.addEventListener("mouseup", (event) => { if(event.button == 1){moving=false;lastPos = null;} })
            window.addEventListener("mousemove", (event) =>
            {
                if(!moving){return;}
                if(lastPos == null) { lastPos = {x: event.clientX, y: event.clientY} }
                else
                {
                    if(!canvas.style.translate.replaceAll("px","").split(" ")[0] || !canvas.style.translate.replaceAll("px","").split(" ")[1]){canvas.style.translate = `-${canvas.getBoundingClientRect().width/2}px -${editors.imgEditor.getBoundingClientRect().height/2-canvas.getBoundingClientRect().height/2}px`}
                    canvas.style.translate = (Number(canvas.style.translate.replaceAll("px","").split(" ")[0])+(event.clientX-lastPos.x)*1.5) + "px " + ((Number(canvas.style.translate.replaceAll("px","").split(" ")[1])?Number(canvas.style.translate.replaceAll("px","").split(" ")[1]):0)+(event.clientY-lastPos.y)*1.5) + "px";
                    lastPos = {x: event.clientX, y: event.clientY}

                    if(onMoveCanvas) {onMoveCanvas()}
                }
            })

            initializeDrawer(document.getElementById("content-image-canvas"));
            function initializeDrawer(canvas)
            {
                let id = 0;

                var ctx = canvas.getContext("2d");

                // Tool Selection
                const buttonContainer = document.getElementById("image-editor").querySelector("div:last-child");
                let buttons = buttonContainer.querySelectorAll("button");

                if(!Drawers[id])
                {
                    Drawers[id] = {};
                    Drawers[id].size = 1;
                    Drawers[id].color = buttonContainer.querySelector("input").value;
                    Drawers[id].toolId = 0;
                    Drawers[id].alphaLock = false;
                    Drawers[id].onBack = false;
                    Drawers[id].hue = false;
                }
                Drawers[id].canvas = canvas;

                // Tools
                Drawers[id].selectTool = function(element)
                {
                    var toolId = Array.from(buttons).indexOf(element);

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
                buttonContainer.querySelector("input").onchange = (e) => {Drawers[id].color = e.target.value; buttons[2].style.backgroundColor = e.target.value};
                for (let index = 0; index < buttons.length; index++)
                {
                    const element = buttons[index];

                    element.onclick = (e) => Drawers[id].selectTool(e.currentTarget);
                }

                Drawers[id].selectTool(buttons[0]);

                // Slider
                document.getElementById("image-editor").querySelector("input[type='range']").oninput = (event) =>
                {
                    Drawers[id].size = event.currentTarget.value;
                };

                // Draw on Canvas
                const oldCanvas = [];
                ctx.imageSmoothingEnabled= false;

                var press = false;
                canvas.onmousemove = (e) => {drawEvent(e)};
                canvas.onmousedown = (e) => {if(e.button != 0){return} drawEvent(e); press = true;};
                const drawEvent = function(event)
                {
                    if(event.button != 0){return}
                    var rect = event.target.getBoundingClientRect();

                    var x = Math.round(((event.clientX - rect.left)/canvas.getBoundingClientRect().width)*canvas.width - 0.5);
                    var y = Math.round(((event.clientY - rect.top)/canvas.getBoundingClientRect().height)*canvas.height - 0.5);

                    if(Drawers[id].toolId == -1){ return }

                    const r = Math.floor(Drawers[id].size / 2);
                    for (let dx = -r; dx <= r; dx++)
                    {
                        for (let dy = -r; dy <= r; dy++)
                        {
                            if(dx * dx + dy * dy <= r * r)
                            {
                                drawPixel(x + dx, y + dy);
                            }
                        }
                    }
                    // switch(Number(Drawers[id].size))
                    // {
                    //     case 1: drawPixel(x, y); break;
                    //     case 2: drawPixel(x, y);drawPixel(x-1, y);drawPixel(x, y-1);drawPixel(x+1, y);drawPixel(x, y+1); break;
                    //     case 3: drawPixel(x, y);drawPixel(x-1, y);drawPixel(x-1, y-1);drawPixel(x, y-1);drawPixel(x+1, y);drawPixel(x+1, y+1);drawPixel(x-1, y+1);drawPixel(x+1, y-1);drawPixel(x, y+1); break;
                    //     case 4: drawPixel(x, y);drawPixel(x-1, y);drawPixel(x-1, y-1);drawPixel(x, y-1);drawPixel(x+1, y);drawPixel(x+1, y+1);drawPixel(x-1, y+1);drawPixel(x+1, y-1);drawPixel(x, y+1); 
                    //     drawPixel(x-2, y);drawPixel(x, y-2);drawPixel(x+2, y);drawPixel(x, y+2);break;
                    //     case 5: drawPixel(x, y);drawPixel(x-1, y);drawPixel(x-1, y-1);drawPixel(x, y-1);drawPixel(x+1, y);drawPixel(x+1, y+1);drawPixel(x-1, y+1);drawPixel(x+1, y-1);drawPixel(x, y+1);
                    //     drawPixel(x-2, y);drawPixel(x-2, y-2);drawPixel(x, y-2);drawPixel(x+2, y);drawPixel(x+2, y+2);drawPixel(x-2, y+2);drawPixel(x+2, y-2);drawPixel(x, y+2); break;
                    // }

                    changed = true;

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
                canvas.onclick = (event) =>
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
                };
                window.onmouseup = async function(event) { press = false; oldCanvas.push(await canvas.toDataURL()); }

                // Control Z
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

                        if(!img.src || img.src == "") { return }

                        img.onload = () => {ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);};
                    }
                };

                // Reinit
                fileOptButtons[3].onclick = () =>
                {
                    let img = new Image;
                    img.onload = () => { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);};
                    img.src = "data:image/png;base64," + content.loaded[file.path][file.origin].value
                }

                // Preview OG
                const ogEl = document.createElement("img")
                ogEl.src = "data:image/png;base64," + content.loaded[file.path][file.origin].value
                ctx.canvas.parentElement.insertBefore(ogEl, ctx.canvas.parentElement.querySelector("div"));
                function resizeCopy()
                {
                    ctx.canvas.style.width = ogEl.style.width = ctx.canvas.getBoundingClientRect().width + 'px'
                    ctx.canvas.style.height = ogEl.style.height = ctx.canvas.getBoundingClientRect().height + 'px'
                    ogEl.style.translate = ctx.canvas.style.translate
                    ctx.canvas.style.scale = ogEl.style.scale = '1'

                    // ogEl.style.translate = `${Number(ogEl.style.translate.split(" ")[0].slice(0, ogEl.style.translate.split(" ")[0].length-2)) - ogEl.getBoundingClientRect().width}px ${ogEl.style.translate.split(" ")[1]}`
                }
                const observer = new MutationObserver(() => resizeCopy)
                observer.observe(ctx.canvas, {attributes: true})

                onMoveCanvas = resizeCopy

                ogEl.style.display = 'none'
                fileOptButtons[2].onclick = () =>
                {
                    ogEl.style.display = ogEl.style.display == 'none' ? 'block' : 'none'
                    resizeCopy()
                }
            }
        }
        // NBT
        else if(['nbt'].includes(extension))
        {
            document.querySelector("#editor-container #three-editor").style.display = "block"
            document.activeElement.blur();

            // 3D Editor
            function setupViewport()
            {
                setupThree(content).then(async () =>
                {
                    // Nbt File Importation
                    threeSetup.mcWorld.clearAll()
                    await threeSetup.mcWorld.importStructure(file.value.simplified, 0, 0, 0);

                    // Player Position
                    threeSetup.player.body.setTranslation(new RAPIER.Vector3(-1, 1, -1))
                    threeSetup.mainCamera.rotation.setFromVector3(new THREE.Vector3(0, Math.PI*1.25, 0))

                    for (let i = 0; i < 9; i++)
                    {
                        const id = file.value.simplified.palette?.[i]?.Name
                        if(!id) { continue }
                        await threeSetup.player.gui.setSlot(i, id, threeSetup.renderer)
                    }

                    // Save
                    saveEvent = async () =>
                    {
                        if(!changed) { return }
                        changed = false;

                        file.value.raw = threeSetup.mcWorld.toStructureNbt()
                        const oldBuffer = file.buffer
                        file.buffer = await ipcInvoke("rawNbtToBuffer", file.value.raw)
                        if(file.buffer == oldBuffer) { return }
                        content.set(file.path, file.origin, file.value, file.buffer)
                        changeCallback()
                    }
                })
            }
            setupViewport()

            fileOptButtons[7].style.display = fileOptButtons[8].style.display = "block"
            fileOptButtons[5].style.display = fileOptButtons[6].style.display = "block"

            // In-Game Editor
            document.querySelector("#editor-container > #file-metadata > div > div:nth-child(2) > button:last-of-type").onclick = async () =>
            {
                nbtEditorIndex++;
                if(!nbtEditorOpened)
                {
                    nbtEditorOpened = true;
                    await ipcInvoke("addEditionWorld", window.instance.name);
                    await launch(
                        window.instance.name,
                        {
                            log: (t, c) => {},
                            close: async c =>
                            {
                                closeEditor();
                                
                                nbtEditorOpened = false;
                                fileOptButtons[7].disabled = fileOptButtons[8].disabled = true

                                ipcInvoke('deleteFolder', 'Modpack\ Maker'+sep()+'instances'+sep()+window.instance.name+sep()+'minecraft'+sep()+'saves'+sep()+'.Structure Edition'+sep());
                            },
                            network: (i, c) => {},
                            windowOpen: async (w, i) => {},
                        },
                        {type: "singleplayer", identifier: ".Structure Edition"}
                    )

                    // document.querySelector("#editor-container > #file-metadata > div > div:nth-child(3) > button:first-of-type")
                    fileOptButtons[7].disabled = fileOptButtons[8].disabled = false

                    // editors.nbtEditor.querySelectorAll("div > button")[0].innerText = "Minecraft launched"
                    // editors.nbtEditor.querySelectorAll("div > button")[0].disabled = true
                    // editors.nbtEditor.querySelectorAll(":scope > button")[0].style.display = "block"
                    // editors.nbtEditor.querySelectorAll("p")[0].style.opacity = '0.8';
                    // editors.nbtEditor.querySelectorAll("p")[0].innerHTML = `<br>Minecraft is opened. The current structure is <span style="color=#fff">${filename}</span>.<br>To load it put "<span onclick="navigator.clipboard.writeText('${'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)}')" style="cursor:pointer;text-decoration: underline">${'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)}</span>" (click to copy) as structure name in the structure block and press "LOAD" twice.<br>To save it, in the structure block set "Load Mode" to "Save" and press "SAVE".<br>(Userful command to clear: <span style:"backgroundColor: #000">/fill 0 1 0 16 16 16 air</span>)<br>You must save the structure via the structure block before saving it into the mod.<br>`
                }

                ipcInvoke('writeBuffer', 'Modpack\ Maker'+sep()+'instances'+sep()+window.instance.name+sep()+'minecraft'+sep()+'saves'+sep()+'.Structure Edition'+sep()+'generated'+sep()+'minecraft'+sep()+'structures'+sep()+'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)+'.nbt', await ipcInvoke("rawNbtToBuffer", threeSetup.mcWorld.toStructureNbt()));
                // editors.nbtEditor.querySelectorAll("p")[0].innerHTML = `<br>Minecraft is opened. The current structure is <span style="color=#fff">${filename}</span>.<br>To load it put "<span onclick="navigator.clipboard.writeText('${'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)}')" style="cursor:pointer;text-decoration: underline">${'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)}</span>" (click to copy) as structure name in the structure block and press "LOAD" twice.<br>To save it, in the structure block set "Load Mode" to "Save" and press "SAVE".<br>(Userful command to clear: <span style:"backgroundColor: #000">/fill 0 1 0 16 16 16 air</span>)<br>You must save the structure via the structure block before saving it into the mod.<br>`
            }
            // Export to Game
            fileOptButtons[7].onclick = async () =>
            {
                nbtEditorIndex++;
                ipcInvoke('writeBuffer', 'Modpack\ Maker'+sep()+'instances'+sep()+window.instance.name+sep()+'minecraft'+sep()+'saves'+sep()+'.Structure Edition'+sep()+'generated'+sep()+'minecraft'+sep()+'structures'+sep()+'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)+'.nbt', await ipcInvoke("rawNbtToBuffer", threeSetup.mcWorld.toStructureNbt()));
            }
            // Import from Game
            fileOptButtons[8].onclick = async () =>
            {
                // Save
                file.buffer = await ipcInvoke("readRawFile", 'Modpack\ Maker'+sep()+'instances'+sep()+window.instance.name+sep()+'minecraft'+sep()+'saves'+sep()+'.Structure Edition'+sep()+'generated'+sep()+'minecraft'+sep()+'structures'+sep()+'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)+'.nbt')
                file.value = await ipcInvoke("parseBuffer", file.buffer, file.path, null, null)

                content.set(file.path, file.origin, file.value, file.buffer)
                changeCallback()

                setupViewport()
            }
        }
        // Default: Text
        else if(file?.value)
        {
            editors.codeEditor.style.display = "block";

            let editor = new EditorView
            ({
                doc: file.value,
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
                            file.value = doc.toString()

                            changed = true
                        }
                    }),
                    keymap.of
                    ([
                        { key: "Tab", run: indentMore },
                        { key: "Shift-Tab", run: indentLess }
                    ])
                ],
                parent: editors.codeEditor
            })

            exitEditor = () => { editor.dom.remove(); }
        }

        // Import
        fileOptButtons[1].onclick = () =>
        {
            importFileInput.click();
            importFileInput.onchange = async () =>
            {
                await importEvent(importFileInput.files[0])
                // Reload without save
                openEditor(file)
            }
        }

        // // Save
        // saveFileButton.onclick = saveEvent

        // Export
        fileOptButtons[0].onclick = async () =>
        {
            await ipcInvoke("downloadBuffer", file.buffer, file.path.slice(file.path.lastIndexOf('/')+1))
        }

        fileOptButtons[0].style.display = fileOptButtons[1].style.display = 'block'
        fileOptButtons[2].style.display = fileOptButtons[3].style.display = 'block'
    }

    window.contentExplorer =
    {
        // All
        allContent: () =>
        {
            document.getElementById("content-explorer").style.display = 'flex';
            document.querySelector("#content-explorer > #pack-selector").style.display = 'none';

            // Cleanup
            while(document.querySelectorAll("#content-explorer>#pack-selector > button").length > 0)
            { document.querySelectorAll("#content-explorer>#pack-selector > button")[document.querySelectorAll("#content-explorer>#pack-selector > button").length-1].remove() }

            clean()

            displayDirectory([], [])
        },

        // Content Elements
        contentElements: () =>
        {
            document.getElementById("content-explorer").style.display = 'flex';
            document.querySelector("#content-explorer > #pack-selector").style.display = 'block';
            document.querySelector("#content-explorer > #pack-selector > h4:first-of-type").innerText = "Mods"
            document.querySelector("#content-explorer > #pack-selector > h4:last-of-type").innerText = "Resourcepacks"
            document.querySelectorAll("#content-explorer>#pack-selector > h4")[0].style.display =
            document.querySelectorAll("#content-explorer>#pack-selector > h4")[1].style.display = 'block';
            document.getElementById("pack-selector").style.display = 'block';
            document.getElementById("pack-selector").style.width = '12em';

            // Cleanup
            while(document.querySelectorAll("#content-explorer>#pack-selector > button").length > 0)
            { document.querySelectorAll("#content-explorer>#pack-selector > button")[document.querySelectorAll("#content-explorer>#pack-selector > button").length-1].remove() }

            for(const k of Object.keys(content.elements))
            {
                if(k.startsWith('versions/'))
                {
                    const b = document.createElement("button")
                    b.innerText = "Vanilla "+k.split('/')[1]
                    document.querySelector("#content-explorer > #pack-selector").insertBefore(b, document.querySelector("#content-explorer > #pack-selector").firstChild)
                    b.onclick = () => { displayDirectory([], [], [k]) }
                }
                else if(k.startsWith('mods/'))
                {
                    const b = document.createElement("button")
                    b.style.textOverflow = 'clip'

                    const filename = document.createElement("span")
                    filename.innerText = k;
                    filename.style.opacity = '.5'
                    filename.style.fontSize = '.7em'
                    filename.style.whiteSpace = 'nowrap'

                    const title = document.createElement("span")
                    const meta = window.instance.mods.find(m=>m.filename==k.slice(k.lastIndexOf('/')+1, k.lastIndexOf('.')));
                    title.innerText = meta?.title || k.slice(k.lastIndexOf('/')+1, k.lastIndexOf('.'))

                    if(meta?.icon)
                    {
                        b.style.display = 'flex'

                        const img = document.createElement('img');
                        img.src = meta.icon
                        img.style.height = '2em'
                        img.style.marginRight = '.5em'

                        b.appendChild(img)

                        const textParent = document.createElement('div')
                        textParent.style.width = 'calc(100% - 2.5em)';
                        textParent.appendChild(filename)
                        textParent.appendChild(document.createElement('br'))
                        textParent.appendChild(title)
                        b.appendChild(textParent)
                    }
                    else
                    {
                        b.appendChild(filename)
                        b.appendChild(document.createElement('br'))
                        b.appendChild(title)
                    }

                    document.querySelector("#content-explorer > #pack-selector").insertBefore(b, document.querySelector("#content-explorer > #pack-selector > h4:last-of-type"))
                    b.onclick = () => { displayDirectory([], [], [k]) }
                }
                else if(k.startsWith('resourcepacks/'))
                {
                    const b = document.createElement("button")
                    b.style.textOverflow = 'clip'

                    const filename = document.createElement("span")
                    filename.innerText = k;
                    filename.style.opacity = '.5'
                    filename.style.fontSize = '.7em'
                    filename.style.whiteSpace = 'nowrap'

                    const title = document.createElement("span")
                    const meta = window.instance.rp.find(m=>m.filename==k.slice(k.lastIndexOf('/')+1, k.lastIndexOf('.')));
                    title.innerText = meta?.title || k.slice(k.lastIndexOf('/')+1, k.lastIndexOf('.'))

                    if(meta?.icon)
                    {
                        b.style.display = 'flex'

                        const img = document.createElement('img');
                        img.src = meta.icon
                        img.style.height = '2em'
                        img.style.marginRight = '.5em'

                        b.appendChild(img)

                        const textParent = document.createElement('div')
                        textParent.style.width = 'calc(100% - 2.5em)';
                        textParent.appendChild(filename)
                        textParent.appendChild(document.createElement('br'))
                        textParent.appendChild(title)
                        b.appendChild(textParent)
                    }
                    else
                    {
                        b.appendChild(filename)
                        b.appendChild(document.createElement('br'))
                        b.appendChild(title)
                    }

                    document.querySelector("#content-explorer > #pack-selector").insertBefore(b, document.querySelector("#content-explorer > #pack-selector").lastChild)
                    b.onclick = () => { displayDirectory([], [], [k]) }
                }
            }

            clean()
        },

        // Asset Selection
        // assets: () =>
        // {
        //     document.getElementById("content-explorer").style.display = 'flex';
        //     document.querySelector("#content-explorer > #pack-selector").style.display = 'block';
        //     document.querySelector("#content-explorer > #pack-selector > h4:first-of-type").innerText = "Resourcepacks"
        //     document.querySelector("#content-explorer > #pack-selector > h4:last-of-type").innerText = "Built-In Packs"
        //     document.querySelectorAll("#content-explorer>#pack-selector > h4")[0].style.display =
        //     document.querySelectorAll("#content-explorer>#pack-selector > h4")[1].style.display = 'block';
        //     document.getElementById("pack-selector").style.display = 'block';
        //     document.getElementById("pack-selector").style.width = '8em';

        //     // Cleanup
        //     while(document.querySelectorAll("#content-explorer>#pack-selector > button").length > 0)
        //     { document.querySelectorAll("#content-explorer>#pack-selector > button")[document.querySelectorAll("#content-explorer>#pack-selector > button").length-1].remove() }

        //     // Built-in
        //     {
        //         const b = document.createElement("button")
        //         b.innerText = "Built-In"
        //         document.querySelector("#content-explorer > #pack-selector").insertBefore(b, document.querySelector("#content-explorer > #pack-selector").firstChild)
        //         b.onclick = () =>
        //         { displayDirectory([], ['assets']) }
        //     }
        //     // Resourcepacks
        //     for(const k of Object.keys(content.elements))
        //     {
        //         if(k.startsWith('resourcepacks/'))
        //         {
        //             const b = document.createElement("button")
        //             b.innerText = k.slice(14)
        //             document.querySelector("#content-explorer > #pack-selector").insertBefore(b, document.querySelector("#content-explorer > #pack-selector > h4:last-of-type"))
        //             b.onclick = () => { displayDirectory([], ['assets'], [k]) }
        //         }
        //     }
        //     // Packs
        //     if(content.hierarchyIndexer.packs)
        //     {
        //         for(const k of Object.keys(content.hierarchyIndexer.packs))
        //         {
        //             if(!content.hierarchyIndexer.packs?.[k]?.assets) { continue }

        //             const b = document.createElement("button")
        //             b.innerText = k
        //             document.querySelector("#content-explorer > #pack-selector").insertBefore(b, document.querySelector("#content-explorer > #pack-selector").lastChild)
        //             b.onclick = () => { displayDirectory([], ['packs', k, 'assets']) }
        //         }
        //     }
        //     // Programmer Art
        //     if(content.hierarchyIndexer.programmer_art)
        //     {
        //         const b = document.createElement("button")
        //         b.innerText = "Programmer Art"
        //         document.querySelector("#content-explorer > #pack-selector").insertBefore(b, document.querySelector("#content-explorer > #pack-selector").lastChild)
        //         b.onclick = () => { displayDirectory([], ['programmer_art', 'assets']) }
        //     }

        //     clean()
        // },
        assets: () =>
        {
            document.getElementById("content-explorer").style.display = 'flex';
            document.querySelector("#content-explorer > #pack-selector").style.display = 'none';

            // Cleanup
            while(document.querySelectorAll("#content-explorer>#pack-selector > button").length > 0)
            { document.querySelectorAll("#content-explorer>#pack-selector > button")[document.querySelectorAll("#content-explorer>#pack-selector > button").length-1].remove() }

            clean()

            const combined = {}
            for(const assetContainer of Object.keys(content.hierarchyIndexer.assets))
            {
                walk(content.hierarchyIndexer.assets[assetContainer], [])
                function walk(parent, path = [])
                {
                    let subObject = getProp(combined, path);
                    if(!subObject) { subObject = {}; if(path.length > 0) { setProp(combined, path, subObject) } }

                    for(const [k, c] of Object.entries(parent))
                    {
                        if(Array.isArray(c))
                        {
                            subObject[k] = {origins: c, location: ['assets', assetContainer, ...path, k]}
                        }
                        else if(typeof c == "object")
                        {
                            walk(c, path.concat([k]))
                        }
                    }

                    if(path.length == 0) { return }
                    setProp(combined, path, subObject)
                }
            }


            displayDirectory([], [], [], true, combined)
        },

        // Data Selection
        // data: () =>
        // {
        //     document.getElementById("content-explorer").style.display = 'flex';
        //     document.querySelector("#content-explorer > #pack-selector").style.display = 'block';
        //     document.querySelector("#content-explorer > #pack-selector > h4:first-of-type").innerText = "Resourcepacks"
        //     document.querySelector("#content-explorer > #pack-selector > h4:last-of-type").innerText = "Built-In Packs"
        //     document.querySelectorAll("#content-explorer>#pack-selector > h4")[0].style.display =
        //     document.querySelectorAll("#content-explorer>#pack-selector > h4")[1].style.display = 'block';
        //     document.getElementById("pack-selector").style.display = 'block';
        //     document.getElementById("pack-selector").style.width = '8em';

        //     // Cleanup
        //     while(document.querySelectorAll("#content-explorer>#pack-selector > button").length > 0)
        //     { document.querySelectorAll("#content-explorer>#pack-selector > button")[document.querySelectorAll("#content-explorer>#pack-selector > button").length-1].remove() }

        //     // Built-in
        //     {
        //         const b = document.createElement("button")
        //         b.innerText = "Built-In"
        //         document.querySelector("#content-explorer > #pack-selector").insertBefore(b, document.querySelector("#content-explorer > #pack-selector").firstChild)
        //         b.onclick = () =>
        //         { displayDirectory([], ['data']) }
        //     }
        //     // Packs
        //     if(content.hierarchyIndexer.packs)
        //     {
        //         for(const k of Object.keys(content.hierarchyIndexer.packs))
        //         {
        //             if(!content.hierarchyIndexer.packs?.[k]?.data) { continue }

        //             const b = document.createElement("button")
        //             b.innerText = k
        //             document.querySelector("#content-explorer > #pack-selector").insertBefore(b, document.querySelector("#content-explorer > #pack-selector").lastChild)
        //             b.onclick = () => { displayDirectory([], ['packs', k, 'data']) }
        //         }
        //     }

        //     clean()
        // },
        data: () =>
        {
            document.getElementById("content-explorer").style.display = 'flex';
            document.querySelector("#content-explorer > #pack-selector").style.display = 'none';

            // Cleanup
            while(document.querySelectorAll("#content-explorer>#pack-selector > button").length > 0)
            { document.querySelectorAll("#content-explorer>#pack-selector > button")[document.querySelectorAll("#content-explorer>#pack-selector > button").length-1].remove() }

            clean()

            const combined = {}
            for(const assetContainer of Object.keys(content.hierarchyIndexer.data))
            {
                walk(content.hierarchyIndexer.data[assetContainer], [])
                function walk(parent, path = [])
                {
                    let subObject = getProp(combined, path);
                    if(!subObject) { subObject = {}; if(path.length > 0) { setProp(combined, path, subObject) } }

                    for(const [k, c] of Object.entries(parent))
                    {
                        if(Array.isArray(c))
                        {
                            subObject[k] = {origins: c, location: ['data', assetContainer, ...path, k]}
                        }
                        else if(typeof c == "object")
                        {
                            walk(c, path.concat([k]))
                        }
                    }

                    if(path.length == 0) { return }
                    setProp(combined, path, subObject)
                }
            }

            displayDirectory([], [], [], true, combined)
        },

        // Soure code Selection
        sourceCode: () =>
        {
            document.getElementById("content-explorer").style.display = 'flex';
            document.querySelector("#content-explorer > #pack-selector").style.display = 'block';
            document.getElementById("pack-selector").style.display = 'block';
            document.getElementById("pack-selector").style.width = '16em';

            // Cleanup
            while(document.querySelectorAll("#content-explorer>#pack-selector > button").length > 0)
            { document.querySelectorAll("#content-explorer>#pack-selector > button")[document.querySelectorAll("#content-explorer>#pack-selector > button").length-1].remove() }

            for(const k of Object.keys(content.hierarchyIndexer))
            {
                if(['programmer_art', 'packs', 'assets', 'data', 'META-INF'].includes(k) || Array.isArray(content.hierarchyIndexer[k]))
                { continue }

                for(const key of Object.keys(content.hierarchyIndexer[k]))
                {
                    console.log(Array.isArray(content.hierarchyIndexer[k][key]))
                    if(Array.isArray(content.hierarchyIndexer[k][key]))
                    { continue }

                    const subValues = Object.values(content.hierarchyIndexer[k][key]);
                    if(subValues.find(v=>Array.isArray(v)))
                    {
                        const b = document.createElement("button")

                        const prefix = document.createElement("span")
                        prefix.innerText = k+'.';
                        prefix.style.opacity = '.5'
                        prefix.style.fontSize = '.7em'

                        const id = document.createElement("span")
                        id.innerText = key;

                        b.appendChild(prefix)
                        b.appendChild(id)

                        document.querySelector("#content-explorer > #pack-selector").insertBefore(b, document.querySelector("#content-explorer > #pack-selector").lastChild)

                        b.onclick = () => { displayDirectory([], [k, key]) }
                        continue;
                    }

                    for(const id of Object.keys(content.hierarchyIndexer[k][key]))
                    {
                        if(Array.isArray(content.hierarchyIndexer[k][key]))
                        { continue }

                        const b = document.createElement("button")

                        const prefix = document.createElement("span")
                        prefix.innerText = k+'.';
                        prefix.style.opacity = '.5'
                        prefix.style.fontSize = '.7em'

                        const author = document.createElement("span")
                        author.innerText = key+'.';
                        author.style.opacity = '.7'
                        author.style.fontSize = '.9em'

                        const idEl = document.createElement("span")
                        idEl.innerText = id;

                        b.appendChild(prefix)
                        b.appendChild(author)
                        b.appendChild(idEl)

                        document.querySelector("#content-explorer > #pack-selector").insertBefore(b, document.querySelector("#content-explorer > #pack-selector").lastChild)
                        b.onclick = () => { displayDirectory([], [k, key, id]) }
                    }
                }
            }

            document.querySelectorAll("#content-explorer>#pack-selector > h4")[0].style.display =
            document.querySelectorAll("#content-explorer>#pack-selector > h4")[1].style.display = 'none';

            clean()
        }
    }

    // Tabs
    document.querySelector("#content-editor > .tab > #content-listing-selection").onmousedown = (ev) =>
    {
        if(document.querySelector("#content-editor > .tab > #content-listing-selection").getAttribute("current") != "true")
        {
            document.querySelector("#content-editor > .tab > button").setAttribute("current", "false")
            document.querySelector("#content-editor > .tab > #content-listing-selection").setAttribute("current", "true")
            window.contentExplorer[document.querySelector("#content-editor > .tab > #content-listing-selection").value]()
            applyEditor.style.display = "none"
            ev.preventDefault()
        }
    }
    document.querySelector("#content-editor > .tab > #content-listing-selection").onchange = (ev) =>
    {
        applyEditor.style.display = "none"

        document.querySelector("#content-editor > .tab > button").setAttribute("current", "false")
        document.querySelector("#content-editor > .tab > #content-listing-selection").setAttribute("current", "true")

        if(window.contentExplorer?.[document.querySelector("#content-editor > .tab > #content-listing-selection").value])
        { window.contentExplorer[document.querySelector("#content-editor > .tab > #content-listing-selection").value]() }
    }

    document.querySelector("#content-editor > .tab > button").onclick = () =>
    {
        document.getElementById("editor-container").style.display = "none"
        document.getElementById("content-explorer").style.display = "none"

        document.querySelector("#content-editor > .tab > button").setAttribute("current", "true")
        document.querySelector("#content-editor > .tab > #content-listing-selection").setAttribute("current", "false")

        openApplier()
    }

    // Apply Editor
    function openApplier()
    {
        applyEditor.style.display = "block"
        applyEditor.innerHTML = '';

        for(const element of Object.keys(content.elements))
        {
            const confirmed = []

            const el = document.createElement("div")

            const header = document.createElement("div"); el.appendChild(header);
            const icon = document.createElement("img")
            header.appendChild(icon)
            const title = document.createElement("h4");
            title.innerText = element
            header.appendChild(title)

            const contentEl = document.createElement("div"); el.appendChild(contentEl);

            const actions = document.createElement("div"); el.appendChild(actions);
            const applyAll = document.createElement("button");
            applyAll.innerText = "Apply"
            actions.appendChild(applyAll)
            const confirmAll = document.createElement("button");
            confirmAll.innerText = "Confirm All"
            actions.appendChild(confirmAll)
            const reverseAll = document.createElement("button");
            reverseAll.innerText = "Reverse All"
            actions.appendChild(reverseAll)

            const entries = Object.entries(content.modified).filter(([, v]) => v[element]);
            if(entries.length == 0) { continue }

            for(const [k] of entries)
            {
                const el = document.createElement("div")
                el.appendChild(document.createElement("p"))
                el.appendChild(document.createElement("button"))
                el.appendChild(document.createElement("button"))

                el.querySelector('p').innerText = k
                el.querySelector("button:first-of-type").setAttribute('soft-hover-info', 'Confirm')
                el.querySelector("button:last-of-type").setAttribute('soft-hover-info', 'Revert')

                // Confirm
                let isConfirmed = false
                el.ondblclick = el.querySelector("button:first-of-type").onclick = () =>
                {
                    if(!isConfirmed)
                    {
                        isConfirmed = true;
                        confirmed.push
                        ({
                            location: k,
                            buffer: content.modified[k][element].buffer,
                            type: content.modified[k][element].type
                        })
                        el.setAttribute('selected', '')
                    }
                    else
                    {
                        isConfirmed = false;
                        const index = confirmed.findIndex(c=>c.origin==element&&c.location==k)
                        if(index >= 0) { confirmed.splice(index) }
                        el.removeAttribute('selected')
                    }
                }
                // Revert
                el.querySelector("button:last-of-type").onclick = () =>
                {
                    content.modified[k][element] = undefined
                    delete content.modified[k][element]
                    content.loaded[k][element] = undefined
                    delete content.loaded[k][element]
                    el.remove()
                }

                contentEl.appendChild(el)
            }

            // Apply All
            applyAll.onclick = () =>
            {
                content.write(element, confirmed)
            }

            // Confirm All
            confirmAll.onclick = () =>
            {
                for(const el of contentEl.querySelectorAll("button:not([selected])"))
                {
                    el.onclick()
                }
            }

            // Reverse All
            reverseAll.onclick = () =>
            {
                for(const [k] of entries)
                {
                    const index = confirmed.findIndex(c=>c.origin==element&&c.location==k)
                    if(index >= 0) { confirmed.splice(index) }
                }
                contentEl.innerHTML = ''
            }

            applyEditor.appendChild(el)
        }

        window.loadHoverInfo()
    }

    // Init Setup
    window.contentExplorer.allContent();
    applyEditor.style.display = "none"
}

document.querySelector("#content-editor > .tab > #content-listing-selection").setAttribute("current", "true")
// Resize Setup
// window.setResizable(document.querySelector("#content-explorer > #pack-selector"), ['right'],
// [
//     {
//         toWidth: 72,
//         callback: (width) =>
//         {
//             for(const b of document.querySelector("#content-explorer > #pack-selector").querySelectorAll("button"))
//             {
//                 if(!b.querySelector("div")) { continue; }

//                 b.querySelector("div").style.display = 'none'
//             }
//             for(const d of document.querySelector("#content-explorer > #pack-selector").querySelectorAll("h4"))
//             { d.style.display = "none" }
//         }
//     },
//     {
//         fromWidth: 72,
//         callback: (width) =>
//         {
//             for(const b of document.querySelector("#content-explorer > #pack-selector").querySelectorAll("button"))
//             {
//                 if(!b.querySelector("div")) { continue; }
//                 b.querySelector("div").style.display = 'block'
//             }
//             for(const d of document.querySelector("#content-explorer > #pack-selector").querySelectorAll("h4"))
//             { d.style.display = "block" }
//         }
//     }
// ])
window.setResizable(document.querySelector("#content-explorer > #content-explorer-selector"), ["right"])

// instanceEditor(window.instance.name)
window.addInstanceListener(() =>
{
    instanceEditor(window.instance.name)
})


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