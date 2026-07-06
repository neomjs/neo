import Controller                   from '../../../../src/controller/Component.mjs';
import {handleFleetLifecycleIntent} from './fleetLifecycleIntentAdapter.mjs';

/**
 * Controller for {@link AgentOS.view.fleet.FleetCockpit} — the cockpit is the **composition root** of
 * the B4÷C2 seam: the one place that knows both the resident cards and the fleet bridge, so the wire
 * lives here (the cards themselves stay intent-only and never touch transport).
 *
 * Two entry points, both driving the C2 adapter (`handleFleetLifecycleIntent`) → the registry bridge →
 * honest per-card round-trip state, never an optimistic success:
 * - `onAgentLifecycleIntent` — catches a single card's `lifecycleIntent` (resolved up the controller
 *   chain via the card's listener) and dispatches it for that card.
 * - `onStartFleet` — the design SSOT §01 "▶ Start morning fleet" one-click: fans `start` out to every
 *   rendered card, so each resident drives its own honest round-trip.
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
     * @summary The one-click morning start — fan `start` out to every resident card via the C2 adapter.
     *
     * The cockpit owns the wire (the cards stay intent-only): it enumerates the rendered cards and hands
     * each a `start` intent + that card's `state.Provider` to `handleFleetLifecycleIntent`, so every
     * resident drives its own honest round-trip (pending → settled / rejected), never an optimistic
     * fleet-wide success. Starting an already-running resident is the bridge's concern; the per-card
     * honest state reflects whatever actually happens.
     */
    onStartFleet() {
        this.getAgentCards().forEach(card => {
            const provider = card.getStateProvider();

            handleFleetLifecycleIntent({action: 'start', agentId: provider.getData('agentId')}, provider)
        })
    }

    /**
     * @summary The rendered resident cards — the fleet grid's card region (a no-controller container, so
     * its `fleet-cards` reference resolves up to this controller); the collapsed-idle fold and the header
     * sub-tree are excluded by ntype.
     * @returns {Neo.component.Base[]}
     */
    getAgentCards() {
        return (this.getReference('fleet-cards')?.items ?? []).filter(card => card.ntype === 'fm-agent-card')
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
