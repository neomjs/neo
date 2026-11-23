import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'GridExportStoreTest'}});

import {test, expect}                                       from '@playwright/test';
import Neo                                                  from '../../../../../../src/Neo.mjs';
import * as core                                            from '../../../../../../src/core/_export.mjs';
import MainStore, {FORMULA_CUSTOMER, FORMULA_INVOICE, ROWS} from '../../../../../../examples/grid/export/MainStore.mjs';

test.describe('examples/grid/export MainStore', () => {
    test('300 seeded invoices, one formula-like customer, the same on every load', () => {
        const store  = Neo.create(MainStore),
              second = Neo.create(MainStore);

        expect(store.getCount()).toBe(ROWS);
        expect(store.getAt(0).invoice).toBe('INV-1001');
        expect(store.getAt(ROWS - 1).invoice).toBe(`INV-${1000 + ROWS}`);

        expect(store.items.filter(record => /^[=+\-@]/.test(record.customer)).map(record => record.invoice)).toEqual([FORMULA_INVOICE]);
        expect(store.items.find(record => record.invoice === FORMULA_INVOICE).customer).toBe(FORMULA_CUSTOMER);

        store.forEach(record => {
            expect(record.amount, record.invoice).toBeGreaterThan(0);
            expect(record.date, record.invoice).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        });

        // Seeded: a second store holds the same rows
        expect(second.getAt(150).amount).toBe(store.getAt(150).amount);
        expect(second.getAt(150).customer).toBe(store.getAt(150).customer);

        store.destroy();
        second.destroy()
    });
});
