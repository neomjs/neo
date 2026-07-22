import {createHash}                         from 'node:crypto';
import path                                 from 'node:path';
import Base                                 from '../../../../src/core/Base.mjs';
import AiConfig                             from '../../../config.mjs';
import {probeProviderParallelModelCapacity} from '../../../services/graph/providerReadinessHelper.mjs';

import {
    boundUtf8Tail,
    createDeploymentStateSnapshot,
    writeDeploymentStateSnapshot
} from '../../../services/memory-core/helpers/deploymentStateBridgeStore.mjs';
import {readBackupReceipt}           from '../../../services/memory-core/helpers/offHostSyncStore.mjs';
import {readRecentRecoveryRunStates} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';
import {
    queryHealLedger,
    readHealLedger,
    summarizeHealLedger
} from '../../../services/memory-core/helpers/healEventLedgerStore.mjs';
import {
    calculateDockerCpuPercent,
    calculateDockerMemoryPercent
} from './ContainerHealthDiagnosisService.mjs';
import {
    buildTenantRepoSyncTrigger,
    isRepoDue
} from '../scheduling/tenantRepoSync.mjs';

/**
 * @summary Writes a bounded, graph-independent deployment-state snapshot for KB/MC tools.
 *
 * The bridge is internal-only: it reads through the orchestrator-owned deployment runtime holder,
 * summarizes allowlisted service state, and writes a JSON snapshot to shared storage. KB/MC read
 * tools consume that file. No public route, socket mount, shell, or write actuator is introduced.
 *
 * @class Neo.ai.daemons.services.DeploymentStateBridgeService
 * @extends Neo.core.Base
 * @see ai/daemons/orchestrator/services/DeploymentRuntimeAccessService.mjs
 * @see ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs
 */
