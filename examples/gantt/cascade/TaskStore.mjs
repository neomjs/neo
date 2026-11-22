import BaseTaskStore from '../../../src/gantt/TaskStore.mjs';
import TaskModel     from './TaskModel.mjs';

// [id, title, shortLabel, durationDays, startDay, endDay, role]
// Twelve fixed-date tasks in November 2026:
// - 10 tasks form the linked move chain from "Sign the lease" (`lease`) to "First day in the new office" (`first-day`, Mon 16 Nov).
// - 2 tasks (`mail`, `handback`) form a linked pair beside the chain that a cabling slip never touches.
export const SEED_TASKS = [
    ['lease',     'Sign the lease',              'Lease',     1, '2026-11-03', '2026-11-04', 'upstream'],
    ['layout',    'Approve desk floor plan',     'Layout',    1, '2026-11-04', '2026-11-05', 'upstream'],
    ['cabling',   'Install data cabling',        'Cabling',   2, '2026-11-05', '2026-11-07', 'trigger'],
    ['rack',      'Mount server rack',           'Rack',      2, '2026-11-07', '2026-11-09', 'chain'],
    ['wifi',      'Turn up fibre & Wi-Fi',       'Wi-Fi',     2, '2026-11-09', '2026-11-11', 'chain'],
    ['desks',     'Deliver & wire desks',        'Desks',     3, '2026-11-09', '2026-11-12', 'chain'],
    ['screens',   'Fit monitors & docks',        'Monitors',  2, '2026-11-12', '2026-11-14', 'chain'],
    ['badges',    'Test badge access & alarms',  'Badges',    1, '2026-11-14', '2026-11-15', 'chain'],
    ['crates',    'Move team crates',            'Crates',    1, '2026-11-15', '2026-11-16', 'chain'],
    ['first-day', 'First day in the new office', 'First day', 2, '2026-11-16', '2026-11-18', 'goal'],
    ['mail',      'Redirect mail & billing',     'Mail',      3, '2026-11-05', '2026-11-08', 'beside'],
    ['handback',  'Clean & return old keys',     'Old keys',  3, '2026-11-08', '2026-11-11', 'beside']
];

export const SEED_BY_ID = new Map(SEED_TASKS.map(([id, , , , startDay, endDay]) => [
    id,
    {
        endMs  : Date.parse(`${endDay}T00:00:00Z`),
        startMs: Date.parse(`${startDay}T00:00:00Z`)
    }
]));

/**
 * @summary Store of 12 office-move tasks: a 10-task chain to move day plus 2 independent tasks beside the chain.
 * @class Neo.examples.gantt.cascade.TaskStore
 * @extends Neo.gantt.TaskStore
 */
class TaskStore extends BaseTaskStore {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.cascade.TaskStore'
         * @protected
         */
        className: 'Neo.examples.gantt.cascade.TaskStore',
        /**
         * @member {Neo.data.Model} model=TaskModel
         */
        model: TaskModel
    }

    /**
     * @summary Builds a fresh array of the 12 seeded office-move task records.
     * @returns {Object[]}
     */
    static buildSeedTasks() {
        return SEED_TASKS.map(([id, title, shortLabel, days, startDay, endDay, role]) => ({
            id,
            collapsed   : false,
            duration    : days,
            durationUnit: 'day',
            endDate     : `${endDay}T00:00:00Z`,
            isLeaf      : true,
            parentId    : null,
            percentDone : 0,
            role,
            shortLabel,
            startDate   : `${startDay}T00:00:00Z`,
            title
        }))
    }

    /**
     * @summary Populates the seeded tasks when constructed without initial data.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (!this.getCount()) {
            this.data = this.constructor.buildSeedTasks()
        }
    }
}

export default Neo.setupClass(TaskStore);
