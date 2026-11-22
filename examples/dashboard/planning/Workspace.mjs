import Board         from './Board.mjs';
import DockWorkspace from '../../../src/dashboard/dock/Workspace.mjs';
import Gantt         from '../../../src/gantt/Container.mjs';
import LayoutAdapter from '../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import Plan          from './Plan.mjs';
import Scheduler     from './Scheduler.mjs';

/**
 * @summary Three resident views borrow the workspace's plan. The booking view contains the same leaf
 * records that the Gantt schedules, including leaves under a folded phase.
 * @class Neo.examples.dashboard.planning.Workspace
 * @extends Neo.dashboard.dock.Workspace
 */
class Workspace extends DockWorkspace {
    static config = {
        className                 : 'Neo.examples.dashboard.planning.Workspace',
        cls                       : ['planning-workspace'],
        compactRows               : false,
        enableDockTearOutLifecycle: true,
        stateProvider             : {module: Plan},
        panes                     : {
            scheduler: {module: Scheduler, header: {text: 'Scheduler'}, closable: false, pinnable: false},
            gantt    : {module: Gantt, cls: ['planning-gantt'], header: {text: 'Gantt'}, closable: false, pinnable: false},
            board    : {module: Board, header: {text: 'Task Board'}, closable: false, pinnable: false}
        },
        zones: {
            center: {
                orientation: 'horizontal', sizes: [0.55, 0.45],
                children   : [
                    {orientation: 'vertical', sizes: [0.4, 0.6], children: [{items: ['scheduler']}, {items: ['gantt']}]},
                    {items: ['board']}
                ]
            }
        }
    }

    /** @summary Keeps the default tear-out route and enables a tab to return to this workspace. */
    getDockProjectionOptions() {
        return {...super.getDockProjectionOptions(), crossWindowSortGroup: this.id}
    }

    /** @summary Resolves the canonical pane even while its component is embodied in another window. */
    getPlanPane(key) {
        const declaration = this.getPaneDeclaration(key);
        return declaration && Neo.get(declaration.id)
    }

    /** @summary Keeps the board selection and both timeline highlights on the same task across windows. */
    selectTask(key) {
        const provider = this.getStateProvider();
        if (key === provider.getData('selectedTask')) return;
        provider.setData('selectedTask', key);
        this.getPlanPane('board')?.selectionModel.setSelection(key == null ? [] : [key], true);
        for (const id of ['scheduler', 'gantt']) {
            const column = this.getPlanPane(id)?.timelineColumn;
            if (column) column.highlightedRecordIds = key == null ? [] : [key]
        }
    }

    /**
     * @summary Materializes each declared pane once. Store references survive cross-window reparenting.
     * @param {String} key Pane key
     * @param {Object} item Dock item
     * @returns {Neo.component.Base}
     */
    resolvePane(key, item) {
        const declaration = super.resolvePane(key, item);
        if (!this.getPaneDeclaration(key) || Neo.typeOf(declaration) === 'NeoInstance') return declaration;
        const config = LayoutAdapter.decorateItemConfig(declaration, key, item);

        const provider = this.getStateProvider(), tasks = provider.getStore('tasks'), people = provider.getStore('people'),
              selected = provider.getData('selectedTask');

        if (key === 'board') {
            const board = Neo.create({...config, store: tasks.getBookingStore(), peopleStore: people,
                selectionModel: {ntype: 'selection-board', singleSelect: true}});
            board.selectionModel.setSelection(selected ? [selected] : [], true);
            board.on('selectionChange', ({selection}) => this.selectTask(selection[0] ?? null));
            return board
        }

        const lockedWidth = key === 'gantt' ? 164 : 76;
        const common      = {
            majorFormatter    : tick => `Week of ${tick.date.getUTCDate()} Nov`,
            majorTickUnit     : 'week',
            minorFormatter    : tick => String(tick.date.getUTCDate()),
            showNonWorkingTime: true,
            timeAxis          : {
                start   : '2026-11-09', end: '2026-11-21', now: '2026-11-11', size: 540,
                timeZone: 'UTC', tickUnit: 'day', snapMinutes: 1440, nonWorkingDays: [0, 6]
            },
            timelineColumnConfig: {highlightedRecordIds: selected ? [selected] : []}
        };
        const pane = key === 'gantt'
            ? Neo.create({...config, ...common, store: tasks, dependencyStore: provider.getStore('links'),
                rowHeight: this.compactRows ? 19 : 29,
                barRenderer({width, title}) { return width < 75 ? '' : title },
                taskColumns: [{type: 'tree', dataField: 'title', text: 'Task', width: lockedWidth, locked: 'start', columnMenu: false, sortable: false}]})
            : Neo.create({...config, ...common, store: people, eventStore: tasks.getBookingStore(),
                getTaskChart   : () => this.getPlanPane('gantt') || this.resolvePane('gantt', this.dockModel.items.gantt),
                rowHeight      : this.compactRows ? 21 : 37,
                resourceColumns: [{dataField: 'name', text: 'Crew', width: lockedWidth, locked: 'start', columnMenu: false, sortable: false}]});

        pane.addDomListeners({delegate: '.neo-timeline-bar', click: data => {
            const {barNode} = pane.extractBarTarget(data.path || data.targetPath || []),
                  taskId    = barNode?.data?.eventId;
            if (taskId && tasks.getBookingStore().get(taskId)) this.selectTask(taskId)
        }});

        const fit = width => {
            if (width > lockedWidth) {
                pane.timeAxis.set({size: width - lockedWidth - 3, tickStep: width < 500 ? 2 : 1})
            }
        };
        pane.observeConfig(pane.body, 'containerWidth', fit);
        fit(pane.body.containerWidth);
        return pane
    }
}

export default Neo.setupClass(Workspace);
