#!/usr/bin/env node
/**
 * safe_diagnose_section.mjs
 *
 * Usage:
 *   node --input-type=module safe_diagnose_section.mjs path/to/section.json
 *
 * The section.json should contain an object like:
 *   { "block_states": { "palette": [...], "data": [...] } }
 *
 * The script performs safe normalization of many JS representations of NBT LongArray words,
 * tries plausible bits-per-block candidates (4..16), both LSB/MSB packing,
 * tries plausible slice offsets if data contains extra words, and reports successes.
 *
 * On success it writes `fixed_block_states.json` with the recommended 64-bit decimal strings slice.
 *
 * Author: assistant (rewritten per user request)
 */

import fs from 'fs';
import path from 'path';

const DEFAULT_NUM_BLOCKS = 4096;
const DEFAULT_BPB_MIN = 4;
const DEFAULT_BPB_MAX = 16;
const MAX_SLICE_ATTEMPTS = 256; // safety cap
const MASK_64 = (1n << 64n) - 1n;

function info(...args) { console.log('[INFO]', ...args); }
function warn(...args) { console.warn('[WARN]', ...args); }
function error(...args) { console.error('[ERROR]', ...args); }

function usageAndExit() {
  console.log('Usage: node --input-type=module safe_diagnose_section.mjs section.json');
  process.exit(1);
}

/* ============================
 * Utilities for bit math / conversions
 * ============================ */

function toUInt32BigIntFromNumber(n) {
  // convert possibly signed JS number to unsigned 32-bit BigInt safely
  return BigInt(n >>> 0);
}

function toBigIntFromDecimalString(s) {
  // Accepts decimal string like "-9223372036854775808" or "12345"
  try {
    return BigInt(s) & MASK_64;
  } catch (e) {
    throw new Error(`Invalid decimal string for BigInt: ${s}`);
  }
}

function byteswap64(word64) {
  // word64: BigInt
  let out = 0n;
  for (let i = 0; i < 8; i++) {
    out = (out << 8n) | ((word64 >> BigInt(8 * i)) & 0xFFn);
  }
  return out & MASK_64;
}

/* ============================
 * Normalization: accept many input shapes and produce BigInt[] of unsigned 64-bit words
 * - Accepts BigInt, number, string, {high,low}, [a,b]
 * - For [a,b] tries to treat elements as signed 32-bit and masks to unsigned 32-bit
 * - Returns array of BigInt
 * - Doesn't throw on unsupported item; returns { longs, unsupportedIndices }
 * ============================ */
function normalizeToBigInt64Array(rawData, {
  pairArrayOrder = null,          // 'LOW_HIGH' | 'HIGH_LOW' | null (null = auto-detect by checking shape)
  treatNumberAs32Pair = false,    // if true and elements are numbers (not arrays), pair them as 32-bit words
  verbosity = 1
} = {}) {
  if (!Array.isArray(rawData)) {
    throw new TypeError('rawData must be an array');
  }
  const longs = [];
  const unsupported = [];
  for (let i = 0; i < rawData.length; i++) {
    const e = rawData[i];
    try {
      if (typeof e === 'bigint') {
        longs.push(e & MASK_64);
        continue;
      }
      if (typeof e === 'string') {
        // decimal string
        longs.push(toBigIntFromDecimalString(e));
        continue;
      }
      if (typeof e === 'number') {
        // possibly a 64-bit number lost precision; we treat as unsigned 53-bit number
        if (!Number.isFinite(e)) {
          unsupported.push({ index: i, value: e, reason: 'non-finite number' });
          continue;
        }
        if (Math.abs(e) > Number.MAX_SAFE_INTEGER) {
          warn(`Entry ${i} is a number larger than MAX_SAFE_INTEGER; precision may be lost.`);
        }
        longs.push(BigInt(Math.trunc(e)) & MASK_64);
        continue;
      }
      if (e && typeof e === 'object') {
        // {high, low} shape?
        if ('high' in e && 'low' in e) {
          // high/low possibly signed 32-bit JS numbers; mask to unsigned
          const high = BigInt(e.high >>> 0);
          const low = BigInt(e.low >>> 0);
          longs.push(((high << 32n) | low) & MASK_64);
          continue;
        }
        // array-like shape [a,b] but may be actual Array (Node prints [a,b] as objects sometimes)
        if (Array.isArray(e) && e.length >= 2) {
          const a = e[0];
          const b = e[1];
          // decide order: if caller specified pairArrayOrder use it; else assume [low, high] (common)
          let order = pairArrayOrder || 'LOW_HIGH';
          // but if pairArrayOrder === null, we'll just use LOW_HIGH by default;
          const lowVal = BigInt(a) & 0xFFFFFFFFn;
          const highVal = BigInt(b) & 0xFFFFFFFFn;
          if (order === 'LOW_HIGH') {
            longs.push(((highVal << 32n) | lowVal) & MASK_64);
          } else {
            longs.push(((lowVal << 32n) | highVal) & MASK_64); // alternative if caller set HIGH_LOW meaning data[0] is high
          }
          continue;
        }
      }
      // If we get here, unsupported shape
      unsupported.push({ index: i, value: e });
    } catch (ex) {
      unsupported.push({ index: i, value: e, err: String(ex) });
    }
  }
  if (verbosity >= 2) {
    info(`normalize: produced ${longs.length} longs, unsupported items ${unsupported.length}`);
  }
  return { longs, unsupported };
}

