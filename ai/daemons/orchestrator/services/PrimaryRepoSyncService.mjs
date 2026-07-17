// Neo + core/_export bootstrap belongs to the orchestrator-daemon entry point.
import {execFileSync} from 'child_process';
import path           from 'path';
import Base           from '../../../../src/core/Base.mjs';
const DEV_BRANCH     = 'dev';
const REMOTE_NAME    = 'origin';
const REMOTE_REF     = `${REMOTE_NAME}/${DEV_BRANCH}`;
const META_SYNC_PATH = 'resources/content/.sync-metadata.json';
export const DEV_SYNC_ROOTS_ENV_VAR = 'NEO_ORCHESTRATOR_DEV_SYNC_ROOTS';

const KB_RELEVANT_PATH_PREFIXES = Object.freeze([
    '.agents/skills/',
    '.github/RELEASE_NOTES/',
    'ai/',
    'apps/',
    'docs/app/',
    'examples/',
    'learn/',
    'resources/content/',
    'src/',
    'test/playwright/'
]);

const KB_RELEVANT_PATHS = Object.freeze(new Set([
    'docs/output/class-hierarchy.json'
]));

const KB_IRRELEVANT_PATHS = Object.freeze(new Set([
    META_SYNC_PATH
]));

/**
 * @summary Checks whether a changed repository path can affect generated KB corpus chunks.
 *
 * The predicate mirrors Neo's default `SourceRegistry` roots conservatively. The decision
 * layer falls back to the full KB cascade whenever the revision or changed-path probes fail;
 * this helper only classifies concrete paths from a verified git diff.
 *
 * @param {String} filePath Repository-relative path.
 * @returns {Boolean}
 */
