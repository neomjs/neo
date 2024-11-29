import MainStore     from './MainStore.mjs';
import StateProvider from '../../../src/state/Provider.mjs';

/**
 * @class Neo.examples.stateProvider.table.MainContainerStateProvider
 * @extends Neo.state.Provider
 */
class MainContainerStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.table.MainContainerStateProvider'
         * @protected
         */
        className: 'Neo.examples.stateProvider.table.MainContainerStateProvider',
        /**
         * @member {Object} stores
         */
        stores: {
            main: MainStore
        }
    }
}

export default Neo.setupClass(MainContainerStateProvider);
