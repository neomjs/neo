import BaseTaskModel from '../../../src/gantt/TaskModel.mjs';

/**
 * @summary Kitchen renovation task model adding `cls`, `shortLabel`, and a `trade` classification (`'prep' | 'mep' | 'finish'`).
 * @class Neo.examples.gantt.workingTime.TaskModel
 * @extends Neo.gantt.TaskModel
 */
class TaskModel extends BaseTaskModel {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.workingTime.TaskModel'
         * @protected
         */
        className: 'Neo.examples.gantt.workingTime.TaskModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {
                name        : 'cls',
                defaultValue: null,
                nullable    : true
            },
            {
                name        : 'shortLabel',
                type        : 'String',
                defaultValue: ''
            },
            {
                name        : 'trade',
                type        : 'String',
                defaultValue: 'prep'
            }
        ]
    }
}

export default Neo.setupClass(TaskModel);
