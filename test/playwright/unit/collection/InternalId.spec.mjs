import {setup} from '../../setup.mjs';

const appName = 'CollectionInternalIdTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Collection     from '../../../../src/collection/Base.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';

class InternalIdCollection extends Collection {
    static config = {
        className      : 'Test.InternalIdCollection',
        trackInternalId: true
    }

    getInternalKey(item) {
        return item.internalId
    }
}

InternalIdCollection = Neo.setupClass(InternalIdCollection);

test.describe('Neo.collection.Base internalIdMap', () => {
    let collection;

    test('trackInternalId: false (default)', () => {
        collection = Neo.create(Collection, {
            items: [{id: 1, internalId: 'i1'}]
        });

        expect(collection.trackInternalId).toBe(false);
        expect(collection.internalIdMap).toBeNull();
        expect(collection.getByInternalId('i1')).toBeNull();
    });

    test('trackInternalId: true', () => {
        collection = Neo.create(InternalIdCollection, {
            items: [
                {id: 1, internalId: 'i1'},
                {id: 2, internalId: 'i2'}
            ]
        });

        expect(collection.trackInternalId).toBe(true);
        expect(collection.internalIdMap).toBeInstanceOf(Map);
        expect(collection.internalIdMap.size).toBe(2);

        expect(collection.getByInternalId('i1')).toEqual({id: 1, internalId: 'i1'});
        expect(collection.getByInternalId('i2')).toEqual({id: 2, internalId: 'i2'});
        expect(collection.getByInternalId('i3')).toBeNull();
    });

    test('Add items updates map', () => {
        collection = Neo.create(InternalIdCollection);

        collection.add({id: 1, internalId: 'i1'});

        expect(collection.getByInternalId('i1')).toBeDefined();
        expect(collection.internalIdMap.size).toBe(1);
    });

    test('Remove items updates map', () => {
        collection = Neo.create(InternalIdCollection, {
            items: [{id: 1, internalId: 'i1'}]
        });

        collection.remove(1);

        expect(collection.getByInternalId('i1')).toBeNull();
        expect(collection.internalIdMap.size).toBe(0);
    });

    test('Splice updates map', () => {
        collection = Neo.create(InternalIdCollection, {
            items: [
                {id: 1, internalId: 'i1'},
                {id: 2, internalId: 'i2'}
            ]
        });

        // Remove i1, Add i3
        collection.splice(0, 1, [{id: 3, internalId: 'i3'}]);

        expect(collection.getByInternalId('i1')).toBeNull();
        expect(collection.getByInternalId('i2')).toBeDefined();
        expect(collection.getByInternalId('i3')).toBeDefined();
        expect(collection.internalIdMap.size).toBe(2);
    });

    test('Filter clears and repopulates map', () => {
        collection = Neo.create(InternalIdCollection, {
            items: [
                {id: 1, internalId: 'i1', val: 'a'},
                {id: 2, internalId: 'i2', val: 'b'}
            ]
        });

        collection.filters = [{
            property: 'val',
            value   : 'a'
        }];

        expect(collection.count).toBe(1);
        expect(collection.getByInternalId('i1')).toBeDefined();
        expect(collection.getByInternalId('i2')).toBeNull(); // Should be gone from map
        expect(collection.internalIdMap.size).toBe(1);

        collection.clearFilters();

        expect(collection.count).toBe(2);
        expect(collection.getByInternalId('i1')).toBeDefined();
        expect(collection.getByInternalId('i2')).toBeDefined();
        expect(collection.internalIdMap.size).toBe(2);
    });

    test('Clear clears map', () => {
        collection = Neo.create(InternalIdCollection, {
            items: [{id: 1, internalId: 'i1'}]
        });

        collection.clear();

        expect(collection.internalIdMap.size).toBe(0);
    });

    test('Destroy clears map', () => {
        collection = Neo.create(InternalIdCollection, {
            items: [{id: 1, internalId: 'i1'}]
        });

        const map = collection.internalIdMap;
        collection.destroy();

        expect(map.size).toBe(0);
        // Reactive configs are not deleted on destroy (not enumerable), but the map content is cleared.
        expect(collection.internalIdMap.size).toBe(0);
    });
});
