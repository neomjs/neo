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
