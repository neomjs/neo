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
         * `label` marks done tasks, so the list shows what the open-tasks filter will hide
         * @member {Object[]} fields
         */
        fields: [
            {name: 'done',  type: 'Boolean'},
            {name: 'id',    type: 'Integer'},
            {name: 'label', type: 'String', calculate: data => data.done ? `${data.name} · done` : data.name},
            {name: 'name',  type: 'String'}
        ]
    }
}

export default Neo.setupClass(TaskModel);
