import {createHash}                         from 'node:crypto';
import fs                                   from 'fs-extra';
import path                                 from 'node:path';
import Base                                 from '../../../../src/core/Base.mjs';
import AiConfig                             from '../../../config.mjs';
import {probeProviderParallelModelCapacity} from '../../../services/graph/providerReadinessHelper.mjs';
import {runHealthcheck}                     from '../../../scripts/diagnostics/mcpHealthcheck.mjs';
import {writeFileAtomicSync}                from '../../../services/shared/atomicFileWrite.mjs';

/**
 * The message `runHealthcheck` produces when the server ANSWERED and reported a status outside the
 * accepted set. Matched rather than re-thrown with a code because that module is also a container
 * healthcheck entrypoint, and adding an error taxonomy to it for one consumer would widen a surface
 * whose whole value is that it stays small.
 * @member {RegExp} STATUS_MISMATCH_MESSAGE
 */
const STATUS_MISMATCH_MESSAGE = /^Expected healthcheck status /;

/**
 * @summary Decides whether a failed direct probe is evidence about the SERVICE or about the PROBE.
 *
 * Pure, exported, and separate from the call that produces the error, because this is the single
 * decision that separates "a wedged container gets restarted" from "a healthy container gets
 * restarted on every sweep" — it has to be exhaustively testable without a live server or a mutated
 * config singleton.
 *
 * Exactly two shapes are statements about the service, and both are discriminated upstream by
 * `mcpHealthcheck` rather than re-derived here:
 *
 * 1. a timeout it classified `service-unresponsive` — the probe was ready well inside its budget and
 *    the service still produced nothing. Its sibling verdict `probe-starved` is explicitly evidence
 *    about the BOX, and on a saturated host that difference is our own scheduling latency versus a
 *    real fault;
 * 2. the server answered and reported a status outside the accepted set.
 *
 * Everything else — refused, unresolved, malformed URL, auth — describes the probe's own
 * configuration. Those return `null`, because a misconfigured probe read as a failed service would
 * complete the evidence pair on every sweep and restart a container that was never unwell.
 *
 * @param {Error} error The rejection from the probe.
 * @returns {Object|null} A failed-probe descriptor, or `null` when the failure is not service evidence.
 */
