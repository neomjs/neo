// Neo + core/_export + InstanceManager bootstrap belongs to the daemon entry point
// (`ai/scripts/orchestrator-daemon.mjs`), NOT to this consumed-class file. Class files
// rely on `globalThis.Neo` populated by the entry-point bootstrap; importing Neo here
// would violate the entry-point-only invariant + risk partial-namespace damage if the
// class were ever loaded outside its entry-point's chain.
import fs                          from 'fs-extra';
import {spawn}                     from 'child_process';
import path                        from 'path';
import Base                        from '../../src/core/Base.mjs';
import HealthService               from '../services/memory-core/HealthService.mjs';
import {
    initializeDatabase
} from '../scripts/bridge-daemon-queries.mjs';
import SummarizationCoordinatorService from './services/SummarizationCoordinatorService.mjs';
import BackupCoordinatorService          from './services/BackupCoordinatorService.mjs';
import {
    acquireHeavyMaintenanceLeaseSync,
    releaseHeavyMaintenanceLeaseSync
} from './services/HeavyMaintenanceLeaseService.mjs';
import PrimaryRepoSyncService, {
    DEV_SYNC_ROOTS_CONFIG_KEY,
    DEV_SYNC_ROOTS_ENV_VAR,
    parseEnabledFlag
} from './services/PrimaryRepoSyncService.mjs';
import TaskStateService                from './services/TaskStateService.mjs';
import ProcessSupervisorService        from './services/ProcessSupervisorService.mjs';
import CadenceEngine                   from './services/CadenceEngine.mjs';
import DreamService                    from './DreamService.mjs';
import GoldenPathSynthesizer           from './services/GoldenPathSynthesizer.mjs';
import {
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_SUMMARY_SWEEP_INTERVAL_MS,
    DEFAULT_KB_SYNC_INTERVAL_MS,
    DEFAULT_BACKUP_INTERVAL_MS,
    DEFAULT_PRIMARY_DEV_SYNC_INTERVAL_MS,
    PRIMARY_DEV_SYNC_TASK_NAME,
    DEFAULT_DREAM_INTERVAL_MS,
    DREAM_TASK_NAME,
    DEFAULT_GOLDEN_PATH_INTERVAL_MS,
    GOLDEN_PATH_TASK_NAME,
    DEFAULT_DB_PATH,
    DEFAULT_DATA_DIR,
    DEFAULT_SCRIPT_DIR,
    buildTaskDefinitions
} from './TaskDefinitions.mjs';

/**
 * Canonical set of heavy-maintenance task names that participate in the orchestrator's
 * cross-poll backpressure invariant: at any time, across orchestrator-owned tasks AND
 * lease-aware manual scripts (see `HeavyMaintenanceLeaseService` + Lane C wrappers in
 * `buildScripts/ai/*.mjs`), at most one substrate-heavy maintenance job may hold the
 * heavy-maintenance lease.
 *
 * Membership rationale per #11503:
 * - `summary` / `kbSync` / `dream` — Memory Core graph + Chroma write-heavy
 * - `backup` — exports KB Chroma + Memory Core Chroma + SQLite graph state; substrate-heavy
 *   even though it doesn't mutate, because concurrent IO with other heavy classes is the
 *   contention surface (added by #11513 — Lane A of #11503)
 * - `PRIMARY_DEV_SYNC_TASK_NAME` — git fetch + nested KB sync cascade
 *
 * Intentionally NOT in the heavy set:
 * - `GOLDEN_PATH_TASK_NAME` — classified as light maintenance per #11511 / PR #11512
 *   (synthesizer reads the graph; does not write the heavy substrates)
 *
 * Cross-poll deferral coverage lives in `test/playwright/unit/ai/daemons/Orchestrator.spec.mjs`.
 *
 * @type {ReadonlyArray<String>}
 */
export const DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES = Object.freeze([
    'summary',
    'kbSync',
    'backup',
    PRIMARY_DEV_SYNC_TASK_NAME,
    DREAM_TASK_NAME
]);

export const DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES = Object.freeze([
    DREAM_TASK_NAME
]);

/**
 * Resolves the dev-sync roots config while preserving env-var precedence.
 * @param {Object} options
 * @param {String|undefined|null} options.envValue Environment value.
 * @param {String[]|String|undefined|null} options.configValue Local config value.
 * @returns {String[]|String|undefined|null}
 */
export function resolvePrimaryDevSyncRootsConfig({envValue, configValue}) {
    if (envValue !== undefined && envValue !== null && envValue !== '') {
        return envValue;
    }

    if (Array.isArray(configValue) && configValue.length === 0) {
        return null;
    }

    return configValue;
}

/**
 * Resolves the operator-visible dev-sync roots config source label.
 * @param {Object} options
 * @param {String|undefined|null} options.envValue Environment value.
 * @returns {String}
 */
