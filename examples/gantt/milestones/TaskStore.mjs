import BaseTaskStore from '../../../src/gantt/TaskStore.mjs';
import TaskModel     from './TaskModel.mjs';

// [id, parentId, isLeaf, milestone, title, compactTitle, shortLabel, startDay, endDay, percentDone, role]
// Fifteen rows across 3 launch phases: 6 work tasks punctuated by 6 zero-duration milestone gates.
export const SEED_TASKS = [
    ['phase-hw',    null,         false, false, 'Phase 1 · Hardware & BOM',    '1 · Hardware',  'Phase 1',    '2026-11-02', '2026-11-10', 100, 'phase'],
    ['spec',        'phase-hw',   true,  false, 'Spec & acoustic BOM',         'Spec & BOM',    'BOM',        '2026-11-02', '2026-11-05', 100, 'done'],
    ['gate-spec',   'phase-hw',   true,  true,  'Gate 1 · Spec freeze',        'G1 · Spec',     'G1',         '2026-11-05', '2026-11-05', 100, 'gate'],
    ['pcb',         'phase-hw',   true,  false, 'Enclosure & PCB rev B',       'PCB rev B',     'PCB rev B',  '2026-11-05', '2026-11-10', 100, 'done'],
    ['gate-proto',  'phase-hw',   true,  true,  'Gate 2 · Prototype sign-off', 'G2 · Proto',    'G2',         '2026-11-10', '2026-11-10', 100, 'gate'],

    ['phase-fw',    null,         false, false, 'Phase 2 · Firmware & Lab',    '2 · Firmware',  'Phase 2',    '2026-11-10', '2026-11-20',  60, 'phase'],
    ['dsp',         'phase-fw',   true,  false, 'Audio DSP firmware',          'DSP fw',        'DSP fw',     '2026-11-10', '2026-11-15',  75, 'trigger'],
    ['gate-code',   'phase-fw',   true,  true,  'Gate 3 · Feature freeze',     'G3 · Freeze',   'G3',         '2026-11-15', '2026-11-15',   0, 'gate'],
    ['emc',         'phase-fw',   true,  false, 'EMC & drop certification',    'EMC lab',       'EMC lab',    '2026-11-15', '2026-11-20',  35, 'active'],
    ['gate-cert',   'phase-fw',   true,  true,  'Gate 4 · Lab clearance',      'G4 · Lab ok',   'G4',         '2026-11-20', '2026-11-20',   0, 'gate'],

    ['phase-ship',  null,         false, false, 'Phase 3 · Pilot & Launch',    '3 · Launch',    'Phase 3',    '2026-11-20', '2026-11-27',  10, 'phase'],
    ['pilot',       'phase-ship', true,  false, 'Pilot run (250 units)',       'Pilot (250)',   'Pilot',      '2026-11-20', '2026-11-24',  20, 'upcoming'],
    ['gate-rc',     'phase-ship', true,  true,  'Gate 5 · Release candidate',  'G5 · RC',       'G5',         '2026-11-24', '2026-11-24',   0, 'gate'],
    ['kit',         'phase-ship', true,  false, 'Launch kit & docs',           'Launch kit',    'Launch kit', '2026-11-24', '2026-11-27',   0, 'upcoming'],
    ['gate-launch', 'phase-ship', true,  true,  'Gate 6 · Public launch',      'G6 · Launch',   'G6',         '2026-11-27', '2026-11-27',   0, 'gate']
];

export const SEED_BY_ID = new Map(SEED_TASKS.map(([id, , , milestone, , , , startDay, endDay]) => [
    id,
    {
        endMs  : Date.parse(`${endDay}T00:00:00Z`),
        milestone,
        startMs: Date.parse(`${startDay}T00:00:00Z`)
    }
]));

/**
 * @summary Hierarchical store of 3 launch phases, 6 tasks, and 6 zero-duration milestone gates.
 * @class Neo.examples.gantt.milestones.TaskStore
 * @extends Neo.gantt.TaskStore
 */
class TaskStore extends BaseTaskStore {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.milestones.TaskStore'
         * @protected
         */
        className: 'Neo.examples.gantt.milestones.TaskStore',
        /**
         * @member {Neo.data.Model} model=TaskModel
         */
        model: TaskModel
    }

    /**
     * @summary Builds a fresh array of the 15 seeded launch-plan records.
     * @returns {Object[]}
     */
    static buildSeedTasks() {
        return SEED_TASKS.map(([id, parentId, isLeaf, milestone, title, compactTitle, shortLabel, startDay, endDay, percentDone, role]) => {
            const startMs = Date.parse(`${startDay}T00:00:00Z`),
                  endMs   = Date.parse(`${endDay}T00:00:00Z`);

            return {
                id,
                collapsed   : false,
                compactTitle,
                duration    : milestone ? 0 : Math.round((endMs - startMs) / 86_400_000),
                durationUnit: 'day',
                endDate     : `${endDay}T00:00:00Z`,
                isLeaf,
                milestone,
                parentId,
                percentDone,
                role,
                shortLabel,
                startDate   : `${startDay}T00:00:00Z`,
                title
            }
        })
    }

    /**
     * @summary Populates the seeded tasks and gates when constructed without initial data.
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
