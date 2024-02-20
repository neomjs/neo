import UserModel from '../model/User.mjs';
import Store     from '../../../../src/data/Store.mjs';

/**
 * @class Neo.examples.toolbar.paging.store.Users
 * @extends Neo.data.Store
 */
class Users extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.paging.store.Users'
         * @protected
         */
        className: 'Neo.examples.toolbar.paging.store.Users',
        /**
         * @member {Object|String|null} api
         */
        api: 'MyApp.backend.UserService',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * True to sort the collection items when adding / inserting new ones
         * @member {Boolean} autoSort=false
         */
        autoSort: false,
        /**
         * @member {Neo.data.Model} model=UserModel
         */
        model: UserModel,
        /**
         * @member {Boolean} remoteFilter=true
         */
        remoteFilter: true,
        /**
         * @member {Boolean} remoteSort=true
         */
        remoteSort: true,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{
            direction: 'ASC',
            property : 'id'
        }]
    }
}

Neo.setupClass(Users);

export default Users;
