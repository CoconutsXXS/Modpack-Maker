import * as THREE from "three"
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import pako from "pako";
import * as nbt from "nbt-ts"
import * as path from "path"
import * as lodash from "lodash-es"
import { ModpackJar } from "./jar-data";
import { mergeGroupOptimizedChunked } from "../renderer/mesh-optimizer"
import RAPIER from '@dimforge/rapier3d-compat';

import { decodeSectionFromObject } from "./diagnostic/chunkDecoder"
import { color } from "@codemirror/theme-one-dark";

let cache =
{
    texture: [],
    geometries: [],
    physicGeometries: [],
    colliderShapes: [],
    collider: null
}
export class Block
{
    name = ""
    properties = {}
    propertiesString = ""
    blockstate = {}

    sourceJar

    originalGraphic
    graphic
    aabb

    position = {x: 0, y: 0, z: 0}
    coveredFaces = [false, false, false, false, false, false]
    visibleSides = [true, true, true, true, true, true]

    originalPhysicGeometry
    physicGeometry

    static async from(name, properties = {}, sourceJar, opts = {rx: 0, ry: 0, side: [true, true, true, true, true, true], scale: 1 / 16, collider: false})
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

        if(properties=={}||files.length==0){files.push({model: name})}

        // 3D Model
        result.graphic = new THREE.BufferGeometry()
        let materials = []
        for(const f of files)
        {
            let model = JSON.parse(await result.sourceJar.resolveAsset(f.model, ['models']))
            if(model==undefined)
            {
                // console.error(f.model, ['models'], "is undefined!");
                continue
            }
            
            const {
                loader = new THREE.TextureLoader(),
                scale = 1 / 16,
                rx= 0,
                ry = 0,
                sides = [true, true, true, true, true, true]
            } = opts;

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
                            tex.generateMipmaps = false;
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
                const resolved = data?.url?`data:image/png;base64,${data?.url}`:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR42mPABX4w/MCKaKJhVMPgcOuoBgDZRfgBVl5QdQAAAABJRU5ErkJggg==';
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
                const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: false, side: THREE.FrontSide, alphaTest: .5, shadowSide: THREE.FrontSide, clipShadows: true, clipIntersection: true });
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
                }
            }

            const geometries = [];

            let coveredFaces = result.coveredFaces.map(v=>{if(v){return 2}else{return 0}})

            const materialEntries = Object.entries(materialGroups).sort();
            for (const [path, group] of materialEntries)
            {
                if (group.vertices.length === 0) continue;
                let geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.Float32BufferAttribute(group.vertices, 3));
                geom.setAttribute('uv', new THREE.Float32BufferAttribute(group.uvs, 2));
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

                const positionAttr = geom.getAttribute('position');
                {
                    const index = geom.getIndex();
                    const newIndex = [];

                    for (let i = 0; i < index.count; i += 3)
                    {
                        const a = index.getX(i);
                        const b = index.getX(i + 1);
                        const c = index.getX(i + 2);

                        const v = [new THREE.Vector3().fromBufferAttribute(positionAttr, a),new THREE.Vector3().fromBufferAttribute(positionAttr, b),new THREE.Vector3().fromBufferAttribute(positionAttr, c)];

                        // TODO: Ignore if transparent
                        let isFullSide = true;
                        for (let i2 = 0; i2 < 3; i2++)
                        {
                            if(Math.abs(v[i2].x) != 0.5 || Math.abs(v[i2].y) != 0.5 || Math.abs(v[i2].z) != 0.5){isFullSide=false;continue}
                        }

                        if(v[0].x == 0.5 && v[1].x == 0.5 && v[2].x == 0.5) { if(isFullSide){coveredFaces[0]++} if(!sides[0]){continue} }
                        if(v[0].x == -0.5 && v[1].x == -0.5 && v[2].x == -0.5) { if(isFullSide){coveredFaces[1]++} if(!sides[1]){continue} }
                        if(v[0].y == 0.5 && v[1].y == 0.5 && v[2].y == 0.5) { if(isFullSide){coveredFaces[2]++} if(!sides[2]){continue} }
                        if(v[0].y == -0.5 && v[1].y == -0.5 && v[2].y == -0.5) { if(isFullSide){coveredFaces[3]++} if(!sides[3]){continue} }
                        if(v[0].z == 0.5 && v[1].z == 0.5 && v[2].z == 0.5) { if(isFullSide){coveredFaces[4]++} if(!sides[4]){continue} }
                        if(v[0].z == -0.5 && v[1].z == -0.5 && v[2].z == -0.5) { if(isFullSide){coveredFaces[5]++} if(!sides[5]){continue} }

                        // Keep
                        newIndex.push(a, b, c);
                    }

                    geom.setIndex(newIndex);
                    geom.computeVertexNormals();
                }

                if(geom.index.count < 3){continue}
                geometries.push(geom)

                materials.push(materialCache[path] || new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.FrontSide }))
            }

            result.coveredFaces = coveredFaces.map(v=>v>=2)

            if(geometries.length == 0){continue}

            if(!result.graphic.attributes || !result.graphic.attributes.position || result.graphic.attributes.position.count == 0)
            {
                result.graphic = BufferGeometryUtils.mergeGeometries(geometries.map(c=>c.toNonIndexed()), true);
                continue
            }
            result.graphic = BufferGeometryUtils.mergeGeometries([(result.graphic.index?result.graphic.toNonIndexed():result.graphic), ...(geometries.map(c=>c.toNonIndexed()))], true)
        }

        if(!result.graphic.getAttribute("position"))
        {
            result.graphic = new THREE.Mesh()
        }
        else
        {
            result.graphic = new THREE.Mesh(BufferGeometryUtils.mergeVertices(result.graphic), materials)
        }
        result.graphic.castShadow = result.graphic.receiveShadow = true
        result.originalGraphic = result.graphic.clone(true)

        // Physic
        result.originalPhysicGeometry = result.physicGeometry = new THREE.BoxGeometry(1, 1, 1)

        return result
    }

    add(scene = null)
    {
        if(!this.graphic.geometry?.index){return}

        window.scene.attach(this.graphic)
        this.graphic.position.set(this.position.x, this.position.y, this.position.z);
        this.aabb = new THREE.Box3(new THREE.Vector3(this.position.x, this.position.y, this.position.z), new THREE.Vector3(this.position.x+1, this.position.y+1, this.position.z+1));
        if(scene) { scene.attach(this.graphic) }
    }
    remove()
    {
        this.graphic.removeFromParent()
        if(this.originalGraphic){this.originalGraphic.removeFromParent()}
        if(this.physic){window.world.removeCollider(this.physic)}
        delete this
    }

    getDirectNeighboors(neighboors)
    {
        return [
            neighboors.find(n=>n.graphic?.parent && n.position.x==this.position.x+1 && n.position.z==this.position.z && n.position.y==this.position.y),
            neighboors.find(n=>n.graphic?.parent && n.position.x==this.position.x-1 && n.position.z==this.position.z && n.position.y==this.position.y),
            neighboors.find(n=>n.graphic?.parent && n.position.x==this.position.x && n.position.z==this.position.z && n.position.y==this.position.y+1),
            neighboors.find(n=>n.graphic?.parent && n.position.x==this.position.x && n.position.z==this.position.z && n.position.y==this.position.y-1),
            neighboors.find(n=>n.graphic?.parent && n.position.x==this.position.x && n.position.z==this.position.z+1 && n.position.y==this.position.y),
            neighboors.find(n=>n.graphic?.parent && n.position.x==this.position.x && n.position.z==this.position.z-1 && n.position.y==this.position.y)
        ]
    }
    computeSides(neighboors)
    {
        let direct = this.getDirectNeighboors(neighboors)

        this.updateSide([
            direct[0]?(!direct[0].coveredFaces[1]):true,
            direct[1]?(!direct[1].coveredFaces[0]):true,
            direct[2]?(!direct[2].coveredFaces[3]):true,
            direct[3]?(!direct[3].coveredFaces[2]):true,
            direct[4]?(!direct[4].coveredFaces[5]):true,
            direct[5]?(!direct[5].coveredFaces[4]):true,
        ])
    }
    updateSide(sides = [true, true, true, true, true, true])
    {
        sides = sides.map((s, i) => { if(s==null){return this.visibleSides[i]} return s; })
        this.visibleSides = sides;
        if(!this.originalGraphic) { console.warn("No original model for",this.name,"causing side culling issues..."); return }

        const parent = this.graphic.parent

        if(!this.graphic.isMesh || !this.graphic.geometry || !this.graphic.geometry.getAttribute("position")){return}

        let cached = cache.geometries.find(c=>JSON.stringify(c.sides)==JSON.stringify(sides) && c.name==this.name && c.propertiesString==this.propertiesString)
        if(cached) { this.graphic.geometry = cached.geometry; !parent || parent.add(this.graphic); }
        else
        {
            const pos = this.graphic.position
            this.graphic.removeFromParent()
            this.graphic = this.originalGraphic.clone(true)
            this.graphic.position.set(pos.x,pos.y,pos.z)

            this.graphic.geometry = this.graphic.geometry.clone()
            
            if(!this.graphic.geometry.index)
            { this.graphic.geometry = BufferGeometryUtils.mergeVertices(this.graphic.geometry); }

            const positionAttr = this.graphic.geometry.getAttribute('position');

            const index = this.graphic.geometry.getIndex();
            const newIndex = [];

            const oldGroups = this.graphic.geometry.groups.map(g => ({ ...g }));
            const removedTriangles = new Set();

            for (let i = 0; i < index.count; i += 3)
            {
                const a = index.getX(i);
                const b = index.getX(i + 1);
                const c = index.getX(i + 2);

                const v = [new THREE.Vector3().fromBufferAttribute(positionAttr, a),new THREE.Vector3().fromBufferAttribute(positionAttr, b),new THREE.Vector3().fromBufferAttribute(positionAttr, c)];

                if((!sides[0] && v[0].x == 0.5 && v[1].x == 0.5 && v[2].x == 0.5) ||
                    (!sides[1] && v[0].x == -0.5 && v[1].x == -0.5 && v[2].x == -0.5) ||
                    (!sides[2] && v[0].y == 0.5 && v[1].y == 0.5 && v[2].y == 0.5) ||
                    (!sides[3] && v[0].y == -0.5 && v[1].y == -0.5 && v[2].y == -0.5) ||
                    (!sides[4] && v[0].z == 0.5 && v[1].z == 0.5 && v[2].z == 0.5) ||
                    (!sides[5] && v[0].z == -0.5 && v[1].z == -0.5 && v[2].z == -0.5))
                {
                    removedTriangles.add(i)
                    continue
                }

                // Keep
                newIndex.push(a, b, c);
            }

            let shift = 0;
            for (const g of oldGroups)
            {
                const startTri = g.start;
                const endTri = g.start + g.count;

                let kept = 0;
                for(let tri = startTri; tri < endTri; tri += 3)
                {
                    if (!removedTriangles.has(tri)) kept += 3;
                }

                g.start -= shift;
                g.count = kept;
                shift += (endTri - startTri) - kept;
            }
            this.graphic.geometry.groups = oldGroups.filter(g => g.count > 0);

            this.graphic.geometry.setIndex(newIndex);
            this.graphic.geometry.computeVertexNormals();

            !parent || parent.add(this.graphic)

            cache.geometries.push
            ({
                sides: sides,
                name: this.name,
                propertiesString: this.propertiesString,
                geometry: this.graphic.geometry
            })
        }

        if(this.originalPhysicGeometry)
        {
            let cached = cache.physicGeometries.find(c=>JSON.stringify(c.sides)==JSON.stringify(sides) && c.name==this.name && c.propertiesString==this.propertiesString)
            if(cached) { this.physicGeometry = cached.geometry; }
            else
            {
                this.physicGeometry = this.originalPhysicGeometry.clone()

                const positionAttr = this.physicGeometry.getAttribute('position');

                const index = this.physicGeometry.getIndex();
                const newIndex = [];


                for (let i = 0; i < index.count; i += 3)
                {
                    const a = index.getX(i);
                    const b = index.getX(i + 1);
                    const c = index.getX(i + 2);

                    const v = [new THREE.Vector3().fromBufferAttribute(positionAttr, a),new THREE.Vector3().fromBufferAttribute(positionAttr, b),new THREE.Vector3().fromBufferAttribute(positionAttr, c)];

                    if((!sides[0] && v[0].x == 0.5 && v[1].x == 0.5 && v[2].x == 0.5) ||
                        (!sides[1] && v[0].x == -0.5 && v[1].x == -0.5 && v[2].x == -0.5) ||
                        (!sides[2] && v[0].y == 0.5 && v[1].y == 0.5 && v[2].y == 0.5) ||
                        (!sides[3] && v[0].y == -0.5 && v[1].y == -0.5 && v[2].y == -0.5) ||
                        (!sides[4] && v[0].z == 0.5 && v[1].z == 0.5 && v[2].z == 0.5) ||
                        (!sides[5] && v[0].z == -0.5 && v[1].z == -0.5 && v[2].z == -0.5))
                    {
                        continue
                    }

                    newIndex.push(a, b, c);
                }

                this.physicGeometry.setIndex(newIndex);
                this.physicGeometry.computeVertexNormals();

                cache.physicGeometries.push
                ({
                    sides: sides,
                    name: this.name,
                    propertiesString: this.propertiesString,
                    geometry: this.physicGeometry
                })
            }
        }
    }

    clone()
    {
        let result = new Block();
        result.name = this.name
        result.properties = this.properties
        result.blockstate = this.blockstate
        result.sourceJar = this.sourceJar

        result.coveredFaces = this.coveredFaces

        result.graphic = this.graphic.clone();
        result.originalGraphic = this.originalGraphic

        result.physicGeometry = this.physicGeometry
        result.originalPhysicGeometry = this.originalPhysicGeometry

        return result
    }
}
export class BlockModel
{
    name = ""
    properties = {}
    propertiesString = ""
    blockstate = {}

    sourceJar

    parts = new Array(7)

    positionToIndex = new Map()
    indexToPosition = new Map()
    aabb

    coveredFaces = [false, false, false, false, false, false]

    physicGeometry

