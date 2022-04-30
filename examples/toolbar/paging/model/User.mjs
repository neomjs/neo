import Model from '../../../../src/data/Model.mjs';

/**
 * @class MyApp.model.User
 * @extends Neo.data.Model
 */
class User extends Model {
    static getConfig() {return {
        /**
         * @member {String} className='MyApp.model.User'
         * @protected
         */
        className: 'MyApp.model.User',
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
    }}
}

Neo.applyClassConfig(User);

export default User;
