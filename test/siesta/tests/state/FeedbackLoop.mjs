import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import ComboBox        from '../../../../src/form/field/ComboBox.mjs';
import Container       from '../../../../src/container/Base.mjs';
import StateProvider   from '../../../../src/state/Provider.mjs';
import Store           from '../../../../src/data/Store.mjs';

StartTest(t => {

    const mainComponent = Neo.create(Container, {
        stateProvider: {
            module: StateProvider,
            data  : {
                country     : 'Angola',
                countryLabel: 'Country:'
            }
        },
        items: [{
            module      : ComboBox,
            displayField: 'country',
            valueField  : 'country',
            bind: {
                labelText: data => data.countryLabel,
                value    : data => data.country
            },
            store: {
                module     : Store,
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
        }]
    });

    const provider = mainComponent.getStateProvider();
    const comboBox = mainComponent.down('combobox');

    let changeListenerCalls = 0;

    comboBox.on('change', () => {
        changeListenerCalls++;
    });

    t.it('Binding should work for simple and complex configs', t => {
        t.is(comboBox.labelText, 'Country:', 'Simple binding for labelText should work on init');
        t.is(Neo.isRecord(comboBox.value), true, 'Initial ComboBox value should be a record');
        t.is(comboBox.value.country, 'Angola', 'Initial ComboBox record should contain `Angola`');

        // Assert that change listener was NOT called on initial binding
        t.is(changeListenerCalls, 0, 'Change listener should NOT be called on initial binding');

        // 3. Now, let's test an update
        provider.setData({
            country     : 'Algeria',
            countryLabel: 'Select Country:'
        });

        t.is(comboBox.labelText, 'Select Country:', 'Simple binding for labelText should work on update');
        t.is(Neo.isRecord(comboBox.value), true, 'Updated ComboBox value should be a record');
        t.is(comboBox.value.country, 'Algeria', 'Updated ComboBox record should contain `Algeria`');

        // Assert that change listener was NOT called on programmatic update
        t.is(changeListenerCalls, 1, 'Change listener should be called on programmatic update');

        mainComponent.destroy();
    });

    t.it('Simulated user interaction should fire the change event', async t => {
        // Create a new ComboBox instance for this test to avoid interference
        const userSimulatedComboBox = Neo.create(ComboBox, {
            displayField: 'country',
            valueField  : 'country',
            value       : 'Angola', // Initial value
            store: {
                module     : Store,
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
        });

        let userChangeListenerCalls = 0;
        userSimulatedComboBox.on('change', data => {
            userChangeListenerCalls++;
        });

        t.is(userChangeListenerCalls, 0, 'Change listener count should be 0');

        userSimulatedComboBox.value = 'Algeria';

        t.is(Neo.isRecord(userSimulatedComboBox.value), true, 'Updated ComboBox value should be a record');
        t.is(userSimulatedComboBox.value.country, 'Algeria', 'Updated ComboBox record should contain `Algeria`');

        await userSimulatedComboBox.timeout(35);

        t.is(userChangeListenerCalls, 1, 'Change listener count should be 1');

        t.is(Neo.isRecord(userSimulatedComboBox.value), true, 'Updated ComboBox value should be a record');
        t.is(userSimulatedComboBox.value.country, 'Algeria', 'Updated ComboBox record should contain `Algeria`');

        userSimulatedComboBox.destroy();
    });

    t.it('Should simulate feedback loop and prevent infinite recursion', async t => {
        let setDataCallCount = 0;

        // Mock the provider's setData to count calls
        const originalSetData = provider.setData;
        provider.setData = function(...args) {
            setDataCallCount++;
            originalSetData.apply(this, args);
        };

        // Simulate the controller's onCountryFieldChange
        const mockOnCountryFieldChange = async (data) => {
            const record = comboBox.store.find('country', data.value)?.[0]; // Mimic controller logic
            if (record) {
                provider.setData({
                    country: data.value,
                    countryRecord: record // Assuming countryRecord is also set
                });
            }
        };

        // Attach the mock controller logic to the ComboBox's change event
        comboBox.on('change', mockOnCountryFieldChange);

        // Simulate initial state change (e.g., from hash change)
        // This will trigger the ComboBox's value update, which in turn fires its change event
        // and then our mock controller logic.
        provider.setData({ country: 'Algeria' });

        await provider.timeout(35);

        t.is(setDataCallCount, 1, 'Change listener count should be 1');

        // Clean up
        comboBox.un('change', mockOnCountryFieldChange);
        provider.setData = originalSetData; // Restore original setData
        mainComponent.destroy();
    });
});
