// decodeSection.mjs
// Node.js ES2020+
// Usage: node --experimental-modules decodeSection.mjs
const DEFAULT_NUM_BLOCKS = 4096;
const MASK_64 = (1n << 64n) - 1n;

function warn(msg) { console.warn('[WARN]', msg); }
function info(msg) { console.log('[INFO]', msg); }

/**
 * Normalize various input formats into unsigned BigInt[] representing 64-bit words.
 * Accepts:
 *   - BigInt[]
 *   - string[] (decimal)
 *   - number[] (if < 2**53 safe; otherwise warned)
 *   - {high:number, low:number}[]  (both signed or unsigned 32-bit)
 *
 * Options:
 *   - highIsSigned: if true, treats high as signed 32-bit (JS typical when reading Java int)
 *
 * Returns BigInt[] where each entry is treated as unsigned 64-bit.
 */
export function normalizeLongArray(rawArray, { highIsSigned = true } = {}) {
  if (!Array.isArray(rawArray)) throw new TypeError('rawArray must be an array');
  return rawArray.map((entry, idx) => {
    if (typeof entry === 'bigint') {
      // ensure unsigned 64-bit mask
      return entry & MASK_64;
    }
    if (typeof entry === 'string') {
      // decimal string -> BigInt
      try {
        return BigInt(entry) & MASK_64;
      } catch (e) {
        throw new Error(`Invalid decimal string at index ${idx}: ${entry}`);
      }
    }
    if (typeof entry === 'number') {
      // limited precision: warn if large
      if (!Number.isFinite(entry)) throw new Error(`Invalid number at index ${idx}`);
      if (Math.abs(entry) > Number.MAX_SAFE_INTEGER) {
        warn(`Number at index ${idx} exceeds MAX_SAFE_INTEGER; precision loss possible.`);
      }
      // treat as unsigned 64-bit representation of the number
      return BigInt(Math.trunc(entry)) & MASK_64;
    }
    if (entry && typeof entry === 'object' && 'high' in entry && 'low' in entry) {
      const high = entry.high >>> 0; // treat as unsigned 32
      const low = entry.low >>> 0;
      let highBig = BigInt(high);
      if (highIsSigned) {
        // if high is negative in signed 32-bit representation (JS came with negative), convert
        // but above we used >>> 0 so we've already got unsigned view; allow caller to pass signed numbers originally
      }
      return ((highBig << 32n) | BigInt(low)) & MASK_64;
    }
    throw new TypeError(`Unsupported entry type at index ${idx}: ${JSON.stringify(entry)}`);
  });
}

/**
 * Build a concatenated BigInt from an array of 64-bit words.
 * - LSB order: long[0] is least significant 64 bits (Mojang default).
 * - MSB order: long[0] is most significant 64 bits.
 */
function concatLongsToBigInt(longs, { order = 'LSB' } = {}) {
  if (order === 'LSB') {
    // little-endian concatenation: result = sum(longs[i] << (64*i))
    let acc = 0n;
    for (let i = 0; i < longs.length; i++) {
      acc |= (longs[i] & MASK_64) << (64n * BigInt(i));
    }
    return acc;
  } else if (order === 'MSB') {
    // big-endian concatenation: result = ((...((l0 << 64) | l1) << 64) | l2) ...
    let acc = 0n;
    for (let i = 0; i < longs.length; i++) {
      acc = (acc << 64n) | (longs[i] & MASK_64);
    }
    return acc;
  } else {
    throw new Error('order must be "LSB" or "MSB"');
  }
}

/**
 * Decode block indices from normalized BigInt[] longs.
 *
 * Options:
 *  - bitsPerBlock (integer)
 *  - order: 'LSB' | 'MSB'
 *  - numBlocks: integer (default 4096)
 *
 * Returns Uint32Array of length numBlocks
 */
