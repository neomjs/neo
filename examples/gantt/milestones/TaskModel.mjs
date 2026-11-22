import BaseTaskModel from '../../../src/gantt/TaskModel.mjs';

/**
 * @summary Launch-plan task model adding `role`, `shortLabel`, and `compactTitle`.
 * @class Neo.examples.gantt.milestones.TaskModel
 * @extends Neo.gantt.TaskModel
 */
class TaskModel extends BaseTaskModel {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.milestones.TaskModel'
         * @protected
         */
        className: 'Neo.examples.gantt.milestones.TaskModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {
                name        : 'compactTitle',
                type        : 'String',
                defaultValue: ''
            },
            {
                name        : 'role',
                type        : 'String',
                defaultValue: 'upcoming'
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
