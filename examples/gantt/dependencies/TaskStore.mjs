import BaseTaskStore from '../../../src/gantt/TaskStore.mjs';

// [id, parentId, title, startDay, endDay]: UTC day keys, the end exclusive. Three phases hold fourteen tasks.
// Each linked task starts or ends exactly where its incoming links require, lags included, so a first edit
// cascades only what the edit itself changes. Rows and dates keep every link off the bars it does not join.
// Six tasks have no link: they wait for the visitor.
export const SEED_TASKS = [
    ['product',   null,        'Product',            '2026-11-02', '2026-11-16'],
    ['freeze',    'product',   'Freeze features',    '2026-11-02', '2026-11-06'],
    ['bugs',      'product',   'Fix the beta bugs',  '2026-11-06', '2026-11-12'],
    ['submit',    'product',   'Submit to stores',   '2026-11-13', '2026-11-16'],
    ['notes',     'product',   'Release notes',      '2026-11-09', '2026-11-12'],
    ['translate', 'product',   'Translate the app',  '2026-11-09', '2026-11-12'],
    ['marketing', null,        'Marketing',          '2026-11-09', '2026-11-15'],
    ['teaser',    'marketing', 'Teaser campaign',    '2026-11-11', '2026-11-15'],
    ['press',     'marketing', 'Brief the press',    '2026-11-12', '2026-11-14'],
    ['emails',    'marketing', 'Draft the emails',   '2026-11-10', '2026-11-13'],
    ['video',     'marketing', 'Shoot the video',    '2026-11-09', '2026-11-12'],
    ['landing',   'marketing', 'Build landing page', '2026-11-09', '2026-11-15'],
    ['launch',    null,        'Launch',             '2026-11-09', '2026-11-21'],
    ['golive',    'launch',    'Launch day',         '2026-11-17', '2026-11-18'],
    ['beta',      'launch',    'Keep the beta open', '2026-11-09', '2026-11-17'],
    ['support',   'launch',    'Train support',      '2026-11-12', '2026-11-16'],
    ['retro',     'launch',    'Retrospective',      '2026-11-20', '2026-11-21']
];

/**
 * @summary The product launch's task tree: three phases of fourteen tasks in November 2026.
 * @class Neo.examples.gantt.dependencies.TaskStore
 * @extends Neo.gantt.TaskStore
 */
class TaskStore extends BaseTaskStore {
    /**
     * @summary Builds fresh records of the launch plan: three expanded phases and their fourteen tasks.
     * @returns {Object[]}
     */
    static buildSeedTasks() {
        return SEED_TASKS.map(([id, parentId, title, startDay, endDay]) => ({
            id,
            collapsed  : false,
            endDate    : `${endDay}T00:00:00Z`,
            isLeaf     : parentId !== null,
            parentId,
            percentDone: 0,
            startDate  : `${startDay}T00:00:00Z`,
            title
        }))
    }

    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.dependencies.TaskStore'
         * @protected
         */
        className: 'Neo.examples.gantt.dependencies.TaskStore'
    }

    /**
     * @summary Populates the launch plan when constructed without initial data.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (!me.getCount()) {
            me.data = me.constructor.buildSeedTasks()
        }
    }
}

export default Neo.setupClass(TaskStore);
