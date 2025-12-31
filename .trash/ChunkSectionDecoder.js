export class ChunkSectionDecoder {
    static COORD_ORDER = 'YZX'; // y * 256 + z * 16 + x

    /**
     * Convert various long representations to BigInt[]
     */
    static normalizeData(data) {
        if (!data || !Array.isArray(data)) {
            throw new Error('Data must be an array');
        }

        return data.map(item => {
            if (typeof item === 'bigint') return item;
            if (typeof item === 'string') return BigInt(item);
            if (typeof item === 'number') {
                if (Math.abs(item) > Number.MAX_SAFE_INTEGER) {
                    console.warn('Number exceeds safe integer range, precision may be lost');
                }
                return BigInt(item);
            }
            if (typeof item === 'object' && item !== null) {
                // Handle {high, low} objects
                if ('high' in item && 'low' in item) {
                    // Signed interpretation (common in NBT parsers)
                    const high = BigInt(item.high);
                    const low = BigInt(item.low) & 0xFFFFFFFFn;
                    return (high << 32n) | low;
                }
            }
            throw new Error(`Unsupported data type: ${typeof item}`);
        });
    }

    /**
     * Calculate possible bitsPerBlock candidates from data length
     */
    static findBitsPerBlockCandidates(dataLength, paletteLength) {
        const totalBits = dataLength * 64;
        const candidates = [];

        // Standard range for section palette
        for (let bits = 4; bits <= 16; bits++) {
            const expectedLongs = Math.ceil(4096 * bits / 64);
            if (expectedLongs === dataLength) {
                candidates.push({
                    bitsPerBlock: bits,
                    expectedLongs,
                    totalBits: 4096 * bits,
                    efficiency: (4096 * bits) / totalBits
                });
            }
        }

        // Check if it could be global palette (up to 16 bits)
        if (paletteLength === 0 || paletteLength > 4096) {
            for (let bits = 9; bits <= 16; bits++) {
                const expectedLongs = Math.ceil(4096 * bits / 64);
                if (expectedLongs === dataLength) {
                    candidates.push({
                        bitsPerBlock: bits,
                        expectedLongs,
                        totalBits: 4096 * bits,
                        efficiency: (4096 * bits) / totalBits,
                        globalPalette: true
                    });
                }
            }
        }

        return candidates;
    }

    /**
     * Decode block indices from data array
     */
    static decodeBlockStates(blockStates, options = {}) {
        const { palette = [], data = [] } = blockStates;
        const {
            bitOrder = 'LSB', // LSB or MSB first within longs
            validateIndices = true
        } = options;

        const normalizedData = this.normalizeData(data);
        const candidates = this.findBitsPerBlockCandidates(normalizedData.length, palette.length);

        console.log(`Data length: ${normalizedData.length} longs (${normalizedData.length * 64} bits)`);
        console.log(`Palette length: ${palette.length}`);
        console.log(`Candidates found: ${candidates.length}`);

        const results = [];

        for (const candidate of candidates) {
            try {
                console.log(`\nTrying bitsPerBlock=${candidate.bitsPerBlock}, bitOrder=${bitOrder}`);
                
                const indices = this.decodeBitStream(
                    normalizedData, 
                    candidate.bitsPerBlock, 
                    bitOrder
                );

                if (indices.length !== 4096) {
                    throw new Error(`Expected 4096 indices, got ${indices.length}`);
                }

                // Validate indices against palette
                let valid = true;
                let maxIndex = 0;
                let outOfRangeCount = 0;

                if (validateIndices && palette.length > 0) {
                    for (const idx of indices) {
                        maxIndex = Math.max(maxIndex, idx);
                        if (idx >= palette.length) {
                            outOfRangeCount++;
                        }
                    }
                    valid = outOfRangeCount === 0 || candidate.globalPalette;
                }

                results.push({
                    candidate,
                    indices,
                    valid,
                    maxIndex,
                    outOfRangeCount,
                    bitOrder
                });

                console.log(`  ✓ Produced 4096 indices`);
                console.log(`  Max index: ${maxIndex}, Palette size: ${palette.length}`);
                console.log(`  Out of range: ${outOfRangeCount}`);
                console.log(`  Valid: ${valid}`);

            } catch (error) {
                console.log(`  ✗ Failed: ${error.message}`);
                results.push({
                    candidate,
                    error: error.message,
                    valid: false
                });
            }
        }

        return results;
    }

    /**
     * Core bit stream decoding
     */
    static decodeBitStream(data, bitsPerBlock, bitOrder = 'LSB') {
        const indices = new Array(4096);
        const mask = (1n << BigInt(bitsPerBlock)) - 1n;
        
        let bitPos = 0;
        
        for (let i = 0; i < 4096; i++) {
            let value = 0n;
            let bitsRemaining = bitsPerBlock;
            
            while (bitsRemaining > 0) {
                const longIndex = Math.floor(bitPos / 64);
                const bitOffset = bitPos % 64;
                
                if (longIndex >= data.length) {
                    throw new Error('Bit stream exhausted before reading all blocks');
                }
                
                let long = data[longIndex];
                
                // Handle bit ordering
                if (bitOrder === 'MSB') {
                    // Reverse bits within the relevant portion
                    long = this.reverseLongBits(long);
                }
                
                const availableBits = 64 - bitOffset;
                const bitsToRead = Math.min(bitsRemaining, availableBits);
                
                // Extract bits
                const shift = BigInt(bitOffset);
                const readMask = ((1n << BigInt(bitsToRead)) - 1n) << shift;
                let bits = (long & readMask) >> shift;
                
                // Add to value
                if (bitOrder === 'LSB') {
                    value |= bits << BigInt(bitsPerBlock - bitsRemaining);
                } else {
                    value = (value << BigInt(bitsToRead)) | bits;
                }
                
                bitsRemaining -= bitsToRead;
                bitPos += bitsToRead;
            }
            
            indices[i] = Number(value & mask);
        }
        
        return indices;
    }

    /**
     * Reverse bits in a 64-bit long (for MSB testing)
     */
    static reverseLongBits(long) {
        let result = 0n;
        for (let i = 0; i < 64; i++) {
            if (long & (1n << BigInt(i))) {
                result |= 1n << BigInt(63 - i);
            }
        }
        return result;
    }

    /**
     * Convert linear index to coordinates
     */
    static indexToCoords(index) {
        const x = index % 16;
        const z = Math.floor((index % 256) / 16);
        const y = Math.floor(index / 256);
        return { x, y, z };
    }

    /**
     * Convert coordinates to linear index
     */
    static coordsToIndex(x, y, z) {
        return y * 256 + z * 16 + x;
    }
}

