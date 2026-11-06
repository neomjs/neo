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
    });
});

/**
 * @param {Neo.grid.header.GroupRow} groupRow
 * @returns {Object[]} Per part: its region and its cells' text, colindex, colspan and placement
 */
const groupCells = groupRow => groupRow.vdom.cn.map(part => ({
    region: part.cls[1].replace('neo-grid-header-group-part-', ''),
    cells : part.cn[0].cn.map(cell => ({
        text    : cell.text,
        colindex: cell['aria-colindex'],
        colspan : cell['aria-colspan'],
        left    : cell.style.left,
        width   : cell.style.width
    }))
}));

test.describe('Neo.grid.header.GroupRow', () => {
    let grid, store;

    test.afterEach(() => {
        grid?.destroy();
        store?.destroy();
        grid = store = null
    });

    test('a grid without groups has no group row, and its leaf headers stay header row 1', async () => {
        store = createStore();
        grid  = await createGrid(store, [{dataField: 'a', width: 100}, {dataField: 'b', width: 100}]);

        expect(grid.headerWrapper.groupRow).toBeNull();
        expect(grid.headerWrapper.cls).not.toContain('neo-grid-header-grouped');
        expect(grid.headerRowCount).toBe(1);
        expect(grid.headerToolbar.vdom['aria-rowindex']).toBe(1)
    });

    test('each region\'s part heads its groups, spanning their columns\' positions', async () => {
        store = createStore();
        grid  = await createGrid(store, [
            {dataField: 'a', width: 100, locked: 'start'},
            {text: 'Name', locked: 'start', columns: [{dataField: 'first', width: 100}, {dataField: 'last', width: 120}]},
            {text: 'Q1', columns: [{dataField: 'jan', width: 80}, {dataField: 'feb', width: 90}]},
            {dataField: 'b', width: 100}
        ]);

        await expect.poll(() => grid.headerWrapper.groupRow?.vdom.cn[0]?.cn[0]?.cn[0]?.style.width).toBe('220px');

        // Each part clips a track as wide as its region's columns, so the centre one can scroll with the grid
        expect(grid.headerWrapper.groupRow.vdom.cn.map(part => [part.id, part.cn[0].style.width])).toEqual([
            [grid.getGroupHeaderPartId('start'),  '320px'],
            [grid.getGroupHeaderPartId('center'), '270px']
        ]);

        // One part per region toolbar, in the toolbars' order; colindex is grid-wide, after the start region's 3
        expect(groupCells(grid.headerWrapper.groupRow)).toEqual([
            {region: 'start',  cells: [{text: 'Name', colindex: 2, colspan: 2, left: '100px', width: '220px'}]},
            {region: 'center', cells: [{text: 'Q1',   colindex: 4, colspan: 2, left: '0px',   width: '170px'}]}
        ]);
        expect(grid.headerWrapper.cls).toContain('neo-grid-header-grouped');
        expect(grid.headerWrapper.style.gridTemplateColumns).toBe('auto minmax(0, 1fr)')
    });

    test('with groups there are two header rows: group row 1, leaf row 2, and body rows after both', async () => {
        store = createStore();
        grid  = await createGrid(store, [{text: 'Q1', columns: [{dataField: 'jan', width: 80}, {dataField: 'feb', width: 90}]}]);

        const {groupRow} = grid.headerWrapper;

        expect(groupRow.vdom['aria-rowindex']).toBe(1);
        expect(groupRow.role).toBe('row');
        expect(grid.headerRowCount).toBe(2);
        expect(grid.headerToolbar.vdom['aria-rowindex']).toBe(2);

        grid.updateRowCount();
        expect(grid.getAriaRoot()['aria-rowcount']).toBe(store.count + 2);

        // Replacing the columns without a group retires the row and restores one header row
        grid.columns = [{dataField: 'jan', width: 80}];
        await grid.timeout(20);

        expect(grid.headerWrapper.groupRow).toBeNull();
        expect(grid.headerRowCount).toBe(1);
        expect(grid.headerToolbar.vdom['aria-rowindex']).toBe(1);
        expect(grid.getAriaRoot()['aria-rowcount']).toBe(store.count + 1)
    })
});
