/**
 * @file test/playwright/unit/grid/ViewOwnedSelectionModel.spec.mjs
 * @summary AC coverage for the grid.View-owned single SelectionModel.
 *
 * Replaces the prior per-body cloned models + the BaseModel peer fan-out: exactly ONE model owned by
 * grid.View, shared by bodyStart/body/bodyEnd as render/event delegates. These pin the cross-family
 * empirical probes as acceptance criteria:
 *   - AC1: exactly one instance; start/center/end + the View all resolve to the same model.
 *   - AC2: a dynamic `body.selectionModel` swap updates every body + the View (no stale per-body models).
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
import CellModel          from '../../../../src/selection/grid/CellModel.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import RowModel           from '../../../../src/selection/grid/RowModel.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

test.describe('Grid View-owned SelectionModel (#12758)', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    let grid, store;

    test.beforeEach(async () => {
        const data = [];
        for (let i = 0; i < 5; i++) {
            data.push({id: i, col1: `C1-${i}`, col2: `C2-${i}`, col3: `C3-${i}`, col4: `C4-${i}`, col5: `C5-${i}`})
        }

        store = Neo.create(Store, {
            keyProperty: 'id',
            data,
            model: {fields: [
                {name: 'id',   type: 'Integer'},
                {name: 'col1', type: 'String'},
                {name: 'col2', type: 'String'},
                {name: 'col3', type: 'String'},
                {name: 'col4', type: 'String'},
                {name: 'col5', type: 'String'}
            ]}
        });

        // locked start (col3, col4) + unlocked (col1, col5) + locked end (col2) => 3 bodies
        grid = Neo.create(GridContainer, {
            appName  : 'GridViewOwnedSMTest',
            height   : 400,
            rowHeight: 40,
            store,
            width    : 600,
            columns  : [
                {dataField: 'col1', text: 'C1', width: 100},
                {dataField: 'col2', text: 'C2', width: 100, locked: 'end'},
                {dataField: 'col3', text: 'C3', width: 100, locked: 'start'},
                {dataField: 'col4', text: 'C4', width: 100, locked: 'start'},
                {dataField: 'col5', text: 'C5', width: 100}
            ]
        });

        await grid.initVnode();
        grid.mounted = true;
        await grid.timeout(50)
    });

    test.afterEach(async () => {
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('AC1: exactly one SelectionModel, shared by grid.View + all three bodies', () => {
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

    test('AC2: dynamic body.selectionModel swap updates all bodies + view, no stale', async () => {
        grid.body.selectionModel = {ntype: 'selection-grid-cellmodel'};

        await grid.timeout(20);

        const sm = grid.view.selectionModel;

        expect(sm.ntype).toBe('selection-grid-cellmodel');
        expect(grid.body.selectionModel).toBe(sm);
        expect(grid.bodyStart.selectionModel).toBe(sm);
        expect(grid.bodyEnd.selectionModel).toBe(sm);
        expect(sm.view).toBe(grid.view)
    })
});

/**
 * The three selection states of a grid: the default (an omitted `selectionModel` → ONE
 * RowModel, created by the center body, hoisted to the View, shared with every body), an explicit
 * model config (the same sharing), and NONE (`selectionModel: false` on the body → no model anywhere,
 * nothing instantiated, no row ever marked, no selection handlers on the View). The locked bodies
 * instantiate nothing in any state — the hoist hands them the View's single instance.
 */
test.describe('Grid selection: default, explicit, none (#18626)', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    const columns = [
        {dataField: 'col1', text: 'C1', width: 100},
        {dataField: 'col2', text: 'C2', width: 100, locked: 'end'},
        {dataField: 'col3', text: 'C3', width: 100, locked: 'start'}
    ];

    let created, grid, ownConstruct, store;

    const makeGrid = async body => {
        store = Neo.create(Store, {
            keyProperty: 'id',
            data       : [0, 1, 2].map(i => ({id: i, col1: `C1-${i}`, col2: `C2-${i}`, col3: `C3-${i}`})),
            model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'col1', type: 'String'}, {name: 'col2', type: 'String'}, {name: 'col3', type: 'String'}]}
        });

        grid = Neo.create(GridContainer, {
            appName: 'GridViewOwnedSMTest',
            ...(body ? {body} : {}),
            columns, height: 400, rowHeight: 40, store, width: 600
        });

        await grid.initVnode();
        grid.mounted = true;
        await grid.timeout(50);

        return grid
    };

    // the View and the three bodies, in that order
    const models = g => [g.view.selectionModel, g.body.selectionModel, g.bodyStart.selectionModel, g.bodyEnd.selectionModel];

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
        }
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

    test('default: an omitted selectionModel instantiates exactly ONE RowModel — the center body\'s, hoisted to the View and shared by the locked bodies', async () => {
        await makeGrid();

        const [viewModel, ...bodyModels] = models(grid);

        expect(viewModel?.ntype).toBe('selection-grid-rowmodel');
        expect(bodyModels).toEqual([viewModel, viewModel, viewModel]);
        expect(viewModel.view).toBe(grid.view);
        expect(created, 'one instance for the whole grid — the locked bodies clone nothing').toEqual([viewModel])
    });

    test('explicit: a model config on the body is the one instance everywhere, and no RowModel is created beside it', async () => {
        await makeGrid({selectionModel: {module: CellModel}});

        const [viewModel, ...bodyModels] = models(grid);

        expect(viewModel?.ntype).toBe('selection-grid-cellmodel');
        expect(bodyModels).toEqual([viewModel, viewModel, viewModel]);
        expect(created).toHaveLength(0)
    });

    test('none: `selectionModel: false` on the body leaves the View and every body without a model — nothing instantiated, no row marked, no selection handler to mark one on a click', async () => {
        await makeGrid({selectionModel: false});

        expect(models(grid)).toEqual([null, null, null, null]);
        expect(created, 'the locked bodies instantiate nothing either').toHaveLength(0);
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

    test('a post-construction `false` clears the View and every body and destroys the one model — none is a state the whole hoist honors', async () => {
        await makeGrid();

        const model = grid.view.selectionModel;

        grid.body.selectionModel = false;
        await grid.timeout(20);

        expect(models(grid)).toEqual([null, null, null, null]);
        expect(model.isDestroyed).toBe(true);
        expect(selectionTraces(grid)).toEqual({listeners: 0, wrapperCls: []});
        expect(created, 'no replacement model appeared').toEqual([model])
    })
});
