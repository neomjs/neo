import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import {isDescriptor} from '../../../../src/core/ConfigSymbols.mjs';

// Base Class
class BaseComponent extends core.Base {
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
Neo.setupClass(BaseComponent);

// Derived Class
class DerivedComponent extends BaseComponent {
    static config = {
        className   : 'Neo.Test.DerivedComponent',
        myConfig    : 'derivedValue',
        arrayConfig : [3, 4], // Override with a new array
        objectConfig: {b: {c: 3, d: 4}, e: 5} // Override with a partial object for deep merge
    }
}
Neo.setupClass(DerivedComponent);


StartTest(t => {
    t.it('Initial values for DerivedComponent instance', t => {
        const instance = Neo.create(DerivedComponent);

        t.is(instance.myConfig, 'derivedValue', 'myConfig should be the value from the derived class');

        // Test 'replace' merge strategy for arrayConfig
        t.isDeeplyStrict(instance.arrayConfig, [3, 4], 'arrayConfig should be replaced by the derived class value');

        // Test 'deep' merge strategy for objectConfig
        const expectedObject = {
            a: 1,       // from BaseComponent
            b: {c: 3, d: 4}, // from DerivedComponent (b.c is overwritten, b.d is added)
            e: 5        // from DerivedComponent
        };
        t.isDeeplyStrict(instance.objectConfig, expectedObject, 'objectConfig should be a deep merge of base and derived values');
    });

    t.it('Reactivity on DerivedComponent instance', t => {
        const instance = Neo.create(DerivedComponent);

        let subscriberCalled = false;
        let receivedNewValue, receivedOldValue;

        const cleanup = instance.observeConfig(instance, 'myConfig', (newValue, oldValue) => { // Discouraged: Self-observation
            subscriberCalled = true;
            receivedNewValue = newValue;
            receivedOldValue = oldValue;
        });

        instance.myConfig = 'newValue';

        t.ok(subscriberCalled, 'Subscriber callback should be called');
        t.is(receivedNewValue, 'newValue', 'New value should be passed to subscriber');
        t.is(receivedOldValue, 'derivedValue', 'Old value should be the initial value from the derived class');

        cleanup();
    });

    t.it('Instance-level config overrides derived defaults', t => {
        const instance = Neo.create(DerivedComponent, {
            myConfig    : 'instanceValue',
            arrayConfig : [5, 6],
            objectConfig: {b: {c: 99}, g: 7}
        });

        t.is(instance.myConfig, 'instanceValue', 'myConfig should be the value from the instance config');
        t.isDeeplyStrict(instance.arrayConfig, [5, 6], 'arrayConfig should be replaced by the instance config value');

        const expectedObject = {
            a: 1,             // from BaseComponent
            b: {c: 99, d: 4}, // b.c from instance, b.d from DerivedComponent
            e: 5,             // from DerivedComponent
            g: 7              // from instance
        };

        t.isDeeplyStrict(instance.objectConfig, expectedObject, 'objectConfig from instance should be deep-merged into the class default');
    });
});
