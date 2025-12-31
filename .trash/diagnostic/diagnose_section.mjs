// diagnose_section.mjs
// Node 14+ (ES module). Usage: node --input-type=module diagnose_section.mjs section.json

import fs from 'fs';
import path from 'path';

const MASK_64 = (1n << 64n) - 1n;
const NUM_BLOCKS = 4096;

function asUint32BigInt(n) {
  return BigInt.asUintN(32, BigInt(n));
}
function makeLongFromPair_lowHigh(pair) {
  const low = asUint32BigInt(pair[0]);
  const high = asUint32BigInt(pair[1]);
  return ((high << 32n) | low) & MASK_64;
}
function makeLongFromPair_highLow(pair) {
  const high = asUint32BigInt(pair[0]);
  const low  = asUint32BigInt(pair[1]);
  return ((high << 32n) | low) & MASK_64;
}
function byteswap64(w) {
  let r = 0n;
  for (let i = 0; i < 8; i++) r = (r << 8n) | ((w >> BigInt(8 * i)) & 0xFFn);
  return r & MASK_64;
}
function concatLongsToBigInt(longs, order = 'LSB') {
  if (order === 'LSB') {
    let acc = 0n;
    for (let i = 0; i < longs.length; i++) acc |= (longs[i] & MASK_64) << (64n * BigInt(i));
    return acc;
  } else {
    let acc = 0n;
    for (let i = 0; i < longs.length; i++) acc = (acc << 64n) | (longs[i] & MASK_64);
    return acc;
  }
}
function decodeSliceToIndices(longs, bitsPerBlock, order = 'LSB', numBlocks = NUM_BLOCKS) {
  const mask = (1n << BigInt(bitsPerBlock)) - 1n;
  const totalBits = BigInt(longs.length) * 64n;
  const concat = concatLongsToBigInt(longs, order);
  const out = new Uint32Array(numBlocks);
  if (order === 'LSB') {
    for (let i = 0; i < numBlocks; i++) {
      const shift = BigInt(i * bitsPerBlock);
      out[i] = Number((concat >> shift) & mask);
    }
  } else {
    for (let i = 0; i < numBlocks; i++) {
      const shift = totalBits - BigInt((i + 1) * bitsPerBlock);
      out[i] = shift < 0n ? 0 : Number((concat >> shift) & mask);
    }
  }
  return out;
}

function statsFromIndices(indices, paletteLen) {
  let max = -Infinity, min = Infinity, bad = 0;
  const freq = new Map();
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    if (!Number.isFinite(v)) { bad++; continue; }
    if (v > max) max = v;
    if (v < min) min = v;
    if (paletteLen != null && v >= paletteLen) bad++;
    freq.set(v, (freq.get(v) || 0) + 1);
  }
  return { max, min, bad, unique: freq.size, freq };
}

function tryCandidates(rawPairs, paletteLen, options = {}) {
  const { bpbMin=4, bpbMax=16, tryOffsetsCap=200, tryOrderLSBFirst=true, tryByteswap=false } = options;
  // build two long arrays (pairs)
  const candLH = rawPairs.map(p => makeLongFromPair_lowHigh(p));
  const candHL = rawPairs.map(p => makeLongFromPair_highLow(p));
  const rawVariants = [
    {name: 'LH', arr: candLH},
    {name: 'HL', arr: candHL}
  ];
  if (tryByteswap) {
    rawVariants.push({name: 'LH_BYTESWAP', arr: candLH.map(byteswap64)});
    rawVariants.push({name: 'HL_BYTESWAP', arr: candHL.map(byteswap64)});
  }

  const results = [];

  const preferBpb = Math.max(4, Math.ceil(Math.log2(Math.max(1, paletteLen || 1))));
  const bpbOrder = [preferBpb];
  for (let b = preferBpb-1; b >= bpbMin; b--) bpbOrder.push(b);
  for (let b = preferBpb+1; b <= bpbMax; b++) bpbOrder.push(b);

  for (const variant of rawVariants) {
    for (const bpb of bpbOrder) {
      const expectedLongCount = Math.ceil((NUM_BLOCKS * bpb) / 64);
      const n = variant.arr.length;
      const maxOffset = Math.max(0, n - expectedLongCount);
      // build offset list
      const offsets = [];
      if (n >= expectedLongCount) {
        // try first 0..min(maxOffset, tryOffsetsCap-1)
        const upto = Math.min(maxOffset, tryOffsetsCap-1);
        for (let o=0;o<=upto;o++) offsets.push(o);
        // if more offsets available, sample the rest (10 samples)
        if (maxOffset > upto) {
          const samples = Math.min(10, Math.floor(maxOffset/upto) || 10);
          for (let s=0;s<samples;s++) offsets.push( Math.floor((s+1) * maxOffset / (samples+1)) );
        }
      } else {
        offsets.push(0); // test short array (maybe straddle)
      }

      for (const offset of offsets) {
        const slice = variant.arr.slice(offset, offset + expectedLongCount);
        for (const order of (tryOrderLSBFirst ? ['LSB','MSB'] : ['MSB','LSB'])) {
          try {
            const indices = decodeSliceToIndices(slice, bpb, order, NUM_BLOCKS);
            const st = statsFromIndices(indices, paletteLen);
            const valid = (st.bad === 0);
            // compute proportion valid
            const validPct = ((NUM_BLOCKS - st.bad) / NUM_BLOCKS) * 100;
            results.push({
              variant: variant.name,
              bpb,
              expectedLongCount,
              offset,
              order,
              valid,
              validPct,
              stats: st
            });
            // early output for very good candidates (perfect)
            if (valid) {
              // don't return immediately; we want the full list but can note this
            }
          } catch (e) {
            // ignore decode errors
            results.push({
              variant: variant.name,
              bpb,
              expectedLongCount,
              offset,
              order,
              error: String(e)
            });
          }
        }
      }
    }
  }
  return results;
}