    static async from(name, properties = {}, sourceJar, capacity = 32)
    {
        let result = new BlockModel()
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

        if(properties=={}||files.length==0){files.push({model: name})}


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

            // Colormap
            if(model.elements?.find(e=>Object.entries(e?.faces).find(([,f])=>f?.tintindex!=undefined)) && !result.colormapContext)
            {
                console.log(model, "is tinted")
                let name = "grass";

                const colormap = await sourceJar.resolveAsset(name, ['textures', 'colormap'])
                if(colormap?.url)
                {
                    const resolved = `data:image/png;base64,${colormap?.url}`

                    const tex = cache.texture[resolved] ? cache.texture[resolved] : await new Promise((resolve) =>
                    {
                        const img = new Image()
                        img.onload = () => { resolve(img) }
                        img.src = resolved;
                    })

                    const canvas = document.createElement("canvas");
                    canvas.style.position = 'fixed'; canvas.style.left = canvas.style.top = 0;
                    document.body.appendChild(canvas)

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
                            tex.generateMipmaps = false;
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
                const resolved = data?.url?`data:image/png;base64,${data?.url}`:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR42mPABX4w/MCKaKJhVMPgcOuoBgDZRfgBVl5QdQAAAABJRU5ErkJggg==';
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
                const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: false, side: THREE.FrontSide, alphaTest: .5, shadowSide: THREE.FrontSide, clipShadows: true, clipIntersection: true });
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

                    const colors = new Array(group.vertices.length*3);
                    if(face.tintindex != undefined)
                    {
                        for (let i = 0; i < group.vertices.length; i++)
                        {
                            colors[i] = 0
                        }
                    }
                    else
                    {
                        for (let i = 0; i < group.vertices.length; i++)
                        {
                            colors[i] = 255
                        }
                    }
                    group.color = colors;
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
                geom.setAttribute('color', new THREE.Float32BufferAttribute(group.color, 3));
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

                    if (!(v0Corner && v1Corner && v2Corner))
                    {
                        groups[0].push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
                        const ub = vi * 2;
                        if (hasUV)
                        {
                            groupUVs[0].push(uvArray[ub], uvArray[ub + 1], uvArray[ub + 2], uvArray[ub + 3], uvArray[ub + 4], uvArray[ub + 5]);
                        }
                        if(hasColor)
                        {
                            groupColor[0].push(colorArray[ub], colorArray[ub + 1], colorArray[ub + 2], colorArray[ub + 3], colorArray[ub + 4], colorArray[ub + 5])
                        }
                        continue;
                    }

                    const isPosX = Math.abs(x0 - 0.5) < EPS && Math.abs(x1 - 0.5) < EPS && Math.abs(x2 - 0.5) < EPS;
                    const isNegX = Math.abs(x0 + 0.5) < EPS && Math.abs(x1 + 0.5) < EPS && Math.abs(x2 + 0.5) < EPS;
                    const isPosY = Math.abs(y0 - 0.5) < EPS && Math.abs(y1 - 0.5) < EPS && Math.abs(y2 - 0.5) < EPS;
                    const isNegY = Math.abs(y0 + 0.5) < EPS && Math.abs(y1 + 0.5) < EPS && Math.abs(y2 + 0.5) < EPS;
                    const isPosZ = Math.abs(z0 - 0.5) < EPS && Math.abs(z1 - 0.5) < EPS && Math.abs(z2 - 0.5) < EPS;
                    const isNegZ = Math.abs(z0 + 0.5) < EPS && Math.abs(z1 + 0.5) < EPS && Math.abs(z2 + 0.5) < EPS;

                    if (isPosX)       { coveredFaces[0]++; groups[1].push(x0,y0,z0,x1,y1,z1,x2,y2,z2); if (hasColor) groupColor[1].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]); if (hasUV) groupUVs[1].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]); }
                    else if (isNegX)  { coveredFaces[1]++; groups[2].push(x0,y0,z0,x1,y1,z1,x2,y2,z2); if (hasColor) groupColor[2].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]); if (hasUV) groupUVs[2].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]); }
                    else if (isPosY)  { coveredFaces[2]++; groups[3].push(x0,y0,z0,x1,y1,z1,x2,y2,z2); if (hasColor) groupColor[3].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]); if (hasUV) groupUVs[3].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]); }
                    else if (isNegY)  { coveredFaces[3]++; groups[4].push(x0,y0,z0,x1,y1,z1,x2,y2,z2); if (hasColor) groupColor[4].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]); if (hasUV) groupUVs[4].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]); }
                    else if (isPosZ)  { coveredFaces[4]++; groups[5].push(x0,y0,z0,x1,y1,z1,x2,y2,z2); if (hasColor) groupColor[5].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]); if (hasUV) groupUVs[5].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]); }
                    else if (isNegZ)  { coveredFaces[5]++; groups[6].push(x0,y0,z0,x1,y1,z1,x2,y2,z2); if (hasColor) groupColor[6].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]); if (hasUV) groupUVs[6].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]); }
                    else
                    {
                        groups[0].push(x0,y0,z0,x1,y1,z1,x2,y2,z2);
                        if (hasUV) groupUVs[0].push(uvArray[vi*2],uvArray[vi*2+1],uvArray[vi*2+2],uvArray[vi*2+3],uvArray[vi*2+4],uvArray[vi*2+5]);
                        if (hasColor) groupColor[0].push(colorArray[vi*2],colorArray[vi*2+1],colorArray[vi*2+2],colorArray[vi*2+3],colorArray[vi*2+4],colorArray[vi*2+5]);
                    }
                }

                console.log(hasColor, groupColor)

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

                    splittedGeometries[i].push({geometry: newG, materialPath: path});
                }

                // Shader Culling

                let material = materialCache[path] || new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.FrontSide });
                materials.push(material)
            }

            result.coveredFaces = coveredFaces.map(v=>v>=2)
        }

        for (let i = 0; i < 7; i++)
        {
            if(splittedGeometries[i].length == 0) { splittedGeometries[i] = null; continue }

            const sideMaterials = splittedGeometries[i].map(o => materials.find(m=>m?.map?.source?.data?.currentSrc == o.materialPath));
            splittedGeometries[i] = BufferGeometryUtils.mergeVertices( BufferGeometryUtils.mergeGeometries(splittedGeometries[i].map(o => o.geometry), true) );

            console.log(splittedGeometries)
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

        return result
    }

    // Instancing
    async create(x, y, z, faces = [true, true, true, true, true, true], biomes)
    {
        // Biomes
        await this.computeBiomeColor(biomes)

        // Parts
        this.createPart(x, y, z, 0)
        for (let i = 0; i < 6; i++)
        {
            if(!faces[i]){continue}
            this.createPart(x, y, z, i+1)
        }
    }
    createPart(x, y, z, index)
    {
        if (!this.parts[index]) return;
        const key = `${x},${y},${z}`;

        let posToIdx = this.positionToIndex.get(key);
        if(posToIdx && posToIdx[index] !== undefined) { return }

        const part = this.parts[index];
        if(part.instancedCount >= part.capacity) { this.extendCapacity(index, Math.max(1, part.capacity * 2)); }

        const mesh = part.mesh;
        if(!mesh) {return}

        const idx = part.instancedCount;

        const tmp = this._tmpMatrix || (this._tmpMatrix = new THREE.Matrix4());
        tmp.makeTranslation(x, y, z);
        mesh.setMatrixAt(idx, tmp);

        if(mesh.geometry.getAttribute("color").array[0] == 0)
        {
            mesh.setColorAt(idx, new THREE.Color(1, 1, 1));
            mesh.instanceColor.needsUpdate = true;
            console.log(mesh)
        }


        if(!posToIdx) { posToIdx = new Array(7); }
        posToIdx[index] = idx;
        this.positionToIndex.set(key, posToIdx);

        part.indexToPosition[idx] = key;

        part.instancedCount++;
        mesh.count = part.instancedCount;
        mesh.instanceMatrix.needsUpdate = true;
    }
    extendCapacity(index, newCapacity)
    {
        if(!this.parts[index] || !this.parts[index].mesh || this.parts[index].capacity >= newCapacity){return}
        
        // Resize
        const oldMatrices = new Float32Array(this.parts[index].capacity * 16);
        this.parts[index].mesh.instanceMatrix.array.slice(0, oldMatrices.length).forEach((v, i) => oldMatrices[i] = v);

        // Create new larger buffer
        const newArray = new Float32Array(newCapacity * 16);
        newArray.set(oldMatrices);

        // Replace GPU attribute
        this.parts[index].mesh.instanceMatrix = new THREE.InstancedBufferAttribute(newArray, 16);
        this.parts[index].mesh.geometry.setAttribute('instanceMatrix', this.parts[index].mesh.instanceMatrix);
        this.parts[index].mesh.instanceMatrix.needsUpdate = true;

        this.parts[index].indexToPosition = this.parts[index].indexToPosition.concat(new Array(newCapacity))

        this.parts[index].capacity = newCapacity;
    }
    delete(x, y, z)
    {
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
        const mesh = meshData.mesh;
        const index = keysData[i];
        const last = meshData.instancedCount - 1;

        if (index < 0 || last < 0) return;

        if (index !== last)
        {
            const tmp = this._tmpMatrix || (this._tmpMatrix = new THREE.Matrix4());
            mesh.getMatrixAt(last, tmp);
            mesh.setMatrixAt(index, tmp);

            const movedKey = meshData.indexToPosition[last];
            if (movedKey !== undefined)
            {
                const movedKeysData = this.positionToIndex.get(movedKey);
                if (movedKeysData) movedKeysData[i] = index;

                meshData.indexToPosition[index] = movedKey;
            }
        }

        meshData.indexToPosition.pop();
        keysData[i] = undefined;
        this.positionToIndex.set(key, keysData);

        meshData.instancedCount--;
        mesh.count = meshData.instancedCount;

        mesh.instanceMatrix.needsUpdate = true;
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
    async computeBiomeColor(biomes, block = 'minecraft:grass')
    {
        if(!this.colormapContext){return new THREE.Color(0x000000);}

        let r = 0
        let g = 0
        let b = 0
        for(let biome of biomes)
        {
            if(!biome.data){continue}
            var p = this.colormapContext.getImageData(Math.floor(256 - (biome.data.temperature * 256)), Math.floor(256-(biome.data.downfall * 256)), 1, 1).data;
            r += p[0] * biome.weight
            g += p[1] * biome.weight
            b += p[2] * biome.weight
        }

        return new THREE.Color(r, g, b);
    }
}
function rgbToHex(r, g, b)
{
    if (r > 255 || g > 255 || b > 255) {throw "Invalid color component"}
    return ((r << 16) | (g << 8) | b).toString(16);
}


export async function parseModel(modelPath, modpackJar = new ModpackJar(), opts = {rx: 0, ry: 0, sides, loader: new THREE.TextureLoader(), scale: 1 / 16, center: false, collider: false})
{
    const {
        loader = new THREE.TextureLoader(),
        scale = 1 / 16,
        center = true,
        rx= 0,
        ry = 0,
        sides = [true, true, true, true, true, true]
    } = opts;

    let modelData = typeof(modelPath)=='string'?JSON.parse(await modpackJar.resolveAsset(modelPath)):modelPath

    // Parent heritage
    while(modelData.parent != undefined)
    {
        let parent = modelData.parent;
        let parentObj = JSON.parse(await modpackJar.resolveAsset(parent, ['models']));
        let nextParent = parentObj.parent;

        modelData = lodash.merge(parentObj, modelData);

        if(parent == nextParent) { modelData.parent = undefined }
        else { modelData.parent = nextParent; }
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

    const texturesMap = modelData.textures || {};
    const textureVarToPath = {};
    const resolvedPathsSet = new Set();
    for (const key in texturesMap)
    {
        let raw = texturesMap[key];
        if(raw.startsWith('#')){raw = texturesMap[raw.replace(/^#/, '')]}
        const data = await modpackJar.resolveAsset(raw, ['textures'])
        const resolved = data?.url?`data:image/png;base64,${data?.url}`:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR42mPABX4w/MCKaKJhVMPgcOuoBgDZRfgBVl5QdQAAAABJRU5ErkJggg==';
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
        const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: false, side: THREE.FrontSide, alphaTest: .5, shadowSide: THREE.FrontSide, clipShadows: true, clipIntersection: true });
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

    const elements = modelData.elements || [];
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

    // Which side does the block hides
    // 0 = none; 1 = half (a triangle); 2 = full (full plane)
    let covering = [0, 0, 0, 0, 0, 0]

    const parentGroup = new THREE.Group();
    parentGroup.position.set(0, 0, 0);

    const materialEntries = Object.entries(materialGroups).sort();
    for (const [path, group] of materialEntries)
    {
        if (group.vertices.length === 0) continue;
        let geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(group.vertices, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(group.uvs, 2));
        geom.setIndex(new THREE.Uint16BufferAttribute(group.indices, 1));

        const tempTranslationMatrix = new THREE.Matrix4();
        tempTranslationMatrix.makeTranslation(0, -0.5, 0)
        geom.applyMatrix4(tempTranslationMatrix);
        geom.computeVertexNormals();

        const rotationXMatrix = new THREE.Matrix4().makeRotationX(rx);
        geom.applyMatrix4(rotationXMatrix);
        geom.computeVertexNormals();

        const rotationYMatrix = new THREE.Matrix4().makeRotationY(ry);
        geom.applyMatrix4(rotationYMatrix);
        geom.computeVertexNormals();

        const positionAttr = geom.getAttribute('position');
        {
            const index = geom.getIndex();
            const newIndex = [];

            for (let i = 0; i < index.count; i += 3)
            {
                const a = index.getX(i);
                const b = index.getX(i + 1);
                const c = index.getX(i + 2);

                const v = [new THREE.Vector3().fromBufferAttribute(positionAttr, a),new THREE.Vector3().fromBufferAttribute(positionAttr, b),new THREE.Vector3().fromBufferAttribute(positionAttr, c)];

                let isFullSide = true;
                for (let i2 = 0; i2 < 3; i2++)
                {
                    if(Math.abs(v[i2].x) != 0.5 || Math.abs(v[i2].y) != 0.5 || Math.abs(v[i2].z) != 0.5){isFullSide=false;continue}
                }

                if(v[0].x == 0.5 && v[1].x == 0.5 && v[2].x == 0.5) { if(isFullSide){covering[0]++} if(!sides[0]){continue} }
                if(v[0].x == -0.5 && v[1].x == -0.5 && v[2].x == -0.5) { if(isFullSide){covering[1]++} if(!sides[1]){continue} }
                if(v[0].y == 0.5 && v[1].y == 0.5 && v[2].y == 0.5) { if(isFullSide){covering[2]++} if(!sides[2]){continue} }
                if(v[0].y == -0.5 && v[1].y == -0.5 && v[2].y == -0.5) { if(isFullSide){covering[3]++} if(!sides[3]){continue} }
                if(v[0].z == 0.5 && v[1].z == 0.5 && v[2].z == 0.5) { if(isFullSide){covering[4]++} if(!sides[4]){continue} }
                if(v[0].z == -0.5 && v[1].z == -0.5 && v[2].z == -0.5) { if(isFullSide){covering[5]++} if(!sides[5]){continue} }

                // Keep
                newIndex.push(a, b, c);
            }

            geom.setIndex(newIndex);
            geom.computeVertexNormals();
        }

        const mat = materialCache[path] || new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.FrontSide });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parentGroup.add(mesh);
    }

    covering = covering.map(v=>v==2)

    // if (missingGroup.vertices.length > 0)
    // {
    //     const geom = new THREE.BufferGeometry();
    //     geom.setAttribute('position', new THREE.Float32BufferAttribute(missingGroup.vertices, 3));
    //     geom.setAttribute('uv', new THREE.Float32BufferAttribute(missingGroup.uvs, 2));
    //     geom.setIndex(new THREE.Uint16BufferAttribute(missingGroup.indices, 1));

    //     const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff, side: THREE.FrontSide });
    //     const mesh = new THREE.Mesh(geom, mat);
    //     mesh.castShadow = true;
    //     mesh.receiveShadow = true;
    //     parentGroup.add(mesh);
    // }

    if(!opts.collider) { return {graphic: parentGroup} }

    // Physic
    else
    {
        let desc = RAPIER.ColliderDesc.cuboid(.5, .5, .5);
        desc.setTranslation(0.5, 0, 0.5);

        return {graphic: parentGroup, physic: desc};
    }
}
async function paletteToModel(p, modpackJar = new ModpackJar(), physic = false)
{
    console.log(await Block.from(p.Name, p.Properties, modpackJar))
    // return

    let files = [];

    // await modpackJar.resolveAsset(p.Name, ['models'])

    // Properties & Modifications
    if(p.Properties || (p.Name && !(await modpackJar.resolveAsset(p.Name, ['models']))))
    {
        if(!p.Properties){p.Properties={}}
        let blockPropertiesString = Object.entries(p.Properties).map(([k, v]) => `${k}=${JSON.stringify(v).slice(1, JSON.stringify(v).length-1)}`).join(',');
        let blockstateJson = JSON.parse(await modpackJar.resolveAsset(p.Name, ["blockstates"]));

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
            console.log("No variant or multipart for", blockstateJson)
        }
    }
    else { files.push({model: p.Name}); }

    // Assembling
    let model = new THREE.Group();
    let colliders = []
    for(let f of files)
    {
        if(!f.model){ console.log(files, p); continue;}
        let json = JSON.parse(await modpackJar.resolveAsset(f.model, ['models']));

        if(!json){ console.log(f.model, ['models'], "do not exist"); continue; }
        
        if(!f.x){f.x=0} if(!f.y){f.y=0;}
        let modelPart = await parseModel(json, modpackJar, {rx: THREE.MathUtils.degToRad(-f.x), ry: THREE.MathUtils.degToRad(-f.y), sides: [true,true,true,true,true,true], center: true, collider: physic});

        // modelPart.rotation.order = 'XYZ';

        model.add(modelPart.graphic);
        if(physic) { colliders.push(modelPart.physic) }
    }

    // Finalizing
    return {graphic: model, physic: colliders};
}

