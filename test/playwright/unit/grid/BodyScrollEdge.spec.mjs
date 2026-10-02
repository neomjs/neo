/**
 * @file test/playwright/unit/grid/BodyScrollEdge.spec.mjs
 * @summary Neo.grid.Body announces `scrollEdge` once each time the visible window reaches the store's end.
 *
 * A buffered grid over a remote corpus needs one signal: the viewport reached the loaded end, so
 * the consumer may ask for the next window. The body already computes that in
 * `updateMountedAndVisibleRows()` on every scroll, resize and store change; this file pins that it
 * says so exactly once per entry, re-armed only by a change of the store's count.
 *
 * @see Neo.grid.Body
 * @see https://github.com/neomjs/neo/issues/19356
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
        name             : 'GridBodyScrollEdgeTest',
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import GridBody       from '../../../../src/grid/Body.mjs';
import Store          from '../../../../src/data/Store.mjs';

/**
 * A body with just enough state for the window calculator: `availableRows`, `bufferRowRange`,
 * `startIndex` and `store.count`. No mount, no render, no DOM.
 * @param {Number} count
 * @param {Object} config
 * @returns {{body: Neo.grid.Body, edges: Object[]}}
 */
function createBody(count, config = {}) {
    const
        edges = [],
        body  = Neo.create(GridBody, {
            appName       : 'GridBodyScrollEdgeTest',
            availableRows : 10,
            bufferRowRange: 3,
            startIndex    : 0,
            // a model, so the data's own ids and names are record fields a filter can read (a
            // model-less store keys its records -1, -2, … and drops the rest)
            store         : Neo.create(Store, {
                data : Array.from({length: count}, (_, i) => ({id: i + 1, name: 'row ' + (i + 1)})),
                model: {fields: [{name: 'id', type: 'Int'}, {name: 'name', type: 'String'}]}
            }),
            ...config
        });

    body.on('scrollEdge', ({count, endIndex, startIndex, total}) => edges.push({count, endIndex, startIndex, total}));

    return {body, edges}
}

/**
 * Moves the viewport and runs the window calculator, the way a scroll tick does after the
 * `startIndex` write.
 * @param {Neo.grid.Body} body
 * @param {Number} startIndex
 */
function scrollTo(body, startIndex) {
    body.startIndex = startIndex;
    body.updateMountedAndVisibleRows()
}

test.describe('Neo.grid.Body — scrollEdge fires once per entry into the store\'s end (#19356)', () => {
    // No `NEO_TEST_SKIP_CI` guard: the unit CI job sets that variable, and a guarded arm is green
    // by not running. Nothing here needs more than a body and a store.

    test('scrolling to the end announces the edge once; further ticks at the edge announce nothing', () => {
        const {body, edges} = createBody(50);

        scrollTo(body, 0);
        expect(edges, 'the top of 50 rows is not the edge').toEqual([]);

        scrollTo(body, 36);
        expect(edges, 'visible end 46, buffer 3: not yet').toEqual([]);

        scrollTo(body, 37);
        expect(edges, 'visible end 47 + buffer 3 reaches 50').toEqual([{count: 50, endIndex: 47, startIndex: 37, total: 50}]);

        scrollTo(body, 38);
        scrollTo(body, 40);
        body.updateMountedAndVisibleRows();
        expect(edges, 'parked at the edge: quiet').toHaveLength(1);

        body.destroy()
    });

    test('leaving the edge and returning announces it again', () => {
        const {body, edges} = createBody(50);

        scrollTo(body, 40);
        scrollTo(body, 10);
        scrollTo(body, 40);

        expect(edges.map(edge => edge.startIndex)).toEqual([40, 40]);

        body.destroy()
    });

    test('appending rows while the viewport stays at the edge announces once more, for the new count', () => {
        const {body, edges} = createBody(50);

        scrollTo(body, 40);
        expect(edges).toHaveLength(1);

        // the consumer appended a short window; the viewport (40..50) still touches the new end
        body.store.add(Array.from({length: 2}, (_, i) => ({id: 51 + i, name: 'row ' + (51 + i)})));
        body.updateMountedAndVisibleRows();
        expect(edges.at(-1), 're-armed by the count change').toEqual({count: 52, endIndex: 50, startIndex: 40, total: 52});
        expect(edges).toHaveLength(2);

        // a long window moves the end away; reaching it announces for that count
        body.store.add(Array.from({length: 48}, (_, i) => ({id: 53 + i, name: 'row ' + (53 + i)})));
        body.updateMountedAndVisibleRows();
        expect(edges, '50 + 3 < 100: away from the edge').toHaveLength(2);
        scrollTo(body, 90);
        expect(edges.at(-1)).toEqual({count: 100, endIndex: 100, startIndex: 90, total: 100});

        body.destroy()
    });

    test('a store shorter than one window announces on its first layout; an empty store never does', () => {
        const short = createBody(5);

        short.body.updateMountedAndVisibleRows();
        short.body.updateMountedAndVisibleRows();
        expect(short.edges, 'five rows under a ten-row window').toEqual([{count: 5, endIndex: 5, startIndex: 0, total: 5}]);
        short.body.destroy();

        const empty = createBody(0);

        empty.body.updateMountedAndVisibleRows();
        expect(empty.edges, 'nothing loaded is not an edge').toEqual([]);
        empty.body.destroy()
    });

    test('an append a filter hides entirely does not re-arm the edge: the viewport saw nothing move, and the total travels as information (#19359)', () => {
        // The first consumer's two findings: a count-keyed latch leaves a one-row collapsed thread
        // at the same edge after a hidden append (older rows wait for the operator to expand the
        // thread), and a total-keyed latch walks the whole filtered corpus with no gesture. The
        // engine keeps the viewport's truth and reports the total beside it.
        const {body, edges} = createBody(1);

        // the same filter shape the pooling specs use: only id 1 passes
        body.store.filters = [{property: 'id', operator: '<', value: 2}];
        expect(body.store.count, 'one visible row').toBe(1);

        scrollTo(body, 0);
        expect(edges, 'a one-row store is at its edge from the first layout').toEqual([{count: 1, endIndex: 1, startIndex: 0, total: 1}]);

        // an append lands in the filtered view until the filter runs again; the consumer's
        // projection re-filters on every landed window, so the arm does the same here
        body.store.add(Array.from({length: 10}, (_, i) => ({id: 100 + i, name: 'hidden ' + i})));
        body.store.filter();
        expect(body.store.count, 'still one visible row').toBe(1);
        expect(body.store.allItems.getCount()).toBe(11);

        body.updateMountedAndVisibleRows();
        body.updateMountedAndVisibleRows();
        expect(edges, 'nothing the viewport can reach moved: quiet').toHaveLength(1);

        // the rows become visible (the consumer's thread expands): a visible change re-arms as usual
        body.store.filters = [];
        expect(body.store.count).toBe(11);
        scrollTo(body, 1);
        expect(edges.at(-1), 'the visible change announced, with the total beside the count').toEqual({count: 11, endIndex: 11, startIndex: 1, total: 11});

        body.destroy()
    });

    test('shrinking the store re-arms the edge for the smaller count', () => {
        const {body, edges} = createBody(50);

        scrollTo(body, 40);
        body.store.removeAt(49);
        expect(body.store.count, 'the store shrank').toBe(49);
        scrollTo(body, 39);

        expect(edges.map(edge => edge.count)).toEqual([50, 49]);

        body.destroy()
    });
});
