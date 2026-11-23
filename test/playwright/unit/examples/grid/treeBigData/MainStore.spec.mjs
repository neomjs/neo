import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'TreeBigDataStoreTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import FooterToolbar  from '../../../../../../examples/grid/treeBigData/FooterToolbar.mjs';
import MainStore      from '../../../../../../examples/grid/treeBigData/MainStore.mjs';

test.describe('examples/grid/treeBigData MainStore', () => {
    for (const hidden of [false, true]) {
        test(`a smaller size retires the rows it drops${hidden ? ', also while a filter hides every row' : ''}`, () => {
            const store  = Neo.create(MainStore, {amountRows: 2000}),
                  footer = Neo.create(FooterToolbar, {store}),
                  filter = store.getFilter('firstname');

            if (hidden) {
                filter.value = 'Zyxwvuts';
                expect(store.getCount()).toBe(0)
            }

            store.amountRows = 1000;

            // The filter outlives the resize, and clearing it shows the new population alone
            if (hidden) {
                expect(store.getCount()).toBe(0);
                filter.value = null
            }

            expect(store.get('1000')).toBeTruthy();
            expect(store.get('1001')).toBeFalsy();
            expect(store.get('2000')).toBeFalsy();
            expect(store.getCount()).toBeGreaterThan(0);
            expect(footer.getItem('size').text).toMatch(/^1,000 rows/);

            footer.destroy();
            store.destroy()
        })
    }
});
