/**
 * @file test/playwright/unit/grid/ViewOwnedSelectionModel.spec.mjs
 * @summary AC coverage for the grid.View-owned selection model.
 *
 * Exactly ONE model, owned by grid.View: instantiated there (the `RowModel` default or an explicit
 * config), registered there, destroyed there. `bodyStart`/`body`/`bodyEnd` are render/event delegates
 * that hold and expose no model — a row paints the View's projected selection. `null` on the View is
 * the third state: a grid that selects nothing. The View also follows the store for the one selection
 * concern it owns, the selected-record field — once per grid, however many bodies render a record.
 *
 * @see Neo.grid.View
 * @see Neo.selection.grid.BaseModel
 */
import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridViewOwnedSMTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import BaseModel          from '../../../../src/selection/grid/BaseModel.mjs';
import CellColumnRowModel from '../../../../src/selection/grid/CellColumnRowModel.mjs';
import CellModel          from '../../../../src/selection/grid/CellModel.mjs';
import CellRowModel       from '../../../../src/selection/grid/CellRowModel.mjs';
import ColumnModel        from '../../../../src/selection/grid/ColumnModel.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import RowModel           from '../../../../src/selection/grid/RowModel.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

// locked start (col3, col4) + unlocked (col1, col5) + locked end (col2) => 3 bodies
const columns = [
    {dataField: 'col1', text: 'C1', width: 100},
    {dataField: 'col2', text: 'C2', width: 100, locked: 'end'},
    {dataField: 'col3', text: 'C3', width: 100, locked: 'start'},
    {dataField: 'col4', text: 'C4', width: 100, locked: 'start'},
    {dataField: 'col5', text: 'C5', width: 100}
];

// `flag` stands in for the selected-record field a View can be told to follow
const createStore = (flagged = []) => Neo.create(Store, {
    keyProperty: 'id',
    data       : [0, 1, 2, 3, 4].map(i => ({id: i, flag: flagged.includes(i), col1: `C1-${i}`, col2: `C2-${i}`, col3: `C3-${i}`, col4: `C4-${i}`, col5: `C5-${i}`})),
    model      : {fields: [
        {name: 'id', type: 'Integer'}, {name: 'flag', type: 'Boolean'},
        ...['col1', 'col2', 'col3', 'col4', 'col5'].map(name => ({name, type: 'String'}))
    ]}
});

// business ids, so selection state reads as the record ids the data carries
const createGrid = async (store, config) => {
    const grid = Neo.create(GridContainer, {appName: 'GridViewOwnedSMTest', columns, height: 400, rowHeight: 40, store, useInternalId: false, width: 600, ...config});

    await grid.initVnode();
    grid.mounted = true;
    await grid.timeout(50);

    return grid
};

const bodiesOf = grid => [grid.bodyStart, grid.body, grid.bodyEnd];

// what a registered model leaves on the View: its wrapper cls (registration adds it, destruction removes it)
const selectionTraces = grid => ({
    wrapperCls: (grid.view.wrapperCls || []).filter(cls => cls.startsWith('neo-selection'))
});

// materialize every body's row pool (the harness has no geometry to derive it from)
const renderRows = async grid => {
    bodiesOf(grid).forEach(body => body.set({availableRows: 5, availableWidth: 600, containerWidth: 600}));
    await grid.timeout(20)
};

// the record ids each body paints as selected, in body order
const paintedRows = grid => bodiesOf(grid).map(body => body.items.filter(row => row.vdom.cls?.includes('neo-selected')).map(row => row.record?.id).sort());

// the dataFields each body paints as column-selected, in body order; `neo-selected` is the column cell cls
// of a model that declares none, like ColumnModel — passed in, since the arms read it after the model is gone
const paintedColumns = (grid, cls = 'neo-selected') => bodiesOf(grid).map(body => [...new Set(body.items.flatMap(row =>
    (row.vdom.cn || []).filter(cell => cell.cls?.includes(cls)).map(cell => cell.data?.field)
))].sort());

