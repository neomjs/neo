import Base           from '../../../../src/core/Base.mjs';
import {dispatchHeal} from '../../../services/memory-core/helpers/healActionDispatch.mjs';

/**
 * @module ai/daemons/orchestrator/services/DataRecoveryActuatorService
 * @summary The autonomous data-recovery actuator — the `applyHeal` terminal that replaces the DELETED
 * `escalate`/`page` path. Given a classifier's heal action + the target collection, it runs the action through
 * the pure dispatch core's safety gate (`dispatchHeal`: rate-limit + anti-thrash) and executes the heal via an
 * INJECTED operation. **No operator, no escalate:** a held / unwired / failed heal is RECORDED in the returned
 * outcome, never paged. In an operatorless cloud deploy a runtime page is incoherent; this is the autonomous
 * terminal the data-integrity runner routes every diagnosis to.
 *
 * ⚠️ **INTERIM (the escalate-deletion cutover — a gated-actuator bridge).** The privileged heal operations
 * (re-embed-missing / re-embed-rows / restore-delta-merge / quarantine / defrag) are NOT wired here yet — they
 * arrive via the wired-actuator follow-up (itself gated on the raw-evidence producer re-route). Until then
 * `healOperations` is empty, so every cleared action resolves to `deferred` (autonomous, recorded, never a
 * page) — already strictly better than the deleted escalate, which paged into an operatorless void. The
 * follow-up injects the real `healOperations` + the `recentRuns` reader/recorder, turning *defer* into *act*
 * without touching this seam: the runner's `applyHeal({action, collection, evidence, now})` contract is stable
 * across the interim → wired transition.
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
     * **Interim:** empty → every action defers (autonomous, never a page). The wired-actuator follow-up adds
     * re-embed / restore / quarantine / defrag. A set-once injected dependency — a plain field, not a reactive
     * config (assigned once at construction, never observed), so the Config-controller machinery would be pure
     * overhead.
     * @member {Object} healOperations={}
     */
    healOperations = {}
    /**
     * Injected recent-runs reader: `async (collection) => Object[]` — the anti-thrash history the dispatch
     * core's gate consults. **Interim:** null → the gate sees no history (always within-bounds), which is safe
     * because no mutating op runs yet (all-defer). The wired-actuator follow-up supplies the real per-collection
     * store. A set-once injected dependency.
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
     * @summary The autonomous heal terminal — routes the classifier's action through the dispatch core's safety
     * gate + the injected operation, returning the uniform outcome record. The DELETED escalate path's
     * replacement: a held / unwired / failed heal is recorded in the outcome, never paged.
     *
     * @param {Object} options
     * @param {String} options.action The classifier's terminal heal action (a member of `HEAL_ACTIONS`, or a nullish/unknown action which the gate resolves to a recorded no-op).
     * @param {String} options.collection The target collection.
     * @param {Object} [options.evidence] The diagnosis evidence, passed through to the wired operation.
     * @param {Number} options.now Epoch milliseconds (the injected clock, supplied by the runner).
     * @returns {Promise<Object>} The dispatch outcome record `{action, collection, status, detail, healedAt}` — never a page.
     */
    async applyHeal({action, collection, evidence, now} = {}) {
        const recentRuns = typeof this.recentRunsReader === 'function' ? await this.recentRunsReader(collection) : [];

        return dispatchHeal({
            action,
            collection,
            evidence,
            recentRuns,
            now,
            healOperations: this.healOperations,
            recordRun     : this.recordRun
        });
    }
}

export default Neo.setupClass(DataRecoveryActuatorService);
