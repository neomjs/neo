// Class bootstrap belongs to `daemon.mjs`; this consumed class relies on global Neo.
import fs              from 'fs-extra';
import {spawn}         from 'child_process';
import net             from 'net';
import path            from 'path';
import Base            from '../../../src/core/Base.mjs';
import ClassSystemUtil from '../../../src/util/ClassSystem.mjs';
import AiConfig        from '../../config.mjs';
import HealthService   from '../../services/memory-core/HealthService.mjs';
import SQLite          from '../../graph/storage/SQLite.mjs';
import MaintenanceBackpressureService, {
    DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
    DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES
} from './services/MaintenanceBackpressureService.mjs';
import {buildConfiguredTaskDefinitions as buildConfiguredTaskDefinitionsImport}                     from './services/ConfiguredTaskDefinitionsService.mjs';
import PrimaryRepoSyncService                                                                       from './services/PrimaryRepoSyncService.mjs';
import TenantRepoSyncService                                                                        from './services/TenantRepoSyncService.mjs';
import {getDueTask as summaryGetDueTaskImport}                                                      from './scheduling/summary.mjs';
import {getDueTask as backupGetDueTaskImport}                                                       from './scheduling/backup.mjs';
import {getDueTask as graphLogCompactionGetDueTaskImport}                                           from './scheduling/graphLogCompaction.mjs';
import {getDueTask as primaryDevSyncGetDueTaskImport}                                               from './scheduling/primaryDevSync.mjs';
import {getDueTask as goldenPathGetDueTaskImport}                                                   from './scheduling/goldenPath.mjs';
import {getDueTask as dreamGetDueTaskImport}                                                        from './scheduling/dream.mjs';
import {getDueTask as embedDrainLivenessWatchdogGetDueTaskImport}                                   from './scheduling/embedDrainLivenessWatchdog.mjs';
import memoryCoreConfig                                                                             from '../../mcp/server/memory-core/config.mjs';
import MailboxService                                                                               from '../../services/memory-core/MailboxService.mjs';
import WakeSubscriptionService                                                                      from '../../services/memory-core/WakeSubscriptionService.mjs';
import RequestContextService                                                                        from '../../mcp/server/shared/services/RequestContextService.mjs';
import {normalizeAgentIdentityNodeId}                                                               from '../../scripts/lifecycle/resumeHarness.mjs';
import TaskStateService                                                                             from './services/TaskStateService.mjs';
import ProcessSupervisorService                                                                     from './services/ProcessSupervisorService.mjs';
import DeploymentRuntimeAccessService                                                               from './services/DeploymentRuntimeAccessService.mjs';
import DeploymentStateBridgeService                                                                 from './services/DeploymentStateBridgeService.mjs';
import RecoveryActuatorService                                                                      from './services/RecoveryActuatorService.mjs';
import ContainerHealthDiagnosisService                                                              from './services/ContainerHealthDiagnosisService.mjs';
import DataIntegrityDiagnosisService                                                                from './services/DataIntegrityDiagnosisService.mjs';
import DataRecoveryActuatorService                                                                  from './services/DataRecoveryActuatorService.mjs';
import {auditChromaVectorCoverage}                                                                  from '../../scripts/maintenance/checkChromaIntegrity.mjs';
import {createReEmbedMissingHeal, createReEmbedMissingHealOperation}                                from '../../services/memory-core/helpers/reEmbedMissingHeal.mjs';
import {appendHealEvent, healEventsToRecentRuns, queryHealLedger, readHealLedger}                   from '../../services/memory-core/helpers/healEventLedgerStore.mjs';
import {validateHealLedgerRetention}                                                                from '../../services/memory-core/helpers/healEventLedgerStore.mjs';
import {detectChronicUnsafeInput}                                                                   from '../../services/memory-core/helpers/healActionDispatch.mjs';
import {quarantineCollection, storeFenceTargets, unquarantineCollection}                            from '../../services/memory-core/helpers/quarantineStore.mjs';
import {createFreezeHealOperation, createStoreFenceOperations, runFreezeReprobe}                    from '../../services/memory-core/helpers/freezeReprobeRunner.mjs';
import {createThrottleShedHealOperation}                                                            from '../../services/memory-core/helpers/throttleShedHeal.mjs';
import {decideSystemicCircuit, foldSystemicCircuitState}                                            from '../../services/memory-core/helpers/healSystemicCircuit.mjs';
import {Memory_StorageRouter as StorageRouter, Memory_TextEmbeddingService as TextEmbeddingService} from '../../services.mjs';
import {buildDataIntegrityCoverageDiagnosis}                                                        from './services/dataIntegrityCoverageDiagnosis.mjs';
import {assembleDataIntegrityEvidence}                                                              from './services/dataIntegrityEvidenceAssembler.mjs';
import {createLiveDimensionConsistencyGatherer}                                                     from './services/dimensionConsistencyGatherer.mjs';
import DreamService                                                                                 from './services/DreamService.mjs';
import SwarmHeartbeatService                                                                        from './services/SwarmHeartbeatService.mjs';
import GoldenPathSynthesizer                                                                        from '../../services/graph/GoldenPathSynthesizer.mjs';
import TemporalSummaryAggregationService                                                            from '../temporal-summary/TemporalSummaryAggregationService.mjs';
import {getDueTask as tenantRepoSyncGetDueTaskImport}                                               from './scheduling/tenantRepoSync.mjs';
import {TASK_REGISTRY}                                                                              from './scheduling/registry.mjs';
import {
    buildOrchestratorSchedulingOptions,
    runSchedulingPipeline
} from './scheduling/pipeline.mjs';
import {DEFAULT_SCRIPT_DIR} from './taskDefinitions.mjs';
import {
    inspectHeavyMaintenanceLeaseSync
} from './services/heavyMaintenanceLeasePrimitives.mjs';

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
    const cfg = AiConfig.orchestrator.cloudOnly[key];
    if (cfg != null) return cfg;
    return AiConfig.orchestrator.deploymentMode === 'cloud';
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
        className                       : 'Neo.ai.daemons.Orchestrator',
        singleton                       : true,
        processSupervisorService_       : null,
        deploymentRuntimeAccessService_ : null,
        deploymentStateBridgeService_   : null,
        recoveryActuatorService_        : null,
        containerHealthDiagnosisService_: null,
        dataRecoveryActuatorService_    : null,
        dataIntegrityDiagnosisService_  : null,
        maintenanceBackpressureService_ : MaintenanceBackpressureService,
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
    temporalSummaryAggregationService = TemporalSummaryAggregationService
    initializeDatabaseFn     = initializeDatabaseSelfBootstrap
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

    isPolling                     = false
    pollHandle                    = null
    db                            = null
    logFile                       = null
    stateFile                     = null
    primaryDevSyncRootsConfig     = null
    maintenanceDeferralLogKeys    = null
    heavyMaintenanceTaskNames     = DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES
    goldenPathDependencyTaskNames = DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES

    processSupervisorWriteLog = (level, msg) => this.writeLog(level, msg)
    deploymentRuntimeAccessWriteLog = (level, msg) => this.writeLog(level, msg)
    deploymentStateBridgeWriteLog   = (level, msg) => this.writeLog(level, msg)
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
            dataDir                : this.dataDir,
            taskDefinitions        : this.taskDefinitions,
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
        return ClassSystemUtil.beforeSetInstance(value, ContainerHealthDiagnosisService);
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
            healLedgerDir              : path.join(this.dataDir, 'data-heal-events'),
            writeLog                   : this.deploymentStateBridgeWriteLog
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

        const healLedgerDir    = path.join(this.dataDir, 'data-heal-events');
        const freezeRecordsDir = path.join(this.dataDir, 'data-freeze-records');

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
                })
            },
            // The ledger is observability, never a gate: readHealLedger now THROWS on an unreadable FILE, so an
            // unreadable ledger must not block a heal — degrade the anti-thrash projection to "no recent runs".
            recentRunsReader : async collectionName => {
                let events = [];
                try {
                    events = await readHealLedger({dir: healLedgerDir});
                } catch (error) {
                    this.writeLog?.('WARN', `[Orchestrator] heal-ledger read failed for recentRuns; proceeding with none: ${error.message}`);
                }
                return healEventsToRecentRuns(queryHealLedger(events, {collections: [collectionName]}));
            },
            // Retention is read + VALIDATED from the AiConfig provider at the append boundary; the pure ledger helper
            // owns no production default.
            recordRun        : async ({action, collection, at}) => appendHealEvent(
                {type: action, collection, status: 'attempt'},
                {
                    dir: healLedgerDir,
                    now: at,
                    ...validateHealLedgerRetention(
                        AiConfig.orchestrator.recoveryActuator.healLedger.maxEvents,
                        AiConfig.orchestrator.recoveryActuator.healLedger.pruneTriggerBytes
                    )
                }
            ),
            recordHealOutcome: async ({action, collection, status, detail, healedAt}) => appendHealEvent(
                {type: action, collection, status, detail},
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
     * @returns {Promise<{embedderHealthy: Boolean, dimensionConsistent: Boolean}>}
     */
    async probeFrozenCollectionHealth(collectionName) {
        try {
            const [vector] = await TextEmbeddingService.embedTexts(['__freeze-reprobe-health-canary__'], AiConfig.embeddingProvider),
                  ok       = Array.isArray(vector) && vector.length === AiConfig.vectorDimension;

            return {embedderHealthy: ok, dimensionConsistent: ok};
        } catch (error) {
            return {embedderHealthy: false, dimensionConsistent: false}; // inconclusive → stay frozen (fail closed)
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
            healLedgerDir      : path.join(this.dataDir, 'data-heal-events'),
            healLedgerRetention: validateHealLedgerRetention(
                AiConfig.orchestrator.recoveryActuator.healLedger.maxEvents,
                AiConfig.orchestrator.recoveryActuator.healLedger.pruneTriggerBytes
            ),
            now,
            probe              : collectionName => this.probeFrozenCollectionHealth(collectionName),
            // The store-level unfence — paired with the `freeze` op's fence via createStoreFenceOperations, so a
            // store-level freeze and its auto-unfreeze lift exactly the same served set (no asymmetry).
            unfence            : this.getStoreFenceOperations().unfence
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
                const dir                               = path.join(this.dataDir, 'data-heal-events'),
                      bounds                            = AiConfig.orchestrator.recoveryActuator.systemicCircuit,
                      {recentFailures, circuitOpenedAt} = foldSystemicCircuitState(await readHealLedger({dir}), {now, windowMs: bounds.windowMs});
                return decideSystemicCircuit({recentFailures, circuitOpenedAt, now, bounds});
            },
            recordCircuitEvent: async ({type, at, detail}) => appendHealEvent(
                {type, collection: '*', status: type === 'circuit-open' ? 'open' : 'close', detail},
                {
                    dir: path.join(this.dataDir, 'data-heal-events'),
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
                const dir    = path.join(this.dataDir, 'data-heal-events'),
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
            this.deploymentStateBridgeService.healLedgerDir = path.join(value, 'data-heal-events');
        }
    }
    afterSetTaskDefinitions(value, oldValue) {
        if (oldValue === undefined) return;
        this.processSupervisorService.taskDefinitions       = value;
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

    get kbSyncEnabled()                  { return resolveDeploymentEnabled('kbSyncEnabled');                  }
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
    get temporalSummaryEnabled()         { return AiConfig.temporalSummary.aggregationEnabled;           }
    get neuralLinkBridgeLivenessTimeoutMs() { return AiConfig.orchestrator.neuralLinkBridge.livenessProbeTimeoutMs; }

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
        this.heavyMaintenanceLeasePath = options.heavyMaintenanceLeasePath ?? this.heavyMaintenanceLeasePath;
        this.primaryDevSyncRootsConfig = options.primaryDevSyncRootsConfig !== undefined
            ? options.primaryDevSyncRootsConfig
            : AiConfig.orchestrator.devSyncRoots;
        this.maintenanceDeferralLogKeys = new Set();
        this._chromaDefragPending  = false;
        this._chromaDefragInFlight = false;

        fs.ensureDirSync(this.dataDir);

        // Prune stale daily-rotated archives so the data dir doesn't accrue them unboundedly.
        pruneOldDailyLogs({dir: path.dirname(this.logFile), baseName: path.basename(this.logFile)});

        this.taskStateService.configure({
            stateFile      : this.stateFile,
            taskDefinitions: this.taskDefinitions,
            writeLogFn     : this.writeLog.bind(this)
        });

        this.processSupervisorService = {};
        this.deploymentRuntimeAccessService = {};
        this.containerHealthDiagnosisService = {};
        this.deploymentStateBridgeService = {};
        this.recoveryActuatorService = {};
        this.dataIntegrityDiagnosisService = {};
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
        const now         = Date.now();
        const executeTask = this.processSupervisorService.runTask.bind(this.processSupervisorService);

        const continuousTasks = [
            ...(this.chromaDaemonEnabled ? ['chroma'] : []),
            ...(this.bridgeDaemonEnabled ? ['bridgeDaemon'] : []),
            ...(this.devServerEnabled    ? ['devServer'] : []),
            ...(this.neuralLinkBridgeEnabled ? ['neuralLinkBridge'] : []),
            ...(this.embedDaemonEnabled  ? ['embedDaemon'] : []),
            ...(this.messageDaemonEnabled ? ['messageDaemon'] : []),
            'mlx',
            'ollama',
            'lms'
        ];
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

        this.deploymentStateBridgeService?.writeSnapshotIfDue()
            .catch(error => this.writeLog('ERROR', `[Orchestrator] Deployment state bridge failed: ${error.message}`));

        this.runFreezeReprobeCycleIfActive(now)
            .catch(error => this.writeLog('ERROR', `[Orchestrator] Freeze re-probe cycle failed: ${error.message}`));

        if (this.isPolling) {
            this.pollHandle = setTimeout(() => this.poll(), AiConfig.orchestrator.intervals.pollMs);
        }
    }
}

export default Neo.setupClass(Orchestrator);
