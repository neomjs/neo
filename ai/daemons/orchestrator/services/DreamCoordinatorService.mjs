/**
 * @summary Dream-cycle due-trigger selection for the v13 orchestrator.
 *
 * Stateless utility (no reactive configs, no lifecycle, no class-system features
 * beyond namespace registration) — uses the gatekeep pattern, mirroring
 * `src/core/IdGenerator.mjs` / `src/util/Env.mjs` precedent.
 *
 * Owns due-trigger selection ONLY (D3.1 boundary per `learn/agentos/v13-path.md:117`).
 * Does NOT absorb `DreamService.processUndigestedSessions()` — that stays in
 * `DreamService` as execution-side responsibility. The orchestrator asks this service
 * whether a dream task is due; the service returns a trigger object or null.
 *
 * @namespace Neo.ai.daemons.services.DreamCoordinatorService
 * @see ai/daemons/orchestrator/services/DreamService.mjs
 * @see learn/agentos/v13-path.md
 */

/**
 * Builds the task trigger for the dream-cycle lane.
 *
 * The dream lane is a single-source interval lane: periodic-dream fires when the
 * configured interval has elapsed since `lastRunAt`. Keeping this projection pure
 * lets the orchestrator test the scheduling contract without instantiating
 * `DreamService` (whose `processUndigestedSessions()` performs Memory Core graph
 * reads + Chroma writes).
 *
 * @param {Object} options
 * @param {Number} options.now        Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt  Last dream task start timestamp.
 * @param {Number} options.intervalMs Periodic dream interval; `0` (or any value `<= 0`)
 *                                    disables the interval source.
 * @returns {Object|null} A dream task trigger or null when no work is due.
 */
export function buildDreamTrigger({now, lastRunAt, intervalMs}) {
    if (intervalMs > 0 && now - lastRunAt >= intervalMs) {
        return {
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : `periodic-dream:${intervalMs}`
        };
    }
    return null;
}

const DreamCoordinatorService = {
    /**
     * Resolves the next dream task trigger.
     * @param {Object} options
     * @param {Object} options.state Current orchestrator task state for the dream lane (`{lastRunAt}`).
     * @param {Number} options.now Current timestamp in milliseconds.
     * @param {Number} options.dreamIntervalMs Periodic dream interval; `0` disables.
     * @returns {Object|null}
     */
    getDueTask({state, now, dreamIntervalMs}) {
        return buildDreamTrigger({
            now,
            lastRunAt : state?.lastRunAt ?? 0,
            intervalMs: dreamIntervalMs
        });
    }
};

export default Neo.gatekeep(DreamCoordinatorService, 'Neo.ai.daemons.services.DreamCoordinatorService');
