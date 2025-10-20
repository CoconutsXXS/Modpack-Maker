import {EditorView, basicSetup} from 'cdn/codemirror'
import {json} from 'cdn/@codemirror/lang-json'
import {java} from 'cdn/@codemirror/lang-java'
import {oneDark} from 'cdn/@codemirror/theme-one-dark'
import { keymap } from "cdn/@codemirror/view";
import { indentMore, indentLess } from "cdn/@codemirror/commands";
import { indentUnit } from "cdn/@codemirror/language";

import {StreamLanguage} from "cdn/@codemirror/language"
import {toml} from "cdn/@codemirror/legacy-modes/mode/toml"
import { parse, stringify } from "cdn/comment-json";
import Frame from "cdn/canvas-to-buffer";

import * as THREE from "../node_modules/three/src/Three.js"
import { OrbitControls } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';
// import * as POSTPROCESSING from "postprocessing"
// import { SSGIEffect, TRAAEffect, MotionBlurEffect, VelocityDepthNormalPass, HBAOEffect, SSAOEffect } from 'realism-effects'

import * as msgpack from "https://unpkg.com/@msgpack/msgpack/dist.esm/index.mjs";
import * as lodash from "cdn/lodash"

async function parseMinecraftModelToThree(modelJson, opts = {})
{
    // modelJson = lodash.clone(modelJson);
    const {
        texturePathResolver = (ref) =>
        {
            if (!ref) return null;
            if (ref.endsWith('.png') || ref.startsWith('http')) return ref;
            // const cleaned = ref.replace(/^#/, '');
            const cleaned = ref;
            const parts = cleaned.split(':');
            const mod = parts.length === 2 ? parts[0] : 'minecraft';
            const path = parts.length === 2 ? parts[1] : cleaned;
            return `/assets/${mod}/${path}.png`;
        },
        loader = new THREE.TextureLoader(),
        scale = 1 / 16,
        center = true,
        defaultTextureSize = 64
    } = opts;

    const faceVertexIndicesMap = {
        west: [0, 1, 2, 3],
        east: [4, 5, 6, 7],
        down: [0, 3, 4, 7],
        up: [2, 1, 6, 5],
        north: [7, 6, 1, 0],
        south: [3, 2, 5, 4],
    };

    function buildRotationMatrix(angle, scaleVal, axis)
    {
        const a = Math.cos(angle) * scaleVal;
        const b = Math.sin(angle) * scaleVal;
        const m = new THREE.Matrix3();
        if (axis === 'x')
        {
            m.set(
                1, 0, 0,
                0, a, -b,
                0, b, a
            );
        }
        else if (axis === 'y')
        {
            m.set(
                a, 0, b,
                0, 1, 0,
                -b, 0, a
            );
        }
        else
        {
            m.set(
                a, -b, 0,
                b, a, 0,
                0, 0, 1
            );
        }
        return m;
    }

    function rotateFaceVertexIndices(vertexIndices, angle)
    {
        const a = vertexIndices[0], b = vertexIndices[1], c = vertexIndices[2], d = vertexIndices[3];
        const norm = ((angle % 360) + 360) % 360;
        switch (norm)
        {
            case 0: return [a, b, c, d];
            case 90: return [b, c, d, a];
            case 180: return [c, d, a, b];
            case 270: return [d, a, b, c];
            default: return [a, b, c, d];
        }
    }

    function getDefaultUVs(faceType, from, to)
    {
        const x1 = from[0], y1 = from[1], z1 = from[2];
        const x2 = to[0], y2 = to[1], z2 = to[2];
        switch (faceType)
        {
            case 'west': return [z1, 16 - y2, z2, 16 - y1];
            case 'east': return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
            case 'down': return [x1, 16 - z2, x2, 16 - z1];
            case 'up': return [x1, z1, x2, z2];
            case 'north': return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
            case 'south': return [x1, 16 - y2, x2, 16 - y1];
            default: return [0, 0, 16, 16];
        }
    }

    function normalizedUVs(uvsArr)
    {
        const out = [];
        for (let i = 0; i < 4; i++)
        {
            const coord = uvsArr[i];
            if (i % 2 === 1)
            {
                out.push((16 - coord) / 16);
            }
            else
            {
                out.push(coord / 16);
            }
        }
        return out;
    }

    function getCubeCornerVertices(from, to)
    {
        const x1 = from[0], y1 = from[1], z1 = from[2];
        const x2 = to[0], y2 = to[1], z2 = to[2];
        return [
            new THREE.Vector3(x1, y1, z1),
            new THREE.Vector3(x1, y2, z1),
            new THREE.Vector3(x1, y2, z2),
            new THREE.Vector3(x1, y1, z2),
            new THREE.Vector3(x2, y1, z2),
            new THREE.Vector3(x2, y2, z2),
            new THREE.Vector3(x2, y2, z1),
            new THREE.Vector3(x2, y1, z1),
        ];
    }

    function rotateCubeCornerVertices(vertices, rotation)
    {
        const angle = (rotation.angle / 180) * Math.PI;
        const scaleVal = rotation.rescale === true
            ? Math.SQRT2 / Math.sqrt(Math.cos(angle || Math.PI / 4) ** 2 * 2)
            : 1;
        const rotationMatrix = buildRotationMatrix(angle, scaleVal, rotation.axis);
        const origin = new THREE.Vector3().fromArray(rotation.origin);
        return vertices.map((vertex) =>
        {
            return vertex.clone().sub(origin).applyMatrix3(rotationMatrix).add(origin);
        });
    }

    function loadTextureAsync(url)
    {
        if (!url) return Promise.resolve(null);
        return new Promise((resolve) =>
        {
            loader.load(
                url,
                (tex) =>
                {
                    if(tex.height > tex.width)
                    {
                        let ogHeight = tex.height;
                        let ogData = tex.source.data;

                        let canvas = document.createElement("canvas")
                        canvas.width = canvas.height = tex.width

                        let ctx = canvas.getContext("2d")
                        ctx.drawImage(ogData, 0, 0)

                        canvas.style.position = 'fixed'
                        canvas.style.top = '0'
                        canvas.style.left = '0'
                        
                        tex = new THREE.Texture(canvas)

                        let currentHeight = 0;
                        setInterval(() =>
                        {
                            currentHeight += tex.width;
                            if(currentHeight >= ogHeight){currentHeight=0}
                            ctx.drawImage(ogData, 0, -currentHeight)

                            tex.needsUpdate = true
                        }, 50)
                    }

                    tex.magFilter = THREE.NearestFilter;
                    tex.minFilter = THREE.NearestFilter;
                    tex.generateMipmaps = false;
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.RepeatWrapping;

                    resolve(tex);
                },
                undefined,
                () => resolve(null)
            );
        });
    }

    const texturesMap = modelJson.textures || {};
    const textureVarToPath = {};
    const resolvedPathsSet = new Set();
    for (const key in texturesMap)
    {
        const raw = texturesMap[key];
        const cleaned = raw ? raw.replace(/^#/, '') : raw;
        const resolved = await texturePathResolver(raw);
        textureVarToPath['#' + key] = resolved;
        if (resolved) resolvedPathsSet.add(resolved);
    }

    const resolvedPaths = Array.from(resolvedPathsSet);
    const textureCache = {};
    await Promise.all(resolvedPaths.map(async (p) =>
    {
        const tex = await loadTextureAsync(p);
        textureCache[p] = tex;
    }));

    const materialCache = {};
    for (const p of resolvedPaths)
    {
        const tex = textureCache[p] || null;
        const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: false, side: THREE.DoubleSide, alphaTest: .5, shadowSide: THREE.DoubleSide, clipShadows: true, clipIntersection: true, needsUpdate: true });
        mat.needsUpdate = mat.map.needsUpdate = true
        console.log(mat)
        materialCache[p] = mat;
    }

    const materialGroups = {};
    for (const p of resolvedPaths)
    {
        materialGroups[p] = { vertices: [], uvs: [], indices: [] };
    }
    const missingGroup = { vertices: [], uvs: [], indices: [] };
    const textureVarToGroupMap = {};
    for (const key in textureVarToPath)
    {
        const p = textureVarToPath[key];
        textureVarToGroupMap[key] = materialGroups[p] || missingGroup;
    }

    const elements = modelJson.elements || [];
    for (const elem of elements)
    {
        let cornerVertices = getCubeCornerVertices(elem.from, elem.to);
        if (elem.rotation != null)
        {
            cornerVertices = rotateCubeCornerVertices(cornerVertices, elem.rotation);
        }
        for (const v of cornerVertices)
        {
            v.sub(new THREE.Vector3(8, 0, 8));
        }
        const faces = elem.faces || {};
        for (const faceType in faces)
        {
            const face = faces[faceType];
            if (face === undefined) continue;
            const group = textureVarToGroupMap[face.texture] || missingGroup;
            const i = group.vertices.length / 3;
            group.indices.push(i, i + 2, i + 1);
            group.indices.push(i, i + 3, i + 2);
            const baseIndices = faceVertexIndicesMap[faceType];
            const rotatedIndices = rotateFaceVertexIndices(baseIndices, face.rotation ?? 0);
            for (const idx of rotatedIndices)
            {
                const v = cornerVertices[idx];
                group.vertices.push(v.x * scale, v.y * scale, v.z * scale);
            }
            const faceUVs = (face.uv != null && face.uv.length === 4) ? face.uv.slice() : getDefaultUVs(faceType, elem.from, elem.to);
            const [nu1, nv1, nu2, nv2] = normalizedUVs(faceUVs);
            const u1 = nu1, v1 = nv1, u2 = nu2, v2 = nv2;
            group.uvs.push(u1, v2);
            group.uvs.push(u1, v1);
            group.uvs.push(u2, v1);
            group.uvs.push(u2, v2);
        }
    }

    const parentGroup = new THREE.Group();
    if (center)
    {
        parentGroup.position.set(0, 0, 0);
    }

    const materialEntries = Object.entries(materialGroups).sort();
    for (const [path, group] of materialEntries)
    {
        if (group.vertices.length === 0) continue;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(group.vertices, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(group.uvs, 2));
        geom.setIndex(new THREE.Uint16BufferAttribute(group.indices, 1));
        const mat = materialCache[path] || new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parentGroup.add(mesh);
    }

    if (missingGroup.vertices.length > 0)
    {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(missingGroup.vertices, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(missingGroup.uvs, 2));
        geom.setIndex(new THREE.Uint16BufferAttribute(missingGroup.indices, 1));
        const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parentGroup.add(mesh);
    }

    // Normals
    parentGroup.traverse((child) =>
    {
        if(child.geometry)
        {
            child.geometry.computeVertexNormals()
        }
    })

    return parentGroup;
}

