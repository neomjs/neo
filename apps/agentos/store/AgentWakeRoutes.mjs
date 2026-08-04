import Store              from '../../../src/data/Store.mjs';
import WakeRouteSeatModel from '../model/WakeRouteSeat.mjs';

/**
 * @class AgentOS.store.AgentWakeRoutes
 * @extends Neo.data.Store
 *
 * @summary Pane-local projection store for the decomposed per-seat wake-route rows. Each
 * WakeRoutePane owns its store and destroys it with the pane; the route truth remains query-time
 * on the plane and no record survives the view/process lifecycle.
 */
class AgentWakeRoutes extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.AgentWakeRoutes'
         * @protected
         */
        className: 'AgentOS.store.AgentWakeRoutes',
        /**
         * @member {String} keyProperty='agentIdentity'
         */
        keyProperty: 'agentIdentity',
        /**
         * @member {Neo.data.Model} model=WakeRouteSeatModel
         * @reactive
         */
        model: WakeRouteSeatModel
    }
}

export default Neo.setupClass(AgentWakeRoutes);
