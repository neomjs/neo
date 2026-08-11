import Base from '../../../../src/core/Base.mjs';

import {
    createRecoveryDiagnosisEvent,
    createRecoveryTargetIdentity
} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

export const CONTAINER_HEALTH_FACT_TYPES = Object.freeze({
    configDrift               : 'config-drift',
    containerDown             : 'container-down',
    containerUnhealthy        : 'container-unhealthy',
    endpointProbeFailed       : 'endpoint-probe-failed',
    evalContention            : 'ollama-eval-contention',
    heapObservationUnavailable: 'heap-observation-unavailable',
    memorySaturation          : 'memory-saturation',
    ollamaResidualLoad        : 'ollama-residual-load',
    providerResidency         : 'provider-residency-degraded',
    resourceSaturation        : 'resource-saturation',
    restartChurn              : 'restart-churn',
    runtimeReadFailed         : 'runtime-read-failed'
});

export const CONTAINER_HEALTH_ACTION_CLASSES = Object.freeze({
    raiseCeiling: 'raise-ceiling',
    record      : 'record',
    restart     : 'restart',
    throttleShed: 'throttle-shed',
    warmProvider: 'warm-provider'
});

/**
 * @summary Proves that the configured native-Ollama endpoint is the Compose service this diagnosis
 * may restart. The endpoint and eligible service roster remain AiConfig-owned; this helper only
 * compares their injected/read-observed values. Ports are deliberately not pinned because
 * `NEO_OLLAMA_HOST` owns that deployment choice.
 * @param {String|null} configuredHost AiConfig-owned provider endpoint.
 * @param {String|null} observedHost Provider endpoint carried by the residency observation.
 * @param {String} serviceKey Candidate Compose service key.
 * @returns {Boolean}
 */
function isConfiguredComposeOllamaHost({configuredHost, observedHost, serviceKey}) {
    try {
        const configuredEndpoint = new URL(configuredHost),
              observedEndpoint   = new URL(observedHost);

        return ['http:', 'https:'].includes(observedEndpoint.protocol) &&
            configuredEndpoint.origin === observedEndpoint.origin &&
            configuredEndpoint.username === '' && configuredEndpoint.password === '' &&
            observedEndpoint.hostname === serviceKey &&
            observedEndpoint.username === '' && observedEndpoint.password === '';
    } catch {
        return false;
    }
}

/**
 * @summary The two service classes a heal decision can be reasoned about.
 *
 * Keyed by service key rather than by image, so a deployment that swaps the store implementation
 * keeps its classification.
 */
export const SERVICE_CLASSES = Object.freeze({store: 'store', transient: 'transient'});

/**
 * @summary The V8 fatal line that NAMES a heap exhaustion, on one line, strictly.
 *
 * Both shapes V8 emits — `Reached heap limit` and `Ineffective mark-compacts near heap limit` —
 * carry `JavaScript heap out of memory` on the same `FATAL ERROR:` line, so requiring the pair is
 * strict without enumerating V8's wording variants.
 *
 * **This replaced an exit-code discriminator, and the reason generalises.** No abort code carries
 * heap semantics: it names the manner of death, never its cause, and its value is not even stable
 * across base images — the canonical `mc-server` image exits `139` where a host Node exits `134`,
 * and it exits `139` whether or not a ceiling was declared. The log line is the only observation
 * that says *heap*.
 * @member {RegExp} HEAP_FATAL_LINE
 */
export const HEAP_FATAL_LINE = /FATAL ERROR:[^\n]*JavaScript heap out of memory/;

/**
 * @summary EXHAUSTIVE service classification, declared per key rather than inferred from absence.
 *
 * Covers every key in `orchestrator.deploymentRuntimeAccess.allowedServices`, which is the roster
 * the bridge actually iterates (`DeploymentStateBridgeService.getServiceKeys()` falls back to it).
 * A spec asserts that coverage, so adding a service to the roster without classifying it fails a
 * test instead of silently inheriting a policy.
 *
 * The previous shape was a `Set` of store keys, and absence meant transient. Two defects followed.
 * **It was not total:** only `chroma` and a non-existent `'model'` were ever exercised, while
 * `kb-server` and `mc-server` were unclassified, so a future store-backed service would silently
 * receive the 90% transient threshold it cannot survive. **And it was not immutable:**
 * `Object.freeze` on a `Set` locks own properties while `add`/`delete` mutate an internal slot, so
 * `Object.isFrozen` returned `true` on a set whose membership was still writable — a
 * false-assurance guarantee, which is worse than none. A frozen plain object genuinely resists
 * writes, and the spec proves it by attempting them rather than by asserting the predicate.
 */
export const SERVICE_CLASS_BY_KEY = Object.freeze({
    // The corpus IS the workload: resident memory tracks rows already persisted, so nothing can be
    // shed and a restart frees nothing durable.
    'chroma'     : SERVICE_CLASSES.store,
    'kb-server'  : SERVICE_CLASSES.transient,
    'mc-server'  : SERVICE_CLASSES.transient,
    'local-model': SERVICE_CLASSES.transient
});

/**
 * @summary Classifies a service key, reporting whether the classification was DECLARED.
 *
 * `validateServiceKey` accepts any safe string rather than a roster member, so the key space is
 * unbounded and an unknown key must not silently acquire transient policy. It still defaults to
 * transient — that preserves existing behaviour and refusing would make the diagnosis path fail on
 * an unrecognised deployment — but `declared: false` travels with it so the guess is recorded in
 * the emitted evidence instead of disappearing.
 *
 * @param {String} serviceKey
 * @returns {Object} `{serviceClass, declared}`
 */
export function classifyServiceKey(serviceKey) {
    const declaredClass = Object.hasOwn(SERVICE_CLASS_BY_KEY, serviceKey)
        ? SERVICE_CLASS_BY_KEY[serviceKey]
        : null;

    return {
        serviceClass: declaredClass ?? SERVICE_CLASSES.transient,
        declared    : declaredClass !== null
    };
}

/**
 * @summary True when the service's memory footprint is a function of STORED data.
 *
 * The distinction decides which heal is coherent. For transient work, pressure comes from arrival
 * rate, so shedding relieves it. For a store, prescribing `throttle-shed` is not merely
 * ineffective — it is the one class of service for which no available action could have worked.
 *
 * @param {String} serviceKey
 * @returns {Boolean}
 */
export function isStoreBackedService(serviceKey) {
    return classifyServiceKey(serviceKey).serviceClass === SERVICE_CLASSES.store;
}

