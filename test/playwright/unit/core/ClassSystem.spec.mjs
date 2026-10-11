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
                className: 'Test.Unit.Core.ClassSystem.TestClass',
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

    test('unitTestMode setupClass returns the existing SINGLETON instead of throwing (#15364)', () => {
        // The namespace-collision guard honors the documented singleton arbitration ("whichever
        // registers first wins"): a re-registered singleton returns the existing instance, exactly as
        // the non-test path does — it does NOT throw. This is what lets config.mjs + config.template.mjs
        // (both className 'Neo.ai.Config', singleton) coexist in one unit process.
        const className = 'Test.Unit.Core.ClassSystem.CollisionSingleton';

        class FirstSingleton extends core.Base {
            static config = {className, singleton: true}
        }
        const first = Neo.setupClass(FirstSingleton);

        class SecondSingleton extends core.Base {
            static config = {className, singleton: true}
        }

        let second, threw = false;
        try {
            second = Neo.setupClass(SecondSingleton)
        } catch (e) {
            threw = true
        }

        expect(threw, 'a re-registered singleton must NOT throw in unitTestMode').toBe(false);
        expect(second, 'the second registration returns the existing singleton instance').toBe(first)
    });

    test('unitTestMode setupClass still THROWS for a NON-singleton double-setup (#15364)', () => {
        // The guard's real purpose survives: two independent NON-singleton classes colliding on one
        // namespace is a genuine test-isolation leak and must still fail loud.
        const className = 'Test.Unit.Core.ClassSystem.CollisionNonSingleton';

        class FirstClass extends core.Base {
            static config = {className}
        }
        Neo.setupClass(FirstClass);

        class SecondClass extends core.Base {
            static config = {className}
        }

        expect(() => Neo.setupClass(SecondClass))
            .toThrow('Namespace collision in unitTestMode for ' + className)
    });

    test('unitTestMode setupClass THROWS when a SINGLETON collides with an existing NON-singleton (#15364 mixed)', () => {
        // Two-sided guard: the exemption must classify BOTH sides. A singleton arriving onto a namespace
        // already holding a NON-singleton class is two distinct classes sharing a name — a real leak — so
        // it must fail loud. A one-sided check that only inspects the INCOMING singleton would silently
        // return the existing non-singleton here.
        const className = 'Test.Unit.Core.ClassSystem.MixedNonSingletonFirst';

        class FirstNonSingleton extends core.Base {
            static config = {className}
        }
        Neo.setupClass(FirstNonSingleton);

        class SecondSingleton extends core.Base {
            static config = {className, singleton: true}
        }

        expect(() => Neo.setupClass(SecondSingleton))
            .toThrow('Namespace collision in unitTestMode for ' + className)
    });

    test('unitTestMode setupClass THROWS when a NON-singleton collides with an existing SINGLETON (#15364 mixed)', () => {
        // The opposite direction: a non-singleton arriving onto a namespace already holding a singleton
        // instance is equally a leak — the exemption applies only when BOTH sides are singletons.
        const className = 'Test.Unit.Core.ClassSystem.MixedSingletonFirst';

        class FirstSingleton extends core.Base {
            static config = {className, singleton: true}
        }
        Neo.setupClass(FirstSingleton);

        class SecondNonSingleton extends core.Base {
            static config = {className}
        }

        expect(() => Neo.setupClass(SecondNonSingleton))
            .toThrow('Namespace collision in unitTestMode for ' + className)
    });
});
