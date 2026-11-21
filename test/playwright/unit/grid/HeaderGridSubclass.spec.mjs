/**
 * @file test/playwright/unit/grid/HeaderGridSubclass.spec.mjs
 * @summary A header inside a grid subclass with an ntype of its own (Scheduler, Gantt) reaches its grid: its sort,
 * its inline filter, its header filter and its column menu work on that grid's store.
 *
 * The header asks its toolbar for the grid that built it, so an ntype other than `grid-container` does not hide that
 * grid: the arrow and the store's sorters agree.
 *
 * @see Neo.grid.header.Button#getGridContainer
 */
import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Store              from '../../../../src/data/Store.mjs';
import GanttContainer     from '../../../../src/gantt/Container.mjs';
import TaskStore          from '../../../../src/gantt/TaskStore.mjs';
import MenuPlugin         from '../../../../src/grid/header/plugin/Menu.mjs';
import SchedulerContainer from '../../../../src/scheduler/Container.mjs';
import EventStore         from '../../../../src/timeline/store/Events.mjs';

const appName = 'HeaderGridSubclassTest';

setup({
    neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

const timeAxis = {start: '2026-11-09T00:00:00Z', end: '2026-11-09T12:00:00Z', tickUnit: 'hour', tickStep: 1, pxPerMinute: 1};

/** A Gantt with one phase of three tasks, out of title order. */
const createGantt = (taskColumn={}) => Neo.create(GanttContainer, {
    appName,
    store: {module: TaskStore, data: [
        {id: 'p', parentId: null, isLeaf: false, collapsed: false, title: 'Phase', startDate: '2026-11-09T01:00:00Z', endDate: '2026-11-09T05:00:00Z'},
        {id: 'b', parentId: 'p',  isLeaf: true,  title: 'Bravo',   startDate: '2026-11-09T01:00:00Z', endDate: '2026-11-09T02:00:00Z'},
        {id: 'c', parentId: 'p',  isLeaf: true,  title: 'Charlie', startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T03:00:00Z'},
        {id: 'a', parentId: 'p',  isLeaf: true,  title: 'Alpha',   startDate: '2026-11-09T03:00:00Z', endDate: '2026-11-09T05:00:00Z'}
    ]},
    taskColumns: [{type: 'tree', dataField: 'title', text: 'Task', width: 160, ...taskColumn}],
    timeAxis
});

/** A Scheduler with three resources, out of name order. */
const createScheduler = () => Neo.create(SchedulerContainer, {
    appName,
    eventStore: Neo.create(EventStore, {data: []}),
    store     : Neo.create(Store, {keyProperty: 'id', model: {fields: [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]},
        data: [{id: '2', name: 'Bea'}, {id: '3', name: 'Cy'}, {id: '1', name: 'Ana'}]}),
    timeAxis
});

test.describe('A header in a grid subclass with its own ntype', () => {
    let grid;

    test.afterEach(() => {
        grid?.destroy();
        grid = null
    });

    for (const [name, create, field, sorted] of [
        ['Gantt',     createGantt,     'title', ['Phase', 'Alpha', 'Bravo', 'Charlie']],
        ['Scheduler', createScheduler, 'name',  ['Ana', 'Bea', 'Cy']]
    ]) {
        test(`a ${name} header's sort sorts the ${name}'s store`, () => {
            grid = create();
            const button = grid.getButton(field);

            expect(grid.ntype).not.toBe('grid-container');
            expect(button.getGridContainer()).toBe(grid);

            // A header fires its sort only while mounted
            button.mounted = true;
            button.isSorted = 'ASC';

            expect(grid.store.sorters.map(sorter => [sorter.property, sorter.direction])).toEqual([[field, 'ASC']]);
            expect(grid.store.items.map(record => record[field])).toEqual(sorted)
        })
    }

    test('a Gantt header\'s inline filter writes to the Gantt\'s store', () => {
        grid = createGantt();

        grid.getButton('title').changeFilterValue({value: 'Alpha'});

        expect(grid.store.getFilter('title', 'header-inline')?.value).toBe('Alpha')
    });

    test('a Gantt header\'s header filter and column menu bind the Gantt\'s store', async () => {
        const bound = [], bindStore = MenuPlugin.prototype.bindStore;

        MenuPlugin.prototype.bindStore = function(store) {
            bound.push(store);
            return bindStore.call(this, store)
        };

        try {
            grid = createGantt({columnMenu: true});
            const button = grid.getButton('title');

            await expect.poll(() => button.getPlugin('plugin-grid-header-menu')).toBeTruthy();
            expect(bound.at(-1)).toBe(grid.store);

            button.showHeaderFilter = true;
            await button.ensureHeaderFilterProjection();

            expect(button.getPlugin('plugin-header-filter').sourceStore).toBe(grid.store)
        } finally {
            MenuPlugin.prototype.bindStore = bindStore
        }
    })
});
