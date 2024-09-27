import MainStore from './MainStore.mjs';
import Model     from '../../../src/model/Component.mjs';
import Store     from '../../../src/data/Store.mjs';

const countrySymbol = Symbol.for('country');

/**
 * @class Neo.examples.table.nestedRecordFields.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.table.nestedRecordFields.MainContainerModel'
         * @protected
         */
        className: 'Neo.examples.table.nestedRecordFields.MainContainerModel',
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
                    ]},
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
                record[countrySymbol] = null;

                record.country = country
            })
        }
    }
}

export default Neo.setupClass(MainContainerModel);
