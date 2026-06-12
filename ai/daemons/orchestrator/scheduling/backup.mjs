/**
 * Builds the task trigger for the backup periodic sweep. Pure function.
 *
 * @param {Object} options
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last backup task start timestamp.
 * @param {Number} options.intervalMs Periodic backup interval; `0` disables it.
 * @returns {Object|null} A backup task trigger or null when no work is due.
 */
export function buildBackupTrigger({now, lastRunAt, intervalMs}) {
    if (intervalMs > 0 && now - lastRunAt >= intervalMs) {
        return {
            taskName: 'backup',
            source  : 'periodic-sweep',
            reason  : `periodic-sweep:${intervalMs}`
        };
    }
    return null;
}

/**
 * Resolves the next backup task trigger.
 *
 * @param {Object} options
 * @param {Object} options.state Current orchestrator task state.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.backupIntervalMs Periodic backup interval.
 * @returns {Object|null}
 */
export function getDueTask({state, now, backupIntervalMs}) {
    return buildBackupTrigger({
        now,
        intervalMs: backupIntervalMs,
        lastRunAt : state.backup?.lastRunAt || 0
    });
}
