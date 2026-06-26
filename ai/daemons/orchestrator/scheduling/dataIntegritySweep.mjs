/**
 * @module ai/daemons/orchestrator/scheduling/dataIntegritySweep
 * @summary Cadence projection for the periodic data-integrity sweep — the scheduling half that drives
 * the `DataIntegrityDiagnosisService` runner live in the orchestrator poll loop. Pure and I/O-free:
 * returns a trigger descriptor when the configured check interval has elapsed since the lane last ran,
 * else null. Mirrors the `embedDrainLivenessWatchdog` / `swarmHeartbeat` pure-cadence `getDueTask`
 * precedent; the coverage gather + diagnosis routing happens in the pipeline execute branch, never here.
 *
 * @see ai/daemons/orchestrator/services/DataIntegrityDiagnosisService.mjs — the runner this schedules
 * @see ai/daemons/orchestrator/scheduling/pipeline.mjs — the health-check execute branch that runs it
 * @see ai/daemons/orchestrator/scheduling/embedDrainLivenessWatchdog.mjs — the sibling pure-cadence precedent
 */

/**
 * @summary Cadence due-trigger projection. Returns a trigger descriptor when the configured check
 * interval has elapsed since `lastRunAt`; null otherwise. Pure — no I/O, no state writes.
 *
 * @param {Object} options
 * @param {Object} [options.state] Current task state for this lane (`{lastRunAt}`).
 * @param {Number} options.now Current epoch milliseconds.
 * @param {Number} options.dataIntegritySweepCheckMs Check cadence; `<= 0` disables the lane.
 * @returns {Object|null} A sweep task trigger or null when no check is due.
 */
export function getDueTask({state, now, dataIntegritySweepCheckMs}) {
    const lastRunAt = state?.lastRunAt ?? 0;

    if (dataIntegritySweepCheckMs > 0 && now - lastRunAt >= dataIntegritySweepCheckMs) {
        return {
            taskName: 'data-integrity-sweep',
            source  : 'periodic-data-integrity-check',
            reason  : `periodic-data-integrity-check:${dataIntegritySweepCheckMs}`
        };
    }

    return null;
}