export class DeploymentStateBridgeService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.DeploymentStateBridgeService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.DeploymentStateBridgeService',
        /**
         * @member {Object|null} runtimeAccessService=null
         * @protected
         */
        runtimeAccessService: null,
        /**
         * @member {Object|null} diagnosisService=null
         * @protected
         */
        diagnosisService: null,
        /**
         * @member {Object|null} taskStateService=null
         * @protected
         */
        taskStateService: null,
        /**
         * @member {Object|null} tenantRepoSyncService=null
         * @protected
         */
        tenantRepoSyncService: null,
        /**
         * @member {Function|null} tenantRepoSyncEnabledReader=null
         * @protected
         */
        tenantRepoSyncEnabledReader: null,
        /**
         * @member {Function|null} nowFn=null
         * @protected
         */
        nowFn: null,
        /**
         * @member {Function|null} providerResidencyProbe=null
         * @protected
         */
        providerResidencyProbe: null,
        /**
         * @member {Function|null} recoveryRunStateReader=null
         * @protected
         */
        recoveryRunStateReader: null,
        /**
         * Durable heal-event ledger directory (`healEventLedgerStore`), owned by the orchestrator and passed in
         * so the bridge folds the immune-system status into the snapshot without re-deriving the path. `null`
         * disables the self-heal section — the snapshot still writes (observability degrades, never blocks).
         * @member {String|null} healLedgerDir=null
         * @protected
         */
        healLedgerDir: null,
        /**
         * @member {Function|null} healLedgerReader=null
         * @protected
         */
        healLedgerReader: null,
        /**
         * @member {Function|null} writeLog=null
         * @protected
         */
        writeLog: null
    }

    lastWriteAt           = 0
    writeInFlight         = false
    statsSamplesByService = new Map()
    // Last service-state signature written to the log; gates the edge-triggered success line so a
    // healthy steady-state stops re-emitting an identical INFO line on every snapshot write.
    lastLoggedSignature   = null

    /**
     * Writes a snapshot when enabled and due.
     * @param {Object} [options]
     * @param {Boolean} [options.force=false] Bypass interval gate.
     * @returns {Promise<Object>}
     */
    async writeSnapshotIfDue({force = false} = {}) {
        const now = this.now();

        if (!AiConfig.orchestrator.deploymentStateBridge.enabled) {
            return {ok: true, status: 'disabled'};
        }

        if (this.writeInFlight) {
            return {ok: true, status: 'in-flight'};
        }

        if (!force && this.lastWriteAt > 0 && now - this.lastWriteAt < AiConfig.orchestrator.deploymentStateBridge.writeIntervalMs) {
            return {ok: true, status: 'skipped'};
        }

        this.writeInFlight = true;

        try {
            const snapshot = await this.collectSnapshot({generatedAt: now}),
                  result   = await writeDeploymentStateSnapshot({
                      filePath: AiConfig.orchestrator.deploymentStateBridge.snapshotPath,
                      snapshot,
                      maxBytes: AiConfig.orchestrator.deploymentStateBridge.maxSnapshotBytes
                  });

            this.lastWriteAt = now;

            // Edge-trigger the success line: a healthy deployment writes an identical snapshot every
            // interval, so logging each write floods the daemon log and buries real signal. Emit only
            // on the first write or when a service appears/disappears or changes status. Liveness is
            // still observable via the snapshot's own `generatedAt` + the `staleAfterMs` watchdog.
            const signature = buildServiceStateSignature(snapshot.services),
                  logged    = signature !== this.lastLoggedSignature;

            if (logged) {
                const transition = this.lastLoggedSignature === null ? 'first write' : 'service-state changed';

                this.writeLog?.('INFO', `[DeploymentStateBridge] wrote ${snapshot.services.length} service snapshots to ${AiConfig.orchestrator.deploymentStateBridge.snapshotPath} (${transition})`);
                this.lastLoggedSignature = signature;
            }

            return {ok: true, status: 'written', snapshot, logged, ...result};
        } catch (error) {
            this.writeLog?.('ERROR', `[DeploymentStateBridge] snapshot write failed: ${error.message}`);
            throw error;
        } finally {
            this.writeInFlight = false;
        }
    }

    /**
     * Collects one bounded deployment-state snapshot.
     * @param {Object} [options]
     * @param {Number} [options.generatedAt]
     * @returns {Promise<Object>}
     */
    async collectSnapshot({generatedAt = this.now()} = {}) {
        const services = [];

        for (const serviceKey of this.getServiceKeys()) {
            services.push(await this.collectServiceSnapshot({serviceKey, observedAt: generatedAt}));
        }

        const recoveryRuns      = await this.collectRecoveryRunSnapshot();
        const selfHeal          = await this.collectSelfHealSnapshot();
        const tenantRepoSync    = await this.collectTenantRepoSyncSnapshot({observedAt: generatedAt});
        const bridgeDiagnostics = this.collectBridgeDiagnostics({services, observedAt: generatedAt});
        const maintenance       = await this.collectMaintenanceSnapshot();

        return createDeploymentStateSnapshot({
            generatedAt,
            services,
            bridgeDiagnostics,
            recoveryRuns,
            selfHeal,
            tenantRepoSync,
            maintenance
        });
    }

    /**
     * Projects the durable backup receipt (`AiConfig.backupPath/last-backup-receipt.json`) into the
     * snapshot with explicit freshness semantics: absent-before-first-run omits the block entirely
     * (never fabricated); unreadable/corrupt/oversize/wrong-version receipts project a stable
     * `{status: 'unreadable', kind, finishedAt}` shape so consumers never infer corruption from an
     * absent block. The receipt file survives orchestrator restart by construction; the projection
     * is last-known, never refreshed-on-read.
     * @returns {Promise<Object|null>}
     */
    async collectMaintenanceSnapshot() {
        const receiptPath = path.join(AiConfig.backupPath, 'last-backup-receipt.json');

        try {
            const outcome = await readBackupReceipt({filePath: receiptPath});

            if (outcome.status === 'missing') return null;

            if (outcome.status === 'unreadable') {
                return {
                    lastBackup: {
                        finishedAt: outcome.finishedAt,
                        kind      : outcome.kind,
                        status    : 'unreadable'
                    }
                }
            }

            return {lastBackup: outcome.receipt}
        } catch (error) {
            return {
                lastBackup: {
                    finishedAt: null,
                    kind      : 'corrupt',
                    status    : 'unreadable'
                }
            }
        }
    }

    /**
     * Collects one bounded per-service state envelope.
     * @param {Object} options
     * @param {String} options.serviceKey Allowlisted service key.
     * @param {Number} options.observedAt Epoch ms.
     * @returns {Promise<Object>}
     */
    async collectServiceSnapshot({serviceKey, observedAt}) {
        const
            errors = [],
            proofs = [];

        let inspect           = null,
            stats             = null,
            logs              = null,
            providerResidency = null;

        const read = async (operation, args = {}) => {
            try {
                const result = await this.runtimeAccessService.readObserve({serviceKey, operation, ...args});
                proofs.push(result.proof);
                return result.data;
            } catch (error) {
                errors.push(summarizeRuntimeAccessError(error, {operation}));
                return null;
            }
        };

        inspect = await read('inspect');
        stats   = await read('stats');

        const bridgeConfig = AiConfig.orchestrator.deploymentStateBridge;

        if (bridgeConfig.includeLogs) {
            logs = await read('logs', {tail: bridgeConfig.logTail});
        }

        if (stats) {
            this.rememberStatsSample(serviceKey, stats);
        }

        providerResidency = await this.collectProviderResidency({serviceKey, observedAt});

        const diagnosis = this.diagnosisService?.diagnose
            ? this.diagnosisService.diagnose({
                serviceKey,
                inspect,
                stats,
                statsSamples: this.getStatsSamples(serviceKey),
                providerResidency,
                observedAt
            })
            : null;

        return {
            schemaVersion : 1,
            recordType    : 'deployment-service-state',
            serviceKey,
            targetIdentity: {kind: 'compose-service', id: serviceKey},
            observedAt,
            status        : errors.length > 0 ? 'degraded' : 'available',
            inspect       : summarizeInspect(inspect),
            stats         : summarizeStats(stats),
            logs          : summarizeLogs(logs, bridgeConfig.logMaxBytes),
            providerResidency,
            diagnosis,
            proofs,
            errors
        };
    }

    /**
     * Collects bridge-level diagnostics for broad runtime-access misconfiguration.
     * @param {Object} options
     * @param {Object[]} options.services Per-service deployment snapshots.
     * @param {Number} options.observedAt Epoch ms.
     * @returns {Object}
     */
    collectBridgeDiagnostics({services, observedAt}) {
        const
            serviceList          = Array.isArray(services) ? services : [],
            degradedServices     = serviceList.filter(service => service.status === 'degraded'),
            serviceFailureStates = serviceList.map(service => ({
                serviceKey: service.serviceKey,
                status    : service.status,
                reasons   : unique((service.errors || []).map(error => error.reason).filter(Boolean))
            })),
            failureReasonCounts    = countBy(serviceList.flatMap(service => (service.errors || []).map(error => error.reason || 'unknown'))),
            operationFailureCounts = countBy(serviceList.flatMap(service => (service.errors || []).map(error => error.operation || 'unknown'))),
            lookupFailureCount     = serviceList.filter(hasLookupFailure).length,
            allServicesDegraded    = serviceList.length > 0 && degradedServices.length === serviceList.length,
            broadLookupFailure     = serviceList.length > 0 && lookupFailureCount === serviceList.length,
            reason                 = broadLookupFailure
                ? 'broad-service-lookup-failure'
                : degradedServices.length > 0 ? 'partial-service-observation-failure' : null;

        return {
            schemaVersion: 1,
            recordType   : 'deployment-state-bridge-diagnostics',
            observedAt,
            status       : degradedServices.length > 0 ? 'degraded' : 'available',
            reason,
            runtimeAccess: {
                enabled            : AiConfig.orchestrator.deploymentRuntimeAccess.enabled,
                mechanism          : AiConfig.orchestrator.deploymentRuntimeAccess.mechanism,
                composeProject     : AiConfig.orchestrator.deploymentRuntimeAccess.composeProject,
                allowedServices    : Array.isArray(AiConfig.orchestrator.deploymentRuntimeAccess.allowedServices) ? [...AiConfig.orchestrator.deploymentRuntimeAccess.allowedServices] : [],
                readOperations     : Array.isArray(AiConfig.orchestrator.deploymentRuntimeAccess.readOperations) ? [...AiConfig.orchestrator.deploymentRuntimeAccess.readOperations] : [],
                lifecycleOperations: Array.isArray(AiConfig.orchestrator.deploymentRuntimeAccess.lifecycleOperations) ? [...AiConfig.orchestrator.deploymentRuntimeAccess.lifecycleOperations] : [],
                auditMode          : AiConfig.orchestrator.deploymentRuntimeAccess.auditMode
            },
            bridgeConfig: {
                allowedServices             : Array.isArray(AiConfig.orchestrator.deploymentStateBridge.allowedServices) ? [...AiConfig.orchestrator.deploymentStateBridge.allowedServices] : [],
                effectiveServiceKeys        : this.getServiceKeys(),
                includeLogs                 : AiConfig.orchestrator.deploymentStateBridge.includeLogs,
                logTail                     : Number.isFinite(AiConfig.orchestrator.deploymentStateBridge.logTail) ? AiConfig.orchestrator.deploymentStateBridge.logTail : null,
                logMaxBytes                 : Number.isFinite(AiConfig.orchestrator.deploymentStateBridge.logMaxBytes) ? AiConfig.orchestrator.deploymentStateBridge.logMaxBytes : null,
                statsSampleWindow           : Number.isFinite(AiConfig.orchestrator.deploymentStateBridge.statsSampleWindow) ? AiConfig.orchestrator.deploymentStateBridge.statsSampleWindow : null,
                providerResidencyServiceKeys: Array.isArray(AiConfig.orchestrator.deploymentStateBridge.providerResidencyServiceKeys) ? [...AiConfig.orchestrator.deploymentStateBridge.providerResidencyServiceKeys] : []
            },
            serviceResolution: {
                serviceCount        : serviceList.length,
                degradedServiceCount: degradedServices.length,
                allServicesDegraded,
                broadLookupFailure,
                lookupFailureCount,
                failureReasonCounts,
                operationFailureCounts,
                services            : serviceFailureStates
            },
            hints: buildBridgeHints({reason, failureReasonCounts})
        };
    }

    /**
     * Collects active graph-provider residency for the configured model service.
     * @param {Object} options
     * @param {String} options.serviceKey Allowlisted service key.
     * @param {Number} options.observedAt Epoch ms.
     * @returns {Promise<Object|null>}
     */
    async collectProviderResidency({serviceKey, observedAt}) {
        if (!AiConfig.orchestrator.deploymentStateBridge.providerResidencyServiceKeys.includes(serviceKey)) {
            return null;
        }

        const targetIdentity = {kind: 'compose-service', id: serviceKey};

        try {
            const probe  = this.providerResidencyProbe || probeProviderParallelModelCapacity,
                  result = await probe({
                      timeoutMs: AiConfig.orchestrator.providerReadiness.timeoutMs,
                      serviceKey,
                      observedAt
                  });

            if (!result) {
                return null;
            }

            return {
                ...result,
                targetIdentity
            };
        } catch (error) {
            return {
                ready      : null,
                degraded   : true,
                provider   : 'unknown',
                probeFailed: true,
                message    : error.message,
                targetIdentity
            };
        }
    }

    /**
     * Resolves allowlisted service keys for snapshot collection.
     * @returns {String[]}
     */
    getServiceKeys() {
        const allowedServices = AiConfig.orchestrator.deploymentStateBridge.allowedServices;

        if (allowedServices.length > 0) {
            return allowedServices.filter(isSafeServiceKey);
        }

        return AiConfig.orchestrator.deploymentRuntimeAccess.allowedServices.filter(isSafeServiceKey);
    }

    /**
     * Stores a bounded stats sample window per service.
     * @param {String} serviceKey Service key.
     * @param {Object} stats Docker stats sample.
     * @returns {void}
     */
    rememberStatsSample(serviceKey, stats) {
        const samples = this.statsSamplesByService.get(serviceKey) || [];

        samples.push(stats);

        this.statsSamplesByService.set(serviceKey, samples.slice(-AiConfig.orchestrator.deploymentStateBridge.statsSampleWindow));
    }

    /**
     * Reads the bounded stats sample window for a service.
     * @param {String} serviceKey Service key.
     * @returns {Object[]}
     */
    getStatsSamples(serviceKey) {
        return this.statsSamplesByService.get(serviceKey) || [];
    }

    /**
     * Reads the bounded recovery-run ledger for the public deployment inspection snapshot.
     * @returns {Promise<Object>}
     */
    async collectRecoveryRunSnapshot() {
        const
            bridgeConfig = AiConfig.orchestrator.deploymentStateBridge,
            limit        = bridgeConfig.recoveryRunLimit,
            source       = 'orchestrator-recovery-run-ledger';

        if (!Number.isFinite(limit)) {
            throw new TypeError(`DeploymentStateBridgeService: recoveryRunLimit must be a finite number, got ${limit}`);
        }

        if (limit < 0) {
            throw new RangeError(`DeploymentStateBridgeService: recoveryRunLimit must be >= 0, got ${limit}`);
        }

        if (limit === 0) {
            return {status: 'disabled', source, limit, entries: [], errors: []};
        }

        try {
            const reader  = this.recoveryRunStateReader || readRecentRecoveryRunStates,
                  entries = await reader({
                dir: AiConfig.orchestrator.recoveryActuator.recoveryRunStateDir,
                limit
            });

            return {status: 'available', source, limit, entries, errors: []};
        } catch (error) {
            this.writeLog?.('WARN', `[DeploymentStateBridge] recovery-run snapshot read failed: ${error.message}`);

            return {
                status : 'degraded',
                source,
                limit,
                entries: [],
                errors : [{reason: 'recovery-run-read-failed', code: error.code || null}]
            };
        }
    }

    /**
     * @summary Folds the durable heal-event ledger into the snapshot's operator-facing immune-system
     * status: the `summarizeHealLedger` totals + currently-frozen set, plus the most-recent
     * `selfHealRecentEventLimit` heal events (newest-first). Read-only — never appends, never triggers a heal (the
     * read-only contract): the observe path must not perturb the system it observes. `healLedgerDir` unset → a
     * `disabled` envelope (graceful degrade — the snapshot still writes). An unreadable/corrupt ledger FILE makes
     * `readHealLedger` throw, which this catches as `status: 'degraded'` + an error reason — a real storage fault
     * is visible, NOT a false-empty `available` snapshot (a missing file stays `available` with empty counts).
     * Mirrors `collectRecoveryRunSnapshot`'s status/source/errors shape.
     * @returns {Promise<Object>} `{status, source, limit, summary, recentEvents, errors}`.
     */
    async collectSelfHealSnapshot() {
        const
            limit  = AiConfig.orchestrator.deploymentStateBridge.selfHealRecentEventLimit,
            source = 'orchestrator-heal-event-ledger';

        // Validate the recent-event cap as its OWN surface (mirrors collectRecoveryRunSnapshot). queryHealLedger
        // treats a negative finite limit as "no cap", so an unvalidated negative would expand the snapshot to EVERY
        // retained event — fail fast instead. 0 = the recent-event list is empty (the folded summary still writes).
        if (!Number.isFinite(limit)) {
            throw new TypeError(`DeploymentStateBridgeService: selfHealRecentEventLimit must be a finite number, got ${limit}`);
        }
        if (limit < 0) {
            throw new RangeError(`DeploymentStateBridgeService: selfHealRecentEventLimit must be >= 0, got ${limit}`);
        }

        if (!this.healLedgerDir) {
            return {status: 'disabled', source, limit, summary: null, recentEvents: [], errors: []};
        }

        try {
            const reader = this.healLedgerReader || readHealLedger,
                  events = await reader({dir: this.healLedgerDir});

            return {
                status      : 'available',
                source,
                limit,
                summary     : summarizeHealLedger(events),
                recentEvents: queryHealLedger(events, {limit}), // validated >= 0; limit 0 → [] (queryHealLedger caps)
                errors      : []
            };
        } catch (error) {
            this.writeLog?.('WARN', `[DeploymentStateBridge] heal-event ledger snapshot read failed: ${error.message}`);

            return {
                status      : 'degraded',
                source,
                limit,
                summary     : null,
                recentEvents: [],
                errors      : [{reason: 'heal-ledger-read-failed', code: error.code || null}]
            };
        }
    }

    /**
     * @summary Projects tenant-repo-sync scheduler, task, config, and revision state into the
     * deployment diagnostic snapshot without exposing repo names, clone URLs, credentials, or logs.
     * @param {Object} options
     * @param {Number} options.observedAt Epoch ms.
     * @returns {Promise<Object>}
     */
    async collectTenantRepoSyncSnapshot({observedAt}) {
        const
            taskName  = 'tenant-repo-sync',
            source    = 'orchestrator-tenant-repo-sync',
            scheduler = {
                globalCadenceMs: AiConfig.orchestrator.intervals.tenantRepoSyncMs,
                sweepCadenceMs : AiConfig.orchestrator.tenantRepoSync.sweepCadenceMs,
                jitterRatio    : AiConfig.orchestrator.tenantRepoSync.jitterRatio,
                due            : null
            },
            errors         = [];

        let enabled       = null,
            taskState     = null,
            configSummary = {
                status       : 'unavailable',
                repoCount    : 0,
                disabledCount: 0,
                tierCounts   : {},
                errors       : []
            },
            repos              = [],
            persistedRevisions = {};

        try {
            if (typeof this.tenantRepoSyncEnabledReader !== 'function') {
                throw createDiagnosticError('tenant-repo-sync-enabled-reader-missing');
            }
            enabled = Boolean(this.tenantRepoSyncEnabledReader());
        } catch (error) {
            errors.push(summarizeDiagnosticError(error, 'tenant-repo-sync-enabled-read-failed'));
        }

        try {
            if (!this.taskStateService?.getTaskState) {
                throw createDiagnosticError('task-state-service-missing');
            }
            taskState = this.taskStateService.getTaskState(taskName) || null;
        } catch (error) {
            errors.push(summarizeDiagnosticError(error, 'task-state-read-failed'));
        }

        if (taskState) {
            scheduler.due = Boolean(buildTenantRepoSyncTrigger({
                enabled   : enabled === true,
                now       : observedAt,
                intervalMs: scheduler.sweepCadenceMs,
                lastRunAt : taskState.lastRunAt || 0
            }));
        }

        try {
            if (!this.tenantRepoSyncService?.resolveTenantReposConfig) {
                throw createDiagnosticError('tenant-repo-sync-service-missing');
            }

            const resolvedConfig = await this.tenantRepoSyncService.resolveTenantReposConfig();
            repos = Array.isArray(resolvedConfig.tenantRepos) ? resolvedConfig.tenantRepos : [];
            configSummary = summarizeTenantRepoConfig(repos);
        } catch (error) {
            errors.push(summarizeDiagnosticError(error, 'tenant-repo-config-read-failed'));
            configSummary = {
                ...configSummary,
                status: 'degraded',
                errors: [summarizeDiagnosticError(error, 'tenant-repo-config-read-failed')]
            };
        }

        try {
            if (!this.tenantRepoSyncService?.readPersistedRevisions || !this.tenantRepoSyncService?.defaultRevisionsFilePath) {
                throw createDiagnosticError('tenant-repo-revision-reader-missing');
            }

            persistedRevisions = await this.tenantRepoSyncService.readPersistedRevisions({
                filePath: this.tenantRepoSyncService.defaultRevisionsFilePath(),
                strict  : true
            });
        } catch (error) {
            errors.push(summarizeDiagnosticError(error, 'tenant-repo-revision-state-read-failed'));
        }

        const repoStates = repos.map(repo => summarizeTenantRepoState({
            repo,
            observedAt,
            taskState,
            persistedRepoState: persistedRevisions[createTenantRepoLabel(repo)] || null,
            globalCadenceMs   : scheduler.globalCadenceMs,
            jitterRatio       : scheduler.jitterRatio
        }));

        return {
            schemaVersion: 1,
            recordType   : 'tenant-repo-sync-deployment-state',
            source,
            observedAt,
            status       : classifyTenantRepoSyncStatus({enabled, taskState, repoCount: repos.length, schedulerDue: scheduler.due, errors}),
            enabled,
            scheduler,
            task         : summarizeTenantRepoTaskState(taskState),
            config       : configSummary,
            repos        : repoStates,
            errors
        };
    }

    /**
     * Returns current time in epoch ms.
     * @returns {Number}
     */
    now() {
        return this.nowFn ? this.nowFn() : Date.now();
    }
}

