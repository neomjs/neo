import Base from '../../../../src/core/Base.mjs';

import {buildDataIntegrityCoverageDiagnosis} from './dataIntegrityCoverageDiagnosis.mjs';

/**
 * @module ai/daemons/orchestrator/services/DataIntegrityDiagnosisService
 * @summary The data-integrity diagnostics runner — the integration leaf of the data-integrity
 * detect-signal class that turns the pure detect-producers (coverage-drift, and, as they land,
 * monotonicity / dimension / store-bloat / SQLite) into a LIVE immune-system signal. It is the missing
 * wiring between the producers (which are proven by the release-gate end-to-end corruption proof but
 * not yet running) and the recovery actuator's escalate sink.
 *
 * The runner gathers bounded read-observe facts (a Chroma vector-coverage audit), runs the producers
 * over them, and routes every emitted `recovery-diagnosis` to the actuator's `escalateDiagnosis` sink —
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
        className: 'Neo.ai.daemons.services.DataIntegrityDiagnosisService',
        /**
         * Async fact gatherer returning a Chroma vector-coverage audit result
         * (`auditChromaVectorCoverage()` pre-bound with its AiConfig leaves at the use-site).
         * @member {Function|null} coverageGatherer_=null
         * @protected
         * @reactive
         */
        coverageGatherer_: null,
        /**
         * The recovery actuator (or any object exposing `escalateDiagnosis(event, options)`).
         * Only its escalate sink is ever reached — never a privileged action.
         * @member {Object|null} recoveryActuator_=null
         * @protected
         * @reactive
         */
        recoveryActuator_: null,
        /**
         * The Memory Core `compose-service` identifier the diagnoses target.
         * @member {String|null} serviceId_=null
         * @protected
         * @reactive
         */
        serviceId_: null,
        /**
         * @member {Function|null} nowFn_=null
         * @protected
         * @reactive
         */
        nowFn_: null
    }

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

        const diagnoses   = this.buildDiagnoses({coverageResult, observedAt}),
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
     * @summary Runs the pure detect-producers over the gathered facts and collects non-null diagnoses.
     *
     * This is the extension seam: follow-up slices add the monotonicity producer (fed by the runner's
     * own per-collection history) and the dimension-consistency producer (fed by an injected dimension
     * fact-gatherer) alongside the coverage-drift producer wired here.
     *
     * @param {Object} options
     * @param {Object} options.coverageResult The `auditChromaVectorCoverage()` result.
     * @param {Number} options.observedAt Epoch milliseconds for the observation.
     * @returns {Object[]} The non-null `recovery-diagnosis` events emitted this cycle.
     */
    buildDiagnoses({coverageResult, observedAt}) {
        const diagnoses = [],
              coverage  = buildDataIntegrityCoverageDiagnosis({
                  coverageResult,
                  observedAt,
                  serviceId: this.serviceId
              });

        if (coverage) {
            diagnoses.push(coverage);
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
