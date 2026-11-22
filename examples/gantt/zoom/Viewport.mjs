import Button          from '../../../src/button/Base.mjs';
import Container       from '../../../src/container/Base.mjs';
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
    // `day` and `week` are the engine's presets; `month` fits the plan's ten weeks into a 1440 px window
    LEVELS = {
        day  : Gantt.zoomPresets.day,
        week : {...Gantt.zoomPresets.week, snapMinutes: 1440},
        month: {majorTickStep: 1, majorTickUnit: 'month', pxPerMinute: 0.012, snapMinutes: 1440, tickStep: 1, tickUnit: 'week'}
    },
    // Each task: [id, title, days, the tasks it follows]
    PHASES = [
        {id: 'site', title: 'Site and foundation', tasks: [
            ['survey', 'Survey and stake out', 1, []],
            ['permits', 'Post the permits', 1, []],
            ['clear', 'Clear the site', 2, ['survey', 'permits']],
            ['dig', 'Dig the footings', 2, ['clear']],
            ['footings', 'Pour the footings', 1, ['dig']],
            ['foundation', 'Lay the foundation walls', 3, ['footings']],
            ['waterproof', 'Waterproof the walls', 1, ['foundation']],
            ['drains', 'Lay the drains', 1, ['foundation']],
            ['backfill', 'Backfill', 1, ['waterproof', 'drains']],
            ['slab', 'Pour the slab', 1, ['backfill']],
            ['cure', 'Cure the slab', 3, ['slab']]
        ]},
        {id: 'framing', title: 'Framing', tasks: [
            ['sills', 'Set the sill plates', 1, ['cure']],
            ['floor', 'Frame the floor', 2, ['sills']],
            ['walls', 'Frame the walls', 3, ['floor']],
            ['raise', 'Raise the walls', 1, ['walls']],
            ['rafters', 'Frame the roof', 3, ['raise']],
            ['sheathe-walls', 'Sheathe the walls', 2, ['raise']],
            ['sheathe-roof', 'Sheathe the roof', 1, ['rafters']],
            ['stairs', 'Set the stairs', 1, ['raise']],
            ['porch', 'Frame the porch', 2, ['raise']],
            ['frame-check', 'Inspect the frame', 1, ['sheathe-roof', 'sheathe-walls', 'stairs']]
        ]},
        {id: 'envelope', title: 'Roof and envelope', tasks: [
            ['underlay', 'Lay the underlayment', 1, ['sheathe-roof']],
            ['shingles', 'Shingle the roof', 2, ['underlay']],
            ['flashing', 'Flash the chimney', 1, ['shingles']],
            ['gutters', 'Hang the gutters', 1, ['flashing']],
            ['wrap', 'Wrap the house', 1, ['sheathe-walls']],
            ['windows', 'Set the windows', 2, ['wrap']],
            ['doors', 'Hang the exterior doors', 1, ['windows']],
            ['siding', 'Hang the siding', 4, ['doors']],
            ['soffits', 'Fit the soffits', 1, ['siding', 'gutters']],
            ['trim-paint', 'Paint the exterior trim', 2, ['soffits']]
        ]},
        {id: 'services', title: 'Services rough-in', tasks: [
            ['plumbing', 'Rough in the plumbing', 3, ['frame-check']],
            ['wiring', 'Rough in the wiring', 3, ['frame-check']],
            ['ducts', 'Run the ducts', 3, ['frame-check']],
            ['gas', 'Run the gas line', 1, ['plumbing']],
            ['network', 'Pull the network cable', 1, ['wiring']],
            ['rough-check', 'Inspect the rough-ins', 1, ['gas', 'network', 'ducts']],
            ['insulate-walls', 'Insulate the walls', 2, ['rough-check', 'windows']],
            ['insulate-attic', 'Insulate the attic', 1, ['rough-check', 'shingles']],
            ['barrier', 'Fit the vapour barrier', 1, ['insulate-walls']],
            ['insulation-check', 'Inspect the insulation', 1, ['barrier', 'insulate-attic']]
        ]},
        {id: 'interior', title: 'Interior finishes', tasks: [
            ['drywall', 'Hang the drywall', 4, ['insulation-check']],
            ['tape', 'Tape and mud', 3, ['drywall']],
            ['prime', 'Prime the walls', 1, ['tape']],
            ['cabinets', 'Install the cabinets', 2, ['prime']],
            ['floors', 'Lay the floors', 3, ['prime']],
            ['tiles', 'Tile the bathrooms', 3, ['prime']],
            ['trim', 'Fit the trim', 2, ['floors']],
            ['paint', 'Paint the walls', 3, ['trim']],
            ['fixtures', 'Fit the fixtures', 2, ['paint', 'tiles', 'cabinets']],
            ['appliances', 'Install the appliances', 1, ['fixtures']]
        ]},
        {id: 'handover', title: 'Exterior and handover', tasks: [
            ['grade', 'Grade the yard', 2, ['trim-paint']],
            ['driveway', 'Pour the driveway', 2, ['grade']],
            ['walkways', 'Lay the walkways', 2, ['driveway']],
            ['deck', 'Build the deck', 3, ['grade', 'porch']],
            ['garden', 'Plant the garden', 2, ['walkways', 'deck']],
            ['final-power', 'Test the electrics', 1, ['appliances']],
            ['final-water', 'Test the plumbing', 1, ['appliances']],
            ['clean', 'Clean the house', 2, ['final-power', 'final-water']],
            ['punch', 'Walk the punch list', 3, ['clean', 'garden']],
            ['final-check', 'Final inspection', 1, ['punch']],
            ['keys', 'Hand over the keys', 1, ['final-check']]
        ]}
    ],
    format = (date, options) => date.toLocaleDateString('en-GB', {...options, timeZone: 'UTC'}),
    iso    = day => new Date(START + day * DAY_MS).toISOString();

