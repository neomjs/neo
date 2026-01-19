import {setup} from '../../setup.mjs';

const appName = 'CollisionTest';

setup({
    neoConfig: {
        useDomApiRenderer: false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import VdomLifecycle  from '../../../../src/mixin/VdomLifecycle.mjs';

test.describe('VdomLifecycle Collision Logic', () => {

    test('Depth 1 (Parent) vs Distance 1 (Child) should collide', () => {
        const mixin = VdomLifecycle.prototype;
        
        // Depth 1: Parent updating itself (including its child references/placeholders)
        // Distance 1: Direct Child updating itself
        
        // If they run in parallel:
        // Parent sends: { cn: [{componentId: 'child'}] } (Placeholder)
        // Child sends: { tag: 'div', text: 'content' } (Content)
        
        // Worker State:
        // If Parent wins: Child becomes placeholder.
        // If Child wins: Child becomes content.
        
        // They are fighting over the state of the child node in the VNode tree.
        // Therefore, they SHOULD collide.
        
        const hasCollision = mixin.hasUpdateCollision(1, 1);
        
        // Current implementation: return updateDepth === -1 ? true : distance <= updateDepth;
        // 1 <= 1 is true.
        
        console.log('Has Collision (1, 1):', hasCollision);
        
        expect(hasCollision).toBe(true); 
    });
});
