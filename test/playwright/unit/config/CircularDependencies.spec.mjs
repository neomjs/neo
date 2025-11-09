import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Base           from '../../../../src/core/Base.mjs';

class TestComponent extends Base {
    static config = {
        className  : 'Neo.Test.CircularDependenciesComponent',
        configA_   : 'initialA',
        configB_   : 'initialB',
        configC_   : 'initialC',
        nonReactive: 'initialNonReactive'
    }

    classField = 'initialClassField';

    _customProp = 'initialCustomProp'; // Private backing field for customProp

    // Custom getter/setter for a property not defined in static config
    get customProp() {
        return this._customProp;
    }
    set customProp(value) {
        this._customProp = value;

        // Simulate interaction with other properties
        this.customPropSetLog.push({
            value,
            currentConfigA    : this.configA,
            currentNonReactive: this.nonReactive,
            currentClassField : this.classField
        });
    }

    // To record the state inside afterSet hooks and customProp setter
    afterSetLogs = {
        configA: [],
        configB: [],
        configC: []
    };
    customPropSetLog = [];

    afterSetConfigA(newValue, oldValue) {
        this.afterSetLogs.configA.push({
            newValue,
            oldValue,
            currentConfigB    : this.configB,
            currentConfigC    : this.configC,
            currentClassField : this.classField,
            currentNonReactive: this.nonReactive,
            currentCustomProp : this.customProp
        });
    }

    afterSetConfigB(newValue, oldValue) {
        this.afterSetLogs.configB.push({
            newValue,
            oldValue,
            currentConfigA    : this.configA,
            currentConfigC    : this.configC,
            currentClassField : this.classField,
            currentNonReactive: this.nonReactive,
            currentCustomProp : this.customProp
        });
    }

    afterSetConfigC(newValue, oldValue) {
        this.afterSetLogs.configC.push({
            newValue,
            oldValue,
            currentConfigA    : this.configA,
            currentConfigB    : this.configB,
            currentClassField : this.classField,
            currentNonReactive: this.nonReactive,
            currentCustomProp : this.customProp
        });
    }
}
TestComponent = Neo.setupClass(TestComponent);

/**
 * @summary Tests for circular dependencies in Neo.core.Base configs
 * This suite tests that afterSet hooks for configs see the latest values of other configs and fields
 * that are being updated in the same set() operation. This is a test for the correct batching
 * and ordering of config applications.
 */
test.describe('Neo.core.Base#configs-circular-dependencies', () => {
    test('afterSet hooks should see latest values of other configs and fields during simultaneous update', () => {
        const instance = Neo.create(TestComponent);
        instance.afterSetLogs = { configA: [], configB: [], configC: [] }; // Clear logs from initial config processing
        instance.customPropSetLog = []; // Clear customProp logs

        instance.set({
            configA    : 'newA',
            configB    : 'newB',
            configC    : 'newC',
            nonReactive: 'newNonReactive',
            classField : 'newClassField',
            customProp : 'newCustomProp'
        });

        // Verify afterSetConfigA log
        expect(instance.afterSetLogs.configA.length).toBe(1);
        const logA = instance.afterSetLogs.configA[0];
        expect(logA.newValue).toBe('newA');
        expect(logA.oldValue).toBe('initialA');
        expect(logA.currentConfigB).toBe('newB');
        expect(logA.currentConfigC).toBe('newC');
        expect(logA.currentClassField).toBe('newClassField');
        expect(logA.currentNonReactive).toBe('newNonReactive');
        expect(logA.currentCustomProp).toBe('newCustomProp');

        // Verify afterSetConfigB log
        expect(instance.afterSetLogs.configB.length).toBe(1);
        const logB = instance.afterSetLogs.configB[0];
        expect(logB.newValue).toBe('newB');
        expect(logB.oldValue).toBe('initialB');
        expect(logB.currentConfigA).toBe('newA');
        expect(logB.currentConfigC).toBe('newC');
        expect(logB.currentClassField).toBe('newClassField');
        expect(logB.currentNonReactive).toBe('newNonReactive');
        expect(logB.currentCustomProp).toBe('newCustomProp');

        // Verify afterSetConfigC log
        expect(instance.afterSetLogs.configC.length).toBe(1);
        const logC = instance.afterSetLogs.configC[0];
        expect(logC.newValue).toBe('newC');
        expect(logC.oldValue).toBe('initialC');
        expect(logC.currentConfigA).toBe('newA');
        expect(logC.currentConfigB).toBe('newB');
        expect(logC.currentClassField).toBe('newClassField');
        expect(logC.currentNonReactive).toBe('newNonReactive');
        expect(logC.currentCustomProp).toBe('newCustomProp');

        // Verify customProp setter log
        expect(instance.customPropSetLog.length).toBe(1);
        const customPropLog = instance.customPropSetLog[0];
        expect(customPropLog.value).toBe('newCustomProp');
        expect(customPropLog.currentConfigA).toBe('newA');
        expect(customPropLog.currentNonReactive).toBe('newNonReactive');
        expect(customPropLog.currentClassField).toBe('newClassField');
    });

    test('afterSet hooks should see existing values if not part of current set() operation', () => {
        const instance = Neo.create(TestComponent, {
            configA    : 'preSetA',
            configB    : 'preSetB',
            configC    : 'preSetC',
            nonReactive: 'preSetNonReactive',
            classField : 'preSetClassField',
            customProp : 'preSetCustomProp'
        });
        instance.afterSetLogs = { configA: [], configB: [], configC: [] }; // Reset logs
        instance.customPropSetLog = []; // Reset customProp logs

        instance.set({
            configA: 'newAOnly'
        });

        expect(instance.afterSetLogs.configA.length).toBe(1);
        const logA = instance.afterSetLogs.configA[0];
        expect(logA.newValue).toBe('newAOnly');
        expect(logA.oldValue).toBe('preSetA');
        expect(logA.currentConfigB).toBe('preSetB');
        expect(logA.currentConfigC).toBe('preSetC');
        expect(logA.currentClassField).toBe('preSetClassField');
        expect(logA.currentNonReactive).toBe('preSetNonReactive');
        expect(logA.currentCustomProp).toBe('preSetCustomProp');

        expect(instance.afterSetLogs.configB.length).toBe(0);
        expect(instance.afterSetLogs.configC.length).toBe(0);
        expect(instance.customPropSetLog.length).toBe(0);
    });
});
