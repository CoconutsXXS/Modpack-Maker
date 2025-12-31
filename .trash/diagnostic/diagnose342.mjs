// diagnose342.mjs
import fs from 'fs';
import path from 'path';
import {
  normalizeLongArray,
  tryCandidates,
  decodeFromLongs,
  packBlocksToLongs
} from './decodeSection.mjs';

// Load section from a JSON file that contains { block_states: { palette: [...], data: [...] } }
// You can also paste the object inline instead of reading a file.
const INFILE = './section.json';
if (!fs.existsSync(INFILE)) {
  console.error(`Place a JSON file at ${INFILE} containing your section object, or modify this script.`);
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(INFILE, 'utf8'));
const blockStates = raw.block_states || raw.blockStates || raw.blockstates || raw.block_states;
if (!blockStates) { console.error('No block_states found in JSON'); process.exit(1); }

const rawData = blockStates.data;
const palette = blockStates.palette || [];
console.log('[DIAG] palette.length =', palette.length);
console.log('[DIAG] rawData length =', Array.isArray(rawData) ? rawData.length : 'not-array', 'type of entries sample:');
console.log('  sample types:', typeof rawData[0], JSON.stringify(rawData.slice(0,6)));

function dumpFirstLast(arr, n = 20) {
  console.log('[DIAG] first', Math.min(n, arr.length), 'entries:', arr.slice(0, Math.min(n, arr.length)));
  console.log('[DIAG] last', Math.min(n, arr.length), 'entries:', arr.slice(Math.max(0, arr.length - n)));
}

dumpFirstLast(rawData, 20);

// 1) Detect if rawData looks like 32-bit words
let looksLike32BitWords = true;
for (let i = 0; i < Math.min(200, rawData.length); i++) {
  const e = rawData[i];
  if (typeof e === 'bigint') { looksLike32BitWords = false; break; }
  if (typeof e === 'number') {
    if (!Number.isFinite(e) || Math.abs(e) > 0xFFFFFFFF) { looksLike32BitWords = false; break; }
  } else if (typeof e === 'string') {
    // decimal string — check magnitude
    const n = BigInt(e);
    if (n > 0xFFFFFFFFn || n < -0x80000000n) { looksLike32BitWords = false; break; }
  } else if (e && typeof e === 'object' && ('high' in e || 'low' in e)) {
    // object with high/low -> likely 32-bit halves form (not 64-bit BigInt)
    // leave looksLike32BitWords true
  } else {
    looksLike32BitWords = false; break;
  }
}
console.log('[DIAG] looksLike32BitWords:', looksLike32BitWords);

// 2) Print count of trailing zero words (a lot of trailing zeros may indicate padding)
let tz = 0;
for (let i = rawData.length - 1; i >= 0; i--) {
  const v = rawData[i];
  if (v === 0 || v === '0' || (typeof v === 'bigint' && v === 0n) || (v && typeof v === 'object' && v.high === 0 && v.low === 0)) tz++;
  else break;
}
console.log('[DIAG] trailing zero words count:', tz);

