/**
 * @file test/playwright/unit/grid/ViewOwnedSelectionModel.spec.mjs
 * @summary AC coverage for the grid.View-owned selection model.
 *
 * Exactly ONE model, owned by grid.View: instantiated there (the `RowModel` default or an explicit
 * config), registered there, destroyed there. `bodyStart`/`body`/`bodyEnd` are render/event delegates
 * that carry no model of their own — they read the View's for the paint. `null` on the View is the
 * third state: a grid that selects nothing.
 *   - AC1: exactly one instance; start/center/end + the View all resolve to the same model.
 *   - AC2: a dynamic `view.selectionModel` swap reaches every body (no stale per-body models).
 *   - the three states, the dynamic clear, and the body's refusal to own a model.
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
import CellModel          from '../../../../src/selection/grid/CellModel.mjs';
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

const createStore = () => Neo.create(Store, {
    keyProperty: 'id',
    data       : [0, 1, 2, 3, 4].map(i => ({id: i, col1: `C1-${i}`, col2: `C2-${i}`, col3: `C3-${i}`, col4: `C4-${i}`, col5: `C5-${i}`})),
    model      : {fields: ['id', 'col1', 'col2', 'col3', 'col4', 'col5'].map(name => ({name, type: name === 'id' ? 'Integer' : 'String'}))}
});

const createGrid = async (store, config) => {
    const grid = Neo.create(GridContainer, {appName: 'GridViewOwnedSMTest', columns, height: 400, rowHeight: 40, store, width: 600, ...config});

    await grid.initVnode();
    grid.mounted = true;
    await grid.timeout(50);

    return grid
};

// the View and the three bodies, in that order
const models = grid => [grid.view.selectionModel, grid.body.selectionModel, grid.bodyStart.selectionModel, grid.bodyEnd.selectionModel];

test.describe('Grid View-owned SelectionModel (#12758)', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

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

    test('AC1: exactly one SelectionModel, owned by grid.View, read by all three bodies', () => {
        expect(grid.bodyStart).toBeTruthy();
        expect(grid.bodyEnd).toBeTruthy();

        const sm = grid.view.selectionModel;

        expect(sm).toBeTruthy();
        expect(grid.body.selectionModel).toBe(sm);
        expect(grid.bodyStart.selectionModel).toBe(sm);
        expect(grid.bodyEnd.selectionModel).toBe(sm);
        // the model's view is grid.View (the orchestrator), not an individual body
        expect(sm.view).toBe(grid.view)
    });

    test('AC2: a dynamic view.selectionModel swap reaches every body, no stale model', async () => {
        const previous = grid.view.selectionModel;

        grid.view.selectionModel = {ntype: 'selection-grid-cellmodel'};

        await grid.timeout(20);

        const sm = grid.view.selectionModel;

        expect(sm.ntype).toBe('selection-grid-cellmodel');
        expect(grid.body.selectionModel).toBe(sm);
        expect(grid.bodyStart.selectionModel).toBe(sm);
        expect(grid.bodyEnd.selectionModel).toBe(sm);
        expect(sm.view).toBe(grid.view);
        expect(previous.isDestroyed, 'the View destroys the model it replaces').toBe(true)
    })
});

test.describe('Grid selection: the View owns it — default, explicit, none', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    let created, grid, ownConstruct, store;

    // what a registered model leaves on the View: its DOM listeners (scoped to itself) and its wrapper cls
    const selectionTraces = g => ({
        listeners : g.view.domListeners.filter(listener => listener.scope?.ntype?.startsWith('selection-')).length,
        wrapperCls: (g.view.wrapperCls || []).filter(cls => cls.startsWith('neo-selection'))
    });

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

    test('default: exactly ONE RowModel for the whole grid — instantiated by the View, registered there, read by the locked bodies', async () => {
        grid = await createGrid(store);

        const [viewModel, ...bodyModels] = models(grid);

        expect(viewModel?.ntype).toBe('selection-grid-rowmodel');
        expect(viewModel.view).toBe(grid.view);
        expect(bodyModels).toEqual([viewModel, viewModel, viewModel]);
        expect(created, 'one instance — no body instantiates anything').toEqual([viewModel])
    });

    test('explicit: viewConfig names the one model, and no RowModel is created beside it', async () => {
        grid = await createGrid(store, {viewConfig: {selectionModel: {module: CellModel}}});

        const [viewModel, ...bodyModels] = models(grid);

        expect(viewModel?.ntype).toBe('selection-grid-cellmodel');
        expect(bodyModels).toEqual([viewModel, viewModel, viewModel]);
        expect(created).toHaveLength(0)
    });

    test('none: viewConfig {selectionModel: null} leaves the grid without a model — nothing instantiated, no handler, no row marked', async () => {
        grid = await createGrid(store, {viewConfig: {selectionModel: null}});

        expect(models(grid)).toEqual([null, null, null, null]);
        expect(created).toHaveLength(0);
        expect(grid.body.selectedRows).toEqual([]);
        expect(grid.body.selectedCells).toEqual([]);
        expect(selectionTraces(grid)).toEqual({listeners: 0, wrapperCls: []});

        // give the bodies the geometry the harness cannot measure, so their row pools materialize,
        // then read every rendered row: no mark, no assistive-tech claim
        const bodies = [grid.bodyStart, grid.body, grid.bodyEnd];

        bodies.forEach(body => body.set({availableRows: 5, availableWidth: 600, containerWidth: 600}));
        await grid.timeout(20);

        const rows = bodies.flatMap(body => body.items);

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

        expect(models(grid)).toEqual([null, null, null, null]);
        expect(model.isDestroyed).toBe(true);
        expect(selectionTraces(grid)).toEqual({listeners: 0, wrapperCls: []});
        expect(created, 'no replacement model appeared').toEqual([model]);

        // the body neither configures nor accepts a model — the View is the owner
        expect(() => { grid.body.selectionModel = {module: CellModel} }).toThrow(/grid\.Body carries no selection model/);
        expect(GridContainer.prototype.applyViewSelectionModel, 'nothing is hoisted any more').toBeUndefined();
        expect(BaseModel.prototype.getActivePeers, 'the peer fan-out is gone').toBeUndefined()
    })
});
