/**
 * @file test/playwright/unit/grid/RowGeometry.spec.mjs
 * @summary Content-sized rows: the per-view row geometry, and every grid consumer that reads it.
 *
 * `Neo.grid.RowGeometry` replaces `index × rowHeight` while a grid runs with `contentSizedRows`. The model arms
 * pin the prefix offsets, the offset → row lookup and the rebuild on a new store order. The grid arms feed
 * synthetic heights through `grid.View#setRowHeights`, the setter that measurement feeds later, and check that
 * each row-position consumer agrees with the model: row heights and transforms, both scroll extents, the start
 * row, the mounted rows, keyboard scrolling, and the start, center and end bodies of one view.
 *
 * @see Neo.grid.RowGeometry
 * @see Neo.grid.View
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
        name             : 'GridRowGeometryTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import RecordFactory      from '../../../../src/data/RecordFactory.mjs';
import Row                from '../../../../src/grid/Row.mjs';
import RowGeometry        from '../../../../src/grid/RowGeometry.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

const
    rowHeight = 40,
    // The grid is 400px high, and the header row takes one row height
    viewport  = 360;

/**
 * @param {Number} count
 * @returns {Neo.data.Store}
 */
function createStore(count) {
    return Neo.create(Store, {
        data       : Array.from({length: count}, (item, index) => ({id: index, name: `Row ${index}`, note: `Note ${index}`})),
        keyProperty: 'id',
        model      : {
            fields: [
                {name: 'id',   type: 'Integer'},
                {name: 'name', type: 'String'},
                {name: 'note', type: 'String'}
            ]
        }
    })
}

/**
 * A mounted grid, with the layout a browser would deliver applied by hand: the header toolbars pass the
 * column positions to their bodies, and every body gets its viewport.
 * @param {Object} config
 * @returns {Promise<Neo.grid.Container>}
 */
async function createGrid(config) {
    let grid = Neo.create(GridContainer, {
        appName       : 'GridRowGeometryTest',
        bufferRowRange: 2,
        columns       : [
            {dataField: 'id',   text: 'ID',   width: 100},
            {dataField: 'name', text: 'Name', width: 200}
        ],
        height: 400,
        rowHeight,
        width : 600,
        ...config
    });

    await grid.initVnode();
    grid.mounted = true;

    let {headerWrapper} = grid;

    for (let toolbar of [headerWrapper?.headerStart, grid.headerToolbar, headerWrapper?.headerEnd]) {
        toolbar && await toolbar.passSizeToBody()
    }

    grid.view.bodies.forEach(body => {
        body.set({availableHeight: viewport, containerWidth: 600})
    });

    await grid.timeout(50);

    return grid
}

/**
 * Row heights keyed the way a grid keys them: by the record id its rows render, which is the internal id unless
 * the grid sets `useInternalId: false`
 * @param {Neo.grid.Container} grid
 * @param {Object} heights Heights in px by the record's `id` field
 * @returns {Map}
 */
function heightsOf(grid, heights) {
    return new Map(Object.entries(heights).map(([id, height]) => [grid.view.getRecordId(grid.store.get(Number(id))), height]))
}

/**
 * The height and offset in px a row rendered into its VDOM
 * @param {Neo.grid.Row} row
 * @returns {{height: Number, offset: Number}}
 */
