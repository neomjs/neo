import Component    from '../../../src/model/Component.mjs';
import SideNavStore from '../store/SideNav.mjs'

/**
 * @class Form.view.ViewportModel
 * @extends Neo.model.Component
 */
class ViewportModel extends Component {
    static config = {
        /**
         * @member {String} className='Form.view.ViewportModel'
         * @protected
         */
        className: 'Form.view.ViewportModel',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * The currently selected list item inside the SideNavList
             * @member {Number} data.activeIndex
             */
            activeIndex: 0,
            /**
             * The name of the currently selected list item record
             * @member {String} data.activeTitle
             */
            activeTitle: '',
            /**
             * The amount of non-header SideNavList items
             * @member {Number} data.maxIndex
             */
            maxIndex: 0
        },
        /**
         * @member {Object} stores
         */
        stores: {
            sideNav: {
                module  : SideNavStore,
                autoLoad: true,
                url     : '../../resources/examples/data/formSideNav.json'
            }
        }
    }
}

Neo.applyClassConfig(ViewportModel);

export default ViewportModel;
