import Base                                 from '../../../../src/core/Base.mjs';
import AiConfig                             from '../../../config.mjs';
import {probeProviderParallelModelCapacity} from '../../../services/graph/providerReadinessHelper.mjs';

import {
    boundUtf8Tail,
    createDeploymentStateSnapshot,
    writeDeploymentStateSnapshot
} from '../../../services/memory-core/helpers/deploymentStateBridgeStore.mjs';
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

        const recoveryRuns = await this.collectRecoveryRunSnapshot();
        const selfHeal     = await this.collectSelfHealSnapshot();

        return createDeploymentStateSnapshot({
            generatedAt,
            services,
            recoveryRuns,
            selfHeal
        });
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
                errors.push({operation, message: error.message});
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
     * status: the `summarizeHealLedger` totals + currently-frozen set, plus the most-recent `recoveryRunLimit`
     * heal events (newest-first). Read-only — never appends, never triggers a heal (the read-only contract): the observe
     * path must not perturb the system it observes. `healLedgerDir` unset → a `disabled` envelope (graceful
     * degrade — the snapshot still writes). Mirrors `collectRecoveryRunSnapshot`'s status/source/errors shape.
     * @returns {Promise<Object>} `{status, source, limit, summary, recentEvents, errors}`.
     */
    async collectSelfHealSnapshot() {
        const
            limit  = AiConfig.orchestrator.deploymentStateBridge.recoveryRunLimit,
            source = 'orchestrator-heal-event-ledger';

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
                recentEvents: Number.isFinite(limit) ? queryHealLedger(events, {limit}) : queryHealLedger(events),
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

export default Neo.setupClass(DeploymentStateBridgeService);
