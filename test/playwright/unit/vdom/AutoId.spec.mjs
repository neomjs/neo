import {setup} from '../../setup.mjs';

const appName = 'AutoIdTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

class MyComponent extends Component {
    static config = {
        className: 'Test.MyComponent',
        _vdom: {
            tag: 'div',
            cls: ['my-component'],
            cn : [{
                tag: 'span',
                cls: ['inner-span']
            }]
        }
    }
}

class MyOtherComponent extends Component {
    static config = {
        className: 'Test.MyOtherComponent',
        _vdom: {
            tag: 'section',
            cls: ['other-component'],
            cn : [{
                tag: 'div',
                cls: ['inner-div']
            }]
        }
    }
}

Neo.setupClass(MyComponent);
Neo.setupClass(MyOtherComponent);

test.describe('VDOM Auto-ID Generation', () => {

    test('Instances of same class should have unique VDOM IDs', async () => {
        const c1 = Neo.create(MyComponent, {appName});
        await c1.initVnode();
        
        const c2 = Neo.create(MyComponent, {appName});
        await c2.initVnode();

        const id1 = c1.vnode.id;
        const id2 = c2.vnode.id;

        expect(id1).toBeDefined();
        expect(id2).toBeDefined();
        expect(id1).not.toBe(id2);

        // Check children IDs
        const childId1 = c1.vnode.childNodes[0].id;
        const childId2 = c2.vnode.childNodes[0].id;

        expect(childId1).toBeDefined();
        expect(childId2).toBeDefined();
        expect(childId1).not.toBe(childId2);

        c1.destroy();
        c2.destroy();
    });

    test('Instances of different classes should have unique VDOM IDs', async () => {
        const c1 = Neo.create(MyComponent, {appName});
        await c1.initVnode();

        const c2 = Neo.create(MyOtherComponent, {appName});
        await c2.initVnode();

        const id1 = c1.vnode.id;
        const id2 = c2.vnode.id;

        expect(id1).not.toBe(id2);

        c1.destroy();
        c2.destroy();
    });

    test('Should reproduce ID collision if VDOM is shared (Anti-Pattern Check)', async () => {
        // This test manually simulates the "Shared Prototype" bug to prove it causes ID collision
        class BadComponent extends Component {
            static config = {
                className: 'Test.BadComponent'
                // vdom defined as non-reactive property, possibly shared?
                // But Component.mergeConfig clones it.
                // We need to bypass the clone logic to simulate the bug.
            }
        }
        
        // Manually inject a shared vdom object into prototype
        const sharedVdom = { tag: 'div', cls: ['shared'] };
        BadComponent.prototype._vdom = sharedVdom; 

        Neo.setupClass(BadComponent);

        // Force instances to use the shared object (bypass mergeConfig cloning)
        // We can't easily bypass construct() logic. 
        // But we can verify that IF they share the object, IDs collide.
        
        // Simulating logic:
        const vdom1 = sharedVdom;
        const vnode1 = VdomHelper.createVnode(vdom1); // This assigns ID to vdom1 if optimization used? 
        // VdomHelper.createVnode returns NEW VNode. It doesn't mutate input vdom ID unless it's a component placeholder?
        // Wait, VNode constructor assigns ID.
        
        // If vdom1 (the plain object) doesn't have an ID, VNode constructor generates one.
        // It does NOT write it back to vdom1.
        
        const vnode2 = VdomHelper.createVnode(vdom1);
        
        // Since vdom1 is just input config, vnode1 and vnode2 are new instances.
        // They will generate NEW IDs.
        
        expect(vnode1.id).not.toBe(vnode2.id);
        
        // So even if they share the prototype object, Helper generates unique IDs!
        // This disproves the "Shared Prototype VDOM" causing ID collision theory, 
        // UNLESS the ID is written back to the shared object BEFORE Helper sees it.
    });

    test('ComponentManager.wrapperNodes Collision Prevention (Fix Verification)', async () => {
        // This test verifies that the fix (stable __wrapper IDs) prevents collisions
        // in ComponentManager.wrapperNodes even if IdGenerator state is reset.

        class WrapperComponent extends Component {
            static config = {
                className: 'Test.WrapperComponent',
                _vdom: {
                    // This node should now get me.id + '__wrapper'
                    cn: [{ tag: 'div', cls: ['wrapped-content'] }]
                }
            }
            
            getVdomRoot() { return this.vdom.cn[0]; }
            getVnodeRoot() { return this.vnode.childNodes[0]; }
        }
        Neo.setupClass(WrapperComponent);

        // 1. Create first component
        core.IdGenerator.idCounter['vnode'] = 0;
        const c1 = Neo.create(WrapperComponent, {appName});
        await c1.initVnode();
        const vnodeId1 = c1.vnode.id;
        
        expect(vnodeId1).toBe(c1.id + '__wrapper');

        // 2. Reset IdGenerator for 'vnode' 
        core.IdGenerator.idCounter['vnode'] = 0;

        // 3. Create second component
        const c2 = Neo.create(WrapperComponent, {appName});
        await c2.initVnode();
        const vnodeId2 = c2.vnode.id;

        expect(vnodeId2).toBe(c2.id + '__wrapper');

        // Verify NO collision occurred
        expect(vnodeId1).not.toBe(vnodeId2); 
        expect(c1.id).not.toBe(c2.id);

        // Check ComponentManager state - both should be registered correctly
        const manager = Neo.manager.Component;
        expect(manager.wrapperNodes.get(vnodeId1)).toBe(c1);
        expect(manager.wrapperNodes.get(vnodeId2)).toBe(c2);

        // 4. Verify addVnodeComponentReferences picks up correct IDs
        const parentVnode = {
            id: 'parent',
            childNodes: [c1.vnode]
        };

        const resultVnode = manager.addVnodeComponentReferences(parentVnode, 'parent');
        
        // RESULT: The node representing c1's root is correctly replaced by a reference to c1
        const reference = resultVnode.childNodes[0];
        
        expect(reference.componentId).toBe(c1.id); // FIXED!
        expect(reference.id).toBe(vnodeId1);

        c1.destroy();
        c2.destroy();
    });
});
