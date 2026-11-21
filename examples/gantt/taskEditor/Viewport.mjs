import DependencyStore from '../../../src/gantt/DependencyStore.mjs';
import Gantt           from '../../../src/gantt/Container.mjs';
import Label           from '../../../src/component/Label.mjs';
import TaskStore       from '../../../src/gantt/TaskStore.mjs';
import Toolbar         from '../../../src/toolbar/Base.mjs';
import Viewport        from '../../../src/container/Viewport.mjs';

const
    DAY_MS = 86_400_000,
    START  = Date.UTC(2027, 2, 1),
    // Each task: [id, title, days, percent done on 12 March, the tasks it follows]
    PHASES = [
        {id: 'discovery', title: 'Discovery', tasks: [
            ['interviews', 'Interview the stakeholders', 4, 100, []],
            ['audit', 'Audit the current site', 3, 100, []],
            ['brief', 'Write the brief', 3, 100, ['interviews', 'audit']],
            ['sitemap', 'Agree the sitemap', 2, 100, ['brief']]
        ]},
        {id: 'design', title: 'Design', tasks: [
            ['wireframes', 'Sketch the wireframes', 5, 40, ['sitemap']],
            ['home', 'Design the home page', 5, 0, ['wireframes']],
            ['pages', 'Design the inner pages', 6, 0, ['wireframes']],
            ['review', 'Review the designs', 2, 0, ['home', 'pages']]
        ]},
        {id: 'build', title: 'Build', tasks: [
            ['cms', 'Set up the CMS', 4, 50, ['sitemap']],
            ['templates', 'Build the templates', 8, 0, ['review', 'cms']],
            ['content', 'Migrate the content', 6, 0, ['cms']],
            ['phones', 'Test on phones', 3, 0, ['templates', 'content']]
        ]},
        {id: 'launch', title: 'Launch', tasks: [
            ['bugs', 'Fix the launch bugs', 4, 0, ['phones']],
            ['training', 'Train the editors', 2, 0, ['content']],
            ['domain', 'Switch the domain', 1, 0, ['bugs', 'training']],
            ['announce', 'Announce the relaunch', 1, 0, ['domain']]
        ]}
    ],
    format = date => new Date(date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}),
    iso    = day => new Date(START + day * DAY_MS).toISOString();

/**
 * @summary Schedules every task right after the tasks it follows and rolls each phase up to its tasks' span.
 * @returns {{tasks: Object[], dependencies: Object[]}} Task and finish-to-start link records for the stores.
 */
function buildPlan() {
    const
        byId   = new Map(PHASES.flatMap(phase => phase.tasks.map(task => [task[0], task]))),
        starts = new Map(),
        start  = id => {
            if (!starts.has(id)) {
                const [, , , , follows] = byId.get(id);
                starts.set(id, Math.max(0, ...follows.map(key => start(key) + byId.get(key)[2])))
            }
            return starts.get(id)
        },
        tasks        = [],
        dependencies = [];

    PHASES.forEach(phase => {
        const rows = phase.tasks.map(([id, title, days, percentDone, follows]) => {
            follows.forEach(fromId => dependencies.push({id: `${fromId}-${id}`, fromId, toId: id, type: 'FS', lag: 0, lagUnit: 'hour'}));

            return {id, parentId: phase.id, isLeaf: true, percentDone, title, startDate: iso(start(id)), endDate: iso(start(id) + days)}
        });

        tasks.push({
            id       : phase.id, parentId: null, isLeaf: false, collapsed: false, title: phase.title,
            startDate: rows.map(row => row.startDate).sort()[0],
            endDate  : rows.map(row => row.endDate).sort().at(-1)
        }, ...rows)
    });

    return {tasks, dependencies}
}

const plan = buildPlan();

/**
 * @summary A website relaunch whose tasks open in the Gantt's task editor: a double-click on a bar, or Enter on a
 * focused bar. A saved end moves the task and every task linked after it; a saved percent fills its bar.
 * @class Neo.examples.gantt.taskEditor.Viewport
 * @extends Neo.container.Viewport
 */
class TaskEditorViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.taskEditor.Viewport'
         * @protected
         */
        className: 'Neo.examples.gantt.taskEditor.Viewport',
        /**
         * @member {String[]} cls=['task-editor-viewport']
         */
        cls: ['task-editor-viewport'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar, cls: ['te-toolbar'], flex: 'none', items: [
                {module: Label, cls: ['te-title'],    text: 'Website relaunch'},
                {module: Label, cls: ['te-subtitle'], text: 'Seven weeks · four phases · progress on 12 March · UTC'},
                '->',
                {module: Label, cls: ['te-hint'],     text: 'Double-click a task, or press Enter on it, to edit it'}
            ]
        }, {
            module             : Gantt,
            reference          : 'gantt',
            flex               : 1,
            cascadeDependencies: true,
            editable           : true,
            rowHeight          : 36,
            store              : {module: TaskStore,       data: plan.tasks},
            dependencyStore    : {module: DependencyStore, data: plan.dependencies},
            taskColumns        : [{type: 'tree', dataField: 'title', text: 'Task', width: 240, locked: 'start'}],
            majorTickStep      : 1,
            majorTickUnit      : 'week',
            majorFormatter     : tick => `Week of ${format(tick.date)}`,
            minorFormatter     : tick => tick.date.toLocaleDateString('en-GB', {day: 'numeric', timeZone: 'UTC'}),
            // The now line marks the day the progress was reported
            timeAxis           : {start: '2027-03-01', end: '2027-04-19', now: '2027-03-12', timeZone: 'UTC', tickUnit: 'day', tickStep: 1, pxPerMinute: 0.02, snapMinutes: 1440}
        }]
    }
}

export default Neo.setupClass(TaskEditorViewport);
