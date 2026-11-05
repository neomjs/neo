import {setup} from '../../setup.mjs';

setup({neoConfig: {allowVdomUpdatesInTests: true}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import EffectButton   from '../../../../src/button/Effect.mjs';

/**
 * @class Test.Unit.Button.EffectScheduling
 * @extends Neo.button.Effect
 * @summary Exposes the real render effect so its dependency boundary can be checked.
 */
class ObservedButton extends EffectButton {
    static config = {className: 'Test.Unit.Button.EffectScheduling'}

    /** @member {Neo.core.Effect|null} observedEffect=null */
    observedEffect = null

    /** @returns {Neo.core.Effect} The production effect, unchanged. */
    createVdomEffect() {
        return this.observedEffect = super.createVdomEffect()
    }
}
Neo.setupClass(ObservedButton);

test('visual configs drive rendering while scheduler flags stay outside the dependency set', () => {
    const button = Neo.create(ObservedButton, {text: 'Before'});

    try {
        // Construction skips scheduling; a later visual change reaches the real update path.
        button.text = 'After';
        const dependencies = button.observedEffect.dependencies;

        expect(button.vdom.cn[1].text).toBe('After');
        expect(dependencies.has(button.getConfig('text'))).toBe(true);
        for (const key of ['isVdomUpdating', 'needsVdomUpdate', 'mounted', 'vnodeInitialized', 'updateDepth']) {
            expect(dependencies.has(button.getConfig(key)), key).toBe(false)
        }
    } finally {
        button.observedEffect.destroy();
        button.destroy()
    }
});