export function decodeFromLongs(longs, { bitsPerBlock, order = 'LSB', numBlocks = DEFAULT_NUM_BLOCKS } = {}) {
  if (!Number.isInteger(bitsPerBlock) || bitsPerBlock <= 0) throw new Error('bitsPerBlock must be positive integer');
  const nLongs = longs.length;
  const expectedLongs = Math.ceil((numBlocks * bitsPerBlock) / 64);
  // We allow decode even if lengths mismatch (user may be trying slices) — but caller should check this.
  const totalBits = BigInt(nLongs) * 64n;
  const mask = (1n << BigInt(bitsPerBlock)) - 1n;
  const concat = concatLongsToBigInt(longs, { order });
  const out = new Uint32Array(numBlocks);
  if (order === 'LSB') {
    for (let i = 0; i < numBlocks; i++) {
      const shift = BigInt(i) * BigInt(bitsPerBlock);
      // if shifting beyond totalBits, we will get 0
      const val = (concat >> shift) & mask;
      out[i] = Number(val);
    }
  } else {
    // MSB: block 0 uses the highest bits
    for (let i = 0; i < numBlocks; i++) {
      const shift = totalBits - BigInt((i + 1) * bitsPerBlock);
      if (shift < 0n) {
        // if negative, we can't extract; set 0 and continue
        out[i] = 0;
      } else {
        const val = (concat >> shift) & mask;
        out[i] = Number(val);
      }
    }
  }
  return out;
}

/**
 * Try plausible bitsPerBlock candidates (defaults 4..16) and packing orders,
 * including attempts at slicing the data if length mismatches expected.
 *
 * Returns an array of candidate results:
 *  { bitsPerBlock, order, sliceOffset, expectedLongCount, success: boolean, indices (if success), stats }
 */
export async function tryCandidates(rawData, paletteLength = null, {
  candidateRange = [4, 16],
  orderCandidates = ['LSB', 'MSB'],
  numBlocks = DEFAULT_NUM_BLOCKS,
  highIsSigned = true,
  maxSliceAttempts = 64, // to limit long loops if many extra longs
} = {}) {
  const longs = normalizeLongArray(rawData, { highIsSigned });
  const nLongs = longs.length;
  const results = [];

  for (let bpb = candidateRange[0]; bpb <= candidateRange[1]; bpb++) {
    const expectedLongCount = Math.ceil(numBlocks * bpb / 64);
    // Basic arithmetic diagnostics:
    const implied_bpb = (nLongs * 64) / numBlocks;
    // If lengths match exactly, do a direct attempt; otherwise attempt slices.
    const sliceMax = Math.max(0, Math.min(maxSliceAttempts, nLongs - expectedLongCount));
    const offsetsToTry = (nLongs === expectedLongCount) ? [0] : [0, nLongs - expectedLongCount]; // first and last by default
    // If there are extra words we will try sliding windows up to sliceMax positions
    if (nLongs > expectedLongCount && sliceMax > 0) {
      for (let k = 0; k <= sliceMax; k++) offsetsToTry.push(k);
    }
    // dedupe offsets
    const offsets = Array.from(new Set(offsetsToTry)).filter(x => x >= 0 && x + expectedLongCount <= nLongs);
    for (const order of orderCandidates) {
      for (const offset of offsets) {
        const slice = longs.slice(offset, offset + expectedLongCount);
        let indices;
        try {
          indices = decodeFromLongs(slice, { bitsPerBlock: bpb, order, numBlocks });
        } catch (e) {
          results.push({
            bitsPerBlock: bpb, order, sliceOffset: offset,
            expectedLongCount, success: false, error: String(e),
            stats: { nLongs, implied_bpb }
          });
          continue;
        }
        // Validate indices: check all in range 0..(paletteLength-1) if paletteLength given
        let inRange = true;
        let maxIndex = -Infinity;
        for (let i = 0; i < indices.length; i++) {
          const v = indices[i];
          if (v > maxIndex) maxIndex = v;
          if (v < 0) inRange = false;
          if (paletteLength != null && v >= paletteLength) inRange = false;
        }
        results.push({
          bitsPerBlock: bpb, order, sliceOffset: offset,
          expectedLongCount, success: true, indices,
          validAgainstPalette: paletteLength == null ? null : inRange,
          stats: { nLongs, implied_bpb, maxIndex }
        });
      }
    }
  }
  return results;
}

/** ---------------------------
 * Helper: pack a small array of block indices into longs (for testing).
 * Works for arbitrary numBlocks; returns BigInt[] longs.
 * order: 'LSB' or 'MSB'
 */
