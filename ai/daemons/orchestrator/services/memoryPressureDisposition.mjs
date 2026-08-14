import {CONTAINER_HEALTH_FACT_TYPES} from './containerHealthFactTypes.mjs';

/**
 * @module ai/daemons/orchestrator/services/memoryPressureDisposition
 * @summary Converts a sustained memory-saturation fact into a service-status disposition.
 *
 * ## The gap this closes
 *
 * A container pinned AT its cgroup memory limit enters page-fault thrash: the kernel evicts the
 * mmap'd model and KV-cache pages and the engine burns its whole CPU quota re-faulting them from
 * disk instead of computing. Observed live: 48.0G of a 48.0G cap, host swap 0.4% → 52.8%, a task in
 * flight ~26 minutes whose clean cost is ~2 — while Docker health, the liveness probe, the recovery
 * probe and the deployment-state snapshot all read healthy.
 *
 * Every one of those surfaces asks *is it alive*. None asks *is it at its ceiling*.
 *
 * **The signal was never missing.** The diagnosis service already crosses its threshold, sustains it
 * across a measured window, resolves heap-vs-container scope, and emits an authoritative
 * `memorySaturation` fact. What it could not do was reach a verdict: the service record derived
 * `status` from `errors.length` alone, and a container at its ceiling produces no error — it is
 * alive, it answers probes, it is simply not doing useful work. So the fact was computed, published
 * into the snapshot, and read by nothing.
 *
 * This module is the missing fold: fact → disposition → status.
 *
 * ## Why a sustained ratio is allowed to speak alone
 *
 * The diagnosis service's recovery path requires `minAuthoritativeFacts` (2) corroborating facts
 * before it will license an action, and it already carves out one exception — a store at its ceiling
 * saturates memory while its CPU sits idle, so it produces exactly one authoritative fact forever and
 * the floor suppressed it entirely. That carve's reasoning is recorded there and transfers intact:
 * **a sustained-window ratio against a hard limit is not a noisy signal, and the window is already
 * the corroboration the second fact was standing in for.** Requiring a second asks for a coincidence
 * rather than evidence.
 *
 * The carve does NOT transfer wholesale, and the difference matters: it is scoped to store-backed
 * services and answers with `raiseCeiling`, because a store's footprint tracks rows already persisted
 * so there is no arrival rate to reduce. A provider lane is `transient` and does have an arrival rate,
 * so the coherent remedies differ. **This module therefore reports a disposition and never an
 * action** — it degrades the surface and names what it saw; choosing the heal stays with the recovery
 * path that owns it.
 *
 * ## `unknown` is a verdict, not a default
 *
 * Absent stats, an unreadable sample set, or a non-authoritative fact all resolve to `unknown`, which
 * **never degrades**. A cgroup total that aggregates PID 1 plus forks is reported by the diagnosis
 * service with its authority withdrawn precisely because the number cannot speak for the service; a
 * disposition that degraded on it would launder a withdrawn authority back into a verdict. Absence of
 * observation is not observation of absence — the same posture the sibling watchdogs hold.
 */

/**
 * @summary Derives the memory-pressure disposition for one service observation.
 *
 * Reads the already-computed fact rather than re-deriving a threshold or a window. Re-deriving either
 * would put a second copy of the saturation contract beside the diagnosis service's, and the two would
 * drift silently — the failure the config SSOT exists to prevent.
 * @param {Object} [options]
 * @param {Object|null} [options.diagnosis] The container-health diagnosis for this service.
 * @returns {{disposition: String, receipt: Object|null}} `at-cap` degrades; `unknown` and `below` never do.
 */
export function deriveMemoryPressure({diagnosis} = {}) {
    const facts = Array.isArray(diagnosis?.facts) ? diagnosis.facts : null;

    // No diagnosis at all is not the same as a diagnosis reporting no pressure. The first means the
    // question was never asked, and answering `below` for it would assert a healthy ceiling nobody
    // measured.
    if (!facts) return {disposition: 'unknown', receipt: null};

    const saturation = facts.find(fact =>
        fact?.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation && fact?.authoritative === true
    );

    if (!saturation) {
        // A non-authoritative saturation fact is a reading whose SUBJECT is in doubt — the diagnosis
        // service withdrew its authority because the cgroup total may describe forks rather than the
        // service. Reported as unknown rather than below: the ceiling may well be crossed, and only
        // the attribution is unsafe.
        const withdrawn = facts.some(fact => fact?.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation);

        return {disposition: withdrawn ? 'unknown' : 'below', receipt: null};
    }

    const details = saturation.details || {};

    return {
        disposition: 'at-cap',
        // The receipt answers the three questions an operator asks on being told a lane is at its
        // ceiling — which service, against what limit, and for how long — and carries the MEASURED
        // window beside the required one, because reporting only the configured value puts an
        // unobserved claim inside the evidence a decision reads.
        receipt: {
            serviceKey      : saturation.serviceKey,
            metric          : 'memory',
            scope           : details.scope ?? null,
            threshold       : details.threshold ?? null,
            minPercent      : details.minPercent ?? null,
            sampleCount     : details.sampleCount ?? null,
            observedWindowMs: details.observedWindowMs ?? null,
            requiredWindowMs: details.requiredWindowMs ?? null,
            observedAt      : saturation.observedAt ?? null
        }
    }
}

/**
 * @summary Folds a memory-pressure disposition into a service status.
 *
 * Kept separate from the derivation so the fold is assertable on its own: the rule that `unknown`
 * never degrades is the one most likely to be broken by a later edit, and it is invisible if the only
 * way to test it is through a full diagnosis fixture.
 * @param {Object} options
 * @param {String} options.status The status derived from errors alone.
 * @param {String} options.disposition The memory-pressure disposition.
 * @returns {String} `degraded` when errors already said so, or when memory is sustained at-cap.
 */
export function foldMemoryPressureIntoStatus({status, disposition}) {
    if (status === 'degraded')     return status;
    if (disposition === 'at-cap')  return 'degraded';

    return status
}