function summarizeInspect(inspect) {
    if (!inspect || typeof inspect !== 'object') return null;

    const state = inspect.State || {};

    return {
        name        : inspect.Name || null,
        image       : inspect.Config?.Image || inspect.Image || null,
        restartCount: Number.isFinite(inspect.RestartCount) ? inspect.RestartCount : null,
        state       : {
            status    : state.Status || null,
            health    : state.Health?.Status || null,
            startedAt : state.StartedAt || null,
            finishedAt: state.FinishedAt || null,
            exitCode  : Number.isFinite(state.ExitCode) ? state.ExitCode : null,
            oomKilled : typeof state.OOMKilled === 'boolean' ? state.OOMKilled : null,
            error     : state.Error || null
        }
    };
}

function summarizeStats(stats) {
    if (!stats || typeof stats !== 'object') return null;

    const
        memoryUsage = Number(stats.memory_stats?.usage),
        memoryLimit = Number(stats.memory_stats?.limit);

    return {
        cpuPercent      : calculateDockerCpuPercent(stats),
        memoryPercent   : calculateDockerMemoryPercent(stats),
        memoryUsageBytes: Number.isFinite(memoryUsage) ? memoryUsage : null,
        memoryLimitBytes: Number.isFinite(memoryLimit) ? memoryLimit : null,
        pidsCurrent     : Number.isFinite(Number(stats.pids_stats?.current)) ? Number(stats.pids_stats.current) : null
    };
}

