import BaseStore from '../../../src/data/Store.mjs';
import Model     from './Model.mjs';

/**
 * @class Neo.examples.table.covid.Store
 * @extends Neo.data.Store
 */
class Store extends BaseStore {
    static getConfig() {return {
        className  : 'Neo.examples.table.covid.Store',
        keyProperty: 'country',
        model      : Model,

        sorters: [{
            property : 'active',
            direction: 'DESC'
        }]
    }}
}

Neo.applyClassConfig(Store);

export default Store;
