import Model from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.button.floatingAction.TaskModel
 * @extends Neo.data.Model
 */
class TaskModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.button.floatingAction.TaskModel'
         * @protected
         */
        className: 'Neo.examples.button.floatingAction.TaskModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'done', type: 'Boolean'},
            {name: 'id',   type: 'Integer'},
            {name: 'name', type: 'String'}
        ]
    }
}

export default Neo.setupClass(TaskModel);
