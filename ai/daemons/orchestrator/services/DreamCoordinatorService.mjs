/**
 * @summary Dream-cycle due-trigger selection for the v13 orchestrator.
 *
 * Pure function (no state, no Neo class-system features, no namespace registration —
 * orchestrator-internal scheduling helper, imported where needed).
 *
 * Owns due-trigger selection ONLY (D3.1 boundary per `learn/agentos/v13-path.md:117`).
 * Does NOT absorb `DreamService.processUndigestedSessions()` — that stays in
 * `DreamService` as execution-side responsibility.
 *
 * @see ai/daemons/orchestrator/services/DreamService.mjs
 * @see learn/agentos/v13-path.md
 */

/**
 * Resolves the next dream task trigger.
 *
 * The dream lane is a single-source interval lane: periodic-dream fires when the
 * configured interval has elapsed since `lastRunAt`. Pure projection — orchestrator
 * tests the scheduling contract without instantiating `DreamService` (whose
 * `processUndigestedSessions()` performs Memory Core graph reads + Chroma writes).
 *
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
