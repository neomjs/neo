/**
 * @file test/playwright/unit/grid/AriaMultiselectable.spec.mjs
 * @summary A grid that allows several selections announces it on its ARIA root.
 *
 * The WAI-ARIA Authoring Practices grid pattern reserves `aria-multiselectable` for a grid in which more
 * than one row or cell can be selected. The selection model is the only party that knows: `singleSelect`
 * is its config. The model writes the attribute on {@link Neo.grid.Container#getAriaRoot} when it
 * registers against the View, and withdraws it when it leaves, so a model swapped at runtime corrects
 * the announcement along with the selection it governs.
 *
 * @see Neo.selection.grid.BaseModel#syncAriaMultiselectable
 * @see Neo.grid.Container#getAriaRoot
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
        name             : 'GridAriaMultiselectableTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import CellModel          from '../../../../src/selection/grid/CellModel.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import RowModel           from '../../../../src/selection/grid/RowModel.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

const columns = [
    {dataField: 'id',   text: 'ID',   width: 80},
    {dataField: 'name', text: 'Name', width: 200}
];

const createStore = () => Neo.create(Store, {
    keyProperty: 'id',
    data       : [{id: 1, name: 'One'}, {id: 2, name: 'Two'}],
    model      : {fields: [
        {name: 'id',   type: 'Integer'},
        {name: 'name', type: 'String'}
    ]}
});

/**
 * @param {Neo.data.Store} store
 * @param {Object} [config]
 * @returns {Promise<Neo.grid.Container>}
 */
async function createGrid(store, config = {}) {
    const grid = Neo.create(GridContainer, {
        appName  : 'GridAriaMultiselectableTest',
        columns,
        height   : 400,
        rowHeight: 40,
        store,
        width    : 600,
        ...config
    });

    await grid.initVnode();
    grid.mounted = true;
    await grid.timeout(50);

    return grid
}

test.describe('grid aria-multiselectable (#20927)', () => {
    let grid, store;

    test.afterEach(async () => {
        await grid?.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('a default grid carries no aria-multiselectable', async () => {
        store = createStore();
        grid  = await createGrid(store);

        expect(grid.getAriaRoot().role).toBe('grid');
        expect(grid.getAriaRoot()).not.toHaveProperty('aria-multiselectable')
    });

    test('a multi-select RowModel states it on the ARIA root', async () => {
        store = createStore();
        grid  = await createGrid(store, {
            viewConfig: {selectionModel: {module: RowModel, singleSelect: false}}
        });

        expect(grid.view.selectionModel.singleSelect).toBe(false);
        expect(grid.getAriaRoot()['aria-multiselectable']).toBe(true)
    });

    test('a multi-select CellModel states it on the ARIA root', async () => {
        store = createStore();
        grid  = await createGrid(store, {
            viewConfig: {selectionModel: {module: CellModel, singleSelect: false}}
        });

        expect(grid.view.selectionModel.singleSelect).toBe(false);
        expect(grid.getAriaRoot()['aria-multiselectable']).toBe(true)
    });

    test('a tree grid states it on the treegrid root', async () => {
        store = createStore();
        grid  = await createGrid(store, {
            viewConfig: {selectionModel: {module: RowModel, singleSelect: false}}
        });

        grid.isTreeGrid = true;
        await grid.timeout(20);

        expect(grid.getAriaRoot().role).toBe('treegrid');
        expect(grid.getAriaRoot()['aria-multiselectable']).toBe(true)
    });

    test('swapping the model at runtime writes, then withdraws, the attribute', async () => {
        store = createStore();
        grid  = await createGrid(store);

        expect(grid.getAriaRoot()).not.toHaveProperty('aria-multiselectable');

        grid.view.selectionModel = {module: RowModel, singleSelect: false};
        await grid.timeout(20);

        expect(grid.getAriaRoot()['aria-multiselectable']).toBe(true);

        grid.view.selectionModel = {module: RowModel, singleSelect: true};
        await grid.timeout(20);

        expect(grid.getAriaRoot()).not.toHaveProperty('aria-multiselectable')
    })
});
