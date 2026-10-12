/**
 * @file test/playwright/unit/grid/AnchorCorrection.spec.mjs
 * @summary Content-sized rows keep the visible row still when heights above it change.
 *
 * The row at the scroll offset is the anchor. A height change above it moves it, so `grid.View#setRowHeights`
 * moves the worker's scroll offset by the same distance and hands the distance to the main thread as
 * `scrollCorrection` in the next update's meta, exactly once. A change below the anchor moves nothing. During a
 * thumb drag the heights wait for the drag's end, so the extent under the thumb holds still.
 *
 * The moved rows travel in the update that carries the correction, also when a smaller row grows the row pool.
 * The vertical scrollbar mirrors the view's scroll offset, so its extent grows before that update and shrinks
 * after it: a scrollbar clamped by its new extent would otherwise pull the view ahead of the correction.
 *
 * @see Neo.grid.View#setRowHeights
 * @see Neo.main.addon.GridRowScrollPinning
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
        name             : 'GridAnchorCorrectionTest',
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
 * A mounted content-sized grid, with the layout a browser would deliver applied by hand
 * @param {Neo.data.Store} store
 * @param {Object} [config={}]
 * @returns {Promise<Neo.grid.Container>}
 */
async function createGrid(store, config = {}) {
    let grid = Neo.create(GridContainer, {
        appName         : 'GridAnchorCorrectionTest',
        bufferRowRange  : 2,
        columns         : [{dataField: 'id', text: 'ID', width: 100}, {dataField: 'name', text: 'Name', width: 200}],
        contentSizedRows: true,
        height          : 400,
        rowHeight,
        store,
        width           : 600,
        ...config
    });

    await grid.initVnode();
    grid.mounted = true;

    await grid.headerToolbar.passSizeToBody();
    grid.body.set({availableHeight: viewport, containerWidth: 600});
    await grid.timeout(50);

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

test.describe('Grid content-sized rows: anchor correction', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    let grid, metas, store;

    test.beforeEach(async () => {
        store = createStore(200);
        grid  = await createGrid(store);
        metas = [];

        // Every meta an update hands to the main thread
        let {view} = grid,
            meta   = view.getVdomUpdateMeta.bind(view);

        view.getVdomUpdateMeta = () => {
            let value = meta();
            metas.push(value);
            return value
        };

        // The visible rows start 10px into row 50
        view.syncBodies(view.rowGeometry.offsetAt(50) + 10);
        await view.promiseUpdate();
        metas.length = 0
    });

    test.afterEach(async () => {
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('a change above the anchor row moves the scroll offset along, and one update carries the correction', async () => {
        let {view}   = grid,
            geometry = view.rowGeometry,
            before   = view.scrollTop - geometry.offsetAt(50);

        // Rows 10 and 20 grow by 60px and 20px
        view.setRowHeights(heightsOf(grid, {10: 100, 20: 60}));
        await view.promiseUpdate();

        // The anchor row keeps its distance to the scroll offset
        expect(view.scrollTop - geometry.offsetAt(50)).toBe(before);
        expect(view.scrollTop).toBe(50 * rowHeight + 80 + 10);
        expect(grid.body.startIndex).toBe(50);

        expect(metas.filter(meta => meta.scrollCorrection)).toEqual([{scrollCorrection: 80, scrollEpoch: 1, scrollTop: 2090}]);
        expect(metas.at(-1).scrollEpoch).toBe(1)
    });

    test('a reset of the measured heights keeps the anchor row still', async () => {
        let {view}   = grid,
            geometry = view.rowGeometry,
            before;

        // Row 10 grows by 80px above the anchor, then a wrapText change resets every measured height
        view.setRowHeights(heightsOf(grid, {10: 120}));
        await view.promiseUpdate();

        before       = view.scrollTop - geometry.offsetAt(50);
        metas.length = 0;

        view.resetRowHeights();
        await view.promiseUpdate();

        expect(geometry.heightAt(10)).toBe(rowHeight);
        expect(view.scrollTop - geometry.offsetAt(50)).toBe(before);
        expect(metas.filter(meta => meta.scrollCorrection).map(meta => meta.scrollCorrection)).toEqual([-80])
    });

    test('a change below the anchor row moves nothing', async () => {
        let {view}    = grid,
            scrollTop = view.scrollTop;

        view.setRowHeights(heightsOf(grid, {60: 100, 120: 10}));
        await view.promiseUpdate();

        expect(view.scrollTop).toBe(scrollTop);
        expect(metas.some(meta => meta.scrollCorrection)).toBe(false);
        expect(metas.at(-1).scrollEpoch).toBe(0)
    });

    test('during a thumb drag the heights wait and the extent holds still, and its end applies them', async () => {
        let {body, view} = grid,
            extent       = body.vdom.height,
            scrollTop    = view.scrollTop;

        view.isThumbDragging = true;

        expect(view.setRowHeights(heightsOf(grid, {10: 100}))).toBe(false);
        await view.promiseUpdate();

        expect(view.rowGeometry.heightAt(10)).toBe(rowHeight);
        expect(body.vdom.height).toBe(extent);
        expect(view.scrollTop).toBe(scrollTop);

        view.isThumbDragging = false;
        await view.promiseUpdate();

        expect(view.rowGeometry.heightAt(10)).toBe(100);
        expect(body.vdom.height).not.toBe(extent);
        expect(view.scrollTop).toBe(scrollTop + 60);
        expect(metas.filter(meta => meta.scrollCorrection).map(meta => meta.scrollCorrection)).toEqual([60])
    });

    test('a smaller row grows the row pool inside the update that carries the correction', async () => {
        let {body, view} = grid,
            poolSize     = body.items.length,
            bodyUpdates  = 0,
            update       = body.update.bind(body);

        body.update = () => {bodyUpdates++; update()};

        // Row 10 shrinks below every other row: more rows fit the view
        view.setRowHeights(heightsOf(grid, {10: 20}));
        await view.promiseUpdate();

        expect(body.items.length).toBeGreaterThan(poolSize);
        expect(bodyUpdates, 'the body renders no update of its own').toBe(0);
        expect(metas.filter(meta => meta.scrollCorrection)).toEqual([{scrollCorrection: -20, scrollEpoch: 1, scrollTop: 1990}])
    });

    test('the scrollbar extent grows before the view update and shrinks after it', async () => {
        let {verticalScrollbar, view} = grid,
            calls                     = [],
            updateScrollHeight        = verticalScrollbar.updateScrollHeight.bind(verticalScrollbar),
            update                    = view.update.bind(view);

        verticalScrollbar.updateScrollHeight = data => {calls.push('scrollbar'); updateScrollHeight(data)};
        view.update                          = () => {calls.push('view'); update()};

        view.setRowHeights(heightsOf(grid, {10: 100}));
        expect(calls, 'growing').toEqual(['scrollbar', 'view']);

        await view.promiseUpdate();
        calls.length = 0;
        view.setRowHeights(heightsOf(grid, {10: 20}));
        expect(calls, 'shrinking').toEqual(['view', 'scrollbar']);

        await view.promiseUpdate()
    });

    test('a busy view defers the update with the correction, and a shrinking scrollbar extent waits for it', async () => {
        let {verticalScrollbar, view} = grid,
            extents                   = [],
            updateScrollHeight        = verticalScrollbar.updateScrollHeight.bind(verticalScrollbar),
            flight                    = view.promiseUpdate();

        expect(view.isVdomUpdating, 'an update is in flight').toBe(true);

        verticalScrollbar.updateScrollHeight = data => {
            // The rows already moved: the update with the correction landed
            extents.push(metas.some(meta => meta.scrollCorrection));
            updateScrollHeight(data)
        };

        view.setRowHeights(heightsOf(grid, {10: 20}));
        expect(extents, 'the scrollbar waits').toEqual([]);

        await flight;
        await view.promiseUpdate();

        expect(extents).toEqual([true])
    });

    test('when an ancestor update absorbs the view update, the correction reaches the main thread with that batch', async () => {
        let {view}      = grid,
            batches     = [],
            updateBatch = VdomHelper.updateBatch;

        // Every batch the VDOM worker answers: its emitted roots and the meta it hands to the main thread
        VdomHelper.updateBatch = data => {
            let response = updateBatch.call(VdomHelper, data);
            batches.push({meta: response.meta, roots: Object.keys(data.updates)});
            return response
        };

        try {
            // Control: the view's own update carries the correction
            view.setRowHeights(heightsOf(grid, {10: 120}));
            await view.promiseUpdate();

            expect(batches.filter(batch => batch.meta?.[view.id]?.scrollCorrection === 80).map(batch => batch.roots))
                .toEqual([[view.id]]);

            // A full-depth grid update in flight and one queued behind it: the view's update merges into the grid's
            batches.length = 0;
            grid.updateDepth = -1;
            grid.update();
            grid.update();
            view.setRowHeights(heightsOf(grid, {20: 120}));
            await grid.promiseUpdate();
            await grid.timeout(50);

            let carriers = batches.filter(batch => batch.meta?.[view.id]?.scrollCorrection === 80);

            expect(carriers.length).toBe(1);
            expect(carriers[0].roots, 'the grid payload absorbed the view').not.toContain(view.id)
        } finally {
            VdomHelper.updateBatch = updateBatch
        }
    });

    test('heights held during a thumb drag do not outlive a store replacement, and heights of the new store do', async () => {
        let first   = createStore(200),
            other   = createStore(200),
            natural = await createGrid(first, {useInternalId: false}),
            {view}  = natural;

        view.syncBodies(0);
        await view.promiseUpdate();

        view.isThumbDragging = true;
        view.setRowHeights(new Map([[view.getRecordId(first.get(10)), 160]]));

        // The same ids name other records now
        natural.store = other;
        other.fire('load', {items: other.items});
        view.setRowHeights(new Map([[view.getRecordId(other.get(20)), 90]]));

        view.isThumbDragging = false;
        await view.promiseUpdate();

        expect(view.rowGeometry.heightAt(10)).toBe(rowHeight);
        expect(view.rowGeometry.heightAt(20)).toBe(90);

        await natural.timeout(20);
        natural.destroy();
        first.destroy();
        other.destroy()
    });

    test('a row reached by keyboard keeps its edge while rows above it change, until another scroll', async () => {
        let {view}   = grid,
            geometry = view.rowGeometry,
            original = Neo.main.DomAccess?.scrollTo,
            scrolls  = [],
            anchor, offset;

        Neo.main           ??= {};
        Neo.main.DomAccess ??= {};

        // The main thread's scroll, recorded instead of performed
        Neo.main.DomAccess.scrollTo = ({value}) => {scrolls.push(value)};

        try {
            // Down from row 50 to row 100, which is not mounted: its bottom meets the view's bottom
            view.scrollByRows(50, 50);
            expect(scrolls).toEqual([geometry.offsetAt(101) - viewport]);

            // The scroll lands
            view.syncBodies(scrolls[0]);
            await view.promiseUpdate();

            // Rows between the top edge and row 100 grow by 100px: row 100 keeps its bottom at the view's bottom
            view.setRowHeights(heightsOf(grid, {95: 100, 99: 80}));
            await view.promiseUpdate();

            expect(geometry.offsetAt(101) - view.scrollTop).toBe(viewport);

            // A wheel scrolls up: the next change holds the row at the top edge still again
            view.syncBodies(view.scrollTop - 200);
            await view.promiseUpdate();

            anchor = geometry.indexAt(view.scrollTop);
            offset = view.scrollTop - geometry.offsetAt(anchor);

            view.setRowHeights(heightsOf(grid, {10: 100}));
            await view.promiseUpdate();

            expect(view.scrollTop - geometry.offsetAt(anchor)).toBe(offset)
        } finally {
            Neo.main.DomAccess.scrollTo = original
        }
    })
});
