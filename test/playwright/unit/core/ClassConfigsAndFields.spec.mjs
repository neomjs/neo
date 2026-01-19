import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

class TestClass extends core.Base {
    fieldA = 1;
    fieldB = 2;

    static config = {
        className: 'Neo.TestClass',
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
            className: 'Neo.TestClass'
        });

        expect(instance.configA).toBe(4); // 1 + 3
        expect(instance.configB).toBe(6); // 2 + 4
        expect(instance.fieldA).toBe(1);
        expect(instance.fieldB).toBe(2);
    });

    test('Instance based class configs and fields', () => {
        const instance = Neo.create({
            className: 'Neo.TestClass',
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
            className: 'Neo.TestClass',
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
            className: 'Neo.TestClass'
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
            className: 'Neo.TestClass'
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
});
