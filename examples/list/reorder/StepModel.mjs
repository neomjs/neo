import Model from '../../../src/data/Model.mjs';

/**
 * @summary One step of the release checklist. `order` is its place in the list, and a drag rewrites it.
 * @class Neo.examples.list.reorder.StepModel
 * @extends Neo.data.Model
 */
class StepModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.reorder.StepModel'
         * @protected
         */
        className: 'Neo.examples.list.reorder.StepModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'id',    type: 'Integer'},
            {name: 'order', type: 'Integer'},
            {name: 'text',  type: 'String'}
        ]
    }
}

export default Neo.setupClass(StepModel);
