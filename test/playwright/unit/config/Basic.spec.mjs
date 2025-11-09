import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Base           from '../../../../src/core/Base.mjs';
import {isDescriptor} from '../../../../src/core/ConfigSymbols.mjs';

class MyComponent extends Base {
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

/**
 * @summary Tests for basic config reactivity in Neo.core.Base
 * This suite tests the fundamental reactivity of configs, including the observeConfig method
 * for subscriptions and the behavior of config descriptors for array and object merging.
 */

test.describe('Neo.core.Base#configs-basic', () => {
    test('Basic reactivity with subscribe', () => {
        const instance = Neo.create(MyComponent);

        let subscriberCalled = false;
        let receivedNewValue, receivedOldValue;

        const cleanup = instance.observeConfig(instance, 'myConfig', (newValue, oldValue) => {
            subscriberCalled = true;
            receivedNewValue = newValue;
            receivedOldValue = oldValue;
        });

        instance.myConfig = 'newValue';

        expect(subscriberCalled).toBe(true);
        expect(receivedNewValue).toBe('newValue');
        expect(receivedOldValue).toBe('initialValue');

        // Test cleanup
        subscriberCalled = false;
        cleanup();
        instance.myConfig = 'anotherValue';
        expect(subscriberCalled).toBe(false);
    });

    test('Descriptor: arrayConfig_ with merge: replace', () => {
        const instance = Neo.create(MyComponent);

        let subscriberCalled = 0;
        instance.observeConfig(instance, 'arrayConfig', (newValue, oldValue) => {
            subscriberCalled++;
        });

        const arr1 = [1, 2, 3];
        instance.arrayConfig = arr1;
        expect(instance.arrayConfig).toEqual(arr1);
        expect(subscriberCalled).toBe(1);

        const arr2 = [4, 5, 6];
        instance.arrayConfig = arr2;
        expect(instance.arrayConfig).toEqual(arr2);
        expect(subscriberCalled).toBe(2);

        // Setting the same array should not trigger a change by default isEqual
        instance.arrayConfig = arr2;
        expect(subscriberCalled).toBe(2);
    });

    test('Descriptor: objectConfig_ with merge: deep', () => {
        const instance = Neo.create(MyComponent);

        let subscriberCalled = 0;
        instance.observeConfig(instance, 'objectConfig', (newValue, oldValue) => {
            subscriberCalled++;
        });

        const obj1 = {a: 1, b: {c: 2}};
        instance.objectConfig = obj1;
        expect(instance.objectConfig).toEqual(obj1);
        expect(subscriberCalled).toBe(1);

        // Deep merge should happen, but default isEqual will still compare references
        const obj2 = {a: 1, b: {c: 3}};
        instance.objectConfig = obj2;
        expect(instance.objectConfig.a).toBe(1);
        expect(instance.objectConfig.b.c).toBe(3);
        expect(subscriberCalled).toBe(2);

        // Setting the same object reference should not trigger a change
        instance.objectConfig = obj2;
        expect(subscriberCalled).toBe(2);

        // Modifying a nested property should trigger a change if isEqual is deep
        // NOTE: The current Config.mjs uses Neo.isEqual which is a deep comparison.
        // If the object reference changes, it will trigger. If the object reference stays the same,
        // but content changes, it will not trigger unless isEqual is customized.
        // For now, this test relies on the fact that setting a new object reference triggers the change.
        const obj3 = {a: 1, b: {c: 2}};
        instance.objectConfig = obj3;
        expect(subscriberCalled).toBe(3);
    });

    test('Multiple subscriptions from same owner ID', () => {
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

        expect(callback1Called).toBe(true);
        expect(callback2Called).toBe(true);

        // Test cleanup
        cleanup1();
        cleanup2();

        callback1Called = false;
        callback2Called = false;

        instance.myConfig = 'anotherChange';

        expect(callback1Called).toBe(false);
        expect(callback2Called).toBe(false);
    });
});