/* ============================
 * Core decode logic
 * ============================ */

// concat longs to a single BigInt depending on order
function concatLongs(longs, { order = 'LSB' } = {}) {
  if (!Array.isArray(longs)) throw new TypeError('longs must be Array');
  if (order === 'LSB') {
    let acc = 0n;
    for (let i = 0; i < longs.length; i++) {
      acc |= (longs[i] & MASK_64) << (64n * BigInt(i));
    }
    return acc;
  } else if (order === 'MSB') {
    let acc = 0n;
    for (let i = 0; i < longs.length; i++) {
      acc = (acc << 64n) | (longs[i] & MASK_64);
    }
    return acc;
  } else {
    throw new Error('order must be "LSB" or "MSB"');
  }
}

// decodeFromLongs: returns Uint32Array of numBlocks length
function decodeFromLongs(longs, { bitsPerBlock, order = 'LSB', numBlocks = DEFAULT_NUM_BLOCKS } = {}) {
  if (!Number.isInteger(bitsPerBlock) || bitsPerBlock <= 0) throw new Error('bitsPerBlock must be positive integer');
  const nLongs = longs.length;
  const expectedLongs = Math.ceil((numBlocks * bitsPerBlock) / 64);
  // Note: we allow caller to pass slices; expectedLongs is diagnostic.
  const totalBits = BigInt(nLongs) * 64n;
  const mask = (1n << BigInt(bitsPerBlock)) - 1n;
  const concat = concatLongs(longs, { order });
  const out = new Uint32Array(numBlocks);
  if (order === 'LSB') {
    for (let i = 0; i < numBlocks; i++) {
      const shift = BigInt(i) * BigInt(bitsPerBlock);
      out[i] = Number((concat >> shift) & mask);
    }
  } else {
    // MSB: block 0 uses the highest bits
    for (let i = 0; i < numBlocks; i++) {
      const shift = totalBits - BigInt((i + 1) * bitsPerBlock);
      if (shift < 0n) {
        // insufficient bits -> 0
        out[i] = 0;
      } else {
        out[i] = Number((concat >> shift) & mask);
      }
    }
  }
  return out;
}

/* ============================
 * Try candidates: tries bpb range, orders, slice offsets, and returns a list of candidate results
 * Returns array of { bitsPerBlock, order, sliceOffset, expectedLongCount, success, indices, validAgainstPalette, stats }
 * ============================ */
