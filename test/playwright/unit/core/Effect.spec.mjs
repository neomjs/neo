import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'CoreEffectTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Effect         from '../../../../src/core/Effect.mjs';
import EffectManager  from '../../../../src/core/EffectManager.mjs';
import Config         from '../../../../src/core/Config.mjs';

test.describe('Neo.core.Effect', () => {
    test('EffectManager should manage active effects', () => {
        const effect1 = new Effect(() => {});
        const effect2 = new Effect(() => {});

        expect(EffectManager.getActiveEffect()).toBe(undefined);

        EffectManager.push(effect1);
        expect(EffectManager.getActiveEffect()).toBe(effect1);

        EffectManager.push(effect2);
        expect(EffectManager.getActiveEffect()).toBe(effect2);

        EffectManager.pop();
        expect(EffectManager.getActiveEffect()).toBe(effect1);

        EffectManager.pop();
        expect(EffectManager.getActiveEffect()).toBe(undefined);

        effect1.destroy();
        effect2.destroy();
    });

    test('Effect should run its function and track dependencies', () => {
        let runCount = 0;
        let sum = 0;
        const configA = new Config(1);
        const configB = new Config(10);

        expect(configA).toBe(configA);
        expect(configB).toBe(configB);
        expect(configA).not.toBe(configB);

        const effect = new Effect(() => {
            runCount++;
            sum = configA.get() + configB.get();
        });

        expect(runCount).toBe(1);
        expect(effect.dependencies.size).toBe(2);
        expect(sum).toBe(11);

        // Change a dependency, effect should re-run
        configA.set(2);
        expect(runCount).toBe(2);
        expect(sum).toBe(12);

        // Change another dependency, effect should re-run
        configB.set(20);
        expect(runCount).toBe(3);
        expect(sum).toBe(22);

        // Change a dependency to the same value, effect should not re-run
        configA.set(2);
        expect(runCount).toBe(3);
        expect(sum).toBe(22);

        effect.destroy();
        expect(effect.isDestroyed).toBe(true);
        expect(effect.dependencies.size).toBe(0);

        // Changing config after effect is destroyed should not re-run effect
        configA.set(3);
        expect(runCount).toBe(3);
        expect(sum).toBe(22);
    });

    test('Effect should clean up old dependencies on re-run', () => {
        let runCount = 0;
        const configX = new Config('X');
        const configY = new Config('Y');

        // Initial effect: depends on configX
        const effect = new Effect(() => {
            runCount++;
            expect(configX.get()).toBe('X');
        });

        expect(runCount).toBe(1);
        expect(effect.dependencies.size).toBe(1);

        // --- Transition to configY dependency ---
        // Reassign the effect's function to depend on configY
        effect.fn = () => {
            runCount++;

            if (runCount === 2) {
                expect(configY.get()).toBe('Y');
            }

            if (runCount === 3) {
                expect(configY.get()).toBe('Y_new');
            }

            else if (runCount === 4) {
                expect(configY.get()).toBe('Y_final');
            }
        };

        expect(runCount).toBe(2);

        // Changing the config value will trigger a re-run.
        configY.set('Y_new');

        expect(runCount).toBe(3);
        expect(effect.dependencies.size).toBe(1);

        // Change configX: should NOT trigger the effect (old dependency cleaned up)
        configX.set('X_new');
        expect(runCount).toBe(3);

        // Change configY: should trigger the effect (new dependency)
        configY.set('Y_final');
        expect(runCount).toBe(4);

        effect.destroy();
    });
});
