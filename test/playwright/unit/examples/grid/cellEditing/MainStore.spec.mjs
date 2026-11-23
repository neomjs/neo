import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'CellEditingStoreTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import MainStore      from '../../../../../../examples/grid/cellEditing/MainStore.mjs';

/**
 * @param {Date} date
 * @returns {String} The local calendar day as YYYY-MM-DD, the day the cell and the date editor show
 */
const localDay = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

test.describe('examples/grid/cellEditing MainStore', () => {
    // Runs in the unit-tz tier too: a UTC-midnight seed reads as the previous day west of Greenwich
    test('every delivery is a local calendar day inside the editor range, in this timezone', () => {
        const store = Neo.create(MainStore),
              days  = store.items.map(record => localDay(record.delivery));

        expect(store.getCount()).toBe(40);
        expect(days[0]).toBe('2026-12-01');

        days.forEach((day, index) => {
            expect(day >= '2026-12-01' && day <= '2027-01-31', `${store.getAt(index).orderId} ${day}`).toBe(true)
        });

        store.destroy()
    });
});
