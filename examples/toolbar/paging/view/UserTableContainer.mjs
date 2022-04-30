import TableContainer from '../../../../src/table/Container.mjs';
import UserStore      from '../store/Users.mjs';

/**
 * @class MyApp.view.UserTableContainer
 * @extends Neo.table.Container
 */
class UserTableContainer extends TableContainer {
    static getConfig() {return {
        /**
         * @member {String} className='MyApp.view.UserTableContainer'
         * @protected
         */
        className: 'MyApp.view.UserTableContainer',
        /**
         * @member {Object[]} columns
         */
        columns: [{
            dataField: 'id',
            text     : 'Id'
        }, {
            dataField: 'firstname',
            text     : 'Firstname'
        }, {
            dataField: 'lastname',
            text     : 'Lastname'
        },  {
            dataField: 'isOnline',
            text     : 'Is Online'
        }, {
            dataField: 'image',
            text     : 'Image'
        }],
        /**
         * @member {Neo.data.Store} store=UserStore
         */
        store: UserStore
    }}
}

Neo.applyClassConfig(UserTableContainer);

export default UserTableContainer;
