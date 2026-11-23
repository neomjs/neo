/**
 * @file test/playwright/unit/grid/HeaderButtonAlign.spec.mjs
 * @summary `headerAlign` positions the header label over its column's digits without repeating the column's
 * `cellAlign` config. The four accepted values are `'auto'`, `'left'`, `'center'`, and `'right'`.
 *
 * - `'left'` (the default) adds no CSS class: the button's existing layout already places the label at the left edge.
 * - `'center'` adds `neo-header-align-center` → `justify-content: center`.
 * - `'right'`  adds `neo-header-align-right`  → `flex-direction: row; justify-content: end`.
 * - `'auto'`   reads `cellAlign` at runtime; changing `cellAlign` while `headerAlign` is `'auto'` moves the label.
 *
 * An unknown value is refused: `beforeSetHeaderAlign` calls `beforeSetEnumValue`, which keeps the previous value.
 * `toJSON()` exports `headerAlign` so a serialised column definition round-trips cleanly.
 *
 * @see Neo.grid.header.Button#headerAlign_
 * @see Neo.grid.header.Button#afterSetHeaderAlign
 * @see Neo.grid.header.Button#afterSetCellAlign
 * @see Neo.grid.header.Button#updateHeaderAlignCls
 * @see Neo.grid.header.Button#toJSON
 */
import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'HeaderButtonAlignTest'}});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import GridHeaderButton from '../../../../src/grid/header/Button.mjs';

const ALIGN_CENTER = 'neo-header-align-center';
const ALIGN_RIGHT  = 'neo-header-align-right';

/**
 * Helper: create a GridHeaderButton and destroy it after the callback runs.
 * @param {Object} config
 * @param {Function} fn
 */
function withButton(config, fn) {
    const button = Neo.create(GridHeaderButton, {dataField: 'value', useRippleEffect: false, ...config});
    fn(button);
    button.destroy()
}

test.describe('Neo.grid.header.Button — headerAlign', () => {
    test('default is left: no alignment class is added', () => {
        withButton({}, button => {
            expect(button.headerAlign).toBe('left');
            expect(button.cls).not.toContain(ALIGN_CENTER);
            expect(button.cls).not.toContain(ALIGN_RIGHT)
        })
    });

    test('headerAlign: left — explicit left adds no alignment class', () => {
        withButton({headerAlign: 'left'}, button => {
            expect(button.cls).not.toContain(ALIGN_CENTER);
            expect(button.cls).not.toContain(ALIGN_RIGHT)
        })
    });

    test('headerAlign: center — adds neo-header-align-center', () => {
        withButton({headerAlign: 'center'}, button => {
            expect(button.cls).toContain(ALIGN_CENTER);
            expect(button.cls).not.toContain(ALIGN_RIGHT)
        })
    });

    test('headerAlign: right — adds neo-header-align-right', () => {
        withButton({headerAlign: 'right'}, button => {
            expect(button.cls).toContain(ALIGN_RIGHT);
            expect(button.cls).not.toContain(ALIGN_CENTER)
        })
    });

    test('headerAlign: auto with cellAlign left — no alignment class', () => {
        withButton({headerAlign: 'auto', cellAlign: 'left'}, button => {
            expect(button.cls).not.toContain(ALIGN_CENTER);
            expect(button.cls).not.toContain(ALIGN_RIGHT)
        })
    });

    test('headerAlign: auto with cellAlign right — adds neo-header-align-right', () => {
        withButton({headerAlign: 'auto', cellAlign: 'right'}, button => {
            expect(button.cls).toContain(ALIGN_RIGHT)
        })
    });

    test('headerAlign: auto with cellAlign center — adds neo-header-align-center', () => {
        withButton({headerAlign: 'auto', cellAlign: 'center'}, button => {
            expect(button.cls).toContain(ALIGN_CENTER)
        })
    });

    test('headerAlign: auto — changing cellAlign at runtime moves the label class', () => {
        withButton({headerAlign: 'auto', cellAlign: 'left'}, button => {
            expect(button.cls).not.toContain(ALIGN_RIGHT);

            button.cellAlign = 'right';
            expect(button.cls).toContain(ALIGN_RIGHT);
            expect(button.cls).not.toContain(ALIGN_CENTER);

            button.cellAlign = 'center';
            expect(button.cls).toContain(ALIGN_CENTER);
            expect(button.cls).not.toContain(ALIGN_RIGHT);

            button.cellAlign = 'left';
            expect(button.cls).not.toContain(ALIGN_CENTER);
            expect(button.cls).not.toContain(ALIGN_RIGHT)
        })
    });

    test('changing headerAlign at runtime updates the class', () => {
        withButton({}, button => {
            button.headerAlign = 'right';
            expect(button.cls).toContain(ALIGN_RIGHT);

            button.headerAlign = 'center';
            expect(button.cls).toContain(ALIGN_CENTER);
            expect(button.cls).not.toContain(ALIGN_RIGHT);

            button.headerAlign = 'left';
            expect(button.cls).not.toContain(ALIGN_CENTER);
            expect(button.cls).not.toContain(ALIGN_RIGHT)
        })
    });

    test('an unknown value is refused; the previous value is kept', () => {
        withButton({headerAlign: 'right'}, button => {
            button.headerAlign = 'invalid-value';
            expect(button.headerAlign).toBe('right');
            expect(button.cls).toContain(ALIGN_RIGHT)
        })
    });

    test('all four accepted values are stored without refusal', () => {
        withButton({}, button => {
            for (const v of ['auto', 'left', 'center', 'right']) {
                button.headerAlign = v;
                expect(button.headerAlign).toBe(v)
            }
        })
    });

    test('toJSON() includes headerAlign', () => {
        withButton({headerAlign: 'right'}, button => {
            const json = button.toJSON();
            expect(json.headerAlign).toBe('right')
        })
    });

    test('toJSON() round-trips auto', () => {
        withButton({headerAlign: 'auto', cellAlign: 'right'}, button => {
            const json = button.toJSON();
            expect(json.headerAlign).toBe('auto');
            expect(json.cellAlign).toBe('right')
        })
    });

    test('a non-auto headerAlign does not react to cellAlign changes', () => {
        withButton({headerAlign: 'right', cellAlign: 'left'}, button => {
            button.cellAlign = 'center';
            // headerAlign is 'right', so the label stays right regardless of cellAlign
            expect(button.cls).toContain(ALIGN_RIGHT);
            expect(button.cls).not.toContain(ALIGN_CENTER)
        })
    })
});