/**
 * @summary Schedules every task directly after the tasks it follows, and rolls each phase up to its tasks.
 * @returns {{tasks: Object[], dependencies: Object[]}} Task and finish-to-start link records for the stores.
 */
function buildPlan() {
    const ends = {}, tasks = [], dependencies = [];

    for (const phase of PHASES) {
        const rows = phase.tasks.map(([id, title, days, follows]) => {
            const first = Math.max(0, ...follows.map(key => ends[key]));

            ends[id] = first + days;
            follows.forEach(fromId => dependencies.push({id: `${fromId}-${id}`, fromId, toId: id, type: 'FS', lag: 0, lagUnit: 'hour'}));

            return {id, parentId: phase.id, isLeaf: true, title, startDate: iso(first), endDate: iso(first + days)}
        });

        tasks.push({
            id       : phase.id, parentId: null, isLeaf: false, collapsed: false, title: phase.title,
            startDate: rows.map(row => row.startDate).sort()[0],
            endDate  : rows.map(row => row.endDate).sort().at(-1)
        }, ...rows)
    }

    return {tasks, dependencies}
}

const
    plan                                         = buildPlan(),
    {majorTickStep, majorTickUnit, ...monthAxis} = LEVELS.month;

/**
 * @summary A ten-week house build that reads at three scales: hours under days, days under weeks,
 * and weeks under months, where the whole plan fits one window. Every link is re-drawn at each scale.
 * @class Neo.examples.gantt.zoom.Viewport
 * @extends Neo.container.Viewport
 */
class ZoomViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.zoom.Viewport'
         * @protected
         */
        className: 'Neo.examples.gantt.zoom.Viewport',
        /**
         * @member {String[]} cls=['zoom-viewport']
         */
        cls: ['zoom-viewport'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar, cls: ['zoom-toolbar'], flex: 'none', items: [
                {module: Label, cls: ['zoom-title'],    text: 'House build'},
                {module: Label, cls: ['zoom-subtitle'], text: 'Ten weeks · six phases · UTC'},
                '->',
                {module: Container, cls: ['zoom-levels'], role: 'group', layout: {ntype: 'hbox', align: 'stretch'}, items: [
                    {module: Button, cls: ['zoom-level'], text: 'Day',   reference: 'level-day',   pressed: false, handler: 'up.onDay'},
                    {module: Button, cls: ['zoom-level'], text: 'Week',  reference: 'level-week',  pressed: false, handler: 'up.onWeek'},
                    {module: Button, cls: ['zoom-level'], text: 'Month', reference: 'level-month', pressed: true,  handler: 'up.onMonth'}
                ]},
                {module: ThemeSwitcher}
            ]
        }, {
            module         : Gantt,
            reference      : 'gantt',
            flex           : 1,
            rowHeight      : 36,
            store          : {module: TaskStore,       data: plan.tasks},
            dependencyStore: {module: DependencyStore, data: plan.dependencies},
            taskColumns    : [{type: 'tree', dataField: 'title', text: 'Task', width: 220, locked: 'start'}],
            majorTickStep,
            majorTickUnit,
            majorFormatter : tick => tick.unit === 'month'
                ? format(tick.date, {month: 'long', year: 'numeric'})
                : tick.unit === 'week'
                    ? `Week of ${format(tick.date, {day: 'numeric', month: 'short'})}`
                    : format(tick.date, {weekday: 'short', day: 'numeric', month: 'short'}),
            minorFormatter : tick => tick.unit === 'hour'
                ? tick.date.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'})
                : tick.unit === 'week'
                    ? format(tick.date, {day: 'numeric', month: 'short'})
                    : format(tick.date, {weekday: 'short', day: 'numeric'}),
            timeAxis       : {start: '2027-03-01', end: '2027-05-10', timeZone: 'UTC', ...monthAxis}
        }]
    }

    /** @summary Shows hours under each day. */
    onDay() {
        this.applyLevel('day')
    }

    /** @summary Shows days under each week. */
    onWeek() {
        this.applyLevel('week')
    }

    /** @summary Shows weeks under each month, so the whole plan fits one window. */
    onMonth() {
        this.applyLevel('month')
    }

    /**
     * @summary Zooms the chart to a level and marks its button as the active one.
     * @param {'day'|'week'|'month'} level
     */
    applyLevel(level) {
        this.getReference('gantt').zoomTo(LEVELS[level]);

        for (const name of Object.keys(LEVELS)) {
            this.getReference(`level-${name}`).pressed = name === level
        }
    }
}

export default Neo.setupClass(ZoomViewport);