async function tryCandidatesAndSlices(bigIntLongs, {
  paletteLength = null,
  bpbMin = DEFAULT_BPB_MIN,
  bpbMax = DEFAULT_BPB_MAX,
  orderCandidates = ['LSB', 'MSB'],
  numBlocks = DEFAULT_NUM_BLOCKS,
  maxSliceAttempts = 64,
  verbosity = 1
} = {}) {
  const nLongs = bigIntLongs.length;
  const results = [];
  for (let bpb = bpbMin; bpb <= bpbMax; bpb++) {
    const expectedLongCount = Math.ceil((numBlocks * bpb) / 64);
    // choose offsets: if equal, try offset 0 only. If nLongs >= expected, try up to maxSliceAttempts positions (including first and last).
    let offsets = [];
    if (nLongs === expectedLongCount) offsets = [0];
    else if (nLongs > expectedLongCount) {
      const maxPos = nLongs - expectedLongCount;
      // if small range, try all; else sample up to maxSliceAttempts positions evenly plus first/last
      if (maxPos <= maxSliceAttempts) {
        for (let o = 0; o <= maxPos; o++) offsets.push(o);
      } else {
        offsets.push(0, maxPos); // always try first/last
        for (let k = 1; k <= maxSliceAttempts - 2; k++) {
          offsets.push(Math.floor((k * maxPos) / (maxSliceAttempts - 1)));
        }
      }
      // dedupe
      offsets = Array.from(new Set(offsets)).filter(o => o >= 0 && o + expectedLongCount <= nLongs);
    } else {
      // nLongs < expectedLongCount: still try with padding possibility later; but try single offset 0 to see what happens
      offsets = [0];
    }

    for (const order of orderCandidates) {
      for (const offset of offsets) {
        try {
          const slice = bigIntLongs.slice(offset, offset + expectedLongCount);
          // if length is less than expectedLongCount, we'll decode anyway; may produce zeros for missing bits in MSB path.
          const indices = decodeFromLongs(slice, { bitsPerBlock: bpb, order, numBlocks });
          // stats
          let maxIndex = -Infinity;
          let minIndex = Infinity;
          let inRange = true;
          for (let i = 0; i < indices.length; i++) {
            const v = indices[i];
            if (v > maxIndex) maxIndex = v;
            if (v < minIndex) minIndex = v;
            if (v < 0) inRange = false;
            if (Number.isNaN(v)) inRange = false;
            if (paletteLength != null && v >= paletteLength) inRange = false;
          }
          results.push({
            bitsPerBlock: bpb,
            order,
            sliceOffset: offset,
            expectedLongCount,
            success: true,
            indices,
            validAgainstPalette: paletteLength == null ? null : inRange,
            stats: { nLongs, maxIndex, minIndex, impliedBpb: (nLongs * 64) / numBlocks }
          });
        } catch (e) {
          results.push({
            bitsPerBlock: bpb,
            order,
            sliceOffset: offset,
            expectedLongCount,
            success: false,
            error: String(e),
            stats: { nLongs, impliedBpb: (nLongs * 64) / numBlocks }
          });
        }
      }
    } // end order candidates
  } // end bpb loop
  if (verbosity >= 1) info(`tryCandidates: tested bpb ${bpbMin}..${bpbMax}, produced ${results.length} attempts.`);
  return results;
}

/* ============================
 * Heuristic driver: tries multiple normalization strategies and transformations
 * - tries pair array orderings LOW_HIGH/HIGH_LOW
 * - tries byte-swap of each 64-bit word
 * - optionally tries padding to a target expectedLongCount for bpb=6 to detect truncation
 * - returns summarized results
 * ============================ */
