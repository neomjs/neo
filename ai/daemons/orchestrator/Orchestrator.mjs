// Neo + core/_export + InstanceManager bootstrap belongs to the daemon entry point
// (`ai/daemons/orchestrator/daemon.mjs`), NOT to this consumed-class file. Class files
// rely on `globalThis.Neo` populated by the entry-point bootstrap; importing Neo here
// would violate the entry-point-only invariant + risk partial-namespace damage if the
// class were ever loaded outside its entry-point's chain.
import fs                          from 'fs-extra';
import {spawn}                     from 'child_process';
import net                         from 'net';
import path                        from 'path';
import Base                        from '../../../src/core/Base.mjs';
import ClassSystemUtil             from '../../../src/util/ClassSystem.mjs';
import AiConfig                    from '../../config.mjs';
import {buildLmsPreloadConfig}     from '../../services/graph/ProviderReadinessHelper.mjs';
import HealthService               from '../../services/memory-core/HealthService.mjs';
import SQLite                      from '../../graph/storage/SQLite.mjs';
import MaintenanceBackpressureService, {
    DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
    DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES
} from './services/MaintenanceBackpressureService.mjs';
import PrimaryRepoSyncService from './services/PrimaryRepoSyncService.mjs';
import TenantRepoSyncService             from './services/TenantRepoSyncService.mjs';
import {getDueTask as summaryGetDueTaskImport}        from './scheduling/summary.mjs';
import {getDueTask as backupGetDueTaskImport}         from './scheduling/backup.mjs';
import {getDueTask as graphLogCompactionGetDueTaskImport} from './scheduling/graphLogCompaction.mjs';
import {getDueTask as primaryDevSyncGetDueTaskImport} from './scheduling/primaryDevSync.mjs';
import {getDueTask as dreamGetDueTaskImport}          from './scheduling/dream.mjs';
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
/**
 * @summary Self-bootstrapping orchestrator database open — replaces the previous
 * `bridge/queries.mjs::initializeDatabase` consumption in this daemon's `start()`
 * path for fresh `npx-neo-app` workspaces with missing sqlite files.
 *
 * **Behavior contract**:
 * - Fresh workspace with absent sqlite path → creates the directory + opens the
 *   sqlite file + initializes the Memory Core graph schema (Nodes / Edges /
 *   GraphLog / triggers / SummarizationJobs), then returns the underlying
 *   better-sqlite3 handle for downstream orchestrator + bridge daemon consumption.
 * - Pre-existing sqlite path with valid schema → opens cleanly (no destructive
 *   re-create; `initSchema()` self-skips when schema is already valid).
 * - Invalid/malformed dbPath → throws (orchestrator-scoped; lane-isolated
 *   failure-recovery in `start()`'s outer try handles it). **No `process.exit(1)`**
 *   from this path — that hard-exit semantic was the original failure symptom.
 *
 * **Schema parity with Memory Core MCP first-boot**: delegates to
 * `ai/graph/storage/SQLite.mjs`'s self-bootstrap chain
 * (`ensureDir` → open without `fileMustExist` → `initSchema()`), so the
 * orchestrator-bootstrapped schema is byte-equivalent to the MC-bootstrapped
 * schema. Day-2 workspaces where the user boots orchestrator before MC produce
 * the same on-disk shape as the inverse boot order.
 *
 * **Why this lives here (not in `bridge/queries.mjs`):** the bridge daemon's
 * `initializeDatabase` (still in `bridge/queries.mjs`) intentionally keeps the
 * `fileMustExist: true` + `process.exit(1)` strict contract — bridge is a child
 * task that assumes a pre-initialized DB inherited from its parent orchestrator.
 * Separating the two open-paths preserves the bridge contract (Contract Ledger
 * Row 2) while giving the orchestrator the safer self-bootstrap discipline.
 *
 * Exported for test seam — tests can inject a sync mock via the orchestrator's
 * `initializeDatabaseFn` config slot.
 *
 * @param {String} dbPath Absolute path to the sqlite file
 * @returns {Promise<Object>} better-sqlite3 database handle, schema-initialized
 * @see ai/graph/storage/SQLite.mjs — shared schema-creation primitive
 * @see ai/daemons/bridge/queries.mjs — sibling strict-open primitive (preserved)
 */
