import * as THREE from "three"
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as lodash from "lodash-es"
import similarity from "similarity";
// import { parse, createVisitor } from "java-ast";
import { Parser, Language }  from 'web-tree-sitter';
import parseBlockDeclaration from "./block-declaration-parser"

let cache =
{
    texture: []
}
export default class Block
{
    name = ""
    properties = {}
    propertiesString = ""
    blockstate = {}
    modelsData = []

    sourceJar

    parts = new Array(7)

    positionToIndex = new Map()
    indexToPosition = new Map()
    aabb

    coveredFaces = [false, false, false, false, false, false]
    tinted = false

    physicGeometry

    static async from(name, properties = {}, sourceJar, capacity = 32, material = new THREE.MeshPhysicalMaterial())
    {
        let result = new Block()
        result.name = name;
        result.properties = properties
        result.sourceJar = sourceJar

        // Blockstate from properties
        result.blockstate = JSON.parse(await result.sourceJar.resolveAsset(name, ["blockstates"]));
        result.propertiesString = Object.entries(properties).map(([k, v]) => `${k}=${JSON.stringify(v).slice(1, JSON.stringify(v).length-1)}`).join(',');

        let files = []
        if(result.blockstate?.variants)
        {
            let variantData = {};

            for(let [k, v] of Object.entries(result.blockstate.variants))
            {
                let valid = true;
                for(let part of k.split(','))
                {
                    if(!result.propertiesString.includes(part)){valid=false; break;}
                }
                if(!valid){continue}

                if(Array.isArray(v)){v=v[0]}
                variantData = lodash.merge(variantData, v)
            }

            if((Object.entries(variantData).length == 0 || !variantData.model) && !result.blockstate.multipart) { files.push({model: name}); }
            else { files.push(variantData) }
        }
        if(result.blockstate?.multipart)
        {
            let final = {};
            result.blockstate.multipart.reverse()
            for(let m of result.blockstate.multipart)
            {
                if(!m.when){continue;}
                let valid = true;
                for(let [k, v] of Object.entries(m.when))
                {
                    if(!properties[k] == v){valid = false; break;}
                }
                if(!valid){continue;}

                final = lodash.merge(final, m.apply)
            }
            for(let m of result.blockstate.multipart)
            {
                if(!m.model){continue}
                let finalCopy = lodash.clone(final);
                finalCopy.model = m.model;
                files.push(final);
            }
        }

        if(files.length==0){files.push({model: name})}

        // 3D Model
        const splittedGeometries = new Array(7);
        for (let i = 0; i < 7; i++) { splittedGeometries[i] = []; }

        let materials = []
        for(const f of files)
        {
            let model = JSON.parse(await result.sourceJar.resolveAsset(f.model, ['models']))
            if(model==undefined)
            {
                // console.error(f.model, ['models'], "is undefined!");
                continue
            }
            
            const loader = new THREE.TextureLoader()
            const scale = 1 / 16

            // Parent heritage
            while(model.parent != undefined)
            {
                let parent = model.parent;
                let parentObj = JSON.parse(await result.sourceJar.resolveAsset(parent, ['models']));
                let nextParent = parentObj.parent;

                model = lodash.merge(parentObj, model);

                if(parent == nextParent) { model.parent = undefined }
                else { model.parent = nextParent; }
            }

            result.modelsData.push(model)

            // Colormap
            if(model.elements?.find(e=>Object.entries(e?.faces).find(([,f])=>f?.tintindex!=undefined)) && !result.colormapContext)
            {
                result.tinted = true
                let colormapName = "grass";
                const possibilities = [{name: 'grass', keys: ['grass']}, {name: 'foliage', keys: ['leaves']}];

                let simil = 0;
                for(const p of possibilities)
                {
                    for(const k of p.keys)
                    {
                        const v = similarity(name.split(':')[name.split(':').length-1], k);
                        if(simil<v){simil=v; colormapName = p.name;}
                    }
                }

                const colormap = await sourceJar.resolveAsset(colormapName, ['textures', 'colormap'])

                if(colormap)
                {
                    const resolved = `data:image/png;base64,${colormap}`

                    const tex = cache.texture[resolved] ? cache.texture[resolved] : await new Promise((resolve) =>
                    {
                        const img = new Image()
                        img.onload = () => { resolve(img) }
                        img.src = resolved;
                    })

                    const canvas = document.createElement("canvas");

                    result.colormapContext = canvas.getContext("2d")
                    canvas.width = tex.width
                    canvas.height = tex.height

                    result.colormapContext.drawImage(tex, 0, 0)
                }
            }

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
                if(cache.texture[url]){return Promise.resolve(cache.texture[url])}
                return new Promise((resolve) =>
                {
                    loader.load(
                        url,
                        (tex) =>
                        {
                            let width = tex.width | tex.source.data.width;
                            let height = tex.height | tex.source.data.height;

                            if(height > width)
                            {
                                let ogHeight = height;
                                let ogData = tex.source.data;

                                let canvas = document.createElement("canvas")
                                canvas.width = canvas.height = width

                                let ctx = canvas.getContext("2d")
                                ctx.drawImage(ogData, 0, 0)

                                canvas.style.position = 'fixed'
                                canvas.style.top = '0'
                                canvas.style.left = '0'

                                // document.body.appendChild(canvas)
                                
                                tex = new THREE.Texture(canvas)

                                let currentHeight = 0;
                                setInterval(() =>
                                {
                                    currentHeight += width;
                                    if(currentHeight >= ogHeight){currentHeight=0}
                                    ctx.drawImage(ogData, 0, -currentHeight)

                                    tex.needsUpdate = true
                                }, 50)
                            }

                            tex.magFilter = THREE.NearestFilter;
                            tex.minFilter = THREE.NearestFilter;
                            // tex.generateMipmaps = false;
                            // tex.colorspace = THREE.SRGBColorSpace;
                            tex.wrapS = THREE.RepeatWrapping;
                            tex.wrapT = THREE.RepeatWrapping;

                            cache.texture[url] = tex
                            resolve(tex);
                        },
                        undefined,
                        () => resolve(null)
                    );
                });
            }

            const texturesMap = model.textures || {};
            const textureVarToPath = {};
            const resolvedPathsSet = new Set();
            for (const key in texturesMap)
            {
                let raw = texturesMap[key];
                if(raw.startsWith('#')){raw = texturesMap[raw.replace(/^#/, '')]}
                const data = await result.sourceJar.resolveAsset(raw, ['textures'])
                const resolved = data?`data:image/png;base64,${data}`:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR42mPABX4w/MCKaKJhVMPgcOuoBgDZRfgBVl5QdQAAAABJRU5ErkJggg==';
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
                const mat = Object.assign(material.clone(),
                {
                    map: tex,
                    transparent: false,
                    side: THREE.FrontSide,
                    alphaTest: .5,
                    shadowSide: THREE.FrontSide,
                    clipShadows: true,
                    clipIntersection: true,
                    toneMapped: true
                });

                mat.needsUpdate = true;
                if(mat.map) { mat.map.needsUpdate = true}
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

            const elements = model.elements || [];
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

                    if(face.tintindex != undefined)
                    {
                        const colors = new Array(group.vertices.length*3);
                        for (let i = 0; i < colors.length; i++)
                        {
                            colors[i] = 0
                        }

                        group.color = colors;
                    }
                }
            }

            let coveredFaces = result.coveredFaces.map(v=>{if(v){return 2}else{return 0}})

            const materialEntries = Object.entries(materialGroups).sort();
            for (const [path, group] of materialEntries)
            {
                if (group.vertices.length === 0) continue;
                let geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.Float32BufferAttribute(group.vertices, 3));
                geom.setAttribute('uv', new THREE.Float32BufferAttribute(group.uvs, 2));
                if(group.color)
                { geom.setAttribute('color', new THREE.Float32BufferAttribute(group.color, 3)); }
                geom.setIndex(new THREE.Uint16BufferAttribute(group.indices, 1));

                const tempTranslationMatrix = new THREE.Matrix4();
                tempTranslationMatrix.makeTranslation(0, -0.5, 0)
                geom.applyMatrix4(tempTranslationMatrix);
                geom.computeVertexNormals();

                const rotationXMatrix = new THREE.Matrix4().makeRotationX(f.x?THREE.MathUtils.degToRad(-f.x):0);
                geom.applyMatrix4(rotationXMatrix);
                geom.computeVertexNormals();

                const rotationYMatrix = new THREE.Matrix4().makeRotationY(f.y?THREE.MathUtils.degToRad(-f.y):0);
                geom.applyMatrix4(rotationYMatrix);
                geom.computeVertexNormals();

                // Split by Direction
                const EPS = 1e-6;
                const g = geom.index ? geom.toNonIndexed() : geom.clone();

                const posAttr = g.attributes.position;
                if (!posAttr) throw new Error('Geometry has no position attribute');

                const posArray = posAttr.array;
                const vertCount = posAttr.count;
                const hasUV = !!g.attributes.uv;
                const uvArray = hasUV ? g.attributes.uv.array : null;
                const hasColor = !!g.attributes.color;
                const colorArray = hasColor ? g.attributes.color.array : null;

                const groups = Array.from({ length: 7 }, () => []);
                const groupUVs = hasUV ? Array.from({ length: 7 }, () => []) : null;
                const groupColor = group.color ? Array.from({ length: 7 }, () => []) : null;

                for (let vi = 0; vi < vertCount; vi += 3)
                {
                    const base = vi * 3;
                    const x0 = posArray[base],     y0 = posArray[base + 1], z0 = posArray[base + 2];
                    const x1 = posArray[base + 3], y1 = posArray[base + 4], z1 = posArray[base + 5];
                    const x2 = posArray[base + 6], y2 = posArray[base + 7], z2 = posArray[base + 8];

                    const v0Corner = Math.abs(Math.abs(x0) - 0.5) < EPS && Math.abs(Math.abs(y0) - 0.5) < EPS && Math.abs(Math.abs(z0) - 0.5) < EPS;
                    const v1Corner = Math.abs(Math.abs(x1) - 0.5) < EPS && Math.abs(Math.abs(y1) - 0.5) < EPS && Math.abs(Math.abs(z1) - 0.5) < EPS;
                    const v2Corner = Math.abs(Math.abs(x2) - 0.5) < EPS && Math.abs(Math.abs(y2) - 0.5) < EPS && Math.abs(Math.abs(z2) - 0.5) < EPS;

                    const fullFace = v0Corner && v1Corner && v2Corner
                    // if (!(v0Corner && v1Corner && v2Corner))
                    // {
                    //     groups[0].push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
                    //     const ub = vi * 2;
                    //     if (hasUV)
                    //     {
                    //         groupUVs[0].push(uvArray[ub], uvArray[ub + 1], uvArray[ub + 2], uvArray[ub + 3], uvArray[ub + 4], uvArray[ub + 5]);
                    //     }
                    //     if(hasColor)
                    //     {
                    //         groupColor[0].push(colorArray[ub], colorArray[ub + 1], colorArray[ub + 2], colorArray[ub + 3], colorArray[ub + 4], colorArray[ub + 5])
                    //     }
                    //     continue;
                    // }

                    const isPosX = Math.abs(x0 - 0.5) < EPS && Math.abs(x1 - 0.5) < EPS && Math.abs(x2 - 0.5) < EPS;
                    const isNegX = Math.abs(x0 + 0.5) < EPS && Math.abs(x1 + 0.5) < EPS && Math.abs(x2 + 0.5) < EPS;
                    const isPosY = Math.abs(y0 - 0.5) < EPS && Math.abs(y1 - 0.5) < EPS && Math.abs(y2 - 0.5) < EPS;
                    const isNegY = Math.abs(y0 + 0.5) < EPS && Math.abs(y1 + 0.5) < EPS && Math.abs(y2 + 0.5) < EPS;
                    const isPosZ = Math.abs(z0 - 0.5) < EPS && Math.abs(z1 - 0.5) < EPS && Math.abs(z2 - 0.5) < EPS;
                    const isNegZ = Math.abs(z0 + 0.5) < EPS && Math.abs(z1 + 0.5) < EPS && Math.abs(z2 + 0.5) < EPS;

                    if (isPosX)       { if(fullFace){coveredFaces[0]++} groups[1].push(x0,y0,z0,x1,y1,z1,x2,y2,z2); if (hasColor) groupColor[1].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]); if (hasUV) groupUVs[1].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]); }
                    else if (isNegX)  { if(fullFace){coveredFaces[1]++} groups[2].push(x0,y0,z0,x1,y1,z1,x2,y2,z2); if (hasColor) groupColor[2].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]); if (hasUV) groupUVs[2].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]); }
                    else if (isPosY)  { if(fullFace){coveredFaces[2]++} groups[3].push(x0,y0,z0,x1,y1,z1,x2,y2,z2); if (hasColor) groupColor[3].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]); if (hasUV) groupUVs[3].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]); }
                    else if (isNegY)  { if(fullFace){coveredFaces[3]++} groups[4].push(x0,y0,z0,x1,y1,z1,x2,y2,z2); if (hasColor) groupColor[4].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]); if (hasUV) groupUVs[4].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]); }
                    else if (isPosZ)  { if(fullFace){coveredFaces[4]++} groups[5].push(x0,y0,z0,x1,y1,z1,x2,y2,z2); if (hasColor) groupColor[5].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]); if (hasUV) groupUVs[5].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]); }
                    else if (isNegZ)  { if(fullFace){coveredFaces[5]++} groups[6].push(x0,y0,z0,x1,y1,z1,x2,y2,z2); if (hasColor) groupColor[6].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]); if (hasUV) groupUVs[6].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]); }
                    else
                    {
                        groups[0].push(x0,y0,z0,x1,y1,z1,x2,y2,z2);
                        if (hasUV) groupUVs[0].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]);
                        if (hasColor) groupColor[0].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]);
                    }
                }

                // Build geometries
                for (let i = 0; i < 7; i++)
                {
                    if(groups[i].length === 0)
                    {
                        continue;
                    }
                    
                    const newG = new THREE.BufferGeometry();
                    newG.setAttribute('position', new THREE.Float32BufferAttribute(groups[i], 3));

                    if (hasColor) newG.setAttribute('color', new THREE.Float32BufferAttribute(groupColor[i], 3)); 
                    if (hasUV) newG.setAttribute('uv', new THREE.Float32BufferAttribute(groupUVs[i], 2));
                    newG.computeVertexNormals();

                    splittedGeometries[i].push({geometry: newG, materialPath: path, tinted: hasColor});
                }

                // Shader Culling

                let mat = materialCache[path] || Object.assign(material.clone(), { color: 0xffffff, side: THREE.FrontSide });

                materials.push(mat)
            }

            result.coveredFaces = coveredFaces.map(v=>v>=2)
        }

        for (let i = 0; i < 7; i++)
        {
            if(splittedGeometries[i].length == 0) { splittedGeometries[i] = null; continue }

            // Splitted by Tint dependence
            let meshes = []

            let tintedGeom = splittedGeometries[i].filter(g=>g.tinted)
            if(tintedGeom.length>0)
            {
                const sideMaterials = tintedGeom.map(o => materials.find(m=>m?.map?.source?.data?.currentSrc == o.materialPath));
                tintedGeom = BufferGeometryUtils.mergeVertices( BufferGeometryUtils.mergeGeometries(tintedGeom.map(o => o.geometry), true));

                const mesh = new THREE.InstancedMesh(tintedGeom, sideMaterials.length?sideMaterials:materials, capacity)
                mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                mesh.frustumCulled = false;
                mesh.receiveShadow = mesh.castShadow = true;
                mesh.count = 0

                mesh.userData.tinted = true;
                meshes.push(mesh)
            }

            let untintedGeom = splittedGeometries[i].filter(g=>!g.tinted)
            if(untintedGeom.length>0)
            {
                const sideMaterials = untintedGeom.map(o => materials.find(m=>m?.map?.source?.data?.currentSrc == o.materialPath));
                untintedGeom = BufferGeometryUtils.mergeVertices( BufferGeometryUtils.mergeGeometries(untintedGeom.map(o => o.geometry), true));

                const mesh = new THREE.InstancedMesh(untintedGeom, sideMaterials.length?sideMaterials:materials, capacity)
                mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                mesh.frustumCulled = false;
                mesh.receiveShadow = mesh.castShadow = true;
                mesh.count = 0

                mesh.userData.tinted = false;
                meshes.push(mesh)
            }

            result.parts[i] =
            {
                meshes,
                capacity: capacity,
                instancedCount: 0,
                indexToPosition: new Array(capacity)
            }

            continue
            // Splitted by Mat
            // let meshes = new Array(splittedGeometries[i].length)
            // for (let splittedIndex = 0; splittedIndex < splittedGeometries[i].length; splittedIndex++)
            // {
            //     const geom = splittedGeometries[i][splittedIndex];

            //     const mesh = new THREE.InstancedMesh(geom.geometry, materials.find(m=>m?.map?.source?.data?.currentSrc == geom.materialPath), capacity)
            //     mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            //     mesh.frustumCulled = false;
            //     mesh.userData.tinted = geom.tinted;
            //     meshes[splittedIndex] = mesh
            // }

            // result.parts[i] =
            // {
            //     meshes,
            //     capacity: capacity,
            //     instancedCount: 0,
            //     indexToPosition: new Array(capacity)
            // }

            continue
            // Combined Methode
            const sideMaterials = splittedGeometries[i].map(o => materials.find(m=>m?.map?.source?.data?.currentSrc == o.materialPath));
            splittedGeometries[i] = BufferGeometryUtils.mergeVertices( BufferGeometryUtils.mergeGeometries(splittedGeometries[i].map(o => o.geometry), true));

            const mesh = new THREE.InstancedMesh(splittedGeometries[i], sideMaterials.length?sideMaterials:materials, capacity)
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.frustumCulled = false;
 
            result.parts[i] =
            {
                mesh,
                capacity: capacity,
                instancedCount: 0,
                indexToPosition: new Array(capacity)
            }
        }


        // // Java behaviour auto reverse engineering
        // const blockRegistry = (await sourceJar.getFile(['net', 'minecraft', 'world', 'level', 'block', 'Blocks.class'])).value.text.file
        // console.log(await parseBlockDeclaration(blockRegistry))

        // await Parser.init();

        // const wasmPath = await ipcInvoke("appDir") + sep() + 'node_modules/tree-sitter-wasms/out/tree-sitter-java.wasm';
        // console.log(wasmPath)
        // const Java = await Language.load(wasmPath);

        // const parser = new Parser();
        // parser.setLanguage(Java);
        // const tree = parser.parse(blockRegistry);

        // console.log(tree, tree.rootNode.toString())

        return result
    }

    // Renders
    async display(display = "gui", width = 64, height = 64, renderer = null)
    {
        if(this.modelsData.length == 0) { return null; }

        renderer = renderer || window.renderer

        // No Icon and No Display (displays the first texture used)
        if(!this.modelsData[0].display)
        {
            let tex;

            if(!tex)
            {
                for(const p of this.parts)
                {
                    if(!p){continue}
                    for(const m of p.meshes)
                    {
                        tex = (Array.isArray(m.material) ? m.material : [m.material]).find(m => m?.map?.source?.data)?.map?.source?.data
                        if(tex!=undefined){break;}
                    }
                    if(tex!=undefined){break;}
                }
            }

            if(!tex) { return null }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tex, 0, 0, width, height);

            return canvas.toDataURL();
        }
        const displayData = this.modelsData[0].display[display];
        
        // Mesh
        const geoms = []
        const mats = []
        for(const p of this.parts)
        {
            if(!p){continue}
            for(const m of p.meshes)
            {
                geoms.push(m.geometry)
                for(const mat of Array.isArray(m.material) ? m.material : [m.material])
                {
                    mats.push(mat) 
                }
            }
        }
        
        const mesh = new THREE.Mesh( BufferGeometryUtils.mergeVertices( BufferGeometryUtils.mergeGeometries(geoms, true) ), mats)

        // Material
        const modelNormalMatrix = new THREE.Matrix3();
        mesh.updateMatrixWorld(true);
        modelNormalMatrix.getNormalMatrix(mesh.matrixWorld);

        const newMats = []
        for(const m of mats)
        {
            m.map.encoding = THREE.sRGBEncoding;
            m.map.needsUpdate = true;

            const uniforms =
            {
                map: { value: m.map },
                ambientIntensity: { value: 0.30 },
                skyDir: { value: new THREE.Vector3(0.2, 0.9, 0.3) },
                skyIntensity: { value: 0.40 },
                blockDir: { value: new THREE.Vector3(-0.6, 0.4, -0.2) },
                blockIntensity: { value: 0.20 },
                topShade: { value: 1.00*1.3 },
                nsShade: { value: 0.90*1.3 },
                ewShade: { value: 0.60*1.3 },
                bottomShade: { value: 0.50*1.3 },
                sideBoost: { value: 1.00 },
                sideThreshold: { value: 0.55 },
                modelNormalMatrix: { value: modelNormalMatrix }
            };

            const mat = new THREE.ShaderMaterial
            ({
                uniforms,
                vertexShader: `
                varying vec2 vUv;
                varying vec3 vWorldNormal;

                uniform mat3 modelNormalMatrix; // provided from JS

                void main() {
                vUv = uv;
                // robust world-space normal (handles rotation + non-uniform scale via modelNormalMatrix)
                vWorldNormal = normalize(modelNormalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
                fragmentShader: `
                    precision mediump float;

                    uniform sampler2D map;
                    uniform float ambientIntensity;
                    uniform vec3 skyDir;       // world-space
                    uniform float skyIntensity;
                    uniform vec3 blockDir;     // world-space
                    uniform float blockIntensity;
                    uniform float topShade;
                    uniform float bottomShade;
                    uniform float nsShade;
                    uniform float ewShade;
                    uniform float sideBoost;
                    uniform float sideThreshold;

                    varying vec2 vUv;
                    varying vec3 vWorldNormal;

                    // sRGB <-> linear (piecewise)
                    vec3 sRGBToLinear(vec3 c) {
                    bvec3 cutoff = lessThanEqual(c, vec3(0.04045));
                    vec3 lower = c / 12.92;
                    vec3 higher = pow((c + 0.055) / 1.055, vec3(2.4));
                    return mix(higher, lower, vec3(cutoff));
                    }

                    vec3 linearToSRGB(vec3 c) {
                    bvec3 cutoff = lessThanEqual(c, vec3(0.0031308));
                    vec3 lower = c * 12.92;
                    vec3 higher = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
                    return mix(higher, lower, vec3(cutoff));
                    }

                    void main() {
                    vec4 t = texture2D(map, vUv);
                    vec3 texLinear = sRGBToLinear(t.rgb);

                    // use WORLD-space normal so axis multipliers remain consistent across mesh rotation
                    vec3 n = normalize(vWorldNormal);

                    float ax = abs(n.x);
                    float ay = abs(n.y);
                    float az = abs(n.z);
                    float sum = ax + ay + az + 1e-6;

                    // axis-weighted shade using world axes: +/-Y is top/bottom, +/-Z is north/south, +/-X east/west
                    float axisShade = (max(n.y, 0.0) * topShade +
                                        max(-n.y, 0.0) * bottomShade +
                                        az * nsShade +
                                        ax * ewShade) / sum;

                    // side boost for near-horizontal faces if desired (optional)
                    float isSide = 1.0 - step(sideThreshold, ay); // 1 if abs(n.y) < sideThreshold
                    axisShade *= mix(1.0, sideBoost, isSide);

                    // Simple world-space directional lighting (no viewMatrix transform needed)
                    float skyL = max(dot(normalize(skyDir), n), 0.0) * skyIntensity;
                    float blockL = max(dot(normalize(blockDir), n), 0.0) * blockIntensity;
                    float light = clamp(ambientIntensity + skyL + blockL, 0.0, 2.0);

                    vec3 resultLinear = texLinear * axisShade * light;
                    vec3 resultSRGB = linearToSRGB(resultLinear);

                    gl_FragColor = vec4(resultSRGB, t.a);
                    }`,
                transparent: true
            });

            newMats.push(mat)
        }
        mesh.material = newMats;

        // Position
        if(displayData.translation)
        { mesh.position.set(displayData.translation[0], displayData.translation[1], displayData.translation[2]) }
        if(displayData.rotation)
        { mesh.rotation.set(THREE.MathUtils.degToRad(-displayData.rotation[0]), THREE.MathUtils.degToRad(-displayData.rotation[1]), THREE.MathUtils.degToRad(-displayData.rotation[2])) }
        if(displayData.scale)
        { mesh.scale.set(displayData.scale[0], displayData.scale[1], displayData.scale[2]) }

        // Scene
        const s = new THREE.Scene();
        const g = new THREE.Group()
        s.add(g)

        g.add(mesh)

        // Camera
        const c = new THREE.OrthographicCamera(-.5, .5, .5, -.5)
        c.position.setZ(-1)
        c.lookAt(mesh.position)
        g.add(c)

        if(displayData.rotation)
        { g.rotation.set(THREE.MathUtils.degToRad(displayData.rotation[0]), THREE.MathUtils.degToRad(displayData.rotation[1]), THREE.MathUtils.degToRad(displayData.rotation[2])) }

        // Render
        const target = new THREE.WebGLRenderTarget(width, height,{
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType
        });

        renderer.setRenderTarget(target);
        renderer.clear(false, true, false);
        renderer.render( s, c )

        const pixels = new Uint8Array(width * height * 4);
        renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);

        for (let y = 0; y < height; y++)
        {
            for (let x = 0; x < width; x++)
            {
                const src = ((height - y - 1) * width + x) * 4;
                const dst = (y * width + x) * 4;
                imageData.data[dst] = pixels[src];
                imageData.data[dst + 1] = pixels[src + 1];
                imageData.data[dst + 2] = pixels[src + 2];
                imageData.data[dst + 3] = pixels[src + 3];
            }
        }
        ctx.putImageData(imageData, 0, 0);

        // canvas.style.position = 'fixed'
        // canvas.style.left = '50vw'
        // canvas.style.top = '50vh'
        // canvas.style.translate = '-50% -50%'
        // document.body.appendChild(canvas)

        renderer.setRenderTarget(null);
        renderer.clear(false, true, false);
        
        return canvas.toDataURL();
    }

    // Instancing
    async create(x, y, z, faces = [true, true, true, true, true, true], biomes)
    {
        // Biomes
        const color = faces.includes(true) ? await this.computeBiomeColor(biomes) : 0xffffff

        // Parts
        this.createPart(x, y, z, 0, color)
        for (let i = 0; i < 6; i++)
        {
            if(!faces[i]){continue}
            this.createPart(x, y, z, i+1, color)
        }
    }
    createPart(x, y, z, index, color = 0xffffff)
    {
        if (!this.parts[index]) return;
        const key = `${x},${y},${z}`;

        let posToIdx = this.positionToIndex.get(key);
        if(posToIdx && posToIdx[index] !== undefined) { return }

        const part = this.parts[index];
        if(part.instancedCount >= part.capacity) { this.extendCapacity(index, Math.max(1, part.capacity * 2)); }

        if(!part.meshes) {return}
        const idx = part.instancedCount;

        const tmp = this._tmpMatrix || (this._tmpMatrix = new THREE.Matrix4());
        tmp.makeTranslation(x, y, z);

        for(const mesh of part.meshes)
        {
            mesh.setMatrixAt(idx, tmp);

            if(mesh.userData.tinted)
            {
                mesh.setColorAt(idx, new THREE.Color(color));
                mesh.instanceColor.needsUpdate = true;
            }

            mesh.count = part.instancedCount+1;
            mesh.instanceMatrix.needsUpdate = true;
        }

        if(!posToIdx) { posToIdx = new Array(7); }
        posToIdx[index] = idx;
        this.positionToIndex.set(key, posToIdx);

        part.indexToPosition[idx] = key;
        part.instancedCount++;
    }
    extendCapacity(index, newCapacity)
    {
        if(!this.parts[index] || !this.parts[index].meshes || this.parts[index].capacity >= newCapacity){return}
        
        for(const mesh of this.parts[index].meshes)
        {
            // Resize
            const oldMatrices = new Float32Array(this.parts[index].capacity * 16);
            mesh.instanceMatrix.array.slice(0, oldMatrices.length).forEach((v, i) => oldMatrices[i] = v);

            // Create new larger buffer
            const newArray = new Float32Array(newCapacity * 16);
            newArray.set(oldMatrices);

            // Replace GPU attribute
            mesh.instanceMatrix = new THREE.InstancedBufferAttribute(newArray, 16);
            mesh.geometry.setAttribute('instanceMatrix', mesh.instanceMatrix);
            mesh.instanceMatrix.needsUpdate = true;

            if(mesh.userData.tinted)
            {
                const oldColorArr = mesh.instanceColor && mesh.instanceColor.array ? mesh.instanceColor.array : null;
                const newColorArr = new Float32Array(newCapacity * 3);

                if (oldColorArr)
                {
                    newColorArr.set(oldColorArr);
                    for (let i = oldColorArr.length; i < newColorArr.length; i += 3)
                    {
                        newColorArr[i] = 1.0;
                        newColorArr[i + 1] = 1.0;
                        newColorArr[i + 2] = 1.0;
                    }
                }
                else
                {
                    for (let i = 0; i < newColorArr.length; i += 3)
                    {
                        newColorArr[i] = 1.0;
                        newColorArr[i + 1] = 1.0;
                        newColorArr[i + 2] = 1.0;
                    }
                }

                mesh.instanceColor = new THREE.InstancedBufferAttribute(newColorArr, 3);
                if (THREE.DynamicDrawUsage) mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
                mesh.geometry.setAttribute('instanceColor', mesh.instanceColor);
                mesh.instanceColor.needsUpdate = true;
            }
        }

        this.parts[index].indexToPosition = this.parts[index].indexToPosition.concat(new Array(newCapacity))

        this.parts[index].capacity = newCapacity;
    }
    delete(x, y, z)
    {
        for (let i = 0; i <= 6; i++)
        {
            this.deletePart(x, y, z, i)
        }

        return
        const key = `${x},${y},${z}`;
        const keysData = this.positionToIndex.get(key);
        if (keysData === undefined) return false;
        
        for (let i = 0; i < 7; i++)
        {
            if(!this.parts[i] || keysData[i]==undefined) { continue }
            const index = keysData[i];
            const last = this.parts[i].instancedCount - 1;

            if(index !== last)
            {
                const tmp = this._tmpMatrix || (this._tmpMatrix = new THREE.Matrix4());

                this.parts[i].mesh.getMatrixAt(last, tmp);
                this.parts[i].mesh.setMatrixAt(index, tmp);

                const movedKey = this.parts[i].indexToPosition[last];
                if (movedKey !== undefined)
                {
                    this.positionToIndex.set(movedKey, index);
                    this.parts[i].indexToPosition[index] = movedKey;
                }
            }

            this.positionToIndex.delete(key);
            this.parts[i].indexToPosition.pop()

            this.parts[i].instancedCount--;
            this.parts[i].mesh.count = this.instancedCount;

            this.parts[i].mesh.instanceMatrix.needsUpdate = true;
        }
    }
    deletePart(x, y, z, i)
    {
        const key = `${x},${y},${z}`;
        const keysData = this.positionToIndex.get(key);
        if (!keysData || keysData[i] === undefined || keysData[i] === null) return;

        const meshData = this.parts[i];

        const index = keysData[i];
        const last = meshData.instancedCount - 1;
        if (index < 0 || last < 0) return;

        for(const mesh of meshData.meshes)
        {
            if (index !== last)
            {
                const tmp = this._tmpMatrix || (this._tmpMatrix = new THREE.Matrix4());
                mesh.getMatrixAt(last, tmp);
                mesh.setMatrixAt(index, tmp);

                if(mesh.userData.tinted)
                {
                    const tmpColor = new THREE.Color();
                    mesh.getColorAt(last, tmpColor);
                    mesh.setColorAt(index, tmpColor);
                    mesh.instanceColor.needsUpdate = true
                }


                const movedKey = meshData.indexToPosition[last];
                if (movedKey !== undefined)
                {
                    const movedKeysData = this.positionToIndex.get(movedKey);
                    if (movedKeysData) movedKeysData[i] = index;

                    meshData.indexToPosition[index] = movedKey;
                }
            }
            
            mesh.count = meshData.instancedCount-1;
            mesh.instanceMatrix.needsUpdate = true;
        }

        meshData.indexToPosition.pop();
        keysData[i] = undefined;
        this.positionToIndex.set(key, keysData);
        meshData.instancedCount--;
    }
    computeBoundingSphere()
    {
        for(const p of this.parts)
        {
            if(!p?.meshes){continue}
            for(const m of p.meshes) { m.computeBoundingSphere(); }
        }
    }

    // Masking
    static tagFaceByPosition(geometry)
    {
        const geom = geometry.index ? geometry.toNonIndexed() : geometry.clone();
        const pos = geom.attributes.position;
        const faceMaskPow = new Float32Array(pos.count);

        for (let i = 0; i < pos.count; i += 3)
        {
            const x0 = pos.getX(i), y0 = pos.getY(i), z0 = pos.getZ(i);
            const x1 = pos.getX(i + 1), y1 = pos.getY(i + 1), z1 = pos.getZ(i + 1);
            const x2 = pos.getX(i + 2), y2 = pos.getY(i + 2), z2 = pos.getZ(i + 2);

            let fid = -1;
            if (x0 === 0.5 && x1 === 0.5 && x2 === 0.5) fid = 0; // +X
            else if (x0 === -0.5 && x1 === -0.5 && x2 === -0.5) fid = 1; // -X
            else if (y0 === 0.5 && y1 === 0.5 && y2 === 0.5) fid = 2; // +Y
            else if (y0 === -0.5 && y1 === -0.5 && y2 === -0.5) fid = 3; // -Y
            else if (z0 === 0.5 && z1 === 0.5 && z2 === 0.5) fid = 4; // +Z
            else if (z0 === -0.5 && z1 === -0.5 && z2 === -0.5) fid = 5; // -Z

            const pow = (fid === -1) ? 0.0 : Math.pow(2, fid);
            faceMaskPow[i] = faceMaskPow[i + 1] = faceMaskPow[i + 2] = pow;
        }

        geom.setAttribute('faceMaskPow', new THREE.Float32BufferAttribute(faceMaskPow, 1));
        return geom;
    }
    static computeInstanceMask(sides)
    {
        let mask = 0;
        if (sides[0]) mask |= 1 << 0; // +X
        if (sides[1]) mask |= 1 << 1; // -X
        if (sides[2]) mask |= 1 << 2; // +Y
        if (sides[3]) mask |= 1 << 3; // -Y
        if (sides[4]) mask |= 1 << 4; // +Z
        if (sides[5]) mask |= 1 << 5; // -Z
        return mask;
    }
    static decodeMaskFromFloat(float)
    {
        const mask = Math.floor(float);
        const bits = [];
        for (let i = 0; i < 6; i++)
        {
            bits.push(!!(mask & (1 << i)));
        }
        return bits;
    }

    // Biome
    colormapContext
    async computeBiomeColor(biomes)
    {
        const ctx = this.colormapContext;
        if (!ctx) return this._blackColor ??= new THREE.Color(0x000000);

        if(!this._colormapCache)
        {
            const { width, height } = ctx.canvas;
            this._colormapCache =
            {
                width,
                height,
                data: ctx.getImageData(0, 0, width, height).data
            };
        }

        const { width, data } = this._colormapCache;
        let r = 0, g = 0, b = 0;

        for (let i = 0, len = biomes.length; i < len; i++)
        {
            const biome = biomes[i];
            const bd = biome.data;
            if (!bd) continue;

            const t = bd.temperature;
            const adjustedHum = bd.downfall * t;
            const x = 256 - (t * 255 | 0);
            const y = 256 - (adjustedHum * 255 | 0);
            const idx = ((y * width) + x) << 2;

            const w = biome.weight;
            r += data[idx] * w;
            g += data[idx + 1] * w;
            b += data[idx + 2] * w;
        }

        (this._color ??= new THREE.Color()).setRGB(r / 255, g / 255, b / 255);
        return this._color;
    }
}