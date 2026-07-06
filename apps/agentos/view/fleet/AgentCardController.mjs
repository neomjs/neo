import Controller from '../../../../src/controller/Component.mjs';

/**
 * Controller for {@link AgentOS.view.fleet.AgentCard}: turns the card's start/stop/restart controls
 * (the B4 lane) into a single lifecycle **intent** event — and stops there. The card owns the
 * intent-emit; the cockpit→lifecycle round-trip that consumes it (`FleetControlBridge.startAgent`
 * and its siblings) is the Lane C (C2) seam. Keeping the boundary here means the card stays a pure
 * presentation + intent surface and never imports the Brain-side fleet bridge.
 *
 * @class AgentOS.view.fleet.AgentCardController
 * @extends Neo.controller.Component
 */
class AgentCardController extends Controller {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.AgentCardController'
         * @protected
         */
        className: 'AgentOS.view.fleet.AgentCardController'
    }

    /**
     * @summary Fires the card's lifecycle intent for the clicked control.
     *
     * Reads the durable `agentId` from the per-card state provider and the `action`
     * (`start` | `stop` | `restart`) off the button that triggered it, then fires ONE
     * `lifecycleIntent` event `{action, agentId}` on the card. The Lane C (C2) round-trip listens
     * for this and drives `FleetControlBridge`; this controller intentionally does NOT call the
     * bridge — that boundary is the B4 ÷ C2 seam.
     * @param {Object} data The button click event; `data.component.action` carries the verb.
     */
    onLifecycleIntent(data) {
        let me      = this,
            action  = data.component.action,
            agentId = me.getStateProvider().getData('agentId');

        me.component.fire('lifecycleIntent', {action, agentId})
    }
}

export default Neo.setupClass(AgentCardController);
