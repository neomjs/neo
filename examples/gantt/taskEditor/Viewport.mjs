import DependencyStore from '../../../src/gantt/DependencyStore.mjs';
import Gantt           from '../../../src/gantt/Container.mjs';
import Label           from '../../../src/component/Label.mjs';
import TaskStore       from '../../../src/gantt/TaskStore.mjs';
import ThemeSwitcher   from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar         from '../../../src/toolbar/Base.mjs';
import Viewport        from '../../../src/container/Viewport.mjs';

const
    DAY_MS = 86_400_000,
    START  = Date.UTC(2027, 2, 1),
    // Each task: [id, title, days, percent done on 12 March, the tasks it follows]
    PHASES          = [
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
    // The stylesheet's phone breakpoint, where the task column narrows to leave the chart room for its bars
    PHONE_MAX_WIDTH = 600,
    TASK_WIDTH      = {phone: 160, wide: 240};

/**
 * @summary A website relaunch whose tasks open in the Gantt's task editor: a double-click on a bar, or Enter on a
 * focused bar. A saved end moves the task and every task linked after it; a saved percent fills its bar. On a phone
 * the task column narrows, so the chart keeps room for its bars.
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
         * @member {Object} listeners={resize:'onResize'}
         */
        listeners: {resize: 'onResize'},
        /**
         * @member {Boolean} monitorSize=true
         */
        monitorSize: true,
        /**
         * The stores get the plan from the static builders below: JavaScript defines a class's static methods
         * before it evaluates its static fields, and each viewport deep-clones its items.
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar, cls: ['te-toolbar'], flex: 'none', items: [
                {module: Label, cls: ['te-title'],    text: 'Website relaunch'},
                {module: Label, cls: ['te-subtitle'], text: 'Seven weeks · four phases · progress on 12 March · UTC'},
                '->',
                {module: Label, cls: ['te-hint'],     text: 'Double-click a task, or press Enter on it, to edit it'},
                {module: ThemeSwitcher}
            ]
        }, {
            module             : Gantt,
            reference          : 'gantt',
            flex               : 1,
            cascadeDependencies: true,
            editable           : true,
            rowHeight          : 36,
            store              : {module: TaskStore,       data: this.buildTasks()},
            dependencyStore    : {module: DependencyStore, data: this.buildDependencies()},
            taskColumns        : [{type: 'tree', dataField: 'title', text: 'Task', width: TASK_WIDTH.wide, locked: 'start'}],
            majorTickStep      : 1,
            majorTickUnit      : 'week',
            majorFormatter     : tick => `Week of ${tick.date.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'})}`,
            minorFormatter     : tick => tick.date.toLocaleDateString('en-GB', {day: 'numeric', timeZone: 'UTC'}),
            // The now line marks the day the progress was reported
            timeAxis           : {start: '2027-03-01', end: '2027-04-19', now: '2027-03-12', timeZone: 'UTC', tickUnit: 'day', tickStep: 1, pxPerMinute: 0.02, snapMinutes: 1440}
        }]
    }

    /**
     * @summary One finish-to-start link for every task a task follows.
     * @returns {Object[]} The dependency store's records
     */
    static buildDependencies() {
        return PHASES.flatMap(phase => phase.tasks.flatMap(([toId, , , , follows]) =>
            follows.map(fromId => ({id: `${fromId}-${toId}`, fromId, toId, type: 'FS', lag: 0, lagUnit: 'hour'}))
        ))
    }

    /**
     * @summary Schedules every task right after the tasks it follows and rolls each phase up to its tasks' span.
     * @returns {Object[]} The task store's records: each phase, then its tasks
     */
    static buildTasks() {
        const
            byId   = new Map(PHASES.flatMap(phase => phase.tasks.map(task => [task[0], task]))),
            starts = new Map(),
            iso    = day => new Date(START + day * DAY_MS).toISOString(),
            start  = id => {
                if (!starts.has(id)) {
                    const [, , , , follows] = byId.get(id);
                    starts.set(id, Math.max(0, ...follows.map(key => start(key) + byId.get(key)[2])))
                }
                return starts.get(id)
            };

        return PHASES.flatMap(phase => {
            const rows = phase.tasks.map(([id, title, days, percentDone]) =>
                ({id, parentId: phase.id, isLeaf: true, percentDone, title, startDate: iso(start(id)), endDate: iso(start(id) + days)})
            );

            return [{
                id       : phase.id, parentId: null, isLeaf: false, collapsed: false, title: phase.title,
                startDate: rows.map(row => row.startDate).sort()[0],
                endDate  : rows.map(row => row.endDate).sort().at(-1)
            }, ...rows]
        })
    }

    /**
     * @summary Opens the inner-pages task on first mount, with its dependency visible beside the editor.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        const gantt = this.getReference('gantt');
        if (value && !gantt.eventEditor) {
            gantt.openTaskEditor('pages')
        }
    }

    /**
     * @summary Narrows the task column at the phone breakpoint and widens it back above it.
     * @param {Object} data The viewport's `resize` event
     */
    onResize(data) {
        const
            gantt  = this.getReference('gantt'),
            [tree] = gantt?.taskColumns || [],
            width  = data.borderBoxSize.inlineSize <= PHONE_MAX_WIDTH ? TASK_WIDTH.phone : TASK_WIDTH.wide;

        if (data.id === this.id && tree && tree.width !== width) {
            gantt.taskColumns = [{...tree, width}]
        }
    }
}

export default Neo.setupClass(TaskEditorViewport);
