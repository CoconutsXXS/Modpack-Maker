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

                            tex.colorspace = THREE.SRGBColorSpace;
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
                const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false, side: THREE.FrontSide, alphaTest: .5, shadowSide: THREE.FrontSide, clipShadows: true, clipIntersection: true });
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

                materials.push(materialCache[path] || new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide }))
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


async function parseModel(modelPath, modpackJar = new ModpackJar(), opts = {rx: 0, ry: 0, sides, loader: new THREE.TextureLoader(), scale: 1 / 16, center: false, collider: false})
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

async function parseNbt(structurePath, modpackJar = new ModpackJar(), physic = false, optimize = false)
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

async function parseMca(filePath, position = {x: 0, y: 0}, size = {x: 1, y: 1}, modpackJar = new ModpackJar(), physic = false)
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