function summarizeLogs(logs, maxBytes) {
    if (!logs || typeof logs !== 'object') return null;

    const bounded = boundUtf8Tail(logs.logs, maxBytes);

    return {
        tail     : Number.isFinite(logs.tail) ? logs.tail : null,
        text     : bounded.text,
        truncated: bounded.truncated,
        maxBytes : bounded.maxBytes
    };
}

function summarizeRuntimeAccessError(error, {operation}) {
    return {
        operation,
        message: error.message,
        reason : error.reason || 'runtime-access-error',
        code   : error.code || null,
        details: sanitizeRuntimeAccessDetails(error.details)
    };
}

function sanitizeRuntimeAccessDetails(details) {
    if (!details || typeof details !== 'object') {
        return null;
    }

    return {
        enabled             : Boolean(details.enabled),
        mechanism           : details.mechanism || null,
        composeProject      : details.composeProject || null,
        allowedServices     : Array.isArray(details.allowedServices) ? [...details.allowedServices] : [],
        readOperations      : Array.isArray(details.readOperations) ? [...details.readOperations] : [],
        lifecycleOperations : Array.isArray(details.lifecycleOperations) ? [...details.lifecycleOperations] : [],
        auditMode           : details.auditMode || null,
        socketPathConfigured: Boolean(details.socketPathConfigured),
        serviceKey          : details.serviceKey || null,
        filters             : details.filters || null,
        matchCount          : Number.isFinite(details.matchCount) ? details.matchCount : null,
        hints               : Array.isArray(details.hints) ? unique(details.hints.filter(Boolean)) : []
    };
}

