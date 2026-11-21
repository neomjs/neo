import DependencyStore from '../../../src/gantt/DependencyStore.mjs';
import Gantt           from '../../../src/gantt/Container.mjs';
import Label           from '../../../src/component/Label.mjs';
import TaskModel       from './TaskModel.mjs';
import TaskStore       from '../../../src/gantt/TaskStore.mjs';
import Toolbar         from '../../../src/toolbar/Base.mjs';
import Viewport        from '../../../src/container/Viewport.mjs';

const
    DAY_MS = 86_400_000,
    START  = Date.UTC(2027, 3, 26),
    OWNERS = {
        aisha: 'Aisha Rahman',
        ines : 'Ines Navarro',
        jonas: 'Jonas Weber',
        kofi : 'Kofi Mensah',
        mei  : 'Mei Lin',
        tomas: 'Tomás Berg'
    },
    // Each task: [id, title, owner, days, percent done on 17 May, the tasks it follows, the earliest day it may start]
    PHASES = [
        {id: 'programme', title: 'Programme', owner: 'mei', tasks: [
            ['shortlist', 'Shortlist the headliners', 'mei', 5, 100, []],
            ['headliners', 'Book the headliners', 'mei', 10, 100, ['shortlist']],
            ['support', 'Book the support acts', 'mei', 10, 50, ['headliners']],
            ['running-order', 'Set the running order', 'mei', 3, 0, ['support']],
            ['schedule', 'Publish the schedule', 'aisha', 1, 0, ['running-order']],
            ['riders', 'Sign off the artist riders', 'ines', 4, 0, ['support']]
        ]},
        {id: 'comms', title: 'Tickets and comms', owner: 'aisha', tasks: [
            ['tickets', 'Open ticket sales', 'aisha', 1, 100, ['headliners']],
            ['press', 'Run the press campaign', 'aisha', 20, 25, ['tickets']],
            ['volunteers', 'Recruit the volunteers', 'ines', 15, 30, ['tickets']],
            ['signage', 'Print the signage', 'jonas', 4, 0, ['layout', 'schedule']],
            ['guide', 'Send the visitor guide', 'aisha', 1, 0, ['schedule'], 53],
            ['briefing', 'Brief the volunteers', 'ines', 1, 0, ['volunteers', 'guide']]
        ]},
        {id: 'site', title: 'Site', owner: 'kofi', tasks: [
            ['survey', 'Survey the meadow', 'kofi', 3, 100, []],
            ['permits', 'Apply for the permits', 'ines', 15, 85, ['survey']],
            ['layout', 'Draw the site layout', 'kofi', 5, 100, ['survey']],
            ['facilities', 'Hire fencing and facilities', 'jonas', 5, 100, ['layout']],
            ['fence', 'Build the fence line', 'kofi', 4, 0, ['permits', 'facilities'], 46],
            ['camping', 'Mark the camping field', 'jonas', 2, 0, ['fence']]
        ]},
        {id: 'production', title: 'Production', owner: 'tomas', tasks: [
            ['stages', 'Spec the stages', 'tomas', 5, 100, ['layout']],
            ['kit', 'Hire sound and lights', 'tomas', 5, 100, ['stages']],
            ['power', 'Book the generators', 'jonas', 3, 100, ['stages']],
            ['build-stage', 'Build the main stage', 'tomas', 5, 0, ['fence', 'kit']],
            ['rig', 'Rig sound and lights', 'tomas', 3, 0, ['build-stage', 'power']],
            ['line-check', 'Run the line check', 'tomas', 1, 0, ['rig', 'running-order']]
        ]},
        {id: 'weekend', title: 'Festival weekend', owner: 'ines', tasks: [
            ['gates', 'Open the gates', 'jonas', 1, 0, ['line-check', 'camping', 'briefing', 'signage'], 60],
            ['show', 'Three days of music', 'ines', 3, 0, ['line-check'], 60],
            ['load-out', 'Load out the stages', 'tomas', 2, 0, ['show']],
            ['clear', 'Clear the meadow', 'kofi', 3, 0, ['load-out']],
            ['settle', 'Settle the accounts', 'ines', 5, 0, ['show']]
        ]}
    ],
    // A narrow column of numbers or dates: right-aligned under a right-aligned header
    NUMBER = {cellAlign: 'right', cls: ['tc-compact'], columnMenu: false, headerAlign: 'auto'},
    format = date => new Date(date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}),
    iso    = day => new Date(START + day * DAY_MS).toISOString(),
    // Every column but the task tree leaves the locked side below this width, and returns above it
    LOOSE  = ['outline', 'owner', 'startDate', 'endDate', 'days', 'percentDone'];

/**
 * @summary Schedules every task after the tasks it follows, in any phase, and not before its earliest day; numbers
 * it in outline order, and rolls each phase up to its tasks: its span, and its progress weighted by days.
 * @returns {{tasks: Object[], dependencies: Object[]}} Task and finish-to-start link records for the stores.
 */