export function classifyDirectProbeOutcome(error) {
    const verdict = error?.probeTiming?.verdict;

    if (verdict === 'service-unresponsive') {
        return {ok: false, name: 'direct-endpoint-probe', message: 'service-unresponsive'};
    }

    if (verdict === 'probe-starved') {
        return null;
    }

    return STATUS_MISMATCH_MESSAGE.test(error?.message || '')
        ? {ok: false, name: 'direct-endpoint-probe', message: 'status-not-accepted'}
        : null
}
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
    classifyEmbeddingRecoveryState,
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
const EMBEDDING_RECOVERY_PROBE_STATUSES = new Set([
    'never-started',
    'pending',
    'healthy',
    'failed',
    'terminal'
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
         * Read-only provider-activity seam. The orchestrator injects the recorder-owned ledger
         * projection; this service never opens or mutates the telemetry database itself.
         * @member {Function|null} providerActivityProbe=null
         * @protected
         */
        providerActivityProbe: null,
        /**
         * @member {Number|null} providerActivityWindowMs=null
         * @protected
         */
        providerActivityWindowMs: null,
        /**
         * @member {Number|null} providerActivityLimit=null
         * @protected
         */
        providerActivityLimit: null,
        /**
         * Direct-probe seam: `async ({url, expectedStatus, timeoutMs, ...}) => void`, resolving when the
         * service is serving and throwing otherwise. Falls back to `runHealthcheck`. Injected so specs
         * can drive every failure shape — answered-but-wrong-status, starved, unresponsive, unreachable
         * — without a live server, which is the only way the probe/service discrimination is testable.
         * @member {Function|null} directProbeFn=null
         * @protected
         */
        directProbeFn: null,
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
        const
            services    = [],
            serviceKeys = this.getServiceKeys();

        for (const serviceKey of serviceKeys) {
            // Each service owns its observation clock. In particular, local-model provider activity
            // is read adjacent to its diagnosis, after preceding service reads, so an Ollama request
            // that starts during snapshot collection cannot disappear behind a snapshot-start query.
            services.push(await this.collectServiceSnapshot({serviceKey}));
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
     * @summary Asks a service directly whether it is serving — the second, independent evidence channel
     * a `container-unhealthy` state needs before it may license a restart.
     *
     * Independence here is the INVOCATION, not the endpoint. This reaches the same MCP `healthcheck`
     * tool the runtime's canary calls, but from a different process, at a different moment, and — the
     * part that matters — under THIS deployment's expected-status contract rather than whatever the
     * probed plane's own compose happens to declare. A plane whose healthcheck omits `degraded` reports
     * a correctly-serving Memory Core as unhealthy; this probe asks the same server, is told `degraded`,
     * accepts it, and the evidence pair never forms. That divergence is not hypothetical — it was
     * observed on a live plane.
     *
     * **A probe that could not REACH the service returns `null`, never `{ok: false}`, and that
     * distinction is the safety property.** A refused connection, an unresolved host, or a malformed URL
     * says the PROBE is misconfigured; none of them establishes that the service stopped answering.
     * Reporting one as a failed probe would complete the evidence pair out of a fault in our own
     * observability and restart a healthy container on every sweep. Absent evidence stays absent.
     *
     * @param {Object} options
     * @param {String} options.serviceKey Compose service key.
     * @returns {Promise<Object|null>} `{ok, name, message}`, or `null` when no probe is declared for the
     * service or the probe itself could not run.
     */
    async collectDirectProbe({serviceKey}) {
        const bridgeConfig = AiConfig.orchestrator.deploymentStateBridge,
              urls         = Array.isArray(bridgeConfig.directProbeUrls) ? bridgeConfig.directProbeUrls : [],
              // The URL's hostname IS the compose service key, so the declared list is self-describing
              // and cannot drift out of step with a parallel key list.
              url          = urls.find(candidate => {
                  try {
                      return new URL(candidate).hostname === serviceKey
                  } catch {
                      return false
                  }
              });

        if (!url) {
            return null;
        }

        const probe = this.directProbeFn || runHealthcheck;

        try {
            await probe({
                url,
                clientName    : 'neo-orchestrator-direct-probe',
                expectedStatus: bridgeConfig.directProbeExpectedStatus,
                identity      : 'neo-orchestrator-direct-probe',
                timeoutMs     : bridgeConfig.directProbeTimeoutMs
            });

            return {ok: true, name: 'direct-endpoint-probe', message: null};
        } catch (error) {
            const outcome = classifyDirectProbeOutcome(error);

            if (!outcome) {
                this.writeLog?.('WARN', `[DeploymentStateBridge] direct probe for ${serviceKey} produced no service evidence: ${error.message}`);
            }

            return outcome;
        }
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
     * @param {Number|null} [options.observedAt=null] Fixed epoch for deterministic callers.
     * @returns {Promise<Object>}
     */
    async collectServiceSnapshot({serviceKey, observedAt = null}) {
        const
            errors         = [],
            proofs         = [],
            observationNow = () => Number.isFinite(observedAt) ? observedAt : this.now();

        let inspect           = null,
            stats             = null,
            logs              = null,
            providerResidency = null,
            providerActivity  = null;

        // Retained per operation because target IDENTITY, not just the payload, decides whether two
        // reads describe the same container. `readObserve` resolves a target per call, so a compose
        // recreate between inspect and logs lands them on different containers — and the payloads
        // alone cannot show it.
        const proofByOperation = {};

        const read = async (operation, args = {}) => {
            try {
                const result = await this.runtimeAccessService.readObserve({serviceKey, operation, ...args});
                proofs.push(result.proof);
                proofByOperation[operation] = result.proof;
                return result.data;
            } catch (error) {
                errors.push(summarizeRuntimeAccessError(error, {operation}));
                return null;
            }
        };

        inspect = await read('inspect');
        stats   = await read('stats');
        const statsObservedAt = observationNow();

        const bridgeConfig = AiConfig.orchestrator.deploymentStateBridge;

        if (bridgeConfig.includeLogs) {
            // The interval is derived from the SAME inspect this snapshot publishes, so the slice
            // and the stopped fact describe one incarnation. A running container has no
            // `FinishedAt`, so it yields no interval and the read stays unbounded — correct, since
            // there is no death to attribute yet.
            logs = await read('logs', {
                since: inspect?.State?.StartedAt  ?? null,
                tail : bridgeConfig.logTail,
                until: inspect?.State?.FinishedAt ?? null
            });
        }

        providerResidency = await this.collectProviderResidency({serviceKey, observedAt: observationNow()});

        // The SECOND evidence channel. Until this existed, `endpointProbe` had no producer anywhere in
        // the orchestrator, so ADR-0025 §2.4's authoritative pair could never form and a wedged // ticket-ref-ok: the ADR clause is the reason this call exists at all
        // container was diagnosed and never acted on.
        const endpointProbe = await this.collectDirectProbe({serviceKey});

        const churnBaseline = this.readChurnBaseline(serviceKey);

        // A failed runtime read must not reach `diagnose()` as a silent `inspect: null`. Absent
        // input yields no lifecycle facts, so the decision returns `healthy` — a read FAILURE
        // reported as health, which is the same shape as every other green-on-an-unmeasured-axis
        // defect this ticket exists to close. `collectAndDiagnose` already emits
        // `runtime-read-failed` on this path; the bridge calls `diagnose()` directly and did not.
        const inspectReadFailed = inspect === null &&
            errors.some(entry => entry?.operation === 'inspect' || entry?.detail?.operation === 'inspect');

        // Summarized ONCE, here, and reused by both the diagnosis and the published snapshot below.
        // The heap attribution needs the same two `Config.Cmd` observations this service already
        // derives (`nodeCommand`, `declaredHeapCeilingMb`) plus the same bounded tail it already
        // reads — so diagnosis consumes them rather than re-deriving, and there stays exactly one
        // place that decides what "a Node service" and "the log tail" mean.
        const
            inspectSummary = summarizeInspect(inspect),
            // The interval proves a TIME RANGE; this proves it was applied to the container whose
            // inspect produced the stopped fact. Both are required before a slice may be called
            // incarnation-bounded — a matching range on a different container is not this run.
            sameTarget     = Boolean(
                proofByOperation.logs?.target?.containerId &&
                proofByOperation.inspect?.target?.containerId &&
                proofByOperation.logs.target.containerId === proofByOperation.inspect.target.containerId
            ),
            sampleContainerId = typeof proofByOperation.inspect?.target?.containerId === 'string' &&
                proofByOperation.inspect.target.containerId === proofByOperation.stats?.target?.containerId
                ? proofByOperation.inspect.target.containerId
                : null,
            logSummary     = summarizeLogs(logs, bridgeConfig.logMaxBytes, {sameTarget}),
            // Consumes the SAME `nodeCommand` observation the heap attribution uses, rather than
            // re-deriving what "a Node service" means. Placed after the summary for that reason
            // alone; it is otherwise a sibling of `providerResidency` — nullable, non-Docker-derived,
            // and published on the same record.
            heapObservation = this.readHeapObservation({
                serviceKey,
                nodeCommand: inspectSummary?.nodeCommand ?? null,
                observedAt : statsObservedAt
            });

        // Remembered HERE rather than at the read above, because the heap observation rides ON the
        // stats sample and is only resolvable once `inspectSummary` exists. Nothing between the two
        // points reads the sample window, so the move is behaviour-preserving for the container
        // metrics — and it is what lets the V8-scoped ratio reuse the SAME sustained-window machinery
        // instead of growing a second retention lifecycle with its own bound and its own drift.
        //
        // The pairing is correct by construction rather than by convention: both terms carry this
        // collection's `observedAt`, so a heap percent and a container percent from one sample
        // describe one instant. A parallel sample store would have to re-establish that alignment,
        // and could silently lose it.
        if (stats) {
            this.rememberStatsSample(serviceKey, stats, statsObservedAt, heapObservation, sampleContainerId);
        }

        const statsSamples    = this.getStatsSamples(serviceKey);
        const plannedRestarts = await this.countPlannedRestarts({serviceKey, observedAt: observationNow()});

        // Query after every preceding async read and immediately before the synchronous diagnosis.
        // This is the safety boundary: a snapshot-start projection can claim idle even though a
        // request began while earlier services were still being observed.
        if (this.isProviderResidencyServiceKey(serviceKey)) {
            providerActivity = await this.collectProviderActivity({observedAt: observationNow()});
        }

        const diagnosisObservedAt = observationNow();

        const diagnosis = this.diagnosisService?.diagnose
            ? this.diagnosisService.diagnose({
                inspectReadFailed,
                serviceKey,
                inspect,
                stats,
                statsSamples,
                runtimeContainerId       : sampleContainerId,
                endpointProbe,
                providerResidency,
                providerActivity,
                providerResidencyEligible: this.isProviderResidencyServiceKey(serviceKey),
                churnBaseline            : churnBaseline?.unreadable ? undefined : churnBaseline,
                plannedRestarts,
                // `null` when `includeLogs` is off — which must surface as an UNAVAILABLE
                // attribution, never as "not a heap death". A disabled channel is not evidence.
                logs                 : logSummary,
                nodeCommand          : inspectSummary?.nodeCommand ?? null,
                declaredHeapCeilingMb: inspectSummary?.declaredHeapCeilingMb ?? null,
                observedAt           : diagnosisObservedAt
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
            observedAt    : diagnosisObservedAt,
            status        : errors.length > 0 ? 'degraded' : 'available',
            inspect       : inspectSummary,
            stats         : summarizeStats(stats),
            logs          : logSummary,
            providerResidency,
            // WAS COMPUTED AND DISCARDED. Without it, `providerResidency: null` is unreadable from
            // the artifact: a reader cannot tell "this service was never eligible for residency
            // observation" from "we asked and got nothing back". Those are opposite facts — the
            // first is the configured normal for every non-provider container, the second is a
            // broken instrument — and collapsing them cost an incident three maintainers and a
            // morning, each attributing a configured absence to a sick provider.
            //
            // The flag was already passed into `diagnose()` and simply never reached the record, so
            // every reader outside this process had strictly less information than the producer.
            providerResidencyEligible: this.isProviderResidencyServiceKey(serviceKey),
            providerActivity,
            heapObservation,
            // EVERY snapshot, independent of load. The classification, the threshold that applies to
            // it, and the measured window state used to live only inside a sustained-saturation fact,
            // so a healthy store exposed none of them and no load-independent claim about the
            // classification machinery was verifiable from outside the process.
            classification: this.diagnosisService?.describeClassification
                ? this.diagnosisService.describeClassification({serviceKey, statsSamples})
                : null,
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
            undeclaredHeapCeilingServices = selectUndeclaredHeapCeilingServices(serviceList),
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
                providerResidencyServiceKeys: Array.isArray(AiConfig.orchestrator.deploymentStateBridge.providerResidencyServiceKeys) ? [...AiConfig.orchestrator.deploymentStateBridge.providerResidencyServiceKeys] : [],
                // Residency keys the bridge will never evaluate, because it only ever tests the
                // predicate against a service it ENUMERATES. The effect is PER KEY, not global: a
                // listed key contributes nothing while any enumerated peer keeps observing normally,
                // so a partial overlap yields a partly-live pair rather than a dead one. Only a ZERO
                // intersection — every configured key unobservable — silences residency and
                // provider-activity across the whole snapshot for the life of the deployment, which
                // is the control-that-cannot-fire case. Published rather than logged: the reader
                // diagnosing an absent residency reading is outside this process, and a warning in
                // our logs is not reachable from the snapshot they are holding.
                unobservableResidencyKeys   : this.collectUnobservableResidencyKeys()
            },
            serviceResolution: {
                serviceCount        : serviceList.length,
                degradedServiceCount: degradedServices.length,
                allServicesDegraded,
                broadLookupFailure,
                lookupFailureCount,
                failureReasonCounts,
                operationFailureCounts,
                services            : serviceFailureStates,
                // Observe-only, `record`-terminal: no action, no privilege, no restart. It states
                // that a Node service was started with no `--max-old-space-size`, which is the
                // condition under which V8 picks a heuristic well below the container's allowance
                // and self-aborts with ExitCode 0 and OOMKilled false — a failure with no signature.
                //
                // Deliberately NOT a member of the `facts` array. `selectEvidenceFacts(facts, …)`
                // is called with the WHOLE array at every classification branch, so anything added
                // there becomes candidate evidence for every diagnosis. That is what the earlier
                // attempt got wrong, and an observability statement is the wrong shape for an
                // evidence array regardless.
                undeclaredHeapCeilingServices
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
        if (!this.isProviderResidencyServiceKey(serviceKey)) {
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

            // Reachable ONLY through the injected seam. `probeProviderParallelModelCapacity` has
            // five exits — three `throw`s and two object literals — so the SHIPPED probe cannot
            // return a falsy value; even the degenerate case returns
            // `{ready: true, skipped: true, reason: 'missing-host'|'unsupported-provider'}`. A test
            // double can and does return `null`, and without this guard the spread below would emit
            // a degenerate `{targetIdentity}` record that claims an observation nobody made.
            //
            // So `null` from this method carries TWO meanings, and only one of them can occur in
            // production: not eligible (the check above), or an injected probe declining. That is
            // why `providerResidencyEligible` is now on the record — it separates them for a reader
            // who cannot see which probe was installed.
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
     * @summary Resolves whether a Compose service participates in provider-residency observation.
     * The same predicate gates residency and adjacent provider-activity collection so a configured
     * service can never receive one half of the residual-load evidence pair without the other.
     * @param {String} serviceKey Compose service key.
     * @returns {Boolean}
     */
    isProviderResidencyServiceKey(serviceKey) {
        return AiConfig.orchestrator.deploymentStateBridge.providerResidencyServiceKeys.includes(serviceKey);
    }

    /**
     * @summary Residency keys this bridge can never evaluate, because it does not enumerate them.
     *
     * `isProviderResidencyServiceKey()` is only ever called with a serviceKey the bridge already
     * enumerates, so a residency key outside `allowedServices` is unreachable by construction — the
     * predicate cannot return `true` **for that key**. The effect is per key: the unenumerated key
     * contributes nothing while any enumerated peer keeps observing normally. Only a **zero**
     * intersection leaves `collectProviderResidency()` and `providerActivity` — gated by the same
     * predicate — absent across every service. Nothing fails in either case; the pair simply reports
     * the same value a correctly-configured non-provider container reports.
     *
     * Measured on a live plane: `allowedServices` was aliased to the orchestrator's runtime-access
     * list while the residency default named the model container, giving a zero intersection and
     * leaving both fields `null` for the life of the deployment — so the reader concluded the
     * provider was unobservable rather than unasked. That alias is **deliberate** on the profile
     * that carries it (it runs a host model and monitors only what it starts), which is what makes
     * this worth reporting rather than fixing there: the misleading `null` is a permanent steady
     * state, not a misconfiguration anyone would eventually notice.
     *
     * @returns {String[]} Configured residency keys the enumeration does not cover.
     */
    collectUnobservableResidencyKeys() {
        const configured = AiConfig.orchestrator.deploymentStateBridge.providerResidencyServiceKeys,
              enumerated = new Set(this.getServiceKeys());

        return Array.isArray(configured) ? configured.filter(key => !enumerated.has(key)) : []
    }

    /**
     * @summary Reads one bounded, recorder-owned provider-work projection without dispatching provider
     * work or treating an unavailable observer as an idle provider.
     * @param {Object} options
     * @param {Number} options.observedAt Snapshot observation epoch ms.
     * @returns {Promise<Object>}
     */
    async collectProviderActivity({observedAt}) {
        const unavailable = reason => ({
            schemaVersion             : 1,
            recordType                : 'deployment-provider-activity',
            source                    : 'provider-activity-ledger',
            status                    : 'unavailable',
            unavailableReason         : reason,
            observedAt,
            sinceMs                   : Number.isFinite(this.providerActivityWindowMs) ? this.providerActivityWindowMs : null,
            totalActivities           : null,
            totalInFlight             : null,
            totalRecentCompletions    : null,
            inFlightTruncated         : null,
            recentCompletionsTruncated: null,
            inFlight                  : null,
            recentCompletions         : null
        });

        if (typeof this.providerActivityProbe !== 'function') return unavailable('probe-unconfigured');
        if (!Number.isFinite(this.providerActivityWindowMs) || this.providerActivityWindowMs <= 0 ||
            !Number.isInteger(this.providerActivityLimit) || this.providerActivityLimit <= 0
        ) {
            return unavailable('projection-bounds-invalid');
        }

        try {
            const projection = await this.providerActivityProbe({
                sinceTs: observedAt - this.providerActivityWindowMs,
                limit  : this.providerActivityLimit,
                observedAt
            });

            if (!projection || !['ok', 'partial', 'unavailable'].includes(projection.status)) {
                return unavailable('projection-malformed');
            }

            return {
                ...projection,
                schemaVersion    : 1,
                recordType       : 'deployment-provider-activity',
                source           : 'provider-activity-ledger',
                observedAt,
                sinceMs          : this.providerActivityWindowMs,
                unavailableReason: projection.status === 'ok'
                    ? null
                    : (projection.unavailableReason || 'recorder-projection-unavailable')
            };
        } catch {
            return unavailable('projection-read-failed');
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
     * @summary Reads one service's self-reported heap observation and bounds it before publishing.
     *
     * **This is the only field on the record the process wrote about itself.** Everything else is
     * observed from outside over the Docker socket. That difference is marked rather than smoothed,
     * because the two provenances fail in opposite directions: an external observation degrades when
     * the *observer* breaks, while a self-report degrades when the *subject* breaks — a process dying
     * of heap exhaustion stops reporting precisely when the number is most wanted. So absence here is
     * never health, and the previous value is never served as the current one.
     *
     * **Staleness and pairability are the same measurement at two thresholds, and saying so is the
     * point.** The container `stats` sample is stamped with this collection's `observedAt`, so the
     * age of the self-report IS its skew against the container reading; there is no second,
     * independent check to hide behind. They are separated because they answer different questions:
     * `staleAfterMs` asks whether the observation still describes the service at all, while
     * `maxSkewMs` asks whether it may be put in a ratio with the container number. On this deployment
     * container memory was measured moving ~93 MiB inside 45 seconds, so an observation may be recent
     * enough to report and still too far away to do arithmetic against — which is why `pairable` is a
     * separate field rather than a stricter `status`.
     *
     * `config` defaults to the use-site read and exists as one seam so a spec can exercise the
     * disabled and bounded arms against a temporary directory. The shared `AiConfig` singleton is
     * never mutated to isolate a test — that is the mechanism that bled test data into live stores.
     *
     * @param {Object}       options
     * @param {String}       options.serviceKey  Service whose observation to read.
     * @param {Boolean|null} options.nodeCommand Whether the container runs a Node process.
     * @param {Number}       options.observedAt  Epoch ms of this collection — the container reading's stamp.
     * @param {Object}      [options.config]     Resolved `heapObservation` leaves.
     * @returns {Object} Always an envelope; `observation` is `null` whenever `status` is `unavailable`.
     */
    readHeapObservation({serviceKey, nodeCommand, observedAt, config = AiConfig.heapObservation}) {
        const
            maxSkewMs    = config.maxSkewMs,
            staleAfterMs = config.staleAfterMs,
            unavailable  = reason => ({
                schemaVersion    : 1,
                recordType       : 'deployment-heap-observation',
                serviceKey,
                provenance       : 'self-reported',
                status           : 'unavailable',
                unavailableReason: reason,
                ageMs            : null,
                pairable         : false,
                maxSkewMs,
                staleAfterMs,
                observation      : null
            });

        if (!config.enabled) {
            // A disabled channel is not evidence of a healthy heap, exactly as a disabled log read is
            // not evidence of a clean exit.
            return unavailable('channel-disabled')
        }

        // Fail closed on identity rather than on the file's absence: a non-Node service must never
        // produce an observation even if a stale or hand-placed file sits at its path.
        //
        // **The REFUSAL is one decision; the REASON is two.** `nodeCommand !== true` is the correct
        // gate — both "not Node" and "could not tell" must refuse — but reporting both as `not-node`
        // collapses a positive classification together with an absence of one. A downstream consumer
        // then reads `not-node` as an assertion that the service HAS no heap, when it may only mean
        // the inspect was unreadable. That is exactly what happened: the diagnosis service treated an
        // all-`not-node` window as source-owned authority for the container-scoped ratio, so an
        // unknown identity manufactured a container fact it had no standing to make.
        // A fail-closed refusal is not a positive classification, and must not be published as one.
        if (nodeCommand !== true) {
            return unavailable(nodeCommand === false ? 'not-node' : 'identity-unknown')
        }

        let record;

        try {
            record = fs.readJsonSync(path.resolve(config.dir, `${serviceKey}.json`))
        } catch (error) {
            return unavailable(error.code === 'ENOENT' ? 'absent' : 'unreadable')
        }

        if (record?.recordType !== 'process-heap-observation') {
            return unavailable('malformed')
        }

        // The reader resolved this path from `serviceKey`; the writer stamped the record with its own.
        // Comparing them is what makes a mixed-up mount or a copied file detectable instead of
        // silently attributing one process's heap to another — the same falsifier `incarnationBounded`
        // applies to log slices.
        if (record.serviceKey !== serviceKey) {
            return unavailable('identity-mismatch')
        }

        const stamp = record.observation?.observedAt;

        if (!Number.isFinite(stamp)) {
            return unavailable('malformed')
        }

        const ageMs = observedAt - stamp;

        // A report from the future means the two clocks disagree, and pairing numbers across
        // disagreeing clocks is the arithmetic hazard this bound exists to prevent. Reported as its
        // own reason rather than folded into staleness, because the remedy is different.
        if (ageMs < -maxSkewMs) {
            return unavailable('clock-skew')
        }

        if (ageMs > staleAfterMs) {
            return unavailable('stale')
        }

        return {
            schemaVersion    : 1,
            recordType       : 'deployment-heap-observation',
            serviceKey,
            provenance       : 'self-reported',
            status           : 'available',
            unavailableReason: null,
            ageMs,
            pairable         : Math.abs(ageMs) <= maxSkewMs,
            maxSkewMs,
            staleAfterMs,
            observation      : record.observation
        }
    }

    /**
     * @summary Persists the restart-churn baseline for one service.
     * @param {String} serviceKey
     * @param {Object} baseline
     * @returns {void}
     */
    writeChurnBaseline(serviceKey, baseline) {
        try {
            // Write-then-rename: a direct write torn by a crash leaves a half-written baseline, which
            // the reader above must then treat as unjudgeable — turning a crash into a silently
            // reset counter. `rename` within a directory is atomic, so a reader sees the old
            // baseline or the new one, never a fragment. The former `${target}.${pid}.tmp` scratch was
            // unique per process, but baselines are written per service key inside one.
            writeFileAtomicSync(this.churnBaselinePath(serviceKey), JSON.stringify(baseline, null, 2) + '\n')
        } catch (error) {
            // ERROR, not WARN: a baseline that stops advancing means churn stops accumulating, and
            // the signal dies without the record ever going unhealthy.
            this.writeLog?.('ERROR', `[DeploymentStateBridge] churn baseline write FAILED for ${serviceKey}: ${error.message}. Churn detection is degraded until this succeeds.`);
            // The scratch cleanup that used to live here is the primitive's `finally`, which runs on
            // the failure path — there is no leaked sibling left for this block to remove.
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
     *
     * Each sample is stamped with its observation time, because the consumer's sustained-window
     * check measures the elapsed span across the window rather than counting samples. Without the
     * stamp there is no span to measure, and two samples taken milliseconds apart would satisfy a
     * "sustained 30 seconds" claim — which is what let single-fact sufficiency rest on a window
     * nothing had observed.
     *
     * @param {String} serviceKey Service key.
     * @param {Object} stats Docker stats sample.
     * @param {Number} [observedAt] Epoch ms for this sample. Omitted leaves the sample unstamped,
     *     which fails the span check closed rather than inheriting an unearned window.
     * @param {Object|null} [heapObservation] This service's self-reported heap envelope at the same
     *     instant, carried ON the sample so the V8-scoped ratio inherits this window rather than
     *     maintaining a second one. `null` is the honest value for a non-Node or unreported service
     *     and must never be read as zero usage.
     * @param {String|null} [containerId=null] Runtime-access proof identity shared by inspect/stats.
     * @returns {void}
     */
    rememberStatsSample(serviceKey, stats, observedAt, heapObservation = null, containerId = null) {
        let samples = this.statsSamplesByService.get(serviceKey) || [];

        // A sustained window belongs to one container incarnation. A newly proven identity clears
        // every earlier sample whose identity is absent or different; otherwise a recreate can join
        // two short high-CPU bursts into one authoritative recovery trigger.
        if (containerId && samples.some(sample => sample.containerId !== containerId)) {
            samples = [];
        }

        // Shallow copy with additive keys: the percent calculators read specific Docker fields and
        // ignore anything else, so this cannot alter their arithmetic.
        samples.push(Number.isFinite(observedAt)
            ? {...stats, observedAtMs: observedAt, heapObservation, containerId}
            : {...stats, heapObservation, containerId});

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

        const embeddingRecoveryProbe = summarizeEmbeddingRecoveryProbe(
            readEmbeddingRecoveryProbeSnapshot(this.tenantRepoSyncService)
        );

        const repoStates = repos.map(repo => summarizeTenantRepoState({
            repo,
            observedAt,
            taskState,
            persistedRepoState: persistedRevisions[createTenantRepoLabel(repo)] || null,
            revisionStateAvailable,
            globalCadenceMs   : scheduler.globalCadenceMs,
            jitterRatio       : scheduler.jitterRatio,
            backoffCapMs      : scheduler.backoffCapMs,
            accessReadiness   : readTenantRepoAccessReadiness(this.tenantRepoSyncService, repo, observedAt),
            embeddingRecoveryProbe
        }));

        return {
            schemaVersion: 3,
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
            embeddingRecoveryProbe,
            repos                 : repoStates,
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

/**
 * @summary Reads the V8 old-space ceiling a container was STARTED with, from its command.
 *
 * Three states, and the third is the point. `Config.Cmd` records the argument the container was
 * launched with; when a command has several `node` invocations (the overlay/no-overlay branches the
 * MCP servers carry) it does NOT say which branch is executing. So a divergent pair is not a
 * value to choose between — reporting either one would be a guess with a number attached. It
 * reports `'unknown'` instead, and the caller treats that as "not observable", never as a reading.
 *
 * This is what the container was TOLD, never what V8 enforces. No V8-scoped metric exists for a
 * sibling container anywhere in `ai/`, so the field name says `declared` and means it.
 *
 * @param {String[]|String} cmd `Config.Cmd`, as Docker returns it.
 * @returns {Number|String|null} the agreed ceiling in MB · `'unknown'` when declarations diverge ·
 * `null` when none is declared.
 */
export function parseDeclaredHeapCeilingMb(cmd) {
    const
        text     = commandText(cmd),
        declared = [...text.matchAll(/--max-old-space-size=(\d+)/g)].map(match => Number(match[1]));

    if (declared.length === 0)               return null;
    if (new Set(declared).size > 1)          return 'unknown';

    return declared[0]
}

/**
 * @summary Flattens `Config.Cmd` to searchable text, tolerating the array and string forms Docker uses.
 * @param {String[]|String} cmd
 * @returns {String}
 */
function commandText(cmd) {
    return Array.isArray(cmd) ? cmd.join(' ') : typeof cmd === 'string' ? cmd : ''
}

/**
 * @summary Whether a container's command launches Node at all.
 *
 * A missing heap ceiling only means something for a **Node** service — `chroma` runs
 * `["run", "/config.yaml"]` and has no V8 to bound, so an undeclared-ceiling finding against it
 * would be noise the reader has to learn to ignore.
 *
 * Derived from the command rather than inferred from the image name. The image is a **proxy** for
 * runtime — it holds until someone adds a Node service on a different base or a non-Node entrypoint
 * to the shared image, and then it holds silently and wrongly. The command is the direct
 * observation.
 *
 * @param {String[]|String} cmd `Config.Cmd`, as Docker returns it.
 * @returns {Boolean}
 */
export function isNodeCommand(cmd) {
    return /(^|[\s;&|"'`(])node(\s|$)/.test(commandText(cmd))
}

/**
 * @summary Names the Node services that were started with no declared heap ceiling.
 *
 * Pure on purpose — the enclosing `collectBridgeDiagnostics` reads `AiConfig` and runtime-holder
 * state, so folding this inline would make the rule testable only through a live service. The rule
 * is the part worth guarding.
 *
 * Three populations are deliberately NOT findings:
 * - **non-Node** services — nothing with a V8 heap to bound.
 * - **`'unknown'`** — divergent declarations mean the ceiling could not be OBSERVED. Listing it
 *   would publish *observed an absence* where the truth is *could not observe*.
 * - an **unreadable `inspect`** — a failed read is already reported as a degraded service.
 *
 * @param {Object[]} services Per-service snapshots carrying `summarizeInspect()` output.
 * @returns {String[]} service keys, in input order.
 */
export function selectUndeclaredHeapCeilingServices(services) {
    return (Array.isArray(services) ? services : [])
        .filter(service => service?.inspect?.nodeCommand === true &&
                           service?.inspect?.declaredHeapCeilingMb === null)
        .map(service => service.serviceKey)
}

function summarizeInspect(inspect) {
    if (!inspect || typeof inspect !== 'object') return null;

    const state = inspect.State || {};

    return {
        name        : inspect.Name || null,
        image       : inspect.Config?.Image || inspect.Image || null,
        restartCount: Number.isFinite(inspect.RestartCount) ? inspect.RestartCount : null,
        // Admitted by this ticket's Contract Ledger. Paired with `stats.memoryLimitBytes`, which is
        // already published, it lets a reader see a ceiling declared BELOW the container's own
        // allowance — the shape that aborts Node while the cgroup still looks half-idle.
        //
        // `nodeCommand` travels WITH it because the two are only meaningful together: a null ceiling
        // is a finding on a Node service and a non-event on anything else. Publishing the ceiling
        // alone would make every reader re-derive the qualifier, and re-derivation is where the
        // image-name proxy gets invented.
        declaredHeapCeilingMb: parseDeclaredHeapCeilingMb(inspect.Config?.Cmd),
        nodeCommand          : isNodeCommand(inspect.Config?.Cmd),
        state                : {
            status    : state.Status || null,
            health    : state.Health?.Status || null,
            startedAt : state.StartedAt || null,
            finishedAt: state.FinishedAt || null,
            exitCode  : Number.isFinite(state.ExitCode) ? state.ExitCode : null,
            oomKilled : typeof state.OOMKilled === 'boolean' ? state.OOMKilled : null,
            error     : state.Error || null,
            // Published BESIDE `health`, never folded into it. `health` remains the runtime's own
            // verdict — consumers and the recovery lane depend on that meaning being untouched —
            // while this carries the rate that verdict cannot express.
            probeReliability: summarizeProbeReliability(state.Health)
        }
    };
}

/**
 * @summary Derives a probe FAILURE RATE from the health-check ring, so degraded-but-serving is sayable.
 *
 * **A container runtime flips to `unhealthy` only after `retries` CONSECUTIVE failures.** At
 * `retries: 12` that is two unbroken minutes, so a service failing a third of its probes
 * indefinitely resets the streak on every success and is *structurally incapable* of ever being
 * marked unhealthy. The layer can say **dead** and it can say **healthy**; it has no way to say
 * **degraded-but-serving**, which is the state a saturated or contended plane actually occupies.
 *
 * A binary derived from consecutiveness cannot express a rate, and degradation is a rate. The
 * evidence was already being fetched and thrown away: `State.Health.Log` is a ring of recent probe
 * results carrying each `ExitCode`. Nothing here probes anything new — it reads what the existing
 * `inspect` already returned.
 *
 * Observed on the canonical plane while every surface reported `healthy`: four failures and one
 * success in the ring, with `FailingStreak` oscillating 4 → 0. Both numbers were true; neither was
 * reportable as degradation, and two maintainer seats worked in that state for hours.
 *
 * `failingStreak` travels alongside deliberately — the streak measures PHASE (how far into the
 * current run of failures we are), the rate measures HEALTH. Publishing the streak alone is what
 * made an oscillating service look recovered every time it happened to be observed after a pass.
 *
 * @param {Object} [health] The `State.Health` object from a container inspect.
 * @returns {Object|null} `{sampleCount, failureCount, failureRate, failingStreak, disposition}`,
 *     or `null` when the container declares no healthcheck at all.
 */
export function summarizeProbeReliability(health) {
    // NOT-APPLICABLE and UNAVAILABLE are different facts and must not collapse. A container that
    // declares no healthcheck has nothing to report; one that declares a healthcheck and has not
    // been sampled yet has something to report and does not know it. Returning the same value for
    // both makes an unsampled service read as an unprobeable one — which is how "no data" gets
    // mistaken for "no concern".
    if (!health || typeof health !== 'object') {
        return {status: 'not-applicable', reason: 'no-healthcheck-declared'};
    }

    const log = Array.isArray(health.Log) ? health.Log : [];

    if (log.length === 0) {
        return {status: 'unavailable', reason: 'no-samples-yet'};
    }

    // A probe passes on exit 0 and fails on anything else, INCLUDING -1 — which is how a runtime
    // reports "the check exceeded its own timeout". Treating a non-finite or negative code as
    // "not a failure" would discard exactly the timeouts this summary exists to count.
    const sampleCount  = log.length,
          failureCount = log.filter(entry => entry?.ExitCode !== 0).length;

    // RAW FACTS ONLY — deliberately no verdict. An earlier revision published a `disposition`
    // naming the service `nominal` / `degraded-but-serving` / `failing`, and that was an unlicensed
    // classification: a bounded observation of probe outcomes cannot decide whether a service is
    // serving. It also produced wrong answers — an already-unhealthy container with one pass and one
    // failure read as "degraded-but-serving", and a single old failure followed by four passes read
    // identically to an actively-degrading one, because a flat ring carries no recency.
    //
    // The rate is the fact the healthy/unhealthy binary cannot express; who is serving is the
    // consumer's decision, made with the runtime's own verdict alongside.
    return {
        status       : 'available',
        sampleCount,
        failureCount,
        // Rounded to three places: this is read by humans and compared across polls, and an
        // unrounded ratio invites a false precision the 5-entry ring cannot support.
        failureRate  : Math.round((failureCount / sampleCount) * 1000) / 1000,
        failingStreak: Number.isFinite(health.FailingStreak) ? health.FailingStreak : null
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

function summarizeLogs(logs, maxBytes, {sameTarget = false} = {}) {
    if (!logs || typeof logs !== 'object') return null;

    const bounded = boundUtf8Tail(logs.logs, maxBytes);

    return {
        // `incarnationBounded` is set ONLY from the producer's echoed receipt — never from a
        // caller-supplied flag and never inferred here. A consumer that attributes a death to this
        // slice is trusting that the daemon actually applied the interval, so the claim has to
        // originate where it was applied rather than where it is wanted.
        appliedSince: typeof logs.appliedSince === 'string' ? logs.appliedSince : null,
        appliedUntil: typeof logs.appliedUntil === 'string' ? logs.appliedUntil : null,
        // BOTH proofs or nothing: the producer applied a real interval, AND it applied it to the
        // same container the stopped fact describes.
        incarnationBounded: logs.bounded === true && sameTarget === true,
        maxBytes          : bounded.maxBytes,
        tail              : Number.isFinite(logs.tail) ? logs.tail : null,
        text              : bounded.text,
        truncated         : bounded.truncated
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
 * @summary Reads process-local embedding evidence without letting diagnostics perturb the lane.
 * @param {Object|null} service TenantRepoSyncService-compatible source.
 * @returns {Object|null}
 */
function readEmbeddingRecoveryProbeSnapshot(service) {
    if (typeof service?.getEmbeddingRecoveryProbeSnapshot !== 'function') {
        return null;
    }

    try {
        return service.getEmbeddingRecoveryProbeSnapshot();
    } catch {
        return null;
    }
}

/**
 * @summary Reduces one recovery-probe snapshot to its strict public allowlist.
 * @param {Object|null} candidate Process-owned canary snapshot.
 * @returns {Object}
 */
function summarizeEmbeddingRecoveryProbe(candidate) {
    const
        status = EMBEDDING_RECOVERY_PROBE_STATUSES.has(candidate?.status)
            ? candidate.status
            : 'unavailable',
        checkedAt = Number.isFinite(candidate?.checkedAt) && candidate.checkedAt >= 0
            ? candidate.checkedAt
            : null,
        nextAttemptAt = Number.isFinite(candidate?.nextAttemptAt) && candidate.nextAttemptAt >= 0
            ? candidate.nextAttemptAt
            : null,
        stopReason = typeof candidate?.stopReason === 'string'
            && /^attempt budget exhausted \(streak \d+, budget \d+\)$/u.test(candidate.stopReason)
                ? candidate.stopReason
                : null,
        errorClassification = typeof candidate?.errorClassification === 'string'
            && /^[a-z][a-z-]{0,63}$/u.test(candidate.errorClassification)
                ? candidate.errorClassification
                : null,
        errorCode = typeof candidate?.errorCode === 'string'
            && /^[A-Z][A-Z0-9_]{0,95}$/u.test(candidate.errorCode)
                ? candidate.errorCode
                : null;

    return {
        status,
        checkedAt,
        lastDemandCached: typeof candidate?.lastDemandCached === 'boolean'
            ? candidate.lastDemandCached
            : null,
        failureStreak: Number.isSafeInteger(candidate?.failureStreak) && candidate.failureStreak >= 0
            ? candidate.failureStreak
            : 0,
        backoffMs: Number.isFinite(candidate?.backoffMs) && candidate.backoffMs >= 0
            ? candidate.backoffMs
            : 0,
        nextAttemptAt,
        terminal: status === 'terminal' && candidate?.terminal === true,
        stopReason,
        errorClassification,
        errorCode
    };
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
 * @param {Object|null} options.embeddingRecoveryProbe Process-owned embedding canary snapshot.
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
    accessReadiness,
    embeddingRecoveryProbe
}) {
    const
        normalizedCheckpoint = normalizeTenantRepoCheckpointState(persistedRepoState),
        checkpointStatus     = revisionStateAvailable
            ? classifyTenantRepoCheckpoint(normalizedCheckpoint)
            : 'unavailable',
        disabled              = isTenantRepoDisabled(repo),
        dueState              = disabled
            // `backoffCapped: null` rather than `false`, matching the nulled cadence fields beside it: a
            // disabled repo has no cadence, so "is the cap binding?" has no answer. `false` would read as
            // an observation that it is not.
            ? {due: false, effectiveCadenceMs: null, jitterMs: null, backoffMultiplier: null, backoffCapped: null, lastRunAttemptAt: normalizedCheckpoint?.lastRunAttemptAt || 0}
            : isRepoDue({repo, persistedRepoState: normalizedCheckpoint, now: observedAt, globalCadenceMs, jitterRatio, backoffCapMs}),
        nextDueAtMs           = dueState.recoveryBypass
            ? observedAt
            : (Number.isFinite(dueState.effectiveCadenceMs)
                ? ((dueState.lastRunAttemptAt || 0) > 0 ? dueState.lastRunAttemptAt + dueState.effectiveCadenceMs : observedAt)
                : null),
        lastOutcome           = findTenantRepoOutcome(taskState?.lastCompletion, repo),
        lastAttempt           = normalizedCheckpoint?.lastRunAttemptAt || 0,
        failures              = normalizedCheckpoint?.consecutiveFailures ?? 0,
        recoveryState         = classifyEmbeddingRecoveryState({
            persistedRepoState: normalizedCheckpoint,
            probeSnapshot     : embeddingRecoveryProbe,
            observedAt
        });

    return {
        identityHash       : hashTenantRepoIdentity(repo),
        tenantHash         : hashValue(repo.tenantId),
        repoHash           : hashValue(repo.repoSlug),
        configTier         : repo.configTier || 'unreported',
        disabled,
        accessReadiness    : summarizeTenantRepoAccessState(accessReadiness, disabled),
        status             : classifyTenantRepoState({disabled, due: dueState.due, persistedRepoState: normalizedCheckpoint, lastOutcome}),
        due                : disabled ? false : dueState.due,
        nextDueAt          : Number.isFinite(nextDueAtMs) ? new Date(nextDueAtMs).toISOString() : null,
        lastIngestedRev    : shortRevision(normalizedCheckpoint?.lastIngestedRev),
        lastRunAttemptAt   : lastAttempt > 0 ? new Date(lastAttempt).toISOString() : null,
        consecutiveFailures: failures,
        stopReasonCode     : failures > 0
            ? (normalizedCheckpoint?.embeddingRecovery?.causeCode
                || normalizedCheckpoint?.lastSourceErrorCode
                || normalizedCheckpoint?.lastErrorCode
                || null)
            : null,
        lastErrorCode      : failures > 0 ? (normalizedCheckpoint?.lastErrorCode ?? null) : null,
        lastSourceErrorCode: failures > 0 ? (normalizedCheckpoint?.lastSourceErrorCode ?? null) : null,
        lastAccessCode     : failures > 0 ? (normalizedCheckpoint?.lastAccessCode ?? null) : null,
        recoveryState,
        checkpointStatus,
        // Published unconditionally, NOT gated on `failures > 0` like the cause codes above. A repo
        // deferring against a slow provider holds its streak at zero by design, so gating this on the
        // failure count would hide the backlog in precisely the state it was built to explain. It
        // carries no identity and no message — a count, a state, and two timestamps.
        corpusOutstanding                 : normalizedCheckpoint?.corpusOutstanding ?? null,
        ingestContractVersion             : normalizedCheckpoint?.ingestContractVersion ?? null,
        lastAttemptedIngestContractVersion: normalizedCheckpoint?.lastAttemptedIngestContractVersion ?? null,
        effectiveCadenceMs                : dueState.effectiveCadenceMs,
        jitterMs                          : dueState.jitterMs,
        backoffMultiplier                 : dueState.backoffMultiplier,
        // This row is the OPERATOR-facing projection, and it is the surface the ambiguity lives on:
        // `effectiveCadenceMs: 7200000` is either a 2h configuration or a streak that has run so far
        // past the cap that the cap is all that remains of it. `backoffMultiplier` beside it hints at
        // the second, but only the cap flag settles it — a multiplier of 4096 with a cadence AT the cap
        // and a multiplier of 1 with a cadence below it are the two readings, and nothing here
        // distinguished them. `null` while disabled, per the synthesized state above.
        backoffCapped                     : dueState.backoffCapped ?? null,
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
