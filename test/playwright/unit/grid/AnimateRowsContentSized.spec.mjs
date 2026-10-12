/**
 * @file test/playwright/unit/grid/AnimateRowsContentSized.spec.mjs
 * @summary `grid.plugin.AnimateRows` stands aside in content-sized mode.
 *
 * The plugin animates rows to fixed-height positions and does not read the row geometry. With `contentSizedRows`
 * it takes its row transitions off the body, warns once that `animatedRowSorting` is ignored, and hands the store's
 * sort and filter events back to the body, which renders its rows at their geometry offsets. In fixed-height mode
 * it keeps its transitions and stays silent.
 *
 * @see Neo.grid.plugin.AnimateRows#standAside
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
        name             : 'GridAnimateRowsContentSizedTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import AnimateRows        from '../../../../src/grid/plugin/AnimateRows.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

const
    rowHeight = 40,
    viewport  = 360;

/**
 * @param {Number} count
 * @returns {Neo.data.Store}
 */
function createStore(count) {
    return Neo.create(Store, {
        data       : Array.from({length: count}, (item, index) => ({id: index, name: `Row ${index}`})),
        keyProperty: 'id',
        model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}]}
    })
}

/**
 * A mounted grid whose body animates its rows, with the layout a browser would deliver applied by hand
 * @param {Neo.data.Store} store
 * @param {Boolean} contentSizedRows
 * @param {Object} [body={animatedRowSorting: true}] The body config that brings in the plugin
 * @returns {Promise<Neo.grid.Container>}
 */
async function createGrid(store, contentSizedRows, body = {animatedRowSorting: true}) {
    let grid = Neo.create(GridContainer, {
        appName       : 'GridAnimateRowsContentSizedTest',
        body,
        bufferRowRange: 2,
        columns       : [{dataField: 'id', text: 'ID', width: 100}, {dataField: 'name', text: 'Name', width: 200}],
        contentSizedRows,
        height        : 400,
        rowHeight,
        store,
        width         : 600
    });

    await grid.initVnode();
    grid.mounted = true;

    await grid.headerToolbar.passSizeToBody();
    grid.body.set({availableHeight: viewport, containerWidth: 600});
    await grid.timeout(50);

    // The body imports the plugin on demand
    await expect.poll(() => !!grid.body.getPlugin('grid-animate-rows')).toBe(true);

    return grid
}

/**
 * Row heights keyed the way the grid keys them
 * @param {Neo.grid.Container} grid
 * @param {Object} heights Heights in px by the record's `id` field
 * @returns {Map}
 */
function heightsOf(grid, heights) {
    return new Map(Object.entries(heights).map(([id, height]) => [grid.view.getRecordId(grid.store.get(Number(id))), height]))
}

/**
 * Every row the body renders sits where the geometry puts its index
 * @param {Neo.grid.Body} body
 * @param {Neo.grid.RowGeometry} geometry
 */
function expectRowsOnGeometry(body, geometry) {
    let rows = body.items.filter(row => row.record);

    expect(rows.length).toBeGreaterThan(0);

    rows.forEach(row => {
        let {height, transform} = row.vdom.style;

        expect({height: parseFloat(height), offset: parseFloat(/calc\((-?[\d.]+)px/.exec(transform)[1])}, `row ${row.rowIndex}`).toEqual({
            height: geometry.heightAt(row.rowIndex),
            offset: geometry.offsetAt(row.rowIndex)
        })
    })
}

test.describe('Grid AnimateRows with content-sized rows', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    let grid, store, warn, warnings;

    test.beforeEach(() => {
        warnings = [];
        warn     = console.warn;

        console.warn = (...args) => String(args[0]).includes('AnimateRows') ? warnings.push(args) : warn(...args);

        grid  = null;
        store = createStore(200)
    });

    test.afterEach(async () => {
        console.warn = warn;

        await grid?.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('content-sized rows: the plugin warns once, drops its row transitions, and a sort renders rows at their geometry offsets', async () => {
        grid = await createGrid(store, true);

        let {body, view} = grid;

        view.setRowHeights(heightsOf(grid, {197: 120, 199: 80}));
        await view.promiseUpdate();

        expect(warnings.length).toBe(1);
        expect(body.cls).not.toContain('neo-animate-rows');

        store.sort({direction: 'DESC', property: 'id'});
        await grid.timeout(50);

        // ids 199, 198, 197, ...: the two tall records lead now
        expect(body.items.find(row => row.rowIndex === 0)?.record.id).toBe(199);
        expect(view.rowGeometry.offsetAt(3)).toBe(80 + rowHeight + 120);
        expectRowsOnGeometry(body, view.rowGeometry);
        expect(warnings.length).toBe(1)
    });

    test('content-sized rows: a filter renders through the body, too', async () => {
        grid = await createGrid(store, true);

        let {body, view} = grid;

        view.setRowHeights(heightsOf(grid, {4: 120}));
        await view.promiseUpdate();

        store.filters = [{property: 'id', operator: '>', value: 2}];
        await grid.timeout(50);

        // ids 3, 4, 5, ...: the tall record 4 sits at index 1
        expect(body.items.find(row => row.rowIndex === 0)?.record.id).toBe(3);
        expect(view.rowGeometry.heightAt(1)).toBe(120);
        expectRowsOnGeometry(body, view.rowGeometry)
    });

    test('content-sized rows switched on after the plugin: the transitions come off with the switch, and come back with the switch back', async () => {
        grid = await createGrid(store, false);

        let {body, view} = grid;

        expect(body.cls).toContain('neo-animate-rows');

        // No store event: the switch alone takes the transitions off, before measured heights move any row
        grid.contentSizedRows = true;
        expect(body.cls).not.toContain('neo-animate-rows');
        expect(warnings.length).toBe(1);

        view.setRowHeights(heightsOf(grid, {1: 120, 2: 80}));
        await view.promiseUpdate();
        expectRowsOnGeometry(body, view.rowGeometry);

        // A sort renders through the body
        store.sort({direction: 'DESC', property: 'id'});
        await grid.timeout(50);

        expect(body.items.find(row => row.rowIndex === 0)?.record.id).toBe(199);
        expectRowsOnGeometry(body, view.rowGeometry);

        grid.contentSizedRows = false;
        expect(body.cls).toContain('neo-animate-rows');
        expect(warnings.length).toBe(1);

        await view.promiseUpdate()
    });

    test('a destroyed plugin no longer follows the mode', async () => {
        grid = await createGrid(store, false);

        grid.body.getPlugin('grid-animate-rows').destroy();

        grid.contentSizedRows = true;
        await grid.view.promiseUpdate();

        expect(warnings).toEqual([])
    });

    test('content-sized rows: a plugin declared by hand stands aside, too', async () => {
        grid = await createGrid(store, true, {plugins: [{module: AnimateRows}]});

        let {body, view} = grid;

        store.filters = [{property: 'id', operator: '>', value: 2}];
        await grid.timeout(50);

        expect(warnings.length).toBe(1);
        expect(body.items.find(row => row.rowIndex === 0)?.record.id).toBe(3);
        expectRowsOnGeometry(body, view.rowGeometry)
    });

    test('fixed-height rows: the plugin keeps its row transitions and says nothing', async () => {
        grid = await createGrid(store, false);

        expect(grid.body.cls).toContain('neo-animate-rows');
        expect(warnings).toEqual([])
    })
});
