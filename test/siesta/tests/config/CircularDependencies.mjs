import Neo       from '../../../../src/Neo.mjs';
import * as core from '../../../../src/core/_export.mjs';

class TestComponent extends core.Base {
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
Neo.setupClass(TestComponent);

StartTest(t => {
    t.it('afterSet hooks should see latest values of other configs and fields during simultaneous update', t => {
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
        t.is(instance.afterSetLogs.configA.length, 1, 'afterSetConfigA should be called once');
        const logA = instance.afterSetLogs.configA[0];
        t.is(logA.newValue,           'newA',           'logA: newValue is correct');
        t.is(logA.oldValue,           'initialA',       'logA: oldValue is correct');
        t.is(logA.currentConfigB,     'newB',           'logA: currentConfigB should be newB');
        t.is(logA.currentConfigC,     'newC',           'logA: currentConfigC should be newC');
        t.is(logA.currentClassField,  'newClassField',  'logA: currentClassField should be newClassField');
        t.is(logA.currentNonReactive, 'newNonReactive', 'logA: currentNonReactive should be newNonReactive');
        t.is(logA.currentCustomProp,  'newCustomProp',  'logA: currentCustomProp should be newCustomProp');

        // Verify afterSetConfigB log
        t.is(instance.afterSetLogs.configB.length, 1, 'afterSetConfigB should be called once');
        const logB = instance.afterSetLogs.configB[0];
        t.is(logB.newValue,           'newB',           'logB: newValue is correct');
        t.is(logB.oldValue,           'initialB',       'logB: oldValue is correct');
        t.is(logB.currentConfigA,     'newA',           'logB: currentConfigA should be newA');
        t.is(logB.currentConfigC,     'newC',           'logB: currentConfigC should be newC');
        t.is(logB.currentClassField,  'newClassField',  'logB: currentClassField should be newClassField');
        t.is(logB.currentNonReactive, 'newNonReactive', 'logB: currentNonReactive should be newNonReactive');
        t.is(logB.currentCustomProp,  'newCustomProp',  'logB: currentCustomProp should be newCustomProp');

        // Verify afterSetConfigC log
        t.is(instance.afterSetLogs.configC.length, 1, 'afterSetConfigC should be called once');
        const logC = instance.afterSetLogs.configC[0];
        t.is(logC.newValue,           'newC',           'logC: newValue is correct');
        t.is(logC.oldValue,           'initialC',       'logC: oldValue is correct');
        t.is(logC.currentConfigA,     'newA',           'logC: currentConfigA should be newA');
        t.is(logC.currentConfigB,     'newB',           'logC: currentConfigB should be newB');
        t.is(logC.currentClassField,  'newClassField',  'logC: currentClassField should be newClassField');
        t.is(logC.currentNonReactive, 'newNonReactive', 'logC: currentNonReactive should be newNonReactive');
        t.is(logC.currentCustomProp,  'newCustomProp',  'logC: currentCustomProp should be newCustomProp');

        // Verify customProp setter log
        t.is(instance.customPropSetLog.length, 1, 'customProp setter should be called once');
        const customPropLog = instance.customPropSetLog[0];
        t.is(customPropLog.value,              'newCustomProp',  'customProp setter: value is correct');
        t.is(customPropLog.currentConfigA,     'newA',           'customProp setter: currentConfigA should be newA');
        t.is(customPropLog.currentNonReactive, 'newNonReactive', 'customProp setter: currentNonReactive should be newNonReactive');
        t.is(customPropLog.currentClassField,  'newClassField',  'customProp setter: currentClassField should be newClassField');
    });

    t.it('afterSet hooks should see existing values if not part of current set() operation', t => {
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

        t.is(instance.afterSetLogs.configA.length, 1, 'afterSetConfigA should be called once');
        const logA = instance.afterSetLogs.configA[0];
        t.is(logA.newValue,           'newAOnly',          'logA: newValue is correct');
        t.is(logA.oldValue,           'preSetA',           'logA: oldValue is correct');
        t.is(logA.currentConfigB,     'preSetB',           'logA: currentConfigB should be preSetB');
        t.is(logA.currentConfigC,     'preSetC',           'logA: currentConfigC should be preSetC');
        t.is(logA.currentClassField,  'preSetClassField',  'logA: currentClassField should be preSetClassField');
        t.is(logA.currentNonReactive, 'preSetNonReactive', 'logA: currentNonReactive should be preSetNonReactive');
        t.is(logA.currentCustomProp,  'preSetCustomProp',  'logA: currentCustomProp should be preSetCustomProp');

        t.is(instance.afterSetLogs.configB.length, 0, 'afterSetConfigB should not be called');
        t.is(instance.afterSetLogs.configC.length, 0, 'afterSetConfigC should not be called');
        t.is(instance.customPropSetLog.length,     0, 'customProp setter should not be called');
    });
});
