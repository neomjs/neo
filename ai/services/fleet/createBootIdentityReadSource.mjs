import {readBootIdentityFact} from '../../daemons/orchestrator/services/bootIdentityFactStore.mjs';

/**
 * @module ai/services/fleet/createBootIdentityReadSource
 * @summary The fleet-server-side READER half of the cross-process advisory boot-identity surface.
 * `FleetControlBridge` runs in the separate fleet-bridge-server process, so
 * the orchestrator (which owns the boot-identity fact + the REM/scheduler surfaces) cannot inject its
 * live source there directly in the dev (Option-B) path. Instead the orchestrator WRITES its latest
 * advisory fact to a shared runtime-state file (`bootIdentityFactStore`), and this factory builds the
 * read-source `FleetControlBridge.bootIdentitySource` expects: an object exposing
 * `produceBootIdentityFact()` that reads that file and returns the persisted advisory fact, or an honest
 * advisory-`unknown` when it is absent/unreadable.
 *
 * **Mode-agnostic + read-only.** It mirrors the in-process `BootIdentityHealthService.produceBootIdentityFact()`
 * contract, so the consumer seam is identical whether the source is the live service (in-process Electron,
 * Option A) or this file reader (cross-process dev, Option B). READ-ONLY advisory: it never carries a
 * restart command (R3), and an absent fact is `unknown`, never fabricated liveness.
 */

const UNKNOWN_FACT = Object.freeze({
    fact          : null,
    classification: 'unknown',
    advisory      : true,
    reason        : 'no-boot-identity-fact-file'
});

/**
 * @summary Build a boot-identity read-source over the shared fact-file.
 * @param {Object} options
 * @param {String} options.dir The shared runtime-state directory the orchestrator writes the fact to.
 * @param {Number} [options.maxAgeMs] Staleness horizon forwarded to the store read; omit to use the
 *     store's default. This is the mechanical override point the store's contract refers to.
 * @param {Function} [options.readImpl=readBootIdentityFact] The store reader seam (injected in specs).
 * @returns {{produceBootIdentityFact: Function}} the read-source `FleetControlBridge.bootIdentitySource` expects.
 */
export function createBootIdentityReadSource({dir, maxAgeMs, readImpl = readBootIdentityFact} = {}) {
    return {
        async produceBootIdentityFact() {
            // Pass maxAgeMs through so the wiring can tighten/relax the staleness horizon; `undefined`
            // falls back to the store's default (readBootIdentityFact's own maxAgeMs default).
            const fact = await readImpl({dir, maxAgeMs});

            // A fresh copy of the fallback so a caller can never mutate the shared frozen constant.
            return fact && typeof fact === 'object' ? fact : {...UNKNOWN_FACT};
        }
    };
}
