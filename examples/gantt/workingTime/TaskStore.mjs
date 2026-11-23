import BaseTaskStore from '../../../src/gantt/TaskStore.mjs';
import TaskModel     from './TaskModel.mjs';

// [id, title, shortLabel, durationDays, startDay, endDay, trade, cls]
// Fixed UTC calendar (2026-11-02 .. 2026-11-25): weekends + public holiday (Thu 2026-11-12).
// Seeded in working-days mode (`useWorkingTime: true`):
// - `t3` ("Rough plumbing & gas", 5 days) starts Thu 2026-11-05, skips Sat 7–Sun 8, and finishes end of Wed 2026-11-11 (`2026-11-12T00:00:00Z`).
// - `t5` ("Hood & exterior duct", 3 days) starts Tue 2026-11-10, skips Thu 2026-11-12 holiday, and finishes end of Fri 2026-11-13 (`2026-11-14T00:00:00Z`).
// - `t6` ("Drywall & plaster", 2 days, FS from `t3`) skips Thu 2026-11-12 holiday to start Fri 2026-11-13, skips Sat 14–Sun 15, and finishes end of Mon 2026-11-16 (`2026-11-17T00:00:00Z`).
export const SEED_TASKS = [
    ['t1',  'Strip old units',       'Strip',                2, '2026-11-02', '2026-11-04', 'prep',   null],
    ['t2',  'Open soffit',           'Soffit',               1, '2026-11-04', '2026-11-05', 'prep',   null],
    ['t3',  'Rough plumbing & gas',  'Rough plumbing & gas', 5, '2026-11-05', '2026-11-12', 'mep',    'kitchen-bar-hero'],
    ['t4',  'Circuits & LEDs',       'Circuits & LEDs',      3, '2026-11-05', '2026-11-10', 'mep',    null],
    ['t5',  'Hood & exterior duct',  'Hood & duct',          3, '2026-11-10', '2026-11-14', 'mep',    null],
    ['t6',  'Drywall & plaster',     'Drywall',              2, '2026-11-13', '2026-11-17', 'prep',   null],
    ['t7',  'Prime & wall paint',    'Prime',                1, '2026-11-17', '2026-11-18', 'finish', null],
    ['t8',  'Porcelain floor tile',  'Tile',                 1, '2026-11-17', '2026-11-18', 'finish', null],
    ['t9',  'Base & wall units',     'Units',                1, '2026-11-18', '2026-11-19', 'finish', null],
    ['t10', 'Fit quartz worktops',   'Quartz',               1, '2026-11-19', '2026-11-20', 'finish', null],
    ['t11', 'Tile splashback',       'Splash',               1, '2026-11-19', '2026-11-20', 'finish', null],
    ['t12', 'Range & sign-off',      'Final',                1, '2026-11-20', '2026-11-21', 'finish', null]
];

/**
 * @summary Builds a fresh array of the 12 seeded kitchen-renovation task records.
 * @returns {Object[]}
 */
export function buildSeedTasks() {
    return SEED_TASKS.map(([id, title, shortLabel, days, startDay, endDay, trade, cls]) => ({
        id,
        cls,
        collapsed   : false,
        duration    : days,
        durationUnit: 'day',
        endDate     : `${endDay}T00:00:00Z`,
        isLeaf      : true,
        parentId    : null,
        percentDone : 0,
        shortLabel,
        startDate   : `${startDay}T00:00:00Z`,
        title,
        trade
    }))
}

/**
 * @summary Store of 12 linked kitchen renovation tasks seeded across three weeks in November 2026.
 * @class Neo.examples.gantt.workingTime.TaskStore
 * @extends Neo.gantt.TaskStore
 */
class TaskStore extends BaseTaskStore {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.workingTime.TaskStore'
         * @protected
         */
        className: 'Neo.examples.gantt.workingTime.TaskStore',
        /**
         * @member {Neo.data.Model} model=TaskModel
         */
        model: TaskModel
    }

    /**
     * @summary Populates the seeded tasks when constructed without initial data.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (!this.getCount()) {
            this.data = buildSeedTasks()
        }
    }
}

export default Neo.setupClass(TaskStore);
