// Neo + core/_export + InstanceManager bootstrap belongs to the daemon entry point
// (`ai/scripts/orchestrator-daemon.mjs`), NOT to this consumed-class file. Class files
// rely on `globalThis.Neo` populated by the entry-point bootstrap; importing Neo here
// would violate the entry-point-only invariant + risk partial-namespace damage if the
// class were ever loaded outside its entry-point's chain.
import fs                          from 'fs-extra';
import {spawn}                     from 'child_process';
import path                        from 'path';
import Base                        from '../../../src/core/Base.mjs';
import ClassSystemUtil             from '../../../src/util/ClassSystem.mjs';
import Env                         from '../../../src/util/Env.mjs';
import AiConfig                    from '../../config.template.mjs';
import HealthService               from '../../services/memory-core/HealthService.mjs';
import {
    initializeDatabase
} from '../bridge/queries.mjs';
import MaintenanceBackpressureService, {
    DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
    DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES
} from './services/MaintenanceBackpressureService.mjs';
import PrimaryRepoSyncService, {
    DEV_SYNC_ROOTS_CONFIG_KEY,
    DEV_SYNC_ROOTS_ENV_VAR
} from './services/PrimaryRepoSyncService.mjs';
import TenantRepoSyncService             from './services/TenantRepoSyncService.mjs';
import {getDueTask as summaryGetDueTaskImport}        from './scheduling/summary.mjs';
import {getDueTask as backupGetDueTaskImport}         from './scheduling/backup.mjs';
import {getDueTask as primaryDevSyncGetDueTaskImport} from './scheduling/primaryDevSync.mjs';
import TaskStateService                  from './services/TaskStateService.mjs';
import ProcessSupervisorService          from './services/ProcessSupervisorService.mjs';
import CadenceEngine                     from './services/CadenceEngine.mjs';
import DreamService                      from './services/DreamService.mjs';
import SwarmHeartbeatService             from './services/SwarmHeartbeatService.mjs';
import GoldenPathSynthesizer             from '../../services/graph/GoldenPathSynthesizer.mjs';
import {getDueTask as tenantRepoSyncGetDueTaskImport} from './scheduling/tenantRepoSync.mjs';
import {
    DEFAULT_DB_PATH,
    DEFAULT_DATA_DIR,
    DEFAULT_SCRIPT_DIR,
    buildTaskDefinitions
} from './TaskDefinitions.mjs';

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
 * Resolves a cloud-deployment-aware boolean toggle from `AiConfig.orchestrator.cloudOnly[key]`.
 * Inverse of `resolveDeploymentEnabled`: `null` in cloudOnly means "use the deployment-profile
 * default" (cloud = enabled, local = disabled); explicit `true`/`false` overrides. Used for
 * lanes classified cloud-deployable per ADR 0014 (e.g. `tenant-repo-sync`).
 *
 * @param {String} key
 * @returns {Boolean}
 */
function resolveCloudOnlyEnabled(key) {
    const cfg = AiConfig.orchestrator.cloudOnly?.[key];
    if (cfg !== null && cfg !== undefined) return cfg;
    return AiConfig.orchestrator.deploymentMode === 'cloud';
}

