import Base                                               from '../../../../src/core/Base.mjs';
import {classifyDataIntegrityMode, DataIntegrityTerminal} from './dataIntegrityModeClassifier.mjs';

/**
 * @module ai/daemons/orchestrator/services/DataIntegrityDiagnosisService
 * @summary The data-integrity self-heal runner — the integration leaf of the data-integrity detect-signal
 * class. It gathers per-collection raw evidence, classifies the corruption MODE, and routes each finding to
 * its AUTONOMOUS heal action via the recovery actuator's `applyHeal` sink.
 *
 * There is NO `escalate` and NO operator in the loop: in a cloud deployment there is no human to page or
 * acknowledge, so every actionable mode routes to an autonomous heal (re-embed-missing, restore-delta-merge,
 * quarantine, freeze, defrag…) — or the safe-default `quarantine` where the specific repair is not yet built.
 * The runner only routes; the actuator executes — the interim actuator defers every action (detected +
 * recorded, never a page) until the heal ops are wired, so it contains nothing yet. Safety comes from the
 * actuator's bounded envelope (snapshot, reversibility, durable audit record, rate-limit), not from a human
 * gate that does not exist.
 *
 * The mode taxonomy is single-sourced in `dataIntegrityModeClassifier`; the producers stay dumb raw-evidence
 * emitters; the actuator owns the heal execution. This runner only gathers → classifies → routes. If the
 * probe itself cannot run (e.g. Chroma unreachable), the decision is `probe-unavailable` and NOTHING is
 * actioned — a failed probe must never be mistaken for a corruption signal.
 *
 * All collaborators are injected (the evidence gatherer, the actuator, the Memory Core service id, the
 * clock), so the unit is pure-testable in isolation and the AiConfig SSOT leaves are read at the
 * orchestrator use-site, never re-derived here (config-SSOT discipline).
 */

