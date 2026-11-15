import TreeModel        from '../data/TreeModel.mjs';
import {timelineFields} from '../timeline/model/Event.mjs';

/**
 * @summary Hierarchical task record schema (`Neo.gantt.TaskModel`) for `Neo.gantt.Container`.
 * @description Extends `Neo.data.TreeModel` (`parentId`, `collapsed`, `depth`, `isLeaf`, `childCount`,
 * `siblingCount`, `siblingIndex`) and spreads `timelineFields` (`id`, `title`, `description`, `startDate`,
 * `endDate`, `allDay`, `resourceId`) alongside Gantt-specific fields (`duration`, `durationUnit`,
 * `percentDone`, `milestone`). Parent tasks default `collapsed` to `false` so hierarchical project trees
 * project expanded by default unless `collapsed: true` is specified.
 * @class Neo.gantt.TaskModel
 * @extends Neo.data.TreeModel
 * @see Neo.gantt.TaskStore
 * @see Neo.timeline.model.Event
 */
class TaskModel extends TreeModel {
    static config = {
        /**
         * @member {String} className='Neo.gantt.TaskModel'
         * @protected
         */
        className: 'Neo.gantt.TaskModel',
        /**
         * @member {String} ntype='gantt-task-model'
         * @protected
         */
        ntype: 'gantt-task-model',
        /**
         * @member {Object[]} fields
         */
        fields: [
            ...timelineFields,
            {
                name        : 'collapsed',
                type        : 'Boolean',
                defaultValue: false
            },
            {
                name        : 'duration',
                type        : 'Number',
                defaultValue: 0
            },
            {
                name        : 'durationUnit',
                type        : 'String',
                defaultValue: 'hour'
            },
            {
                name        : 'milestone',
                type        : 'Boolean',
                defaultValue: false
            },
            {
                name        : 'percentDone',
                type        : 'Number',
                defaultValue: 0
            }
        ]
    }
}

export default Neo.setupClass(TaskModel);