export async function parseNbt(structurePath, modpackJar = new ModpackJar(), physic = false, optimize = false)
{
    // Read
    let data = typeof(structurePath)=='string'?(await modpackJar.resolveData(structurePath)).parsed:structurePath

    // Palette
    let palette = [];
    for(let p of data.palette) { palette.push(await Block.from(p.Name, p.Properties, modpackJar)) }

    // Blocks
    let blocks = [];
    for(let b of data.blocks)
    {
        if(!b || !palette[b.state]){continue;}

        let block = palette[b.state].clone();
        block.position = {x: b.pos[0], y: b.pos[1], z: b.pos[2]}
        blocks.push(block)
    }

    // Culling
    for(let b of blocks)
    {
        b.updateSide([
            (blocks.find(n=>n.position.x==b.position.x+1 && n.position.z==b.position.z && n.position.y==b.position.y)?.coveredFaces[1]==true)?false:true,
            (blocks.find(n=>n.position.x==b.position.x-1 && n.position.z==b.position.z && n.position.y==b.position.y)?.coveredFaces[0]==true)?false:true,
            (blocks.find(n=>n.position.x==b.position.x && n.position.y==b.position.y+1 && n.position.z==b.position.z)?.coveredFaces[3]==true)?false:true,
            (blocks.find(n=>n.position.x==b.position.x && n.position.y==b.position.y-1 && n.position.z==b.position.z)?.coveredFaces[2]==true)?false:true,
            (blocks.find(n=>n.position.x==b.position.x && n.position.y==b.position.y &&  n.position.z==b.position.z+1)?.coveredFaces[5]==true)?false:true,
            (blocks.find(n=>n.position.x==b.position.x && n.position.y==b.position.y &&  n.position.z==b.position.z-1)?.coveredFaces[4]==true)?false:true
        ])

        b.add()
    }
    
    return blocks;
}

export async function parseMca(filePath, position = {x: 0, y: 0}, size = {x: 1, y: 1}, modpackJar = new ModpackJar(), physic = false)
{
    console.group("Reading Region")
    
    // Read Region
    const region = Object.values(await ipcInvoke("readRegion", filePath));
    console.log(region)

    // Read chunks
    console.group("Getting chunks")
    let chunks = []
    for (let x = position.x; x < size.x+position.x; x++)
    {
        for (let y = position.y; y < size.y+position.y; y++)
        {
            console.log(x, y)
            chunks.push(region.find(r=>r.xPos==x&&r.zPos==y))
        }
    }
    console.groupEnd()

    // Palette
    let totalPalette = []
    for(const c of chunks)
    {
        for(const s of c.sections)
        {
            for(const p of s.block_states.palette)
            {
                if(totalPalette.findIndex(pal => lodash.isEqual(pal, p)) >= 0){continue}
                totalPalette.push(p)
            }
        }
    }
    let loadedModelPalette = []
    for(let p of totalPalette)
    {
        if(p.Name == 'minecraft:air' || p.Name == 'air'){loadedModelPalette.push(null); continue}
        loadedModelPalette.push(await Block.from(p.Name, p.Properties, modpackJar))
    }

    // Build
    let chunksContent = new Map()

    for (let levelIndex = 0; levelIndex < chunks.length; levelIndex++)
    {
        const level = chunks[levelIndex];
        console.groupCollapsed("Chunk #"+levelIndex, level)

        let chunkGroup = new THREE.Group();
        window.scene.add(chunkGroup)
        chunkGroup.position.set(level.xPos*16, level.yPos*16, level.zPos*16)

        // Helper
        let helper = new THREE.Mesh(new THREE.BoxGeometry(16, level.sections.length*16, 16), new THREE.MeshBasicMaterial({wireframe: true, color: 0xA00000}))
        // chunkGroup.add(helper)
        helper.position.set(7.5, level.sections.length*8-0.5, 7.5)
        const aabb = new THREE.Box3(new THREE.Vector3(level.xPos*16, level.yPos*16, level.zPos*16), new THREE.Vector3(level.xPos*16+16, level.yPos*16 + level.sections.length*16, level.zPos*16+16));
        
        // Get Palette Indexes
        let paletteIndexes = []
        for(const s of level.sections)
        {
            if(!s.block_states.data || !s.block_states.palette) { continue }
            if(s.block_states.palette.length==1&&(s.block_states.palette[0].Name == "air"||s.block_states.palette[0].Name == "minecraft:air")) { continue }

            // Model Palette
            let paletteRedirection = []
            for(let p of s.block_states.palette)
            {
                paletteRedirection.push(totalPalette.findIndex(pal => lodash.isEqual(pal, p)))
            }

            const paletteLen = Math.max(1, (s.block_states && s.block_states.palette || []).length);
            const bitsPerBlock = Math.max(4, Math.ceil(Math.log2(paletteLen)));
            const mask = (1n << BigInt(bitsPerBlock)) - 1n;

            const candLH = s.block_states.data.map(d =>
            {
                const low = BigInt.asUintN(32, BigInt(d[0]));
                const high = BigInt.asUintN(32, BigInt(d[1]));
                return (high << 32n) | low;
            });
            const candHL = s.block_states.data.map(d =>
            {
                const low = BigInt.asUintN(32, BigInt(d[0]));
                const high = BigInt.asUintN(32, BigInt(d[1]));
                return (low << 32n) | high;
            });

            const entriesPerLong = Math.floor(64 / bitsPerBlock);
            const requiredLongsAligned = Math.ceil(4096 / entriesPerLong);
            const requiredLongsStraddle = Math.ceil((4096 * bitsPerBlock) / 64);

            let longs = null;
            let mode = null;

            function sanityAligned(candidateLongs)
            {
                if (candidateLongs.length < requiredLongsAligned) return false;
                // sample first 64 indices to check indices fall in palette range
                for (let i = 0; i < Math.min(64, 4096); i++)
                {
                    const longIndex = Math.floor(i / entriesPerLong);
                    const within = i % entriesPerLong;
                    const offset = within * bitsPerBlock;
                    const val = Number((candidateLongs[longIndex] >> BigInt(offset)) & mask);
                    if (!Number.isFinite(val) || val < 0 || val >= paletteLen) return false;
                }
                return true;
            }

            function sanityStraddle(candidateLongs)
            {
                if (candidateLongs.length < requiredLongsStraddle) return false;
                // do a short sequential decode for first 256 indices and verify palette bounds
                let state = 0;
                let data = candidateLongs[0];
                let dataLength = 64n;
                for (let j = 0; j < Math.min(256, 4096); j++) {
                    const bits = bitsPerBlock;
                    if (dataLength < bits) {
                        state += 1;
                        if (state >= candidateLongs.length) return false;
                        const newData = candidateLongs[state];
                        // For straddling behavior, append the new long above the existing bits
                        data = (newData << dataLength) | data;
                        dataLength += 64n;
                    }
                    const paletteId = Number(data & mask);
                    if (!Number.isFinite(paletteId) || paletteId < 0 || paletteId >= paletteLen) return false;
                    data >>= BigInt(bits);
                    dataLength -= BigInt(bits);
                }
                return true;
            }

            if (sanityAligned(candLH))
            {
                longs = candLH;
                mode = "aligned";
            }
            else if (sanityAligned(candHL))
            {
                longs = candHL;
                mode = "aligned";
            }
            else if (sanityStraddle(candLH))
            {
                longs = candLH;
                mode = "straddle";
            }
            else if (sanityStraddle(candHL))
            {
                longs = candHL;
                mode = "straddle";
            }
            else
            {
                if (candLH.length >= requiredLongsAligned)
                {
                    longs = candLH;
                    mode = "aligned";
                    console.warn("block_states: pair-order and mode ambiguous — defaulting to [low,high]/aligned. You should verify results.");
                }
                else { throw new Error(`block_states.data seems invalid or truncated. Need at least ${Math.max(requiredLongsAligned, requiredLongsStraddle)} longs (aligned=${requiredLongsAligned}, straddle=${requiredLongsStraddle}) but got ${candLH.length}.`); }
            }

            if(mode === "aligned")
            {
                if (longs.length < requiredLongsAligned)
                {
                    throw new Error(`block_states.data too short for aligned mode: need ${requiredLongsAligned}, got ${longs.length}`);
                }
                for (let idx = 0; idx < 4096; idx++)
                {
                    const longIndex = Math.floor(idx / entriesPerLong);
                    const within = idx % entriesPerLong;
                    const offset = within * bitsPerBlock;
                    const paletteIndex = Number((longs[longIndex] >> BigInt(offset)) & mask);

                    if(paletteIndex >= paletteLen)
                    {
                        console.warn(`${paletteIndex} out of range.`)
                        paletteIndexes.push(null)
                        continue;
                    }
                    else if(paletteIndex > paletteRedirection)
                    {
                        console.warn(`${paletteIndex} is not included in the palette redirector...`)
                        paletteIndexes.push(null)
                        continue;
                    }
                    if(!loadedModelPalette[ paletteRedirection[paletteIndex] ]){paletteIndexes.push(null); continue}

                    paletteIndexes.push(paletteRedirection[paletteIndex]);
                }
            }
            else
            {
                if (longs.length < requiredLongsStraddle) {
                    throw new Error(`block_states.data too short for straddle mode: need ${requiredLongsStraddle}, got ${longs.length}`);
                }
                longs.push(0n, 0n);

                let state = 0;
                let data = longs[0];
                let dataLength = 64n;
                for (let j = 0; j < 4096; j++)
                {
                    if (dataLength < bitsPerBlock)
                    {
                        state += 1;
                        const newData = longs[state];
                        data = (newData << dataLength) | data;
                        dataLength += 64n;
                    }
                    const paletteIndex = Number(data & mask);

                    if(paletteIndex >= paletteLen)
                    {
                        console.warn(`${paletteIndex} out of range.`)
                        paletteIndexes.push(null)
                        continue;
                    }
                    else if(paletteIndex > paletteRedirection)
                    {
                        console.warn(`${paletteIndex} is not included in the palette redirector...`)
                        paletteIndexes.push(null)
                        continue;
                    }
                    if(!loadedModelPalette[ paletteRedirection[paletteIndex] ]){paletteIndexes.push(null); continue}

                    paletteIndexes.push(paletteRedirection[paletteIndex]);

                    data >>= BigInt(bitsPerBlock);
                    dataLength -= BigInt(bitsPerBlock);
                }
            }
        }

        // Placing Blocks
        let sections = []
        // let blocks = []
        const blocks = new Array(level.sections.length * 4096);

        for (let sectionIndex = 0; sectionIndex < level.sections.length; sectionIndex++)
        {
            const s = level.sections[sectionIndex]

            let sectionGroup = new THREE.Group();
            chunkGroup.add(sectionGroup)
            sectionGroup.position.set(0, (s.Y+4)*16, 0)

            const baseX = level.xPos * 16;
            const baseY = level.yPos * 16;
            const baseZ = level.zPos * 16;

            // Helper & AABB
            let helper = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), new THREE.MeshBasicMaterial({wireframe: true, color: 0xA0A000}))
            // sectionGroup.add(helper)
            helper.position.set(7.5, 7.5, 7.5)
            const aabb = new THREE.Box3(new THREE.Vector3(baseX, baseY + (s.Y + 4) * 16, baseZ), new THREE.Vector3(baseX + 16, baseY + (s.Y + 4) * 16 + 16, baseZ + 16));

            sections.push({group: sectionGroup, aabb})


            if(!s.block_states.data || !s.block_states.palette || s.block_states.palette.length==1&&(s.block_states.palette[0].Name == "air"||s.block_states.palette[0].Name == "minecraft:air"))
            {
                // blocks = blocks.concat(new Array(4096).map(() => null))
                continue
            }

            for(let idx = sectionIndex*4096; idx < sectionIndex*4096+4096; idx++)
            {
                const paletteIndex = paletteIndexes[idx]
                if(paletteIndex==null || !loadedModelPalette[ paletteIndex ])
                {
                    blocks.push(null)
                    continue
                }

                const y = idx >> 8;
                const z = (idx >> 4) & 15;
                const x = idx & 15;

                let b = loadedModelPalette[ paletteIndex ].clone()
                b.position = {x: baseX + x, y: baseY + y, z: baseZ + z}

                blocks[idx] = b
                // blocks.push(b)
                b.add(sectionGroup)
            }
        }

        chunksContent.set(`${level.xPos},${level.zPos}`, {level, aabb, group: chunkGroup, blocks, sections, collider: null})
        console.groupEnd()
    }

    function getBlockFromPos(x, y, z)
    {
        let chunk = chunksContent.get(`${Math.floor(x/16)},${Math.floor(z/16)}`)
        if(!chunk){ return 0}
        return chunk.blocks[ ((y - chunk.level.yPos*16) << 8) | ((z - chunk.level.zPos*16) << 4) | ( x - chunk.level.xPos*16) ]
    }

    // Culling
    chunksContent.forEach((chunk, k) =>
    {
        // Culling
        for(let b of chunk.blocks)
        {
            if(!b){continue}
            const px = getBlockFromPos(b.position.x+1, b.position.y, b.position.z)
            const nx = getBlockFromPos(b.position.x-1, b.position.y, b.position.z)
            const py = getBlockFromPos(b.position.x, b.position.y+1, b.position.z)
            const ny = getBlockFromPos(b.position.x, b.position.y-1, b.position.z)
            const pz = getBlockFromPos(b.position.x, b.position.y, b.position.z+1)
            const nz = getBlockFromPos(b.position.x, b.position.y, b.position.z-1)

            b.updateSide
            ([
                px ? !px.coveredFaces[1] : px!=0,
                nx ? !nx.coveredFaces[0] : nx!=0,
                py ? !py.coveredFaces[3] : py!=0,
                ny ? !ny.coveredFaces[2] : ny!=0,
                pz ? !pz.coveredFaces[5] : pz!=0,
                nz ? !nz.coveredFaces[4] : nz!=0,
            ])
        }

        // Physic
        if(physic)
        {
            const geoms = [];
            for (let i = 0; i < chunk.blocks.length; i++)
            {
                const b = chunk.blocks[i];
                if (!b || !b.graphic?.geometry?.index || !b.physicGeometry?.index && !b.physicGeometry?.attributes?.position) {continue}

                const vs = b.visibleSides;
                let anyVisible = false;
                for (let j = 0; vs && j < vs.length; j++) { if (vs[j]) { anyVisible = true; break } }
                if (!anyVisible) {continue}

                const g = b.physicGeometry.clone();
                const pos = g.attributes.position.array;
                const tx = b.position.x, ty = b.position.y, tz = b.position.z;
                for (let k = 0; k < pos.length; k += 3)
                {
                    pos[k] += tx; pos[k+1] += ty; pos[k+2] += tz;
                }
                g.attributes.position.needsUpdate = true;

                geoms.push(g);
            }


            if(geoms.length > 0)
            {
                // const chunkColliderGeom = BufferGeometryUtils.mergeGeometries(geoms, false);
                const chunkColliderGeom = BufferGeometryUtils.mergeVertices(BufferGeometryUtils.mergeGeometries(geoms, false))

                const chunkCollider = RAPIER.ColliderDesc.trimesh(chunkColliderGeom.attributes.position.array, chunkColliderGeom.index.array);
                window.world.createCollider(chunkCollider)
                
                chunksContent.set(k, Object.assign(chunk, {collider: chunkCollider}))
            }
        }
    })

    // Render Otpimization
    window.addRenderListener((clock, frustum) =>
    {
        chunksContent.forEach(chunk =>
        {
            chunk.group.visible = frustum.intersectsBox(chunk.aabb)
            if(!chunk.group.visible){return}
            for(let s of chunk.sections)
            {
                s.group.visible = frustum.intersectsBox(s.aabb)
            }
        })
    })

    for(const chunk of chunksContent.values?chunksContent.values():chunksContent) { for(const b of chunk.blocks.filter(b=>b?.graphic?.geometry?.index)){b.graphic.visible = false} }

    console.log("%cWorld parsed", "color: green")
    console.groupEnd();
}

