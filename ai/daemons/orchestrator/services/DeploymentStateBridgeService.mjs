import Base from '../../../../src/core/Base.mjs';

import {
    boundUtf8Tail,
    createDeploymentStateSnapshot,
    writeDeploymentStateSnapshot
} from '../../../services/memory-core/helpers/deploymentStateBridgeStore.mjs';
import {
    calculateDockerCpuPercent,
    calculateDockerMemoryPercent
} from './ContainerHealthDiagnosisService.mjs';

export const DEFAULT_DEPLOYMENT_STATE_BRIDGE_CONFIG = Object.freeze({
    enabled          : false,
    snapshotPath     : null,
    writeIntervalMs  : 30000,
    staleAfterMs     : 2 * 60 * 1000,
    maxSnapshotBytes : 256 * 1024,
    allowedServices  : null,
    includeLogs      : true,
    logTail          : 120,
    logMaxBytes      : 32 * 1024,
    statsSampleWindow: 2
});

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
         * @member {Object|null} bridgeConfig_=null
         * @protected
         * @reactive
         */
        bridgeConfig_: null,
        /**
         * @member {Object|null} runtimeAccessService_=null
         * @protected
         * @reactive
         */
        runtimeAccessService_: null,
        /**
         * @member {Object|null} diagnosisService_=null
         * @protected
         * @reactive
         */
        diagnosisService_: null,
        /**
         * @member {Function|null} nowFn_=null
         * @protected
         * @reactive
         */
        nowFn_: null,
        /**
         * @member {Function|null} writeLog_=null
         * @protected
         * @reactive
         */
        writeLog_: null
    }

    lastWriteAt           = 0
    writeInFlight         = false
    statsSamplesByService = new Map()

    /**
     * Resolves active bridge config.
     * @returns {Object}
     */
    get configValues() {
        return {
            ...DEFAULT_DEPLOYMENT_STATE_BRIDGE_CONFIG,
            ...(this.bridgeConfig || {})
        };
    }

    /**
     * Writes a snapshot when enabled and due.
     * @param {Object} [options]
     * @param {Boolean} [options.force=false] Bypass interval gate.
     * @returns {Promise<Object>}
     */
    async writeSnapshotIfDue({force = false} = {}) {
        const config = this.configValues,
              now    = this.now();

        if (!config.enabled) {
            return {ok: true, status: 'disabled'};
        }

        if (this.writeInFlight) {
            return {ok: true, status: 'in-flight'};
        }

        if (!force && this.lastWriteAt > 0 && now - this.lastWriteAt < config.writeIntervalMs) {
            return {ok: true, status: 'skipped'};
        }

        this.writeInFlight = true;

        try {
            const snapshot = await this.collectSnapshot({generatedAt: now}),
                  result   = await writeDeploymentStateSnapshot({
                      filePath: config.snapshotPath,
                      snapshot,
                      maxBytes: config.maxSnapshotBytes
                  });

            this.lastWriteAt = now;
            this.writeLog?.('INFO', `[DeploymentStateBridge] wrote ${snapshot.services.length} service snapshots to ${config.snapshotPath}`);

            return {ok: true, status: 'written', snapshot, ...result};
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

        return createDeploymentStateSnapshot({
            generatedAt,
            services
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

        let inspect = null,
            stats   = null,
            logs    = null;

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

        if (this.configValues.includeLogs) {
            logs = await read('logs', {tail: this.configValues.logTail});
        }

        if (stats) {
            this.rememberStatsSample(serviceKey, stats);
        }

        const diagnosis = this.diagnosisService?.diagnose
            ? this.diagnosisService.diagnose({
                serviceKey,
                inspect,
                stats,
                statsSamples: this.getStatsSamples(serviceKey),
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
            logs          : summarizeLogs(logs, this.configValues.logMaxBytes),
            diagnosis,
            proofs,
            errors
        };
    }

    /**
     * Resolves allowlisted service keys for snapshot collection.
     * @returns {String[]}
     */
    getServiceKeys() {
        const configured = this.configValues.allowedServices;

        if (Array.isArray(configured) && configured.length > 0) {
            return configured.filter(isSafeServiceKey);
        }

        const runtimeAllowed = this.runtimeAccessService?.configValues?.allowedServices;
        return Array.isArray(runtimeAllowed) ? runtimeAllowed.filter(isSafeServiceKey) : [];
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

        const max = Math.max(1, Number(this.configValues.statsSampleWindow) || 1);
        this.statsSamplesByService.set(serviceKey, samples.slice(-max));
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

export default Neo.setupClass(DeploymentStateBridgeService);
