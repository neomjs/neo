/**
 * @summary Verifies the uniqueness and stability of auto-generated VDOM IDs to prevent collisions.
 *
 * This test suite focuses on the VDOM ID generation logic within the Neo.mjs framework.
 * It specifically safeguards against a critical regression where sequential auto-IDs could collide,
 * causing `ComponentManager` to misidentify component wrapper nodes.
 *
 * The tests verify:
 * 1. Uniqueness of VDOM IDs across same-class and different-class instances.
 * 2. The fix for the `ComponentManager.wrapperNodes` collision bug, ensuring that wrapper nodes
 *    use deterministic IDs (`component.id + '__wrapper'`) rather than fragile sequential integers.
 * 3. Correct registration of these nodes in the global `ComponentManager`.
 *
 * @class Test.unit.vdom.AutoId
 * @see Neo.vdom.Helper
 * @see Neo.manager.Component
 * @see Neo.core.IdGenerator
 */
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

MyComponent = Neo.setupClass(MyComponent);
MyOtherComponent = Neo.setupClass(MyOtherComponent);

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
        // This test simulates the "Shared Prototype" anti-pattern where a VDOM object is shared across instances.
        // The goal is to verify that VdomHelper.createVnode() correctly generates unique IDs for new VNodes,
        // even if the input configuration object is the same reference.

        class BadComponent extends Component {
            static config = {
                className: 'Test.BadComponent'
            }
        }
        
        // Manually inject a shared vdom object into the prototype to bypass Component.mergeConfig() cloning
        const sharedVdom = { tag: 'div', cls: ['shared'] };
        BadComponent.prototype._vdom = sharedVdom; 

        BadComponent = Neo.setupClass(BadComponent);

        // We simulate the vdom creation process for two "instances" using the shared configuration object.
        // VdomHelper.createVnode() should always return a new VNode instance with a unique ID,
        // ensuring that sharing the input configuration does not lead to VDOM ID collisions.
        const vdom1 = sharedVdom;
        const vnode1 = VdomHelper.createVnode(vdom1);
        
        const vnode2 = VdomHelper.createVnode(vdom1);
        
        expect(vnode1.id).not.toBe(vnode2.id);
    });

    test('ComponentManager.wrapperNodes Collision Prevention (Fix Verification)', async () => {
        // This test verifies that wrapper nodes (the root elements of components) receive deterministic,
        // stable IDs (e.g., 'componentId__wrapper') instead of sequential auto-generated IDs.
        // This stability is critical to prevent collisions in ComponentManager.wrapperNodes when
        // the IdGenerator state is reset or when IDs are generated in different orders.

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
        WrapperComponent = Neo.setupClass(WrapperComponent);

        // Verify that the first component gets the expected stable wrapper ID
        core.IdGenerator.idCounter['vnode'] = 0;
        const c1 = Neo.create(WrapperComponent, {appName});
        await c1.initVnode();
        const vnodeId1 = c1.vnode.id;
        
        expect(vnodeId1).toBe(c1.id + '__wrapper');

        // Simulate an IdGenerator reset (or race condition) where the counter restarts.
        // Previously, this would cause the next component to generate the same ID as the first one.
        core.IdGenerator.idCounter['vnode'] = 0;

        // Verify that the second component still generates a unique wrapper ID despite the reset,
        // proving that the ID is derived from the unique component ID and not the global counter.
        const c2 = Neo.create(WrapperComponent, {appName});
        await c2.initVnode();
        const vnodeId2 = c2.vnode.id;

        expect(vnodeId2).toBe(c2.id + '__wrapper');

        // Verify global uniqueness and ComponentManager integrity
        expect(vnodeId1).not.toBe(vnodeId2); 
        expect(c1.id).not.toBe(c2.id);

        const manager = Neo.manager.Component;
        expect(manager.wrapperNodes.get(vnodeId1)).toBe(c1);
        expect(manager.wrapperNodes.get(vnodeId2)).toBe(c2);

        // Verify that addVnodeComponentReferences correctly resolves the component
        // using the stable wrapper ID.
        const parentVnode = {
            id: 'parent',
            childNodes: [c1.vnode]
        };

        const resultVnode = manager.addVnodeComponentReferences(parentVnode, 'parent');
        
        const reference = resultVnode.childNodes[0];
        
        expect(reference.componentId).toBe(c1.id);
        expect(reference.id).toBe(vnodeId1);

        c1.destroy();
        c2.destroy();
    });
});
