/**
 * @module ai/scripts/benchmark/helpers/targetSetMeasurementCore
 * @summary Pure contract and aggregation core for the disposable
 * `restore-empty-target` target-set meter.
 *
 * The privileged recovery operation is deliberately absent. Callers inject an
 * adapter and feed its progress, batch, provider-trace, and resource receipts
 * into `TargetSetMeasurementRecorder`. This keeps the meter in the observation
 * world while the injected recovery action remains the sole mutation owner.
 *
 * The report refuses three common forms of success theatre:
 *
 * - a completed run must observe every canonical target-set phase in order;
 * - a fixture receipt must name exact memories, summaries, graph, and vector
 *   cardinalities;
 * - synthetic controls remain non-authoritative even when every assertion is
 *   green.
 *
 * @see learn/agentos/decisions/0027-autonomous-data-recovery-actuator.md
 * @see https://github.com/neomjs/neo/issues/15695
 * @see https://github.com/neomjs/neo/issues/15740
 * @plane in-plane
 */

/**
 * The action phases whose individual cost the target-set meter measures.
 * @type {ReadonlyArray<String>}
 */
export const TARGET_SET_PHASES = Object.freeze([
    'admission',
    'stage-memories',
    'stage-summaries',
    'stage-graph',
    'validate-staged-target-set',
    'promote-memories',
    'promote-summaries',
    'promote-graph',
    'revalidate-production',
    'terminal-settlement'
]);

/**
 * The two authoritative scale profiles. Graph cardinality is intentionally
 * constant across profiles: a 64-node / 63-edge deterministic chain is large
 * enough to exercise both graph record types while keeping graph cost fixed as
 * the vector axis moves 5k → 20k. It is an instrumentation topology, not a
 * claim about production graph density, and avoids a fabricated one-to-one
 * relationship between graph and vector rows.
 * @type {Readonly<Object>}
 */
export const TARGET_SET_PROFILES = Object.freeze({
    '5k-target-set': Object.freeze({
        graphEdges: 63,
        graphNodes: 64,
        memories  : 5000,
        summaries : 5000
    }),
    '20k-target-set': Object.freeze({
        graphEdges: 63,
        graphNodes: 64,
        memories  : 20000,
        summaries : 20000
    })
});

/**
 * Synthetic control shapes supported by the disposable runner.
 * @type {ReadonlyArray<String>}
 */
export const TARGET_SET_CONTROL_SCENARIOS = Object.freeze([
    'full',
    'interrupt-pre-promotion',
    'reconcile-after-memories'
]);

const
    EVIDENCE_CLASSES = Object.freeze(['exact-head-candidate', 'synthetic-control']),
    TERMINAL_PHASE   = 'terminal-settlement';

/**
 * @summary Resolves one fixed scale profile without exposing the frozen source
 * object to mutation.
 *
 * @param {String} name Profile name.
 * @returns {{graphEdges: Number, graphNodes: Number, memories: Number, name: String, summaries: Number}}
 * @throws {Error} When the profile name is unknown.
 */
export function resolveTargetSetProfile(name) {
    const profile = TARGET_SET_PROFILES[name];

    if (!profile) {
        throw new Error(`Unknown target-set profile "${name}". Expected one of: ${Object.keys(TARGET_SET_PROFILES).join(', ')}`)
    }

    return {name, ...profile}
}

/**
 * @summary Stateful, clock-injected report recorder for one target-set
 * measurement. It performs no I/O and owns no recovery operation.
 */
