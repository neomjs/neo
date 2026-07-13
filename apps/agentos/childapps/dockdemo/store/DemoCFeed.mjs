import DemoCRecord from '../model/DemoCRecord.mjs';
import Store       from '../../../../../src/data/Store.mjs';

/**
 * @summary The provider-owned Store<Model> receiving Demo C's batched live feed.
 *
 * Production cadence belongs to the workspace, whose lifetime survives pane parking. This
 * store owns only collection policy: newest rows first and an explicit 500-record cap.
 *
 * @class AgentOS.childapps.dockdemo.store.DemoCFeed
 * @extends Neo.data.Store
 */
class DemoCFeed extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.childapps.dockdemo.store.DemoCFeed'
         * @protected
         */
        className: 'AgentOS.childapps.dockdemo.store.DemoCFeed',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Number} maxRecords=500
         */
        maxRecords: 500,
        /**
         * @member {Neo.data.Model} model=DemoCRecord
         */
        model: DemoCRecord,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{property: 'id', direction: 'DESC'}]
    }
}

export default Neo.setupClass(DemoCFeed);
