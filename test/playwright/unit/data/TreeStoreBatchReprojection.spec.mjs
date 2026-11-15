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
 * @summary A raw tree-row batch is preserved across re-add, sort, and filter reprojections.
 *
 * In Turbo Mode (`autoInitRecords: false`), re-adding a key replaces the node in both the Structural Layer
 * and the Projection Layer so that subsequent batch edits (`Store#updateRows`) write to the authoritative
 * raw row, and reprojection (sort or filter) retains the batched values without requiring forced hydration.
 */
test.describe('Neo.data.TreeStore (raw re-add row batch reprojection)', () => {
    let store;

    test.afterEach(() => {
        store?.destroy();
        store = null;
    });

    test('raw re-add -> batch -> sort sequence retains batched value without hydration', async () => {
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

        store.sorters = [{property: 'score', reapplyOnRecordChange: true}];

        const rowAfterSort = store.items.find(item => store.getKey(item) === 'a');
        expect(rowAfterSort?.name).toBe('A batched');
        expect(store.get('a')?.name).toBe('A batched');
    });

    test('filter reprojection preserves current row value and agrees with structural read', async () => {
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

        const visibleRow = store.items.find(item => store.getKey(item) === 'a');
        expect(visibleRow?.name).toBe('A batched');
        expect(store.get('a')?.name).toBe('A batched');

        store.clearFilters();
        const visibleAfterClear = store.items.find(item => store.getKey(item) === 'a');
        expect(visibleAfterClear?.name).toBe('A batched');
        expect(store.get('a')?.name).toBe('A batched');
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

        expect(store.getCount()).toBe(2);
        expect(store.getChildren('root').map(item => store.getKey(item))).toEqual(['a', 'b']);
        expect(store.get('a').siblingCount).toBe(2);
        expect(store.get('a').name).toBe('A readded 3');
    });

    test('same-object re-add and hydrated-record paths retain their behavior while raw batch edits hydrate no row', async () => {
        store = Neo.create(TreeStore, {
            autoInitRecords: false,
            model          : NodeModel,
            data           : [
                {id: 'a', name: 'A', score: 1},
                {id: 'b', name: 'B', score: 2}
            ]
        });

        await store.ready();

        const rawNode = store.items.find(item => store.getKey(item) === 'a');
        expect(RecordFactory.isRecord(rawNode)).toBe(false);

        store.add(rawNode, false);
        expect(store.getCount()).toBe(2);

        store.updateRows([{key: 'a', values: {name: 'A updated'}}]);
        const rawAfterBatch = store.items.find(item => store.getKey(item) === 'a');
        expect(RecordFactory.isRecord(rawAfterBatch)).toBe(false);
        expect(rawAfterBatch.name).toBe('A updated');
    });
});