// 3) Try candidates (4..16) with slicing heuristics
(async () => {
  console.log('[DIAG] Running tryCandidates with palette.length (if available). This will test bitsPerBlock 4..16, LSB/MSB, and try slices for near matches.');
  const results = await tryCandidates(rawData, palette.length || null, { candidateRange: [4,16], maxSliceAttempts: 64 });
  // Filter successes
  const successes = results.filter(r => r.success);
  console.log('[DIAG] candidate attempts total:', results.length, ' successes:', successes.length);
  // Print compact table of useful successes
  for (const r of successes) {
    console.log(` - bpb=${r.bitsPerBlock} order=${r.order} sliceOffset=${r.sliceOffset} expectedLongs=${r.expectedLongCount} validAgainstPalette=${r.validAgainstPalette} maxIndex=${r.stats.maxIndex}`);
  }

  // 4) Try pairing 32-bit words (if looksLike32BitWords)
  if (looksLike32BitWords) {
    console.log('[DIAG] Attempt pairing 32-bit words into 64-bit longs (pairing entries (0,1),(2,3),...) and rerun tryCandidates on the paired longs.');
    // Convert raw element types to 32-bit unsigned ints, then pair
    const words = rawData.map(e => {
      if (typeof e === 'bigint') return Number(e & 0xFFFFFFFFn);
      if (typeof e === 'number') return e >>> 0;
      if (typeof e === 'string') return Number(BigInt(e) & 0xFFFFFFFFn) >>> 0;
      if (e && typeof e === 'object' && 'high' in e && 'low' in e) {
        // If parser already gave {high,low}, treat them as 32-bit halves; we will pair as (high, low) => 64-bit
        // but if the object itself is already high/low pair for one long, skip pairing.
        return e;
      }
      return 0;
    });
    // If rawData are objects like {high, low}, warn: this pairing may not be necessary.
    if (words.length % 2 === 1) console.warn('[DIAG] Odd number of 32-bit-word entries; last one will be ignored for pairing.');
    const paired = [];
    for (let i = 0; i + 1 < words.length; i += 2) {
      const hi = words[i];
      const lo = words[i+1];
      // if hi or lo are objects {high,low}, don't attempt this pairing here.
      if (hi && typeof hi === 'object' && 'high' in hi && 'low' in hi) { console.warn('[DIAG] Detected nested {high,low} objects; skipping re-pairing.'); break; }
      const combined = (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
      paired.push(combined.toString()); // keep as decimal strings for normalizeLongArray
    }
    console.log('[DIAG] paired longs length =', paired.length);
    const pairedResults = await tryCandidates(paired, palette.length || null, { candidateRange: [4,16], maxSliceAttempts: 64 });
    const pairedSuccess = pairedResults.filter(r => r.success);
    console.log('[DIAG] paired attempts successes:', pairedSuccess.length);
    for (const r of pairedSuccess) {
      console.log(`   - paired bpb=${r.bitsPerBlock} order=${r.order} sliceOffset=${r.sliceOffset} expectedLongs=${r.expectedLongCount} validAgainstPalette=${r.validAgainstPalette} maxIndex=${r.stats.maxIndex}`);
    }
  }

  // 5) Try padding to expectedLongCount for bpb=6 (384) if no successes above
  const anyGood = successes.length > 0;
  if (!anyGood) {
    console.log('[DIAG] No direct success found. Trying padding / MSB/LSB toggles: try pad to 384 (bpb=6) with zeros to detect truncation case.');
    const normalized = normalizeLongArray(rawData);
    const target = 6 * 64; // 384
    const padCount = Math.max(0, target - normalized.length);
    if (padCount > 0) {
      const padded = normalized.concat(Array(padCount).fill(0n)).map(x => x.toString());
      const paddedResults = await tryCandidates(padded, palette.length || null, { candidateRange: [6,6], maxSliceAttempts: 1 });
      const padSuccess = paddedResults.filter(r => r.success);
      console.log('[DIAG] padding attempts successes:', padSuccess.length);
      for (const r of padSuccess) {
        console.log(`   - padded bpb=${r.bitsPerBlock} order=${r.order} sliceOffset=${r.sliceOffset} expectedLongs=${r.expectedLongCount} validAgainstPalette=${r.validAgainstPalette} maxIndex=${r.stats.maxIndex}`);
      }
    } else {
      console.log('[DIAG] data already >= 384 longs; skipping pad-to-384 test.');
    }
  }

  console.log('[DIAG] Diagnostics complete. If nothing succeeded, please paste here:');
  console.log(' - palette.length');
  console.log(' - typeof data[0] and JSON.stringify(data.slice(0,20)) and JSON.stringify(data.slice(-20))');
})();
