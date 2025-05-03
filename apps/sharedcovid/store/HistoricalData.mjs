import HistoricalDataModel from '../model/HistoricalData.mjs';
import Store               from '../../../src/data/Store.mjs';

/**
 * @class SharedCovid.store.HistoricalData
 * @extends Neo.data.Store
 */
class HistoricalData extends Store {
    static config = {
        className: 'SharedCovid.store.HistoricalData',

        keyProperty: 'date',
        model      : HistoricalDataModel,

        sorters: [{
            property : 'date',
            direction: 'DESC'
        }]
    }
}

export default Neo.setupClass(HistoricalData);