/**
 * @class Neo.ai.daemons.services.DataIntegrityDiagnosisService
 * @extends Neo.core.Base
 * @see ai/daemons/orchestrator/services/dataIntegrityModeClassifier.mjs
 * @see learn/agentos/decisions/0025-orchestrator-container-health-self-healing.md
 * @see learn/agentos/decisions/0026-recovery-actuator.md
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
     * Async fact gatherer returning an array of per-collection raw evidence rows — the dumb-emitter
     * producers' output: `[{collection, rowCount, missingFromVectorCount, documentsPresentCount,
     * countRegressed, mismatchedVectorCount, sqliteIntegrityOk, sizeAnomaly}]`. The mode is NOT decided
     * here by the producers; the classifier derives it. A set-once injected dependency — a plain class
     * field, never reassigned/observed, so the reactive Config-controller machinery would be pure overhead.
     * @member {Function|null} evidenceGatherer=null
     */
    evidenceGatherer = null
    /**
     * The recovery actuator exposing `applyHeal({action, collection, evidence, now})`. Every actionable mode
     * routes here — there is no escalate/operator sink. Set-once injected dependency — a plain class field.
     * @member {Object|null} recoveryActuator=null
     */
    recoveryActuator = null
    /**
     * The current-clock injection seam for deterministic tests; falls back to `Date.now()`.
     * Set-once injected dependency — a plain class field.
     * @member {Function|null} nowFn=null
     */
    nowFn = null
    /**
     * The Memory Core `compose-service` identifier the heals target. Set-once injected dependency — a plain
     * class field.
     * @member {String|null} serviceId=null
     */
    serviceId = null
    /**
     * Reversibility seam: lifts a collection's serving fence when a clean re-audit (terminalAction `none`)
     * shows it recovered. `null` → no-op (the fence persists). Set-once injected dependency — a plain field.
     * @member {Function|null} liftQuarantine=null
     */
    liftQuarantine = null

    /**
     * @summary Gathers per-collection evidence, classifies each, and routes every actionable finding to its
     * autonomous heal.
     *
     * On a clean store this returns a `clean` decision with no heals. When a collection classifies to an
     * actionable mode, the heal is applied via the actuator (`applyHeal`) and the decision is `healed`. If
     * the probe cannot run, the decision is `probe-unavailable` and NOTHING is actioned — a failed probe is
     * never a corruption signal. There is no `escalated` status by construction (no operator).
     *
     * @param {Object} [options]
     * @param {Number} [options.observedAt=this.now()] Epoch milliseconds for the observation.
     * @returns {Promise<Object>} A `data-integrity-self-heal-decision` envelope.
     * @throws {TypeError} when a required collaborator (serviceId / evidenceGatherer / recoveryActuator) is missing.
     */
    async gatherAndDiagnose({observedAt = this.now()} = {}) {
        this.validateDependencies();

        let evidenceRows;

        try {
            evidenceRows = await this.evidenceGatherer();
        } catch (error) {
            return this.createDecision({
                serviceId : this.serviceId,
                observedAt,
                status    : 'probe-unavailable',
                probeError: error.message
            });
        }

        const rows            = Array.isArray(evidenceRows) ? evidenceRows : [],
              classifications = rows.map(evidence => classifyDataIntegrityMode(evidence)),
              actionable      = classifications.filter(classification => classification.terminalAction !== DataIntegrityTerminal.NONE),
              heals           = await this.applyHeals({rows, classifications, now: observedAt});

        return this.createDecision({
            serviceId: this.serviceId,
            observedAt,
            status   : actionable.length > 0 ? 'healed' : 'clean',
            classifications,
            heals
        });
    }

    /**
     * @summary Routes each actionable classification to the actuator's autonomous heal sink (`applyHeal`).
     *
     * Self-heal by construction: this method calls `applyHeal` exclusively — never an escalate/operator path.
     * A rejected/failed heal outcome is recorded, not thrown — a single heal failure must not abort the cycle
     * (the next periodic sweep re-detects the still-unhealed residue).
     *
     * @param {Object} options
     * @param {Object[]} options.rows The raw evidence rows (parallel to `classifications`).
     * @param {Object[]} options.classifications The per-collection classifier decisions.
     * @param {Number} options.now Epoch milliseconds passed through to the actuator for consistent timestamps.
     * @returns {Promise<Object[]>} The per-heal outcome descriptors.
     */
    async applyHeals({rows, classifications, now}) {
        const heals = [];

        for (let i = 0; i < classifications.length; i++) {
            const classification = classifications[i];

            if (classification.terminalAction === DataIntegrityTerminal.NONE) {
                // Reversibility: a clean re-audit lifts any prior serving fence on this collection (serving
                // resumes). No fence → a no-op; recorded only when a fence was actually lifted.
                const lifted = typeof this.liftQuarantine === 'function' && await this.liftQuarantine(classification.collection);
                if (lifted) {
                    heals.push({collection: classification.collection, action: 'unquarantine', mode: classification.mode, outcome: {status: 'unquarantined'}});
                }
                continue;
            }

            let outcome;

            try {
                outcome = await this.recoveryActuator.applyHeal({
                    action    : classification.terminalAction,
                    collection: classification.collection,
                    evidence  : rows[i],
                    now
                });
            } catch (error) {
                // A single heal failure is recorded, not thrown — the next periodic sweep re-detects the
                // still-unhealed residue. Aborting the cycle would strand the other collections' heals.
                outcome = {status: 'failed', error: error.message};
            }

            heals.push({collection: classification.collection, action: classification.terminalAction, mode: classification.mode, outcome});
        }

        return heals;
    }

    /**
     * @summary Builds the top-level decision envelope for one self-heal cycle.
     * @param {Object} options
     * @returns {Object}
     */
    createDecision({serviceId, observedAt, status, classifications = [], heals = [], probeError = null}) {
        return {
            schemaVersion: 1,
            recordType   : 'data-integrity-self-heal-decision',
            serviceId,
            observedAt,
            status,
            probeError,
            classifications,
            heals
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
     * @summary Fail-closed guard: the self-heal runner must not silently no-op on a missing collaborator.
     * @returns {void}
     * @throws {TypeError} when serviceId / evidenceGatherer / recoveryActuator(.applyHeal) is missing or malformed.
     */
    validateDependencies() {
        if (typeof this.serviceId !== 'string' || this.serviceId.length === 0) {
            throw new TypeError('DataIntegrityDiagnosisService: serviceId is required');
        }
        if (typeof this.evidenceGatherer !== 'function') {
            throw new TypeError('DataIntegrityDiagnosisService: evidenceGatherer is required');
        }
        if (typeof this.recoveryActuator?.applyHeal !== 'function') {
            throw new TypeError('DataIntegrityDiagnosisService: recoveryActuator with applyHeal() is required');
        }
    }
}

export default Neo.setupClass(DataIntegrityDiagnosisService);
