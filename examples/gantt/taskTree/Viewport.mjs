import Button        from '../../../src/button/Base.mjs';
import Gantt         from '../../../src/gantt/Container.mjs';
import Label         from '../../../src/component/Label.mjs';
import StateProvider from '../../../src/state/Provider.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';
import TaskStore     from './TaskStore.mjs';

/**
 * @summary An exhibition plan whose phase spans and progress follow their tasks.
 * @class Neo.examples.gantt.taskTree.Viewport
 * @extends Neo.container.Viewport
 */
class TaskTreeViewport extends Viewport {
    /** @summary Builds locked task and progress columns for the available viewport. @param {Boolean} compact @returns {Object[]} */
    static taskColumns(compact) {
        return [
            {type: 'tree', dataField: 'title', text: 'Phase / task', width: compact ? 160 : 220, locked: 'start', columnMenu: false, sortable: false},
            {dataField: 'percentDone', text: 'Done', width: compact ? 76 : 90, locked: 'start', columnMenu: false, sortable: false,
                renderer: ({value}) => `${Math.round(value || 0)}%`}
        ]
    }

    static config = {
        className    : 'Neo.examples.gantt.taskTree.Viewport',
        cls          : ['task-tree-viewport'],
        layout       : {ntype: 'vbox', align: 'stretch'},
        listeners    : {resize: 'onResize'},
        monitorSize  : true,
        stateProvider: {module: StateProvider, stores: {tasks: {module: TaskStore}}},
        items        : [{
            module: Toolbar,
            cls   : ['task-tree-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [
                {module: Label, cls: ['task-tree-title'], text: 'An exhibition takes shape'},
                '->',
                {module: Button, cls: ['task-tree-delay'], text: 'Delay the lighting', handler: 'up.onDelayLighting'},
                {module: Button, cls: ['task-tree-reset'], text: 'Reset', handler: 'up.onReset'},
                {module: ThemeSwitcher}
            ]
        }, {
            module: Label,
            cls   : ['task-tree-hint'],
            flex  : 'none',
            text  : 'November 2026: Move a task or delay the lighting. Its phase follows; fold it to keep the plan in view.'
        }, {
            module            : Gantt,
            bind              : {store: 'stores.tasks'},
            cls               : ['task-tree-gantt'],
            dependencyCreation: false,
            editable          : true,
            flex              : 1,
            majorTickUnit     : 'week',
            majorFormatter    : tick => tick.unit === 'month' ? 'November' : `Nov ${tick.date.getUTCDate()}`,
            reference         : 'gantt',
            rowHeight         : 36,
            showNonWorkingTime: false,
            barRenderer(bar, {record, vdom}) {
                return (parseFloat(vdom?.style?.width) || 0) < 70 ? '' : (bar?.event || record)?.title || ''
            },
            taskColumns: this.taskColumns(false),
            timeAxis   : {
                start: '2026-11-01', end: '2026-11-29', now: '2026-10-01',
                size : 840, snapMinutes: 1440, tickUnit: 'day', tickStep: 1, timeZone: 'UTC'
            }
        }]
    }

    #compact = null
    #shortOpening = null

    /** @summary Fits the four-week axis beside the locked columns as the chart changes width. */
    onConstructed() {
        super.onConstructed();
        const gantt = this.getReference('gantt');
        this.observeConfig(gantt.body, 'containerWidth', width => this.syncDensity(width));
        this.syncDensity(gantt.body.containerWidth)
    }

    /** @summary Sizes columns and day ticks for desktop or phone without changing task dates. @param {Number} width */
    syncDensity(width) {
        if (!(width > 0)) return;

        const gantt = this.getReference('gantt'), compact = width < 600;
        if (compact !== this.#compact) {
            this.#compact = compact;
            gantt.taskColumns = this.constructor.taskColumns(compact);
            gantt.majorTickUnit = compact ? 'month' : 'week'
        }

        const locked = compact ? 236 : 310,
            dayWidth = Math.max(5, Math.floor((width - locked - 4) / 28));
        gantt.timeAxis.set({size: dayWidth * 28, tickStep: compact ? 7 : dayWidth < 30 ? 2 : 1})
    }

    /** @summary Opens the first phase folded on a short, medium-width first frame. @param {Object} data */
    onResize(data) {
        if (data.id !== this.id || this.#shortOpening !== null) return;

        const {inlineSize, blockSize} = data.borderBoxSize,
            store                     = this.getStateProvider().getStore('tasks');

        this.#shortOpening = inlineSize >= 600 && blockSize <= 600;
        if (this.#shortOpening) store.collapse('curate')
    }

    /** @summary Moves the lighting to November 16–18 through the Gantt task writer. */
    onDelayLighting() {
        const gantt = this.getReference('gantt'), task = this.getStateProvider().getStore('tasks').get('lighting');

        if (task) {
            gantt.moveTask(task, {
                startDate: new Date('2026-11-16T00:00:00Z'),
                endDate  : new Date('2026-11-18T00:00:00Z')
            })
        }
    }

    /** @summary Restores the original plan through the public store. */
    onReset() {
        const store = this.getStateProvider().getStore('tasks');
        store.clear();
        store.add(TaskStore.buildSeedTasks());
        if (this.#shortOpening) store.collapse('curate')
    }
}

export default Neo.setupClass(TaskTreeViewport);
