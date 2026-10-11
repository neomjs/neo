/**
 * @file test/playwright/unit/grid/VerticalScrollbarStoreSwap.spec.mjs
 * @summary Regression: replacing a grid store must fully detach the scrollbar from the OLD store.
 *
 * `VerticalScrollbar.afterSetStore` historically only subscribed to the incoming store — it never
 * unsubscribed from the replaced one, so after a store swap (reachable since provider-bound stores
 * resolve post-construct and `grid.Container.afterSetStore` propagates them) the OLD store's
 * `load`/`filter` events kept driving the CURRENT scrollbar's height. The listener contract is now
 * symmetric (`value?.on` / `oldValue?.un`, the `grid.Container` idiom).
 *
 * @see Neo.grid.VerticalScrollbar
 * @see Neo.grid.Container
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
        name             : 'GridVerticalScrollbarSwapTest',
        vnodeInitialising: false
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import Store             from '../../../../src/data/Store.mjs';
import VerticalScrollbar from '../../../../src/grid/VerticalScrollbar.mjs';

const makeStore = rowCount => Neo.create(Store, {
    data       : Array.from({length: rowCount}, (item, index) => ({id: index + 1})),
    keyProperty: 'id'
});

test.describe('Neo.grid.VerticalScrollbar store replacement', () => {

    test('a replaced store stops driving the scrollbar; the new one takes over', () => {
        const
            storeA    = makeStore(1),
            storeB    = makeStore(100),
            scrollbar = Neo.create(VerticalScrollbar, {rowHeight: 32, store: storeA});

        // the current store's load drives the height: (1 + 1) * 32
        storeA.fire('load', {items: storeA.items});
        expect(scrollbar.vdom.cn[0].height).toBe('64px');

        scrollbar.store = storeB;

        // the OLD store firing must be inert now — pre-fix this flipped 64px to 3232px
        storeA.fire('load', {total: 100});
        expect(scrollbar.vdom.cn[0].height).toBe('64px');

        // the NEW store drives it: (100 + 1) * 32
        storeB.fire('load', {items: storeB.items});
        expect(scrollbar.vdom.cn[0].height).toBe('3232px');

        scrollbar.destroy();
        storeA.destroy();
        storeB.destroy();
    });

    test('detaching the store entirely (null) leaves the last height untouched and stays inert', () => {
        const
            storeA    = makeStore(2),
            scrollbar = Neo.create(VerticalScrollbar, {rowHeight: 32, store: storeA});

        storeA.fire('load', {items: storeA.items});
        expect(scrollbar.vdom.cn[0].height).toBe('96px');

        scrollbar.store = null;

        storeA.fire('load', {total: 50});
        expect(scrollbar.vdom.cn[0].height).toBe('96px');

        scrollbar.destroy();
        storeA.destroy();
    });
});
