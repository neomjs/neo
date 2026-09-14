/**
 * @file test/playwright/unit/grid/ColumnSelection.spec.mjs
 * @summary Pins the column-selection contract the three column-selecting grid models share: a cell click
 * selects and clears its column, arrow navigation moves the selection and wraps, and swapping the model
 * out leaves no column painted.
 *
 * Every arm reads the painted cell classes `grid.Row` renders from `selectionModel.selectedColumns`, not
 * a call count, and drives clicks through `grid.Body#onCellClick` so the event reaches the model the way
 * a real click does — through `fireCellEvent` and the grid container's `cellClick`.
 *
 * @see Neo.selection.grid.ColumnModel
 * @see Neo.selection.grid.CellColumnModel
 * @see Neo.selection.grid.CellColumnRowModel
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
        name             : 'GridColumnSelectionTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import CellColumnModel    from '../../../../src/selection/grid/CellColumnModel.mjs';
import CellColumnRowModel from '../../../../src/selection/grid/CellColumnRowModel.mjs';
import ColumnModel        from '../../../../src/selection/grid/ColumnModel.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';

// Imported for their side effects: the vdom rig `initVnode()` needs, and the instance manager `Neo.get` needs.
import '../../../../src/manager/Instance.mjs';
import '../../../../src/vdom/Helper.mjs';
import '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

const appName = 'GridColumnSelectionTest',
      columns = ['col1', 'col2', 'col3'].map(dataField => ({dataField, text: dataField, width: 100}));

/**
 * @returns {Neo.data.Store}
 */
const createStore = () => Neo.create(Store, {
    keyProperty: 'id',
    data       : [0, 1, 2].map(id => ({id, col1: `a${id}`, col2: `b${id}`, col3: `c${id}`})),
    model      : {fields: [{name: 'id', type: 'Integer'}, ...['col1', 'col2', 'col3'].map(name => ({name, type: 'String'}))]}
});

/**
 * @param {Neo.data.Store} store
 * @param {Function} Model
 * @returns {Promise<Neo.grid.Container>}
 */
const createGrid = async (store, Model) => {
    const grid = Neo.create(GridContainer, {
        appName, columns, height: 300, rowHeight: 40, store, useInternalId: false, width: 400,
        viewConfig: {selectionModel: {module: Model}}
    });

    await grid.initVnode();
    grid.mounted = true;
    await grid.timeout(50);

    // the harness has no geometry to derive the row pool from
    grid.body.set({availableRows: 3, availableWidth: 400, containerWidth: 400});
    await grid.timeout(20);

    return grid
};

/**
 * The dataFields whose cells carry the column-selection class, in any rendered row.
 * @param {Neo.grid.Container} grid
 * @param {String} cls
 * @returns {String[]}
 */
const paintedColumns = (grid, cls) => [...new Set(grid.body.items.flatMap(row =>
    (row.vdom.cn || []).filter(cell => cell.cls?.includes(cls)).map(cell => cell.data?.field)
))].sort();

/**
 * A cell click as the DOM delivers it to a body: the cell's id, and a path carrying its field and record.
 * @param {Neo.grid.Container} grid
 * @param {Number} recordId
 * @param {String} dataField
 */
const clickCell = (grid, recordId, dataField) => {
    const row = grid.body.items.find(item => item.record?.id === recordId);

    grid.body.onCellClick({
        currentTarget: row.getCellId(dataField),
        path         : [{data: {field: dataField, recordId}}]
    })
};

for (const Model of [ColumnModel, CellColumnModel, CellColumnRowModel]) {
    test.describe(`${Model.name} column selection`, () => {
        let grid, model, store, cls;

        test.beforeEach(async () => {
            store = createStore();
            grid  = await createGrid(store, Model);
            model = grid.view.selectionModel;
            // `grid.Row` falls back to `neo-selected` when a model declares no column cell cls
            cls   = model.selectedColumnCellCls || 'neo-selected'
        });

        test.afterEach(async () => {
            await grid?.timeout(20);
            grid?.destroy();
            store?.destroy()
        });

        test('a cell click selects its column, and a second click on it clears the column', async () => {
            clickCell(grid, 1, 'col2');
            await grid.timeout(20);

            expect(model.selectedColumns, 'the clicked column is selected').toEqual(['col2']);
            expect(paintedColumns(grid, cls), 'and painted').toEqual(['col2']);

            clickCell(grid, 1, 'col2');
            await grid.timeout(20);

            expect(model.selectedColumns, 'the same click clears it').toEqual([]);
            expect(paintedColumns(grid, cls)).toEqual([])
        });

        test('arrow navigation moves the column selection, and wraps past the last column', async () => {
            clickCell(grid, 0, 'col2');
            await grid.timeout(20);

            model.onNavKeyColumn(1);
            await grid.timeout(20);

            expect(model.selectedColumns, 'one step right').toEqual(['col3']);
            expect(paintedColumns(grid, cls)).toEqual(['col3']);

            model.onNavKeyColumn(1);
            await grid.timeout(20);

            expect(model.selectedColumns, 'past the last column wraps to the first').toEqual(['col1']);
            expect(paintedColumns(grid, cls)).toEqual(['col1'])
        });

        test('swapping the model out leaves no column painted', async () => {
            clickCell(grid, 0, 'col2');
            await grid.timeout(20);

            expect(paintedColumns(grid, cls), 'precondition: a column is painted').toEqual(['col2']);

            grid.view.selectionModel = null;
            await grid.timeout(20);

            expect(paintedColumns(grid, cls), 'no row keeps a column highlight for a model that is gone').toEqual([])
        })
    })
}