// ------------------------------ MAIN ------------------------------
async function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    console.error('usage: node --input-type=module diagnose_section.mjs section.json');
    process.exit(2);
  }
  const infile = argv[0];
  const raw = JSON.parse(fs.readFileSync(infile, 'utf8'));
  const s = raw.block_states;
  if (!s || !Array.isArray(s.data) || !Array.isArray(s.palette)) {
    console.error('Input file does not contain block_states.data and block_states.palette');
    process.exit(3);
  }
  const rawPairs = s.data;
  const paletteLen = s.palette.length;
  console.log('rawPairs.length =', rawPairs.length, 'palette.length =', paletteLen);
  const totalBits = rawPairs.length * 64;
  console.log('totalBits =', totalBits, 'implied bpb =', totalBits / NUM_BLOCKS);

  // try candidates (no byteswap first)
  console.log('Trying candidates (no byteswap) ...');
  let results = tryCandidates(rawPairs, paletteLen, { bpbMin:4, bpbMax:16, tryOffsetsCap:200, tryOrderLSBFirst:true, tryByteswap:false });

  // sort and present best
  results.sort((a,b) => {
    // prefer valid, then higher validPct, then lower offset, then prefer LSB then lower bpb
    const va = (a.valid ? 100000 + a.validPct*1000 : a.validPct||0);
    const vb = (b.valid ? 100000 + b.validPct*1000 : b.validPct||0);
    if (va !== vb) return vb - va;
    if ((a.offset||0) !== (b.offset||0)) return (a.offset||0) - (b.offset||0);
    if (a.order !== b.order) return a.order === 'LSB' ? -1 : 1;
    return a.bpb - b.bpb;
  });

  // print top 10 results
  console.log('Top candidates (no byteswap):');
  results.slice(0, 20).forEach((r,i) => {
    console.log(`#${i+1}: variant=${r.variant} bpb=${r.bpb} expectedLongs=${r.expectedLongCount} offset=${r.offset} order=${r.order} valid=${r.valid} validPct=${Number((r.validPct||0).toFixed(3))} max=${r.stats?.max} min=${r.stats?.min} bad=${r.stats?.bad}`);
  });

  // if we found no perfect candidate, try byteswap
  const perfect = results.find(r => r.valid === true);
  if (!perfect) {
    console.log('No perfect candidate found; trying byteswap variants...');
    const results2 = tryCandidates(rawPairs, paletteLen, { bpbMin:4, bpbMax:16, tryOffsetsCap:200, tryOrderLSBFirst:true, tryByteswap:true });
    results2.sort((a,b) => {
      const va = (a.valid ? 100000 + a.validPct*1000 : a.validPct||0);
      const vb = (b.valid ? 100000 + b.validPct*1000 : b.validPct||0);
      if (va !== vb) return vb - va;
      if ((a.offset||0) !== (b.offset||0)) return (a.offset||0) - (b.offset||0);
      if (a.order !== b.order) return a.order === 'LSB' ? -1 : 1;
      return a.bpb - b.bpb;
    });
    console.log('Top candidates (with byteswap):');
    results2.slice(0, 20).forEach((r,i) => {
      console.log(`#${i+1}: variant=${r.variant} bpb=${r.bpb} expectedLongs=${r.expectedLongCount} offset=${r.offset} order=${r.order} valid=${r.valid} validPct=${Number((r.validPct||0).toFixed(3))} max=${r.stats?.max} min=${r.stats?.min} bad=${r.stats?.bad}`);
    });
    // append results2 to results for further inspection
    results = results.concat(results2);
  }

  // If we have a perfect candidate, decode it and write decoded indices to decoded.json
  const best = results.find(r => r.valid) || results[0];
  if (!best) {
    console.log('No candidate found at all.');
    process.exit(0);
  }
  console.log('Best candidate chosen for output:', best);
  // reconstruct chosen array
  const variantArrName = best.variant;
  let longsArr;
  if (variantArrName === 'LH') longsArr = rawPairs.map(makeLongFromPair_lowHigh);
  else if (variantArrName === 'HL') longsArr = rawPairs.map(makeLongFromPair_highLow);
  else if (variantArrName === 'LH_BYTESWAP') longsArr = rawPairs.map(makeLongFromPair_lowHigh).map(byteswap64);
  else if (variantArrName === 'HL_BYTESWAP') longsArr = rawPairs.map(makeLongFromPair_highLow).map(byteswap64);
  else longsArr = rawPairs.map(makeLongFromPair_lowHigh);

  const slice = longsArr.slice(best.offset, best.offset + best.expectedLongCount);
  const indices = decodeSliceToIndices(slice, best.bpb, best.order, NUM_BLOCKS);
  const out = {
    meta: best,
    indices: Array.from(indices),
    // also include a small sample of the first 64 indices:
    sampleFirst64: Array.from(indices.slice(0,64))
  };
  fs.writeFileSync(path.resolve(process.cwd(), 'decoded_section.json'), JSON.stringify(out, null, 2));
  console.log('Wrote decoded_section.json with indices and meta.');
  console.log('If indices are valid (all < palette length), map them using palette array and render.');
  process.exit(0);
}

main();
