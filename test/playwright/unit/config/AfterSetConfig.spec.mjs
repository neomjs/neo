import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Base           from '../../../../src/core/Base.mjs';

class TestComponent extends Base {
    static config = {
        className    : 'Neo.Test.AfterSetConfigComponent',
        configA_     : 'initialA',
        configB_     : 'initialB',
        configC_     : 'initialC',
        nonReactive  : 'initialNonReactive' // Non-reactive config
    }

    classField = 'initialClassField'; // Public class field

    afterSetConfigCalls = [];

    afterSetConfig(key, newValue, oldValue) {
        this.afterSetConfigCalls.push({key, newValue, oldValue});
    }
}

TestComponent = Neo.setupClass(TestComponent);

/**
 * @summary Tests for Neo.core.Base#afterSetConfig
 * This suite tests that the generic afterSetConfig hook is correctly called
 * for reactive config changes, and not for non-reactive or class field changes.
 */
test.describe('Neo.core.Base#afterSetConfig', () => {
    test('afterSetConfig should be called for individual config changes', () => {
        const instance = Neo.create(TestComponent);
        instance.afterSetConfigCalls = []; // Reset for this test

        instance.configA = 'valueA';
        expect(instance.afterSetConfigCalls.length).toBe(1);
        expect(instance.afterSetConfigCalls[0]).toEqual({key: 'configA', newValue: 'valueA', oldValue: 'initialA'});

        instance.afterSetConfigCalls = []; // Reset for next assertion
        instance.configB = 'valueB';
        expect(instance.afterSetConfigCalls.length).toBe(1);
        expect(instance.afterSetConfigCalls[0]).toEqual({key: 'configB', newValue: 'valueB', oldValue: 'initialB'});
    });

    test('afterSetConfig should be called for each changed reactive config when using instance.set()', () => {
        const instance = Neo.create(TestComponent);
        instance.afterSetConfigCalls = []; // Reset for this test

        instance.set({
            configA: 'newValueA',
            configB: 'newValueB',
            configC: 'newValueC'
        });

        expect(instance.afterSetConfigCalls.length).toBe(3);
        expect(instance.afterSetConfigCalls[0]).toEqual({key: 'configA', newValue: 'newValueA', oldValue: 'initialA'});
        expect(instance.afterSetConfigCalls[1]).toEqual({key: 'configB', newValue: 'newValueB', oldValue: 'initialB'});
        expect(instance.afterSetConfigCalls[2]).toEqual({key: 'configC', newValue: 'newValueC', oldValue: 'initialC'});
    });

    test('afterSetConfig should not be called for unchanged values', () => {
        const instance = Neo.create(TestComponent);
        instance.afterSetConfigCalls = []; // Reset for this test

        instance.configA = 'initialA'; // Set to same value
        expect(instance.afterSetConfigCalls.length).toBe(0);

        instance.set({
            configA: 'initialA',
            configB: 'initialB'
        });
        expect(instance.afterSetConfigCalls.length).toBe(0);
    });

    test('instance.set() should update class fields and non-reactive configs without calling afterSetConfig', () => {
        const instance = Neo.create(TestComponent);
        instance.afterSetConfigCalls = []; // Reset for this test

        instance.set({
            configA    : 'changedA', // Reactive
            nonReactive: 'changedNonReactive', // Non-reactive
            classField : 'changedClassField' // Class field
        });

        // Verify reactive config update and afterSetConfig call
        expect(instance.configA).toBe('changedA');
        expect(instance.afterSetConfigCalls.length).toBe(1);
        expect(instance.afterSetConfigCalls[0]).toEqual({key: 'configA', newValue: 'changedA', oldValue: 'initialA'});

        // Verify non-reactive config update, no afterSetConfig call
        expect(instance.nonReactive).toBe('changedNonReactive');

        // Verify class field update, no afterSetConfig call
        expect(instance.classField).toBe('changedClassField');

        // Reset and test with only non-reactive/class field changes
        instance.afterSetConfigCalls = [];
        instance.set({
            nonReactive: 'changedAgainNonReactive',
            classField : 'changedAgainClassField'
        });

        expect(instance.afterSetConfigCalls.length).toBe(0);
        expect(instance.nonReactive).toBe('changedAgainNonReactive');
        expect(instance.classField).toBe('changedAgainClassField');
    });
});
