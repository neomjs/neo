import ColorsStore   from '../store/Colors.mjs';
import StateProvider from '../../../src/state/Provider.mjs';

/**
 * @class Colors.view.ViewportStateProvider
 * @extends Neo.state.Provider
 */
class ViewportStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Colors.view.ViewportStateProvider'
         * @protected
         */
        className: 'Colors.view.ViewportStateProvider',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * @member {Number} data.amountColors=10
             */
            amountColors: 10,
            /**
             * @member {Number} data.amountColumns=10
             */
            amountColumns: 10,
            /**
             * @member {Number} data.amountRows=10
             */
            amountRows: 10,
            /**
             * @member {Boolean} data.isUpdating=false
             */
            isUpdating: false,
            /**
             * @member {Boolean} data.openWidgetsAsPopups=true
             */
            openWidgetsAsPopups: true
        },
        /**
         * @member {Object} stores
         */
        stores: {
            colors: {
                module: ColorsStore
            }
        }
    }
}

export default Neo.setupClass(ViewportStateProvider);
