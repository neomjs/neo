import Base                                               from '../../../../src/core/Base.mjs';
import {classifyDataIntegrityMode, DataIntegrityTerminal} from './dataIntegrityModeClassifier.mjs';

/**
 * @module ai/daemons/orchestrator/services/DataIntegrityDiagnosisService
 * @summary The data-integrity self-heal runner — the integration leaf of the data-integrity detect-signal
 * class. It gathers per-collection raw evidence, classifies the corruption MODE, and routes each finding to
 * its AUTONOMOUS heal action via the recovery actuator's `applyHeal` sink.
 *
 * There is NO `escalate` and NO operator in the loop: in a cloud deployment there is no human to page or
 * acknowledge, so every actionable collection mode routes to an autonomous
 * heal (re-embed-missing, quarantine, freeze, defrag…). The separate typed
 * fresh-empty bootstrap route may select `restore-empty-target`; ordinary wipe
 * evidence never does. The runner only routes; the actuator executes. Safety comes from the
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
     * The recovery actuator exposing
     * `applyHeal({action, collection?, targetSet?, evidence, now})`. Every actionable mode
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
     * The systemic circuit-breaker gate: `async ({now}) => {open, status, reason, …}` — folds the ledger, runs
     * `decideSystemicCircuit`, and reports whether a cross-collection embedder outage should suppress THIS cycle's
     * heals. `null` → no gate (proceed, as before). Set-once injected dependency — a plain class field.
     * @member {Function|null} systemicCircuitGate=null
     */
    systemicCircuitGate = null
    /**
     * Records a circuit-open / circuit-close ledger event: `async ({type, at, detail}) => void`. The gate's fold
     * reads these back to derive the open state. `null` → events are not recorded (the gate still suppresses).
     * @member {Function|null} recordCircuitEvent=null
     */
    recordCircuitEvent = null
    /**
     * Chronic `unsafe-input` mis-wire detector: `async ({now}) => [{action, collection, count}]` — folds the
     * heal-ledger for sustained `unsafe-input` per (action, collection). Observability only (does NOT gate the
     * cycle). `null` → no detection. Set-once injected dependency — a plain class field.
     * @member {Function|null} chronicUnsafeInputDetector=null
     */
    chronicUnsafeInputDetector = null

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
              actionable      = classifications.filter(classification => classification.terminalAction !== DataIntegrityTerminal.NONE);

        // SYSTEMIC CIRCUIT-BREAKER — the cross-collection layer above the per-collection anti-thrash. A shared
        // embedder outage fails N collections' heals at once; the per-collection gate cannot see the correlation,
        // so each retries within its own bounds — a mass-heal storm hammering a dead embedder. An open circuit
        // SUPPRESSES every heal here, before any per-collection heal runs — recorded + self-clearing (a half-open
        // probe tests recovery), never a page.
        const circuit = typeof this.systemicCircuitGate === 'function'
            ? await this.systemicCircuitGate({now: observedAt})
            : {open: false, status: 'closed'};

        if (circuit.open) {
            // `tripped` is the fresh detection → record the open once; `circuit-open` is riding out a prior trip.
            if (circuit.status === 'tripped' && typeof this.recordCircuitEvent === 'function') {
                await this.recordCircuitEvent({type: 'circuit-open', at: observedAt, detail: circuit.reason});
            }
            return this.createDecision({serviceId: this.serviceId, observedAt, status: 'circuit-open', classifications, heals: [], circuit});
        }

        // Half-open allows EXACTLY ONE actionable probe heal — not the full batch, which would re-storm a
        // still-down embedder. Clean re-audit fence-lifts are exempt from the cap (cheap, non-storm).
        const heals = await this.applyHeals({
            rows, classifications, now: observedAt,
            maxActionableHeals: circuit.status === 'half-open-probe' ? 1 : Infinity
        });

        // Half-open outcome: a clean probe (or nothing left to probe) closes the circuit; a FAILED probe refreshes
        // the open window at observedAt so the next fold rides it out, rather than immediately re-probing on the
        // already-elapsed cooldown (which would let a still-down embedder be hammered every sweep).
        if (circuit.status === 'half-open-probe' && typeof this.recordCircuitEvent === 'function') {
            const probeFailed = heals.some(heal => heal.outcome?.status === 'failed');
            await this.recordCircuitEvent(probeFailed
                ? {type: 'circuit-open',  at: observedAt, detail: 'half-open probe failed — circuit re-opened'}
                : {type: 'circuit-close', at: observedAt, detail: 'half-open probe recovered — circuit closed'});
        }

        // Chronic unsafe-input mis-wire detector (observability only — does NOT gate): surface sustained
        // unsafe-input per (action, collection) so a chronically mis-wired heal that silently never-executes is
        // detected rather than invisible. Reads the same heal-ledger the circuit folds.
        const chronicUnsafeInput = typeof this.chronicUnsafeInputDetector === 'function'
            ? await this.chronicUnsafeInputDetector({now: observedAt})
            : [];

        return this.createDecision({
            serviceId: this.serviceId,
            observedAt,
            status   : actionable.length > 0 ? 'healed' : 'clean',
            classifications,
            heals,
            circuit,
            chronicUnsafeInput
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
    async applyHeals({rows, classifications, now, maxActionableHeals = Infinity}) {
        const heals = [];

        let actionableHealCount = 0;

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

            // Half-open probe cap: a recovering circuit allows EXACTLY ONE actionable heal to test the shared
            // dependency — running the full batch would re-storm a still-down embedder. The NONE-lifts above are
            // exempt (cheap, non-storm). Beyond the cap, the residue waits for the next post-recovery sweep.
            if (actionableHealCount >= maxActionableHeals) {
                continue
            }
            actionableHealCount++;

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
    createDecision({serviceId, observedAt, status, classifications = [], heals = [], probeError = null, circuit = null, chronicUnsafeInput = []}) {
        return {
            schemaVersion: 1,
            recordType   : 'data-integrity-self-heal-decision',
            serviceId,
            observedAt,
            status,
            probeError,
            classifications,
            heals,
            circuit,
            chronicUnsafeInput
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
