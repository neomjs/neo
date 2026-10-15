/**
 * @file test/playwright/unit/grid/AnimateRowsSteps.spec.mjs
 * @summary `grid.plugin.AnimateRows` moves rows in two steps, and anything between the steps settles them.
 *
 * The first step re-binds the pooled rows and shows each displayed record at its previous offset; the second moves
 * the rows to their new offsets under `neo-animate-rows-moving`. A scroll, the next store change, a switch to
 * content-sized rows or a destroy can arrive between the two. Each must leave every row at the offset the body
 * renders it at, with the transition class off, and the late second step must change nothing.
 *
 * Names sort as text, so sorting by `name` reorders the displayed rows: `Row 10` moves up from index 10 to index 2,
 * and `Row 100`, which was not displayed, enters at index 3.
 *
 * @see Neo.grid.plugin.AnimateRows#updateView
 * @see Neo.grid.plugin.AnimateRows#settle
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
        name             : 'GridAnimateRowsStepsTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

const
    duration  = 200,
    // The transition class lives for `duration`, so a poll must look more often than that
    often     = {intervals: [5]},
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
 * @returns {Promise<Neo.grid.Container>}
 */
async function createGrid(store) {
    let grid = Neo.create(GridContainer, {
        appName       : 'GridAnimateRowsStepsTest',
        body          : {animatedRowSorting: true, pluginAnimateRowsConfig: {transitionDuration: duration}},
        bufferRowRange: 2,
        columns       : [{dataField: 'id', text: 'ID', width: 100}, {dataField: 'name', text: 'Name', width: 200}],
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
 * The offset a row's vdom transform puts it at
 * @param {Neo.grid.Row} row
 * @returns {Number}
 */
function offsetOf(row) {
    return parseFloat(/calc\((-?[\d.]+)px/.exec(row.vdom.style.transform)[1])
}

/**
 * @param {Neo.grid.Body} body
 * @param {Number} id
 * @returns {Neo.grid.Row|undefined}
 */
function rowOf(body, id) {
    return body.items.find(row => row.record?.id === id)
}

/**
 * Every bound row sits at its own index's offset, fully opaque
 * @param {Neo.grid.Body} body
 */
function expectSettled(body) {
    let rows = body.items.filter(row => row.record);

    expect(rows.length).toBeGreaterThan(0);

    rows.forEach(row => {
        expect({offset: offsetOf(row), opacity: row.vdom.style.opacity ?? null}, `record ${row.record.id}`)
            .toEqual({offset: row.rowIndex * rowHeight, opacity: null})
    });

    expect(body.cls).not.toContain('neo-animate-rows-moving')
}

test.describe('Grid AnimateRows: the two steps of a move', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    let errors, grid, log, store;

    test.beforeEach(() => {
        errors        = [];
        log           = console.error;
        console.error = (...args) => errors.push(args);
        grid          = null;
        store         = createStore(200)
    });

    test.afterEach(async () => {
        console.error = log;
        await grid?.timeout(20);
        grid?.isDestroyed || grid?.destroy();
        store?.destroy()
    });

    test('the first step shows each record where it was, the second moves it, and the pool keeps its rows', async () => {
        grid = await createGrid(store);

        let {body} = grid,
            pool   = body.items.map(row => row.id),
            refs   = body.getVdomRoot().cn.map(node => node.componentId);

        store.sort({direction: 'ASC', property: 'name'});

        // First step: Row 10 shows at its previous offset, Row 100 enters transparent, Row 1 does not move
        expect(rowOf(body, 10).rowIndex).toBe(2);
        expect(offsetOf(rowOf(body, 10))).toBe(10 * rowHeight);
        expect(rowOf(body, 100).vdom.style.opacity).toBe(0);
        expect(offsetOf(rowOf(body, 1))).toBe(rowHeight);
        expect(body.cls).not.toContain('neo-animate-rows-moving');

        // Second step: the class and the new offsets arrive together
        await expect.poll(() => body.cls.includes('neo-animate-rows-moving'), often).toBe(true);
        expect(offsetOf(rowOf(body, 10))).toBe(2 * rowHeight);
        expect(rowOf(body, 100).vdom.style.opacity ?? null).toBe(null);

        // The transition ends on its own, and the pool is the same rows in the same order
        await expect.poll(() => body.cls.includes('neo-animate-rows-moving'), often).toBe(false);
        expectSettled(body);
        expect(body.items.map(row => row.id)).toEqual(pool);
        expect(body.getVdomRoot().cn.map(node => node.componentId)).toEqual(refs);
        expect(errors).toEqual([])
    });

    test('a scroll between the steps settles the rows, and the late second step changes nothing', async () => {
        grid = await createGrid(store);

        let {body} = grid;

        store.sort({direction: 'ASC', property: 'name'});
        body.isScrolling = true;

        expectSettled(body);
        await grid.timeout(duration * 2);
        expectSettled(body);
        expect(errors).toEqual([])
    });

    test('a store change between the steps starts from settled rows', async () => {
        grid = await createGrid(store);

        let {body} = grid;

        store.sort({direction: 'ASC', property: 'name'});

        // Keeps the order: Row 10 stays at index 2, so the second re-bind leaves its row untouched
        store.filters = [{property: 'id', operator: '<', value: 150}];
        expect(rowOf(body, 10).rowIndex).toBe(2);

        await expect.poll(() => body.cls.includes('neo-animate-rows-moving'), often).toBe(false);
        await grid.timeout(duration * 2);
        expectSettled(body);
        expect(errors).toEqual([])
    });

    test('a switch to content-sized rows between the steps settles the rows on the geometry', async () => {
        grid = await createGrid(store);

        let {body, view} = grid,
            warn         = console.warn;

        console.warn = () => {};

        store.sort({direction: 'ASC', property: 'name'});
        grid.contentSizedRows = true;
        await view.promiseUpdate();
        await grid.timeout(duration * 2);
        console.warn = warn;

        expect(body.cls).not.toContain('neo-animate-rows-moving');

        body.items.filter(row => row.record).forEach(row => {
            expect(offsetOf(row), `record ${row.record.id}`).toBe(view.rowGeometry.offsetAt(row.rowIndex))
        });

        expect(errors).toEqual([])
    });

    test('destroying the grid between the steps reports nothing', async () => {
        grid = await createGrid(store);

        store.sort({direction: 'ASC', property: 'name'});
        grid.destroy();

        await new Promise(resolve => setTimeout(resolve, duration * 2)); // wall-clock-under-test: a late second step must stay silent past the transition
        expect(errors).toEqual([])
    })
});
