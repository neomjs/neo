/**
 * @file test/playwright/unit/grid/HeaderButtonSortable.spec.mjs
 * @summary A `sortable: false` header button keeps its click but never cycles its sort state, in a grid and a table.
 *
 * `afterSetSortable(false)` hides the sort glyph. A click used to cycle `isSorted` anyway, which showed the glyph and,
 * inside a container, sorted the Store by the column's `dataField`.
 *
 * A sorted header also has to announce its direction: the arrow is a CSS class, which a screen reader cannot see.
 *
 * @see Neo.grid.header.Button#onClick
 * @see Neo.table.header.Button#onClick
 * @see Neo.grid.header.Button#afterSetIsSorted
 * @see Neo.table.header.Button#afterSetIsSorted
 */
import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'HeaderButtonSortableTest'}});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import GridHeaderButton  from '../../../../src/grid/header/Button.mjs';
import TableHeaderButton from '../../../../src/table/header/Button.mjs';
import '../../../../src/manager/Instance.mjs'; // Neo.get, which the button's handler binding calls

const click = {path: [{cls: [], id: 'header-click-target'}]};

test.describe('Header buttons and sortable', () => {
    for (const [name, HeaderButton] of [['grid', GridHeaderButton], ['table', TableHeaderButton]]) {
        test(`a ${name} header: a click sorts only while sortable, and still runs the button handler`, () => {
            let handled = 0;

            const button = Neo.create(HeaderButton, {
                dataField      : 'index',
                handler        : () => handled++,
                sortable       : false,
                useRippleEffect: false
            });

            button.onClick(click);

            expect(button.isSorted).toBeNull();
            expect(button.cls).toContain('neo-sort-hidden');
            expect(handled).toBe(1);

            // The control: the same button cycles once it is sortable
            button.sortable = true;
            button.onClick(click);

            expect(button.isSorted).toBe('ASC');
            expect(button.cls).not.toContain('neo-sort-hidden');
            expect(handled).toBe(2);

            button.destroy()
        })
    }

    for (const [name, HeaderButton] of [['grid', GridHeaderButton], ['table', TableHeaderButton]]) {
        test(`a ${name} header: the sort direction is announced through aria-sort, and an unsorted one announces none`, () => {
            const button = Neo.create(HeaderButton, {
                dataField      : 'index',
                sortable       : true,
                useRippleEffect: false
            });

            // aria-sort is valid on a columnheader only: the grid button *is* one, while a table header is the <th>
            const columnHeader = () => name === 'grid' ? button.getVdomRoot() : button.vdom;

            expect(columnHeader()['aria-sort']).toBeUndefined();

            button.isSorted = 'ASC';
            expect(columnHeader()['aria-sort']).toBe('ascending');

            button.isSorted = 'DESC';
            expect(columnHeader()['aria-sort']).toBe('descending');

            // removeSortingCss() resets _isSorted directly, so it has to clear the attribute on its own
            button.removeSortingCss();

            expect(columnHeader()['aria-sort']).toBeUndefined();
            expect(button.isSorted).toBeNull();

            button.destroy()
        })
    }
});
