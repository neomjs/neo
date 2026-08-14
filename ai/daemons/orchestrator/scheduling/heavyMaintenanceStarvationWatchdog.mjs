/**
 * @summary Read-only starvation watchdog for the heavy-maintenance lease's waiter ledger.
 *
 * Lease fairness shipped in two halves: the durable waiter ledger (who is waiting, since
 * when) and the three-rank yield gate that bounds how long a fair system defers anyone. What no
 * surface reported was the case where fairness itself fails: a waiter deferred PAST the yield bound
 * while the plane's health reads green — on the observed incident plane, priority-0 backup starved
 * 8.5 hours as nothing but per-deferral log lines. This lane converts that state into a health fact:
 * any live waiter whose unbroken deferral streak exceeds `starvationDegradeAfterMs` degrades the
 * orchestrator health surface with a receipt naming the waiter, its class, `deferredSince`, and the
 * current lease holder.
 *
 * ## Hard constraints (mirroring the sibling liveness watchdogs)
 *
 * - **Read-only.** It only READS the waiter ledger and the lease file; it never registers, clears,
 *   acquires, or influences admission — the fairness gate owns scheduling.
 * - **Never-fail.** The ledger read is fail-open by construction (unreadable entries are reported,
 *   never thrown); the evaluator treats them as a logged warning, and the pipeline runner wraps the
 *   whole check so a watchdog fault degrades to "no degradation", never a thrown error.
 * - **No latched red.** Unlike the stall watchdogs' one-shot alarm latch, the degrade is recomputed
 *   from the live ledger on every check: a waiter that acquires (its entry is cleared) or whose
 *   entry expires past the ledger TTL drops out of the reading, and health returns to green on the
 *   next check with no state to clear.
 *
 * The cadence projection (`getDueTask`) is pure and I/O-free; the ledger read happens only in the
 * pipeline's execute branch.
 *
 * @module ai/daemons/orchestrator/scheduling/heavyMaintenanceStarvationWatchdog
 * @see ai/daemons/orchestrator/services/heavyMaintenanceWaiterLedger.mjs — `listActiveWaitersSync` (the read primitive)
 * @see ai/daemons/orchestrator/scheduling/remConsolidationLivenessWatchdog.mjs — the sibling watchdog shape
 * @see ai/daemons/orchestrator/scheduling/pipeline.mjs — the `health-check` execute branch + outcome record
 */

/**
 * @summary Pure starvation evaluation over one waiter-ledger reading. No latch — every call stands alone.
 *
 * A breach is a live waiter whose `deferredSince` streak exceeds `degradeAfterMs`. The bound is the
 * backstop ABOVE `fairnessYieldAfterMs`: fairness yields the lease at that bound, so a waiter still
 * deferred past THIS one means the fairness machinery is not working (holder not yielding, waiter
 * never admitted, or the lease wedged), which is precisely the fact the health surface must carry.
 * Stale and unreadable ledger entries never reach the breach scan: `listActiveWaitersSync` expires
 * the former and reports the latter, and this evaluator surfaces `unreadableCount` so the caller can
 * log the fail-open skip instead of silently losing a waiter.
 *
 * The verdict is a four-state `posture`, because a corrupt reading and a clean reading must never
 * share a word: `degraded` (at least one READABLE breach — readable evidence always wins, even
 * beside unreadable noise) · `healthy` (a clean reading with no breach) · `unknown` (nothing
 * breached but part of the ledger was unreadable — the reading cannot assert green, and it never
 * authorizes degradation) · `disabled` (the bound is off; nothing was judged).
 *
 * @param {Object} options
 * @param {{waiters: Object[], unreadable: String[]}} options.ledgerReading Verbatim `listActiveWaitersSync` output.
 * @param {Number} options.now Current epoch milliseconds (injected clock).
 * @param {Number} options.degradeAfterMs Starvation bound; `<= 0` (or non-finite) disables — never degraded.
 * @param {String|null} [options.leaseHolder=null] Owner of the currently ACTIVE lease, or null when none.
 * @returns {{posture: String, degraded: Boolean, breaches: Object[], waiterCount: Number,
 *   unreadableCount: Number, degradeAfterMs: Number, leaseHolder: (String|null)}} `breaches` entries
 *   carry `{taskName, priorityZero, bootstrapCritical, deferredSince, starvedForMs, leaseHolder}` —
 *   the receipt the consumed health projection publishes.
 */
export function evaluateWaiterStarvation({ledgerReading, now, degradeAfterMs, leaseHolder = null} = {}) {
    const waiters    = Array.isArray(ledgerReading?.waiters)    ? ledgerReading.waiters    : [];
    const unreadable = Array.isArray(ledgerReading?.unreadable) ? ledgerReading.unreadable : [];
    const breaches   = [];
    const enabled    = Number.isFinite(degradeAfterMs) && degradeAfterMs > 0;

    if (enabled) {
        for (const entry of waiters) {
            const starvedForMs = now - Date.parse(entry.deferredSince);

            if (starvedForMs > degradeAfterMs) {
                breaches.push({
                    taskName         : entry.taskName,
                    priorityZero     : entry.priorityZero === true,
                    bootstrapCritical: entry.bootstrapCritical === true,
                    deferredSince    : entry.deferredSince,
                    starvedForMs,
                    leaseHolder
                });
            }
        }
    }

    const posture = !enabled
        ? 'disabled'
        : breaches.length > 0
            ? 'degraded'
            : unreadable.length > 0
                ? 'unknown'
                : 'healthy';

    return {
        posture,
        degraded       : posture === 'degraded',
        breaches,
        waiterCount    : waiters.length,
        unreadableCount: unreadable.length,
        degradeAfterMs,
        leaseHolder
    };
}

/**
 * @summary Cadence due-trigger projection. Returns a trigger descriptor when the configured check
 * interval has elapsed since `lastRunAt`; null otherwise. Pure — no I/O (the ledger read happens in
 * the execute branch, never here), mirroring the sibling watchdog projections.
 *
 * @param {Object} options
 * @param {Object} [options.state] Current task state for this lane (`{lastRunAt}`).
 * @param {Number} options.now Current epoch milliseconds.
 * @param {Number} options.heavyMaintenanceStarvationWatchdogCheckMs Check cadence; `<= 0` disables the lane.
 * @returns {Object|null} A watchdog task trigger or null when no check is due.
 */
export function getDueTask({state, now, heavyMaintenanceStarvationWatchdogCheckMs}) {
    const lastRunAt = state?.lastRunAt ?? 0;

    if (heavyMaintenanceStarvationWatchdogCheckMs > 0 && now - lastRunAt >= heavyMaintenanceStarvationWatchdogCheckMs) {
        return {
            taskName: 'heavy-maintenance-starvation-watchdog',
            source  : 'periodic-health-check',
            reason  : `periodic-health-check:${heavyMaintenanceStarvationWatchdogCheckMs}`
        };
    }

    return null;
}