// No `NEO_TEST_SKIP_CI` guard anywhere in this file: nothing here needs a browser, and a guarded arm is
// green in the unit CI job by not running.
test.describe('Grid View-owned SelectionModel (#12758)', () => {
    let grid, store;

    test.beforeEach(async () => {
        store = createStore();
        grid  = await createGrid(store)
    });

    test.afterEach(async () => {
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('AC1: exactly one SelectionModel, owned and registered by grid.View; no body holds or exposes one', () => {
        expect(grid.bodyStart).toBeTruthy();
        expect(grid.bodyEnd).toBeTruthy();

        const sm = grid.view.selectionModel;

        expect(sm).toBeTruthy();
        // the model's view is grid.View (the orchestrator), not an individual body
        expect(sm.view).toBe(grid.view);
        expect(bodiesOf(grid).map(body => body.selectionModel), 'no readable alias on any body').toEqual([undefined, undefined, undefined])
    });

    test('AC2: a dynamic view.selectionModel swap replaces the one instance and destroys the previous one', async () => {
        const previous = grid.view.selectionModel;

        grid.view.selectionModel = {ntype: 'selection-grid-cellmodel'};

        await grid.timeout(20);

        const sm = grid.view.selectionModel;

        expect(sm.ntype).toBe('selection-grid-cellmodel');
        expect(sm.view).toBe(grid.view);
        expect(previous.isDestroyed, 'the View destroys the model it replaces').toBe(true);

        const {wrapperCls} = selectionTraces(grid);

        expect(wrapperCls, 'the new model is registered, the old one unregistered').toHaveLength(1);
        expect(wrapperCls).not.toContain('neo-selection-rowmodel')
    })
});

test.describe('Grid selection: the View owns it — default, explicit, none', () => {
    let created, grid, ownConstruct, store;

    test.beforeEach(() => {
        // every RowModel any part of the grid instantiates, transient or kept
        created      = [];
        ownConstruct = Object.hasOwn(RowModel.prototype, 'construct') ? RowModel.prototype.construct : null;

        const inherited = RowModel.prototype.construct;

        RowModel.prototype.construct = function(...args) {
            created.push(this);
            return inherited.apply(this, args)
        };

        store = createStore()
    });

    test.afterEach(async () => {
        if (ownConstruct) {
            RowModel.prototype.construct = ownConstruct
        } else {
            delete RowModel.prototype.construct
        }

        await grid?.timeout(20);
        grid?.destroy();
        store?.destroy();
        grid = store = null
    });

    test('default: exactly ONE RowModel for the whole grid — instantiated by the View, registered there, painted by the locked bodies', async () => {
        grid = await createGrid(store);

        const viewModel = grid.view.selectionModel;

        expect(viewModel?.ntype).toBe('selection-grid-rowmodel');
        expect(viewModel.view).toBe(grid.view);
        expect(created, 'one instance — no body instantiates anything').toEqual([viewModel]);

        await renderRows(grid);
        viewModel.selectRow(3);
        await grid.timeout(20);

        expect(paintedRows(grid), 'every body paints the View\'s selection').toEqual([[3], [3], [3]])
    });

    test('explicit: viewConfig names the one model, and no RowModel is created beside it', async () => {
        grid = await createGrid(store, {viewConfig: {selectionModel: {module: CellModel}}});

        expect(grid.view.selectionModel?.ntype).toBe('selection-grid-cellmodel');
        expect(grid.view.selectionModel.view).toBe(grid.view);
        expect(created).toHaveLength(0)
    });

    test('none: viewConfig {selectionModel: null} leaves the grid without a model — nothing instantiated, no handler, no row marked', async () => {
        grid = await createGrid(store, {viewConfig: {selectionModel: null}});

        expect(grid.view.selectionModel).toBeNull();
        expect(created).toHaveLength(0);
        expect(grid.view.selectedRows).toEqual([]);
        expect(grid.view.selectedCells).toEqual([]);
        expect(selectionTraces(grid)).toEqual({wrapperCls: []});

        await renderRows(grid);

        const rows = bodiesOf(grid).flatMap(body => body.items);

        expect(rows.length).toBeGreaterThan(0);

        rows.forEach(row => {
            expect(row.vdom.cls).not.toContain('neo-selected');
            expect(row.vdom['aria-selected']).toBeUndefined()
        })
    });

    test('a post-construction null clears the grid and destroys the one model; a body refuses a model of its own', async () => {
        grid = await createGrid(store);

        const model = grid.view.selectionModel;

        grid.view.selectionModel = null;
        await grid.timeout(20);

        expect(grid.view.selectionModel).toBeNull();
        expect(model.isDestroyed).toBe(true);
        expect(selectionTraces(grid)).toEqual({wrapperCls: []});
        expect(created, 'no replacement model appeared').toEqual([model]);

        // the body neither configures, exposes nor accepts a model — the View is the owner
        expect(() => { grid.body.selectionModel = {module: CellModel} }).toThrow(/grid\.Body carries no selection model/);
        expect(grid.body.selectionModel, 'no readable alias on a body').toBeUndefined();
        expect(GridContainer.prototype.applyViewSelectionModel, 'nothing is hoisted any more').toBeUndefined();
        expect(BaseModel.prototype.getActivePeers, 'the peer fan-out is gone').toBeUndefined()
    })
});

test.describe('Grid selection: the View follows the store and owns the lifecycle', () => {
    let grid, store;

    test.afterEach(async () => {
        await grid?.timeout(20);
        grid?.destroy();
        store?.destroy();
        grid = store = null
    });

    test('a record flag change reaches the one model exactly once, however many bodies render the record', async () => {
        store = createStore();
        grid  = await createGrid(store, {viewConfig: {selectedRecordField: 'flag'}});

        await renderRows(grid);

        const model  = grid.view.selectionModel,
              calls  = [],
              select = model.selectRow;

        model.selectRow = function(...args) { calls.push(args); return select.apply(this, args) };

        store.get(1).flag = true;
        await grid.timeout(20);

        expect(calls.map(([recordId]) => recordId), 'one selectRow for three bodies').toEqual([1]);
        expect(grid.view.selectedRows).toEqual([1]);
        expect(paintedRows(grid), 'every body paints the row').toEqual([[1], [1], [1]]);

        store.get(1).flag = false;
        await grid.timeout(20);

        expect(grid.view.selectedRows).toEqual([]);
        expect(paintedRows(grid)).toEqual([[], [], []])
    });

    test('every row-selecting model follows the flag — RowModel, CellRowModel, CellColumnRowModel — and a cell or column model leaves it alone', async () => {
        for (const module of [RowModel, CellRowModel, CellColumnRowModel]) {
            store = createStore([1]);
            grid  = await createGrid(store, {viewConfig: {selectedRecordField: 'flag', selectionModel: {module}}});

            expect(grid.view.selectedRows, `${module.name} adopts a pre-flagged record at bind`).toEqual([1]);
            await renderRows(grid);
            expect(paintedRows(grid), `${module.name} paints it in every body`).toEqual([[1], [1], [1]]);

            store.get(3).flag = true;
            await grid.timeout(20);

            expect(grid.view.selectedRows, `${module.name} follows a flag set after the render, under its own policy`).toEqual([3]);
            expect(paintedRows(grid), `${module.name} paints the new row in every body`).toEqual([[3], [3], [3]]);

            grid.destroy();
            store.destroy()
        }

        for (const module of [CellModel, ColumnModel]) {
            store = createStore([1]);
            grid  = await createGrid(store, {viewConfig: {selectedRecordField: 'flag', selectionModel: {module}}});

            await renderRows(grid);

            store.get(3).flag = true;
            await grid.timeout(20);

            expect(grid.view.selectionModel.selectedRows, `${module.name} holds no row for a flag`).toEqual([]);
            expect(paintedRows(grid), `${module.name} paints no row for a flag`).toEqual([[], [], []]);

            grid.destroy();
            store.destroy()
        }

        grid = store = null
    });

    test('records flagged before the grid exists are adopted once by the one model, under its own policy — and never under selectionModel null', async () => {
        store = createStore([2, 4]);
        grid  = await createGrid(store, {viewConfig: {selectedRecordField: 'flag', selectionModel: {module: RowModel, singleSelect: false}}});

        expect(grid.view.selectedRows, 'adopted at bind time').toEqual([2, 4]);
        await renderRows(grid);
        expect(paintedRows(grid)).toEqual([[2, 4], [2, 4], [2, 4]]);

        grid.destroy();
        store.destroy();

        store = createStore([2, 4]);
        grid  = await createGrid(store, {viewConfig: {selectedRecordField: 'flag', selectionModel: null}});

        expect(grid.view.selectedRows).toEqual([]);
        await renderRows(grid);
        expect(paintedRows(grid), 'a flag without a model marks nothing').toEqual([[], [], []])
    });

    test('two grids never share a selection, and a destroyed grid leaves nothing behind for the next', async () => {
        const storeA = createStore(),
              gridA  = await createGrid(storeA, {viewConfig: {selectedRecordField: 'flag'}}),
              storeB = createStore(),
              gridB  = await createGrid(storeB, {viewConfig: {selectedRecordField: 'flag'}}),
              modelA = gridA.view.selectionModel,
              modelB = gridB.view.selectionModel;

        expect(modelB.selectedRows,    'each model owns its rows array').not.toBe(modelA.selectedRows);
        expect(modelB.selectedColumns, 'each model owns its columns array').not.toBe(modelA.selectedColumns);

        await renderRows(gridA);
        await renderRows(gridB);
        modelA.selectRow(3);

        expect(gridA.view.selectedRows).toEqual([3]);
        expect(gridB.view.selectedRows, 'the second grid holds no row the first selected').toEqual([]);
        expect(paintedRows(gridB)).toEqual([[], [], []]);

        gridA.destroy();
        storeA.destroy();

        store = createStore();
        grid  = await createGrid(store, {viewConfig: {selectedRecordField: 'flag'}});

        expect(grid.view.selectedRows, 'a grid created after another was destroyed starts empty').toEqual([]);

        gridB.destroy();
        storeB.destroy()
    });

    test('lock and unlock churn recreates bodies, never a model: the View keeps its one instance', async () => {
        store = createStore();
        grid  = await createGrid(store);

        const model = grid.view.selectionModel;

        grid.columns = columns.map(column => ({...column, locked: undefined}));
        await grid.timeout(20);
        expect(grid.bodyStart, 'no locked start body without locked columns').toBeFalsy();

        grid.columns = columns;
        await grid.timeout(20);

        expect(grid.bodyStart).toBeTruthy();
        expect(grid.view.selectionModel, 'the same instance across the churn').toBe(model);
        expect(model.isDestroyed).toBeFalsy();
        expect(model.view).toBe(grid.view)
    });

    test('a column-selecting model swaps out cleanly: no body keeps a column painted', async () => {
        store = createStore();
        grid  = await createGrid(store);

        await renderRows(grid);

        grid.view.selectionModel = {module: ColumnModel};
        await grid.timeout(20);

        // one column per body: col3 renders in bodyStart, col1 in body, col2 in bodyEnd
        grid.view.selectionModel.setSelectedColumns(['col1', 'col2', 'col3']);
        await grid.timeout(20);

        expect(paintedColumns(grid), 'precondition: each body paints its selected column').toEqual([['col3'], ['col1'], ['col2']]);

        expect(() => { grid.view.selectionModel = null }, 'ColumnModel.unregister runs through the View').not.toThrow();
        await grid.timeout(20);

        expect(grid.view.selectionModel).toBeNull();
        expect(paintedColumns(grid), 'no body keeps a column highlight for a model that is gone').toEqual([[], [], []])
    });

    test('a row-selecting model swaps out cleanly: no body keeps a row painted', async () => {
        store = createStore();
        grid  = await createGrid(store);

        await renderRows(grid);

        grid.view.selectionModel.selectRow(1);
        await grid.timeout(20);

        expect(paintedRows(grid), 'precondition: every body paints the selected row').toEqual([[1], [1], [1]]);

        grid.view.selectionModel = null;
        await grid.timeout(20);

        expect(paintedRows(grid), 'no body keeps a row highlight for a model that is gone').toEqual([[], [], []])
    });

    test('destroying the grid destroys the one model; removing a locked body does not', async () => {
        store = createStore();
        grid  = await createGrid(store);

        const model = grid.view.selectionModel;

        grid.columns = columns.map(column => ({...column, locked: undefined}));
        await grid.timeout(20);
        expect(model.isDestroyed, 'a body going away leaves the View\'s model alone').toBeFalsy();

        grid.destroy();
        grid = null;

        expect(model.isDestroyed).toBe(true);
        expect(Neo.manager.Instance.getById(model.id), 'gone from the instance manager').toBeFalsy()
    })
});
