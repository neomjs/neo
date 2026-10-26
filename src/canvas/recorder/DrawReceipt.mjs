import Base from '../../core/Base.mjs';

/**
 * Pure JavaScript synchronous SHA-256 implementation.
 * Guarantees zero-dependency, bit-for-bit cryptographic parity in any execution context
 * (App Worker, Canvas Worker, SharedWorker, Browser Main Thread, Node.js).
 * @param {String} str
 * @returns {String} Hex digest
 */
export function sha256(str) {
    let ascii = '';
    if (typeof TextEncoder !== 'undefined') {
        const u8 = new TextEncoder().encode(str);
        for (let i = 0; i < u8.length; i++) ascii += String.fromCharCode(u8[i]);
    } else {
        ascii = unescape(encodeURIComponent(str));
    }

    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }

    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const lengthProperty = 'length';
    let i, j;
    let result = '';
    const words = [];
    const asciiBitLength = ascii[lengthProperty] * 8;
    const hash = [];
    const k = [];
    let primeCounter = 0;
    const isComposite = {};

    for (let candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) {
                isComposite[i] = candidate;
            }
            hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }

    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';

    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }

    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = asciiBitLength;

    for (j = 0; j < words[lengthProperty];) {
        const w = words.slice(j, j += 16);
        const oldHash = hash.slice(0);

        for (i = 0; i < 64; i++) {
            const w15 = w[i - 15], w2 = w[i - 2];
            const a = hash[0], e = hash[4];
            const temp1 = hash[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                + ((e & hash[5]) ^ ((~e) & hash[6]))
                + k[i]
                + (w[i] = (i < 16) ? w[i] : (
                        w[i - 16]
                        + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                        + w[i - 7]
                        + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                    ) | 0
                );
            const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

            hash.pop();
            hash.unshift((temp1 + temp2) | 0);
            hash[4] = (hash[4] + temp1) | 0;
        }

        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }

    for (i = 0; i < 8; i++) {
        for (j = 3; j + 1; j--) {
            const b = (hash[i] >> (j * 8)) & 255;
            result += ((b < 16) ? '0' : '') + b.toString(16);
        }
    }

    return result;
}

/**
 * @summary Cryptographic Draw Receipt authority for deterministic canvas rendering and simulation verification.
 * Fulfills the Stage 2 gate instrument requirement in `.github/VISION.md`.
 *
 * Every frame drawn by a canvas renderer is bound to a deterministic SHA-256 draw receipt, forming an
 * unbroken Merkle rolling hash chain that falsifies any unrecorded mutation, dropped frame, or timing drift.
 *
 * @class Neo.canvas.recorder.DrawReceipt
 * @extends Neo.core.Base
 */
class DrawReceipt extends Base {
    static config = {
        /**
         * @member {String} className='Neo.canvas.recorder.DrawReceipt'
         * @protected
         */
        className: 'Neo.canvas.recorder.DrawReceipt',
        /**
         * The genesis block hash for brand new scene records
         * @member {String} genesisHash='0000000000000000000000000000000000000000000000000000000000000000'
         */
        genesisHash: '0000000000000000000000000000000000000000000000000000000000000000'
    }

    /**
     * Hashes an arbitrary string with SHA-256.
     * @param {String} text
     * @returns {String} Hex hash
     */
    static hash(text) {
        return sha256(text);
    }

    /**
     * Canonicalizes and digests draw payload (commands, vertices, or ColorQL chromatic tokens).
     * @param {*} payload
     * @returns {String} Deterministic payload hash
     */
    static digestPayload(payload) {
        if (!payload) return sha256('null');
        if (typeof payload === 'string') return sha256(payload);

        // Fast path for typed array buffers
        if (payload instanceof Float32Array || payload instanceof Uint8Array || payload instanceof Int32Array) {
            let str = '';
            const len = payload.length;
            for (let i = 0; i < len; i++) {
                str += payload[i] + ',';
            }
            return sha256(str);
        }

        // Canonical sorted JSON stringification
        const canonical = JSON.stringify(payload, (key, value) => {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                return Object.keys(value).sort().reduce((sorted, k) => {
                    sorted[k] = value[k];
                    return sorted;
                }, {});
            }
            return value;
        });

        return sha256(canonical);
    }

    /**
     * Computes the rolling hash binding the previous frame's hash to the current frame's receipt.
     * @param {String} previousRollingHash
     * @param {Number} frameIndex
     * @param {Number} timestamp
     * @param {String} payloadHash
     * @returns {String} Next rolling hash
     */
    static computeRollingHash(previousRollingHash, frameIndex, timestamp, payloadHash) {
        const preimage = `${previousRollingHash}:${frameIndex}:${timestamp.toFixed(4)}:${payloadHash}`;
        return sha256(preimage);
    }

    /**
     * Issues an immutable draw receipt for a rendered frame.
     * @param {Object} opts
     * @param {Number} opts.frameIndex Sequential frame index (0-based)
     * @param {Number} opts.timestamp Simulation time in milliseconds
     * @param {*} opts.payload Draw commands, WebGL2 buffers, or ColorQL packet
     * @param {String} [opts.previousRollingHash] The rolling hash of the prior frame (defaults to genesisHash)
     * @param {String[]} [opts.colorTokens] Optional ColorQL Prism chromatic tokens
     * @param {Object} [opts.metadata] Additional scene metadata
     * @returns {Object} DrawReceipt record
     */
    static createReceipt({
        frameIndex,
        timestamp,
        payload,
        previousRollingHash = this.config.genesisHash,
        colorTokens = [],
        metadata = {}
    }) {
        const payloadHash = this.digestPayload(payload);
        const rollingHash = this.computeRollingHash(previousRollingHash, frameIndex, timestamp, payloadHash);

        return {
            frameIndex,
            timestamp,
            payloadHash,
            rollingHash,
            previousRollingHash,
            colorTokens,
            metadata,
            receiptId: `rcpt_${frameIndex}_${payloadHash.slice(0, 12)}`
        };
    }
}

export default Neo.setupClass(DrawReceipt);
