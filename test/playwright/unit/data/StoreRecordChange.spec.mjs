/**
 * @file test/playwright/unit/data/StoreRecordChange.spec.mjs
 * @summary `recordChange.index` is computed when a listener reads it, not once before every listener.
 *
 * The store used to scan its visible rows for every field write, even when no listener read the
 * published index. Listeners which do read it could also see a stale position after an earlier
 * listener re-sorted the store.
 *
 * @see Neo.data.Store#onRecordChange
 * @see https://github.com/neomjs/neo/issues/20855
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'StoreRecordChangeTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Model           from '../../../../src/data/Model.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Store           from '../../../../src/data/Store.mjs';

/**
 * @summary Record-change publication must keep its index cheap until it is read.
 */
test.describe('Store recordChange index contract (#20855)', () => {
    let store;

    test.beforeEach(async () => {
        store = Neo.create(Store, {
            model: {
                module: Model,
                fields: [
                    {name: 'id', type: 'Integer'},
                    {name: 'rank', type: 'Integer'},
                    {name: 'name', type: 'String'}
                ]
            },
            data: [
                {id: 1, rank: 1, name: 'a'},
                {id: 2, rank: 2, name: 'b'},
                {id: 3, rank: 3, name: 'c'}
            ]
        });

        await store.ready()
    });

    test.afterEach(() => store?.destroy());

    test('publishes index as an enumerable getter', () => {
        const record = store.get(1);

        let descriptor, copy;

        store.on('recordChange', data => {
            descriptor = Object.getOwnPropertyDescriptor(data, 'index');
            copy       = {...data}
        });

        record.name = 'updated';

        expect(descriptor.enumerable, 'a spread sees the key').toBe(true);
        expect(typeof descriptor.get, 'the published index is an accessor').toBe('function');
        expect(copy.index, 'spreading materializes the current value').toBe(0)
    });

    test('a later listener reads the position after an earlier listener re-sorted the store', () => {
        store.sorters = [{property: 'rank', direction: 'DESC'}];

        const record = store.get(1), observed = [];

        // Listener order is the contract here: the first one changes the order, the second reads.
        store.on('recordChange', () => store.doSort());
        store.on('recordChange', data => observed.push(data.index));

        record.rank = 99;

        expect(store.items.map(item => item.id)).toEqual([1, 3, 2]);
        expect(observed).toEqual([0])
    });

    test('a read before a re-sort does not pin the index for later listeners', () => {
        store.sorters = [{property: 'rank', direction: 'DESC'}];

        const record = store.get(1), observed = [];

        store.on('recordChange', data => observed.push(data.index));
        store.on('recordChange', () => store.doSort());
        store.on('recordChange', data => observed.push(data.index));

        record.rank = 99;

        expect(observed, 'each read answers the position at that moment').toEqual([2, 0])
    });

    test('does not scan the store when no listener reads the index', () => {
        const record   = store.getAt(2);
        const original = store.indexOf;

        let calls = 0, published;

        store.indexOf = function (...args) {
            calls++;
            return original.apply(this, args)
        };

        store.on('recordChange', data => published = data);

        record.rank = 10;

        expect(calls, 'publication itself does not compute the index').toBe(0);
        expect(published.index, 'a read computes the settled position').toBe(2);
        expect(calls, 'exactly the read paid for the scan').toBe(1)
    })
});
