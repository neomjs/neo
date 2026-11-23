import GanttTaskModel from '../../../src/gantt/TaskModel.mjs';

const DAY_MS = 86_400_000;

/**
 * @summary A festival task that also knows its outline number, its owner, and how many days it spans.
 * @class Neo.examples.gantt.taskColumns.TaskModel
 * @extends Neo.gantt.TaskModel
 */
class TaskModel extends GanttTaskModel {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.taskColumns.TaskModel'
         * @protected
         */
        className: 'Neo.examples.gantt.taskColumns.TaskModel',
        /**
         * Added to the Gantt task fields, which this array merges with.
         * @member {Object[]} fields
         */
        fields: [{
            name: 'outline',
            type: 'String'
        }, {
            name: 'owner',
            type: 'String'
        }, {
            name     : 'days',
            type     : 'Number',
            calculate: data => Math.round((new Date(data.endDate) - new Date(data.startDate)) / DAY_MS)
        }]
    }
}

export default Neo.setupClass(TaskModel);
