import MainStore     from './MainStore.mjs';
import StateProvider from '../../../src/state/Provider.mjs';
import Store         from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.grid.cellEditing.MainContainerStateProvider
 * @extends Neo.state.Provider
 */
class MainContainerStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.cellEditing.MainContainerStateProvider'
         * @protected
         */
        className: 'Neo.examples.grid.cellEditing.MainContainerStateProvider',
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

    /** @summary Repaints mounted country labels when their lookup arrives. */
    onCountryStoreLoad() {
        this.component?.exampleComponent?.repaintCells()
    }
}

export default Neo.setupClass(MainContainerStateProvider);
