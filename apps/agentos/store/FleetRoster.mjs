import FleetAgentModel from '../model/FleetAgent.mjs';
import Store           from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.FleetRoster
 * @extends Neo.data.Store
 *
 * @summary The cockpit fleet roster — ONE Store of {@link AgentOS.model.FleetAgent} records as the
 * single source of truth for every fleet surface (the ranked card grid, the health bar, the
 * lifecycle-control round-trip). **Not a singleton**: the sharing scope is the `state.Provider`
 * that hosts it (`FleetCockpit`'s provider `stores` block — "if used inside a state provider, we
 * get it anyway"), so views bind the shared instance via `bind: {store: 'stores.fleetRoster'}`
 * instead of importing module-global state (the `Portal.store.*` house pattern).
 *
 * The sample seed lives in `apps/agentos/resources/data/fleetRoster.json`, fetched via the Store's
 * native `url` pipeline (the provider declaration sets `autoLoad`) — the seven real cross-family
 * maintainer identities; session state + lane-line are an illustrative snapshot until
 * `FleetCockpit.loadRoster()` replaces it with the live registry roster. NO invented agents.
 */
class FleetRoster extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.FleetRoster'
         * @protected
         */
        className: 'AgentOS.store.FleetRoster',
        /**
         * The durable identity key. Declared on the store as well as the model: the collection
         * layer defaults `keyProperty` to `'id'`, which always wins the store-level
         * `this.keyProperty || this.model.keyProperty` fallback — so the model's `agentId` must be
         * mirrored here to take effect.
         * @member {String} keyProperty='agentId'
         */
        keyProperty: 'agentId',
        /**
         * @member {Neo.data.Model} model=FleetAgentModel
         * @reactive
         */
        model: FleetAgentModel,
        /**
         * @member {String} url='../../apps/agentos/resources/data/fleetRoster.json'
         */
        url: '../../apps/agentos/resources/data/fleetRoster.json'
    }
}

export default Neo.setupClass(FleetRoster);
