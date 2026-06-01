const DEFAULT_DREAM_OVERFLOW_THRESHOLD = 0.8;

/**
 * @summary Parses persisted task-state timestamps without throwing on legacy or
 * partially written state envelopes.
 * @param {Number|String|null|undefined} value Persisted timestamp value.
 * @returns {Number|null} Epoch milliseconds or null when the value is unusable.
 */
function toTimestampMs(value) {
    if (Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.length > 0) {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

/**
 * @summary Resolves the timestamp from which the next REM cadence should be
 * measured. Normal cycles retain start-time cadence; overflowed cycles cool down
 * from completion so one long run cannot immediately reacquire heavy maintenance.
 * @param {Object} options
 * @param {Object} [options.state] Current task state for the dream lane.
 * @param {Number} options.dreamIntervalMs Periodic REM interval.
 * @param {Number} [options.dreamOverflowThreshold=0.8] Fraction of cadence that
 * marks a completed cycle as overflowing.
 * @returns {Number} Epoch millisecond cadence anchor.
 */
export function getCadenceAnchor({state, dreamIntervalMs, dreamOverflowThreshold = DEFAULT_DREAM_OVERFLOW_THRESHOLD}) {
    const lastRunAt        = toTimestampMs(state?.lastRunAt) ?? 0;
    const lastSuccessAt    = toTimestampMs(state?.lastSuccessAt);
    const threshold        = Number.isFinite(dreamOverflowThreshold) && dreamOverflowThreshold > 0
        ? dreamOverflowThreshold
        : DEFAULT_DREAM_OVERFLOW_THRESHOLD;
    const thresholdMs      = dreamIntervalMs * threshold;
    const completedRuntime = lastSuccessAt !== null && lastSuccessAt > lastRunAt
        ? lastSuccessAt - lastRunAt
        : 0;

    return completedRuntime > thresholdMs ? lastSuccessAt : lastRunAt;
}

/**
 * @summary Dream-cycle due-trigger projection. Returns a trigger descriptor when
 * the configured interval has elapsed since the resolved cadence anchor; null
 * otherwise. Pure function.
 * @param {Object} options
 * @param {Object} [options.state] Current task state for the dream lane.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.dreamIntervalMs Periodic interval; `<= 0` disables.
 * @param {Number} [options.dreamOverflowThreshold=0.8] Fraction of cadence that
 * makes the completed prior cycle use completion-time cooldown.
 * @returns {Object|null} A dream task trigger or null when no work is due.
 */
export function getDueTask({state, now, dreamIntervalMs, dreamOverflowThreshold = DEFAULT_DREAM_OVERFLOW_THRESHOLD}) {
    const cadenceAnchor = getCadenceAnchor({state, dreamIntervalMs, dreamOverflowThreshold});

    if (dreamIntervalMs > 0 && now - cadenceAnchor >= dreamIntervalMs) {
        return {
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : `periodic-dream:${dreamIntervalMs}`
        };
    }
    return null;
}
