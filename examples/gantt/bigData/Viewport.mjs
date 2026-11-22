import Button          from '../../../src/button/Base.mjs';
import Component       from '../../../src/component/Base.mjs';
import Container       from '../../../src/container/Base.mjs';
import DependencyStore from '../../../src/gantt/DependencyStore.mjs';
import Gantt           from '../../../src/gantt/Container.mjs';
import Label           from '../../../src/component/Label.mjs';
import TaskStore       from '../../../src/gantt/TaskStore.mjs';
import ThemeSwitcher   from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar         from '../../../src/toolbar/Base.mjs';
import Viewport        from '../../../src/container/Viewport.mjs';

const
    MS_PER_DAY       = 86_400_000,
    PROJECT_START    = '2026-09-07',
    PROJECT_START_MS = Date.parse(`${PROJECT_START}T00:00:00Z`),
    // Progress is drawn as of this date, so the first phase shows finished, running and open tasks.
    STATUS_DATE_MS   = Date.parse('2026-10-05T00:00:00Z'),
    ZONES_PER_PHASE  = 12,
    CREWS            = 4,
    PHASES           = [
        {title: 'Site preparation',  steps: ['Survey', 'Clear', 'Grade', 'Drain', 'Compact']},
        {title: 'Foundations',       steps: ['Excavate', 'Blind', 'Fix rebar', 'Pour footings', 'Backfill']},
        {title: 'Structure',         steps: ['Columns', 'Formwork', 'Fix rebar', 'Pour slab', 'Strike formwork']},
        {title: 'Building envelope', steps: ['Frame', 'Insulate', 'Clad', 'Glaze', 'Seal']},
        {title: 'Building services', steps: ['Ductwork', 'Pipework', 'Cabling', 'Fit units', 'Second fix']},
        {title: 'Interior fit-out',  steps: ['Partitions', 'Plaster', 'Floors', 'Joinery', 'Paint']},
        {title: 'External works',    steps: ['Kerbs', 'Paving', 'Lighting', 'Planting', 'Fencing']},
        {title: 'Commissioning',     steps: ['Test', 'Balance', 'Snag', 'Inspect', 'Sign off']}
    ],
    WEEKS_ZOOM = {majorTickStep: 1, majorTickUnit: 'month', pxPerMinute: 0.03, snapMinutes: 1440, tickStep: 1, tickUnit: 'week'},
    DAYS_ZOOM  = {...Gantt.zoomPresets.week, snapMinutes: 1440},
    format     = (date, options) => date.toLocaleDateString('en-GB', {...options, timeZone: 'UTC'}),
    iso        = ms => new Date(ms).toISOString();

/**
 * @summary Deterministic 32-bit PRNG (Mulberry32): every load draws the same plan.
 * @param {Number} seed
 * @returns {Function} Next pseudo-random float in `[0, 1)`.
 */
