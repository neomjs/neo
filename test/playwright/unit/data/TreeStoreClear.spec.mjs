import {setup} from '../../setup.mjs';

const appName = 'TreeStoreClearTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';
import TreeModel      from '../../../../src/data/TreeModel.mjs';
import TreeStore      from '../../../../src/data/TreeStore.mjs';

// Once per worker process: unitTestMode refuses a taken namespace
class TestTreeModel extends TreeModel {
    static config = {
        className: 'Test.Unit.Data.TreeStoreClear.TestTreeModel',
        fields   : [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]
    }
}

const model = Neo.setupClass(TestTreeModel);

const flat = count => Array.from({length: count}, (_, i) => ({id: `r${i}`, name: `Row ${i}`}));

// Parents first: ingestion re-parents a node whose parent it has not seen yet
const nested = (parents, children) => [
    ...Array.from({length: parents},            (_, p) => ({id: `p${p}`, isLeaf: false, name: `P${p}`})),
    ...Array.from({length: parents * children}, (_, i) => ({id: `c${i}`, name: `C${i}`, parentId: `p${i % parents}`}))
];

/**
 * Counts the positional scans of the projection. Each costs O(visible nodes), so one per removed node makes a
 * clear quadratic: 1.8 s for 40,000 visible nodes, where a plain Store clears in under a millisecond.
 * @param {Neo.data.TreeStore} store
 * @returns {Function} Reads the count.
 */
function countScans(store) {
    let scans = 0;

    const {indexOf, indexOfKey} = store;

    store.indexOf    = function(...args) {scans++; return indexOf.apply(this, args)};
    store.indexOfKey = function(...args) {scans++; return indexOfKey.apply(this, args)};

    return () => scans
}

test.describe('Neo.data.TreeStore clear() and reload', () => {
    let store;

    test.afterEach(() => {
        store?.destroy();
        store = null
    });

    test('clear() of a flat tree resolves no node position by scanning', () => {
        store = Neo.create(TreeStore, {autoInitRecords: false, data: flat(500), model});

        const scans = countScans(store);

        store.clear();

        expect(store.getCount()).toBe(0);
        expect(scans()).toBe(0)
    });

    test('clear() of an expanded tree resolves no node position by scanning', () => {
        store = Neo.create(TreeStore, {autoInitRecords: false, data: nested(10, 50), model});

        store.expandAll();

        expect(store.getCount()).toBe(510);

        const scans = countScans(store);

        store.clear();

        expect(store.getCount()).toBe(0);
        expect(scans()).toBe(0)
    });

    test('clear() empties both layers and reports the projection it removed, in order', async () => {
        store = Neo.create(TreeStore, {data: nested(2, 2), model});

        await store.expand('p0');

        const projection = store.items.map(item => store.getKey(item));
        let event        = null;

        expect(projection).toEqual(['p0', 'c0', 'c2', 'p1']);

        store.on('mutate', data => {event = data});
        store.clear();

        expect(store.getCount()).toBe(0);
        expect(store.get('p0')).toBe(null);
        expect(store.get('c1')).toBe(null); // was hidden under the collapsed p1
        expect(store.getChildren('root')).toEqual([]);
        expect(event.addedItems).toEqual([]);
        expect(event.removedItems.map(item => store.getKey(item))).toEqual(projection)
    });

    test('loading new data replaces the previous tree', () => {
        store = Neo.create(TreeStore, {data: flat(20), model});

        store.data = nested(1, 3);

        expect(store.getCount()).toBe(1);
        expect(store.get('r0')).toBe(null);
        expect(store.get('c1').parentId).toBe('p0');
        expect(store.getChildren('p0').length).toBe(3)
    })
});
