/**
 * @file test/playwright/unit/grid/CellSelectionByRule.spec.mjs
 * @summary Pins the answer a grid selection model gives a row for each cell: a model that selects by a rule
 * paints its cells with `items` empty, on first render, after the rule changes and on rows that scroll into the
 * pool, and the shipped models paint the cells in `items` without scanning the array per cell.
 *
 * Every arm reads the cell classes and `aria-selected` in the rows' vdom, and drives clicks through
 * `grid.Body#onCellClick`, as `ColumnSelection.spec.mjs` does.
 *
 * @see Neo.selection.grid.BaseModel#isSelectedCell
 * @see Neo.selection.grid.BaseModel#updateRenderedCells
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
        name             : 'GridCellSelectionByRuleTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import BaseModel          from '../../../../src/selection/grid/BaseModel.mjs';
import CellColumnModel    from '../../../../src/selection/grid/CellColumnModel.mjs';
import CellColumnRowModel from '../../../../src/selection/grid/CellColumnRowModel.mjs';
import CellModel          from '../../../../src/selection/grid/CellModel.mjs';
import CellRowModel       from '../../../../src/selection/grid/CellRowModel.mjs';
import ColumnModel        from '../../../../src/selection/grid/ColumnModel.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import RowModel           from '../../../../src/selection/grid/RowModel.mjs';
import Store              from '../../../../src/data/Store.mjs';

// Imported for their side effects: the vdom rig `initVnode()` needs, and the instance manager `Neo.get` needs.
import '../../../../src/manager/Instance.mjs';
import '../../../../src/vdom/Helper.mjs';
import '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

const appName = 'GridCellSelectionByRuleTest',
      fields  = ['col1', 'col2', 'col3'],
      columns = fields.map(dataField => ({dataField, text: dataField, width: 100}));

/**
 * @summary Selects the rectangle between two store indexes over a list of columns, and holds no cell id.
 * @class Test.Unit.Grid.CellSelectionByRule.RectangleModel
 * @extends Neo.selection.grid.BaseModel
 */
class RectangleModel extends BaseModel {
    static config = {
        className   : 'Test.Unit.Grid.CellSelectionByRule.RectangleModel',
        selectsCells: true
    }

    /**
     * @member {Boolean} outline=false True marks the rectangle's first row with an edge class
     */
    outline = false
    /**
     * @member {Object|null} rectangle=null `{fields, rows: [first, last]}`, store indexes, both included
     */
    rectangle = null

    /**
     * @param {Object} record
     * @param {String} dataField
     * @returns {String[]}
     */
    getCellCls(record, dataField) {
        return this.outline && this.view.store.indexOf(record) === this.rectangle.rows[0] ? ['range-top'] : []
    }

    /**
     * @param {Object} record
     * @param {String} dataField
     * @returns {Boolean}
     */
    isSelectedCell(record, dataField) {
        let {rectangle} = this,
            index       = rectangle && this.view.store.indexOf(record);

        return !!rectangle && index >= rectangle.rows[0] && index <= rectangle.rows[1] && rectangle.fields.includes(dataField)
    }

    /**
     * @param {Object|null} rectangle
     */
    setRectangle(rectangle) {
        this.rectangle = rectangle;
        this.updateRenderedCells()
    }
}

RectangleModel = Neo.setupClass(RectangleModel);

/**
 * @returns {Neo.data.Store}
 */
const createStore = () => Neo.create(Store, {
    keyProperty: 'id',
    data       : Array.from({length: 30}, (_, id) => ({id, col1: `a${id}`, col2: `b${id}`, col3: `c${id}`})),
    model      : {fields: [{name: 'id', type: 'Integer'}, ...fields.map(name => ({name, type: 'String'}))]}
});

/**
 * @param {Neo.data.Store} store
 * @param {Object} selectionModel
 * @returns {Promise<Neo.grid.Container>}
 */
const createGrid = async (store, selectionModel) => {
    const grid = Neo.create(GridContainer, {
        appName, columns, height: 300, rowHeight: 40, store, useInternalId: false, width: 400,
        viewConfig: {selectionModel}
    });

    await grid.initVnode();
    grid.mounted = true;
    await grid.timeout(50);

    // the harness has no geometry to derive the row pool from: 3 visible rows and 3 buffer rows on each side
    grid.body.set({availableRows: 3, availableWidth: 400, containerWidth: 400});
    await grid.timeout(20);

    return grid
};