function hasLookupFailure(service) {
    return (service.errors || []).some(error => [
        'compose-service-no-match',
        'compose-service-ambiguous',
        'docker-socket-forbidden',
        'docker-socket-unavailable',
        'docker-container-list-failed',
        'docker-container-list-invalid-json',
        'docker-container-list-invalid-shape',
        'runtime-access-disabled',
        'runtime-mechanism-unsupported',
        'runtime-sidecar-unimplemented',
        'runtime-service-not-allowlisted'
    ].includes(error.reason));
}

function buildBridgeHints({reason, failureReasonCounts}) {
    const hints = [];

    if (reason === 'broad-service-lookup-failure') {
        hints.push('All observed services failed runtime lookup; verify the orchestrator Docker socket mount and Compose project/service labels before investigating individual services.');
    }

    if (failureReasonCounts['compose-service-no-match']) {
        hints.push('If the stack uses a non-default Compose project, set NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT to the project label shown by Docker Compose.');
        hints.push('Ensure NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES and NEO_DEPLOYMENT_STATE_BRIDGE_ALLOWED_SERVICES name Docker com.docker.compose.service labels, not container names.');
    }

    if (failureReasonCounts['compose-service-ambiguous']) {
        hints.push('Multiple containers matched a service label; configure NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT to disambiguate.');
    }

    if (failureReasonCounts['docker-socket-unavailable'] || failureReasonCounts['docker-socket-forbidden']) {
        hints.push('Mount /var/run/docker.sock into the orchestrator with sufficient read permissions when B1 runtime diagnostics are intended, or disable runtime access explicitly.');
    }

    return unique(hints);
}