export const DEFAULT_CONTAINER_HEALTH_DIAGNOSIS_CONFIG = Object.freeze({
    cpuSaturationPercent   : 90,
    memorySaturationPercent: 90,
    // Stores cross their ceiling by GROWING, monotonically and predictably, so the transient
    // threshold is late for them: at sustained 90% the remaining headroom is smaller than one
    // ingestion batch, and the store exits cleanly rather than being OOM-killed — no crash
    // signature, no second chance. 80% leaves room to raise the ceiling before the next batch
    // rather than after the corpus has already stopped being able to complete.
    storeMemorySaturationPercent: 80,
    minAuthoritativeFacts       : 2,
    minResourceSamples          : 2,
    // Restarts within the window, on one container generation, before churn is reported. Three is
    // chosen to sit above ordinary transients (one restart is noise; two can be a slow dependency
    // coming up) and far below a real loop, which reached 977. The window bounds it to RECENT churn:
    // a container that restarted repeatedly last month and has been stable since is not sick now.
    restartChurnSeverity : 'critical',
    restartChurnThreshold: 3,
    restartChurnWindowMs : 900000,
    sampleWindowMs       : 30000
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
         * Reads the resolved native-Ollama endpoint at the diagnosis use site. The reader keeps
         * AiConfig ownership in the Orchestrator entrypoint while allowing reactive overrides to
         * remain visible after this service is constructed.
         * @member {Function|null} ollamaHostReader_=null
         * @protected
         * @reactive
         */
        ollamaHostReader_: null,
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
     * @summary Projects the classification a heal decision WOULD reason from, independent of load.
     *
     * Every field here previously existed only inside the memory-saturation fact — which is emitted
     * only when a sustained window trips. A healthy store therefore exposed neither its class, nor
     * the threshold that applies to it, nor the window state building toward that threshold, so any
     * load-independent claim about the classification machinery was unverifiable from the outside.
     * Three successive post-merge verification formulations failed on exactly that gap before this
     * projection existed: the evidence they asked for could not exist on a healthy plane.
     *
     * Pure read: no fact is emitted, no window verdict is taken, no threshold is compared. The span
     * arithmetic mirrors `summarizeSustainedWindow`'s measured-span rule (two-plus finite stamps make
     * a span; anything less is zero, never an assumed window) without invoking it, because this
     * projection has no threshold to evaluate — reporting a verdict-shaped field from a
     * verdict-free read would recreate the conflation this method exists to remove.
     *
     * @param {Object} options
     * @param {String} options.serviceKey Allowlisted deployment service key.
     * @param {Object[]} [options.statsSamples=[]] Docker stats samples, stamped with `observedAtMs`.
     * @returns {Object} `{serviceKey, serviceClass, serviceClassDeclared, appliedMemoryThreshold,
     *     observedWindowMs, requiredWindowMs, sampleCount, stampCoverage}`
     */
    describeClassification({serviceKey, statsSamples = []} = {}) {
        this.validateServiceKey(serviceKey);

        const
            {serviceClass, declared} = classifyServiceKey(serviceKey),
            config                   = this.configValues,
            samples                  = Array.isArray(statsSamples) ? statsSamples : [],
            timestamps               = samples.map(sample => sample?.observedAtMs).filter(Number.isFinite),
            observedWindowMs         = timestamps.length > 1
                ? Math.max(...timestamps) - Math.min(...timestamps)
                : 0;

        return {
            serviceKey,
            serviceClass,
            serviceClassDeclared  : declared,
            appliedMemoryThreshold: serviceClass === SERVICE_CLASSES.store
                ? config.storeMemorySaturationPercent
                : config.memorySaturationPercent,
            observedWindowMs,
            requiredWindowMs: config.sampleWindowMs,
            sampleCount     : samples.length,
            // Distinguishes an under-length span from an under-stamped one: the two read identically
            // in `observedWindowMs`, and collapsing them is how a dead window hides behind a short one.
            stampCoverage   : samples.length > 0
                ? Math.round((timestamps.length / samples.length) * 100) / 100
                : null
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
     * @param {Object|null} [options.providerResidency=null] Active-provider residency observation.
     * @param {Object|null} [options.providerActivity=null] Bounded provider-work projection.
     * @param {Boolean} [options.providerResidencyEligible=false] Whether the bridge's configured
     *     provider-service roster selected this Compose service for observation.
     * @param {String|null} [options.runtimeContainerId=null] Inspect/stats proof identity.
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
        providerResidency = null,
        providerActivity = null,
        providerResidencyEligible = false,
        runtimeContainerId = null,
        churnBaseline = null,
        inspectReadFailed = false,
        plannedRestarts = 0,
        // Summarized ONCE by the bridge from the same `Config.Cmd` and the same allowlisted log
        // read it already performs — passed in rather than re-derived here, so there is exactly one
        // place that decides what "a Node service" and "the log tail" mean.
        logs = null,
        nodeCommand = null,
        declaredHeapCeilingMb = null,
        observedAt = this.now()
    } = {}) {
        this.validateServiceKey(serviceKey);

        const churn = evaluateRestartChurn({
            inspect,
            baseline : churnBaseline,
            observedAt,
            plannedRestarts,
            threshold: this.configValues.restartChurnThreshold,
            windowMs : this.configValues.restartChurnWindowMs
        });

        const facts = [
            // A caller that could not READ the runtime says so explicitly. Without this, an absent
            // inspect produces no facts and the decision reads `healthy` — the failure reported as
            // health.
            ...(inspectReadFailed ? [this.createFact({
                type         : CONTAINER_HEALTH_FACT_TYPES.runtimeReadFailed,
                serviceKey,
                observedAt,
                severity     : 'warning',
                authoritative: false,
                details      : {operation: 'inspect'}
            })] : []),
            ...this.collectRestartChurnFacts({serviceKey, churn, observedAt}),
            ...this.collectLifecycleFacts({serviceKey, inspect, observedAt, logs, nodeCommand, declaredHeapCeilingMb}),
            ...this.collectStatsFacts({serviceKey, stats, statsSamples, observedAt, nodeCommand}),
            ...this.collectEndpointProbeFacts({serviceKey, endpointProbe, observedAt}),
            ...this.collectConfigFacts({serviceKey, configCheck, observedAt}),
            ...this.collectEvalAttributionFacts({serviceKey, ollamaEvalAttribution, observedAt}),
            ...this.collectProviderResidencyFacts({serviceKey, providerResidency, observedAt})
        ];

        facts.push(...this.collectOllamaResidualLoadFacts({
            serviceKey,
            inspect,
            statsSamples,
            providerActivity,
            providerResidency,
            providerResidencyEligible,
            runtimeContainerId,
            observedAt,
            facts
        }));

        // A SUCCESSFUL probe produces no fact — `collectEndpointProbeFacts` only emits on `ok === false`
        // — so the one observation that directly contradicts a restart would otherwise never reach the
        // classifier. Passed alongside the facts rather than as a fact, because emitting one would make
        // every healthy probed service report `advisory` instead of `healthy`.
        const classification = this.classifyFacts({facts, serviceAnswering: endpointProbe?.ok === true});
        if (!classification) {
            return {
                ...this.createDecision({
                    serviceKey,
                    observedAt,
                    facts,
                    status: facts.length > 0 ? 'advisory' : 'healthy'
                }),
                churnBaseline: churn.nextBaseline
            };
        }

        const diagnosis = createRecoveryDiagnosisEvent({
            diagnosisId   : this.createDiagnosisId({serviceKey, observedAt, recoveryClass: classification.recoveryClass}),
            recoveryClass : classification.recoveryClass,
            confidence    : classification.confidence,
            targetIdentity: this.resolveDiagnosisTargetIdentity({serviceKey, classification}),
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

        return {
            ...this.createDecision({
                serviceKey,
                observedAt,
                facts,
                status     : 'diagnosed',
                diagnosis,
                actionClass: classification.actionClass
            }),
            churnBaseline: churn.nextBaseline
        };
    }

    /**
     * Collects the restart-churn fact.
     *
     * @summary Deliberately **non-authoritative**, following the precedent ADR-0025 §2.4 sets for the // ticket-ref-ok: the ADR is the governing authority for this safety property, not background reading
     * data-integrity coverage-drift fact: *"a record is non-authoritative: the multi-fact requirement
     * gates authoritative actions, not records."*
     *
     * Non-authoritative is load-bearing here rather than merely conventional. `countAuthoritativeFacts`
     * counts every authoritative fact regardless of type, and `hasAuthoritativeEvidence` admits a
     * lifecycle-crash classification at `minAuthoritativeFacts`. An authoritative churn fact could
     * therefore combine with one `container-unhealthy` fact to reach that threshold and classify a
     * *churning* container as a crash needing a **restart** — which is the one action already proven
     * ineffective on it.
     *
     * @param {Object} options
     * @param {String} options.serviceKey
     * @param {Object} options.churn From {@link evaluateRestartChurn}.
     * @param {Number} options.observedAt
     * @returns {Object[]}
     */
    collectRestartChurnFacts({serviceKey, churn, observedAt}) {
        if (!churn?.churning) return [];

        return [this.createFact({
            type         : CONTAINER_HEALTH_FACT_TYPES.restartChurn,
            serviceKey,
            observedAt,
            severity     : this.configValues.restartChurnSeverity,
            authoritative: false,
            details      : {
                unplannedRestarts: churn.unplannedRestarts,
                elapsedMs        : churn.elapsedMs,
                windowMs         : this.configValues.restartChurnWindowMs,
                threshold        : this.configValues.restartChurnThreshold
            }
        })];
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
     * @param {Object|null} [options.providerResidency=null] Optional active-provider residency observation.
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
        providerResidency = null,
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
                  providerResidency,
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
     * @param {Object|null} [options.logs=null] Bounded log summary, for heap attribution.
     * @param {Boolean|null} [options.nodeCommand=null] Whether `Config.Cmd` invoked Node.
     * @param {Number|null} [options.declaredHeapCeilingMb=null] Declared ceiling, when observable.
 * @param {Boolean|null} [options.oomKilled=null] Whether the kernel reclaimed the container.
     * @returns {Object[]}
     */
    collectLifecycleFacts({serviceKey, inspect, observedAt, logs = null, nodeCommand = null, declaredHeapCeilingMb = null}) {
        if (!inspect || typeof inspect !== 'object') return [];

        const
            state       = inspect.State || {},
            status      = typeof state.Status === 'string' ? state.Status : null,
            healthState = typeof state.Health?.Status === 'string' ? state.Health.Status : null,
            facts       = [];

        if (status && !RUNNING_STATES.has(status)) {
            const heap = classifyHeapExhaustion({
                logs,
                nodeCommand,
                declaredHeapCeilingMb,
                oomKilled: typeof state.OOMKilled === 'boolean' ? state.OOMKilled : null
            });

            facts.push(this.createFact({
                type         : CONTAINER_HEALTH_FACT_TYPES.containerDown,
                serviceKey,
                observedAt,
                severity     : 'critical',
                authoritative: true,
                details      : {
                    status,
                    exitCode: Number.isFinite(state.ExitCode) ? state.ExitCode : null,
                    error   : typeof state.Error === 'string' ? state.Error : null,
                    // RAW EVIDENCE, not attribution inputs. Both are worth recording — a cgroup kill
                    // and a self-abort are different failures — but neither says *heap*, and the
                    // exit code's value is not even stable across base images.
                    oomKilled: typeof state.OOMKilled === 'boolean' ? state.OOMKilled : null,
                    // The attribution, with its own limits attached. `unavailableReason` is what
                    // keeps a disabled log channel distinguishable from a non-heap death.
                    ...heap
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
    collectStatsFacts({serviceKey, stats, statsSamples, observedAt, nodeCommand = null}) {
        const samples = normalizeStatsSamples({stats, statsSamples});
        if (samples.length < this.configValues.minResourceSamples) return [];

        const
            facts           = [],
            // A store crosses its ceiling by growing, so it needs the earlier threshold: see
            // `storeMemorySaturationPercent`. CPU keeps the single threshold — compute pressure is
            // not monotonic in stored data, so a store has no special claim on it.
            serviceClassification = classifyServiceKey(serviceKey),
            memoryThreshold = serviceClassification.serviceClass === SERVICE_CLASSES.store
                ? this.configValues.storeMemorySaturationPercent
                : this.configValues.memorySaturationPercent,
            cpuPercents     = samples.map(calculateDockerCpuPercent).filter(Number.isFinite),
            // A Node service's memory saturation is measured against its own heap, never against the
            // container. `heapScope` decides which numerator is legitimate for this service and
            // whether one is available at all; see `resolveMemorySaturationScope`.
            heapScope       = resolveMemorySaturationScope({samples, nodeCommand}),
            isHeapScope     = heapScope.scope === MEMORY_SATURATION_SCOPES.heap,
            memoryPercents  = isHeapScope
                ? heapScope.percents
                : samples.map(calculateDockerMemoryPercent).filter(Number.isFinite),
            // Per-sample observation times, stamped by `rememberStatsSample` when each sample was
            // taken. The window is now MEASURED from these rather than asserted from config, so
            // back-to-back samples cannot satisfy a sustained-window claim.
            timestamps      = samples.map(sample => sample?.observedAtMs).filter(Number.isFinite),
            // The heap window is measured from the SUBJECT's own observation times, never from the
            // Docker polls that read them. Those two clocks tick independently: the poll advances
            // every collection, while a stopped reporter's stamp does not move at all. Measuring the
            // span from the observer's clock let one stale record, re-read twice, assert a sustained
            // window nothing had sustained. CPU keeps the Docker stamps, which are its true subject.
            memoryTimestamps = isHeapScope ? heapScope.timestamps : timestamps,
            minWindowMs     = this.configValues.sampleWindowMs,
            cpuWindow       = summarizeSustainedWindow({values: cpuPercents, threshold: this.configValues.cpuSaturationPercent, expectedCount: samples.length, timestamps, minWindowMs}),
            memoryWindow    = summarizeSustainedWindow({values: memoryPercents, threshold: memoryThreshold, expectedCount: samples.length, timestamps: memoryTimestamps, minWindowMs});

        if (cpuWindow.sustained) {
            // Whether this container's ratio may speak for THIS service. See the shared subject rule
            // beside `MEMORY_SATURATION_SCOPES`: a cgroup total aggregates PID 1 plus every fork, so
            // a Node service running a scheduled child presents as the service saturating. The number
            // stays reported; only its AUTHORITY is withdrawn, because `authoritative: false` cannot
            // reach `minAuthoritativeFacts` and therefore licenses no action.
            const cpuScope = resolveCpuSaturationScope({nodeCommand});

            facts.push(this.createFact({
                type         : CONTAINER_HEALTH_FACT_TYPES.resourceSaturation,
                serviceKey,
                observedAt,
                severity     : 'critical',
                authoritative: cpuScope.authoritative,
                details      : {
                    metric     : 'cpu',
                    // The subject the percent describes, published for the same reason the memory
                    // fact publishes its scope: two different quantities both read as "cpu 98%", and
                    // a consumer cannot re-derive which one it was handed.
                    scope                   : cpuScope.scope,
                    subjectUnavailableReason: cpuScope.reason,
                    threshold               : this.configValues.cpuSaturationPercent,
                    sampleCount             : samples.length,
                    // The window as MEASURED, beside the minimum enforced. Reporting only the
                    // configured value put an unobserved claim inside the evidence a heal decision
                    // reads -- the same defect as reporting the wrong threshold, one field over.
                    observedWindowMs: cpuWindow.observedWindowMs,
                    requiredWindowMs: this.configValues.sampleWindowMs,
                    minPercent      : cpuWindow.min,
                    maxPercent      : cpuWindow.max,
                    meanPercent     : cpuWindow.mean
                }
            }));
        }

        // Fail closed rather than fall back. A Node service whose heap the channel cannot report gets
        // NO memory-saturation fact, because the only remaining numerator is the cross-scope one this
        // slice exists to remove — and an inverted signal is worse than a missing one: it protects a
        // service with a large native footprint and stays silent for the lean service that is
        // actually about to exhaust its old space. The death itself remains attributable at n=1 from
        // the heap-limit log line, which needs no ratio.
        //
        // **The silence is announced, and that half is not optional.** `diagnose()` publishes
        // `status: facts.length > 0 ? 'advisory' : 'healthy'`, so a Node service with no heap reading
        // and no other facts would otherwise report **`healthy`** — green on precisely the axis that
        // just stopped being measured. Failing closed on the numerator would have become failing OPEN
        // on the envelope, which is the more dangerous of the two and is easy to miss because the
        // numerator decision is so obviously right. (@neo-opus-grace caught this on review of the
        // surface-overlap ping; the fix is hers.)
        //
        // The shape is lifted from `runtimeReadFailed` above rather than invented: `warning` +
        // `authoritative: false` cannot reach `minAuthoritativeFacts`, licenses no action, and cannot
        // be computed from a cross-scope pair — so AC-1 stands untouched — while a single fact is
        // enough to flip the envelope from `healthy` to `advisory`. It reports an absent measurement,
        // never a state of the heap.
        if (heapScope.scope === MEMORY_SATURATION_SCOPES.unavailable) {
            facts.push(this.createFact({
                type         : CONTAINER_HEALTH_FACT_TYPES.heapObservationUnavailable,
                serviceKey,
                observedAt,
                severity     : 'warning',
                authoritative: false,
                details      : {
                    metric           : 'memory',
                    // WHY the axis is unmeasured. `not-deployed` is the live case today and reads very
                    // differently from `stale` or `identity-mismatch`, so collapsing them would hide
                    // which repair is owed.
                    unavailableReason: heapScope.unavailableReason,
                    sampleCount      : samples.length
                }
            }));

            return facts;
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
                    // The threshold ACTUALLY applied, not the transient default — a store trips at
                    // `storeMemorySaturationPercent`, and reporting the other number would put a
                    // falsehood inside the evidence a heal decision is made from.
                    threshold       : memoryThreshold,
                    sampleCount     : samples.length,
                    observedWindowMs: memoryWindow.observedWindowMs,
                    requiredWindowMs: this.configValues.sampleWindowMs,
                    // The class the threshold came from, and whether it was DECLARED. An unrostered
                    // key still defaults to transient, but recording the guess keeps it out of the
                    // silent path: "unlisted" used to be indistinguishable from "classified".
                    serviceClass        : serviceClassification.serviceClass,
                    serviceClassDeclared: serviceClassification.declared,
                    minPercent          : memoryWindow.min,
                    maxPercent          : memoryWindow.max,
                    meanPercent         : memoryWindow.mean,
                    // WHICH memory this percent describes. Without it the fact is ambiguous between
                    // two different denominators, and a consumer comparing facts across services —
                    // or across this change — would be comparing unlike quantities while both read
                    // as "memory 91%".
                    memoryScope         : heapScope.scope
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
     * Collects active-provider residency facts from provider-specific probes.
     *
     * Diagnostics own normalization only: callers supply LMS, Ollama, or future-provider facts;
     * recovery later routes by the typed target identity.
     *
     * @param {Object} options
     * @returns {Object[]}
     */
    collectProviderResidencyFacts({serviceKey, providerResidency, observedAt}) {
        if (!providerResidency || typeof providerResidency !== 'object') return [];

        const reasonCode = this.getProviderResidencyReasonCode(providerResidency);
        if (!reasonCode) return [];

        return [this.createFact({
            type         : CONTAINER_HEALTH_FACT_TYPES.providerResidency,
            serviceKey,
            observedAt,
            severity     : ['extra-residents', 'provider-probe-failed'].includes(reasonCode) ? 'warning' : 'critical',
            authoritative: !['extra-residents', 'provider-probe-failed'].includes(reasonCode),
            details      : {
                provider                 : typeof providerResidency.provider === 'string' ? providerResidency.provider : null,
                host                     : typeof providerResidency.host === 'string' ? providerResidency.host : null,
                model                    : typeof providerResidency.model === 'string' ? providerResidency.model : null,
                embeddingModel           : typeof providerResidency.embeddingModel === 'string' ? providerResidency.embeddingModel : null,
                message                  : typeof providerResidency.message === 'string' ? providerResidency.message : null,
                reasonCode,
                ready                    : typeof providerResidency.ready === 'boolean' ? providerResidency.ready : null,
                degraded                 : typeof providerResidency.degraded === 'boolean' ? providerResidency.degraded : null,
                targetIdentity           : this.readProviderTargetIdentity(providerResidency.targetIdentity),
                requiredModels           : toSafeArray(providerResidency.requiredModels),
                availableModels          : toSafeArray(providerResidency.availableModels),
                missingModels            : toSafeArray(providerResidency.missingModels),
                insufficientContextModels: toSafeArray(providerResidency.insufficientContextModels),
                extraModels              : toSafeArray(providerResidency.extraModels),
                failedModels             : toSafeArray(providerResidency.failedModels),
                loadedContexts           : toSafeObject(providerResidency.loadedContexts),
                observedRequiredCount    : toSafeNumber(providerResidency.observedRequiredCount),
                requiredResidentModels   : toSafeNumber(providerResidency.requiredResidentModels),
                residentButNotServing    : providerResidency.residentButNotServing === true
            }
        })];
    }

    /**
     * @summary Folds passive container CPU, Ollama residency, and bounded provider demand into one
     * residual-load fact without dispatching provider work.
     *
     * The CPU observation is container-scoped; `/api/ps` contributes only resident model identity.
     * Consequently any accounted native-Ollama activity vetoes recovery — this layer cannot prove
     * which resident runner owns the container CPU. Missing, stale, truncated, contradictory, or
     * cold-start evidence emits an advisory fact and can never license a restart.
     *
     * @param {Object} options
     * @param {String} options.serviceKey Compose service key.
     * @param {Object|null} options.inspect Docker inspect payload.
     * @param {Object[]|null} options.statsSamples Docker samples spanning the candidate window.
     * @param {Object|null} options.providerActivity Provider-work projection.
     * @param {Object|null} options.providerResidency Passive residency observation.
     * @param {Boolean} options.providerResidencyEligible Whether the configured provider-service
     *     roster selected this Compose service.
     * @param {String|null} options.runtimeContainerId Inspect/stats proof identity.
     * @param {Number} options.observedAt Observation epoch ms.
     * @param {Object[]} options.facts Facts collected before this composition.
     * @returns {Object[]}
     */
    collectOllamaResidualLoadFacts({
        serviceKey,
        inspect,
        statsSamples,
        providerActivity,
        providerResidency,
        providerResidencyEligible,
        runtimeContainerId,
        observedAt,
        facts
    }) {
        const cpuFact = facts.find(fact =>
            fact.type === CONTAINER_HEALTH_FACT_TYPES.resourceSaturation &&
            fact.details?.metric === 'cpu'
        );

        if (!cpuFact) return [];

        const
            configuredHost  = this.ollamaHostReader?.(),
            targetIdentity  = this.readProviderTargetIdentity(providerResidency?.targetIdentity),
            availableModels = toSafeArray(providerResidency?.availableModels),
            roles           = [
                {role: 'chat', model: typeof providerResidency?.model === 'string' ? providerResidency.model : null},
                {role: 'embedding', model: typeof providerResidency?.embeddingModel === 'string' ? providerResidency.embeddingModel : null}
            ].filter(role => role.model),
            residentRoles = roles.map(role => ({
                ...role,
                resident: availableModels.includes(role.model)
            })),
            startedAt = Date.parse(inspect?.State?.StartedAt ?? ''),
            containerAgeMs = Number.isFinite(startedAt) ? observedAt - startedAt : null,
            baseDetails = {
                observationSource         : 'deployment-runtime+provider-activity-ledger+ollama-api-ps',
                subjectIdentity           : {kind: 'compose-service', id: serviceKey},
                targetIdentity,
                runtimeContainerId        : typeof runtimeContainerId === 'string' ? runtimeContainerId : null,
                provider                  : typeof providerResidency?.provider === 'string' ? providerResidency.provider : null,
                roles                     : residentRoles,
                availableModels,
                providerActivityObservedAt: Number.isFinite(providerActivity?.observedAt)
                    ? providerActivity.observedAt
                    : null,
                providerActivitySinceMs: Number.isFinite(providerActivity?.sinceMs)
                    ? providerActivity.sinceMs
                    : null,
                containerAgeMs,
                cpuFactId: cpuFact.id
            },
            advisory = (reasonCode, details = {}) => [this.createFact({
                type         : CONTAINER_HEALTH_FACT_TYPES.ollamaResidualLoad,
                serviceKey,
                observedAt,
                severity     : 'warning',
                authoritative: false,
                details      : {...baseDetails, ...details, reasonCode}
            })];

        if (providerResidencyEligible !== true) {
            // Generic CPU saturation must not manufacture an Ollama advisory. A declined residual
            // path becomes visible when upstream actually supplied provider evidence for a service
            // the configured roster excludes.
            if (!providerResidency && !providerActivity) return [];

            return advisory('provider-residency-service-not-configured');
        }
        if (!providerResidency) return advisory('provider-residency-unavailable');
        if (providerResidency?.provider !== 'ollama') return advisory('provider-not-ollama');
        if (!isConfiguredComposeOllamaHost({configuredHost, observedHost: providerResidency.host, serviceKey})) {
            return advisory('provider-endpoint-target-mismatch');
        }
        if (targetIdentity?.kind !== 'compose-service' || targetIdentity.id !== serviceKey) {
            return advisory('subject-identity-mismatch');
        }
        const samples = normalizeStatsSamples({stats: null, statsSamples});
        if (typeof runtimeContainerId !== 'string' || samples.length === 0 ||
            samples.some(sample => sample.containerId !== runtimeContainerId)
        ) {
            return advisory('stats-incarnation-unbounded');
        }
        if (containerAgeMs === null || containerAgeMs < this.configValues.sampleWindowMs) {
            return advisory(containerAgeMs === null ? 'container-age-unknown' : 'container-cold-start');
        }
        if (providerResidency?.ready !== true || residentRoles.length === 0 || !residentRoles.some(role => role.resident)) {
            return advisory('resident-model-evidence-unavailable');
        }
        if (providerActivity?.status !== 'ok') return advisory('provider-activity-unavailable');

        const projectionAgeMs = Number.isFinite(providerActivity.observedAt)
            ? observedAt - providerActivity.observedAt
            : null;

        if (projectionAgeMs === null || projectionAgeMs < 0 || projectionAgeMs > this.configValues.sampleWindowMs) {
            return advisory('provider-activity-stale', {projectionAgeMs});
        }
        if (!Number.isFinite(providerActivity.sinceMs) || providerActivity.sinceMs < this.configValues.sampleWindowMs) {
            return advisory('provider-activity-lookback-too-short');
        }
        if (!Number.isInteger(providerActivity.totalInFlight) || providerActivity.totalInFlight < 0 ||
            !Array.isArray(providerActivity.inFlight) ||
            typeof providerActivity.inFlightTruncated !== 'boolean' ||
            providerActivity.inFlightTruncated ||
            providerActivity.totalInFlight !== providerActivity.inFlight.length
        ) {
            return advisory('provider-activity-in-flight-unbounded');
        }

        const liveOllama = providerActivity.inFlight.filter(activity => activity?.provider === 'ollama');
        if (liveOllama.length > 0) {
            return advisory('provider-demand-in-flight', {
                inFlight: liveOllama.map(activity => ({
                    activityId    : typeof activity.activityId === 'string' ? activity.activityId : null,
                    service       : typeof activity.service === 'string' ? activity.service : null,
                    operationStage: typeof activity.operationStage === 'string' ? activity.operationStage : null,
                    role          : typeof activity.role === 'string' ? activity.role : null,
                    model         : typeof activity.model === 'string' ? activity.model : null,
                    elapsedMs     : Number.isFinite(activity.elapsedMs) ? activity.elapsedMs : null
                }))
            });
        }

        const
            recentCompletions = providerActivity.recentCompletions,
            recentCount       = providerActivity.totalRecentCompletions,
            recentTruncated   = providerActivity.recentCompletionsTruncated,
            oldestReturnedAt  = Array.isArray(recentCompletions) && recentCompletions.length > 0
                ? Date.parse(recentCompletions.at(-1)?.completedAt ?? '')
                : NaN,
            hiddenRowsPredateCpuWindow = recentTruncated === true &&
                Number.isInteger(recentCount) && recentCount > recentCompletions?.length &&
                Number.isFinite(oldestReturnedAt) &&
                observedAt - oldestReturnedAt > this.configValues.sampleWindowMs,
            recentProjectionBounded = recentTruncated === false
                ? recentCount === recentCompletions?.length
                : hiddenRowsPredateCpuWindow;

        if (!Number.isInteger(recentCount) || recentCount < 0 ||
            !Array.isArray(recentCompletions) ||
            typeof recentTruncated !== 'boolean' ||
            !recentProjectionBounded
        ) {
            return advisory('provider-activity-recent-unbounded');
        }

        const recentOllama = recentCompletions.filter(activity => {
            if (activity?.provider !== 'ollama') return false;
            const completedAt = Date.parse(activity.completedAt ?? '');

            return Number.isFinite(completedAt) && observedAt - completedAt >= 0 &&
                observedAt - completedAt <= this.configValues.sampleWindowMs;
        });

        if (recentOllama.length > 0) {
            return advisory('provider-demand-recently-settled', {
                recentCompletions: recentOllama.map(activity => ({
                    activityId : typeof activity.activityId === 'string' ? activity.activityId : null,
                    role       : typeof activity.role === 'string' ? activity.role : null,
                    model      : typeof activity.model === 'string' ? activity.model : null,
                    completedAt: activity.completedAt
                }))
            });
        }

        return [this.createFact({
            type         : CONTAINER_HEALTH_FACT_TYPES.ollamaResidualLoad,
            serviceKey,
            observedAt,
            severity     : 'critical',
            authoritative: true,
            details      : {
                ...baseDetails,
                reasonCode   : 'sustained-unexplained-ollama-load',
                projectionAgeMs,
                totalInFlight: providerActivity.totalInFlight
            }
        })];
    }

    /**
     * Classifies facts into the recovery diagnosis contract.
     * @param {Object} options
     * @returns {Object|null}
     */
    classifyFacts({facts, serviceAnswering = false}) {
        const ollamaResidualFacts = facts.filter(fact =>
            fact.type === CONTAINER_HEALTH_FACT_TYPES.ollamaResidualLoad &&
            fact.authoritative === true &&
            fact.details?.reasonCode === 'sustained-unexplained-ollama-load'
        );

        if (ollamaResidualFacts.length > 0) {
            return {
                recoveryClass : 'exhaustion',
                actionClass   : CONTAINER_HEALTH_ACTION_CLASSES.restart,
                confidence    : 0.95,
                evidenceFacts : this.selectEvidenceFacts(facts, ollamaResidualFacts),
                reason        : 'ollama-residual-load-restart',
                targetIdentity: ollamaResidualFacts[0].details.targetIdentity
            };
        }

        const providerRoleResidencyFacts = facts.filter(fact => this.isProviderRoleResidencyRecoverable(fact));
        if (providerRoleResidencyFacts.length > 0) {
            return {
                recoveryClass : 'provider-role-residency',
                actionClass   : CONTAINER_HEALTH_ACTION_CLASSES.warmProvider,
                confidence    : 0.85,
                evidenceFacts : providerRoleResidencyFacts,
                reason        : 'provider-role-residency-warm',
                targetIdentity: this.resolveProviderFactTargetIdentity(providerRoleResidencyFacts[0])
            };
        }

        const configDriftFacts = facts.filter(fact =>
            fact.type === CONTAINER_HEALTH_FACT_TYPES.configDrift ||
            this.isProviderResidencyConfigDrift(fact)
        );

        if (configDriftFacts.length > 0) {
            const providerTargetIdentity = this.resolveProviderFactTargetIdentity(configDriftFacts.find(fact =>
                fact.type === CONTAINER_HEALTH_FACT_TYPES.providerResidency
            ));

            return {
                recoveryClass : 'config-drift',
                actionClass   : CONTAINER_HEALTH_ACTION_CLASSES.warmProvider,
                confidence    : 0.95,
                evidenceFacts : configDriftFacts,
                reason        : 'config-drift-reconfigure',
                targetIdentity: providerTargetIdentity
            };
        }

        const providerCrashFacts = facts.filter(fact => this.isProviderResidentButNotServing(fact));
        if (providerCrashFacts.length > 0) {
            return {
                recoveryClass : 'crash',
                actionClass   : CONTAINER_HEALTH_ACTION_CLASSES.restart,
                confidence    : 0.85,
                evidenceFacts : this.selectEvidenceFacts(facts, providerCrashFacts),
                reason        : 'provider-resident-not-serving',
                targetIdentity: this.resolveProviderFactTargetIdentity(providerCrashFacts[0])
            };
        }

        const lifecycleFacts = facts.filter(fact =>
            fact.type === CONTAINER_HEALTH_FACT_TYPES.containerDown ||
            fact.type === CONTAINER_HEALTH_FACT_TYPES.containerUnhealthy
        );
        const downFacts = lifecycleFacts.filter(fact =>
            fact.type === CONTAINER_HEALTH_FACT_TYPES.containerDown);

        // DELIBERATELY unchanged, and the reason is worth stating because an earlier revision of this
        // change got it wrong. A container the runtime marks `unhealthy` looks like a debounced verdict
        // — the runtime only sets it after `retries` consecutive failures — and it is tempting to treat
        // that as sufficient on its own. It is not. Debouncing answers NOISE; it cannot answer
        // CONTRADICTION, because repeated evaluations of one probe are still one evidence channel, and
        // the channel itself can be measuring the wrong thing. ADR-0025 §2.1 names the live instance: a // ticket-ref-ok: the ADR clause is the governing safety authority this branch must not contradict
        // provider-dependent canary false-fails while the service still answers and persists, so
        // restarting it is a self-inflicted outage. §2.4 therefore requires the PAIR — a
        // `container-unhealthy` state plus a failed DIRECT endpoint probe — and
        // `hasAuthoritativeEvidence` already admits exactly that pair.
        //
        // The pair was unreachable in production for one reason only: nothing supplied `endpointProbe`.
        // That was a missing PRODUCER, never a floor that was too strict, and the repair belongs
        // upstream at the producer rather than here.
        // `serviceAnswering` VETOES the unhealthy-based restart, and it must veto the corroborated
        // branch too — not only the single-fact one. `hasAuthoritativeEvidence`'s first arm admits ANY
        // two authoritative facts, so `container-unhealthy` + a sustained `memory-saturation` reaches
        // restart on a service that is demonstrably serving. ADR-0025 §2.4's resource alternative is // ticket-ref-ok: the ADR clause is the authority for requiring a failed operation, not a fact count
        // narrower than that arm: it requires resource exhaustion AND *a sustained failed service
        // operation*. A direct answer is the negation of that second half, so it outranks the count.
        //
        // `downFacts` is deliberately NOT vetoed. A container the runtime reports as not running cannot
        // simultaneously be answering; if both appear, the exit is the newer and more decisive fact.
        if (downFacts.length || (!serviceAnswering && this.hasAuthoritativeEvidence(lifecycleFacts, facts))) {
            // The ACTION is unchanged and was never wrong — a stopped container is restarted either
            // way. What was missing is the CAUSE: a service that exhausted its declared V8 ceiling
            // recorded as a generic crash, so the ceiling was never implicated and the same abort
            // recurred indefinitely. That is why nothing looked broken from the outside.
            //
            // The reason narrows only on evidence that NAMES a heap — the strict fatal line on a
            // Node command. It is an attribution, not a candidate: when the log channel is open the
            // evidence is conclusive, and when it is not the reason simply stays generic rather
            // than asserting a weaker version of a claim nothing supports.
            const heapFact = downFacts.find(fact => fact.details?.heapExhaustion === true);

            return {
                recoveryClass: 'crash',
                actionClass  : CONTAINER_HEALTH_ACTION_CLASSES.restart,
                confidence   : downFacts.length ? 0.9 : 0.8,
                evidenceFacts: this.selectEvidenceFacts(facts, lifecycleFacts),
                // Only a numeric declared ceiling licenses the wording that implicates one. An
                // undeclared Node service still attributes the heap death — that population is
                // precisely where this class was first observed.
                reason       : heapFact
                    ? (Number.isFinite(heapFact.details.declaredHeapCeilingMb)
                        ? 'lifecycle-crash-heap-exhaustion-declared-ceiling'
                        : 'lifecycle-crash-heap-exhaustion')
                    : 'lifecycle-crash'
            };
        }

        const resourceFacts = facts.filter(fact =>
            fact.type === CONTAINER_HEALTH_FACT_TYPES.resourceSaturation ||
            fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation
        );
        // A store at its MEMORY ceiling is the one exhaustion case `throttle-shed` cannot serve: its
        // footprint tracks rows already persisted, so there is no arrival rate to reduce and a restart
        // frees nothing durable. Raising the ceiling is the only coherent heal, and the condition is
        // derived from the evidence's own `serviceKey` rather than a caller-supplied hint, so a
        // diagnosis cannot claim a class its facts do not support.
        //
        // Evaluated BEFORE `hasAuthoritativeEvidence` deliberately, and this is the half that made the
        // condition undiagnosable rather than merely mis-healed. That gate needs
        // `minAuthoritativeFacts` (2) corroborating facts, but a store crossing its ceiling saturates
        // memory while its CPU sits idle — measured live at `mem=81.40% cpu=0.00%` — so it produces
        // exactly ONE authoritative fact, forever. The floor suppressed the diagnosis entirely, which
        // is why a store at its ceiling never surfaced at all.
        //
        // Single-fact sufficiency is safe HERE and nowhere else: the floor exists to stop action on one
        // noisy signal, and a sustained-window ratio against a hard limit is not noisy. The window is
        // already the corroboration the second fact was standing in for, so requiring a second one asks
        // for a coincidence rather than evidence.
        //
        // Scoped to memory on purpose. CPU saturation on a store still routes through the normal
        // exhaustion path — more room for resident data does not relieve compute pressure.
        const storeMemoryFacts = resourceFacts.filter(fact =>
            fact.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation &&
            fact.authoritative &&
            isStoreBackedService(fact.serviceKey)
        );

        if (storeMemoryFacts.length > 0) {
            return {
                recoveryClass: 'exhaustion',
                actionClass  : CONTAINER_HEALTH_ACTION_CLASSES.raiseCeiling,
                confidence   : 0.8,
                evidenceFacts: this.selectEvidenceFacts(facts, storeMemoryFacts),
                reason       : 'store-ceiling-exhaustion'
            };
        }

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

        // LAST on purpose. The gap this closes is that a churning container produced NO diagnosis at
        // all — a plane at 977 restarts reported `healthy` with zero facts. It is not that some other
        // class was diagnosed wrongly, so this branch only ever speaks where nothing else did, and no
        // existing classification changes shape.
        //
        // The action class is `record`, never `restart`. ADR-0026 §2.5 already hard-transitions a // ticket-ref-ok: the envelope this classification must not contradict
        // rate-exhausted service to alarm-only; churn is that same situation occurring OUTSIDE our
        // envelope, driven by the runtime's own restart policy. Restarting a container that has
        // already restarted past the threshold is the one action its own history proves ineffective,
        // and AC-6's record-with-diagnosis is the correct terminal for a class we cannot heal.
        const churnFacts = facts.filter(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.restartChurn);
        if (churnFacts.length > 0) {
            return {
                // `ambiguous`, not a new class. `RECOVERY_CLASSES` is a frozen shared enum read by
                // seven consumers and persisted into heal-event records, and `taskOutcomeDiagnosis`
                // already established `ambiguous` as the record-never-auto-restart class for exactly
                // this reasoning: "blindly restarting a failed backup neither knows nor fixes the
                // cause." Restarting a container that has already restarted past the threshold is the
                // same move against the same logic. `crash` would be actively wrong — ADR-0026 §2.4's // ticket-ref-ok: names the mapping that makes `crash` unsafe here
                // reactive controller maps transient-crash to restart.
                recoveryClass: 'ambiguous',
                actionClass  : CONTAINER_HEALTH_ACTION_CLASSES.record,
                confidence   : 0.9,
                evidenceFacts: this.selectEvidenceFacts(facts, churnFacts),
                reason       : 'restart-churn-recorded'
            };
        }

        return null;
    }

    /**
     * Checks whether an authoritative primary fact crosses a configured corroboration path.
     * @param {Object[]} primaryFacts Primary candidate facts.
     * @param {Object[]} allFacts All collected facts.
     * @returns {Boolean}
     */
    hasAuthoritativeEvidence(primaryFacts, allFacts) {
        if (!primaryFacts.some(fact => fact.authoritative)) return false;

        return this.countAuthoritativeFacts(allFacts) >= this.configValues.minAuthoritativeFacts ||
            allFacts.some(fact => fact.type === CONTAINER_HEALTH_FACT_TYPES.endpointProbeFailed);
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
            targetIdentity: diagnosis?.targetIdentity || {kind: 'compose-service', id: serviceKey},
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

    /**
     * Resolves the diagnosis target without letting raw probe data bypass the target enum.
     * @param {Object} options
     * @returns {Object}
     */
    resolveDiagnosisTargetIdentity({serviceKey, classification}) {
        return classification?.targetIdentity || createRecoveryTargetIdentity({
            kind: 'compose-service',
            id  : serviceKey
        });
    }

    /**
     * Determines the provider-residency reason code that diagnostics can classify.
     * @param {Object} providerResidency Active-provider residency observation.
     * @returns {String|null}
     */
    getProviderResidencyReasonCode(providerResidency) {
        if (providerResidency.residentButNotServing === true) {
            return 'resident-not-serving';
        }
        if (toSafeArray(providerResidency.missingModels).length > 0) {
            return 'missing-required-model';
        }
        if (toSafeArray(providerResidency.insufficientContextModels).length > 0) {
            return 'insufficient-context';
        }
        if (toSafeArray(providerResidency.failedModels).length > 0) {
            return 'provider-warmup-failed';
        }
        if (providerResidency.supported === false) {
            return 'unsupported-provider';
        }
        if (providerResidency.probeFailed === true) {
            return 'provider-probe-failed';
        }
        if (providerResidency.ready === false) {
            return 'provider-not-ready';
        }
        if (toSafeArray(providerResidency.extraModels).length > 0) {
            return 'extra-residents';
        }

        return null;
    }

    /**
     * Checks whether a provider-residency fact should page instead of looping recovery.
     * @param {Object} fact Diagnosis fact.
     * @returns {Boolean}
     */
    isProviderResidencyConfigDrift(fact) {
        return fact.type === CONTAINER_HEALTH_FACT_TYPES.providerResidency && [
            'insufficient-context',
            'provider-not-ready',
            'provider-warmup-failed',
            'unsupported-provider'
        ].includes(fact.details?.reasonCode);
    }

    /**
     * Checks whether a provider-residency fact should first restore the active role set.
     * @param {Object} fact Diagnosis fact.
     * @returns {Boolean}
     */
    isProviderRoleResidencyRecoverable(fact) {
        return fact.type === CONTAINER_HEALTH_FACT_TYPES.providerResidency &&
            fact.details?.reasonCode === 'missing-required-model';
    }

    /**
     * Checks whether a provider-residency fact proves a resident-but-not-serving fault.
     * @param {Object} fact Diagnosis fact.
     * @returns {Boolean}
     */
    isProviderResidentButNotServing(fact) {
        return fact.type === CONTAINER_HEALTH_FACT_TYPES.providerResidency &&
            fact.details?.reasonCode === 'resident-not-serving';
    }

    /**
     * Reads and validates a provider fact target identity.
     * @param {Object|null} targetIdentity Target identity candidate.
     * @returns {Object|null}
     */
    readProviderTargetIdentity(targetIdentity) {
        if (!targetIdentity || typeof targetIdentity !== 'object') return null;

        try {
            return createRecoveryTargetIdentity(targetIdentity);
        } catch {
            return null;
        }
    }

    /**
     * Resolves the first typed provider fact target identity.
     * @param {Object} fact Diagnosis fact.
     * @returns {Object|null}
     */
    resolveProviderFactTargetIdentity(fact) {
        if (!fact) return null;

        return this.readProviderTargetIdentity(fact.details?.targetIdentity);
    }
}

/**
 * @summary Evaluates recent restart churn for one container generation.
 *
 * **Why this is not a healthcheck.** A Docker healthcheck evaluates the *current incarnation*, and
 * during a restart loop every incarnation is genuinely alive — a plane observed at 977 restarts was
 * reporting `running` and `healthy` with a 28-second-old process. No point-in-time probe of any kind
 * can express churn, because churn is a property *across* incarnations. That is why this reads a
 * counter against a persisted baseline instead.
 *
 * **Generation semantics.** `RestartCount` is per container and resets when a container is recreated,
 * so the baseline is keyed to the container id. A recreate starts a new generation and reports no
 * churn — which is correct, and is also what stops a deploy from looking like a fault. The inverse
 * matters just as much: without the id key, a stale baseline from a previous container would make a
 * healthy new one look like it had churned the moment it started.
 *
 * **Planned restarts are subtracted, not detected.** A lifecycle `restart` action increments the same
 * container's count legitimately. This function cannot tell an actuator-initiated restart from a
 * crash, so the caller passes how many it caused. Guessing here would produce exactly the false
 * positive that retires a signal: an alarm that fires on every deploy is disabled within a week, and
 * then the blind spot is back with an alarm on top of it.
 *
 * @param {Object} options
 * @param {Object} [options.inspect] Docker inspect payload.
 * @param {Object} [options.baseline] Prior `{containerId, restartCount, observedAt}`, or null on first look.
 * @param {Number} [options.plannedRestarts] Restarts the caller itself initiated since the baseline.
 * @param {Number} [options.threshold] Restarts within the window before churn is reported.
 * @param {Number} [options.windowMs] Window length.
 * @param {Number} [options.observedAt] Observation timestamp.
 * @returns {Object} `{churning, unplannedRestarts, elapsedMs, generationReset, readable, nextBaseline}`
 */
export function evaluateRestartChurn({
    inspect,
    baseline = null,
    plannedRestarts = 0,
    threshold = DEFAULT_CONTAINER_HEALTH_DIAGNOSIS_CONFIG.restartChurnThreshold,
    windowMs = DEFAULT_CONTAINER_HEALTH_DIAGNOSIS_CONFIG.restartChurnWindowMs,
    observedAt = Date.now()
} = {}) {
    const containerId  = typeof inspect?.Id === 'string' ? inspect.Id : null,
          restartCount = Number.isFinite(inspect?.RestartCount) ? inspect.RestartCount : null,
          unreadable   = {churning: false, elapsedMs: 0, generationReset: false, nextBaseline: baseline, readable: false, unplannedRestarts: 0};

    // An unreadable inspect is unknown, never "no churn" — the caller routes it to the existing
    // runtime-read-failed path rather than letting absence read as health.
    if (!containerId || restartCount === null) return unreadable;

    const nextBaseline = {containerId, observedAt, restartCount};

    // A new generation: adopt it as the baseline and report nothing. There is no history to compare
    // against yet, and the recreate that produced it is the most common reason to be here.
    if (!baseline || baseline.containerId !== containerId) {
        return {churning: false, elapsedMs: 0, generationReset: true, nextBaseline, readable: true, unplannedRestarts: 0};
    }

    const elapsedMs = observedAt - baseline.observedAt;

    // Past the window, re-anchor. Churn is a rate, so an old baseline would let long-ago restarts
    // accumulate into a verdict about today.
    if (elapsedMs > windowMs) {
        return {churning: false, elapsedMs, generationReset: false, nextBaseline, readable: true, unplannedRestarts: 0};
    }

    const observed          = Math.max(0, restartCount - baseline.restartCount),
          unplannedRestarts = Math.max(0, observed - Math.max(0, plannedRestarts));

    return {
        churning       : unplannedRestarts >= threshold,
        elapsedMs,
        generationReset: false,
        // Hold the baseline inside the window so restarts accumulate against a fixed anchor.
        // Re-anchoring on every observation would reset the count faster than it could ever reach
        // the threshold, and the check would be green forever.
        nextBaseline: baseline,
        readable    : true,
        unplannedRestarts
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

/**
 * @summary Attributes a container death to V8 heap exhaustion from evidence that NAMES a heap.
 *
 * Two observations, both already produced by `DeploymentStateBridgeService` from the same
 * `Config.Cmd` and the same allowlisted log read — this re-derives neither:
 *
 * - **the strict fatal line** (`HEAP_FATAL_LINE`) — the only evidence that says *heap*;
 * - **`nodeCommand`** — whether the process had a V8 heap to exhaust at all.
 *
 * Both are required. The line alone would attribute a tail that captured another container's
 * output, or a service that merely logs the phrase; `nodeCommand` alone says nothing about how the
 * process died.
 *
 * **`declaredHeapCeilingMb` is deliberately NOT part of the discriminator.** A missing
 * `--max-old-space-size` proves the ceiling is UNDECLARED, never that the process is non-Node — and
 * undeclared-Node is exactly the population the originating incident came from, so scoping to the
 * ceiling would blind this to the case it exists for. The ceiling is a supporting fact that
 * licenses stronger *wording*, never the attribution itself.
 *
 * Tri-state, and `null` is load-bearing: logs disabled, an unreadable command, or a divergent
 * command means the question was never asked, which must read as absence of signal rather than as a
 * negative. `unavailableReason` travels with it so a reader can tell a disabled channel from a
 * non-heap death — the two are opposite facts that a bare `false` would merge.
 * @param {Object} options
 * @param {Object|null} options.logs Bounded log summary (`{text, truncated, incarnationBounded, …}`) from the bridge. `incarnationBounded` must be `true` before a match may attribute.
 * @param {Boolean|null} options.nodeCommand Whether `Config.Cmd` invoked Node.
 * @param {Number|null} [options.declaredHeapCeilingMb=null] Declared ceiling, when observable.
 * @param {Boolean|null} [options.oomKilled=null] Whether the kernel reclaimed the container.
 * @returns {Object} `{heapExhaustion, unavailableReason, declaredHeapCeilingMb}`
 */
export function classifyHeapExhaustion({logs, nodeCommand, declaredHeapCeilingMb = null, oomKilled = null}) {
    const unavailable = reason => ({
        declaredHeapCeilingMb: null,
        heapExhaustion       : null,
        unavailableReason    : reason
    });

    // The command decides whether the question is even meaningful, so an unreadable one cannot
    // produce a negative — a non-Node VERDICT and an unread command are different facts.
    if (nodeCommand === null || nodeCommand === undefined) return unavailable('command-unreadable');

    if (nodeCommand === false) {
        return {
            declaredHeapCeilingMb: null,
            // A positive negative: the process had no V8 heap, so it cannot have exhausted one.
            heapExhaustion   : false,
            unavailableReason: null
        }
    }

    if (!logs || typeof logs.text !== 'string') return unavailable('logs-unavailable');

    const matched = HEAP_FATAL_LINE.test(logs.text);

    // The kernel and V8 are making CONTRADICTORY claims about the same death, and this payload
    // cannot adjudicate: either V8 exhausted its heap and the container was reaped afterwards, or
    // the cgroup killed a container whose log slice still carries an older fatal line. Recording
    // `oomKilled` beside a confident heap verdict would publish the contradiction as agreement, so
    // an unresolvable conflict is absence of signal — never the weaker of the two answers.
    if (matched && oomKilled === true) return unavailable('evidence-conflict');

    // A truncated tail that does NOT match cannot distinguish "no heap death" from "the line fell
    // outside the window", so it must not answer. A truncated tail that DOES match is conclusive —
    // truncation cannot manufacture the line.
    if (!matched && logs.truncated === true) return unavailable('log-tail-truncated');

    // The Docker log stream spans RESTARTS. An unbounded slice can therefore carry a fatal line from
    // an earlier incarnation above a healthy boot above an unrelated current crash, and a match
    // anywhere in it would name the wrong cause with full confidence — the same
    // wider-than-the-thing-it-names defect this diagnosis path exists to remove, one layer down.
    //
    // So a match only attributes when the producer states the slice belongs to the stopped run.
    // Until it does, this refuses rather than guesses: a matching line that cannot be proven to
    // belong to this incarnation is unavailable evidence, never a weaker heap verdict.
    if (matched && logs.incarnationBounded !== true) return unavailable('log-incarnation-unbounded');

    return {
        // Only a numeric ceiling licenses wording that implicates a DECLARED ceiling; an undeclared
        // Node service still attributes, without claiming a bound it never had.
        declaredHeapCeilingMb: matched && Number.isFinite(declaredHeapCeilingMb) ? declaredHeapCeilingMb : null,
        heapExhaustion       : matched,
        unavailableReason    : null
    }
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

/**
 * @summary The saturation-SUBJECT rule, stated once for both metrics because they disagreed silently.
 *
 * A container ratio answers *"how busy is this container?"*. A fact keyed to a `serviceKey` asserts
 * *"this service is saturated."* Those are different subjects whenever a container runs work that is
 * not the service's own — and a Node service that forks a scheduled job is exactly that.
 *
 * **The rule, identical for both metrics:** the container ratio is a legitimate numerator for a claim
 * about the service **only when every process in the container belongs to the service's own
 * workload**. For anything else the number is real and its subject is wrong.
 *
 * **`nodeCommand === false` is the gate, and it is a PROXY for that rule rather than proof of it.**
 * `isNodeCommand` is a regex over `Config.Cmd`, so it establishes that the command carries no `node`
 * token and nothing whatsoever about how many processes run. Its own docblock says as much — the
 * command is *"a proxy for runtime … and then it holds silently and wrongly"*. **An earlier revision
 * of this block claimed `nodeCommand === false` establishes that the container "has no other processes
 * to aggregate"; that is false and is retired here.** Three observations, ordered by what they cost —
 * the first falsifies the premise, the third shows it losing money:
 *
 * - **A non-Node container can be multi-process at rest.** `chroma` runs `["run", "/config.yaml"]` and
 *   hosts `dumb-init` **plus** `chroma`. The shim sits at 0.0 %, so it falsifies the premise without
 *   demonstrating misattribution — the cheap proof, not the costly case.
 * - **The proxy holds only where it is irrelevant.** The containerized model service is single-process
 *   while idle and spawns a CPU-dominating runner under load — four cores' worth, sustained, with no
 *   client sockets left open. It satisfies the premise exactly when no CPU fact can fire, and violates
 *   it exactly when one can.
 * - **And an unaccounted CPU claim is real on this arm, not merely possible.** A CPU-only deployment
 *   was measured holding `cpuPercent: 399.4` on that container while its access log over the sampled
 *   window carried **only** health polling — `/api/ps`, `/api/tags`, `HEAD /` — and no inference
 *   endpoint at all. **`authoritative: true` was granted throughout.** The scheduled-job case that
 *   motivated the CPU slice was a *foreign* workload sharing a container; this is the service's own
 *   process doing work no client awaits. **The non-Node arm carries this gap unrepaired**, because
 *   closing it needs a per-process CPU reading that no producer in the tree emits, and inventing a
 *   second proxy to fix the first is how this defect was built.
 *
 * **THREE AXES, and collapsing any two of them is how the previous revision of this block went wrong.**
 * The receipt above answers the third question and was read as answering the first:
 *
 * 1. **Observation subject — always exact.** The Docker ratio describes the resolved container, and
 *    `DeploymentRuntimeAccessService` verifies its `com.docker.compose.service` label before acting.
 *    There is no ambiguity here and never was.
 * 2. **Work ownership — who the running process belongs to.** A runner spawned by the model server is
 *    that Compose service's **own** process. It does not become foreign because nobody is waiting for
 *    it. A forked scheduled job in a Node service is the genuinely foreign case, and it is a different
 *    thing entirely.
 * 3. **Demand disposition — whether current work is accounted for.** Accounted, residual after a client
 *    disconnect, stale, or unknown.
 *
 * *"No inference arrived in the sampled window"* answers **3** only. An earlier revision concluded from
 * it that the container-wide figure *"spoke for neither"* the service nor the runner — collapsing 3
 * into 1. It does not follow, and it is retired here: the subject was correct throughout. What the
 * receipt establishes is **unexplained residual provider demand owned by that service**, which is a
 * disposition problem, not an attribution one. That distinction decides the repair: a residual-demand
 * problem is answered by accounting, and only an ownership problem would need process cardinality.
 *
 * **One residual-demand specimen has been observed, and its bounds are the point.** Two facts, kept
 * separate because merging them is how this paragraph previously overstated itself:
 *
 * - **Source, at tag `v0.23.1`:** the log line `"aborting embedding request due to client closing the
 *   connection"` is emitted only where the admission semaphore acquire is cancelled — it is a
 *   **pre-admission** signal. So that line's presence says nothing about admitted work either way.
 * - **Observation, once:** an admitted request completed after 1h6m and then failed to write its reply
 *   (`broken pipe`), meaning the reply socket was closed by then. **The disconnect point was not
 *   observed** — only that the request ran to completion and had no reader at the end.
 *
 * Together those establish that **a service-owned process can burn cores with no arriving traffic** —
 * axis 2 owned, axis 3 residual, the shape this block describes. They do **not** establish a universal
 * rule that admitted work always survives a disconnect, and an earlier revision of this paragraph
 * asserted exactly that from the source read alone; it is retired here. Nor does any of it establish
 * the origin of the historical 399.4% specimen above, which was a different plane on a different day
 * and stays bounded as recorded.
 *
 * **Latent, with no live instance:** `commandText` reads `Config.Cmd` and never `Config.Entrypoint`, so
 * a Node service whose `node` token sits in the entrypoint would read `false` — gaining container
 * authority and losing heap observation in one step. Every service on the canonical plane was checked;
 * all four Node services carry the token in `Config.Cmd`. Recorded because the layout invites one.
 *
 * **Retirement trigger, corrected.** An earlier revision promised that the residual-load lane would
 * supply runner/process-cardinality evidence and retire this proxy. It did not, and could not: what
 * shipped is exact-container CPU bound to one incarnation, expected-model residency, recorder-owned
 * provider activity, and a last-boundary demand veto — all of which sharpen **disposition** (axis 3)
 * and none of which attribute CPU to a process. **This proxy is therefore retired only by a
 * process-scoped CPU producer** — a per-process reading beside the existing `processHeapObservation`
 * channel, which today publishes `rssBytes` and V8 fields and nothing about CPU time. Until such a
 * producer exists, the gate stays a proxy and this paragraph stays with it.
 * @see https://github.com/neomjs/neo/issues/16830 — the residual-demand lane; sharpens disposition, not attribution
 * @see https://github.com/neomjs/neo/issues/16877 — the proxy fold
 * @see https://github.com/neomjs/neo/issues/16886 — the three-axis separation
 *
 * **Where they deliberately differ, and why — this is the part that must stay written down together:**
 *
 * - **Memory** has somewhere else to go. The heap-observation channel publishes a subject-scoped
 *   reading, so `resolveMemorySaturationScope` can *change numerator*, and when it cannot it emits
 *   **nothing** — a fallback would re-create the cross-scope pair the slice removed, on precisely the
 *   path where the channel is broken.
 * - **CPU has no equivalent.** `processHeapObservation` publishes `rssBytes` and V8 heap fields and
 *   nothing about CPU time; no producer in the tree emits a process-scoped CPU reading. So CPU cannot
 *   change numerator, and its choice is a *disposition*: emit the container number **non-authoritatively**.
 *   Container pressure is worth an operator seeing, there is no competing subject-scoped CPU fact for
 *   it to be confused with, and removing the **authority** removes the defect while removing the
 *   **signal** would cost real observability for nothing.
 *
 * These two paragraphs are co-located on purpose. The divergence above was previously implicit — the
 * memory path grew a subject check and CPU kept the container ratio four lines away, with nothing
 * between them saying so, and it took an unrelated observation on a live plane to surface it. A
 * layout that needs an accident to reveal a contradiction is the defect; consistency achieved in two
 * places that never reference each other is not consistency.
 */

/**
 * Which memory a `memory-saturation` percent describes. Published on the fact because the two are
 * different quantities that both read as "memory 91%".
 * @type {Object}
 */
export const MEMORY_SATURATION_SCOPES = Object.freeze({
    container  : 'container',
    heap       : 'heap',
    unavailable: 'unavailable'
});

/**
 * Which CPU a `resource-saturation` percent describes — the sibling of {@link MEMORY_SATURATION_SCOPES}.
 *
 * - **`container`** — the container is the subject. Its ratio describes the service, and the fact is
 *   authoritative.
 * - **`unattributable`** — the container may aggregate processes beyond the service (a Node service
 *   that forks, or a service whose identity could not be read). The number is still reported, and it
 *   is **not** authoritative.
 * @type {Object}
 */
export const CPU_SATURATION_SCOPES = Object.freeze({
    container     : 'container',
    unattributable: 'unattributable'
});

/**
 * @summary Decides whether a container CPU ratio may speak for the service it is keyed to.
 *
 * Mirrors `resolveMemorySaturationScope`'s gate deliberately: **`nodeCommand === false` is the ONLY
 * thing that licenses the container ratio.** An absent or unreadable identity resolves to
 * `unattributable` rather than to `container` — an unknown service must not be able to manufacture an
 * authoritative fact, which is the failure the memory path already paid for once.
 *
 * @param {Object} options
 * @param {Boolean|null} [options.nodeCommand] Whether the container's `Config.Cmd` is Node.
 * @returns {{scope: String, authoritative: Boolean, reason: String|null}}
 */
export function resolveCpuSaturationScope({nodeCommand} = {}) {
    if (nodeCommand === false) {
        return {scope: CPU_SATURATION_SCOPES.container, authoritative: true, reason: null};
    }

    return {
        scope        : CPU_SATURATION_SCOPES.unattributable,
        authoritative: false,
        reason       : nodeCommand === true
            ? 'node-service-may-fork'
            : 'service-identity-unknown'
    }
}

/**
 * @summary Decides which numerator this service's memory saturation may legitimately use.
 *
 * **Identity and measurement are separate axes, and only one of them is the envelope's.**
 *
 * - **Identity** — whether this service may use the container ratio at all — comes from the live
 *   `nodeCommand` read, never from the envelope. An envelope's `not-node` was a *refusal* gate, not a
 *   positive classification, so consuming it as identity let an unreadable inspect manufacture an
 *   authoritative container-scoped fact. Detail and both falsifiers in the `container` bullet below.
 * - **Measurement** — the V8 numbers themselves — comes from the envelope on each stats sample,
 *   captured at the same instant as the container reading it is paired with.
 *
 * An earlier revision of this docblock said scope was *"read from the observation envelope, not from
 * a roster"*, on the reasoning that re-deriving Node-ness here would create a second definition that
 * could drift. That premise was retired when identity moved to the live read: there is no second definition, because
 * identity has exactly one source — `nodeCommand` — and the envelope never carried it.
 *
 * Three outcomes, and the third is the point of the slice:
 *
 * - **`container`** — licensed by **`nodeCommand === false` and nothing else**. Container usage over
 *   the container limit is the honest measure of container pressure for a genuinely non-Node service,
 *   and nothing about this slice changes them. `chroma` is the live example.
 *
 *   **The envelope deliberately does not count here, even when every envelope in the window says
 *   `not-node`.** Two independent reasons, both found by falsifier rather than by reading:
 *
 *   1. The producer's `not-node` was never the positive classification it looked like — its gate was
 *      `nodeCommand !== true`, so an UNREADABLE inspect refused with the same word as a genuine
 *      non-Node service. Consuming that as authority let an unknown identity manufacture an
 *      authoritative container-scoped fact, and with a CPU fact alongside it reached
 *      `diagnosed → throttle-shed` while inspect itself was unreadable. The producer now distinguishes
 *      `identity-unknown`, and this consumer deliberately does **not** depend on that distinction being
 *      right — which is the more durable half of the repair.
 *   2. Envelopes ride on **retained** samples; `nodeCommand` is read live per collection. A window held
 *      from earlier collections can therefore carry an all-`not-node` set while the current
 *      `nodeCommand` reads `true`, letting a stale classification silently outvote a live one.
 * - **`heap`** — a Node service with a usable V8 reading on **every** sample in the window
 *   (`usable.length === samples.length`). Old-generation usage over the declared ceiling.
 *
 *   **Full coverage or nothing**, and the partial case is the reason: a window with one usable
 *   reading and one hole is not a weaker heap signal, it is a *different* window than the one the
 *   count floor was calibrated against. Admitting it would let a single sample clear a floor meant
 *   for the full set.
 * - **`unavailable`** — a Node service **without** full coverage: no usable reading at all, or some
 *   but not all — channel disabled, stale, skewed, identity-mismatched, an undeclared ceiling, or
 *   simply not deployed yet. **No fact is emitted.**
 *   Falling back to the container ratio here would reinstate exactly the cross-scope pair this slice
 *   removes, and would do it silently on the path where the heap channel is broken — which is the
 *   moment the number is least trustworthy and most likely to be believed.
 *
 * @param {Object}         options
 * @param {Object[]}       options.samples Stats samples, each optionally carrying `heapObservation`.
 * @param {Boolean|null}   options.nodeCommand Live per-collection identity read. **The sole authority
 *     for the `container` scope**: only an explicit `false` licenses the container ratio. `true` and
 *     `null` both route to `heap`/`unavailable`, because "not Node" and "could not tell" must not
 *     collapse into one answer — that collapse is the defect this parameter exists to prevent.
 * @returns {Object} `{scope, percents, timestamps, unavailableReason}` — all four keys on every
 *     branch, never a scope-dependent shape, so a consumer reads `scope` to know which fields carry
 *     meaning instead of testing for a key's presence. `percents` and `timestamps` are populated only
 *     for `heap`; `unavailableReason` only for `unavailable`.
 *
 *     **`timestamps` is not a convenience copy of the sample times**, and that is why it has to be
 *     returned rather than re-derived. These are the SUBJECT's own `observedAt` stamps; the caller
 *     measures the heap window from them precisely because the poll clock and the reporter's clock
 *     tick independently. Substituting `samples[].observedAtMs` here looks equivalent and is the
 *     observer's-clock defect described above. `unavailableReason` is consumer-visible output, not an
 *     internal diagnostic: it is published verbatim in the `heap-observation-unavailable` fact, where
 *     it is the field that names which repair is owed.
 */
function resolveMemorySaturationScope({samples, nodeCommand}) {
    const
        envelopes = samples.map(sample => sample?.heapObservation).filter(Boolean),
        // **`nodeCommand === false` is the ONLY thing that licenses the container ratio**, and the
        // envelope deliberately does not count — even when every envelope in the window says
        // `not-node`.
        //
        // Two reasons, both found by falsifier rather than by reading:
        //
        // 1. The producer's `not-node` was not the positive classification it looked like. Its gate
        //    is `nodeCommand !== true`, so an UNKNOWN identity — an unreadable inspect — refused with
        //    the same word as a genuine non-Node service. Consuming it as authority let an unknown
        //    service manufacture an authoritative container-scoped `memory-saturation`, and with a
        //    CPU fact alongside it reached `diagnosed → throttle-shed` while inspect was unreadable.
        //    The producer now distinguishes `identity-unknown`; this consumer no longer depends on
        //    that distinction being right, which is the more durable half of the fix.
        // 2. Envelopes ride on RETAINED samples. A window held from earlier collections could carry
        //    an all-`not-node` set while the current `nodeCommand` reads `true` — a stale classification
        //    silently outvoting a live one.
        //
        // An ABSENT envelope is evidence of nothing, and so is a refusal: neither can establish that
        // a service has no heap. Only the direct `Config.Cmd` reading can.
        explicitlyNotNode = nodeCommand === false;

    if (explicitlyNotNode) {
        return {scope: MEMORY_SATURATION_SCOPES.container, percents: [], timestamps: [], unavailableReason: null};
    }

    // Node, or unclassifiable. Both require a heap window; an unclassifiable service must not get a
    // cross-scope ratio, because that would be a guess with a number attached.
    const
        // Per sample, not per envelope: a sample with no envelope is a HOLE in the window, and the
        // distinction is lost if absent envelopes are filtered away before counting.
        readings = samples.map(sample => {
            const envelope = sample?.heapObservation;

            // `status: 'available'` means the read was recent enough to describe the service;
            // `pairable` means it is close enough to the container sample to enter arithmetic. The
            // bridge publishes them separately because they answer different questions, and consuming
            // only the first promotes a reading into stronger evidence than its source licensed.
            if (!envelope || envelope.status !== 'available' || envelope.pairable !== true) {
                return null;
            }

            const
                percent = calculateHeapSaturationPercent(envelope.observation),
                // The SUBJECT's own measurement time, never this collection's. Stamping a self-report
                // with the observer's clock let one dead process's single record, re-read at two
                // polls 45 s apart, claim a 45-second sustained window — a critical fact synthesised
                // from the observer's clock while the subject stood still. That is the exact failure
                // this channel exists to make impossible: a sick process does not report a bad
                // number, it stops reporting.
                stamp   = envelope.observation?.observedAt;

            return Number.isFinite(percent) && Number.isFinite(stamp) ? {percent, stamp} : null;
        }),
        usable = readings.filter(Boolean);

    // FULL coverage or nothing. A window with one usable reading and one hole is not a weaker
    // measurement of the same thing — it is an unmeasured span, and it previously selected `heap`
    // scope, failed the count floor, and emitted no fact at all, which published `healthy`.
    if (usable.length === 0 || usable.length !== samples.length) {
        return {
            scope     : MEMORY_SATURATION_SCOPES.unavailable,
            percents  : [],
            timestamps: [],
            // Names which repair is owed. A partially covered window is its own case: the channel is
            // working and something interrupted it, which reads very differently from never having
            // heard from the service at all.
            unavailableReason: usable.length > 0
                ? 'partial-window'
                : envelopes.map(envelope => envelope.unavailableReason).filter(Boolean).pop() ||
                  (envelopes.length > 0 ? 'unpairable' : 'not-deployed')
        };
    }

    return {
        scope            : MEMORY_SATURATION_SCOPES.heap,
        percents         : usable.map(reading => reading.percent),
        timestamps       : usable.map(reading => reading.stamp),
        unavailableReason: null
    };
}

/**
 * @summary Old-generation usage against the ceiling the process was DECLARED with — the ratio a Node
 * service actually dies on.
 *
 * **Both terms are moved, not just made more precise.** `calculateDockerMemoryPercent` above pairs
 * container usage with the container limit; that pair is honest about container pressure and says
 * nothing about a heap. Using it to anticipate a heap death is a cross-scope ratio: the process aborts
 * when V8 old space reaches `--max-old-space-size`, while container usage at that instant is the
 * ceiling *plus* young generation, native allocations, the binary and off-heap `Buffer`s. Measured on
 * this deployment, a 768 MiB ceiling under a 1 GiB limit at a 90% threshold means the container fact
 * can only fire first if that non-heap remainder reaches **153.6 MiB and sustains** — so the detector's
 * sensitivity to a heap death is a function of NON-heap memory. It protects a bloated service and
 * misses a lean one. That inversion is why the numerator had to change scope rather than the threshold
 * change value.
 *
 * **The denominator is the DECLARED ceiling and never `heapSizeLimitBytes`.** The reported limit is the
 * obvious V8-scoped candidate and it is a trap that would reproduce this defect one layer in, wearing a
 * V8-scoped name: it sits **above** the declaration by exactly `3 × max-semi-space-size`, and V8 sizes
 * the semi-space from the memory limit it detects at startup — `+3 / +48 / +96 / +192` MiB at a
 * 512m / 1g / 2g / 4g cgroup, saturating. At the shipped configuration that is 816 against a declared
 * 768: a 6.25% overstatement of headroom the process does not have. The offset cannot be corrected for,
 * because it is a stepped function of a limit this code neither sets nor reads.
 *
 * **Fail-closed on anything but a declared ceiling.** `undeclared` and `ambiguous` both yield `null`
 * rather than a substituted bound: a process with no observable declaration has no denominator, and
 * inventing one would put a number nobody measured inside the evidence a heal decision reads. `null`
 * means "not computable here", never "healthy" — the caller must not coerce it.
 *
 * @param {Object|null} observation A `process-heap-observation` record's `observation` payload.
 * @returns {Number|null} Percent of the declared old-generation ceiling in use, or `null`.
 */
export function calculateHeapSaturationPercent(observation) {
    if (!observation || observation.state !== 'observed' || observation.ceilingState !== 'declared') {
        return null;
    }

    const
        // Old generation ONLY. `usedHeapBytes` folds in the young generation, which is collected on a
        // different cadence and bounded by a different flag, so it would move the numerator for
        // reasons unrelated to the exhaustion this ratio exists to anticipate.
        usedBytes    = Number(observation.oldGenerationUsedBytes),
        ceilingBytes = Number(observation.declaredCeilingBytes);

    if (!Number.isFinite(usedBytes) || !Number.isFinite(ceilingBytes) || usedBytes < 0 || ceilingBytes <= 0) {
        return null;
    }

    return (usedBytes / ceilingBytes) * 100;
}

function normalizeStatsSamples({stats, statsSamples}) {
    if (Array.isArray(statsSamples)) {
        return statsSamples.filter(sample => sample && typeof sample === 'object');
    }

    return stats && typeof stats === 'object' ? [stats] : [];
}

/**
 * @summary Summarizes a sample window, requiring a MEASURED elapsed span rather than a sample count.
 *
 * This previously took no timestamps: `sustained` was `every(value >= threshold)` gated only on how
 * MANY samples arrived, while the emitted evidence stamped `sampleWindowMs` from config as though it
 * had been observed. Two samples collected milliseconds apart therefore satisfied a "sustained
 * 30-second window" and the fact said so.
 *
 * That matters beyond tidiness because single-fact sufficiency for a store's memory saturation is
 * justified by the window doing the corroboration a second fact would otherwise provide. An
 * unenforced window cannot discharge that argument — the reasoning was sound and the implementation
 * had not earned it.
 *
 * @param {Object}   options
 * @param {Number[]} options.values Metric percentages, one per sample.
 * @param {Number}   options.threshold Percentage every sample must meet.
 * @param {Number}   options.expectedCount Sample count floor.
 * @param {Number[]} [options.timestamps=[]] Per-sample observation times in epoch ms. Absent or
 *     single-valued yields a zero span, which cannot satisfy a positive `minWindowMs` — unstamped
 *     samples fail closed rather than inheriting a window they never demonstrated.
 * @param {Number}   [options.minWindowMs=0] Minimum measured span. `0` preserves count-only
 *     behaviour for callers that have no temporal claim to make.
 * @returns {Object} `{sustained, min, max, mean, observedWindowMs}` — the span is returned so the
 *     caller reports what was measured instead of what was configured.
 */
function summarizeSustainedWindow({values, threshold, expectedCount, timestamps = [], minWindowMs = 0}) {
    if (values.length < expectedCount || values.length === 0) {
        return {sustained: false, min: null, max: null, mean: null, observedWindowMs: null};
    }

    const finiteStamps = timestamps.filter(Number.isFinite);

    // A span needs two distinct observations. One stamp (or none) is zero elapsed time, not an
    // unknown one, so it must not pass a positive floor.
    const observedWindowMs = finiteStamps.length > 1
        ? Math.max(...finiteStamps) - Math.min(...finiteStamps)
        : 0;

    // FULL coverage, not merely two stamps. Filtering non-finite entries out silently narrowed the
    // claim: three values carrying two stamps 30s apart produced `observedWindowMs = 30000` and
    // passed a 30s floor, while the third sample was never timed at all. The span was then asserted
    // over samples no clock had witnessed — the same defect this window was added to close, one
    // level in. A partial-coverage span is UNKNOWN, and an unknown span cannot satisfy a floor.
    const stampCoverage = finiteStamps.length / values.length;

    // `minWindowMs <= 0` keeps the count-only semantics unstamped callers rely on, so the coverage
    // requirement binds exactly where a temporal claim is actually being made.
    const windowSatisfied = minWindowMs <= 0
        ? true
        : stampCoverage === 1 && observedWindowMs >= minWindowMs;

    const
        min  = Math.min(...values),
        max  = Math.max(...values),
        mean = values.reduce((sum, value) => sum + value, 0) / values.length;

    return {
        sustained: values.every(value => value >= threshold) && windowSatisfied,
        min      : roundMetric(min),
        max      : roundMetric(max),
        mean     : roundMetric(mean),
        observedWindowMs,
        // Reported so a fact can say WHY a window failed: an under-length span and a partially
        // stamped one are different conditions, and collapsing them would make the next diagnosis
        // of this exact bug start from scratch.
        stampCoverage: roundMetric(stampCoverage)
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

function toSafeArray(value) {
    return Array.isArray(value)
        ? value.map(item => toSafeScalar(item)).filter(item => item !== null)
        : [];
}

function toSafeObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toSafeScalar(item)]));
}

function toSafeNumber(value) {
    return Number.isFinite(value) ? value : null;
}

export default Neo.setupClass(ContainerHealthDiagnosisService);