export class World
{
    regions = new Map()
    chunks = new Map()
    palette = []
    biomePalette = []

    group = new THREE.Group()

    location
    modpackJar

    scene
    addRenderListener = window.addRenderListener
    physic = false

    sectionsPerChunk = 24
    chunkSectionY = -4;
    
    constructor(modpackJar = new ModpackJar(), location, addRenderListener = window.addRenderListener, physic = true)
    {
        this.addRenderListener = addRenderListener
        this.modpackJar = modpackJar;
        this.location = location
        this.physic = physic

        // Sections Culling
        // this.addRenderListener((clock, frustum) =>
        // {
        //     this.chunks.forEach(chunk =>
        //     {
        //         if(!chunk){return}
        //         chunk.group.visible = frustum.intersectsBox(chunk.aabb)
        //         if(!chunk.group.visible){return}
        //         for(let s of chunk.sections)
        //         {
        //             s.group.visible = frustum.intersectsBox(s.aabb)
        //         }
        //     })
        // })

        let lastCameraPosition = {x: 0, y: 0, z: 0}
        this.addRenderListener((clock, frustum) =>
        {
            let cameraPosition = {x: Math.floor(window.mainCamera.position.x), y: Math.floor(window.mainCamera.position.y), z: Math.floor(window.mainCamera.position.z)}

            if(Math.abs(lastCameraPosition.x-cameraPosition.x) + Math.abs(lastCameraPosition.y-cameraPosition.y) + Math.abs(lastCameraPosition.z-cameraPosition.z) < 4)
            { return }
            lastCameraPosition = cameraPosition;

            // Chunk load
            this.loadChunksFromPos(cameraPosition.x, cameraPosition.z, 3)
            
            // // Floodfill culling
            // for(const chunk of this.chunks.values?this.chunks.values():this.chunks) { if(!chunk){continue} for(const b of chunk.blocks.filter(b=>b?.graphic?.geometry?.index)){b.graphic.visible = false} }
            // this.cull(cameraPosition.x, cameraPosition.y, cameraPosition.z, 50000)
        })
    }

    loadChunksFromPos(cx, cz, r)
    {
        cx=Math.floor((cx/16) - r/2)
        cz=Math.floor((cz/16) - r/2)

        for (let x = cx; x < cx+r; x++)
        {
            for (let z = cz; z < cz+r; z++)
            {
                this.loadChunk(x, z)
            }
        }
    }
    
    getBlockFromPos(x, y, z)
    {
        let chunk = this.chunks.get(`${Math.floor(x/16)},${Math.floor(z/16)}`)
        if(!chunk){ return 0}
        return chunk.blocks[ ((y - chunk.level.yPos*16) << 8) | ((z - chunk.level.zPos*16) << 4) | ( x - chunk.level.xPos*16) ]
    }
    

    async readRegion(x, z)
    {
        const existing = this.regions.get(`${x},${z}`);
        if(existing!=undefined) { return existing; }
        this.regions.set(`${x},${z}`, false)

        const getChunk = await readRegion(this.location+sep()+'region'+sep()+`r.${x}.${z}.mca`);
        if(!getChunk){return getChunk}

        this.regions.set(`${x},${z}`, getChunk);
        return getChunk;
    }


