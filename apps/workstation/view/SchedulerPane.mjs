import SchedulerContainer from '../../../src/scheduler/Container.mjs';
import {lockedWidth}      from './planningCalendar.mjs';

/**
 * @summary The planning arrangement's schedule: the team's work items, one row per person, one column per day.
 *
 * The workspace hands this pane the provider's `people` store as its rows and the `workItems` store as its
 * events: the instance the board pane binds as well. A bar moved here and a card moved on the board are
 * both one `record.set()` on the same record, so each view shows the other's edit, in any window. Its time
 * axis and labels come from the planning calendar, which the release plan above it shares.
 *
 * A bar wears its work item's status: the family's colour variants for work in hand, the default bar for
 * ready work and a muted bar for the backlog.
 *
 * @class Workstation.view.SchedulerPane
 * @extends Neo.scheduler.Container
 */
class SchedulerPane extends SchedulerContainer {
    /**
     * The bar class each work-item status adds; `ready` keeps the family's default bar. A subclass that
     * declares its own map dresses its own bars.
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
         * Adds the bar class the rendering pane's class maps the status to ({@link #statusBarCls}) and names
         * the status on the bar (`data-status`). It runs on the timeline column; `gridContainer` is the pane.
         * @member {Function} barRenderer
         */
        barRenderer({bar}, {gridContainer, vdom}) {
            const status = bar?.status;

            if (status) {
                const cls = gridContainer.constructor.statusBarCls[status];

                vdom.data.status = status;
                cls && vdom.cls.push(cls)
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