function renderedGeometry(row) {
    let {height, transform} = row.vdom.style;

    return {height: parseFloat(height), offset: parseFloat(/calc\((-?[\d.]+)px/.exec(transform)[1])}
}

/**
 * Every row a body renders sits where the geometry puts its index
 * @param {Neo.grid.Body} body
 * @param {Neo.grid.RowGeometry} geometry
 */
function expectRowsOnGeometry(body, geometry) {
    let rows = body.items.filter(row => row.record);

    expect(rows.length).toBeGreaterThan(0);

    rows.forEach(row => {
        expect(renderedGeometry(row), `row ${row.rowIndex}`).toEqual({
            height: geometry.heightAt(row.rowIndex),
            offset: geometry.offsetAt(row.rowIndex)
        })
    })
}

/**
 * Every row that intersects the viewport at the given scroll position is rendered by a pooled row
 * @param {Neo.grid.Body} body
 * @param {Number} scrollTop
 * @param {Neo.grid.RowGeometry} geometry
 */
function expectViewportCovered(body, scrollTop, geometry) {
    let rendered = new Set(body.items.filter(row => row.record).map(row => row.rowIndex)),
        last     = geometry.indexAt(scrollTop + viewport),
        i        = geometry.indexAt(scrollTop);

    for (; i <= last; i++) {
        expect(rendered.has(i), `row ${i} is rendered`).toBe(true)
    }
}

test.describe('Neo.grid.RowGeometry', () => {
    let geometry, store;

    test.beforeEach(() => {
        store    = createStore(5);
        geometry = Neo.create(RowGeometry, {estimate: rowHeight, getRecordId: record => record.id, store})
    });

    test.afterEach(() => {
        geometry.destroy();
        store.destroy()
    });

    test('a row without a known height takes the estimate', () => {
        expect([0, 1, 2, 3, 4, 5].map(index => geometry.offsetAt(index))).toEqual([0, 40, 80, 120, 160, 200]);
        expect(geometry.heightAt(3)).toBe(40);
        expect(geometry.minHeight).toBe(40);
        expect(geometry.totalHeight).toBe(200)
    });

    test('a known height moves every later row, and only a real change reports true', () => {
        expect(geometry.setHeights(new Map([[1, 100], [3, 10]]))).toBe(true);

        expect([0, 1, 2, 3, 4, 5].map(index => geometry.offsetAt(index))).toEqual([0, 40, 140, 180, 190, 230]);
        expect(geometry.heightAt(1)).toBe(100);
        expect(geometry.heightAt(3)).toBe(10);
        expect(geometry.minHeight).toBe(10);
        expect(geometry.totalHeight).toBe(230);

        expect(geometry.setHeights(new Map([[1, 100]]))).toBe(false)
    });

    test('an offset maps back to the row that covers it', () => {
        geometry.setHeights(new Map([[1, 100], [3, 10]]));

        // offsets: 0, 40, 140, 180, 190 | total 230
        expect([-5, 0, 39.9, 40, 139, 140, 185, 190, 229, 230, 10000].map(offset => geometry.indexAt(offset)))
            .toEqual([0, 0, 0, 1, 1, 2, 3, 4, 4, 4, 4]);

        store.filters = [{property: 'id', operator: '<', value: 0}];

        expect(geometry.count).toBe(0);
        expect(geometry.indexAt(50)).toBe(0);
        expect(geometry.totalHeight).toBe(0)
    });

    test('a later height batch only sums the offsets again, without a full pass', () => {
        let fullPasses = 0;

        // The first batch runs the full pass that resolves the record ids
        geometry.setHeights(new Map([[1, 100]]));
        expect(geometry.totalHeight).toBe(260);

        geometry.rebuild = function() {
            fullPasses++;
            return RowGeometry.prototype.rebuild.call(this)
        };

        expect(geometry.setHeights(new Map([[3, 10], [4, 55]]))).toBe(true);
        expect([0, 1, 2, 3, 4, 5].map(index => geometry.offsetAt(index))).toEqual([0, 40, 140, 180, 190, 245]);
        expect(geometry.minHeight).toBe(10);
        expect(fullPasses).toBe(0)
    });

    test('a height set while its record is filtered out applies once the record returns', () => {
        geometry.totalHeight;
        store.filters = [{property: 'id', operator: '<', value: 3}];

        geometry.setHeights(new Map([[1, 100], [4, 70]]));
        expect(geometry.totalHeight).toBe(180);

        store.filters = [];
        expect(geometry.heightAt(4)).toBe(70);
        expect(geometry.totalHeight).toBe(290)
    });

    test('a lazy store keeps its records raw through a full pass', () => {
        let lazy = Neo.create(Store, {
                autoInitRecords: false,
                data           : Array.from({length: 50}, (item, index) => ({id: index, name: `Row ${index}`})),
                keyProperty    : 'id'
            }),
            other = Neo.create(RowGeometry, {estimate: rowHeight, getRecordId: record => lazy.getKey(record), store: lazy});

        other.setHeights(new Map([[7, 90]]));

        expect(other.offsetAt(8)).toBe(7 * 40 + 90);
        // getAt() hydrates the record it reads: the full pass reads `items`
        expect(lazy.items.filter(item => RecordFactory.isRecord(item))).toEqual([]);

        other.destroy();
        lazy.destroy()
    });

    test('heights follow their records through a sort and a filter', () => {
        geometry.setHeights(new Map([[1, 100], [3, 10]]));

        store.sort({direction: 'DESC', property: 'id'});

        // ids 4, 3, 2, 1, 0
        expect([0, 1, 2, 3, 4].map(index => geometry.heightAt(index))).toEqual([40, 10, 40, 100, 40]);
        expect(geometry.offsetAt(4)).toBe(190);
        expect(geometry.totalHeight).toBe(230);

        store.filters = [{property: 'id', operator: '<', value: 3}];

        // ids 2, 1, 0
        expect([0, 1, 2].map(index => geometry.heightAt(index))).toEqual([40, 100, 40]);
        expect(geometry.totalHeight).toBe(180)
    });

    test('a store listener bound before the geometry already reads the new order', () => {
        let reads = [],
            other = createStore(3),
            later;

        // A grid body binds its store long before a view creates the geometry, and re-renders on the load
        // the store fires for a sort
        other.on('load', () => {later && reads.push(later.heightAt(0))});

        later = Neo.create(RowGeometry, {estimate: rowHeight, getRecordId: record => record.id, store: other});
        later.setHeights(new Map([[2, 90]]));
        later.totalHeight; // the offsets are built for the initial order

        other.sort({direction: 'DESC', property: 'id'});

        expect(reads).toEqual([90]);

        later.destroy();
        other.destroy()
    })
});

test.describe('Grid content-sized rows', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    let grid, store;

    test.beforeEach(async () => {
        store = createStore(200);
        grid  = await createGrid({contentSizedRows: true, store})
    });

    test.afterEach(async () => {
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('without contentSizedRows the grid keeps index × rowHeight', async () => {
        let fixed = await createGrid({store});

        expect(fixed.view.rowGeometry).toBeNull();
        expect(fixed.body.rowGeometry).toBeNull();
        expect(fixed.verticalScrollbar.rowGeometry).toBeNull();
        expect(fixed.view.setRowHeights(new Map([[0, 100]]))).toBe(false);

        expect(fixed.body.availableRows).toBe(Math.ceil(viewport / rowHeight) - 1);
        expect(fixed.body.vdom.height).toBe(`${(store.count + 1) * rowHeight}px`);

        fixed.body.items.filter(row => row.record).forEach(row => {
            expect(renderedGeometry(row)).toEqual({height: rowHeight, offset: row.rowIndex * rowHeight})
        });

        await fixed.timeout(20);
        fixed.destroy()
    });

    test('synthetic heights drive the row transforms, both extents and the start row', async () => {
        let {body, verticalScrollbar, view} = grid,
            geometry                        = view.rowGeometry,
            scrollTop;

        expect(body.rowGeometry).toBe(geometry);
        expect(verticalScrollbar.rowGeometry).toBe(geometry);

        expect(view.setRowHeights(heightsOf(grid, {0: 100, 3: 20, 7: 75}))).toBe(true);
        await view.promiseUpdate();

        expect([0, 3, 7].map(index => geometry.heightAt(index))).toEqual([100, 20, 75]);
        expectRowsOnGeometry(body, geometry);

        // One extra estimated row below the last one, as the fixed-height extent keeps one extra row
        expect(body.vdom.height).toBe(`${geometry.totalHeight + rowHeight}px`);
        expect(verticalScrollbar.vdom.cn[0].height).toBe(body.vdom.height);

        scrollTop = geometry.offsetAt(7) + 10;
        view.syncBodies(scrollTop);
        await view.promiseUpdate();

        expect(body.startIndex).toBe(7);
        expect(body.visibleRows).toEqual([7, geometry.indexAt(scrollTop + viewport)]);
        expectRowsOnGeometry(body, geometry)
    });

    test('a tall row scrolled mostly out of view leaves no row of the viewport unrendered', async () => {
        let {body, view} = grid,
            geometry     = view.rowGeometry,
            scrollTop;

        view.setRowHeights(heightsOf(grid, {10: 600}));
        expect(geometry.heightAt(10)).toBe(600);

        // 50px of the tall row stay visible, and short rows fill the other 310px
        scrollTop = geometry.offsetAt(11) - 50;
        view.syncBodies(scrollTop);
        await view.promiseUpdate();

        expect(body.startIndex).toBe(10);
        expectViewportCovered(body, scrollTop, geometry);
        expectRowsOnGeometry(body, geometry)
    });

    test('the row pool holds every row a viewport of the shortest rows can show', async () => {
        let {body, view} = grid,
            geometry     = view.rowGeometry;

        // 40px rows cut at both edges, so 10 rows intersect the 360px viewport: at the top, mid-list, and one row
        // further, where the start row has to follow at once for the mounted rows to stay within the pool
        for (let scrollTop of [20, geometry.offsetAt(100) + 20, geometry.offsetAt(101) + 20]) {
            view.syncBodies(scrollTop);
            await view.promiseUpdate();

            expect(body.mountedRows[1] - body.mountedRows[0]).toBeLessThanOrEqual(body.items.length);
            expect(body.startIndex).toBe(geometry.indexAt(scrollTop));
            expectViewportCovered(body, scrollTop, geometry)
        }

        expect(body.availableRows).toBe(Math.ceil(viewport / geometry.minHeight))
    });

    test('scrollByRows scrolls through the offsets and reaches the final row fully visible', async () => {
        let {body, view} = grid,
            geometry     = view.rowGeometry,
            count        = store.count,
            scrolled     = [],
            original, scrollTop, target;

        Neo.main           ??= {};
        Neo.main.DomAccess ??= {};
        original = Neo.main.DomAccess.scrollTo;

        // The keyboard scroll is a scrollTo() request to the main thread. A store load also sends one, to the top.
        Neo.main.DomAccess.scrollTo = opts => {
            !opts.direction && scrolled.push(opts.value);
            return Promise.resolve()
        };

        try {
            view.setRowHeights(heightsOf(grid, {5: 120, 30: 500, [count - 1]: 90}));
            await view.promiseUpdate();

            // Down: the row the viewport bottom cuts brings its bottom to the viewport bottom. Rows 0-4 and 6
            // take 40px and row 5 takes 120px, so row 7 starts at the 360px edge.
            target = body.visibleRows[1];
            expect(target).toBe(7);

            body.scrollByRows(target - 1, 1);
            expect(scrolled.at(-1)).toBe(geometry.offsetAt(target + 1) - viewport);

            // Down onto a row taller than the viewport: its top shows
            body.scrollByRows(29, 1);
            expect(scrolled.at(-1)).toBe(geometry.offsetAt(30));

            // Up: the row above the visible rows brings its top to the viewport top
            view.syncBodies(geometry.offsetAt(50));
            await view.promiseUpdate();

            body.scrollByRows(50, -1);
            expect(scrolled.at(-1)).toBe(geometry.offsetAt(49));

            // The final row: fully visible at the target, and the extent lets the view scroll that far
            body.scrollByRows(count - 2, 1);
            scrollTop = scrolled.at(-1);

            expect(geometry.heightAt(count - 1)).toBe(90);
            expect(scrollTop).toBe(geometry.totalHeight - viewport);
            expect(geometry.offsetAt(count - 1)).toBeGreaterThanOrEqual(scrollTop);
            expect(parseFloat(body.vdom.height) - viewport).toBeGreaterThanOrEqual(scrollTop)
        } finally {
            Neo.main.DomAccess.scrollTo = original
        }
    });

    test('the start, center and end bodies of a view share each row height', async () => {
        let locked = await createGrid({
                columns         : [
                    {dataField: 'id',   locked: 'start', text: 'ID',   width: 100},
                    {dataField: 'name',                  text: 'Name', width: 200},
                    {dataField: 'note', locked: 'end',   text: 'Note', width: 100}
                ],
                contentSizedRows: true,
                store
            }),
            {view}   = locked,
            geometry = view.rowGeometry;

        expect(view.bodies.length).toBe(3);

        view.setRowHeights(heightsOf(locked, {1: 90, 4: 15}));
        await view.promiseUpdate();

        expect(geometry.heightAt(1)).toBe(90);

        view.bodies.forEach(body => {
            expect(body.rowGeometry).toBe(geometry);
            expectRowsOnGeometry(body, geometry)
        });

        await locked.timeout(20);
        locked.destroy()
    });

    test('two grids at different widths on one store keep independent geometries', async () => {
        let other = await createGrid({contentSizedRows: true, store, width: 300});

        grid.view.setRowHeights(heightsOf(grid, {3: 100}));
        other.view.setRowHeights(heightsOf(other, {3: 60}));
        await grid.view.promiseUpdate();
        await other.view.promiseUpdate();

        expect(other.view.rowGeometry).not.toBe(grid.view.rowGeometry);
        expect(grid.view.rowGeometry.heightAt(3)).toBe(100);
        expect(other.view.rowGeometry.heightAt(3)).toBe(60);

        expectRowsOnGeometry(grid.body, grid.view.rowGeometry);
        expectRowsOnGeometry(other.body, other.view.rowGeometry);

        await other.timeout(20);
        other.destroy()
    });

    test('a sort or a filter re-renders the rows on the offsets of the new order', async () => {
        let {body, verticalScrollbar, view} = grid,
            geometry                        = view.rowGeometry;

        view.setRowHeights(heightsOf(grid, {0: 100, 1: 20, 2: 75}));
        await view.promiseUpdate();

        expect(geometry.heightAt(0)).toBe(100);

        store.sort({direction: 'DESC', property: 'id'});
        await grid.timeout(50);

        // The heights travel with their records: id 0 is the last row now
        expect(geometry.heightAt(store.count - 1)).toBe(100);
        expectRowsOnGeometry(body, geometry);

        store.filters = [{property: 'id', operator: '<', value: 3}];
        await grid.timeout(50);

        // ids 2, 1, 0
        expect(store.count).toBe(3);
        expectRowsOnGeometry(body, geometry);
        expect(body.vdom.height).toBe(`${75 + 20 + 100 + rowHeight}px`);
        expect(verticalScrollbar.vdom.cn[0].height).toBe(body.vdom.height)
    });

    test('a height change moves the rows without re-rendering their cells', async () => {
        let {body, view} = grid,
            original     = Row.prototype.applyRendererOutput,
            renders      = 0;

        Row.prototype.applyRendererOutput = function(...args) {
            renders++;
            return original.apply(this, args)
        };

        try {
            view.setRowHeights(heightsOf(grid, {0: 100}));
            await view.promiseUpdate()
        } finally {
            Row.prototype.applyRendererOutput = original
        }

        expect(renders).toBe(0);
        expect(renderedGeometry(body.items.find(row => row.rowIndex === 1)).offset).toBe(100);
        expectRowsOnGeometry(body, view.rowGeometry)
    });

    test('switching the mode at runtime re-renders every row in the other geometry', async () => {
        let {body, verticalScrollbar, view} = grid;

        view.setRowHeights(heightsOf(grid, {0: 100}));
        await view.promiseUpdate();

        expect(renderedGeometry(body.items.find(row => row.rowIndex === 1)).offset).toBe(100);

        grid.contentSizedRows = false;
        await view.promiseUpdate();

        expect(view.rowGeometry).toBeNull();
        expect(verticalScrollbar.rowGeometry).toBeNull();
        expect(body.vdom.height).toBe(`${(store.count + 1) * rowHeight}px`);

        body.items.filter(row => row.record).forEach(row => {
            expect(renderedGeometry(row)).toEqual({height: rowHeight, offset: row.rowIndex * rowHeight})
        });

        grid.contentSizedRows = true;
        await view.promiseUpdate();

        expect(verticalScrollbar.rowGeometry).toBe(view.rowGeometry);
        expectRowsOnGeometry(body, view.rowGeometry)
    });

    test('rowHeight stays the estimate for every row without a known height', async () => {
        let {body, verticalScrollbar, view} = grid,
            geometry                        = view.rowGeometry;

        view.setRowHeights(heightsOf(grid, {0: 100}));
        grid.rowHeight = 50;
        await view.promiseUpdate();

        expect(geometry.estimate).toBe(50);
        expect(geometry.heightAt(0)).toBe(100);
        expect(geometry.heightAt(1)).toBe(50);
        expect(body.vdom.height).toBe(`${geometry.totalHeight + 50}px`);
        expect(verticalScrollbar.vdom.cn[0].height).toBe(body.vdom.height);
        expectRowsOnGeometry(body, geometry)
    })
});
