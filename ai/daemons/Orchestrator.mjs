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

export const DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES = Object.freeze([
    'summary',
    'kbSync',
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
        this.cadenceEngine          = options.cadenceEngine          || CadenceEngine;
        this.pollIntervalMs         = options.pollIntervalMs ?? this.cadenceEngine.parseInterval(process.env.NEO_ORCHESTRATOR_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS);
        this.summarySweepIntervalMs = options.summarySweepIntervalMs ?? this.cadenceEngine.parseInterval(
            process.env.NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS ?? process.env.NEO_SUMMARIZATION_SWEEP_INTERVAL_MS,
            DEFAULT_SUMMARY_SWEEP_INTERVAL_MS
        );
        this.kbSyncIntervalMs       = options.kbSyncIntervalMs ?? this.cadenceEngine.parseInterval(process.env.NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS, DEFAULT_KB_SYNC_INTERVAL_MS);
        this.backupIntervalMs       = options.backupIntervalMs ?? this.cadenceEngine.parseInterval(process.env.NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS, DEFAULT_BACKUP_INTERVAL_MS);
        this.primaryDevSyncIntervalMs = options.primaryDevSyncIntervalMs ?? this.cadenceEngine.parseInterval(process.env.NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS, DEFAULT_PRIMARY_DEV_SYNC_INTERVAL_MS);
        this.primaryDevSyncEnabled  = options.primaryDevSyncEnabled ?? parseEnabledFlag(
            process.env.NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED,
            true
        );
        this.primaryDevSyncRootsConfig = options.primaryDevSyncRootsConfig ?? null;
        this.taskDefinitions        = options.taskDefinitions || buildTaskDefinitions({
            scriptDir,
            nodeBin: options.nodeBin || process.argv[0]
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
     * Wraps a task executor with cross-task heavy-maintenance backpressure.
     * @param {Function} executeFn Task executor.
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
            }

            this.clearMaintenanceDeferralLogState(taskName);

            const result = executeFn(taskName, reason, onSuccess);

            if (this.isHeavyMaintenanceTask(taskName) && result !== false) {
                activeHeavyTask.name = taskName;
            }

            return result;
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

        const continuousTasks = ['chroma', 'bridgeDaemon', 'mlx'];
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
            if (this.cadenceEngine.shouldRunIntervalTask({
                now,
                lastRunAt : this.taskStateService.getTaskState('kbSync').lastRunAt,
                intervalMs: this.kbSyncIntervalMs
            })) {
                return { reason: `periodic-sync:${this.kbSyncIntervalMs}` };
            }
            return null;
        }, executeMaintenanceTask(executeTask), context);

        this.cadenceEngine.runIfDue('backup', () => {
            return this.backupCoordinator.getDueTask({
                state           : this.taskStateService.getState(),
                now,
                backupIntervalMs: this.backupIntervalMs
            });
        }, executeTask, context);

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
                await this.goldenPathSynthesizer.synthesizeGoldenPath();
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
