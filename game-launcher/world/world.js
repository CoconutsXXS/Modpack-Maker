import Block from "./block"
import * as THREE from "three"
import * as lodash from "lodash-es"
import RAPIER from '@dimforge/rapier3d-compat';

export default class World
{
    regions = new Map()
    chunks = new Map()
    palette = []
    biomePalette = []

    group = new THREE.Group()
    camera = window.mainCamera

    location
    world
    dimension = 'minecraft:overworld'
    jarContent

    material

    level

    addRenderListener = window.addRenderListener
    physic = false
    physicWorld = window.world
    colliders = new Map()

    sectionsPerChunk = 24
    chunkSectionY = -4;
    
    constructor(jarContent, location, addRenderListener = window.addRenderListener, camera = null, physic = true, physicWorld = window.world, material = new THREE.MeshPhysicalMaterial())
    {
        this.addRenderListener = addRenderListener
        this.jarContent = jarContent;
        this.location = location
        this.physic = physic
        this.camera = camera ? camera : window.mainCamera
        this.material = material
        this.physicWorld = physicWorld

        let lastCameraPosition = {x: 0, y: 0, z: 0}
        this.addRenderListener(() =>
        {
            let cameraPosition = {x: Math.floor(this.camera.position.x), y: Math.floor(this.camera.position.y), z: Math.floor(this.camera.position.z)}

            if(Math.abs(lastCameraPosition.x-cameraPosition.x) + Math.abs(lastCameraPosition.y-cameraPosition.y) + Math.abs(lastCameraPosition.z-cameraPosition.z) < 4)
            { return }
            lastCameraPosition = cameraPosition;

            // Chunk load
            // this.loadChunksFromPos(cameraPosition.x, cameraPosition.z, 3)
            
            // // Floodfill culling
            // for(const chunk of this.chunks.values?this.chunks.values():this.chunks) { if(!chunk){continue} for(const b of chunk.blocks.filter(b=>b?.graphic?.geometry?.index)){b.graphic.visible = false} }
            // this.cull(cameraPosition.x, cameraPosition.y, cameraPosition.z, 50000)
        })

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
    

    async loadLevel()
    {
        if(!this.world){return null}
        if(this.level){return this.level}

        this.level = (await ipcInvoke('readDat', this.location+sep()+'saves'+sep()+this.world+sep()+'level.dat', false))?.Data;
        return this.level
    }
    
    // Region & Chunks
    async readRegion(x, z)
    {
        if(!this.world){return null}

        const existing = this.regions.get(`${x},${z}`);
        if(existing!=undefined)
        {
            if(existing == false)
            {
                while(this.regions.get(`${x},${z}`) == false) { await new Promise(resolve => setTimeout(resolve, 100)) }
                return this.regions.get(`${x},${z}`);
            }
            return existing;
        }

        this.regions.set(`${x},${z}`, false)

        let dim = ''
        switch(this.dimension)
        {
            case "minecraft:overworld":
            {
                dim = ''
                break;
            }
            case "minecraft:the_end":
            {
                dim = 'DIM1'+sep()
                break;
            }
            case "minecraft:the_nether":
            {
                dim = 'DIM-1'+sep()
                break;
            }
            default:
            {
                dim = 'dimensions'+sep()+this.dimension.split(':')[0]+sep()+this.dimension.split(':')[1]+sep()
                break;
            }
        }
        const getChunk = await readRegion(this.location+sep()+'saves'+sep()+this.world+sep()+dim+'region'+sep()+`r.${x}.${z}.mca`);
        if(!getChunk){return getChunk}

        this.regions.set(`${x},${z}`, getChunk);
        return getChunk;
    }
    async loadChunk(x, z)
    {
        const existing = this.chunks.get(`${x},${z}`)
        if(existing!=undefined)
        {
            while(this.chunks.get(`${x},${z}`)==false) { await new Promise(resolve => setTimeout(resolve, 250)) }
            return this.chunks.get(`${x},${z}`)
        }

        this.chunks.set(`${x},${z}`, false)

        const aabb = new THREE.Box3(new THREE.Vector3(x, this.chunkSectionY*16, z), new THREE.Vector3(x+16, this.chunkSectionY*16 + this.sectionsPerChunk*16, z+16));

        const region = await this.readRegion(Math.floor(x/32), Math.floor(z/32))
        if(!region)
        {
            const airIndex = (await this.loadPalette('minecraft:air', {}, this.sectionsPerChunk * 4096)).index;
            const plainIndex = (await this.loadBiomePalette('minecraft:plains', {}, this.sectionsPerChunk * 64)).index;
            const d = {level: {xPos: x, zPos: z}, aabb, collider: null, blocks: new Array(this.sectionsPerChunk * 4096).fill(airIndex), biomes: new Array(this.sectionsPerChunk * 64).fill(plainIndex)};
            this.chunks.set(`${x},${z}`, d)
            return d;
        }

        const chunk = await region(x, z)
        if(!chunk)
        {
            const airIndex = (await this.loadPalette('minecraft:air', {}, this.sectionsPerChunk * 4096)).index;
            const plainIndex = (await this.loadBiomePalette('minecraft:plains', {}, this.sectionsPerChunk * 64)).index;
            const d = {level: {xPos: x, zPos: z}, aabb, collider: null, blocks: new Array(this.sectionsPerChunk * 4096).fill(airIndex), biomes: new Array(this.sectionsPerChunk * 64).fill(plainIndex)};
            this.chunks.set(`${x},${z}`, d)
            return d;
        }

        this.chunkSectionY = chunk.sections[0].Y*16

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
        const entriesPerLongCache = new Map();
        const maskCache = new Map();
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
            if(s.block_states.data.length > 256){continue}

            // Model Palette
            let paletteRedirection = []
            for(let p of s.block_states.palette)
            {
                paletteRedirection.push(totalPalette.findIndex(pal => lodash.isEqual(pal, p)))
            }

            const paletteLen = Math.max(1, (s.block_states && s.block_states.palette || []).length);
            const bitsPerBlock = Math.max(4, Math.ceil(Math.log2(paletteLen)));

            const longs = s.block_states.data;

            // Cache entriesPerLong and mask calculations
            let entriesPerLong, mask;
            if(entriesPerLongCache.has(bitsPerBlock))
            {
                entriesPerLong = entriesPerLongCache.get(bitsPerBlock);
                mask = maskCache.get(bitsPerBlock);
            }
            else
            {
                entriesPerLong = Math.floor(64 / bitsPerBlock);
                mask = (1n << BigInt(bitsPerBlock)) - 1n;
                entriesPerLongCache.set(bitsPerBlock, entriesPerLong);
                maskCache.set(bitsPerBlock, mask);
            }

            const requiredLongsAligned = Math.ceil(4096 / entriesPerLong);
            const requiredLongsStraddle = Math.ceil(4096 * bitsPerBlock / 64);

            let mode = null;
            // Alligned Check
            if(longs.length >= requiredLongsAligned)
            {
                let valid = true;
                for (let i = 0; i < Math.min(64, 4096); i++)
                {
                    const longIndex = Math.floor(i / entriesPerLong);
                    const within = i % entriesPerLong;
                    const offset = within * bitsPerBlock;
                    const val = Number((longs[longIndex] >> BigInt(offset)) & mask);
                    if (!Number.isFinite(val) || val < 0 || val >= paletteLen) {valid = false; break;}
                }
                if(valid) { mode = "aligned" }
            }
            // Straddle Check
            if(!mode && longs.length >= requiredLongsStraddle)
            {
                let state = 0;
                let data = longs[0];
                let dataLength = 64n;
                let valid = true;
                for (let j = 0; j < Math.min(256, 4096); j++) 
                {
                    const bits = bitsPerBlock;
                    if (dataLength < bits) {
                        state += 1;
                        if (state >= longs.length) {valid = false; break;}
                        const newData = longs[state];
                        data = (newData << dataLength) | data;
                        dataLength += 64n;
                    }
                    const paletteId = Number(data & mask);
                    if (!Number.isFinite(paletteId) || paletteId < 0 || paletteId >= paletteLen) {valid = false; break}
                    data >>= BigInt(bits);
                    dataLength -= BigInt(bits);
                }
                if(valid) { mode = "straddle" }
            }

            if(!mode)
            {
                if (longs.length >= requiredLongsAligned)
                {
                    mode = "aligned";
                    console.warn("block_states: pair-order and mode ambiguous — defaulting to [low,high]/aligned. You should verify results.");
                }
                else { throw new Error(`block_states.data seems invalid or truncated. Need at least ${Math.max(requiredLongsAligned, requiredLongsStraddle)} longs (aligned=${requiredLongsAligned}, straddle=${requiredLongsStraddle}) but got ${longs.length}.`); }
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
            else if(mode == "straddle")
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
                        paletteIndexes[baseIndex+j] = null
                        continue;
                    }
                    else if(paletteIndex > paletteRedirection)
                    {
                        console.warn(`${paletteIndex} is not included in the palette redirector...`)
                        paletteIndexes[baseIndex+j] = null
                        continue;
                    }

                    paletteIndexes[baseIndex+j] = paletteRedirection[paletteIndex];

                    data >>= BigInt(bitsPerBlock);
                    dataLength -= BigInt(bitsPerBlock);
                }
            }
        }

        // Block Entities
        for(const b of chunk.block_entities)
        {
            const paletteData = {Name: b.id};
            let paletteIndex = totalPalette.findIndex(pal => lodash.isEqual(pal, paletteData))
            if(paletteIndex == -1)
            { paletteIndex = totalPalette.length; totalPalette.push(paletteData) }

            paletteIndexes[this.positionToIndex(b.x, b.y, b.z)] = paletteIndex
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


        const blockIndexToPaletteIndex = new Array(chunk.sections.length * 4096);
        const instancesByPalette = new Map();

        const biomeIndexToPaletteIndex = new Array(chunk.sections.length * 64);
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
        for(const [i] of instancesByPalette)
        {
            if(!totalPalette[i]){continue}
            loadedPalette[i] = await this.loadPalette(totalPalette[i].Name, totalPalette[i].Properties, 32);
        }
        const loadedBiomePalette = new Array(instancesByBiomePalette.length)
        for(const [i] of instancesByBiomePalette)
        {
            if(!totalBiomePalette[i]){continue}
            loadedBiomePalette[i] = await this.loadBiomePalette(totalBiomePalette[i]);
        }

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
                
                if(x==15 && neighboorChunks[0]?.blocks?.[this.positionToIndex(0, y, z%16)])
                {
                    const n = this.palette[neighboorChunks[0]?.blocks[this.positionToIndex(0, y, z%16)]]?.model;

                    if(model?.coveredFaces?.[0]==false)
                    { n?.createPart(0 + (neighboorChunks[0]?.level.xPos ?? 0) * 16, y, z + (neighboorChunks[0]?.level.zPos ?? 0) * 16, 2) }
                    faces[0] = n?.coveredFaces[1]==false
                }
                if(x==0 && neighboorChunks[1]?.blocks?.[this.positionToIndex(15, y, z%16)])
                {
                    const n = this.palette[ neighboorChunks[1]?.blocks[this.positionToIndex(15, y, z%16)] ]?.model;

                    if(model?.coveredFaces?.[1]==false)
                    { n?.createPart(15+neighboorChunks[1].level.xPos*16, y, z+neighboorChunks[1].level.zPos*16, 1) }
                    faces[1] = n?.coveredFaces[0]==false
                }
                if(z==15 && neighboorChunks[2]?.blocks?.[this.positionToIndex(x%16, y, 0)])
                {
                    const n = this.palette[ neighboorChunks[2]?.blocks[this.positionToIndex(x%16, y, 0)] ]?.model;

                    if(model?.coveredFaces?.[4]==false)
                    {
                        n?.createPart(x+neighboorChunks[2].level.xPos*16, y, 0+neighboorChunks[2].level.zPos*16, 6)
                    }

                    faces[4] = n?.coveredFaces[5]==false
                }
                if(z==0 && neighboorChunks[3]?.blocks?.[this.positionToIndex(x%16, y, 15)])
                {
                    const n = this.palette[ neighboorChunks[3]?.blocks[this.positionToIndex(x%16, y, 15)] ]?.model;

                    if(model?.coveredFaces?.[5]==false)
                    {
                        n?.createPart(x+neighboorChunks[3].level.xPos*16, y, 15+neighboorChunks[3].level.zPos*16, 5)
                    }

                    faces[5] = n?.coveredFaces[4]==false
                }

                let biomes = []
                if(model.tinted)
                {
                    const nearBiomes = this.getNearbyBiomes(x,y,z)
                    biomes = new Array(nearBiomes.length)
                    for (let i = 0; i < nearBiomes.length; i++)
                    {
                        const b = nearBiomes[i];
                        biomes[i] =
                        {
                            weight: b.weight,
                            data: this.biomePalette[ chunkData.biomes[b.biome] ].data
                        }
                    }
                }
                
                model.create(x+baseX, y, z+baseZ, faces, biomes)

                if(this.physic)
                {
                    const col = RAPIER.ColliderDesc.cuboid(.5, .5, .5);
                    col.translation = new RAPIER.Vector3(x+baseX, y, z+baseZ)
                    window.world.createCollider(col)
                }
            }
        }

        // Update
        if(this.physic)
        { for(const p of loadedPalette) { if(!p?.value?.model || p?.value?.model?.name == 'minecraft:air' || p?.value?.model?.name == 'air'){continue} p.value.model.computeBoundingSphere() } }

        this.chunks.set(`${chunk.xPos},${chunk.zPos}`, chunkData)

        return chunkData
    }
    async importStructure(id, baseX, baseY, baseZ)
    {
        // Read
        let data = id
        if(typeof id == "string") { data = (await this.jarContent.resolveData(id)).simplified }

        // Palette
        let palette = [];
        for(let p of data.palette) { palette.push(await this.loadPalette(p.Name, p.Properties, 16)) }

        // Writing
        let oldBlocks = new Array(data.blocks.length)
        for(const i in data.blocks)
        {
            const b = data.blocks[i]
            if(!b){continue;}
            const x = baseX+b.pos[0]; const y = baseY+b.pos[1]; const z = baseZ+b.pos[2]
            const key = `${Math.floor(x/16)},${Math.floor(z/16)}`;
                        
            const newV = this.chunks.get(key) || await this.loadChunk(Math.floor((x)/16), Math.floor((baseX+b.pos[2])/16))
            oldBlocks[i] = newV.blocks[this.positionToIndex(x%16, y, z%16)];

            newV.blocks[this.positionToIndex(x%16, y, z%16)] = palette?.[b.state]?.index;

            this.chunks.set(key, newV);
        }

        // Placing
        for(let i in data.blocks)
        {
            const b = data.blocks[i];
            if(!b || !palette[b.state]){ continue;}
            
            const x = baseX+b.pos[0]; const y = baseY+b.pos[1]; const z = baseZ+b.pos[2]

            this.palette?.[oldBlocks[i]]?.delete && this.palette[oldBlocks[i]]?.delete(x, y, z)

            let faces =
            [
                this.getBlock(x+1, y, z)?.paletteData?.model?.coveredFaces?.[1]==false,
                this.getBlock(x-1, y, z)?.paletteData?.model?.coveredFaces?.[0]==false,
                this.getBlock(x, y+1, z)?.paletteData?.model?.coveredFaces?.[3]==false,
                this.getBlock(x, y-1, z)?.paletteData?.model?.coveredFaces?.[2]==false,
                this.getBlock(x, y, z+1)?.paletteData?.model?.coveredFaces?.[5]==false,
                this.getBlock(x, y, z-1)?.paletteData?.model?.coveredFaces?.[4]==false,
            ]

            const model = palette[b.state].value.model;
            
            const neighboorChunks = [await this.loadChunk(Math.floor(x/16) +1, Math.floor(z/16)), await this.loadChunk(Math.floor(x/16) -1, Math.floor(z/16)), await this.loadChunk(Math.floor(x/16), Math.floor(z/16) +1), await this.loadChunk(Math.floor(x/16),Math.floor(z/16) -1)]

            if((x%16)==15 && neighboorChunks[0]?.blocks?.[this.positionToIndex(0, y, z%16)])
            {
                const n = this.palette[neighboorChunks[0]?.blocks[this.positionToIndex(0, y, z%16)]]?.model;

                if(model?.coveredFaces?.[0]==false)
                { n?.createPart(0 + ((neighboorChunks[0]?.level.xPos) ?? 0) * 16, y, (z%16) + (neighboorChunks[0]?.level.zPos ?? 0) * 16, 2) }
                faces[0] = n?.coveredFaces[1]==false
            }
            if((x%16)==0 && neighboorChunks[1]?.blocks?.[this.positionToIndex(15, y, z%16)])
            {
                const n = this.palette[ neighboorChunks[1]?.blocks[this.positionToIndex(15, y, z%16)] ]?.model;

                if(model?.coveredFaces?.[1]==false)
                { n?.createPart(15+neighboorChunks[1].level.xPos*16, y, (z%16)+neighboorChunks[1].level.zPos*16, 1) }
                faces[1] = n?.coveredFaces[0]==false
            }
            if((z%16)==15 && neighboorChunks[2]?.blocks?.[this.positionToIndex(x%16, y, 0)])
            {
                const n = this.palette[ neighboorChunks[2]?.blocks[this.positionToIndex(x%16, y, 0)] ]?.model;

                if(model?.coveredFaces?.[4]==false)
                {
                    n?.createPart((x%16)+neighboorChunks[2].level.xPos*16, y, 0+neighboorChunks[2].level.zPos*16, 6)
                }

                faces[4] = n?.coveredFaces[5]==false
            }
            if((z%16)==0 && neighboorChunks[3]?.blocks?.[this.positionToIndex(x%16, y, 15)])
            {
                const n = this.palette[ neighboorChunks[3]?.blocks[this.positionToIndex(x%16, y, 15)] ]?.model;

                if(model?.coveredFaces?.[5]==false)
                {
                    n?.createPart((x%16)+neighboorChunks[3].level.xPos*16, y, 15+neighboorChunks[3].level.zPos*16, 5)
                }

                faces[5] = n?.coveredFaces[4]==false
            }

            let biomes = []
            if(model.tinted)
            {
                const nearBiomes = this.getNearbyBiomes(x,y,z)
                biomes = new Array(nearBiomes.length)
                for (let i = 0; i < nearBiomes.length; i++)
                {
                    const b = nearBiomes[i];
                    biomes[i] =
                    {
                        weight: b.weight,
                        data: this.biomePalette[ this.chunks.get(`${Math.floor(x/16)},${Math.floor(z/16)}`)?.biomes?.[b.biome] ]?.data
                    }
                }
            }

            await model.create(x, y, z, faces, biomes)

            if(this.physic && this.physicWorld && this.colliders.get(`${x},${y},${z}`))
            {
                this.physicWorld.removeCollider(this.colliders.get(`${x},${y},${z}`))
            }
            if(this.physic && this.physicWorld && palette[b.state].value.id != 'minecraft:air' && palette[b.state].value.id != 'air')
            {
                const col = RAPIER.ColliderDesc.cuboid(.5, .5, .5);
                col.translation = new RAPIER.Vector3(x, y, z)

                this.colliders.set(`${x},${y},${z}`, this.physicWorld.createCollider(col))
            }

        }

        if(this.physic)
        { for(const p of palette) { if(!p?.value?.model){continue} p.value.model.computeBoundingSphere() } }
    }

    clearChunks()
    {
        this.chunks.forEach((v,k) =>
        {
            this.clearChunk(Number(k.split(',')[0]), Number(k.split(',')[1]))
        })
    }
    clearChunk(x, z)
    {
        const chunk = this.chunks.get(`${x},${z}`)
        if(!chunk || !chunk.blocks){ return }

        for (let idx = 0; idx < 4096*this.sectionsPerChunk; idx++)
        {
            const paletteIndex = chunk.blocks[idx];
            if(paletteIndex==undefined || !this.palette[paletteIndex]) { continue }

            let p = this.indexToPosition(idx);
            p = [p.x+x*16, p.y, p.z+z*16]

            this.palette[paletteIndex].model.delete(...p);

            var k = `${p[0]},${p[0]},${p[0]}`;
            this.colliders.get(k) && this.physicWorld.removeCollider(this.colliders.get(k))
        }
    }
    clearAll()
    {
        this.chunks.clear()
        
        for(const p of this.palette)
        {
            if(!p){continue}
            for(const part of p.model.parts)
            {
                if(!part){continue}
                for(const m of part.meshes)
                {
                    m.removeFromParent()
                }
            }
        }
        this.palette = []

        for(const c of this.group.children) { this.group.remove(c); }

        this.colliders.forEach(v => this.physicWorld.removeCollider(v))
    }

    // Blocks
    async loadPalette(id, properties = {}, capacity = 32)
    {
        const existing = this.palette.findIndex(p => p.id == id && JSON.stringify(p.properties) == JSON.stringify(properties));
        if(existing > -1)
        {
            const existingValue = this.palette[existing];
            if(existingValue==0)
            {
                while(this.palette[existing]==0) { await new Promise(resolve => setTimeout(resolve, 100)) }
                return {index: existing, value: this.palette[existing]}
            }

            return {index: existing, value: existingValue}
        }

        const index = Math.max(0, this.palette.length)
        this.palette.push(0)
        
        const model = await Block.from(id, properties, this.jarContent, capacity, this.material);
        for (let i = 0; i < 7; i++) { if(model.parts?.[i]?.meshes) { this.group.add(...model.parts[i].meshes); } }
        const element = 
        {
            model,
            id: id,
            properties: properties
        }

        this.palette[index] = element
        return {index: this.palette.length-1, value: element};
    }
    async placeBlock(x, y, z, id, properties = {}, replace = true, updateCulling = true)
    {
        const p = await this.loadPalette(id, properties);

        // Get/Load Chunk
        const chunkX = Math.floor(x/16)
        const chunkZ = Math.floor(z/16)
        let chunk = this.chunks.get(`${chunkX},${chunkZ}`) || await this.loadChunk(chunkX, chunkZ)
        // console.log(chunk)
        // if(!chunk) { chunk = {blocks: new Array(256*this.sectionsPerChunk)}; }

        // Check if already exist
        const existing = this.getBlock(x, y, z);
        if(!replace && existing) { return }
        else if(existing)
        {
            existing.paletteData.model.delete(x, y, z);
        }

        // Write to Chunk
        const idx = this.positionToIndex(x, y, z);
        const oldIdx = chunk.blocks[idx];
        chunk.blocks[idx] = p.index;

        // Graphic
        if(updateCulling && (p.value.model || (replace && existing)))
        {
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
                await p.value.model.create(x, y, z, [
                    neighboorModels[0]?.coveredFaces?.[1]==false,
                    neighboorModels[1]?.coveredFaces?.[0]==false,
                    neighboorModels[2]?.coveredFaces?.[3]==false,
                    neighboorModels[3]?.coveredFaces?.[2]==false,
                    neighboorModels[4]?.coveredFaces?.[5]==false,
                    neighboorModels[5]?.coveredFaces?.[4]==false
                ])

                if(this.physic) { p.value.model.computeBoundingSphere() }
            }

            // Neighboors
            neighboorModels[0] && neighboorModels[0][p.value.model.coveredFaces[0]?'deletePart':'createPart'](x+1, y, z, 1+1)
            neighboorModels[1] && neighboorModels[1][p.value.model.coveredFaces[1]?'deletePart':'createPart'](x-1, y, z, 0+1)
            neighboorModels[2] && neighboorModels[2][p.value.model.coveredFaces[2]?'deletePart':'createPart'](x, y+1, z, 3+1)
            neighboorModels[3] && neighboorModels[3][p.value.model.coveredFaces[3]?'deletePart':'createPart'](x, y-1, z, 2+1)
            neighboorModels[4] && neighboorModels[4][p.value.model.coveredFaces[4]?'deletePart':'createPart'](x, y, z+1, 5+1)
            neighboorModels[5] && neighboorModels[5][p.value.model.coveredFaces[5]?'deletePart':'createPart'](x, y, z-1, 4+1)
        }

        if(this.physic && this.physicWorld && replace && existing && this.colliders.get(`${x},${y},${z}`))
        {
            this.physicWorld.removeCollider(this.colliders.get(`${x},${y},${z}`))
            if(this.palette[oldIdx]?.model)
            { this.palette[oldIdx].model.computeBoundingSphere() }
        }
        if(this.physic && this.physicWorld && id != 'minecraft:air' && id != 'air')
        {
            const col = RAPIER.ColliderDesc.cuboid(.5, .5, .5);
            col.translation = new RAPIER.Vector3(x, y, z)

            this.colliders.set(`${x},${y},${z}`, this.physicWorld.createCollider(col))
        }

        this.chunks.set(`${chunkX},${chunkZ}`, chunk)
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
        if(!chunk || !chunk.blocks){ return 0 }

        const idx = this.positionToIndex(x%16, y, z%16);

        const paletteIndex = chunk.blocks[idx];
        if(paletteIndex==undefined) { return -1 }

        const index = chunk.blocks.slice(0, idx).length;
        const paletteData = this.palette[paletteIndex]

        return {index, paletteData}
    }
    positionToIndex(x, y, z, local = true)
    {
        x = ((x % 16) + 16) % 16;
        z = ((z % 16) + 16) % 16;

        x = (x > 7) ? x - 8 : x + 8;

        return ((y - this.chunkSectionY*16) << 8) | (z << 4) | x
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
        
        const data = JSON.parse(await this.jarContent.resolveData(id+'.json', ["worldgen", "biome"]));
        const element = 
        {
            data,
            id: id
        }

        this.biomePalette.push(element)
        return {index: this.biomePalette.length-1, value: element};
    }
    biomePositionToIndex(x, y, z, local = true)
    {
        const bx = Math.floor((x - (local ? Math.floor(x / 16) * 16 : 0)) / 4);
        const by = Math.floor(((y - this.chunkSectionY * 16) % 16) / 4);
        const bz = Math.floor((z - (local ? Math.floor(z / 16) * 16 : 0)) / 4);

        return (by << 4) | (bz << 2) | bx;
    }
    getNearbyBiomes(x, y, z)
    {
        const localY = y - this.chunkSectionY * 16;

        const bx = Math.floor(x / 4);
        const by = Math.floor(localY / 4);
        const bz = Math.floor(z / 4);

        const fx = (x / 4) - bx;
        const fy = (localY / 4) - by;
        const fz = (z / 4) - bz;

        const wx = [1 - fx, fx];
        const wy = [1 - fy, fy];
        const wz = [1 - fz, fz];

        const result = [];

        for (let dx = 0; dx <= 1; dx++)
        {
            for (let dy = 0; dy <= 1; dy++)
            {
                for (let dz = 0; dz <= 1; dz++)
                {
                    const weight = wx[dx] * wy[dy] * wz[dz];
                    if (weight <= 0) continue;

                    const nx = bx + dx;
                    const ny = by + dy;
                    const nz = bz + dz;

                    // index within this section’s 4x4x4 biome grid
                    const biomeIndex = (ny << 4) | (nz << 2) | nx;
                    const globalIndex = biomeIndex;

                    const biome = globalIndex;
                    if (biome == null) continue;

                    result.push({ biome, weight });
                }
            }
        }

        const total = result.reduce((a, b) => a + b.weight, 0);
        for (const r of result) r.weight /= total;

        return result;
    }


    // Saving Data
    toStructureNbt()
    {
        let data = 
        {
            "type": "compound",
            "name": "",
            "value":
            {
                "size":
                {
                    "type": "list",
                    "value":
                    {
                        "type": "int",
                        "value": [0, 0, 0]
                    }
                },
                "entities":
                {
                    "type": "list",
                    "value":
                    {
                        "type": "end",
                        "value": []
                    }
                },
                "blocks":
                {
                    "type": "list",
                    "value":
                    {
                        "type": "compound",
                        "value": []
                    }
                },
                "palette":
                {
                    "type": "list",
                    "value":
                    {
                        "type": "compound",
                        "value": []
                    }
                },
                "DataVersion":
                {
                    "type": "int",
                    "value": 3465
                }
            }
        }

        function addPalette(name, properties = {})
        {
            let propList = {}

            for(const [k, v] of Object.entries(properties))
            {
                propList[k] =
                {
                    type: "string",
                    value: v.toString()
                }
            }

            let result =
            {
                Name:
                {
                    type: "string",
                    value: name
                }
            }

            if(Object.keys(propList).length > 0)
            {
                result.Properties =
                {
                    type: "compound",
                    value: propList
                }
            }

            data.value.palette.value.value.push(result)
        }

        function addBlock(paletteIndex, x, y, z)
        {
            data.value.blocks.value.value.push
            ({
                pos:
                {
                    type: "list",
                    value:
                    {
                        type: "int",
                        value: [x, y, z]
                    }
                },
                state:
                {
                    type: "int",
                    value: paletteIndex
                }
            })
        }

        for(const p of this.palette)
        {
            addPalette(p.id, p.properties)
        }

        let min = [0, 0, 0]
        const airIndex = this.palette.findIndex(p=>p.id=='minecraft:air' || p.id=='air')
        for(const c of this.chunks)
        {
            const cx = Number(c[0].split(',')[0])*16
            const cz = Number(c[0].split(',')[1])*16

            for (let idx = 0; idx < c[1].blocks.length; idx++)
            {
                const paletteIndex = c[1].blocks[idx]
                if(paletteIndex == airIndex) { continue }

                let pos = this.indexToPosition(idx);
                pos.x+=cx; pos.z+=cz;

                addBlock(c[1].blocks[idx], pos.x, pos.y, pos.z)

                // Max
                if(pos.x > data.value.size.value.value[0])
                { data.value.size.value.value[0] = pos.x }
                if(pos.y > data.value.size.value.value[1])
                { data.value.size.value.value[1] = pos.y }
                if(pos.z > data.value.size.value.value[2])
                { data.value.size.value.value[2] = pos.z; }

                // Min
                if(pos.x < min[0])
                { min[0] = pos.x }
                if(pos.y < min[1])
                { min[1] = pos.y }
                if(pos.z < min[2])
                { min[2] = pos.z }
            }
        }

        if(min.x != 0 || min.y != 0 || min.z != 0)
        {
            for (let i = 0; i < data.value.blocks.value.value.length; i++)
            {
                data.value.blocks.value.value[i].pos.value.value[0] -= min[0]
                data.value.blocks.value.value[i].pos.value.value[1] -= min[1]
                data.value.blocks.value.value[i].pos.value.value[2] -= min[2]
            }
        }

        data.value.size.value.value[0]++
        data.value.size.value.value[1]++
        data.value.size.value.value[2]++

        return data

        ipcInvoke('writeNbt', data, '/Users/coconuts/Desktop/Projets/Modpack-Maker/game-launcher/test.nbt')
    }
}