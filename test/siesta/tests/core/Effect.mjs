import Neo           from '../../../../src/Neo.mjs';
import * as core     from '../../../../src/core/_export.mjs';
import Effect        from '../../../../src/core/Effect.mjs';
import EffectManager from '../../../../src/core/EffectManager.mjs';
import Config        from '../../../../src/core/Config.mjs';

StartTest(t => {
    t.it('EffectManager should manage active effects', t => {
        const effect1 = new Effect(() => {});
        const effect2 = new Effect(() => {});

        t.is(EffectManager.getActiveEffect(), null, 'No active effect initially');

        EffectManager.push(effect1);
        t.is(EffectManager.getActiveEffect(), effect1, 'Effect1 is active');

        EffectManager.push(effect2);
        t.is(EffectManager.getActiveEffect(), effect2, 'Effect2 is active');

        EffectManager.pop();
        t.is(EffectManager.getActiveEffect(), effect1, 'Effect1 is active after pop');

        EffectManager.pop();
        t.is(EffectManager.getActiveEffect(), null, 'No active effect after all pops');

        effect1.destroy();
        effect2.destroy();
    });

    t.it('Effect should run its function and track dependencies', t => {
        let runCount = 0;
        let sum      = 0;
        const configA = new Config(1);
        const configB = new Config(10);

        // Identity check
        t.is(configA,    configA, 'configA is strictly equal to itself');
        t.is(configB,    configB, 'configB is strictly equal to itself');
        t.isNot(configA, configB, 'configA is not strictly equal to configB');

        const effect = new Effect(() => {
            runCount++;
            // Access configs to register them as dependencies
            sum = configA.get() + configB.get();
            t.pass(`Effect ran. Sum: ${sum}`);
        });

        t.is(runCount,                  1, 'Effect function ran once on creation');
        t.is(effect.dependencies.size,  2, 'Effect tracked 2 dependencies');
        t.is(sum,                      11, 'Effect function ran with correct sum: 1 + 10 = 11');

        // Change a dependency, effect should re-run
        configA.set(2);
        t.is(runCount,  2, 'Effect function ran again after configA change');
        t.is(sum,      12, 'Effect function ran with correct sum: 2 + 10 = 12');

        // Change another dependency, effect should re-run
        configB.set(20);
        t.is(runCount,  3, 'Effect function ran again after configB change');
        t.is(sum,      22, 'Effect function ran with correct sum: 2 + 20 = 22');

        // Change a dependency to the same value, effect should not re-run (Config handles this)
        configA.set(2);
        t.is(runCount,  3, 'Effect function did not run after no-change configA update');
        t.is(sum,      22, 'Effect function ran with correct sum: 2 + 20 = 22');

        effect.destroy();
        t.is(effect.isDestroyed,       true, 'Effect is destroyed');
        t.is(effect.dependencies.size, 0,    'Effect dependencies cleared after destroy');

        // Changing config after effect is destroyed should not re-run effect
        configA.set(3);
        t.is(runCount,  3, 'Effect function did not run after configA change when destroyed');
        t.is(sum,      22, 'Effect function ran with correct sum: 2 + 20 = 22');
    });

    t.it('Effect should clean up old dependencies on re-run', t => {
        let runCount = 0;
        const configX = new Config('X');
        const configY = new Config('Y');

        // Initial effect: depends on configX
        const effect = new Effect(() => {
            runCount++;
            t.is(configX.get(), 'X', 'Effect ran (1st): configX value');
        });

        t.is(runCount,                 1, 'Effect ran once initially');
        t.is(effect.dependencies.size, 1, 'Effect has 1 dependency (configX)');

        // --- Transition to configY dependency ---
        // Reassign the effect's function to depend on configY
        effect.fn = () => {
            runCount++;

            if (runCount === 2) {
                t.is(configY.get(), 'Y', 'Effect ran (2nd): configY value');
            }

            if (runCount === 3) {
                t.is(configY.get(), 'Y_new', 'Effect ran (3rd): configY value');
            }

            else if (runCount === 4) {
                t.is(configY.get(), 'Y_final', 'Effect ran (4th): configY value');
            }
        };

        t.is(runCount, 2, 'Effect ran a second time after fn reassignment');

        // Changing the config value will trigger a re-run.
        configY.set('Y_new');

        t.is(runCount,                 3, 'Effect ran a second time after fn reassignment');
        t.is(effect.dependencies.size, 1, 'Effect now has 1 dependency (configY)');

        // Change configX: should NOT trigger the effect (old dependency cleaned up)
        configX.set('X_new');
        t.is(runCount, 3, 'Effect did not re-run after old dependency (configX) changed');

        // Change configY: should trigger the effect (new dependency)
        configY.set('Y_final'); // This will trigger runCount to become 3
        t.is(runCount, 4, 'Effect re-ran after new dependency (configY) changed');

        effect.destroy();
    });
});
