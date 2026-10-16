/**
 * @file test/playwright/unit/collection/SortByIndexField.spec.mjs
 * @summary A sort property may be named `index`: the sort reorders the items by it and keeps every one of them.
 *
 * `Neo.collection.Base#doSort` sorts through a map that remembers each item's position. A sort property sharing the
 * name of that position key used to overwrite it, and the map back returned `undefined` for each item.
 *
 * @see Neo.collection.Base#doSort
 */
import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'CollectionSortByIndexFieldTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Collection     from '../../../../src/collection/Base.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';

const items = () => [
    {id: 1, group: 'b', index: 2},
    {id: 2, group: 'a', index: 0},
    {id: 3, group: 'b', index: undefined},
    {id: 4, group: 'a', index: 3},
    {id: 5, group: 'b', index: 1}
];

test.describe('Neo.collection.Base: sorting by a field named index', () => {
    test('a Collection keeps every item and orders them by index, in both directions and as a second sorter', () => {
        const collection = Neo.create(Collection, {items: items(), sorters: [{direction: 'ASC', property: 'index'}]});

        // undefined sorts last in either direction
        expect(collection.getRange().map(item => item?.id)).toEqual([2, 5, 1, 4, 3]);

        collection.sorters = [{direction: 'DESC', property: 'index'}];
        expect(collection.getRange().map(item => item?.id)).toEqual([4, 1, 5, 2, 3]);

        collection.sorters = [{direction: 'ASC', property: 'group'}, {direction: 'DESC', property: 'index'}];
        expect(collection.getRange().map(item => item?.id)).toEqual([4, 2, 1, 5, 3]);

        collection.destroy()
    });

    test('a Store sorting raw items by an index field keeps every item', () => {
        const store = Neo.create(Store, {
            autoInitRecords: false,
            data           : items(),
            keyProperty    : 'id',
            model          : {
                module: Model,
                fields: [{name: 'id', type: 'Integer'}, {name: 'group', type: 'String'}, {name: 'index', type: 'Integer'}]
            }
        });

        store.sort({direction: 'DESC', property: 'index'});

        expect(store.count).toBe(5);
        expect(store.items.map(item => item?.id)).toEqual([4, 1, 5, 2, 3]);

        store.destroy()
    });
});
