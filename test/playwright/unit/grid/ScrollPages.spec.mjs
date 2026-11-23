/**
 * @file test/playwright/unit/grid/ScrollPages.spec.mjs
 * @summary Fixed rows past the browser's scroll extent cap scroll in pages.
 *
 * `Neo.grid.ScrollPages` splits a logical range past the cap into pages over the physical range. `grid.View` picks
 * the page in `syncBodies()`: a scroll inside a page stays 1:1, crossing into another page keeps the logical offset
 * and hands the physical move to the main thread as `scrollCorrection`, a thumb drag picks its page in proportion,
 * and the ends of the physical range pick the first and the last page. Content-sized rows refuse to page.
 *
 * The specs lower the view's cap to 200,000 px, so 10,000 rows of 40 px page.
 *
 * @see Neo.grid.ScrollPages
 * @see Neo.grid.View#syncBodies
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
        name             : 'GridScrollPagesTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import ScrollPages        from '../../../../src/grid/ScrollPages.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

const
    count     = 10000,
    maxHeight = 200000,
    rowHeight = 40,
    viewport  = 360,
    extent    = (count + 1) * rowHeight, // the rows plus one row of scroll room
    step      = (extent - maxHeight) / 199; // 200 pages of 2,000 px

/**
 * @param {Number} count
 * @param {Object} [config={}]
 * @returns {Neo.data.Store}
 */
function createStore(count, config = {}) {
    return Neo.create(Store, {
        ...config,
        data       : Array.from({length: count}, (item, index) => ({id: index, name: `Row ${index}`})),
        keyProperty: 'id',
        model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}]}
    })
}

/**
 * A mounted grid, with the layout a browser would deliver applied by hand
 * @param {Neo.data.Store} store
 * @param {Object} [config={}]
 * @returns {Promise<Neo.grid.Container>}
 */
async function createGrid(store, config = {}) {
    let grid = Neo.create(GridContainer, {
        appName       : 'GridScrollPagesTest',
        bufferRowRange: 2,
        columns       : [{dataField: 'id', text: 'ID', width: 100}, {dataField: 'name', text: 'Name', width: 200}],
        height        : 400,
        rowHeight,
        store,
        width         : 600,
        ...config
    });

    await grid.initVnode();
    grid.mounted = true;

    await grid.headerToolbar.passSizeToBody();
    grid.body.set({availableHeight: viewport, containerWidth: 600});
    // The mount reads the browser's cap from the main thread
    await grid.timeout(50);

    return grid
}

/**
 * The transform a row renders at an offset
 * @param {Number} offset
 * @returns {String}
 */
function transformAt(offset) {
    return `translate3d(0px, calc(${offset}px + var(--grid-row-pin-offset, 0px)), 0px)`
}

