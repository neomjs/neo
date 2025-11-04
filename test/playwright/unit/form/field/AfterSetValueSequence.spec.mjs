import {setup} from '../../../setup.mjs';

const appName = 'AfterSetValueSequence';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import ComboBox        from '../../../../../src/form/field/ComboBox.mjs';
import Text            from '../../../../../src/form/field/Text.mjs';

class MyComboBox extends ComboBox {
    static config = {
        className: 'Test.MyComboBox',

        displayField: 'country',
        valueField  : 'country',
        value       : 'Angola', // Initial value
        store: {
            keyProperty: 'country',
            model: {
                fields: [
                    {name: 'country', type: 'String'}
                ]
            },
            data  : [
                {country: 'Angola'},
                {country: 'Algeria'}
            ]
        }
    }

    afterSetValue(value, oldValue) {
        this.executionOrder.push('MyComboBox.afterSetValue');
        super.afterSetValue(value, oldValue);
    }
}
MyComboBox = Neo.setupClass(MyComboBox);

class MyTextField extends Text {
    static config = {
        className: 'Test.MyTextField'
    }

    afterSetValue(value, oldValue) {
        this.executionOrder.push('MyTextField.afterSetValue');
        super.afterSetValue(value, oldValue);
    }
}
MyTextField = Neo.setupClass(MyTextField);


test.describe('Neo.form.field.AfterSetValueSequence', () => {
    test('TextField afterSetValue sequence should fire change event after the full method chain', async () => {
        const executionOrder = [];

        const field = Neo.create(MyTextField, {
            // pass array to instance so it's available in afterSetValue
            executionOrder
        });

        field.on('change', (changeEvent) => {
            executionOrder.push('change event');
            expect(changeEvent.value).toBe('new value');
        });

        // Trigger the change
        field.value = 'new value';

        // Assert the order
        expect(executionOrder).toEqual(['MyTextField.afterSetValue', 'MyTextField.afterSetValue', 'change event']);
        expect(field.value).toBe('new value');

        field.destroy();
    });

    test('ComboBox afterSetValue sequence should fire change event after the full method chain', async () => {
        const executionOrder = [];

        const field = Neo.create(MyComboBox, {
            // pass array to instance so it's available in afterSetValue
            executionOrder
        });

        expect(Neo.isRecord(field.value)).toBe(true);
        expect(field.value.country).toBe('Angola');

        field.on('change', (changeEvent) => {
            executionOrder.push('combo change event');

            expect(Neo.isRecord(field.value)).toBe(true);
            expect(field.value.country).toBe('Algeria');
        });

        // Trigger the change
        field.value = 'Algeria';

        expect(Neo.isRecord(field.value)).toBe(true);
        expect(field.value.country).toBe('Algeria');

        // Required since change events are delayed in ComboBox
        await field.timeout(35);

        // Assert the order
        expect(executionOrder).toEqual(['MyComboBox.afterSetValue', 'MyComboBox.afterSetValue', 'combo change event']);

        expect(Neo.isRecord(field.value)).toBe(true);
        expect(field.value.country).toBe('Algeria');

        field.destroy();
    });
});
