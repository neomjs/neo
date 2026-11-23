import Button                               from '../../../src/button/Base.mjs';
import Component                            from '../../../src/component/Base.mjs';
import DependencyStore, {SEED_DEPENDENCIES} from './DependencyStore.mjs';
import Gantt                                from '../../../src/gantt/Container.mjs';
import Label                                from '../../../src/component/Label.mjs';
import StateProvider                        from '../../../src/state/Provider.mjs';
import TaskStore                            from './TaskStore.mjs';
import ThemeSwitcher                        from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar                              from '../../../src/toolbar/Base.mjs';
import Viewport                             from '../../../src/container/Viewport.mjs';

const
    AXIS_START     = '2026-11-02',
    AXIS_END       = '2026-11-23',
    TOTAL_DAYS     = 21,
    DESKTOP_DAY_PX = 60,
    COMPACT_DAY_PX = 18,
    DAY_FMT        = new Intl.DateTimeFormat('en-GB', {weekday: 'short', day: 'numeric', timeZone: 'UTC'}),
    WEEK_FMT       = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}),
    HINT           = 'Drag the dot at a task\'s end onto another task to link them: the second waits for the first to ' +
                     'finish. Or press L on one task, then L on the other.',
    TYPE_NAMES     = {FF: 'finish to finish', FS: 'finish to start', SF: 'start to finish', SS: 'start to start'};

/**
 * The four link types as the legend draws them: the predecessor's bar above, the successor's below, and the
 * connector between the edges each type joins, in the chart's own link colour. `head` is the arrow's tip and its
 * direction: `1` points right into a start, `-1` points left into an end.
 * @type {Object[]}
 */
const LINK_TYPES = [
    {type: 'FS', text: 'Finish to start',  pred: [4, 18],  succ: [26, 40], path: 'M18 6 H22 V18 H26', head: [26, 18, 1]},
    {type: 'SS', text: 'Start to start',   pred: [12, 26], succ: [16, 30], path: 'M12 6 H7 V18 H16',  head: [16, 18, 1]},
    {type: 'FF', text: 'Finish to finish', pred: [8, 22],  succ: [14, 28], path: 'M22 6 H33 V18 H28', head: [28, 18, -1]},
    {type: 'SF', text: 'Start to finish',  pred: [26, 40], succ: [4, 16],  path: 'M26 6 H21 V18 H16', head: [16, 18, -1]}
];

/**
 * @summary A product launch whose tasks a planner links by drag: eight links in all four types to begin with,
 * and six tasks still unlinked.
 * @description `dependencyCreation` puts a dot on each task's finish edge. A drag from that dot to another task
 * adds a finish-to-start link to the dependency store, and the cascade moves the successor if the link requires it.
 * A drop on the same task, or one that would close a cycle, is refused: while the pointer is over it the line turns
 * dashed and the task gets no target ring. The other three types come with the plan's data. The legend draws all
 * four in the chart's link colour, and the status line names each link a visitor adds.
 * @class Neo.examples.gantt.dependencies.Viewport
 * @extends Neo.container.Viewport
 */
