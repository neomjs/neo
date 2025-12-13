import Model from '../../../src/data/Model.mjs';

/**
 * @class Legit.model.Commit
 * @extends Neo.data.Model
 */
class Commit extends Model {
    static config = {
        /**
         * @member {String} className='Legit.model.Commit'
         * @protected
         */
        className: 'Legit.model.Commit',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'oid',
            type: 'String'
        }, {
            name: 'message',
            type: 'String'
        }, {
            name: 'author',
            type: 'Object'
        }, {
            name: 'timestamp',
            type: 'Integer'
        }]
    }
}

export default Neo.setupClass(Commit);