    async loadChunk(x, z)
    {
        const existing = this.chunks.get(`${x},${z}`)
        if(existing!=undefined) { return existing }

        this.chunks.set(`${x},${z}`, false)

        const region = await this.readRegion(Math.floor(x/32), Math.floor(z/32))
        if(!region) { return false; }

        const chunk = await region(x, z)
        if(!chunk) { return false; }

        const aabb = new THREE.Box3(new THREE.Vector3(chunk.xPos*16, chunk.yPos*16, chunk.zPos*16), new THREE.Vector3(chunk.xPos*16+16, chunk.yPos*16 + chunk.sections.length*16, chunk.zPos*16+16));

        // Palette
        let totalPalette = [];
        const _paletteKeyMap = new Map();
        for (const s of chunk.sections)
        {
            for (const p of (s.block_states?.palette || [])) 
            {
                const key = JSON.stringify(p);
                if(_paletteKeyMap.has(key)) {continue}
                _paletteKeyMap.set(key, totalPalette.length);
                totalPalette.push(p);
            }
        }
 
        let paletteIndexes = new Array(chunk.sections.length*4096)
        for (let i = 0; i < chunk.sections.length; i++)
        {
            const s = chunk.sections[i];

            if(!s?.block_states?.data || !s?.block_states?.palette) { continue }
            if(s.block_states.palette.length==1)
            {
                if(s.block_states.palette[0].Name == "minecraft:air" || s.block_states.palette[0].Name == "air"){continue}

                const baseIndex = i * 4096
                for(let idx = 0; idx < 4096; idx++)
                {
                    paletteIndexes[baseIndex+idx] = totalPalette.findIndex(pal => lodash.isEqual(pal, s.block_states.palette[0]))
                }
                continue
            }

            // Model Palette
            let paletteRedirection = []
            for(let p of s.block_states.palette)
            {
                paletteRedirection.push(totalPalette.findIndex(pal => lodash.isEqual(pal, p)))
            }

            const paletteLen = Math.max(1, (s.block_states && s.block_states.palette || []).length);
            const bitsPerBlock = Math.max(4, Math.ceil(Math.log2(paletteLen)));

            const mask = (1n << BigInt(bitsPerBlock)) - 1n;

            const candLH = [];
            const candHL = [];

            for (const d of s.block_states.data)
            {
                // robust conversion for each data entry d:
                const low32  = BigInt.asUintN(32, BigInt(d[0]));
                const high32 = BigInt.asUintN(32, BigInt(d[1]));
                candLH.push((high32 << 32n) | low32);
                candHL.push((low32  << 32n) | high32);
            }

            const entriesPerLong = Math.floor(64 / bitsPerBlock);
            const requiredLongsAligned = Math.ceil(4096 / entriesPerLong);
            const requiredLongsStraddle = Math.ceil(4096 * bitsPerBlock / 64);

            let longs = null;
            let mode = null;

            function sanityAligned(candidateLongs)
            {
                if (candidateLongs.length < requiredLongsAligned) return false;
                // sample first 64 indices to check indices fall in palette range
                for (let i = 0; i < Math.min(64, 4096); i++)
                {
                    const longIndex = Math.floor(i / entriesPerLong);
                    const within = i % entriesPerLong;
                    const offset = within * bitsPerBlock;
                    const val = Number((candidateLongs[longIndex] >> BigInt(offset)) & mask);
                    if (!Number.isFinite(val) || val < 0 || val >= paletteLen) return false;
                }
                return true;
            }


            function sanityStraddle(candidateLongs)
            {
                if (candidateLongs.length < requiredLongsStraddle) return false;
                // do a short sequential decode for first 256 indices and verify palette bounds
                let state = 0;
                let data = candidateLongs[0];
                let dataLength = 64n;
                for (let j = 0; j < Math.min(256, 4096); j++) {
                    const bits = bitsPerBlock;
                    if (dataLength < bits) {
                        state += 1;
                        if (state >= candidateLongs.length) return false;
                        const newData = candidateLongs[state];
                        // For straddling behavior, append the new long above the existing bits
                        data = (newData << dataLength) | data;
                        dataLength += 64n;
                    }
                    const paletteId = Number(data & mask);
                    if (!Number.isFinite(paletteId) || paletteId < 0 || paletteId >= paletteLen) return false;
                    data >>= BigInt(bits);
                    dataLength -= BigInt(bits);
                }
                return true;
            }

            if (sanityAligned(candLH))
            {
                longs = candLH;
                mode = "aligned";
            }
            else if (sanityAligned(candHL))
            {
                longs = candHL;
                mode = "aligned";
            }
            else if (sanityStraddle(candLH))
            {
                longs = candLH;
                mode = "straddle";
            }
            else if (sanityStraddle(candHL))
            {
                longs = candHL;
                mode = "straddle";
            }
            else
            {
                if (candLH.length >= requiredLongsAligned)
                {
                    longs = candLH;
                    mode = "aligned";
                    console.warn("block_states: pair-order and mode ambiguous — defaulting to [low,high]/aligned. You should verify results.");
                }
                else { throw new Error(`block_states.data seems invalid or truncated. Need at least ${Math.max(requiredLongsAligned, requiredLongsStraddle)} longs (aligned=${requiredLongsAligned}, straddle=${requiredLongsStraddle}) but got ${candLH.length}.`); }
            }

            if(mode === "aligned")
            {
                if (longs.length < requiredLongsAligned)
                {
                    throw new Error(`block_states.data too short for aligned mode: need ${requiredLongsAligned}, got ${longs.length}`);
                }

                const baseIndex = i * 4096
                for(let idx = 0; idx < 4096; idx++)
                {
                    const longIndex = Math.floor(idx / entriesPerLong);
                    const within = idx % entriesPerLong;
                    const offset = within * bitsPerBlock;

                    if(longIndex >= longs.length)
                    {
                        console.warn(`longIndex ${longIndex} >= longs.length ${longs.length}`);
                        paletteIndexes[baseIndex+idx] = null;
                        continue;
                    }

                    const paletteIndex = Number((longs[longIndex] >> BigInt(offset)) & mask);

                    if(paletteIndex >= paletteLen)
                    {
                        // console.warn(`${paletteIndex} out of range (palette len ${paletteLen})`);
                        paletteIndexes[baseIndex+idx] = null;
                        continue;
                    }

                    const redirected = paletteRedirection[paletteIndex];
                    if (redirected == null || redirected < 0)
                    {
                        console.warn(`${paletteIndex} has no valid redirection`);
                        paletteIndexes[baseIndex+idx] = -1;
                        continue;
                    }

                    paletteIndexes[baseIndex+idx] = redirected;
                }
            }
            else
            {
                if (longs.length < requiredLongsStraddle) {
                    throw new Error(`block_states.data too short for straddle mode: need ${requiredLongsStraddle}, got ${longs.length}`);
                }
                longs.push(0n, 0n);

                let state = 0;
                let data = longs[0];
                let dataLength = 64n;

                const baseIndex = i * 4096
                for (let j = 0; j < 4096; j++)
                {
                    if (dataLength < bitsPerBlock)
                    {
                        state += 1;
                        const newData = longs[state];
                        data = (newData << dataLength) | data;
                        dataLength += 64n;
                    }
                    const paletteIndex = Number(data & mask);

                    if(paletteIndex >= paletteLen)
                    {
                        console.warn(`${paletteIndex} out of range.`)
                        paletteIndexes[baseIndex+idx] = null
                        continue;
                    }
                    else if(paletteIndex > paletteRedirection)
                    {
                        console.warn(`${paletteIndex} is not included in the palette redirector...`)
                        paletteIndexes[baseIndex+idx] = null
                        continue;
                    }

                    paletteIndexes[baseIndex+j] = paletteRedirection[paletteIndex];

                    data >>= BigInt(bitsPerBlock);
                    dataLength -= BigInt(bitsPerBlock);
                }
            }
        }

        // Biome Palette
        let totalBiomePalette = [];
        const _biomePaletteKeyMap = new Map();
        for (const s of chunk.sections)
        {
            for (const p of (s.biomes?.palette || [])) 
            {
                const key = JSON.stringify(p);
                if(_biomePaletteKeyMap.has(key)) {continue}
                _biomePaletteKeyMap.set(key, totalBiomePalette.length);
                totalBiomePalette.push(p);
            }
        }

        // Biome
        let biomePaletteIndexes = new Array(chunk.sections.length*64)
        for (let i = 0; i < chunk.sections.length; i++)
        {
            const s = chunk.sections[i];

            // Skip if only one
            if(s.biomes.palette.length==1)
            {
                const baseIndex = i * 64
                for(let idx = 0; idx < 64; idx++)
                {
                    biomePaletteIndexes[baseIndex+idx] = totalBiomePalette.findIndex(pal => lodash.isEqual(pal, s.biomes.palette[0]))
                }
                continue
            }

            let paletteRedirection = []
            for(let p of s.biomes.palette)
            {
                paletteRedirection.push(totalBiomePalette.findIndex(pal => lodash.isEqual(pal, p)))
            }


            const paletteLen = Math.max(1, (s.biomes && s.biomes.palette || []).length);
            const bitsPerBlock = Math.max(1, Math.ceil(Math.log2(paletteLen)));

            const mask = (1n << BigInt(bitsPerBlock)) - 1n;

            const candLH = [];
            const candHL = [];

            for (const d of s.biomes.data)
            {
                const low32  = BigInt.asUintN(32, BigInt(d[0]));
                const high32 = BigInt.asUintN(32, BigInt(d[1]));
                candLH.push((high32 << 32n) | low32);
                candHL.push((low32  << 32n) | high32);
            }

            const entriesPerLong = Math.max(1, Math.floor(64 / bitsPerBlock));
            const requiredLongsAligned = Math.ceil(64 / entriesPerLong);
            const requiredLongsStraddle = Math.ceil((64 * bitsPerBlock) / 64);

            let longs = null;
            let mode = null;

            function sanityAligned(candidateLongs)
            {
                if (candidateLongs.length < requiredLongsAligned) return false;
                // sample first 64 indices to check indices fall in palette range
                for (let i = 0; i < Math.min(64, 64); i++)
                {
                    const longIndex = Math.floor(i / entriesPerLong);
                    const within = i % entriesPerLong;
                    const offset = within * bitsPerBlock;
                    const val = Number((candidateLongs[longIndex] >> BigInt(offset)) & mask);
                    if (!Number.isFinite(val) || val < 0 || val >= paletteLen) return false;
                }
                return true;
            }


            function sanityStraddle(candidateLongs)
            {
                if (candidateLongs.length < requiredLongsStraddle) return false;
                // sequentially decode and verify the first few entries (there are only 64 entries total)
                const entriesToCheck = Math.min(64, 256); // realistically 64
                // We will decode LSB-first across the longs
                let longIdx = 0;
                let bitBuffer = candidateLongs[0];
                let bitsInBuffer = 64n;

                for (let j = 0; j < entriesToCheck; j++) {
                    const bits = BigInt(bitsPerBlock);
                    // ensure buffer has enough bits
                    while (bitsInBuffer < bits) {
                        longIdx++;
                        if (longIdx >= candidateLongs.length) return false;
                        // append the next long above current buffer
                        bitBuffer = (candidateLongs[longIdx] << bitsInBuffer) | bitBuffer;
                        bitsInBuffer += 64n;
                    }
                    const paletteId = Number(bitBuffer & mask);
                    if (!Number.isFinite(paletteId) || paletteId < 0 || paletteId >= paletteLen) return false;
                    bitBuffer >>= bits;
                    bitsInBuffer -= bits;
                }
                return true;
            }

            if (sanityAligned(candLH))
            {
                longs = candLH;
                mode = "aligned";
            }
            else if (sanityAligned(candHL))
            {
                longs = candHL;
                mode = "aligned";
            }
            else if (sanityStraddle(candLH))
            {
                longs = candLH;
                mode = "straddle";
            }
            else if (sanityStraddle(candHL))
            {
                longs = candHL;
                mode = "straddle";
            }
            else
            {
                if (candLH.length >= requiredLongsAligned)
                {
                    longs = candLH;
                    mode = "aligned";
                    console.warn("biomes: pair-order and mode ambiguous — defaulting to [low,high]/aligned. You should verify results.");
                }
                else { throw new Error(`biomes.data seems invalid or truncated. Need at least ${Math.max(requiredLongsAligned, requiredLongsStraddle)} longs (aligned=${requiredLongsAligned}, straddle=${requiredLongsStraddle}) but got ${candLH.length}.`); }
            }

            if(mode === "aligned")
            {
                if (longs.length < requiredLongsAligned)
                {
                    throw new Error(`biomes.data too short for aligned mode: need ${requiredLongsAligned}, got ${longs.length}`);
                }

                const baseIndex = i * 64
                for(let idx = 0; idx < 64; idx++)
                {
                    const longIndex = Math.floor(idx / entriesPerLong);
                    const within = idx % entriesPerLong;
                    const offset = within * bitsPerBlock;

                    if(longIndex >= longs.length)
                    {
                        console.warn(`Biome longIndex ${longIndex} >= longs.length ${longs.length}`);
                        biomePaletteIndexes[baseIndex+idx] = null;
                        continue;
                    }

                    const paletteIndex = Number((longs[longIndex] >> BigInt(offset)) & mask);

                    if(paletteIndex >= paletteLen)
                    {
                        console.warn(`Biome ${paletteIndex} out of range (palette len ${paletteLen})`);
                        biomePaletteIndexes[baseIndex+idx] = null;
                        continue;
                    }

                    const redirected = paletteRedirection[paletteIndex];
                    if (redirected == null || redirected < 0)
                    {
                        console.warn(`Biome ${paletteIndex} has no valid redirection`);
                        biomePaletteIndexes[baseIndex+idx] = -1;
                        continue;
                    }

                    biomePaletteIndexes[baseIndex+idx] = redirected;
                }
            }
            else
            {
                if (longs.length < requiredLongsStraddle)
                {
                    throw new Error(`biomes.data too short for straddle mode: need ${requiredLongsStraddle}, got ${longs.length}`);
                }
                const baseIndex = i * 64;
                // We'll decode by computing bitOffset = idx * bitsPerBlock
                for (let idx = 0; idx < 64; idx++)
                {
                    const bitOffset = BigInt(idx) * BigInt(bitsPerBlock);
                    const longIndex = Number(bitOffset / 64n);
                    const startBitInLong = Number(bitOffset % 64n);

                    // If the value sits entirely inside one long:
                    if (startBitInLong + bitsPerBlock <= 64)
                    {
                        const paletteIndex = Number((longs[longIndex] >> BigInt(startBitInLong)) & mask);
                        if (!Number.isFinite(paletteIndex) || paletteIndex < 0 || paletteIndex >= paletteLen)
                        {
                            console.warn(`${paletteIndex} out of range (palette len ${paletteLen})`);
                            biomePaletteIndexes[baseIndex + idx] = null;
                            continue;
                        }
                        const redirected = paletteRedirection[paletteIndex];
                        if (redirected == null || redirected < 0)
                        {
                            console.warn(`${paletteIndex} has no valid redirection`);
                            biomePaletteIndexes[baseIndex + idx] = -1;
                            continue;
                        }
                        biomePaletteIndexes[baseIndex + idx] = redirected;
                    }
                    else
                    {
                        // straddles into the next long — pull low bits from this long and high bits from next
                        const lowPart = longs[longIndex] >> BigInt(startBitInLong);
                        const bitsFromLow = 64 - startBitInLong;
                        const bitsFromHigh = BigInt(bitsPerBlock - bitsFromLow);
                        // ensure next long exists
                        if (longIndex + 1 >= longs.length)
                        {
                            console.warn(`longIndex ${longIndex+1} out of range for straddle decode (need ${longIndex+1}, have ${longs.length})`);
                            biomePaletteIndexes[baseIndex + idx] = null;
                            continue;
                        }
                        const highPart = longs[longIndex + 1] & ((1n << bitsFromHigh) - 1n);
                        const paletteIndex = Number(((highPart << BigInt(bitsFromLow)) | lowPart) & mask);
                        if (!Number.isFinite(paletteIndex) || paletteIndex < 0 || paletteIndex >= paletteLen)
                        {
                            // console.warn(`${paletteIndex} out of range (palette len ${paletteLen})`);
                            biomePaletteIndexes[baseIndex + idx] = null;
                            continue;
                        }
                        const redirected = paletteRedirection[paletteIndex];
                        if (redirected == null || redirected < 0)
                        {
                            console.warn(`${paletteIndex} has no valid redirection`);
                            biomePaletteIndexes[baseIndex + idx] = -1;
                            continue;
                        }
                        biomePaletteIndexes[baseIndex + idx] = redirected;
                    }
                }
            }
        }

        console.log("biomePaletteIndexes", biomePaletteIndexes)


        const blockIndexToPaletteIndex = new Array(chunk.sections.length * 4096);
        const instancesByPalette = new Map();

        const biomeIndexToPaletteIndex = new Array(chunk.sections.length * 4096);
        const instancesByBiomePalette = new Map();

        const baseX = chunk.xPos * 16;
        const baseZ = chunk.zPos * 16;

        for (let sectionIndex = 0; sectionIndex < chunk.sections.length; sectionIndex++)
        {
            // Blocks
            {
                const sectionBase = sectionIndex * 4096;
                for (let local = 0; local < 4096; local++)
                {
                    const idx = sectionBase + local;
                    const paletteIndex = paletteIndexes[idx]

                    blockIndexToPaletteIndex[idx] = paletteIndex

                    let arr = instancesByPalette.get(paletteIndex);
                    if (!arr) { arr = []; instancesByPalette.set(paletteIndex, arr); }
                    arr.push(idx);
                }
            }
            // Biomes
            {
                const sectionBase = sectionIndex * 64;
                for (let local = 0; local < 64; local++)
                {
                    const idx = sectionBase + local;
                    const paletteIndex = biomePaletteIndexes[idx]

                    biomeIndexToPaletteIndex[idx] = paletteIndex

                    let arr = instancesByBiomePalette.get(paletteIndex);
                    if (!arr) { arr = []; instancesByBiomePalette.set(paletteIndex, arr); }
                    arr.push(idx);
                }
            }
        }

        // Load Palette to World
        const loadedPalette = new Array(instancesByPalette.length)
        for(const [i, indexes] of instancesByPalette)
        {
            if(!totalPalette[i]){continue}
            loadedPalette[i] = await this.loadPalette(totalPalette[i].Name, totalPalette[i].Properties, indexes.length);
        }
        const loadedBiomePalette = new Array(instancesByBiomePalette.length)
        for(const [i, indexes] of instancesByBiomePalette)
        {
            if(!totalBiomePalette[i]){continue}
            loadedBiomePalette[i] = await this.loadBiomePalette(totalBiomePalette[i]);
        }

        console.log("loadedBiomePalette", loadedBiomePalette)

        // Write & Place
        let chunkData = {level: chunk, aabb, collider: null, blocks: new Array(blockIndexToPaletteIndex.length), biomes: new Array(biomeIndexToPaletteIndex.length)}

        // Biome Placing
        for (const [i, indexes] of instancesByBiomePalette)
        {
            const worldPalette = loadedBiomePalette[i];
            if(!worldPalette){continue}
            for(let i = 0; i < indexes.length; i++)
            {
                chunkData.biomes[indexes[i]] = worldPalette.index;
            }
        }

        let neighboorChunks = [this.chunks.get(`${chunk.xPos+1},${chunk.zPos}`), this.chunks.get(`${chunk.xPos-1},${chunk.zPos}`), this.chunks.get(`${chunk.xPos},${chunk.zPos+1}`), this.chunks.get(`${chunk.xPos},${chunk.zPos-1}`)]
        // Block Placing
        for (const [i, indexes] of instancesByPalette)
        {
            const worldPalette = loadedPalette[i];
            if(!worldPalette){continue}
            const model = worldPalette.value.model

            for(let i = 0; i < indexes.length; i++)
            {
                const index = indexes[i];

                chunkData.blocks[index] = worldPalette.index;
                
                let {x, y, z} = this.indexToPosition(index)

                let faces = [
                    x!=15 && loadedPalette[paletteIndexes[ this.positionToIndex(x+1, y, z) ]]?.value?.model?.coveredFaces?.[1]==false,
                    x!=0 && loadedPalette[paletteIndexes[ this.positionToIndex(x-1, y, z) ]]?.value?.model?.coveredFaces?.[0]==false,
                    y!=0 && loadedPalette[paletteIndexes[ index+256 ]]?.value?.model?.coveredFaces?.[3]==false,
                    loadedPalette[paletteIndexes[ index-256 ]]?.value?.model?.coveredFaces?.[2]==false,
                    z!=15 &&loadedPalette[paletteIndexes[ index+16 ]]?.value?.model?.coveredFaces?.[5]==false,
                    z!=0 &&loadedPalette[paletteIndexes[ index-16 ]]?.value?.model?.coveredFaces?.[4]==false,
                ]
                
                if(x==15 && neighboorChunks[0]?.blocks[this.positionToIndex(0, y, z%16)])
                {
                    const n = this.palette[neighboorChunks[0]?.blocks[this.positionToIndex(0, y, z%16)]]?.model;

                    if(model?.coveredFaces?.[0]==false)
                    { n?.createPart(0 + (neighboorChunks[0]?.level.xPos ?? 0) * 16, y, z + (neighboorChunks[0]?.level.zPos ?? 0) * 16, 2) }
                    faces[0] = n?.coveredFaces[1]==false
                }
                if(x==0 && neighboorChunks[1]?.blocks[this.positionToIndex(15, y, z%16)])
                {
                    const n = this.palette[ neighboorChunks[1]?.blocks[this.positionToIndex(15, y, z%16)] ]?.model;

                    if(model?.coveredFaces?.[1]==false)
                    { n?.createPart(15+neighboorChunks[1].level.xPos*16, y, z+neighboorChunks[1].level.zPos*16, 1) }
                    faces[1] = n?.coveredFaces[0]==false
                }
                if(z==15 && neighboorChunks[2]?.blocks[this.positionToIndex(x%16, y, 0)])
                {
                    const n = this.palette[ neighboorChunks[2]?.blocks[this.positionToIndex(x%16, y, 0)] ]?.model;

                    if(model?.coveredFaces?.[4]==false)
                    {
                        n?.createPart(x+neighboorChunks[2].level.xPos*16, y, 0+neighboorChunks[2].level.zPos*16, 6)
                    }

                    faces[4] = n?.coveredFaces[5]==false
                }
                if(z==0 && neighboorChunks[3]?.blocks[this.positionToIndex(x%16, y, 15)])
                {
                    const n = this.palette[ neighboorChunks[3]?.blocks[this.positionToIndex(x%16, y, 15)] ]?.model;

                    if(model?.coveredFaces?.[5]==false)
                    {
                        n?.createPart(x+neighboorChunks[3].level.xPos*16, y, 15+neighboorChunks[3].level.zPos*16, 5)
                    }

                    faces[5] = n?.coveredFaces[4]==false
                }

                const paletteIndex = ((x/64) + ((y-this.chunkSectionY*16)/64)/256 + (z/64)/16);
                const biomes =
                [
                    {
                        data: this.biomePalette[ Math.floor(paletteIndex) ].data,
                        weight: paletteIndex - Math.floor(paletteIndex)
                    },
                    {
                        data: this.biomePalette[ Math.ceil(paletteIndex) ]?.data,
                        weight: Math.ceil(paletteIndex) - paletteIndex
                    },
                ]
                model.create(x+baseX, y, z+baseZ, faces, biomes)
            }
        }


        this.chunks.set(`${chunk.xPos},${chunk.zPos}`, chunkData)

        return chunkData
    }

