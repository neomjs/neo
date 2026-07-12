import {writeBootIdentityFact} from './bootIdentityFactStore.mjs';

/**
 * @module ai/daemons/orchestrator/services/recordBootIdentityFact
 * @summary The orchestrator's per-cycle WRITER half of the cross-process advisory boot-identity
 * surface: produce the current advisory fact from the boot-identity source and persist it to the shared
 * runtime-state file, so the separate fleet-bridge-server process can read it via `FleetControlBridge`.
 *
 * **Fail-soft, but OBSERVABLE.** A produce/write error can NEVER break a scheduler cycle — but it is no
 * longer swallowed blind: a genuine produce/write throw is routed to an injected `onError` (default
 * no-op) before the fail-soft `null` return, so a persistent write failure is loggable rather than
 * silent. (The prior shape caught the error internally AND returned `null`, so a caller's `.catch()`
 * was dead code and the failure was invisible.) A NO-OP condition — a missing source / produce method /
 * dir, or an absent fact — returns `null` quietly: it is not an error, so it does not fire `onError`
 * (the reader simply keeps its honest advisory-`unknown`).
 */

/**
 * @summary Produce + persist the current advisory boot-identity fact. Called per scheduler cycle with
 * the orchestrator-constructed source; safe to call unconditionally (it no-ops on missing inputs).
 * @param {Object} options
 * @param {Object} options.source A boot-identity source exposing async `produceBootIdentityFact()`
 *     (the orchestrator's `BootIdentityHealthService`).
 * @param {String} options.dir The shared runtime-state directory the fleet reader also reads.
 * @param {Function} [options.writeImpl=writeBootIdentityFact] The store writer seam (injected in specs).
 * @param {Function} [options.onError] Observability sink for a genuine produce/write error; called with
 *     the error before the fail-soft `null` return. Never fires on a no-op. An `onError` that itself
 *     throws is swallowed (an observer must not gate the cycle either).
 * @returns {Promise<Object|null>} the persisted fact, or `null` when nothing was written.
 */
export async function recordBootIdentityFact({source, dir, writeImpl = writeBootIdentityFact, onError} = {}) {
    if (!source || typeof source.produceBootIdentityFact !== 'function') {
        return null; // no-op: nothing to produce (not an error)
    }
    if (typeof dir !== 'string' || dir.length === 0) {
        return null; // no-op: nowhere to write (not an error)
    }

    try {
        const fact = await source.produceBootIdentityFact();

        if (!fact || typeof fact !== 'object') {
            return null; // no-op: an absent fact is not written (reader keeps its honest advisory-unknown)
        }

        await writeImpl(fact, {dir});

        return fact;
    } catch (error) {
        // fail-soft: never gate a scheduler cycle on a boot-identity write — but surface the error so a
        // persistent produce/write failure is observable rather than silent.
        if (typeof onError === 'function') {
            try { onError(error) } catch (observerError) { /* an observer must never gate the cycle either */ }
        }
        return null;
    }
}
