import StateProvider from '../../../src/state/Provider.mjs';

/**
 * @class DevIndex.view.ViewportStateProvider
 * @extends Neo.state.Provider
 */
class ViewportStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='DevIndex.view.ViewportStateProvider'
         * @protected
         */
        className: 'DevIndex.view.ViewportStateProvider',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * @member {Boolean} data.animateGridVisuals=true
             */
            animateGridVisuals: true,
            /**
             * @member {Boolean} data.slowHeaderVisuals=false
             */
            slowHeaderVisuals: false,
            /**
             * @member {Boolean} data.isScrolling=false
             */
            isScrolling: false,
            /**
             * Values are: large, medium, small, x-small, null
             * @member {String|null} data.size
             */
            size: null
        }
    }
}

export default Neo.setupClass(ViewportStateProvider);
