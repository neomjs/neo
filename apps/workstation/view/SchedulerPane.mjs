import SchedulerContainer from '../../../src/scheduler/Container.mjs';
import {lockedWidth}      from './planningCalendar.mjs';

/**
 * @summary The planning arrangement's schedule: the team's work items, one row per person, one column per day.
 *
 * The workspace hands this pane the provider's `people` store as its rows and the `workItems` store as its
 * events: the instance the board pane binds as well. A bar moved here and a card moved on the board are
 * both one `record.set()` on the same record, so each view shows the other's edit, in any window. Its time
 * axis and labels come from the planning calendar, which the release plan below it shares.
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
         * A work item's progress fills its bar and is what the bar editor edits.
         * @member {String} percentDoneField='progress'
         */
        percentDoneField: 'progress',
        /**
         * @member {Object[]} resourceColumns
         */
        resourceColumns: [{dataField: 'name', locked: 'start', text: 'Team', width: lockedWidth}],
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
