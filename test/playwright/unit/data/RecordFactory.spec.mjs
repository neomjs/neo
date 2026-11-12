
import {setup} from '../../setup.mjs';

const appName = 'RecordFactoryTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Model           from '../../../../src/data/Model.mjs';
import Store           from '../../../../src/data/Store.mjs';
import RecordFactory   from '../../../../src/data/RecordFactory.mjs';

/**
 * @summary Unit tests for Neo.data.RecordFactory versioning logic.
 *
 * Verifies that:
 * 1. Records are initialized with version 0 or 1.
 * 2. Version increments when fields are modified.
 * 3. Version does not increment for redundant updates (identical values).
 * 4. Version increments only once for bulk updates (record.set()).
 */
test.describe('Neo.data.RecordFactory', () => {
    let model;

    test.beforeEach(() => {
        model = Neo.create(Model, {
            fields: [
                {name: 'id',   type: 'String'},
                {name: 'name', type: 'String'},
                {name: 'age',  type: 'Integer'}
            ]
        });
    });

    test('Record version starts at 1 with initial data', () => {
        const record = RecordFactory.createRecord(model, {
            id  : '1',
            name: 'John'
        });

        expect(record.version).toBe(1);
    });

    for (const trackModifiedFields of [false, true]) {
        test(`scoped field adoption restores exact values, calculated fields and version (tracking=${trackModifiedFields})`, () => {
            const schema = Neo.create(Model, {trackModifiedFields, fields: [
                {name: 'id'}, {name: 'amount', type: 'Integer'},
                {name: 'double', calculate: data => 2 * data.amount},
                {name: 'details', fields: [{name: 'note'}]},
                {name: 'check', convert(value) {
                    if (value === 'refused') throw Error('refused value');
                    return value
                }}
            ]});
            const store    = Neo.create(Store, {model: schema, data: [{id: 'first', amount: 1}, {id: 'last', amount: 2}]});
            const first    = store.get('first'), last = store.get('last');
            const observed = [];
            let   sealed   = false;
            store.on('recordChange', ({record, fields}) => {
                observed.push([record.id, sealed, first.double, last.double, fields.map(field => field.name)])
            });
            const before  = [first, last].map(row => ({data: row.toJSON(), version: row.version, dirty: row.isModified}));
            const updates = [{record: first, fields: {amount: 3, 'details.note': 'new'}},
                {record: last, fields: {amount: 3, check: 'refused'}}];
            expect(() => RecordFactory.applyPreparedFields(store.model, updates)).toThrow('refused value');
            expect(observed).toEqual([]);
            for (const [i, record] of [first, last].entries()) {
                expect({data: record.toJSON(), version: record.version, dirty: record.isModified}).toEqual(before[i])
            }
            updates[1].fields.check = 'accepted';
            expect(RecordFactory.applyPreparedFields(store.model, updates, () => { sealed = true })).toEqual([]);
            expect(observed).toEqual([
                ['first', true, 6, 6, ['amount', 'details.note', 'double']],
                ['last', true, 6, 6, ['amount', 'check', 'double']]
            ]);
            expect(first.get('details.note')).toBe('new');
            expect(last.double).toBe(6);
            expect(first.version).toBe(before[0].version + 1);
            expect(first.isModified).toBe(true);
            if (trackModifiedFields) expect(first.isModifiedField('amount')).toBe(true);
            store.destroy()
        });
    }

    test('publishes the same converted values and field deltas as an ordinary native set', () => {
        const schema = Neo.create(Model, {fields: [
            {name: 'id'}, {name: 'quantity', type: 'Integer'},
            {name: 'tags', convert(input) {
                if (input === 'invalid') throw Error('invalid tags');
                return input.split(',')
            }}
        ]});
        const store = Neo.create(Store, {model: schema, data: ['ordinary', 'prepared'].map(id =>
            ({id, quantity: 1, tags:'a,b'}))});
        const ordinary = store.get('ordinary'), prepared = store.get('prepared'), seen = new Map();
        store.on('recordChange', ({record, fields}) => seen.set(record.id, fields));
        const fields = {quantity: '7', tags: 'c,d'};
        ordinary.set(fields);
        expect(RecordFactory.applyPreparedFields(store.model, [{record: prepared, fields}])).toEqual([]);
        expect(seen.get('prepared')).toEqual(seen.get('ordinary'));
        expect(prepared.quantity).toBe(7);
        expect(prepared.tags).toEqual(['c', 'd']);
        const before = prepared.version;
        seen.clear();
        expect(() => RecordFactory.applyPreparedFields(store.model,
            [{record: prepared, fields: {quantity:'9', tags:'invalid'}}])).toThrow('invalid tags');
        expect([prepared.quantity, prepared.tags, prepared.version, seen.size]).toEqual([7, ['c', 'd'], before, 0]);
        prepared.set = () => {};
        expect(() => RecordFactory.applyPreparedFields(store.model, [{record: prepared, fields}])).toThrow('bypassed');
        store.destroy()
    });

    test('retains committed values on observer failure and refuses a foreign or retired row before writing', () => {
        const rows   = [{id: 'a', name: 'A'}, {id: 'b', name: 'B'}];
        const store  = Neo.create(Store, {model, data: rows});
        const a      = store.get('a'), b = store.get('b'), fault = Error('observer');
        const values = [];
        store.on('recordChange', ({record}) => {
            values.push([record.id, a.name, b.name]);
            if (record === a) throw fault
        });
        const updates = [a, b].map(record => ({record, fields: {name: record.name.toLowerCase()}}));
        expect(RecordFactory.applyPreparedFields(store.model, updates)).toEqual([fault]);
        expect(values).toEqual([['a','a','b'], ['b','a','b']]);
        const detached   = RecordFactory.createRecord(store.model, {id:'a', name:'detached'});
        const otherModel = Neo.create(Model, {fields: [{name:'id'}, {name:'name'}]});
        const foreign    = RecordFactory.createRecord(otherModel, {id:'foreign', name:'foreign'});
        for (const record of [detached, foreign]) {
            expect(() => RecordFactory.applyPreparedFields(store.model, [
                {record:a, fields:{name:'changed'}}, {record, fields:{name:'invalid'}}
            ])).toThrow('non-key');
        }
        expect([a.name, b.name, values.length]).toEqual(['a','b',2]);
        store.destroy();
        otherModel.destroy()
    });

    test('rejects keys and async adopters before invoking the writer', () => {
        const row      = RecordFactory.createRecord(model, {id:'a', name:'Ada'});
        let   invoked  = false;
        const keyEdit  = [{record: row, fields: {id:'b'}}];
        const nameEdit = [{record: row, fields: {name:'Grace'}}];
        expect(() => RecordFactory.applyPreparedFields(model, keyEdit, () => { invoked = true })).toThrow('non-key');
        expect(() => RecordFactory.applyPreparedFields(model, nameEdit, async () => { invoked = true })).toThrow('synchronous');
        expect(invoked).toBe(false);
        expect(() => RecordFactory.applyPreparedFields(model, nameEdit, () => row.set({id:'b'}))).toThrow('adopting prepared');
        expect(() => RecordFactory.applyPreparedFields(model, nameEdit, () => row.reset({name:'else'}))).toThrow('admitted native');
        expect(() => RecordFactory.applyPreparedFields(model, nameEdit, () =>
            RecordFactory.setRecordFields({model, record: row, fields: {id:'b'}}))).toThrow('admitted native');
        expect(row.id).toBe('a')
    });

    test('Record version starts at 0 (or 1 depending on defaults) with empty data', () => {
        // When creating a record with no data and no default values,
        // no fields are marked as changed, so the version should remain at 0.
        const record = RecordFactory.createRecord(model, {});
        expect(record.version).toBe(0);
    });

    test('Record version increments on property change', () => {
        const record = RecordFactory.createRecord(model, {
            id  : '1',
            name: 'John'
        });

        expect(record.version).toBe(1);

        record.name = 'Jane';
        expect(record.version).toBe(2);

        record.age = 30;
        expect(record.version).toBe(3);
    });

    test('Record version increments once for bulk updates', () => {
        const record = RecordFactory.createRecord(model, {
            id  : '1',
            name: 'John'
        });

        expect(record.version).toBe(1);

        record.set({
            name: 'Jane',
            age : 25
        });

        expect(record.version).toBe(2);
    });

    test('Record version does not increment for identical values', () => {
        const record = RecordFactory.createRecord(model, {
            id  : '1',
            name: 'John'
        });

        expect(record.version).toBe(1);

        record.name = 'John';
        expect(record.version).toBe(1);

        record.set({
            name: 'John'
        });

        // Even though 'age' was undefined and is not set here,
        // no actual value change occurs, so version should be stable.
        expect(record.version).toBe(1);
    });

    test('Supports intermediate and leaf array bracket paths in field mappings (#4546)', () => {
        const mappedModel = Neo.create(Model, {
            fields: [
                {name: 'id',          type: 'String'},
                {name: 'firstItem',   type: 'String',  mapping: 'items[0].name'},
                {name: 'secondTag',   type: 'String',  mapping: 'tags[1]'},
                {name: 'primaryRole', type: 'String',  mapping: 'user.roles[0]'},
                {name: 'cellScore',   type: 'Integer', mapping: 'matrix[0][1].score'},
                {name: 'zeroScore',   type: 'Integer', mapping: 'scores[0]',         defaultValue: 99},
                {name: 'falseFlag',   type: 'Boolean', mapping: 'flags[1]',          defaultValue: true},
                {name: 'missingLeaf', type: 'String',  mapping: 'tags[5]',           defaultValue: 'fallback-tag'},
                {name: 'missingCell', type: 'Integer', mapping: 'emptyMatrix[0][1]', defaultValue: 42}
            ]
        });

        const rawData = {
            id         : 'rec-1',
            items      : [{name: 'Alpha'}, {name: 'Beta'}],
            tags       : ['neo', 'worker'],
            user       : {roles: ['maintainer', 'reviewer']},
            matrix     : [[{score: 10}, {score: 95}]],
            scores     : [0],
            flags      : [true, false],
            emptyMatrix: []
        };

        const record = RecordFactory.createRecord(mappedModel, rawData);

        expect(record.firstItem).toBe('Alpha');
        expect(record.secondTag).toBe('worker');
        expect(record.primaryRole).toBe('maintainer');
        expect(record.cellScore).toBe(95);
        expect(record.zeroScore).toBe(0);
        expect(record.falseFlag).toBe(false);
        expect(record.missingLeaf).toBe('fallback-tag');
        expect(record.missingCell).toBe(42);

        const parsedIntermediate = RecordFactory.parseRecordValue({
            record,
            field       : mappedModel.getField('firstItem'),
            recordConfig: {items: [{name: 'Override'}]}
        });
        expect(parsedIntermediate).toBe('Override');

        const parsedLeaf = RecordFactory.parseRecordValue({
            record,
            field       : mappedModel.getField('secondTag'),
            recordConfig: {tags: ['first', 'second']}
        });
        expect(parsedLeaf).toBe('second');

        mappedModel.destroy();
    });

    test('Neo.nsWithArrays preserves falsy leaves and returns undefined on out-of-bounds intermediates', () => {
        expect(Neo.nsWithArrays('scores[0]', false, {scores: [0, 5]})).toBe(0);
        expect(Neo.nsWithArrays('flags[1]',  false, {flags: [true, false]})).toBe(false);
        expect(Neo.nsWithArrays('grid[0][1]', false, {grid: [['a', '']]})).toBe('');
        expect(Neo.nsWithArrays('grid[3][1]', false, {grid: [['a', '']]})).toBeUndefined();
    });

    test('A Date field keeps null instead of turning it into 1970-01-01 (#20660)', () => {
        const dateModel = Neo.create(Model, {
            fields: [
                {name: 'id',       type: 'String'},
                {name: 'due',      type: 'Date'},
                {name: 'required', type: 'Date', nullable: false}
            ]
        });

        expect(RecordFactory.createRecord(dateModel, {id: '1', due: null}).due).toBeNull();
        // An explicit undefined takes parseRecordValue's null default; an omitted field is never parsed.
        expect(RecordFactory.createRecord(dateModel, {id: '2', due: undefined}).due).toBeNull();
        expect(RecordFactory.createRecord(dateModel, {id: '3'}).due).toBeUndefined();

        const iso    = '2026-11-09T10:00:00.000Z',
              record = RecordFactory.createRecord(dateModel, {id: '4', due: iso, required: iso});

        expect(record.due).toBeInstanceOf(Date);
        expect(record.due.toISOString()).toBe(iso);

        record.set({due: null});
        expect(record.due).toBeNull();

        record.set({required: null});
        expect(record.required.toISOString()).toBe(iso);

        dateModel.destroy();
    });
});
