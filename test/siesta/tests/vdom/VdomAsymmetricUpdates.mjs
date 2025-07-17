import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import ComponentManager from '../../../../src/manager/Component.mjs';
import TreeBuilder      from '../../../../src/util/vdom/TreeBuilder.mjs';
import VDomUpdate       from '../../../../src/manager/VDomUpdate.mjs';
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
        vdom
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
            [],   // callbacks
            1,    // childUpdateDepth
            1     // distance
        );

        // The child's vdom has now changed. We update our mock to reflect this.
        const childVdomUpdated = { id: 'child-1', cn: [{ tag: 'span', text: 'Updated' }] };
        child.vdom = childVdomUpdated;

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
        const { deltas } = VdomHelper.update({
            vdom : newAsymmetricVdom,
            vnode: parent.vnode
        });

        // 5. ASSERTIONS
        t.is(deltas.length, 1, 'Should generate exactly one delta for the text change');
        const delta = deltas[0];
        t.is(delta.action, 'updateVtext', 'The delta action should be to update the text node');
        t.is(delta.value, 'Updated', 'The new text content should be correct');
        t.ok(delta.id.startsWith('neo-vtext'), 'The delta correctly targets the text vnode');
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
        let grandchild = createMockComponent('grandchild-1', 'child-1', grandchildVdomInitial);
        let child      = createMockComponent('child-1', 'parent-1', childVdom);
        let parent     = createMockComponent('parent-1', 'root', parentVdom);

        // 2. SIMULATE A GRANDCHILD-INITIATED UPDATE
        // The grandchild's state changes. It is at a distance of 2 from the updating parent.
        VDomUpdate.registerMerged(
            parent.id,
            grandchild.id,
            [],   // callbacks
            1,    // grandchild's own updateDepth
            2     // distance from parent
        );

        // The grandchild's vdom has now changed.
        const grandchildVdomUpdated = { id: 'grandchild-1', cn: [{ tag: 'span', text: 'Updated' }] };
        grandchild.vdom = grandchildVdomUpdated;

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
        const { deltas } = VdomHelper.update({
            vdom : newAsymmetricVdom,
            vnode: parent.vnode
        });

        // 5. ASSERTIONS
        t.is(deltas.length, 1, 'Should generate exactly one delta for the text change');
        t.is(deltas[0].action, 'updateVtext', 'The delta action should be to update the text node');
    });
});
