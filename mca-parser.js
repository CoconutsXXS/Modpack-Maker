const fs = require("fs");
const zlib = require("zlib");
const nbt = require('prismarine-nbt');

// const { WorldReader, LevelDataFrame } = require('@xmcl/world')
// const xmclNbt = require('@xmcl/nbt')

module.exports = async function parseMCA(filePath, raw = false)
{
    if(!fs.existsSync(filePath)){return null}
    const buffer = fs.readFileSync(filePath);

    const chunks = {};
    for (let i = 0; i < 1024; i++)
    {
        const offset = buffer.readUIntBE(i * 4, 3);
        const sectors = buffer.readUInt8(i * 4 + 3);
        if (offset === 0 || sectors === 0) continue;

        const sectorStart = offset * 4096;
        const length = buffer.readUInt32BE(sectorStart);
        const compression = buffer.readUInt8(sectorStart + 4);
        const data = buffer.subarray(sectorStart + 5, sectorStart + 4 + length);

        let decompressed;
        if (compression === 2) decompressed = zlib.unzipSync(data);
        else if (compression === 1) decompressed = zlib.gunzipSync(data);
        else if (compression === 3) decompressed = data;
        else
        {
            console.warn(`Unknown compression ${compression} in chunk ${i}`);
            continue;
        }

        try
        {
            let parsed = await nbt[raw?"parseAs":"parseUncompressed"](decompressed, 'big')
            // console.log(nbt.parseUncompressed(decompressed, 'big'))
            if(!raw){parsed=nbt.simplify(parsed)}

            for (let i = 0; i < parsed.sections.length; i++)
            {
                parsed.sections[i].block_states.data = nbt.longArray(parsed.sections[i].block_states.data).value.map(o => (BigInt(o[1]) << 32n) | BigInt(o[0] >>> 0));
            }

            // {
            //     const a = await xmclNbt.deserialize(decompressed)
            //     const worldSaveFolder = '/Users/coconuts/Library/Application Support/Modpack Maker/instances/test/minecraft/saves/New World 1_20_1';
            //     const reader = await WorldReader.create(worldSaveFolder);
            //     const levelData = await reader.getRegionData(0, 0);
            //     console.log(parsed, levelData, a)
            // }

            chunks[i] = parsed;
        }
        catch (err)
        {
            // console.warn(`Failed to parse chunk ${i}:`, err.message);
        }
    }

    return chunks;
}