function countBy(values) {
    return values.reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
}

function unique(values) {
    return [...new Set(values)];
}

function isSafeServiceKey(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_.-]+$/.test(value);
}

/**
 * Builds a stable, order-independent signature of the snapshot's per-service status. Used to
 * edge-trigger the success log: an unchanged signature means a healthy steady-state write whose
 * log line carries no new information and is therefore suppressed.
 * @param {Object[]} services Collected per-service snapshot envelopes.
 * @returns {String}
 */
function buildServiceStateSignature(services) {
    return (Array.isArray(services) ? services : [])
        .map(service => `${service.serviceKey}:${service.status}`)
        .sort()
        .join(',');
}

function createDiagnosticError(code) {
    const error = new Error(code);

    error.code = code;

    return error;
}

function summarizeDiagnosticError(error, reason) {
    return {
        reason,
        code        : error.code || null,
        messageClass: error.name || 'Error'
    };
}

function summarizeTenantRepoConfig(repos) {
    const tierCounts    = {};
    let   disabledCount = 0;

    for (const repo of repos) {
        const tier = repo.configTier || 'unreported';
        tierCounts[tier] = (tierCounts[tier] || 0) + 1;

        if (isTenantRepoDisabled(repo)) {
            disabledCount++;
        }
    }

    return {
        status   : 'available',
        repoCount: repos.length,
        disabledCount,
        tierCounts,
        errors   : []
    };
}

