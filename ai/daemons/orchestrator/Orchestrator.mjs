// Class bootstrap belongs to `daemon.mjs`; this consumed class relies on global Neo.
import fs              from 'fs-extra';
import {spawn}         from 'child_process';
import net             from 'net';
import path            from 'path';
import Base            from '../../../src/core/Base.mjs';
import ClassSystemUtil from '../../../src/util/ClassSystem.mjs';
import AiConfig        from '../../config.mjs';
import HealthService, {
    createEmbeddingProbeTimeoutError
}                      from '../../services/memory-core/HealthService.mjs';
import SQLite          from '../../graph/storage/SQLite.mjs';
import MaintenanceBackpressureService, {
    DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
    DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES
} from './services/MaintenanceBackpressureService.mjs';
import {buildConfiguredTaskDefinitions as buildConfiguredTaskDefinitionsImport}   from './services/ConfiguredTaskDefinitionsService.mjs';
import PrimaryRepoSyncService                                                     from './services/PrimaryRepoSyncService.mjs';
import TenantRepoSyncService                                                      from './services/TenantRepoSyncService.mjs';
import {getDueTask as summaryGetDueTaskImport}                                    from './scheduling/summary.mjs';
import {getDueTask as backupGetDueTaskImport}                                     from './scheduling/backup.mjs';
import {getDueTask as graphLogCompactionGetDueTaskImport}                         from './scheduling/graphLogCompaction.mjs';
import {getDueTask as primaryDevSyncGetDueTaskImport}                             from './scheduling/primaryDevSync.mjs';
import {getDueTask as goldenPathGetDueTaskImport}                                 from './scheduling/goldenPath.mjs';
import {getDueTask as dreamGetDueTaskImport}                                      from './scheduling/dream.mjs';
import {getDueTask as embedDrainLivenessWatchdogGetDueTaskImport}                 from './scheduling/embedDrainLivenessWatchdog.mjs';
import memoryCoreConfig                                                           from '../../mcp/server/memory-core/config.mjs';
import MailboxService                                                             from '../../services/memory-core/MailboxService.mjs';
import WakeSubscriptionService                                                    from '../../services/memory-core/WakeSubscriptionService.mjs';
import RequestContextService                                                      from '../../mcp/server/shared/services/RequestContextService.mjs';
import {normalizeAgentIdentityNodeId}                                             from '../../graph/normalizeAgentIdentityNodeId.mjs';
import TaskStateService                                                           from './services/TaskStateService.mjs';
import ProcessSupervisorService                                                   from './services/ProcessSupervisorService.mjs';
import DeploymentRuntimeAccessService                                             from './services/DeploymentRuntimeAccessService.mjs';
import DeploymentStateBridgeService                                               from './services/DeploymentStateBridgeService.mjs';
import RecoveryActuatorService                                                    from './services/RecoveryActuatorService.mjs';
import ContainerHealthControllerService                                           from './services/ContainerHealthControllerService.mjs';
import ContainerHealthDiagnosisService                                            from './services/ContainerHealthDiagnosisService.mjs';
import {buildBootIdentitySource}                                                  from './services/buildBootIdentitySource.mjs';
import {recordBootIdentityFact}                                                   from './services/recordBootIdentityFact.mjs';
import DataIntegrityDiagnosisService                                              from './services/DataIntegrityDiagnosisService.mjs';
import DataRecoveryActuatorService                                                from './services/DataRecoveryActuatorService.mjs';
import {auditChromaVectorCoverage}                                                from '../../scripts/maintenance/checkChromaIntegrity.mjs';
import {createReEmbedMissingHeal, createReEmbedMissingHealOperation}              from '../../services/memory-core/helpers/reEmbedMissingHeal.mjs';
import {appendHealEvent, healEventsToRecentRuns, queryHealLedger, readHealLedger} from '../../services/memory-core/helpers/healEventLedgerStore.mjs';
import {validateHealLedgerRetention, HEAL_LEDGER_DIR_NAME}                        from '../../services/memory-core/helpers/healEventLedgerStore.mjs';
import {detectChronicUnsafeInput}                                                 from '../../services/memory-core/helpers/healActionDispatch.mjs';
import {quarantineCollection, storeFenceTargets, unquarantineCollection}          from '../../services/memory-core/helpers/quarantineStore.mjs';
import {createFreezeHealOperation, createStoreFenceOperations, runFreezeReprobe}  from '../../services/memory-core/helpers/freezeReprobeRunner.mjs';
import {createThrottleShedHealOperation}                                          from '../../services/memory-core/helpers/throttleShedHeal.mjs';
import {decideSystemicCircuit, foldSystemicCircuitState}                          from '../../services/memory-core/helpers/healSystemicCircuit.mjs';
import {
    Memory_ChromaManager as ChromaManager,
    Memory_GraphService as GraphService,
    Memory_StorageRouter as StorageRouter,
    Memory_TextEmbeddingService as TextEmbeddingService
} from '../../services.mjs';
import {createRestoreEmptyTargetOperation} from '../../services/memory-core/helpers/restoreEmptyTargetOperation.mjs';
import {createRestoreTargetSetStorage}     from '../../services/memory-core/helpers/restoreTargetSetStorage.mjs';
import {
    appendRestoreTargetSetTransition,
    readRestoreTargetSetTransitions
} from '../../services/memory-core/helpers/restoreTargetSetStateStore.mjs';
import {buildDataIntegrityCoverageDiagnosis}          from './services/dataIntegrityCoverageDiagnosis.mjs';
import {assembleDataIntegrityEvidence}                from './services/dataIntegrityEvidenceAssembler.mjs';
import {createLiveDimensionConsistencyGatherer}       from './services/dimensionConsistencyGatherer.mjs';
import DreamService                                   from './services/DreamService.mjs';
import SwarmHeartbeatService                          from './services/SwarmHeartbeatService.mjs';
import GoldenPathSynthesizer                          from '../../services/graph/GoldenPathSynthesizer.mjs';
import {getDueTask as tenantRepoSyncGetDueTaskImport} from './scheduling/tenantRepoSync.mjs';
import {TASK_REGISTRY}                                from './scheduling/registry.mjs';
import {
    buildOrchestratorSchedulingOptions,
    runSchedulingPipeline
} from './scheduling/pipeline.mjs';
import {DEFAULT_SCRIPT_DIR} from './taskDefinitions.mjs';
import {
    AUXILIARY_TASK_REGISTRY,
    buildAuthorityReceipt as buildTaskAuthorityReceipt,
    CONTINUOUS_TASK_REGISTRY,
    INTERNAL_TASK_REGISTRY,
    isTaskOwnedByProfile,
    partitionRegistryByAuthority,
    resolveAuthorityClassOwner
} from './taskAuthority.mjs';
import {acquireAuthorityLease, authorityLeaseFilename} from './authorityLease.mjs';
import {FileLeaseLostError}                            from '../shared/fileLease.mjs';
import {writeBootIdentityFact}                         from './services/bootIdentityFactStore.mjs';
import {getProviderActivityMetrics}                    from '../../services/shared/providerActivityLedger.mjs';
import {inspectProviderActivityStatus}                 from '../../services/shared/providerActivityStatusStore.mjs';
import {
    inspectHeavyMaintenanceLeaseSync,
    withHeavyMaintenanceLease
} from './services/heavyMaintenanceLeasePrimitives.mjs';
import {resolveCloudOnlyDefault} from './services/deploymentDurabilityPosture.mjs';

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
// Exported so a cross-module controller (e.g. the recovery actuator's B1 compose-service selection
// point) can consult a cloudOnly mode-gate without scattering raw `deploymentMode` reads — the
// reactive-config-as-single-source-of-truth pattern: read resolved leaves at the use site, never re-derive.
export function resolveCloudOnlyEnabled(key) {
    return resolveCloudOnlyDefault(AiConfig.orchestrator.cloudOnly[key], AiConfig.orchestrator.deploymentMode);
}

const LOG_RETENTION_DAYS = 30;

/**
 * @summary Rotates a daemon log file when its mtime falls on a prior calendar day.
 *
 * Renames the previous-day file to `<logFile>.YYYY-MM-DD` so the active file only ever holds the
 * current day's lines — bounding the otherwise-unbounded growth (the orchestrator polls every few
 * seconds, so its `writeLog` reliably triggers this once per day). Best-effort: failures are
 * swallowed — log integrity must never gate daemon liveness (mirrors the embed/message/wake daemons).
 * @param {String} logFile Active log file path.
 * @returns {void}
 */
export function rotateLogFileIfNewDay(logFile) {
    if (!logFile || !fs.existsSync(logFile)) return;

    try {
        const fileDay  = fs.statSync(logFile).mtime.toISOString().split('T')[0],
              todayDay = new Date().toISOString().split('T')[0];

        if (fileDay !== todayDay) {
            fs.renameSync(logFile, `${logFile}.${fileDay}`);
        }
    } catch (e) {
        // Best-effort; the daemon stays alive even if rotation fails.
    }
}

/**
 * @summary Prunes archived daemon log files older than the retention window.
 *
 * Deletes `<baseName>.*` archives (e.g. `orchestrator.log.2026-05-01`) whose mtime is older than
 * `retentionDays`, leaving the active `<baseName>` untouched. Best-effort; runs once at startup.
 * @param {Object} options
 * @param {String} options.dir Daemon data directory.
 * @param {String} options.baseName Active log file name (archives are `<baseName>.*`).
 * @param {Number} [options.retentionDays=LOG_RETENTION_DAYS] Days of archives to keep.
 * @returns {void}
 */
