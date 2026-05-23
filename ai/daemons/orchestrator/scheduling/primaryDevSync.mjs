import {PRIMARY_DEV_SYNC_TASK_NAME} from '../TaskDefinitions.mjs';

/**
 * Builds the trigger for the primary-checkout dev-sync lane. Pure function.
 *
 * @param {Object} options
 * @param {Boolean} options.enabled Whether the lane is enabled.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last task start timestamp.
 * @param {Number} options.intervalMs Poll interval; `0` disables it.
 * @returns {Object|null}
 */
export function buildPrimaryRepoSyncTrigger({enabled, now, lastRunAt, intervalMs}) {
    if (!enabled || intervalMs <= 0 || now - lastRunAt < intervalMs) {
        return null;
    }

    return {
        taskName: PRIMARY_DEV_SYNC_TASK_NAME,
        source  : 'periodic-sweep',
        reason  : `periodic-sweep:${intervalMs}`
    };
}

/**
 * Resolves the next primary-dev-sync trigger.
 *
 * @param {Object} options
 * @param {Object} options.state Current orchestrator task state.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.intervalMs Poll interval.
 * @param {Boolean} options.enabled Whether the lane is enabled.
 * @returns {Object|null}
 */
export function getDueTask({state, now, intervalMs, enabled}) {
    return buildPrimaryRepoSyncTrigger({
        enabled,
        now,
        intervalMs,
        lastRunAt: state[PRIMARY_DEV_SYNC_TASK_NAME]?.lastRunAt || 0
    });
}