export async function initializeDatabaseSelfBootstrap(dbPath) {
    const storage = Neo.create(SQLite, {dbPath});
    await storage.ready();
    return storage.db;
}

// dev-sync roots precedence used to live in two resolver helpers
// (`resolvePrimaryDevSyncRootsConfig` + `resolvePrimaryDevSyncRootsSource`) plus a
// caller-side `process.env[DEV_SYNC_ROOTS_ENV_VAR]` read. Both layers are removed
// in favour of the SSOT chain: `ai/config.template.mjs::orchestrator.devSyncRoots`
// (with `envBindings.orchestrator.devSyncRoots → NEO_ORCHESTRATOR_DEV_SYNC_ROOTS`)
// owns env-vs-config precedence at config-load time. Operator-instance overrides
// flow through the `primaryDevSyncRootsConfig` Class A/B reactive config slot,
// defaulting to the env-applied tier-1 value when the operator does not pass one.

/**
 * Resolves a deployment-aware boolean toggle from `AiConfig.orchestrator.localOnly[key]`.
 * `null` or missing keys mean "use the deployment-profile default" (local = enabled,
 * cloud = disabled); explicit `true`/`false` overrides. Missing-key fallback keeps
 * gitignored operator configs safe when a newly tracked template key is introduced.
 *
 * @param {String} key
 * @returns {Boolean}
 */
function resolveDeploymentEnabled(key) {
    const cfg = AiConfig.orchestrator.localOnly[key];
    if (cfg !== null && cfg !== undefined) return cfg;
    return AiConfig.orchestrator.deploymentMode !== 'cloud';
}

