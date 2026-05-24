import {TENANT_REPO_SYNC_TASK_NAME} from '../TaskDefinitions.mjs';

/**
 * Builds the trigger for the cloud-deployable tenant-repo-sync lane (#11790).
 * Mirror of `buildPrimaryRepoSyncTrigger` in `./primaryDevSync.mjs` — pure function;
 * no class, no Neo machinery, no side effects.
 *
 * Drives the periodic refresh cycle for server-side tenant-repo ingestion: per the
 * `tenant-repo-sync` lane, `Orchestrator` invokes the trigger output → looks up
 * `TenantRepoSyncService.runTask` (registered via `TaskDefinitions.mjs` `serviceTask: true`).
 *
 * @param {Object} options
 * @param {Boolean} options.enabled Whether the lane is enabled (typically `NEO_AI_DEPLOYMENT_MODE === 'cloud'`).
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last task start timestamp.
 * @param {Number} options.intervalMs Poll interval; `0` disables.
 * @returns {Object|null}
 */
export function buildTenantRepoSyncTrigger({enabled, now, lastRunAt, intervalMs}) {
    if (!enabled || intervalMs <= 0 || now - lastRunAt < intervalMs) {
        return null;
    }

    return {
        taskName: TENANT_REPO_SYNC_TASK_NAME,
        source  : 'periodic-sweep',
        reason  : `periodic-sweep:${intervalMs}`
    };
}

/**
 * Resolves the next tenant-repo-sync trigger from orchestrator state.
 *
 * @param {Object} options
 * @param {Object} options.state Current orchestrator task state.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.intervalMs Poll interval.
 * @param {Boolean} options.enabled Whether the lane is enabled.
 * @returns {Object|null}
 */
export function getDueTask({state, now, intervalMs, enabled}) {
    return buildTenantRepoSyncTrigger({
        enabled,
        now,
        intervalMs,
        lastRunAt: state[TENANT_REPO_SYNC_TASK_NAME]?.lastRunAt || 0
    });
}
