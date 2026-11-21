import GanttColumn from '../../../src/gantt/Column.mjs';
import {eventBand} from './Night.mjs';

/**
 * @summary Marks a moved task's committed start behind the native candidate bar and its dependency links.
 * @class Neo.examples.scheduler.meridian.SequenceColumn
 * @extends Neo.gantt.Column
 */
class SequenceColumn extends GanttColumn {
    static config = {className: 'Neo.examples.scheduler.meridian.SequenceColumn'}

    /** @summary Adds a reference tick to the projected track when its date differs. @param {Object} data @returns {Object} */
    cellRenderer(data) {
        const cell     = super.cellRenderer(data), {gridContainer, record} = data,
              baseline = gridContainer?.baseline?.get(record?.id);
        if (this.timeAxis) cell.cn[0].cn.unshift(eventBand(this.timeAxis));
        if (baseline && +baseline.startDate !== +record.startDate) {
            cell.cn[0].cn.push({
                cls  : ['meridian-baseline-tick'], title: 'Committed start ' + baseline.startDate.toISOString().slice(11, 16),
                style: {left: this.timeAxis.dateToOffset(baseline.startDate) + 'px'}
            })
        }
        return cell
    }
}

export default Neo.setupClass(SequenceColumn);
