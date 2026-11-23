import Model from '../../../src/data/Model.mjs';

/**
 * @summary A demo account as the backend answers a sign-in: who it is and which permission keys it holds.
 * @class WebDesktop.model.Account
 * @extends Neo.data.Model
 */
class Account extends Model {
    static config = {
        /**
         * @member {String} className='WebDesktop.model.Account'
         * @protected
         */
        className: 'WebDesktop.model.Account',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'color',
            type: 'String'
        }, {
            name: 'id',
            type: 'String'
        }, {
            name     : 'initials',
            type     : 'String',
            calculate: data => data.name.split(' ').map(part => part[0]).join('')
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'permissions',
            type: 'Array'
        }, {
            name: 'role',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(Account);
