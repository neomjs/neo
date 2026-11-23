import BaseTaskModel from '../../../src/gantt/TaskModel.mjs';

/**
 * @summary Office-move task model adding `role` (`'upstream' | 'trigger' | 'chain' | 'goal' | 'beside'`) and `shortLabel`.
 * @class Neo.examples.gantt.cascade.TaskModel
 * @extends Neo.gantt.TaskModel
 */
class TaskModel extends BaseTaskModel {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.cascade.TaskModel'
         * @protected
         */
        className: 'Neo.examples.gantt.cascade.TaskModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {
                name        : 'role',
                type        : 'String',
                defaultValue: 'chain'
            },
            {
                name        : 'shortLabel',
                type        : 'String',
                defaultValue: ''
            }
        ]
    }
}

export default Neo.setupClass(TaskModel);
