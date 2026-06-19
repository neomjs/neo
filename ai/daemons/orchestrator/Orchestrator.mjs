// Class bootstrap belongs to `daemon.mjs`; this consumed class relies on global Neo.
import fs                          from 'fs-extra';
import {spawn}                     from 'child_process';
import net                         from 'net';
import path                        from 'path';
import Base                        from '../../../src/core/Base.mjs';
import ClassSystemUtil             from '../../../src/util/ClassSystem.mjs';
import AiConfig                    from '../../config.mjs';
import neuralLinkConfig            from '../../mcp/server/neural-link/config.mjs';
import {buildLmsPreloadConfig}     from '../../services/graph/providerReadinessHelper.mjs';
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
import {getDueTask as goldenPathGetDueTaskImport} from './scheduling/goldenPath.mjs';
import {getDueTask as dreamGetDueTaskImport}          from './scheduling/dream.mjs';
import {getDueTask as embedDrainLivenessWatchdogGetDueTaskImport} from './scheduling/embedDrainLivenessWatchdog.mjs';
import memoryCoreConfig                  from '../../mcp/server/memory-core/config.mjs';
import MailboxService                    from '../../services/memory-core/MailboxService.mjs';
import WakeSubscriptionService           from '../../services/memory-core/WakeSubscriptionService.mjs';
import RequestContextService             from '../../mcp/server/shared/services/RequestContextService.mjs';
import {normalizeAgentIdentityNodeId}    from '../../scripts/lifecycle/resumeHarness.mjs';
import TaskStateService                  from './services/TaskStateService.mjs';
import ProcessSupervisorService          from './services/ProcessSupervisorService.mjs';
import DreamService                      from './services/DreamService.mjs';
import SwarmHeartbeatService             from './services/SwarmHeartbeatService.mjs';
import GoldenPathSynthesizer             from '../../services/graph/GoldenPathSynthesizer.mjs';
import {getDueTask as tenantRepoSyncGetDueTaskImport} from './scheduling/tenantRepoSync.mjs';
import {TASK_REGISTRY}                   from './scheduling/registry.mjs';
import {
    buildOrchestratorSchedulingOptions,
    runSchedulingPipeline
} from './scheduling/pipeline.mjs';
import {
    DEFAULT_DB_PATH,
    DEFAULT_DATA_DIR,
    DEFAULT_SCRIPT_DIR,
    buildTaskDefinitions
} from './taskDefinitions.mjs';

/** @summary Opens/creates the orchestrator sqlite DB via the shared Memory Core schema bootstrap. */
export async function initializeDatabaseSelfBootstrap(dbPath) {
    const storage = Neo.create(SQLite, {dbPath});
    await storage.ready();
    return storage.db;
}

/**
 * Resolves a deployment-aware boolean toggle from `AiConfig.orchestrator.localOnly[key]`.
 * `null` or missing keys mean "use the deployment-profile default" (local = enabled,
 * cloud = disabled); explicit `true`/`false` overrides. Missing-key fallback keeps
 * gitignored operator configs safe when a newly tracked template key is introduced.
 *
 * @param {String} key
 * @returns {Boolean}
 */
function resolveLocalDeploymentDefault(cfg) {
    if (cfg != null) return cfg;
    return AiConfig.orchestrator.deploymentMode !== 'cloud';
}

function resolveDeploymentEnabled(key) {
    return resolveLocalDeploymentDefault(AiConfig.orchestrator.localOnly[key]);
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
    const cfg = AiConfig.orchestrator.cloudOnly[key];
    if (cfg != null) return cfg;
    return AiConfig.orchestrator.deploymentMode === 'cloud';
}

