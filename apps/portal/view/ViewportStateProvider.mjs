import StateProvider from '../../../src/state/Provider.mjs';

/**
 * @class Portal.view.ViewportStateProvider
 * @extends Neo.state.Provider
 */
class ViewportStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Portal.view.ViewportStateProvider'
         * @protected
         */
        className: 'Portal.view.ViewportStateProvider',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * Values are: large, medium, small, xSmall, null
             * @member {String|null} size
             */
            size: null
        }
    }
}

export default Neo.setupClass(ViewportStateProvider);