    // Blocks
    async loadPalette(id, properties = {}, capacity = 32)
    {
        const existing = this.palette.findIndex(p => p.id == id && JSON.stringify(p.properties) == JSON.stringify(properties));
        if(existing > -1) { return {index: existing, value: this.palette[existing]} }
        
        const model = await BlockModel.from(id, properties, this.modpackJar, capacity);
        for (let i = 0; i < 7; i++) { if(model.parts?.[i]?.mesh) { this.group.add(model.parts[i].mesh); } }
        const element = 
        {
            model,
            id: id,
            properties: properties
        }

        this.palette.push(element)
        return {index: this.palette.length-1, value: element};
    }
    async placeBlock(x, y, z, id, properties = {}, replace = true, updateCulling = true)
    {
        // console.time("placing")
        const existing = this.getBlock(x, y, z);
        if(!replace && existing) { return }
        else if(existing)
        {
            existing.paletteData.model.delete(x, y, z);
        }

        const p = await this.loadPalette(id, properties);

        // Write into World
        const chunkX = Math.floor(x/16)
        const chunkZ = Math.floor(z/16)
        let chunk = this.chunks.get(`${chunkX},${chunkZ}`)
        if(!chunk) { chunk = {blocks: new Array(256*this.sectionsPerChunk)}; }

        const idx = this.positionToIndex(x, y, z);
        chunk.blocks[idx] = p.index;

        this.chunks.set(`${chunkX},${chunkZ}`, chunk)

        // Graphic
        if(updateCulling && (p.value.model || (replace && existing)))
        {
            console.log(x, y, z, p.value.model)

            // Cull
            const neighboorModels =
            [
                this.getBlock(x+1, y, z)?.paletteData?.model,
                this.getBlock(x-1, y, z)?.paletteData?.model,
                this.getBlock(x, y+1, z)?.paletteData?.model,
                this.getBlock(x, y-1, z)?.paletteData?.model,
                this.getBlock(x, y, z+1)?.paletteData?.model,
                this.getBlock(x, y, z-1)?.paletteData?.model
            ]

            // Self
            if(p.value.model)
            {
                p.value.model.create(x, y, z, [
                    neighboorModels[0]?.coveredFaces?.[1]==false,
                    neighboorModels[1]?.coveredFaces?.[0]==false,
                    neighboorModels[2]?.coveredFaces?.[3]==false,
                    neighboorModels[3]?.coveredFaces?.[2]==false,
                    neighboorModels[4]?.coveredFaces?.[5]==false,
                    neighboorModels[5]?.coveredFaces?.[4]==false
                ])
            }

            // Neighboors
            console.log("neighboors", neighboorModels)
            neighboorModels[0] && neighboorModels[0][p.value.model.coveredFaces[0]?'deletePart':'createPart'](x+1, y, z, 1+1)
            neighboorModels[1] && neighboorModels[1][p.value.model.coveredFaces[1]?'deletePart':'createPart'](x-1, y, z, 0+1)
            neighboorModels[2] && neighboorModels[2][p.value.model.coveredFaces[2]?'deletePart':'createPart'](x, y+1, z, 3+1)
            neighboorModels[3] && neighboorModels[3][p.value.model.coveredFaces[3]?'deletePart':'createPart'](x, y-1, z, 2+1)
            neighboorModels[4] && neighboorModels[4][p.value.model.coveredFaces[4]?'deletePart':'createPart'](x, y, z+1, 5+1)
            neighboorModels[5] && neighboorModels[5][p.value.model.coveredFaces[5]?'deletePart':'createPart'](x, y, z-1, 4+1)
        }

        // console.timeEnd("placing")
    }
    updateBlockCulling(x, y, z, block)
    {
        if(!block) { block = this.getBlock(x, y, z); if(!block){return} }

        block.paletteData.model.delete(x, y, z)
        block.paletteData.model.create(x, y, z,
        [
            this.getBlock(x+1, y, z).paletteData?.model?.coveredFaces?.[1]==false,
            this.getBlock(x-1, y, z).paletteData?.model?.coveredFaces?.[0]==false,
            this.getBlock(x, y+1, z).paletteData?.model?.coveredFaces?.[3]==false,
            this.getBlock(x, y-1, z).paletteData?.model?.coveredFaces?.[2]==false,
            this.getBlock(x, y, z+1).paletteData?.model?.coveredFaces?.[5]==false,
            this.getBlock(x, y, z-1).paletteData?.model?.coveredFaces?.[4]==false
        ])
    }

    getBlock(x, y, z)
    {
        const chunkX = Math.floor(x/16)
        const chunkZ = Math.floor(z/16)

        let chunk = this.chunks.get(`${chunkX},${chunkZ}`)
        if(!chunk){ return 0 }

        const idx = this.positionToIndex(x, y, z);

        const paletteIndex = chunk.blocks[idx];
        if(paletteIndex==undefined) { return 0 }

        const index = chunk.blocks.slice(0, idx).length;
        const paletteData = this.palette[paletteIndex]

        return {index, paletteData}
    }
    positionToIndex(x, y, z, local = true)
    {
        if(x > 7){x-=8}else{x+=8}
        return ((y - this.chunkSectionY*16) << 8) | ((z - (local?Math.floor(z/16):0)) << 4) | (x - (local?Math.floor(x/16):0))
    }
    indexToPosition(index)
    {
        let x = index & 15
        if(x > 7){x-=8}else{x+=8}
        return {x, y: (index >> 8)+this.chunkSectionY*16, z: (index >> 4) & 15}
    }

    // Biome
    async loadBiomePalette(id)
    {
        const existing = this.biomePalette.findIndex(p => p.id == id);
        if(existing > -1) { return {index: existing, value: this.biomePalette[existing]} }
        
        const data = JSON.parse(await this.modpackJar.resolveData(id+'.json', ["worldgen", "biome"]));
        console.log(data)
        const element = 
        {
            data,
            id: id
        }

        this.biomePalette.push(element)
        return {index: this.biomePalette.length-1, value: element};
    }

    async parseMca(filePath, position = {x: 0, y: 0}, size = {x: 1, y: 1}, modpackJar = new ModpackJar(), physic = false)
    {
        console.group("Reading Region")
        
        // Read Region
        const region = Object.values( await ipcInvoke("readRegion", filePath) );

        // Read chunks
        console.group("Getting chunks")
        let chunks = []
        for (let x = position.x; x < size.x+position.x; x++)
        {
            for (let y = position.y; y < size.y+position.y; y++)
            {
                console.log(x, y)
                chunks.push(region.find(r=>r.xPos==x&&r.zPos==y))
            }
        }
        console.groupEnd()

        // Palette
        let totalPalette = []
        for(const c of chunks)
        {
            for(const s of c.sections)
            {
                for(const p of s.block_states.palette)
                {
                    if(totalPalette.findIndex(pal => lodash.isEqual(pal, p)) >= 0){continue}
                    totalPalette.push(p)
                }
            }
        }
        let loadedModelPalette = []
        for(let p of totalPalette)
        {
            loadedModelPalette.push(await Block.from(p.Name, p.Properties, modpackJar))
        }

        // Build
        let chunksContent = new Map()

        for (let levelIndex = 0; levelIndex < chunks.length; levelIndex++)
        {
            const level = chunks[levelIndex];
            console.groupCollapsed("Chunk #"+levelIndex, level)

            let chunkGroup = new THREE.Group();
            window.scene.add(chunkGroup)
            chunkGroup.position.set(level.xPos*16, level.yPos*16, level.zPos*16)

            // Helper
            let helper = new THREE.Mesh(new THREE.BoxGeometry(16, level.sections.length*16, 16), new THREE.MeshBasicMaterial({wireframe: true, color: 0xA00000}))
            // chunkGroup.add(helper)
            helper.position.set(7.5, level.sections.length*8-0.5, 7.5)
            const aabb = new THREE.Box3(new THREE.Vector3(level.xPos*16, level.yPos*16, level.zPos*16), new THREE.Vector3(level.xPos*16+16, level.yPos*16 + level.sections.length*16, level.zPos*16+16));
            
            // Get Palette Indexes
            let paletteIndexes = []
            for(const s of level.sections)
            {
                if(!s?.block_states?.data || !s?.block_states?.palette) { continue }
                if(s.block_states.palette.length==1&&(s.block_states.palette[0].Name == "air"||s.block_states.palette[0].Name == "minecraft:air")) { continue }

                // Model Palette
                let paletteRedirection = []
                for(let p of s.block_states.palette)
                {
                    paletteRedirection.push(totalPalette.findIndex(pal => lodash.isEqual(pal, p)))
                }

                const paletteLen = Math.max(1, (s.block_states && s.block_states.palette || []).length);
                const bitsPerBlock = Math.max(4, Math.ceil(Math.log2(paletteLen)));
                const mask = (1n << BigInt(bitsPerBlock)) - 1n;

                const candLH = s.block_states.data.map(d =>
                {
                    const low = BigInt.asUintN(32, BigInt(d[0]));
                    const high = BigInt.asUintN(32, BigInt(d[1]));
                    return (high << 32n) | low;
                });
                const candHL = s.block_states.data.map(d =>
                {
                    const low = BigInt.asUintN(32, BigInt(d[0]));
                    const high = BigInt.asUintN(32, BigInt(d[1]));
                    return (low << 32n) | high;
                });

                const entriesPerLong = Math.floor(64 / bitsPerBlock);
                const requiredLongsAligned = Math.ceil(4096 / entriesPerLong);
                const requiredLongsStraddle = Math.ceil((4096 * bitsPerBlock) / 64);

                let longs = null;
                let mode = null;

                function sanityAligned(candidateLongs)
                {
                    if (candidateLongs.length < requiredLongsAligned) return false;
                    // sample first 64 indices to check indices fall in palette range
                    for (let i = 0; i < Math.min(64, 4096); i++)
                    {
                        const longIndex = Math.floor(i / entriesPerLong);
                        const within = i % entriesPerLong;
                        const offset = within * bitsPerBlock;
                        const val = Number((candidateLongs[longIndex] >> BigInt(offset)) & mask);
                        if (!Number.isFinite(val) || val < 0 || val >= paletteLen) return false;
                    }
                    return true;
                }

                function sanityStraddle(candidateLongs)
                {
                    if (candidateLongs.length < requiredLongsStraddle) return false;
                    // do a short sequential decode for first 256 indices and verify palette bounds
                    let state = 0;
                    let data = candidateLongs[0];
                    let dataLength = 64n;
                    for (let j = 0; j < Math.min(256, 4096); j++) {
                        const bits = bitsPerBlock;
                        if (dataLength < bits) {
                            state += 1;
                            if (state >= candidateLongs.length) return false;
                            const newData = candidateLongs[state];
                            // For straddling behavior, append the new long above the existing bits
                            data = (newData << dataLength) | data;
                            dataLength += 64n;
                        }
                        const paletteId = Number(data & mask);
                        if (!Number.isFinite(paletteId) || paletteId < 0 || paletteId >= paletteLen) return false;
                        data >>= BigInt(bits);
                        dataLength -= BigInt(bits);
                    }
                    return true;
                }

                if (sanityAligned(candLH))
                {
                    longs = candLH;
                    mode = "aligned";
                }
                else if (sanityAligned(candHL))
                {
                    longs = candHL;
                    mode = "aligned";
                }
                else if (sanityStraddle(candLH))
                {
                    longs = candLH;
                    mode = "straddle";
                }
                else if (sanityStraddle(candHL))
                {
                    longs = candHL;
                    mode = "straddle";
                }
                else
                {
                    if (candLH.length >= requiredLongsAligned)
                    {
                        longs = candLH;
                        mode = "aligned";
                        console.warn("block_states: pair-order and mode ambiguous — defaulting to [low,high]/aligned. You should verify results.");
                    }
                    else { throw new Error(`block_states.data seems invalid or truncated. Need at least ${Math.max(requiredLongsAligned, requiredLongsStraddle)} longs (aligned=${requiredLongsAligned}, straddle=${requiredLongsStraddle}) but got ${candLH.length}.`); }
                }

                if(mode === "aligned")
                {
                    if (longs.length < requiredLongsAligned)
                    {
                        throw new Error(`block_states.data too short for aligned mode: need ${requiredLongsAligned}, got ${longs.length}`);
                    }
                    for (let idx = 0; idx < 4096; idx++)
                    {
                        const longIndex = Math.floor(idx / entriesPerLong);
                        const within = idx % entriesPerLong;
                        const offset = within * bitsPerBlock;
                        const paletteIndex = Number((longs[longIndex] >> BigInt(offset)) & mask);

                        if(paletteIndex >= paletteLen)
                        {
                            // console.warn(`${paletteIndex} out of range.`)
                            paletteIndexes.push(null)
                            continue;
                        }
                        else if(paletteIndex > paletteRedirection)
                        {
                            console.warn(`${paletteIndex} is not included in the palette redirector...`)
                            paletteIndexes.push(null)
                            continue;
                        }
                        if(!loadedModelPalette[ paletteRedirection[paletteIndex] ]){paletteIndexes.push(null); continue}

                        paletteIndexes.push(paletteRedirection[paletteIndex]);
                    }
                }
                else
                {
                    if (longs.length < requiredLongsStraddle) {
                        throw new Error(`block_states.data too short for straddle mode: need ${requiredLongsStraddle}, got ${longs.length}`);
                    }
                    longs.push(0n, 0n);

                    let state = 0;
                    let data = longs[0];
                    let dataLength = 64n;
                    for (let j = 0; j < 4096; j++)
                    {
                        if (dataLength < bitsPerBlock)
                        {
                            state += 1;
                            const newData = longs[state];
                            data = (newData << dataLength) | data;
                            dataLength += 64n;
                        }
                        const paletteIndex = Number(data & mask);

                        if(paletteIndex >= paletteLen)
                        {
                            console.warn(`${paletteIndex} out of range.`)
                            paletteIndexes.push(null)
                            continue;
                        }
                        else if(paletteIndex > paletteRedirection)
                        {
                            console.warn(`${paletteIndex} is not included in the palette redirector...`)
                            paletteIndexes.push(null)
                            continue;
                        }
                        if(!loadedModelPalette[ paletteRedirection[paletteIndex] ]){paletteIndexes.push(null); continue}

                        paletteIndexes.push(paletteRedirection[paletteIndex]);

                        data >>= BigInt(bitsPerBlock);
                        dataLength -= BigInt(bitsPerBlock);
                    }
                }
            }

            // Placing Blocks
            let sections = []
            // let blocks = []
            const blocks = new Array(level.sections.length * 4096);

            for (let sectionIndex = 0; sectionIndex < level.sections.length; sectionIndex++)
            {
                const s = level.sections[sectionIndex]

                let sectionGroup = new THREE.Group();
                chunkGroup.add(sectionGroup)
                sectionGroup.position.set(0, (s.Y+4)*16, 0)

                const baseX = level.xPos * 16;
                const baseY = level.yPos * 16;
                const baseZ = level.zPos * 16;

                // Helper & AABB
                let helper = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), new THREE.MeshBasicMaterial({wireframe: true, color: 0xA0A000}))
                // sectionGroup.add(helper)
                helper.position.set(7.5, 7.5, 7.5)
                const aabb = new THREE.Box3(new THREE.Vector3(baseX, baseY + (s.Y + 4) * 16, baseZ), new THREE.Vector3(baseX + 16, baseY + (s.Y + 4) * 16 + 16, baseZ + 16));

                sections.push({group: sectionGroup, aabb})


                if(!s?.block_states?.data || !s?.block_states?.palette || s.block_states.palette.length==1&&(s.block_states.palette[0].Name == "air"||s.block_states.palette[0].Name == "minecraft:air"))
                {
                    // blocks = blocks.concat(new Array(4096).map(() => null))
                    continue
                }

                for(let idx = sectionIndex*4096; idx < sectionIndex*4096+4096; idx++)
                {
                    const paletteIndex = paletteIndexes[idx]
                    if(paletteIndex==null || !loadedModelPalette[ paletteIndex ])
                    {
                        blocks.push(null)
                        continue
                    }

                    const y = idx >> 8;
                    const z = (idx >> 4) & 15;
                    const x = idx & 15;

                    let b = loadedModelPalette[ paletteIndex ].clone()
                    b.position = {x: baseX + x, y: baseY + y, z: baseZ + z}

                    blocks[idx] = b
                    // blocks.push(b)
                    b.add(sectionGroup)
                }
            }