export function resolvePrimaryDevSyncRootsSource({envValue}) {
    if (envValue !== undefined && envValue !== null && envValue !== '') {
        return DEV_SYNC_ROOTS_ENV_VAR;
    }

    return DEV_SYNC_ROOTS_CONFIG_KEY;
}

/**
 * @summary Neo daemon class for Agent OS maintenance scheduling (#11009).
 *
 * `ai/scripts/orchestrator-daemon.mjs` owns the Node-process boot wrapper:
 * PID file, lifecycle traps, and fatal-start isolation. This class owns the
 * actual maintenance loop, task-state persistence, subprocess execution,
 * recovery of already-running child tasks, and task outcome reporting through
 * `HealthService.recordTaskOutcome(...)`.
 *
 * Failure isolation is per task: summary scheduling and KB-sync scheduling are
 * wrapped independently so a thrown sunset-handover read or summary success hook
 * cannot stop the KB-sync lane, and a KB-sync failure cannot stop the next summary
 * sweep.
 *
 * @class Neo.ai.daemons.Orchestrator
 * @extends Neo.core.Base
 * @singleton
 * @see ai/scripts/orchestrator-daemon.mjs
 * @see ai/daemons/services/SummarizationCoordinatorService.mjs
 * @see ai/services/memory-core/HealthService.mjs#recordTaskOutcome
 * @see learn/agentos/v13-path.md
 * @see #11009
 */