export class TargetSetMeasurementRecorder {
    /**
     * @param {Object} options
     * @param {'exact-head-candidate'|'synthetic-control'} options.evidenceClass
     * @param {String|null} [options.implementationHead=null] Exact implementation head for candidate evidence.
     * @param {Function} [options.now=Date.now] Injected epoch-ms clock.
     * @param {String} options.profileName One key from `TARGET_SET_PROFILES`.
     * @param {String|null} [options.repositoryHead=null] Checked-out repository head.
     * @param {String|null} [options.scenario=null] Synthetic control scenario.
     */
    constructor({
        evidenceClass,
        implementationHead = null,
        now                = Date.now,
        profileName,
        repositoryHead     = null,
        scenario           = null
    } = {}) {
        if (!EVIDENCE_CLASSES.includes(evidenceClass)) {
            throw new Error(`evidenceClass must be one of: ${EVIDENCE_CLASSES.join(', ')}`)
        }
        if (typeof now !== 'function') {
            throw new Error('TargetSetMeasurementRecorder requires an injected clock function')
        }
        if (evidenceClass === 'exact-head-candidate' && !/^[0-9a-f]{40}$/i.test(implementationHead ?? '')) {
            throw new Error('exact-head-candidate evidence requires a 40-character implementationHead')
        }
        if (evidenceClass === 'synthetic-control' && !TARGET_SET_CONTROL_SCENARIOS.includes(scenario)) {
            throw new Error(`synthetic-control requires one scenario: ${TARGET_SET_CONTROL_SCENARIOS.join(', ')}`)
        }

        this.evidenceClass     = evidenceClass;
        this.implementationHead = implementationHead;
        this.now               = now;
        this.profile           = resolveTargetSetProfile(profileName);
        this.repositoryHead    = repositoryHead;
        this.scenario          = scenario;
        this.startedAtMs       = this.#timestamp();
    }

    /**
     * @member {Object|null} fixture=null
     */
    fixture = null
    /**
     * @member {Object[]} receipts=[]
     */
    receipts = []
    /**
     * @member {Object[]} checkpoints=[]
     */
    checkpoints = []
    /**
     * @member {Object} phaseTimings={}
     */
    phaseTimings = {}
    /**
     * @member {Object} batchMaxima={}
     */
    batchMaxima = {}
    /**
     * @member {Object|null} activePhase=null
     */
    activePhase = null
    /**
     * @member {Object|null} providerTrace=null
     */
    providerTrace = null
    /**
     * @member {Object[]} providerCalls=[]
     */
    providerCalls = []
    /**
     * @member {Object} resourceRoles={}
     */
    resourceRoles = {}
    /**
     * @member {Number} resourceSampleCount=0
     */
    resourceSampleCount = 0
    /**
     * @member {Object} nodeHighWater
     */
    nodeHighWater = {
        heapUsedBytes: 0,
        rssBytes     : 0
    }
    /**
     * @member {Number} tempDiskHighWaterBytes=0
     */
    tempDiskHighWaterBytes = 0

    /**
     * @summary Records the exact generated fixture shape. Vector row counts and
     * graph cardinalities must match the named profile; serialized graph bytes
     * and vector dimension are measured facts rather than profile guesses.
     *
     * @param {Object} fixture
     * @param {Number} fixture.graphEdges
     * @param {Number} fixture.graphNodes
     * @param {Number} fixture.graphSerializedBytes
     * @param {Number} fixture.memories
     * @param {Number} fixture.summaries
     * @param {Number} fixture.vectorDimension
     */
    recordFixture(fixture = {}) {
        const expected      = this.profile;
        const integerFields = [
            'graphEdges',
            'graphNodes',
            'graphSerializedBytes',
            'memories',
            'summaries',
            'vectorDimension'
        ];

        for (const key of integerFields) {
            if (!Number.isInteger(fixture[key]) || fixture[key] < (key === 'graphSerializedBytes' || key === 'vectorDimension' ? 1 : 0)) {
                throw new Error(`fixture.${key} must be a ${key === 'graphSerializedBytes' || key === 'vectorDimension' ? 'positive' : 'non-negative'} integer`)
            }
        }

        for (const key of ['graphEdges', 'graphNodes', 'memories', 'summaries']) {
            if (fixture[key] !== expected[key]) {
                throw new Error(`fixture.${key}=${fixture[key]} does not match ${expected.name} (${expected[key]})`)
            }
        }

        this.fixture = {...fixture}
    }

