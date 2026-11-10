import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Row            from '../../../../src/grid/Row.mjs';

/**
 * @summary A tree grid row announces its own expansion state.
 *
 * `Neo.data.TreeModel` keeps expansion in `collapsed`, which `TreeStore` defaults to true. The row's
 * `aria-expanded` must follow that field: true for an expanded parent, false for a collapsed one, and absent on
 * a leaf, which has nothing to expand.
 */
test.describe('Neo.grid.Row: aria-expanded in a tree grid', () => {
    const columns = [{dataField: 'name', hideMode: 'removeDom', locked: null, renderer: ({value}) => value}];

    /**
     * Borrows Row's render methods on a plain `this`, as RowCellIdMigration.spec does: the fake carries every
     * member createVdom dereferences
     * @param {Object} node The tree node fields of the rendered record
     * @returns {Object}
     */
    function renderRow(node) {
        const record = {id: 'r1', depth: 0, siblingCount: 1, siblingIndex: 1, ...node, get: field => field, isModifiedField: () => false},

              gridContainer = {
                  columns            : {get: dataField => columns.find(col => col.dataField === dataField) || null, getCount: () => columns.length},
                  getAriaColumnOffset: () => 0,
                  getPlugin          : () => null,
                  isTreeGrid         : true
              },

              row = {
                  applyRendererOutput: Row.prototype.applyRendererOutput,
                  createVdom         : Row.prototype.createVdom,
                  getCellId          : Row.prototype.getCellId,
                  getRowTransform    : Row.prototype.getRowTransform,
                  id                 : 'body__row-0',
                  record,
                  rowIndex           : 0,
                  vdom               : {cn: []},
                  parent             : {
                      cellPoolSize          : 1,
                      colspanField          : null,
                      columnPositions       : {getAt: () => ({dataField: 'name', hidden: false, width: 100, x: 0}), getCount: () => 1},
                      getAriaRowOwns        : () => null,
                      getRecordId           : rec => rec.id,
                      getRowClass           : () => ['neo-grid-row'],
                      gridContainer,
                      highlightModifiedCells: false,
                      isAriaLeadRegion      : true,
                      mountedColumns        : [0, 0],
                      rowHeight             : 32,
                      selectedRecordField   : null,
                      selectedRows          : null,
                      store                 : {},
                      stripedRows           : false
                  }
              };

        row.createVdom(true, true);
        return row.vdom
    }

    test('an expanded parent row is aria-expanded', () => {
        expect(renderRow({collapsed: false, isLeaf: false})['aria-expanded']).toBe(true)
    });

    test('a collapsed parent row is not', () => {
        expect(renderRow({collapsed: true, isLeaf: false})['aria-expanded']).toBe(false)
    });

    test('a leaf row has no aria-expanded', () => {
        expect('aria-expanded' in renderRow({collapsed: true, isLeaf: true})).toBe(false)
    })
});
