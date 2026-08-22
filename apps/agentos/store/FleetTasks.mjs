import FleetTaskModel from '../model/FleetTask.mjs';
import Store          from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.FleetTasks
 * @extends Neo.data.Store
 *
 * @summary Pane-local projection store for the deployment's task rows across all three sections.
 * Each TasksPane owns its store and destroys it with the pane; the rows remain query-time on the
 * plane and no record survives the view/process lifecycle.
 */
class FleetTasks extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.FleetTasks'
         * @protected
         */
        className: 'AgentOS.store.FleetTasks',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=FleetTaskModel
         * @reactive
         */
        model: FleetTaskModel
    }
}

export default Neo.setupClass(FleetTasks);