/**
 * The rendered cells that match, as `recordId:dataField`, in row order.
 * @param {Neo.grid.Container} grid
 * @param {Function} matches Receives the cell's vdom node
 * @returns {String[]}
 */
const cells = (grid, matches) => grid.body.items
    .filter(row => row.record)
    .sort((a, b) => a.rowIndex - b.rowIndex)
    .flatMap(row => row.vdom.cn.filter(cell => cell.data?.field && matches(cell)).map(cell => `${row.record.id}:${cell.data.field}`));

const painted  = (grid, cls='neo-selected') => cells(grid, cell => cell.cls?.includes(cls)),
      selected = grid => cells(grid, cell => cell['aria-selected'] === true);

/**
 * @param {Number[]} rows Record ids
 * @param {String[]} dataFields
 * @returns {String[]}
 */
const rectangleCells = (rows, dataFields) => rows.flatMap(id => dataFields.map(dataField => `${id}:${dataField}`));

/**
 * A cell click as the DOM delivers it to a body: the cell's id, and a path whose dataset carries the field and
 * the record id as strings.
 * @param {Neo.grid.Container} grid
 * @param {Number} recordId
 * @param {String} dataField
 */
const clickCell = (grid, recordId, dataField) => {
    const row = grid.body.items.find(item => item.record?.id === recordId);

    grid.body.onCellClick({
        currentTarget: row.getCellId(dataField),
        path         : [{data: {field: dataField, recordId: String(recordId)}}]
    })
};

