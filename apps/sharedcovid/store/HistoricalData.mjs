import {default as HistoricalDataModel} from '../model/HistoricalData.mjs';
import Store                            from '../../../src/data/Store.mjs';

/**
 * @class SharedCovid.store.HistoricalData
 * @extends Neo.data.Store
 */
class HistoricalData extends Store {
    static getConfig() {return {
        className: 'SharedCovid.store.HistoricalData',

        keyProperty: 'date',
        model      : HistoricalDataModel,

        sorters: [{
            property : 'date',
            direction: 'DESC'
        }]
    }}
}

Neo.applyClassConfig(HistoricalData);

export {HistoricalData as default};