    /**
     * @summary Declares which provider entrypoints the adapter actually traced.
     * A zero-call receipt without a declared trace surface is refused.
     *
     * @param {Object} trace
     * @param {String} trace.coverage Human-readable trace boundary.
     * @param {String[]} trace.entrypoints Exact wrapped/injected entrypoint names.
     */
    declareProviderTrace({coverage, entrypoints} = {}) {
        if (typeof coverage !== 'string' || coverage.length === 0 || !Array.isArray(entrypoints) || entrypoints.length === 0 ||
            entrypoints.some(item => typeof item !== 'string' || item.length === 0)) {
            throw new Error('provider trace requires a coverage string and at least one named entrypoint')
        }

        this.providerTrace = {coverage, entrypoints: [...new Set(entrypoints)]}
    }

    /**
     * @summary Records one observed provider or re-embedding entrypoint call.
     *
     * @param {Object} call
     * @param {String} call.entrypoint
     * @param {Number} [call.atMs] Injected timestamp override.
     */
    recordProviderCall({entrypoint, atMs = this.#timestamp()} = {}) {
        if (!this.providerTrace) {
            throw new Error('declareProviderTrace() must run before provider calls are recorded')
        }
        if (!this.providerTrace.entrypoints.includes(entrypoint)) {
            throw new Error(`provider call entrypoint "${entrypoint}" is outside the declared trace surface`)
        }

        this.providerCalls.push({atMs: this.#finiteTimestamp(atMs), entrypoint})
    }

    /**
     * @summary Records a vector store request size and retains the maximum per
     * collection plus the global maximum.
     *
     * @param {Object} batch
     * @param {'memories'|'summaries'} batch.collection
     * @param {Number} batch.size
     */
    recordBatch({collection, size} = {}) {
        if (!['memories', 'summaries'].includes(collection) || !Number.isInteger(size) || size <= 0) {
            throw new Error('batch receipt requires collection memories|summaries and a positive integer size')
        }

        this.batchMaxima[collection] = Math.max(this.batchMaxima[collection] ?? 0, size)
    }

    /**
     * @summary Declares one sampled process role. Non-separable roles remain in
     * the report with their reason instead of disappearing into a Node-only sum.
     *
     * @param {Object} role
     * @param {String} role.name
     * @param {Number|null} [role.pid=null]
     * @param {String|null} [role.reason=null]
     * @param {Boolean} role.separable
     */
    declareResourceRole({name, pid = null, reason = null, separable} = {}) {
        if (typeof name !== 'string' || name.length === 0 || typeof separable !== 'boolean') {
            throw new Error('resource role requires a name and boolean separable flag')
        }
        if (separable && (!Number.isInteger(pid) || pid <= 0)) {
            throw new Error(`separable resource role "${name}" requires a positive pid`)
        }
        if (!separable && (typeof reason !== 'string' || reason.length === 0)) {
            throw new Error(`non-separable resource role "${name}" requires a reason`)
        }

        this.resourceRoles[name] = {
            pid,
            reason,
            rssHighWaterBytes: 0,
            sampleCount      : 0,
            separable
        }
    }

    /**
     * @summary Records one simultaneous resource sample.
     *
     * @param {Object} sample
     * @param {Object} sample.node
     * @param {Number} sample.node.heapUsedBytes
     * @param {Number} sample.node.rssBytes
     * @param {Object} [sample.processes={}] Role-keyed `{rssBytes}` samples.
     * @param {Number} sample.tempDiskBytes
     */
    recordResourceSample({node, processes = {}, tempDiskBytes} = {}) {
        const values = [node?.heapUsedBytes, node?.rssBytes, tempDiskBytes];

        if (!values.every(value => Number.isFinite(value) && value >= 0)) {
            throw new Error('resource sample requires non-negative finite Node heap/RSS and temp-disk bytes')
        }

        this.resourceSampleCount++;
        this.nodeHighWater.heapUsedBytes = Math.max(this.nodeHighWater.heapUsedBytes, node.heapUsedBytes);
        this.nodeHighWater.rssBytes      = Math.max(this.nodeHighWater.rssBytes, node.rssBytes);
        this.tempDiskHighWaterBytes      = Math.max(this.tempDiskHighWaterBytes, tempDiskBytes);

        for (const [name, value] of Object.entries(processes)) {
            const role = this.resourceRoles[name];

            if (!role || !role.separable) {
                throw new Error(`resource sample names undeclared or non-separable role "${name}"`)
            }
            if (!Number.isFinite(value?.rssBytes) || value.rssBytes < 0) {
                throw new Error(`resource sample for "${name}" requires non-negative finite rssBytes`)
            }

            role.sampleCount++;
            role.rssHighWaterBytes = Math.max(role.rssHighWaterBytes, value.rssBytes)
        }
    }

    /**
     * @summary Records a control/restart boundary without pretending it is an
     * ADR action phase.
     *
     * @param {Object} checkpoint
     * @param {String} checkpoint.kind
     * @param {Object} [checkpoint.detail={}]
     * @param {Number} [checkpoint.atMs]
     */
    recordCheckpoint({kind, detail = {}, atMs = this.#timestamp()} = {}) {
        if (typeof kind !== 'string' || kind.length === 0 || detail === null || typeof detail !== 'object' || Array.isArray(detail)) {
            throw new Error('checkpoint requires a kind string and object detail')
        }

        this.checkpoints.push({atMs: this.#finiteTimestamp(atMs), detail: {...detail}, kind})
    }

    /**
     * @summary Records one phase start/completion receipt and enforces the
     * canonical order. An interrupted/failed run may jump from a completed
     * prefix to terminal settlement; only a `completed` run may claim all
     * phases.
     *
     * @param {Object} receipt
     * @param {Number} [receipt.atMs]
     * @param {Object} [receipt.counts={}]
     * @param {String} receipt.phase
     * @param {'started'|'completed'} receipt.state
     */
    recordProgress({atMs = this.#timestamp(), counts = {}, phase, state} = {}) {
        if (!TARGET_SET_PHASES.includes(phase) || !['started', 'completed'].includes(state)) {
            throw new Error('progress receipt requires a canonical phase and state started|completed')
        }
        if (counts === null || typeof counts !== 'object' || Array.isArray(counts) ||
            Object.values(counts).some(value => !Number.isInteger(value) || value < 0)) {
            throw new Error('progress counts must be an object of non-negative integers')
        }

        atMs = this.#finiteTimestamp(atMs);

        if (state === 'started') {
            if (this.activePhase) {
                throw new Error(`cannot start "${phase}" while "${this.activePhase.phase}" is active`)
            }
            if (this.phaseTimings[phase]) {
                throw new Error(`phase "${phase}" already completed`)
            }

            const completed     = Object.keys(this.phaseTimings);
            const expected      = TARGET_SET_PHASES[completed.length];
            const earlyTerminal = phase === TERMINAL_PHASE && expected !== TERMINAL_PHASE;

            if (phase !== expected && !earlyTerminal) {
                throw new Error(`phase "${phase}" is out of order; expected "${expected}"`)
            }

            this.activePhase = {phase, startedAtMs: atMs}
        } else {
            if (this.activePhase?.phase !== phase) {
                throw new Error(`cannot complete "${phase}" without its active start receipt`)
            }

            const durationMs = atMs - this.activePhase.startedAtMs;

            if (durationMs < 0) {
                throw new Error(`phase "${phase}" completed before it started`)
            }

            this.phaseTimings[phase] = {
                completedAtMs: atMs,
                counts       : {...counts},
                durationMs,
                startedAtMs  : this.activePhase.startedAtMs
            };
            this.activePhase = null
        }

        this.receipts.push({atMs, counts: {...counts}, phase, state})
    }

    /**
     * @summary Finalizes the immutable report. `completed` requires all phases;
     * interrupted/failed controls require truthful terminal settlement and
     * enumerate every skipped phase.
     *
     * @param {Object} outcome
     * @param {String|null} [outcome.detail=null]
     * @param {'completed'|'failed'|'interrupted'} outcome.status
     * @returns {Object}
     */
    finish({detail = null, status} = {}) {
        if (!['completed', 'failed', 'interrupted'].includes(status)) {
            throw new Error('measurement status must be completed, failed, or interrupted')
        }
        if (this.activePhase) {
            throw new Error(`cannot finish while "${this.activePhase.phase}" is active`)
        }
        if (!this.fixture) {
            throw new Error('cannot finish without an exact fixture receipt')
        }
        if (!this.providerTrace) {
            throw new Error('cannot finish without a declared provider trace surface')
        }
        if (this.resourceSampleCount === 0) {
            throw new Error('cannot finish without at least one resource sample')
        }
        if (!this.phaseTimings[TERMINAL_PHASE]) {
            throw new Error('cannot finish without terminal-settlement timing')
        }

        const completedPhases = Object.keys(this.phaseTimings);
        const skippedPhases   = TARGET_SET_PHASES.filter(phase => !this.phaseTimings[phase]);

        if (status === 'completed' && skippedPhases.length > 0) {
            throw new Error(`completed measurement is missing phases: ${skippedPhases.join(', ')}`)
        }
        if (status === 'completed' && ['memories', 'summaries'].some(collection => !this.batchMaxima[collection])) {
            throw new Error('completed measurement requires observed vector batch sizes for memories and summaries')
        }
        if (status === 'completed' && ['chroma', 'sqlite'].some(role => !this.resourceRoles[role])) {
            throw new Error('completed measurement requires declared Chroma and SQLite resource roles')
        }
        if (status === 'completed' && this.evidenceClass === 'exact-head-candidate' &&
            (!this.resourceRoles.chroma.separable || this.resourceRoles.chroma.sampleCount === 0)) {
            throw new Error('exact-head candidate evidence requires at least one separable Chroma RSS sample')
        }

        const finishedAtMs       = this.#timestamp();
        const resources          = Object.fromEntries(Object.entries(this.resourceRoles).map(([name, role]) => [name, {...role}]));
        const globalBatchMaximum = Math.max(0, ...Object.values(this.batchMaxima));
        const authoritative      = false;
        const authorityReason    = this.evidenceClass === 'synthetic-control'
            ? 'Synthetic/seam controls cannot satisfy the #15740 exact-head merge gate.'
            : 'Candidate evidence requires publication against the exact #15740 PR head and maintainer review.';

        return {
            authority: {
                authoritative,
                mergeGateSatisfied: false,
                reason            : authorityReason
            },
            batches: {
                globalMaximum: globalBatchMaximum,
                perCollection: {...this.batchMaxima}
            },
            checkpoints       : this.checkpoints.map(item => ({...item, detail: {...item.detail}})),
            completedPhases,
            detail,
            evidenceClass     : this.evidenceClass,
            finishedAtMs,
            fixture           : {...this.fixture, profileName: this.profile.name},
            implementationHead: this.implementationHead,
            phaseTimings      : Object.fromEntries(Object.entries(this.phaseTimings).map(([phase, timing]) => [phase, {
                ...timing,
                counts: {...timing.counts}
            }])),
            profile : {...this.profile},
            progress: {
                first   : this.receipts[0] ? {...this.receipts[0], counts: {...this.receipts[0].counts}} : null,
                last    : this.receipts.at(-1) ? {...this.receipts.at(-1), counts: {...this.receipts.at(-1).counts}} : null,
                receipts: this.receipts.map(item => ({...item, counts: {...item.counts}}))
            },
            providerTrace: {
                ...this.providerTrace,
                callCount: this.providerCalls.length,
                calls    : this.providerCalls.map(item => ({...item}))
            },
            repositoryHead: this.repositoryHead,
            resources     : {
                node: {
                    heapUsedHighWaterBytes: this.nodeHighWater.heapUsedBytes,
                    rssHighWaterBytes     : this.nodeHighWater.rssBytes,
                    sampleCount           : this.resourceSampleCount
                },
                processes             : resources,
                tempDiskHighWaterBytes: this.tempDiskHighWaterBytes
            },
            scenario   : this.scenario,
            skippedPhases,
            startedAtMs: this.startedAtMs,
            status,
            wallTimeMs : finishedAtMs - this.startedAtMs
        }
    }

    /**
     * @returns {Number}
     * @private
     */
    #timestamp() {
        return this.#finiteTimestamp(this.now())
    }

    /**
     * @param {Number} value
     * @returns {Number}
     * @private
     */
    #finiteTimestamp(value) {
        if (!Number.isFinite(value)) {
            throw new Error(`measurement clock must return a finite timestamp, got ${value}`)
        }

        return value
    }
}