test.describe('A grid selection model that selects cells by a rule', () => {
    let grid, model, store;

    test.beforeEach(async () => {
        store = createStore();
        grid  = await createGrid(store, {module: RectangleModel, rectangle: {fields: ['col2', 'col3'], rows: [1, 2]}});
        model = grid.view.selectionModel
    });

    test.afterEach(async () => {
        await grid?.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('paints its cells on first render, with no id in items', () => {
        const expected = rectangleCells([1, 2], ['col2', 'col3']);

        expect(model.items, 'the rule holds no cell id').toEqual([]);
        expect(painted(grid), 'the rectangle carries the selected class').toEqual(expected);
        expect(selected(grid), 'and aria-selected').toEqual(expected)
    });

    test('a rule change repaints the rendered cells and updates only the rows that changed', async () => {
        const updated = [];

        grid.body.items.forEach(row => {
            const {update} = row;

            row.update = function(...args) {
                updated.push(row.rowIndex);
                return update.apply(this, args)
            }
        });

        model.setRectangle({fields: ['col2', 'col3'], rows: [2, 3]});
        await grid.timeout(20);

        expect(model.items).toEqual([]);
        expect(painted(grid)).toEqual(rectangleCells([2, 3], ['col2', 'col3']));
        expect(selected(grid)).toEqual(rectangleCells([2, 3], ['col2', 'col3']));
        expect(updated.sort(), 'row 2 kept its cells and was not updated').toEqual([1, 3])
    });

    test('paints rows that scroll into the pool', async () => {
        model.setRectangle({fields: ['col1'], rows: [9, 10]});
        await grid.timeout(20);

        expect(grid.body.mountedRows, 'precondition: the rectangle lies below the mounted rows').toEqual([0, 9]);
        expect(painted(grid)).toEqual([]);

        grid.body.startIndex = 6;
        await grid.timeout(20);

        expect(grid.body.mountedRows).toEqual([3, 12]);
        expect(painted(grid)).toEqual(['9:col1', '10:col1']);
        expect(selected(grid)).toEqual(['9:col1', '10:col1'])
    });

    test('classes from getCellCls reach the cell and leave it when the model stops returning them', async () => {
        model.outline = true;
        model.updateRenderedCells();
        await grid.timeout(20);

        expect(painted(grid, 'range-top'), 'the first row of the rectangle').toEqual(['1:col2', '1:col3']);

        model.outline = false;
        model.updateRenderedCells();
        await grid.timeout(20);

        expect(painted(grid, 'range-top')).toEqual([]);
        expect(painted(grid), 'the selection itself stays').toEqual(rectangleCells([1, 2], ['col2', 'col3']));

        model.setRectangle(null);
        await grid.timeout(20);

        expect(painted(grid)).toEqual([]);
        expect(selected(grid)).toEqual([])
    })
});

for (const Model of [CellModel, CellRowModel, CellColumnModel, CellColumnRowModel]) {
    test.describe(`${Model.name} paints the cells in items`, () => {
        let grid, store;

        test.beforeEach(async () => {
            store = createStore();
            grid  = await createGrid(store, {module: Model})
        });

        test.afterEach(async () => {
            await grid?.timeout(20);
            grid?.destroy();
            store?.destroy()
        });

        test('a click selects the cell, the next click moves the selection, and a click on it clears it', async () => {
            clickCell(grid, 1, 'col2');
            await grid.timeout(20);

            expect(painted(grid)).toEqual(['1:col2']);
            expect(selected(grid)).toEqual(['1:col2']);

            clickCell(grid, 2, 'col3');
            await grid.timeout(20);

            expect(painted(grid), 'single select: the first cell is cleared').toEqual(['2:col3']);
            expect(selected(grid)).toEqual(['2:col3']);

            clickCell(grid, 2, 'col3');
            await grid.timeout(20);

            expect(painted(grid)).toEqual([]);
            expect(selected(grid)).toEqual([])
        })
    })
}

test.describe('The shipped models and the per-cell answer', () => {
    let grid, store;

    test.afterEach(async () => {
        await grid?.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('RowModel and ColumnModel are not asked: no cell is marked selected', async () => {
        store = createStore();
        grid  = await createGrid(store, {module: RowModel});

        expect(grid.view.cellSelectionModel).toBeNull();
        grid.view.selectionModel.selectRow(1);
        await grid.timeout(20);
        expect(selected(grid)).toEqual([]);

        grid.view.selectionModel = {module: ColumnModel};
        await grid.timeout(20);

        expect(grid.view.cellSelectionModel).toBeNull();
        grid.view.selectionModel.setSelectedColumns(['col2']);
        await grid.timeout(20);
        expect(selected(grid)).toEqual([])
    });

    test('a render scans items for no cell, however many ids they hold', async () => {
        store = createStore();
        grid  = await createGrid(store, {module: CellModel, singleSelect: false});

        const model = grid.view.selectionModel;
        let   scans = 0;

        // 2,000 ids of records the store does not hold, and one rendered cell
        model.items = [...Array.from({length: 2000}, (_, index) => `${index + 100}__col1`), '2__col2'];

        ['includes', 'indexOf'].forEach(name => {
            model.items[name] = function(...args) {
                scans++;
                return Array.prototype[name].apply(this, args)
            }
        });

        grid.body.createViewData(true, true);

        expect(scans, 'no array scan while 27 cells render').toBe(0);
        expect(painted(grid)).toEqual(['2:col2']);
        expect(selected(grid)).toEqual(['2:col2'])
    });

    test('the answer follows items through select, deselect, deselectAll and assignment', async () => {
        store = createStore();
        grid  = await createGrid(store, {module: CellModel});

        const model  = grid.view.selectionModel,
              record = id => store.get(id);

        model.select('1__col1');
        expect(model.isSelectedCell(record(1), 'col1')).toBe(true);

        // single select replaces one id with another: the array keeps its length
        model.select('2__col2');
        expect(model.isSelectedCell(record(1), 'col1')).toBe(false);
        expect(model.isSelectedCell(record(2), 'col2')).toBe(true);
        expect(model.isSelected('2__col2')).toBe(true);

        model.deselect('2__col2');
        expect(model.isSelectedCell(record(2), 'col2')).toBe(false);

        model.items = ['3__col3'];
        expect(model.isSelectedCell(record(3), 'col3')).toBe(true);

        model.deselectAll();
        expect(model.isSelectedCell(record(3), 'col3')).toBe(false);
        expect(model.isSelected('3__col3')).toBe(false)
    })
});
