import {setup} from '../../setup.mjs';

const appName = 'EffectBatchingTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Effect         from '../../../../src/core/Effect.mjs';
import EffectManager  from '../../../../src/core/EffectManager.mjs';

/**
 * @summary This test suite verifies the batching behavior of effects within Neo.mjs.
 * It ensures that when multiple reactive properties are updated in a single operation (e.g., using `core.Base#set()`),
 * any dependent effects are executed only once after all changes are complete. This is a critical feature for
 * performance, preventing redundant computations and UI updates. The suite also tests the manual batching controls
 * (`EffectManager.pause()` and `EffectManager.resume()`) and verifies that effects correctly track dependencies
 * that are modified indirectly through `beforeSet` and `afterSet` hooks.
 */
test.describe('Neo.core.EffectManager & Neo.core.Base', () => {
    test('Effects should be batched during core.Base#set() operations', () => {
        class TestClass extends core.Base {
            static config = {
                className: 'Neo.Test.EffectBatchingClass',
                configA_ : 0,
                configB_ : 0,
                configC_ : 0
            }
        }
        TestClass = Neo.setupClass(TestClass);

        const instance     = Neo.create(TestClass);
        let effectRunCount = 0;
        let sum            = 0;

        const effect = new Effect(() => {
            effectRunCount++;
            // Access all props to make them dependencies
            sum = instance.configA + instance.configB + instance.configC;
        });

        expect(effectRunCount).toBe(1);
        expect(effect.dependencies.size).toBe(3);
        expect(sum).toBe(0);

        // Reset run count for batching test
        effectRunCount = 0;

        // Change multiple properties in a single batch via instance.set()
        instance.set({
            configA: 1,
            configB: 2,
            configC: 3
        });

        expect(effectRunCount).toBe(1);
        expect(sum).toBe(6);
        expect(instance.configA).toBe(1);
        expect(instance.configB).toBe(2);
        expect(instance.configC).toBe(3);

        // Test individual property change outside a batch
        effectRunCount   = 0;
        instance.configA = 10;
        expect(effectRunCount).toBe(1);
        expect(sum).toBe(10 + 2 + 3);

        // Testing a no-OP batch
        effectRunCount = 0;

        // Update all configs to their previous values (no change)
        instance.set({
            configA: 10,
            configB: 2,
            configC: 3
        });

        expect(effectRunCount).toBe(0);

        effect.destroy();
        instance.destroy();
    });

    test('EffectManager should correctly manage batch state via pause() and resume()', () => {
        expect(EffectManager.isPaused()).toBe(false);

        EffectManager.pause();
        expect(EffectManager.isPaused()).toBe(true);

        EffectManager.pause(); // Nested batch
        expect(EffectManager.isPaused()).toBe(true);

        EffectManager.resume();
        expect(EffectManager.isPaused()).toBe(true);

        EffectManager.resume();
        expect(EffectManager.isPaused()).toBe(false);
    });

    test('Effect should run when a dependency is changed inside an afterSet hook', () => {
        class IndirectDependencyClass extends core.Base {
            static config = {
                className: 'Neo.Test.IndirectDependencyClass',
                configA_ : 'initialA',
                configB_ : 'initialB'
            }

            afterSetConfigA(newValue, oldValue) {
                // Only change configB if configA is being updated, not during initial construction
                if (oldValue !== undefined) {
                    this.configB = `changed by A: ${newValue}`;
                }
            }
        }
        IndirectDependencyClass = Neo.setupClass(IndirectDependencyClass);

        const instance     = Neo.create(IndirectDependencyClass);
        let effectRunCount = 0;
        let effectValue    = '';

        // Effect depends only on configB
        const effect = new Effect(() => {
            effectRunCount++;
            effectValue = instance.configB;
        });

        expect(effectRunCount).toBe(1);
        expect(effect.dependencies.size).toBe(1);
        expect(effectValue).toBe('initialB');

        // Reset run count for test
        effectRunCount = 0;

        // Change configA, which should indirectly change configB via afterSetConfigA
        instance.configA = 'newA';

        expect(effectRunCount).toBe(1);
        expect(effectValue).toBe('changed by A: newA');
        expect(instance.configA).toBe('newA');
        expect(instance.configB).toBe('changed by A: newA');

        effect.destroy();
        instance.destroy();
    });

    test('Effect should run when a dependency is changed inside a beforeSet hook', () => {
        class BeforeSetDependencyClass extends core.Base {
            static config = {
                className: 'Neo.Test.BeforeSetDependencyClass',
                configA_ : 'initialA',
                configC_ : 'initialC' // configC will be changed by beforeSetConfigA
            }

            beforeSetConfigA(newValue, oldValue) {
                // Only change configC if configA is being updated, not during initial construction
                if (oldValue !== undefined) {
                    this.configC = `changed by A (before): ${newValue}`;
                }
                return newValue; // Important: return newValue to allow configA to be set
            }
        }
        BeforeSetDependencyClass = Neo.setupClass(BeforeSetDependencyClass);

        const instance     = Neo.create(BeforeSetDependencyClass);
        let effectRunCount = 0;
        let effectValue    = '';

        // Effect depends only on configC
        const effect = new Effect(() => {
            effectRunCount++;
            effectValue = instance.configC;
        });

        expect(effectRunCount).toBe(1);
        expect(effect.dependencies.size).toBe(1);
        expect(effectValue).toBe('initialC');

        // Reset run count for test
        effectRunCount = 0;

        // Change configA, which should indirectly change configC via beforeSetConfigA
        instance.configA = 'newA';

        expect(effectRunCount).toBe(1);
        expect(effectValue).toBe('changed by A (before): newA');
        expect(instance.configA).toBe('newA');
        expect(instance.configC).toBe('changed by A (before): newA');

        effect.destroy();
        instance.destroy();
    });

    test('Effect should run for dependencies changed by both beforeSet and afterSet hooks', () => {
        class CombinedDependencyClass extends core.Base {
            static config = {
                className: 'Neo.Test.CombinedDependencyClass',
                configA_ : 'initialA',
                configB_ : 'initialB', // Changed by afterSet
                configC_ : 'initialC'  // Changed by beforeSet
            }

            beforeSetConfigA(newValue, oldValue) {
                if (oldValue !== undefined) {
                    this.configC = `changed by A (before): ${newValue}`;
                }
                return newValue;
            }

            afterSetConfigA(newValue, oldValue) {
                if (oldValue !== undefined) {
                    this.configB = `changed by A (after): ${newValue}`;
                }
            }
        }
        CombinedDependencyClass = Neo.setupClass(CombinedDependencyClass);

        const instance      = Neo.create(CombinedDependencyClass);
        let effectBRunCount = 0;
        let effectCRunCount = 0;
        let effectBValue    = '';
        let effectCValue    = '';

        // Effect for configB (changed by afterSet)
        const effectB = new Effect(() => {
            effectBRunCount++;
            effectBValue = instance.configB;
        });

        // Effect for configC (changed by beforeSet)
        const effectC = new Effect(() => {
            effectCRunCount++;
            effectCValue = instance.configC;
        });

        expect(effectBRunCount).toBe(1);
        expect(effectB.dependencies.size).toBe(1);
        expect(effectBValue).toBe('initialB');

        expect(effectCRunCount).toBe(1);
        expect(effectC.dependencies.size).toBe(1);
        expect(effectCValue).toBe('initialC');

        // Reset run counts for test
        effectBRunCount = 0;
        effectCRunCount = 0;

        // Change configA, which should indirectly change configB and configC
        instance.configA = 'newA';

        expect(effectBRunCount).toBe(1);
        expect(effectBValue).toBe('changed by A (after): newA');
        expect(instance.configB).toBe('changed by A (after): newA');

        expect(effectCRunCount).toBe(1);
        expect(effectCValue).toBe('changed by A (before): newA');
        expect(instance.configC).toBe('changed by A (before): newA');

        expect(instance.configA).toBe('newA');

        effectB.destroy();
        effectC.destroy();
        instance.destroy();
    });

    test('Single Effect should run once for dependencies changed by both beforeSet and afterSet hooks', () => {
        class SingleEffectCombinedDependencyClass extends core.Base {
            static config = {
                className: 'Neo.Test.SingleEffectCombinedDependencyClass',
                configA_ : 'initialA',
                configB_ : 'initialB', // Changed by afterSet
                configC_ : 'initialC'  // Changed by beforeSet
            }

            beforeSetConfigA(newValue, oldValue) {
                if (oldValue !== undefined) {
                    this.configC = `changed by A (before): ${newValue}`;
                }
                return newValue;
            }

            afterSetConfigA(newValue, oldValue) {
                if (oldValue !== undefined) {
                    this.configB = `changed by A (after): ${newValue}`;
                }
            }
        }
        SingleEffectCombinedDependencyClass = Neo.setupClass(SingleEffectCombinedDependencyClass);

        const instance     = Neo.create(SingleEffectCombinedDependencyClass);
        let effectRunCount = 0;
        let effectValue    = '';

        // Single Effect depends on both configB and configC
        const effect = new Effect(() => {
            effectRunCount++;
            effectValue = `${instance.configB} | ${instance.configC}`;
        });

        expect(effectRunCount).toBe(1);
        expect(effect.dependencies.size).toBe(2);
        expect(effectValue).toBe('initialB | initialC');

        // Reset run count for test
        effectRunCount = 0;

        // Change configA, which should indirectly change configB and configC
        instance.configA = 'newA';

        expect(effectRunCount).toBe(1);
        expect(effectValue).toBe('changed by A (after): newA | changed by A (before): newA');
        expect(instance.configA).toBe('newA');
        expect(instance.configB).toBe('changed by A (after): newA');
        expect(instance.configC).toBe('changed by A (before): newA');

        effect.destroy();
        instance.destroy();
    });
});