test.describe('Grid scroll pages: the page math', () => {
    test('below the cap there is one page, at offset 0', () => {
        let pages = Neo.create(ScrollPages, {extent: 150000, maxExtent: maxHeight, viewHeight: viewport});

        expect(pages.paged).toBe(false);
        expect(pages.pageCount).toBe(1);
        expect(pages.physicalExtent).toBe(150000);
        expect(pages.pageAt(149000)).toBe(0);
        expect(pages.offsetAt(pages.pageAt(149000))).toBe(0);

        pages.destroy()
    });

    test('past the cap the pages cover the logical range, and the last one ends where the physical range ends', () => {
        let pages = Neo.create(ScrollPages, {extent, maxExtent: maxHeight, viewHeight: viewport}),
            last  = pages.pageCount - 1,
            physical;

        expect(pages.paged).toBe(true);
        expect(pages.physicalExtent).toBe(maxHeight);
        expect(pages.pageHeight).toBe(2000);
        expect(pages.pageCount).toBe(200);
        expect(pages.offsetAt(last)).toBe(extent - maxHeight);

        // Every logical offset lands inside the physical range
        for (let scrollTop = 0; scrollTop <= extent - viewport; scrollTop += 997) {
            physical = scrollTop - pages.offsetAt(pages.pageAt(scrollTop));

            expect(physical).toBeGreaterThanOrEqual(0);
            expect(physical).toBeLessThanOrEqual(maxHeight - viewport)
        }

        // The thumb's top picks the first page, its bottom the last
        expect(pages.thumbPageAt(0)).toBe(0);
        expect(pages.thumbPageAt(maxHeight - viewport)).toBe(last);

        pages.destroy()
    });

    test('at larger extent/cap ratios every logical offset still lands inside the physical range', () => {
        // A page's offset grows by less than a page: near the end of a long range a page's rows reach past the
        // physical range. A page before the last also leaves room to scroll on, since the browser stops at the limit.
        for (const [extent, viewHeight] of [[40000040, 360], [40000040, 900], [4000040, 360], [4000040, 900]]) {
            let pages   = Neo.create(ScrollPages, {extent, maxExtent: maxHeight, viewHeight}),
                last    = pages.pageCount - 1,
                limit   = maxHeight - viewHeight,
                outside = [],
                page, physical;

            // Every offset of the last pages, where the pages drift furthest
            for (let scrollTop = (last - 4) * pages.pageHeight; scrollTop <= extent - viewHeight; scrollTop++) {
                page     = pages.pageAt(scrollTop);
                physical = scrollTop - pages.offsetAt(page);

                if (physical < 0 || physical > limit || (page < last && physical >= limit)) {
                    outside.push(scrollTop)
                }
            }

            expect(outside.length, `${extent} px over ${viewHeight} px, first at ${outside[0]}`).toBe(0);
            pages.destroy()
        }
    })
});

test.describe('Grid scroll pages: a long range past the cap', () => {
    const
        longCount  = 1000000,
        longExtent = (longCount + 1) * rowHeight,
        limit      = maxHeight - viewport;

    let grid, store;

    /**
     * Reports a main-thread scroll offset to the view, as a scroll event does
     * @param {Number} scrollTop
     * @param {String} [epoch='0']
     */
    const report = (scrollTop, epoch = '0') => grid.scrollManager.onContainerScroll({
        scrollLeft: 0,
        scrollTop,
        target    : {data: {scrollEpoch: epoch}, id: grid.view.id, scrollTop}
    });

    test.beforeEach(async () => {
        store = createStore(longCount, {autoInitRecords: false});
        grid  = await createGrid(store);

        grid.scrollManager.rowHoverSync = false;
        grid.view.maxScrollHeight       = maxHeight;
        await grid.view.promiseUpdate()
    });

    test.afterEach(async () => {
        await expect.poll(() => grid.body.isScrolling).toBe(false);
        grid?.destroy();
        store?.destroy()
    });

    test('a keyboard jump to a row near the end lands on that row, inside the physical range', async () => {
        let {view} = grid,
            target = 39997960;

        view.scrollToOffset(target);
        await view.promiseUpdate();

        expect(view.scrollTop).toBe(target);
        expect(view.scrollTop - view.pageOffset).toBeLessThanOrEqual(limit)
    });

    test('after a thumb drag, a scroll that enters the last viewports moves 1:1, without a jump to the last page', async () => {
        let {view} = grid,
            thumb  = limit - 400,
            logical;

        view.isThumbDragging = true;
        report(thumb);
        await expect.poll(() => view.pageOffset).toBeGreaterThan(0);
        view.isThumbDragging = false;

        logical = view.scrollTop;
        expect(view.pageOffset).toBeLessThan(longExtent - maxHeight);

        report(thumb + 326);
        await expect.poll(() => view.scrollTop).toBe(logical + 326)
    });

    test('a scroll the browser stops at the top of a low page moves 1:1, without a jump to the first page', async () => {
        let {view} = grid;

        // Twenty pages in, a page's range starts a few px into the physical range
        view.scrollToOffset(40100);
        await view.promiseUpdate();
        expect(view.scrollTop - view.pageOffset).toBeLessThan(viewport);

        let logical = view.scrollTop - (view.scrollTop - view.pageOffset);

        // A wheel step past that start: the browser stops at 0
        report(0, '1');
        await expect.poll(() => view.scrollTop).toBe(logical)
    });

    test('a store load returns a paged grid to the top, also from a page a few px into the physical range', async () => {
        let {view} = grid;

        view.scrollToOffset(40100);
        await view.promiseUpdate();

        // The event a store fires once it holds new records
        store.fire('load', {items: store.items});

        await expect.poll(() => view.scrollTop).toBe(0);
        expect(view.pageOffset).toBe(0)
    })
});

