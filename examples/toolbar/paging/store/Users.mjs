import UserModel from '../model/User.mjs';
import Store     from '../../../../src/data/Store.mjs';

/**
 * @class MyApp.store.Users
 * @extends Neo.data.Store
 */
class Users extends Store {
    static getConfig() {return {
        /**
         * @member {String} className='MyApp.store.Users'
         * @protected
         */
        className: 'MyApp.store.Users',
        /**
         * @member {Object|String|null} api
         */
        api: 'MyApp.backend.UserService',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {Neo.data.Model} model=UserModel
         */
        model: UserModel,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{
            direction: 'ASC',
            property : 'id'
        }]
    }}
}

Neo.applyClassConfig(Users);

export default Users;
