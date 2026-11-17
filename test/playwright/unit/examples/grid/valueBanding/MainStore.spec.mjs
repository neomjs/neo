import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'ValueBandingExampleTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import MainStore      from '../../../../../../examples/grid/valueBanding/MainStore.mjs';

test('the default directory is repeatable and opens on three unequal country bands', () => {
    const store = Neo.create(MainStore), second = Neo.create(MainStore);

    try {
        const data = store.items.map(record => record.toJSON()),
            runs   = [];

        expect(data).toEqual(second.items.map(record => record.toJSON()));
        expect(data.length).toBeGreaterThanOrEqual(80);
        expect(data.length).toBeLessThanOrEqual(150);
        expect(new Set(data.map(record => record.name)).size).toBe(data.length);

        for (const record of data) {
            expect([record.country, record.department, record.name, record.role].every(value =>
                typeof value === 'string' && value.length > 0 && !/First_|Last_/.test(value))).toBe(true);

            if (runs.at(-1)?.country === record.country) runs.at(-1).count++;
            else runs.push({country: record.country, count: 1})
        }

        expect(runs.slice(0, 3)).toEqual([
            {country: 'Canada', count: 4}, {country: 'Denmark', count: 7}, {country: 'Finland', count: 10}
        ]);
        expect(new Set(runs.map(run => run.country)).size).toBe(runs.length)
    } finally {
        store.destroy();
        second.destroy()
    }
});

test('department bands subdivide the directory without changing country bands or row order', () => {
    const store = Neo.create(MainStore, {valueBandingFields: ['country']});

    try {
        const order = store.items.map(record => record.id),
            bands   = order.map(id => store.valueBandsMap.get(id).country);

        expect(bands.slice(0, 12)).toEqual([
            true, true, true, true, false, false, false, false, false, false, false, true
        ]);

        store.valueBandingFields = ['country', 'department'];

        expect(store.items.map(record => record.id)).toEqual(order);
        expect(order.map(id => store.valueBandsMap.get(id).country)).toEqual(bands);
        expect(store.valueBandsMap.get(1).department).toBe(store.valueBandsMap.get(2).department);
        expect(store.valueBandsMap.get(3).department).not.toBe(store.valueBandsMap.get(2).department);

        store.valueBandingFields = ['country'];
        expect(order.map(id => store.valueBandsMap.get(id).country)).toEqual(bands);
        expect(store.valueBandsMap.get(1).department).toBeUndefined()
    } finally {
        store.destroy()
    }
});
