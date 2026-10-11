/**
 * @file test/playwright/unit/grid/ColumnResizeCellSync.spec.mjs
 * @summary Guards the header→body width-sync path used by grid column resizing.
 *
 * Resizing a column has to move two surfaces: the header button AND every body cell below it.
 * Two independent links carry that, and both failed SILENTLY (no thrown error) — which is why the
 * regression reached an operator instead of CI:
 *
 * 1. **Body routing.** `grid.header.plugin.Resizable#onDragMove` used to reach the body by walking
 *    `toolbar.parent.body`. The multi-body split inserted `grid.header.Wrapper` between a toolbar
 *    and the `grid.Container`, so that walk started yielding `undefined` and the live per-frame cell
 *    update stopped running behind a falsy `if (body)` guard. {@link Neo.grid.header.Toolbar#body}
 *    is now the single source of truth, and it is region-aware (locked start/end included).
 *
 * 2. **Repaint guarantee.** `passSizeToBody` rebuilt `columnPositions` and then relied on
 *    `updateMountedAndVisibleColumns()`, which repaints rows only as a *side effect* of the mounted
 *    range changing. A pure width change leaves `[startIndex, endIndex]` equal, the config never
 *    notifies (`core.Config` gates on `!isEqual`, and `core.Compare` deep-compares arrays), so the
 *    cells kept the geometry that had just been replaced. {@link Neo.grid.Body#refreshColumns}
 *    makes the repaint explicit.
 *
 * Defect 2 was latent from the start and MASKED by defect 1 working: the live path kept cells
 * correct, so by drop time they already matched. Each test below is written to fail if its own link
 * is reverted — including the non-vacuity control in the repaint group, which proves the bare
 * `updateMountedAndVisibleColumns()` really does skip the render it is being blamed for.
 *
 * @see Neo.grid.header.Toolbar
 * @see Neo.grid.header.plugin.Resizable
 * @see Neo.grid.Body
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
        name             : 'GridColumnResizeCellSyncTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import Toolbar            from '../../../../src/grid/header/Toolbar.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

/**
 * Reads the style of the cell rendered for `dataField` in the body's first active row.
 * Mirrors how `grid.Body#updateCellPositions` locates cells: a flat `vdom.cn` scan keyed by
 * `cell.data.field`.
 * @param {Neo.grid.Body} body
 * @param {String} dataField
 * @returns {Object|null}
 */
function getCellStyle(body, dataField) {
    const row = body.items[0];

    return row?.vdom.cn.find(cell => cell.data?.field === dataField)?.style || null
}

test.describe('grid.header.Toolbar#body — region-aware body routing', () => {
    /**
     * Method-level probe: the getter reads only `gridContainer` + `layoutLock`, so distinct sentinel
     * objects are enough to prove WHICH body each region resolves to. A fix that hardcodes
     * `gridContainer.body` passes the centre case and fails both locked cases here.
     */
    function makeToolbar(layoutLock) {
        const toolbar = Neo.create(Toolbar, {});

        toolbar.gridContainer = {
            body     : {region: 'center'},
            bodyStart: {region: 'start'},
            bodyEnd  : {region: 'end'}
        };

        toolbar.layoutLock = layoutLock;

        return toolbar
    }

    test('layoutLock null (centre) resolves the centre body', () => {
        const tb = makeToolbar(null);

        expect(tb.body.region).toBe('center');

        tb.destroy()
    });

    test('layoutLock "start" resolves bodyStart, not the centre body', () => {
        const tb = makeToolbar('start');

        expect(tb.body.region).toBe('start');

        tb.destroy()
    });

    test('layoutLock "end" resolves bodyEnd, not the centre body', () => {
        const tb = makeToolbar('end');

        expect(tb.body.region).toBe('end');

        tb.destroy()
    });

    test('an unconstructed toolbar (no gridContainer) resolves null rather than throwing', () => {
        const tb = Neo.create(Toolbar, {});

        expect(tb.body).toBeNull();

        tb.destroy()
    });
});

