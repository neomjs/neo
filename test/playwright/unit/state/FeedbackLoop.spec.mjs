import {setup} from '../../setup.mjs';

const appName = 'FeedbackLoopTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import ComboBox        from '../../../../src/form/field/ComboBox.mjs';
import Container       from '../../../../src/container/Base.mjs';
import StateProvider   from '../../../../src/state/Provider.mjs';
import Store           from '../../../../src/data/Store.mjs';

/**
 * @summary Tests the feedback loop behavior between state providers and form components.
 *
 * This test suite verifies that data binding works correctly between state providers
 * and ComboBox components, including proper event handling and prevention of infinite
 * recursion in feedback loops.
 */
test.describe('state/FeedbackLoop', () => {
    let mainComponent, provider, comboBox;

    test.beforeEach(() => {
        mainComponent = Neo.create(Container, {
            appName,
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

        provider = mainComponent.getStateProvider();
        comboBox = mainComponent.down('combobox');
    });

    test.afterEach(() => {
        mainComponent?.destroy();
        mainComponent = null;
        provider = null;
        comboBox = null;
    });

    test('Binding should work for simple and complex configs', () => {
        let changeListenerCalls = 0;

        comboBox.on('change', () => {
            changeListenerCalls++;
        });

        // Test initial binding
        expect(comboBox.labelText).toBe('Country:');
        expect(Neo.isRecord(comboBox.value)).toBe(true);
        expect(comboBox.value.country).toBe('Angola');

        // Assert that change listener was NOT called on initial binding
        expect(changeListenerCalls).toBe(0);

        // Test update
        provider.setData({
            country     : 'Algeria',
            countryLabel: 'Select Country:'
        });

        expect(comboBox.labelText).toBe('Select Country:');
        expect(Neo.isRecord(comboBox.value)).toBe(true);
        expect(comboBox.value.country).toBe('Algeria');

        // Assert that change listener was called on programmatic update
        expect(changeListenerCalls).toBe(1);
    });

    test('Simulated user interaction should fire the change event', async () => {
        // Create a new ComboBox instance for this test to avoid interference
        const userSimulatedComboBox = Neo.create(ComboBox, {
            appName,
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

        expect(userChangeListenerCalls).toBe(0);

        userSimulatedComboBox.value = 'Algeria';

        expect(Neo.isRecord(userSimulatedComboBox.value)).toBe(true);
        expect(userSimulatedComboBox.value.country).toBe('Algeria');

        await userSimulatedComboBox.timeout(35);

        expect(userChangeListenerCalls).toBe(1);

        expect(Neo.isRecord(userSimulatedComboBox.value)).toBe(true);
        expect(userSimulatedComboBox.value.country).toBe('Algeria');

        userSimulatedComboBox.destroy();
    });

    test('Should simulate feedback loop and prevent infinite recursion', async () => {
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

        expect(setDataCallCount).toBe(1);

        // Clean up
        comboBox.un('change', mockOnCountryFieldChange);
        provider.setData = originalSetData; // Restore original setData
    });
});