export function isKbRelevantChangePath(filePath) {
    const normalized = String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');

    if (!normalized || KB_IRRELEVANT_PATHS.has(normalized)) {
        return false;
    }

    return KB_RELEVANT_PATHS.has(normalized) ||
        KB_RELEVANT_PATH_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

const CONFIG_TEMPLATE_PATHS = Object.freeze(new Set([
    'ai/config.template.mjs'
]));

const SERVER_CONFIG_TEMPLATE_PATTERN = /^ai\/mcp\/server\/[^/]+\/config\.template\.mjs$/;

/**
 * @summary Checks whether a changed repository path is a config TEMPLATE whose drift
 * requires reconciling the gitignored operator-overlay (`config.mjs`) via
 * `initServerConfigs.mjs --migrate-config`.
 *
 * A plain `git pull` updates the tracked `config.template.mjs` (Tier-1 or per-server) but
 * never the gitignored `config.mjs` the daemons actually read — so a template change in the
 * pulled range is the signal that the overlay needs a migrate. Mirrors
 * {@link isKbRelevantChangePath}'s normalization so both predicates classify the same
 * `git diff --name-only` output from one diff.
 *
 * @param {String} filePath Repository-relative path.
 * @returns {Boolean}
 */
export function isConfigTemplateChangePath(filePath) {
    const normalized = String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');

    if (!normalized) {
        return false;
    }

    return CONFIG_TEMPLATE_PATHS.has(normalized) || SERVER_CONFIG_TEMPLATE_PATTERN.test(normalized);
}

/**
 * @summary Parses the optional multi-checkout dev-sync root list.
 *
 * The env var is intentionally explicit: no sibling-clone discovery, no branch
 * switching, and no machine-specific defaults.
 *
 * @param {String[]|String|undefined|null} value JSON array or array of absolute repo roots.
 * @param {String} [source=DEV_SYNC_ROOTS_ENV_VAR] Source label for operator-visible errors.
 * @returns {Object}
 */
export function parseDevSyncRoots(value, source=DEV_SYNC_ROOTS_ENV_VAR) {
    if (value === undefined || value === null || value === '') {
        return {status: 'unset', roots: []};
    }

    let parsed;
    if (Array.isArray(value)) {
        parsed = value;
    } else if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch (e) {
            return {
                status    : 'invalid',
                reasonCode: 'invalid-dev-sync-roots',
                error     : `${source} must be a JSON array of absolute paths.`
            };
        }
    } else {
        return {
            status    : 'invalid',
            reasonCode: 'invalid-dev-sync-roots',
            error     : `${source} must be a JSON array of absolute paths.`
        };
    }

    if (!Array.isArray(parsed)) {
        return {
            status    : 'invalid',
            reasonCode: 'invalid-dev-sync-roots',
            error     : `${source} must be a JSON array of absolute paths.`
        };
    }

    const roots = [];
    const seen  = new Set();

    for (const item of parsed) {
        if (typeof item !== 'string' || item.trim() === '' || !path.isAbsolute(item.trim())) {
            return {
                status    : 'invalid',
                reasonCode: 'invalid-dev-sync-roots',
                error     : `${source} entries must be absolute path strings.`
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
 * @summary Coordinates primary-checkout dev fast-forward pulls and KB sync cascades.
 *
 * The service owns the primary-checkout pull ladder:
 * 1. fetch + fast-forward pull when the primary checkout is clean;
 * 2. narrow local reset for `resources/content/.sync-metadata.json` only;
 * 3. skip with an operator-visible warning for every broader local divergence.
 *
 * @class Neo.ai.daemons.services.PrimaryRepoSyncService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/daemons/Orchestrator.mjs
 * @see learn/agentos/v13-path.md
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
     * Runs the task under the orchestrator state and health envelopes.
     * @param {Object} options
     * @param {String} [options.taskName='primary-dev-sync']
     * @param {String} options.reason Scheduling reason.
     * @param {Object} options.taskStateService Orchestrator task-state service.
     * @param {Object} options.healthService HealthService-compatible sink.
     * @param {Function} [options.writeLog] Orchestrator logger.
     * @param {String} [options.cwd=process.cwd()] Invocation directory.
     * @param {Function} [options.execFileSyncFn=execFileSync] Test seam.
     * @param {String[]|String|undefined|null} options.devSyncRootsConfig Configured roots. Callers (Orchestrator) resolve from `AiConfig.orchestrator.devSyncRoots` (env-applied via `envBindings.orchestrator.devSyncRoots → NEO_ORCHESTRATOR_DEV_SYNC_ROOTS`); the service does not read env directly.
     * @returns {Object} Execution result.
     */
    runTask({
        taskName = 'primary-dev-sync',
        reason,
        taskStateService,
        healthService,
        writeLog,
        cwd = process.cwd(),
        execFileSyncFn = execFileSync,
        devSyncRootsConfig
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
            const result = this.syncPrimaryDev({cwd, execFileSyncFn, writeLog, devSyncRootsConfig, taskStateService, healthService});
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
     * @param {String[]|String|undefined|null} options.devSyncRootsConfig Configured roots. Callers resolve from `AiConfig.orchestrator.devSyncRoots`; service does not read env directly.
     * @param {Object} [options.taskStateService] Optional `TaskStateService` forwarded to the eventual `runKbSync()` cascade so the nested KB sync is observable as a first-class `kbSync` task lifecycle event. Pass-through only; this method does not consume the service directly.
     * @param {Object} [options.healthService] Optional `HealthService` forwarded to the eventual `runKbSync()` cascade for `recordTaskOutcome('kbSync', ..., {parent: 'primary-dev-sync', ...})` observability. Pass-through only; this method does not consume the service directly.
     * @returns {Object}
     */
    syncPrimaryDev({
        cwd,
        execFileSyncFn,
        writeLog,
        devSyncRootsConfig,
        taskStateService,
        healthService
    }) {
        const rootsConfig = parseDevSyncRoots(devSyncRootsConfig, DEV_SYNC_ROOTS_ENV_VAR);

        if (rootsConfig.status === 'invalid') {
            return this.skip(rootsConfig.reasonCode, {
                envVar: DEV_SYNC_ROOTS_ENV_VAR,
                source: DEV_SYNC_ROOTS_ENV_VAR,
                error : rootsConfig.error
            }, writeLog);
        }

        const primaryRoot = this.resolvePrimaryRoot({cwd, execFileSyncFn});

        if (rootsConfig.status === 'configured') {
            return this.syncConfiguredDevRoots({
                primaryRoot,
                roots: rootsConfig.roots,
                execFileSyncFn,
                writeLog,
                taskStateService,
                healthService
            });
        }

        return this.syncDevRoot({root: primaryRoot, rootKey: 'primaryRoot', execFileSyncFn, writeLog, taskStateService, healthService});
    }

    /**
     * Executes the sync ladder for a single configured root.
     * @param {Object} options
     * @param {String} options.root Configured repo root.
     * @param {Function} options.execFileSyncFn Command execution seam.
     * @param {Function} [options.writeLog] Optional logger.
     * @returns {Object}
     */
    syncConfiguredDevRoot({root, execFileSyncFn, writeLog, taskStateService, healthService}) {
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
                rootKey          : 'root',
                execFileSyncFn,
                writeLog,
                fetchBeforeBranch: true,
                runKbSync        : false,
                taskStateService,
                healthService
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
     * @param {Object} [options.taskStateService] Optional `TaskStateService` forwarded to the `runKbSync()` cascade for first-class `kbSync` lifecycle annotation. Direct consumer of the pass-through.
     * @param {Object} [options.healthService] Optional `HealthService` forwarded to the `runKbSync()` cascade for `recordTaskOutcome('kbSync', ..., {parent: 'primary-dev-sync', ...})` observability. Direct consumer of the pass-through.
     * @returns {Object}
     */
    syncConfiguredDevRoots({primaryRoot, roots, execFileSyncFn, writeLog, taskStateService, healthService}) {
        const rootResults = roots.map(root => {
            const result = this.syncConfiguredDevRoot({root, execFileSyncFn, writeLog, taskStateService, healthService});
            return {status: result.status, ...result.details};
        });

        const completed = rootResults.filter(result => result.status === 'completed').length;
        const failed    = rootResults.filter(result => result.status === 'failed').length;
        const skipped   = rootResults.filter(result => result.status === 'skipped').length;
        const status    = completed > 0 ? 'completed' : failed > 0 ? 'failed' : 'skipped';
        const details   = {
            mode     : 'configured-roots',
            primaryRoot,
            rootCount: rootResults.length,
            completed,
            skipped,
            failed,
            roots    : rootResults,
            kbSync   : false
        };

        const kbSyncRequired = rootResults.some(result => result.status === 'completed' && result.kbSyncRequired !== false);

        if (completed > 0 && kbSyncRequired) {
            this.runKbSync(primaryRoot, execFileSyncFn, {taskStateService, healthService});
            details.kbSync = true;
        } else if (completed > 0) {
            details.reasonCode = 'no-kb-relevant-changes';
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
     * @param {Object} [options.taskStateService] Optional `TaskStateService` forwarded to `runKbSync()` for first-class `kbSync` lifecycle annotation when this root triggers the cascade. No-op when `runKbSync: false` (the singular configured-root path).
     * @param {Object} [options.healthService] Optional `HealthService` forwarded to `runKbSync()` for cascade `recordTaskOutcome` events with `{parent: 'primary-dev-sync'}` annotation.
     * @returns {Object}
     */
    syncDevRoot({root, rootKey='primaryRoot', execFileSyncFn, writeLog, fetchBeforeBranch=false, runKbSync=true, taskStateService, healthService}) {
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
                return this.resolveMetaAndPull({root, rootKey, behind, execFileSyncFn, writeLog, runKbSync, taskStateService, healthService});
            }

            return this.skip('local-divergence', {
                ...rootDetails,
                behind,
                files: this.parseStatusPaths(status)
            }, writeLog);
        }

        try {
            const oldHead = this.resolveOptionalHead(root, execFileSyncFn);
            this.git(['pull', '--ff-only', REMOTE_NAME, DEV_BRANCH], root, execFileSyncFn);
            const newHead        = this.resolveOptionalHead(root, execFileSyncFn);
            const kbSyncDecision = this.resolveKbSyncDecision({root, oldHead, newHead, execFileSyncFn});
            if (kbSyncDecision.configMigrateRequired) {
                this.runConfigMigrate(root, execFileSyncFn, {taskStateService, healthService});
            }
            if (runKbSync && kbSyncDecision.kbSyncRequired) {
                this.runKbSync(root, execFileSyncFn, {taskStateService, healthService});
            }
            return {
                status : 'completed',
                details: {
                    ...rootDetails,
                    behind,
                    layer        : 'ff-pull',
                    kbSync       : runKbSync && kbSyncDecision.kbSyncRequired,
                    configMigrate: kbSyncDecision.configMigrateRequired,
                    ...kbSyncDecision
                }
            };
        } catch (e) {
            const postPullStatus = this.git(['status', '--porcelain'], root, execFileSyncFn);
            if (this.isOnlyMetaSyncStatus(postPullStatus)) {
                return this.resolveMetaAndPull({root, rootKey, behind, execFileSyncFn, writeLog, runKbSync, taskStateService, healthService});
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
     * @param {Object} [options.taskStateService] Optional `TaskStateService` forwarded to `runKbSync()` for first-class `kbSync` lifecycle annotation when this root triggers the cascade.
     * @param {Object} [options.healthService] Optional `HealthService` forwarded to `runKbSync()` for cascade `recordTaskOutcome` events with `{parent: 'primary-dev-sync'}` annotation.
     * @returns {Object}
     */
    resolveMetaAndPull({primaryRoot, root=primaryRoot, rootKey='primaryRoot', behind, execFileSyncFn, writeLog, runKbSync=true, taskStateService, healthService}) {
        const rootDetails = {[rootKey]: root};

        writeLog?.('INFO', `[PrimaryRepoSync] Resetting ${META_SYNC_PATH} before fast-forward pull.`);
        const oldHead = this.resolveOptionalHead(root, execFileSyncFn);
        this.git(['checkout', '--', META_SYNC_PATH], root, execFileSyncFn);
        this.git(['pull', '--ff-only', REMOTE_NAME, DEV_BRANCH], root, execFileSyncFn);
        const newHead        = this.resolveOptionalHead(root, execFileSyncFn);
        const kbSyncDecision = this.resolveKbSyncDecision({root, oldHead, newHead, execFileSyncFn});
        if (kbSyncDecision.configMigrateRequired) {
            this.runConfigMigrate(root, execFileSyncFn, {taskStateService, healthService});
        }
        if (runKbSync && kbSyncDecision.kbSyncRequired) {
            this.runKbSync(root, execFileSyncFn, {taskStateService, healthService});
        }

        return {
            status : 'completed',
            details: {
                ...rootDetails,
                behind,
                layer        : 'meta-sync-reset',
                resolved     : 'meta-sync',
                kbSync       : runKbSync && kbSyncDecision.kbSyncRequired,
                configMigrate: kbSyncDecision.configMigrateRequired,
                ...kbSyncDecision
            }
        };
    }

    /**
     * Runs `npm run ai:sync-kb` from the primary checkout, annotating the
     * cascade as a first-class `kbSync` task lifecycle event so the nested
     * KB sync becomes observable in `TaskStateService` + `HealthService`
     * surfaces (rather than being hidden inside `primary-dev-sync`).
     *
     * The nested cascade must be visible as its own task: without first-class
     * annotation, `TaskStateService.taskState.kbSync.running` remains `false`
     * during cascades and `HealthService.recordTaskOutcome` records no
     * `kbSync` events for the cascade duration. Monitoring and forensics would
     * otherwise conflate cascade kbSync with the parent `primary-dev-sync` task.
     *
     * Both service injections are optional-chained for backward compatibility:
     * callers (tests, ad-hoc tooling) that don't supply them get the prior
     * behavior unchanged. The orchestrator-side wiring threads them through
     * `runTask` → `syncPrimaryDev` → `syncConfiguredDevRoots` / `syncDevRoot`
     * / `resolveMetaAndPull` → here.
     *
     * The annotation `reason` string carries the durable convention
     * `cascaded-from-<parentTaskName>` so operator dashboards + Memory Core
     * graph ingestion can filter cascade kbSync events from orchestrator-
     * spawned kbSync events. The `details.parent` field on `recordTaskOutcome`
     * carries the same provenance.
     *
     * @param {String} primaryRoot Primary checkout path.
     * @param {Function} execFileSyncFn Command execution seam.
     * @param {Object} [options]
     * @param {Object} [options.taskStateService] Injected `TaskStateService` for state-lifecycle annotation; if absent the call is a pure shell-out with no state mutation.
     * @param {Object} [options.healthService] Injected `HealthService` for outcome-telemetry annotation; if absent no outcomes are recorded.
     * @param {String} [options.parentTaskName='primary-dev-sync'] Parent task name for cascade provenance.
     * @returns {void}
     */
    runKbSync(primaryRoot, execFileSyncFn, {taskStateService, healthService, parentTaskName = 'primary-dev-sync'} = {}) {
        const npmBin         = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const reason         = `cascaded-from-${parentTaskName}`;
        const inheritedToken = process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;

        taskStateService?.markStarted?.('kbSync', reason);
        healthService?.recordTaskOutcome?.('kbSync', 'running', {
            reason,
            parent   : parentTaskName,
            startedAt: new Date().toISOString()
        });

        const spawnOptions = {
            cwd     : primaryRoot,
            encoding: 'utf8',
            stdio   : ['ignore', 'pipe', 'pipe']
        };

        if (inheritedToken) {
            spawnOptions.env = {...process.env, NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN: inheritedToken};
        }

        try {
            const stdout  = execFileSyncFn(npmBin, ['run', 'ai:sync-kb'], spawnOptions) || '';
            const outcome = this.parseCascadeOutcome(stdout);

            if (outcome?.deferred === true && outcome.reason) {
                // Lease-held cascade kb-sync → `skipped`, not a false-green `completed` (the
                // deferred-as-completed class): a deferred run did no embedding, so it must not
                // refresh kbSync's lastSuccessAt the way a real sync does.
                taskStateService?.markSkipped?.('kbSync');
                healthService?.recordTaskOutcome?.('kbSync', 'skipped', {
                    reason,
                    parent    : parentTaskName,
                    reasonCode: outcome.reason,
                    skippedAt : new Date().toISOString()
                });
            } else {
                taskStateService?.markCompleted?.('kbSync');
                // Propagate the child's success details (e.g. embed/delete counts) so the cascade
                // telemetry matches the task path; outcome is null on the legacy no-JSON path → spreads nothing.
                healthService?.recordTaskOutcome?.('kbSync', 'completed', {
                    reason,
                    parent     : parentTaskName,
                    completedAt: new Date().toISOString(),
                    ...(outcome || {})
                });
            }
        } catch (e) {
            taskStateService?.markFailed?.('kbSync', e.status || 1);
            healthService?.recordTaskOutcome?.('kbSync', 'failed', {
                reason,
                parent  : parentTaskName,
                error   : e.message,
                failedAt: new Date().toISOString()
            });
            throw e;
        }
    }

    /**
     * @summary Extracts the child's structured outcome from cascade stdout, tolerating the
     * `npm run` banner by scanning for the last line that JSON-parses to an object. Returns
     * null when no JSON outcome line is present (e.g. a child that only emitted human-readable
     * logs), so the caller falls through to the `completed` classification — preserving the
     * pre-outcome-emit behavior and making this forward-compatible with the child emit side.
     * @param {String} stdout Captured child stdout.
     * @returns {Object|null} Parsed outcome envelope, or null when none is found.
     */
    parseCascadeOutcome(stdout) {
        const lines = String(stdout || '').split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line.startsWith('{')) continue;
            try {
                const parsed = JSON.parse(line);
                if (parsed && typeof parsed === 'object') return parsed;
            } catch {
                // Not the JSON outcome line; keep scanning upward.
            }
        }
        return null;
    }

    /**
     * Runs `node <root>/ai/scripts/setup/initServerConfigs.mjs --migrate-config` from the
     * pulled checkout to reconcile the gitignored `config.mjs` operator-overlay with the
     * `config.template.mjs` leaves that just advanced on `dev`.
     *
     * A `git pull` updates the tracked template but never the gitignored overlay the daemons
     * actually read — so a config-template change in the pulled range leaves every daemon
     * (orchestrator, wake-daemon, DreamService, KB pipeline) running current code against
     * stale config until this migrate runs. The bare script is warn-only; the
     * `--migrate-config` flag applies only the initializer's bounded migration contract. When a
     * per-server overlay needs declaration-level conversion, the child exits with a typed
     * `migration-required` outcome instead of rewriting operator data. This service never invokes
     * the converter or passes its `--write` flag. The script resolves its repo from its own
     * `__dirname`, so the script PATH under `root` selects the checkout to reconcile.
     *
     * Annotated as a first-class `configMigrate` task lifecycle event (same pattern as
     * {@link runKbSync}) so the cascade is observable in `TaskStateService` +
     * `HealthService` rather than hidden inside `primary-dev-sync`. Both injections are
     * optional-chained for backward compatibility.
     *
     * Unlike {@link runKbSync}, a migrate failure is **isolated, not rethrown**: a stale
     * overlay must never abort the (already-successful) pull, the sibling KB cascade, or the
     * parent task. The failure is recorded + surfaced; the daemon keeps running.
     *
     * Config migration is **per-clone** (each checkout owns its own gitignored `config.mjs`),
     * so this runs once per synced root — unlike the KB cascade, which runs once from the
     * owning checkout.
     *
     * @param {String} root Checkout path whose overlay is being reconciled.
     * @param {Function} execFileSyncFn Command execution seam.
     * @param {Object} [options]
     * @param {Object} [options.taskStateService] Injected `TaskStateService` for state-lifecycle annotation; if absent the call is a pure shell-out with no state mutation.
     * @param {Object} [options.healthService] Injected `HealthService` for outcome-telemetry annotation; if absent no outcomes are recorded.
     * @param {String} [options.parentTaskName='primary-dev-sync'] Parent task name for cascade provenance.
     * @returns {void}
     */
    runConfigMigrate(root, execFileSyncFn, {taskStateService, healthService, parentTaskName = 'primary-dev-sync'} = {}) {
        const reason     = `cascaded-from-${parentTaskName}`;
        const scriptPath = path.join(root, 'ai', 'scripts', 'setup', 'initServerConfigs.mjs');

        taskStateService?.markStarted?.('configMigrate', reason);
        healthService?.recordTaskOutcome?.('configMigrate', 'running', {
            reason,
            parent   : parentTaskName,
            startedAt: new Date().toISOString()
        });

        try {
            execFileSyncFn(process.execPath, [scriptPath, '--migrate-config'], {
                cwd     : root,
                encoding: 'utf8',
                stdio   : ['ignore', 'pipe', 'pipe']
            });

            taskStateService?.markCompleted?.('configMigrate');
            healthService?.recordTaskOutcome?.('configMigrate', 'completed', {
                reason,
                parent     : parentTaskName,
                completedAt: new Date().toISOString()
            });
        } catch (e) {
            // Isolation: a stale overlay must not abort the successful pull, the KB cascade,
            // or the parent task. Record + surface; never rethrow (contrast runKbSync).
            const outcome           = this.parseCascadeOutcome(e.stdout),
                  migrationRequired = outcome?.status === 'migration-required' &&
                    outcome.reasonCode === 'per-server-overlay-migration-required' &&
                    Array.isArray(outcome.servers) &&
                    outcome.servers.every(serverName => typeof serverName === 'string')
                      ? {reasonCode: outcome.reasonCode, servers: outcome.servers}
                      : {};

            taskStateService?.markFailed?.('configMigrate', e.status || 1);
            healthService?.recordTaskOutcome?.('configMigrate', 'failed', {
                reason,
                parent  : parentTaskName,
                error   : e.message,
                failedAt: new Date().toISOString(),
                ...migrationRequired
            });
        }
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
     * Resolves the current repository HEAD.
     * @param {String} root Repository root.
     * @param {Function} execFileSyncFn Command execution seam.
     * @returns {String}
     */
    resolveHead(root, execFileSyncFn) {
        return this.git(['rev-parse', 'HEAD'], root, execFileSyncFn).trim();
    }

    /**
     * Resolves HEAD without blocking the pull path when the probe itself fails.
     * @param {String} root Repository root.
     * @param {Function} execFileSyncFn Command execution seam.
     * @returns {String|null}
     */
    resolveOptionalHead(root, execFileSyncFn) {
        try {
            return this.resolveHead(root, execFileSyncFn);
        } catch (e) {
            return null;
        }
    }

    /**
     * Resolves the changed paths for one revision boundary.
     * @param {Object} options
     * @param {String} options.root Repository root.
     * @param {String} options.oldHead Previous HEAD.
     * @param {String} options.newHead Current HEAD.
     * @param {Function} options.execFileSyncFn Command execution seam.
     * @returns {String[]}
     */
    resolveChangedPaths({root, oldHead, newHead, execFileSyncFn}) {
        const output = this.git(['diff', '--name-only', `${oldHead}..${newHead}`], root, execFileSyncFn).trim();

        return output ? output.split('\n').map(item => item.trim()).filter(Boolean) : [];
    }

    /**
     * Decides whether a successful dev pull needs the expensive KB cascade and/or a
     * config-overlay migrate, from a single `git diff` of the pulled range. The KB decision
     * gates {@link runKbSync}; the config-migrate decision (`configMigrateRequired`) gates
     * {@link runConfigMigrate} when a `config.template.mjs` (Tier-1 or per-server) advanced in
     * the pulled commits. Both classifiers share the one changed-path projection, so
     * no second diff is spawned. Unknown-head / diff-failure short-circuits fail safe (both
     * cascades required) because the cheaper outcome is a redundant reconcile, not stale state.
     * @param {Object} options
     * @param {String} options.root Repository root.
     * @param {String} options.oldHead Previous HEAD.
     * @param {String} options.newHead Current HEAD.
     * @param {Function} options.execFileSyncFn Command execution seam.
     * @returns {Object}
     */
    resolveKbSyncDecision({root, oldHead, newHead, execFileSyncFn}) {
        if (!oldHead || !newHead) {
            return {
                kbSyncRequired         : true,
                kbSyncReasonCode       : 'kb-relevance-unknown-head',
                configMigrateRequired  : true,
                configMigrateReasonCode: 'config-migrate-unknown-head',
                oldHead,
                newHead
            };
        }

        if (oldHead === newHead) {
            return {
                kbSyncRequired         : false,
                kbSyncReasonCode       : 'no-kb-relevant-changes',
                configMigrateRequired  : false,
                configMigrateReasonCode: 'no-config-template-changes',
                reasonCode             : 'no-kb-relevant-changes',
                oldHead,
                newHead,
                changedPathCount       : 0,
                kbChangedPathCount     : 0,
                kbChangedPathSample    : [],
                configChangedPathCount : 0,
                configChangedPathSample: []
            };
        }

        let changedPaths;
        try {
            changedPaths = this.resolveChangedPaths({root, oldHead, newHead, execFileSyncFn});
        } catch (e) {
            return {
                kbSyncRequired         : true,
                kbSyncReasonCode       : 'kb-relevance-check-failed',
                configMigrateRequired  : true,
                configMigrateReasonCode: 'config-migrate-relevance-check-failed',
                oldHead,
                newHead,
                error                  : e.message
            };
        }

        const kbChangedPaths     = changedPaths.filter(isKbRelevantChangePath);
        const configChangedPaths = changedPaths.filter(isConfigTemplateChangePath);

        return {
            kbSyncRequired         : kbChangedPaths.length > 0,
            kbSyncReasonCode       : kbChangedPaths.length > 0 ? 'kb-relevant-changes' : 'no-kb-relevant-changes',
            configMigrateRequired  : configChangedPaths.length > 0,
            configMigrateReasonCode: configChangedPaths.length > 0 ? 'config-template-changes' : 'no-config-template-changes',
            ...(kbChangedPaths.length > 0 ? {} : {reasonCode: 'no-kb-relevant-changes'}),
            oldHead,
            newHead,
            changedPathCount       : changedPaths.length,
            kbChangedPathCount     : kbChangedPaths.length,
            kbChangedPathSample    : kbChangedPaths.slice(0, 10),
            configChangedPathCount : configChangedPaths.length,
            configChangedPathSample: configChangedPaths.slice(0, 10)
        };
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
