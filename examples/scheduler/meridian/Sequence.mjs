import Gantt          from '../../../src/gantt/Container.mjs';
import SequenceColumn from './SequenceColumn.mjs';

/**
 * @summary The native dependency chart. Its own writer places real and candidate tasks in independent stores.
 * @class Neo.examples.scheduler.meridian.Sequence
 * @extends Neo.gantt.Container
 */
class Sequence extends Gantt {
    static config = {
        className         : 'Neo.examples.scheduler.meridian.Sequence',
        cls               : ['meridian-gantt'], editable: false, resizableBars: false, rowHeight: 32, baseline: null,
        planningController: null, useInternalId: false,
        taskColumns       : [{type: 'tree', dataField: 'title', text: 'Operation', width: 132, locked: 'start'}]
    }

    /** @summary Supplies the candidate track's committed-start marker. @returns {Function} */
    getTimelineColumnClass() { return SequenceColumn }

    /** @summary Lets the crew move the guide prerequisite or the mosaic. Instrument exposure and readout
     * allocations go through the common booking writer, including in an isolated forecast.
     * @param {Object|String} task @param {Object} changes @param {Object} [meta] @returns {Object|null}
     */
    moveTask(task, changes={}, meta={}) {
        const id = typeof task === 'object' ? task.id : task;
        if (meta.source !== 'allocation' && this.planningController &&
            !this.planningController.canEditTask(id, changes)) return null;
        return super.moveTask(task, changes, meta)
    }
}

export default Neo.setupClass(Sequence);
