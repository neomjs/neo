import MainStore     from './MainStore.mjs';
import StateProvider from '../../../src/state/Provider.mjs';
import Store         from '../../../src/data/Store.mjs';

const dataSymbol = Symbol.for('data');

/**
 * @class Neo.examples.grid.nestedRecordFields.ViewportStateProvider
 * @extends Neo.state.Provider
 */
class ViewportStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.nestedRecordFields.ViewportStateProvider'
         * @protected
         */
        className: 'Neo.examples.grid.nestedRecordFields.ViewportStateProvider',
        /**
         * @member {Object} stores
         */
        stores: {
            countries: {
                module     : Store,
                autoLoad   : true,
                keyProperty: 'code',
                listeners  : {load: 'onCountryStoreLoad'},
                url        : '../../../resources/examples/data/countries.json',

                model: {
                    fields: [
                        {name: 'code'},
                        {name: 'name'}
                    ]
                }
            },
            mainStore: MainStore
        }
    }

    /**
     * @param {Record[]} items
     */
    onCountryStoreLoad(items) {
        let me        = this,
            mainStore = me.getStore('mainStore'),
            country;

        // if the main table store is already loaded, the country field renderer had no data
        if (mainStore.getCount() > 0) {
            mainStore.items.forEach(record => {
                country = record.country;

                // hack resetting the current value to get a new record change
                record[dataSymbol].country = null;

                record.country = country
            })
        }
    }
}

export default Neo.setupClass(ViewportStateProvider);
