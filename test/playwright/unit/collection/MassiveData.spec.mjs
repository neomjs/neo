import {setup} from '../../setup.mjs';

const appName = 'MassiveDataTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Collection      from '../../../../src/collection/Base.mjs';
import Model           from '../../../../src/data/Model.mjs';
import Store           from '../../../../src/data/Store.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';

/**
 * @summary Tests for massive data handling within Neo.data.Store and Neo.collection.Base.
 *
 * This suite focuses on performance-critical scenarios involving large datasets (10k+ records).
 * It verifies:
 * 1.  Data integrity when adding, filtering, and clearing large datasets.
 * 2.  Correct behavior of `allItems` (the unfiltered source) when operations are performed on a filtered view.
 * 3.  Prevention of data retention/corruption when clearing a filtered store and reloading data.
 * 4.  Consistency of items between the filtered view (`store.count`) and the source (`store.allItems.count`).
 */
test.describe.serial('Massive Data Store', () => {

    test('Add 10k items, filter, clear, add again', () => {
        const store = Neo.create(Store, {
            autoInitRecords: false, // Turbo Mode
            keyProperty    : 'id',
            model          : Model
        });

        const generateData = (count) => {
            const data = [];
            for (let i = 0; i < count; i++) {
                data.push({
                    id       : i,
                    firstname: 'First' + i,
                    lastname : 'Last' + i,
                    age      : i % 100
                });
            }
            return data;
        };

        // 1. Add 10k items (triggers > 5000 optimization in splice)
        store.add(generateData(10000));
        expect(store.count).toBe(10000);
        expect(store.items[9999].id).toBe(9999);

        // 2. Filter the store
        store.filters = [{
            property: 'firstname',
            operator: 'like',
            value   : 'First1'
        }];

        // Verify filtered state
        expect(store.count).toBeGreaterThan(0);
        expect(store.count).toBeLessThan(10000);
        expect(store.isFiltered()).toBe(true);
        expect(store.allItems.count).toBe(10000);

        // 3. Clear the store
        // This must clear both the filtered view AND the allItems source
        store.clear();
        expect(store.count).toBe(0);

        // 4. Add 10k items again (Simulate a reload)
        const newItems = generateData(10000);
        store.add(newItems);

        // 5. Verify integrity
        // The filter is still active, so count should be the same as step 2 (~1111)
        expect(store.count).toBeGreaterThan(0);
        expect(store.count).toBeLessThan(10000);

        // allItems should contain exactly the new 10k items.
        // If the previous clear() failed to wipe allItems, this would be 20k or corrupted.
        expect(store.allItems.count).toBe(10000);

        // Sanity check for data corruption
        let undefinedCount = 0;
        store.allItems.items.forEach(item => {
            if (item === undefined) undefinedCount++;
        });
        expect(undefinedCount).toBe(0);
    });

    test('Adding to filtered collection data loss check', () => {
        const collection = Neo.create(Collection, {
            keyProperty: 'id',
            items: [
                {id: 1, val: 'a'},
                {id: 2, val: 'b'}
            ]
        });

        // 1. Apply Filter
        collection.filters = [{
            property: 'val',
            value   : 'a'
        }];

        expect(collection.count).toBe(1);
        expect(collection.allItems.count).toBe(2);

        // 2. Add item that DOES NOT match the current filter
        collection.add({id: 3, val: 'b'});

        // Collection count should stay 1 (as the new item is filtered out)
        expect(collection.count).toBe(1);

        // allItems should now have 3 items (including the hidden new one)
        expect(collection.allItems.count).toBe(3);
    });
});
