import {setup} from '../../setup.mjs';

const appName = 'CollectionSpliceReplaceAllTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Collection      from '../../../../src/collection/Base.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';

const items = (prefix, count) => Array.from({length: count}, (_, i) => ({id: `${prefix}${i}`}));

/**
 * @summary `splice(0, count, items)` removes everything and adds `items` in one call, through the full-clear
 * optimization. The add path must write into the new array, not the removed one, on both sides of its
 * large-array threshold (more than 5,000 added items).
 */
test.describe('Neo.collection.Base splice(0, count, items)', () => {
    let collection;

    test.afterEach(() => {
        collection?.destroy();
        collection = null
    });

    test('leaves exactly the added items and reports the old ones as removed', () => {
        collection = Neo.create(Collection, {items: items('old', 3)});

        const {addedItems, removedItems} = collection.splice(0, collection.count, items('new', 2));

        expect(collection.count).toBe(2);
        expect(collection.items.map(item => item.id)).toEqual(['new0', 'new1']);
        expect(collection.get('new1').id).toBe('new1');
        expect(collection.get('old0')).toBe(null);
        expect(addedItems.map(item => item.id)).toEqual(['new0', 'new1']);
        expect(removedItems.map(item => item.id)).toEqual(['old0', 'old1', 'old2'])
    });

    test('above the large-array threshold the removed items stay removed', () => {
        collection = Neo.create(Collection, {items: items('old', 3)});

        collection.splice(0, collection.count, items('new', 5001));

        expect(collection.count).toBe(5001);
        expect(collection.items[0].id).toBe('new0');
        expect(collection.items.some(item => item.id.startsWith('old'))).toBe(false)
    })
});
