/**
 * Golden-path due-trigger projection. Returns a trigger descriptor when the
 * configured interval has elapsed since `lastRunAt`; null otherwise. Pure function.
 *
 * @param {Object} options
 * @param {Object} [options.state] Current task state for the golden-path lane (`{lastRunAt}`).
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.goldenPathIntervalMs Periodic interval; `<= 0` disables.
 * @returns {Object|null} A golden-path task trigger or null when no work is due.
 */
export function getDueTask({state, now, goldenPathIntervalMs}) {
    const lastRunAt = state?.lastRunAt ?? 0;
    if (goldenPathIntervalMs > 0 && now - lastRunAt >= goldenPathIntervalMs) {
        return {
            taskName: 'golden-path',
            source  : 'periodic-golden-path',
            reason  : `periodic-golden-path:${goldenPathIntervalMs}`
        };
    }
    return null;
}
