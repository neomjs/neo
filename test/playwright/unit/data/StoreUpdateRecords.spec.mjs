/**
 * @summary Whole-record batches return the row-writer result and reach rows held by a collapsed tree.
 * @see Neo.data.Store#updateRecords
 * @see https://github.com/neomjs/neo/issues/20974
 */
import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'StoreUpdateRecordsReviewTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Model          from '../../../../src/data/Model.mjs';
import RecordFactory  from '../../../../src/data/RecordFactory.mjs';
import Store          from '../../../../src/data/Store.mjs';
import TreeModel      from '../../../../src/data/TreeModel.mjs';
import TreeStore      from '../../../../src/data/TreeStore.mjs';

test.describe('Store#updateRecords (#20974)', () => {
    let store;

    test.afterEach(() => store?.destroy());

    test('returns missing keys from the row writer without hydrating Turbo Mode rows', async () => {
        store = Neo.create(Store, {
            autoInitRecords: false,
            model          : {module: Model, fields: [
                {name: 'id', type: 'Integer'},
                {name: 'score', type: 'Integer'}
            ]},
            data: [{id: 1, score: 1}]
        });
        await store.ready();

        const result = store.updateRecords([{id: '1', score: 10}, {id: 99, score: 99}]);

        expect(result).toEqual({errors: [], missing: [99]});
        expect(store._items[0].score).toBe(10);
        expect(RecordFactory.isRecord(store._items[0])).toBe(false)
    });

    test('an inherited whole-record batch writes a child under a collapsed parent', async () => {
        store = Neo.create(TreeStore, {
            autoInitRecords: false,
            model          : {module: TreeModel, fields: [
                {name: 'id', type: 'String'},
                {name: 'name', type: 'String'}
            ]},
            data: [
                {id: 'p', name: 'Parent', isLeaf: false, collapsed: true},
                {id: 'c', parentId: 'p', name: 'Child'}
            ]
        });
        await store.ready();

        const events = [];
        store.on('rowsChange', ({keys}) => events.push(keys));

        expect(store._items.map(row => row.id)).toEqual(['p']);
        expect(store.updateRecords([{id: 'c', name: 'Edited'}])).toEqual({errors: [], missing: []});
        expect(events).toEqual([['c']]);
        expect(store._items.map(row => row.id)).toEqual(['p']);

        await store.expand('p');
        const child = store._items.find(row => row.id === 'c');

        expect(child.name).toBe('Edited');
        expect(RecordFactory.isRecord(child)).toBe(false)
    })
});
