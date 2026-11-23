import KpiModel from './KpiModel.mjs';
import Store    from '../../../src/data/Store.mjs';

/**
 * @summary The key figures every tile of the sortable dashboard shows. It is the one source of the readings: a
 * tile shows its record wherever the tile is, in the dashboard or in a window of its own, because the App worker
 * that holds this store serves both windows.
 * @class Neo.examples.dashboard.sortable.KpiStore
 * @extends Neo.data.Store
 */
class KpiStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.sortable.KpiStore'
         * @protected
         */
        className: 'Neo.examples.dashboard.sortable.KpiStore',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=KpiModel
         */
        model: KpiModel
    }
}

export default Neo.setupClass(KpiStore);
