/**
 * @file test/playwright/unit/grid/CellSelectionKeepsForeignCls.spec.mjs
 * @summary Pins the promise of `applyCellSelection`: it withdraws only the classes it put on a cell.
 * A cell can already carry a selection class when a rule selects it: `grid.Row` paints `selectedColumns`
 * cells with `neo-selected` before the selection model answers for them. Clearing the rule must leave that
 * class in place, and a direct call must not record a class the node already had as its own.
 *
 * @see Neo.selection.grid.BaseModel#applyCellSelection
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
        name             : 'GridCellSelectionKeepsForeignClsTest',
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import BaseModel      from '../../../../src/selection/grid/BaseModel.mjs';
import GridContainer  from '../../../../src/grid/Container.mjs';
import Store          from '../../../../src/data/Store.mjs';

// Imported for their side effects: the vdom rig `initVnode()` needs, and the instance manager `Neo.get` needs.
import '../../../../src/manager/Instance.mjs';
import '../../../../src/vdom/Helper.mjs';
import '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

const appName = 'GridCellSelectionKeepsForeignClsTest',
      fields  = ['col1', 'col2', 'col3'],
      columns = fields.map(dataField => ({dataField, text: dataField, width: 100}));

/**
 * @summary Answers `selected` for every cell and adds one class of its own.
 * @class Test.Unit.Grid.CellSelectionKeepsForeignCls.DirectModel
 * @extends Neo.selection.grid.BaseModel
 */
class DirectModel extends BaseModel {
    static config = {
        className   : 'Test.Unit.Grid.CellSelectionKeepsForeignCls.DirectModel',
        selectsCells: true
    }

    selected = true

    getCellCls() {
        return ['model-owned']
    }

    isSelectedCell() {
        return this.selected
    }
}

DirectModel = Neo.setupClass(DirectModel);

/**
 * @summary Selects the rectangle between two store indexes over a list of columns, and holds no cell id.
 * @class Test.Unit.Grid.CellSelectionKeepsForeignCls.RectangleModel
 * @extends Neo.selection.grid.BaseModel
 */
class RectangleModel extends BaseModel {
    static config = {
        className   : 'Test.Unit.Grid.CellSelectionKeepsForeignCls.RectangleModel',
        selectsCells: true
    }

    rectangle = null

    isSelectedCell(record, dataField) {
        let {rectangle} = this,
            index       = rectangle && this.view.store.indexOf(record);

        return !!rectangle && index >= rectangle.rows[0] && index <= rectangle.rows[1] && rectangle.fields.includes(dataField)
    }

    setRectangle(rectangle) {
        this.rectangle = rectangle;
        this.updateRenderedCells()
    }
}

RectangleModel = Neo.setupClass(RectangleModel);

const createStore = () => Neo.create(Store, {
    keyProperty: 'id',
    data       : Array.from({length: 6}, (_, id) => ({id, col1: `a${id}`, col2: `b${id}`, col3: `c${id}`})),
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

    grid.body.set({availableRows: 3, availableWidth: 400, containerWidth: 400});
    await grid.timeout(20);

    return grid
};

test.describe('applyCellSelection withdraws only its own classes', () => {
    test('a class the node carried before the selection stays after the deselect', () => {
        const model = Neo.create(DirectModel, {}),
              cell  = {cls: ['neo-grid-cell', 'neo-selected']};

        model.applyCellSelection(cell, {}, 'col1');

        expect(cell.cls, 'the selection adds its own class').toEqual(['neo-grid-cell', 'neo-selected', 'model-owned']);
        expect(cell['aria-selected']).toBe(true);
        expect(model.applyCellSelection(cell, {}, 'col1'), 'an unchanged answer is not a change').toBe(false);

        model.selected = false;
        model.applyCellSelection(cell, {}, 'col1');

        expect(cell.cls, 'the class the cell carried before the selection survives').toEqual(['neo-grid-cell', 'neo-selected']);
        expect(cell['aria-selected']).toBeUndefined()
    })
});

test.describe('A rule that clears over a column-selected cell', () => {
    let grid, store;

    test.afterEach(async () => {
        await grid?.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('does not strip the fallback class Row painted from selectedColumns', async () => {
        store = createStore();
        grid  = await createGrid(store, {
            module         : RectangleModel,
            rectangle      : {fields: ['col2', 'col3'], rows: [1, 2]},
            selectedColumns: ['col2']
        });

        const model = grid.view.selectionModel;

        const firstRow  = grid.body.items.find(item => item.record?.id === 1),
              firstCell = firstRow.vdom.cn.find(node => node.data?.field === 'col2');

        expect(firstCell.cls, 'precondition: Row paints selectedColumns cells with its fallback class')
            .toContain('neo-selected');

        model.setRectangle(null);
        await grid.timeout(20);

        for (const recordId of [1, 2]) {
            const row  = grid.body.items.find(item => item.record?.id === recordId),
                  cell = row.vdom.cn.find(node => node.data?.field === 'col2');

            expect(cell.cls, `record ${recordId}: the fallback class stays while selectedColumns still names col2`)
                .toContain('neo-selected');
            expect(cell['aria-selected'], `record ${recordId}: the cell is no longer selected`).toBeUndefined()
        }

        expect(model.selectedColumns).toEqual(['col2'])
    })
});