/**
 * @summary Neo daemon class for Agent OS maintenance scheduling.
 *
 * The process wrapper lives in `daemon.mjs`; cadence decisions and descriptor
 * dispatch live in `scheduling/*`. This class keeps boot, continuous-daemon
 * supervision, and the timer loop thin.
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
        className: 'Neo.ai.daemons.Orchestrator',
        singleton: true,
        processSupervisorService_: null,
        maintenanceBackpressureService_: MaintenanceBackpressureService,
        dataDir_: DEFAULT_DATA_DIR,
        taskDefinitions_: null,
        taskStateService_: TaskStateService,
        healthService_: HealthService,
        spawnFn_: spawn,
        heavyMaintenanceLeasePath_: null
    }

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
    goldenPathGetDueTask     = goldenPathGetDueTaskImport
    embedDrainLivenessWatchdogGetDueTask = embedDrainLivenessWatchdogGetDueTaskImport

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

    processSupervisorWriteLog = (level, msg) => this.writeLog(level, msg)
    maintenanceBackpressureWriteLog = (level, msg) => this.writeLog(level, msg)

    /**
     * @summary One-shot active alarm dispatcher for the embed-drain liveness watchdog.
     *
     * The watchdog's PASSIVE leg is its `recordTaskOutcome` health record (every check); this is the
     * ACTIVE leg, fired once on stall-onset by the scheduling pipeline. It broadcasts a swarm- and
     * operator-visible A2A alarm (`MailboxService.addMessage` to the `AGENT:*` sentinel — the
     * `KbAlertingService.dispatchA2A` precedent) carrying the stall payload, then best-effort nudges a
     * wake via `WakeSubscriptionService.emitHeartbeatPulse` to the harness owner. A2A is the durable
     * carrier (heartbeat pulses have no payload column); the pulse is only a wake nudge.
     *
     * Bound arrow field so it can be passed as `services.embedDrainLivenessAlarmDispatcher`. The
     * pipeline wraps the call, but each leg is also independently guarded so one failing leg never
     * suppresses the other.
     *
     * @param {Object} payload
     * @param {Number} payload.ageMs Age of the oldest un-embedded WAL record.
     * @param {Number} payload.pendingCount Pending (un-embedded) record count.
     * @param {Number} payload.thresholdMs Stall threshold that tripped.
     * @param {Number|null} payload.stalledSince Epoch ms the stall was first observed.
     * @returns {Promise<void>}
     */
    embedDrainLivenessAlarmDispatcher = async ({ageMs, pendingCount, thresholdMs, stalledSince} = {}) => {
        const sender = process.env.NEO_AGENT_IDENTITY
            ? normalizeAgentIdentityNodeId(process.env.NEO_AGENT_IDENTITY)
            : '@system';
        const stalledSinceIso = Number.isFinite(stalledSince) ? new Date(stalledSince).toISOString() : 'unknown';
        const ageHours        = (ageMs / (60 * 60 * 1000)).toFixed(1);
        const subject = `[embed-drain-stall] oldest un-embedded WAL record is ${ageHours}h old`;
        const body =
            `The embed-drain liveness watchdog detected a STALLED embed pipeline.\n\n` +
            `- oldest un-embedded WAL record age: ${ageMs}ms (~${ageHours}h)\n` +
            `- pending (un-embedded) record count: ${pendingCount}\n` +
            `- stall threshold: ${thresholdMs}ms\n` +
            `- stalled since: ${stalledSinceIso}\n\n` +
            `The embed drain has stopped reconciling the WAL (process-alive != draining). Semantic recall ` +
            `degrades while the backlog grows. Investigate the embed daemon / drain lock on the drainer clone.`;

        try {
            await RequestContextService.run({agentIdentityNodeId: sender}, async () => {
                await MailboxService.addMessage({to: 'AGENT:*', subject, body, priority: 'high'});
            });
        } catch (e) {
            this.writeLog('ERROR', `[Orchestrator] embed-drain stall-alarm A2A broadcast failed: ${e.message}`);
        }

        const targetIdentity = this.swarmHeartbeatIdentity;
        if (targetIdentity) {
            try {
                await WakeSubscriptionService.emitHeartbeatPulse({targetIdentity: normalizeAgentIdentityNodeId(targetIdentity)});
            } catch (e) {
                this.writeLog('ERROR', `[Orchestrator] embed-drain stall-alarm wake pulse failed: ${e.message}`);
            }
        }
    }

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

    get swarmHeartbeatIdentity()      { return process.env.NEO_AGENT_IDENTITY?.trim() || undefined; }
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
    get devServerEnabled()               { return resolveLocalDeploymentDefault(AiConfig.orchestrator.devServer.enabled); }
    get neuralLinkBridgeEnabled()        { return resolveDeploymentEnabled('neuralLinkBridgeEnabled');        }
    get embedDaemonEnabled()             { return resolveDeploymentEnabled('embedDaemonEnabled');             }
    get embedDrainLivenessWatchdogWalDir()      { return memoryCoreConfig.memoryWal.dir; }
    get embedDrainLivenessWatchdogThresholdMs() { return memoryCoreConfig.memoryWal.embedDrainStallThresholdMs; }
    get swarmHeartbeatEnabled()          { return resolveDeploymentEnabled('swarmHeartbeatEnabled');          }
    get goldenPathRepoEnrichmentEnabled(){ return resolveDeploymentEnabled('goldenPathRepoEnrichmentEnabled');}
    get graphLogCompactionEnabled()      { return AiConfig.orchestrator.graphLogCompaction.enabled;      }
    get neuralLinkBridgeLivenessTimeoutMs() { return AiConfig.orchestrator.neuralLinkBridge.livenessProbeTimeoutMs; }

    get mlxEnabled() { return !!AiConfig.orchestrator.mlx.enabled; }
    get lmsEnabled() { return !!AiConfig.orchestrator.lms.enabled; }
    get lmsPreloadConfig() { return buildLmsPreloadConfig(AiConfig); }
    get lmsModels()        { return this.lmsPreloadConfig.models;      }

    /** @summary Starts the orchestrator timer loop after the wrapper selects this process. */
    async start(options = {}) {
        if (this.isPolling) {
            this.writeLog('INFO', '[Orchestrator] Already polling; start() is a no-op.');
            return;
        }

        const scriptDir = options.scriptDir || DEFAULT_SCRIPT_DIR;
        const dataDir   = options.dataDir   || DEFAULT_DATA_DIR;

        this.dataDir           = dataDir;
        const lmsPreloadConfig = this.lmsPreloadConfig;
        this.taskDefinitions   = options.taskDefinitions || buildTaskDefinitions({
            scriptDir,
            nodeBin                            : options.nodeBin || process.argv[0],
            chromaPort                         : AiConfig.engines.chroma.port,
            devServerPort                      : AiConfig.orchestrator.devServer.port,
            devServerLivenessTimeoutMs         : AiConfig.orchestrator.devServer.livenessProbeTimeoutMs,
            neuralLinkBridgePort               : neuralLinkConfig.port,
            neuralLinkBridgeLivenessTimeoutMs  : this.neuralLinkBridgeLivenessTimeoutMs,
            mlxEnabled                         : this.mlxEnabled,
            mlxModel                           : AiConfig.orchestrator.mlx.model,
            mlxPort                            : AiConfig.orchestrator.mlx.port,
            lmsEnabled                         : this.lmsEnabled,
            lmsModel                           : AiConfig.orchestrator.lms.model,
            lmsModels                          : lmsPreloadConfig.models,
            lmsHost                            : AiConfig.openAiCompatible.host,
            lmsPort                            : AiConfig.orchestrator.lms.port,
            lmsContextLengths                  : lmsPreloadConfig.contextLengths,
            providerReadiness                  : AiConfig.orchestrator.providerReadiness,
            graphLogCompactionVacuum           : AiConfig.orchestrator.graphLogCompaction.vacuum
        });

        this.dbPath                    = options.dbPath   || DEFAULT_DB_PATH;
        this.logFile                   = options.logFile  || path.join(dataDir, 'orchestrator.log');
        this.stateFile                 = options.stateFile || path.join(dataDir, 'orchestrator-state.json');
        this.heavyMaintenanceLeasePath = options.heavyMaintenanceLeasePath ?? this.heavyMaintenanceLeasePath;
        this.primaryDevSyncRootsConfig = options.primaryDevSyncRootsConfig !== undefined
            ? options.primaryDevSyncRootsConfig
            : AiConfig.orchestrator.devSyncRoots;
        this.maintenanceDeferralLogKeys = new Set();
        this._chromaDefragPending  = false;
        this._chromaDefragInFlight = false;

        fs.ensureDirSync(this.dataDir);

        this.taskStateService.configure({
            stateFile      : this.stateFile,
            taskDefinitions: this.taskDefinitions,
            writeLogFn     : this.writeLog.bind(this)
        });

        this.processSupervisorService = {};
        this.processSupervisorService.recoverTasks();

        this.db = await this.initializeDatabaseFn(this.dbPath);

        if (this.swarmHeartbeatEnabled) {
            try {
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

    /** @summary Returns true when the Chroma supervised process exceeds max runtime. */
    isChromaRecycleDue(state, now) {
        const maxRuntimeMs = AiConfig.orchestrator.chroma.maxRuntimeMs;
        const lastRunAt    = state?.lastRunAt || 0;
        return Boolean(state?.running) && maxRuntimeMs > 0 && lastRunAt > 0 && (now - lastRunAt) > maxRuntimeMs;
    }

    /** @summary Resolves true when Chroma's TCP port accepts a connection. */
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

        const continuousTasks = [
            ...(this.chromaDaemonEnabled ? ['chroma'] : []),
            ...(this.bridgeDaemonEnabled ? ['bridgeDaemon'] : []),
            ...(this.devServerEnabled    ? ['devServer'] : []),
            ...(this.neuralLinkBridgeEnabled ? ['neuralLinkBridge'] : []),
            ...(this.embedDaemonEnabled  ? ['embedDaemon'] : []),
            'mlx',
            'lms'
        ];
        const RESTART_COOLDOWN_MS = 15000;
        for (const taskName of continuousTasks) {
            this.processSupervisorService.reapDuplicateListeners(taskName);

            const state = this.taskStateService.getTaskState(taskName);

            if (taskName === 'chroma' && this.isChromaRecycleDue(state, now)) {
                this.processSupervisorService.killTask('chroma', `max-runtime:${now - (state.lastRunAt || 0)}ms>${AiConfig.orchestrator.chroma.maxRuntimeMs}ms`);
                this._chromaDefragPending = true;
                continue;
            }

            this.processSupervisorService.superviseTask(taskName, now, RESTART_COOLDOWN_MS);

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

        runSchedulingPipeline({
            ...buildOrchestratorSchedulingOptions({orchestrator: this, config: AiConfig, now, registry: TASK_REGISTRY})
        });

        if (this.isPolling) {
            this.pollHandle = setTimeout(() => this.poll(), AiConfig.orchestrator.intervals.pollMs);
        }
    }
}

export default Neo.setupClass(Orchestrator);
