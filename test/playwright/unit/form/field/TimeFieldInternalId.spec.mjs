import {setup} from '../../../setup.mjs';

const appName = 'TimeFieldInternalIdTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import VdomHelper         from '../../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import TimeField          from '../../../../../src/form/field/Time.mjs';
import Collection         from '../../../../../src/collection/Base.mjs';

test.describe('Neo.form.field.Time InternalId Support', () => {
    let timeField;

    test.beforeEach(async () => {
        timeField = Neo.create(TimeField, {
            appName,
            labelPosition: 'top',
            value: '10:00:00'
        });
        
        await timeField.initVnode();
        timeField.mounted = true;
        
        // Force picker creation
        timeField.getPicker();
    });

    test.afterEach(() => {
        timeField?.destroy();
    });

    test('Selection from list with internalId should update value without crashing', async () => {
        // 1. Get the list component
        const list = timeField.list;
        expect(list).toBeDefined();
        
        // 2. Verify List is NOT using internalId since TimeField uses a Collection
        expect(list.useInternalId).toBe(false);
        
        // 3. Verify Collection has getKeyType working
        const collection = timeField.collection;
        expect(collection).toBeInstanceOf(Collection);
        
        const keyType = collection.getKeyType();
        expect(keyType).toBeDefined(); // Might be 'string'

        // 4. Simulate selection from List
        const record = collection.items[0]; // Get the first item
        expect(record).toBeDefined();

        const recordId = record[collection.keyProperty];
        const domId = list.getItemId(recordId); 
        
        expect(domId).toContain(recordId.toString());
        expect(domId).toContain('__');

        // 5. Trigger selection change event
        timeField.onListItemClick({
            record
        });
        
        // 6. Assert TimeField value updated properly
        expect(timeField.value).toBe(timeField.formatTime(record.value));
    });
});
