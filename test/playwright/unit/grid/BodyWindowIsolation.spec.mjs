/**
 * @file test/playwright/unit/grid/BodyWindowIsolation.spec.mjs
 * @summary Each Neo.grid.Body owns its virtualization windows, so one grid cannot resize another's.
 *
 * `mountedRows`, `visibleRows` and `visibleColumns` are declared in `static config` as array
 * literals, and the two window calculators write through them BY INDEX rather than reassigning
 * (`me.mountedRows[0] = …` — "update the array inline"). A non-reactive config holding an array
 * hands every instance the same object, so before the fix every grid body on a page shared one
 * window and the last body to measure decided what all the others believed was mounted.
 *
 * Nothing reports that. `onStoreRecordChange()` and `getRow()` both treat an index outside the
 * window as "nothing to do" — no row update, no warning — so on a page with two grids, a record
 * change beyond the borrowed window reaches the store and never reaches the DOM. The store stays
 * correct, which is what makes it hard to see: only the paint is missing.
 *
 * Observed on a page holding a tall grid and a short one, where the short grid clamped the tall
 * grid to six mounted rows and every row below the sixth stopped repainting.
 *
 * @see Neo.grid.Body
 * @see https://github.com/neomjs/neo/issues/18198
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
        name             : 'GridBodyWindowIsolationTest',
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import GridBody       from '../../../../src/grid/Body.mjs';
import Store          from '../../../../src/data/Store.mjs';

/**
 * A body with just enough state for the window calculator: it reads `availableRows`,
 * `bufferRowRange`, `startIndex` and `store.count`, and nothing else.
 * @param {Object} config
 * @returns {Neo.grid.Body}
 */
const createBody = config => Neo.create(GridBody, {
    appName: 'GridBodyWindowIsolationTest',
    store  : Neo.create(Store, {
        data: Array.from({length: 500}, (_, i) => ({id: i + 1, name: 'row ' + (i + 1)}))
    }),
    ...config
});