class LaunchViewport extends Viewport {
    /**
     * @summary Builds one legend entry: an SVG glyph of two bars and their connector, and the type's name.
     * @param {Object} entry An item of {@link LINK_TYPES}
     * @returns {Object} VDOM
     */
    static buildLegendItem({head: [x, y, dir], path, pred, succ, text, type}) {
        return {tag: 'li', cls: ['launch-legend-item'], data: {linkType: type}, cn: [{
            tag: 'svg', cls: ['launch-legend-glyph'], viewBox: '0 0 44 24', 'aria-hidden': 'true', cn: [
                {tag: 'rect', cls: ['launch-legend-bar'], x: pred[0], y: 3,  width: pred[1] - pred[0], height: 6, rx: 2},
                {tag: 'rect', cls: ['launch-legend-bar'], x: succ[0], y: 15, width: succ[1] - succ[0], height: 6, rx: 2},
                {tag: 'path', cls: ['launch-legend-link'], d: path},
                {tag: 'path', cls: ['launch-legend-head'], d: `M${x} ${y} L${x - 5 * dir} ${y - 3} L${x - 5 * dir} ${y + 3} Z`}
            ]
        }, {
            tag: 'span', text
        }]}
    }

    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.dependencies.Viewport'
         * @protected
         */
        className: 'Neo.examples.gantt.dependencies.Viewport',
        /**
         * @member {String[]} cls=['launch-viewport']
         */
        cls: ['launch-viewport'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            stores: {
                dependencies: {module: DependencyStore},
                tasks       : {module: TaskStore}
            }
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['launch-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module: Label,
                cls   : ['launch-title'],
                text  : 'Product launch'
            }, {
                module   : Component,
                cls      : ['launch-status'],
                flex     : 1,
                reference: 'status',
                role     : 'status',
                text     : HINT
            }, {
                module   : Button,
                cls      : ['launch-reset'],
                handler  : 'up.onResetPlan',
                reference: 'reset',
                text     : 'Reset',
                ui       : 'secondary'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module: Component,
            cls   : ['launch-legend-bar-row'],
            flex  : 'none',
            vdom  : {cn: [{
                tag : 'span',
                cls : ['launch-legend-title'],
                id  : 'launch-legend-title',
                text: 'Link types'
            }, {
                tag              : 'ul',
                cls              : ['launch-legend'],
                'aria-labelledby': 'launch-legend-title',
                cn               : LINK_TYPES.map(entry => this.buildLegendItem(entry))
            }]}
        }, {
            module             : Gantt,
            animateCascade     : true,
            bind               : {dependencyStore: 'stores.dependencies', store: 'stores.tasks'},
            cascadeDependencies: true,
            cls                : ['launch-gantt'],
            dependencyCreation : true,
            editable           : true,
            flex               : 1,
            majorFormatter     : tick => `Week of ${WEEK_FMT.format(tick.date)}`,
            majorTickUnit      : 'week',
            minorFormatter     : tick => tick.size < 44 ? String(tick.date.getUTCDate()) : DAY_FMT.format(tick.date),
            reference          : 'gantt',
            rowHeight          : 40,
            taskColumns        : [{type: 'tree', dataField: 'title', text: 'Task', width: 176, locked: 'start'}],
            timeAxis           : {
                end        : AXIS_END,
                now        : '2026-10-26T00:00:00Z',
                size       : TOTAL_DAYS * DESKTOP_DAY_PX,
                snapMinutes: 1440,
                start      : AXIS_START,
                tickStep   : 1,
                tickUnit   : 'day',
                timeZone   : 'UTC'
            }
        }]
    }

    #isCompact = null

    /**
     * @summary Names each link a visitor adds, and keeps whole-day columns at desktop and phone widths.
     */
    onConstructed() {
        super.onConstructed();

        let me    = this,
            gantt = me.getReference('gantt');

        me.getStateProvider().getStore('dependencies').on('mutate', me.onLinksChange, me);

        if (gantt?.body) {
            me.observeConfig(gantt.body, 'containerWidth', width => me.syncViewportDensity(width));

            if (gantt.body.containerWidth > 0) {
                me.syncViewportDensity(gantt.body.containerWidth)
            }
        }
    }

    /**
     * @summary Shows the endpoints and type of a link a visitor adds in the status line.
     * @param {Object} data
     * @param {Object[]} data.addedItems
     */
    onLinksChange({addedItems}) {
        const
            edge  = addedItems?.length === 1 && addedItems[0],
            tasks = this.getStateProvider().getStore('tasks');

        if (edge) {
            const
                from = tasks.get(edge.fromId)?.title ?? edge.fromId,
                to   = tasks.get(edge.toId)?.title   ?? edge.toId;

            this.getReference('status').text = `Linked “${from}” to “${to}”, ${TYPE_NAMES[edge.type] ?? edge.type}.`
        }
    }

    /**
     * @summary Restores the fourteen tasks and the eight starting links.
     */
    onResetPlan() {
        let me       = this,
            provider = me.getStateProvider(),
            links    = provider.getStore('dependencies'),
            tasks    = provider.getStore('tasks');

        // A link a visitor adds leaves the store's `data` config as it was, so assigning the seed again would equal
        // it and change nothing: replace the records
        me.getReference('gantt').cancelKeyboardLink();
        links.clear();
        tasks.clear();
        tasks.add(TaskStore.buildSeedTasks());
        links.add(SEED_DEPENDENCIES.map(edge => ({...edge})));

        me.getReference('status').text = HINT
    }

    /**
     * @summary Sets whole-day columns of `60px` at desktop width and `18px` below `520px`, where the axis scrolls.
     * @param {Number} width The grid body's width
     */
    syncViewportDensity(width) {
        let me      = this,
            compact = width < 520,
            axis;

        if (!width || compact === me.#isCompact) {
            return
        }

        me.#isCompact = compact;
        me.toggleCls('launch-is-compact', compact);

        axis = me.getReference('gantt')?.timeAxis;

        if (axis) {
            axis.size = TOTAL_DAYS * (compact ? COMPACT_DAY_PX : DESKTOP_DAY_PX)
        }
    }
}

export default Neo.setupClass(LaunchViewport);
