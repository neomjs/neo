import Contributors  from '../../store/Contributors.mjs';
import StateProvider from '../../../../src/state/Provider.mjs';

/**
 * @class DevIndex.view.home.MainContainerStateProvider
 * @extends Neo.state.Provider
 */
class MainContainerStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='DevIndex.view.home.MainContainerStateProvider'
         * @protected
         */
        className: 'DevIndex.view.home.MainContainerStateProvider',
        /**
         * @member {Object} stores
         */
        stores: {
            contributors: {
                module: Contributors
            }
        }
    }
}

export default Neo.setupClass(MainContainerStateProvider);
