/**
 * @file test/playwright/unit/grid/HeaderButtonSortable.spec.mjs
 * @summary A `sortable: false` header button keeps its click but never cycles its sort state, in a grid and a table.
 *
 * `afterSetSortable(false)` hides the sort glyph. A click used to cycle `isSorted` anyway, which showed the glyph and,
 * inside a container, sorted the Store by the column's `dataField`.
 *
 * @see Neo.grid.header.Button#onClick
 * @see Neo.table.header.Button#onClick
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
});