async function safeDiagnose(rawData, paletteLength = null, {
  bpbMin = DEFAULT_BPB_MIN,
  bpbMax = DEFAULT_BPB_MAX,
  numBlocks = DEFAULT_NUM_BLOCKS,
  maxSliceAttempts = 64,
  verbosity = 1
} = {}) {

  info('Starting safeDiagnose: numBlocks=', numBlocks, 'paletteLength=', paletteLength, 'rawData length=', Array.isArray(rawData) ? rawData.length : 'NA');

  // 1) Quick sample types
  if (!Array.isArray(rawData)) throw new TypeError('rawData must be an array');
  const sampleTypes = rawData.slice(0, 6).map(x => Array.isArray(x) ? `Array(len=${x.length})` : typeof x);
  info('sample types (first 6):', sampleTypes);

  // 2) Normalization attempts: we'll produce multiple normalized longs arrays to test
  const normalizedVariants = [];

  // 2.a) Direct normalization treating arrays as [low,high] (LOW_HIGH default)
  const { longs: longs_lowhigh, unsupported: u1 } = normalizeToBigInt64Array(rawData, { pairArrayOrder: 'LOW_HIGH', verbosity });
  normalizedVariants.push({ name: 'LOW_HIGH', longs: longs_lowhigh, unsupported: u1 });

  // 2.b) Normalization treating arrays as [high,low] (HIGH_LOW)
  const { longs: longs_highlow, unsupported: u2 } = normalizeToBigInt64Array(rawData, { pairArrayOrder: 'HIGH_LOW', verbosity });
  normalizedVariants.push({ name: 'HIGH_LOW', longs: longs_highlow, unsupported: u2 });

  // 2.c) If rawData elements are plain numbers (likely 32-bit words), try pairing them (pair as (0,1),(2,3),... -> longs).
  const allNumbersOrStrings = rawData.every(e => (typeof e === 'number' || typeof e === 'string' || typeof e === 'bigint'));
  if (allNumbersOrStrings && rawData.length >= 2) {
    // pair into longs
    const paired = [];
    for (let i = 0; i + 1 < rawData.length; i += 2) {
      const a = rawData[i];
      const b = rawData[i + 1];
      // convert a, b to unsigned 32-bit BigInt
      let aBig, bBig;
      if (typeof a === 'bigint') aBig = a & 0xFFFFFFFFn;
      else if (typeof a === 'string') aBig = BigInt(a) & 0xFFFFFFFFn;
      else aBig = BigInt(a >>> 0);
      if (typeof b === 'bigint') bBig = b & 0xFFFFFFFFn;
      else if (typeof b === 'string') bBig = BigInt(b) & 0xFFFFFFFFn;
      else bBig = BigInt(b >>> 0);
      const combined = ((aBig << 32n) | bBig) & MASK_64; // a as high, b as low (conservative)
      paired.push(combined);
    }
    // Convert to decimal string array for consistent normalization
    const decs = paired.map(x => x.toString());
    const { longs: longs_paired, unsupported: u3 } = normalizeToBigInt64Array(decs, { pairArrayOrder: 'LOW_HIGH', verbosity });
    normalizedVariants.push({ name: 'PAIRED_WORDS', longs: longs_paired, unsupported: u3 });
  }

  // Deduplicate variants by stringified longs length & first few values (cheap equality)
  const uniqueVariants = [];
  const seen = new Set();
  for (const v of normalizedVariants) {
    const key = `${v.longs.length}:${v.longs.slice(0, Math.min(4, v.longs.length)).map(x => x.toString()).join(',')}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueVariants.push(v);
    }
  }

  if (verbosity >= 1) info('Normalization produced variants:', uniqueVariants.map(v => `${v.name} (len=${v.longs.length})`));

  const finalResults = [];

  // For each normalized variant, try candidates
  for (const variant of uniqueVariants) {
    const longsArr = variant.longs.map(x => typeof x === 'bigint' ? x : BigInt(x));
    if (longsArr.length === 0) {
      if (verbosity >= 1) warn(`Variant ${variant.name} produced 0 longs, skipping.`);
      continue;
    }
    info(`Testing variant ${variant.name} with ${longsArr.length} longs...`);
    // Try raw longs first
    const res = await tryCandidatesAndSlices(longsArr, {
      paletteLength,
      bpbMin,
      bpbMax,
      orderCandidates: ['LSB', 'MSB'],
      numBlocks,
      maxSliceAttempts: Math.min(maxSliceAttempts, MAX_SLICE_ATTEMPTS),
      verbosity
    });
    // filter successes
    const succ = res.filter(r => r.success);
    finalResults.push({ variant: variant.name, longsLen: longsArr.length, attempts: res.length, successes: succ, unsupported: variant.unsupported });
    // Also try byteswapped variant if no success yet (byte-order issues)
    if (succ.length === 0) {
      info(`No successes for ${variant.name}. Trying byte-swapped longs...`);
      const swapped = longsArr.map(byteswap64);
      const res2 = await tryCandidatesAndSlices(swapped, {
        paletteLength, bpbMin, bpbMax, orderCandidates: ['LSB', 'MSB'], numBlocks, maxSliceAttempts: Math.min(maxSliceAttempts, MAX_SLICE_ATTEMPTS), verbosity
      });
      const succ2 = res2.filter(r => r.success);
      finalResults.push({ variant: variant.name + '_BYTESWAP', longsLen: swapped.length, attempts: res2.length, successes: succ2, unsupported: [] });
    }
  } // end variants loop

  // Summarize and pick recommended result(s)
  const allSuccesses = [];
  finalResults.forEach(fr => {
    fr.successes = fr.successes || [];
    for (const s of fr.successes) {
      allSuccesses.push({ variant: fr.variant, longsLen: fr.longsLen, ...s });
    }
  });

  info('=== SUMMARY ===');
  if (allSuccesses.length === 0) {
    warn('No candidate produced indices fully within palette limits (or no candidate succeeded). See full diagnostics above.');
    return { success: false, finalResults, message: 'no_success' };
  }

  // Prefer results where validAgainstPalette === true, smaller slice offset (prefer beginning), and LSB packing (heuristic)
  allSuccesses.sort((a, b) => {
    const scoreA = (a.validAgainstPalette ? 1000 : 0) - a.sliceOffset + (a.order === 'LSB' ? 10 : 0) - (a.bitsPerBlock);
    const scoreB = (b.validAgainstPalette ? 1000 : 0) - b.sliceOffset + (b.order === 'LSB' ? 10 : 0) - (b.bitsPerBlock);
    return scoreB - scoreA;
  });

  // Report top 5
  const top = allSuccesses.slice(0, 10);
  info('Found candidate decodes (top results):');
  top.forEach((c, idx) => {
    console.log(`#${idx+1}: variant=${c.variant} bpb=${c.bitsPerBlock} order=${c.order} sliceOffset=${c.sliceOffset} expectedLongs=${c.expectedLongCount} validAgainstPalette=${c.validAgainstPalette} maxIndex=${c.stats.maxIndex} minIndex=${c.stats.minIndex}`);
  });

  // Save recommended candidate long slice as decimal strings for user
  const recommended = top[0];
  const recVariant = uniqueVariants.find(v => v.name === recommended.variant.replace('_BYTESWAP',''));
  let recLongs;
  if (!recVariant) {
    // maybe variant was PAIRED_WORDS or byteswapped; reconstruct from finalResults
    // find any finalResults entry containing this variant name
    const fr = finalResults.find(x => x.variant === recommended.variant || x.variant === recommended.variant.replace('_BYTESWAP',''));
    if (!fr) {
      warn('Could not find variant object to extract longs for recommended candidate.');
    }
    // attempt to reconstruct from earlier normalizedVariants
    // fallback: take normalizedVariants[0]
    recLongs = normalizedVariants[0] ? normalizedVariants[0].longs.slice(recommended.sliceOffset, recommended.sliceOffset + recommended.expectedLongCount) : [];
  } else {
    // extract longs; if byteswapped was used, swap back when saving? We'll save the slice exactly as we decoded it.
    let longsArr = recVariant.longs.map(x => typeof x === 'bigint' ? x : BigInt(x));
    if (recommended.variant.endsWith('_BYTESWAP')) {
      // We used byteswapped array to decode; the original (un-swapped) slice needs reversing before assembling.
      // The slice we decoded was from the swapped array; to reconstruct the original long words we must byteswap again.
      const swappedSlice = longsArr.slice(recommended.sliceOffset, recommended.sliceOffset + recommended.expectedLongCount).map(byteswap64);
      recLongs = swappedSlice;
    } else {
      recLongs = longsArr.slice(recommended.sliceOffset, recommended.sliceOffset + recommended.expectedLongCount);
    }
  }

  if (!recLongs || recLongs.length === 0) {
    warn('No recLongs available to write recommended output; skipping write.');
    return { success: true, finalResults, recommended: null, allSuccesses };
  }

  // Convert BigInt longs to decimal strings for safe JSON writing
  const recDecStrings = recLongs.map(x => (typeof x === 'bigint' ? x.toString() : BigInt(x).toString()));
  const outPath = path.resolve(process.cwd(), 'fixed_block_states.json');
  const outObj = {
    recommended_slice: {
      variant: recommended.variant,
      bitsPerBlock: recommended.bitsPerBlock,
      order: recommended.order,
      sliceOffset: recommended.sliceOffset,
      expectedLongCount: recommended.expectedLongCount,
      validAgainstPalette: recommended.validAgainstPalette,
      stats: recommended.stats
    },
    block_states: {
      palette_length: paletteLength,
      data_decimal_longarray: recDecStrings
    }
  };
  try {
    fs.writeFileSync(outPath, JSON.stringify(outObj, null, 2), 'utf8');
    info('Wrote recommended slice to', outPath);
  } catch (e) {
    warn('Failed to write recommended output:', e);
  }

  return { success: true, finalResults, recommended: outObj, allSuccesses };
}

