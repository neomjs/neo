import GanttContainer from '../../../src/gantt/Container.mjs';

const msPerDay = 86_400_000;

/**
 * @summary The planning arrangement's release plan: the project's phases, tasks and links as a Gantt chart.
 *
 * The workspace hands this pane the provider's `planTasks` and `planLinks` stores. A task moved here is one
 * edit of the chart's single writer, which moves its linked successors with it.
 *
 * @class Workstation.view.GanttPane
 * @extends Neo.gantt.Container
 */
class GanttPane extends GanttContainer {
    /**
     * @summary The plan's window around a plan day: two weeks back and three ahead, in whole UTC days.
     * @param {Date} baseDate Midnight UTC of the plan day
     * @returns {Object} A `Neo.timeline.TimeAxis` config
     */
    static createTimeAxis(baseDate) {
        const base = baseDate.getTime();

        return {
            end        : new Date(base + 21 * msPerDay),
            pxPerMinute: 0.025,
            snapMinutes: 1440,
            start      : new Date(base - 14 * msPerDay),
            tickUnit   : 'day',
            timeZone   : 'UTC'
        }
    }

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
         * @member {Function} majorFormatter
         */
        majorFormatter: tick => tick.date.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}),
        /**
         * @member {String} majorTickUnit='week'
         */
        majorTickUnit: 'week',
        /**
         * @member {Function} minorFormatter
         */
        minorFormatter: tick => tick.date.toLocaleDateString('en-GB', {day: 'numeric', timeZone: 'UTC'}),
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
        taskColumns: [{dataField: 'title', locked: 'start', text: 'Release plan', type: 'tree', width: 220}]
    }
}

export default Neo.setupClass(GanttPane);
