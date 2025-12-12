import {setup} from '../../setup.mjs';

const appName = 'StoreTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Model          from '../../../../src/data/Model.mjs';
import RecordFactory  from '../../../../src/data/RecordFactory.mjs';
import Store          from '../../../../src/data/Store.mjs';

/**
 * @summary Tests for Neo.data.Store
 */
test.describe.serial('Neo.data.Store', () => {
    let store;

    test.beforeEach(() => {
        store = Neo.create(Store, {
            keyProperty: 'id',
            model: {
                module: Model,
                fields: [
                    {name: 'id',   type: 'String'},
                    {name: 'name', type: 'String'}
                ]
            },
            items: [
                {id: '1', name: 'Item 1'},
                {id: '2', name: 'Item 2'}
            ]
        });
    });

    test('Add items (init=true by default)', () => {
        const result = store.add({id: '3', name: 'Item 3'});

        expect(store.count).toBe(3);
        expect(result.length).toBe(1);
        expect(RecordFactory.isRecord(result[0])).toBe(true);
        expect(result[0].name).toBe('Item 3');
    });

    test('Add items (init=false)', () => {
        const result = store.add({id: '4', name: 'Item 4'}, false);

        expect(store.count).toBe(3); // count is 3 because we added 1 to the initial 2
        expect(result.length).toBe(1);
        expect(RecordFactory.isRecord(result[0])).toBe(false);
        expect(result[0].name).toBe('Item 4');
    });

    test('initRecord with raw object', () => {
        const raw = {id: '5', name: 'Item 5'};
        // Manually add raw item first so it's in the store (initRecord retrieves it)
        store.add(raw, false);
        
        const record = store.initRecord(raw);

        expect(RecordFactory.isRecord(record)).toBe(true);
        expect(record.name).toBe('Item 5');
        // Verify it replaced the raw item in the store
        expect(store.get('5')).toBe(record);
    });

    test('initRecord with existing record (Optimization)', () => {
        const raw = {id: '6', name: 'Item 6'};
        store.add(raw, false);
        const record = store.initRecord(raw); // Create the record

        // Now call initRecord again with the record instance
        const sameRecord = store.initRecord(record);

        expect(sameRecord).toBe(record);
        expect(RecordFactory.isRecord(sameRecord)).toBe(true);
    });
});