export class Orchestrator extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.Orchestrator'
         * @protected
         */
        className: 'Neo.ai.daemons.Orchestrator',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Boolean} isPolling_=false
         * @protected
         * @reactive
         */
        isPolling_: false,
        /**
         * @member {Object|null} pollHandle_=null
         * @protected
         * @reactive
         */
        pollHandle_: null,
        /**
         * @member {Object|null} db_=null
         * @protected
         * @reactive
         */
        db_: null,
        /**
         * @member {Object} taskStateService_=TaskStateService
         * @protected
         * @reactive
         */
        taskStateService_: TaskStateService,
        /**
         * @member {Object|null} taskDefinitions_=null
         * @protected
         * @reactive
         */
        taskDefinitions_: null,
        /**
         * @member {String} dataDir_='.neo-ai-data/orchestrator-daemon'
         * @protected
         * @reactive
         */
        dataDir_: DEFAULT_DATA_DIR,
        /**
         * @member {String} dbPath_='.neo-ai-data/sqlite/memory-core-graph.sqlite'
         * @protected
         * @reactive
         */
        dbPath_: DEFAULT_DB_PATH,
        /**
         * @member {String|null} logFile_=null
         * @protected
         * @reactive
         */
        logFile_: null,
        /**
         * @member {String|null} stateFile_=null
         * @protected
         * @reactive
         */
        stateFile_: null,
        /**
         * @member {Number} pollIntervalMs_=3000
         * @protected
         * @reactive
         */
        pollIntervalMs_: DEFAULT_POLL_INTERVAL_MS,
        /**
         * @member {Number} summarySweepIntervalMs_=600000
         * @protected
         * @reactive
         */
        summarySweepIntervalMs_: DEFAULT_SUMMARY_SWEEP_INTERVAL_MS,
        /**
         * @member {Number} kbSyncIntervalMs_=1800000
         * @protected
         * @reactive
         */
        kbSyncIntervalMs_: DEFAULT_KB_SYNC_INTERVAL_MS,
        /**
         * @member {Boolean} kbSyncEnabled_=true
         * @protected
         * @reactive
         */
        kbSyncEnabled_: true,
        /**
         * @member {Number} backupIntervalMs_=86400000
         * @protected
         * @reactive
         */
        backupIntervalMs_: DEFAULT_BACKUP_INTERVAL_MS,
        /**
         * @member {Number} primaryDevSyncIntervalMs_=600000
         * @protected
         * @reactive
         */
        primaryDevSyncIntervalMs_: DEFAULT_PRIMARY_DEV_SYNC_INTERVAL_MS,
        /**
         * @member {Boolean} primaryDevSyncEnabled_=true
         * @protected
         * @reactive
         */
        primaryDevSyncEnabled_: true,
        /**
         * @member {Boolean} bridgeDaemonEnabled_=true
         * @protected
         * @reactive
         */
        bridgeDaemonEnabled_: true,
        /**
         * @member {String[]|String|null} primaryDevSyncRootsConfig_=null
         * @protected
         * @reactive
         */
        primaryDevSyncRootsConfig_: null,
        /**
         * @member {Number} dreamIntervalMs_=3600000
         * @protected
         * @reactive
         */
        dreamIntervalMs_: DEFAULT_DREAM_INTERVAL_MS,
        /**
         * @member {Number} goldenPathIntervalMs_=3600000
         * @protected
         * @reactive
         */
        goldenPathIntervalMs_: DEFAULT_GOLDEN_PATH_INTERVAL_MS,
        /**
         * @member {Boolean} goldenPathRepoEnrichmentEnabled_=true
         * @protected
         * @reactive
         */
        goldenPathRepoEnrichmentEnabled_: true,
        /**
         * @member {Object} healthService_=HealthService
         * @protected
         * @reactive
         */
        healthService_: HealthService,
        /**
         * @member {Object} cadenceEngine_=CadenceEngine
         * @protected
         * @reactive
         */
        cadenceEngine_: CadenceEngine,
        /**
         * @member {Object} summarizationCoordinator_=SummarizationCoordinatorService
         * @protected
         * @reactive
         */
        summarizationCoordinator_: SummarizationCoordinatorService,
        /**
         * @member {Object} backupCoordinator_=BackupCoordinatorService
         * @protected
         * @reactive
         */
        backupCoordinator_: BackupCoordinatorService,
        /**
         * @member {Object} primaryRepoSyncService_=PrimaryRepoSyncService
         * @protected
         * @reactive
         */
        primaryRepoSyncService_: PrimaryRepoSyncService,
        /**
         * @member {Object} dreamService_=DreamService
         * @protected
         * @reactive
         */
        dreamService_: DreamService,
        /**
         * @member {Object} goldenPathSynthesizer_=GoldenPathSynthesizer
         * @protected
         * @reactive
         */
        goldenPathSynthesizer_: GoldenPathSynthesizer,
        /**
         * @member {String[]} heavyMaintenanceTaskNames_=DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES
         * @protected
         * @reactive
         */
        heavyMaintenanceTaskNames_: DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
        /**
         * @member {String[]} goldenPathDependencyTaskNames_=DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES
         * @protected
         * @reactive
         */
        goldenPathDependencyTaskNames_: DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES,
        /**
         * @member {Set|null} maintenanceDeferralLogKeys_=null
         * @protected
         * @reactive
         */
        maintenanceDeferralLogKeys_: null,
        /**
         * @member {Function} spawnFn_=spawn
         * @protected
         * @reactive
         */
        spawnFn_: spawn,
        /**
         * @member {Object} processSupervisorService_=ProcessSupervisorService
         * @protected
         * @reactive
         */
        processSupervisorService_: ProcessSupervisorService,
        /**
         * @member {Function} initializeDatabaseFn_=initializeDatabase
         * @protected
         * @reactive
         */
        initializeDatabaseFn_: initializeDatabase
    }

    /**
     * Applies runtime settings from the wrapper or tests.
     * @param {Object} [options]
     * @returns {void}
     */
    configure(options = {}) {
        const scriptDir = options.scriptDir || DEFAULT_SCRIPT_DIR;
        const dataDir   = options.dataDir   || DEFAULT_DATA_DIR;

        this.dataDir                = dataDir;
        this.dbPath                 = options.dbPath || DEFAULT_DB_PATH;
        this.logFile                = options.logFile   || path.join(dataDir, 'orchestrator.log');
        this.stateFile              = options.stateFile || path.join(dataDir, 'orchestrator-state.json');
        if (options.heavyMaintenanceLeasePath !== undefined) {
            this.heavyMaintenanceLeasePath = options.heavyMaintenanceLeasePath;
        }
        this.cadenceEngine          = options.cadenceEngine          || CadenceEngine;
        this.pollIntervalMs         = options.pollIntervalMs ?? this.cadenceEngine.parseInterval(process.env.NEO_ORCHESTRATOR_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS);
        this.summarySweepIntervalMs = options.summarySweepIntervalMs ?? this.cadenceEngine.parseInterval(
            process.env.NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS ?? process.env.NEO_SUMMARIZATION_SWEEP_INTERVAL_MS,
            DEFAULT_SUMMARY_SWEEP_INTERVAL_MS
        );
        this.kbSyncIntervalMs       = options.kbSyncIntervalMs ?? this.cadenceEngine.parseInterval(process.env.NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS, DEFAULT_KB_SYNC_INTERVAL_MS);
        this.kbSyncEnabled          = options.kbSyncEnabled ?? parseEnabledFlag(
            process.env.NEO_ORCHESTRATOR_KB_SYNC_ENABLED,
            true
        );
        this.backupIntervalMs       = options.backupIntervalMs ?? this.cadenceEngine.parseInterval(process.env.NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS, DEFAULT_BACKUP_INTERVAL_MS);
        this.primaryDevSyncIntervalMs = options.primaryDevSyncIntervalMs ?? this.cadenceEngine.parseInterval(process.env.NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS, DEFAULT_PRIMARY_DEV_SYNC_INTERVAL_MS);
        this.primaryDevSyncEnabled  = options.primaryDevSyncEnabled ?? parseEnabledFlag(
            process.env.NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED,
            true
        );
        this.bridgeDaemonEnabled    = options.bridgeDaemonEnabled ?? parseEnabledFlag(
            process.env.NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED,
            true
        );
        this.goldenPathRepoEnrichmentEnabled = options.goldenPathRepoEnrichmentEnabled ?? parseEnabledFlag(
            process.env.NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED,
            true
        );
        this.primaryDevSyncRootsConfig = options.primaryDevSyncRootsConfig ?? null;
        this.taskDefinitions        = options.taskDefinitions || buildTaskDefinitions({
            scriptDir,
            nodeBin   : options.nodeBin || process.argv[0],
            mlxEnabled: options.mlxEnabled ?? undefined,
            mlxModel  : options.mlxModel || undefined
        });
        this.healthService          = options.healthService          || HealthService;
        this.summarizationCoordinator = options.summarizationCoordinator || SummarizationCoordinatorService;
        this.backupCoordinator      = options.backupCoordinator      || BackupCoordinatorService;
        this.primaryRepoSyncService = options.primaryRepoSyncService || PrimaryRepoSyncService;
        this.heavyMaintenanceTaskNames = [...(options.heavyMaintenanceTaskNames || DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES)];
        this.goldenPathDependencyTaskNames = [...(options.goldenPathDependencyTaskNames || DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES)];
        this.maintenanceDeferralLogKeys = new Set();
        this.spawnFn                = options.spawnFn                || spawn;
        this.processSupervisorService = options.processSupervisorService || ProcessSupervisorService;
        this.initializeDatabaseFn   = options.initializeDatabaseFn   || initializeDatabase;
    }

    /**
     * Starts the orchestrator process loop after the wrapper has selected this process.
     * @param {Object} [options] Runtime overrides from the boot wrapper.
     * @returns {Promise<void>}
     */
    async start(options = {}) {
        if (this.isPolling) {
            this.writeLog('INFO', '[Orchestrator] Already polling; start() is a no-op.');
            return;
        }

        this.configure(options);

        fs.ensureDirSync(this.dataDir);
        this.taskStateService.configure({
            stateFile      : this.stateFile,
            taskDefinitions: this.taskDefinitions,
            writeLogFn     : this.writeLog.bind(this)
        });
        this.processSupervisorService.set({
            dataDir         : this.dataDir,
            taskDefinitions : this.taskDefinitions,
            taskStateService: this.taskStateService,
            healthService   : this.healthService,
            writeLog        : this.writeLog.bind(this),
            spawnFn         : this.spawnFn
        });

        this.processSupervisorService.recoverTasks();
        this.db = this.initializeDatabaseFn(this.dbPath);

        this.isPolling = true;
        this.writeLog('INFO', `[Orchestrator] Started. summaryInterval=${this.summarySweepIntervalMs}ms kbSyncInterval=${this.kbSyncIntervalMs}ms poll=${this.pollIntervalMs}ms.`);
        this.poll();
    }

    /**
     * Stops the polling loop.
     * @returns {void}
     */
    stop() {
        if (this.pollHandle) {
            clearTimeout(this.pollHandle);
            this.pollHandle = null;
        }

        this.isPolling = false;
    }

    /**
     * Appends a daemon log line to disk and mirrors it to stdout/stderr.
     * @param {String} level Log level.
     * @param {String} message Log message.
     * @returns {void}
     */
    writeLog(level, message) {
        const timestamp = new Date().toISOString();
        const line      = `[${timestamp}] [PID:${process.pid}] [${level}] ${message}`;

        try {
            if (this.logFile) {
                fs.appendFileSync(this.logFile, line + '\n', 'utf8');
            }
        } catch (e) {}

        if (level === 'ERROR') {
            console.error(line);
        } else {
            console.log(line);
        }
    }

    /**
     * Checks whether a task participates in cross-task maintenance backpressure.
     * @param {String} taskName Stable orchestrator task name.
     * @returns {Boolean}
     */
    isHeavyMaintenanceTask(taskName) {
        return this.heavyMaintenanceTaskNames.includes(taskName);
    }

    /**
     * Checks whether a running task should delay Golden Path frontier refresh.
     * @param {String} taskName Stable orchestrator task name.
     * @returns {Boolean}
     */
    isGoldenPathDependencyTask(taskName) {
        return this.goldenPathDependencyTaskNames.includes(taskName);
    }

    /**
     * Finds the first running heavy maintenance task.
     * @param {Object} [options]
     * @param {String|null} [options.excludeTaskName=null] Task name to ignore.
     * @returns {String|null}
     */
    findActiveHeavyMaintenanceTask({excludeTaskName = null} = {}) {
        for (const taskName of this.heavyMaintenanceTaskNames) {
            if (taskName === excludeTaskName) {
                continue;
            }

            if (this.taskStateService.getTaskState(taskName)?.running) {
                return taskName;
            }
        }

        return null;
    }

    /**
     * Finds a running task that would make Golden Path read partial graph state.
     * @param {Object} [options]
     * @param {String|null} [options.activeTaskName=null] Newly started task in the current poll.
     * @returns {String|null}
     */
    findActiveGoldenPathDependencyTask({activeTaskName = null} = {}) {
        if (activeTaskName && this.isGoldenPathDependencyTask(activeTaskName)) {
            return activeTaskName;
        }

        for (const taskName of this.goldenPathDependencyTaskNames) {
            if (this.taskStateService.getTaskState(taskName)?.running) {
                return taskName;
            }
        }

        return null;
    }

    /**
     * Clears dedupe keys for a task once it is no longer deferred.
     * @param {String} taskName Stable orchestrator task name.
     * @returns {void}
     */
    clearMaintenanceDeferralLogState(taskName) {
        if (!this.maintenanceDeferralLogKeys) {
            return;
        }

        const prefix = `${taskName}:`;

        for (const key of this.maintenanceDeferralLogKeys) {
            if (key.startsWith(prefix)) {
                this.maintenanceDeferralLogKeys.delete(key);
            }
        }
    }

    /**
     * Records a sparse non-error deferral when another heavy maintenance task is active.
     * @param {String} taskName Deferred task name.
     * @param {String} blockingTaskName Active heavy maintenance task name.
     * @param {String} reason Scheduling reason for the deferred task.
     * @returns {void}
     */
    recordMaintenanceDeferral(taskName, blockingTaskName, reason) {
        this.maintenanceDeferralLogKeys ??= new Set();

        const key = `${taskName}:${blockingTaskName}:${reason}`;

        if (!this.maintenanceDeferralLogKeys.has(key)) {
            const taskLabel     = this.taskDefinitions?.[taskName]?.label || taskName;
            const blockingLabel = this.taskDefinitions?.[blockingTaskName]?.label || blockingTaskName;

            this.writeLog('INFO', `[Orchestrator] Deferring ${taskLabel}; heavy maintenance task ${blockingLabel} is active (${reason}).`);
            this.maintenanceDeferralLogKeys.add(key);
        }

        this.healthService?.recordTaskOutcome?.(taskName, 'skipped', {
            reason,
            reasonCode     : 'heavy-maintenance-backpressure',
            blockingTaskName,
            deferredAt     : new Date().toISOString()
        });
    }

    /**
     * #11519: Records a non-error deferral when another orchestrator process holds
     * the shared heavy-maintenance lease (cross-daemon backpressure).
     *
     * Mirrors `recordMaintenanceDeferral` shape but distinguished by `reasonCode`
     * so operator dashboards + Memory Core graph ingestion can separate
     * intra-process backpressure (`heavy-maintenance-backpressure`) from
     * inter-process file-lease backpressure (`heavy-maintenance-lease-held`).
     *
     * @param {String} taskName Deferred task name.
     * @param {Object|null} holdingLease Lease payload of the active owner (token-stripped).
     * @param {String} reason Scheduling reason for the deferred task.
     * @returns {void}
     */
    recordCrossDaemonLeaseDeferral(taskName, holdingLease, reason) {
        this.maintenanceDeferralLogKeys ??= new Set();

        const holderOwner = holdingLease?.owner || 'unknown';
        const key         = `${taskName}:lease-held-by-${holderOwner}:${reason}`;

        if (!this.maintenanceDeferralLogKeys.has(key)) {
            const taskLabel = this.taskDefinitions?.[taskName]?.label || taskName;

            this.writeLog('INFO', `[Orchestrator] Deferring ${taskLabel}; cross-daemon heavy-maintenance lease held by ${holderOwner} (${reason}).`);
            this.maintenanceDeferralLogKeys.add(key);
        }

        this.healthService?.recordTaskOutcome?.(taskName, 'skipped', {
            reason,
            reasonCode  : 'heavy-maintenance-lease-held',
            holdingOwner: holderOwner,
            holdingPid  : holdingLease?.pid,
            deferredAt  : new Date().toISOString()
        });
    }

    /**
     * Records a sparse Golden Path deferral when graph-mutating dependencies are active.
     * @param {String} blockingTaskName Active dependency task name.
     * @param {String} reason Scheduling reason for the Golden Path task.
     * @returns {void}
     */
    recordGoldenPathDependencyDeferral(blockingTaskName, reason) {
        this.maintenanceDeferralLogKeys ??= new Set();

        const key = `${GOLDEN_PATH_TASK_NAME}:${blockingTaskName}:${reason}`;

        if (!this.maintenanceDeferralLogKeys.has(key)) {
            const taskLabel     = this.taskDefinitions?.[GOLDEN_PATH_TASK_NAME]?.label || GOLDEN_PATH_TASK_NAME;
            const blockingLabel = this.taskDefinitions?.[blockingTaskName]?.label || blockingTaskName;

            this.writeLog('INFO', `[Orchestrator] Deferring ${taskLabel}; dependency task ${blockingLabel} is active (${reason}).`);
            this.maintenanceDeferralLogKeys.add(key);
        }

        this.healthService?.recordTaskOutcome?.(GOLDEN_PATH_TASK_NAME, 'skipped', {
            reason,
            reasonCode     : 'golden-path-dependency-backpressure',
            blockingTaskName,
            deferredAt     : new Date().toISOString()
        });
    }

    /**
     * #11519: Resolves the shared heavy-maintenance lease file path with multi-tier
     * fallback. Defensive at use-site rather than configure-time so direct
     * `poll()` callers (unit tests bypass `start()`/`configure()`) inherit a
     * dataDir-scoped path instead of accidentally writing to the canonical
     * production lease at `DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH`. Empirical
     * anchor: pre-fix iteration of this PR contaminated `.neo-ai-data/orchestrator-daemon/heavy-maintenance-lease.json`
     * during a test run — the operator's live orchestrator process would have
     * deferred heavy tasks against a stale-but-active-TTL lease until 6h
     * expiry without this fallback.
     *
     * @returns {String}
     */
    resolveHeavyMaintenanceLeasePath() {
        if (this.heavyMaintenanceLeasePath) {
            return this.heavyMaintenanceLeasePath;
        }
        return path.join(this.dataDir || DEFAULT_DATA_DIR, 'heavy-maintenance-lease.json');
    }

    /**
     * Wraps a task executor with cross-task heavy-maintenance backpressure.
     *
     * **Two-tier backpressure (intra-process + inter-process):**
     * 1. **Intra-process** (existing): in-process `activeHeavyTask` tracker
     *    serializes heavy tasks within a single orchestrator poll cycle.
     * 2. **Inter-process** (#11519 cross-daemon): shared file lease at
     *    `heavyMaintenanceLeasePath` serializes heavy tasks across
     *    concurrent orchestrator daemons (operator-restart-overlap, dev vs prod
     *    daemon sets, manual CLI scripts running alongside).
     *
     * **Lease lifecycle:**
     * - Acquire BEFORE executing heavy task; `held` status → defer with
     *   `reasonCode: 'heavy-maintenance-lease-held'`.
     * - On acquisition, inject `NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN`
     *   env into the spawned child + register an `onComplete` release hook
     *   on `ProcessSupervisorService.runTask` so the lease releases when the
     *   child closes (success or failure).
     * - Lease-release coordination by executor return shape:
     *   - `true`: child-spawned task — lease releases via `onComplete` callback.
     *   - `false`: spawn failed / task skipped — release immediately.
     *   - `Promise`: in-process async executor — release on Promise settle.
     *   - Other truthy: sync-complete executor — release immediately after return.
     *
     * **Why the env-var inheritance contract matters:** the primary-dev-sync
     * task cascades a `kbSync` child (via `PrimaryRepoSyncService.runKbSync`).
     * Without inheritance, the cascade would see its parent's own lease and
     * defer with `held` — self-defer bug. The inherited-token env-var lets
     * `withHeavyMaintenanceLease` recognize the parent's lease and run the
     * cascade task without acquire/release.
     *
     * @param {Function} executeFn Task executor; receives `(taskName, reason, onSuccess, options)`.
     * @param {Object} activeHeavyTask Mutable active-heavy tracker for the current poll.
     * @returns {Function}
     */
    createMaintenanceExecutor(executeFn, activeHeavyTask) {
        return (taskName, reason, onSuccess) => {
            const reasonText = reason || 'scheduled';

            if (this.isHeavyMaintenanceTask(taskName)) {
                const blockingTaskName = activeHeavyTask.name && activeHeavyTask.name !== taskName
                    ? activeHeavyTask.name
                    : this.findActiveHeavyMaintenanceTask({excludeTaskName: taskName});

                if (blockingTaskName) {
                    this.recordMaintenanceDeferral(taskName, blockingTaskName, reasonText);
                    return false;
                }

                let acquisition;
                try {
                    acquisition = acquireHeavyMaintenanceLeaseSync({
                        owner    : taskName,
                        reason   : reasonText,
                        metadata : {source: 'orchestrator'},
                        leasePath: this.resolveHeavyMaintenanceLeasePath()
                    });
                } catch (e) {
                    this.writeLog('ERROR', `[Orchestrator] Heavy-maintenance lease acquire failed for ${taskName}: ${e.message}`);
                    this.healthService?.recordTaskOutcome?.(taskName, 'failed', {
                        reason     : reasonText,
                        reasonCode : 'heavy-maintenance-lease-acquire-error',
                        error      : e.message,
                        failedAt   : new Date().toISOString()
                    });
                    return false;
                }

                if (!acquisition.acquired) {
                    this.recordCrossDaemonLeaseDeferral(taskName, acquisition.lease, reasonText);
                    return false;
                }

                this.clearMaintenanceDeferralLogState(taskName);

                const releaseLease = () => {
                    try {
                        releaseHeavyMaintenanceLeaseSync({
                            token    : acquisition.lease.token,
                            leasePath: this.resolveHeavyMaintenanceLeasePath()
                        });
                    } catch (e) {
                        this.writeLog('ERROR', `[Orchestrator] Heavy-maintenance lease release failed for ${taskName}: ${e.message}`);
                    }
                };

                const taskOptions = {
                    env       : {NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN: acquisition.lease.token},
                    onComplete: releaseLease
                };

                let result;
                try {
                    result = executeFn(taskName, reason, onSuccess, taskOptions);
                } catch (e) {
                    releaseLease();
                    throw e;
                }

                // Lease-release coordination by executor return shape:
                //  - `true`        → child-spawned; release via `options.onComplete` callback
                //  - `false`       → spawn-fail/skip; release immediately
                //  - Promise       → in-process async (dream); release on settle
                //  - other truthy  → sync-complete (primaryRepoSyncService); release immediately
                if (result === false) {
                    releaseLease();
                } else if (result && typeof result.then === 'function') {
                    result.then(releaseLease, releaseLease);
                } else if (result !== true) {
                    releaseLease();
                }

                if (result !== false) {
                    activeHeavyTask.name = taskName;
                }

                return result;
            }

            this.clearMaintenanceDeferralLogState(taskName);

            return executeFn(taskName, reason, onSuccess);
        };
    }

    /**
     * Wraps Golden Path execution with dependency ordering without making it a heavyweight blocker.
     * @param {Function} executeFn Task executor.
     * @param {Object} activeHeavyTask Mutable active-heavy tracker for the current poll.
     * @returns {Function}
     */
    createGoldenPathExecutor(executeFn, activeHeavyTask) {
        return (taskName, reason) => {
            const reasonText = reason || 'scheduled';
            const blockingTaskName = this.findActiveGoldenPathDependencyTask({
                activeTaskName: activeHeavyTask.name
            });

            if (blockingTaskName) {
                this.recordGoldenPathDependencyDeferral(blockingTaskName, reasonText);
                return false;
            }

            this.clearMaintenanceDeferralLogState(taskName);

            return executeFn(taskName, reason);
        };
    }




    /**
     * Executes a sweep and schedules the next poll when the daemon remains active.
     * @returns {void}
     */
    poll() {
        const now = Date.now();
        const executeTask = this.processSupervisorService.runTask.bind(this.processSupervisorService);
        const context = {
            writeLog     : this.writeLog.bind(this),
            healthService: this.healthService
        };

        const continuousTasks = [
            'chroma',
            ...(this.bridgeDaemonEnabled ? ['bridgeDaemon'] : []),
            'mlx'
        ];
        const RESTART_COOLDOWN_MS = 15000;
        for (const taskName of continuousTasks) {
            const state = this.taskStateService.getTaskState(taskName);
            if (state && !state.running) {
                const lastRunAt = state.lastRunAt || 0;
                if (now - lastRunAt > RESTART_COOLDOWN_MS) {
                    executeTask(taskName, 'supervisor-restart');
                }
            }
        }

        const activeHeavyTask = {name: this.findActiveHeavyMaintenanceTask()};
        const executeMaintenanceTask = executeFn => this.createMaintenanceExecutor(executeFn, activeHeavyTask);

        this.cadenceEngine.runIfDue('summary', () => {
            return this.summarizationCoordinator.getDueTask({
                db                    : this.db,
                state                 : this.taskStateService.getState(),
                now,
                summarySweepIntervalMs: this.summarySweepIntervalMs,
                log                   : this.writeLog.bind(this)
            });
        }, executeMaintenanceTask(executeTask), context);

        this.cadenceEngine.runIfDue('kbSync', () => {
            if (!this.kbSyncEnabled) {
                return null;
            }

            if (this.cadenceEngine.shouldRunIntervalTask({
                now,
                lastRunAt : this.taskStateService.getTaskState('kbSync').lastRunAt,
                intervalMs: this.kbSyncIntervalMs
            })) {
                return { reason: `periodic-sync:${this.kbSyncIntervalMs}` };
            }
            return null;
        }, executeMaintenanceTask(executeTask), context);

        // #11513 (Lane A of #11503): wrap backup execution with the heavy-maintenance
        // executor so a due backup defers when ANY other heavy task is active. Adding
        // `'backup'` to `DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES` makes backup recognized
        // as a heavy *blocker* (via `findActiveHeavyMaintenanceTask`), but the deferral
        // check on the *candidate* side only runs through `createMaintenanceExecutor`.
        // Sibling tasks (summary at line 675, kbSync at 686, primary-dev-sync at 718,
        // dream at 742) all route through `executeMaintenanceTask`; backup must too.
        this.cadenceEngine.runIfDue('backup', () => {
            return this.backupCoordinator.getDueTask({
                state           : this.taskStateService.getState(),
                now,
                backupIntervalMs: this.backupIntervalMs
            });
        }, executeMaintenanceTask(executeTask), context);

        this.cadenceEngine.runIfDue(PRIMARY_DEV_SYNC_TASK_NAME, () => {
            return this.primaryRepoSyncService.getDueTask({
                state     : this.taskStateService.getState(),
                now,
                intervalMs: this.primaryDevSyncIntervalMs,
                enabled   : this.primaryDevSyncEnabled
            });
        }, executeMaintenanceTask((taskName, reason) => {
            return this.primaryRepoSyncService.runTask({
                taskName,
                reason,
                taskStateService  : this.taskStateService,
                healthService     : this.healthService,
                writeLog          : this.writeLog.bind(this),
                devSyncRootsConfig: resolvePrimaryDevSyncRootsConfig({
                    envValue   : process.env[DEV_SYNC_ROOTS_ENV_VAR],
                    configValue: this.primaryDevSyncRootsConfig
                }),
                devSyncRootsSource: resolvePrimaryDevSyncRootsSource({
                    envValue: process.env[DEV_SYNC_ROOTS_ENV_VAR]
                })
            });
        }), context);

        this.cadenceEngine.runIfDue(DREAM_TASK_NAME, () => {
            if (this.cadenceEngine.shouldRunIntervalTask({
                now,
                lastRunAt : this.taskStateService.getTaskState(DREAM_TASK_NAME)?.lastRunAt,
                intervalMs: this.dreamIntervalMs
            })) {
                return { reason: `periodic-dream:${this.dreamIntervalMs}` };
            }
            return null;
        }, executeMaintenanceTask(async (taskName, reason) => {
            this.taskStateService.markStarted(taskName, reason.reason);
            this.healthService?.recordTaskOutcome?.(taskName, 'running', { reason, startedAt: new Date().toISOString() });
            try {
                await this.dreamService.processUndigestedSessions();
                this.taskStateService.markCompleted(taskName);
                this.healthService?.recordTaskOutcome?.(taskName, 'completed', { reason, completedAt: new Date().toISOString() });
            } catch (e) {
                const state = this.taskStateService.getTaskState(taskName);
                if (state) state.lastReason = e.message;
                this.taskStateService.markFailed(taskName, 1);
                this.healthService?.recordTaskOutcome?.(taskName, 'failed', { reason, error: e.message, failedAt: new Date().toISOString() });
            }
        }), context);

        this.cadenceEngine.runIfDue(GOLDEN_PATH_TASK_NAME, () => {
            if (this.cadenceEngine.shouldRunIntervalTask({
                now,
                lastRunAt : this.taskStateService.getTaskState(GOLDEN_PATH_TASK_NAME)?.lastRunAt,
                intervalMs: this.goldenPathIntervalMs
            })) {
                return { reason: `periodic-golden-path:${this.goldenPathIntervalMs}` };
            }
            return null;
        }, this.createGoldenPathExecutor(async (taskName, reason) => {
            this.taskStateService.markStarted(taskName, reason.reason);
            this.healthService?.recordTaskOutcome?.(taskName, 'running', { reason, startedAt: new Date().toISOString() });
            try {
                await this.goldenPathSynthesizer.synthesizeGoldenPath({
                    repoEnrichmentEnabled: this.goldenPathRepoEnrichmentEnabled
                });
                this.taskStateService.markCompleted(taskName);
                this.healthService?.recordTaskOutcome?.(taskName, 'completed', { reason, completedAt: new Date().toISOString() });
            } catch (e) {
                const state = this.taskStateService.getTaskState(taskName);
                if (state) state.lastReason = e.message;
                this.taskStateService.markFailed(taskName, 1);
                this.healthService?.recordTaskOutcome?.(taskName, 'failed', { reason, error: e.message, failedAt: new Date().toISOString() });
            }
        }, activeHeavyTask), context);

        if (this.isPolling) {
            this.pollHandle = setTimeout(() => this.poll(), this.pollIntervalMs);
        }
    }
}

export default Neo.setupClass(Orchestrator);