function createSeededRandom(seed) {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/**
 * @summary Generates a building programme of 2,000 tasks: 8 phases of 12 zones, each zone's work done by
 * four crews in their own bays.
 * @description Every link is finish-to-start. A crew works its bay's steps in order, and the next crew starts
 * its bay after the first step of the previous one. A zone starts after the first step of the zone before it
 * in the same phase, and after the last task of the same zone in the phase before. Dates come from a forward
 * pass over those links, so no successor starts before its predecessor ends. A phase and a zone span their
 * children; their progress is the children's, weighted by duration.
 * @returns {{links: Object[], tasks: Object[]}}
 */
function buildProgramme() {
    const
        rand     = createSeededRandom(20261123),
        tasks    = [],
        links    = [],
        packages = PHASES.map(() => []),
        link     = (from, to) => links.push({
            id: `l-${String(links.length + 1).padStart(4, '0')}`, fromId: from.id, toId: to.id, type: 'FS', lag: 0, lagUnit: 'day'
        });

    PHASES.forEach((phase, p) => {
        const phaseRow = {id: `p${p + 1}`, parentId: null, isLeaf: false, collapsed: p > 0, title: phase.title, children: []};
        tasks.push(phaseRow);

        for (let z = 0; z < ZONES_PER_PHASE; z++) {
            const
                zoneRow = {id: `${phaseRow.id}-z${String(z + 1).padStart(2, '0')}`, parentId: phaseRow.id, isLeaf: false, collapsed: false, title: `Zone ${z + 1}`, children: []},
                count   = z % 4 === 3 ? 19 : 20, // 72 zones of 20 and 24 of 19 tasks make 1,896 + 96 + 8 = 2,000 rows
                crews   = Array.from({length: CREWS}, () => []);

            phaseRow.children.push(zoneRow);
            tasks.push(zoneRow);

            for (let i = 0; i < count; i++) {
                const crew = Math.floor(i / phase.steps.length), step = i % phase.steps.length;

                crews[crew].push({
                    id      : `${zoneRow.id}-t${String(i + 1).padStart(2, '0')}`,
                    parentId: zoneRow.id,
                    isLeaf  : true,
                    title   : `${phase.steps[step]} · bay ${crew + 1}`,
                    days    : 1 + Math.floor(rand() * 4)
                })
            }

            crews.forEach((crew, c) => crew.forEach((task, s) => {
                const preds = s > 0 ? [crew[s - 1]] : c > 0 ? [crews[c - 1][0]] : [
                    ...(z > 0 ? [packages[p][z - 1].crews[0][0]] : []),
                    ...(p > 0 ? [packages[p - 1][z].last]       : [])
                ];

                preds.forEach(pred => link(pred, task));
                task.start = Math.max(PROJECT_START_MS, ...preds.map(pred => pred.end));
                task.end   = task.start + task.days * MS_PER_DAY;
                task.percentDone = task.end <= STATUS_DATE_MS ? 100 : task.start >= STATUS_DATE_MS ? 0 :
                    Math.round((STATUS_DATE_MS - task.start) / (task.end - task.start) * 20) * 5
            }));

            zoneRow.children = crews.flat();
            packages[p][z]   = {crews, last: zoneRow.children.reduce((a, b) => b.end > a.end ? b : a)};
            tasks.push(...zoneRow.children)
        }
    });

    // Zones before phases: a phase spans its zones once they span their tasks.
    for (const parent of [...tasks.filter(task => task.parentId && !task.isLeaf), ...tasks.filter(task => !task.parentId)]) {
        const spans = parent.children.map(child => child.end - child.start);

        parent.start       = Math.min(...parent.children.map(child => child.start));
        parent.end         = Math.max(...parent.children.map(child => child.end));
        parent.percentDone = Math.round(parent.children.reduce((sum, child, i) => sum + child.percentDone * spans[i], 0) /
            spans.reduce((sum, span) => sum + span, 0))
    }

    return {
        links,
        tasks: tasks.map(({id, parentId, isLeaf, collapsed, title, start, end, percentDone}) => ({
            id, parentId, isLeaf, title, percentDone, startDate: iso(start), endDate: iso(end), ...(isLeaf ? {} : {collapsed})
        }))
    }
}

const {links, tasks} = buildProgramme();

/**
 * @summary A building programme of 2,000 linked tasks on the Gantt chart, opened on its first phase.
 * @class Neo.examples.gantt.bigData.Viewport
 * @extends Neo.container.Viewport
 */
class BigDataViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.bigData.Viewport'
         * @protected
         */
        className: 'Neo.examples.gantt.bigData.Viewport',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['programme-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [
                {module: Label, cls: ['programme-title'], text: 'Harbour Point build programme'},
                {
                    module: Label,
                    cls   : ['programme-counts'],
                    text  : `${tasks.length.toLocaleString('en-US')} tasks · ${links.length.toLocaleString('en-US')} links`
                },
                {module: Label, cls: ['programme-hint'], text: 'Expand a phase and scroll: the tree, the bars and the links keep up.'},
                {module: Component, cls: ['programme-spacer'], flex: 1},
                {
                    module: Container,
                    cls   : ['programme-zoom-group'],
                    flex  : 'none',
                    layout: {ntype: 'hbox', align: 'center'},
                    role  : 'group',
                    items : [
                        {module: Button, cls: ['programme-zoom'], reference: 'zoom-days',  text: 'Days',  pressed: false, handler: 'up.onDays'},
                        {module: Button, cls: ['programme-zoom'], reference: 'zoom-weeks', text: 'Weeks', pressed: true,  handler: 'up.onWeeks'}
                    ]
                },
                {module: ThemeSwitcher}
            ]
        }, {
            module             : Gantt,
            reference          : 'gantt',
            flex               : 1,
            rowHeight          : 40,
            editable           : true,
            animateCascade     : true,
            cascadeDependencies: true,
            showNonWorkingTime : false,
            store              : {module: TaskStore,       data: tasks},
            dependencyStore    : {module: DependencyStore, data: links},
            taskColumns        : [{type: 'tree', dataField: 'title', text: 'Task', width: 240, locked: 'start'}],
            listeners          : {taskChange: 'up.onTaskChange'},
            majorTickUnit      : WEEKS_ZOOM.majorTickUnit,
            majorTickStep      : WEEKS_ZOOM.majorTickStep,
            majorFormatter     : tick => tick.unit === 'month'
                ? format(tick.date, {month: 'long', year: 'numeric'})
                : format(tick.date, {day: 'numeric', month: 'short', year: 'numeric'}),
            minorFormatter     : tick => tick.unit === 'week'
                ? format(tick.date, {day: 'numeric', month: 'short'})
                : format(tick.date, {weekday: 'short', day: 'numeric'}),
            timeAxis: {
                start      : PROJECT_START,
                end        : '2027-04-26',
                timeZone   : 'UTC',
                tickUnit   : WEEKS_ZOOM.tickUnit,
                tickStep   : WEEKS_ZOOM.tickStep,
                pxPerMinute: WEEKS_ZOOM.pxPerMinute,
                snapMinutes: WEEKS_ZOOM.snapMinutes
            }
        }]
    }

    /**
     * @summary Keeps every zone and phase spanning its tasks after an edit and its cascade.
     * @description The chart moves a task and its successors, while a parent keeps its stored dates
     * (`Neo.gantt.Container`). Each affected parent takes its children's span, zones before phases,
     * and the store writes all of them as one batch.
     * @param {Object} data The chart's `taskChange` event
     * @param {Object} data.changesById Changed fields by task key, the cascade included
     */
    onTaskChange({changesById}) {
        const
            store   = this.getReference('gantt').store,
            spans   = new Map(),
            changed = Object.keys(changesById).map(id => store.get(id)).filter(Boolean);
        // An edited summary is visited too: a phase or zone moved by itself returns to its children's span
        let parents = new Set([
            ...changed.filter(task => !task.isLeaf).map(task => task.id),
            ...changed.map(task => task.parentId).filter(Boolean)
        ]);

        while (parents.size) {
            const next = new Set();

            for (const id of parents) {
                const
                    parent   = store.get(id),
                    children = store.getChildren(id).map(child => spans.get(child.id) || {start: +child.startDate, end: +child.endDate}),
                    start    = Math.min(...children.map(child => child.start)),
                    end      = Math.max(...children.map(child => child.end));

                spans.set(id, {changed: +parent.startDate !== start || +parent.endDate !== end, start, end});
                parent.parentId && next.add(parent.parentId)
            }

            parents = next
        }

        store.updateRows([...spans].filter(([, span]) => span.changed).map(([key, {start, end}]) => ({
            key, values: {startDate: new Date(start), endDate: new Date(end)}
        })))
    }

    /** @summary Shows a day per tick. */
    onDays() {
        this.applyZoom(DAYS_ZOOM, 'zoom-days')
    }

    /** @summary Shows a week per tick under the months. */
    onWeeks() {
        this.applyZoom(WEEKS_ZOOM, 'zoom-weeks')
    }

    /**
     * @summary Applies a time scale and marks its button pressed.
     * @param {Object} preset
     * @param {String} activeReference
     * @protected
     */
    applyZoom(preset, activeReference) {
        this.getReference('gantt').zoomTo(preset);

        for (const ref of ['zoom-days', 'zoom-weeks']) {
            this.getReference(ref).pressed = ref === activeReference
        }
    }
}

export default Neo.setupClass(BigDataViewport);
