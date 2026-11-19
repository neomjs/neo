import {setup}        from '../../setup.mjs';
import {expect, test} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import MainStore                       from '../../../../examples/grid/serverSide/MainStore.mjs';
import SimulatedConnection, {rowCount} from '../../../../examples/grid/serverSide/SimulatedConnection.mjs';

setup({appConfig: {name: 'ServerSideExampleTest'}});

test('seeded orders vary customers and countries without the old eight-row cycle', () => {
    const connection = Neo.create(SimulatedConnection);
    try {
        const rows = connection.generateRows(), first = rows.slice(0, 50);
        expect(rows[0]).toEqual({id: 1, customer: 'Granite Co', country: 'DK', amount: 1120});
        expect(new Set(first.map(row => row.customer)).size).toBeGreaterThan(20);
        expect(new Set(first.map(row => row.country)).size).toBe(8);
        expect(rows.filter(row => row.country === 'DE')).toHaveLength(12539);
        expect(first.slice(0, 8).map(row => row.country)).not.toEqual(first.slice(8, 16).map(row => row.country));
        expect(connection.generateRows().slice(0, 50)).toEqual(first)
    } finally {
        connection.destroy()
    }
});

test('the real pipeline admits an example connection and only commits one page', async () => {
    const store      = Neo.create(MainStore),
          connection = store.pipeline.connection;

    try {
        expect(connection).toBeInstanceOf(SimulatedConnection);
        expect(connection.delay).toBe(350);
        connection.delay = 0;
        await store.load();
        expect(store.count).toBe(50);
        expect(store.totalCount).toBe(rowCount);
        expect(store.items.map(row => row.id)).toEqual(Array.from({length: 50}, (_, index) => index + 1));

        store.currentPage = 2;
        await expect.poll(() => store.items[0]?.id).toBe(51);
        expect(connection.requestCount).toBe(2);
        expect(connection.lastRequest.page).toBe(2);
        expect(store.count).toBe(50);
        expect(store.items[0].id).toBe(51)
    } finally {
        store.destroy()
    }
});

test('remote sort and filter each issue one read and reset to the first page', async () => {
    const store      = Neo.create(MainStore),
          connection = store.pipeline.connection;

    try {
        connection.delay = 0;
        await store.load();
        store.sorters = [{property: 'amount', direction: 'DESC'}];
        await expect.poll(() => store.count).toBe(50);
        expect(connection.requestCount).toBe(2);
        expect(connection.lastRequest.sorters).toEqual([{property: 'amount', direction: 'DESC'}]);
        const amounts = store.items.map(row => row.amount);
        expect(amounts).toEqual(amounts.slice().sort((a, b) => b - a));

        store.filters = [{property: 'country', operator: '===', value: 'DE'}];
        await expect.poll(() => store.count).toBe(50);
        expect(connection.requestCount).toBe(3);
        expect(connection.lastRequest.filters).toEqual([{property: 'country', operator: '===', value: 'DE'}]);
        expect(store.currentPage).toBe(1);
        expect(store.count).toBe(50);
        expect(store.items.every(row => row.country === 'DE')).toBe(true);
        expect(store.totalCount).toBe(connection.generateRows().filter(row => row.country === 'DE').length)
    } finally {
        store.destroy()
    }
});

test('seeded reads repeat and response rows cannot mutate the simulated server dataset', async () => {
    const first  = Neo.create(SimulatedConnection, {delay: 0}),
          second = Neo.create(SimulatedConnection, {delay: 0});

    try {
        const response = await first.read(),
              original = response.data.map(row => ({...row}));
        expect((await second.read()).data).toEqual(original);
        response.data[0].country = 'changed';
        expect((await first.read()).data).toEqual(original)
    } finally {
        first.destroy();
        second.destroy()
    }
});
