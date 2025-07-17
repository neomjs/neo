import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import ComponentManager from '../../../../src/manager/Component.mjs';
import TreeBuilder      from '../../../../src/util/vdom/TreeBuilder.mjs';
import VDomUpdate       from '../../../../src/manager/VDomUpdate.mjs';
import VdomLifecycle    from '../../../../src/mixin/VdomLifecycle.mjs';
import VdomHelper       from '../../../../src/vdom/Helper.mjs';
import VDomUtil         from '../../../../src/util/VDom.mjs';

// IMPORTANT: Test with the new standard renderer
Neo.config.useDomApiRenderer = true;
VdomHelper.onNeoConfigChange({useDomApiRenderer: true});

/**
 * Creates a mock component object for testing.
 * @param {string} id
 * @param {string} parentId
 * @param {Object} vdom
 * @returns {Object} A mock component
 */
const createMockComponent = (id, parentId, vdom) => {
    const component = {
        id,
        parentId,
        vdom,
        // Add properties from VdomLifecycle that we need to test
        isVdomUpdating: false,
        // By adding the prototype methods to our mock instances, we can test
        // the lifecycle logic without needing full component instantiation.
        hasUpdateCollision: VdomLifecycle.prototype.hasUpdateCollision,
        isParentUpdating  : VdomLifecycle.prototype.isParentUpdating,
    };
    // Create the initial vnode from the vdom definition.
    const { vnode } = VdomHelper.create({ vdom });
    component.vnode = vnode;

    // Register the component BEFORE syncing IDs. This is critical so that
    // a parent's syncVdomIds call can find this component if it's a child.
    ComponentManager.register(component);
    VDomUtil.syncVdomIds(component.vnode, component.vdom);

    return component;
};

