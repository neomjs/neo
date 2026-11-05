/**
 * @file test/playwright/unit/grid/HeaderGroups.spec.mjs
 * @summary Pins how `Neo.grid.Container` resolves `{text, columns: [...]}` header groups: the grouped columns join
 * the grid in place and in order, each carrying its group as `headerGroup`, the group's `locked` decides their
 * region, and the app's declaration stays intact, so setting or replacing `columns` regroups.
 *
 * @see Neo.grid.Container#flattenColumns
 */
import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridHeaderGroupsTest',
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import GridContainer  from '../../../../src/grid/Container.mjs';
import Store          from '../../../../src/data/Store.mjs';

// Imported for their side effects: the vdom rig `initVnode()` needs, and the instance manager `Neo.get` needs.
import '../../../../src/manager/Instance.mjs';
import '../../../../src/vdom/Helper.mjs';
import '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

const appName = 'GridHeaderGroupsTest',
      fields  = ['a', 'b', 'jan', 'feb', 'first', 'last'];

/**
 * @returns {Neo.data.Store}
 */
const createStore = () => Neo.create(Store, {
    keyProperty: 'id',
    data       : [{id: 1, a: 'a1', b: 'b1', jan: 1, feb: 2, first: 'Ada', last: 'Lovelace'}],
    model      : {fields: [{name: 'id', type: 'Integer'}, ...fields.map(name => ({name}))]}
});

/**
 * @param {Neo.data.Store} store
 * @param {Object[]} columns
 * @param {Object} [config]
 * @returns {Promise<Neo.grid.Container>}
 */
const createGrid = async (store, columns, config={}) => {
    const grid = Neo.create(GridContainer, {appName, columns, height: 300, rowHeight: 40, store, useInternalId: false, width: 600, ...config});

    await grid.initVnode();
    grid.mounted = true;
    await grid.timeout(50);

    return grid
};

/**
 * @param {Neo.grid.column.Base[]} columns
 * @returns {Array<String|null>} Each column's group text, `null` outside a group
 */
const groupTexts = columns => columns.map(column => column.headerGroup?.text ?? null);

test.describe('Neo.grid.Container header groups', () => {
    let grid, store;

    test.afterEach(() => {
        grid?.destroy();
        store?.destroy();
        grid = store = null
    });

    test('a group becomes its columns, in place and in order, each under its group', async () => {
        store = createStore();
        grid  = await createGrid(store, [
            {dataField: 'a', text: 'A'},
            {text: 'Q1', columns: [{dataField: 'jan', text: 'Jan'}, {dataField: 'feb', text: 'Feb'}]},
            {dataField: 'b', text: 'B'}
        ]);

        const [a, jan, feb, b] = grid.columns.items;

        expect(grid.columns.items.map(column => column.dataField)).toEqual(['a', 'jan', 'feb', 'b']);
        expect(groupTexts(grid.columns.items)).toEqual([null, 'Q1', 'Q1', null]);
        expect(feb.headerGroup.id).toBe(jan.headerGroup.id);
        expect(a.headerGroup).toBeNull();
        expect(b.headerGroup).toBeNull();

        // The leaf header row is today's: one button per column, none for the group
        expect(grid.headerToolbar.items.map(button => button.dataField)).toEqual(['a', 'jan', 'feb', 'b'])
    });

    test('the group\'s locked decides the region of all of its columns', async () => {
        store = createStore();
        grid  = await createGrid(store, [
            {dataField: 'a'},
            {text: 'Name', locked: 'start', columns: [{dataField: 'first'}, {dataField: 'last', locked: 'end'}]},
            {text: 'Q1', columns: [{dataField: 'jan', locked: 'start'}, {dataField: 'feb'}]}
        ]);

        expect(grid.lockedStartColumns.map(column => column.dataField)).toEqual(['first', 'last']);
        expect(grid.centerColumns     .map(column => column.dataField)).toEqual(['a', 'jan', 'feb']);
        expect(grid.lockedEndColumns).toHaveLength(0)
    });

    test('columnDefaults reach the grouped columns, and the group is no column of its own', async () => {
        store = createStore();
        grid  = await createGrid(store, [
            {dataField: 'a'},
            {text: 'Q1', columns: [{dataField: 'jan'}, {dataField: 'feb'}]}
        ], {columnDefaults: {width: 120}});

        expect(grid.columns.count).toBe(3);
        expect(grid.columns.items.map(column => column.width)).toEqual([120, 120, 120])
    });

    test('the declared groups stay intact, so setting them again or replacing them regroups', async () => {
        const declared = [
            {text: 'Q1', columns: [{dataField: 'jan'}, {dataField: 'feb'}]},
            {dataField: 'b'}
        ];

        store = createStore();
        grid  = await createGrid(store, declared);

        expect(declared[0].columns).toHaveLength(2);
        expect(declared[0].columns[0].headerGroup).toBeUndefined();

        grid.columns = declared;
        await grid.timeout(20);

        expect(groupTexts(grid.columns.items)).toEqual(['Q1', 'Q1', null]);

        grid.columns = [{dataField: 'b'}, {text: 'Pair', columns: [{dataField: 'jan'}, {dataField: 'feb'}]}];
        await grid.timeout(20);

        expect(grid.columns.items.map(column => column.dataField)).toEqual(['b', 'jan', 'feb']);
        expect(groupTexts(grid.columns.items)).toEqual([null, 'Pair', 'Pair'])
    })
});
