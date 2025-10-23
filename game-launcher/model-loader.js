import * as THREE from "three"
import * as lodash from "lodash-es"
import { ModpackJar } from "./jar-data";
import { mergeGroupOptimizedChunked } from "../renderer/mesh-optimizer"
import RAPIER from '@dimforge/rapier3d-compat';

export async function parseModel(modelPath, modpackJar = new ModpackJar(), opts = {loader: new THREE.TextureLoader(), scale: 1 / 16, center: false, collider: false})
{
    const {
        loader = new THREE.TextureLoader(),
        scale = 1 / 16,
        center = true
    } = opts;

    let modelData = typeof(modelPath)=='string'?JSON.parse(await modpackJar.resolveAsset(modelPath)):modelPath

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
        const resolved = data.url?`data:image/png;base64,${data.url}`:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR42mPABX4w/MCKaKJhVMPgcOuoBgDZRfgBVl5QdQAAAABJRU5ErkJggg==';
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

    const parentGroup = new THREE.Group();
    parentGroup.position.set(0, 0, 0);

    const materialEntries = Object.entries(materialGroups).sort();
    for (const [path, group] of materialEntries)
    {
        if (group.vertices.length === 0) continue;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(group.vertices, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(group.uvs, 2));
        geom.setIndex(new THREE.Uint16BufferAttribute(group.indices, 1));
        const mat = materialCache[path] || new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.FrontSide });
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
        const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff, side: THREE.FrontSide });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parentGroup.add(mesh);
    }

    if(!center)
    {
        for(let c of parentGroup.children){c.position.add(new THREE.Vector3(0.5, 0, 0.5))}
    }

    // Physic
    if(opts.collider)
    {
        const body = world.createRigidBody( RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0) )
        world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 1), body)

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
export async function parseNbt(structurePath, modpackJar = new ModpackJar(), physic = false, optimize = false)
{
    let data = typeof(structurePath)=='string'?(await modpackJar.resolveData(structurePath)).parsed:structurePath

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
        if(p.Properties || (p.Name && !(await modpackJar.resolveAsset(p.Name, ['models'])) && !(await modpackJar.resolveAsset(p.Name, ['models', 'block']))))
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
                console.log("NO VARIANT/MULTIPART", blockstateJson)
            }
        }
        else { files.push({model: p.Name}); }

        let final = new THREE.Group();
        for(let f of files)
        {
            if(!f.model){ console.log(files, p); continue;}
            let json = JSON.parse(await modpackJar.resolveAsset(f.model, ['models']));

            if(!json){ json = JSON.parse(await modpackJar.resolveAsset(f.model, ['models', 'block'])) }
            if(!json){ continue; }

            while(json.parent != undefined)
            {
                let parent = json.parent;
                let parentObj = JSON.parse(await modpackJar.resolveAsset(parent, ['models']));
                let nextParent = parentObj.parent;

                json = lodash.merge(parentObj, json);

                if(parent == nextParent) { json.parent = undefined }
                else { json.parent = nextParent; }
            }
            
            let model = await parseModel(json, modpackJar, {center: true});

            for(let [i, c] of model.children.entries()){model.children[i].position.z-=0;model.children[i].position.y-=0.5;model.children[i].position.x-=0;}
            
            if(!f.x){f.x=0} if(!f.y){f.y=0;}
            model.rotation.order = 'XYZ';
            model.rotateY(THREE.MathUtils.degToRad(-f.y))
            model.rotateX(THREE.MathUtils.degToRad(-f.x))

            final.add(model);
        }

        palette.push(final);
    }

    let result = new THREE.Group();
    for(let b of data.blocks)
    {
        if(!palette[b.state] || !palette[b.state]){continue;}
        let m = palette[b.state].clone(true);
        m.position.setX(b.pos[0]+0.5)
        m.position.setY(b.pos[1]+0.5)
        m.position.setZ(b.pos[2]+0.5)
        result.add(m);
    }

    result = optimize?await mergeGroupOptimizedChunked(result, { tolerance: 1e-5 }):result;
    result.castShadow = true;
    result.receiveShadow = true;

    // Physic
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, 0)
    const body = world.createRigidBody(bodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.trimesh(1, 1, 1)
    world.createCollider(colliderDesc, body)

    return result;
}