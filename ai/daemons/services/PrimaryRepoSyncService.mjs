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
export const DEV_SYNC_ROOTS_ENV_VAR = 'NEO_ORCHESTRATOR_DEV_SYNC_ROOTS';

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
 * @summary Parses the optional multi-checkout dev-sync root list (#11135).
 *
 * The env var is intentionally explicit: no sibling-clone discovery, no branch
 * switching, and no machine-specific defaults.
 *
 * @param {String|undefined|null} value JSON array of absolute repo roots.
 * @returns {Object}
 */
export function parseDevSyncRoots(value) {
    if (value === undefined || value === null || value === '') {
        return {status: 'unset', roots: []};
    }

    let parsed;
    try {
        parsed = JSON.parse(value);
    } catch (e) {
        return {
            status    : 'invalid',
            reasonCode: 'invalid-dev-sync-roots',
            error     : `${DEV_SYNC_ROOTS_ENV_VAR} must be a JSON array of absolute paths.`
        };
    }

    if (!Array.isArray(parsed)) {
        return {
            status    : 'invalid',
            reasonCode: 'invalid-dev-sync-roots',
            error     : `${DEV_SYNC_ROOTS_ENV_VAR} must be a JSON array of absolute paths.`
        };
    }

    const roots = [];
    const seen  = new Set();

    for (const item of parsed) {
        if (typeof item !== 'string' || item.trim() === '' || !path.isAbsolute(item.trim())) {
            return {
                status    : 'invalid',
                reasonCode: 'invalid-dev-sync-roots',
                error     : `${DEV_SYNC_ROOTS_ENV_VAR} entries must be absolute path strings.`
            };
        }

        const root = path.resolve(item.trim());

        if (!seen.has(root)) {
            seen.add(root);
            roots.push(root);
        }
    }

    return {status: 'configured', roots};
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
     * @param {String|undefined|null} [options.devSyncRootsConfig=process.env.NEO_ORCHESTRATOR_DEV_SYNC_ROOTS] Optional configured roots.
     * @returns {Object} Execution result.
     */
    runTask({
        taskName = PRIMARY_DEV_SYNC_TASK_NAME,
        reason,
        taskStateService,
        healthService,
        writeLog,
        cwd = process.cwd(),
        execFileSyncFn = execFileSync,
        devSyncRootsConfig = process.env[DEV_SYNC_ROOTS_ENV_VAR]
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
            const result = this.syncPrimaryDev({cwd, execFileSyncFn, writeLog, devSyncRootsConfig});
            const status = result.status === 'completed' ? 'completed' : result.status === 'failed' ? 'failed' : 'skipped';

            if (status === 'completed') {
                taskStateService.markCompleted(taskName);
            } else if (status === 'failed') {
                taskStateService.markFailed(taskName, null);
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
     * @param {String|undefined|null} [options.devSyncRootsConfig=process.env.NEO_ORCHESTRATOR_DEV_SYNC_ROOTS] Optional configured roots.
     * @returns {Object}
     */
    syncPrimaryDev({cwd, execFileSyncFn, writeLog, devSyncRootsConfig = process.env[DEV_SYNC_ROOTS_ENV_VAR]}) {
        const rootsConfig = parseDevSyncRoots(devSyncRootsConfig);

        if (rootsConfig.status === 'invalid') {
            return this.skip(rootsConfig.reasonCode, {
                envVar: DEV_SYNC_ROOTS_ENV_VAR,
                error : rootsConfig.error
            }, writeLog);
        }

        const primaryRoot = this.resolvePrimaryRoot({cwd, execFileSyncFn});

        if (rootsConfig.status === 'configured') {
            return this.syncConfiguredDevRoots({
                primaryRoot,
                roots: rootsConfig.roots,
                execFileSyncFn,
                writeLog
            });
        }

        return this.syncDevRoot({root: primaryRoot, rootKey: 'primaryRoot', execFileSyncFn, writeLog});
    }

    /**
     * Executes the sync ladder for a single configured root.
     * @param {Object} options
     * @param {String} options.root Configured repo root.
     * @param {Function} options.execFileSyncFn Command execution seam.
     * @param {Function} [options.writeLog] Optional logger.
     * @returns {Object}
     */
    syncConfiguredDevRoot({root, execFileSyncFn, writeLog}) {
        try {
            const topLevel = path.resolve(this.git(['rev-parse', '--show-toplevel'], root, execFileSyncFn).trim());

            if (topLevel !== root) {
                return this.fail('not-repo-root', {root, resolvedRoot: topLevel}, writeLog);
            }
        } catch (e) {
            return this.fail('root-verification-failed', {root, error: e.message}, writeLog);
        }

        try {
            return this.syncDevRoot({
                root,
                rootKey: 'root',
                execFileSyncFn,
                writeLog,
                fetchBeforeBranch: true,
                runKbSync: false
            });
        } catch (e) {
            return this.fail('root-sync-failed', {root, error: e.message}, writeLog);
        }
    }

    /**
     * Syncs all configured roots and cascades KB sync once from the owner root.
     * @param {Object} options
     * @param {String} options.primaryRoot Owning checkout root for KB sync.
     * @param {String[]} options.roots Configured repo roots.
     * @param {Function} options.execFileSyncFn Command execution seam.
     * @param {Function} [options.writeLog] Optional logger.
     * @returns {Object}
     */
    syncConfiguredDevRoots({primaryRoot, roots, execFileSyncFn, writeLog}) {
        const rootResults = roots.map(root => {
            const result = this.syncConfiguredDevRoot({root, execFileSyncFn, writeLog});
            return {status: result.status, ...result.details};
        });

        const completed = rootResults.filter(result => result.status === 'completed').length;
        const failed    = rootResults.filter(result => result.status === 'failed').length;
        const skipped   = rootResults.filter(result => result.status === 'skipped').length;
        const status    = completed > 0 ? 'completed' : failed > 0 ? 'failed' : 'skipped';
        const details   = {
            mode: 'configured-roots',
            primaryRoot,
            rootCount: rootResults.length,
            completed,
            skipped,
            failed,
            roots: rootResults,
            kbSync: false
        };

        if (completed > 0) {
            this.runKbSync(primaryRoot, execFileSyncFn);
            details.kbSync = true;
        } else if (rootResults.length === 0) {
            details.reasonCode = 'no-configured-roots';
        } else if (failed > 0) {
            details.reasonCode = 'configured-root-failures';
        } else {
            details.reasonCode = 'no-dev-updates';
        }

        if (status === 'failed') {
            writeLog?.('WARN', `[PrimaryRepoSync] Configured roots failed; operator action required.`);
        } else if (status === 'skipped') {
            writeLog?.('INFO', `[PrimaryRepoSync] Configured roots skipped: ${details.reasonCode}.`);
        }

        return {status, details};
    }

    /**
     * Executes the dev-sync ladder for one root.
     * @param {Object} options
     * @param {String} options.root Repo root to inspect.
     * @param {String} [options.rootKey='primaryRoot'] Details key for the root.
     * @param {Function} options.execFileSyncFn Command execution seam.
     * @param {Function} [options.writeLog] Optional logger.
     * @param {Boolean} [options.fetchBeforeBranch=false] Fetch/verify origin/dev before branch checks.
     * @param {Boolean} [options.runKbSync=true] Whether this root owns the KB cascade.
     * @returns {Object}
     */
    syncDevRoot({root, rootKey='primaryRoot', execFileSyncFn, writeLog, fetchBeforeBranch=false, runKbSync=true}) {
        const rootDetails = {[rootKey]: root};

        if (fetchBeforeBranch) {
            this.git(['fetch', REMOTE_NAME, DEV_BRANCH, '--quiet'], root, execFileSyncFn);
            this.git(['rev-parse', '--verify', REMOTE_REF], root, execFileSyncFn);
        }

        const branch = this.git(['rev-parse', '--abbrev-ref', 'HEAD'], root, execFileSyncFn).trim();

        if (branch !== DEV_BRANCH) {
            return this.skip('not-dev-branch', {
                ...rootDetails,
                branch,
                ...(fetchBeforeBranch ? {fetched: true} : {})
            }, writeLog);
        }

        if (!fetchBeforeBranch) {
            this.git(['fetch', REMOTE_NAME, DEV_BRANCH, '--quiet'], root, execFileSyncFn);
        }

        const behind = this.getBehindCount(root, execFileSyncFn);
        if (behind === 0) {
            return this.skip('up-to-date', {...rootDetails, behind}, writeLog);
        }

        const status = this.git(['status', '--porcelain'], root, execFileSyncFn);
        if (status.trim()) {
            if (this.isOnlyMetaSyncStatus(status)) {
                return this.resolveMetaAndPull({root, rootKey, behind, execFileSyncFn, writeLog, runKbSync});
            }

            return this.skip('local-divergence', {
                ...rootDetails,
                behind,
                files: this.parseStatusPaths(status)
            }, writeLog);
        }

        try {
            this.git(['pull', '--ff-only', REMOTE_NAME, DEV_BRANCH], root, execFileSyncFn);
            if (runKbSync) {
                this.runKbSync(root, execFileSyncFn);
            }
            return {
                status : 'completed',
                details: {...rootDetails, behind, layer: 'ff-pull', kbSync: runKbSync}
            };
        } catch (e) {
            const postPullStatus = this.git(['status', '--porcelain'], root, execFileSyncFn);
            if (this.isOnlyMetaSyncStatus(postPullStatus)) {
                return this.resolveMetaAndPull({root, rootKey, behind, execFileSyncFn, writeLog, runKbSync});
            }

            return this.skip('non-FF-divergence', {
                ...rootDetails,
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
     * @param {String} [options.primaryRoot] Primary checkout path.
     * @param {String} [options.root=options.primaryRoot] Repo root.
     * @param {String} [options.rootKey='primaryRoot'] Details key for the root.
     * @param {Number} options.behind Commit lag behind origin/dev.
     * @param {Function} options.execFileSyncFn Command execution seam.
     * @param {Function} [options.writeLog] Optional logger.
     * @param {Boolean} [options.runKbSync=true] Whether this root owns the KB cascade.
     * @returns {Object}
     */
    resolveMetaAndPull({primaryRoot, root=primaryRoot, rootKey='primaryRoot', behind, execFileSyncFn, writeLog, runKbSync=true}) {
        const rootDetails = {[rootKey]: root};

        writeLog?.('INFO', `[PrimaryRepoSync] Resetting ${META_SYNC_PATH} before fast-forward pull.`);
        this.git(['checkout', '--', META_SYNC_PATH], root, execFileSyncFn);
        this.git(['pull', '--ff-only', REMOTE_NAME, DEV_BRANCH], root, execFileSyncFn);
        if (runKbSync) {
            this.runKbSync(root, execFileSyncFn);
        }

        return {
            status : 'completed',
            details: {...rootDetails, behind, layer: 'meta-sync-reset', resolved: 'meta-sync', kbSync: runKbSync}
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
        if (['invalid-dev-sync-roots', 'local-divergence', 'non-FF-divergence'].includes(reasonCode)) {
            writeLog?.('WARN', `[PrimaryRepoSync] Skipped: ${reasonCode}. Operator action required.`);
        } else {
            writeLog?.('INFO', `[PrimaryRepoSync] Skipped: ${reasonCode}.`);
        }

        return {
            status : 'skipped',
            details: {reasonCode, ...details}
        };
    }

    /**
     * Builds a failed configured-root result and logs an operator warning.
     * @param {String} reasonCode Stable failure reason.
     * @param {Object} details Additional details.
     * @param {Function} [writeLog] Optional logger.
     * @returns {Object}
     */
    fail(reasonCode, details, writeLog) {
        writeLog?.('WARN', `[PrimaryRepoSync] Failed configured root: ${reasonCode}. Operator action required.`);

        return {
            status : 'failed',
            details: {reasonCode, ...details}
        };
    }
}

export default Neo.setupClass(PrimaryRepoSyncService);
