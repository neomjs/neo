import FleetTenantModel from '../model/FleetTenant.mjs';
import Store            from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.FleetTenants
 * @extends Neo.data.Store
 *
 * @summary Provider-scoped public tenant roster shared by every Fleet configuration card. Empty is
 * honest until `listTenants()` returns; last-known rows survive a failed refresh.
 */
class FleetTenants extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.FleetTenants'
         * @protected
         */
        className: 'AgentOS.store.FleetTenants',
        /**
         * @member {Object[]} data=[]
         */
        data: [],
        /**
         * @member {Neo.data.Model} model=FleetTenantModel
         * @reactive
         */
        model: FleetTenantModel
    }
}

export default Neo.setupClass(FleetTenants);
