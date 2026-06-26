import Base from '../../../../src/core/Base.mjs';

import {buildDataIntegrityCoverageDiagnosis} from './dataIntegrityCoverageDiagnosis.mjs';
import {buildDimensionConsistencyDiagnosis}  from './dimensionConsistencyDiagnosis.mjs';

/**
 * @module ai/daemons/orchestrator/services/DataIntegrityDiagnosisService
 * @summary The data-integrity diagnostics runner — the integration leaf of the data-integrity
 * detect-signal class that turns the pure detect-producers (coverage-drift, and, as they land,
 * monotonicity / dimension / store-bloat / SQLite) into a LIVE immune-system signal. It is the missing
 * wiring between the producers (which are proven by the release-gate end-to-end corruption proof but
 * not yet running) and the recovery actuator's escalate sink.
 *
 * The runner gathers bounded read-observe facts (a Chroma vector-coverage audit, plus per-collection
 * embedding-dimension samples when a dimension gatherer is injected), runs the producers over them, and
 * routes every emitted `recovery-diagnosis` to the actuator's `escalateDiagnosis` sink —
 * the operator-page path. It is DETECT-ONLY / ESCALATE-ONLY by construction: it never calls a
 * privileged recovery action (`apply` / restart / re-embed / restore / Chroma mutation). Data mutation
 * stays operator-gated (the two-worlds boundary); a gutted store pages a human, it is not
 * silently "repaired".
 *
 * All collaborators are injected (the fact gatherer, the actuator, the Memory Core service id, the
 * clock), so the unit is pure-testable in isolation and the AiConfig SSOT leaves are read at the
 * orchestrator use-site, never re-derived here (config-SSOT discipline).
 */

/**
 * @class Neo.ai.daemons.services.DataIntegrityDiagnosisService
 * @extends Neo.core.Base
 * @see learn/agentos/decisions/0025-orchestrator-container-health-self-healing.md
 * @see learn/agentos/decisions/0026-recovery-actuator.md
 * @see learn/agentos/decisions/0019-aiconfig-reactive-provider-ssot.md
 */
