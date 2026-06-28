/**
 * @module ai/services/memory-core/helpers/throttleShedHeal
 * @summary Orchestrator-agnostic factory for the `throttle-shed` heal-operation: the recovery counterpart to a
 * resource-contention / exhaustion fault. Where `freeze`/`quarantine` fence a corrupt collection, `throttle-shed`
 * relieves CONTENTION — it opens a bounded shed-window on `MaintenanceBackpressureService` so the orchestrator
 * defers ALL heavy-maintenance for a while, letting the contended resource recover, then auto-expires (no operator).
 *
 * The actuation is injected as `setShedWindow` so the heal-op is unit-testable without the live service (mirrors
 * `createFreezeHealOperation` / `createReEmbedMissingHealOperation`). Lossless — no data mutated; it only paces work.
 */

/**
 * Default shed-window: how long heavy-maintenance is deferred per `throttle-shed` heal when the evidence carries no
 * explicit `shedDurationMs`. Long enough to relieve a transient contention spike, short enough not to starve the
 * maintenance lanes — and bounded + auto-expiring regardless, so a mis-fire self-heals.
 * @type {Number}
 */
export const DEFAULT_SHED_DURATION_MS = 5 * 60 * 1000; // 5 min

/**
 * @summary The `throttle-shed` heal-operation: open a bounded shed-window (via the injected `setShedWindow`) so the
 * orchestrator defers heavy-maintenance and the contended resource recovers. Returns the actuation detail; the
 * window auto-expires with no operator. The duration comes from the diagnosis evidence (`shedDurationMs`) when
 * present, else the factory default.
 * @param {Object} options
 * @param {Function} options.setShedWindow `(durationMs, now) => shedUntil` — opens the shed-window (the locked seam).
 * @param {Number} [options.shedDurationMs=DEFAULT_SHED_DURATION_MS] Default window when evidence carries none.
 * @returns {Function} The `async ({collection, evidence, now}) => {status, detail}` heal-operation.
 */
export function createThrottleShedHealOperation({setShedWindow, shedDurationMs = DEFAULT_SHED_DURATION_MS} = {}) {
    if (typeof setShedWindow !== 'function') {
        throw new TypeError('createThrottleShedHealOperation: a setShedWindow function is required');
    }

    return async ({collection, evidence, now} = {}) => {
        const durationMs = Number.isFinite(evidence?.shedDurationMs) && evidence.shedDurationMs > 0 ? evidence.shedDurationMs : shedDurationMs,
              shedUntil  = await setShedWindow(durationMs, now);

        return {status: 'shed', detail: {collection, shedDurationMs: durationMs, shedUntil, reason: evidence?.reasonCode ?? evidence?.mode ?? 'contention'}};
    };
}
