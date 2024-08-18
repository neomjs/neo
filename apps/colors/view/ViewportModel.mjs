import Component   from '../../../src/model/Component.mjs';
import ColorsStore from '../store/Colors.mjs';

/**
 * @class Colors.view.ViewportModel
 * @extends Neo.model.Component
 */
class ViewportModel extends Component {
    static config = {
        /**
         * @member {String} className='Colors.view.ViewportModel'
         * @protected
         */
        className: 'Colors.view.ViewportModel',
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

export default Neo.setupClass(ViewportModel);
