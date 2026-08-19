import FleetInstanceModel from '../model/FleetInstance.mjs';
import Store              from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.FleetInstances
 * @extends Neo.data.Store
 *
 * @summary Provider-scoped roster of configured Agent OS instances — the view BINDING over C1
 * profile records, never a second storage. `apps/agentos/fleet/connectionProfiles.mjs` stays the
 * only record authority (creation, validation, rehydration); this Store holds what that module
 * returned, and every mutation routes back through it. Which row is BOUND is deliberately not a
 * field here: the published bridge's `profileId` is that SSOT, mirrored into provider data by the
 * switch/boot owner — a bound flag on rows would be a second copy that can drift.
 */
class FleetInstances extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.FleetInstances'
         * @protected
         */
        className: 'AgentOS.store.FleetInstances',
        /**
         * @member {Object[]} data=[]
         */
        data: [],
        /**
         * Set on the STORE, not only the model: the collection default (`'id'`) is always truthy,
         * so `getKeyProperty()`'s model fallback never fires — without this line, `get(profileId)`
         * silently keys rows by a missing `id` field.
         * @member {String} keyProperty='profileId'
         */
        keyProperty: 'profileId',
        /**
         * @member {Neo.data.Model} model=FleetInstanceModel
         * @reactive
         */
        model: FleetInstanceModel,
        /**
         * Stable menu order: labels alphabetically, endpoint as the tiebreaker for unlabeled rows.
         * @member {Object[]} sorters
         */
        sorters: [{
            property : 'label',
            direction: 'ASC'
        }, {
            property : 'canonicalEndpoint',
            direction: 'ASC'
        }]
    }
}

export default Neo.setupClass(FleetInstances);
