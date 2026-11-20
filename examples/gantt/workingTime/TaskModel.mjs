import BaseTaskModel from '../../../src/gantt/TaskModel.mjs';

/**
 * @summary Kitchen renovation task model adding a `trade` classification (`'prep' | 'mep' | 'finish'`) and
 * `baseStartDate` / `baseDuration` anchors so the working-days switch and reset control evaluate deterministic spans.
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
                name        : 'baseDuration',
                type        : 'Number',
                defaultValue: 1
            },
            {
                name        : 'baseStartDate',
                type        : 'String',
                defaultValue: null
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
