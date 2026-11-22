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
             * @member {Number|null} blogPostCount=null
             */
            blogPostCount: null,
            /**
             * Values are: large, medium, small, xSmall, null
             * @member {String|null} size
             */
            size: null,
            /**
             * The theme on screen, written by `Portal.view.ViewportController`. The examples' launch links pass it on,
             * so an example opens in the catalog's theme. null until the boot theme is known.
             * @member {String|null} theme=null
             */
            theme: null
        }
    }
}

export default Neo.setupClass(ViewportStateProvider);
