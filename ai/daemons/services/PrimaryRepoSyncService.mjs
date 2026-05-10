// Neo + core/_export bootstrap belongs to the orchestrator-daemon entry point.
import {execFileSync} from 'child_process';
import path           from 'path';
import Base           from '../../../src/core/Base.mjs';
import {
    PRIMARY_DEV_SYNC_TASK_NAME
} from '../TaskDefinitions.mjs';

const DEV_BRANCH     = 'dev';
const REMOTE_NAME    = 'origin';
const REMOTE_REF     = `${REMOTE_NAME}/${DEV_BRANCH}`;
const META_SYNC_PATH = 'resources/content/.sync-metadata.json';

/**
 * @summary Parses the primary-dev-sync enable flag.
 *
 * @param {String|undefined|null} value Environment value.
 * @param {Boolean} [fallback=true] Fallback flag.
 * @returns {Boolean}
 */
export function parseEnabledFlag(value, fallback=true) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

/**
 * @summary Builds the trigger for the primary-checkout dev-sync lane (#11017).
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
 * @summary Coordinates primary-checkout dev fast-forward pulls and KB sync cascades.
 *
 * The service owns the #11017 pull ladder:
 * 1. fetch + fast-forward pull when the primary checkout is clean;
 * 2. narrow local reset for `resources/content/.sync-metadata.json` only;
 * 3. skip with an operator-visible warning for every broader local divergence.
 *
 * @class Neo.ai.daemons.services.PrimaryRepoSyncService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/daemons/Orchestrator.mjs
 * @see learn/agentos/v13-path.md
 * @see #11017
 */
