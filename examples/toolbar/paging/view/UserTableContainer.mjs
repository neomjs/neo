import TableContainer from '../../../../src/table/Container.mjs';

/**
 * @class Neo.examples.toolbar.paging.view.UserTableContainer
 * @extends Neo.table.Container
 */
class UserTableContainer extends TableContainer {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.paging.view.UserTableContainer'
         * @protected
         */
        className: 'Neo.examples.toolbar.paging.view.UserTableContainer',
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
            flex     : 1,
            text     : 'Image'
        }]
    }
}

export default Neo.setupClass(UserTableContainer);
