import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Base           from '../../../../src/core/Base.mjs';
import {isDescriptor} from '../../../../src/core/ConfigSymbols.mjs';

// Base Class
class BaseComponent extends Base {
    static config = {
        className    : 'Neo.Test.BaseComponent',
        myConfig_    : 'baseValue',
        arrayConfig_ : {
            [isDescriptor]: true,
            value         : [1, 2],
            merge         : 'replace'
        },
        objectConfig_: {
            [isDescriptor]: true,
            value         : {a: 1, b: {c: 2}},
            merge         : 'deep'
        }
    }
}
BaseComponent = Neo.setupClass(BaseComponent);

// Derived Class
class DerivedComponent extends BaseComponent {
    static config = {
        className   : 'Neo.Test.DerivedComponent',
        myConfig    : 'derivedValue',
        arrayConfig : [3, 4], // Override with a new array
        objectConfig: {b: {c: 3, d: 4}, e: 5} // Override with a partial object for deep merge
    }
}
DerivedComponent = Neo.setupClass(DerivedComponent);

/**
 * @summary Tests for config inheritance and merging in Neo.core.Base
 * This suite tests that configs are correctly inherited and merged through a class hierarchy,
 * and that instance-level configs can override class defaults.
 */
test.describe('Neo.core.Base#configs-hierarchy', () => {
    test('Initial values for DerivedComponent instance', () => {
        const instance = Neo.create(DerivedComponent);

        expect(instance.myConfig).toBe('derivedValue');

        // Test 'replace' merge strategy for arrayConfig
        expect(instance.arrayConfig).toEqual([3, 4]);

        // Test 'deep' merge strategy for objectConfig
        const expectedObject = {
            a: 1,       // from BaseComponent
            b: {c: 3, d: 4}, // from DerivedComponent (b.c is overwritten, b.d is added)
            e: 5        // from DerivedComponent
        };
        expect(instance.objectConfig).toEqual(expectedObject);
    });

    test('Reactivity on DerivedComponent instance', () => {
        const instance = Neo.create(DerivedComponent);

        let subscriberCalled = false;
        let receivedNewValue, receivedOldValue;

        const cleanup = instance.observeConfig(instance, 'myConfig', (newValue, oldValue) => { // Discouraged: Self-observation
            subscriberCalled = true;
            receivedNewValue = newValue;
            receivedOldValue = oldValue;
        });

        instance.myConfig = 'newValue';

        expect(subscriberCalled).toBe(true);
        expect(receivedNewValue).toBe('newValue');
        expect(receivedOldValue).toBe('derivedValue');

        cleanup();
    });

    test('Instance-level config overrides derived defaults', () => {
        const instance = Neo.create(DerivedComponent, {
            myConfig    : 'instanceValue',
            arrayConfig : [5, 6],
            objectConfig: {b: {c: 99}, g: 7}
        });

        expect(instance.myConfig).toBe('instanceValue');
        expect(instance.arrayConfig).toEqual([5, 6]);

        const expectedObject = {
            a: 1,             // from BaseComponent
            b: {c: 99, d: 4}, // b.c from instance, b.d from DerivedComponent
            e: 5,             // from DerivedComponent
            g: 7              // from instance
        };

        expect(instance.objectConfig).toEqual(expectedObject);
    });
});