function summarizeTenantRepoTaskState(taskState) {
    if (!taskState || typeof taskState !== 'object') {
        return null;
    }

    return {
        running       : taskState.running === true,
        pid           : Number.isFinite(taskState.pid) ? taskState.pid : null,
        lastRunAt     : Number.isFinite(taskState.lastRunAt) && taskState.lastRunAt > 0 ? new Date(taskState.lastRunAt).toISOString() : null,
        lastSuccessAt : taskState.lastSuccessAt || null,
        lastErrorAt   : taskState.lastErrorAt || null,
        lastExitCode  : Number.isFinite(taskState.lastExitCode) ? taskState.lastExitCode : null,
        lastReason    : taskState.lastReason || null,
        lastCompletion: summarizeTenantRepoTaskCompletion(taskState.lastCompletion)
    };
}

function summarizeTenantRepoTaskCompletion(completion) {
    if (!completion || typeof completion !== 'object') {
        return null;
    }

    const summary = {
        status        : completion.status || null,
        reason        : completion.reason || null,
        reasonCode    : completion.reasonCode || null,
        repoCount     : numberOrNull(completion.repoCount),
        completedCount: numberOrNull(completion.completedCount),
        failedCount   : numberOrNull(completion.failedCount),
        notDueCount   : numberOrNull(completion.notDueCount),
        repos         : []
    };

    if (Array.isArray(completion.repos)) {
        summary.repos = completion.repos.slice(0, 50).map(summarizeTenantRepoOutcome);
    }

    return summary;
}

function summarizeTenantRepoOutcome(outcome) {
    if (!outcome || typeof outcome !== 'object') {
        return null;
    }

    return {
        identityHash        : hashTenantRepoIdentity(outcome),
        status              : outcome.status || null,
        lastIngestedRev     : shortRevision(outcome.lastIngestedRev || outcome.headRevision),
        lastErrorCode       : outcome.lastErrorCode || outcome.code || null,
        lastSourceErrorCode : safeKnowledgeBaseErrorCode(outcome.lastSourceErrorCode || outcome.sourceErrorCode),
        lastSyncDeletedCount: numberOrNull(outcome.lastSyncDeletedCount ?? outcome.deleted),
        consecutiveFailures : numberOrNull(outcome.consecutiveFailures)
    };
}

