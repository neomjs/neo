import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Row            from '../../../../src/grid/Row.mjs';

/**
 * @summary Regression net for the pool-born→permanent one-live-cell invariant.
 *
 * Neo.grid.Row#createVdom renders cells in two passes, partitioned by
 * P(column) = (hideMode === 'removeDom' && !locked):
 * Pass 1 renders pooled cells (ids `rowId__cell-N`, N = columnIndex % cellPoolSize) and
 * back-fills every unused pool slot with a display:none placeholder carrying that slot's
 * pool id; Pass 2 renders permanent cells (ids `rowId__dataField`).
 *
 * When P flips on a MOUNTED row (e.g. a cross-region drag re-home changes `locked`), the
 * recycle branches migrate the surviving node across schemes. Both directions MUST re-id
 * the recycled node: if the lock-flip direction (pool→permanent) keeps the stale pool id
 * while Pass 1's placeholder loop re-issues the same id, a single row holds two nodes with
 * one id, collapsing id-based diffing (id-less insertNode storms, the DOM accumulating
 * both cell generations).
 *
 * Invariant under test, for every render: all cell ids within a row are unique, and each
 * column is alive under exactly ONE id scheme (pool placeholders without `data` are
 * structural by design and do not count as living cells).
 */
test.describe('Neo.grid.Row cell-id scheme migration (#12930)', () => {
    const ROW_ID = 'body-center__row-0';

    /**
     * Borrows the prototype methods under test on a plain `this` (BodyCellMapping.spec
     * precedent: Object.create(Row.prototype) trips the #configs private-brand check of
     * the reactive config system, while the borrowed methods only read plain members).
     * The returned object carries everything createVdom + applyRendererOutput dereference.
     */
    function createRowFake(globalColumns) {
        const record = {
            id             : 'r1',
            get(field)     { return `${field}-value` },
            isModifiedField() { return false }
        };

        const columnPositions = globalColumns.map((col, index) => ({
            dataField: col.dataField,
            hidden   : false,
            width    : 100,
            x        : index * 100
        }));

        const gridContainer = {
            columns: {
                get     : dataField => globalColumns.find(col => col.dataField === dataField) || null,
                getCount: () => globalColumns.length
            },
            isTreeGrid: false
        };

        const gridBody = {
            cellPoolSize          : 5,
            colspanField          : null,
            columnPositions       : {
                getAt   : i => columnPositions[i],
                getCount: () => columnPositions.length
            },
            getLogicalCellId      : (rec, dataField) => `logical__${rec.id}__${dataField}`,
            getRecordId           : rec => rec.id,
            getRowClass           : () => ['neo-grid-row'],
            gridContainer,
            highlightModifiedCells: false,
            mountedColumns        : [0, globalColumns.length - 1],
            rowHeight             : 32,
            selectedCells         : [],
            selectedRecordField   : null,
            selectedRows          : null,
            selectionModel        : null,
            store                 : {},
            stripedRows           : false
        };

        return {
            applyRendererOutput: Row.prototype.applyRendererOutput,
            createVdom         : Row.prototype.createVdom,
            getCellId          : Row.prototype.getCellId,
            id                 : ROW_ID,
            parent             : gridBody,
            record,
            rowIndex           : 0,
            vdom               : {cn: []}
        }
    }

    function createColumns() {
        // hideMode removeDom + locked:null => P true (pooled); locked set => P false (permanent)
        return [
            {dataField: 'alpha', hideMode: 'removeDom', locked: null, renderer: ({value}) => value},
            {dataField: 'beta',  hideMode: 'removeDom', locked: null, renderer: ({value}) => value},
            {dataField: 'gamma', hideMode: 'removeDom', locked: null, renderer: ({value}) => value}
        ]
    }

    /** A living cell carries the data.field binding; structural pool placeholders do not. */
    function livingCells(row, dataField) {
        return row.vdom.cn.filter(node => node.data?.field === dataField)
    }

    function assertUniqueIds(row) {
        const ids = row.vdom.cn.map(node => node.id);
        expect(new Set(ids).size).toBe(ids.length)
    }

    test('lock-flip (pool→permanent) re-ids the recycled node — no duplicate pool id with the placeholder', () => {
        const columns = createColumns();
        const row     = createRowFake(columns);

        // Initial render: all three columns pooled
        row.createVdom(true, true);
        expect(livingCells(row, 'beta')[0].id).toBe(`${ROW_ID}__cell-1`);
        assertUniqueIds(row);

        // The P-flip: beta becomes locked on the mounted row (cross-region re-home shape)
        columns[1].locked = 'start';
        row.createVdom(true, true);

        // THE invariant: ids unique — pre-fix, Pass 1's placeholder loop re-issued
        // `__cell-1` while Pass 2 pushed the recycled node still carrying `__cell-1`
        assertUniqueIds(row);

        // beta is alive under exactly one scheme, the permanent (field-named) one
        const beta = livingCells(row, 'beta');
        expect(beta.length).toBe(1);
        expect(beta[0].id).toBe(`${ROW_ID}__beta`);

        // the vacated pool slot is a structural placeholder, not a living cell
        const slot1 = row.vdom.cn.find(node => node.id === `${ROW_ID}__cell-1`);
        expect(slot1).toBeDefined();
        expect(slot1.data).toBeUndefined();
        expect(slot1.style.display).toBe('none')
    });

    test('unlock-flip (permanent→pool) re-ids symmetrically — no stale field-named node', () => {
        const columns = createColumns();
        columns[1].locked = 'start';
        const row = createRowFake(columns);

        // Initial render: beta permanent (field-named), alpha + gamma pooled
        row.createVdom(true, true);
        expect(livingCells(row, 'beta')[0].id).toBe(`${ROW_ID}__beta`);
        assertUniqueIds(row);

        // The reverse P-flip: beta unlocks back into pool territory
        columns[1].locked = null;
        row.createVdom(true, true);

        assertUniqueIds(row);

        const beta = livingCells(row, 'beta');
        expect(beta.length).toBe(1);
        expect(beta[0].id).toBe(`${ROW_ID}__cell-1`);
        expect(row.vdom.cn.find(node => node.id === `${ROW_ID}__beta`)).toBeUndefined()
    });

    test('steady-state recycle keeps ids stable and unique across repeated renders', () => {
        const columns = createColumns();
        const row     = createRowFake(columns);

        row.createVdom(true, true);
        const firstIds = row.vdom.cn.map(node => node.id);

        row.createVdom(true, true);
        row.createVdom(true, true);

        expect(row.vdom.cn.map(node => node.id)).toEqual(firstIds);
        assertUniqueIds(row);

        // every column still alive exactly once
        ['alpha', 'beta', 'gamma'].forEach(dataField => {
            expect(livingCells(row, dataField).length).toBe(1)
        })
    });

    test('flip round-trip (pool→permanent→pool) ends in the original identity state', () => {
        const columns = createColumns();
        const row     = createRowFake(columns);

        row.createVdom(true, true);
        const initialIds = row.vdom.cn.map(node => node.id).sort();

        columns[1].locked = 'start';
        row.createVdom(true, true);
        assertUniqueIds(row);

        columns[1].locked = null;
        row.createVdom(true, true);
        assertUniqueIds(row);

        expect(row.vdom.cn.map(node => node.id).sort()).toEqual(initialIds);
        expect(livingCells(row, 'beta').length).toBe(1)
    });
});
