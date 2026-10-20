/**
 * @file test/playwright/unit/collection/FilterKeepsSort.spec.mjs
 * @summary A filter change keeps the collection in sorter order: refining a filter, and clearing it to `null`.
 *
 * The first filter creates the unfiltered projection (`allItems`) in the order the items have at that moment, and a
 * later sort reorders only the filtered items. An active filter then rebuilds the items from `allItems`, so
 * `filter()` has to re-apply the sorters on that path too, as it already does when the last filter goes away.
 *
 * @see Neo.collection.Base#filter
 */
import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'CollectionFilterKeepsSortTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Collection     from '../../../../src/collection/Base.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';

// The rows of examples/grid/animatedRowSorting, in their insertion (id) order
const people = () => [
    {firstname: 'Max',     id: 1},
    {firstname: 'Paul',    id: 2},
    {firstname: 'Sam',     id: 3},
    {firstname: 'William', id: 4},
    {firstname: 'Carol',   id: 5},
    {firstname: 'Amanda',  id: 6},
    {firstname: 'Sarah',   id: 7}
];

const
    names  = collection => collection.getRange().map(item => item.firstname),
    sorted = ['Amanda', 'Carol', 'Max', 'Paul', 'Sam', 'Sarah', 'William'];

test.describe('Neo.collection.Base: a filter change keeps the sorter order', () => {
    test('a Collection filtered first and sorted second stays sorted when the filter is refined and cleared', () => {
        const collection = Neo.create(Collection, {
            filters: [{operator: 'like', property: 'firstname', value: null}],
            items  : people(),
            sorters: [{direction: 'ASC', property: 'id'}]
        });

        collection.getFilter('firstname').value = 'a';
        collection.sorters = [{direction: 'DESC', property: 'firstname'}];
        expect(names(collection)).toEqual([...sorted].reverse());

        collection.getFilter('firstname').value = 'am';
        expect(names(collection)).toEqual(['William', 'Sam', 'Amanda']);

        collection.getFilter('firstname').value = null;
        expect(names(collection)).toEqual([...sorted].reverse());

        collection.destroy()
    });

    test('a Store filtered first and sorted by a header click keeps the order when the filter is refined and cleared', () => {
        // The shape of the example's store: an active, null-valued filter and an id sorter from the start
        const store = Neo.create(Store, {
            data   : people(),
            filters: [{operator: 'like', property: 'firstname', value: null}],
            model  : {
                module: Model,
                fields: [{name: 'id', type: 'Integer'}, {name: 'firstname', type: 'String'}]
            },
            sorters: [{direction: 'ASC', property: 'id'}]
        });

        store.getFilter('firstname').value = 'a';
        store.sort({direction: 'ASC', property: 'firstname'});
        expect(names(store)).toEqual(sorted);

        store.getFilter('firstname').value = 'am';
        expect(names(store)).toEqual(['Amanda', 'Sam', 'William']);

        store.getFilter('firstname').value = null;
        expect(names(store)).toEqual(sorted);

        store.destroy()
    });

    test('without sorters, a filter keeps the insertion order', () => {
        const collection = Neo.create(Collection, {
            filters: [{operator: 'like', property: 'firstname', value: null}],
            items  : people()
        });

        collection.getFilter('firstname').value = 'am';
        expect(names(collection)).toEqual(['Sam', 'William', 'Amanda']);

        collection.destroy()
    })
});
