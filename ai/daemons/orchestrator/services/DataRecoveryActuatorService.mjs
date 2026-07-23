import Base           from '../../../../src/core/Base.mjs';
import {dispatchHeal} from '../../../services/memory-core/helpers/healActionDispatch.mjs';
import {
    deriveRestoreTargetSetIdentity,
    RESTORE_EMPTY_TARGET_ACTION
} from '../../../services/memory-core/helpers/restoreTargetSetContract.mjs';

/**
 * @module ai/daemons/orchestrator/services/DataRecoveryActuatorService
 * @summary The autonomous data-recovery actuator — the `applyHeal` terminal that replaces the DELETED
 * `escalate`/`page` path. Given a classifier's heal action and its collection or
 * target-set identity, it runs the action through
 * the pure dispatch core's safety gate (`dispatchHeal`: rate-limit + anti-thrash) and executes the heal via an
 * INJECTED operation. **No operator, no escalate:** a held / unwired / failed heal is RECORDED in the returned
 * outcome, never paged. In an operatorless cloud deploy a runtime page is incoherent; this is the autonomous
 * terminal the data-integrity runner routes every diagnosis to.
 *
 * Privileged operations are injected at the orchestrator boundary. Unwired
 * actions remain autonomous `deferred` outcomes; `restore-empty-target` is
 * wired as one target-set mutation and never receives a synthetic collection.
 *
 * Collaborators are injected (the operations, the anti-thrash store; the clock rides in `applyHeal`), so the
 * unit is pure-testable and the AiConfig SSOT leaves are read at the orchestrator use-site, never re-derived
 * here (the reactive-config SSOT discipline).
 *
 * @class Neo.ai.daemons.services.DataRecoveryActuatorService
 * @extends Neo.core.Base
 * @see learn/agentos/decisions/0026-recovery-actuator.md
 * @see ai/services/memory-core/helpers/healActionDispatch.mjs
 */
class DataRecoveryActuatorService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.DataRecoveryActuatorService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.DataRecoveryActuatorService'
    }

    /**
     * Injected privileged heal operations: `{ '<action>': async ({collection, evidence, now}) => ({status, detail}) }`.
     * An unwired action defers (autonomous, never a page). A set-once injected
     * dependency — a plain field, not a reactive
     * config (assigned once at construction, never observed), so the Config-controller machinery would be pure
     * overhead.
     * @member {Object} healOperations={}
     */
    healOperations = {}
    /**
     * Injected recent-runs reader: `async (targetKey) => Object[]` — collection
     * name for collection actions, canonical recovery-unit key for target-set
     * recovery.
     * @member {Function|null} recentRunsReader=null
     */
    recentRunsReader = null
    /**
     * Injected anti-thrash recorder: `async ({action, collection, at}) => void` — persists a mutating ATTEMPT
     * before execution so a failing heal cannot hot-loop. **Interim:** null (no mutating op runs). REQUIRED once
     * the follow-up wires mutating ops — the dispatch core fails CLOSED (`unsafe-input`) on a mutating action
     * without it. A set-once injected dependency.
     * @member {Function|null} recordRun=null
     */
    recordRun = null
    /**
     * Injected OUTCOME recorder: `async ({action, collection, status, detail, healedAt}) => void` — persists the
     * dispatch outcome (what actually happened) to the heal-event ledger, the complement to `recordRun`'s
     * pre-execution attempt. This is the durable substrate the chronic-`unsafe-input` detector and the systemic
     * circuit-breaker read; without it the ledger holds only attempts. null → not recorded (observability-only; a
     * recording failure never breaks the heal path). A set-once injected dependency.
     * @member {Function|null} recordHealOutcome=null
     */
    recordHealOutcome = null

    /**
     * @summary The autonomous heal terminal — routes the classifier's action through the dispatch core's safety
     * gate + the injected operation, returning the uniform outcome record. The DELETED escalate path's
     * replacement: a held / unwired / failed heal is recorded in the outcome, never paged.
     *
     * @param {Object} options
     * @param {String} options.action The classifier's terminal heal action (a member of `HEAL_ACTIONS`, or a nullish/unknown action which the gate resolves to a recorded no-op).
     * @param {String} [options.collection] Collection-scoped target.
     * @param {Object} [options.targetSet] `restore-empty-target` target set.
     * @param {Object} [options.evidence] The diagnosis evidence, passed through to the wired operation.
     * @param {Number} options.now Epoch milliseconds (the injected clock, supplied by the runner).
     * @returns {Promise<Object>} The dispatch outcome record `{action, collection, status, detail, healedAt}` — never a page.
     */
    async applyHeal({action, collection, targetSet, evidence, now} = {}) {
        let targetKey = collection;

        if (action === RESTORE_EMPTY_TARGET_ACTION) {
            try {
                targetKey = deriveRestoreTargetSetIdentity(targetSet).recoveryUnitKey
            } catch {
                // `dispatchHeal` owns the fail-closed unsafe-input decision for a
                // malformed target set. No history lookup is needed first.
                targetKey = null
            }
        }

        const recentRuns = typeof this.recentRunsReader === 'function' && targetKey
            ? await this.recentRunsReader(targetKey)
            : [];

        const outcome = await dispatchHeal({
            action,
            collection,
            targetSet,
            evidence,
            recentRuns,
            now,
            healOperations: this.healOperations,
            recordRun     : this.recordRun
        });

        // Persist the OUTCOME (what happened) — `recordRun` only captured the pre-execution attempt. This is the
        // durable record the chronic-`unsafe-input` detector + the systemic circuit-breaker read. Observability,
        // never a gate: a recording failure must not break or re-trigger the heal, so it is swallowed.
        if (typeof this.recordHealOutcome === 'function') {
            try {
                await this.recordHealOutcome(outcome);
            } catch (recordError) {
                // best-effort telemetry — the heal already happened; never let a ledger-write fault break it
            }
        }

        return outcome;
    }
}

export default Neo.setupClass(DataRecoveryActuatorService);
