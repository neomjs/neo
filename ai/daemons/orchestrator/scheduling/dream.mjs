/**
 * @summary Dream-cycle due-trigger projection.
 *
 * Pure function. Given current task state + clock + configured interval, returns a
 * trigger descriptor or null. No state, no I/O, no Neo class-system features.
 *
 * D3.1 boundary per `learn/agentos/v13-path.md:117`: per-task projections decide
 * what work is due; orchestrator wires; `DreamService.processUndigestedSessions()`
 * executes. This file owns the "is dream work due now?" projection only.
 *
 * @see ai/daemons/orchestrator/services/DreamService.mjs — execution side
 * @see learn/agentos/v13-path.md
 */

/**
 * @param {Object} options
 * @param {Object} [options.state] Current orchestrator task state for the dream lane (`{lastRunAt}`).
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.dreamIntervalMs Periodic dream interval; `0` (or any value `<= 0`) disables.
 * @returns {Object|null} A dream task trigger or null when no work is due.
 */
export function getDueTask({state, now, dreamIntervalMs}) {
    const lastRunAt = state?.lastRunAt ?? 0;
    if (dreamIntervalMs > 0 && now - lastRunAt >= dreamIntervalMs) {
        return {
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : `periodic-dream:${dreamIntervalMs}`
        };
    }
    return null;
}