test.describe('Grid scroll pages: fixed rows past the cap', () => {
    let grid, metas, store;

    test.beforeEach(async () => {
        store = createStore(count);
        grid  = await createGrid(store);
        metas = [];

        // Every meta an update hands to the main thread
        let {view} = grid,
            meta   = view.getVdomUpdateMeta.bind(view);

        view.getVdomUpdateMeta = () => {
            let value = meta();
            metas.push(value);
            return value
        }
    });

    test.afterEach(async () => {
        // A reported scroll ends 150ms later, buffered: a grid destroyed before would re-sync after its destruction
        await expect.poll(() => grid.body.isScrolling).toBe(false);
        grid?.destroy();
        store?.destroy()
    });

    test('below the cap nothing pages: the main thread\'s offset is the logical one', async () => {
        let {body, view} = grid;

        expect(view.maxScrollHeight, 'the mount read the cap').toBeLessThan(Infinity);

        view.syncBodies(5000);
        await view.promiseUpdate();

        expect(view.paged).toBe(false);
        expect(view.pageOffset).toBe(0);
        expect(body.vdom.height).toBe(`${extent}px`);
        expect(metas.at(-1).scrollTop).toBe(5000);
        expect(metas.some(meta => meta.scrollCorrection)).toBe(false);

        body.items.filter(row => row.record).forEach(row => {
            expect(row.vdom.style.transform).toBe(transformAt(row.rowIndex * rowHeight))
        })
    });

    test.describe('with the cap lowered', () => {
        test.beforeEach(async () => {
            grid.view.maxScrollHeight = maxHeight;
            await grid.view.promiseUpdate();
            metas.length = 0
        });

        test('both scroll extents stop at the cap', () => {
            let {body, verticalScrollbar, view} = grid;

            expect(view.paged).toBe(true);
            expect(body.vdom.height).toBe(`${maxHeight}px`);
            expect(verticalScrollbar.vdom.cn[0].height).toBe(`${maxHeight}px`)
        });

        test('crossing into the next page keeps the logical offset and corrects the physical one, once', async () => {
            let {body, view} = grid,
                offset       = Math.round(step);

            view.syncBodies(1990);
            await view.promiseUpdate();
            expect(view.pageOffset).toBe(0);

            // Past the 2,000 px page boundary, and far enough for a new start row
            view.syncBodies(2090);
            await view.promiseUpdate();

            expect(view.scrollTop).toBe(2090);
            expect(view.pageOffset).toBe(offset);
            expect(body.startIndex).toBe(Math.floor(2090 / rowHeight));
            expect(metas.filter(meta => meta.scrollCorrection)).toEqual([{scrollCorrection: -offset, scrollEpoch: 1, scrollTop: 2090 - offset}]);

            // Every row moved by the page offset, also the ones whose record stayed
            body.items.filter(row => row.record).forEach(row => {
                expect(row.vdom.style.transform).toBe(transformAt(row.rowIndex * rowHeight - offset))
            });

            // Reported before the main thread applied the correction, and after it: the same logical offset
            expect(view.reconcileScrollTop(2095, '0')).toBe(2095);
            expect(view.reconcileScrollTop(2095 - offset, '1')).toBe(2095)
        });

        test('a thumb drag to the bottom reaches the last row, without a correction', async () => {
            let {body, scrollManager, view} = grid,
                physical                    = maxHeight - viewport;

            scrollManager.rowHoverSync = false;
            view.isThumbDragging       = true;

            scrollManager.onContainerScroll({
                scrollLeft: 0,
                scrollTop : physical,
                target    : {data: {scrollEpoch: '0'}, id: view.id, scrollTop: physical}
            });

            await expect.poll(() => view.scrollTop).toBe(extent - viewport);
            await expect.poll(() => view.isVdomUpdating || view.needsVdomUpdate).toBe(false);

            expect(view.pageOffset).toBe(extent - maxHeight);
            expect(body.mountedRows[1]).toBe(count);
            expect(metas.some(meta => meta.scrollCorrection)).toBe(false);

            view.isThumbDragging = false
        });

        test('a thumb drag that starts while a crossing\'s correction is in flight pages from the offset the thumb set', async () => {
            let {scrollManager, view} = grid,
                pages                 = view.scrollPages,
                physical              = 100000;

            scrollManager.rowHoverSync = false;

            // A crossing queues a correction of one page step, which the main thread has not applied yet
            view.syncBodies(1990);
            view.syncBodies(2090);
            await view.promiseUpdate();
            expect(view.pageOffset).toBe(Math.round(step));

            // The thumb is pressed before that correction lands: the main thread drops it during the drag, so the
            // offset reported under the old epoch is where the thumb is
            view.isThumbDragging = true;

            scrollManager.onContainerScroll({
                scrollLeft: 0,
                scrollTop : physical,
                target    : {data: {scrollEpoch: '0'}, id: view.id, scrollTop: physical}
            });

            let page = pages.thumbPageAt(physical);

            await expect.poll(() => view.pageOffset).toBe(pages.offsetAt(page));
            expect(view.scrollTop).toBe(physical + pages.offsetAt(page));

            view.isThumbDragging = false
        });

        test('a jump to the top of the physical range returns to the first page', async () => {
            let {scrollManager, view} = grid,
                report                = scrollTop => scrollManager.onContainerScroll({
                    scrollLeft: 0,
                    scrollTop,
                    target    : {data: {scrollEpoch: '0'}, id: view.id, scrollTop}
                });

            scrollManager.rowHoverSync = false;

            // Deep into the range, as a thumb drag leaves it
            view.isThumbDragging = true;
            report(100000);
            await expect.poll(() => view.pageOffset).toBeGreaterThan(0);
            view.isThumbDragging = false;

            // A load's reset to the top
            report(0);
            await expect.poll(() => view.scrollTop).toBe(0);

            expect(view.pageOffset).toBe(0);
            expect(grid.body.startIndex).toBe(0);

            // The buffered scroll end re-syncs to the same place, not to the old page's logical offset
            await expect.poll(() => grid.body.isScrolling).toBe(false);
            expect(view.scrollTop).toBe(0);
            expect(view.pageOffset).toBe(0)
        });

        test('a keyboard jump to the last row moves the rows and the scroll offset in one update', async () => {
            let {body, view} = grid,
                original     = Neo.main.DomAccess.scrollTo,
                scrolls      = [],
                target       = extent - viewport;

            Neo.main.DomAccess.scrollTo = ({value}) => {scrolls.push(value)};

            try {
                body.scrollByRows(0, count - 1);
                await view.promiseUpdate();

                expect(scrolls, 'no separate main-thread scroll').toEqual([]);
                expect(view.scrollTop).toBe(target);
                expect(view.pageOffset).toBe(extent - maxHeight);
                expect(body.mountedRows[1]).toBe(count);
                expect(metas.filter(meta => meta.scrollCorrection)).toEqual([
                    {scrollCorrection: target - (extent - maxHeight), scrollEpoch: 1, scrollTop: target - (extent - maxHeight)}
                ])
            } finally {
                Neo.main.DomAccess.scrollTo = original
            }
        })
    })
});

test.describe('Grid scroll pages: content-sized rows past the cap', () => {
    let errors, grid, original, store;

    test.beforeEach(async () => {
        errors   = [];
        original = console.error;
        console.error = (...args) => errors.push(args);

        store = createStore(count);
        grid  = await createGrid(store, {contentSizedRows: true})
    });

    test.afterEach(async () => {
        console.error = original;
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('refuse to page: one named error, and the extent stops at the cap', async () => {
        let {body, view} = grid,
            refusals     = () => errors.filter(([message]) => String(message).includes('content-sized rows reach past'));

        view.maxScrollHeight = maxHeight;
        await view.promiseUpdate();

        view.syncBodies(5000);
        await view.promiseUpdate();

        expect(refusals()).toHaveLength(1);
        expect(view.paged).toBe(false);
        expect(view.pageOffset).toBe(0);
        expect(body.vdom.height).toBe(`${maxHeight}px`)
    })
});
