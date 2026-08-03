import {createHash}                         from 'node:crypto';
import fs                                   from 'fs-extra';
import path                                 from 'node:path';
import Base                                 from '../../../../src/core/Base.mjs';
import AiConfig                             from '../../../config.mjs';
import {probeProviderParallelModelCapacity} from '../../../services/graph/providerReadinessHelper.mjs';
import {
    isTenantRepoAccessReadinessOutcome
} from '../../../services/knowledge-base/helpers/tenantRepoAccessContract.mjs';

import {
    boundUtf8Tail,
    createDeploymentStateSnapshot,
    writeDeploymentStateSnapshot
} from '../../../services/memory-core/helpers/deploymentStateBridgeStore.mjs';
import {
    readBackupReceipt,
    validateOffHostSyncConfig
} from '../../../services/memory-core/helpers/offHostSyncStore.mjs';
import {describeBackupRetryState}    from '../scheduling/backup.mjs';
import {resolveDurabilityPosture}    from './deploymentDurabilityPosture.mjs';
import {summarizeStagingResidue}     from '../../../scripts/maintenance/backupStagingResidueCore.mjs';
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
import {
    classifyTenantRepoCheckpoint,
    normalizeTenantRepoCheckpointState,
    TENANT_REPO_INGEST_CONTRACT_VERSION
} from './tenantRepoCheckpointValidity.mjs';