            chunksContent.set(`${level.xPos},${level.zPos}`, {level, aabb, group: chunkGroup, blocks, sections, collider: null})
            console.groupEnd()
        }

        // Culling
        chunksContent.forEach((chunk, k) =>
        {
            // Culling
            for(let b of chunk.blocks)
            {
                if(!b){continue}
                const px = getBlockFromPos(b.position.x+1, b.position.y, b.position.z)
                const nx = getBlockFromPos(b.position.x-1, b.position.y, b.position.z)
                const py = getBlockFromPos(b.position.x, b.position.y+1, b.position.z)
                const ny = getBlockFromPos(b.position.x, b.position.y-1, b.position.z)
                const pz = getBlockFromPos(b.position.x, b.position.y, b.position.z+1)
                const nz = getBlockFromPos(b.position.x, b.position.y, b.position.z-1)

                b.updateSide
                ([
                    px ? !px.coveredFaces[1] : px!=0,
                    nx ? !nx.coveredFaces[0] : nx!=0,
                    py ? !py.coveredFaces[3] : py!=0,
                    ny ? !ny.coveredFaces[2] : ny!=0,
                    pz ? !pz.coveredFaces[5] : pz!=0,
                    nz ? !nz.coveredFaces[4] : nz!=0,
                ])
            }

            // Physic
            if(physic)
            {
                const geoms = [];
                for (let i = 0; i < chunk.blocks.length; i++)
                {
                    const b = chunk.blocks[i];
                    if (!b || !b.graphic?.geometry?.index || !b.physicGeometry?.index && !b.physicGeometry?.attributes?.position) {continue}

                    const vs = b.visibleSides;
                    let anyVisible = false;
                    for (let j = 0; vs && j < vs.length; j++) { if (vs[j]) { anyVisible = true; break } }
                    if (!anyVisible) {continue}

                    const g = b.physicGeometry.clone();
                    const pos = g.attributes.position.array;
                    const tx = b.position.x, ty = b.position.y, tz = b.position.z;
                    for (let k = 0; k < pos.length; k += 3)
                    {
                        pos[k] += tx; pos[k+1] += ty; pos[k+2] += tz;
                    }
                    g.attributes.position.needsUpdate = true;

                    geoms.push(g);
                }


                if(geoms.length > 0)
                {
                    // const chunkColliderGeom = BufferGeometryUtils.mergeGeometries(geoms, false);
                    const chunkColliderGeom = BufferGeometryUtils.mergeVertices(BufferGeometryUtils.mergeGeometries(geoms, false))

                    const chunkCollider = RAPIER.ColliderDesc.trimesh(chunkColliderGeom.attributes.position.array, chunkColliderGeom.index.array);
                    window.world.createCollider(chunkCollider)
                    
                    chunksContent.set(k, Object.assign(chunk, {collider: chunkCollider}))
                }
            }


            // Render Otpimization
            window.addRenderListener((clock, frustum) =>
            {
                chunk.group.visible = frustum.intersectsBox(chunk.aabb)
                if(!chunk.group.visible){return}
                for(let s of chunk.sections)
                {
                    s.group.visible = frustum.intersectsBox(s.aabb)
                }
            })
        })

        for(const chunk of chunksContent.values?chunksContent.values():chunksContent) { for(const b of chunk.blocks.filter(b=>b?.graphic?.geometry?.index)){b.graphic.visible = false} }

        console.log("%cWorld parsed", "color: green")
        console.groupEnd();
    }


    // Old
    // async oldloadChunk(x, z)
    // {
    //     const existing = this.chunks.get(`${x},${z}`)
    //     if(existing!=undefined) { return existing }

    //     this.chunks.set(`${x},${z}`, false)

    //     console.time("Chunk "+x+","+z)

    //     const region = await this.readRegion(Math.floor(x/32), Math.floor(z/32))
    //     if(!region) { return false; }

    //     const initPhysicState = window.pausedPhysic;
    //     window.pausedPhysic  = false

    //     const chunk = region.find(c => c.xPos==x && c.zPos == z)

    //     const group = new THREE.Group();
    //     this.group.add(group)
    //     group.position.set(chunk.xPos*16, chunk.yPos*16, chunk.zPos*16)

    //     const aabb = new THREE.Box3(new THREE.Vector3(chunk.xPos*16, chunk.yPos*16, chunk.zPos*16), new THREE.Vector3(chunk.xPos*16+16, chunk.yPos*16 + chunk.sections.length*16, chunk.zPos*16+16));

    //     // Palette
    //     let totalPalette = [];
    //     const _paletteKeyMap = new Map();
    //     for (const s of chunk.sections)
    //     {
    //         for (const p of (s.block_states?.palette || [])) 
    //         {
    //             const key = JSON.stringify(p);
    //             if(_paletteKeyMap.has(key)) {continue}
    //             _paletteKeyMap.set(key, totalPalette.length);
    //             totalPalette.push(p);
    //         }
    //     }

    //     let loadedModelPalette = await Promise.all(totalPalette.map(async (p) =>
    //     {
    //         if (!p || p.Name === 'minecraft:air' || p.Name === 'air') return null;
    //         return await BlockModel.from(p.Name, p.Properties, this.modpackJar);
    //     }));        
    //     let paletteIndexes = []
    //     for(const s of chunk.sections)
    //     {
    //         if(!s.block_states.data || !s.block_states.palette) { continue }
    //         if(s.block_states.palette.length==1&&(s.block_states.palette[0].Name == "air"||s.block_states.palette[0].Name == "minecraft:air")) { continue }

    //         // Model Palette
    //         let paletteRedirection = []
    //         for(let p of s.block_states.palette)
    //         {
    //             paletteRedirection.push(totalPalette.findIndex(pal => lodash.isEqual(pal, p)))
    //         }

    //         const paletteLen = Math.max(1, (s.block_states && s.block_states.palette || []).length);
    //         const bitsPerBlock = Math.max(4, Math.ceil(Math.log2(paletteLen)));
    //         const mask = (1n << BigInt(bitsPerBlock)) - 1n;

    //         const candLH = [];
    //         const candHL = [];
    //         for (const d of s.block_states.data)
    //         {
    //             const low = BigInt.asUintN(32, BigInt(d[0]));
    //             const high = BigInt.asUintN(32, BigInt(d[1]));
    //             candLH.push((high << 32n) | low);
    //             candHL.push((low << 32n) | high);
    //         }

    //         const entriesPerLong = Math.floor(64 / bitsPerBlock);
    //         const requiredLongsAligned = Math.ceil(4096 / entriesPerLong);
    //         const requiredLongsStraddle = Math.ceil((4096 * bitsPerBlock) / 64);

    //         let longs = null;
    //         let mode = null;

    //         function sanityAligned(candidateLongs)
    //         {
    //             if (candidateLongs.length < requiredLongsAligned) return false;
    //             // sample first 64 indices to check indices fall in palette range
    //             for (let i = 0; i < Math.min(64, 4096); i++)
    //             {
    //                 const longIndex = Math.floor(i / entriesPerLong);
    //                 const within = i % entriesPerLong;
    //                 const offset = within * bitsPerBlock;
    //                 const val = Number((candidateLongs[longIndex] >> BigInt(offset)) & mask);
    //                 if (!Number.isFinite(val) || val < 0 || val >= paletteLen) return false;
    //             }
    //             return true;
    //         }

    //         function sanityStraddle(candidateLongs)
    //         {
    //             if (candidateLongs.length < requiredLongsStraddle) return false;
    //             // do a short sequential decode for first 256 indices and verify palette bounds
    //             let state = 0;
    //             let data = candidateLongs[0];
    //             let dataLength = 64n;
    //             for (let j = 0; j < Math.min(256, 4096); j++) {
    //                 const bits = bitsPerBlock;
    //                 if (dataLength < bits) {
    //                     state += 1;
    //                     if (state >= candidateLongs.length) return false;
    //                     const newData = candidateLongs[state];
    //                     // For straddling behavior, append the new long above the existing bits
    //                     data = (newData << dataLength) | data;
    //                     dataLength += 64n;
    //                 }
    //                 const paletteId = Number(data & mask);
    //                 if (!Number.isFinite(paletteId) || paletteId < 0 || paletteId >= paletteLen) return false;
    //                 data >>= BigInt(bits);
    //                 dataLength -= BigInt(bits);
    //             }
    //             return true;
    //         }

    //         if (sanityAligned(candLH))
    //         {
    //             longs = candLH;
    //             mode = "aligned";
    //         }
    //         else if (sanityAligned(candHL))
    //         {
    //             longs = candHL;
    //             mode = "aligned";
    //         }
    //         else if (sanityStraddle(candLH))
    //         {
    //             longs = candLH;
    //             mode = "straddle";
    //         }
    //         else if (sanityStraddle(candHL))
    //         {
    //             longs = candHL;
    //             mode = "straddle";
    //         }
    //         else
    //         {
    //             if (candLH.length >= requiredLongsAligned)
    //             {
    //                 longs = candLH;
    //                 mode = "aligned";
    //                 console.warn("block_states: pair-order and mode ambiguous — defaulting to [low,high]/aligned. You should verify results.");
    //             }
    //             else { throw new Error(`block_states.data seems invalid or truncated. Need at least ${Math.max(requiredLongsAligned, requiredLongsStraddle)} longs (aligned=${requiredLongsAligned}, straddle=${requiredLongsStraddle}) but got ${candLH.length}.`); }
    //         }

    //         if(mode === "aligned")
    //         {
    //             if (longs.length < requiredLongsAligned)
    //             {
    //                 throw new Error(`block_states.data too short for aligned mode: need ${requiredLongsAligned}, got ${longs.length}`);
    //             }
    //             for (let idx = 0; idx < 4096; idx++)
    //             {
    //                 const longIndex = Math.floor(idx / entriesPerLong);
    //                 const within = idx % entriesPerLong;
    //                 const offset = within * bitsPerBlock;
    //                 const paletteIndex = Number((longs[longIndex] >> BigInt(offset)) & mask);

    //                 if(paletteIndex >= paletteLen)
    //                 {
    //                     console.warn(`${paletteIndex} out of range.`)
    //                     paletteIndexes.push(null)
    //                     continue;
    //                 }
    //                 else if(paletteIndex > paletteRedirection)
    //                 {
    //                     console.warn(`${paletteIndex} is not included in the palette redirector...`)
    //                     paletteIndexes.push(null)
    //                     continue;
    //                 }
    //                 if(!loadedModelPalette[ paletteRedirection[paletteIndex] ]){paletteIndexes.push(null); continue}

    //                 paletteIndexes.push(paletteRedirection[paletteIndex]);
    //             }
    //         }
    //         else
    //         {
    //             if (longs.length < requiredLongsStraddle) {
    //                 throw new Error(`block_states.data too short for straddle mode: need ${requiredLongsStraddle}, got ${longs.length}`);
    //             }
    //             longs.push(0n, 0n);

    //             let state = 0;
    //             let data = longs[0];
    //             let dataLength = 64n;
    //             for (let j = 0; j < 4096; j++)
    //             {
    //                 if (dataLength < bitsPerBlock)
    //                 {
    //                     state += 1;
    //                     const newData = longs[state];
    //                     data = (newData << dataLength) | data;
    //                     dataLength += 64n;
    //                 }
    //                 const paletteIndex = Number(data & mask);

    //                 if(paletteIndex >= paletteLen)
    //                 {
    //                     console.warn(`${paletteIndex} out of range.`)
    //                     paletteIndexes.push(null)
    //                     continue;
    //                 }
    //                 else if(paletteIndex > paletteRedirection)
    //                 {
    //                     console.warn(`${paletteIndex} is not included in the palette redirector...`)
    //                     paletteIndexes.push(null)
    //                     continue;
    //                 }
    //                 if(!loadedModelPalette[ paletteRedirection[paletteIndex] ]){paletteIndexes.push(null); continue}

    //                 paletteIndexes.push(paletteRedirection[paletteIndex]);

    //                 data >>= BigInt(bitsPerBlock);
    //                 dataLength -= BigInt(bitsPerBlock);
    //             }
    //         }
    //     }

    //     console.time("Placing")

    //     // Placing Blocks
    //     // let sections = []
    //     // const blocks = new Array(chunk.sections.length * 4096);
    //     const blocksPaletteIndex = new Array(chunk.sections.length * 4096);
    //     const instancesByPalette = new Map();

    //     const baseX = chunk.xPos * 16;
    //     const baseY = chunk.yPos * 16;
    //     const baseZ = chunk.zPos * 16;

    //     for (let sectionIndex = 0; sectionIndex < chunk.sections.length; sectionIndex++)
    //     {
    //         const s = chunk.sections[sectionIndex]

    //         // let sectionGroup = new THREE.Group();
    //         // group.add(sectionGroup)
    //         // sectionGroup.position.set(0, (s.Y+4)*16, 0)

    //         // Helper & AABB
    //         // let helper = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), new THREE.MeshBasicMaterial({wireframe: true, color: 0xA0A000}))
    //         // sectionGroup.add(helper)
    //         // helper.position.set(7.5, 7.5, 7.5)
    //         // const aabb = new THREE.Box3(new THREE.Vector3(baseX, baseY + (s.Y + 4) * 16, baseZ), new THREE.Vector3(baseX + 16, baseY + (s.Y + 4) * 16 + 16, baseZ + 16));

    //         // sections.push({group: sectionGroup, aabb})

    //         if(!s.block_states.data || !s.block_states.palette || s.block_states.palette.length==1&&(s.block_states.palette[0].Name == "air"||s.block_states.palette[0].Name == "minecraft:air")) {continue}

    //         const sectionBase = sectionIndex * 4096;
    //         for (let local = 0; local < 4096; local++)
    //         {
    //             const idx = sectionBase + local;
    //             const paletteIndex = paletteIndexes[idx]

    //             blocksPaletteIndex[idx] = paletteIndex

    //             // if(paletteIndex==null || !loadedModelPalette[ paletteIndex ])
    //             // {
    //             //     blocks[idx] = null;
    //             //     continue
    //             // }

    //             let arr = instancesByPalette.get(paletteIndex);
    //             if (!arr) { arr = []; instancesByPalette.set(paletteIndex, arr); }
    //             arr.push(idx);

    //             // const y = idx >> 8;
    //             // const z = (idx >> 4) & 15;
    //             // const x = idx & 15;

    //             // let b = loadedModelPalette[ paletteIndex ].clone()
    //             // b.position = {x: baseX + x, y: baseY + y, z: baseZ + z}

    //             // blocks[idx] = b
    //             // b.add(sectionGroup)
    //         }

    //         console.timeLog("Placing", "Section #"+sectionIndex)
    //     }

    //     console.timeEnd("Placing")

    //     for (const [paletteIndex, idxs] of instancesByPalette)
    //     {
    //         const model = loadedModelPalette[paletteIndex];
    //         if (!model || !model.geometry) continue;

    //         const inst = model.instanceMesh(idxs.length);
    //         const tmp = new THREE.Object3D();

    //         const computeMask = BlockModel.computeInstanceMask;
    //         const uncomputeMask = BlockModel.decodeMaskFromFloat;

    //         const masks = new Float32Array(idxs.length)
    //         for (let i = 0; i < idxs.length; i++)
    //         {
    //             const idx = idxs[i];
    //             let x = ((idx & 15) + 8) & 15;
    //             let y = (idx >> 8);
    //             let z = ((idx >> 4) & 15);

    //             console.log(x)
    //             tmp.position.set(x,y,z);
    //             tmp.updateMatrix();
    //             inst.setMatrixAt(i, tmp.matrix);

    //             let neighboors =
    //             [
    //                 loadedModelPalette[blocksPaletteIndex[ idx+1 ]],
    //                 loadedModelPalette[blocksPaletteIndex[ idx-1 ]],
    //                 loadedModelPalette[blocksPaletteIndex[ idx+256 ]],
    //                 loadedModelPalette[blocksPaletteIndex[ idx-256 ]],
    //                 loadedModelPalette[blocksPaletteIndex[ idx+16 ]],
    //                 loadedModelPalette[blocksPaletteIndex[ idx-16 ]]
    //             ]

    //             if(x==0)
    //             {
    //                 const neighboorChunk = this.chunks.get(`${chunk.xPos-1},${chunk.zPos}`)
    //                 if(neighboorChunk)
    //                 {
    //                     console.log("neighboorChunk", neighboorChunk)

    //                     const neighboorPaletteIndex = neighboorChunk.blocks[idx+15];
    //                     neighboors[1] = neighboorChunk.palette[ neighboorPaletteIndex ];
    //                     console.log("new neighboor", neighboors[1])

    //                     if(neighboors[1])
    //                     {
    //                         // Get Mesh (Instances Container)
    //                         const neighboorMesh = neighboorChunk.group.children [neighboorPaletteIndex - neighboorChunk.palette.slice(0, neighboorPaletteIndex+1).filter(p=>!p || !p.geometry).length];
    //                         console.log("neighboorMesh", neighboorMesh)
    //                         // Get Instance Index
    //                         const neighboorInstanceIndex = neighboorChunk.blocks.slice(0, idx+15+1).length;

    //                         // Get Mesh Mask Attribute Array
    //                         const meshMaskAttribute = neighboorMesh.geometry.getAttribute('instanceMask');

    //                         // Get Instance Mask Attribute
    //                         const mask = uncomputeMask(meshMaskAttribute.array[neighboorInstanceIndex], neighboorInstanceIndex);
    //                         mask[1] = loadedModelPalette[blocksPaletteIndex[ idx ]].coveredFaces[0]?0:1

    //                         // Modify Value
    //                         meshMaskAttribute.array[neighboorInstanceIndex] = computeMask(mask)

    //                         // Modify Array
    //                         neighboorMesh.geometry.setAttribute('instanceMask', meshMaskAttribute);
    //                         // Refresh
    //                         neighboorMesh.instanceMatrix.needsUpdate = true;
    //                     }
    //                 } else { neighboors[1] = {coveredFaces: [true,true,true,true,true,true]} }
    //             }
    //             if(x==15)
    //             {
    //                 const neighboorChunk = this.chunks.get(`${chunk.xPos+1},${chunk.zPos}`)
    //                 if(neighboorChunk)
    //                 {
    //                     neighboors[0] = neighboorChunk.palette[ neighboorChunk.blocks[idx-15] ]
    //                 } else { neighboors[0] = {coveredFaces: [true,true,true,true,true,true]} }
    //             }
    //             if(z==0)
    //             {
    //                 const neighboorChunk = this.chunks.get(`${chunk.xPos},${chunk.zPos-1}`)
    //                 if(neighboorChunk)
    //                 {
    //                     neighboors[5] = neighboorChunk.palette[ neighboorChunk.blocks[idx+15] ]
    //                 } else { neighboors[5] = {coveredFaces: [true,true,true,true,true,true]} }
    //             }
    //             if(z==15)
    //             {
    //                 const neighboorChunk = this.chunks.get(`${chunk.xPos},${chunk.zPos+1}`)
    //                 if(neighboorChunk)
    //                 {
    //                     neighboors[4] = neighboorChunk.palette[ neighboorChunk.blocks[idx-15] ]
    //                 } else { neighboors[4] = {coveredFaces: [true,true,true,true,true,true]} }
    //             }

    //             neighboors = 
    //             [
    //                 (neighboors[0]?.coveredFaces[1]) ? 0 : 1,
    //                 (neighboors[1]?.coveredFaces[0]) ? 0 : 1,
    //                 (neighboors[2]?.coveredFaces[3]) ? 0 : 1,
    //                 (neighboors[3]?.coveredFaces[2]) ? 0 : 1,
    //                 (neighboors[4]?.coveredFaces[5]) ? 0 : 1,
    //                 (neighboors[5]?.coveredFaces[4]) ? 0 : 1,
    //             ]
                
    //             masks[i] = computeMask(neighboors)
    //         }

    //         inst.geometry.setAttribute('instanceMask', new THREE.InstancedBufferAttribute(masks, 1, false));
    //         inst.instanceMatrix.needsUpdate = true;

    //         group.visible = inst.visible = true;
    //         group.add(inst);
    //     }

    //     let chunkData = {level: chunk, aabb, group: group, collider: null, palette: loadedModelPalette, blocks: blocksPaletteIndex}
    //     this.chunks.set(`${chunk.xPos},${chunk.zPos}`, chunkData)

    //     {
    //         // console.time("Culling")
    //         // // Culling
    //         // for(let b of blocks)
    //         // {
    //         //     if(!b){continue}
    //         //     const px = this.getBlockFromPos(b.position.x+1, b.position.y, b.position.z)
    //         //     const nx = this.getBlockFromPos(b.position.x-1, b.position.y, b.position.z)
    //         //     const py = this.getBlockFromPos(b.position.x, b.position.y+1, b.position.z)
    //         //     const ny = this.getBlockFromPos(b.position.x, b.position.y-1, b.position.z)
    //         //     const pz = this.getBlockFromPos(b.position.x, b.position.y, b.position.z+1)
    //         //     const nz = this.getBlockFromPos(b.position.x, b.position.y, b.position.z-1)

    //         //     b.updateSide
    //         //     ([
    //         //         px ? !px.coveredFaces[1] : px!=0,
    //         //         nx ? !nx.coveredFaces[0] : nx!=0,
    //         //         py ? !py.coveredFaces[3] : py!=0,
    //         //         ny ? !ny.coveredFaces[2] : ny!=0,
    //         //         pz ? !pz.coveredFaces[5] : pz!=0,
    //         //         nz ? !nz.coveredFaces[4] : nz!=0,
    //         //     ])
    //         // }
    //         // console.timeEnd("Culling")

    //         // console.time("Physic")
    //         // // Physic
    //         // if(this.physic)
    //         // {
    //         //     const geoms = [];
    //         //     for (let i = 0; i < blocks.length; i++)
    //         //     {
    //         //         const b = blocks[i];
    //         //         if (!b || !b.graphic?.geometry?.index || (!b.physicGeometry?.index && !b.physicGeometry?.attributes?.position)) { continue }

    //         //         const vs = b.visibleSides;
    //         //         let anyVisible = false;
    //         //         for (let j = 0; vs && j < vs.length; j++) { if (vs[j]) { anyVisible = true; break } }
    //         //         if (!anyVisible) {continue}

    //         //         const g = b.physicGeometry.clone();
    //         //         const pos = g.attributes.position.array;
    //         //         const tx = b.position.x, ty = b.position.y, tz = b.position.z;
    //         //         for (let k = 0; k < pos.length; k += 3)
    //         //         {
    //         //             pos[k] += tx; pos[k+1] += ty; pos[k+2] += tz;
    //         //         }
    //         //         g.attributes.position.needsUpdate = true;

    //         //         geoms.push(g);
    //         //     }

    //         //     if(geoms.length > 0)
    //         //     {
    //         //         // const chunkColliderGeom = BufferGeometryUtils.mergeGeometries(geoms, false);
    //         //         const chunkColliderGeom = BufferGeometryUtils.mergeVertices(BufferGeometryUtils.mergeGeometries(geoms, false))

    //         //         const collider = RAPIER.ColliderDesc.trimesh(chunkColliderGeom.attributes.position.array, chunkColliderGeom.index.array);
    //         //         window.world.createCollider(collider)

    //         //         chunkData = Object.assign(chunkData, {collider})
    //         //         this.chunks.set(`${chunk.xPos},${chunk.zPos}`, chunkData)
    //         //     }
    //         // }
    //         // console.timeEnd("Physic")
    //         // for(const b of blocks.filter(b=>b?.graphic?.geometry?.index)){b.graphic.visible = false}
    //     }

    //     window.physic = initPhysicState;

    //     console.timeEnd("Chunk "+x+","+z)
    //     return chunkData
    // }

    // cull(x, y, z, max)
    // {
    //     const processed = new Set();

    //     const q = [];
    //     q.push([x, y, z]);
    //     processed.add(`${x},${y},${z}`);

    //     let steps = 0;

    //     while (q.length > 0)
    //     {
    //         const [x, y, z] = q.shift();
    //         if (++steps > max) break;

    //         const neighs =
    //         [
    //             [x + 1, y, z],
    //             [x - 1, y, z],
    //             [x, y + 1, z],
    //             [x, y - 1, z],
    //             [x, y, z + 1],
    //             [x, y, z - 1],
    //         ]

    //         for (let [nx, ny, nz] of neighs)
    //         {
    //             const k = `${nx}, ${ny}, ${nz}`;
    //             if(processed.has(k)) {continue}

    //             const b = this.getBlockFromPos(nx, ny, nz);

    //             if(!b || b.name=="minecraft:air" || b.name=="air" || !b?.graphic?.parent?.visible || !b?.graphic?.parent?.parent?.visible)
    //             {
    //                 processed.add(k);
    //                 q.push([nx, ny, nz]);
    //             }
    //             else
    //             {
    //                 processed.add(k);
    //                 if(b.graphic)
    //                 {
    //                     b.graphic.visible = true;
    //                 }
    //             }
    //         }
    //     }
    // }
}