export function pruneOldDailyLogs({dir, baseName, retentionDays = LOG_RETENTION_DAYS}) {
    if (!dir || !baseName) return;

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    try {
        for (const entry of fs.readdirSync(dir)) {
            if (!entry.startsWith(`${baseName}.`) || entry === baseName) continue;

            const fullPath = path.join(dir, entry);

            try {
                if (fs.statSync(fullPath).mtime.getTime() < cutoff) {
                    fs.unlinkSync(fullPath);
                }
            } catch (e) {
                // Per-entry failure is non-fatal.
            }
        }
    } catch (e) {
        // Directory-listing failure is non-fatal.
    }
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
        className                        : 'Neo.ai.daemons.Orchestrator',
        singleton                        : true,
        processSupervisorService_        : null,
        deploymentRuntimeAccessService_  : null,
        deploymentStateBridgeService_    : null,
        recoveryActuatorService_         : null,
        containerHealthDiagnosisService_ : null,
        containerHealthControllerService_: null,
        dataRecoveryActuatorService_     : null,
        dataIntegrityDiagnosisService_   : null,
        maintenanceBackpressureService_  : MaintenanceBackpressureService,
        // null = "resolve from the owning config leaf on read" (see beforeGetDataDir): a leaf
        // value in this static block would freeze at module load, not at the use site.
        dataDir_                        : null,
        // Same contract as dataDir_: the singleton is constructed during module import, so a
        // class-field leaf read would still be a module-load capture.
        dbPath_                   : null,
        taskDefinitions_          : null,
        taskStateService_         : TaskStateService,
        healthService_            : HealthService,
        spawnFn_                  : spawn,
        heavyMaintenanceLeasePath_: null
    }

    primaryRepoSyncService   = PrimaryRepoSyncService
    tenantRepoSyncService    = TenantRepoSyncService
    dreamService             = DreamService
    swarmHeartbeatService    = SwarmHeartbeatService
    goldenPathSynthesizer    = GoldenPathSynthesizer
    initializeDatabaseFn     = initializeDatabaseSelfBootstrap
    /** @summary Reads the resolved provider-telemetry enablement leaf at use time. */
    providerActivityTelemetryEnabledReader = () => memoryCoreConfig.toolTelemetry.enabled
    /** @summary Reads recorder-owned health sidecars for the provider-activity projection. */
    providerActivityStatusReader = inspectProviderActivityStatus
    summaryGetDueTask        = summaryGetDueTaskImport
    backupGetDueTask         = backupGetDueTaskImport
    graphLogCompactionGetDueTask = graphLogCompactionGetDueTaskImport
    primaryDevSyncGetDueTask = primaryDevSyncGetDueTaskImport
    tenantRepoSyncGetDueTask = tenantRepoSyncGetDueTaskImport
    dreamGetDueTask          = dreamGetDueTaskImport
    goldenPathGetDueTask     = goldenPathGetDueTaskImport
    embedDrainLivenessWatchdogGetDueTask = embedDrainLivenessWatchdogGetDueTaskImport
    buildConfiguredTaskDefinitionsService = buildConfiguredTaskDefinitionsImport
    inspectHeavyMaintenanceLeaseFn = inspectHeavyMaintenanceLeaseSync
    recordBootIdentityFactFn       = recordBootIdentityFact

    isPolling                     = false
    pollHandle                    = null
    db                            = null
    logFile                       = null
    stateFile                     = null
    authorityProfile              = null
    authorityReceipt              = null
    authorityReceiptFile          = null
    primaryDevSyncRootsConfig     = null
    maintenanceDeferralLogKeys    = null
    heavyMaintenanceTaskNames     = DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES
    goldenPathDependencyTaskNames = DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES

    processSupervisorWriteLog = (level, msg) => this.writeLog(level, msg)
    deploymentRuntimeAccessWriteLog  = (level, msg) => this.writeLog(level, msg)
    deploymentStateBridgeWriteLog    = (level, msg) => this.writeLog(level, msg)
    containerHealthControllerWriteLog = (level, msg) => this.writeLog(level, msg)
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
        const subject         = `[embed-drain-stall] oldest un-embedded WAL record is ${ageHours}h old`;
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
     * @summary One-shot active alarm dispatcher for the REM consolidation-liveness watchdog.
     *
     * The watchdog's passive leg is the health record plus WARN log. This active leg mirrors
     * {@link #embedDrainLivenessAlarmDispatcher}: a durable swarm/operator A2A alarm carries the
     * consolidation-stall payload, then a best-effort wake pulse nudges the harness owner. Each leg is
     * independently guarded so alarm transport failures never suppress the passive liveness record.
     *
     * @param {Object} payload
     * @param {Boolean} payload.hasCycle Whether a successful REM cycle has ever been observed.
     * @param {String|null} payload.lastCompletedAt ISO timestamp of the last successful REM cycle.
     * @param {Number} payload.stalenessMs Age since the last successful REM cycle.
     * @param {Number} payload.undigestedCount Count of sessions still waiting for graph digestion.
     * @param {Number} payload.thresholdMs Stall threshold that tripped.
     * @param {Number|null} payload.stalledSince Epoch ms the stall was first observed.
     * @returns {Promise<void>}
     */
    remConsolidationLivenessAlarmDispatcher = async ({
        hasCycle,
        lastCompletedAt,
        stalenessMs,
        undigestedCount,
        thresholdMs,
        stalledSince
    } = {}) => {
        const sender = process.env.NEO_AGENT_IDENTITY
            ? normalizeAgentIdentityNodeId(process.env.NEO_AGENT_IDENTITY)
            : '@system';
        const stalledSinceIso = Number.isFinite(stalledSince) ? new Date(stalledSince).toISOString() : 'unknown';
        const staleHours      = (Number(stalenessMs || 0) / (60 * 60 * 1000)).toFixed(1);
        const subject         = hasCycle
            ? `[rem-consolidation-stall] last REM cycle is ${staleHours}h stale`
            : `[rem-consolidation-stall] no REM cycle recorded with ${undigestedCount} undigested sessions`;
        const body =
            `The REM consolidation-liveness watchdog detected a STALLED graph-digestion pipeline.\n\n` +
            `- last successful REM cycle: ${lastCompletedAt || 'none recorded'}\n` +
            `- age since last successful cycle: ${stalenessMs}ms (~${staleHours}h)\n` +
            `- undigested session count: ${undigestedCount}\n` +
            `- stall threshold: ${thresholdMs}ms\n` +
            `- stalled since: ${stalledSinceIso}\n\n` +
            `Golden Path can keep producing a fresh forecast while the graph stops absorbing sessions. ` +
            `Investigate the dream / REM consolidation lane on the host that owns local graph digestion.`;

        try {
            await RequestContextService.run({agentIdentityNodeId: sender}, async () => {
                await MailboxService.addMessage({to: 'AGENT:*', subject, body, priority: 'high'});
            });
        } catch (e) {
            this.writeLog('ERROR', `[Orchestrator] REM consolidation stall-alarm A2A broadcast failed: ${e.message}`);
        }

        const targetIdentity = this.swarmHeartbeatIdentity;
        if (targetIdentity) {
            try {
                await WakeSubscriptionService.emitHeartbeatPulse({targetIdentity: normalizeAgentIdentityNodeId(targetIdentity)});
            } catch (e) {
                this.writeLog('ERROR', `[Orchestrator] REM consolidation stall-alarm wake pulse failed: ${e.message}`);
            }
        }
    }

    /**
     * @summary Resolves the runtime-state directory from the owning config leaf when no explicit
     * value was set — a per-read use-site resolution, never a module-load capture.
     * @param {String|null} value
     * @returns {String}
     */
    beforeGetDataDir(value) {
        return value ?? AiConfig.orchestrator.dataDir
    }

    /**
     * @summary Resolves the graph database path from the owning config leaf when no explicit value
     * was set, preserving Provider refreshes before orchestrator start.
     * @param {String|null} value
     * @returns {String}
     */
    beforeGetDbPath(value) {
        return value ?? AiConfig.orchestrator.dbPath
    }

    /**
     * @param {Neo.ai.daemons.services.ProcessSupervisorService|Object|null} value
     * @returns {Neo.ai.daemons.services.ProcessSupervisorService}
     */
    beforeSetProcessSupervisorService(value) {
        return ClassSystemUtil.beforeSetInstance(value, ProcessSupervisorService, {
            // Resolved at the use site and injected across the narrow construction seam (ADR-0019 // ticket-ref-ok: the ADR is the authority assigning env resolution to the leaf, not background reading
            // §5.1/§5.5). The supervisor never reads the env var itself.
            supervisedTaskHeapMb   : AiConfig.orchestrator.supervisedTaskHeapMb,
            dataDir                : this.dataDir,
            taskDefinitions        : this.getAuthorityScopedTaskDefinitions(),
            taskStateService       : this.taskStateService,
            healthService          : this.healthService,
            recoveryActuatorService: this.recoveryActuatorService,
            writeLog               : this.processSupervisorWriteLog,
            spawnFn                : this.spawnFn
        });
    }

    /**
     * @param {Neo.ai.daemons.services.DeploymentRuntimeAccessService|Object|null} value
     * @returns {Neo.ai.daemons.services.DeploymentRuntimeAccessService}
     */
    beforeSetDeploymentRuntimeAccessService(value) {
        return ClassSystemUtil.beforeSetInstance(value, DeploymentRuntimeAccessService, {
            runtimeAccessConfig: AiConfig.orchestrator.deploymentRuntimeAccess,
            writeLog           : this.deploymentRuntimeAccessWriteLog
        });
    }

    /**
     * @param {Neo.ai.daemons.services.ContainerHealthDiagnosisService|Object|null} value
     * @returns {Neo.ai.daemons.services.ContainerHealthDiagnosisService}
     */
    beforeSetContainerHealthDiagnosisService(value) {
        // Resolved at the use site and injected — the service holds no env reader of its own.
        // ticket-ref-ok: the config SSOT decision assigns env/default resolution to the leaf
        const {restartChurn} = AiConfig.orchestrator;

        return ClassSystemUtil.beforeSetInstance(value, ContainerHealthDiagnosisService, {
            diagnosisConfig: {
                restartChurnSeverity : restartChurn.severity,
                restartChurnThreshold: restartChurn.threshold,
                restartChurnWindowMs : restartChurn.windowMs
            }
        });
    }

    /**
     * @summary Builds the reactive controller that routes container-health diagnoses to the actuator.
     *
     * The heal-ledger dir and its retention are resolved HERE, at the use site, and injected — the
     * controller holds no config reader of its own, and binding to the same `dataDir` leaf the bridge's
     * `selfHeal` reader uses is what makes a controller heal-event visible in the snapshot at all.
     *
     * @param {Neo.ai.daemons.services.ContainerHealthControllerService|Object|null} value
     * @returns {Neo.ai.daemons.services.ContainerHealthControllerService}
     */
    beforeSetContainerHealthControllerService(value) {
        const {healLedger} = AiConfig.orchestrator.recoveryActuator;

        return ClassSystemUtil.beforeSetInstance(value, ContainerHealthControllerService, {
            recoveryActuator   : this.recoveryActuatorService,
            // Per-effect fence. The batch-level pulse in `consumeContainerHealthDecisions` answers "may
            // this sweep act"; this answers "may THIS service be acted on now", which is a different
            // question once a snapshot carries several unhealthy services and each actuation takes time.
            isAuthorityHeld    : () => !this.authorityLeaseLost && this.pulseAuthorityLease() === 'held',
            // Only the residual-Ollama route consumes this. It is carried through the actuator to
            // the runtime's last-owned boundary, where a newly admitted provider request vetoes the
            // restart after every intervening cooldown/target-resolution await.
            isEffectStillAdmitted: decision => decision?.diagnosis?.details?.classificationReason !==
                'ollama-residual-load-restart' || this.isOllamaResidualRestartStillAdmitted(),
            healLedgerDir      : path.join(this.dataDir, HEAL_LEDGER_DIR_NAME),
            healLedgerRetention: validateHealLedgerRetention(healLedger.maxEvents, healLedger.pruneTriggerBytes),
            writeLog           : this.containerHealthControllerWriteLog
        });
    }

    /**
     * @param {Neo.ai.daemons.services.DeploymentStateBridgeService|Object|null} value
     * @returns {Neo.ai.daemons.services.DeploymentStateBridgeService}
     */
    beforeSetDeploymentStateBridgeService(value) {
        return ClassSystemUtil.beforeSetInstance(value, DeploymentStateBridgeService, {
            runtimeAccessService       : this.deploymentRuntimeAccessService,
            diagnosisService           : this.containerHealthDiagnosisService,
            taskStateService           : this.taskStateService,
            tenantRepoSyncService      : this.tenantRepoSyncService,
            tenantRepoSyncEnabledReader: () => this.tenantRepoSyncEnabled,
            providerActivityProbe      : options => this.readProviderActivityProjection(options),
            providerActivityWindowMs   : memoryCoreConfig.toolTelemetry.aggregateWindowMs,
            providerActivityLimit      : memoryCoreConfig.toolTelemetry.aggregateLimit,
            healLedgerDir              : path.join(this.dataDir, HEAL_LEDGER_DIR_NAME),
            writeLog                   : this.deploymentStateBridgeWriteLog
        });
    }

    /**
     * @summary Reads the recorder-owned provider ledger from the canonical container-plane database.
     * Disabled, unavailable, or unhealthy recorder state is explicit and can never mean idle.
     * @param {Object} options
     * @param {Number} options.sinceTs Inclusive recent-completion cutoff.
     * @param {Number} options.limit Projection row bound.
     * @param {Number} options.observedAt Observation epoch.
     * @returns {Object}
     */
    readProviderActivityProjection({sinceTs, limit, observedAt}) {
        if (this.providerActivityTelemetryEnabledReader() !== true) {
            return {status: 'unavailable', unavailableReason: 'provider-activity-disabled'};
        }

        // Container-plane boot opens this exact shared graph database before polling. Do not depend
        // on GraphService readiness: swarm heartbeat is one initializer, but intentionally defaults
        // off on canonical Agent OS deployments.
        const db = this.db;

        if (!db) return {status: 'unavailable', unavailableReason: 'graph-database-unavailable'};

        const projection = getProviderActivityMetrics(db, {sinceTs, limit, now: observedAt}),
              observer   = this.providerActivityStatusReader({
                  dbPath: memoryCoreConfig.storagePaths.graph,
                  sinceTs
              });

        return {
            ...projection,
            status: observer.status,
            ...(observer.status === 'ok' ? {} : {unavailableReason: 'recorder-status-not-ok'})
        };
    }

    /**
     * @summary Revalidates zero live provider demand at the lifecycle effect boundary.
     * @returns {Boolean}
     */
    isOllamaResidualRestartStillAdmitted() {
        const observedAt = Date.now(),
              projection = this.readProviderActivityProjection({
                  sinceTs: observedAt - memoryCoreConfig.toolTelemetry.aggregateWindowMs,
                  limit  : memoryCoreConfig.toolTelemetry.aggregateLimit,
                  observedAt
              });

        return projection.status === 'ok' && projection.totalInFlight === 0 &&
            projection.inFlightTruncated === false && Array.isArray(projection.inFlight) &&
            projection.inFlight.length === 0;
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

    /**
     * @param {Neo.ai.daemons.services.RecoveryActuatorService|Object|null} value
     * @returns {Neo.ai.daemons.services.RecoveryActuatorService}
     */
    beforeSetRecoveryActuatorService(value) {
        return ClassSystemUtil.beforeSetInstance(value, RecoveryActuatorService, {
            dataDir                       : this.dataDir,
            deploymentRuntimeAccessService: this.deploymentRuntimeAccessService,
            healthService                 : this.healthService,
            processSupervisorService      : this.processSupervisorService,
            writeLog                      : this.processSupervisorWriteLog,
            actuatorConfig                : AiConfig.orchestrator.recoveryActuator
        });
    }

    /**
     * @param {Neo.ai.daemons.services.DataRecoveryActuatorService|Object|null} value
     * @returns {Neo.ai.daemons.services.DataRecoveryActuatorService}
     */
    beforeSetDataRecoveryActuatorService(value) {
        const reEmbedMissing = createReEmbedMissingHeal({
            embedFn          : documents => TextEmbeddingService.embedTexts(documents, AiConfig.embeddingProvider),
            auditCoverage    : ({evidence}) => ({missingVectorIds: Array.isArray(evidence?.missingVectorIds) ? evidence.missingVectorIds : []}),
            expectedDimension: AiConfig.vectorDimension
        });

        const healLedgerDir      = path.join(this.dataDir, HEAL_LEDGER_DIR_NAME);
        const freezeRecordsDir   = path.join(this.dataDir, 'data-freeze-records');
        const restoreLedgerDir   = path.join(this.dataDir, 'restore-empty-target-ledger');
        const restoreStagingRoot = path.join(this.dataDir, 'restore-empty-target-staging');

        let restoreStoragePromise = null;

        const getRestoreStorage = () => {
            if (!restoreStoragePromise) {
                restoreStoragePromise = (async () => {
                    await Promise.all([
                        StorageRouter.ready(),
                        ChromaManager.ready(),
                        GraphService.ready()
                    ]);

                    const graphDb = GraphService.db?.storage?.db;
                    if (!graphDb) {
                        throw new Error('restore-empty-target requires the live Memory Core graph database')
                    }

                    return createRestoreTargetSetStorage({
                        chromaClient          : ChromaManager.client,
                        dummyEmbeddingFunction: AiConfig.dummyEmbeddingFunction,
                        graphDb,
                        expectedDestinations  : {
                            memories : memoryCoreConfig.collections.memory,
                            summaries: memoryCoreConfig.collections.session,
                            graph    : memoryCoreConfig.storagePaths.graph
                        },
                        stagingRoot              : restoreStagingRoot,
                        invalidateCollectionCache: type => ChromaManager.invalidateCollectionCache(type),
                        syncGraphCache           : () => GraphService.db?.syncCache?.()
                    })
                })()
            }

            return restoreStoragePromise
        };

        const restoreEmptyTarget = createRestoreEmptyTargetOperation({
            withWriterFence: async (identity, task) => {
                const result = await withHeavyMaintenanceLease(task, {
                    owner       : 'restore-empty-target',
                    reason      : 'target-set-recovery',
                    metadata    : identity,
                    leasePath   : this.maintenanceBackpressureService.resolveHeavyMaintenanceLeasePath(),
                    staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs
                });

                return ['completed', 'inherited'].includes(result.status)
                    ? result.result
                    : {
                        status: 'deferred',
                        detail: {
                            reason: 'writer-fence-not-acquired',
                            holder: result.lease?.owner ?? null
                        }
                    }
            },
            inspectFreshTargetSet: async context =>
                (await getRestoreStorage()).inspectFreshTargetSet(context),
            stageTargetSet: async context =>
                (await getRestoreStorage()).stageTargetSet(context),
            validateStagedTargetSet: async context =>
                (await getRestoreStorage()).validateStagedTargetSet(context),
            promoteComponent: async context =>
                (await getRestoreStorage()).promoteComponent(context),
            revalidateProductionTargetSet: async context =>
                (await getRestoreStorage()).revalidateProductionTargetSet(context),
            reconcileAttempt: async context =>
                (await getRestoreStorage()).reconcileAttempt(context),
            cleanupUnpromotedStaging: async context =>
                (await getRestoreStorage()).cleanupUnpromotedStaging(context),
            cleanupCommittedArtifacts: async context =>
                (await getRestoreStorage()).cleanupCommittedArtifacts(context),
            readTransitions: ({attemptFingerprint}) => readRestoreTargetSetTransitions({
                dir: restoreLedgerDir,
                attemptFingerprint
            }),
            appendTransition: transition => appendRestoreTargetSetTransition(
                transition,
                {dir: restoreLedgerDir}
            )
        });

        return ClassSystemUtil.beforeSetInstance(value, DataRecoveryActuatorService, {
            healOperations: {
                // The wal-stall heal terminal: the runtime<->op adapter (cross-store guard + re-audit-for-ids
                // + handle resolution) lives in createReEmbedMissingHealOperation so its branch logic is
                // unit-tested against mocked collaborators rather than only the live stack.
                're-embed-missing': createReEmbedMissingHealOperation({
                    reEmbedMissing,
                    ready                  : () => StorageRouter.ready(),
                    getMemoryCollection    : () => StorageRouter.getMemoryCollection(),
                    resolveMissingVectorIds: async collectionName => {
                        const coverage = await auditChromaVectorCoverage({
                                  persistDir     : AiConfig.engines.chroma.dataDir,
                                  collectionNames: [collectionName],
                                  includeFullIds : true
                              }),
                              drift = coverage.collections?.find(entry => entry.name === collectionName);

                        return Array.isArray(drift?.missingVectorIds) ? drift.missingVectorIds : [];
                    }
                }),
                // Quarantine-from-serving: the safe-default terminal for non-losslessly-recoverable corruption.
                // Fences the collection (queryMemories / querySummaries fail-fast) until a repair or a clean
                // re-audit lifts it. Lossless — no data mutated, no operator.
                quarantine: async ({collection, evidence, now} = {}) => {
                    // A store-level fault (sqlite-integrity) targets the service id, not a served collection, so
                    // fence every served collection in the store — else no query guard observes the fence. The served
                    // collection NAMES are owned by the Memory Core config (memoryCoreConfig.collections), the SSOT the
                    // store consumers read — NOT top-level AiConfig (which has no `collections` key).
                    const targets = storeFenceTargets(collection, [memoryCoreConfig.collections.memory, memoryCoreConfig.collections.session]);

                    for (const target of targets) {
                        await quarantineCollection(target, {
                            dir   : AiConfig.engines.chroma.dataDir,
                            reason: evidence?.reasonCode ?? evidence?.mode ?? collection,
                            now
                        });
                    }

                    return {status: 'quarantined', detail: {collection, fenced: targets}};
                },
                // Freeze-from-serving: the safe terminal for a systemic / dimension-systemic fault. Fences the
                // served collections (mirrors quarantine) AND persists a freeze-record so the autonomous re-probe
                // cycle can auto-unfreeze when the fault clears — in cloud there is no operator (the #1 weeks-bar risk).
                freeze: createFreezeHealOperation({
                    freezeRecordsDir,
                    // Symmetric store-level fence (memory + session) — paired with the re-probe auto-unfence via the
                    // same `createStoreFenceOperations` factory, so a freeze and its later auto-unfreeze lift exactly
                    // the same served set (they cannot diverge into the unfreeze-lifts-only-the-record-key asymmetry).
                    fence: this.getStoreFenceOperations().fence
                }),
                // Throttle-shed: the resource-contention / exhaustion heal — open a bounded shed-window so the
                // orchestrator defers ALL heavy-maintenance until the contended resource recovers, then auto-expires
                // (no operator). The lazy closure resolves the live `maintenanceBackpressureService` at heal-time,
                // so it is independent of reactive-config set ordering.
                'throttle-shed': createThrottleShedHealOperation({
                    setShedWindow: (durationMs, now) => this.maintenanceBackpressureService.setShedWindow(durationMs, now)
                }),
                'restore-empty-target': restoreEmptyTarget
            },
            // The ledger is observability, never a gate: readHealLedger now THROWS on an unreadable FILE, so an
            // unreadable ledger must not block a heal — degrade the anti-thrash projection to "no recent runs".
            recentRunsReader : async targetKey => {
                let events = [];
                try {
                    events = await readHealLedger({dir: healLedgerDir});
                } catch (error) {
                    this.writeLog?.('WARN', `[Orchestrator] heal-ledger read failed for recentRuns; proceeding with none: ${error.message}`);
                }
                return healEventsToRecentRuns(queryHealLedger(events, {collections: [targetKey]}));
            },
            // Retention is read + VALIDATED from the AiConfig provider at the append boundary; the pure ledger helper
            // owns no production default.
            recordRun        : async ({action, collection, recoveryUnitKey, at}) => appendHealEvent(
                {type: action, collection: collection ?? recoveryUnitKey, status: 'attempt'},
                {
                    dir: healLedgerDir,
                    now: at,
                    ...validateHealLedgerRetention(
                        AiConfig.orchestrator.recoveryActuator.healLedger.maxEvents,
                        AiConfig.orchestrator.recoveryActuator.healLedger.pruneTriggerBytes
                    )
                }
            ),
            recordHealOutcome: async ({action, collection, recoveryUnitKey, status, detail, healedAt}) => appendHealEvent(
                {type: action, collection: collection ?? recoveryUnitKey, status, detail},
                {
                    dir: healLedgerDir,
                    now: healedAt,
                    ...validateHealLedgerRetention(
                        AiConfig.orchestrator.recoveryActuator.healLedger.maxEvents,
                        AiConfig.orchestrator.recoveryActuator.healLedger.pruneTriggerBytes
                    )
                }
            )
        });
    }

    /**
     * @summary Health probe for the freeze re-probe cycle: has the systemic fault that tripped the freeze
     * cleared? A canary embed (the same `TextEmbeddingService` the heal path uses) checks BOTH signals at once —
     * a successful embed proves the embedder is healthy, and a correct-dimension vector proves dimension
     * consistency. Any error → an inconclusive reading, so `decideFreezeReprobe` fails closed to stay-frozen. The
     * embedder fault is systemic, so the canary is collection-agnostic (the parameter satisfies the cycle contract).
     * @param {String} [collectionName] The frozen collection (unused — the embedder health is systemic).
     * @param {Object} [options={}] Test-isolation seams; production callers omit this object.
     * @param {Function} [options.embedTexts] Embedding transport seam.
     * @param {Number} [options.timeoutMs] Deadline override for deterministic tests.
     * @returns {Promise<{embedderHealthy: Boolean, dimensionConsistent: Boolean}>}
     */
    async probeFrozenCollectionHealth(collectionName, options = {}) {
        const
            embedTexts     = options.embedTexts || ((texts, provider, embedOptions) => TextEmbeddingService.embedTexts(texts, provider, embedOptions)),
            operationLabel = 'Orchestrator freeze re-probe',
            timeoutMs      = options.timeoutMs ?? AiConfig.orchestrator.recoveryActuator.freezeReprobeTimeoutMs;

        let timeoutId;

        try {
            const controller    = new AbortController(),
                  timeoutError  = createEmbeddingProbeTimeoutError(operationLabel, timeoutMs),
                  deadline      = new Promise((_, reject) => {
                      timeoutId = setTimeout(() => {
                          reject(timeoutError);
                          controller.abort(timeoutError);
                      }, timeoutMs);
                  });

            const [vector] = await Promise.race([
                      embedTexts(
                          ['__freeze-reprobe-health-canary__'],
                          AiConfig.embeddingProvider,
                          {signal: controller.signal, operationLabel}
                      ),
                      deadline
                  ]),
                  ok       = Array.isArray(vector) && vector.length === AiConfig.vectorDimension;

            return {embedderHealthy: ok, dimensionConsistent: ok};
        } catch (error) {
            return {embedderHealthy: false, dimensionConsistent: false}; // inconclusive → stay frozen (fail closed)
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * @summary The symmetric store-level fence/unfence pair used by BOTH the `freeze` heal-op and the re-probe
     * auto-unfreeze — built from one factory (`createStoreFenceOperations`) so they cannot diverge: a store-level
     * freeze fences the served collections (memory + session) and the auto-unfreeze lifts exactly that same set.
     * @returns {{fence: Function, unfence: Function, expandTargets: Function}}
     */
    getStoreFenceOperations() {
        return createStoreFenceOperations({
            quarantine  : quarantineCollection,
            unquarantine: unquarantineCollection,
            expand      : storeFenceTargets,
            // Served collection NAMES come from the Memory Core config SSOT (memoryCoreConfig.collections — the same
            // source the quarantine op + the store consumers read), NOT top-level AiConfig (no `collections` key).
            servedCollections: [memoryCoreConfig.collections.memory, memoryCoreConfig.collections.session],
            quarantineOptions: {dir: AiConfig.engines.chroma.dataDir}
        });
    }

    /**
     * @summary Routes one snapshot's container-health diagnoses to the recovery actuator.
     *
     * Consumed from the bridge's RESULT rather than from inside its collection loop, and the ordering
     * is the safety property. `writeSnapshotIfDue` evaluates its `shouldWrite` fence AFTER the async
     * collect, so an authority-lease loss that lands mid-collection voids the write — actuating inside
     * the loop would have already restarted a sibling by then. Only a `written` result carries a
     * snapshot this instance was still entitled to publish, so only that result is routed; `disabled`,
     * `skipped`, `in-flight` and `fenced` all correctly do nothing.
     *
     * The lease is re-read at this effect boundary too, because the write and the heal are separate
     * effects and the second one can be reached after the first has completed.
     *
     * **Gated on deployment runtime access being granted, and that gate is load-bearing.** This is the
     * container-LIFECYCLE controller: without a runtime handle its primary action is impossible —
     * `applyLifecycle` refuses with `runtime-access-disabled` — and every container fact degrades to
     * `runtime-read-failed`, so the plane this controller was designed for does not exist. Consuming
     * anyway would spend real recovery attempts, and write real ledger entries, on a deployment that
     * is structurally unable to be healed by it. Access is off by default, which is also why merely
     * running the orchestrator on a developer machine does not start actuating.
     *
     * Read from the injected service's own config rather than re-derived from `AiConfig`, so the gate
     * and the refusal it anticipates are reading one value.
     *
     * Never throws into the poll — a controller failure degrades healing, and must not take the
     * snapshot's own error path with it.
     *
     * @param {Object|null} result The `writeSnapshotIfDue` result.
     * @returns {Promise<Object[]>} Per-service control outcomes, or `[]` when nothing was routed.
     */
    async consumeContainerHealthDecisions(result) {
        if (result?.status !== 'written' || this.authorityLeaseLost || !this.containerHealthControllerService) {
            return [];
        }

        if (this.deploymentRuntimeAccessService?.runtimeAccessConfig?.enabled !== true) {
            return [];
        }

        // LIVE re-pulse, not another read of the latch, and the distinction is the whole point.
        // `authorityLeaseLost` is set by `pulseAuthorityLease` once at poll start, so it reports what
        // was true when the sweep began. A predecessor paused past the lease TTL — a long GC pause, a
        // suspended VM — resumes with that latch still `false` after a successor has already reclaimed
        // the lease, and would then restart a container on a plane it no longer owns. Every other
        // deferred-write fence in this class re-reads the latch, which is adequate when the effect is a
        // stale fact file and is NOT adequate for a privileged lifecycle write: two orchestrators
        // restarting the same containers is the failure this lease exists to prevent.
        //
        // `pulse()` touches the lease itself, so `held` is an answer about the present rather than
        // about the start of the sweep. Anything else — `lost` or `contended` — declines to act;
        // unverified is not held, and the next cadence re-observes an unhealthy service anyway.
        if (this.pulseAuthorityLease() !== 'held') {
            return [];
        }

        try {
            return await this.containerHealthControllerService.consumeSnapshot({snapshot: result.snapshot});
        } catch (error) {
            this.writeLog('ERROR', `[Orchestrator] Container-health control cycle failed: ${error.message}`);

            return [];
        }
    }

    /**
     * @summary Runs one autonomous freeze re-probe tick (the recovery counterpart to the `freeze` actuator op):
     * for every frozen collection it re-probes health and auto-unfreezes + re-heals a cleared fault, stays frozen
     * while it persists, or contains it past the thrash cap — all under `decideFreezeReprobe`'s back-off, never an
     * operator. In cloud a transient embedder fault must not permanently kill a collection (the #1 weeks-bar risk).
     * No-op (a cheap read only) when nothing is frozen; never throws into the poll (the caller swallows).
     * @param {Number} [now] Injected clock (epoch ms).
     * @returns {Promise<Object[]>} Per-collection re-probe outcomes, or `[]` when nothing is frozen.
     */
    async runFreezeReprobeCycleIfActive(now = Date.now()) {
        return runFreezeReprobe({
            freezeRecordsDir   : path.join(this.dataDir, 'data-freeze-records'),
            healLedgerDir      : path.join(this.dataDir, HEAL_LEDGER_DIR_NAME),
            healLedgerRetention: validateHealLedgerRetention(
                AiConfig.orchestrator.recoveryActuator.healLedger.maxEvents,
                AiConfig.orchestrator.recoveryActuator.healLedger.pruneTriggerBytes
            ),
            now,
            probe              : collectionName => this.probeFrozenCollectionHealth(collectionName),
            // The store-level unfence — paired with the `freeze` op's fence via createStoreFenceOperations, so a
            // store-level freeze and its auto-unfreeze lift exactly the same served set (no asymmetry).
            // Effect-boundary lease fence: an unfence mutates the served plane, so a loss detected
            // while the re-probe was in flight must ABORT the success pipeline — a silent skip would
            // still ledger the unfreeze, tombstone the record, and report `unfrozen` over a store
            // that was never unfenced. The throw routes to the cycle's `failed` outcome: stays
            // frozen, no success bookkeeping, re-probed by the rightful holder next cycle.
            unfence            : async (...args) => {
                if (this.authorityLeaseLost) {
                    throw new FileLeaseLostError({
                        lockPath: authorityLeaseFilename(this.authorityProfile),
                        pid     : process.pid,
                        reason  : 'unfence fenced — the authority lease was lost mid-reprobe'
                    });
                }

                return this.getStoreFenceOperations().unfence(...args);
            }
        });
    }

    /**
     * @param {Neo.ai.daemons.services.DataIntegrityDiagnosisService|Object|null} value
     * @returns {Neo.ai.daemons.services.DataIntegrityDiagnosisService}
     */
    beforeSetDataIntegrityDiagnosisService(value) {
        return ClassSystemUtil.beforeSetInstance(value, DataIntegrityDiagnosisService, {
            serviceId       : this.dataIntegrityServiceId,
            recoveryActuator: this.dataRecoveryActuatorService,
            evidenceGatherer: this.dataIntegrityEvidenceGatherer,
            // Reversibility: a clean re-audit (terminalAction `none`) lifts the serving fence. The store-level
            // fence is per-served-collection, so each lifts as it re-audits clean.
            liftQuarantine  : async collection => unquarantineCollection(collection, {dir: AiConfig.engines.chroma.dataDir}),
            // Systemic circuit-breaker: fold the heal-ledger → decide whether a cross-collection embedder outage
            // should suppress this cycle's heals (bounds read FRESH from the AiConfig recovery-actuator leaf).
            systemicCircuitGate: async ({now}) => {
                const dir                               = path.join(this.dataDir, HEAL_LEDGER_DIR_NAME),
                      bounds                            = AiConfig.orchestrator.recoveryActuator.systemicCircuit,
                      {recentFailures, circuitOpenedAt} = foldSystemicCircuitState(await readHealLedger({dir}), {now, windowMs: bounds.windowMs});
                return decideSystemicCircuit({recentFailures, circuitOpenedAt, now, bounds});
            },
            recordCircuitEvent: async ({type, at, detail}) => appendHealEvent(
                {type, collection: '*', status: type === 'circuit-open' ? 'open' : 'close', detail},
                {
                    dir: path.join(this.dataDir, HEAL_LEDGER_DIR_NAME),
                    now: at,
                    ...validateHealLedgerRetention(
                        AiConfig.orchestrator.recoveryActuator.healLedger.maxEvents,
                        AiConfig.orchestrator.recoveryActuator.healLedger.pruneTriggerBytes
                    )
                }
            ),
            // Chronic unsafe-input mis-wire detector (observability): fold the heal-ledger for sustained
            // unsafe-input per (action, collection); bounds read FRESH from the AiConfig recovery-actuator leaf.
            chronicUnsafeInputDetector: async ({now}) => {
                const dir    = path.join(this.dataDir, HEAL_LEDGER_DIR_NAME),
                      bounds = AiConfig.orchestrator.recoveryActuator.chronicUnsafeInput;
                return detectChronicUnsafeInput(await readHealLedger({dir}), {threshold: bounds.threshold, windowMs: bounds.windowMs, now});
            }
        });
    }

    afterSetDataDir(value, oldValue) {
        if (oldValue === undefined) return;
        this.processSupervisorService.dataDir          = value;
        this.recoveryActuatorService.dataDir           = value;
        this.maintenanceBackpressureService.dataDir    = value;
        // The bridge derives its heal-ledger dir from dataDir at construction — keep it coherent when dataDir
        // changes at runtime, else the actuator writes the NEW ledger while the bridge keeps reading the OLD one.
        if (this.deploymentStateBridgeService) {
            this.deploymentStateBridgeService.healLedgerDir = path.join(value, HEAL_LEDGER_DIR_NAME);
        }
        // Same reasoning, third writer: the controller appends the lifecycle heal-events the bridge folds.
        if (this.containerHealthControllerService) {
            this.containerHealthControllerService.healLedgerDir = path.join(value, HEAL_LEDGER_DIR_NAME);
        }
    }
    afterSetTaskDefinitions(value, oldValue) {
        if (oldValue === undefined) return;
        this.processSupervisorService.taskDefinitions       = this.getAuthorityScopedTaskDefinitions(value);
        this.maintenanceBackpressureService.taskDefinitions = value;
    }
    // Service-graph reconciliation, not arbitrary circular wiring: the supervisor needs the actuator to
    // route its escalate-only diagnoses (a failed maintenance task), and the actuator needs the supervisor
    // to execute restart/recover actions. Each setter back-links the other so either arrival order
    // converges to the same bidirectional pair.
    afterSetProcessSupervisorService(value, oldValue) {
        if (this.recoveryActuatorService) {
            this.recoveryActuatorService.processSupervisorService = value;
            if (value) {
                value.recoveryActuatorService = this.recoveryActuatorService;
            }
        }
    }
    afterSetRecoveryActuatorService(value, oldValue) {
        if (this.processSupervisorService) {
            this.processSupervisorService.recoveryActuatorService = value;
        }
        // Arrival-order independence, same contract as the supervisor back-link above: the controller is
        // constructed after the actuator, but a runtime actuator swap must reach it too — a controller
        // holding a stale actuator would route into an envelope nothing else is counting against.
        if (this.containerHealthControllerService) {
            this.containerHealthControllerService.recoveryActuator = value;
        }
    }
    afterSetTaskStateService(value, oldValue) {
        if (oldValue === undefined) return;
        this.processSupervisorService.taskStateService       = value;
        this.maintenanceBackpressureService.taskStateService = value;
        if (this.deploymentStateBridgeService) {
            this.deploymentStateBridgeService.taskStateService = value;
        }
    }
    afterSetHealthService(value, oldValue) {
        if (oldValue === undefined) return;
        this.processSupervisorService.healthService       = value;
        this.recoveryActuatorService.healthService        = value;
        this.maintenanceBackpressureService.healthService = value;
    }
    afterSetDeploymentRuntimeAccessService(value, oldValue) {
        if (this.recoveryActuatorService) {
            this.recoveryActuatorService.deploymentRuntimeAccessService = value;
        }
        if (this.deploymentStateBridgeService) {
            this.deploymentStateBridgeService.runtimeAccessService = value;
        }
    }
    afterSetContainerHealthDiagnosisService(value, oldValue) {
        if (this.deploymentStateBridgeService) {
            this.deploymentStateBridgeService.diagnosisService = value;
        }
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

    get kbSyncEnabled()                  { return resolveCloudOnlyEnabled('kbSyncEnabled');                   }
    get githubWorkflowSyncEnabled()      { return resolveDeploymentEnabled('githubWorkflowSyncEnabled');      }
    get primaryDevSyncEnabled()          { return resolveDeploymentEnabled('primaryDevSyncEnabled');          }
    get tenantRepoSyncEnabled()          { return resolveCloudOnlyEnabled('tenantRepoSyncEnabled');           }
    get composeServiceRecoveryEnabled()  { return resolveCloudOnlyEnabled('composeServiceRecoveryEnabled');   }
    get chromaDaemonEnabled()            { return resolveDeploymentEnabled('chromaDaemonEnabled');            }
    get bridgeDaemonEnabled()            { return resolveDeploymentEnabled('bridgeDaemonEnabled');            }
    get devServerEnabled()               { return resolveLocalDeploymentDefault(AiConfig.orchestrator.devServer.enabled); }
    get neuralLinkBridgeEnabled()        { return resolveDeploymentEnabled('neuralLinkBridgeEnabled');        }
    get embedDaemonEnabled()             { return resolveDeploymentEnabled('embedDaemonEnabled');             }
    get messageDaemonEnabled()           { return resolveDeploymentEnabled('messageDaemonEnabled');           }
    get embedDrainLivenessWatchdogWalDir()      { return memoryCoreConfig.memoryWal.dir; }
    get embedDrainLivenessWatchdogThresholdMs() { return memoryCoreConfig.memoryWal.embedDrainStallThresholdMs; }
    get remConsolidationWatchdogRunStateDir()   { return memoryCoreConfig.remRunStateDir; }
    get remConsolidationWatchdogThresholdMs()   { return memoryCoreConfig.remConsolidationStallThresholdMs; }
    /** @summary The Memory Core compose-service id targeted by data-integrity diagnoses. */
    get dataIntegrityServiceId() { return 'mc-server'; }
    /**
     * @summary Builds the read-only Chroma vector-coverage gatherer for the data-integrity sweep, bound
     * to the unified Chroma persist dir (AiConfig SSOT leaf, read here at the use-site per the config-SSOT
     * discipline) over the Memory Core collections.
     * @returns {Function} `() => Promise<{collections:Object[]}>`
     */
    get dataIntegrityCoverageGatherer() {
        const dataDir = AiConfig.engines.chroma.dataDir;
        return () => auditChromaVectorCoverage({
            snapshotPath   : path.join(dataDir, 'chroma.sqlite3'),
            persistDir     : dataDir,
            collectionNames: ['neo-agent-memory', 'neo-agent-sessions']
        });
    }
    /**
     * @summary Builds the data-integrity EVIDENCE gatherer the self-heal runner consumes: runs the
     * detect-producer(s) over the coverage audit and assembles per-collection classifier-input rows. INTERIM
     * (the escalate-deletion cutover): wires the coverage producer; the false-storm denominator
     * (`collectionSizes`) + the WAL-stall-vs-wipe discriminator (`documentsPresentByCollection`) wire WITH the
     * actuator's real heal operations in the follow-up — classification precision only changes the OUTCOME once
     * a heal acts, and the interim actuator all-defers, so coverage → assemble → classify → defer is
     * correct-by-construction.
     * @returns {Function} `async () => Promise<Object[]>` — the assembled classifier-input rows.
     */
    get dataIntegrityEvidenceGatherer() {
        const coverageGatherer  = this.dataIntegrityCoverageGatherer,
              dimensionGatherer = createLiveDimensionConsistencyGatherer({
                  storageRouter    : StorageRouter,
                  expectedDimension: AiConfig.vectorDimension,
                  serviceId        : this.dataIntegrityServiceId
              }),
              serviceId         = this.dataIntegrityServiceId;
        return async () => {
            const observedAt         = Date.now(),
                  coverageResult     = await coverageGatherer(),
                  coverageDiagnosis  = buildDataIntegrityCoverageDiagnosis({coverageResult, observedAt, serviceId}),
                  dimensionDiagnosis = await dimensionGatherer(observedAt),
                  diagnoses          = [coverageDiagnosis, dimensionDiagnosis].filter(Boolean);
            return assembleDataIntegrityEvidence({diagnoses, serviceId});
        };
    }
    get swarmHeartbeatEnabled()          { return resolveDeploymentEnabled('swarmHeartbeatEnabled');          }
    get goldenPathRepoEnrichmentEnabled(){ return resolveDeploymentEnabled('goldenPathRepoEnrichmentEnabled');}
    get graphLogCompactionEnabled()      { return AiConfig.orchestrator.graphLogCompaction.enabled;      }
    // local-only lane: the aggregation reads checkout-bound sources (resources/content, git log origin/dev,
    // learn/agentos/decisions), so it is disabled in a cloud profile. Runs only when the deployment allows it
    // AND the opt-in is set — both resolved leaves read at the use site.
    get temporalSummaryEnabled()         { return resolveCloudOnlyEnabled('temporalSummaryEnabled') && AiConfig.temporalSummary.aggregationEnabled; }
    get neuralLinkBridgeLivenessTimeoutMs() { return AiConfig.orchestrator.neuralLinkBridge.livenessProbeTimeoutMs; }

    /**
     * @summary Returns the entrypoint-resolved authority profile. Before `start()` captures
     * the leaf, construction-time service wiring reads the same Tier-1 value directly.
     * @returns {String}
     */
    getResolvedAuthorityProfile() {
        return this.authorityProfile ?? AiConfig.orchestrator.authorityProfile
    }

    /**
     * @summary Resolves whether this orchestrator role owns one task's canonical class.
     * Profile routing is strict; per-lane enable flags cannot transfer ownership.
     * @param {String} taskName Stable orchestrator task name.
     * @returns {Boolean}
     */
    isTaskAuthorityOwned(taskName) {
        return isTaskOwnedByProfile({
            profile: this.getResolvedAuthorityProfile(),
            taskName
        });
    }

    /**
     * @summary Opens the graph database only for roles that own graph-backed plane work.
     *
     * `data-integrity-sweep` is a canonical container-plane lane. Using its authority
     * classification keeps the storage gate coupled to the exhaustive task map instead
     * of duplicating role-name conditionals. Host-edge therefore never opens the retired
     * checkout graph or a Docker SQLite file.
     *
     * @returns {Promise<Object|null>} Database handle for plane roles; otherwise `null`.
     */
    async initializeGraphDatabaseIfOwned() {
        if (!this.isTaskAuthorityOwned('data-integrity-sweep')) {
            return null;
        }

        return this.initializeDatabaseFn(this.dbPath);
    }

    /**
     * @summary Returns the enabled continuous children owned by this role.
     *
     * Registry presence supplies identity/classification; the existing AiConfig getter
     * supplies enablement. Both must pass, preventing an authority profile from reviving
     * a lane whose deployment-mode toggle disabled it.
     *
     * @param {Object} [taskDefinitions=this.taskDefinitions] Built task table.
     * @returns {String[]}
     */
    getEnabledContinuousTaskNames(taskDefinitions = this.taskDefinitions) {
        return CONTINUOUS_TASK_REGISTRY
            .filter(descriptor => taskDefinitions?.[descriptor.taskName])
            .filter(descriptor => !descriptor.enabledBy || Boolean(this[descriptor.enabledBy]))
            .filter(descriptor => this.isTaskAuthorityOwned(descriptor.taskName))
            .map(descriptor => descriptor.taskName);
    }

    /**
     * @summary Projects the full task-definition map to the subset this role may
     * supervise or recover.
     *
     * Scheduled definitions follow authority directly. Continuous children additionally
     * honor their enable gate; the auxiliary Chroma-defrag child follows Chroma's actual
     * supervision eligibility. This keeps PID recovery from crossing the authority split
     * before the first poll.
     *
     * @param {Object} [taskDefinitions=this.taskDefinitions] Full task table.
     * @returns {Object}
     */
    getAuthorityScopedTaskDefinitions(taskDefinitions = this.taskDefinitions) {
        if (!taskDefinitions) {
            return {};
        }

        const continuousNames        = new Set(CONTINUOUS_TASK_REGISTRY.map(({taskName}) => taskName));
        const enabledContinuousNames = new Set(this.getEnabledContinuousTaskNames(taskDefinitions));

        return Object.fromEntries(Object.entries(taskDefinitions).filter(([taskName]) => {
            if (!this.isTaskAuthorityOwned(taskName)) {
                return false;
            }
            if (continuousNames.has(taskName)) {
                return enabledContinuousNames.has(taskName);
            }
            if (taskName === 'chromaDefrag') {
                return enabledContinuousNames.has('chroma');
            }
            return true;
        }));
    }

    /**
     * @summary Splits the scheduled registry into the lanes this role runs and the lanes it
     * deliberately does not, in ONE pass.
     *
     * Both halves matter and only one was ever produced. The complement — the capabilities this
     * role is dropping — existed solely as an `active` flag inside the authority receipt, which is
     * written to disk and never read back, so a dropped lane with no running replacement announced
     * itself nowhere.
     *
     * @returns {{scheduled: Object[], disabled: Object[]}}
     */
    getAuthorityRegistryPartition() {
        return partitionRegistryByAuthority({
            profile : this.getResolvedAuthorityProfile(),
            registry: TASK_REGISTRY
        });
    }

    /**
     * @summary Returns the scheduled descriptor registry owned by this role.
     *
     * Delegates to {@link getAuthorityRegistryPartition} rather than filtering separately: a
     * complement computed by a second traversal is one edit away from disagreeing with this one,
     * and a lane that fell out of both would be neither run nor announced.
     * @returns {Object[]}
     */
    getAuthorityScheduledRegistry() {
        return this.getAuthorityRegistryPartition().scheduled;
    }

    /**
     * @summary Builds the one-line startup statement of which lanes this role is NOT running.
     *
     * A capability this process drops is currently invisible: the authority receipt records it and
     * nothing reads the receipt, so a machine can run for hours with its scheduler correctly
     * declining graph work while nothing elsewhere picks that work up. There is no signal at the
     * moment the gap opens, which is when it is cheap to notice.
     *
     * **Deliberately bounded to what this process can honestly assert.** The line names the lanes
     * and the role that owns each, and stops there — it does NOT claim the owning role is running.
     * A graphless host edge cannot probe the container plane it is forbidden to open, so a
     * "replacement is live" check from here would either be a guess or a boundary violation. The
     * honest form is "I am not running X; container-plane owns it", which is enough for an operator
     * to ask the next question, and is true regardless of what else is up.
     *
     * @returns {String|null} The message, or null when this role owns every lane (`legacy-mixed`).
     */
    buildDisabledLaneAnnouncement() {
        const {disabled} = this.getAuthorityRegistryPartition();

        if (disabled.length === 0) {
            return null;
        }

        const byOwner = new Map();

        for (const {authorityClass, taskName} of disabled) {
            // Derived, never a literal. A `shared-primitive → container-plane` constant here would
            // be correct only while the topology has exactly two roles, and it would encode that
            // assumption in presentation logic where nobody would look for it — still producing a
            // confident answer after a third role made it wrong.
            const owner = resolveAuthorityClassOwner({authorityClass});

            byOwner.set(owner, [...(byOwner.get(owner) || []), taskName]);
        }

        const groups = [...byOwner.entries()]
            .map(([owner, tasks]) => `${owner} owns ${tasks.sort().join(', ')}`)
            .join('; ');

        return `[Orchestrator] Not running ${disabled.length} lane(s) this role does not own — ${groups}. ` +
            'This process does not verify that the owning role is live.';
    }

    /**
     * @summary Emits {@link buildDisabledLaneAnnouncement} once, at startup.
     * WARN rather than INFO: a dropped capability with no confirmed owner is the condition an
     * operator needs to see, and it is emitted exactly once per boot so it cannot become the next
     * drumbeat this ticket exists to remove.
     * @returns {void}
     */
    announceDisabledLanes() {
        const message = this.buildDisabledLaneAnnouncement();

        message && this.writeLog('WARN', message);
    }

    /**
     * @summary Projects persisted task state to this role's owned task set.
     *
     * A host-edge cutover reuses the former mixed supervisor's data directory. Filtering
     * prevents stale plane-task `running` flags from backpressuring host-only work after
     * PID recovery has correctly stopped adopting those plane children.
     *
     * @returns {Object}
     */
    getAuthorityTaskState() {
        const state      = this.taskStateService.getState();
        const ownedNames = new Set([
            ...this.getAuthorityScheduledRegistry().map(({taskName}) => taskName),
            ...Object.keys(this.getAuthorityScopedTaskDefinitions())
        ]);

        return Object.fromEntries(
            Object.entries(state).filter(([taskName]) => ownedNames.has(taskName))
        );
    }

    /**
     * @summary Audits the canonical topology and builds this role's machine-readable
     * ownership receipt. Unknown profiles, unclassified lanes, gaps, and duplicates throw.
     * @returns {Object}
     */
    createAuthorityReceipt() {
        return buildTaskAuthorityReceipt({
            profile           : this.getResolvedAuthorityProfile(),
            auxiliaryRegistry : AUXILIARY_TASK_REGISTRY,
            continuousRegistry: CONTINUOUS_TASK_REGISTRY,
            scheduledRegistry : TASK_REGISTRY,
            internalRegistry  : INTERNAL_TASK_REGISTRY
        });
    }

    /**
     * @summary Persists the already-audited, secret-free authority receipt before any
     * child recovery, database initialization, or polling begins.
     * @returns {void}
     */
    writeAuthorityReceipt() {
        this.authorityReceipt = {
            ...this.authorityReceipt,
            generatedAt: new Date().toISOString()
        };
        fs.writeJsonSync(this.authorityReceiptFile, this.authorityReceipt, {spaces: 2});
    }

    /**
     * @summary Delegates config-backed task-table construction to the orchestrator task builder.
     * @param {Object} options
     * @param {String} options.scriptDir Script directory.
     * @param {String} options.nodeBin Node executable.
     * @returns {Object}
     */
    buildConfiguredTaskDefinitions({scriptDir, nodeBin}) {
        return this.buildConfiguredTaskDefinitionsService({
            scriptDir,
            nodeBin,
            neuralLinkBridgeLivenessTimeoutMs: this.neuralLinkBridgeLivenessTimeoutMs
        });
    }

    /** @summary Starts the orchestrator timer loop after the wrapper selects this process. */
    async start(options = {}) {
        if (this.isPolling) {
            this.writeLog('INFO', '[Orchestrator] Already polling; start() is a no-op.');
            return;
        }

        this.authorityProfile = AiConfig.orchestrator.authorityProfile;
        this.authorityReceipt = this.createAuthorityReceipt();

        const scriptDir = options.scriptDir || DEFAULT_SCRIPT_DIR;
        const dataDir   = options.dataDir   || AiConfig.orchestrator.dataDir;

        this.dataDir                   = dataDir;
        this.taskDefinitions   = options.taskDefinitions || this.buildConfiguredTaskDefinitions({
            scriptDir,
            nodeBin: options.nodeBin || process.argv[0]
        });

        this.dbPath                    = options.dbPath   || AiConfig.orchestrator.dbPath;
        this.logFile                   = options.logFile  || path.join(dataDir, 'orchestrator.log');
        this.stateFile                 = options.stateFile || path.join(dataDir, 'orchestrator-state.json');
        this.authorityReceiptFile       = options.authorityReceiptFile || path.join(dataDir, 'orchestrator-authority.json');
        this.heavyMaintenanceLeasePath = options.heavyMaintenanceLeasePath ?? this.heavyMaintenanceLeasePath;
        this.primaryDevSyncRootsConfig = options.primaryDevSyncRootsConfig !== undefined
            ? options.primaryDevSyncRootsConfig
            : AiConfig.orchestrator.devSyncRoots;
        this.maintenanceDeferralLogKeys = new Set();
        this._chromaDefragPending  = false;
        this._chromaDefragInFlight = false;

        fs.ensureDirSync(this.dataDir);

        // The CLI boot claims the lease ahead of the legacy PID singleton and passes it in; the
        // standalone seam acquires here. Either way the lease precedes the receipt write: a
        // refused boot leaves the plane exactly as it found it.
        this.authorityLease = options.authorityLease
            ?? this.acquireRoleLease({dataDir: this.dataDir, factory: options.authorityLeaseFactory});
        process.once('exit', () => this.authorityLease?.release());

        this.writeAuthorityReceipt();

        // Prune stale daily-rotated archives so the data dir doesn't accrue them unboundedly.
        pruneOldDailyLogs({dir: path.dirname(this.logFile), baseName: path.basename(this.logFile)});

        this.taskStateService.configure({
            stateFile      : this.stateFile,
            taskDefinitions: this.taskDefinitions,
            writeLogFn     : this.writeLog.bind(this)
        });

        this.initBootIdentitySource();

        this.processSupervisorService = {};
        this.deploymentRuntimeAccessService = {};
        this.containerHealthDiagnosisService = {};
        this.deploymentStateBridgeService = {};
        this.recoveryActuatorService = {};
        // AFTER the actuator on purpose: the controller takes it as a construction dependency, and
        // `afterSetRecoveryActuatorService` only back-links a controller that already exists.
        this.containerHealthControllerService = {};
        this.dataRecoveryActuatorService = {};
        this.dataIntegrityDiagnosisService = {};
        this.processSupervisorService.recoverTasks();

        this.db = await this.initializeGraphDatabaseIfOwned();

        if (this.isTaskAuthorityOwned('swarm-heartbeat') && this.swarmHeartbeatEnabled) {
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
        this.writeLog('INFO', `[Orchestrator] Started. authorityProfile=${this.authorityProfile} authorityReceipt=${this.authorityReceiptFile} summaryInterval=${AiConfig.orchestrator.intervals.summarySweepMs}ms kbSyncInterval=${AiConfig.orchestrator.intervals.kbSyncMs}ms poll=${AiConfig.orchestrator.intervals.pollMs}ms.`);
        this.announceDisabledLanes();
        this.poll();
    }

    /**
     * @summary Composes this process's boot-identity source (once, at start): a `BootIdentityHealthService`
     * over the live REM-run-state fact-gatherer, with the genuine process-boot time and the REM-consolidation
     * stall threshold as the freshness cadence (the same threshold the consolidation-liveness watchdog uses,
     * so the classifier yields a real designed-deferral / restart-explains verdict rather than a perpetual
     * `unknown`). Extracted from `start()` so the caller composition is exercisable through a real Orchestrator
     * method — `start()` itself is a side-effecting daemon boot the unit suite does not run. Fail-soft: a null
     * source simply makes each poll write nothing (the fleet reader keeps its honest advisory-`unknown`).
     * @returns {void}
     */
    initBootIdentitySource() {
        this.bootIdentitySource = buildBootIdentitySource({
            remRunStateDir : this.remConsolidationWatchdogRunStateDir,
            freshnessConfig: {designedCadenceMs: this.remConsolidationWatchdogThresholdMs, marginMs: 0},
            bootAt         : Date.now() - Math.round(process.uptime() * 1000)
        });
    }

    /**
     * Stops the polling loop.
     * @returns {void}
     */
    /**
     * @summary Claims the single-owner authority lease for this role — BEFORE the receipt write.
     * The receipt is a last-writer-wins artifact, so writing it is itself the
     * collision the lease closes: a refused boot (a fresh same-role holder, in ANY pid
     * namespace) must leave the plane exactly as it found it — no receipt, no PID file, no state.
     *
     * Extracted from `start()` so the seam is exercisable on a prototype-only instance: the
     * class's reactive configs (`this.set`) make a full `start()` un-runnable without
     * constructing the singleton.
     *
     * @param {Object} options
     * @param {String} options.dataDir Orchestrator data dir — the lease lives beside the receipt.
     * @param {Function} [options.factory] Lease factory (test seam). Defaults to {@link acquireAuthorityLease}.
     * @returns {Object} The lease handle.
     */
    acquireRoleLease({dataDir, factory}) {
        this.authorityLease = (factory ?? acquireAuthorityLease)({
            dir    : dataDir,
            profile: this.authorityProfile,
            log    : this.writeLog.bind(this)
        });

        return this.authorityLease;
    }

    stop() {
        if (this.pollHandle) {
            clearTimeout(this.pollHandle);
            this.pollHandle = null;
        }

        this.isPolling = false;

        if (this.authorityLease) {
            this.authorityLease.release();
            this.authorityLease = null;
        }
    }

    /**
     * @summary The authority-lease heartbeat: refreshes `lastPulse` and re-verifies ownership
     * before this poll's mutating actions.
     *
     * A lost lease — reclaimed by a successor while this process was paused, or deleted
     * externally — routes to the refusal path: ERROR, stop, non-zero exit code. Never silent
     * continuation: an orchestrator that lost its role lease must not keep running lanes
     * against the plane another holder now owns.
     * @returns {Boolean} `false` when the lease is lost and the current poll must abort.
     */
    pulseAuthorityLease() {
        if (!this.authorityLease) {
            return 'held'; // no lease wired (prototype/test seams) — nothing to fence
        }

        let result;

        try {
            result = this.authorityLease.pulse();
        } catch (err) {
            if (err.code === 'FILE_LEASE_LOST') {
                this.writeLog('ERROR', `[Orchestrator] Authority lease lost: ${err.message} Stopping — a displaced orchestrator must not keep running lanes.`);
                this.authorityLeaseLost = true;
                this.stop();
                process.exitCode = 1;
                return 'lost';
            }
            throw err;
        }

        if (result?.contended) {
            // Unverified is not held: someone else is mid-transition on the lease. Defer THIS
            // sweep's mutations — but never the cadence: contention is transient by
            // construction, and the next pulse IS the revalidation.
            this.writeLog('INFO', '[Orchestrator] Authority lease contended (another transition in flight); deferring this sweep, cadence preserved.');
            return 'contended';
        }

        return 'held';
    }

    /**
     * @summary Effect-boundary lease fence for deferred plane writes: the latch is re-checked at
     * WRITE time, not at invocation — a loss detected while an effect was still being produced
     * must void the write, or a displaced orchestrator keeps mutating the plane another holder
     * now owns.
     * @param {Object} fact The produced boot-identity fact.
     * @param {Object} opts Writer options (dir).
     * @returns {Promise<Object|null>}
     */
    async writeBootIdentityFactIfHeld(fact, opts) {
        if (this.authorityLeaseLost) {
            return null;
        }

        return writeBootIdentityFact(fact, opts);
    }

    /**
     * Appends a daemon log line to disk and mirrors it to stdout/stderr.
     * @param {String} level Log level.
     * @param {String} message Log message.
     * @returns {void}
     */
    writeLog(level, message) {
        rotateLogFileIfNewDay(this.logFile);

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

    /** @summary Returns true while an active heavy-maintenance lease owns the shared Chroma substrate. */
    isHeavyMaintenanceLeaseActive(now) {
        try {
            return Boolean(this.inspectHeavyMaintenanceLeaseFn({
                leasePath: this.maintenanceBackpressureService.resolveHeavyMaintenanceLeasePath(),
                now
            }).active);
        } catch (e) {
            this.writeLog('ERROR', `[Orchestrator] Heavy-maintenance lease inspection failed; deferring Chroma recycle: ${e.message}`);
            return true;
        }
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
        const leaseState = this.pulseAuthorityLease();

        if (leaseState === 'lost') {
            return; // stop() owns the shutdown — no sweep, no cadence
        }

        if (leaseState === 'contended') {
            // Defer every mutating action in THIS sweep — but arm the next cadence, or one
            // contended poll silently disables every future sweep.
            if (this.isPolling) {
                this.pollHandle = setTimeout(() => this.poll(), AiConfig.orchestrator.intervals.pollMs);
            }
            return;
        }

        const now         = Date.now();
        const executeTask = this.processSupervisorService.runTask.bind(this.processSupervisorService);

        const continuousTasks     = this.getEnabledContinuousTaskNames();
        const RESTART_COOLDOWN_MS = 15000;
        for (const taskName of continuousTasks) {
            this.processSupervisorService.reconcileSingletonPort(taskName);

            const state = this.taskStateService.getTaskState(taskName);

            if (taskName === 'chroma' && this.isChromaRecycleDue(state, now)) {
                if (this.isHeavyMaintenanceLeaseActive(now)) {
                    this.processSupervisorService.superviseTask(taskName, now, RESTART_COOLDOWN_MS);
                    continue;
                }

                this.processSupervisorService.killTask('chroma', `max-runtime:${now - (state.lastRunAt || 0)}ms>${AiConfig.orchestrator.chroma.maxRuntimeMs}ms`);
                this._chromaDefragPending = true;
                continue;
            }

            this.processSupervisorService.superviseTask(taskName, now, RESTART_COOLDOWN_MS);

            if (
                taskName === 'chroma' &&
                state?.running &&
                this._chromaDefragPending &&
                !this._chromaDefragInFlight &&
                !this.isHeavyMaintenanceLeaseActive(now)
            ) {
                this._chromaDefragInFlight = true;
                this.probeChromaReady()
                    .then(ready => {
                        // Deferred continuations re-fence on arrival: a lease lost after this
                        // poll scheduled us must not produce a mutating effect. Latched flag —
                        // prototypes without a lease wired are unaffected.
                        if (this.authorityLeaseLost) {
                            return;
                        }

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
            ...buildOrchestratorSchedulingOptions({
                orchestrator: this,
                config      : AiConfig,
                now,
                registry    : this.getAuthorityScheduledRegistry()
            })
        });

        // Persist this process's advisory boot-identity fact to the shared runtime-state dir for the
        // fleet control-plane's cross-process getBootIdentity() read. recordBootIdentityFact is fail-soft
        // (never gates a cycle) and self-observing: a genuine produce/write failure is surfaced through
        // onError (the LIVE log path); the trailing .catch is only a belt-and-suspenders guard for an
        // unexpected rejection, matching the sibling writes below.
        if (this.isTaskAuthorityOwned('boot-identity-fact') && !this.authorityLeaseLost) {
            this.recordBootIdentityFactFn({
                source: this.bootIdentitySource,
                dir   : this.dataDir,
                // The write-time fence: the fact is produced async, so a loss detected mid-flight
                // must void the write at its effect boundary — not only gate the invocation.
                writeImpl: (fact, opts) => this.writeBootIdentityFactIfHeld(fact, opts),
                onError  : error => this.writeLog('ERROR', `[Orchestrator] Boot-identity fact write failed: ${error.message}`)
            }).catch(error => this.writeLog('ERROR', `[Orchestrator] Boot-identity fact write rejected: ${error.message}`));
        }

        if (this.isTaskAuthorityOwned('deployment-state-bridge') && !this.authorityLeaseLost) {
            this.deploymentStateBridgeService?.writeSnapshotIfDue({shouldWrite: () => !this.authorityLeaseLost})
                .then(result => this.consumeContainerHealthDecisions(result))
                .catch(error => this.writeLog('ERROR', `[Orchestrator] Deployment state bridge failed: ${error.message}`));
        }

        if (this.isTaskAuthorityOwned('freeze-reprobe')) {
            this.runFreezeReprobeCycleIfActive(now)
                .catch(error => this.writeLog('ERROR', `[Orchestrator] Freeze re-probe cycle failed: ${error.message}`));
        }

        if (this.isPolling) {
            this.pollHandle = setTimeout(() => this.poll(), AiConfig.orchestrator.intervals.pollMs);
        }
    }
}

export default Neo.setupClass(Orchestrator);
