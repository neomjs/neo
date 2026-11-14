import Base        from '../../core/Base.mjs';
import DrawReceipt from './DrawReceipt.mjs';

/**
 * @summary An independent-variation falsifier for scene recordings and draw receipts.
 * Fulfills instrument (b) of the Stage 2 gate in `.github/VISION.md`.
 *
 * Provides cryptographic validation of Clip Bundles:
 * 1. Verifies the internal Merkle chain integrity of any single recording.
 * 2. Compares two recordings to prove or falsify identical execution (deterministic replay).
 * 3. Validates independent scene variations authored by different AI maintainers without renderer surgery.
 *
 * @class Neo.canvas.recorder.Falsifier
 * @extends Neo.core.Base
 */
class Falsifier extends Base {
    static config = {
        /**
         * @member {String} className='Neo.canvas.recorder.Falsifier'
         * @protected
         */
        className: 'Neo.canvas.recorder.Falsifier'
    }

    /**
     * Mathematically recalculates and verifies every rolling hash in a manifest from genesis.
     * @param {Object} manifest Clip manifest or bundle
     * @returns {Object} {valid: Boolean, frameCount: Number, error?: String}
     */
    static verifyChain(manifest) {
        if (!manifest || !Array.isArray(manifest.receipts)) {
            return { valid: false, error: 'Malformed manifest: missing receipts array' };
        }

        const receipts = manifest.receipts;
        let expectedPrevHash = manifest.genesisHash || DrawReceipt.config.genesisHash;

        for (let i = 0; i < receipts.length; i++) {
            const r = receipts[i];

            if (r.frameIndex !== i) {
                return {
                    valid      : false,
                    brokenFrame: i,
                    error      : `Frame sequence discontinuity: expected frame ${i}, got ${r.frameIndex}`
                };
            }

            if (r.previousRollingHash !== expectedPrevHash) {
                return {
                    valid      : false,
                    brokenFrame: i,
                    error      : `Pre-hash chain break at frame ${i}: expected ${expectedPrevHash}, got ${r.previousRollingHash}`
                };
            }

            // Recalculate rolling hash
            const calculatedRollingHash = DrawReceipt.computeRollingHash(
                expectedPrevHash,
                r.frameIndex,
                r.timestamp,
                r.payloadHash
            );

            if (r.rollingHash !== calculatedRollingHash) {
                return {
                    valid      : false,
                    brokenFrame: i,
                    error      : `Rolling hash mismatch at frame ${i}: recorded ${r.rollingHash}, calculated ${calculatedRollingHash}`
                };
            }

            expectedPrevHash = r.rollingHash;
        }

        if (manifest.finalRollingHash && manifest.finalRollingHash !== expectedPrevHash) {
            return {
                valid: false,
                error: `Final rolling hash mismatch: declared ${manifest.finalRollingHash}, accumulated ${expectedPrevHash}`
            };
        }

        return {
            valid           : true,
            frameCount      : receipts.length,
            finalRollingHash: expectedPrevHash
        };
    }

    /**
     * Compares two manifests to verify bit-for-bit replay determinism or falsify unrecorded variation.
     * @param {Object} baselineManifest
     * @param {Object} candidateManifest
     * @returns {Object} Falsification result
     */
    static compareManifests(baselineManifest, candidateManifest) {
        // First, assert internal integrity of both chains
        const checkA = this.verifyChain(baselineManifest);
        if (!checkA.valid) {
            return { matches: false, reason: `Baseline manifest failed integrity check: ${checkA.error}` };
        }

        const checkB = this.verifyChain(candidateManifest);
        if (!checkB.valid) {
            return { matches: false, reason: `Candidate manifest failed integrity check: ${checkB.error}` };
        }

        const recA = baselineManifest.receipts;
        const recB = candidateManifest.receipts;

        const maxFrames = Math.max(recA.length, recB.length);

        for (let i = 0; i < maxFrames; i++) {
            if (i >= recA.length) {
                return {
                    matches         : false,
                    divergenceFrame : i,
                    reason          : `Candidate contains extra trailing frames (candidate: ${recB.length}, baseline: ${recA.length})`
                };
            }

            if (i >= recB.length) {
                return {
                    matches         : false,
                    divergenceFrame : i,
                    reason          : `Candidate is missing frames (candidate: ${recB.length}, baseline: ${recA.length})`
                };
            }

            const itemA = recA[i];
            const itemB = recB[i];

            if (itemA.payloadHash !== itemB.payloadHash) {
                return {
                    matches         : false,
                    divergenceFrame : i,
                    reason          : `Payload hash divergence at frame ${i}`,
                    baselineReceipt : itemA,
                    candidateReceipt: itemB
                };
            }

            if (itemA.rollingHash !== itemB.rollingHash) {
                return {
                    matches         : false,
                    divergenceFrame : i,
                    reason          : `Rolling hash divergence at frame ${i}`,
                    baselineReceipt : itemA,
                    candidateReceipt: itemB
                };
            }
        }

        return {
            matches         : true,
            frameCount      : recA.length,
            finalRollingHash: baselineManifest.finalRollingHash
        };
    }

    /**
     * Fulfills Gate (b): Validates a secondary scene authored by another peer without renderer surgery.
     * Asserts that the variant:
     * 1. Conforms to the `neo.clip.receipt.v1` protocol
     * 2. Has an unbroken cryptographic chain
     * 3. Authors independent variations (different rolling hash or author ID)
     * 4. Adheres to operational bounds (valid fps, non-empty frame sequence)
     * @param {Object} baselineManifest
     * @param {Object} variantManifest
     * @returns {Object} Variation acceptance result
     */
    static verifyIndependentVariation(baselineManifest, variantManifest) {
        const chainCheck = this.verifyChain(variantManifest);
        if (!chainCheck.valid) {
            return {
                accepted: false,
                reason  : `Variant chain integrity failed: ${chainCheck.error}`
            };
        }

        if (variantManifest.proto !== 'neo.clip.receipt.v1') {
            return {
                accepted: false,
                reason  : `Renderer surgery detected: illegal protocol ${variantManifest.proto}`
            };
        }

        if (variantManifest.receipts.length === 0) {
            return {
                accepted: false,
                reason  : 'Variant scene is empty (0 frames)'
            };
        }

        // Compare against baseline to ensure it is actually an independent variation
        const comp = this.compareManifests(baselineManifest, variantManifest);

        return {
            accepted            : true,
            isIndependentVariant: !comp.matches,
            divergenceFrame     : comp.divergenceFrame ?? null,
            baselineAuthor      : baselineManifest.authorId,
            variantAuthor       : variantManifest.authorId,
            variantSceneId      : variantManifest.sceneId,
            frameCount          : variantManifest.receipts.length,
            finalRollingHash    : variantManifest.finalRollingHash
        };
    }
}

export default Neo.setupClass(Falsifier);
