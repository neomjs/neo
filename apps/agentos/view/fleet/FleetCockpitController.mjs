import Controller                   from '../../../../src/controller/Component.mjs';
import {handleFleetLifecycleIntent} from './fleetLifecycleIntentAdapter.mjs';

/**
 * Controller for {@link AgentOS.view.fleet.FleetCockpit}: the whole-fleet control verb — the design
 * SSOT §01 "▶ Start morning fleet", the one-click morning start. Like the per-card
 * {@link AgentOS.view.fleet.AgentCardController}, it fires a lifecycle **intent** and stops there; the
 * cockpit→lifecycle round-trip is the Lane-C seam (per the accepted B4÷C2 cut — controls stay
 * intent-only). A whole-fleet intent carries `scope: 'fleet'` instead of an `agentId`, so the one
 * consumer distinguishes a fleet-wide fan-out from a single resident's verb.
 *
 * @class AgentOS.view.fleet.FleetCockpitController
 * @extends Neo.controller.Component
 */
class FleetCockpitController extends Controller {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.FleetCockpitController'
         * @protected
         */
        className: 'AgentOS.view.fleet.FleetCockpitController'
    }

    /**
     * @summary Fires the whole-fleet start intent (the one-click morning start).
     *
     * Intent-only: fires one `lifecycleIntent {action: 'start', scope: 'fleet'}` on the cockpit and
     * never calls the fleet bridge itself — the round-trip + honest settlement are the Lane-C
     * responsibility (the B4÷C2 boundary).
     */
    onStartFleet() {
        this.component.fire('lifecycleIntent', {action: 'start', scope: 'fleet'})
    }

    /**
     * @summary Consume a card's `lifecycleIntent` and drive the honest round-trip — the B4÷C2 seam.
     *
     * A card's control cluster fires an intent-only `lifecycleIntent {action, agentId}` and never
     * touches transport. The cockpit is the composition root that knows both the cards and the fleet
     * bridge: it resolves the firing card from the event `source`, then hands the intent + that card's
     * `state.Provider` to the C2 adapter (`handleFleetLifecycleIntent`). The adapter calls the registry
     * bridge and writes honest pending / settled / rejected state back onto the provider the card
     * renders — never an optimistic success.
     * @param {Object} data The `lifecycleIntent` payload `{action, agentId, source}` — Neo stamps `source`.
     */
    onAgentLifecycleIntent(data) {
        const card = Neo.getComponent(data.source);

        card && handleFleetLifecycleIntent(data, card.getStateProvider())
    }
}

export default Neo.setupClass(FleetCockpitController);