function summarizeTenantRepoState({repo, observedAt, taskState, persistedRepoState, globalCadenceMs, jitterRatio}) {
    const
        disabled = isTenantRepoDisabled(repo),
        dueState = disabled
            ? {due: false, effectiveCadenceMs: null, jitterMs: null, backoffMultiplier: null, lastRunAttemptAt: persistedRepoState?.lastRunAttemptAt || 0}
            : isRepoDue({repo, persistedRepoState, now: observedAt, globalCadenceMs, jitterRatio}),
        nextDueAtMs  = Number.isFinite(dueState.effectiveCadenceMs)
            ? ((dueState.lastRunAttemptAt || 0) > 0 ? dueState.lastRunAttemptAt + dueState.effectiveCadenceMs : observedAt)
            : null,
        lastOutcome  = findTenantRepoOutcome(taskState?.lastCompletion, repo),
        lastAttempt  = persistedRepoState?.lastRunAttemptAt || 0,
        failures     = persistedRepoState?.consecutiveFailures ?? 0;

    return {
        identityHash       : hashTenantRepoIdentity(repo),
        tenantHash         : hashValue(repo.tenantId),
        repoHash           : hashValue(repo.repoSlug),
        configTier         : repo.configTier || 'unreported',
        disabled,
        status             : classifyTenantRepoState({disabled, due: dueState.due, persistedRepoState, lastOutcome}),
        due                : disabled ? false : dueState.due,
        nextDueAt          : Number.isFinite(nextDueAtMs) ? new Date(nextDueAtMs).toISOString() : null,
        lastIngestedRev    : shortRevision(persistedRepoState?.lastIngestedRev),
        lastRunAttemptAt   : lastAttempt > 0 ? new Date(lastAttempt).toISOString() : null,
        consecutiveFailures: failures,
        effectiveCadenceMs : dueState.effectiveCadenceMs,
        jitterMs           : dueState.jitterMs,
        backoffMultiplier  : dueState.backoffMultiplier,
        lastOutcome
    };
}

function classifyTenantRepoSyncStatus({enabled, taskState, repoCount, schedulerDue, errors}) {
    if (errors.length > 0) {
        return 'degraded';
    }

    if (enabled === false) {
        return 'disabled';
    }

    if (taskState?.running) {
        return 'running';
    }

    if (taskState && isLatestTaskOutcomeFailure(taskState)) {
        return 'failed';
    }

    if (repoCount === 0) {
        return 'no-configured-repos';
    }

    if (schedulerDue === false) {
        return 'not-due';
    }

    if (taskState?.lastSuccessAt) {
        return 'completed';
    }

    return 'idle';
}

function classifyTenantRepoState({disabled, due, persistedRepoState, lastOutcome}) {
    if (disabled) {
        return 'disabled';
    }

    if (lastOutcome?.status) {
        return lastOutcome.status;
    }

    if (!due) {
        return 'not-due';
    }

    if ((persistedRepoState?.consecutiveFailures ?? 0) > 0) {
        return 'degraded';
    }

    if (persistedRepoState?.lastIngestedRev) {
        return 'active';
    }

    return 'due';
}

function findTenantRepoOutcome(completion, repo) {
    if (!completion || !Array.isArray(completion.repos)) {
        return null;
    }

    const match = completion.repos.find(entry => entry?.tenantId === repo.tenantId && entry?.repoSlug === repo.repoSlug);

    return match ? summarizeTenantRepoOutcome(match) : null;
}

function isLatestTaskOutcomeFailure(taskState) {
    const
        errorAt   = Date.parse(taskState.lastErrorAt || ''),
        successAt = Date.parse(taskState.lastSuccessAt || '');

    return Number.isFinite(errorAt) && (!Number.isFinite(successAt) || errorAt >= successAt);
}

function createTenantRepoLabel(repo) {
    return `${repo.tenantId}/${repo.repoSlug}`;
}

function hashTenantRepoIdentity(value) {
    return hashValue(createTenantRepoLabel(value));
}

function hashValue(value) {
    return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function shortRevision(value) {
    return value ? String(value).slice(0, 12) : null;
}

function safeKnowledgeBaseErrorCode(value) {
    return (typeof value === 'string' && /^KB_[A-Z0-9_]{1,120}$/.test(value)) ? value : null;
}

function isTenantRepoDisabled(repo) {
    return repo.disabled === true || repo.enabled === false;
}

function numberOrNull(value) {
    return Number.isFinite(value) ? value : null;
}

export default Neo.setupClass(DeploymentStateBridgeService);