const KB_CONFIG_BOOTSTRAP_PROJECTION_BY_STATUS = Object.freeze({
    missing: {
        errorCode   : null,
        messageClass: null
    },
    empty: {
        errorCode   : null,
        messageClass: null
    },
    loaded: {
        errorCode   : null,
        messageClass: null
    },
    'read-failed': {
        errorCode   : 'KB_CONFIG_BOOTSTRAP_READ_FAILED',
        messageClass: 'filesystem-read'
    },
    'parse-failed': {
        errorCode   : 'KB_CONFIG_BOOTSTRAP_PARSE_FAILED',
        messageClass: 'yaml-parse'
    },
    'invalid-shape': {
        errorCode   : 'KB_CONFIG_BOOTSTRAP_INVALID_SHAPE',
        messageClass: 'document-shape'
    }
});
const KB_CONFIG_BOOTSTRAP_FAILURE_STATUSES = new Set([
    'read-failed',
    'parse-failed',
    'invalid-shape'
]);

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
    async writeSnapshotIfDue({force = false, shouldWrite} = {}) {
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
            const snapshot = await this.collectSnapshot({generatedAt: now});

            // Effect-boundary fence: the caller's predicate is evaluated AFTER the async collect,
            // at the write boundary — a caller-side condition (e.g. an authority-lease loss) that
            // flips mid-flight must void the write, not just gate the invocation.
            if (typeof shouldWrite === 'function' && !shouldWrite()) {
                return {ok: true, status: 'fenced'};
            }

            const result = await writeDeploymentStateSnapshot({
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
        // The backup retry phase is read HERE rather than inside the projection: instance state is
        // legitimate at this call site, and `collectMaintenanceSnapshot` is contractually detached
        // (a spec invokes it via `.call({})`), so it takes the task state as an argument instead.
        const maintenance = await this.collectMaintenanceSnapshot({
            backupTaskState: this.taskStateService?.getTaskState?.('backup') || null,
            now            : generatedAt
        });

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
     * snapshot with explicit freshness semantics: unreadable/corrupt/oversize/wrong-version receipts
     * project a stable `{status: 'unreadable', kind, finishedAt}` shape so consumers never infer
     * corruption from an absent `lastBackup`. The receipt file survives orchestrator restart by
     * construction; the projection is last-known, never refreshed-on-read.
     *
     * The `durability` block is projected UNCONDITIONALLY, including when no receipt exists yet.
     * That is deliberate and is the point of the block: a posture is a property of the deployment's
     * CONFIGURATION, not of its last run, so it is exactly knowable before any backup has ever
     * happened — which is when it matters most. Returning `null` for a never-backed-up deployment
     * (the previous behaviour) omitted the whole maintenance section, making "no backup has ever
     * run here" indistinguishable from "nothing about maintenance is worth reporting". A deployment
     * one command away from unrecoverable data loss read as silence.
     *
     * `lastBackup` keeps its absent-before-first-run semantics and is simply omitted in that case.
     * @returns {Promise<Object|null>}
     */
    async collectMaintenanceSnapshot({
        backupTaskState   = null,
        now               = Date.now(),
        receiptPath       = path.join(AiConfig.backupPath, 'last-backup-receipt.json'),
        stagingResidueRoot = AiConfig.backupPath
    } = {}) {
        // Module-scope, deliberately not a method: this projection depends only on resolved config
        // and its own argument, never on instance state, and the contract spec asserts that by
        // invoking it detached.
        const durability = resolveConfiguredDurabilityPosture();

        // `stagingResidue` is projected UNCONDITIONALLY, for the same reason `durability` is: it is a
        // property of the backup ROOT rather than of any run, so it is always REPORTABLE — which is
        // not the same as always successfully measured, and `status` carries that difference: an
        // observation that failed reports `unreadable` with null counts, never a zero.
        // `.backup-partial-*` residue is invisible to every root-level enumerator by construction —
        // that invisibility is the safety property keeping torn bundles unrestorable — so this is the only surface
        // its footprint can be seen from at all. Omitting it when clean would make "no residue"
        // indistinguishable from "not reported", which is the failure the `durability` block exists
        // to avoid.
        //
        // `retry` reports the backup lane's bounded-retry phase, and is omitted rather than nulled
        // when no task state was supplied so a detached invocation keeps its run-dependent shape.
        //
        // Both ride HERE rather than on the Memory Core healthcheck's backup block: that block reads
        // the backup DIRECTORY and `mc-server` holds no backup mount, so it reports from a blind
        // container. This orchestrator owns the bind mount and the task state.
        const base = {
            durability,
            stagingResidue: await summarizeStagingResidue(stagingResidueRoot)
        };

        if (backupTaskState) {
            base.retry = describeBackupRetryState({
                now,
                retryDelayMs : AiConfig.orchestrator.intervals.backupRetryDelayMs,
                retryWindowMs: AiConfig.orchestrator.intervals.backupRetryWindowMs,
                taskState    : backupTaskState
            })
        }

        try {
            const outcome = await readBackupReceipt({filePath: receiptPath});

            if (outcome.status === 'missing') return base;

            if (outcome.status === 'unreadable') {
                return {
                    ...base,
                    lastBackup: {
                        finishedAt: outcome.finishedAt,
                        kind      : outcome.kind,
                        status    : 'unreadable'
                    }
                }
            }

            return {...base, lastBackup: outcome.receipt}
        } catch (error) {
            return {
                ...base,
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

        const churnBaseline = this.readChurnBaseline(serviceKey);

        const diagnosis = this.diagnosisService?.diagnose
            ? this.diagnosisService.diagnose({
                serviceKey,
                inspect,
                stats,
                statsSamples   : this.getStatsSamples(serviceKey),
                providerResidency,
                churnBaseline  : churnBaseline?.unreadable ? undefined : churnBaseline,
                plannedRestarts: await this.countPlannedRestarts({serviceKey, observedAt}),
                observedAt
            })
            : null;

        // Persist the baseline BEFORE returning. A restart-churn baseline held in process memory
        // could never work: the orchestrator is itself the process that churns, so an in-memory
        // anchor resets on every restart and the count can never reach a threshold — the same
        // reasoning ADR-0025 rejects in-memory anti-thrash state on. // ticket-ref-ok: names the decision this durability requirement inherits
        // An unjudgeable baseline must not be overwritten by a fresh anchor derived from it —
        // that is the silent-reset path. Leave it and let the ERROR log carry the degradation.
        if (diagnosis?.churnBaseline && !churnBaseline?.unreadable) {
            this.writeChurnBaseline(serviceKey, diagnosis.churnBaseline);
        }

        // `churnBaseline` is INTERNAL scheduling state, not part of the published contract. The
        // decision carries it back so this service can persist it; publishing it would add an
        // undocumented field to `inspect_deployment` that no Contract Ledger row admits.
        const {churnBaseline: _internalBaseline, ...publishedDiagnosis} = diagnosis || {};

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
            diagnosis     : diagnosis ? publishedDiagnosis : null,
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
     * @summary Reads the durable restart-churn baseline for one service.
     *
     * On disk, never in memory. The orchestrator is the process this signal watches, so an
     * in-process anchor would reset on the very event being counted and the threshold could never
     * be reached — a check that is green precisely when it matters most.
     *
     * @param {String} serviceKey
     * @returns {Object|null} `{containerId, restartCount, observedAt}` or null when unset/unreadable.
     */
    readChurnBaseline(serviceKey) {
        try {
            const baseline = fs.readJsonSync(this.churnBaselinePath(serviceKey));

            // A structurally invalid baseline is UNJUDGEABLE, not absent. Collapsing it to null
            // would re-anchor the counter, and a counter that re-anchors whenever its own state is
            // damaged can never reach a threshold — the failure mode disk persistence exists to
            // prevent, reintroduced through the error path.
            if (!baseline || typeof baseline.containerId !== 'string' ||
                !Number.isFinite(baseline.restartCount) || !Number.isFinite(baseline.observedAt)
            ) {
                return {unreadable: true}
            }

            return baseline
        } catch (error) {
            // ENOENT is genuinely "no baseline yet" — the first observation of a generation, and the
            // only case that may legitimately re-anchor.
            if (error?.code === 'ENOENT') return null;

            this.writeLog?.('WARN', `[DeploymentStateBridge] churn baseline unreadable for ${serviceKey}: ${error.message}`);

            return {unreadable: true}
        }
    }

    /**
     * @summary Persists the restart-churn baseline for one service.
     * @param {String} serviceKey
     * @param {Object} baseline
     * @returns {void}
     */
    writeChurnBaseline(serviceKey, baseline) {
        const target  = this.churnBaselinePath(serviceKey),
              staging = `${target}.${process.pid}.tmp`;

        try {
            // Write-then-rename: a direct write torn by a crash leaves a half-written baseline, which
            // the reader above must then treat as unjudgeable — turning a crash into a silently
            // reset counter. `rename` within a directory is atomic, so a reader sees the old
            // baseline or the new one, never a fragment.
            fs.outputJsonSync(staging, baseline);
            fs.renameSync(staging, target)
        } catch (error) {
            // ERROR, not WARN: a baseline that stops advancing means churn stops accumulating, and
            // the signal dies without the record ever going unhealthy.
            this.writeLog?.('ERROR', `[DeploymentStateBridge] churn baseline write FAILED for ${serviceKey}: ${error.message}. Churn detection is degraded until this succeeds.`);
            fs.removeSync(staging)
        }
    }

    /**
     * @summary Resolves the on-disk baseline path for one service.
     * @param {String} serviceKey
     * @returns {String}
     */
    churnBaselinePath(serviceKey) {
        return path.join(this.healLedgerDir, 'churn-baselines', `${String(serviceKey).replace(/[^\w.-]/g, '_')}.json`)
    }

    /**
     * @summary Counts restarts this system itself initiated for one service inside the churn window.
     *
     * Subtracted from the observed delta so a deploy or an actuator restart cannot raise churn. The
     * heal-event ledger is the record of what we did, which makes it the only honest source: this
     * frame cannot otherwise distinguish an actuator restart from a crash, and guessing would fire
     * the alarm on every deploy — after which it gets disabled and the blind spot returns with a
     * dead alarm on top.
     *
     * @param {Object} options
     * @param {String} options.serviceKey
     * @param {Number} options.observedAt
     * @returns {Number}
     */
    async countPlannedRestarts({serviceKey, observedAt}) {
        const baseline = this.readChurnBaseline(serviceKey);

        if (!baseline) return 0;

        try {
            // Same injection seam the snapshot fold uses (`healLedgerReader || readHealLedger`),
            // rather than a second direct reader — one source of ledger truth, and testable.
            // AWAITED: `readHealLedger` is async, and the snapshot fold awaits it too. An earlier
            // revision did not, so `queryHealLedger` received a Promise, matched nothing, and planned
            // restarts counted 0 — every deploy would have raised false churn.
            const reader = this.healLedgerReader || readHealLedger,
                  events = await reader({dir: this.healLedgerDir});

            return queryHealLedger(events, {collections: [serviceKey]})
                // Filter on status too, or one recovery action counts TWICE: `recordRun` writes
                // `status: 'attempt'` and `recordHealOutcome` writes a second row with the SAME
                // type and collection. Double-counting over-subtracts, which suppresses genuine
                // churn — a false negative on the whole signal, and one that only became reachable
                // once the async/epoch defects above were fixed and real events started matching.
                .filter(event => event?.type === 'restart' && event?.status === 'attempt')
                .filter(event => {
                    // `appendHealEvent` stamps `at` as EPOCH MS (healEventLedgerStore: `at:
                    // Number.isFinite(entry.at) ? entry.at : now`). An earlier revision ran
                    // `Date.parse(event.at)` — `Date.parse` of a number is NaN, so every REAL event
                    // was filtered out, planned restarts counted 0, and a deploy would have raised
                    // false churn. It passed its test only because the test fabricated ISO strings.
                    const at = typeof event.at === 'number' ? event.at : Date.parse(event.at ?? '');

                    return Number.isFinite(at) && at >= baseline.observedAt && at <= observedAt;
                })
                .length
        } catch {
            // Unknown provenance must not raise churn: an unreadable ledger means we cannot prove a
            // restart was ours, and a false churn alarm costs more than a missed one.
            return Number.MAX_SAFE_INTEGER
        }
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
                backoffCapMs   : AiConfig.orchestrator.tenantRepoSync.backoffCapMs,
                due            : null
            },
            errors         = [];

        let enabled                    = null,
            taskState                  = null,
            configEnumerationAvailable = true,
            revisionStateAvailable     = true,
            configSummary              = {
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
            configSummary = summarizeTenantRepoConfig(repos, resolvedConfig.configDiagnostics);
        } catch (error) {
            configEnumerationAvailable = false;
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
            revisionStateAvailable = false;
            errors.push(summarizeDiagnosticError(error, 'tenant-repo-revision-state-read-failed'));
        }

        const repoStates = repos.map(repo => summarizeTenantRepoState({
            repo,
            observedAt,
            taskState,
            persistedRepoState: persistedRevisions[createTenantRepoLabel(repo)] || null,
            revisionStateAvailable,
            globalCadenceMs   : scheduler.globalCadenceMs,
            jitterRatio       : scheduler.jitterRatio,
            backoffCapMs      : scheduler.backoffCapMs,
            accessReadiness   : readTenantRepoAccessReadiness(this.tenantRepoSyncService, repo, observedAt)
        }));

        return {
            schemaVersion: 2,
            recordType   : 'tenant-repo-sync-deployment-state',
            source,
            observedAt,
            status       : classifyTenantRepoSyncStatus({
                enabled,
                taskState,
                repoCount   : repos.length,
                schedulerDue: scheduler.due,
                configStatus: configSummary.status,
                errors
            }),
            enabled,
            scheduler,
            task                  : summarizeTenantRepoTaskState(taskState),
            config                : configSummary,
            checkpointRevalidation: summarizeCheckpointRevalidation({
                repoStates,
                stateAvailable: configEnumerationAvailable && revisionStateAvailable
            }),
            accessReadiness: summarizeTenantRepoAccessReadiness({
                repoStates,
                stateAvailable: configEnumerationAvailable
            }),
            repos : repoStates,
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

/**
 * Resolves the off-host durability posture by reading the resolved leaves at this use site and
 * handing them to the pure derivation. The enablement predicate is NOT re-implemented here —
 * `validateOffHostSyncConfig` owns that contract, because the `offHostSync` keys are plain nested
 * values inside the `maintenance` object leaf rather than leaves of their own.
 *
 * Deliberately NOT wrapped in a catch. An earlier revision fell back to `posture: 'unreadable'` on
 * any throw, reasoning that a degraded section beats an unproducible snapshot. That reasoning is
 * wrong here, and the reactive-config SSOT says why: the tree is guaranteed, so the only things this can throw
 * on are a missing leaf or a programming defect — precisely the failures that must fail loud rather
 * than be laundered into a plausible-looking diagnostic value. A posture reading `unreadable` would
 * have been indistinguishable from a real deployment condition, which is the same wrong-subject
 * failure this whole projection exists to remove.
 *
 * Invalid OPERATOR config is a different case and stays non-throwing: it already has an explicit
 * representation via `unmet` plus `offHostSyncConfigValid: false`.
 * @returns {Object}
 */
function resolveConfiguredDurabilityPosture() {
    return resolveDurabilityPosture({
        deploymentMode       : AiConfig.orchestrator.deploymentMode,
        offHostBackupRequired: AiConfig.orchestrator.cloudOnly.offHostBackupRequired,
        validationOutcome    : validateOffHostSyncConfig(AiConfig.maintenance.backup.offHostSync)
    })
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

/**
 * @summary Summarizes effective tenant-repo config and projects bounded bootstrap provenance.
 *
 * Bootstrap document content never crosses this public diagnostic boundary. Failure fields are
 * derived from the allowlisted status rather than copied from the upstream payload, preventing a
 * malformed diagnostic from carrying paths, YAML, tenant identities, credentials, or raw messages.
 *
 * @param {Object[]} repos Effective tenant repository entries.
 * @param {Object} [configDiagnostics] Resolver-owned bounded config diagnostics.
 * @returns {Object}
 */
function summarizeTenantRepoConfig(repos, configDiagnostics) {
    const tierCounts    = {};
    let   disabledCount = 0;

    for (const repo of repos) {
        const tier = repo.configTier || 'unreported';
        tierCounts[tier] = (tierCounts[tier] || 0) + 1;

        if (isTenantRepoDisabled(repo)) {
            disabledCount++;
        }
    }

    const
        bootstrap = summarizeKbConfigBootstrapDiagnostic(
            configDiagnostics && configDiagnostics.bootstrap
        ),
        errors = bootstrap && KB_CONFIG_BOOTSTRAP_FAILURE_STATUSES.has(bootstrap.status)
            ? [{
                reason      : `kb-config-bootstrap-${bootstrap.status}`,
                code        : bootstrap.errorCode,
                messageClass: bootstrap.messageClass
            }]
            : [];

    return {
        status   : errors.length > 0 ? 'degraded' : 'available',
        repoCount: repos.length,
        disabledCount,
        tierCounts,
        bootstrap,
        errors
    };
}

/**
 * @summary Reduces an internal bootstrap diagnostic to the public allowlisted projection.
 * @param {*} diagnostic Candidate resolver diagnostic.
 * @returns {Object|null} Safe bootstrap state, or `null` for a legacy absent diagnostic.
 */
function summarizeKbConfigBootstrapDiagnostic(diagnostic) {
    if (diagnostic === null || diagnostic === undefined) {
        return null;
    }

    const
        candidateStatus = typeof diagnostic === 'object' && diagnostic
            ? diagnostic.status
            : null,
        status = Object.hasOwn(KB_CONFIG_BOOTSTRAP_PROJECTION_BY_STATUS, candidateStatus)
            ? candidateStatus
            : 'invalid-shape',
        projection = KB_CONFIG_BOOTSTRAP_PROJECTION_BY_STATUS[status];

    let tenantCount = null;

    if (status === 'missing' || status === 'empty') {
        tenantCount = 0;
    } else if (
        status === 'loaded' &&
        Number.isInteger(diagnostic.tenantCount) &&
        diagnostic.tenantCount >= 0
    ) {
        tenantCount = diagnostic.tenantCount;
    }

    return {
        status,
        tenantCount,
        errorCode   : projection.errorCode,
        messageClass: projection.messageClass
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
        status                   : completion.status || null,
        reason                   : completion.reason || null,
        reasonCode               : completion.reasonCode || null,
        repoCount                : numberOrNull(completion.repoCount),
        completedCount           : numberOrNull(completion.completedCount),
        failedCount              : numberOrNull(completion.failedCount),
        notDueCount              : numberOrNull(completion.notDueCount),
        revalidationDeferredCount: numberOrNull(completion.revalidationDeferredCount),
        repos                    : []
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

/**
 * @summary Builds aggregate, non-identifying checkpoint-revalidation counts for
 * the tenant-repo deployment snapshot.
 * @param {Object} options
 * @param {Object[]} options.repoStates Redacted per-repo diagnostic rows.
 * @param {Boolean} options.stateAvailable Whether repo enumeration and the persisted manifest were readable.
 * @returns {Object}
 */
function summarizeCheckpointRevalidation({repoStates, stateAvailable}) {
    const summary = {
        status                      : stateAvailable ? 'available' : 'unavailable',
        currentIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION,
        pendingCount                : stateAvailable ? 0 : null,
        failedCount                 : stateAvailable ? 0 : null,
        completeCount               : stateAvailable ? 0 : null,
        uninitializedCount          : stateAvailable ? 0 : null,
        unsupportedCount            : stateAvailable ? 0 : null
    };

    if (!stateAvailable) {
        return summary;
    }

    for (const repoState of repoStates) {
        const countKey = `${repoState.checkpointStatus}Count`;

        if (Object.hasOwn(summary, countKey)) {
            summary[countKey]++;
        }
    }

    return summary;
}

/**
 * @summary Reads process-local access evidence without letting inspection trigger network work.
 * @param {Object|null} service TenantRepoSyncService-compatible source.
 * @param {Object} repo Effective repository entry.
 * @param {Number} observedAt Snapshot observation epoch.
 * @returns {Object|null}
 */
function readTenantRepoAccessReadiness(service, repo, observedAt) {
    if (typeof service?.getTenantRepoAccessReadiness !== 'function') {
        return null;
    }

    try {
        return service.getTenantRepoAccessReadiness(repo, {observedAt});
    } catch {
        return null;
    }
}

/**
 * @summary Reduces one cached access result to its strict public allowlist.
 * @param {Object|null} candidate Process-local readiness candidate.
 * @param {Boolean} disabled Whether the repository is disabled.
 * @returns {{status: String, code: String|null, checkedAt: String|null}}
 */
function summarizeTenantRepoAccessState(candidate, disabled) {
    if (disabled) {
        return {
            status   : 'not-required',
            code     : null,
            checkedAt: null
        };
    }

    const
        status    = candidate?.status,
        code      = typeof candidate?.code === 'string' ? candidate.code : null,
        checkedAt = typeof candidate?.checkedAt === 'string' && Number.isFinite(Date.parse(candidate.checkedAt))
            ? new Date(candidate.checkedAt).toISOString()
            : null;

    if (checkedAt && isTenantRepoAccessReadinessOutcome(status, code)) {
        return {status, code, checkedAt};
    }

    return {
        status   : 'unknown',
        code     : null,
        checkedAt: null
    };
}

/**
 * @summary Builds aggregate access-readiness counts without exposing repository identities.
 * @param {Object} options
 * @param {Object[]} options.repoStates Redacted per-repo diagnostic rows.
 * @param {Boolean} options.stateAvailable Whether effective repo enumeration succeeded.
 * @returns {Object}
 */
function summarizeTenantRepoAccessReadiness({repoStates, stateAvailable}) {
    if (!stateAvailable) {
        return {
            status       : 'unknown',
            requiredCount: null,
            readyCount   : null,
            degradedCount: null,
            unknownCount : null,
            checkedCount : null
        };
    }

    const required = repoStates.filter(repo => !repo.disabled);
    const summary  = {
        status       : 'not-required',
        requiredCount: required.length,
        readyCount   : 0,
        degradedCount: 0,
        unknownCount : 0,
        checkedCount : 0
    };

    for (const repo of required) {
        const status = repo.accessReadiness.status;

        if (status === 'ready') {
            summary.readyCount++;
        } else if (status === 'degraded') {
            summary.degradedCount++;
        } else {
            summary.unknownCount++;
        }

        if (repo.accessReadiness.checkedAt) {
            summary.checkedCount++;
        }
    }

    if (summary.degradedCount > 0) {
        summary.status = 'degraded';
    } else if (summary.unknownCount > 0) {
        summary.status = 'unknown';
    } else if (summary.readyCount > 0) {
        summary.status = 'ready';
    }

    return summary;
}

/**
 * @summary Projects one configured repository into a redacted scheduler and
 * checkpoint-revalidation diagnostic row.
 * @param {Object} options
 * @param {Object} options.repo Effective tenant-repo configuration.
 * @param {Number} options.observedAt Snapshot epoch.
 * @param {Object|null} options.taskState Current scheduler task state.
 * @param {Object|null} options.persistedRepoState Persisted checkpoint state.
 * @param {Boolean} options.revisionStateAvailable Whether the manifest was readable.
 * @param {Number} options.globalCadenceMs Global per-repo cadence.
 * @param {Number} options.jitterRatio Deterministic jitter ratio.
 * @param {Number} [options.backoffCapMs] Failure-backoff ceiling (the `tenantRepoSync.backoffCapMs` leaf); keeps the observed due-state identical to the lane's own computation.
 * @param {Object|null} options.accessReadiness Process-local access evidence.
 * @returns {Object}
 */
function summarizeTenantRepoState({
    repo,
    observedAt,
    taskState,
    persistedRepoState,
    revisionStateAvailable,
    globalCadenceMs,
    jitterRatio,
    backoffCapMs,
    accessReadiness
}) {
    const
        normalizedCheckpoint = normalizeTenantRepoCheckpointState(persistedRepoState),
        checkpointStatus     = revisionStateAvailable
            ? classifyTenantRepoCheckpoint(normalizedCheckpoint)
            : 'unavailable',
        disabled              = isTenantRepoDisabled(repo),
        dueState              = disabled
            ? {due: false, effectiveCadenceMs: null, jitterMs: null, backoffMultiplier: null, lastRunAttemptAt: normalizedCheckpoint?.lastRunAttemptAt || 0}
            : isRepoDue({repo, persistedRepoState: normalizedCheckpoint, now: observedAt, globalCadenceMs, jitterRatio, backoffCapMs}),
        nextDueAtMs           = Number.isFinite(dueState.effectiveCadenceMs)
            ? ((dueState.lastRunAttemptAt || 0) > 0 ? dueState.lastRunAttemptAt + dueState.effectiveCadenceMs : observedAt)
            : null,
        lastOutcome           = findTenantRepoOutcome(taskState?.lastCompletion, repo),
        lastAttempt           = normalizedCheckpoint?.lastRunAttemptAt || 0,
        failures              = normalizedCheckpoint?.consecutiveFailures ?? 0;

    return {
        identityHash                      : hashTenantRepoIdentity(repo),
        tenantHash                        : hashValue(repo.tenantId),
        repoHash                          : hashValue(repo.repoSlug),
        configTier                        : repo.configTier || 'unreported',
        disabled,
        accessReadiness                   : summarizeTenantRepoAccessState(accessReadiness, disabled),
        status                            : classifyTenantRepoState({disabled, due: dueState.due, persistedRepoState: normalizedCheckpoint, lastOutcome}),
        due                               : disabled ? false : dueState.due,
        nextDueAt                         : Number.isFinite(nextDueAtMs) ? new Date(nextDueAtMs).toISOString() : null,
        lastIngestedRev                   : shortRevision(normalizedCheckpoint?.lastIngestedRev),
        lastRunAttemptAt                  : lastAttempt > 0 ? new Date(lastAttempt).toISOString() : null,
        consecutiveFailures               : failures,
        checkpointStatus,
        ingestContractVersion             : normalizedCheckpoint?.ingestContractVersion ?? null,
        lastAttemptedIngestContractVersion: normalizedCheckpoint?.lastAttemptedIngestContractVersion ?? null,
        effectiveCadenceMs                : dueState.effectiveCadenceMs,
        jitterMs                          : dueState.jitterMs,
        backoffMultiplier                 : dueState.backoffMultiplier,
        lastOutcome
    };
}

/**
 * @summary Classifies the tenant-repo-sync deployment state, including fail-honest config diagnostics.
 * @param {Object} options
 * @param {Boolean|null} options.enabled Runtime enablement.
 * @param {Object|null} options.taskState Persisted task state.
 * @param {Number} options.repoCount Effective repository count.
 * @param {Boolean|null} options.schedulerDue Scheduler due state.
 * @param {String} options.configStatus Config diagnostic status.
 * @param {Object[]} options.errors Snapshot collection failures.
 * @returns {String}
 */
function classifyTenantRepoSyncStatus({enabled, taskState, repoCount, schedulerDue, configStatus, errors}) {
    if (errors.length > 0) {
        return 'degraded';
    }

    if (configStatus === 'degraded') {
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
