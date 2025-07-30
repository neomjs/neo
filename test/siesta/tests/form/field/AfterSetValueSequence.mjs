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

StartTest(t => {
    t.it('TextField afterSetValue sequence should fire change event after the full method chain', t => {
        const executionOrder = [];

        const field = Neo.create(MyTextField, {
            // pass array to instance so it's available in afterSetValue
            executionOrder
        });

        field.on('change', (changeEvent) => {
            executionOrder.push('change event');
            t.is(changeEvent.value, 'new value', 'Change event should contain the new value');
        });

        // Trigger the change
        field.value = 'new value';

        // Assert the order
        t.isDeeplyStrict(executionOrder, ['MyTextField.afterSetValue', 'MyTextField.afterSetValue', 'change event'], 'Execution order is correct: afterSetValue runs before the change event');
        t.is(field.value, 'new value', 'Value is set correctly on the instance');

        field.destroy();
    });

    t.it('ComboBox afterSetValue sequence should fire change event after the full method chain', async t => {
        const executionOrder = [];

        const field = Neo.create(MyComboBox, {
            // pass array to instance so it's available in afterSetValue
            executionOrder
        });

        t.is(Neo.isRecord(field.value), true, 'Initial ComboBox value should be a record');
        t.is(field.value.country, 'Angola', 'Initial ComboBox record should contain `Angola`');

        field.on('change', (changeEvent) => {
            executionOrder.push('combo change event');

            t.is(Neo.isRecord(field.value), true, 'Updated ComboBox value should be a record');
            t.is(field.value.country, 'Algeria', 'Updated ComboBox record should contain `Algeria`');
        });

        // Trigger the change
        field.value = 'Algeria';

        t.is(Neo.isRecord(field.value), true, 'Updated ComboBox value should be a record');
        t.is(field.value.country, 'Algeria', 'Updated ComboBox record should contain `Algeria`');

        // Required since change events are delayed in ComboBox
        await field.timeout(35);

        // Assert the order
        t.isDeeplyStrict(executionOrder, ['MyComboBox.afterSetValue', 'MyComboBox.afterSetValue', 'combo change event'], 'Execution order is correct: afterSetValue runs before the change event');

        t.is(Neo.isRecord(field.value), true, 'Updated ComboBox value should be a record');
        t.is(field.value.country, 'Algeria', 'Updated ComboBox record should contain `Algeria`');

        field.destroy();
    });
});
