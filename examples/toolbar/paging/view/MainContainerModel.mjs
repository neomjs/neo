import Model     from '../../../../src/model/Component.mjs';
import UserStore from '../store/Users.mjs';

/**
 * @class Neo.examples.toolbar.paging.view.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.paging.view.MainContainerModel'
         * @protected
         */
        className: 'Neo.examples.toolbar.paging.view.MainContainerModel',
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

export default Neo.setupClass(MainContainerModel);
