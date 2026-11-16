import GanttContainer from '../../../src/gantt/Container.mjs';
import {lockedWidth}  from './planningCalendar.mjs';

/**
 * @summary The planning arrangement's release plan: the project's phases, tasks and links as a Gantt chart.
 *
 * The workspace hands this pane the provider's `planTasks` and `planLinks` stores. A task moved here is one
 * edit of the chart's single writer, which moves its linked successors with it. Its time axis and labels
 * come from the planning calendar, which the team's schedule above it shares.
 *
 * @class Workstation.view.GanttPane
 * @extends Neo.gantt.Container
 */
class GanttPane extends GanttContainer {
    static config = {
        /**
         * @member {String} className='Workstation.view.GanttPane'
         * @protected
         */
        className: 'Workstation.view.GanttPane',
        /**
         * @member {String[]} cls
         */
        cls: ['workstation-data-pane', 'workstation-gantt-pane'],
        /**
         * @member {Boolean} dependencyCreation=true
         */
        dependencyCreation: true,
        /**
         * @member {Number} rowHeight=26
         */
        rowHeight: 26,
        /**
         * @member {Boolean} showNonWorkingTime=true
         */
        showNonWorkingTime: true,
        /**
         * @member {Object[]} taskColumns
         */
        taskColumns: [{dataField: 'title', locked: 'start', text: 'Phase', type: 'tree', width: lockedWidth}]
    }
}

export default Neo.setupClass(GanttPane);
