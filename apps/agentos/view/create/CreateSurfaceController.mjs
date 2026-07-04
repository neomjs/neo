import Controller                                                from '../../../../src/controller/Component.mjs';
import CreatedInstances                                          from './store/CreatedInstances.mjs';
import {CREATION_EVENTS}                                         from './util/creationFlowState.mjs';
import {routeCreationRequest}                                    from './util/requestRoute.mjs';
import {acceptBlueprint, createInsertRegistrar, disposeInstance} from './util/acceptPath.mjs';

let instanceSeq = 0;

/**
 * @summary Deterministic intent→blueprint fallback — the placeholder the NL wiring leaf replaces.
 * Produces a small `grid@1` blueprint titled from the intent text so the wedge is demoable end to
 * end TODAY; it is deliberately dumb (no parsing intelligence) and clearly labeled as the
 * deterministic default the injectable `generateBlueprint` seam swaps out.
 * @param {String} request The user's intent text
 * @returns {Object} a `grid@1` blueprint candidate
 */
export function deterministicBlueprintFallback(request) {
    const title = request.trim().slice(0, 60) || 'Untitled Grid';

    return {
        schema: 'grid@1',
        title,
        config: {columns: [{field: 'item', text: 'Item'}, {field: 'note', text: 'Note'}]},
        data  : [
            {item: 'created from', note: title},
            {item: 'state',        note: 'materialized via the keeper flow'}
        ]
    }
}

/**
 * @class AgentOS.view.create.CreateSurfaceController
 * @extends Neo.controller.Component
 *
 * @summary Drives the keeper flow: every user event routes through the create-module provider's
 * ONE oracle-guarded writer (`applyFlowEvent` / `applyCreationRouteOutcome`) — this controller
 * holds NO flow booleans and never writes flow state directly. The submit path runs the full
 * merged spine: route (emit-validate) → route outcome onto the provider → accept path
 * (accept-validate + the stage `add → insert` seam) → the insert registrar records the instance.
 *
 * The blueprint generator is an injectable seam (`generateBlueprint` config): the NL wiring leaf
 * provides the live one; the deterministic fallback keeps the wedge demoable without it, and
 * tests inject doubles.
 */
class CreateSurfaceController extends Controller {
    static config = {
        /**
         * @member {String} className='AgentOS.view.create.CreateSurfaceController'
         * @protected
         */
        className: 'AgentOS.view.create.CreateSurfaceController',
        /**
         * Async `(request) => blueprint candidate`. Injectable; defaults to the deterministic
         * fallback until the NL leaf lands the live generator.
         * @member {Function|null} generateBlueprint=null
         */
        generateBlueprint: null
    }

    /**
     * Wires the insert registrar once the view tree exists: the stage container's `insert` event
     * writes the registry record — truth at the same moment the component lands in the stage.
     * @protected
     */
    onComponentConstructed() {
        const stage = this.getReference('create-stage');

        stage?.on('insert', createInsertRegistrar({registry: CreatedInstances}), this)
    }

    /**
     * The provider owning the flow state — the surface's `stateProvider`.
     * @returns {AgentOS.view.create.CreationStateProvider}
     */
    getProvider() {
        return this.component.getStateProvider()
    }

    /**
     * Intent field input: first keystroke moves empty → composing (legal same-state edits after).
     * @protected
     */
    onIntentChange() {
        const provider = this.getProvider(),
              state    = provider.getData('flowState');

        provider.applyFlowEvent(state === 'empty' ? CREATION_EVENTS.COMPOSE : CREATION_EVENTS.EDIT)
    }

    /**
     * The submit path — the whole spine in one handler, every step branching on bounded
     * `{accepted, reason}` shapes, nothing thrown into the render:
     * composing → generating → (route) → materialized | error.
     * @protected
     */
    async onSubmitIntent() {
        const me       = this,
              provider = me.getProvider(),
              field    = me.getReference('intent-field'),
              request  = String(field?.value || '');

        const submitted = provider.applyFlowEvent(CREATION_EVENTS.SUBMIT);

        if (submitted.state !== 'generating') return; // illegal from the current state — oracle said no, nothing mutated

        const generate = me.generateBlueprint || (async text => deterministicBlueprintFallback(text));
        const routed   = await routeCreationRequest({request, generate});

        const outcome = provider.applyCreationRouteOutcome(routed);

        if (!routed.accepted || outcome.state !== 'materialized') return; // ERROR state carries the reason for the render

        const instanceId = `keeper-grid-${++instanceSeq}`,
              accepted   = acceptBlueprint({
                  blueprint: routed.blueprint,
                  instanceId,
                  stage    : me.getReference('create-stage'),
                  registry : CreatedInstances
              });

        if (accepted.accepted) {
            provider.setData({activeInstanceId: instanceId})
        } else {
            // accept-stage refusal AFTER route acceptance (duplicate id, dead stage): honest error state
            provider.applyFlowEvent(CREATION_EVENTS.REFUSED, {reason: accepted.reason})
        }
    }

    /**
     * ERROR → composing (edit-and-retry — never a dead-end).
     * @protected
     */
    onRetry() {
        this.getProvider().applyFlowEvent(CREATION_EVENTS.RETRY)
    }

    /**
     * Disposes the active instance (component destroyed via the core instance manager inside the
     * accept path) and returns the flow to the empty invitation.
     * @protected
     */
    onDispose() {
        const provider   = this.getProvider(),
              instanceId = provider.getData('activeInstanceId');

        if (instanceId) {
            disposeInstance({instanceId, registry: CreatedInstances});
            provider.setData({activeInstanceId: null})
        }

        provider.applyFlowEvent(CREATION_EVENTS.DISPOSE)
    }

    /**
     * Cancel/reset from any state back to the empty invitation.
     * @protected
     */
    onReset() {
        this.getProvider().applyFlowEvent(CREATION_EVENTS.RESET)
    }
}

export default Neo.setupClass(CreateSurfaceController);
