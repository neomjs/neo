import Provider         from '../../../../src/state/Provider.mjs';
import EffectManager    from '../../../../src/core/EffectManager.mjs';
import CreatedInstances from './store/CreatedInstances.mjs';
import {
    CREATION_EVENTS,
    CREATION_STATES,
    nextCreationState,
    applyPreviewOutcome,
    applyRouteOutcome
} from './util/creationFlowState.mjs';

/**
 * @class AgentOS.view.create.CreationStateProvider
 * @extends Neo.state.Provider
 *
 * @summary The create-module's shared state surface — the five keeper-flow states and the
 * created-instances registry as ONE declarative binding target for every consumer.
 *
 * Why a provider and not a config on some component: the flow state has MANY consumers (the
 * chat surface, the blueprint preview, the pane chrome, the promote affordance) spread across
 * the module's component tree — a provider in the hierarchy gives each of them a `bind` to the
 * same truth, where component-local configs would force consumers to locate and reach into one
 * specific component. Since the whole tree lives in the shared app worker, ALL of this state —
 * provider data and component configs alike — is naturally window-agnostic (windows are render
 * targets, instances never move); the provider's contribution is the declarative shared-binding
 * surface, and the promote step working across windows comes with it for free.
 *
 * Views bind `data.flowState` / `data.flowReason` / `data.candidateBlueprint` and the exposed
 * `stores.createdInstances`; they never re-derive "which state" from booleans and never write
 * flow state directly — {@link CreationStateProvider#applyFlowEvent} and its preview/accept
 * wrappers are the ONE writer family, guarded by the pure transition oracle. Illegal transitions
 * mutate nothing and return the oracle's bounded refusal, mirroring the pipeline's
 * `{accepted, reason}` vocabulary end to end.
 */
class CreationStateProvider extends Provider {
    static config = {
        /**
         * @member {String} className='AgentOS.view.create.CreationStateProvider'
         * @protected
         */
        className: 'AgentOS.view.create.CreationStateProvider',
        /**
         * The five SSOT flow states live here, beside the follow-up target the mutation path
         * defaults to. `flowReason` carries the ERROR state's "always a reason" render text.
         * @member {Object} data
         */
        data: {
            activeInstanceId  : null,
            candidateBlueprint: null,
            flowReason        : null,
            flowState         : CREATION_STATES.EMPTY
        },
        /**
         * The created-instances registry, exposed to bindings — grids/panes in ANY window read
         * the same singleton reactively instead of reaching into the component tree.
         * @member {Object} stores
         */
        stores: {
            createdInstances: CreatedInstances
        }
    }

    /**
     * The ONE flow-state writer: consults the transition oracle and applies ONLY legal
     * transitions to the provider data (one batched provider write). Illegal or unknown events leave
     * the data untouched and return the oracle's bounded result, so callers branch exactly as
     * they do on the pipeline's `{accepted, reason}` shapes — nothing throws.
     * @param {String} event One of the oracle's CREATION_EVENTS
     * @param {Object} [options]
     * @param {String} [options.reason] Refusal reason carried on a `refused` transition
     * @returns {{state: String, reason: String|null, changed: Boolean}} the oracle result
     */
    applyFlowEvent(event, {reason} = {}) {
        const result = nextCreationState(this.getData('flowState'), event, {reason});

        // the oracle's illegal shape: unchanged state + a reason. Everything else (including
        // legal same-state transitions and the reason-carrying `refused` arc) applies.
        this.applyOracleResult(result, this.flowDataForEvent(event));

        return result
    }

    /**
     * Maps an emit-side route outcome to the generating→preview fork through the same guarded
     * writer. Accepted candidates are parked on provider data for the preview card; refusals keep
     * the existing ERROR branch and never expose a candidate.
     * @param {{accepted: Boolean, reason: String|null, blueprint: Object|null}} outcome The route result
     * @returns {{state: String, reason: String|null, changed: Boolean}}
     */
    applyPreviewRouteOutcome(outcome) {
        const result = applyPreviewOutcome(this.getData('flowState'), outcome);

        this.applyOracleResult(result, {
            candidateBlueprint: outcome?.accepted ? outcome.blueprint || null : null
        });

        return result
    }

    /**
     * EDIT from a previewed candidate is a real flow event: the candidate is cleared by the provider
     * wrapper that records the event, not by component-local state.
     * @returns {{state: String, reason: String|null, changed: Boolean}}
     */
    applyPreviewEdit() {
        const result = nextCreationState(this.getData('flowState'), CREATION_EVENTS.EDIT);

        this.applyOracleResult(result, {candidateBlueprint: null});

        return result
    }

    /**
     * Maps the accept path to the terminal fork. MATERIALIZED is truth only after the stage insert
     * succeeded; refused accept paths land ERROR and clear the preview candidate.
     * @param {{accepted: Boolean, reason: String|null}} outcome The accept-path result
     * @param {String|null} [instanceId=null] Active instance id when accepted
     * @returns {{state: String, reason: String|null, changed: Boolean}}
     */
    applyCreationRouteOutcome(outcome, instanceId=null) {
        const result = applyRouteOutcome(this.getData('flowState'), outcome);

        this.applyOracleResult(result, {
            activeInstanceId  : outcome?.accepted ? instanceId : null,
            candidateBlueprint: null
        });

        return result
    }

    /**
     * Active instance cleanup belongs with the provider data that records it.
     */
    clearActiveInstance() {
        this.setData({activeInstanceId: null})
    }

    /**
     * Extra data mutations coupled to legal flow events.
     * @param {String} event
     * @returns {Object}
     * @protected
     */
    flowDataForEvent(event) {
        return event === CREATION_EVENTS.RESET || event === CREATION_EVENTS.DISPOSE
            ? {candidateBlueprint: null}
            : {}
    }

    /**
     * Applies an oracle result plus same-event provider data in one batch.
     * @param {{state: String, reason: String|null, changed: Boolean}} result
     * @param {Object} [extraData={}]
     * @protected
     */
    applyOracleResult(result, extraData={}) {
        if (result.changed || result.reason === null) {
            const
                data                     = {...extraData},
                hasCandidateBlueprintKey = Object.prototype.hasOwnProperty.call(data, 'candidateBlueprint'),
                candidateBlueprint       = data.candidateBlueprint;

            delete data.candidateBlueprint;

            EffectManager.pause();
            try {
                this.internalSetData({
                    ...data,
                    flowReason: result.reason,
                    flowState : result.state
                }, undefined, this);

                if (hasCandidateBlueprintKey) {
                    this.setAtomicData('candidateBlueprint', candidateBlueprint)
                }
            } finally {
                EffectManager.resume()
            }
        }
    }

    /**
     * Provider `setData()` expands plain objects into nested configs; route candidates need to stay
     * atomic so bindings can read `data.candidateBlueprint` as the display source object.
     * @param {String} key
     * @param {*} value
     * @protected
     */
    setAtomicData(key, value) {
        const config = this.getDataConfig(key);

        if (!config) {
            this.internalSetData(key, value, this);
            return
        }

        const
            adjusted = this.adjustValue(value),
            oldValue = config.get(),
            changed  = config.set(adjusted);

        if (changed) {
            this.onDataPropertyChange(key, adjusted, oldValue)
        }
    }
}

export default Neo.setupClass(CreationStateProvider);
