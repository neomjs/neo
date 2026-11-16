/**
 * @file test/playwright/unit/grid/column/AnimatedChange.spec.mjs
 * @summary An animatedChange column follows its grid's store: set after construction, swapped, or removed.
 *
 * The column marks a cell when its store publishes `recordChange`. Each arm replaces the column's `mark` with a
 * recorder, so the recorded ids name the edits that reached the column. An edit that must go unheard is followed by
 * one on another record that must be heard: the marks come in the order the edits came, so a wrongly heard edit shows
 * up in the polled list.
 *
 * @see Neo.grid.column.AnimatedChange
 * @see Neo.grid.Container#afterSetStore
 */

import {setup} from '../../../setup.mjs';

const appName = 'AnimatedChangeColumnTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import GridContainer   from '../../../../../src/grid/Container.mjs';
import Store           from '../../../../../src/data/Store.mjs';

const grids  = [],
      stores = [];

test.afterEach(() => {
    grids.splice(0).forEach(grid => grid.destroy());
    stores.splice(0).forEach(store => store.destroy())
});

/**
 * @param {Number[]} ids The ids of the store's records, which name the edits in the recorded lookups
 * @returns {Neo.data.Store}
 */
function createStore(...ids) {
    const store = Neo.create(Store, {
        data       : ids.map(id => ({id, load: 0, price: 0})),
        keyProperty: 'id',
        model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'load', type: 'Number'}, {name: 'price', type: 'Number'}]}
    });

    stores.push(store);

    return store
}

/**
 * @param {String} type      The type of the animated column
 * @param {String} dataField The field the animated column shows
 * @param {Object} [config]  Further grid configs, e.g. the store
 * @returns {Neo.grid.Container}
 */
function createGrid(type, dataField, config) {
    const grid = Neo.create(GridContainer, {
        columns: [{dataField: 'id', text: 'Id'}, {dataField, text: dataField, type}],
        ...config
    });

    grids.push(grid);

    return grid
}

/**
 * Replaces the animated column's `mark` with a recorder: an edit that reached the column marks the edited record.
 * @param {Neo.grid.Container} grid
 * @param {String}             dataField The field of the animated column
 * @returns {Number[]} The id of each record marked, in order
 */
function recordMarks(grid, dataField) {
    const ids = [];

    grid.columns.get(dataField).mark = record => {ids.push(record.id)};

    return ids
}

/**
 * Edits one record of the store.
 * @param {Neo.data.Store} store
 * @param {Number}         id
 * @param {String}         field
 */
function edit(store, id, field) {
    const record = store.get(id);

    record.set({[field]: record[field] + 1})
}

test.describe('Neo.grid.column.AnimatedChange', () => {
    test('a grid created without a store constructs, and its column hears a store set later', async () => {
        let grid;

        expect(() => {grid = createGrid('animatedChange', 'load')}).not.toThrow();

        const lookups = recordMarks(grid, 'load'),
              other   = createStore(9),
              store   = createStore(1);

        // A store the grid never holds reaches no column
        edit(other, 9, 'load');

        grid.store = store;

        edit(store, 1, 'load');
        await expect.poll(() => lookups).toEqual([1])
    });

    test('a store swap moves the column to the new store', async () => {
        const first   = createStore(1),
              second  = createStore(2),
              grid    = createGrid('animatedChange', 'load', {store: first}),
              lookups = recordMarks(grid, 'load');

        // Control: the column hears the store the grid was created with
        edit(first, 1, 'load');
        await expect.poll(() => lookups).toEqual([1]);

        grid.store = second;

        edit(first, 1, 'load');
        edit(second, 2, 'load');
        await expect.poll(() => lookups).toEqual([1, 2])
    });

    test('a store set to null leaves the column without a store, and a store set again is heard', async () => {
        const store   = createStore(1, 3),
              grid    = createGrid('animatedChange', 'load', {store}),
              lookups = recordMarks(grid, 'load');

        // Control: the column hears the grid's store
        edit(store, 1, 'load');
        await expect.poll(() => lookups).toEqual([1]);

        grid.store = null;

        edit(store, 1, 'load');

        grid.store = store;

        edit(store, 3, 'load');
        await expect.poll(() => lookups).toEqual([1, 3])
    });

    test('a locked column reads its cells from the body that renders them', () => {
        const grid = Neo.create(GridContainer, {
            columns: [
                {dataField: 'load',  locked: 'start', text: 'Load', type: 'animatedChange'},
                {dataField: 'price', text: 'Price', type: 'animatedChange'},
                {dataField: 'id',    text: 'Id'}
            ],
            store: createStore(1)
        });

        grids.push(grid);

        expect(grid.bodyStart, 'control: the grid has a locked-start body').toBeTruthy();
        expect(grid.columns.get('load').getBody()).toBe(grid.bodyStart);
        expect(grid.columns.get('price').getBody(), 'control: a center column reads the center body').toBe(grid.body)
    });

    test('a column without a store config does not gain one', () => {
        const first    = createStore(1),
              second   = createStore(2),
              grid     = createGrid('animatedChange', 'load', {store: first}),
              animated = grid.columns.get('load'),
              plain    = grid.columns.get('id');

        grid.store = second;

        // Control: the column which declares the config holds the grid's new store
        expect(animated.store?.id).toBe(second.id);
        expect('store' in plain).toBe(false)
    })
});

test.describe('Neo.grid.column.AnimatedCurrency', () => {
    test('inherits the store binding: a store set later is heard, a swap moves it', async () => {
        let grid;

        expect(() => {grid = createGrid('animatedCurrency', 'price')}).not.toThrow();

        const lookups = recordMarks(grid, 'price'),
              first   = createStore(1),
              second  = createStore(2);

        grid.store = first;

        // Control: the column hears the store set after construction
        edit(first, 1, 'price');
        await expect.poll(() => lookups).toEqual([1]);

        grid.store = second;

        // The edit to the old store records nothing, the edit to the new one does
        edit(first, 1, 'price');
        edit(second, 2, 'price');
        await expect.poll(() => lookups).toEqual([1, 2])
    })
});
