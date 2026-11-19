import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'PinnedColumnsStoreTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import MainStore      from '../../../../../../examples/grid/pinnedColumns/MainStore.mjs';
import {months}       from '../../../../../../examples/grid/pinnedColumns/MainModel.mjs';

test.describe('examples/grid/pinnedColumns MainStore', () => {
    test('a full plan: every cell filled, every total its months, the same on every load', () => {
        const store  = Neo.create(MainStore),
              second = Neo.create(MainStore);

        expect(months).toHaveLength(36);
        expect([months[0], months[35]]).toEqual([{field: 'm0', text: 'Jan', year: 2026}, {field: 'm35', text: 'Dec', year: 2028}]);
        expect(store.getCount()).toBeGreaterThanOrEqual(60);

        store.forEach(record => {
            const values = months.map(({field}) => record[field]);

            values.forEach(value => expect(Number.isInteger(value) && value > 0, `${record.product} ${record.region}`).toBe(true));
            expect(record.total).toBe(values.reduce((sum, value) => sum + value, 0))
        });

        expect(second.getAt(0).total).toBe(store.getAt(0).total);

        store.destroy();
        second.destroy()
    });
});
