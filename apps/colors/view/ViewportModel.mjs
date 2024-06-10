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
        data: {},
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

Neo.setupClass(ViewportModel);

export default ViewportModel;