// Utilies
function cloneCollider(srcCollider, targetBody = null)
{
    const shape = srcCollider.shape;     // Shape instance
    const type  = shape.type;            // ShapeType enum

    let desc;

    switch (type) {
        case RAPIER.ShapeType.Cuboid: {
            const he = srcCollider.halfExtents(); // { x,y,z }
            desc = RAPIER.ColliderDesc.cuboid(he.x, he.y, he.z);
            break;
        }

        case RAPIER.ShapeType.Ball: {
            const r = srcCollider.radius();
            desc = RAPIER.ColliderDesc.ball(r);
            break;
        }

        case RAPIER.ShapeType.Capsule: {
            // capsule(halfHeight, radius)
            const hh = srcCollider.halfHeight();
            const rr = srcCollider.radius();
            desc = RAPIER.ColliderDesc.capsule(hh, rr);
            break;
        }

        case RAPIER.ShapeType.Cylinder: {
            const hh = srcCollider.halfHeight();
            const rr = srcCollider.radius();
            desc = RAPIER.ColliderDesc.cylinder(hh, rr);
            break;
        }

        case RAPIER.ShapeType.ConvexPolyhedron: {
            // convex mesh from vertex buffer (+ optional indices)
            const verts = srcCollider.vertices();
            const inds  = typeof srcCollider.indices === 'function' ? srcCollider.indices() : undefined;
            desc = RAPIER.ColliderDesc.convexMesh(verts, inds);
            break;
        }

        case RAPIER.ShapeType.TriMesh: {
            // triangle mesh needs vertices + indices
            const verts = srcCollider.vertices();
            const inds  = srcCollider.indices();
            desc = RAPIER.ColliderDesc.trimesh(verts, inds);
            break;
        }

        default:
            throw new Error(`cloneCollider: unsupported shape type ${type}`);
    }

    // --- copy common collider properties ---
    if (srcCollider.isSensor()) desc.setSensor(true);
    if (typeof srcCollider.friction === 'function')   desc.setFriction(srcCollider.friction());
    if (typeof srcCollider.restitution === 'function')desc.setRestitution(srcCollider.restitution());
    if (typeof srcCollider.collisionGroups === 'function') desc.setCollisionGroups(srcCollider.collisionGroups());
    if (typeof srcCollider.solverGroups === 'function')    desc.setSolverGroups(srcCollider.solverGroups());
    if (typeof srcCollider.mass === 'function')             desc.setMass(srcCollider.mass());
    // any other ColliderDesc setters you need can be copied here...

    // copy the local transform relative to parent (if present)
    const target = targetBody ?? srcCollider.parent();
    const localTrans = srcCollider.translationWrtParent ? srcCollider.translationWrtParent() : null;
    const localRot   = srcCollider.rotationWrtParent ? srcCollider.rotationWrtParent() : null;

    if (localTrans) desc.setTranslation(localTrans.x, localTrans.y, localTrans.z);
    if (localRot)   desc.setRotation(localRot); // Rotation object/quaternion

    // create new collider
    const newCollider = window.world.createCollider(desc, target);

    return newCollider;
}
function cloneRigidbody(original)
{
    let cloneBodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(original.translation().x, original.translation().y, original.translation().z)
        .setRotation(original.rotation().x, original.rotation().y, original.rotation().z, original.rotation().w)
    cloneBodyDesc = Object.assign(cloneBodyDesc, original)
    
    return window.world.createRigidBody(cloneBodyDesc);
}