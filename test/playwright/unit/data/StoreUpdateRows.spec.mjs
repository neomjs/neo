/**
 * @file test/playwright/unit/data/StoreUpdateRows.spec.mjs
 * @summary `Neo.data.Store#updateRows()` takes a batch of row edits as one change: Turbo Mode rows stay raw, the
 * rows that already are records adopt their values together, and the batch publishes once.
 *
 * Raw rows are read from `store._items` and `store.allItems._items`: `get()` and `getAt()` create the record.
 *
 * @see Neo.data.Store#updateRows
 * @see Neo.data.Store#writeRows
 * @see https://github.com/neomjs/neo/issues/20968
 */
import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'StoreUpdateRowsTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Model          from '../../../../src/data/Model.mjs';
import RecordFactory  from '../../../../src/data/RecordFactory.mjs';
import Store          from '../../../../src/data/Store.mjs';

/**
 * @summary A batch of row edits writes raw rows in place and publishes one `rowsChange`.
 */
test.describe('Store#updateRows (#20968)', () => {
    let owned;

    test.beforeEach(() => owned = []);
    test.afterEach(() => owned.reverse().forEach(store => store.destroy()));

    const create = async (config={}) => {
        const store = Neo.create(Store, {
            autoInitRecords: false,
            model: {module: Model, fields: [
                {name: 'id', type: 'Integer'},
                {name: 'score', type: 'Integer'},
                {name: 'active', type: 'Boolean'},
                {name: 'double', type: 'Integer', calculate: data => data.score * 2},
                {name: 'details', fields: [{name: 'rank', type: 'Integer'}]}
            ]},
            data: Array.from({length: 6}, (_, i) => ({id: i + 1, score: i + 1, active: i % 2 === 0, details: {rank: i + 1}})),
            ...config
        });
        owned.push(store);
        await store.ready();
        return store
    };

    const ids       = store => store.items.map(item => item.id),
          hydrated  = items => items.filter(item => RecordFactory.isRecord(item)).length,
          rawRow    = (store, id) => (store.allItems || store)._items.find(item => item.id === id),
          recording = store => {
              const events = [];
              store.on({
                  filter      : () => events.push(['filter']),
                  recordChange: data => events.push(['record', data.record.id, data.isBatch]),
                  rowsChange  : data => events.push(['rows', ...data.keys]),
                  sort        : () => events.push(['sort'])
              });
              return events
          };

    test('a 1,000-row Turbo Mode batch fires one rowsChange, no recordChange, and hydrates no row', async () => {
        const store = await create({data: Array.from({length: 1000}, (_, i) => ({id: i + 1, score: 0}))}),
              events = recording(store);

        const result = store.updateRows(store._items.map(row => ({key: row.id, values: {score: row.id * 10}})));

        expect(events.length, 'one event for the whole batch').toBe(1);
        expect(events[0][0]).toBe('rows');
        expect(events[0].slice(1), 'the changed keys, in batch order').toEqual(Array.from({length: 1000}, (_, i) => i + 1));
        expect(hydrated(store._items), 'no row became a record').toBe(0);
        expect(store._items[999].score, 'the raw row holds the new value').toBe(10000);
        expect(result).toEqual({errors: [], missing: []})
    });

    for (const autoInitRecords of [false, true]) {
        test(`rows that already are records adopt the batch together and publish recordChange with isBatch (eager=${autoInitRecords})`, async () => {
            const store = await create({autoInitRecords}),
                  first = store.get(1), second = store.get(2),
                  events = recording(store),
                  seen   = [];

            // a listener on the first notification reads the rest of the batch: every value is settled by then
            store.on('recordChange', () => seen.push([store.get(2).score, rawRow(store, 3).score]));

            store.updateRows([{key: 1, values: {score: 10}}, {key: 2, values: {score: 20}}, {key: 3, values: {score: 30}}]);

            expect(seen[0], 'the first listener reads the settled batch').toEqual([20, 30]);
            expect(events.filter(([name]) => name === 'record'), 'records publish, flagged').toEqual(
                autoInitRecords ? [['record', 1, true], ['record', 2, true], ['record', 3, true]] : [['record', 1, true], ['record', 2, true]]
            );
            expect(events.at(-1), 'rowsChange closes the batch').toEqual(['rows', 1, 2, 3]);
            expect(store.get(1), 'a record keeps its identity').toBe(first);
            expect([first.score, first.double, second.score], 'records parse and calculate as a set() would').toEqual([10, 20, 20]);
            autoInitRecords || expect(hydrated(store._items), 'the raw row stays raw').toBe(2)
        })
    }

    for (const autoInitRecords of [false, true]) {
        const published = keys => autoInitRecords ? keys.map(key => ['record', key, true]) : [];

        test(`an opted-in filter reapplies once for the whole batch, sorting with it (eager=${autoInitRecords})`, async () => {
            const store = await create({
                      autoInitRecords,
                      filters: [{property: 'active', value: true, reapplyOnRecordChange: true}],
                      sorters: [{property: 'score', direction: 'DESC', reapplyOnRecordChange: true}]
                  }),
                  events = recording(store);

            expect(ids(store)).toEqual([5, 3, 1]);

            store.updateRows([{key: 1, values: {score: 9}}, {key: 2, values: {active: true}}, {key: 5, values: {active: false}}]);

            expect(events, 'one filter pass after the records published, then the batch event').toEqual([
                ...published([1, 2, 5]), ['filter'], ['rows', 1, 2, 5]
            ]);
            expect(ids(store), 'membership and order follow the batch').toEqual([1, 3, 2]);
            autoInitRecords || expect(hydrated(store.allItems._items), 'reapplying hydrated nothing').toBe(0)
        });

        test(`an opted-in sorter reapplies once for the whole batch (eager=${autoInitRecords})`, async () => {
            const store  = await create({autoInitRecords, sorters: [{property: 'score', reapplyOnRecordChange: true}]}),
                  events = recording(store);

            store.updateRows([{key: 1, values: {score: 9}}, {key: 2, values: {score: 8}}, {key: 3, values: {score: 7}}]);

            expect(events).toEqual([...published([1, 2, 3]), ['sort'], ['rows', 1, 2, 3]]);
            expect(ids(store)).toEqual([4, 5, 6, 3, 2, 1])
        })
    }

    test('a field no opted-in sorter reads leaves the order alone', async () => {
        const store  = await create({sorters: [{property: 'score', reapplyOnRecordChange: true}]}),
              events = recording(store);

        store.updateRows([{key: 1, values: {active: false}}]);

        expect(events).toEqual([['rows', 1]])
    });

    test('an edit a listener makes while the batch publishes is an ordinary change', async () => {
        const store  = await create({autoInitRecords: true, sorters: [{property: 'score', reapplyOnRecordChange: true}]}),
              events = recording(store);

        // the batch writes a field no sorter reads; its listener then moves the record by the sorted field
        store.on('recordChange', ({isBatch, record}) => isBatch && record.id === 1 && (record.score = 10));

        store.updateRows([{key: 1, values: {active: false}}]);

        expect(events, 'the nested edit publishes unflagged, after its own sort').toEqual([
            ['record', 1, true], ['sort'], ['record', 1, undefined], ['rows', 1]
        ]);
        expect(ids(store), 'the sorter followed the nested edit').toEqual([2, 3, 4, 5, 6, 1])
    });

    test('an edit to a batch record that has not published yet is an ordinary change too', async () => {
        const store  = await create({autoInitRecords: true, sorters: [{property: 'score', reapplyOnRecordChange: true}]}),
              events = recording(store);

        store.on('recordChange', ({isBatch, record}) => isBatch && record.id === 1 && (store.get(3).score = 0));

        store.updateRows([{key: 1, values: {active: false}}, {key: 3, values: {active: false}}]);

        expect(events, 'record 3 publishes its ordinary edit first, then its prepared change').toEqual([
            ['record', 1, true], ['sort'], ['record', 3, undefined], ['record', 3, true], ['rows', 1, 3]
        ]);
        expect(ids(store)).toEqual([3, 1, 2, 4, 5, 6])
    });

    test('a key the store does not hold is skipped and returned; a batch with no row fires nothing', async () => {
        const store  = await create(),
              events = recording(store);

        expect(store.updateRows([])).toEqual({errors: [], missing: []});
        expect(store.updateRows([{key: 99, values: {score: 1}}])).toEqual({errors: [], missing: [99]});
        expect(events).toEqual([]);

        expect(store.updateRows([{key: 99, values: {score: 1}}, {key: 4, values: {score: 40}}]).missing).toEqual([99]);
        expect(events).toEqual([['rows', 4]]);
        expect(rawRow(store, 4).score).toBe(40)
    });

    test('keys go through the canonical key, and changes to one row merge with the later value winning', async () => {
        const store  = await create(),
              events = recording(store);

        store.updateRows([{key: '2', values: {score: 20, active: false}}, {key: 2, values: {score: 21}}]);

        expect(events, 'one row, under its canonical key').toEqual([['rows', 2]]);
        expect([rawRow(store, 2).score, rawRow(store, 2).active]).toEqual([21, false])
    });

    test('a write to the key, a calculated or an undeclared field throws before any row is written', async () => {
        const store  = await create(),
              events = recording(store),
              record = store.get(2);

        for (const [name, values] of [['id', {id: 9}], ['double', {double: 4}], ['unknown', {unknown: 1}]]) {
            expect(() => store.updateRows([{key: 1, values: {score: 10}}, {key: 2, values: {score: 20}}, {key: 3, values}]))
                .toThrow(new RegExp(`field: ${name}$`))
        }

        expect([rawRow(store, 1).score, record.score], 'neither the raw row nor the record moved').toEqual([1, 2]);
        expect(events).toEqual([]);

        store.updateRows([{key: 1, values: {score: 10}}]);
        expect(rawRow(store, 1).score, 'the refusals named their field; a valid batch still writes').toBe(10)
    });

    test("Soft Hydration's kept values derive again from the new data", async () => {
        const store = await create({sorters: [{property: 'double'}]}),
              row   = rawRow(store, 3);

        expect(row.double, 'sorting kept the calculated value on the raw row').toBe(6);

        store.updateRows([{key: 3, values: {score: 30}}]);

        expect(store.resolveField(row, 'double'), 'a read derives from the new score').toBe(60);
        expect(store.get(3).double, 'and so does the record created later').toBe(60)
    });

    test('a nested field writes a copy of its path, never the object the row shares', async () => {
        const details = {rank: 3},
              store   = await create({data: [{id: 1, score: 1, details}]});

        store.updateRows([{key: 1, values: {'details.rank': 30}}]);

        expect(details.rank, 'the caller\'s object is untouched').toBe(3);
        expect(rawRow(store, 1).details.rank).toBe(30);
        expect(store.get(1).get('details.rank')).toBe(30)
    });

    test('a filtered-out row takes its edit too', async () => {
        const store = await create({filters: [{property: 'active', value: true}]});

        expect(ids(store)).toEqual([1, 3, 5]);
        expect(store.updateRows([{key: 2, values: {score: 20}}]).missing).toEqual([]);
        expect(rawRow(store, 2).score).toBe(20);
        expect(ids(store), 'a filter that did not opt in stays as it was').toEqual([1, 3, 5])
    })
});