StartTest(t => {

    t.beforeEach(() => {
        // Reset managers to ensure test isolation
        VDomUpdate.mergedCallbackMap.clear();
        VDomUpdate.postUpdateQueueMap.clear();
        ComponentManager.wrapperNodes.clear();
        ComponentManager.clear();
    });

    t.it('Should handle asymmetric update with depth 2 using DomApiRenderer', t => {
        // 1. SETUP
        // Create a parent and a child. The parent's vdom references the child via componentId.
        const childVdomInitial = { id: 'child-1', cn: [{ tag: 'span', text: 'Initial' }] };
        const parentVdom = {
            id: 'parent-1',
            cn: [{ componentId: 'child-1' }]
        };

        // Create components dependency-first (child before parent) to ensure
        // component references can be resolved during VDOM/VNode processing.
        // The `createMockComponent` factory now handles registration.
        let child  = createMockComponent('child-1', 'parent-1', childVdomInitial);
        let parent = createMockComponent('parent-1', 'root', parentVdom);

        // 2. SIMULATE A CHILD-INITIATED UPDATE
        // The child's internal state changes, and it requests to be part of the parent's next update.
        VDomUpdate.registerMerged(
            parent.id,
            child.id,
            1,    // childUpdateDepth
            1     // distance
        );

        // The child's vdom has now changed. We update our mock to reflect this.
        // By mutating the existing vdom object, we ensure stable IDs are preserved for diffing.
        child.vdom.cn[0].text = 'Updated';

        // 3. SIMULATE THE PARENT'S UPDATE LIFECYCLE
        // The parent calculates the required depth for the update.
        const adjustedDepth = VDomUpdate.getAdjustedUpdateDepth(parent.id);
        t.is(adjustedDepth, 2, 'Adjusted update depth should be 2 to include direct children');

        // The parent builds an asymmetric VDOM tree. TreeBuilder will find the updated
        // child.vdom via the ComponentManager.
        const newAsymmetricVdom = TreeBuilder.getVdomTree(parent.vdom, adjustedDepth);

        // Verify the created tree has the child's *new* vdom
        t.is(newAsymmetricVdom.cn[0].id, 'child-1', 'The child component VDOM is expanded in the asymmetric tree');
        t.is(newAsymmetricVdom.cn[0].cn[0].text, 'Updated', 'The expanded VDOM reflects the childs updated state');

        // 4. GENERATE DELTAS
        // VdomHelper diffs the new, expanded tree against the parent's OLD vnode.
        // The old vnode must also be expanded to the same depth to ensure a correct diff.
        const oldAsymmetricVnode = TreeBuilder.getVnodeTree(parent.vnode, adjustedDepth);
        const { deltas } = VdomHelper.update({
            vdom : newAsymmetricVdom,
            vnode: oldAsymmetricVnode
        });

        // 5. ASSERTIONS
        // For useDomApiRenderer=true, a text change results in a delta updating
        // the `textContent` property of the parent element's vnode.
        t.is(deltas.length, 1, 'Should generate exactly one delta for the text change');
        const spanVnode = oldAsymmetricVnode.childNodes[0].childNodes[0];
        const delta = deltas[0];

        t.is(delta.id, spanVnode.id, 'Delta targets the correct span element');
        t.is(delta.textContent, 'Updated', 'The new text content should be correct');
        t.is(Object.keys(delta).length, 2, 'Delta has the correct shape (id, textContent)');
    });

    t.it('Should handle nested asymmetric update (grandchild update)', t => {
        // 1. SETUP
        const grandchildVdomInitial = { id: 'grandchild-1', cn: [{ tag: 'span', text: 'Initial' }] };
        const childVdom = {
            id: 'child-1',
            cn: [{ componentId: 'grandchild-1' }]
        };
        const parentVdom = {
            id: 'parent-1',
            cn: [{ componentId: 'child-1' }]
        };

        // Create components dependency-first (grandchild -> child -> parent) to ensure
        // component references can be resolved during VDOM/VNode processing.
        const grandchild = createMockComponent('grandchild-1', 'child-1', grandchildVdomInitial);
        createMockComponent('child-1', 'parent-1', childVdom);
        let parent     = createMockComponent('parent-1', 'root', parentVdom);

        // 2. SIMULATE A GRANDCHILD-INITIATED UPDATE
        // The grandchild's state changes. It is at a distance of 2 from the updating parent.
        VDomUpdate.registerMerged(
            parent.id,
            grandchild.id,
            1,    // grandchild's own updateDepth
            2     // distance from parent
        );

        // The grandchild's vdom has now changed.
        // By mutating the existing vdom object, we ensure stable IDs are preserved for diffing.
        grandchild.vdom.cn[0].text = 'Updated';

        // 3. SIMULATE THE PARENT'S UPDATE LIFECYCLE
        // The required depth for the parent should be 3 to expand down to the grandchild.
        const adjustedDepth = VDomUpdate.getAdjustedUpdateDepth(parent.id);
        t.is(adjustedDepth, 3, 'Adjusted update depth should be 3 to include grandchild');

        // The parent builds an asymmetric VDOM tree.
        const newAsymmetricVdom = TreeBuilder.getVdomTree(parent.vdom, adjustedDepth);

        // Verify the created tree has the grandchild's *new* vdom
        const expandedChild      = newAsymmetricVdom.cn[0];
        const expandedGrandchild = expandedChild.cn[0];
        t.is(expandedGrandchild.id, 'grandchild-1', 'The grandchild component VDOM is expanded in the asymmetric tree');
        t.is(expandedGrandchild.cn[0].text, 'Updated', 'The expanded VDOM reflects the grandchilds updated state');

        // 4. GENERATE DELTAS
        const oldAsymmetricVnode = TreeBuilder.getVnodeTree(parent.vnode, adjustedDepth);
        const { deltas } = VdomHelper.update({
            vdom : newAsymmetricVdom,
            vnode: oldAsymmetricVnode
        });

        // 5. ASSERTIONS
        // For useDomApiRenderer=true, a text change results in a delta updating
        // the `textContent` property of the parent element's vnode.
        t.is(deltas.length, 1, 'Should generate exactly one delta for the text change');
        const spanVnode = oldAsymmetricVnode.childNodes[0].childNodes[0].childNodes[0];
        const delta     = deltas[0];

        t.is(delta.id, spanVnode.id, 'Delta targets the correct span element');
        t.is(delta.textContent, 'Updated', 'The new text content should be correct');
        t.is(Object.keys(delta).length, 2, 'Delta has the correct shape (id, textContent)');
    });

    t.it('Should handle structural change in a deeply nested component', t => {
        // 1. SETUP
        const grandchildVdomInitial = { id: 'grandchild-1', cn: [{ tag: 'span', text: 'Initial' }] };
        const childVdom = {
            id: 'child-1',
            cn: [{ componentId: 'grandchild-1' }]
        };
        const parentVdom = {
            id: 'parent-1',
            cn: [{ componentId: 'child-1' }]
        };

        // Create components dependency-first
        let grandchild = createMockComponent('grandchild-1', 'child-1', grandchildVdomInitial);
        createMockComponent('child-1', 'parent-1', childVdom);
        let parent = createMockComponent('parent-1', 'root', parentVdom);

        // 2. SIMULATE A GRANDCHILD-INITIATED UPDATE
        VDomUpdate.registerMerged(
            parent.id,
            grandchild.id,
            1,    // grandchild's own updateDepth
            2     // distance from parent
        );

        // The grandchild's vdom has a structural change.
        grandchild.vdom.cn.push({ id: 'new-node', tag: 'div', text: 'New Node' });

        // 3. SIMULATE THE PARENT'S UPDATE LIFECYCLE
        const adjustedDepth = VDomUpdate.getAdjustedUpdateDepth(parent.id);
        t.is(adjustedDepth, 3, 'Adjusted update depth should be 3 to include grandchild');

        const newAsymmetricVdom = TreeBuilder.getVdomTree(parent.vdom, adjustedDepth);
        const oldAsymmetricVnode = TreeBuilder.getVnodeTree(parent.vnode, adjustedDepth);

        // Verify the new VDOM structure
        const expandedGrandchildVdom = newAsymmetricVdom.cn[0].cn[0];
        t.is(expandedGrandchildVdom.cn.length, 2, 'New VDOM for grandchild has 2 children');
        t.is(expandedGrandchildVdom.cn[1].id, 'new-node', 'New node is present in the asymmetric VDOM');

        // 4. GENERATE DELTAS
        const { deltas } = VdomHelper.update({
            vdom : newAsymmetricVdom,
            vnode: oldAsymmetricVnode
        });

        // 5. ASSERTIONS
        t.is(deltas.length, 1, 'Should generate one delta for the insertion');
        const delta = deltas[0];
        const newNodeVdom = expandedGrandchildVdom.cn[1];

        t.is(delta.action, 'insertNode', 'Delta action should be insertNode');
        t.is(delta.parentId, grandchild.vdom.id, 'Delta parentId should be the grandchild');
        t.is(delta.index, 1, 'Delta index should be 1');

        // For DomApiRenderer, the vnode is passed directly.
        t.is(delta.vnode.id, newNodeVdom.id, 'Inserted vnode has the correct ID');
        t.is(delta.vnode.textContent, 'New Node', 'Inserted vnode has the correct text');
    });

    t.it('Should handle update collision (isParentUpdating)', t => {
        // 1. SETUP
        const childVdom  = { id: 'child-1', text: 'child' };
        const parentVdom = { id: 'parent-1', cn: [{ componentId: 'child-1' }] };

        let child  = createMockComponent('child-1', 'parent-1', childVdom);
        let parent = createMockComponent('parent-1', 'root', parentVdom);

        // 2. SIMULATE A PARENT UPDATE IN PROGRESS
        // This is the state during a real update, before post-processing.
        parent.isVdomUpdating = true;
        VDomUpdate.registerInFlightUpdate(parent.id, 2);

        // 3. SIMULATE A CHILD-INITIATED UPDATE (during the parent's update)
        let hasCollision = child.isParentUpdating(child.parentId, () => {});

        // 4. ASSERTIONS
        t.ok(hasCollision, 'isParentUpdating should return true, detecting a collision');
        const postUpdateQueue = VDomUpdate.postUpdateQueueMap.get(parent.id);
        t.ok(postUpdateQueue, 'Parent should have a post-update queue');
        t.is(postUpdateQueue.children.length, 1, 'Post-update queue should have one entry');
        t.is(postUpdateQueue.children[0].childId, child.id, 'The queued item should be the child component');
    });

    t.it('Should not detect a collision if updateDepth is insufficient', t => {
        // 1. SETUP
        const grandchildVdom = { id: 'grandchild-1', text: 'grandchild' };
        const childVdom = { id: 'child-1', cn: [{ componentId: 'grandchild-1' }] };
        const parentVdom = { id: 'parent-1', cn: [{ componentId: 'child-1' }] };

        let grandchild = createMockComponent('grandchild-1', 'child-1', grandchildVdom);
        createMockComponent('child-1', 'parent-1', childVdom);
        let parent = createMockComponent('parent-1', 'root', parentVdom);

        // 2. SIMULATE A PARENT UPDATE IN PROGRESS
        parent.isVdomUpdating = true;
        VDomUpdate.registerInFlightUpdate(parent.id, 2);

        // 3. SIMULATE A GRANDCHILD-INITIATED UPDATE
        // The grandchild is at distance 2 from the parent. hasUpdateCollision(2, 2) should be false.
        let hasCollision = grandchild.isParentUpdating(grandchild.parentId, () => {});

        // 4. ASSERTIONS
        t.notOk(hasCollision, 'isParentUpdating should return false, no collision detected');
        const postUpdateQueue = VDomUpdate.postUpdateQueueMap.get(parent.id);
        t.notOk(postUpdateQueue, 'Parent should not have a post-update queue');
    });

    t.it('Should handle merged updates from multiple non-contiguous children', t => {
        // 1. SETUP
        // Parent -> Child1 -> Grandchild1
        // Parent -> Child2
        // Parent -> Child3
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

        // Create components
        let grandchild1 = createMockComponent('grandchild-1', 'child-1', grandchildVdom);
        createMockComponent('child-1', 'parent-1', child1Vdom);
        createMockComponent('child-2', 'parent-1', child2Vdom);
        let child3 = createMockComponent('child-3', 'parent-1', child3Vdom);
        let parent = createMockComponent('parent-1', 'root', parentVdom);

        // 2. SIMULATE MULTIPLE MERGED UPDATES
        // Grandchild1 (at distance 2) requests an update
        VDomUpdate.registerMerged(parent.id, grandchild1.id, 1, 2);
        // Child3 (at distance 1) requests an update
        VDomUpdate.registerMerged(parent.id, child3.id, 1, 1);

        // Make the changes to the source vdoms
        grandchild1.vdom.cn[0].text = 'Updated GC';
        child3.vdom.text = 'Updated C3';

        // 3. SIMULATE THE PARENT'S UPDATE LIFECYCLE
        const adjustedDepth = VDomUpdate.getAdjustedUpdateDepth(parent.id);
        // Depth for GC1 is 2(dist) + 1(depth) = 3. Depth for C3 is 1(dist) + 1(depth) = 2.
        // The max should be taken.
        t.is(adjustedDepth, 3, 'Adjusted update depth should be 3, the max required by children');

        const newAsymmetricVdom  = TreeBuilder.getVdomTree(parent.vdom, adjustedDepth);
        const oldAsymmetricVnode = TreeBuilder.getVnodeTree(parent.vnode, adjustedDepth);

        // Verify the new VDOM structure is correctly expanded.
        // TreeBuilder expands based on depth, so non-updating siblings within the depth are also expanded.
        const [expChild1, expChild2, expChild3] = newAsymmetricVdom.cn;
        // Child1 should be expanded to reveal Grandchild1
        t.is(expChild1.cn[0].id, 'grandchild-1', 'Child1 is expanded');
        t.is(expChild1.cn[0].cn[0].text, 'Updated GC', 'Grandchild1 vdom is updated');
        // Child2 is also expanded because the adjustedDepth of 3 is enough to reach it
        t.notOk(expChild2.componentId, 'Child2 IS expanded due to update depth');
        t.is(expChild2.text, 'Initial C2', 'Child2 is fully expanded');
        // Child3 should be expanded as it requested the update
        t.is(expChild3.text, 'Updated C3', 'Child3 vdom is updated');

        // 4. GENERATE DELTAS
        const { deltas } = VdomHelper.update({
            vdom: newAsymmetricVdom,
            vnode: oldAsymmetricVnode
        });

        // 5. ASSERTIONS
        t.is(deltas.length, 2, 'Should generate two deltas for the two changes');

        const gcSpanVnode = oldAsymmetricVnode.childNodes[0].childNodes[0].childNodes[0];
        const c3Vnode = oldAsymmetricVnode.childNodes[2];

        const delta1 = deltas.find(d => d.id === gcSpanVnode.id);
        const delta2 = deltas.find(d => d.id === c3Vnode.id);

        t.ok(delta1, 'A delta for the grandchild change should exist');
        t.is(delta1.textContent, 'Updated GC', 'Grandchild text delta is correct');

        t.ok(delta2, 'A delta for the child3 change should exist');
        t.is(delta2.textContent, 'Updated C3', 'Child3 text delta is correct');
    });
});
