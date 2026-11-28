import MainStore     from './MainStore.mjs';
import StateProvider from '../../../src/state/Provider.mjs';
import Store         from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.table.cellEditing.MainContainerStateProvider
 * @extends Neo.state.Provider
 */
class MainContainerStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Neo.examples.table.cellEditing.MainContainerStateProvider'
         * @protected
         */
        className: 'Neo.examples.table.cellEditing.MainContainerStateProvider',
        /** @member {Object} data Country names indexed by their editable codes. */
        data: {countryNames: {}},
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

    /** @summary Publishes loaded names to cells without editing the Table records. */
    onCountryStoreLoad() {
        const names = {};

        this.getStore('countries').forEach(({code, name}) => names[code] = name);
        this.setData('countryNames', names)
    }
}

export default Neo.setupClass(MainContainerStateProvider);