/**
 * @summary Neo daemon class for Agent OS maintenance scheduling.
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
 * **Service-DI 4-way classification:**
 * - **(A) Class-system-managed utility collaborator** — `cadenceEngine_` reactive
 *   config with `beforeSet` + `ClassSystemUtil.beforeSetInstance` for polymorphic
 *   class/instance/config-object input and proper lifecycle on swap.
 * - **(B) Parent-configured child collaborator** — `processSupervisorService_`
 *   reactive config with `beforeSet` creation from parent-sourced config + parent
 *   `afterSet*` propagation hooks for `dataDir`/`taskDefinitions`/`taskStateService`/
 *   `healthService`/`spawnFn` so subsequent parent mutations flow to the child.
 * - **(C) Simple imported collaborator** — direct-import instance fields
 *   (`primaryRepoSyncService`, `dreamService`, etc.) for class-shaped execution
 *   collaborators, and function-typed instance fields
 *   (`summaryGetDueTask`, `backupGetDueTask`, `primaryDevSyncGetDueTask`) for
 *   pure-function scheduling triggers from `./scheduling/<task>.mjs` — no
 *   class-system conversion, no parent-child propagation, no lifecycle side effect.
 *   The function-typed fields default to the imported pure functions so tests can
 *   override the seam without touching module-level mocks.
 * - **(D) Operator policy value** — lazy getters with the 2-value chain
 *   `Env.parseNumber('NEO_X') ?? AiConfig.orchestrator.intervals.X` for intervals
 *   + `Env.parseBool('NEO_X') ?? resolveDeploymentEnabled(...)` for booleans.
 *   `Env` is the canonical `Neo.util.Env` substrate primitive (`src/util/Env.mjs`);
 *   single-source-of-name discipline — env var name appears ONCE per call site
 *   (Env reads `process.env[name]` internally, avoiding duplicate env-var names
 *   at each call site).
 *
 * No `configure()` shadow-resolver. No `DEFAULT_X_*_MS` constants. No
 * `parseInterval`/`parseEnabledFlag` helpers. No `processSupervisorService.set({...this...})`
 * context-replay block in `start()`.
 *
 * @class Neo.ai.daemons.Orchestrator
 * @extends Neo.core.Base
 * @singleton
 * @see ai/scripts/orchestrator-daemon.mjs
 * @see ai/daemons/orchestrator/scheduling/summary.mjs
 * @see ai/services/memory-core/HealthService.mjs#recordTaskOutcome
 * @see learn/agentos/v13-path.md
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
         * @member {Neo.ai.daemons.orchestrator.services.MaintenanceBackpressureService|Object|null} maintenanceBackpressureService_=MaintenanceBackpressureService
         * @reactive
         */
        maintenanceBackpressureService_: MaintenanceBackpressureService,
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
        spawnFn_: spawn,
        /**
         * Shared heavy-maintenance lease file path. Reactive so `start()` overrides
         * propagate to the MaintenanceBackpressureService instance via
         * `afterSetHeavyMaintenanceLeasePath`; otherwise the public `start()` option
         * would be silently disconnected from the service that uses it.
         * @member {String|null} heavyMaintenanceLeasePath_=null
         * @reactive
         */
        heavyMaintenanceLeasePath_: null
    }

    // === Service-DI Class C: simple imported collaborators (instance fields) ===
    primaryRepoSyncService   = PrimaryRepoSyncService
    tenantRepoSyncService    = TenantRepoSyncService
    dreamService             = DreamService
    swarmHeartbeatService    = SwarmHeartbeatService
    goldenPathSynthesizer    = GoldenPathSynthesizer
    initializeDatabaseFn     = initializeDatabase
    summaryGetDueTask        = summaryGetDueTaskImport
    backupGetDueTask         = backupGetDueTaskImport
    primaryDevSyncGetDueTask = primaryDevSyncGetDueTaskImport
    tenantRepoSyncGetDueTask = tenantRepoSyncGetDueTaskImport

    // === Instance state (mutated at runtime; non-reactive) ===
    isPolling                     = false
    pollHandle                    = null
    db                            = null
    dbPath                        = DEFAULT_DB_PATH
    logFile                       = null
    stateFile                     = null
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

    /**
     * Stable logger seam for the maintenanceBackpressureService writeLog binding.
     * Mirrors `processSupervisorWriteLog` — same rationale, same shape.
     * @member {Function} maintenanceBackpressureWriteLog
     */
    maintenanceBackpressureWriteLog = (level, msg) => this.writeLog(level, msg)

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

    // === Service-DI Class B: processSupervisorService + maintenanceBackpressureService beforeSet + parent afterSet propagation ===
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

    /**
     * Wires a per-Orchestrator MaintenanceBackpressureService instance with
     * parent context at creation time. Subsequent parent-prop changes flow via
     * direct reactive-config assignment on the MBS instance (e.g.
     * `this.maintenanceBackpressureService.taskStateService = value`) from the
     * matching `afterSetX` hooks below. The cloud multi-repo Orchestrator
     * variant (one Orchestrator polling N tenant repos) likewise re-assigns
     * MBS reactive configs per poll cycle to switch context.
     *
     * MBS is per-instance (not singleton) because it requires external
     * configuration — singleton classes self-contain their config; classes
     * that need parent-injected configuration are per-instance.
     *
     * @param {Neo.ai.daemons.orchestrator.services.MaintenanceBackpressureService|Object|null} value
     * @returns {Neo.ai.daemons.orchestrator.services.MaintenanceBackpressureService}
     */
    beforeSetMaintenanceBackpressureService(value) {
        return ClassSystemUtil.beforeSetInstance(value, MaintenanceBackpressureService, {
            heavyMaintenanceTaskNames    : this.heavyMaintenanceTaskNames,
            goldenPathDependencyTaskNames: this.goldenPathDependencyTaskNames,
            heavyMaintenanceLeasePath    : this.heavyMaintenanceLeasePath,
            dataDir                      : this.dataDir,
            taskStateService             : this.taskStateService,
            healthService                : this.healthService,
            taskDefinitions              : this.taskDefinitions,
            writeLog                     : this.maintenanceBackpressureWriteLog
        });
    }

    afterSetDataDir(value, oldValue) {
        if (oldValue === undefined) return;
        this.processSupervisorService.dataDir          = value;
        this.maintenanceBackpressureService.dataDir    = value;
    }
    afterSetTaskDefinitions(value, oldValue) {
        if (oldValue === undefined) return;
        this.processSupervisorService.taskDefinitions       = value;
        this.maintenanceBackpressureService.taskDefinitions = value;
    }
    afterSetTaskStateService(value, oldValue) {
        if (oldValue === undefined) return;
        this.processSupervisorService.taskStateService       = value;
        this.maintenanceBackpressureService.taskStateService = value;
    }
    afterSetHealthService(value, oldValue) {
        if (oldValue === undefined) return;
        this.processSupervisorService.healthService       = value;
        this.maintenanceBackpressureService.healthService = value;
    }
    afterSetSpawnFn(value, oldValue) {
        if (oldValue === undefined) return;
        this.processSupervisorService.spawnFn = value;
    }
    afterSetHeavyMaintenanceLeasePath(value, oldValue) {
        if (oldValue === undefined) return;
        this.maintenanceBackpressureService.heavyMaintenanceLeasePath = value;
    }

    // === Service-DI Class D: operator policy values (lazy getters, 2-value chain) ===
    get pollIntervalMs()          { return Env.parseNumber('NEO_ORCHESTRATOR_POLL_INTERVAL_MS')             ?? AiConfig.orchestrator.intervals.pollMs;             }
    get summarySweepIntervalMs()  { return Env.parseNumber('NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS')    ?? AiConfig.orchestrator.intervals.summarySweepMs;     }
    get kbSyncIntervalMs()        { return Env.parseNumber('NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS')          ?? AiConfig.orchestrator.intervals.kbSyncMs;           }
    get backupIntervalMs()        { return Env.parseNumber('NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS')           ?? AiConfig.orchestrator.intervals.backupMs;           }
    get primaryDevSyncIntervalMs(){ return Env.parseNumber('NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS') ?? AiConfig.orchestrator.intervals.primaryDevSyncMs;   }
    get tenantRepoSyncIntervalMs(){ return Env.parseNumber('NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS') ?? AiConfig.orchestrator.intervals.tenantRepoSyncMs;   }
    get dreamIntervalMs()         { return Env.parseNumber('NEO_ORCHESTRATOR_DREAM_INTERVAL_MS')            ?? AiConfig.orchestrator.intervals.dreamMs;            }
    get goldenPathIntervalMs()    { return Env.parseNumber('NEO_ORCHESTRATOR_GOLDEN_PATH_INTERVAL_MS')      ?? AiConfig.orchestrator.intervals.goldenPathMs;       }
    get swarmHeartbeatIntervalMs(){ return Env.parseNumber('NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS')  ?? AiConfig.orchestrator.intervals.swarmHeartbeatMs;   }
    get swarmHeartbeatIdentity()  { return Env.parseString('NEO_AGENT_IDENTITY');                                                                                  }
    get swarmHeartbeatTargetSource() { return Env.parseString('NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGET_SOURCE') ?? AiConfig.orchestrator.swarmHeartbeat?.targetSource ?? null; }
    /**
     * Explicit env-driven target list for the swarm-heartbeat resolver. Comma-separated
     * `@handle` form via `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS`. Empty or absent →
     * `null` so the resolver falls through to `targetSource` semantics.
     * @returns {String[]|null}
     */
    get swarmHeartbeatExplicitTargets() {
        const raw = Env.parseString('NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS');
        if (!raw) return null;
        const list = raw.split(',').map(s => s.trim()).filter(Boolean);
        return list.length > 0 ? list : null;
    }

    get kbSyncEnabled()                  { return Env.parseBool('NEO_ORCHESTRATOR_KB_SYNC_ENABLED')                     ?? resolveDeploymentEnabled('kbSyncEnabled');                  }
    get primaryDevSyncEnabled()          { return Env.parseBool('NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED')            ?? resolveDeploymentEnabled('primaryDevSyncEnabled');          }
    get tenantRepoSyncEnabled()          { return Env.parseBool('NEO_ORCHESTRATOR_TENANT_REPO_SYNC_ENABLED')            ?? resolveCloudOnlyEnabled('tenantRepoSyncEnabled');           }
    get bridgeDaemonEnabled()            { return Env.parseBool('NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED')               ?? resolveDeploymentEnabled('bridgeDaemonEnabled');            }
    get swarmHeartbeatEnabled()          { return Env.parseBool('NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED')             ?? resolveDeploymentEnabled('swarmHeartbeatEnabled');          }
    get goldenPathRepoEnrichmentEnabled(){ return Env.parseBool('NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED') ?? resolveDeploymentEnabled('goldenPathRepoEnrichmentEnabled');}

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
     * @param {String}  [options.mlxPort]
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
            mlxModel  : options.mlxModel || undefined,
            mlxPort   : options.mlxPort  || undefined
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

        // One-time swarm-heartbeat lane init. An init failure must log but
        // NOT crash the Orchestrator — the lane disables itself for this run via the
        // daemon-local `initFailed` instance field (preserves fail-safe invariant
        // without env-registry mutation; `poll()` swarm-heartbeat lane checks it).
        if (this.swarmHeartbeatEnabled) {
            try {
                // Set pulse-time runtime config on the singleton BEFORE awaiting ready().
                // initAsync() is identity-agnostic (peer-service .ready() only); identity
                // and pollIntervalMs are read by pulse() per tick, so post-init assignment
                // is sufficient. Order matches the JSDoc contract on the service class.
                this.swarmHeartbeatService.identity        = this.swarmHeartbeatIdentity;
                this.swarmHeartbeatService.pollIntervalMs  = this.swarmHeartbeatIntervalMs;
                this.swarmHeartbeatService.targetSource    = this.swarmHeartbeatTargetSource;
                this.swarmHeartbeatService.explicitTargets = this.swarmHeartbeatExplicitTargets;
                await this.swarmHeartbeatService.ready();
            } catch (e) {
                this.writeLog('ERROR', `[Orchestrator] Swarm heartbeat init failed; lane disabled this run: ${e.message}`);
                this.swarmHeartbeatService.initFailed = true;
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
     * Wraps a task executor with cross-task heavy-maintenance backpressure by delegating
     * to {@link MaintenanceBackpressureService#acquireLeaseAndExecute}. MBS owns the
     * two-tier backpressure (intra-process `activeHeavyTask` tracker + inter-process
     * file lease at `heavyMaintenanceLeasePath`) + deferral logging + lease lifecycle.
     * Class B propagation keeps MBS bindings synced with parent Orchestrator state.
     *
     * @param {Function} executeFn Task executor; receives `(taskName, reason, onSuccess, options)`.
     * @param {Object} activeHeavyTask Mutable active-heavy tracker for the current poll.
     * @returns {Function}
     */
    createMaintenanceExecutor(executeFn, activeHeavyTask) {
        return (taskName, reason, onSuccess) =>
            this.maintenanceBackpressureService.acquireLeaseAndExecute({
                taskName, executeFn, reason, onSuccess, activeHeavyTask
            });
    }

    /**
     * Wraps Golden Path execution with dependency ordering via
     * {@link MaintenanceBackpressureService#executeWithGoldenPathDependencyGate}.
     * @param {Function} executeFn Task executor.
     * @param {Object} activeHeavyTask Mutable active-heavy tracker for the current poll.
     * @returns {Function}
     */
    createGoldenPathExecutor(executeFn, activeHeavyTask) {
        return (taskName, reason) =>
            this.maintenanceBackpressureService.executeWithGoldenPathDependencyGate({
                taskName, executeFn, reason, activeHeavyTask
            });
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

        const activeHeavyTask = {name: this.maintenanceBackpressureService.getActiveHeavyMaintenanceTask()};
        const executeMaintenanceTask = executeFn => this.createMaintenanceExecutor(executeFn, activeHeavyTask);

        this.cadenceEngine.runIfDue('summary', () => {
            return this.summaryGetDueTask({
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
            return this.backupGetDueTask({
                state           : this.taskStateService.getState(),
                now,
                backupIntervalMs: this.backupIntervalMs
            });
        }, executeMaintenanceTask(executeTask), context);

        this.cadenceEngine.runIfDue('primary-dev-sync', () => {
            return this.primaryDevSyncGetDueTask({
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

        this.cadenceEngine.runIfDue('tenant-repo-sync', () => {
            return this.tenantRepoSyncGetDueTask({
                state     : this.taskStateService.getState(),
                now,
                intervalMs: this.tenantRepoSyncIntervalMs,
                enabled   : this.tenantRepoSyncEnabled
            });
        }, executeMaintenanceTask((taskName, reason) => {
            return this.tenantRepoSyncService.runTask({
                taskName,
                reason,
                taskStateService: this.taskStateService,
                healthService   : this.healthService,
                writeLog        : this.writeLog.bind(this)
            });
        }), context);

        this.cadenceEngine.runIfDue('dream', () => {
            if (this.cadenceEngine.shouldRunIntervalTask({
                now,
                lastRunAt : this.taskStateService.getTaskState('dream')?.lastRunAt,
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

        this.cadenceEngine.runIfDue('golden-path', () => {
            if (this.cadenceEngine.shouldRunIntervalTask({
                now,
                lastRunAt : this.taskStateService.getTaskState('golden-path')?.lastRunAt,
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

        // Swarm-heartbeat lane. NOT heavy maintenance — the pulse is a light
        // wake-substrate check, so the executor runs directly (no `executeMaintenanceTask`
        // wrap). `reason` is passed as a string straight from `CadenceEngine.runIfDue`.
        this.cadenceEngine.runIfDue('swarm-heartbeat', () => {
            if (!this.swarmHeartbeatEnabled) {
                return null;
            }
            // Daemon-local runtime guard: swarm-heartbeat init failure sets
            // `initFailed = true` on the service in start(); skip pulse() for the rest
            // of this run regardless of static enable-config (the fail-safe invariant).
            if (this.swarmHeartbeatService.initFailed) {
                return null;
            }
            if (this.cadenceEngine.shouldRunIntervalTask({
                now,
                lastRunAt : this.taskStateService.getTaskState('swarm-heartbeat')?.lastRunAt,
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
