/**
 * @summary Dream-cycle due-trigger projection.
 *
 * Returns a trigger descriptor when the configured interval has elapsed since
 * `lastRunAt`; null otherwise. Pure function — no state, no I/O.
 */

/**
 * @param {Object} options
 * @param {Object} [options.state] Current task state for the dream lane (`{lastRunAt}`).
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.dreamIntervalMs Periodic interval; `<= 0` disables.
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
