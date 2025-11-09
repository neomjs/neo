import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * @summary Verifies the behavior of config-related hooks (`beforeSet*`, `afterSet*`).
 *
 * This test suite ensures that when a reactive config is changed, the other configs on the
 * instance have their correct, stable values within the hook methods. This is tested for
 * both single assignments and batch `set()` operations to guarantee the predictability
 * of the config system.
 */
test.describe('ClassSystem', () => {
    test('Class configs', () => {
        let expectations = [];
        let valueA = 1;
        let valueB = 2;

        class TestClass extends core.Base {
            static config = {
                className: 'Neo.TestClass',
                a_       : valueA,
                b_       : valueB
            }

            afterSetA(value, oldValue) {
                expectations.push({ description: 'afterSetA: a equals ' + value, value: value, expected: valueA });
                expectations.push({ description: 'afterSetA: b equals ' + this.b, value: this.b, expected: valueB });
            }

            afterSetB(value, oldValue) {
                expectations.push({ description: 'afterSetB: a equals ' + this.a, value: this.a, expected: valueA });
                expectations.push({ description: 'afterSetB: b equals ' + value, value: value, expected: valueB });
            }

            beforeSetA(value, oldValue) {
                expectations.push({ description: 'beforeSetA: a equals ' + value, value: value, expected: valueA });
                expectations.push({ description: 'beforeSetA: b equals ' + this.b, value: this.b, expected: valueB });
                return value;
            }

            beforeSetB(value, oldValue) {
                expectations.push({ description: 'beforeSetB: a equals ' + this.a, value: this.a, expected: valueA });
                expectations.push({ description: 'beforeSetB: b equals ' + value, value: value, expected: valueB });
                return value;
            }
        }

        TestClass = Neo.setupClass(TestClass);

        let instance = Neo.create(TestClass);
        expectations.forEach(item => expect(item.value, item.description).toBe(item.expected));
        expectations = [];

        valueA = 2;
        instance.a = valueA;
        expectations.forEach(item => expect(item.value, item.description).toBe(item.expected));
        expectations = [];

        valueB = 3;
        instance.b = valueB;
        expectations.forEach(item => expect(item.value, item.description).toBe(item.expected));
        expectations = [];

        valueA = 3;
        valueB = 4;

        instance.set({
            a: valueA,
            b: valueB
        });
        expectations.forEach(item => expect(item.value, item.description).toBe(item.expected));
    });
});