test.describe('grid column resize — header/cell width sync', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    let grid, store;

    test.beforeEach(async () => {
        const data = [];

        for (let i = 0; i < 5; i++) {
            data.push({id: i, col1: `C1-${i}`, col2: `C2-${i}`, col3: `C3-${i}`})
        }

        store = Neo.create(Store, {
            keyProperty: 'id',
            data,
            model      : {
                fields: [
                    {name: 'id',   type: 'Integer'},
                    {name: 'col1', type: 'String'},
                    {name: 'col2', type: 'String'},
                    {name: 'col3', type: 'String'}
                ]
            }
        });

        // Every column carries a fixed px width, so the geometry under assertion is exact arithmetic
        // rather than whatever a layout engine rounds to.
        grid = Neo.create(GridContainer, {
            appName  : 'GridColumnResizeCellSyncTest',
            height   : 400,
            width    : 600,
            store,
            rowHeight: 40,
            columns  : [
                {dataField: 'col1', text: 'Col 1', width: 100},
                {dataField: 'col2', text: 'Col 2', width: 100},
                {dataField: 'col3', text: 'Col 3', width: 100}
            ]
        });

        await grid.initVnode();
        grid.mounted = true;

        // The single-thread unit environment has no ResizeObserver, so the body never receives its
        // measured box and would render no rows at all. Inject ONLY those two measurements.
        grid.body.set({
            availableHeight: 360,
            containerWidth : 600
        });

        // Header buttons carry `flex: 'none'` (truthy), so `passSizeToBody` always takes its
        // `getLayoutRect()` branch — even for a fully fixed-width grid. That call needs main-thread
        // DOM, which this environment does not have. Substitute ONLY the measurement, modelling what
        // a browser reports for fixed-width flex-none buttons laid out in a row: everything
        // downstream (columnPositions, the repaint, the cell styles asserted below) stays real.
        grid.headerToolbar.getLayoutRect = async () => {
            let x = 0;

            return grid.headerToolbar.items.map(item => {
                const rect = {height: 40, width: item.width, x, y: 0};

                x += item.width;

                return rect
            })
        };

        // In production the toolbar seeds the initial geometry from `afterSetMounted`; that path
        // does not fire here, so drive it explicitly to establish the baseline.
        await grid.headerToolbar.passSizeToBody();

        await grid.timeout(50)
    });

    test.afterEach(async () => {
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('REGRESSION: the header toolbar reaches its body through the Wrapper topology', () => {
        // `owner` in grid.header.plugin.Resizable IS the header button, so evaluate both candidate
        // expressions from exactly that subject on the real component tree.
        const owner = grid.headerToolbar.items[0];

        expect(owner.parent).toBe(grid.headerToolbar);

        // The defect's precondition: a container level (grid.header.Wrapper) DOES sit between the
        // toolbar and the grid, so the pre-multi-body `owner.parent.parent.body` walk resolves to
        // nothing at all — silently, which is why it never raised.
        expect(owner.parent.parent).not.toBe(grid);
        expect(owner.parent.parent.body).toBeUndefined();

        // ...while the expression the plugin now uses lands on the real body.
        expect(owner.parent.body).toBe(grid.body)
    });

    test('CONTROL (non-vacuity): a bare updateMountedAndVisibleColumns skips the repaint when the range is unchanged', () => {
        const {body} = grid;

        let   renders                = 0;
        const originalCreateViewData = body.createViewData;

        body.createViewData = function(...args) {
            renders++;
            return originalCreateViewData.apply(this, args)
        };

        // Re-run with identical geometry: the mounted range cannot move, so the side effect the old
        // drop path depended on never fires. Without this control the guard below could pass
        // vacuously — it would not prove refreshColumns() is what makes the difference.
        body.updateMountedAndVisibleColumns();

        expect(renders).toBe(0);

        body.createViewData = originalCreateViewData
    });

    test('refreshColumns repaints even when the mounted column range is unchanged', () => {
        const {body} = grid;

        let   renders                = 0;
        const originalCreateViewData = body.createViewData;

        body.createViewData = function(...args) {
            renders++;
            return originalCreateViewData.apply(this, args)
        };

        body.refreshColumns();

        expect(renders).toBe(1);

        body.createViewData = originalCreateViewData
    });

    test('REGRESSION: on drop, passSizeToBody widens the cells, not just the header', async () => {
        const {body, headerToolbar} = grid;

        expect(getCellStyle(body, 'col1').width).toBe('100px');
        expect(getCellStyle(body, 'col2').left).toBe('100px');

        // What Resizable#onDragEnd does: commit the new width onto the header button, then hand the
        // geometry to the body.
        headerToolbar.getColumn('col1').width = 250;

        await headerToolbar.passSizeToBody();
        await grid.timeout(20);

        // The mounted range is deliberately unchanged here — that is the whole defect condition.
        expect(body.mountedColumns).toEqual([0, 2]);

        // The resized column's cells grow...
        expect(getCellStyle(body, 'col1').width).toBe('250px');
        // ...and every following column shifts by the same delta. Asserting the neighbour's `left`
        // (not just the resized column's width) is what makes this a geometry check rather than a
        // single-property one: a partial repaint would leave col2 overlapping col1.
        expect(getCellStyle(body, 'col2').left).toBe('250px')
    });

    test('REGRESSION: shrinking a column pulls the cells back in as well', async () => {
        const {body, headerToolbar} = grid;

        headerToolbar.getColumn('col1').width = 60;

        await headerToolbar.passSizeToBody();
        await grid.timeout(20);

        expect(getCellStyle(body, 'col1').width).toBe('60px');
        expect(getCellStyle(body, 'col2').left).toBe('60px')
    });
});
