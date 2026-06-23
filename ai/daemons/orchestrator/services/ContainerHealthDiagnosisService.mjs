import Base from '../../../../src/core/Base.mjs';

import {createRecoveryDiagnosisEvent} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

export const CONTAINER_HEALTH_FACT_TYPES = Object.freeze({
    configDrift        : 'config-drift',
    containerDown      : 'container-down',
    containerUnhealthy : 'container-unhealthy',
    endpointProbeFailed: 'endpoint-probe-failed',
    evalContention     : 'ollama-eval-contention',
    memorySaturation   : 'memory-saturation',
    resourceSaturation : 'resource-saturation',
    runtimeReadFailed  : 'runtime-read-failed'
});

export const CONTAINER_HEALTH_ACTION_CLASSES = Object.freeze({
    escalate    : 'escalate',
    restart     : 'restart',
    throttleShed: 'throttle-shed'
});

export const DEFAULT_CONTAINER_HEALTH_DIAGNOSIS_CONFIG = Object.freeze({
    cpuSaturationPercent   : 90,
    memorySaturationPercent: 90,
    minAuthoritativeFacts  : 2,
    minResourceSamples     : 2,
    sampleWindowMs         : 30000
});

const RUNNING_STATES = new Set(['created', 'restarting', 'running', 'paused']);

/**
 * @summary Produces container-health diagnoses consumable by the recovery controller.
 *
 * The producer is deliberately internal to the orchestrator services layer. It converts bounded
 * read-observe facts (Docker inspect/stats, direct probes, config checks, Ollama eval attribution)
 * into the shared `recovery-diagnosis` event shape without adding an MCP endpoint, socket grant, or
 * lifecycle action. Probe-only failures stay advisory; action classes require direct runtime/config
 * facts or the configured multi-fact threshold.
 *
 * @class Neo.ai.daemons.services.ContainerHealthDiagnosisService
 * @extends Neo.core.Base
 * @see learn/agentos/decisions/0025-orchestrator-container-health-self-healing.md
 * @see learn/agentos/decisions/0026-recovery-actuator.md
 */