class PrimaryRepoSyncService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.PrimaryRepoSyncService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.PrimaryRepoSyncService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Resolves the next primary-dev-sync trigger.
     * @param {Object} options
     * @param {Object} options.state Current orchestrator task state.
     * @param {Number} options.now Current timestamp in milliseconds.
     * @param {Number} options.intervalMs Poll interval.
     * @param {Boolean} options.enabled Whether the lane is enabled.
     * @returns {Object|null}
     */
    getDueTask({state, now, intervalMs, enabled}) {
        return buildPrimaryRepoSyncTrigger({
            enabled,
            now,
            intervalMs,
            lastRunAt: state[PRIMARY_DEV_SYNC_TASK_NAME]?.lastRunAt || 0
        });
    }

    /**
     * Runs the task under the orchestrator state and health envelopes.
     * @param {Object} options
     * @param {String} [options.taskName=PRIMARY_DEV_SYNC_TASK_NAME]
     * @param {String} options.reason Scheduling reason.
     * @param {Object} options.taskStateService Orchestrator task-state service.
     * @param {Object} options.healthService HealthService-compatible sink.
     * @param {Function} [options.writeLog] Orchestrator logger.
     * @param {String} [options.cwd=process.cwd()] Invocation directory.
     * @param {Function} [options.execFileSyncFn=execFileSync] Test seam.
     * @returns {Object} Execution result.
     */
    runTask({
        taskName = PRIMARY_DEV_SYNC_TASK_NAME,
        reason,
        taskStateService,
        healthService,
        writeLog,
        cwd = process.cwd(),
        execFileSyncFn = execFileSync
    }) {
        const state = taskStateService.getTaskState(taskName);

        if (state?.running) {
            const details = {reason, skippedAt: new Date().toISOString(), reasonCode: 'already-running', pid: state.pid};
            writeLog?.('INFO', `[PrimaryRepoSync] Skipping; task already running.`);
            healthService?.recordTaskOutcome?.(taskName, 'skipped', details);
            return {status: 'skipped', details};
        }

        taskStateService.markStarted(taskName, reason);

        try {
            const result = this.syncPrimaryDev({cwd, execFileSyncFn, writeLog});
            const status = result.status === 'completed' ? 'completed' : 'skipped';

            if (status === 'completed') {
                taskStateService.markCompleted(taskName);
            } else {
                taskStateService.markSkipped(taskName);
            }

            healthService?.recordTaskOutcome?.(taskName, status, {reason, ...result.details});
            return result;
        } catch (e) {
            const details = {reason, phase: 'primary-dev-sync', error: e.message};

            taskStateService.markFailed(taskName, null);
            writeLog?.('ERROR', `[PrimaryRepoSync] Failed: ${e.message}`);
            healthService?.recordTaskOutcome?.(taskName, 'failed', details);
            return {status: 'failed', details};
        }
    }

    /**
     * Executes the primary checkout sync ladder.
     * @param {Object} options
     * @param {String} options.cwd Invocation directory.
     * @param {Function} options.execFileSyncFn Command execution seam.
     * @param {Function} [options.writeLog] Optional logger.
     * @returns {Object}
     */
    syncPrimaryDev({cwd, execFileSyncFn, writeLog}) {
        const primaryRoot = this.resolvePrimaryRoot({cwd, execFileSyncFn});
        const branch      = this.git(['rev-parse', '--abbrev-ref', 'HEAD'], primaryRoot, execFileSyncFn).trim();

        if (branch !== DEV_BRANCH) {
            return this.skip('not-dev-branch', {primaryRoot, branch}, writeLog);
        }

        this.git(['fetch', REMOTE_NAME, DEV_BRANCH, '--quiet'], primaryRoot, execFileSyncFn);

        const behind = this.getBehindCount(primaryRoot, execFileSyncFn);
        if (behind === 0) {
            return this.skip('up-to-date', {primaryRoot, behind}, writeLog);
        }

        const status = this.git(['status', '--porcelain'], primaryRoot, execFileSyncFn);
        if (status.trim()) {
            if (this.isOnlyMetaSyncStatus(status)) {
                return this.resolveMetaAndPull({primaryRoot, behind, execFileSyncFn, writeLog});
            }

            return this.skip('local-divergence', {
                primaryRoot,
                behind,
                files: this.parseStatusPaths(status)
            }, writeLog);
        }

        try {
            this.git(['pull', '--ff-only', REMOTE_NAME, DEV_BRANCH], primaryRoot, execFileSyncFn);
            this.runKbSync(primaryRoot, execFileSyncFn);
            return {
                status : 'completed',
                details: {primaryRoot, behind, layer: 'ff-pull', kbSync: true}
            };
        } catch (e) {
            const postPullStatus = this.git(['status', '--porcelain'], primaryRoot, execFileSyncFn);
            if (this.isOnlyMetaSyncStatus(postPullStatus)) {
                return this.resolveMetaAndPull({primaryRoot, behind, execFileSyncFn, writeLog});
            }

            return this.skip('non-FF-divergence', {
                primaryRoot,
                behind,
                error: e.message,
                files: this.parseStatusPaths(postPullStatus)
            }, writeLog);
        }
    }

    /**
     * Resolves the primary checkout root from any worktree in the same git set.
     * @param {Object} options
     * @param {String} options.cwd Invocation directory.
     * @param {Function} options.execFileSyncFn Command execution seam.
     * @returns {String}
     */
    resolvePrimaryRoot({cwd, execFileSyncFn}) {
        try {
            const output = this.git(['worktree', 'list', '--porcelain'], cwd, execFileSyncFn);
            const line   = output.split('\n').find(item => item.startsWith('worktree '));

            if (line) {
                return line.slice('worktree '.length).trim();
            }
        } catch (e) {}

        const commonDir = this.git(['rev-parse', '--git-common-dir'], cwd, execFileSyncFn).trim();
        const absolute  = path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir);

        return path.basename(absolute) === '.git' ? path.dirname(absolute) : path.resolve(absolute, '..');
    }

    /**
     * Handles the narrow metadata-only local reset before a fast-forward pull.
     * @param {Object} options
     * @param {String} options.primaryRoot Primary checkout path.
     * @param {Number} options.behind Commit lag behind origin/dev.
     * @param {Function} options.execFileSyncFn Command execution seam.
     * @param {Function} [options.writeLog] Optional logger.
     * @returns {Object}
     */
    resolveMetaAndPull({primaryRoot, behind, execFileSyncFn, writeLog}) {
        writeLog?.('INFO', `[PrimaryRepoSync] Resetting ${META_SYNC_PATH} before fast-forward pull.`);
        this.git(['checkout', '--', META_SYNC_PATH], primaryRoot, execFileSyncFn);
        this.git(['pull', '--ff-only', REMOTE_NAME, DEV_BRANCH], primaryRoot, execFileSyncFn);
        this.runKbSync(primaryRoot, execFileSyncFn);

        return {
            status : 'completed',
            details: {primaryRoot, behind, layer: 'meta-sync-reset', resolved: 'meta-sync', kbSync: true}
        };
    }

    /**
     * Runs `npm run ai:sync-kb` from the primary checkout.
     * @param {String} primaryRoot Primary checkout path.
     * @param {Function} execFileSyncFn Command execution seam.
     * @returns {void}
     */
    runKbSync(primaryRoot, execFileSyncFn) {
        const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

        execFileSyncFn(npmBin, ['run', 'ai:sync-kb'], {
            cwd     : primaryRoot,
            encoding: 'utf8',
            stdio   : ['ignore', 'pipe', 'pipe']
        });
    }

    /**
     * Runs a git command in a specific working directory.
     * @param {String[]} args Git arguments.
     * @param {String} cwd Working directory.
     * @param {Function} execFileSyncFn Command execution seam.
     * @returns {String}
     */
    git(args, cwd, execFileSyncFn) {
        return execFileSyncFn('git', args, {
            cwd,
            encoding: 'utf8',
            stdio   : ['ignore', 'pipe', 'pipe']
        }) || '';
    }

    /**
     * Counts how far local dev lags origin/dev.
     * @param {String} primaryRoot Primary checkout path.
     * @param {Function} execFileSyncFn Command execution seam.
     * @returns {Number}
     */
    getBehindCount(primaryRoot, execFileSyncFn) {
        const output = this.git(['rev-list', '--count', `${DEV_BRANCH}..${REMOTE_REF}`], primaryRoot, execFileSyncFn).trim();
        const parsed = parseInt(output || '0', 10);

        return Number.isNaN(parsed) ? 0 : parsed;
    }

    /**
     * Returns true when every status entry is the generated metadata file.
     * @param {String} statusOutput Git porcelain output.
     * @returns {Boolean}
     */
    isOnlyMetaSyncStatus(statusOutput) {
        const paths = this.parseStatusPaths(statusOutput);

        return paths.length > 0 && paths.every(item => item === META_SYNC_PATH);
    }

    /**
     * Extracts file paths from porcelain status rows.
     * @param {String} statusOutput Git porcelain output.
     * @returns {String[]}
     */
    parseStatusPaths(statusOutput) {
        return statusOutput
            .split('\n')
            .map(line => line.trimEnd())
            .filter(Boolean)
            .map(line => line.slice(3).split(' -> ').pop())
            .filter(Boolean);
    }

    /**
     * Builds a skipped result and logs warnings for operator-action states.
     * @param {String} reasonCode Stable skip reason.
     * @param {Object} details Additional details.
     * @param {Function} [writeLog] Optional logger.
     * @returns {Object}
     */
    skip(reasonCode, details, writeLog) {
        if (['local-divergence', 'non-FF-divergence'].includes(reasonCode)) {
            writeLog?.('WARN', `[PrimaryRepoSync] Skipped: ${reasonCode}. Operator action required.`);
        } else {
            writeLog?.('INFO', `[PrimaryRepoSync] Skipped: ${reasonCode}.`);
        }

        return {
            status : 'skipped',
            details: {reasonCode, ...details}
        };
    }
}

export default Neo.setupClass(PrimaryRepoSyncService);
