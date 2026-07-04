import Provider                                                from '../../../../src/state/Provider.mjs';
import CreatedInstances                                        from './store/CreatedInstances.mjs';
import {CREATION_STATES, nextCreationState, applyRouteOutcome} from './util/creationFlowState.mjs';

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
 * Views bind `data.flowState` / `data.flowReason` and the exposed `stores.createdInstances`;
 * they never re-derive "which state" from booleans and never write flow state directly —
 * {@link CreationStateProvider#applyFlowEvent} is the ONE writer, guarded by the pure transition
 * oracle. Illegal transitions mutate nothing and return the oracle's bounded refusal, mirroring
 * the pipeline's `{accepted, reason}` vocabulary end to end.
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
            activeInstanceId: null,
            flowReason      : null,
            flowState       : CREATION_STATES.EMPTY
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
     * transitions to the provider data (one batched `setData`). Illegal or unknown events leave
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
        if (result.changed || result.reason === null) {
            this.setData({
                flowReason: result.reason,
                flowState : result.state
            })
        }

        return result
    }

    /**
     * Maps an accept-path / route outcome to the generating→terminal fork through the same
     * guarded writer — the ERROR state receives the pipeline's refusal reason for the SSOT's
     * "always a reason" render.
     * @param {{accepted: Boolean, reason: String|null}} outcome The route/accept-path result
     * @returns {{state: String, reason: String|null, changed: Boolean}}
     */
    applyCreationRouteOutcome(outcome) {
        const result = applyRouteOutcome(this.getData('flowState'), outcome);

        if (result.changed || result.reason === null) {
            this.setData({
                flowReason: result.reason,
                flowState : result.state
            })
        }

        return result
    }
}

export default Neo.setupClass(CreationStateProvider);
