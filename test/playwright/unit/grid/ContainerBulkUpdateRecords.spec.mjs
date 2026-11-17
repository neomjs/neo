/**
 * @summary Pins both container adapters to one store batch without hydrating Turbo Mode rows.
 * @see https://github.com/neomjs/neo/issues/20974
 */
import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'ContainerBulkUpdateRecordsTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import GridContainer  from '../../../../src/grid/Container.mjs';
import Model          from '../../../../src/data/Model.mjs';
import RecordFactory  from '../../../../src/data/RecordFactory.mjs';
import Store          from '../../../../src/data/Store.mjs';
import TableContainer from '../../../../src/table/Container.mjs';

for (const [name, Container] of [['grid', GridContainer], ['table', TableContainer]]) {
    test.describe(`${name}.Container#bulkUpdateRecords`, () => {
        let container, store;

        test.beforeEach(async () => {
            store = Neo.create(Store, {
                autoInitRecords: false,
                keyProperty    : 'symbol',
                model          : {module: Model, fields: [
                    {name: 'symbol', type: 'String'},
                    {name: 'value', type: 'Integer'},
                    {name: 'double', calculate: data => data.value * 2},
                    {name: 'details', fields: [{name: 'rank', type: 'Integer'}]}
                ]},
                data: [{symbol: 'A', value: 1, details: {rank: 1}}, {symbol: 'B', value: 2, details: {rank: 2}}]
            });
            await store.ready();
            // Only the adapter is under test: repainting belongs to the body's separate fixture.
            container = {store, body: {update() {}}}
        });

        test.afterEach(() => store.destroy());

        const update = function(records) {
            Container.prototype.bulkUpdateRecords.call(container, records)
        };

        test('writes raw rows without hydration and publishes one rowsChange', () => {
            const events = [];
            store.on('rowsChange', data => events.push(data));
            update([{symbol: 'A', value: 10}, {symbol: 'B', value: 20}]);
            expect(store._items.map(row => row.value)).toEqual([10, 20]);
            expect(store._items.some(row => RecordFactory.isRecord(row))).toBe(false);
            expect(events).toHaveLength(1);
            expect(events[0].keys).toEqual(['A', 'B']);
            expect(container.body).not.toHaveProperty('silentVdomUpdate')
        });

        test('ignores the key, calculated and undeclared fields without changing the input', () => {
            const record = Object.freeze({symbol: 'A', value: 10, double: 999, unknown: true});
            expect(() => update([record])).not.toThrow();
            expect(store.getRow('A').value).toBe(10);
            expect(store.getRow('A')).not.toHaveProperty('unknown');
            expect(store.resolveField(store.getRow('A'), 'double')).toBe(20);
            expect(store.getRow('B').value).toBe(2)
        });

        test('keeps nested declared values and skips missing rows', () => {
            update([{symbol: 'A', details: {rank: 9, unknown: true}}, {symbol: 'missing', value: 99}]);
            expect(store.resolveField(store.getRow('A'), 'details.rank')).toBe(9);
            expect(store.count).toBe(2);
            expect(RecordFactory.isRecord(store.getRow('A'))).toBe(false)
        });

        test('existing records publish as one batch and keep their identity', () => {
            const first = store.get('A'), events = [];
            store.on('recordChange', data => events.push(data));
            update([{symbol: 'A', value: 10}, {symbol: 'B', value: 20}]);
            expect(store.getRow('A')).toBe(first);
            expect(first.value).toBe(10);
            expect(first.double).toBe(20);
            expect(events).toHaveLength(1);
            expect(events[0].isBatch).toBe(true);
            expect(RecordFactory.isRecord(store.getRow('B'))).toBe(false)
        });

        test('an empty batch does not publish', () => {
            let events = 0;
            store.on('rowsChange', () => events++);
            update([]);
            expect(events).toBe(0)
        });

        test('an opted-in sorter reapplies once for the batch', () => {
            store.sorters = [{property: 'value', reapplyOnRecordChange: true}];
            let sorts = 0;
            store.on('sort', () => sorts++);
            update([{symbol: 'A', value: 30}, {symbol: 'B', value: 20}]);
            expect(sorts).toBe(1);
            expect(store._items.map(row => row.symbol)).toEqual(['B', 'A']);
            expect(store._items.some(row => RecordFactory.isRecord(row))).toBe(false)
        });

        test('an opted-in filter reapplies once for the batch', () => {
            store.filters = [{property: 'value', operator: '>', value: 0, reapplyOnRecordChange: true}];
            let filters = 0;
            store.on('filter', () => filters++);
            update([{symbol: 'A', value: 10}, {symbol: 'B', value: -1}]);
            expect(filters).toBe(1);
            expect(store._items.map(row => row.symbol)).toEqual(['A']);
            expect(store.allItems._items.some(row => RecordFactory.isRecord(row))).toBe(false)
        })
    })
}