/* ============================
 * Main CLI
 * ============================ */

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    usageAndExit();
  }
  const infile = argv[0];
  if (!fs.existsSync(infile)) {
    error('Input file not found:', infile);
    process.exit(2);
  }
  const raw = JSON.parse(fs.readFileSync(infile, 'utf8'));
  const blockStates = raw.block_states || raw.blockStates || raw.blockstates || raw.block_states;
  if (!blockStates) {
    error('No block_states found in input JSON.');
    process.exit(3);
  }
  const palette = blockStates.palette || [];
  const data = blockStates.data;
  if (!Array.isArray(data)) {
    error('block_states.data is not an array.');
    process.exit(4);
  }
  // Run safeDiagnose
  try {
    const result = await safeDiagnose(data, palette.length || null, {
      bpbMin: DEFAULT_BPB_MIN, bpbMax: DEFAULT_BPB_MAX, numBlocks: DEFAULT_NUM_BLOCKS, maxSliceAttempts: 128, verbosity: 1
    });
    if (!result.success) {
      warn('Diagnosis did not find a validated candidate. See printed diagnostics. You can supply a larger bpb range or enable more verbose mode.');
      process.exit(0);
    } else {
      info('Diagnosis succeeded. See fixed_block_states.json for recommended slice and metadata.');
      process.exit(0);
    }
  } catch (e) {
    error('Error during diagnosis:', e);
    process.exit(5);
  }
}

// Run
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith('safe_diagnose_section.mjs')) {
  main();
}
