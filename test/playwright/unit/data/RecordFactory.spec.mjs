
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
test.describe.serial('Neo.data.RecordFactory', () => {
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
});
