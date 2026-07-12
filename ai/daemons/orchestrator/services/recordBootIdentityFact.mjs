import {writeBootIdentityFact} from './bootIdentityFactStore.mjs';

/**
 * @module ai/daemons/orchestrator/services/recordBootIdentityFact
 * @summary The orchestrator's per-cycle WRITER half of the cross-process advisory boot-identity
 * surface: produce the current advisory fact from the boot-identity source and persist it to the shared
 * runtime-state file, so the separate fleet-bridge-server process can read it via `FleetControlBridge`.
 *
 * **Fail-soft — observability, never a gate.** A produce/write error is swallowed so it can NEVER break
 * a scheduler cycle; an absent/null fact is not written (the reader keeps its honest advisory-`unknown`
 * rather than serving a fabricated one). This mirrors the ledger-store discipline (a ledger write must
 * never fail synthesis / a cycle).
 */

/**
 * @summary Produce + persist the current advisory boot-identity fact. Called per scheduler cycle with
 * the orchestrator-constructed source; safe to call unconditionally (it no-ops on missing inputs).
 * @param {Object} options
 * @param {Object} options.source A boot-identity source exposing async `produceBootIdentityFact()`
 *     (the orchestrator's `BootIdentityHealthService`).
 * @param {String} options.dir The shared runtime-state directory the fleet reader also reads.
 * @param {Function} [options.writeImpl=writeBootIdentityFact] The store writer seam (injected in specs).
 * @returns {Promise<Object|null>} the persisted fact, or `null` when nothing was written.
 */
export async function recordBootIdentityFact({source, dir, writeImpl = writeBootIdentityFact} = {}) {
    try {
        if (!source || typeof source.produceBootIdentityFact !== 'function') {
            return null;
        }
        if (typeof dir !== 'string' || dir.length === 0) {
            return null;
        }

        const fact = await source.produceBootIdentityFact();

        if (!fact || typeof fact !== 'object') {
            return null;
        }

        await writeImpl(fact, {dir});

        return fact;
    } catch (error) {
        return null; // fail-soft: never gate a scheduler cycle on a boot-identity write
    }
}
