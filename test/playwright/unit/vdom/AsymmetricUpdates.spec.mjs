import {setup} from '../../setup.mjs';

const appName = 'VdomAsymmetricUpdatesTest';

setup({
    neoConfig: {
        useDomApiRenderer: true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import ComponentManager   from '../../../../src/manager/Component.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import TreeBuilder        from '../../../../src/util/vdom/TreeBuilder.mjs';
import VDomUpdate         from '../../../../src/manager/VDomUpdate.mjs';
import VdomLifecycle      from '../../../../src/mixin/VdomLifecycle.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import VDomUtil           from '../../../../src/util/VDom.mjs';

const createMockComponent = (id, parentId, vdom) => {
    const component = {
        id,
        parentId,
        vdom,
        isVdomUpdating: false,
        hasUpdateCollision: VdomLifecycle.prototype.hasUpdateCollision,
        isParentUpdating  : VdomLifecycle.prototype.isParentUpdating,
    };

    const { vnode } = VdomHelper.create({ vdom });
    component.vnode = vnode;

    ComponentManager.register(component);
    VDomUtil.syncVdomIds(component.vnode, component.vdom);

    return component;
};

test.describe('Neo.vdom.VdomAsymmetricUpdates', () => {
    test.beforeEach(() => {
        VDomUpdate.mergedCallbackMap.clear();
        VDomUpdate.postUpdateQueueMap.clear();
        ComponentManager.wrapperNodes.clear();
        ComponentManager.clear();
    });

    test('Should handle asymmetric update with depth 2 using DomApiRenderer', () => {
        const childVdomInitial = { id: 'child-1', cn: [{ tag: 'span', text: 'Initial' }] };
        const parentVdom = {
            id: 'parent-1',
            cn: [{ componentId: 'child-1' }]
        };

        let child  = createMockComponent('child-1', 'parent-1', childVdomInitial);
        let parent = createMockComponent('parent-1', 'root', parentVdom);

        VDomUpdate.registerMerged(parent.id, child.id, 1, 1);

        child.vdom.cn[0].text = 'Updated';

        const adjustedDepth = VDomUpdate.getAdjustedUpdateDepth(parent.id);
        expect(adjustedDepth).toBe(2);

        const newAsymmetricVdom = TreeBuilder.getVdomTree(parent.vdom, adjustedDepth);

        expect(newAsymmetricVdom.cn[0].id).toBe('child-1');
        expect(newAsymmetricVdom.cn[0].cn[0].text).toBe('Updated');

        const oldAsymmetricVnode = TreeBuilder.getVnodeTree(parent.vnode, adjustedDepth);
        const { deltas } = VdomHelper.update({
            vdom : newAsymmetricVdom,
            vnode: oldAsymmetricVnode
        });

        expect(deltas.length).toBe(1);
        const spanVnode = oldAsymmetricVnode.childNodes[0].childNodes[0];
        const delta = deltas[0];

        expect(delta.id).toBe(spanVnode.id);
        expect(delta.textContent).toBe('Updated');
        expect(Object.keys(delta).length).toBe(2);
    });

    test('Should handle nested asymmetric update (grandchild update)', () => {
        const grandchildVdomInitial = { id: 'grandchild-1', cn: [{ tag: 'span', text: 'Initial' }] };
        const childVdom = {
            id: 'child-1',
            cn: [{ componentId: 'grandchild-1' }]
        };
        const parentVdom = {
            id: 'parent-1',
            cn: [{ componentId: 'child-1' }]
        };

        const grandchild = createMockComponent('grandchild-1', 'child-1', grandchildVdomInitial);
        createMockComponent('child-1', 'parent-1', childVdom);
        let parent = createMockComponent('parent-1', 'root', parentVdom);

        VDomUpdate.registerMerged(parent.id, grandchild.id, 1, 2);

        grandchild.vdom.cn[0].text = 'Updated';

        const adjustedDepth = VDomUpdate.getAdjustedUpdateDepth(parent.id);
        expect(adjustedDepth).toBe(3);

        const newAsymmetricVdom = TreeBuilder.getVdomTree(parent.vdom, adjustedDepth);

        const expandedChild      = newAsymmetricVdom.cn[0];
        const expandedGrandchild = expandedChild.cn[0];
        expect(expandedGrandchild.id).toBe('grandchild-1');
        expect(expandedGrandchild.cn[0].text).toBe('Updated');

        const oldAsymmetricVnode = TreeBuilder.getVnodeTree(parent.vnode, adjustedDepth);
        const { deltas } = VdomHelper.update({
            vdom : newAsymmetricVdom,
            vnode: oldAsymmetricVnode
        });

        expect(deltas.length).toBe(1);
        const spanVnode = oldAsymmetricVnode.childNodes[0].childNodes[0].childNodes[0];
        const delta     = deltas[0];

        expect(delta.id).toBe(spanVnode.id);
        expect(delta.textContent).toBe('Updated');
        expect(Object.keys(delta).length).toBe(2);
    });

    test('Should handle structural change in a deeply nested component', () => {
        const grandchildVdomInitial = { id: 'grandchild-1', cn: [{ tag: 'span', text: 'Initial' }] };
        const childVdom = {
            id: 'child-1',
            cn: [{ componentId: 'grandchild-1' }]
        };
        const parentVdom = {
            id: 'parent-1',
            cn: [{ componentId: 'child-1' }]
        };

        let grandchild = createMockComponent('grandchild-1', 'child-1', grandchildVdomInitial);
        createMockComponent('child-1', 'parent-1', childVdom);
        let parent = createMockComponent('parent-1', 'root', parentVdom);

        VDomUpdate.registerMerged(parent.id, grandchild.id, 1, 2);

        grandchild.vdom.cn.push({ id: 'new-node', tag: 'div', text: 'New Node' });

        const adjustedDepth = VDomUpdate.getAdjustedUpdateDepth(parent.id);
        expect(adjustedDepth).toBe(3);

        const newAsymmetricVdom = TreeBuilder.getVdomTree(parent.vdom, adjustedDepth);
        const oldAsymmetricVnode = TreeBuilder.getVnodeTree(parent.vnode, adjustedDepth);

        const expandedGrandchildVdom = newAsymmetricVdom.cn[0].cn[0];
        expect(expandedGrandchildVdom.cn.length).toBe(2);
        expect(expandedGrandchildVdom.cn[1].id).toBe('new-node');

        const { deltas } = VdomHelper.update({
            vdom : newAsymmetricVdom,
            vnode: oldAsymmetricVnode
        });

        expect(deltas.length).toBe(1);
        const delta = deltas[0];
        const newNodeVdom = expandedGrandchildVdom.cn[1];

        expect(delta.action).toBe('insertNode');
        expect(delta.parentId).toBe(grandchild.vdom.id);
        expect(delta.index).toBe(1);

        expect(delta.vnode.id).toBe(newNodeVdom.id);
        expect(delta.vnode.textContent).toBe('New Node');
    });

    test('Should handle update collision (isParentUpdating)', () => {
        const childVdom  = { id: 'child-1', text: 'child' };
        const parentVdom = { id: 'parent-1', cn: [{ componentId: 'child-1' }] };

        let child  = createMockComponent('child-1', 'parent-1', childVdom);
        let parent = createMockComponent('parent-1', 'root', parentVdom);

        parent.isVdomUpdating = true;
        VDomUpdate.registerInFlightUpdate(parent.id, 2);

        let hasCollision = child.isParentUpdating(child.parentId, () => {});

        expect(hasCollision).toBe(true);
        const postUpdateQueue = VDomUpdate.postUpdateQueueMap.get(parent.id);
        expect(postUpdateQueue).toBeTruthy();
        expect(postUpdateQueue.children.length).toBe(1);
        expect(postUpdateQueue.children[0].childId).toBe(child.id);
    });

    test('Should not detect a collision if updateDepth is insufficient', () => {
        const grandchildVdom = {id: 'grandchild-1', text: 'grandchild'};
        const childVdom      = {id: 'child-1', cn: [{componentId: 'grandchild-1'}]};
        const parentVdom     = {id: 'parent-1', cn: [{componentId: 'child-1'}]};

        let grandchild = createMockComponent('grandchild-1', 'child-1', grandchildVdom);
        createMockComponent('child-1', 'parent-1', childVdom);
        let parent = createMockComponent('parent-1', 'root', parentVdom);

        parent.isVdomUpdating = true;
        VDomUpdate.registerInFlightUpdate(parent.id, 2);

        let hasCollision = grandchild.isParentUpdating(grandchild.parentId, () => {});

        expect(hasCollision).toBe(false);
        const postUpdateQueue = VDomUpdate.postUpdateQueueMap.get(parent.id);
        expect(postUpdateQueue).toBeFalsy();
    });

    test('Should handle merged updates from multiple non-contiguous children', () => {
        const grandchildVdom = { id: 'grandchild-1', cn: [{ tag: 'span', text: 'Initial GC' }] };
        const child1Vdom = { id: 'child-1', cn: [{ componentId: 'grandchild-1' }] };
        const child2Vdom = { id: 'child-2', text: 'Initial C2' };
        const child3Vdom = { id: 'child-3', text: 'Initial C3' };
        const parentVdom = {
            id: 'parent-1',
            cn: [
                { componentId: 'child-1' },
                { componentId: 'child-2' },
                { componentId: 'child-3' }
            ]
        };

        let grandchild1 = createMockComponent('grandchild-1', 'child-1', grandchildVdom);
        createMockComponent('child-1', 'parent-1', child1Vdom);
        createMockComponent('child-2', 'parent-1', child2Vdom);
        let child3 = createMockComponent('child-3', 'parent-1', child3Vdom);
        let parent = createMockComponent('parent-1', 'root', parentVdom);

        VDomUpdate.registerMerged(parent.id, grandchild1.id, 1, 2);
        VDomUpdate.registerMerged(parent.id, child3.id, 1, 1);

        grandchild1.vdom.cn[0].text = 'Updated GC';
        child3.vdom.text = 'Updated C3';

        const adjustedDepth = VDomUpdate.getAdjustedUpdateDepth(parent.id);
        expect(adjustedDepth).toBe(3);

        const newAsymmetricVdom  = TreeBuilder.getVdomTree(parent.vdom, adjustedDepth);
        const oldAsymmetricVnode = TreeBuilder.getVnodeTree(parent.vnode, adjustedDepth);

        const [expChild1, expChild2, expChild3] = newAsymmetricVdom.cn;
        expect(expChild1.cn[0].id).toBe('grandchild-1');
        expect(expChild1.cn[0].cn[0].text).toBe('Updated GC');
        expect(expChild2.componentId).toBeFalsy();
        expect(expChild2.text).toBe('Initial C2');
        expect(expChild3.text).toBe('Updated C3');

        const { deltas } = VdomHelper.update({
            vdom: newAsymmetricVdom,
            vnode: oldAsymmetricVnode
        });

        expect(deltas.length).toBe(2);

        const gcSpanVnode = oldAsymmetricVnode.childNodes[0].childNodes[0].childNodes[0];
        const c3Vnode     = oldAsymmetricVnode.childNodes[2];
        const delta1      = deltas.find(d => d.id === gcSpanVnode.id);
        const delta2      = deltas.find(d => d.id === c3Vnode.id);

        expect(delta1).toBeTruthy();
        expect(delta1.textContent).toBe('Updated GC');

        expect(delta2).toBeTruthy();
        expect(delta2.textContent).toBe('Updated C3');
    });
});
