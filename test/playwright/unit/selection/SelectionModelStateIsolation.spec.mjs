/**
 * @file test/playwright/unit/selection/SelectionModelStateIsolation.spec.mjs
 * @summary Every grid and table selection model instance owns its selection arrays.
 *
 * A static-config array default is one object per class; a model that mutates it in place shares its
 * selection with every other instance of its class. The grid and table models declare their arrays as
 * per-instance descriptors, and this arm holds all nine classes to it.
 *
 * @see Neo.selection.grid.BaseModel
 * @see Neo.selection.table.CellRowModel
 */
import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: 'SelectionModelStateIsolationTest'
    }
});

import {test, expect}          from '@playwright/test';
import Neo                     from '../../../../src/Neo.mjs';
import * as core               from '../../../../src/core/_export.mjs';
import GridCellColumnModel     from '../../../../src/selection/grid/CellColumnModel.mjs';
import GridCellColumnRowModel  from '../../../../src/selection/grid/CellColumnRowModel.mjs';
import GridCellModel           from '../../../../src/selection/grid/CellModel.mjs';
import GridCellRowModel        from '../../../../src/selection/grid/CellRowModel.mjs';
import GridColumnModel         from '../../../../src/selection/grid/ColumnModel.mjs';
import GridRowModel            from '../../../../src/selection/grid/RowModel.mjs';
import TableCellColumnModel    from '../../../../src/selection/table/CellColumnModel.mjs';
import TableCellColumnRowModel from '../../../../src/selection/table/CellColumnRowModel.mjs';
import TableCellRowModel       from '../../../../src/selection/table/CellRowModel.mjs';

// every class with its selection arrays — the grid family inherits both from grid.BaseModel
const models = [
    [GridRowModel,            ['selectedColumns', 'selectedRows']],
    [GridCellModel,           ['selectedColumns', 'selectedRows']],
    [GridColumnModel,         ['selectedColumns', 'selectedRows']],
    [GridCellRowModel,        ['selectedColumns', 'selectedRows']],
    [GridCellColumnModel,     ['selectedColumns', 'selectedRows']],
    [GridCellColumnRowModel,  ['selectedColumns', 'selectedRows']],
    [TableCellRowModel,       ['selectedRowIds']],
    [TableCellColumnModel,    ['selectedColumnCellIds']],
    [TableCellColumnRowModel, ['selectedColumnCellIds']]
];

test.describe('Selection models own their selection arrays', () => {
    for (const [Model, keys] of models) {
        // view-less instances: destroy() would unregister against a view that does not exist
        test(`${Model.name}: ${keys.join(' and ')} are per instance`, () => {
            const a = Neo.create(Model), b = Neo.create(Model);

            keys.forEach(key => {
                expect(a[key], `${key} starts empty`).toEqual([]);
                expect(b[key], `${key} is not the sibling's array`).not.toBe(a[key]);

                a[key].push('probe');

                expect(a[key], `an in-place write lands on the instance`).toEqual(['probe']);
                expect(b[key], `and stays invisible to the sibling`).toEqual([]);
                expect(Neo.create(Model)[key], `and to an instance created afterwards`).toEqual([])
            })
        })
    }
});
