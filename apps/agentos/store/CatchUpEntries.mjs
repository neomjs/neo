import CatchUpEntryModel from '../model/CatchUpEntry.mjs';
import Store             from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.CatchUpEntries
 * @extends Neo.data.Store
 *
 * @summary Pane-local projection store for catch-up source slots and partition choices. Each
 * CatchUpPane owns its stores and destroys them with the pane; Fleet history remains query-time and
 * no record survives the view/process lifecycle.
 */
class CatchUpEntries extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.CatchUpEntries'
         * @protected
         */
        className: 'AgentOS.store.CatchUpEntries',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=CatchUpEntryModel
         * @reactive
         */
        model: CatchUpEntryModel
    }
}

export default Neo.setupClass(CatchUpEntries);
