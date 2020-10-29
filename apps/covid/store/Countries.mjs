import Country from '../model/Country.mjs';
import Store   from '../../../src/data/Store.mjs';

/**
 * @class Covid.store.Countries
 * @extends Neo.data.Store
 */
class Countries extends Store {
    static getConfig() {return {
        className: 'Covid.store.Countries',

        keyProperty: 'country',
        model      : Country,

        sorters: [{
            property : 'active',
            direction: 'DESC'
        }]
    }}
}

Neo.applyClassConfig(Countries);

export {Countries as default};