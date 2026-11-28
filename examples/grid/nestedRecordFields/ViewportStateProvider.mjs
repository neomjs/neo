import MainStore     from './MainStore.mjs';
import StateProvider from '../../../src/state/Provider.mjs';
import Store         from '../../../src/data/Store.mjs';

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
                url        : new URL(Neo.config.basePath + 'resources/examples/data/countries.json', Neo.config.url.base).href,

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
}

export default Neo.setupClass(ViewportStateProvider);
