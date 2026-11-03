
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
            emptyMatrix: []
        };

        const record = RecordFactory.createRecord(mappedModel, rawData);

        expect(record.firstItem).toBe('Alpha');
        expect(record.secondTag).toBe('worker');
        expect(record.primaryRole).toBe('maintainer');
        expect(record.cellScore).toBe(95);
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
});
