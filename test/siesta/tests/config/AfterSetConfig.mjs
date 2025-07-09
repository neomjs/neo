import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

class TestComponent extends core.Base {
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
Neo.setupClass(TestComponent);

StartTest(t => {
    t.it('afterSetConfig should be called for individual config changes', t => {
        const instance = Neo.create(TestComponent);
        instance.afterSetConfigCalls = []; // Reset for this test

        instance.configA = 'valueA';
        t.is(instance.afterSetConfigCalls.length, 1, 'afterSetConfig should be called once');
        t.isDeeplyStrict(instance.afterSetConfigCalls[0], {key: 'configA', newValue: 'valueA', oldValue: 'initialA'}, 'Correct arguments for configA');

        instance.configB = 'valueB';
        t.is(instance.afterSetConfigCalls.length, 2, 'afterSetConfig should be called twice');
        t.isDeeplyStrict(instance.afterSetConfigCalls[1], {key: 'configB', newValue: 'valueB', oldValue: 'initialB'}, 'Correct arguments for configB');
    });

    t.it('afterSetConfig should be called for each changed reactive config when using instance.set()', t => {
        const instance = Neo.create(TestComponent);
        instance.afterSetConfigCalls = []; // Reset for this test

        instance.set({
            configA: 'newValueA',
            configB: 'newValueB',
            configC: 'newValueC'
        });

        t.is(instance.afterSetConfigCalls.length, 3, 'afterSetConfig should be called three times');
        t.isDeeplyStrict(instance.afterSetConfigCalls[0], {key: 'configA', newValue: 'newValueA', oldValue: 'initialA'}, 'Correct arguments for configA via set()');
        t.isDeeplyStrict(instance.afterSetConfigCalls[1], {key: 'configB', newValue: 'newValueB', oldValue: 'initialB'}, 'Correct arguments for configB via set()');
        t.isDeeplyStrict(instance.afterSetConfigCalls[2], {key: 'configC', newValue: 'newValueC', oldValue: 'initialC'}, 'Correct arguments for configC via set()');
    });

    t.it('afterSetConfig should not be called for unchanged values', t => {
        const instance = Neo.create(TestComponent);
        instance.afterSetConfigCalls = []; // Reset for this test

        instance.configA = 'initialA'; // Set to same value
        t.is(instance.afterSetConfigCalls.length, 0, 'afterSetConfig should not be called for unchanged individual reactive config');

        instance.set({
            configA: 'initialA',
            configB: 'initialB'
        });
        t.is(instance.afterSetConfigCalls.length, 0, 'afterSetConfig should not be called for unchanged reactive configs via set()');
    });

    t.it('instance.set() should update class fields and non-reactive configs without calling afterSetConfig', t => {
        const instance = Neo.create(TestComponent);
        instance.afterSetConfigCalls = []; // Reset for this test

        instance.set({
            configA    : 'changedA', // Reactive
            nonReactive: 'changedNonReactive', // Non-reactive
            classField : 'changedClassField' // Class field
        });

        // Verify reactive config update and afterSetConfig call
        t.is(instance.configA, 'changedA', 'Reactive configA should be updated');
        t.is(instance.afterSetConfigCalls.length, 1, 'afterSetConfig should be called only once for configA');
        t.isDeeplyStrict(instance.afterSetConfigCalls[0], {key: 'configA', newValue: 'changedA', oldValue: 'initialA'}, 'Correct arguments for configA');

        // Verify non-reactive config update, no afterSetConfig call
        t.is(instance.nonReactive, 'changedNonReactive', 'Non-reactive config should be updated');

        // Verify class field update, no afterSetConfig call
        t.is(instance.classField, 'changedClassField', 'Class field should be updated');

        // Reset and test with only non-reactive/class field changes
        instance.afterSetConfigCalls = [];
        instance.set({
            nonReactive: 'changedAgainNonReactive',
            classField : 'changedAgainClassField'
        });

        t.is(instance.afterSetConfigCalls.length, 0, 'afterSetConfig should not be called for only non-reactive/class field changes');
        t.is(instance.nonReactive, 'changedAgainNonReactive', 'Non-reactive config should be updated again');
        t.is(instance.classField, 'changedAgainClassField', 'Class field should be updated again');
    });
});

