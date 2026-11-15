import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'TreeStoreRawBatchReprojectionTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import TreeStore      from '../../../../src/data/TreeStore.mjs';
import TreeModel      from '../../../../src/data/TreeModel.mjs';

class BatchNode extends TreeModel {
    static config = {
        className: 'Test.Unit.Data.TreeStoreRawBatchReprojection.Node',
        fields   : [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}, {name: 'score', type: 'Integer'}]
    }
}

const NodeModel = Neo.setupClass(BatchNode);

/**
 * @summary A raw row batch survives re-add and reprojection.
 *
 * In Turbo Mode (`autoInitRecords: false`) a re-add replaces the Structural Layer's node while the visible layer
 * keeps its own object for that key. `updateRows()` then writes the visible raw row in place; a later reprojection
 * (a sorter or filter change) re-projects from the Structural Layer and must not restore the older value: the
 * accepted batch stays authoritative, with no intervening `get()` to heal the identity split.
 */
test.describe('Neo.data.TreeStore: a raw row batch survives re-add and reprojection', () => {
    let store;

    const data = () => [
        {id: 'a', name: 'A', score: 1},
        {id: 'b', name: 'B', score: 2}
    ];

    test.afterEach(() => {
        store?.destroy();
        store = null
    });

    test('the batch survives a sorter reprojection', async () => {
        store = Neo.create(TreeStore, {autoInitRecords: false, model: NodeModel, data: data()});

        await store.ready();

        store.add({id: 'a', name: 'A readded', score: 1}, false);

        store.updateRows([{key: 'a', values: {name: 'A batched'}}]);

        // the raw visible row says 'A batched'; no get() here

        store.sorters = [{property: 'score', reapplyOnRecordChange: true}];

        expect(store.get('a').name).toBe('A batched')
    });

    test('the batch survives a filter reprojection', async () => {
        store = Neo.create(TreeStore, {autoInitRecords: false, model: NodeModel, data: data()});

        await store.ready();

        store.add({id: 'a', name: 'A readded', score: 1}, false);
        store.updateRows([{key: 'a', values: {name: 'A batched'}}]);

        store.filters = [item => item.name !== 'gone'];

        expect(store.get('a').name).toBe('A batched');

        store.filters = [];
        store.sorters = [{property: 'score'}];

        expect(store.get('a').name).toBe('A batched')
    });

    test('a repeated re-add keeps one hierarchy entry, and a later batch survives too', async () => {
        store = Neo.create(TreeStore, {autoInitRecords: false, model: NodeModel, data: data()});

        await store.ready();

        store.add({id: 'a', name: 'A readded', score: 1}, false);
        store.updateRows([{key: 'a', values: {name: 'A batched'}}]);
        store.add({id: 'a', name: 'A readded again', score: 1}, false);

        // one hierarchy entry per key, and the re-added value is the current one after a reprojection
        store.sorters = [{property: 'score'}];

        const row = store.get('a');

        expect(store.items.filter(node => store.getKey(node) === 'a').length).toBe(1);
        expect(row.name).toBe('A readded again');
        expect(row.siblingCount).toBe(2);

        // a batch after the repeated re-add survives as well
        store.updateRows([{key: 'a', values: {name: 'A batched 2'}}]);
        store.sorters = [{property: 'name'}];

        expect(store.get('a').name).toBe('A batched 2')
    });

    test('control: get() before the reprojection still heals (masking control)', async () => {
        store = Neo.create(TreeStore, {autoInitRecords: false, model: NodeModel, data: data()});

        await store.ready();

        store.add({id: 'a', name: 'A readded', score: 1}, false);
        store.updateRows([{key: 'a', values: {name: 'A batched'}}]);

        expect(store.get('a').name).toBe('A batched');

        store.sorters = [{property: 'score'}];

        expect(store.get('a').name).toBe('A batched')
    })
});
