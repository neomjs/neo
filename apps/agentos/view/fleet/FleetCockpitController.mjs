import Controller                   from '../../../../src/controller/Component.mjs';
import {handleFleetLifecycleIntent} from './fleetLifecycleIntentAdapter.mjs';

/**
 * Controller for {@link AgentOS.view.fleet.FleetCockpit} — the cockpit is the **composition root** of
 * the B4÷C2 seam: the one place that knows both the resident cards and the fleet bridge, so the wire
 * lives here (the cards themselves stay intent-only and never touch transport).
 *
 * Two entry points, both driving the C2 adapter (`handleFleetLifecycleIntent`) → the registry bridge →
 * honest per-record round-trip state, never an optimistic success:
 * - `onAgentLifecycleIntent` — catches a single card's `lifecycleIntent` (resolved up the controller
 *   chain via the card's listener) and dispatches it for that card's record.
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
     * each a `start` intent + that card's roster record to `handleFleetLifecycleIntent`, so every
     * resident drives its own honest round-trip (pending → settled / rejected), never an optimistic
     * fleet-wide success. Starting an already-running resident is the bridge's concern; the per-record
     * honest state reflects whatever actually happens.
     *
     * After the fan-out settles, the roster is re-polled ONCE (not per card) so every resident that
     * actually started advances from its stale pre-start state to live runtime truth — see
     * {@link #refreshRosterOnSettle}.
     */
    onStartFleet() {
        const results = this.getAgentCards().map(card => {
            const {record} = card;

            return handleFleetLifecycleIntent({action: 'start', agentId: record?.agentId ?? null}, record)
        });

        return this.refreshRosterOnSettle(Promise.all(results).then(settled => settled.some(result => result?.ok)))
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
     * roster record to the C2 adapter (`handleFleetLifecycleIntent`). The adapter calls the registry
     * bridge and writes honest pending / settled / rejected state onto the record via `record.set()`;
     * the store's `recordChange` re-renders the card — never an optimistic success.
     * @param {Object} data The `lifecycleIntent` payload `{action, agentId, source}` — Neo stamps `source`.
     */
    onAgentLifecycleIntent(data) {
        const card = Neo.getComponent(data.source);

        return card && this.refreshRosterOnSettle(
            handleFleetLifecycleIntent(data, card.record).then(result => Boolean(result?.ok))
        )
    }

    /**
     * @summary Re-poll the roster once a lifecycle intent has genuinely changed runtime state.
     *
     * `loadRoster` is the ONLY path that maps live runtime truth onto the roster records, and the
     * cockpit calls it once at construct — so without this, a started resident's card stays at its
     * stale pre-start state until a page reload (the observe half of define→start→observe). Here the
     * cockpit re-polls exactly when a settle reports a real change (`ok`), and never on a rejected /
     * timeout / unauthorized outcome (its honest reason render must stand — a refresh could clobber it
     * with a stale snapshot). `loadRoster` is idempotent + fail-closed, so a redundant call is safe.
     * @param {Promise<Boolean>} settledOk Resolves true when at least one intent changed runtime state.
     * @protected
     */
    async refreshRosterOnSettle(settledOk) {
        if (await settledOk) {
            this.component.loadRoster()
        }
    }
}

export default Neo.setupClass(FleetCockpitController);