export class ContainerHealthDiagnosisService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.ContainerHealthDiagnosisService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.ContainerHealthDiagnosisService',
        /**
         * @member {Object|null} diagnosisConfig_=null
         * @protected
         * @reactive
         */
        diagnosisConfig_: null,
        /**
         * @member {Function|null} nowFn_=null
         * @protected
         * @reactive
         */
        nowFn_: null
    }

    /**
     * Resolves the active diagnosis thresholds.
     * @returns {Object}
     */
    get configValues() {
        return {
            ...DEFAULT_CONTAINER_HEALTH_DIAGNOSIS_CONFIG,
            ...(this.diagnosisConfig || {})
        };
    }

    /**
     * Emits one diagnosis decision from bounded service observations.
     *
     * @param {Object} options
     * @param {String} options.serviceKey Allowlisted deployment service key.
     * @param {Object|null} [options.inspect=null] Docker inspect payload.
     * @param {Object|null} [options.stats=null] Docker stats payload.
     * @param {Object[]|null} [options.statsSamples=null] Docker stats samples spanning the window.
     * @param {Object|null} [options.endpointProbe=null] Direct service probe result.
     * @param {Object|null} [options.configCheck=null] Config correctness result.
     * @param {Object|null} [options.ollamaEvalAttribution=null] Native Ollama eval attribution.
     * @param {Number} [options.observedAt] Epoch milliseconds for the observation.
     * @returns {Object} Diagnosis decision with advisory facts and optional diagnosis event.
     */
    diagnose({
        serviceKey,
        inspect = null,
        stats = null,
        statsSamples = null,
        endpointProbe = null,
        configCheck = null,
        ollamaEvalAttribution = null,
        observedAt = this.now()
    } = {}) {
        this.validateServiceKey(serviceKey);

        const facts = [
            ...this.collectLifecycleFacts({serviceKey, inspect, observedAt}),
            ...this.collectStatsFacts({serviceKey, stats, statsSamples, observedAt}),
            ...this.collectEndpointProbeFacts({serviceKey, endpointProbe, observedAt}),
            ...this.collectConfigFacts({serviceKey, configCheck, observedAt}),
            ...this.collectEvalAttributionFacts({serviceKey, ollamaEvalAttribution, observedAt})
        ];

        const classification = this.classifyFacts({facts});
        if (!classification) {
            return this.createDecision({
                serviceKey,
                observedAt,
                facts,
                status: facts.length > 0 ? 'advisory' : 'healthy'
            });
        }

        const diagnosis = createRecoveryDiagnosisEvent({
            diagnosisId   : this.createDiagnosisId({serviceKey, observedAt, recoveryClass: classification.recoveryClass}),
            recoveryClass : classification.recoveryClass,
            confidence    : classification.confidence,
            targetIdentity: {kind: 'compose-service', id: serviceKey},
            evidenceFacts : classification.evidenceFacts,
            observedAt,
            source        : 'container-health-diagnostics',
            details       : {
                actionClass           : classification.actionClass,
                classificationReason  : classification.reason,
                sampleWindowMs        : this.configValues.sampleWindowMs,
                minAuthoritativeFacts : this.configValues.minAuthoritativeFacts,
                factCount             : facts.length,
                authoritativeFactCount: this.countAuthoritativeFacts(facts)
            }
        });

        return this.createDecision({
            serviceKey,
            observedAt,
            facts,
            status     : 'diagnosed',
            diagnosis,
            actionClass: classification.actionClass
        });
    }

    /**
     * Collects runtime observations through the existing read-observe envelope, then diagnoses.
     *
     * @param {Object} options
     * @param {String} options.serviceKey Allowlisted deployment service key.
     * @param {Object} options.runtimeAccessService DeploymentRuntimeAccessService-like reader.
     * @param {Function|null} [options.endpointProbeFn=null] Optional direct probe callback.
     * @param {Function|null} [options.configCheckFn=null] Optional config-check callback.
     * @param {Object|null} [options.ollamaEvalAttribution=null] Optional eval attribution payload.
     * @param {Object[]|null} [options.statsSamples=null] Optional stats samples spanning the window.
     * @param {Number} [options.observedAt] Epoch milliseconds for the observation.
     * @returns {Promise<Object>} Diagnosis decision.
     */
    async collectAndDiagnose({
        serviceKey,
        runtimeAccessService,
        endpointProbeFn = null,
        configCheckFn = null,
        ollamaEvalAttribution = null,
        statsSamples = null,
        observedAt = this.now()
    } = {}) {
        this.validateServiceKey(serviceKey);

        const runtimeFacts = [];
        let   inspect      = null,
            stats   = null;

        try {
            inspect = (await runtimeAccessService.readObserve({serviceKey, operation: 'inspect'})).data;
            stats   = (await runtimeAccessService.readObserve({serviceKey, operation: 'stats'})).data;
        } catch (error) {
            runtimeFacts.push(this.createFact({
                type         : CONTAINER_HEALTH_FACT_TYPES.runtimeReadFailed,
                serviceKey,
                observedAt,
                severity     : 'warning',
                authoritative: false,
                details      : {message: error.message}
            }));
        }

        const endpointProbe = typeof endpointProbeFn === 'function'
                ? await endpointProbeFn({serviceKey, observedAt})
                : null,
              configCheck   = typeof configCheckFn === 'function'
                ? await configCheckFn({serviceKey, observedAt})
                : null,
              decision      = this.diagnose({
                  serviceKey,
                  inspect,
                  stats,
                  statsSamples,
                  endpointProbe,
                  configCheck,
                  ollamaEvalAttribution,
                  observedAt
              });

        decision.facts.unshift(...runtimeFacts);
        if (!decision.diagnosis && runtimeFacts.length > 0) {
            decision.status = 'advisory';
        }

        return decision;
    }

    /**
     * Collects container lifecycle facts from Docker inspect data.
     * @param {Object} options
     * @returns {Object[]}
     */
    collectLifecycleFacts({serviceKey, inspect, observedAt}) {
        if (!inspect || typeof inspect !== 'object') return [];

        const
            state       = inspect.State || {},
            status      = typeof state.Status === 'string' ? state.Status : null,
            healthState = typeof state.Health?.Status === 'string' ? state.Health.Status : null,
            facts       = [];

        if (status && !RUNNING_STATES.has(status)) {
            facts.push(this.createFact({
                type         : CONTAINER_HEALTH_FACT_TYPES.containerDown,
                serviceKey,
                observedAt,
                severity     : 'critical',
                authoritative: true,
                details      : {
                    status,
                    exitCode: Number.isFinite(state.ExitCode) ? state.ExitCode : null,
                    error   : typeof state.Error === 'string' ? state.Error : null
                }
            }));
        }

        if (healthState && healthState !== 'healthy') {
            facts.push(this.createFact({
                type         : CONTAINER_HEALTH_FACT_TYPES.containerUnhealthy,
                serviceKey,
                observedAt,
                severity     : healthState === 'unhealthy' ? 'critical' : 'warning',
                authoritative: healthState === 'unhealthy',
                details      : {healthState}
            }));
        }

        return facts;
    }

    /**
     * Collects resource saturation facts from Docker stats data.
     * @param {Object} options
     * @returns {Object[]}
     */
    collectStatsFacts({serviceKey, stats, statsSamples, observedAt}) {
        const samples = normalizeStatsSamples({stats, statsSamples});
        if (samples.length < this.configValues.minResourceSamples) return [];

        const
            facts          = [],
            cpuPercents    = samples.map(calculateDockerCpuPercent).filter(Number.isFinite),
            memoryPercents = samples.map(calculateDockerMemoryPercent).filter(Number.isFinite),
            cpuWindow      = summarizeSustainedWindow(cpuPercents, this.configValues.cpuSaturationPercent, samples.length),
            memoryWindow   = summarizeSustainedWindow(memoryPercents, this.configValues.memorySaturationPercent, samples.length);

        if (cpuWindow.sustained) {
            facts.push(this.createFact({
                type         : CONTAINER_HEALTH_FACT_TYPES.resourceSaturation,
                serviceKey,
                observedAt,
                severity     : 'critical',
                authoritative: true,
                details      : {
                    metric        : 'cpu',
                    threshold     : this.configValues.cpuSaturationPercent,
                    sampleCount   : samples.length,
                    sampleWindowMs: this.configValues.sampleWindowMs,
                    minPercent    : cpuWindow.min,
                    maxPercent    : cpuWindow.max,
                    meanPercent   : cpuWindow.mean
                }
            }));
        }

        if (memoryWindow.sustained) {
            facts.push(this.createFact({
                type         : CONTAINER_HEALTH_FACT_TYPES.memorySaturation,
                serviceKey,
                observedAt,
                severity     : 'critical',
                authoritative: true,
                details      : {
                    metric        : 'memory',
                    threshold     : this.configValues.memorySaturationPercent,
                    sampleCount   : samples.length,
                    sampleWindowMs: this.configValues.sampleWindowMs,
                    minPercent    : memoryWindow.min,
                    maxPercent    : memoryWindow.max,
                    meanPercent   : memoryWindow.mean
                }
            }));
        }

        return facts;
    }

    /**
     * Collects advisory direct-probe facts.
     * @param {Object} options
     * @returns {Object[]}
     */
    collectEndpointProbeFacts({serviceKey, endpointProbe, observedAt}) {
        if (!endpointProbe || typeof endpointProbe !== 'object' || endpointProbe.ok !== false) return [];

        return [this.createFact({
            type         : CONTAINER_HEALTH_FACT_TYPES.endpointProbeFailed,
            serviceKey,
            observedAt,
            severity     : 'warning',
            authoritative: false,
            details      : {
                name   : typeof endpointProbe.name === 'string' ? endpointProbe.name : 'endpoint-probe',
                message: typeof endpointProbe.message === 'string' ? endpointProbe.message : null
            }
        })];
    }

    /**
     * Collects config-correctness facts.
     * @param {Object} options
     * @returns {Object[]}
     */
    collectConfigFacts({serviceKey, configCheck, observedAt}) {
        if (!configCheck || typeof configCheck !== 'object' || configCheck.ok !== false) return [];

        return [this.createFact({
            type         : CONTAINER_HEALTH_FACT_TYPES.configDrift,
            serviceKey,
            observedAt,
            severity     : 'critical',
            authoritative: true,
            details      : {
                key     : typeof configCheck.key === 'string' ? configCheck.key : null,
                expected: toSafeScalar(configCheck.expected),
                actual  : toSafeScalar(configCheck.actual),
                message : typeof configCheck.message === 'string' ? configCheck.message : null
            }
        })];
    }

    /**
     * Collects Ollama contention facts from provider readiness attribution.
     * @param {Object} options
     * @returns {Object[]}
     */
    collectEvalAttributionFacts({serviceKey, ollamaEvalAttribution, observedAt}) {
        if (!ollamaEvalAttribution || typeof ollamaEvalAttribution !== 'object') return [];

        const stuckModels = Array.isArray(ollamaEvalAttribution.stuckModels)
            ? ollamaEvalAttribution.stuckModels
            : [];
        if (stuckModels.length === 0) return [];

        return [this.createFact({
            type         : CONTAINER_HEALTH_FACT_TYPES.evalContention,
            serviceKey,
            observedAt,
            severity     : 'warning',
            authoritative: false,
            details      : {
                primaryRole : ollamaEvalAttribution.primaryRole?.role || null,
                primaryModel: ollamaEvalAttribution.primaryLoad?.model || null,
                stuckModels : stuckModels.map(model => ({
                    model          : model.model || null,
                    role           : model.role || null,
                    tokensPerSecond: Number.isFinite(model.tokensPerSecond) ? model.tokensPerSecond : null
                }))
            }
        })];
    }

    /**
     * Classifies facts into the recovery diagnosis contract.
     * @param {Object} options
     * @returns {Object|null}
     */
    classifyFacts({facts}) {
        if (facts.some(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.configDrift)) {
            const evidenceFacts = facts.filter(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.configDrift);
            return {
                recoveryClass: 'config-drift',
                actionClass  : CONTAINER_HEALTH_ACTION_CLASSES.escalate,
                confidence   : 0.95,
                evidenceFacts,
                reason       : 'config-drift-escalate'
            };
        }

        const lifecycleFacts = facts.filter(fact =>
            fact.type === CONTAINER_HEALTH_FACT_TYPES.containerDown ||
            fact.type === CONTAINER_HEALTH_FACT_TYPES.containerUnhealthy
        );
        if (lifecycleFacts.some(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.containerDown) || this.hasAuthoritativeEvidence(lifecycleFacts, facts)) {
            return {
                recoveryClass: 'crash',
                actionClass  : CONTAINER_HEALTH_ACTION_CLASSES.restart,
                confidence   : lifecycleFacts.some(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.containerDown) ? 0.9 : 0.8,
                evidenceFacts: this.selectEvidenceFacts(facts, lifecycleFacts),
                reason       : 'lifecycle-crash'
            };
        }

        const resourceFacts = facts.filter(fact =>
            fact.type === CONTAINER_HEALTH_FACT_TYPES.resourceSaturation ||
            fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation
        );
        if (this.hasAuthoritativeEvidence(resourceFacts, facts)) {
            return {
                recoveryClass: 'exhaustion',
                actionClass  : CONTAINER_HEALTH_ACTION_CLASSES.throttleShed,
                confidence   : 0.8,
                evidenceFacts: this.selectEvidenceFacts(facts, resourceFacts),
                reason       : 'resource-exhaustion'
            };
        }

        const contentionFacts = facts.filter(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.evalContention);
        if (contentionFacts.length > 0 && this.countAuthoritativeFacts(facts) >= 1) {
            return {
                recoveryClass: 'contention',
                actionClass  : CONTAINER_HEALTH_ACTION_CLASSES.throttleShed,
                confidence   : 0.75,
                evidenceFacts: this.selectEvidenceFacts(facts, contentionFacts),
                reason       : 'contention-with-runtime-evidence'
            };
        }

        return null;
    }

    /**
     * Checks whether a primary fact set crosses the configured multi-fact threshold.
     * @param {Object[]} primaryFacts Primary candidate facts.
     * @param {Object[]} allFacts All collected facts.
     * @returns {Boolean}
     */
    hasAuthoritativeEvidence(primaryFacts, allFacts) {
        if (primaryFacts.length === 0) return false;

        return this.countAuthoritativeFacts(allFacts) >= this.configValues.minAuthoritativeFacts ||
            (primaryFacts.length > 0 && allFacts.some(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.endpointProbeFailed));
    }

    /**
     * Counts authoritative non-probe facts.
     * @param {Object[]} facts Fact list.
     * @returns {Number}
     */
    countAuthoritativeFacts(facts) {
        return facts.filter(fact => fact.authoritative).length;
    }

    /**
     * Selects bounded evidence facts for a diagnosis.
     * @param {Object[]} allFacts All facts.
     * @param {Object[]} primaryFacts Primary facts.
     * @returns {Object[]}
     */
    selectEvidenceFacts(allFacts, primaryFacts) {
        const selected = new Map();

        for (const fact of [...primaryFacts, ...allFacts]) {
            selected.set(fact.id, fact);
        }

        return [...selected.values()].slice(0, 8);
    }

    /**
     * Creates a bounded fact envelope.
     * @param {Object} options
     * @returns {Object}
     */
    createFact({type, serviceKey, observedAt, severity, authoritative, details = {}}) {
        return {
            schemaVersion: 1,
            id           : `container-health-fact:${sanitizeId(serviceKey)}:${type}:${observedAt}`,
            type,
            serviceKey,
            observedAt,
            severity,
            authoritative,
            details
        };
    }

    /**
     * Creates the top-level decision envelope.
     * @param {Object} options
     * @returns {Object}
     */
    createDecision({serviceKey, observedAt, facts, status, diagnosis = null, actionClass = null}) {
        return {
            schemaVersion : 1,
            recordType    : 'container-health-diagnosis-decision',
            serviceKey,
            targetIdentity: {kind: 'compose-service', id: serviceKey},
            observedAt,
            status,
            actionClass,
            diagnosis,
            facts
        };
    }

    /**
     * Creates a stable diagnosis id from service/time/class.
     * @param {Object} options
     * @returns {String}
     */
    createDiagnosisId({serviceKey, observedAt, recoveryClass}) {
        return `container-health:${sanitizeId(serviceKey)}:${recoveryClass}:${observedAt}`;
    }

    /**
     * Returns the current clock value.
     * @returns {Number}
     */
    now() {
        return this.nowFn ? this.nowFn() : Date.now();
    }

    /**
     * Validates an allowlist-resolved service key.
     * @param {String} serviceKey Deployment service key.
     * @returns {void}
     */
    validateServiceKey(serviceKey) {
        if (typeof serviceKey !== 'string' || serviceKey.length === 0) {
            throw new TypeError('Container health diagnosis serviceKey is required');
        }
        if (!/^[a-zA-Z0-9_.-]+$/.test(serviceKey)) {
            throw new TypeError(`Container health diagnosis serviceKey '${serviceKey}' contains unsupported characters`);
        }
    }
}

