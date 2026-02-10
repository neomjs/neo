
import {setup} from '../../../setup.mjs';

const appName = 'ComboBoxInternalIdTest';

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
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import ComponentManager from '../../../../../src/manager/Component.mjs';
import VdomHelper         from '../../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import ComboBox       from '../../../../../src/form/field/ComboBox.mjs';
import Store          from '../../../../../src/data/Store.mjs';
import Model          from '../../../../../src/data/Model.mjs';

test.describe('Neo.form.field.ComboBox InternalId Support', () => {
    let combo, store;

    class TestModel extends Model {
        static config = {
            className: 'Test.Unit.Combo.InternalId.TestModel',
            fields   : [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}]
        }
    }
    TestModel = Neo.setupClass(TestModel);

    test.beforeEach(async () => {
        // Mock Neo.main.DomAccess
        Neo.main = {
            DomAccess: {
                focus: () => {}
            },
            addon: {
                Navigator: {
                    subscribe: () => {},
                    unsubscribe: () => {},
                    navigateTo: () => {}
                }
            }
        };
        Neo.currentWorker = {};
        Neo.currentWorker.promiseMessage = async () => ({});

        store = Neo.create(Store, {
            model: TestModel,
            autoInitRecords: true,
            data: [
                {id: 1, name: 'Item 1'},
                {id: 2, name: 'Item 2'}
            ]
        });

        combo = Neo.create(ComboBox, {
            appName,
            store,
            displayField: 'name',
            valueField  : 'id',
            labelPosition: 'top' // Avoid inline layout complexities for unit test
        });
        
        await combo.initVnode();
        combo.mounted = true;
        
        // Force picker creation
        combo.getPicker(); 
    });

    test.afterEach(() => {
        combo?.destroy();
        store?.destroy();
    });

    test('Selection from list with internalId should update value', async () => {
        // 1. Get the list component
        const list = combo.list;
        expect(list).toBeDefined();
        
        // 2. Verify List is using internalId
        expect(list.useInternalId).toBe(true);
        
        // 3. Simulate selection from List
        // ListModel stores DOM IDs (e.g., "neo-list-1__neo-record-1")
        const record = store.getAt(0);
        const internalId = store.getInternalId(record);
        const domId = list.getItemId(record); // "combo-list-id__neo-record-1"
        
        expect(domId).toContain(internalId);
        expect(domId).toContain('__');

        // 4. Trigger selection change event from the list's selection model
        // We simulate what ListModel fires: { selection: [domId] }
        await combo.onListItemSelectionChange({
            selection: [domId]
        });
        
        // 5. Assert ComboBox value
        // The value should be the record itself (since forceSelection is true default behavior for internal set)
        // or the record ID depending on how we check. ComboBox.value usually holds the record or valueField.
        // Actually ComboBox.value holds the record if selected via list.
        
        expect(combo.value).toBe(record);
        expect(combo.inputValue).toBe('Item 1');
    });
});
