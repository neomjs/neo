import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'BigDataFooterTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import FooterToolbar  from '../../../../../../examples/grid/bigData/FooterToolbar.mjs';
import MainStore      from '../../../../../../examples/grid/bigData/MainStore.mjs';

test.describe('examples/grid/bigData FooterToolbar', () => {
    test('a store assigned after its load sets the readout without waiting for another event', () => {
        // Both stores generate their rows while they are created, so their load is over before the footer sees them
        const first  = Neo.create(MainStore, {amountColumns: 10, amountRows: 10}),
              second = Neo.create(MainStore, {amountColumns: 10, amountRows: 4}),
              footer = Neo.create(FooterToolbar, {store: first});

        expect(footer.getItem('size').text).toBe('10 rows × 10 columns = 100 cells');

        footer.store = second;
        expect(footer.getItem('size').text).toBe('4 rows × 10 columns = 40 cells');
        expect(footer.getItem('max').hidden).toBe(false);

        // The footer borrows its stores: destroying it leaves them intact
        footer.destroy();
        expect(first.isDestroyed).not.toBe(true);
        expect(second.getCount()).toBe(4);

        first.destroy();
        second.destroy()
    });
});
