import Record from '../model/Record.mjs';
import Store  from '../../../src/data/Store.mjs';

/**
 * @summary The provider-owned Store<Model> receiving Workstation's batched live feed.
 *
 * Production cadence belongs to the workspace, whose lifetime survives pane parking. This
 * store owns only collection policy: newest rows first and an explicit 500-record cap.
 *
 * @class Workstation.store.Feed
 * @extends Neo.data.Store
 */
class Feed extends Store {
    static config = {
        /**
         * @member {String} className='Workstation.store.Feed'
         * @protected
         */
        className: 'Workstation.store.Feed',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Number} maxRecords=500
         */
        maxRecords: 500,
        /**
         * @member {Neo.data.Model} model=Record
         */
        model: Record,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{property: 'id', direction: 'DESC'}]
    }
}

export default Neo.setupClass(Feed);
