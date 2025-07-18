import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import {isDescriptor} from '../../../../src/core/ConfigSymbols.mjs';

class MyComponent extends core.Base {
    static config = {
        className    : 'Neo.TestComponent',
        myConfig_    : 'initialValue',
        arrayConfig_ : {
            [isDescriptor]: true,
            value         : [],
            merge         : 'replace'
        },
        objectConfig_: {
            [isDescriptor]: true,
            value         : {},
            merge         : 'deep'
        }
    }

    afterSetMyConfig(value, oldValue) {
        // This will be called by the framework
    }
}

MyComponent = Neo.setupClass(MyComponent);

StartTest(t => {
    t.it('Basic reactivity with subscribe', t => {
        const instance         = Neo.create(MyComponent);

        let subscriberCalled = false;
        let receivedNewValue, receivedOldValue;

        const cleanup = instance.observeConfig(instance, 'myConfig', (newValue, oldValue) => {
            subscriberCalled = true;
            receivedNewValue = newValue;
            receivedOldValue = oldValue;
        });

        instance.myConfig = 'newValue';

        t.ok(subscriberCalled, 'Subscriber callback should be called');
        t.is(receivedNewValue, 'newValue', 'New value should be passed to subscriber');
        t.is(receivedOldValue, 'initialValue', 'Old value should be passed to subscriber');

        // Test cleanup
        subscriberCalled = false;
        cleanup();
        instance.myConfig = 'anotherValue';
        t.notOk(subscriberCalled, 'Subscriber callback should not be called after cleanup');
    });

    t.it('Descriptor: arrayConfig_ with merge: replace', t => {
        const instance = Neo.create(MyComponent);

        let subscriberCalled = 0;
        instance.observeConfig(instance, 'arrayConfig', (newValue, oldValue) => {
            subscriberCalled++;
        });

        const arr1 = [1, 2, 3];
        instance.arrayConfig = arr1;
        t.isDeeplyStrict(instance.arrayConfig, arr1, 'Array should be replaced');
        t.is(subscriberCalled, 1, 'Subscriber called once for array replacement');

        const arr2 = [4, 5, 6];
        instance.arrayConfig = arr2;
        t.isDeeplyStrict(instance.arrayConfig, arr2, 'Array should be replaced again');
        t.is(subscriberCalled, 2, 'Subscriber called twice for array replacement');

        // Setting the same array should not trigger a change by default isEqual
        instance.arrayConfig = arr2;
        t.is(subscriberCalled, 2, 'Subscriber not called when setting the same array reference');
    });

    t.it('Descriptor: objectConfig_ with merge: deep', t => {
        const instance = Neo.create(MyComponent);

        let subscriberCalled = 0;
        instance.observeConfig(instance, 'objectConfig', (newValue, oldValue) => {
            subscriberCalled++;
        });

        const obj1 = {a: 1, b: {c: 2}};
        instance.objectConfig = obj1;
        t.isDeeplyStrict(instance.objectConfig, obj1, 'Object should be set');
        t.is(subscriberCalled, 1, 'Subscriber called once for object set');

        // Deep merge should happen, but default isEqual will still compare references
        const obj2 = {a: 1, b: {c: 3}};
        instance.objectConfig = obj2;
        t.is(instance.objectConfig.a, 1, 'Object property a should be 1');
        t.is(instance.objectConfig.b.c, 3, 'Object property b.c should be 3');
        t.is(subscriberCalled, 2, 'Subscriber called twice for object change');

        // Setting the same object reference should not trigger a change
        instance.objectConfig = obj2;
        t.is(subscriberCalled, 2, 'Subscriber not called when setting the same object reference');

        // Modifying a nested property should trigger a change if isEqual is deep
        // NOTE: The current Config.mjs uses Neo.isEqual which is a deep comparison.
        // If the object reference changes, it will trigger. If the object reference stays the same,
        // but content changes, it will not trigger unless isEqual is customized.
        // For now, this test relies on the fact that setting a new object reference triggers the change.
        const obj3 = {a: 1, b: {c: 2}};
        instance.objectConfig = obj3;
        t.is(subscriberCalled, 3, 'Subscriber called for new object reference');
    });

    t.it('Multiple subscriptions from same owner ID', t => {
        const instance = Neo.create(MyComponent);
        const publisher = instance; // Observing itself for simplicity
        const configName = 'myConfig';

        let callback1Called = false;
        let callback2Called = false;

        const cleanup1 = instance.observeConfig(publisher, configName, (newValue, oldValue) => {
            callback1Called = true;
        });

        const cleanup2 = instance.observeConfig(publisher, configName, (newValue, oldValue) => {
            callback2Called = true;
        });

        // Reset flags
        callback1Called = false;
        callback2Called = false;

        // Change the config value
        instance.myConfig = 'changedValue';

        t.ok(callback1Called, 'First callback should be called');
        t.ok(callback2Called, 'Second callback should be called');

        // Test cleanup
        cleanup1();
        cleanup2();

        callback1Called = false;
        callback2Called = false;

        instance.myConfig = 'anotherChange';

        t.notOk(callback1Called, 'First callback should NOT be called after cleanup');
        t.notOk(callback2Called, 'Second callback should NOT be called after cleanup');
    });
});
