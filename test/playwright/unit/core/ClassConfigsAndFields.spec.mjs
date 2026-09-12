import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

class TestClass extends core.Base {
    fieldA = 1;
    fieldB = 2;

    static config = {
        className: 'Test.Unit.Core.ClassConfigsAndFields.TestClass',
        configA_ : 3,
        configB_ : 4
    }

    beforeSetConfigA(value) {
        return this.fieldA + value;
    }

    beforeSetConfigB(value) {
        return this.fieldB + value;
    }
}

TestClass = Neo.setupClass(TestClass);

/**
 * @summary Verifies the order of operations for Neo.mjs class fields and reactive configs.
 *
 * This test suite is critical for ensuring the predictability of the framework's config system.
 * It confirms that class fields are resolved before config setters are called, and that all
 * config-related hooks (`beforeSet*`, `afterSet*`) have access to the complete, updated
 * state within a single `set()` batch operation, regardless of property order.
 */
test.describe('ClassConfigsAndFields', () => {
    test('Default class fields inside constructors', () => {
        class CtorTest {
            fieldA = 1;
            fieldB = 2;

            constructor() {
                expect(this.fieldA).toBe(1);
                expect(this.fieldB).toBe(2);
            }
        }

        new CtorTest();

        class CtorTestExtension extends CtorTest {
            fieldA = 3;
            fieldB = 4;

            constructor() {
                super();
                expect(this.fieldA).toBe(3);
                expect(this.fieldB).toBe(4);
            }
        }

        new CtorTestExtension();
    });

    test('Neo default class fields inside constructors', () => {
        class NeoCtorTest extends core.Base {
            static config = {
                className: 'Test.Unit.Core.ClassConfigsAndFields.NeoCtorTest'
            }

            fieldA = 1;
            fieldB = 2;

            construct(config) {
                super.construct(config);
                let me = this;
                let extension = me.extension;
                expect(me.fieldA).toBe(extension ? 3 : 1);
                expect(me.fieldB).toBe(extension ? 4 : 2);
            }
        }

        NeoCtorTest = Neo.setupClass(NeoCtorTest);

        Neo.create(NeoCtorTest);

        class NeoCtorTestExtension extends NeoCtorTest {
            extension = true; // flag for the base ctor tests
            fieldA    = 3;
            fieldB    = 4;

            construct(config) {
                super.construct(config);
                expect(this.fieldA).toBe(3);
                expect(this.fieldB).toBe(4);
            }
        }

        Neo.create(NeoCtorTestExtension);
    });

    test('Default class fields', () => {
        class DefaultTestClass {
            fieldA   = 1;
            fieldB   = 2;
            _configA = 3;
            _configB = 4;

            get configA() {
                return this._configA;
            }

            set configA(value) {
                this._configA = this.fieldA + value;
            }

            get configB() {
                return this._configB;
            }

            set configB(value) {
                this._configB = this.fieldB + value;
            }

            constructor(config) {
                Object.assign(this, config);
            }
        }

        const instance = new DefaultTestClass({
            fieldA : 5,
            configA: 6,
            configB: 7,
            fieldB : 8
        });

        // not consistent
        expect(instance.configA).toBe(11); // 5 + 6 => new value of fieldA + new value of configA
        expect(instance.configB).toBe(9);  // 2 + 7 => old value of fieldB + new value of configB
        expect(instance.fieldA).toBe(5);
        expect(instance.fieldB).toBe(8);

        const instance2 = new DefaultTestClass({
            fieldB : 8, // reversed order
            configB: 7,
            configA: 6,
            fieldA : 5
        });

        // not consistent
        expect(instance2.configA).toBe(7);  // 1 + 6 => old value of fieldA + new value of configA
        expect(instance2.configB).toBe(15); // 8 + 7 => new value of fieldB + new value of configB
        expect(instance2.fieldA).toBe(5);
        expect(instance2.fieldB).toBe(8);
    });

    test('Class based class configs and fields', () => {
        const instance = Neo.create({
            className: 'Test.Unit.Core.ClassConfigsAndFields.TestClass'
        });

        expect(instance.configA).toBe(4); // 1 + 3
        expect(instance.configB).toBe(6); // 2 + 4
        expect(instance.fieldA).toBe(1);
        expect(instance.fieldB).toBe(2);
    });

    test('Instance based class configs and fields', () => {
        const instance = Neo.create({
            className: 'Test.Unit.Core.ClassConfigsAndFields.TestClass',
            fieldA   : 5,
            configA  : 6,
            configB  : 7,
            fieldB   : 8
        });

        expect(instance.configA).toBe(11); // 5 + 6
        expect(instance.configB).toBe(15); // 8 + 7
        expect(instance.fieldA).toBe(5);
        expect(instance.fieldB).toBe(8);

        const instance2 = Neo.create({
            className: 'Test.Unit.Core.ClassConfigsAndFields.TestClass',
            fieldB   : 8,
            configB  : 7,
            configA  : 6,
            fieldA   : 5
        });

        expect(instance2.configA).toBe(11); // 5 + 6
        expect(instance2.configB).toBe(15); // 8 + 7
        expect(instance2.fieldA).toBe(5);
        expect(instance2.fieldB).toBe(8);
    });

    test('Dynamically changed class configs and fields', () => {
        const instance = Neo.create({
            className: 'Test.Unit.Core.ClassConfigsAndFields.TestClass'
        });

        instance.set({
            fieldA : 5,
            configA: 6,
            configB: 7,
            fieldB : 8
        });

        expect(instance.configA).toBe(11); // 5 + 6
        expect(instance.configB).toBe(15); // 8 + 7
        expect(instance.fieldA).toBe(5);
        expect(instance.fieldB).toBe(8);

        const instance2 = Neo.create({
            className: 'Test.Unit.Core.ClassConfigsAndFields.TestClass'
        });

        instance2.set({
            fieldB : 8,
            configB: 7,
            configA: 6,
            fieldA : 5
        });

        expect(instance2.configA).toBe(11); // 5 + 6
        expect(instance2.configB).toBe(15); // 8 + 7
        expect(instance2.fieldA).toBe(5);
        expect(instance2.fieldB).toBe(8);
    });

    test('Advanced configs and fields example', () => {
        let expectations = [];

        class AdvancedClass extends core.Base {
            fieldA = 2;
            fieldB = 1;

            static config = {
                className: 'AdvancedClass',
                configA_ : 0,
                configB_ : 0,
                configC_ : 0
            }

            afterSetConfigA(value, oldValue) {
                let me  = this,
                    sum = me.fieldA === 1 ? 21 : 6;
                expectations.push({value: me.configA + me.configB + me.configC + me.fieldA + me.fieldB, expected: sum});
            }

            afterSetConfigC(value, oldValue) {
                let me  = this,
                    sum = me.fieldA === 1 ? 21 : 6;
                expectations.push({value: me.configA + me.configB + me.configC + me.fieldA + me.fieldB, expected: sum});
            }

            beforeSetConfigA(value) {
                return this.fieldA + value;
            }

            beforeSetConfigB(value) {
                let me  = this,
                    sum = me.fieldA === 1 ? 21 : 6;
                expectations.push({value: me.configA + me.configB + me.configC + me.fieldA + me.fieldB, expected: sum});
                return value;
            }

            beforeSetConfigC(value) {
                return this.fieldB + value;
            }
        }

        AdvancedClass = Neo.setupClass(AdvancedClass);

        let instance = Neo.create(AdvancedClass);

        instance.set({
            fieldA : 1,
            configA: 2,
            configB: 3,
            configC: 4,
            fieldB : 5
        });

        expectations.forEach(item => expect(item.value).toBe(item.expected));
        expectations = [];

        let instance2 = Neo.create(AdvancedClass);

        instance2.set({
            fieldB : 5,
            configC: 4,
            configB: 3,
            configA: 2,
            fieldA : 1
        });

        expectations.forEach(item => expect(item.value).toBe(item.expected));
    });

    test('a base-class field that shadows a subclass reactive config throws at the first construction, naming both classes', () => {
        class FieldBase extends core.Base {
            static config = {className: 'Test.Unit.Core.ClassConfigsAndFields.FieldBase'}

            value = null
        }

        Neo.setupClass(FieldBase);

        class ConfigSub extends FieldBase {
            static config = {
                className: 'Test.Unit.Core.ClassConfigsAndFields.ConfigSub',
                value_   : 1
            }

            afterSetValue() {}
        }

        Neo.setupClass(ConfigSub);

        const pattern = /Invalid class field 'value' in Test\.Unit\.Core\.ClassConfigsAndFields\.ConfigSub: it shadows the reactive config 'value_' declared by Test\.Unit\.Core\.ClassConfigsAndFields\.ConfigSub/;

        expect(() => Neo.create(ConfigSub)).toThrow(pattern);
        expect(() => Neo.create(ConfigSub), 'a broken class keeps throwing').toThrow(/afterSetValue\(\) never fires/);

        // The base class itself is fine: its field shadows nothing.
        const base = Neo.create(FieldBase);

        expect(base.value).toBeNull();
        base.destroy()
    });

    test('a field and a config of the same name inside ONE class throw as well', () => {
        class Both extends core.Base {
            static config = {
                className: 'Test.Unit.Core.ClassConfigsAndFields.Both',
                flag_    : true
            }

            flag = false
        }

        Neo.setupClass(Both);

        expect(() => Neo.create(Both)).toThrow(/Invalid class field 'flag' in Test\.Unit\.Core\.ClassConfigsAndFields\.Both/)
    });

    test('the documented way stays silent: a subclass gives an inherited config a new default without a field', () => {
        class Owner extends core.Base {
            static config = {
                className: 'Test.Unit.Core.ClassConfigsAndFields.Owner',
                mode_    : 'a'
            }

            hits = 0

            afterSetMode() {
                this.hits++
            }
        }

        Neo.setupClass(Owner);

        class Tuned extends Owner {
            static config = {
                className: 'Test.Unit.Core.ClassConfigsAndFields.Tuned',
                mode     : 'b'
            }

            note = 'a plain field with no config of that name'
        }

        Neo.setupClass(Tuned);

        const instance = Neo.create(Tuned);

        expect(instance.mode).toBe('b');
        expect(instance.hits).toBe(1);
        expect(instance.note).toBe('a plain field with no config of that name');
        instance.destroy()
    });

    test('an own accessor installed before super.construct() is an ordinary override, not a shadow: silent, and fields-first batch assignment holds', () => {
        class Scaled extends core.Base {
            static config = {
                className: 'Test.Unit.Core.ClassConfigsAndFields.Scaled',
                factor_  : 2
            }

            construct(config) {
                let value = 0;

                Object.defineProperty(this, 'value', {
                    enumerable  : true,
                    configurable: true,
                    get() { return value },
                    set(next) { value = next * this.factor }
                });

                super.construct(config)
            }
        }

        Neo.setupClass(Scaled);

        const instance = Neo.create(Scaled);

        expect(instance.isConfig('value')).toBe(false);
        instance.set({value: 3, factor: 4});
        expect(instance.value).toBe(12);
        instance.destroy()
    });

    test('a subclass field over a parent accessor that is no config stays silent', () => {
        class Accessor extends core.Base {
            static config = {className: 'Test.Unit.Core.ClassConfigsAndFields.Accessor'}

            get value() { return this._value ?? 'accessor' }
            set value(next) { this._value = next }
        }

        Neo.setupClass(Accessor);

        class FieldOverAccessor extends Accessor {
            static config = {className: 'Test.Unit.Core.ClassConfigsAndFields.FieldOverAccessor'}

            value = 5
        }

        Neo.setupClass(FieldOverAccessor);

        const instance = Neo.create(FieldOverAccessor);

        expect(instance.value).toBe(5);
        instance.destroy()
    });

    test('validation is per instance: a first instance that removes its shadow before super.construct() exempts no later shadowed one, in either order', () => {
        class Masked extends core.Base {
            static config = {
                className: 'Test.Unit.Core.ClassConfigsAndFields.Masked',
                value_   : 1
            }

            value     = null
            hookCalls = 0

            afterSetValue() {
                this.hookCalls++
            }

            construct(config={}) {
                if (config.unmask) delete this.value;
                super.construct(config)
            }
        }

        Neo.setupClass(Masked);

        const shadowed = /Invalid class field 'value' in Test\.Unit\.Core\.ClassConfigsAndFields\.Masked/;

        // clean first, shadowed second
        const clean = Neo.create(Masked, {unmask: true});

        expect(clean.value).toBe(1);
        expect(clean.hookCalls).toBe(1);
        expect(() => Neo.create(Masked)).toThrow(shadowed);

        // shadowed first, clean second
        expect(() => Neo.create(Masked)).toThrow(shadowed);

        const clean2 = Neo.create(Masked, {unmask: true});

        clean2.set({value: 3});
        expect(clean2.value).toBe(3);
        expect(clean2.hookCalls).toBe(2);

        clean.destroy();
        clean2.destroy()
    });
});
