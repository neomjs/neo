// Neo + core/_export bootstrap belongs to the orchestrator-daemon entry point
import Base from '../../../../src/core/Base.mjs';

/**
 * @summary Builds the task trigger for the backup periodic sweep.
 *
 * Keeping this projection pure lets the orchestrator test the scheduling contract
 * without side-effects.
 *
 * @param {Object} options
 * @param {Number} options.now        Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt  Last backup task start timestamp.
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
 * @summary Coordinates the backup sweep trigger for the orchestrator.
 *
 * @class Neo.ai.daemons.services.BackupCoordinatorService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/daemons/Orchestrator.mjs
 */
class BackupCoordinatorService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.BackupCoordinatorService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.BackupCoordinatorService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Resolves the next backup task trigger.
     * @param {Object} options
     * @param {Object} options.state Current orchestrator task state.
     * @param {Number} options.now Current timestamp in milliseconds.
     * @param {Number} options.backupIntervalMs Periodic backup interval.
     * @returns {Object|null} Task trigger.
     */
    getDueTask({state, now, backupIntervalMs}) {
        return buildBackupTrigger({
            now,
            intervalMs: backupIntervalMs,
            lastRunAt : state.backup?.lastRunAt || 0
        });
    }
}

export default Neo.setupClass(BackupCoordinatorService);
