// decodeBlockStatesPairs.js
// Input shape:
//  { BlockStates: [ [low32, high32], ... ], Palette: [ ... ] }
// This returns a Uint32Array of length 4096 where each value is either a palette index
// (if palette mode) or a direct blockstate id (direct mode).

function longPairToBigInt(pair) {
  // pair = [low32, high32] where each element may be signed 32-bit JS Number.
  const low = pair[0] >>> 0;   // convert to unsigned 32-bit
  const high = pair[1] >>> 0;  // convert to unsigned 32-bit
  return (BigInt(high) << 32n) | BigInt(low);
}

function bitsPerBlockForPalette(paletteLen) {
  if (!paletteLen || paletteLen <= 1) return 4;
  const bits = Math.ceil(Math.log2(paletteLen));
  return Math.max(4, bits);
}

function decodeBlockStatesFromLongPairs(blockStatePairs, bitsPerBlock, count = 4096) {
  // Convert pairs to BigInt longs:
  const longs = blockStatePairs.map(longPairToBigInt);

  const mask = (1n << BigInt(bitsPerBlock)) - 1n;
  const bitsPerLong = 64n;
  const blocks = new Uint32Array(count);

  for (let i = 0; i < count; i++) {
    const startBit = BigInt(i) * BigInt(bitsPerBlock);
    const wordIndex = Number(startBit / bitsPerLong);
    const bitOffset = Number(startBit % bitsPerLong);

    // take the long and shift right by bitOffset (LSB-first packing)
    let value = longs[wordIndex] >> BigInt(bitOffset);

    // if the value crosses the 64-bit boundary, OR in bits from the next long
    if (bitOffset + bitsPerBlock > 64) {
      const next = (wordIndex + 1) < longs.length ? longs[wordIndex + 1] : 0n;
      const shift = BigInt(64 - bitOffset);
      value = value | (next << shift);
    }

    const v = Number(value & mask);
    blocks[i] = v;
  }

  return blocks;
}

function decodeSectionFromObject(section) {
  const palette = Array.isArray(section.Palette) ? section.Palette : [];
  const pairs = Array.isArray(section.BlockStates) ? section.BlockStates : [];
  const bitsPerBlock = bitsPerBlockForPalette(palette.length);
  // If palette is empty or bitsPerBlock >= 9 some versions use direct mode; we treat
  // this implementation as palette-mode when palette exists; otherwise direct.
  const directMode = (palette.length === 0) || (bitsPerBlock >= 9);

  const raw = decodeBlockStatesFromLongPairs(pairs, bitsPerBlock, 4096);

  return {
    blocks: raw,           // Uint32Array(4096) : palette indices (or direct ids)
    palette,
    bitsPerBlock,
    mode: directMode ? 'direct' : 'palette',
    indexToXYZ: (index) => {
      const y = index & 0xF;
      const z = (index >> 4) & 0xF;
      const x = index >> 8;
      return { x, y, z };
    },
    coordsToIndex: (x, y, z) => ((x << 8) | (z << 4) | (y))
  };
}


export {
  bitsPerBlockForPalette,
  decodeBlockStatesFromLongPairs,
  decodeSectionFromObject
};
