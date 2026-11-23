/**
 * @file test/playwright/unit/data/StoreUpdateRowsHeld.spec.mjs
 * @summary A row batch admits every record its store holds: a record `getRow()` answers but `get()` does not joins
 * `updateRows()`'s one transaction, so a refused batch leaves it as it was.
 *
 * The store under test keeps one record outside its collection and answers it from `getRow()` alone, the way a store
 * holds a row its filters hide in a structure of its own. A record the store does not hold stays refused
 * (`RecordFactory.spec.mjs`, "refuses a foreign or retired row before writing").
 *
 * @see Neo.data.RecordFactory#applyPreparedFields
 * @see Neo.data.Store#updateRows
 * @see https://github.com/neomjs/neo/issues/21029
 */
import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'StoreUpdateRowsHeldTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';

/**
 * @summary A store that also holds the records in `held`: `getRow()` answers them, `get()` does not.
 * @class Test.Unit.Data.HoldingStore
 * @extends Neo.data.Store
 */
class HoldingStore extends Store {
    static config = {
        /**
         * @member {String} className='Test.Unit.Data.HoldingStore'
         * @protected
         */
        className: 'Test.Unit.Data.HoldingStore'
    }

    /**
     * @member {Map} held=new Map() The records this store holds outside its collection, by key
     */
    held = new Map()

    /**
     * @summary The row of the collection, else a held record.
     * @param {Number|String} key
     * @returns {Object|Neo.data.Record|undefined}
     */
    getRow(key) {
        return super.getRow(key) ?? this.held.get(key)
    }
}

HoldingStore = Neo.setupClass(HoldingStore);

test.describe('Store#updateRows admits every record its store holds (#21029)', () => {
    let store, held, events;

    test.beforeEach(() => {
        store = Neo.create(HoldingStore, {
            model: {module: Model, fields: [
                {name: 'id', type: 'Integer'},
                {name: 'score', type: 'Integer'},
                {name: 'grade', convert: value => {
                    if (value === 'refused') throw Error('refused grade');
                    return value
                }}
            ]},
            data: [1, 2, 3].map(id => ({id, score: id, grade: 'A'}))
        });

        // The store holds record 3 outside its collection
        held = store.get(3);
        store.remove(held);
        store.held.set(3, held);

        events = [];
        store.on({
            recordChange: data => events.push(['record', data.record.id]),
            rowsChange  : data => events.push(['rows', ...data.keys])
        })
    });

    test.afterEach(() => store.destroy());

    test('a record getRow() holds but get() does not answer takes its batch edit and publishes once', () => {
        expect(store.get(3), 'control: get() does not answer the held record').toBeFalsy();
        expect(store.getRow(3), 'control: getRow() does').toBe(held);

        expect(store.updateRows([{key: 3, values: {score: 30}}, {key: 1, values: {score: 10}}])).toEqual({errors: [], missing: []});

        expect(held.score, 'the held record took its edit').toBe(30);
        expect(store.get(1).score).toBe(10);
        expect(events, 'each record once, then the batch').toEqual([['record', 3], ['record', 1], ['rows', 3, 1]])
    });

    test('a batch refused mid-write leaves the held record as it was and publishes nothing', () => {
        // the held record is written first; the next one's converter refuses
        expect(() => store.updateRows([{key: 3, values: {score: 30}}, {key: 1, values: {grade: 'refused'}}]))
            .toThrow('refused grade');

        expect(held.score, 'the held record kept its value').toBe(3);
        expect(store.get(1).grade).toBe('A');
        expect(events, 'nothing published').toEqual([]);

        // the store is not wedged: a valid batch writes
        store.updateRows([{key: 3, values: {score: 31}}]);
        expect(held.score).toBe(31)
    })
});