test.describe('Neo.grid.Body — one grid cannot resize another grid\'s window (#18198)', () => {
    // Deliberately NO `test.skip(!!process.env.NEO_TEST_SKIP_CI, …)` guard, which several specs in
    // this directory carry. The `unit` CI job sets that variable, so a guarded regression arm is
    // green in CI by not running — indistinguishable from green by passing, and useless as the
    // thing that stops this defect coming back. Nothing here needs more than the engine the
    // unguarded specs in this directory already use: two `Neo.grid.Body` instances and a store,
    // no mount, no render, no DOM.

    let feed, scale;

    test.beforeEach(() => {
        // Deliberately unequal geometries, mirroring the Workstation: a tall grid and a short one.
        // Equal geometries would produce equal windows and the arm would pass while sharing.
        scale = createBody({availableRows: 7, bufferRowRange: 10, startIndex: 0});
        feed  = createBody({availableRows: 1, bufferRowRange: 2,  startIndex: 0})
    });

    test.afterEach(() => {
        scale?.destroy?.();
        feed?.destroy?.()
    });

    test('two bodies do not share the array objects their windows are written through', () => {
        // Identity, asserted directly. The inline writes mean sharing the object IS the defect —
        // every behavioural symptom below is downstream of this one fact.
        expect(scale.mountedRows,    'mountedRows is per instance').not.toBe(feed.mountedRows);
        expect(scale.visibleRows,    'visibleRows is per instance').not.toBe(feed.visibleRows);
        expect(scale.visibleColumns, 'visibleColumns is per instance').not.toBe(feed.visibleColumns)
    });

    test('recomputing the tall grid\'s window leaves the short grid\'s window untouched', () => {
        feed.updateMountedAndVisibleRows();

        const feedWindow  = [...feed.mountedRows],
              feedVisible = [...feed.visibleRows];

        // The short grid's own geometry can only ever produce a 5-row window
        // (availableRows 1 + 2 * bufferRowRange 2). Stating it makes the arm non-vacuous: if the
        // calculator ever stops running, the assertions below would compare two untouched
        // defaults and pass without measuring anything.
        expect(feedWindow, 'the short grid measured its own geometry').toEqual([0, 5]);

        scale.updateMountedAndVisibleRows();

        // The tall grid reaches a window the short one cannot produce: availableRows 7 puts the
        // visible end at 7, and bufferRowRange 10 extends the mounted end to 27.
        expect(scale.mountedRows, 'the tall grid measured its own geometry').toEqual([0, 27]);
        expect(scale.visibleRows, 'and its own visible range').toEqual([0, 7]);

        // The point of the file: measuring one grid must not move the other.
        expect(feed.mountedRows, 'the short grid keeps its window').toEqual(feedWindow);
        expect(feed.visibleRows, 'and its visible range').toEqual(feedVisible)
    });

    test('the order the grids measure in does not decide what either believes is mounted', () => {
        // The defect was order-dependent, so asserting one order proves only that order. Whichever
        // measures last, both must end on their own numbers.
        scale.updateMountedAndVisibleRows();
        feed.updateMountedAndVisibleRows();

        expect(scale.mountedRows, 'tall grid, measured first').toEqual([0, 27]);
        expect(feed.mountedRows,  'short grid, measured last').toEqual([0, 5])
    });

    // The other half of the descriptor, and the one with no visible symptom when it breaks. Every
    // window here is written BY INDEX rather than reassigned, and the engine's default copies
    // arrays on every read — so without `cloneOnGet: 'none'` the write lands in a discarded copy
    // and the window silently never moves. That failure looks exactly like the sharing bug from
    // the outside, which is why it is armed rather than left to the arms above.
    //
    // One arm PER CONFIG, because a passing suite is not evidence that a config is covered: with
    // `cloneOnGet` dropped from `visibleColumns_` alone, all 80 specs across `unit/grid` and
    // `component/grid` stayed green. The writers that would have caught it live in other classes —
    // `grid/Container.mjs` destructures `visibleColumns` off the body and does `+= step` through
    // the reference, and `grid/View.mjs` index-writes `_body.visibleRows` — and neither path is
    // exercised by those suites. Covering one config and inferring the rest is what left that hole.
    for (const key of ['mountedRows', 'visibleRows', 'visibleColumns']) {
        test(`an index-write through ${key} is observable on the instance`, () => {
            scale[key][0] = 3;
            scale[key][1] = 9;

            expect(scale[key], 'the write reached the stored array').toEqual([3, 9]);

            // And it must not have reached anything else, which is what pairs `cloneOnGet: 'none'`
            // with `clone: 'shallow'`: a live reference per instance, not one shared live reference.
            expect(feed[key], 'without touching the other body').toEqual([0, 0])
        })
    }

    // `mountedColumns` is the fourth window and it is deliberately NOT in the loop above, because
    // it is the only one of the four with an `afterSet` hook: `afterSetMountedColumns` calls
    // `createViewData()`, so the assignment IS the horizontal repaint trigger. Its contract is
    // therefore assign-only, and the property worth guarding is the opposite one — that a whole
    // assignment still reaches the hook. It carries the same descriptor as its siblings for the
    // other two reasons (per-instance default, and no array copy on a read that happens per row
    // and per cell during render), and those must not have cost it the notification.
    test('mountedColumns is per instance, like its three siblings', () => {
        expect(scale.mountedColumns, 'not the same array as the other body').not.toBe(feed.mountedColumns);

        scale.mountedColumns = [2, 8];

        expect(feed.mountedColumns, 'the sibling keeps its own').toEqual([0, 0])
    });

    test('assigning mountedColumns still reaches afterSetMountedColumns, which drives the repaint', () => {
        let renders = 0;

        scale.createViewData = () => {renders++};

        // A fresh array with different values: the setter's equality check must see a change.
        scale.mountedColumns = [1, 6];

        expect(scale.mountedColumns, 'the assignment landed').toEqual([1, 6]);
        expect(renders, 'and it triggered the render the hook owns').toBe(1);

        // The negative half, and the reason this config is excluded from the index-write loop: a
        // write that does not go through the setter moves the value without repainting. Asserted
        // so the assign-only contract is enforced by the suite rather than only by a comment.
        scale.mountedColumns[0] = 4;

        expect(renders, 'an index-write does NOT repaint — assign, never index-write').toBe(1)
    })
});
