import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Body           from '../../../../src/grid/Body.mjs';

/**
 * @summary Unit tests for the grid.Body dataField ↔ cell-id mapping family.
 *
 * The renderer (Neo.grid.Row#createVdom) assigns pooled cell slots by the REGION-LOCAL
 * columnPositions index, and treats locked columns as permanent (keyed) cells regardless of
 * their hideMode. getCellId / getDataField must mirror both rules: in a multi-region
 * (locked columns) grid the global gridContainer.columns index differs from the region-local
 * index by the preceding regions' column counts, so a global-index mapping resolves pool
 * slots belonging to other columns.
 */
test.describe('Neo.grid.Body cell mapping', () => {
    /**
     * Mirrors the devindex shape: 3 locked-start columns precede the center region, so every
     * center column's global index is local index + 3.
     */
    function createCenterBodyFake() {
        const globalColumns = [
            {dataField: 'id',          hideMode: 'removeDom', locked: 'start'},
            {dataField: 'rank',        hideMode: 'removeDom', locked: 'start'},
            {dataField: 'login',       hideMode: 'removeDom', locked: 'start'},
            {dataField: 'total',       hideMode: 'removeDom', locked: null},
            {dataField: 'commitRatio', hideMode: 'removeDom', locked: null},
            {dataField: 'private',     hideMode: 'removeDom', locked: null},
            {dataField: 'updated',     hideMode: 'removeDom', locked: 'end'}
        ];

        const centerPositions = [
            {dataField: 'total',       width: 100, x: 0},
            {dataField: 'commitRatio', width: 90,  x: 100},
            {dataField: 'private',     width: 90,  x: 190}
        ];

        // A plain object borrowing the prototype methods under test: instances created via
        // Object.create(Body.prototype) trip the #configs private-brand check of the reactive
        // config system, while a plain `this` only needs the members the methods read.
        // items[0].vdom.cn mirrors the rendered pool slots incl. the data.field binding stamps
        // Row#createVdom writes — the materialized binding the mapping functions resolve through.
        return {
            cellPoolSize   : 5,
            columnPositions: {
                getAt  : i => centerPositions[i],
                indexOf: dataField => centerPositions.findIndex(pos => pos.dataField === dataField)
            },
            gridContainer: {
                columns: {
                    get: dataField => globalColumns.find(col => col.dataField === dataField) || null
                }
            },
            items: [{
                vdom: {
                    cn: [
                        {id: 'body-center__row-0__cell-0', data: {field: 'total'}},
                        {id: 'body-center__row-0__cell-1', data: {field: 'commitRatio'}},
                        {id: 'body-center__row-0__cell-2', data: {field: 'private'}},
                        {id: 'body-center__row-0__cell-3', style: {display: 'none'}},
                        {id: 'body-center__row-0__cell-4', style: {display: 'none'}}
                    ]
                }
            }],
            mountedColumns: [0, 2],

            getCellId   : Body.prototype.getCellId,
            getColumn   : Body.prototype.getColumn,
            getDataField: Body.prototype.getDataField,
            getRowId    : rowIndex => `body-center__row-${rowIndex}`
        }
    }

    test('getCellId resolves pooled slots by the region-local index', () => {
        const body = createCenterBodyFake();

        // commitRatio: region-local index 1, global index 4 — the pool slot is the local one
        expect(body.getCellId(0, 'commitRatio')).toBe('body-center__row-0__cell-1');
        expect(body.getCellId(0, 'total')).toBe('body-center__row-0__cell-0');
        expect(body.getCellId(0, 'private')).toBe('body-center__row-0__cell-2')
    });

    test('getCellId keys locked columns by dataField (Row parity: locked never pools)', () => {
        const body = createCenterBodyFake();

        // locked columns render as permanent cells even with hideMode removeDom
        expect(body.getCellId(0, 'id')).toBe('body-center__row-0__id')
    });

    test('getCellId falls back to the keyed form for fields outside the region', () => {
        const body = createCenterBodyFake();

        // updated lives in the locked-end region; this body's columnPositions do not contain it
        expect(body.getCellId(0, 'updated')).toBe('body-center__row-0__updated')
    });

    test('getDataField resolves pooled cell ids through the region-local positions', () => {
        const body = createCenterBodyFake();

        expect(body.getDataField('body-center__row-0__cell-0')).toBe('total');
        expect(body.getDataField('body-center__row-0__cell-1')).toBe('commitRatio');
        expect(body.getDataField('body-center__row-0__cell-2')).toBe('private')
    });

    test('getDataField returns the suffix for keyed cell ids', () => {
        const body = createCenterBodyFake();

        expect(body.getDataField('body-center__row-0__login')).toBe('login')
    });

    test('getCellId and getDataField round-trip for every region column', () => {
        const body = createCenterBodyFake();

        ['total', 'commitRatio', 'private'].forEach(dataField => {
            expect(body.getDataField(body.getCellId(0, dataField))).toBe(dataField)
        })
    });

    test('mapping survives a mid-drag columnPositions move (slot binding wins over index math)', () => {
        const body = createCenterBodyFake();

        // Simulate the first switchItems of a drag: columnPositions re-ordered to
        // [total, private, commitRatio] while the rendered pool slots keep their render-time
        // binding (cell-1 = commitRatio, cell-2 = private). Index math over the moved collection
        // resolves one-off; the materialized data.field binding must win.
        const movedPositions = [
            {dataField: 'total',       width: 100, x: 0},
            {dataField: 'private',     width: 90,  x: 100},
            {dataField: 'commitRatio', width: 90,  x: 190}
        ];

        body.columnPositions = {
            getAt  : i => movedPositions[i],
            indexOf: dataField => movedPositions.findIndex(pos => pos.dataField === dataField)
        };

        expect(body.getCellId(0, 'commitRatio')).toBe('body-center__row-0__cell-1');
        expect(body.getCellId(0, 'private')).toBe('body-center__row-0__cell-2');
        expect(body.getDataField('body-center__row-0__cell-1')).toBe('commitRatio');
        expect(body.getDataField('body-center__row-0__cell-2')).toBe('private')
    });

    test('pool-suffix matching is exact, not prefix-based (cell-1 vs cell-11)', () => {
        const body = createCenterBodyFake();

        body.items[0].vdom.cn.push({id: 'body-center__row-0__cell-11', data: {field: 'eleven'}});

        expect(body.getDataField('body-center__row-0__cell-11')).toBe('eleven');
        expect(body.getDataField('body-center__row-0__cell-1')).toBe('commitRatio')
    });
});
