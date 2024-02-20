import Model  from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.list.color.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.color.MainModel'
         * @protected
         */
        className: 'Neo.examples.list.color.MainModel',
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
        }]
    }
}

Neo.setupClass(MainModel);

export default MainModel;
