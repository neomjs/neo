import Component from '../../../../src/model/Component.mjs';
import UserStore from '../store/Users.mjs';

/**
 * @class Neo.examples.toolbar.paging.view.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.toolbar.paging.view.MainContainerModel'
         * @protected
         */
        className: 'Neo.examples.toolbar.paging.view.MainContainerModel',
        /**
         * @member {Object} stores
         */
        stores: {
            users: UserStore
        }
    }}
}

Neo.applyClassConfig(MainContainerModel);

export default MainContainerModel;