/**
 * Resolves a cloud-deployment-aware boolean toggle from `AiConfig.orchestrator.cloudOnly[key]`.
 * Inverse of `resolveDeploymentEnabled`: `null` in cloudOnly means "use the deployment-profile
 * default" (cloud = enabled, local = disabled); explicit `true`/`false` overrides. Used for
 * lanes classified cloud-deployable by the deployment policy (e.g. `tenant-repo-sync`).
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
 * `ai/daemons/orchestrator/daemon.mjs` owns the Node-process boot wrapper:
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
 *   (`summaryGetDueTask`, `backupGetDueTask`, `graphLogCompactionGetDueTask`,
 *   `primaryDevSyncGetDueTask`, `dreamGetDueTask`) for
 *   pure-function scheduling triggers from `./scheduling/<task>.mjs` — no
 *   class-system conversion, no parent-child propagation, no lifecycle side effect.
 *   The function-typed fields default to the imported pure functions so tests can
 *   override the seam without touching module-level mocks.
 * - **(D) Operator policy value** — pure config values (intervals, ports, model/host,
 *   cadence/jitter) are read inline as `AiConfig.<path>` at their call sites; the env
 *   override is layered into the aiConfig substrate at config-load time, so there is no
 *   per-access env probe and no delegation getter re-exposing them. A few getters remain
 *   for values carrying real logic (deployment-mode resolution, list-parsing, or a direct
 *   runtime-identity read — `swarmHeartbeatIdentity` reads `NEO_AGENT_IDENTITY`).
 *
 * No `configure()` shadow-resolver. No `DEFAULT_X_*_MS` constants. No
 * `parseInterval`/`parseEnabledFlag` helpers. No `processSupervisorService.set({...this...})`
 * context-replay block in `start()`.
 *
 * @class Neo.ai.daemons.Orchestrator
 * @extends Neo.core.Base
 * @singleton
 * @see ai/daemons/orchestrator/daemon.mjs
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
    initializeDatabaseFn     = initializeDatabaseSelfBootstrap
    summaryGetDueTask        = summaryGetDueTaskImport
    backupGetDueTask         = backupGetDueTaskImport
    graphLogCompactionGetDueTask = graphLogCompactionGetDueTaskImport
    primaryDevSyncGetDueTask = primaryDevSyncGetDueTaskImport
    tenantRepoSyncGetDueTask = tenantRepoSyncGetDueTaskImport
    dreamGetDueTask          = dreamGetDueTaskImport

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

    // === Operator policy values — config-template + envBindings is the SSOT ===
    // Pure config values (intervals, ports, model/host, cadence/jitter) are read inline as
    // `AiConfig.<path>` at their call sites — no delegation getters re-expose them. Env vars are
    // declared on `ai/config.template.mjs::envBindings.orchestrator.*` and applied at config-load
    // time; there is no per-access env probe. The getters below carry real logic
    // (deployment-mode resolution, coercion, env reads, list-parsing), so they remain.
    get swarmHeartbeatIdentity()      { return process.env.NEO_AGENT_IDENTITY?.trim() || undefined; }
    /**
     * Explicit env-driven target list for the swarm-heartbeat resolver. Comma-separated
     * `@handle` form via `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS`. Empty or absent →
     * `null` so the resolver falls through to `targetSource` semantics. The raw string
     * arrives via `AiConfig.orchestrator.swarmHeartbeat.targets`; this getter splits +
     * trims because the array-shape parsing is consumer-side concern, not config-shape.
     * @returns {String[]|null}
     */
    get swarmHeartbeatExplicitTargets() {
        const raw = AiConfig.orchestrator.swarmHeartbeat.targets;
        if (!raw) return null;
        const list = String(raw).split(',').map(s => s.trim()).filter(Boolean);
        return list.length > 0 ? list : null;
    }

    get kbSyncEnabled()                  { return resolveDeploymentEnabled('kbSyncEnabled');                  }
    get primaryDevSyncEnabled()          { return resolveDeploymentEnabled('primaryDevSyncEnabled');          }
    get tenantRepoSyncEnabled()          { return resolveCloudOnlyEnabled('tenantRepoSyncEnabled');           }
    get chromaDaemonEnabled()            { return resolveDeploymentEnabled('chromaDaemonEnabled');            }
    get bridgeDaemonEnabled()            { return resolveDeploymentEnabled('bridgeDaemonEnabled');            }
    get swarmHeartbeatEnabled()          { return resolveDeploymentEnabled('swarmHeartbeatEnabled');          }
    get goldenPathRepoEnrichmentEnabled(){ return resolveDeploymentEnabled('goldenPathRepoEnrichmentEnabled');}
    get graphLogCompactionEnabled()      { return AiConfig.orchestrator.graphLogCompaction.enabled;      }

    // MLX + LM Studio CLI inference-server lane config. Canonical defaults + env overrides
    // live in `ai/config.template.mjs::orchestrator.{mlx,lms}` + `envBindings.orchestrator.{mlx,lms}`.
    get mlxEnabled() { return !!AiConfig.orchestrator.mlx.enabled; }
    get lmsEnabled() { return !!AiConfig.orchestrator.lms.enabled; }
    get lmsPreloadConfig() { return buildLmsPreloadConfig(AiConfig); }
    get lmsModels()        { return this.lmsPreloadConfig.models;      }

    /**
     * Starts the orchestrator process loop after the wrapper has selected this process.
     *
     * Lane-internal config (intervals, enable flags, mlx/lms server tuning) is NOT read
     * from `options`. The Orchestrator owns those via getters that consult env vars +
     * `AiConfig.orchestrator.X` directly. Test fixtures override individual lane configs
     * via env vars or by stubbing the getter on a test instance.
     *
     * @param {Object} [options] Boot-wrapper paths + harness/process seams.
     * @param {String} [options.scriptDir]
     * @param {String} [options.dataDir]
     * @param {String} [options.dbPath]
     * @param {String} [options.logFile]
     * @param {String} [options.stateFile]
     * @param {String} [options.heavyMaintenanceLeasePath]
     * @param {Object} [options.taskDefinitions] Pre-built task definitions (test-injection).
     * @param {String} [options.nodeBin]
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
        this.dataDir           = dataDir;
        const lmsPreloadConfig = this.lmsPreloadConfig;
        this.taskDefinitions   = options.taskDefinitions || buildTaskDefinitions({
            scriptDir,
            nodeBin   : options.nodeBin || process.argv[0],
            chromaPort: AiConfig.engines.chroma.port,
            mlxEnabled: this.mlxEnabled,
            mlxModel  : AiConfig.orchestrator.mlx.model,
            mlxPort   : AiConfig.orchestrator.mlx.port,
            lmsEnabled: this.lmsEnabled,
            lmsModel  : AiConfig.orchestrator.lms.model,
            lmsModels : lmsPreloadConfig.models,
            lmsHost   : AiConfig.openAiCompatible.host,
            lmsPort   : AiConfig.orchestrator.lms.port,
            lmsContextLengths: lmsPreloadConfig.contextLengths,
            providerReadiness: AiConfig.orchestrator.providerReadiness,
            graphLogCompactionVacuum: AiConfig.orchestrator.graphLogCompaction.vacuum
        });

        // Non-reactive boot-wrapper-provided instance state
        this.dbPath                    = options.dbPath   || DEFAULT_DB_PATH;
        this.logFile                   = options.logFile  || path.join(dataDir, 'orchestrator.log');
        this.stateFile                 = options.stateFile || path.join(dataDir, 'orchestrator-state.json');
        this.heavyMaintenanceLeasePath = options.heavyMaintenanceLeasePath ?? this.heavyMaintenanceLeasePath;
        this.primaryDevSyncRootsConfig = options.primaryDevSyncRootsConfig !== undefined
            ? options.primaryDevSyncRootsConfig
            : AiConfig.orchestrator.devSyncRoots;
        this.maintenanceDeferralLogKeys = new Set();
        // Chroma max-runtime recycle: process-local (non-persisted) flags.
        // `_chromaDefragPending` gates the post-restart defrag; `_chromaDefragInFlight` prevents
        // poll re-entry during the readiness probe. The defrag is BEST-EFFORT: if the orchestrator
        // restarts after killTask but before the defrag fires, the flag is lost and the defrag is
        // skipped for that cycle — the next max-runtime recycle compacts the store. This is sound
        // for an idempotent compaction step (persisting the intent would instead introduce a
        // pending-forever / endless-retry failure mode); the kill→restart, the primary recycle
        // value, is unaffected by an orchestrator restart.
        this._chromaDefragPending  = false;
        this._chromaDefragInFlight = false;

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

        this.db = await this.initializeDatabaseFn(this.dbPath);

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
                this.swarmHeartbeatService.pollIntervalMs  = AiConfig.orchestrator.intervals.swarmHeartbeatMs;
                this.swarmHeartbeatService.targetSource    = AiConfig.orchestrator.swarmHeartbeat.targetSource;
                this.swarmHeartbeatService.explicitTargets = this.swarmHeartbeatExplicitTargets;
                await this.swarmHeartbeatService.ready();
            } catch (e) {
                this.writeLog('ERROR', `[Orchestrator] Swarm heartbeat init failed; lane disabled this run: ${e.message}`);
                this.swarmHeartbeatService.initFailed = true;
            }
        }

        this.isPolling = true;
        this.writeLog('INFO', `[Orchestrator] Started. summaryInterval=${AiConfig.orchestrator.intervals.summarySweepMs}ms kbSyncInterval=${AiConfig.orchestrator.intervals.kbSyncMs}ms poll=${AiConfig.orchestrator.intervals.pollMs}ms.`);
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
     * Whether the supervised Chroma daemon's uptime has exceeded the configured recycle
     * ceiling. Pure predicate over task state + `chromaMaxRuntimeMs`; a `0`/absent ceiling
     * disables recycling.
     * @param {Object} state Chroma task state ({running, lastRunAt}).
     * @param {Number} now Epoch ms.
     * @returns {Boolean}
     */
    isChromaRecycleDue(state, now) {
        const maxRuntimeMs = AiConfig.orchestrator.chroma.maxRuntimeMs;
        const lastRunAt    = state?.lastRunAt || 0;
        // lastRunAt === 0 means no recorded spawn (uninitialized / never started): uptime is
        // undefined, so never recycle. A genuinely running daemon always carries a real start
        // stamp (markStarted), so this only excludes inconsistent/uninitialized state.
        return Boolean(state?.running) && maxRuntimeMs > 0 && lastRunAt > 0 && (now - lastRunAt) > maxRuntimeMs;
    }

    /**
     * Resolves true once a TCP connection to the local Chroma port succeeds — a
     * connection-ready proxy mirroring the integration stack's `/dev/tcp` healthcheck.
     * Overridable in tests; never rejects.
     * @param {Object} [options]
     * @param {Number} [options.timeoutMs=2000] Probe timeout.
     * @returns {Promise<Boolean>}
     */
    probeChromaReady({timeoutMs = 2000} = {}) {
        return new Promise(resolve => {
            const socket = net.connect({host: 'localhost', port: AiConfig.engines.chroma.port});
            const finish = result => { socket.destroy(); resolve(result); };
            socket.setTimeout(timeoutMs);
            socket.once('connect', () => finish(true));
            socket.once('timeout', () => finish(false));
            socket.once('error',   () => finish(false));
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
            ...(this.chromaDaemonEnabled ? ['chroma'] : []),
            ...(this.bridgeDaemonEnabled ? ['bridgeDaemon'] : []),
            'mlx',
            'lms'
        ];
        const RESTART_COOLDOWN_MS = 15000;
        for (const taskName of continuousTasks) {
            // Singularity guard: reap any duplicate listeners on a singleton-port task's
            // port (chroma) before the spawn check, so exactly one daemon stays alive.
            this.processSupervisorService.reapDuplicateListeners(taskName);

            const state = this.taskStateService.getTaskState(taskName);

            // Max-runtime recycle: kill an over-age chroma daemon (SIGKILL — chroma
            // ignores SIGTERM) so the restart branch below respawns it; the KB defrag fires
            // once the fresh daemon is connection-ready. Implicitly gated by chromaDaemonEnabled
            // (chroma is only a continuousTask when that lane is enabled).
            if (taskName === 'chroma' && this.isChromaRecycleDue(state, now)) {
                this.processSupervisorService.killTask('chroma', `max-runtime:${now - (state.lastRunAt || 0)}ms>${AiConfig.orchestrator.chroma.maxRuntimeMs}ms`);
                this._chromaDefragPending = true;
                continue;
            }

            // Liveness-gated (re)start is owned by the supervisor: process-match by default, or a
            // task-owned liveness probe for a fire-and-exit lane whose served process persists
            // out-of-band (so the running flag never recovers and a process match would loop).
            this.processSupervisorService.superviseTask(taskName, now, RESTART_COOLDOWN_MS);

            // Post-recycle defrag: once the restarted chroma is connection-ready, run
            // the unified-store-safe KB defrag against the fresh daemon. MC defrag is deferred
            // because it has no rebuild-from-source fallback. The in-flight guard prevents
            // poll re-entry while the async readiness probe is pending.
            if (taskName === 'chroma' && state?.running && this._chromaDefragPending && !this._chromaDefragInFlight) {
                this._chromaDefragInFlight = true;
                this.probeChromaReady()
                    .then(ready => {
                        if (ready && this._chromaDefragPending) {
                            this._chromaDefragPending = false;
                            executeTask('chromaDefrag', 'chroma-recycle-defrag');
                        }
                    })
                    .catch(() => {})
                    .finally(() => { this._chromaDefragInFlight = false; });
            }
        }

        const activeHeavyTask = {name: this.maintenanceBackpressureService.getActiveHeavyMaintenanceTask()};
        const executeMaintenanceTask = executeFn => this.createMaintenanceExecutor(executeFn, activeHeavyTask);

        this.cadenceEngine.runIfDue('summary', () => {
            return this.summaryGetDueTask({
                db                    : this.db,
                state                 : this.taskStateService.getState(),
                now,
                summarySweepIntervalMs: AiConfig.orchestrator.intervals.summarySweepMs,
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
                intervalMs: AiConfig.orchestrator.intervals.kbSyncMs
            })) {
                return { reason: `periodic-sync:${AiConfig.orchestrator.intervals.kbSyncMs}` };
            }
            return null;
        }, executeMaintenanceTask(executeTask), context);

        this.cadenceEngine.runIfDue('backup', () => {
            return this.backupGetDueTask({
                state           : this.taskStateService.getState(),
                now,
                backupIntervalMs: AiConfig.orchestrator.intervals.backupMs
            });
        }, executeMaintenanceTask(executeTask), context);

        this.cadenceEngine.runIfDue('graphlog-compaction', () => {
            return this.graphLogCompactionGetDueTask({
                state                        : this.taskStateService.getState(),
                now,
                graphLogCompactionIntervalMs: AiConfig.orchestrator.intervals.graphLogCompactionMs,
                enabled                      : this.graphLogCompactionEnabled
            });
        }, executeMaintenanceTask(executeTask), context);

        this.cadenceEngine.runIfDue('primary-dev-sync', () => {
            return this.primaryDevSyncGetDueTask({
                state     : this.taskStateService.getState(),
                now,
                intervalMs: AiConfig.orchestrator.intervals.primaryDevSyncMs,
                enabled   : this.primaryDevSyncEnabled
            });
        }, executeMaintenanceTask((taskName, reason) => {
            return this.primaryRepoSyncService.runTask({
                taskName,
                reason,
                taskStateService  : this.taskStateService,
                healthService     : this.healthService,
                writeLog          : this.writeLog.bind(this),
                devSyncRootsConfig: this.primaryDevSyncRootsConfig
            });
        }), context);

        // Two distinct cadences: the SWEEP cadence (`tenantRepoSync.sweepCadenceMs`, short by
        // design) is how often the sweep is invoked; the per-repo `intervals.tenantRepoSyncMs` is
        // the actual interval between a single repo's sync attempts, with `jitterRatio` spreading
        // per-repo work across the window instead of synchronizing it onto the sweep boundary.
        this.cadenceEngine.runIfDue('tenant-repo-sync', () => {
            return this.tenantRepoSyncGetDueTask({
                state     : this.taskStateService.getState(),
                now,
                intervalMs: AiConfig.orchestrator.tenantRepoSync.sweepCadenceMs,
                enabled   : this.tenantRepoSyncEnabled
            });
        }, executeMaintenanceTask((taskName, reason) => {
            return this.tenantRepoSyncService.runTask({
                taskName,
                reason,
                taskStateService: this.taskStateService,
                healthService   : this.healthService,
                writeLog        : this.writeLog.bind(this),
                globalCadenceMs : AiConfig.orchestrator.intervals.tenantRepoSyncMs,
                jitterRatio     : AiConfig.orchestrator.tenantRepoSync.jitterRatio
            });
        }), context);

        this.cadenceEngine.runIfDue('dream', () => {
            return this.dreamGetDueTask({
                state                 : this.taskStateService.getTaskState('dream') ?? {},
                now,
                dreamIntervalMs       : AiConfig.orchestrator.intervals.dreamMs,
                dreamOverflowThreshold: AiConfig.orchestrator.intervals.dreamOverflowThreshold
            });
        }, executeMaintenanceTask(async (taskName, reason) => {
            this.taskStateService.markStarted(taskName, reason);
            this.healthService?.recordTaskOutcome?.(taskName, 'running', { reason, startedAt: new Date().toISOString() });

            const outcome = await this.dreamService.executeRemCycle({
                reason,
                mode        : 'periodic',
                includeDecay: true
            });

            const recordPayload = {
                reason,
                completedAt      : outcome.completedAt,
                durationMs       : outcome.durationMs,
                sessionsProcessed: outcome.sessionsProcessed,
                runId            : outcome.runId
            };

            switch (outcome.status) {
                case 'completed':
                    this.taskStateService.markCompleted(taskName);
                    this.healthService?.recordTaskOutcome?.(taskName, 'completed', recordPayload);
                    break;
                case 'skipped':
                    this.taskStateService.markCompleted(taskName);
                    this.healthService?.recordTaskOutcome?.(taskName, 'skipped', {
                        ...recordPayload,
                        skipReason: outcome.skipReason
                    });
                    break;
                case 'failed': {
                    const state = this.taskStateService.getTaskState(taskName);
                    if (state) {
                        state.lastReason = outcome.diagnostic?.reason || outcome.error?.message;
                    }
                    this.taskStateService.markFailed(taskName, 1);
                    this.healthService?.recordTaskOutcome?.(taskName, 'failed', {
                        ...recordPayload,
                        failedAt    : outcome.completedAt,
                        failurePhase: outcome.diagnostic ? 'provider-readiness' : 'in-pipeline',
                        diagnostic  : outcome.diagnostic,
                        error       : outcome.error?.message
                    });
                    break;
                }
            }
        }), context);

        this.cadenceEngine.runIfDue('golden-path', () => {
            if (this.cadenceEngine.shouldRunIntervalTask({
                now,
                lastRunAt : this.taskStateService.getTaskState('golden-path')?.lastRunAt,
                intervalMs: AiConfig.orchestrator.intervals.goldenPathMs
            })) {
                return { reason: `periodic-golden-path:${AiConfig.orchestrator.intervals.goldenPathMs}` };
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
                intervalMs: AiConfig.orchestrator.intervals.swarmHeartbeatMs
            })) {
                return { reason: `periodic-heartbeat:${AiConfig.orchestrator.intervals.swarmHeartbeatMs}` };
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
            this.pollHandle = setTimeout(() => this.poll(), AiConfig.orchestrator.intervals.pollMs);
        }
    }
}

export default Neo.setupClass(Orchestrator);
