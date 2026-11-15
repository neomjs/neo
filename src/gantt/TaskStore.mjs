import TaskModel from './TaskModel.mjs';
import Events    from '../timeline/store/Events.mjs';
import TreeStore from '../data/TreeStore.mjs';

/**
 * @summary Hierarchical task store (`Neo.gantt.TaskStore`) for `Neo.gantt.Container`.
 * @description Extends `Neo.data.TreeStore` with {@link Neo.gantt.TaskModel} so `Neo.grid.Body` and
 * `Neo.grid.column.Tree` project the flattened visible (expanded) task hierarchy while `get(id)` resolves
 * any task in $O(1)$ across both expanded and collapsed branches. Also provides `getRangeRecords(start, end)`
 * over currently visible tasks intersecting `[start, end)`.
 * @class Neo.gantt.TaskStore
 * @extends Neo.data.TreeStore
 * @see Neo.gantt.TaskModel
 * @see Neo.gantt.Container
 */
class TaskStore extends TreeStore {

    static config = {
        /**
         * @member {String} className='Neo.gantt.TaskStore'
         * @protected
         */
        className: 'Neo.gantt.TaskStore',
        /**
         * @member {String} ntype='gantt-task-store'
         * @protected
         */
        ntype: 'gantt-task-store',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=TaskModel
         * @reactive
         */
        model: TaskModel
    }

    /**
     * @summary Returns all currently visible (expanded) task records whose `[startDate, endDate)` interval
     * intersects `[start, end)`.
     * @param {Date|Number|String} start Range start (inclusive)
     * @param {Date|Number|String} end Range end (exclusive for positive-duration intervals)
     * @returns {Neo.gantt.TaskModel[]}
     */
    getRangeRecords(start, end) {
        const
            me      = this,
            startMs = start instanceof Date ? start.getTime() : new Date(start).getTime(),
            endMs   = end   instanceof Date ? end.getTime()   : new Date(end).getTime(),
            result  = [],
            count   = me.getCount();

        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
            return result
        }

        for (let i = 0; i < count; i++) {
            const record = me.getAt(i);
            if (!record) {
                continue
            }

            const
                recStart = record.startDate instanceof Date ? record.startDate.getTime() : new Date(record.startDate).getTime(),
                recEnd   = record.endDate   instanceof Date ? record.endDate.getTime()   : new Date(record.endDate).getTime();

            if (Events.intersectsRange(recStart, recEnd, startMs, endMs)) {
                result.push(record)
            }
        }

        return result
    }
}

export default Neo.setupClass(TaskStore);