// Elements
let section = document.querySelector(".content-explorer-section").cloneNode(true); document.querySelector(".content-explorer-section").remove();
let modEditor = document.getElementById("mod-content-editor"); modEditor.style.display = "none";

let editors =
{
    applyEditor: document.getElementById("apply-editor"),
    codeEditor: document.getElementById("code-editor"),
    nbtEditor: document.getElementById("nbt-editor"),
    imgEditor: document.getElementById("image-editor"),
    threeEditor: document.getElementById("three-editor"),
    noEditor: document.getElementById("no-editor"),
    sourceSelection: document.getElementById("multiple-source")
}
editors.applyEditor.style.display = "none"
editors.codeEditor.style.display = "none"
editors.nbtEditor.style.display = "none"; editors.nbtEditor.querySelectorAll(":scope > button")[0].style.display = "none";
editors.noEditor.style.display = "none"
editors.imgEditor.style.display = "none"
editors.threeEditor.style.display = "none"

// Jar Decompiler/Interpreter
window.jarData =
{
    combined: {},
    modified: [],
    idList: []
}

window.addInstanceListener((i) => {jarAnalyseSetup(i)});
async function jarAnalyseSetup(i)
{
    if(!(await ipcInvoke("isMinecraftInstalled", window.instance.name, window.instance.version.number))){ document.getElementById("launch-required").style.display = "block"; return}
    document.getElementById("launch-required").style.display = "none";
    document.getElementById("launch-required").querySelector("button").onclick = ()=>{jarAnalyseSetup(i)}

    // Full Combinaison
    window.jarData.combined = msgpack.decode(await getCombined(i.name, i.version.number));
    window.jarData.modified = [];
    window.jarData.idList = [];

    // Apply
    window.jarData.openApplier = async function()
    {
        for(let [e, v] of Object.entries(editors)){editors[e].style.display = "none";}
        modEditor.style.display = "none";
        editors.applyEditor.style.display = "block";

        editors.applyEditor.querySelector(":scope > div:first-of-type").innerHTML = '';
        for(let [i, m] of window.jarData.modified.entries())
        {
            let e = document.createElement("div");
            e.appendChild(document.createElement("p"))
            e.appendChild(document.createElement("button"))
            e.appendChild(document.createElement("button"))

            // Text
            let keyPath = "";
            for(let p of m.keys){keyPath+=p+"/";} keyPath = keyPath.slice(0, keyPath.length-1);
            e.querySelector("p").innerText = keyPath;

            // Buttons
            e.querySelector("button:first-of-type").innerText = "apply";
            e.querySelector("button:first-of-type").onclick = async () =>
            {
                await ipcInvoke("writeJarPropertie", m.origin, [m]);
                window.instance.jarModifications.push(m)
                window.jarData.modified.splice(i, 1)
                e.remove();
            }

            e.querySelector("button:last-of-type").innerText = "revert";
            e.querySelector("button:last-of-type").onclick = async () =>
            {
                window.jarData.modified.splice(i, 1)
                e.remove();
            }

            editors.applyEditor.querySelector(":scope > div:first-of-type").appendChild(e)
        }

        editors.applyEditor.querySelector(":scope > div:last-of-type > button:first-of-type").onclick = async () =>
        {
            let groups = [];
            for(let [i, m] of window.jarData.modified.entries)
            {
                if(groups.find(g=>g[0]?.origin==m.origin))
                { groups[groups.findIndex(g=>g[0]?.origin==m.origin)].push(m); }
                else { groups.push([m]) }

                window.instance.jarModifications.push(m)
                window.jarData.modified.splice(i, 1)
            }
            console.log(groups);
            for(let g of groups) { console.log("g", g); window.instance.jarModifications.push(m); await ipcInvoke("writeJarPropertie", g[0].origin, g); }

            for(let b of editors.applyEditor.querySelectorAll(":scope > div:first-of-type > div > button:first-of-type")) { b.remove(); }
        }
        editors.applyEditor.querySelector(":scope > div:last-of-type > button:last-of-type").onclick = async () =>
        {
            for(let b of editors.applyEditor.querySelectorAll(":scope > div:first-of-type > div > button:last-of-type")) { b.remove(); }
        }


        editors.applyEditor.querySelector(":scope > button:last-of-type").onclick = () =>
        {
            editors.applyEditor.style.display = "none"
            editors.applyEditor.querySelector(":scope > div:first-of-type").innerHTML = '';
            document.querySelector('#content-editor > .tab > button:first-of-type').click();
        }
    }
    modEditor.querySelector(":scope > button").onclick = window.jarData.openApplier;

    window.jarData.openExplorer = async function(path = "")
    {
        if(!(await ipcInvoke("isMinecraftInstalled", window.instance.name, window.instance.version.number))){ document.getElementById("launch-required").style.display = "block"; return}
        document.getElementById("launch-required").style.display = "none";

        let pathKeys = path;
        if(typeof path == "string") { pathKeys = path.split("/"); }

        document.querySelector("#content-element-selector").style.display = "none";

        explorer(window.jarData.combined, async (keys) =>
        {
            editors.sourceSelection.firstChild.innerHTML = '';
            editors.sourceSelection.style.display = "none";
            for(let [e, v] of Object.entries(editors)){editors[e].style.display = "none";}

            keys = lodash.clone(keys);

            let selectedFile = null;
            let files = await ipcInvoke("retrieveFileByKeys", i.name, i.version.number, keys);

            if(files.length == 0)
            {
                editors.sourceSelection.style.display = "block";
                let p = document.createElement("p");
                p.innerText = `${keys[keys.length-1]} not found...`;
                return;
            }

            selectedFile = files.length>1?await new Promise((resolve) =>
            {
                editors.sourceSelection.style.display = "block";
                let p = document.createElement("p");
                p.innerText = `${keys[keys.length-1]} is modified by multiple sources:`;
                editors.sourceSelection.firstChild.appendChild(p);
                for(let [i, f] of files.entries())
                {
                    let b = document.createElement("button");
                    b.innerText = f.jarFile.slice(f.jarFile.lastIndexOf("/"))
                    b.onclick = () =>
                    {
                        editors.sourceSelection.firstChild.innerHTML = '';
                        editors.sourceSelection.style.display = "none";
                        resolve(files[i])
                    }
                    editors.sourceSelection.firstChild.appendChild(b);
                }
            }):files[0];
            if(getProp(window.jarData.combined, keys)) { selectedFile.value = getProp(window.jarData.combined, keys); }

            setProp(window.jarData.combined, keys, selectedFile.value);
            fileEditor(lodash.clone(selectedFile.value), keys[keys.length-1], (value) =>
            {
                if(lodash.isEqual(selectedFile.value, value)){return}
                
                setProp(window.jarData.combined, keys, value);
                if(window.jarData.modified.find(m => m.keys==keys))
                {
                    window.jarData.modified[window.jarData.modified.findIndex(m => m.keys==keys)] = {origin: selectedFile.jarFile, keys, value}
                }
                else
                {
                    window.jarData.modified.push({origin: selectedFile.jarFile, keys, value})
                }
            }, () => { document.querySelector('#content-editor > .tab > button:first-of-type').click(); editors.codeEditor.style.display = "none"; }, async () =>
            {
                let files = await ipcInvoke("retrieveFileByKeys", i.name, i.version.number, keys);
                return files[files.length-1].value;
            }, async (keys) =>
            {
                let value = null;
                if(!getProp(window.jarData.combined, keys))
                { let files = await ipcInvoke("retrieveFileByKeys", window.instance.name, window.instance.version.number, keys); if(files.length==0){return null;} value = files[files.length-1].value; }
                else { value = getProp(window.jarData.combined, keys) }

                return value;
            })
        }, {name: ""}, [], 0, [...pathKeys])

        document.querySelector('#content-editor > .tab > button:first-of-type').click()
    }

    let loadedTable = false;
    window.jarData.loadTable = async function loadTable()
    {
        if(loadedTable){return}
        loadedTable=true;

        document.querySelector("#content-element-selector > button").style.display = "none";
        document.querySelector("#content-element-selector > table").style.display = "block";
        
        let modsMetadata = [];
        let elementGroupMetadata = [];

        let dataCopy = lodash.clone(window.jarData.combined.data); Object.assign(dataCopy, window.jarData.combined.assets)
        let combinedEntrie = Object.entries(dataCopy).filter(([e,v]) => lodash.isObject(v) && e != ".mcassetsroot");
        for(let [e, v] of combinedEntrie)
        {
            if(window.jarData.combined.data[e])
            {
                v = lodash.clone(window.jarData.combined.data[e])
                Object.assign(v, window.jarData.combined.assets[e])
            }
            else
            {
                v = window.jarData.combined.assets[e];
            }

            let el = document.createElement("th");
            el.scope = "col"; el.innerHTML = e;
            document.querySelector("#content-element-selector thead > tr").appendChild(el);
            let tableIndex = Array.from(document.querySelector("#content-element-selector thead > tr").childNodes).filter(e=>e.nodeName=="TH").findIndex(e=>e==el)

            let count = 0;
            async function recursiveSearch(p, preKeys = [])
            {
                for(let [key, v] of Object.entries(p))
                {
                    await new Promise(resolve => setTimeout(resolve, 0));

                    let keys = [...preKeys];
                    keys.push(key);

                    if(key.includes("."))
                    {
                        if(keys.length <= 1){continue;}
                        keys[keys.length-1] = keys[keys.length-1].replace(/\.[^/.]+$/, "");
                        let path = "";
                        for(let k of keys){path+=k+"/"}
                        path = path.slice(0, path.length-1)

                        window.jarData.idList.push(`${e}:${path}`);

                        // Metadata
                        let shortFilename = path.slice(path.lastIndexOf("/"));
                        let shortPath = path.slice(0, path.indexOf("/"))

                        count++;
                        if(elementGroupMetadata.find(g=>g.path==shortPath))
                        {
                            elementGroupMetadata[elementGroupMetadata.findIndex(g=>g.path==shortPath)].count++;
                            elementGroupMetadata[elementGroupMetadata.findIndex(g=>g.path==shortPath)].elements.push({p: shortPath, f: shortFilename});
                        }
                        else
                        {
                            elementGroupMetadata.push
                            ({
                                path: shortPath,
                                count: 1,
                                elements: [{p: shortPath, f: shortFilename}]
                            })
                        }

                        // Display
                        let parent = Array.from(document.querySelectorAll("#content-element-selector tbody > tr")).find(tr => tr.querySelector(":scope > th").innerText == shortPath);
                        if(!parent)
                        {
                            parent = document.createElement("tr");
                            document.querySelector("#content-element-selector tbody").appendChild(parent);
                            let titleEl = document.createElement("th");
                            titleEl.scope = "row"; titleEl.innerText = shortPath;
                            parent.appendChild(titleEl);
                        }
                        // else if (parent.childElementCount > 100){continue;}

                        while(!parent.childNodes.item(tableIndex) || !parent.childNodes.item(combinedEntrie.length))
                        {
                            let el = document.createElement("th");
                            el.scope = "row";
                            parent.appendChild(el);
                        }

                        if(!isNaN(Number(parent.childNodes.item(tableIndex).innerText))) { parent.childNodes.item(tableIndex).innerText = (Number(parent.childNodes.item(tableIndex).innerText)+1); }
                        else { parent.childNodes.item(tableIndex).innerText = "1"; }

                        // Open
                        parent.childNodes.item(tableIndex).onclick = () =>
                        {
                            let isAsset = getProp(window.jarData.combined, ["assets", e, ...shortPath.split("/")])!=undefined;
                            window.jarData.openExplorer((isAsset?"assets":"data")+"/"+e+"/"+shortPath)
                        }
                    }
                    else if(lodash.isObject(v))
                    {
                        recursiveSearch(v, keys);
                    }
                }
            }
            await recursiveSearch(v);

            modsMetadata.push
            ({
                id: e,
                count
            })
        }

        // SORTING
        {
            // Columns
            for (let i = 0; i < document.querySelectorAll("#content-element-selector thead > tr > th").length; i++)
            {
                let c = 0;
                for(let child of document.querySelectorAll("#content-element-selector tbody > tr"))
                {
                    c += Number(child.childNodes[i].innerText)
                }

                for(let child of document.querySelectorAll("#content-element-selector tbody > tr"))
                {
                    child.childNodes[i].setAttribute("total", c)
                }
                document.querySelectorAll("#content-element-selector thead > tr > th")[i].setAttribute("total", c)
            }

            for (let i = 0; i < document.querySelectorAll("#content-element-selector tbody > tr").length; i++)
            {
                [...document.querySelectorAll("#content-element-selector tbody > tr").item(i).childNodes]
                .sort((a, b) =>
                {
                    if(a.nodeType != 1){return -1;}
                    if(b.nodeType != 1){return 1;}
                    return Number(b.getAttribute("total"))-Number(a.getAttribute("total"));
                })
                .forEach(node => document.querySelectorAll("#content-element-selector tbody > tr").item(i).appendChild(node));
            }

            [...document.querySelector("#content-element-selector thead > tr").childNodes]
            .sort((a, b) =>
            {
                if(a.nodeType != 1){return -1;}
                if(b.nodeType != 1){return 1;}
                return Number(b.getAttribute("total"))-Number(a.getAttribute("total"));
            })
            .forEach(node => document.querySelector("#content-element-selector thead > tr").appendChild(node));

            // Rows
            for (let i = 0; i < document.querySelectorAll("#content-element-selector tbody > tr").length; i++)
            {
                let c = 0;
                for(let child of document.querySelectorAll("#content-element-selector tbody > tr")[i].querySelectorAll(":scope > th"))
                {
                    if(isNaN(Number(child.innerText))){continue}
                    c += Number(child.innerText)
                }

                document.querySelectorAll("#content-element-selector tbody > tr")[i].setAttribute("total", c)
            }

            [...document.querySelector("#content-element-selector tbody").childNodes]
            .sort((a, b) =>
            {
                if(a.nodeType != 1){return -1;}
                if(b.nodeType != 1){return 1;}

                let ca=0;
                for(let child of a.querySelectorAll(":scope > th"))
                {
                    if(isNaN(Number(child.innerText))){continue}
                    ca += Number(child.innerText)
                }

                let cb=0;
                for(let child of b.querySelectorAll(":scope > th"))
                {
                    if(isNaN(Number(child.innerText))){continue}
                    cb += Number(child.innerText)
                }

                return cb-ca;
            })
            .forEach(node => document.querySelector("#content-element-selector tbody").appendChild(node));
        }

        modsMetadata = modsMetadata.sort((a,b) => b.count - a.count)
        elementGroupMetadata = elementGroupMetadata.sort((a,b) => b.count - a.count)
    }
    document.querySelector("#content-element-selector > button").onclick = window.jarData.loadTable;
}


