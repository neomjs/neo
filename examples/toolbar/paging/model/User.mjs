import Model from '../../../../src/data/Model.mjs';

/**
 * @class Neo.examples.toolbar.paging.model.User
 * @extends Neo.data.Model
 */
class User extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.paging.model.User'
         * @protected
         */
        className: 'Neo.examples.toolbar.paging.model.User',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'firstname',
            type: 'String'
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'image',
            type: 'String'
        }, {
            name: 'isOnline',
            type: 'Boolean'
        }, {
            name: 'lastname',
            type: 'String'
        }]
    }
}

Neo.setupClass(User);

export default User;
