import {createHash} from 'node:crypto';
import fs           from 'fs-extra';
import path         from 'node:path';
import Base         from '../../../../src/core/Base.mjs';
import AiConfig     from '../../../config.mjs';
import {
    fetchEmbeddingLaneSlots,
    fetchOpenAiCompatibleModelIds,
    getOpenAiCompatibleHost,
    probeProviderParallelModelCapacity,
    satisfiesRequiredModelIdOnOpenAiCompatibleLane
}                                          from '../../../services/graph/providerReadinessHelper.mjs';
import {
    classifyProviderLaneLiveShape,
    parseEmbeddingLaneSlots
}                                          from '../../../providerLaneLiveShape.mjs';
import {
    deriveMemoryPressure,
    foldMemoryPressureIntoStatus
}                                          from './memoryPressureDisposition.mjs';
import {runHealthcheck}      from '../../../scripts/diagnostics/mcpHealthcheck.mjs';
import {writeFileAtomicSync} from '../../../services/shared/atomicFileWrite.mjs';

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
    boundUtf8Head,
    boundUtf8Tail,
    createDeploymentStateSnapshot,
    writeDeploymentStateSnapshot
} from '../../../services/memory-core/helpers/deploymentStateBridgeStore.mjs';
import {
    readBackupReceipt,
    validateOffHostSyncConfig
} from '../../../services/memory-core/helpers/offHostSyncStore.mjs';
import {
    describeBackupMaintenanceHealth,
    describeBackupRetryState
} from '../scheduling/backup.mjs';
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
         * One-shot embedding-lane `/slots` reader: `async ({host, timeoutMs}) => payload`.
         * Injected so specs can drive every shape — undersized, non-uniform, unreachable — without a
         * live engine. Falls back to {@link fetchEmbeddingLaneSlots}.
         * @member {Function|null} providerLaneShapeProbe=null
         * @protected
         */
        providerLaneShapeProbe: null,
        /**
         * Memoized boot receipt from {@link collectProviderLaneShape}. Holding it here rather than in
         * a module-scope cache keeps it per-instance, so a spec gets a clean bridge without resetting
         * shared state — and makes the one-shot contract visible on the service surface.
         * @member {Object|null} providerLaneShapeReceipt=null
         * @protected
         */
        providerLaneShapeReceipt: null,
        /**
         * One-shot OpenAI-compatible `GET /v1/models` reader: `async ({host, timeoutMs}) => String[]`.
         * Injected so specs can drive every arm — match, mismatch, empty list, unreachable — without a
         * live engine. Falls back to {@link fetchOpenAiCompatibleModelIds}.
         *
         * Deliberately NOT memoized by a sibling receipt member: the lane's slot geometry cannot change
         * without a restart, but the model a running endpoint serves can, and a cached `match` would
         * outlive the fact it reported.
         * @member {Function|null} providerModelIdentityProbe=null
         * @protected
         */
        providerModelIdentityProbe: null,
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

    /**
     * Startup-log heads, keyed by `serviceKey`, holding `{startedAt, record}`.
     *
     * Cached because the head is invariant for the life of an incarnation — a process emits its
     * startup output once and then stops — so re-reading it every collection would pay a Docker call
     * per service per sweep to receive the same bytes. The cache key is the incarnation start, which
     * makes invalidation structural rather than time-based: a restart changes `StartedAt`, the key
     * misses, and the next collection fetches the new incarnation's head. Nothing expires; there is
     * no staleness to expire against.
     * @member {Map<String,Object>} startupLogHeadsByService
     * @protected
     */
    startupLogHeadsByService = new Map()
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
        // Same detached-collector contract: the starvation watchdog persists its verdict onto its
        // own durable task-state envelope, and THIS projection is what makes that verdict consumed —
        // `inspect_deployment` / `get_deployment_state_snapshot` serve the snapshot even while the
        // plane is degraded, which is exactly when the receipt is wanted.
        const heavyMaintenanceStarvation = this.collectHeavyMaintenanceStarvationSnapshot({
            watchdogTaskState: this.taskStateService?.getTaskState?.('heavy-maintenance-starvation-watchdog') || null
        });

        return createDeploymentStateSnapshot({
            generatedAt,
            services,
            bridgeDiagnostics,
            recoveryRuns,
            selfHeal,
            tenantRepoSync,
            maintenance,
            heavyMaintenanceStarvation
        });
    }

    /**
     * @summary Projects the heavy-maintenance starvation watchdog's persisted verdict into the snapshot.
     *
     * Contractually detached like `collectMaintenanceSnapshot` — takes the watchdog's task state as an
     * argument and reads nothing else, so specs can drive the healthy → degraded → healthy transition
     * through the exact projection consumers read. Returns `null` (block omitted) until the watchdog
     * has produced a verdict; after that the persisted `starvation` stamp is projected verbatim: its
     * `posture` is the consumable word (`degraded` / `healthy` / `unknown` / `disabled`), `breaches`
     * carries the receipt (waiter, class, `deferredSince`, lease holder), and an `unknown` posture is
     * explicitly NOT a degradation — it marks a reading that could not assert green.
     *
     * @param {Object} options
     * @param {Object|null} options.watchdogTaskState Persisted task-state envelope for the watchdog lane.
     * @returns {Object|null} The snapshot block, or `null` before the first verdict.
     */
    collectHeavyMaintenanceStarvationSnapshot({watchdogTaskState} = {}) {
        const verdict = watchdogTaskState?.starvation;

        if (!verdict || typeof verdict !== 'object') {
            return null;
        }

        return {
            taskName: 'heavy-maintenance-starvation-watchdog',
            ...verdict
        };
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
        // Both are DERIVED here because the Memory Core process holds neither the backup mount nor
        // the task state. The resulting bounded bridge verdict is then safe for Memory Core's
        // operator healthcheck to consume without granting that container direct backup authority.
        const base = {
            durability,
            stagingResidue: await summarizeStagingResidue(stagingResidueRoot)
        };

        let retryState = null,
            lastBackup = null;

        if (backupTaskState) {
            retryState = describeBackupRetryState({
                now,
                intervalMs   : AiConfig.orchestrator.intervals.backupMs,
                retryDelayMs : AiConfig.orchestrator.intervals.backupRetryDelayMs,
                retryWindowMs: AiConfig.orchestrator.intervals.backupRetryWindowMs,
                taskState    : backupTaskState
            });
            base.retry = retryState
        }

        try {
            const outcome = await readBackupReceipt({filePath: receiptPath});

            if (outcome.status === 'unreadable') {
                lastBackup = {
                    finishedAt: outcome.finishedAt,
                    kind      : outcome.kind,
                    status    : 'unreadable'
                }
            } else if (outcome.status === 'ok') {
                lastBackup = outcome.receipt
            }
        } catch (error) {
            lastBackup = {
                finishedAt: null,
                kind      : 'corrupt',
                status    : 'unreadable'
            }
        }

        if (lastBackup) base.lastBackup = lastBackup;

        base.health = describeBackupMaintenanceHealth({
            durability,
            lastBackup,
            retryState,
            backupIntervalMs: AiConfig.orchestrator.intervals.backupMs,
            retryWindowMs   : AiConfig.orchestrator.intervals.backupRetryWindowMs
        });

        return base
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

        // Gated by its OWN predicate, not residency's. On a split-lane plane residency names the CHAT
        // service while this reading is taken against the EMBEDDING host — sharing the predicate
        // publishes embedding-lane facts on the chat record and leaves the service the data describes
        // with none. Memoized inside the collector: this call re-publishes a boot reading, it does not
        // take a new one.
        const providerLaneShape = this.isProviderLaneShapeServiceKey(serviceKey)
            ? await this.collectProviderLaneShape({observedAt: observationNow()})
            : null;

        // The identity axis, gated by its OWN predicate for the same reason the shape is: geometry
        // and identity are different assertions with different answerability, and the remediation
        // vocabularies differ too. Unmemoized on purpose — the shape receipt is a boot reading of a
        // value that cannot change without a restart, while a served model CAN change under a
        // running endpoint, and a cached "match" would outlive the fact it reported.
        const providerModelIdentity = this.isProviderModelIdentityServiceKey(serviceKey)
            ? await this.collectProviderModelIdentity({observedAt: observationNow()})
            : null;

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
            logSummary     = summarizeLogs(logs, bridgeConfig.logMaxBytes, {
                sameTarget,
                // Published INSIDE `logs` rather than as a sibling field, because it answers a
                // question about the same stream: the tail says what this service is doing, the head
                // says what it decided. A reader chasing one will look where the other lives.
                startup: await this.readStartupLogHead({
                    serviceKey,
                    incarnationStartedAt: inspectSummary?.state?.startedAt ?? null
                })
            }),
            // Consumes the SAME `nodeCommand` observation the heap attribution uses, rather than
            // re-deriving what "a Node service" means. Placed after the summary for that reason
            // alone; it is otherwise a sibling of `providerResidency` — nullable, non-Docker-derived,
            // and published on the same record.
            heapObservation = this.readHeapObservation({
                serviceKey,
                nodeCommand: inspectSummary?.nodeCommand ?? null,
                observedAt : statsObservedAt
            }),
            // Consumes the same `nodeCommand` observation for the same reason the heap read does, and
            // additionally the incarnation start — because config is invalidated by a restart rather
            // than by elapsed time. Both are already resolved on `inspectSummary`; nothing here
            // re-derives what a Node service is or when this container came up.
            resolvedConfig  = this.readResolvedConfig({
                serviceKey,
                nodeCommand         : inspectSummary?.nodeCommand ?? null,
                incarnationStartedAt: inspectSummary?.state?.startedAt ?? null
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
        const plannedRestarts = await this.collectPlannedRestarts({
            serviceKey,
            baseline  : churnBaseline,
            observedAt: observationNow()
        });

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
                providerLaneShape,
                providerModelIdentity,
                providerResidencyEligible: this.isProviderResidencyServiceKey(serviceKey),
                churnBaseline            : churnBaseline?.unreadable ? undefined : churnBaseline,
                plannedRestarts          : plannedRestarts.count,
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
        // that is the silent-reset path. Leave it; the `restartChurn` section below reports the
        // degradation on the record, so skipping the write no longer costs an operator the signal.
        //
        // `null` is the honest value for "no write was attempted", which is distinct from both
        // outcomes of one that was — a tri-state, because collapsing it to a boolean would make a
        // first observation and a failed write agree.
        let baselineWrite = null;

        if (diagnosis?.churnBaseline && !churnBaseline?.unreadable) {
            baselineWrite = this.writeChurnBaseline(serviceKey, diagnosis.churnBaseline) ? 'written' : 'failed';
        }

        // `churnBaseline` is INTERNAL scheduling state, not part of the published contract. The
        // decision carries it back so this service can persist it; publishing it would add an
        // undocumented field to `inspect_deployment` that no Contract Ledger row admits.
        const {churnBaseline: _internalBaseline, ...publishedDiagnosis} = diagnosis || {};

        // Restart-churn is the one diagnosis whose FAILURE is shaped exactly like its healthy verdict:
        // `collectRestartChurnFacts` emits nothing when there is no churn AND nothing when it cannot
        // tell, so a plane whose detector was dead published a record indistinguishable from a quiet
        // one. An unreadable baseline is never overwritten — deliberately, because re-anchoring on a
        // damaged baseline is the silent-reset path — which means detection stays dead until a human
        // removes the file, with only an ERROR log to say so. This section is what makes that sayable.
        //
        // It reports the detector's own health, never a churn verdict; the verdict remains the
        // diagnosis service's non-authoritative `restart-churn` fact and no authority moves here.
        const restartChurn = {
            baseline       : churnBaseline?.unreadable ? 'unreadable' : churnBaseline ? 'available' : 'absent',
            baselineWrite,
            plannedRestarts: {reason: plannedRestarts.reason, status: plannedRestarts.status},
            // The operator's actual question, answered directly rather than left to be inferred from
            // the three fields above: can this service produce a churn verdict at all right now?
            detecting      : !churnBaseline?.unreadable &&
                plannedRestarts.status === 'available' &&
                baselineWrite !== 'failed'
        };

        const classification = this.diagnosisService?.describeClassification
            ? this.diagnosisService.describeClassification({
                serviceKey,
                statsSamples,
                // Decides heap-vs-container scope, so the projection measures memory's window on the
                // same clock the saturation fact does. Omitting it made the projection report a
                // container-scope span for a heap-scope service.
                nodeCommand: inspectSummary?.nodeCommand ?? null
            })
            : null;

        // A container AT its memory ceiling produces no error: it is alive, it answers probes, and it
        // is simply not doing useful work while the kernel re-faults its evicted pages. So a status
        // derived from `errors.length` alone read `available` through the whole observed incident,
        // beside a diagnosis that had already crossed its threshold and sustained it across a
        // measured window. The fact was computed and published; nothing consumed it.
        //
        // The classification travels with it because the ABSENCE of a saturation fact is ambiguous on
        // its own: it means either "measured, below the ceiling" or "never measurable". Only the
        // projection's memory-clock span separates them, and answering `below` for the second is an
        // all-clear nobody observed.
        const memoryPressure = deriveMemoryPressure({classification, diagnosis});

        return {
            schemaVersion : 1,
            recordType    : 'deployment-service-state',
            serviceKey,
            targetIdentity: {kind: 'compose-service', id: serviceKey},
            observedAt    : diagnosisObservedAt,
            status        : foldMemoryPressureIntoStatus({
                status     : errors.length > 0 ? 'degraded' : 'available',
                disposition: memoryPressure.disposition
            }),
            // Published on every snapshot, at-cap or not. A disposition that appeared only on
            // degradation would leave `below` and `unknown` indistinguishable from a service nobody
            // asked about — and `unknown` is the reading an operator most needs to see, because it
            // says the ceiling question could not be answered rather than that it was answered well.
            memoryPressure,
            inspect: inspectSummary,
            stats  : summarizeStats(stats),
            logs   : logSummary,
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
            // AC-3: published on a HEALTHY plane too, not only on mismatch. Proving a lane is shaped
            // right previously took a shell on the host and a multi-session investigation; the whole
            // point is that the answer is now in the artifact either way. `observable: false` carries
            // its own reason, so a blank shape is never mistaken for a verified one.
            providerLaneShape,
            // Published on a MATCH too, for the same reason the shape is: an operator asking "is this
            // plane serving the model I configured?" needs the answer in the artifact either way, and
            // proving it right previously meant reading two literals out of a container log by hand.
            // Every non-match arm carries its own `reason`, so a `null` here means the service is not
            // an identity participant — never that identity was checked and found fine.
            providerModelIdentity,
            heapObservation,
            // Published on EVERY record, including the arms that answer nothing. The gap this closes
            // is that a service's health was observable while the configuration it was given was not,
            // so an incident diagnosed against assumed inputs — and the assumed value can differ from
            // the real one by the whole factor that matters, because a per-service env override is
            // invisible from outside. Every unavailable arm carries its own reason, so a null here is
            // never mistaken for "configured with the defaults".
            resolvedConfig,
            restartChurn,
            // EVERY snapshot, independent of load. The classification, the threshold that applies to
            // it, and the measured window state used to live only inside a sustained-saturation fact,
            // so a healthy store exposed none of them and no load-independent claim about the
            // classification machinery was verifiable from outside the process.
            classification,
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
     * @summary Collects the ONE-SHOT embedding provider-lane shape receipt.
     *
     * The bridge writes snapshots on a cadence, so an uncached probe here would restore per-request
     * `/slots` polling — the pattern deliberately removed from the request path, because the endpoint
     * starves under full embedding grind and a recurring caller manufactures failures out of expected
     * state. The receipt is therefore memoized on first collection and re-published unchanged on
     * every later snapshot — a boot observation with a boot timestamp, not a live gauge. `observedAt`
     * is stamped once, at the reading, so a reader can never mistake a republished receipt for a
     * fresh measurement.
     *
     * Both comparison inputs are read from resolved config HERE, at the entrypoint, and injected into
     * the pure classifier. The declared arm reads the DECLARATION namespace, whose leaves default to
     * `null`; `localModels.embedding.*` is deliberately not consulted, because its operational
     * defaults cannot distinguish a declared value from a defaulted one and comparing against them
     * degrades a correctly-sized deployment.
     *
     * **Take the reading BEFORE the first scheduling dispatch.** Memoization makes the first reading
     * permanent, so a reading taken after admission freezes a load-contaminated result for the process
     * lifetime — the starved-`/slots` condition this check was placed at boot to avoid, re-created
     * through its own door and reported as an ordinary `unobservable`. The orchestrator therefore
     * awaits this once during start, alongside the tenant-repo coverage prewarm and for the same
     * reason; the snapshot path then re-publishes the cached receipt.
     *
     * @param {Object} [options]
     * @param {Number} [options.observedAt=this.now()] Epoch ms. Defaults to the service clock so a
     *     pre-poll caller need not thread one, and specs keep their injected `nowFn`.
     * @returns {Promise<Object|null>} The bounded receipt, or `null` when the lane is not applicable.
     */
    async collectProviderLaneShape({observedAt = this.now()} = {}) {
        if (this.providerLaneShapeReceipt) {
            return this.providerLaneShapeReceipt;
        }

        const host = getOpenAiCompatibleHost(AiConfig);

        if (!host) {
            return null;
        }

        const probe   = this.providerLaneShapeProbe || fetchEmbeddingLaneSlots,
              payload = await probe({
                  host,
                  timeoutMs: AiConfig.orchestrator.providerReadiness.timeoutMs
              }),
              declaration = AiConfig.providerLaneDeclaration.embedding;

        this.providerLaneShapeReceipt = {
            ...classifyProviderLaneLiveShape({
                observed                    : parseEmbeddingLaneSlots(payload),
                safeProcessingLimitTokens   : AiConfig.localModels.embedding.safeProcessingLimitTokens,
                declaredParallelSlots       : declaration.parallelSlots,
                declaredContextTokensPerSlot: declaration.contextTokensPerSlot
            }),
            host,
            observedAt
        };

        return this.providerLaneShapeReceipt;
    }

    /**
     * @summary Resolves whether a Compose service participates in provider-residency observation.
     * The same predicate gates residency and adjacent provider-activity collection so a configured
     * service can never receive one half of the residual-load evidence pair without the other.
     * @param {String} serviceKey Compose service key.
     * @returns {Boolean}
     */
    /**
     * @summary Resolves whether a Compose service carries the embedding-lane shape receipt.
     *
     * Deliberately separate from {@link isProviderResidencyServiceKey}: the two predicates name
     * different lanes wherever chat and embedding are split across services, and collapsing them
     * misroutes one lane's evidence onto the other's record in whichever direction they are merged.
     *
     * @param {String} serviceKey Compose service key.
     * @returns {Boolean}
     */
    isProviderLaneShapeServiceKey(serviceKey) {
        return AiConfig.orchestrator.deploymentStateBridge.providerLaneShapeServiceKeys.includes(serviceKey);
    }

    /**
     * @summary Resolves whether a Compose service carries the embedding-lane MODEL-IDENTITY receipt.
     *
     * A third predicate rather than a reuse of either sibling. Against residency the reason is
     * remediation: that verdict's advice is vendor-coupled (`ollama pull <model>`), so attaching
     * identity there tells a llama.cpp container to run a command that cannot work — on the surface
     * an operator reads without shell access. Against lane-shape the reason is answerability:
     * geometry and identity are different assertions, and one gate over two assertions is precisely
     * the defect this ticket's runtime half repaired.
     *
     * @param {String} serviceKey Compose service key.
     * @returns {Boolean}
     */
    isProviderModelIdentityServiceKey(serviceKey) {
        return AiConfig.orchestrator.deploymentStateBridge.providerModelIdentityServiceKeys.includes(serviceKey);
    }

    /**
     * @summary Observe whether the configured embedding model is the one the endpoint actually
     * serves — the operator-visible half of the identity check the embed path enforces at runtime.
     *
     * The runtime guard throws at embed time, which only ever reaches whoever is reading a stack
     * trace. This publishes the same comparison where an operator or agent reads deployment state
     * with no shell, so a wrong model is legible BEFORE it is inferred from slow embeddings — which
     * is how a production plane served an 8B model against a 0.6B configuration across two deploys.
     *
     * **Every arm is an observation, never a verdict.** No host or no configured model means the
     * question was never asked (`unconfigured`); an endpoint that will not answer means it could not
     * be asked (`unobservable`); an answer that omits the configured id is the finding. A probe that
     * cannot run is an unanswered question, never a confirmed match — the same rule the runtime half
     * follows, because a health surface that reports "fine" on an unmeasured axis is the defect.
     *
     * **Remediation speaks THIS lane's language.** `/v1/models` is served by llama.cpp, vLLM, LM
     * Studio and any OpenAI-compatible runtime, so the advice names the served-vs-configured pair and
     * leaves the fix to whoever owns that runtime, rather than borrowing a vendor's pull command.
     *
     * @param {Object} [options={}]
     * @param {Date|String} [options.observedAt] Observation stamp.
     * @returns {Promise<Object|null>} `{state, configuredModel, servedModelIds, host, reason, observedAt}`
     *     — `null` only when no OpenAI-compatible host is configured at all.
     */
    async collectProviderModelIdentity({observedAt = this.now()} = {}) {
        const host = getOpenAiCompatibleHost(AiConfig);

        if (!host) {
            return null;
        }

        const configuredModel = AiConfig.openAiCompatible.embeddingModel;

        if (!configuredModel) {
            return {
                state : 'unconfigured', configuredModel: null, servedModelIds: null, host, observedAt,
                reason: 'no embedding model is configured for the OpenAI-compatible lane; nothing to compare against'
            };
        }

        const probe = this.providerModelIdentityProbe || fetchOpenAiCompatibleModelIds;

        let servedModelIds = null;

        try {
            servedModelIds = await probe({
                host,
                timeoutMs: AiConfig.orchestrator.providerReadiness.timeoutMs
            });
        } catch (error) {
            return {
                state : 'unobservable', configuredModel, servedModelIds: null, host, observedAt,
                reason: `the endpoint did not answer GET /v1/models (${error.message}); identity is unobserved, not confirmed`
            };
        }

        // `/v1/models` is conventional rather than guaranteed: a proxy or minimal runtime can answer
        // 200 carrying nothing enumerable, and zero rows there cannot separate "serves no models"
        // from "does not answer this question". Unobservable, not a mismatch.
        if (!Array.isArray(servedModelIds) || servedModelIds.length === 0) {
            return {
                state : 'unobservable', configuredModel, servedModelIds: null, host, observedAt,
                reason: 'the endpoint answered with no enumerable model list; identity is unobserved, not confirmed'
            };
        }

        // Implicit-tag tolerant for the same reason the embed path is: this lane's default host is
        // byte-identical to `ollama.host`, Ollama reports an untagged pull as `name:latest`, and an
        // exact compare would publish `mismatch` — telling the operator to re-point a lane that is
        // already correct. A confident wrong instruction is a worse failure than silence, which is
        // the argument this service's own remediation prose makes.
        return servedModelIds.some(servedId => satisfiesRequiredModelIdOnOpenAiCompatibleLane(configuredModel, servedId))
            ? {state: 'match', configuredModel, servedModelIds, host, observedAt, reason: null}
            : {
                state : 'mismatch', configuredModel, servedModelIds, host, observedAt,
                reason: `configured embedding model '${configuredModel}' is not served by this endpoint; observed=${servedModelIds.join(', ')}. Point the lane at a served id, or load the configured model on the runtime that owns this endpoint.`
            };
    }

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
            schemaVersion    : 1,
            recordType       : 'deployment-provider-activity',
            source           : 'provider-activity-ledger',
            status           : 'unavailable',
            unavailableReason: reason,
            observedAt,
            sinceMs          : Number.isFinite(this.providerActivityWindowMs) ? this.providerActivityWindowMs : null,
            // Present-and-empty, matching the projection's own contract. The success arm spreads
            // the projection so this field flows through automatically; omitting it HERE would make
            // the degraded arm the only one where a consumer reads `undefined` — and `undefined`
            // reads as zero demand, the one reassuring answer an unavailable read must not give.
            // This is the surface an EXTERNAL plane is observed through, which is exactly the plane
            // that was burning cores with nothing visible.
            nativeAdmission           : {},
            totalActivities           : null,
            totalInFlight             : null,
            totalRecentCompletions    : null,
            totalReaped               : null,
            inFlightTruncated         : null,
            recentCompletionsTruncated: null,
            reapedTruncated           : null,
            reapedThisRead            : null,
            inFlight                  : null,
            recentCompletions         : null,
            reaped                    : null
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
     * @summary Reads the head of this incarnation's log stream, where a process reports what it decided.
     *
     * **The gap this closes.** Startup output is emitted exactly once, in the first seconds, and is
     * where a process states its resolved geometry, allocation plan, model identity and negotiated
     * features. The published tail is a rolling window sized for recent activity — correct for "what
     * is this service doing now" and structurally wrong for "what did it decide when it started",
     * because the banner's distance from the tail grows with uptime. On this plane an embedding
     * provider's KV-cache and compute-buffer sizes were unreadable after four hours, so a memory
     * footprint got attributed from a fitted formula while the engine's own numbers had been
     * available and were discarded by retention.
     *
     * **Raising `logTail` is not the fix**, which is why this is a second read rather than a bigger
     * one: any fixed line count is a bet on how soon someone looks, and the bet gets worse the longer
     * a deployment runs well.
     *
     * **A time window, not a line count.** Docker bounds `since`/`until` server-side, so asking for
     * `StartedAt → StartedAt + window` returns the banner instead of the banner plus hours of runtime
     * traffic. That also makes the read self-limiting on a chatty service without needing to guess a
     * line budget.
     *
     * **Nothing is stored, and that is the design.** An earlier shape for this captured the head once
     * and retained it, with wholesale replacement on restart. Retention turned out to be unnecessary:
     * the window keys off `StartedAt`, so the read is *always* about the current incarnation and can
     * simply be re-derived. What remains is a cache keyed on that same value — invalidation is
     * structural, not temporal, and there is no stale-record arm to get wrong.
     *
     * **Absence carries a reason, never an empty string.** A bridge that first observed a service
     * already running, or whose window fell off the far side of log rotation, has no head to publish —
     * and `text: ''` would read as *this service printed nothing at startup*, a confident claim about
     * a process nobody watched boot. That is the failure this method exists to prevent, arriving by a
     * different route.
     *
     * @param {Object}      options
     * @param {String}      options.serviceKey           Service whose head to read.
     * @param {String|null} options.incarnationStartedAt Current incarnation's start, ISO.
     * @param {Object}     [options.config]              Resolved `deploymentStateBridge` leaves.
     * @returns {Promise<Object>} Always an envelope; `text` is `null` whenever `status` is `unavailable`.
     */
    async readStartupLogHead({serviceKey, incarnationStartedAt, config = AiConfig.orchestrator.deploymentStateBridge}) {
        const unavailable = reason => ({
            schemaVersion       : 1,
            recordType          : 'deployment-startup-log-head',
            serviceKey,
            status              : 'unavailable',
            unavailableReason   : reason,
            incarnationStartedAt: incarnationStartedAt ?? null,
            windowMs            : null,
            lines               : null,
            text                : null,
            truncated           : false
        });

        if (!config.includeLogs) {
            // A disabled log channel is not evidence that the service reported nothing.
            return unavailable('channel-disabled')
        }

        const startedAtMs = Date.parse(incarnationStartedAt ?? '');

        // Without a known incarnation start there is no window to ask for, and guessing one would
        // reach into a PREVIOUS incarnation — the exact poison `since` exists to remove on the tail.
        if (!Number.isFinite(startedAtMs)) {
            return unavailable('incarnation-start-unknown')
        }

        const windowMs = Number.isFinite(config.startupLogWindowMs) && config.startupLogWindowMs > 0
            ? config.startupLogWindowMs
            : null;

        if (windowMs === null) {
            return unavailable('window-not-configured')
        }

        const maxLines = Number.isFinite(config.startupLogMaxLines) && config.startupLogMaxLines > 0
            ? config.startupLogMaxLines
            : null;

        // Refused rather than defaulted, for the same reason the window is. There IS a usable
        // fallback here — `readTargetLogs` resolves `tail ?? logTail ?? 200` — and taking it is the
        // failure: `logTail` is sized for recent activity, so the head read would come back as the
        // last ~200 lines OF the startup window. A missing ceiling that yields a tail-of-head is
        // worse than no head at all, because the wrong answer looks like the right one.
        if (maxLines === null) {
            return unavailable('line-ceiling-not-configured')
        }

        const cached = this.startupLogHeadsByService.get(serviceKey);

        // Structural invalidation: same incarnation start means the same head, byte for byte.
        if (cached && cached.startedAt === incarnationStartedAt) {
            return cached.record
        }

        let response;

        try {
            response = await this.runtimeAccessService.readObserve({
                serviceKey,
                operation: 'logs',
                since    : incarnationStartedAt,
                until    : new Date(startedAtMs + windowMs).toISOString(),
                // Passed rather than omitted, and that is the whole point: `readTargetLogs` resolves
                // `tail ?? logTail ?? 200`, so leaving it off would hand this read the TAIL's budget
                // and return the last ~200 lines *of the startup window* — a tail of the head. The
                // leaf is set far above any real banner so `logMaxBytes` stays the binding ceiling
                // and trims from the correct side.
                tail     : maxLines
            });
        } catch (error) {
            return unavailable(error.code === 'ENOENT' ? 'absent' : 'unreadable')
        }

        // `readObserve` answers `{data, proof}`; the payload is on `data`. Unwrapped here rather than
        // consumed raw, because the collection path's own `read()` helper does the same and a reader
        // that skipped it would find `undefined` and report an empty window — a wrong reason rather
        // than a missing value, which is the harder failure to notice.
        const bounded = boundUtf8Head(response?.data?.logs, config.logMaxBytes),
              text    = bounded.text.trim();

        // Nothing is cached until the window has CLOSED, and that gate is the whole correctness of the
        // cache. `since`/`until` name a fixed range in the past, so once `now` is beyond its end the
        // content of that range is final and re-reading buys nothing. INSIDE the window it is still
        // filling: a sweep landing at t+5s sees whatever flushed by t+5s, and caching that freezes a
        // partial answer for the life of the incarnation.
        //
        // It is not a contrived window — `startupLogWindowMs` is sized at 60s against model loading,
        // the slowest startup on this plane and the one whose geometry is most wanted, so the service
        // most worth reading is exactly the one whose first observation lands in the empty part of its
        // own window. A few uncached reads during the seconds a container boots is the entire cost.
        const windowClosed = this.now() > startedAtMs + windowMs;

        if (!text) {
            // Distinguished from a failed read: the window was asked for and came back empty, which on
            // a long-running container means rotation has carried the head away. Naming that is what
            // keeps a reader from concluding the service was silent at boot.
            //
            // The reason carries an `or` and the two halves cache differently. **Rotated** is terminal.
            // **Not yet written** is transient, and caching it loses the banner permanently — the exact
            // unreadable-startup-facts failure this read exists to prevent, arriving through its own
            // optimisation. `windowClosed` separates them: after the window ends, empty can only mean
            // rotated.
            const empty = unavailable('window-empty-or-rotated');

            if (windowClosed) {
                this.startupLogHeadsByService.set(serviceKey, {startedAt: incarnationStartedAt, record: empty})
            }

            return empty
        }

        const record = {
            schemaVersion    : 1,
            recordType       : 'deployment-startup-log-head',
            serviceKey,
            status           : 'available',
            unavailableReason: null,
            incarnationStartedAt,
            windowMs,
            // Counted on the string that is PUBLISHED. These used to disagree: the count came from
            // the trimmed text while the payload carried the untrimmed one, so a head ending in a
            // blank line — the ordinary shape for container logs — reported one number and shipped
            // another. A record that contradicts itself is worse than one omitting the count.
            //
            // The trailing terminator is not a line, which is why this is not a bare `split().length`.
            // Publishing the TRIMMED text would have made that identity true for free, and would also
            // have destroyed the line-boundary guarantee `boundUtf8Head` exists for: a truncated head
            // ends at a newline precisely so a human reading forward never meets half a value.
            lines    : countLines(bounded.text),
            text             : bounded.text,
            truncated        : bounded.truncated
        };

        // Same gate as the empty arm, for the same reason: a head read at t+5s holds only what
        // flushed by t+5s. Caching that freezes a PARTIAL banner, losing precisely the resolved
        // geometry line — an engine's KV-cache and compute-buffer sizes — that the head is read for.
        if (windowClosed) {
            this.startupLogHeadsByService.set(serviceKey, {startedAt: incarnationStartedAt, record})
        }

        return record
    }

    /**
     * @summary Relays one service's self-reported resolved config without ever resolving it here.
     *
     * **This reader must not resolve any value itself, and that is the whole contract.** A
     * deployment's health is Docker-observable; its configuration is not. The values that matter
     * during an incident belong to other services, and resolving them in this process would publish
     * the orchestrator's own tree under another service's name. On a deployment whose per-service env
     * diverges from the compose default — the only deployment anyone consults this field for — that is
     * a confidently wrong answer, and a wrong answer is worse than an absent one: an absent field gets
     * checked, an answered one does not. So the owning process publishes, and this relays.
     *
     * **The disclosure boundary is upstream of here.** The writer applies its allowlist before
     * anything reaches disk, so an unallowlisted value never enters this process at all and there is
     * no second place a filter has to be re-applied correctly. This reader adds no filtering because
     * filtering here would imply the unfiltered set had already crossed the boundary.
     *
     * **Validity is bounded by INCARNATION, not by a duration, and that is the deliberate difference
     * from {@link #readHeapObservation}.** A heap number is resampled because it moves, so age
     * measures how well it still describes the process. Resolved config does not move: it is fixed
     * when the process boots and runtime mutation of the shared tree is forbidden. An old record is
     * therefore not a degraded record — refusing it on age would hide a correct answer. What DOES
     * invalidate it is a restart: the container may have come back with different env, so a record
     * stamped before the current incarnation started describes configuration that no longer applies.
     * That is `stale-incarnation`, and it is the same falsifier `incarnationBounded` applies to log
     * slices. There is no `pairable` equivalent here because nothing puts this in a ratio.
     *
     * `disclosed` and `omitted` are `null` — never `{}` and never `[]` — on every unavailable arm. An
     * empty object reads as "this service reported and disclosed nothing", which is a different claim
     * from "this service did not report", and collapsing them is how a reader comes to believe a
     * configuration was checked when it never was.
     *
     * @param {Object}        options
     * @param {String}        options.serviceKey            Service whose report to read.
     * @param {Boolean|null}  options.nodeCommand           Whether the container runs a Node process.
     * @param {String|null}   options.incarnationStartedAt  Current incarnation's start, ISO.
     * @param {Object}       [options.config]               Resolved self-report channel leaves.
     * @returns {Object} Always an envelope; `disclosed` is `null` whenever `status` is `unavailable`.
     */
    readResolvedConfig({serviceKey, nodeCommand, incarnationStartedAt, config = AiConfig.heapObservation}) {
        const unavailable = reason => ({
            schemaVersion    : 1,
            recordType       : 'deployment-resolved-config',
            serviceKey,
            provenance       : 'self-reported',
            status           : 'unavailable',
            unavailableReason: reason,
            observedAt       : null,
            disclosed        : null,
            omitted          : null
        });

        if (!config.enabled) {
            // A disabled channel is not evidence that the configuration is the default.
            return unavailable('channel-disabled')
        }

        // Fail closed on identity, and split the reason exactly as the heap reader does: `not-node` is
        // a positive classification ("this container cannot run a reporter"), `identity-unknown` is the
        // absence of one. Collapsing them once let an unreadable inspect masquerade as a structural
        // fact, and the remedy differs — the first is permanent, the second is an instrument problem.
        if (nodeCommand !== true) {
            return unavailable(nodeCommand === false ? 'not-node' : 'identity-unknown')
        }

        let record;

        try {
            record = fs.readJsonSync(path.resolve(config.dir, `${serviceKey}.resolved-config.json`))
        } catch (error) {
            return unavailable(error.code === 'ENOENT' ? 'absent' : 'unreadable')
        }

        if (record?.recordType !== 'deployment-resolved-config') {
            return unavailable('malformed')
        }

        // The reader resolved this path from `serviceKey`; the writer stamped the record with its own.
        // Comparing them makes a mixed-up mount or a copied file detectable instead of silently
        // attributing one service's configuration to another — which on this field would be the exact
        // wrong-process answer the whole design exists to avoid, arriving by a different route.
        if (record.serviceKey !== serviceKey) {
            return unavailable('identity-mismatch')
        }

        if (!record.disclosed || typeof record.disclosed !== 'object' || Array.isArray(record.disclosed)) {
            return unavailable('malformed')
        }

        if (!Number.isFinite(record.observedAt)) {
            return unavailable('malformed')
        }

        const incarnationStart = Date.parse(incarnationStartedAt ?? '');

        // Only refuse when the incarnation start is KNOWN and the record predates it. An unparseable
        // start is an instrument gap, and refusing on it would convert "we cannot tell which
        // incarnation this is from" into "the configuration is unknown" — discarding a record that is
        // almost certainly current.
        if (Number.isFinite(incarnationStart) && record.observedAt < incarnationStart) {
            return unavailable('stale-incarnation')
        }

        return {
            schemaVersion    : 1,
            recordType       : 'deployment-resolved-config',
            serviceKey,
            provenance       : 'self-reported',
            status           : 'available',
            unavailableReason: null,
            observedAt       : new Date(record.observedAt).toISOString(),
            disclosed        : record.disclosed,
            // Normalised to an array so a consumer never has to distinguish a writer that omitted
            // nothing from one that predates the field. An empty array is a real claim here — "every
            // allowlisted path reported" — while a null `disclosed` above is the absence of any claim.
            omitted          : Array.isArray(record.omitted) ? record.omitted : []
        }
    }

    /**
     * @summary Persists the restart-churn baseline for one service.
     *
     * Returns the outcome rather than only logging it. The ERROR log below is written to a stream
     * nothing on the published record reads, so a plane whose baseline could not be persisted looked
     * exactly like one that never needed to persist it.
     *
     * @param {String} serviceKey
     * @param {Object} baseline
     * @returns {Boolean} `true` when the baseline reached disk.
     */
    writeChurnBaseline(serviceKey, baseline) {
        try {
            // Write-then-rename: a direct write torn by a crash leaves a half-written baseline, which
            // the reader above must then treat as unjudgeable — turning a crash into a silently
            // reset counter. `rename` within a directory is atomic, so a reader sees the old
            // baseline or the new one, never a fragment. The former `${target}.${pid}.tmp` scratch was
            // unique per process, but baselines are written per service key inside one.
            writeFileAtomicSync(this.churnBaselinePath(serviceKey), JSON.stringify(baseline, null, 2) + '\n')

            return true
        } catch (error) {
            // ERROR, not WARN: a baseline that stops advancing means churn stops accumulating, and
            // the signal dies without the record ever going unhealthy.
            this.writeLog?.('ERROR', `[DeploymentStateBridge] churn baseline write FAILED for ${serviceKey}: ${error.message}. Churn detection is degraded until this succeeds.`);
            // The scratch cleanup that used to live here is the primitive's `finally`, which runs on
            // the failure path — there is no leaked sibling left for this block to remove.

            return false
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
     * @summary Counts restarts this system itself initiated for one service inside the churn window,
     * and reports whether that count is provably complete.
     *
     * Subtracted from the observed delta so a deploy or an actuator restart cannot raise churn. This
     * frame cannot otherwise distinguish an actuator restart from a crash, and guessing would fire the
     * alarm on every deploy — after which it gets disabled and the blind spot returns with a dead
     * alarm on top.
     *
     * The source is the recovery-run ledger, which is the store the lifecycle actuator actually writes
     * (`finishAction` → `appendRecoveryRunState`). The heal-event ledger this previously read serves
     * the DATA-recovery actuator, whose action vocabulary contains no restart member at all — so the
     * filter matched nothing any production plane had ever written, and every planned restart counted
     * as unplanned churn on a live plane. It passed its unit test only because the fixture appended by
     * hand the exact row the production path does not produce.
     *
     * The predicate is the lifecycle PROOF (`capabilityEnvelope: 'lifecycle-write'` +
     * `operation: 'restart'`), never the recovery action's name, because the two disagree in both
     * directions:
     *
     * - `reconfigure` restarts the container as part of the action — the knob overlay is read at boot,
     *   so writing it without a restart is a no-op. Keying on the restart action alone would miss
     *   these and raise the false churn this subtraction exists to prevent.
     * - `raise-ceiling` deliberately does NOT restart; its proof carries `update-memory-limit`.
     * - a supervised-task recycle restarts a PROCESS, so Docker's `RestartCount` never moves for it
     *   and it must not be subtracted. It carries no lifecycle proof, so this predicate excludes it
     *   without needing a second rule.
     *
     * The proof also stamps `observedAt` at the moment the restart was dispatched and carries its own
     * `serviceKey` — the honest window bound and owner for this count, rather than the diagnosis time.
     *
     * @param {Object} options
     * @param {String} options.serviceKey
     * @param {Object|null} options.baseline The already-read churn baseline. Passed in rather than
     *     re-read, so the count and the diagnosis cannot compare against two different anchors.
     * @param {Number} options.observedAt
     * @returns {Promise<Object>} `{count, reason, status}`. `status: 'degraded'` means the count could
     *     not be proven complete, and `count` then suppresses churn instead of asserting a number.
     */
    async collectPlannedRestarts({serviceKey, baseline, observedAt}) {
        // No usable anchor means no window to count inside — and `evaluateRestartChurn` reports
        // nothing on a first look or an unjudgeable baseline either. Zero here is a measured zero.
        if (!baseline || baseline.unreadable) {
            return {count: 0, reason: null, status: 'available'};
        }

        // The store's OWN retention bound, not the snapshot's publication cap (`recoveryRunLimit`).
        // Reading fewer entries than the store retains would silently under-subtract.
        const limit = AiConfig.orchestrator.recoveryActuator.recoveryRunRetentionLimit;

        // Checked before the read, because `readRecentRecoveryRunStates` answers a non-finite limit
        // with an empty array — which is indistinguishable from "no planned restarts" and would raise
        // false churn on a misconfigured plane rather than reporting that it cannot count.
        if (!Number.isFinite(limit) || limit <= 0) {
            return {count: Number.MAX_SAFE_INTEGER, reason: 'recovery-run-limit-invalid', status: 'degraded'};
        }

        try {
            // Same injection seam `collectRecoveryRunSnapshot` uses, rather than a second direct
            // reader — one source of recovery-run truth, and testable.
            const reader  = this.recoveryRunStateReader || readRecentRecoveryRunStates,
                  entries = await reader({dir: AiConfig.orchestrator.recoveryActuator.recoveryRunStateDir, limit});

            // Entries arrive newest-first, so the last one is the furthest back this read reached.
            const oldest   = entries[entries.length - 1],
                  oldestAt = [oldest?.updatedAt, oldest?.completedAt, oldest?.startedAt].find(Number.isFinite) ?? null;

            // A full read cannot prove it reached back to the baseline: retention prunes the far end.
            // Publishing the truncated count would UNDER-subtract and raise churn for restarts we
            // performed ourselves — the exact false positive that gets an alarm switched off.
            if (entries.length >= limit && (oldestAt === null || oldestAt >= baseline.observedAt)) {
                return {count: Number.MAX_SAFE_INTEGER, reason: 'recovery-run-window-truncated', status: 'degraded'};
            }

            const count = entries.filter(entry => {
                const proof = entry?.details?.runtimeAccess;

                return proof?.capabilityEnvelope === 'lifecycle-write' &&
                    proof.operation  === 'restart'   &&
                    proof.serviceKey === serviceKey  &&
                    Number.isFinite(proof.observedAt) &&
                    proof.observedAt >= baseline.observedAt &&
                    proof.observedAt <= observedAt
            }).length;

            return {count, reason: null, status: 'available'};
        } catch {
            // Unknown provenance must not raise churn: an unreadable ledger means we cannot prove a
            // restart was ours, and a false churn alarm costs more than a missed one. Suppressing the
            // signal AND saying so is what makes the silence readable — the suppression alone is what
            // left an operator unable to tell a quiet plane from a broken detector.
            return {count: Number.MAX_SAFE_INTEGER, reason: 'recovery-run-read-failed', status: 'degraded'};
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

/**
 * Counts the lines of a published text, treating a trailing terminator as ending the last line
 * rather than starting a new empty one.
 *
 * `'a\nb\n'.split('\n')` is three segments and two lines — the third is what follows the final
 * terminator, which is nothing. Reporting three would put the record at odds with anyone who counts
 * what they were given, and the count is the field that gets used.
 *
 * @summary Lines in a text, where a trailing newline terminates rather than opens a line.
 * @param {String} text
 * @returns {Number}
 * @protected
 */
function countLines(text) {
    if (!text) return 0;

    const segments = text.split('\n').length;

    return text.endsWith('\n') ? segments - 1 : segments
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

function summarizeLogs(logs, maxBytes, {sameTarget = false, startup = null} = {}) {
    // A missing tail read must not suppress the startup head: the two come from separate reads and
    // fail independently, so collapsing them would hide a head that was successfully captured behind
    // an unrelated tail failure.
    if (!logs || typeof logs !== 'object') return startup ? {startup} : null;

    const bounded = boundUtf8Tail(logs.logs, maxBytes);

    return {
        // The head of THIS incarnation, where the process reported what it decided. Always an
        // envelope, never a bare string — every unavailable arm carries its own reason, so an absent
        // head is never read as "this service printed nothing at startup".
        startup,
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
        // Operator-consumed backoff clears, surfaced where an operator can see them without a
        // shell. Absent until one happens, and NOT cleared by later sweeps: it answers "did someone
        // intervene here, and what did they release", which stays true after the streak moves on.
        backoffClearedAt          : normalizedCheckpoint?.backoffClearedAt ?? null,
        backoffClearedFromFailures: numberOrNull(normalizedCheckpoint?.backoffClearedFromFailures),
        stopReasonCode            : failures > 0
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
        // Same unconditional rule, and for a stronger reason: a fence-only run COMPLETES (streak
        // zero, checkpoint advanced), so these censuses are the ONLY snapshot evidence that N documents
        // are fenced. Hashed chunk ids and a count — validated fail-closed by the checkpoint
        // normalizer above.
        //
        // Two fields rather than one total, because they prescribe OPPOSITE operator actions:
        // `undeliverableChunks` is healthy content the plane's geometry cannot deliver (raise the
        // ceiling), `contentPoisonChunks` is content whose own shape defeated embedding (fix the file).
        // A merged count reliably sends the operator at the wrong one.
        undeliverableChunks               : normalizedCheckpoint?.undeliverableChunks ?? null,
        contentPoisonChunks               : normalizedCheckpoint?.contentPoisonChunks ?? null,
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
