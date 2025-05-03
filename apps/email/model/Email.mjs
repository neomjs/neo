import Model from '../../../src/data/Model.mjs';

/**
 * @class Email.model.Email
 * @extends Neo.data.Model
 */
class Email extends Model {
    static config = {
        /**
         * @member {String} className='Email.model.Email'
         * @protected
         */
        className: 'Email.model.Email',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'Int'
        }, {
            name: 'content',
            type: 'String'
        }, {
            name: 'dateSent',
            type: 'String'
        }, {
            name: 'recipients',
            type: 'Array'
        }, {
            name: 'sender',
            type: 'String'
        }, {
            name: 'title',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(Email);