export class DataIntegrityDiagnosisService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.DataIntegrityDiagnosisService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.DataIntegrityDiagnosisService'
    }

    /**
     * Async fact gatherer returning a Chroma vector-coverage audit result
     * (`auditChromaVectorCoverage()` pre-bound with its AiConfig leaves at the use-site).
     * A set-once injected dependency — a plain class field, NOT a reactive config: it is assigned once
     * at construction, never reassigned, and never observed (no before/afterSet hook, no subscription),
     * so the reactive Config-controller machinery would be pure overhead.
     * @member {Function|null} coverageGatherer=null
     */
    coverageGatherer = null
    /**
     * Async fact gatherer returning per-collection embedding-dimension samples
     * (`[{collection, expectedDimension, mismatchedVectorCount}]`) for `buildDimensionConsistencyDiagnosis`.
     * OPTIONAL — a set-once injected dependency (a plain class field, like `coverageGatherer`). The
     * dimension signal is secondary: when this is absent (the live-Chroma binding not yet wired) or its
     * probe fails, dimension is skipped for the cycle and the coverage signal still runs — a
     * dimension-probe issue must never suppress the primary coverage probe.
     * @member {Function|null} dimensionGatherer=null
     */
    dimensionGatherer = null
    /**
     * The current-clock injection seam for deterministic tests; falls back to `Date.now()`.
     * Set-once injected dependency — a plain class field (see `coverageGatherer`), not reactive.
     * @member {Function|null} nowFn=null
     */
    nowFn = null
    /**
     * The recovery actuator (or any object exposing `escalateDiagnosis(event, options)`). Only its
     * escalate sink is ever reached — never a privileged action. Set-once injected dependency — a
     * plain class field, not reactive.
     * @member {Object|null} recoveryActuator=null
     */
    recoveryActuator = null
    /**
     * The Memory Core `compose-service` identifier the diagnoses target. Set-once injected
     * dependency — a plain class field, not reactive.
     * @member {String|null} serviceId=null
     */
    serviceId = null

    /**
     * @summary Gathers integrity facts, runs the detect-producers, and routes any diagnosis to escalate.
     *
     * On a clean store this returns a `healthy` decision with no escalation. When a producer fires, the
     * diagnosis is routed to the actuator's escalate sink (operator page) and the decision is `escalated`.
     * If the probe itself cannot run (e.g. Chroma unreachable), the decision is `probe-unavailable` and
     * NOTHING is escalated — a failed probe must never be mistaken for a data-integrity drift signal.
     *
     * @param {Object} [options]
     * @param {Number} [options.observedAt=this.now()] Epoch milliseconds for the observation.
     * @returns {Promise<Object>} A `data-integrity-diagnosis-decision` envelope.
     * @throws {TypeError} when a required collaborator (serviceId / coverageGatherer / recoveryActuator) is missing.
     */
    async gatherAndDiagnose({observedAt = this.now()} = {}) {
        this.validateDependencies();

        let coverageResult;

        try {
            coverageResult = await this.coverageGatherer();
        } catch (error) {
            return this.createDecision({
                serviceId : this.serviceId,
                observedAt,
                status    : 'probe-unavailable',
                probeError: error.message
            });
        }

        const dimensionSamples = await this.gatherDimensionSamples();

        const diagnoses   = this.buildDiagnoses({coverageResult, dimensionSamples, observedAt}),
              escalations = await this.routeDiagnoses({diagnoses, now: observedAt});

        return this.createDecision({
            serviceId: this.serviceId,
            observedAt,
            status   : diagnoses.length > 0 ? 'escalated' : 'healthy',
            diagnoses,
            escalations
        });
    }

    /**
     * @summary Gathers per-collection dimension samples from the injected dimension gatherer, if present.
     *
     * The dimension signal is secondary and degrades independently: an absent gatherer (the live-Chroma
     * binding not yet wired) or a probe failure yields no samples (dimension is skipped this cycle) and
     * never aborts the cycle — the primary coverage probe has already run and must not be suppressed.
     *
     * @returns {Promise<Object[]>} Per-collection dimension samples, or `[]` when unavailable.
     */
    async gatherDimensionSamples() {
        if (typeof this.dimensionGatherer !== 'function') {
            return [];
        }

        try {
            const samples = await this.dimensionGatherer();
            return Array.isArray(samples) ? samples : [];
        } catch (error) {
            return [];
        }
    }

    /**
     * @summary Runs the pure detect-producers over the gathered facts and collects non-null diagnoses.
     *
     * Wires the coverage-drift producer (snapshot-derived) and the dimension-consistency producer (fed by
     * the optional injected dimension gatherer). The remaining extension is the monotonicity producer
     * (fed by the runner's own per-collection history). Each producer is pure and returns `null` on a
     * clean signal, so an absent dimension gatherer (empty samples) simply yields no dimension diagnosis.
     *
     * @param {Object} options
     * @param {Object} options.coverageResult The `auditChromaVectorCoverage()` result.
     * @param {Object[]} [options.dimensionSamples=[]] Per-collection dimension samples; empty when no gatherer is injected.
     * @param {Number} options.observedAt Epoch milliseconds for the observation.
     * @returns {Object[]} The non-null `recovery-diagnosis` events emitted this cycle.
     */
    buildDiagnoses({coverageResult, dimensionSamples = [], observedAt}) {
        const diagnoses = [],
              coverage  = buildDataIntegrityCoverageDiagnosis({
                  coverageResult,
                  observedAt,
                  serviceId: this.serviceId
              });

        if (coverage) {
            diagnoses.push(coverage);
        }

        const dimension = buildDimensionConsistencyDiagnosis({
            samples  : dimensionSamples,
            observedAt,
            serviceId: this.serviceId
        });

        if (dimension) {
            diagnoses.push(dimension);
        }

        return diagnoses;
    }

    /**
     * @summary Routes each diagnosis to the actuator's escalate sink — the only recovery surface reached.
     *
     * Detect-only by construction: this method calls `escalateDiagnosis` exclusively and never a
     * privileged action. A `rejected` escalation outcome is recorded, not thrown — a single
     * malformed diagnosis must not abort the cycle.
     *
     * @param {Object} options
     * @param {Object[]} options.diagnoses Emitted `recovery-diagnosis` events.
     * @param {Number} options.now Epoch milliseconds passed through to the actuator for consistent timestamps.
     * @returns {Promise<Object[]>} The per-diagnosis escalation outcome descriptors.
     */
    async routeDiagnoses({diagnoses, now}) {
        const escalations = [];

        for (const diagnosis of diagnoses) {
            escalations.push(await this.recoveryActuator.escalateDiagnosis(diagnosis, {now}));
        }

        return escalations;
    }

    /**
     * @summary Builds the top-level decision envelope for one diagnostics cycle.
     * @param {Object} options
     * @returns {Object}
     */
    createDecision({serviceId, observedAt, status, diagnoses = [], escalations = [], probeError = null}) {
        return {
            schemaVersion: 1,
            recordType   : 'data-integrity-diagnosis-decision',
            serviceId,
            observedAt,
            status,
            probeError,
            diagnoses,
            escalations
        };
    }

    /**
     * @summary Returns the current clock value (injected clock for tests, else wall-clock).
     * @returns {Number}
     */
    now() {
        return this.nowFn ? this.nowFn() : Date.now();
    }

    /**
     * @summary Fail-closed guard: the immune-system runner must not silently no-op on a missing collaborator.
     * @returns {void}
     * @throws {TypeError} when serviceId / coverageGatherer / recoveryActuator is missing or malformed.
     */
    validateDependencies() {
        if (typeof this.serviceId !== 'string' || this.serviceId.length === 0) {
            throw new TypeError('DataIntegrityDiagnosisService: serviceId is required');
        }
        if (typeof this.coverageGatherer !== 'function') {
            throw new TypeError('DataIntegrityDiagnosisService: coverageGatherer is required');
        }
        if (typeof this.recoveryActuator?.escalateDiagnosis !== 'function') {
            throw new TypeError('DataIntegrityDiagnosisService: recoveryActuator with escalateDiagnosis() is required');
        }
    }
}

export default Neo.setupClass(DataIntegrityDiagnosisService);
