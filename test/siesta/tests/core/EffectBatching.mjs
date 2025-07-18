import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Effect             from '../../../../src/core/Effect.mjs';
import EffectBatchManager from '../../../../src/core/EffectBatchManager.mjs';

class TestComponent extends core.Base {
    static config = {
        className: 'Neo.Test.EffectBatchingComponent',
        configA_: 0,
        configB_: 0,
        configC_: 0
    }
}
Neo.setupClass(TestComponent);

StartTest(t => {
    t.it('Effects should be batched during core.Base#set() operations', t => {
        const instance = Neo.create(TestComponent);
        let effectRunCount = 0;
        let sum = 0;

        const effect = new Effect(() => {
            effectRunCount++;
            // Access all props to make them dependencies
            sum = instance.configA + instance.configB + instance.configC;
            t.pass(`Effect ran. Sum: ${sum}`);
        });

        t.is(effectRunCount, 1, 'Effect ran once on initial creation');
        t.is(effect.dependencies.size, 3, 'Effect tracked 3 dependencies');
        t.is(sum, 0, 'Initial sum should be 0');

        // Reset run count for batching test
        effectRunCount = 0;

        // Change multiple properties in a single batch via instance.set()
        instance.set({
            configA: 1,
            configB: 2,
            configC: 3
        });

        t.is(effectRunCount, 1, 'Effect should run exactly once after a batched set() operation');
        t.is(sum, 6, 'Sum should be 1 + 2 + 3 = 6 after batched set()');
        t.is(instance.configA, 1, 'configA should be updated');
        t.is(instance.configB, 2, 'configB should be updated');
        t.is(instance.configC, 3, 'configC should be updated');

        // Test individual property change outside a batch
        effectRunCount = 0;
        instance.configA = 10;
        t.is(effectRunCount, 1, 'Effect should run immediately for individual property change outside a batch');
        t.is(sum, 10 + 2 + 3, 'Sum should be 10 + 2 + 3 = 15 after individual configA change');

        t.diag('Testing a no-OP batch');
        effectRunCount = 0;

        // Update all configs to their previous values (no change)
        instance.set({
            configA: 10,
            configB:  2,
            configC:  3
        });

        t.is(effectRunCount, 0, 'Effect should not run.');

        effect.destroy();
        instance.destroy();
    });

    t.it('EffectBatchManager should correctly manage batch state', t => {
        t.is(EffectBatchManager.isBatchActive(), false, 'Batch should not be active initially');

        EffectBatchManager.startBatch();
        t.is(EffectBatchManager.isBatchActive(), true, 'Batch should be active after startBatch()');

        EffectBatchManager.startBatch(); // Nested batch
        t.is(EffectBatchManager.isBatchActive(), true, 'Batch should still be active for nested batch');

        EffectBatchManager.endBatch();
        t.is(EffectBatchManager.isBatchActive(), true, 'Batch should still be active after inner endBatch()');

        EffectBatchManager.endBatch();
        t.is(EffectBatchManager.isBatchActive(), false, 'Batch should not be active after all endBatch() calls');
    });

    t.it('Effect should run when a dependency is changed inside an afterSet hook', t => {
        class IndirectDependencyComponent extends core.Base {
            static config = {
                className: 'Neo.Test.IndirectDependencyComponent',
                configA_: 'initialA',
                configB_: 'initialB'
            }

            afterSetConfigA(newValue, oldValue) {
                // Only change configB if configA is being updated, not during initial construction
                if (oldValue !== undefined) {
                    this.configB = `changed by A: ${newValue}`;
                }
            }
        }
        Neo.setupClass(IndirectDependencyComponent);

        const instance = Neo.create(IndirectDependencyComponent);
        let effectRunCount = 0;
        let effectValue = '';

        // Effect depends only on configB
        const effect = new Effect(() => {
            effectRunCount++;
            effectValue = instance.configB;
            t.pass(`Effect ran. configB: ${effectValue}`);
        });

        t.is(effectRunCount, 1, 'Effect ran once on initial creation');
        t.is(effect.dependencies.size, 1, 'Effect tracked 1 dependency (configB)');
        t.is(effectValue, 'initialB', 'Initial effect value is configB');

        // Reset run count for test
        effectRunCount = 0;

        // Change configA, which should indirectly change configB via afterSetConfigA
        instance.configA = 'newA';

        t.is(effectRunCount, 1, 'Effect should run exactly once after indirect change to configB');
        t.is(effectValue, 'changed by A: newA', 'Effect value should reflect indirect change');
        t.is(instance.configA, 'newA', 'configA should be updated');
        t.is(instance.configB, 'changed by A: newA', 'configB should be updated by afterSet hook');

        effect.destroy();
        instance.destroy();
    });

    t.it('Effect should run when a dependency is changed inside a beforeSet hook', t => {
        class BeforeSetDependencyComponent extends core.Base {
            static config = {
                className: 'Neo.Test.BeforeSetDependencyComponent',
                configA_: 'initialA',
                configC_: 'initialC' // configC will be changed by beforeSetConfigA
            }

            beforeSetConfigA(newValue, oldValue) {
                // Only change configC if configA is being updated, not during initial construction
                if (oldValue !== undefined) {
                    this.configC = `changed by A (before): ${newValue}`;
                }
                return newValue; // Important: return newValue to allow configA to be set
            }
        }
        Neo.setupClass(BeforeSetDependencyComponent);

        const instance = Neo.create(BeforeSetDependencyComponent);
        let effectRunCount = 0;
        let effectValue = '';

        // Effect depends only on configC
        const effect = new Effect(() => {
            effectRunCount++;
            effectValue = instance.configC;
            t.pass(`Effect ran. configC: ${effectValue}`);
        });

        t.is(effectRunCount, 1, 'Effect ran once on initial creation');
        t.is(effect.dependencies.size, 1, 'Effect tracked 1 dependency (configC)');
        t.is(effectValue, 'initialC', 'Initial effect value is configC');

        // Reset run count for test
        effectRunCount = 0;

        // Change configA, which should indirectly change configC via beforeSetConfigA
        instance.configA = 'newA';

        t.is(effectRunCount, 1, 'Effect should run exactly once after indirect change to configC');
        t.is(effectValue, 'changed by A (before): newA', 'Effect value should reflect indirect change from beforeSet');
        t.is(instance.configA, 'newA', 'configA should be updated');
        t.is(instance.configC, 'changed by A (before): newA', 'configC should be updated by beforeSet hook');

        effect.destroy();
        instance.destroy();
    });

    t.it('Effect should run for dependencies changed by both beforeSet and afterSet hooks', t => {
        class CombinedDependencyComponent extends core.Base {
            static config = {
                className: 'Neo.Test.CombinedDependencyComponent',
                configA_: 'initialA',
                configB_: 'initialB', // Changed by afterSet
                configC_: 'initialC'  // Changed by beforeSet
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
        Neo.setupClass(CombinedDependencyComponent);

        const instance = Neo.create(CombinedDependencyComponent);
        let effectBRunCount = 0;
        let effectCRunCount = 0;
        let effectBValue = '';
        let effectCValue = '';

        // Effect for configB (changed by afterSet)
        const effectB = new Effect(() => {
            effectBRunCount++;
            effectBValue = instance.configB;
            t.pass(`EffectB ran. configB: ${effectBValue}`);
        });

        // Effect for configC (changed by beforeSet)
        const effectC = new Effect(() => {
            effectCRunCount++;
            effectCValue = instance.configC;
            t.pass(`EffectC ran. configC: ${effectCValue}`);
        });

        t.is(effectBRunCount, 1, 'EffectB ran once on initial creation');
        t.is(effectB.dependencies.size, 1, 'EffectB tracked 1 dependency (configB)');
        t.is(effectBValue, 'initialB', 'Initial EffectB value is configB');

        t.is(effectCRunCount, 1, 'EffectC ran once on initial creation');
        t.is(effectC.dependencies.size, 1, 'EffectC tracked 1 dependency (configC)');
        t.is(effectCValue, 'initialC', 'Initial EffectC value is configC');

        // Reset run counts for test
        effectBRunCount = 0;
        effectCRunCount = 0;

        // Change configA, which should indirectly change configB and configC
        instance.configA = 'newA';

        t.is(effectBRunCount, 1, 'EffectB should run exactly once after indirect change to configB');
        t.is(effectBValue, 'changed by A (after): newA', 'EffectB value should reflect indirect change from afterSet');
        t.is(instance.configB, 'changed by A (after): newA', 'configB should be updated by afterSet hook');

        t.is(effectCRunCount, 1, 'EffectC should run exactly once after indirect change to configC');
        t.is(effectCValue, 'changed by A (before): newA', 'EffectC value should reflect indirect change from beforeSet');
        t.is(instance.configC, 'changed by A (before): newA', 'configC should be updated by beforeSet hook');

        t.is(instance.configA, 'newA', 'configA should be updated');

        effectB.destroy();
        effectC.destroy();
        instance.destroy();
    });

    t.it('Single Effect should run once for dependencies changed by both beforeSet and afterSet hooks', t => {
        class SingleEffectCombinedDependencyComponent extends core.Base {
            static config = {
                className: 'Neo.Test.SingleEffectCombinedDependencyComponent',
                configA_: 'initialA',
                configB_: 'initialB', // Changed by afterSet
                configC_: 'initialC'  // Changed by beforeSet
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
        Neo.setupClass(SingleEffectCombinedDependencyComponent);

        const instance = Neo.create(SingleEffectCombinedDependencyComponent);
        let effectRunCount = 0;
        let effectValue = '';

        // Single Effect depends on both configB and configC
        const effect = new Effect(() => {
            effectRunCount++;
            effectValue = `${instance.configB} | ${instance.configC}`;
            t.pass(`Effect ran. Combined: ${effectValue}`);
        });

        t.is(effectRunCount, 1, 'Effect ran once on initial creation');
        t.is(effect.dependencies.size, 2, 'Effect tracked 2 dependencies (configB, configC)');
        t.is(effectValue, 'initialB | initialC', 'Initial effect value is combined configB and configC');

        // Reset run count for test
        effectRunCount = 0;

        // Change configA, which should indirectly change configB and configC
        instance.configA = 'newA';

        t.is(effectRunCount, 1, 'Effect should run exactly once after indirect changes to configB and configC');
        t.is(effectValue, 'changed by A (after): newA | changed by A (before): newA', 'Effect value should reflect combined indirect changes');
        t.is(instance.configA, 'newA', 'configA should be updated');
        t.is(instance.configB, 'changed by A (after): newA', 'configB should be updated by afterSet hook');
        t.is(instance.configC, 'changed by A (before): newA', 'configC should be updated by beforeSet hook');

        effect.destroy();
        instance.destroy();
    });
});