// Unit test with known data
export function runUnitTest() {
    console.log('=== UNIT TEST ===');
    
    // Simple test case: 2 blocks, 1 bit per block
    const testSection = {
        palette: [
            { Name: "minecraft:air" },
            { Name: "minecraft:stone" }
        ],
        data: [1n] // Binary: ...0001 (LSB: stone, air, air, air...)
    };

    const results = ChunkSectionDecoder.decodeBlockStates(testSection);
    console.log('Unit test completed:', results.length > 0 ? 'PASS' : 'FAIL');
}

// Diagnostic function for the 342 case
export function diagnose342Case(blockStates) {
    console.log('=== DIAGNOSING 342-LONG CASE ===');
    
    const totalBits = 342 * 64;
    const impliedBitsPerBlock = totalBits / 4096;
    
    console.log(`Total bits: ${totalBits}`);
    console.log(`Implied bitsPerBlock: ${impliedBitsPerBlock}`);
    console.log(`Integer check: ${Number.isInteger(impliedBitsPerBlock) ? 'YES' : 'NO'}`);
    
    // Check nearby integer values
    for (let bits = 4; bits <= 16; bits++) {
        const expectedLongs = Math.ceil(4096 * bits / 64);
        const diff = Math.abs(expectedLongs - 342);
        if (diff <= 2) {
            console.log(`Nearby candidate: bitsPerBlock=${bits} -> expectedLongs=${expectedLongs} (diff: ${diff})`);
        }
    }
    
    return ChunkSectionDecoder.decodeBlockStates(blockStates, {
        validateIndices: false // Try even if indices exceed palette
    });
}