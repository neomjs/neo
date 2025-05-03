import StateProvider from '../../../../src/state/Provider.mjs';
import UserStore     from '../store/Users.mjs';

/**
 * @class Neo.examples.toolbar.paging.view.MainContainerStateProvider
 * @extends Neo.state.Provider
 */
class MainContainerStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.paging.view.MainContainerStateProvider'
         * @protected
         */
        className: 'Neo.examples.toolbar.paging.view.MainContainerStateProvider',
        /**
         * @member {Object} stores
         */
        stores: {
            users: {
                module  : UserStore,
                pageSize: 30
            }
        }
    }
}

export default Neo.setupClass(MainContainerStateProvider);