// Three Setup
let loadModel;
let loadStructure;
window.addInstanceListener(async (i) => 
{
    // Setup
    function isWebGLAvailable()
    {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
        } catch (e) {
            return false;
        }
    }
    if (!isWebGLAvailable())
    {
        console.error("WebGL is not supported or disabled!");
        return
    }

    const renderer = new THREE.WebGLRenderer({alpha: true, canvas: document.getElementById("three-file-canvas")});
    document.body.appendChild( renderer.domElement );

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera( 40, window.innerWidth / window.innerHeight, 0.1, 1000 );

    const resizeElement = () =>
    {
        camera.aspect = renderer.domElement.parentNode.getBoundingClientRect().width / renderer.domElement.parentNode.getBoundingClientRect().height;
        renderer.setSize(renderer.domElement.parentNode.getBoundingClientRect().width, renderer.domElement.parentNode.getBoundingClientRect().height);
        camera.updateProjectionMatrix();
    }
    renderer.domElement.parentNode.onresize = resizeElement;
    let observer = new ResizeObserver(resizeElement);
    observer.observe(renderer.domElement.parentNode)

    setInterval(() =>
    {
        if(renderer.domElement.parentNode.getBoundingClientRect().width!=renderer.domElement.getBoundingClientRect().width||renderer.domElement.parentNode.getBoundingClientRect().height!=renderer.domElement.getBoundingClientRect().height)
        {resizeElement()}
    }, 100/30)

    editors.threeEditor.appendChild(renderer.domElement);
    resizeElement();

    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.castShadow = true;

    light.shadow.camera.left = -500;
    light.shadow.camera.right = 500;
    light.shadow.camera.top = 500;
    light.shadow.camera.bottom = -500;
    light.shadow.camera.near = 3;
    light.shadow.camera.far = camera.far;

    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;

    light.position.set(50, 100, 50);
    light.target.position.set(0, 0, 0); // pointer vers le centre de la scène
    scene.add(light, light.target, new THREE.AmbientLight(0xffffff, 1));

    camera.position.z = 5;

    {
        // // Post
        // const composer = new POSTPROCESSING.EffectComposer(renderer)

        // console.log(camera.constructor.name)
        // camera.constructor.name = "PerspectiveCamera"
        // const velocityDepthNormalPass = new VelocityDepthNormalPass(scene, camera)
        // composer.addPass(velocityDepthNormalPass)

        // // SSGI
        // const ssgiEffect = new SSGIEffect(scene, camera, velocityDepthNormalPass)

        // // TRAA
        // const traaEffect = new TRAAEffect(scene, camera, velocityDepthNormalPass)

        // // Motion Blur
        // const motionBlurEffect = new MotionBlurEffect(velocityDepthNormalPass)

        // // SSAO
        // const ssaoEffect = new SSAOEffect(composer, camera, scene)

        // // HBAO
        // const hbaoEffect = new HBAOEffect(composer, camera, scene)

        // const effectPass = new POSTPROCESSING.EffectPass(camera, ssgiEffect, hbaoEffect, ssaoEffect, traaEffect, motionBlur)

        // composer.addPass(effectPass)
    }

    const resolveTexture = async (ref, getFile = (k) => {}, json) =>
    {
        if (!ref) return null;
        if (ref.includes('http') || ref.endsWith('.png')) return ref;

        if(ref.startsWith("#"))
        { return await resolveTexture(json["textures"][ref.replace(/^#/, '')], getFile, json); }

        let cleaned = ref.replace(/^#/, '');
        let keys = [];
        if (cleaned.includes(':'))
        {
            let [mod, path] = cleaned.split(':');
            path = path.split("/");
            path[path.length-1] = path[path.length-1]+".png"

            keys = ['assets', mod, 'textures'].concat(path);
        }
        else
        {
            cleaned = cleaned.split("/");
            cleaned[cleaned.length-1] = cleaned[cleaned.length-1]+".png"

            keys = ['assets', "minecraft", 'textures'].concat(cleaned);
        }

        let targetObject = await getFile(keys);
        if(targetObject)
        {
            return "data:image/png;base64,"+targetObject.url;
        }
        return "data:image/png;base64,0";
    };
    const resolveModel = async (ref, getFile = (k) => {}) =>
    {
        if (!ref) return null;
        if (ref.includes('http') || ref.endsWith('.png')) return ref;
        let cleaned = ref.replace(/^#/, '');
        let keys = [];
        if (cleaned.includes(':'))
        {
            let [mod, path] = cleaned.split(':');
            path = path.split("/");
            path[path.length-1] = path[path.length-1]+".json"

            keys = ['assets', mod, 'models'].concat(path);
        }
        else
        {
            cleaned = cleaned.split("/");
            cleaned[cleaned.length-1] = cleaned[cleaned.length-1]+".json"

            keys = ['assets', "minecraft", 'models'].concat(cleaned);
        }

        let targetObject = await getFile(keys);
        if(targetObject)
        {
            return JSON.parse(targetObject);
        }
        return {};
    };
    
    let lastModel = null;
    loadModel = async (json, getFile = (k) => {}) =>
    {
        resizeElement();

        if(lastModel){scene.remove(lastModel)}

        for(let b of editors.threeEditor.querySelectorAll(":scope > div:first-of-type > button")){b.removeAttribute("selected")}
        editors.threeEditor.querySelector(":scope > div:first-of-type > button:nth-child(3)").setAttribute("selected", "");
        editors.threeEditor.querySelector(":scope > div:first-of-type > select").innerHTML = '';

        // Parent
        while(json.parent != undefined)
        {
            let parent = json.parent;
            let parentObj = await resolveModel(parent, getFile);
            let nextParent = parentObj.parent;

            json = lodash.merge(parentObj, json);

            if(parent == nextParent) { json.parent = undefined }
            else { json.parent = nextParent; }
        }

        let dependencies = []
        lastModel = await parseMinecraftModelToThree(json, {texturePathResolver: async (ref) => {if(!ref.startsWith("#")){dependencies.push(ref)} return await resolveTexture(ref, getFile, json)}, scale: 1, center: true});
        lastModel.position.setY(-0.5)
        scene.add(lastModel);

        editors.threeEditor.querySelector(":scope > div:first-of-type > select").value = ""
        editors.threeEditor.querySelector(":scope > div:first-of-type > select").innerHTML = '<option value="" disabled selected>Dependencies</option>'
        for(let d of dependencies)
        {
            let e = document.createElement("option");
            e.innerText = d;
            e.value = d;
            editors.threeEditor.querySelector(":scope > div:first-of-type > select").appendChild(e);
        }

        editors.threeEditor.querySelector(":scope > div:first-of-type > select").onchange = () =>
        {
            let cleaned = editors.threeEditor.querySelector(":scope > div:first-of-type > select").value.replace(/^#/, '');
            let keys = [];
            if (cleaned.includes(':'))
            {
                let [mod, path] = cleaned.split(':');
                path = path.split("/");
                path[path.length-1] = path[path.length-1]+".png"

                keys = ['assets', mod, 'textures'].concat(path);
            }
            else
            {
                cleaned = cleaned.split("/");
                cleaned[cleaned.length-1] = cleaned[cleaned.length-1]+".png"

                keys = ['assets', "minecraft", 'textures'].concat(cleaned);
            }

            window.jarData.openExplorer(keys);
            console.log(keys);
        }
    }

    loadStructure = async (data, getFile = (k) => {}) => 
    {
        // Cleanup
        resizeElement();

        if(lastModel){scene.remove(lastModel)}

        for(let b of editors.threeEditor.querySelectorAll(":scope > div:first-of-type > button")){b.removeAttribute("selected")}
        editors.threeEditor.querySelector(":scope > div:first-of-type > button:nth-child(3)").setAttribute("selected", "");
        editors.threeEditor.querySelector(":scope > div:first-of-type > select").innerHTML = '';


        // Load
        let palette = [];
        for(let [i, p] of data.palette.entries())
        {
            function idToKeys(id, preKeys = [])
            {
                let cleaned = id.replace(/^#/, '');
                let keys = [];
                if (cleaned.includes(':'))
                {
                    let [mod, path] = cleaned.split(':');
                    path = path.split("/");
                    path[path.length-1] = path[path.length-1]+".json"

                    keys = ['assets', mod, ...preKeys].concat(path);
                }
                else
                {
                    cleaned = cleaned.split("/");
                    cleaned[cleaned.length-1] = cleaned[cleaned.length-1]+".json"

                    keys = ['assets', "minecraft", ...preKeys].concat(cleaned);
                }
                return keys;
            }

            let files = [];
            // Properties
            if(p.Properties || (p.Name && !(await getFile(idToKeys(p.Name, ['models']))) && !(await getFile(idToKeys(p.Name, ['models', 'block'])))))
            {
                if(!p.Properties){p.Properties={}}
                let blockPropertiesString = Object.entries(p.Properties).map(([k, v]) => `${k}=${JSON.stringify(v).slice(1, JSON.stringify(v).length-1)}`).join(',');

                let variantKeys = idToKeys(p.Name, ["blockstates"]);
                
                let blockstateJson = JSON.parse(await getFile(variantKeys));

                if(blockstateJson?.variants)
                {
                    let variantData = {};

                    for(let [k, v] of Object.entries(blockstateJson.variants))
                    {
                        let valid = true;
                        for(let part of k.split(','))
                        {
                            if(!blockPropertiesString.includes(part)){valid=false; break;}
                        }
                        if(!valid){continue}

                        if(Array.isArray(v)){v=v[0]}
                        variantData = lodash.merge(variantData, v)
                    }

                    console.log(p.Name, blockPropertiesString, 'from', blockstateJson.variants, '=', variantData)

                    if((Object.entries(variantData).length == 0 || !variantData.model) && !blockstateJson.multipart) { files.push({model: p.Name}); }
                    else { files.push(variantData) }
                }
                if(blockstateJson?.multipart)
                {
                    let final = {};
                    blockstateJson.multipart.reverse()
                    for(let m of blockstateJson.multipart)
                    {
                        if(!m.when){continue;}
                        let valid = true;
                        for(let [k, v] of Object.entries(m.when))
                        {
                            if(!p.Properties[k] == v){valid = false; break;}
                        }
                        if(!valid){continue;}

                        final = lodash.merge(final, m.apply)
                        // files.push(m.apply)
                    }
                    for(let m of blockstateJson.multipart)
                    {
                        if(!m.model){continue}
                        let finalCopy = lodash.clone(final);
                        finalCopy.model = m.model;
                        files.push(final);
                    }
                }

                if(!blockstateJson?.variants && !blockstateJson?.multipart)
                {
                    console.log("NO VARIANT/MULTIPART", blockstateJson)
                }
            }
            else { files.push({model: p.Name}); }

            let final = new THREE.Group();
            for(let f of files)
            {
                if(!f.model){ console.log(files, p); continue;}
                let json = JSON.parse(await getFile(idToKeys(f.model, ['models'])));

                if(!json){ json = JSON.parse(await getFile(idToKeys(f.model, ['models', 'block']))) }
                if(!json){ continue; }

                while(json.parent != undefined)
                {
                    let parent = json.parent;
                    let parentObj = await resolveModel(parent, getFile);
                    let nextParent = parentObj.parent;

                    json = lodash.merge(parentObj, json);

                    if(parent == nextParent) { json.parent = undefined }
                    else { json.parent = nextParent; }
                }
                
                let model = await parseMinecraftModelToThree(json, {texturePathResolver: async (ref) => {return await resolveTexture(ref, getFile, json)}, scale: 1/16, center: true});

                for(let [i, c] of model.children.entries()){model.children[i].position.z-=0;model.children[i].position.y-=0.5;model.children[i].position.x-=0;}
                
                if(!f.x){f.x=0} if(!f.y){f.y=0;}
                model.rotation.order = 'XYZ';
                model.rotateY(THREE.MathUtils.degToRad(-f.y))
                model.rotateX(THREE.MathUtils.degToRad(-f.x))

                final.add(model);
            }

            palette.push(final);
        }

        lastModel = new THREE.Group();
        for(let b of data.blocks)
        {
            if(!palette[b.state] || !palette[b.state]){continue;}
            let m = palette[b.state].clone(true);
            m.position.setX(b.pos[0]+0.5)
            m.position.setY(b.pos[1]+0.5)
            m.position.setZ(b.pos[2]+0.5)
            lastModel.add(m);
        }

        controls.target.set(data.size[0]/2, data.size[1]/2, data.size[2]/2)

        scene.add(lastModel)
    }
    
    // Shading Select
    editors.threeEditor.querySelector(":scope > div:first-of-type > button:nth-child(1)").onclick = (ev) =>
    {
        for(let b of editors.threeEditor.querySelectorAll(":scope > div:first-of-type > button")){b.removeAttribute("selected")}
        ev.target.setAttribute("selected", "");
        lastModel.traverse((child) =>
        {
            if(child.material)
            {
                let newMat = new THREE.MeshStandardMaterial({ map: child.material.map, color: 0xffffff, transparent: false, side: THREE.DoubleSide, wireframe: true, alphaMap: child.material.map })
                child.castShadow = child.receiveShadow = true;
                child.material = newMat;
            }
        })
    }
    editors.threeEditor.querySelector(":scope > div:first-of-type > button:nth-child(2)").onclick = (ev) =>
    {
        for(let b of editors.threeEditor.querySelectorAll(":scope > div:first-of-type > button")){b.removeAttribute("selected")}
        ev.target.setAttribute("selected", "");
        lastModel.traverse((child) =>
        {
            if(child.material)
            {
                let newMat = new THREE.MeshBasicMaterial({ map: child.material.map, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide, alphaTest: .5 })
                child.castShadow = child.receiveShadow = true;
                child.material = newMat;
            }
        })
    }
    editors.threeEditor.querySelector(":scope > div:first-of-type > button:nth-child(3)").onclick = (ev) =>
    {
        for(let b of editors.threeEditor.querySelectorAll(":scope > div:first-of-type > button")){b.removeAttribute("selected")}
        ev.target.setAttribute("selected", "");
        lastModel.traverse((child) =>
        {
            if(child.material)
            {
                let newMat = new THREE.MeshPhysicalMaterial({ map: child.material.map, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide, alphaTest: .5 });
                child.castShadow = child.receiveShadow = true;
                child.material = newMat;
            }
        })
    }

    // Camera Control
    const controls = new OrbitControls( camera, renderer.domElement );
    camera.position.set( 0, 20, 100 );
    controls.update();

    scene.add(new THREE.AxesHelper(1))

    renderer.shadowMap.type=THREE.VSMShadowMap;
    // Render Loop
    function animate()
    {
        if(!editors.threeEditor.checkVisibility()){return;}
        light.rotateZ(0.1);
        controls.update();
        renderer.render( scene, camera );
    }
    renderer.setAnimationLoop( animate );
});

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

let nbtEditorOpened = false;
let nbtEditorIndex = -1;

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
function explorer(o, open, display, keysPath = [], iteration = 0, startingPath = [], max = 6)
{
    let s = null;
    if(modEditor.querySelectorAll(".content-explorer-section")[iteration])
    {
        s = modEditor.querySelectorAll(".content-explorer-section")[iteration];
        while(modEditor.querySelectorAll(".content-explorer-section")[iteration+1]){modEditor.querySelectorAll(".content-explorer-section")[iteration+1].remove();}
        // while(modEditor.querySelectorAll(".content-explorer-section").length > max){modEditor.querySelectorAll(".content-explorer-section")[0].remove();}
        while(s.querySelector("button")){s.querySelector("button").remove();}
    }
    else { s = section.cloneNode(true); modEditor.appendChild(s); }
    if(!display.name) { s?.querySelector("h3")?.remove(); }
    else if(s?.querySelector("h3")) { s.querySelector("h3").innerText = display.name }

    if(display.icon)
    {
        if(!s.querySelector("img")) {s.querySelector(":scope > div").insertBefore(document.createElement("img"), s.querySelector(":scope > div").firstChild)}
        s.querySelector("img").src = display.icon; }
    else if(s.querySelector("img")) { s.querySelector("img").remove(); }

    for(let [k, v] of Object.entries(o).sort(([ka], [kb])=>ka.localeCompare(kb)))
    {
        let b = document.createElement("button");
        if(k.endsWith(".png") && v && v.url)
        {
            let i = document.createElement("img");
            i.src = "data:image/png;base64,"+v.url;
            b.appendChild(i);

            let span = document.createElement("span");
            span.innerText = k;
            b.appendChild(span);
        }
        else if(k.endsWith(".png"))
        {
            let span = document.createElement("span");
            span.innerText = k;
            b.appendChild(span);

            let path = lodash.clone(keysPath);
            path.push(k);

            ipcInvoke("retrieveFileByKeys", window.instance.name, window.instance.version.number, path).then(file =>
            {
                if(!file || file.length == 0 || !file[0].value?.url){return}
                
                let i = document.createElement("img");
                i.src = "data:image/png;base64,"+file[0].value.url;
                b.insertBefore(i, span);
            })
        }
        else
        {
            b.innerText = k;
        }
        s.appendChild(b)

        if(!/^[^\\\/:\*\?"<>\|]+(\.[a-zA-Z0-9]+)+$/.test(k) && (v==undefined || Object.entries(v).length == 0))
        {
            b.disabled = true;
        }

        b.onclick = () =>
        {
            let path = lodash.clone(keysPath);
            path.push(k);

            for(let s of b.parentNode.querySelectorAll("button")){s.removeAttribute("selected")}
            b.setAttribute("selected", "")

            if(/^[^\\\/:\*\?"<>\|]+(\.[a-zA-Z0-9]+)+$/.test(k))
            {
                open(path)

                let directoryPath = path;
                directoryPath.pop();

                let index = Array.from(b.parentNode.childNodes).indexOf(b)

                s.parentNode.querySelectorAll(":scope > div")[iteration].childNodes.item(index).setAttribute("selected", "")
                // {name: path[path.length-1]}
            }
            else
            {
                explorer(v, open, {name: null}, path, iteration+1, startingPath[iteration]==k?startingPath:[]);
            }
        }

        if(startingPath[iteration] == k){b.onclick(); startingPath = []; }
    }

    document.getElementById("mod-content-editor").scrollTo(document.getElementById("mod-content-editor").scrollHeight, 0)
}

let closeEditor = () => {};
let Drawers = {};
async function fileEditor(data, filename, onChange = (value)=>{}, onExit = () => {}, reload = () => {}, getFile = (k) => {})
{    
    for(let [e, v] of Object.entries(editors)){editors[e].style.display = "none";}
    closeEditor();
    if(filename.endsWith(".json") || filename.endsWith(".mcmeta"))
    {
        editors.codeEditor.style.display = "block";

        let value = data;
        // Beautiful Indent
        value = stringify(parse(value, undefined, true), null, 4);

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
            parent: editors.codeEditor
        })
                    
        editors.codeEditor.appendChild(editors.codeEditor.querySelector(".exit-options"))
        editors.codeEditor.querySelector(".exit-options > button.save").onclick = () =>
        {
            try
            {
                onChange(value)
            }
            catch(err)
            {
                console.warn(err)
                // TODO: Error invalid json
            }
        }

        closeEditor = () =>
        {
            editors.codeEditor.style.display = "none";
            editors.threeEditor.style.display = "none";
            editor.dom.remove();
            onExit();
        }
        editors.codeEditor.querySelector(".exit-options > button.exit").onclick = closeEditor

        editors.codeEditor.querySelector(".exit-options > button.three").onclick = () =>
        {
            if(!loadModel){return}
            editors.codeEditor.style.display = "none";
            editors.threeEditor.style.display = "block";

            loadModel(JSON.parse(value), getFile);
        }
    }
    else if(filename.endsWith(".class"))
    {
        editors.codeEditor.style.display = "block";

        let value = data;
        let editor = new EditorView
        ({
            doc: value.raw.file,
            extensions:
            [
                basicSetup,
                java(),
                editorTheme,
                oneDark,
                indentUnit.of("    "),
                EditorView.updateListener.of(update =>
                {
                    if (update.docChanged)
                    {
                        const doc = update.state.doc;
                        value.raw.file = doc.toString()
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
                    
        editors.codeEditor.appendChild(editors.codeEditor.querySelector(".exit-options"))

        editors.codeEditor.querySelector(".exit-options > button.three").disabled = editors.codeEditor.querySelector(".exit-options > button.save").disabled = true;
        editors.codeEditor.querySelector(".exit-options > button.save").onclick = () =>
        {
            try
            {
                onChange(value)
            }
            catch(err)
            {
                console.warn(err)
                // TODO: Error invalid json
            }
        }

        closeEditor = () =>
        {
        editors.codeEditor.querySelector(".exit-options > button.three").disabled = editors.codeEditor.querySelector(".exit-options > button.save").disabled = false;
            editors.codeEditor.style.display = "none"
            editor.dom.remove();
            onExit();
        }
        editors.codeEditor.querySelector(".exit-options > button:last-of-type").onclick = closeEditor
    }
    else if(filename.endsWith(".toml"))
    {
        editors.codeEditor.style.display = "block";

        let value = data;
        let editor = new EditorView
        ({
            doc: value.raw,
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
                        value.raw = doc.toString()
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
                    
        editors.codeEditor.appendChild(editors.codeEditor.querySelector(".exit-options"))
        editors.codeEditor.querySelector(".exit-options > .save").onclick = () =>
        {
            try
            {
                onChange(value)
            }
            catch(err)
            {
                console.warn(err)
                // TODO: Error invalid json
            }
        }

        closeEditor = () =>
        {
            editors.codeEditor.style.display = "none"
            editor.dom.remove();
            onExit();
        }
        editors.codeEditor.querySelector(".exit-options > .exit").onclick = closeEditor
    }
    else if(filename.endsWith(".mcfunction") || filename.endsWith(".MF") || filename.endsWith(".properties") || filename.endsWith(".txt"))
    {
        editors.codeEditor.style.display = "block";

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
            parent: editors.codeEditor
        })
                    
        editors.codeEditor.appendChild(editors.codeEditor.querySelector(".exit-options"))
        editors.codeEditor.querySelector(".exit-options > button:first-of-type").onclick = () => {onChange(data)}

        closeEditor = () =>
        {
            editors.codeEditor.style.display = "none"
            editor.dom.remove();
            onExit();
        }
        editors.codeEditor.querySelector(".exit-options > button:last-of-type").onclick = closeEditor
    }
    else if(filename.endsWith(".nbt"))
    {
        editors.nbtEditor.style.display = "block";

        closeEditor = () => { editors.nbtEditor.style.display = "none"; onExit(); }

        editors.nbtEditor.querySelectorAll("p")[1].innerText = `Dimensions x: ${data.parsed.size[0]}, y: ${data.parsed.size[1]}, z: ${data.parsed.size[2]}`

        editors.nbtEditor.querySelector("caption").innerText = filename;
        while(editors.nbtEditor.querySelector("tbody").firstChild){editors.nbtEditor.querySelector("tbody").firstChild.remove();}
        for(let [i, p] of data.parsed.palette.entries())
        {
            let c = document.createElement("tr");
            editors.nbtEditor.querySelector("tbody").appendChild(c);

            c.appendChild(document.createElement("td"));
            c.querySelector("td:last-of-type").innerText = data.parsed.blocks.filter(b=>b.state==i).length

            c.appendChild(document.createElement("td"));
            c.querySelector("td:last-of-type").innerText = p.Name

            c.appendChild(document.createElement("td"));
            c.querySelector("td:last-of-type").innerText = p.Properties?JSON.stringify(p.Properties, null, 4):"";
            c.querySelector("td:last-of-type").style.textAlign = "start"
        }

        while(editors.nbtEditor.querySelector("ul").firstChild){editors.nbtEditor.querySelector("ul").firstChild.remove();}
        for(let entity of data.parsed.entities)
        {
            let e = document.createElement("li");
            e.innerText = entity.nbt.id;
            editors.nbtEditor.querySelector("ul").appendChild(e);
        }

        editors.nbtEditor.querySelectorAll("div > button")[0].disabled = false
        editors.nbtEditor.querySelectorAll("div > button")[0].innerText = nbtEditorOpened?"Load to Minecraft":"Edit in Minecraft"

        editors.nbtEditor.querySelectorAll(":scope > button")[0].innerText = "Save into "+filename;
        editors.nbtEditor.querySelectorAll(":scope > button")[0].onclick = async () => 
        {
            // Save
            let data =
            {
                parsed: await ipcInvoke("readFile", 'Modpack\ Maker'+sep()+'instances'+sep()+window.instance.name+sep()+'minecraft'+sep()+'saves'+sep()+'.Structure Edition'+sep()+'generated'+sep()+'minecraft'+sep()+'structures'+sep()+'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)+'.nbt'),
                buffer: await ipcInvoke("readRawFile", 'Modpack\ Maker'+sep()+'instances'+sep()+window.instance.name+sep()+'minecraft'+sep()+'saves'+sep()+'.Structure Edition'+sep()+'generated'+sep()+'minecraft'+sep()+'structures'+sep()+'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)+'.nbt')
            };
            await onChange(data);

            data = await reload();

        }
        editors.nbtEditor.querySelectorAll("div > button")[0].onclick = async () =>
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
                            editors.nbtEditor.querySelectorAll("div > button")[0].innerText = "Edit in Minecraft"
                            editors.nbtEditor.querySelectorAll("div > button")[0].disabled = false
                            editors.nbtEditor.querySelectorAll("p")[0].innerHTML = "";
                            editors.nbtEditor.querySelectorAll(":scope > button")[0].style.display = "none"

                            ipcInvoke('deleteFolder', 'Modpack\ Maker'+sep()+'instances'+sep()+window.instance.name+sep()+'minecraft'+sep()+'saves'+sep()+'.Structure Edition'+sep());
                        },
                        network: (i, c) => {},
                        windowOpen: async (w, i) => {},
                    },
                    {type: "singleplayer", identifier: ".Structure Edition"}
                )
                editors.nbtEditor.querySelectorAll("div > button")[0].innerText = "Minecraft launched"
                editors.nbtEditor.querySelectorAll("div > button")[0].disabled = true
                editors.nbtEditor.querySelectorAll(":scope > button")[0].style.display = "block"
                editors.nbtEditor.querySelectorAll("p")[0].style.opacity = '0.8';
                editors.nbtEditor.querySelectorAll("p")[0].innerHTML = `<br>Minecraft is opened. The current structure is <span style="color=#fff">${filename}</span>.<br>To load it put "<span onclick="navigator.clipboard.writeText('${'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)}')" style="cursor:pointer;text-decoration: underline">${'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)}</span>" (click to copy) as structure name in the structure block and press "LOAD" twice.<br>To save it, in the structure block set "Load Mode" to "Save" and press "SAVE".<br>(Userful command to clear: <span style:"backgroundColor: #000">/fill 0 1 0 16 16 16 air</span>)<br>You must save the structure via the structure block before saving it into the mod.<br>`
            }

            ipcInvoke('writeBuffer', 'Modpack\ Maker'+sep()+'instances'+sep()+window.instance.name+sep()+'minecraft'+sep()+'saves'+sep()+'.Structure Edition'+sep()+'generated'+sep()+'minecraft'+sep()+'structures'+sep()+'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)+'.nbt', data.buffer);
            editors.nbtEditor.querySelectorAll("p")[0].innerHTML = `<br>Minecraft is opened. The current structure is <span style="color=#fff">${filename}</span>.<br>To load it put "<span onclick="navigator.clipboard.writeText('${'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)}')" style="cursor:pointer;text-decoration: underline">${'structure'+(nbtEditorIndex==0?'':nbtEditorIndex)}</span>" (click to copy) as structure name in the structure block and press "LOAD" twice.<br>To save it, in the structure block set "Load Mode" to "Save" and press "SAVE".<br>(Userful command to clear: <span style:"backgroundColor: #000">/fill 0 1 0 16 16 16 air</span>)<br>You must save the structure via the structure block before saving it into the mod.<br>`
        }

        editors.nbtEditor.querySelectorAll("div > button")[1].onclick = async () =>
        {
            editors.nbtEditor.style.display = "none";
            editors.threeEditor.style.display = "block";
            loadStructure(data.parsed, getFile)
        }
    }
    else if(filename.endsWith(".png"))
    {
        let moving = false;
        closeEditor = () => { editors.imgEditor.style.display = "none"; onExit(); moving = false; canvas.style.scale = '1'; }
        editors.imgEditor.style.display = "block";

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
            const buffer = new Frame(canvas, ["png"], 1).toBuffer();

            if(!lodash.isEqual(data.buffer, buffer)){data.url = buffer.toString("base64")}
            data.buffer = buffer;
            onChange(data);
        }

        let img = new Image;
        img.onload = (i) =>
        {
            canvas.width = img.width
            canvas.height = img.height
            if(canvas.width * editors.imgEditor.getBoundingClientRect().height < canvas.height * editors.imgEditor.getBoundingClientRect().width) { canvas.style.height = "calc(80% - 32px)"; canvas.style.width = "unset"; }
            else { canvas.style.width = "calc(80% - 32px)"; canvas.style.height = "unset"; }
            ctx.drawImage(img, 0, 0);

            canvas.style.translate = `-${canvas.getBoundingClientRect().width/2}px -${canvas.getBoundingClientRect().height/2}px`
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

        // Zoom
        document.getElementById("image-editor").onwheel = (event) =>
        {
            canvas.style.scale = Number((isNaN(Number(canvas.style.scale)) || Number(canvas.style.scale) == 0)?1:canvas.style.scale)*(1+event.deltaY/2500);
            if(Number(canvas.style.scale) <= 0.1) { canvas.style.scale = "0.1" }
        }
        document.getElementById("image-editor").onmousedown = (event) => { if(event.button == 1){moving=true;} }
        window.addEventListener("mouseup", (event) => { if(event.button == 1){moving=false;lastPos = null;} })
        let lastPos = null;
        window.addEventListener("mousemove", (event) =>
        {
            if(!moving){return;}
            if(lastPos == null) { lastPos = {x: event.clientX, y: event.clientY} }
            else
            {
                if(!canvas.style.translate.replaceAll("px","").split(" ")[0] || !canvas.style.translate.replaceAll("px","").split(" ")[1]){canvas.style.translate = `-${canvas.getBoundingClientRect().width/2}px -${canvas.getBoundingClientRect().height/2}px`}
                canvas.style.translate = (Number(canvas.style.translate.replaceAll("px","").split(" ")[0])+(event.clientX-lastPos.x)*1.5) + "px " + ((Number(canvas.style.translate.replaceAll("px","").split(" ")[1])?Number(canvas.style.translate.replaceAll("px","").split(" ")[1]):0)+(event.clientY-lastPos.y)*1.5) + "px";
                lastPos = {x: event.clientX, y: event.clientY}
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
                console.log("Init drawer")
                Drawers[id] = {};
                Drawers[id].size = 1;
                Drawers[id].color = buttonContainer.querySelector("input").value;
                Drawers[id].toolId = 0;
                Drawers[id].alphaLock = false;
                Drawers[id].onBack = false;
                Drawers[id].hue = false;
            }
            Drawers[id].canvas = canvas;

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
        closeEditor = () => { editors.noEditor.style.display = "none"; onExit(); }
        editors.noEditor.style.display = "block";
        document.getElementById("no-editor").querySelector("p").innerText = filename.split("/")[filename.split("/").length-1] + "\nFormat not supported... You can download it and/or replace it with another file to modify it externally.";
        
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
    if(!(await ipcInvoke("isMinecraftInstalled", instance.name, instance.version.number))){ document.getElementById("launch-required").style.display = "block"; return}
    document.getElementById("launch-required").style.display = "none";

    closeEditor();
    let fullPath = "instances/"+window.instance.name +"/minecraft/"+path+".jar";
    let data = await ipcInvoke("getJar", fullPath, true)

    document.querySelector('#content-editor > .tab > button:first-of-type').click();

    // Icon
    let icon = null;
    let modData = await ipcInvoke("extractFileByPath", fullPath, "META-INF/mods.toml");
    for(let m of modData.parsed.mods)
    {
        if(m.logoFile)
        {
            let logoData = await ipcInvoke("extractFileByPath", fullPath, m.logoFile);
            if(logoData) { icon = "data:image/png;base64,"+logoData.url; }
        }
    }

    explorer(data, async (keys) =>
    {
        editors.sourceSelection.firstChild.innerHTML = '';
        editors.sourceSelection.style.display = "none";

        keys = lodash.clone(keys);
        let selectedFile = null;

        if(!getProp(window.jarData.combined, keys))
        {
            let files = await ipcInvoke("retrieveFileByKeys", window.instance.name, window.instance.version.number, keys);

            if(files.length == 0)
            {
                editors.sourceSelection.style.display = "block";
                let p = document.createElement("p");
                p.innerText = `${keys[keys.length-1]} not found...`;
                return;
            }

            selectedFile = files.find(f=>f.jarFile.endsWith(fullPath));

            if(!selectedFile)
            {
                editors.sourceSelection.style.display = "block";
                let p = document.createElement("p");
                p.innerText = `${keys[keys.length-1]} is not modified by ${path.slice(path.lastIndexOf("/"))}...`;
                return;
            }
        }
        else
        {
            selectedFile = {value: getProp(window.jarData.combined, keys), keys: keys, jarFile: fullPath};
        }


        setProp(window.jarData.combined, keys, selectedFile.value);
        fileEditor(lodash.clone(selectedFile.value), keys[keys.length-1], (value) =>
        {
            if(lodash.isEqual(selectedFile.value, value)){return}

            setProp(window.jarData.combined, keys, value);
            if(window.jarData.modified.find(m => m.keys==keys))
            {
                window.jarData.modified[window.jarData.modified.findIndex(m => m.keys==keys)] = {origin: selectedFile.jarFile, keys, value}
            }
            else
            {
                window.jarData.modified.push({origin: selectedFile.jarFile, keys, value})
            }
        }, () => { document.querySelector('#content-editor > .tab > button:first-of-type').click(); }, async () =>
        {
            let files = await ipcInvoke("retrieveFileByKeys", window.instance.name, window.instance.version.number, keys);
            return files[files.length-1].value;
        }, async (keys) =>
        {
            let value = null;
            if(!getProp(window.jarData.combined, keys))
            { let files = await ipcInvoke("retrieveFileByKeys", window.instance.name, window.instance.version.number, keys); if(files.length==0){return null;} value = files[files.length-1].value; }
            else { value = getProp(window.jarData.combined, keys) }

            return value;
        })
    }, {name: path.slice(path.lastIndexOf("/")), icon: icon})


    return;
    
    for(let [i, m] of data.mods.entries())
    {
        let b = document.createElement("button");
        if(m.icon)
        {
            let i = document.createElement("img");
            i.src = m.icon
            b.appendChild(i);
        }
        let span = document.createElement("span");
        span.innerText = m.name;
        b.appendChild(span);
        s.appendChild(b)

        b.onclick = () =>
        {
            let o = {assets: data.mods[i].assets, data: data.mods[i].data, classes: data.mods[i].classes};
            closeEditor();
            explorer(o, (keys) =>
            {
                keys = lodash.clone(keys)
                fileEditor(getProp(data.mods[i], keys), keys[keys.length-1], (value) => { console.log(keys, value); setProp(data.mods[i], keys, value) }, () => { document.querySelector('#content-editor > .tab > button:first-of-type').click(); editors.codeEditor.style.display = "none"; }, () => {return getProp(data.mods[i], keys)})
            }, {name: m.name, icon: m.icon})
        }
    }
    // Ressource Packs
    {
        let b = document.createElement("button");
        b.innerText = "Ressource Packs";
        s.appendChild(b)

        b.onclick = () =>
        {
            closeEditor();
            explorer(data.resourcepacks, (keys) =>
            {
                fileEditor(getProp(data.resourcepacks, keys), keys[keys.length-1], (value) => {setProp(data.resourcepacks, keys, value)}, () => { document.querySelector('#content-editor > .tab > button:first-of-type').click(); editors.codeEditor.style.display = "none"; }, () => {return getProp(data.resourcepacks, keys)})
            }, {name: "Ressource Packs"})
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
            explorer(data.data, (keys) =>
            {
                fileEditor(getProp(data.data, keys), keys[keys.length-1], (value) => {setProp(data.data, keys, value)}, () => { document.querySelector('#content-editor > .tab > button:first-of-type').click(); editors.codeEditor.style.display = "none"; }, () => {return getProp(data.data, keys)})
            }, {name: "Other Files"})
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