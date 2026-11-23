import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'TreeStoreBatchReprojectionTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import RecordFactory  from '../../../../src/data/RecordFactory.mjs';
import TreeStore      from '../../../../src/data/TreeStore.mjs';
import TreeModel      from '../../../../src/data/TreeModel.mjs';

class TestTreeModel extends TreeModel {
    static config = {
        className: 'Test.Unit.Data.TreeStoreBatchReprojection.Model',
        fields   : [
            {name: 'id',    type: 'String'},
            {name: 'name',  type: 'String'},
            {name: 'score', type: 'Integer'}
        ]
    }
}

const NodeModel = Neo.setupClass(TestTreeModel);

/**
 * @summary Keyed re-adds in TreeStore keep Structural and Projection layers synchronized across raw and hydrated paths.
 *
 * In Turbo Mode (`autoInitRecords: false`), re-adding existing keys replaces raw rows in place across both the
 * Structural Layer and Projection Layer without triggering lazy hydration, preserving unsorted sibling order,
 * expanded/collapsed descendant visibility, and batched `updateRows` values across sort and filter reprojections.
 * When a row is already a hydrated `Record`, re-adding a raw literal updates and preserves that `Record` identity.
 */
test.describe('Neo.data.TreeStore (keyed re-add batch reprojection)', () => {
    let store;

    test.afterEach(() => {
        store?.destroy();
        store = null;
    });

    test('raw re-add -> batch -> sort sequence retains batched value with zero record hydrations', async () => {
        store = Neo.create(TreeStore, {
            autoInitRecords: false,
            model          : NodeModel,
            data           : [
                {id: 'a', name: 'A', score: 1},
                {id: 'b', name: 'B', score: 2}
            ]
        });

        await store.ready();

        store.add({id: 'a', name: 'A readded', score: 1}, false);
        expect(store._items.every(item => !RecordFactory.isRecord(item))).toBe(true);

        store.updateRows([{key: 'a', values: {name: 'A batched'}}]);
        expect(store._items.every(item => !RecordFactory.isRecord(item))).toBe(true);

        store.sorters = [{property: 'score', reapplyOnRecordChange: true}];
        expect(store._items.every(item => !RecordFactory.isRecord(item))).toBe(true);

        const rowAfterSort = store._items.find(item => store.getKey(item) === 'a');
        expect(rowAfterSort?.name).toBe('A batched');
        expect(store.get('a')?.name).toBe('A batched');
    });

    test('filter reprojection preserves current raw row value with zero hydrations and agrees with structural read', async () => {
        store = Neo.create(TreeStore, {
            autoInitRecords: false,
            model          : NodeModel,
            data           : [
                {id: 'a', name: 'A', score: 1},
                {id: 'b', name: 'B', score: 2}
            ]
        });

        await store.ready();

        store.add({id: 'a', name: 'A readded', score: 1}, false);
        store.updateRows([{key: 'a', values: {name: 'A batched'}}]);

        store.filters = [{property: 'score', operator: '>', value: 0}];
        expect(store._items.every(item => !RecordFactory.isRecord(item))).toBe(true);

        const visibleRow = store._items.find(item => store.getKey(item) === 'a');
        expect(visibleRow?.name).toBe('A batched');

        store.clearFilters();
        expect(store._items.every(item => !RecordFactory.isRecord(item))).toBe(true);

        const visibleAfterClear = store._items.find(item => store.getKey(item) === 'a');
        expect(visibleAfterClear?.name).toBe('A batched');
        expect(store.get('a')?.name).toBe('A batched');
    });

    test('multi-item and mixed unsorted re-adds preserve structural sibling order without hydration', async () => {
        store = Neo.create(TreeStore, {
            autoInitRecords: false,
            model          : NodeModel,
            data           : [
                {id: 'a', name: 'A', score: 1},
                {id: 'b', name: 'B', score: 2},
                {id: 'c', name: 'C', score: 3}
            ]
        });

        await store.ready();

        store.add([
            {id: 'a', name: 'A2', score: 9},
            {id: 'c', name: 'C2', score: 11}
        ], false);

        expect(store._items.every(item => !RecordFactory.isRecord(item))).toBe(true);
        expect(store._items.map(item => [item.id, item.name])).toEqual([
            ['a', 'A2'],
            ['b', 'B'],
            ['c', 'C2']
        ]);

        // Mixed batch: replace existing 'a' and append new sibling 'z'
        store.add([
            {id: 'a', name: 'A3', score: 12},
            {id: 'z', name: 'Z',  score: 13}
        ], false);

        expect(store._items.every(item => !RecordFactory.isRecord(item))).toBe(true);
        expect(store._items.map(item => [item.id, item.name])).toEqual([
            ['a', 'A3'],
            ['b', 'B'],
            ['c', 'C2'],
            ['z', 'Z']
        ]);

        // Structural layer matches flat projection order and values
        expect(store.getChildren('root').map(item => [item.id, item.name])).toEqual([
            ['a', 'A3'],
            ['b', 'B'],
            ['c', 'C2'],
            ['z', 'Z']
        ]);
    });

    test('expanded-parent re-add retains visible children without duplicate emission and evicts them on collapse', async () => {
        store = Neo.create(TreeStore, {
            autoInitRecords: false,
            model          : NodeModel,
            data           : [
                {id: 'p',  name: 'P',  score: 1, isLeaf: false, collapsed: false},
                {id: 'c1', name: 'C1', score: 2, parentId: 'p'},
                {id: 'c2', name: 'C2', score: 3, parentId: 'p'},
                {id: 'b',  name: 'B',  score: 4}
            ]
        });

        await store.ready();
        expect(store._items.map(item => item.id)).toEqual(['p', 'c1', 'c2', 'b']);

        const mutateEvents = [];
        store.on('mutate', event => mutateEvents.push(event));

        // Re-add expanded parent omitting collapsed -> inherits collapsed: false without re-adding children
        store.add({id: 'p', name: 'P2', score: 1}, false);

        expect(store._items.every(item => !RecordFactory.isRecord(item))).toBe(true);
        expect(store._items.map(item => [item.id, item.name])).toEqual([
            ['p',  'P2'],
            ['c1', 'C1'],
            ['c2', 'C2'],
            ['b',  'B']
        ]);
        expect(mutateEvents.at(-1).addedItems.map(item => item.id)).toEqual(['p']);

        // Re-add expanded parent with collapsed: true -> evicts visible descendants
        store.add({id: 'p', name: 'P collapsed', score: 1, collapsed: true}, false);

        expect(store._items.every(item => !RecordFactory.isRecord(item))).toBe(true);
        expect(store._items.map(item => [item.id, item.name])).toEqual([
            ['p', 'P collapsed'],
            ['b', 'B']
        ]);
        expect(store.map.has('c1')).toBe(false);
        expect(store.map.has('c2')).toBe(false);
        expect(store.getChildren('p').map(item => item.id)).toEqual(['c1', 'c2']);
    });

    test('repeated re-add keeps one hierarchy entry per key and correct child/sibling counts', async () => {
        store = Neo.create(TreeStore, {
            autoInitRecords: false,
            model          : NodeModel,
            data           : [
                {id: 'a', name: 'A', score: 1},
                {id: 'b', name: 'B', score: 2}
            ]
        });

        await store.ready();

        store.add({id: 'a', name: 'A readded 1', score: 1}, false);
        store.add({id: 'a', name: 'A readded 2', score: 1}, false);
        store.add({id: 'a', name: 'A readded 3', score: 1}, false);

        expect(store._items.every(item => !RecordFactory.isRecord(item))).toBe(true);
        expect(store.getCount()).toBe(2);
        expect(store.getChildren('root').map(item => store.getKey(item))).toEqual(['a', 'b']);
        expect(store.get('a').siblingCount).toBe(2);
        expect(store.get('a').name).toBe('A readded 3');
    });

    test('same-object re-add and hydrated-record paths preserve Record identity across updateRows and sort', async () => {
        store = Neo.create(TreeStore, {
            autoInitRecords: false,
            model          : NodeModel,
            data           : [
                {id: 'a', name: 'A', score: 1},
                {id: 'b', name: 'B', score: 2},
                {id: 'c', name: 'C', score: 3}
            ]
        });

        await store.ready();

        // Same-object raw re-add keeps raw row unhydrated
        const rawB = store._items.find(item => store.getKey(item) === 'b');
        expect(RecordFactory.isRecord(rawB)).toBe(false);
        store.add(rawB, false);
        expect(store.getCount()).toBe(3);
        expect(RecordFactory.isRecord(store._items.find(item => store.getKey(item) === 'b'))).toBe(false);

        // Hydrate 'a', then re-add via raw literal in Turbo Mode -> preserves Record identity
        const recA = store.get('a');
        expect(RecordFactory.isRecord(recA)).toBe(true);

        store.add({id: 'a', name: 'A readded', score: 9}, false);
        expect(store._items.find(item => store.getKey(item) === 'a')).toBe(recA);
        expect(recA.name).toBe('A readded');
        expect(recA.score).toBe(9);

        store.updateRows([{key: 'a', values: {name: 'A batched'}}]);
        store.sorters = [{property: 'score'}];

        const afterSort = store.get('a');
        expect(afterSort).toBe(recA);
        expect(afterSort.name).toBe('A batched');
        expect(afterSort.score).toBe(9);
        expect(store._items.map(item => store.getKey(item))).toEqual(['b', 'c', 'a']);

        // Eager autoInitRecords: true path also preserves live Record identity on re-add
        const eagerStore = Neo.create(TreeStore, {
            autoInitRecords: true,
            model          : NodeModel,
            data           : [
                {id: 'x', name: 'X', score: 1},
                {id: 'y', name: 'Y', score: 2}
            ]
        });

        try {
            await eagerStore.ready();
            const recX = eagerStore.get('x');
            const [added] = eagerStore.add({id: 'x', name: 'X2', score: 10});

            expect(added).toBe(recX);
            expect(eagerStore.get('x')).toBe(recX);
            expect(recX.name).toBe('X2');
            expect(recX.score).toBe(10);
        } finally {
            eagerStore.destroy();
        }
    });
});
