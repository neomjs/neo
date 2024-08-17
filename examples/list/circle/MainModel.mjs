import Model from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.list.circle.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.circle.MainModel'
         * @protected
         */
        className: 'Neo.examples.list.circle.MainModel',
        /**
         * @member {Object[]} fields
         * @protected
         */
        fields: [{
            name: 'id',
            type: 'Integer'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'url',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(MainModel);
