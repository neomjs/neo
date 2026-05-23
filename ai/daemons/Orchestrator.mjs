// Neo + core/_export + InstanceManager bootstrap belongs to the daemon entry point
// (`ai/scripts/orchestrator-daemon.mjs`), NOT to this consumed-class file. Class files
// rely on `globalThis.Neo` populated by the entry-point bootstrap; importing Neo here
// would violate the entry-point-only invariant + risk partial-namespace damage if the
// class were ever loaded outside its entry-point's chain.
import fs                          from 'fs-extra';
import {spawn}                     from 'child_process';
import path                        from 'path';
import Base                        from '../../src/core/Base.mjs';
import ClassSystemUtil             from '../../src/util/ClassSystem.mjs';
import Env                         from '../../src/util/Env.mjs';
import AiConfig                    from '../config.template.mjs';
import HealthService               from '../services/memory-core/HealthService.mjs';
import {
    initializeDatabase
} from '../scripts/bridge-daemon-queries.mjs';
import SummarizationCoordinatorService from './services/SummarizationCoordinatorService.mjs';
import BackupCoordinatorService        from './services/BackupCoordinatorService.mjs';
import {
    acquireHeavyMaintenanceLeaseSync,
    releaseHeavyMaintenanceLeaseSync
} from './services/HeavyMaintenanceLeaseService.mjs';
import PrimaryRepoSyncService, {
    DEV_SYNC_ROOTS_CONFIG_KEY,
    DEV_SYNC_ROOTS_ENV_VAR
} from './services/PrimaryRepoSyncService.mjs';
import TaskStateService                  from './services/TaskStateService.mjs';
import ProcessSupervisorService          from './services/ProcessSupervisorService.mjs';
import CadenceEngine                     from './services/CadenceEngine.mjs';
import DreamService                      from './DreamService.mjs';
import SwarmHeartbeatService             from './SwarmHeartbeatService.mjs';
import GoldenPathSynthesizer             from './services/GoldenPathSynthesizer.mjs';
import {
    PRIMARY_DEV_SYNC_TASK_NAME,
    DREAM_TASK_NAME,
    GOLDEN_PATH_TASK_NAME,
    SWARM_HEARTBEAT_TASK_NAME,
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
    if (!Neo.isEmpty(envValue)) {
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
    if (!Neo.isEmpty(envValue)) {
        return DEV_SYNC_ROOTS_ENV_VAR;
    }

    return DEV_SYNC_ROOTS_CONFIG_KEY;
}

/**
 * Resolves a deployment-aware boolean toggle from `AiConfig.orchestrator.localOnly[key]`.
 * `null` in localOnly means "use the deployment-profile default" (local = enabled,
 * cloud = disabled); explicit `true`/`false` overrides.
 *
 * @param {String} key
 * @returns {Boolean}
 */
function resolveDeploymentEnabled(key) {
    const cfg = AiConfig.orchestrator.localOnly[key];
    if (cfg !== null) return cfg;
    return AiConfig.orchestrator.deploymentMode !== 'cloud';
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
 * **Service-DI 4-way classification (#11833 / Epic #11831):**
 * - **(A) Class-system-managed utility collaborator** — `cadenceEngine_` reactive
 *   config with `beforeSet` + `ClassSystemUtil.beforeSetInstance` for polymorphic
 *   class/instance/config-object input and proper lifecycle on swap.
 * - **(B) Parent-configured child collaborator** — `processSupervisorService_`
 *   reactive config with `beforeSet` creation from parent-sourced config + parent
 *   `afterSet*` propagation hooks for `dataDir`/`taskDefinitions`/`taskStateService`/
 *   `healthService`/`spawnFn` so subsequent parent mutations flow to the child.
 * - **(C) Simple imported collaborator** — direct-import instance fields
 *   (`summarizationCoordinator`, `backupCoordinator`, etc.) — no class-system
 *   conversion, no parent-child propagation, no lifecycle side effect.
 * - **(D) Operator policy value** — lazy getters with the 2-value chain
 *   `Env.parseNumber(process.env.X, 'X') ?? AiConfig.orchestrator.intervals.X`
 *   for intervals + `Env.parseBool(...) ?? resolveDeploymentEnabled(...)` for booleans.
 *
 * No `configure()` shadow-resolver. No `DEFAULT_X_*_MS` constants. No
 * `parseInterval`/`parseEnabledFlag` helpers. No `processSupervisorService.set({...this...})`
 * context-replay block in `start()`.
 *
 * @class Neo.ai.daemons.Orchestrator
 * @extends Neo.core.Base
 * @singleton
 * @see ai/scripts/orchestrator-daemon.mjs
 * @see ai/daemons/services/SummarizationCoordinatorService.mjs
 * @see ai/services/memory-core/HealthService.mjs#recordTaskOutcome
 * @see learn/agentos/v13-path.md
 * @see #11009
 * @see #11833 (masterclass-reference refactor)
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

        // === Service-DI Class A: class-system-managed utility collaborator ===
        /**
         * @member {Neo.ai.daemons.services.CadenceEngine|Object|null} cadenceEngine_=null
         * @reactive
         */
        cadenceEngine_: null,

        // === Service-DI Class B: parent-configured child collaborator + propagated parent props ===
        /**
         * @member {Neo.ai.daemons.services.ProcessSupervisorService|Object|null} processSupervisorService_=null
         * @reactive
         */
        processSupervisorService_: null,
        /**
         * @member {String} dataDir_=DEFAULT_DATA_DIR
         * @reactive
         */
        dataDir_: DEFAULT_DATA_DIR,
        /**
         * @member {Object|null} taskDefinitions_=null
         * @reactive
         */
        taskDefinitions_: null,
        /**
         * @member {Object} taskStateService_=TaskStateService
         * @reactive
         */
        taskStateService_: TaskStateService,
        /**
         * @member {Object} healthService_=HealthService
         * @reactive
         */
        healthService_: HealthService,
        /**
         * @member {Function} spawnFn_=spawn
         * @reactive
         */
        spawnFn_: spawn
    }

    // === Service-DI Class C: simple imported collaborators (instance fields) ===
    summarizationCoordinator = SummarizationCoordinatorService
    backupCoordinator        = BackupCoordinatorService
    primaryRepoSyncService   = PrimaryRepoSyncService
    dreamService             = DreamService
    swarmHeartbeatService    = SwarmHeartbeatService
    goldenPathSynthesizer    = GoldenPathSynthesizer
    initializeDatabaseFn     = initializeDatabase

    // === Instance state (mutated at runtime; non-reactive) ===
    isPolling                     = false
    pollHandle                    = null
    db                            = null
    dbPath                        = DEFAULT_DB_PATH
    logFile                       = null
    stateFile                     = null
    heavyMaintenanceLeasePath     = null
    primaryDevSyncRootsConfig     = null
    maintenanceDeferralLogKeys    = null
    heavyMaintenanceTaskNames     = DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES
    goldenPathDependencyTaskNames = DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES

    /**
     * Stable logger seam for the processSupervisorService writeLog config slot.
     * Avoids per-call `.bind(this)` allocation drift.
     * @member {Function} processSupervisorWriteLog
     */
    processSupervisorWriteLog = (level, msg) => this.writeLog(level, msg)

    // === Service-DI Class A: cadenceEngine beforeSet (polymorphic class/instance/config input) ===
    /**
     * @param {Neo.ai.daemons.services.CadenceEngine|Object|null} value
     * @param {Neo.ai.daemons.services.CadenceEngine|null} oldValue
     * @returns {Neo.ai.daemons.services.CadenceEngine}
     */
    beforeSetCadenceEngine(value, oldValue) {
        oldValue?.destroy?.();
        return ClassSystemUtil.beforeSetInstance(value, CadenceEngine, {});
    }

    // === Service-DI Class B: processSupervisorService beforeSet + parent afterSet propagation ===
    /**
     * @param {Neo.ai.daemons.services.ProcessSupervisorService|Object|null} value
     * @returns {Neo.ai.daemons.services.ProcessSupervisorService}
     */
    beforeSetProcessSupervisorService(value) {
        return ClassSystemUtil.beforeSetInstance(value, ProcessSupervisorService, {
            dataDir         : this.dataDir,
            taskDefinitions : this.taskDefinitions,
            taskStateService: this.taskStateService,
            healthService   : this.healthService,
            writeLog        : this.processSupervisorWriteLog,
            spawnFn         : this.spawnFn
        });
    }

    afterSetDataDir(value) {
        if (this.processSupervisorService) this.processSupervisorService.dataDir = value;
    }
    afterSetTaskDefinitions(value) {
        if (this.processSupervisorService) this.processSupervisorService.taskDefinitions = value;
    }
    afterSetTaskStateService(value) {
        if (this.processSupervisorService) this.processSupervisorService.taskStateService = value;
    }
    afterSetHealthService(value) {
        if (this.processSupervisorService) this.processSupervisorService.healthService = value;
    }
    afterSetSpawnFn(value) {
        if (this.processSupervisorService) this.processSupervisorService.spawnFn = value;
    }

    // === Service-DI Class D: operator policy values (lazy getters, 2-value chain) ===
    get pollIntervalMs() {
        return Env.parseNumber(process.env.NEO_ORCHESTRATOR_POLL_INTERVAL_MS, 'NEO_ORCHESTRATOR_POLL_INTERVAL_MS')
            ?? AiConfig.orchestrator.intervals.pollMs;
    }
    get summarySweepIntervalMs() {
        return Env.parseNumber(process.env.NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS, 'NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS')
            ?? AiConfig.orchestrator.intervals.summarySweepMs;
    }
    get kbSyncIntervalMs() {
        return Env.parseNumber(process.env.NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS, 'NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS')
            ?? AiConfig.orchestrator.intervals.kbSyncMs;
    }
    get backupIntervalMs() {
        return Env.parseNumber(process.env.NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS, 'NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS')
            ?? AiConfig.orchestrator.intervals.backupMs;
    }
    get primaryDevSyncIntervalMs() {
        return Env.parseNumber(process.env.NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS, 'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS')
            ?? AiConfig.orchestrator.intervals.primaryDevSyncMs;
    }
    get dreamIntervalMs() {
        return Env.parseNumber(process.env.NEO_ORCHESTRATOR_DREAM_INTERVAL_MS, 'NEO_ORCHESTRATOR_DREAM_INTERVAL_MS')
            ?? AiConfig.orchestrator.intervals.dreamMs;
    }
    get goldenPathIntervalMs() {
        return Env.parseNumber(process.env.NEO_ORCHESTRATOR_GOLDEN_PATH_INTERVAL_MS, 'NEO_ORCHESTRATOR_GOLDEN_PATH_INTERVAL_MS')
            ?? AiConfig.orchestrator.intervals.goldenPathMs;
    }
    get swarmHeartbeatIntervalMs() {
        return Env.parseNumber(process.env.NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS')
            ?? AiConfig.orchestrator.intervals.swarmHeartbeatMs;
    }
    get kbSyncEnabled() {
        return Env.parseBool(process.env.NEO_ORCHESTRATOR_KB_SYNC_ENABLED, 'NEO_ORCHESTRATOR_KB_SYNC_ENABLED')
            ?? resolveDeploymentEnabled('kbSyncEnabled');
    }
    get primaryDevSyncEnabled() {
        return Env.parseBool(process.env.NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED, 'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED')
            ?? resolveDeploymentEnabled('primaryDevSyncEnabled');
    }
    get bridgeDaemonEnabled() {
        return Env.parseBool(process.env.NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED, 'NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED')
            ?? resolveDeploymentEnabled('bridgeDaemonEnabled');
    }
    get swarmHeartbeatEnabled() {
        return Env.parseBool(process.env.NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED, 'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED')
            ?? resolveDeploymentEnabled('swarmHeartbeatEnabled');
    }
    get goldenPathRepoEnrichmentEnabled() {
        return Env.parseBool(process.env.NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED, 'NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED')
            ?? resolveDeploymentEnabled('goldenPathRepoEnrichmentEnabled');
    }

    /**
     * Starts the orchestrator process loop after the wrapper has selected this process.
     * @param {Object} [options] Boot-wrapper paths + harness/process seams.
     * @param {String} [options.scriptDir]
     * @param {String} [options.dataDir]
     * @param {String} [options.dbPath]
     * @param {String} [options.logFile]
     * @param {String} [options.stateFile]
     * @param {String} [options.heavyMaintenanceLeasePath]
     * @param {Object} [options.taskDefinitions] Pre-built task definitions (test-injection).
     * @param {String} [options.nodeBin]
     * @param {Boolean} [options.mlxEnabled]
     * @param {String}  [options.mlxModel]
     * @param {String[]|String|null} [options.primaryDevSyncRootsConfig]
     * @returns {Promise<void>}
     */
    async start(options = {}) {
        if (this.isPolling) {
            this.writeLog('INFO', '[Orchestrator] Already polling; start() is a no-op.');
            return;
        }

        const scriptDir = options.scriptDir || DEFAULT_SCRIPT_DIR;
        const dataDir   = options.dataDir   || DEFAULT_DATA_DIR;

        // Set reactive parent props FIRST so afterSet* propagation lands when
        // processSupervisorService gets re-created below.
        this.dataDir         = dataDir;
        this.taskDefinitions = options.taskDefinitions || buildTaskDefinitions({
            scriptDir,
            nodeBin   : options.nodeBin || process.argv[0],
            mlxEnabled: options.mlxEnabled ?? undefined,
            mlxModel  : options.mlxModel || undefined
        });

        // Non-reactive boot-wrapper-provided instance state
        this.dbPath                    = options.dbPath   || DEFAULT_DB_PATH;
        this.logFile                   = options.logFile  || path.join(dataDir, 'orchestrator.log');
        this.stateFile                 = options.stateFile || path.join(dataDir, 'orchestrator-state.json');
        this.heavyMaintenanceLeasePath = options.heavyMaintenanceLeasePath ?? this.heavyMaintenanceLeasePath;
        this.primaryDevSyncRootsConfig = options.primaryDevSyncRootsConfig ?? null;
        this.maintenanceDeferralLogKeys = new Set();

        fs.ensureDirSync(this.dataDir);

        this.taskStateService.configure({
            stateFile      : this.stateFile,
            taskDefinitions: this.taskDefinitions,
            writeLogFn     : this.writeLog.bind(this)
        });

        // Trigger processSupervisorService creation via reactive setter (beforeSet reads
        // current parent state). The static-config-block `processSupervisorService_: null`
        // does pre-create at construct time with default parent state; this re-creates
        // with the now-correct options-derived state. After this point, parent mutations
        // flow through afterSet* propagation hooks.
        this.processSupervisorService = {};
        this.processSupervisorService.recoverTasks();

        this.db = this.initializeDatabaseFn(this.dbPath);

        // One-time swarm-heartbeat lane init (#11766). An init failure must log but
        // NOT crash the Orchestrator — the lane disables itself for this run.
        if (this.swarmHeartbeatEnabled) {
            try {
                await this.swarmHeartbeatService.initAsync({pollIntervalMs: this.swarmHeartbeatIntervalMs});
            } catch (e) {
                this.writeLog('ERROR', `[Orchestrator] Swarm heartbeat init failed; lane disabled this run: ${e.message}`);
                // Force-disable for this run by stashing in env; getter will re-read.
                process.env.NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED = 'false';
            }
        }

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
     * `poll()` callers (unit tests bypass `start()`) inherit a dataDir-scoped path
     * instead of accidentally writing to the canonical production lease.
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

        // #11766: swarm-heartbeat lane. NOT heavy maintenance — the pulse is a light
        // wake-substrate check, so the executor runs directly (no `executeMaintenanceTask`
        // wrap). `reason` is passed as a string straight from `CadenceEngine.runIfDue`.
        this.cadenceEngine.runIfDue(SWARM_HEARTBEAT_TASK_NAME, () => {
            if (!this.swarmHeartbeatEnabled) {
                return null;
            }
            if (this.cadenceEngine.shouldRunIntervalTask({
                now,
                lastRunAt : this.taskStateService.getTaskState(SWARM_HEARTBEAT_TASK_NAME)?.lastRunAt,
                intervalMs: this.swarmHeartbeatIntervalMs
            })) {
                return { reason: `periodic-heartbeat:${this.swarmHeartbeatIntervalMs}` };
            }
            return null;
        }, async (taskName, reason) => {
            this.taskStateService.markStarted(taskName, reason);
            this.healthService?.recordTaskOutcome?.(taskName, 'running', { reason, startedAt: new Date().toISOString() });
            try {
                await this.swarmHeartbeatService.pulse();
                this.taskStateService.markCompleted(taskName);
                this.healthService?.recordTaskOutcome?.(taskName, 'completed', { reason, completedAt: new Date().toISOString() });
            } catch (e) {
                const state = this.taskStateService.getTaskState(taskName);
                if (state) state.lastReason = e.message;
                this.taskStateService.markFailed(taskName, 1);
                this.healthService?.recordTaskOutcome?.(taskName, 'failed', { reason, error: e.message, failedAt: new Date().toISOString() });
            }
        }, context);

        if (this.isPolling) {
            this.pollHandle = setTimeout(() => this.poll(), this.pollIntervalMs);
        }
    }
}

export default Neo.setupClass(Orchestrator);
