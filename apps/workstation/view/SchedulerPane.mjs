import SchedulerContainer from '../../../src/scheduler/Container.mjs';

const msPerDay = 86_400_000;

/**
 * @summary The planning arrangement's schedule: the team's work items, one row per person, one column per day.
 *
 * The workspace hands this pane the provider's `people` store as its rows and the `workItems` store as its
 * events: the instance the board pane binds as well. A bar moved here and a card moved on the board are
 * both one `record.set()` on the same record, so each view shows the other's edit, in any window.
 *
 * A bar wears its work item's status: the family's colour variants for work in hand, the default bar for
 * ready work and a muted bar for the backlog.
 *
 * @class Workstation.view.SchedulerPane
 * @extends Neo.scheduler.Container
 */
class SchedulerPane extends SchedulerContainer {
    /**
     * The bar class each work-item status adds; `ready` keeps the family's default bar.
     * @member {Object<String, String>} statusBarCls
     * @static
     */
    static statusBarCls = {
        backlog      : 'workstation-plan-bar-backlog',
        done         : 'neo-scheduler-bar-emerald',
        'in-progress': 'neo-scheduler-bar-amber',
        review       : 'neo-scheduler-bar-violet'
    }

    /**
     * @summary The schedule's window around a plan day: the past week and the next two, in whole UTC days.
     * @param {Date} baseDate Midnight UTC of the plan day
     * @returns {Object} A `Neo.timeline.TimeAxis` config
     */
    static createTimeAxis(baseDate) {
        const base = baseDate.getTime();

        return {
            end        : new Date(base + 14 * msPerDay),
            pxPerMinute: 0.05,
            snapMinutes: 1440,
            start      : new Date(base - 8 * msPerDay),
            tickUnit   : 'day',
            timeZone   : 'UTC'
        }
    }

    static config = {
        /**
         * @member {String} className='Workstation.view.SchedulerPane'
         * @protected
         */
        className: 'Workstation.view.SchedulerPane',
        /**
         * Adds the status's bar class and names the status on the bar (`data-status`).
         * @member {Function} barRenderer
         */
        barRenderer({bar}, {vdom}) {
            const status = bar?.status;

            if (status) {
                vdom.data.status = status;
                SchedulerPane.statusBarCls[status] && vdom.cls.push(SchedulerPane.statusBarCls[status])
            }

            return vdom
        },
        /**
         * @member {String[]} cls
         */
        cls: ['workstation-data-pane', 'workstation-scheduler-pane'],
        /**
         * @member {Function} majorFormatter
         */
        majorFormatter: tick => tick.date.toLocaleDateString('en-GB', {day: 'numeric', month: 'long', timeZone: 'UTC'}),
        /**
         * @member {String} majorTickUnit='week'
         */
        majorTickUnit: 'week',
        /**
         * @member {Function} minorFormatter
         */
        minorFormatter: tick => tick.date.toLocaleDateString('en-GB', {day: 'numeric', timeZone: 'UTC', weekday: 'short'}),
        /**
         * A work item's progress fills its bar and is what the bar editor edits.
         * @member {String} percentDoneField='progress'
         */
        percentDoneField: 'progress',
        /**
         * @member {Object[]} resourceColumns
         */
        resourceColumns: [{dataField: 'name', locked: 'start', text: 'Team', width: 150}],
        /**
         * @member {Number} rowHeight=41
         */
        rowHeight: 41,
        /**
         * @member {Boolean} showNonWorkingTime=true
         */
        showNonWorkingTime: true
    }
}

export default Neo.setupClass(SchedulerPane);