export function calculateDockerCpuPercent(stats) {
    const
        cpuStats    = stats.cpu_stats || {},
        preCpuStats = stats.precpu_stats || {},
        cpuDelta    = Number(cpuStats.cpu_usage?.total_usage) - Number(preCpuStats.cpu_usage?.total_usage),
        systemDelta = Number(cpuStats.system_cpu_usage) - Number(preCpuStats.system_cpu_usage);

    if (!Number.isFinite(cpuDelta) || !Number.isFinite(systemDelta) || cpuDelta <= 0 || systemDelta <= 0) {
        return null;
    }

    const onlineCpus = Number(cpuStats.online_cpus) ||
        (Array.isArray(cpuStats.cpu_usage?.percpu_usage) ? cpuStats.cpu_usage.percpu_usage.length : 1);

    return (cpuDelta / systemDelta) * onlineCpus * 100;
}

export function calculateDockerMemoryPercent(stats) {
    const
        usage = Number(stats.memory_stats?.usage),
        limit = Number(stats.memory_stats?.limit);

    if (!Number.isFinite(usage) || !Number.isFinite(limit) || usage < 0 || limit <= 0) {
        return null;
    }

    return (usage / limit) * 100;
}

function normalizeStatsSamples({stats, statsSamples}) {
    if (Array.isArray(statsSamples)) {
        return statsSamples.filter(sample => sample && typeof sample === 'object');
    }

    return stats && typeof stats === 'object' ? [stats] : [];
}

function summarizeSustainedWindow(values, threshold, expectedCount) {
    if (values.length < expectedCount || values.length === 0) {
        return {sustained: false, min: null, max: null, mean: null};
    }

    const
        min  = Math.min(...values),
        max  = Math.max(...values),
        mean = values.reduce((sum, value) => sum + value, 0) / values.length;

    return {
        sustained: values.every(value => value >= threshold),
        min      : roundMetric(min),
        max      : roundMetric(max),
        mean     : roundMetric(mean)
    };
}

function roundMetric(value) {
    return Math.round(value * 100) / 100;
}

function sanitizeId(value) {
    return String(value).replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function toSafeScalar(value) {
    if (value === null || value === undefined) return null;
    if (['string', 'number', 'boolean'].includes(typeof value)) return value;

    return JSON.stringify(value).slice(0, 256);
}

export default Neo.setupClass(ContainerHealthDiagnosisService);
