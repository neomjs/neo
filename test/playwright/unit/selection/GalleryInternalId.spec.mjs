
import {setup} from '../../setup.mjs';

const appName = 'GalleryInternalIdTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Collection         from '../../../../src/collection/Base.mjs';
import Gallery            from '../../../../src/component/Gallery.mjs';
import List               from '../../../../src/list/Base.mjs';
import Store              from '../../../../src/data/Store.mjs';
import Model              from '../../../../src/data/Model.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Neo.component.Gallery InternalId Support', () => {
    let gallery, store, testRun = 0;

    // Define unique classes for this test file
    class TestModel extends Model {
        static config = {
            className: 'Test.Unit.Gallery.InternalId.TestModel',
            fields   : [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}]
        }
    }
    TestModel = Neo.setupClass(TestModel);

    class TestStore extends Store {
        static config = {
            className  : 'Test.Unit.Gallery.InternalId.TestStore',
            model      : TestModel,
            keyProperty: 'id'
        }
    }
    TestStore = Neo.setupClass(TestStore);

    test.beforeEach(async () => {
        testRun++;

        store = Neo.create(TestStore, {
            autoInitRecords: true,
            data           : [
                {id: 1, name: 'Item 1'},
                {id: 2, name: 'Item 2'},
                {id: 3, name: 'Item 3'}
            ]
        });

        gallery = Neo.create(Gallery, {
            appName,
            id           : 'test-gallery-' + testRun,
            store,
            useInternalId: true,
            amountRows   : 1,
            itemHeight   : 100,
            itemWidth    : 100,
            maxItems     : 10
        });

        await gallery.initVnode();

        // Manually trigger items creation
        gallery.createItems();
        await gallery.timeout(50);

        gallery.mounted = true;
    });

    test.afterEach(() => {
        gallery?.destroy();
        store?.destroy();
    });

    test('Selection change should work with internalId', async () => {
        const record     = store.getAt(1); // Item 2
        const internalId = store.getInternalId(record);

        expect(internalId).toContain('neo-record');

        // This simulates the call that happens after selection model change
        // It relies on finding the index of the record
        // If it fails, index defaults to 0, which would be wrong (should be 1)

        // Spy on getCameraTransformForCell to check if correct index is passed
        let   calledIndex          = -1;
        const originalGetTransform = gallery.getCameraTransformForCell;
        gallery.getCameraTransformForCell = (index) => {
            calledIndex = index;
            return originalGetTransform.call(gallery, index);
        };

        await gallery.onSelectionChange([internalId]);

        expect(calledIndex).toBe(1);
    });

    test('Navigation should work with internalId', async () => {
        const record1     = store.getAt(0);
        const internalId1 = store.getInternalId(record1);

        gallery.selectionModel.select(internalId1);

        // Simulate Right Arrow (Next Column/Item)
        // Since we have 3 items and amountRows=1, they are side by side?
        // gallery.orderByRow defaults to false.
        // If orderByRow=false, items fill columns first (vertical).
        // With amountRows=1, it's 1 row. So 3 columns.
        // Wait, default amountRows=3. I set it to 1.
        // If orderByRow=false (default):
        // Col 0: Item 0
        // Col 1: Item 1
        // Col 2: Item 2

        // onNavKeyColumn(1) should go to next column -> Item 1

        gallery.selectionModel.onNavKeyColumn(1);

        const selection   = gallery.selectionModel.items[0];
        const record2     = store.getAt(1);
        const internalId2 = store.getInternalId(record2);

        expect(selection).toBe(internalId2);
    });

    test('List selection should resolve collection objects without isRecord', async () => {
        let collection, list;

        try {
            collection = Neo.create(Collection, {
                items: [
                    {value: '09:00', text: '09:00'},
                    {value: '10:00', text: '10:00'}
                ],
                keyProperty: 'value'
            });

            list = Neo.create(List, {
                appName,
                autoDestroyStore: false,
                displayField    : 'text',
                id              : 'test-list-collection-' + testRun,
                selectionModel  : {},
                store           : collection,
                useInternalId   : false
            });

            await list.initVnode();
            list.createItems();
            await list.timeout(50);

            list.mounted = true;

            const
                item   = collection.items[0],
                itemId = list.getItemId(item.value);

            expect(item.isRecord).toBeUndefined();

            list.selectionModel.select(item);

            expect(list.selectionModel.items).toEqual([itemId]);
            expect(list.getVdomChild(itemId)['aria-selected']).toBe(true);

            list.selectionModel.deselect(item);

            expect(list.selectionModel.items).toEqual([]);
            expect(list.getVdomChild(itemId)['aria-selected']).toBeUndefined();
        } finally {
            list?.destroy();
            collection?.destroy()
        }
    });
});