export function packBlocksToLongs(indices, bitsPerBlock, { order = 'LSB' } = {}) {
  const numBlocks = indices.length;
  const expectedLongCount = Math.ceil(numBlocks * bitsPerBlock / 64);
  const mask = (1n << BigInt(bitsPerBlock)) - 1n;
  // Build concat then split into longs
  let concat = 0n;
  if (order === 'LSB') {
    for (let i = 0; i < numBlocks; i++) {
      concat |= (BigInt(indices[i]) & mask) << BigInt(i * bitsPerBlock);
    }
    // slice into 64-bit words
    const longs = [];
    for (let i = 0; i < expectedLongCount; i++) {
      const w = (concat >> BigInt(64 * i)) & MASK_64;
      longs.push(w);
    }
    return longs;
  } else {
    // MSB: block 0 is highest bits
    const totalBits = BigInt(expectedLongCount) * 64n;
    for (let i = 0; i < numBlocks; i++) {
      const pos = totalBits - BigInt((i + 1) * bitsPerBlock);
      concat |= (BigInt(indices[i]) & mask) << pos;
    }
    // split into words big-endian
    const longs = [];
    for (let i = 0; i < expectedLongCount; i++) {
      const shift = BigInt(64 * (expectedLongCount - i - 1));
      const w = (concat >> shift) & MASK_64;
      longs.push(w);
    }
    return longs;
  }
}

/** ---------------------------
 * Unit tests & diagnostic run
 */
function smallUnitTest() {
  info('--- smallUnitTest: 4x4x4 (64 blocks) with bitsPerBlock=3 (values 0..7) LSB ---');
  const numBlocks = 64;
  const bpb = 3;
  const indices = new Array(numBlocks).fill(0).map((_, i) => i % 7); // values 0..6
  const longs = packBlocksToLongs(indices, bpb, { order: 'LSB' });
  info(`Packed into ${longs.length} longs (expected ceil(${numBlocks} * ${bpb} / 64) = ${Math.ceil(numBlocks * bpb / 64)})`);
  const decoded = decodeFromLongs(longs, { bitsPerBlock: bpb, order: 'LSB', numBlocks });
  let ok = true;
  for (let i = 0; i < numBlocks; i++) if (decoded[i] !== indices[i]) ok = false;
  info(`smallUnitTest OK? ${ok}`);
  return { ok, indices, longs, decoded };
}

/** Diagnostic run for data.length === 342 */
function diagnosticFor342() {
  const n = 342;
  const bitsTotal = BigInt(n) * 64n;
  const impliedBpb = Number(bitsTotal) / DEFAULT_NUM_BLOCKS;
  info('--- diagnostic for data.length === 342 ---');
  info(`nLongs = ${n}`);
  info(`nLongs * 64 = ${n * 64} bits`);
  info(`implied bitsPerBlock = ${ (n * 64) / DEFAULT_NUM_BLOCKS } (i.e. 21888 / 4096 = 5.34375)`);
  info('For numBlocks=4096 expectedLongCount = bitsPerBlock * 64 (since 4096/64 = 64).');
  info('Therefore a valid bitsPerBlock must satisfy bitsPerBlock * 64 = nLongs → bitsPerBlock = nLongs / 64 = 342/64 = 5.34375 → not integer.');
  const table = [];
  for (let b = 4; b <= 16; b++) {
    table.push({ bpb: b, expectedLongCount: b * 64, relation: (b * 64) === n ? 'equal' : ((b * 64) < n ? 'less' : 'greater') });
  }
  info('bpb  expectedLongCount  relationTo342');
  table.forEach(r => info(`${r.bpb}    ${r.expectedLongCount}    ${r.relation}`));
  // show that 5->320 longs (22 short of 342), 6->384 (42 more than 342)
  return table;
}

/** Print a short sample console run for a hypothetical rawData length 342 (no actual longs provided) */
async function runDiagnosticSampleOn342() {
  diagnosticFor342();
  info('Conclusion: 342 is not equal to bpb * 64 for any integer bpb in 4..16. Try these tests:');
  info('- Are longs actually 32-bit halves? If so 342 could be 32-bit words -> 171 64-bit words.');
  info('- Are there header/trailer words? Try slicing the 342 array to a contiguous run of expectedLongCount words for plausible bpb (5 => 320 longs -> try slices of 320 within 342).');
}

/** Run quick tests when module executed directly */
if (import.meta.url === `file://${process.argv[1]}`) {
  // small unit test
  smallUnitTest();
  // diagnostic
  runDiagnosticSampleOn342();
  info('End of diagnostics.');
}