function buildPlan() {
    const
        byId   = new Map(PHASES.flatMap(phase => phase.tasks.map(task => [task[0], task]))),
        starts = new Map(),
        start  = id => {
            if (!starts.has(id)) {
                const [, , , , , follows, earliest=0] = byId.get(id);
                starts.set(id, Math.max(earliest, ...follows.map(key => start(key) + byId.get(key)[3])))
            }
            return starts.get(id)
        },
        tasks        = [],
        dependencies = [];

    PHASES.forEach((phase, phaseIndex) => {
        let done = 0, total = 0;

        const rows = phase.tasks.map(([id, title, owner, days, percentDone, follows], index) => {
            const first = start(id);

            done  += days * percentDone;
            total += days;
            follows.forEach(fromId => dependencies.push({id: `${fromId}-${id}`, fromId, toId: id, type: 'FS', lag: 0, lagUnit: 'hour'}));

            return {
                id, parentId: phase.id, isLeaf: true, outline: `${phaseIndex + 1}.${index + 1}`, owner, percentDone, title,
                startDate: iso(first), endDate: iso(first + days)
            }
        });

        tasks.push({
            id       : phase.id, parentId: null, isLeaf: false, collapsed: false, outline: String(phaseIndex + 1),
            owner    : phase.owner, percentDone: Math.round(done / total), title: phase.title,
            startDate: rows.map(row => row.startDate).sort()[0],
            endDate  : rows.map(row => row.endDate).sort().at(-1)
        }, ...rows)
    });

    return {tasks, dependencies}
}

/**
 * @summary The owner's initials in a badge of their own colour, beside their name.
 * @param {Object} data
 * @param {String} data.value The owner's key in `OWNERS`
 * @returns {Object}
 */
function ownerRenderer({value}) {
    const name = OWNERS[value];

    return {cls: ['tc-owner'], cn: [
        {tag: 'span', cls: ['tc-badge', `tc-badge-${value}`], 'aria-hidden': true, text: name.split(' ').map(part => part[0]).join('')},
        {tag: 'span', cls: ['tc-owner-name'], text: name}
    ]}
}

/**
 * @summary Percent done as a short bar and its number. A finished task's bar takes the finished colour.
 * @param {Object} data
 * @param {Number} data.value
 * @returns {Object}
 */
function doneRenderer({value}) {
    return {cls: value >= 100 ? ['tc-done', 'tc-done-complete'] : ['tc-done'], cn: [
        {cls: ['tc-done-track'], 'aria-hidden': true, cn: [{cls: ['tc-done-fill'], style: {width: `${value}%`}}]},
        {tag: 'span', cls: ['tc-done-value'], text: `${value}%`}
    ]}
}

const plan = buildPlan();

/**
 * @summary A festival's production plan: the table beside the bars carries an outline number, the task tree,
 * each task's owner, its start and finish, its days and its progress. Collapsing a phase folds its rows in the
 * table and in the chart together; on a narrow screen only the task tree stays locked and the rest scroll.
 * @class Neo.examples.gantt.taskColumns.Viewport
 * @extends Neo.container.Viewport
 */
class TaskColumnsViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.taskColumns.Viewport'
         * @protected
         */
        className: 'Neo.examples.gantt.taskColumns.Viewport',
        /**
         * @member {String[]} cls=['task-columns-viewport']
         */
        cls: ['task-columns-viewport'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar, cls: ['tc-toolbar'], flex: 'none', items: [
                {module: Label, cls: ['tc-title'],    text: 'Festival production plan'},
                {module: Label, cls: ['tc-subtitle'], text: 'Ten weeks · five phases · progress on 17 May · UTC'}
            ]
        }, {
            module         : Gantt,
            reference      : 'gantt',
            flex           : 1,
            rowHeight      : 36,
            store          : {module: TaskStore,       model: TaskModel, data: plan.tasks},
            dependencyStore: {module: DependencyStore, data: plan.dependencies},
            taskColumns    : [
                // The narrow columns go without a column menu, whose trigger takes 30 px, and with a compact header
                {dataField: 'outline',     text: '#',      width: 44,  ...NUMBER},
                {dataField: 'title',       text: 'Task',   width: 208, type: 'tree'},
                {dataField: 'owner',       text: 'Owner',  width: 144, renderer: ownerRenderer},
                {dataField: 'startDate',   text: 'Start',  width: 68,  ...NUMBER, renderer: ({value}) => format(value)},
                // A finish date names the task's last day: the record's end is the midnight after it
                {dataField: 'endDate',     text: 'Finish', width: 68,  ...NUMBER, renderer: ({value}) => format(new Date(value) - DAY_MS)},
                {dataField: 'days',        text: 'Days',   width: 66,  ...NUMBER},
                {dataField: 'percentDone', text: 'Done',   width: 112, renderer: doneRenderer}
            ],
            responsiveLockPolicy: {breakpoints: [
                {maxWidth: 1100,                    columns: Object.fromEntries(LOOSE.map(key => [key, null]))},
                {maxWidth: Number.MAX_SAFE_INTEGER, columns: Object.fromEntries(LOOSE.map(key => [key, 'start']))}
            ]},
            majorTickStep : 1,
            majorTickUnit : 'week',
            majorFormatter: tick => `Week of ${format(tick.date)}`,
            minorFormatter: tick => tick.date.toLocaleDateString('en-GB', {day: 'numeric', timeZone: 'UTC'}),
            // The now line marks the day the progress was reported
            timeAxis      : {start: '2027-04-26', end: '2027-07-05', now: '2027-05-17', timeZone: 'UTC', tickUnit: 'day', tickStep: 1, pxPerMinute: 0.02, snapMinutes: 1440}
        }]
    }
}

export default Neo.setupClass(TaskColumnsViewport);
