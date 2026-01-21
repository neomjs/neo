import {setup} from '../../setup.mjs';

const appName = 'AsymmetricMergingTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

// Mock applyDeltas to prevent errors during mount
Neo.applyDeltas = async () => {};

class MockComponent extends Component {
    static config = {
        className: 'Test.MockComponent',
        ntype    : 'test-component',
        _vdom    : {tag: 'div', cls: ['child-component']}
    }
}
MockComponent = Neo.setupClass(MockComponent);

class CallbackComponent extends Component {
    static config = {
        className: 'Test.CallbackComponent',
        ntype    : 'test-callback-component',
        _vdom    : {tag: 'div'},
        myConfig_: null
    }

    /**
     * Triggered after the myConfig config got changed
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetMyConfig(value, oldValue) {
        if (value) {
            this.vdom.text = value;
            this.promiseUpdate().then(() => {
                this.callbackExecuted = true;
                this.callbackValue = value;
            });
        }
    }
}
CallbackComponent = Neo.setupClass(CallbackComponent);

class MockContainer extends Container {
    static config = {
        className: 'Test.MockContainer',
        ntype    : 'test-asymmetric-container',
        _vdom    : {tag: 'div', cls: ['child-container']}
    }
}
MockContainer = Neo.setupClass(MockContainer);

/**
 * @summary Verification of Asymmetric VDOM Merging logic (Ticket #8827).
 * 
 * Verifies that:
 * 1. Parent updates only aggregate dirty children (Selective Merging).
 * 2. Merged children's update promises are correctly resolved.
 * 3. Nested merging (Grandchild -> Child -> Parent) works correctly.
 * 4. Custom config hooks triggering promiseUpdate callbacks are executed.
 */
test.describe('Asymmetric VDOM Merging', () => {
    let container, c1, c2, c3, testRun = 0;

    test.beforeEach(async () => {
        testRun++;
        // Base setup for most tests, can be overridden inside tests if needed
    });

    test.afterEach(() => {
        if (container) {
            container.destroy();
            container = null;
        }
    });

    /**
     * Scenario 1: Selective Merging (The Toolbar Case)
     */
    test('Selective Merging: Should merge only dirty children into parent update', async () => {
        container = Neo.create(MockContainer, {
            appName,
            id: 'parent-' + testRun,
            items: [
                {module: MockComponent, id: 'child-1-' + testRun, text: 'C1'},
                {module: MockComponent, id: 'child-2-' + testRun, text: 'C2'},
                {module: MockComponent, id: 'child-3-' + testRun, text: 'C3'}
            ]
        });

        await container.initVnode(true);
        container.mounted = true;

        c1 = container.items[0];
        c2 = container.items[1];
        c3 = container.items[2];

        // Queue updates
        container.setSilent({style: {color: 'blue'}});
        c1.setSilent({text: 'C1 Updated'});
        c3.setSilent({text: 'C3 Updated'});
        
        // Trigger update via Parent
        const {deltas} = await container.promiseUpdate();

        // Verify Deltas
        // Expect: Parent, C1, C3. C2 should be missing or clean.
        // Deltas structure depends on VdomHelper/mock. Assuming array of objects with id.
        
        const parentDelta = deltas.find(d => d.id === container.id);
        const c1Delta     = deltas.find(d => d.id === c1.id);
        const c2Delta     = deltas.find(d => d.id === c2.id);
        const c3Delta     = deltas.find(d => d.id === c3.id);

        expect(parentDelta).toBeTruthy();
        expect(c1Delta).toBeTruthy();
        expect(c3Delta).toBeTruthy();
        
        // C2 should NOT be in the deltas if selective merging works
        expect(c2Delta).toBeUndefined();
    });

    /**
     * Scenario 2: Promise/Callback Signal Chain
     * Verify that the promise returned by child.promiseUpdate() resolves
     * when the update is handled by the parent.
     */
    test('Callback Signal Chain: Child promise should resolve via Parent update', async () => {
        container = Neo.create(MockContainer, {
            appName,
            id: 'parent-' + testRun,
            items: [{module: MockComponent, id: 'child-' + testRun, text: 'Child'}]
        });

        await container.initVnode(true);
        container.mounted = true;
        const child = container.items[0];

        // Hold parent
        container.silentVdomUpdate = true;
        container.style = {color: 'red'};

        let resolved = false;
        
        // Child update
        const p = child.promiseUpdate().then(() => {
            resolved = true;
        });
        
        child.text = 'Child Updated';

        // Should not be resolved yet
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(resolved).toBe(false);

        // Release parent
        container.silentVdomUpdate = false;
        container.update();

        await p;
        expect(resolved).toBe(true);
    });

    /**
     * Scenario 3: Nested Merging (Transitive chains)
     */
    test('Nested Merging: Grandchild -> Child -> Parent', async () => {
        container = Neo.create(MockContainer, {
            appName,
            id: 'parent-' + testRun,
            items: [{
                module: MockContainer,
                id: 'child-' + testRun,
                items: [{
                    module: MockComponent,
                    id: 'grandchild-' + testRun,
                    text: 'GC'
                }]
            }]
        });

        await container.initVnode(true);
        container.mounted = true;

        const child = container.items[0];
        const grandchild = child.items[0];

        // Queue updates on all levels
        container.setSilent({style: {color: 'red'}});
        child.setSilent({style: {color: 'blue'}});
        grandchild.setSilent({text: 'GC Updated'});

        const {deltas} = await container.promiseUpdate();

        expect(deltas.length).toBe(3); // Parent, Child, GC
        expect(deltas.find(d => d.id === grandchild.id).textContent).toBe('GC Updated');
    });

    /**
     * Scenario 4: Custom Config Hooks with Callbacks
     * Ensure that when a component triggers `promiseUpdate().then(...)` inside a config hook,
     * the callback is executed even if the update is merged into a parent.
     */
    test('Custom Config Hooks: Callbacks should fire when merged', async () => {
        container = Neo.create(MockContainer, {
            appName,
            id: 'parent-' + testRun,
            items: [{
                module: CallbackComponent,
                id: 'callback-child-' + testRun
            }]
        });

        await container.initVnode(true);
        container.mounted = true;
        const child = container.items[0];

        // 1. Prepare Parent to absorb updates
        // We set the parent to silent to ensure it "needs update".
        // When child tries to update, it should see parent needs update and merge.
        container.setSilent({style: {color: 'green'}});

        // 2. Trigger Child config change
        // This setter calls `this.promiseUpdate().then(...)`.
        // Crucially, `promiseUpdate` inside the component calls `updateVdom`.
        // `updateVdom` calls `mergeIntoParentUpdate`.
        // `mergeIntoParentUpdate` checks `parent.needsVdomUpdate` (which is true because of setSilent).
        // Child should merge.
        child.myConfig = 'Trigger Callback';

        // 3. Trigger Parent Update
        // This should flush Parent + Child.
        await container.promiseUpdate();

        // 4. Verify Callback
        expect(child.callbackExecuted).toBe(true);
        expect(child.callbackValue).toBe('Trigger Callback');
    });

    /**
     * Scenario 5: Leapfrog Merging (Grandparent -> Clean Parent -> Dirty Grandchild)
     * 
     * Tests the ability of the framework to merge a deep descendant's update into an ancestor
     * even if the intermediate components are clean (skipped).
     * 
     * Critical for TreeBuilder: If the intermediate Parent is clean and we are at Depth 1,
     * standard logic might prune the Parent branch (`neoIgnore: true`), causing the 
     * Grandchild update to be lost.
     * 
     * This test validates if `VDomUpdate`/`TreeBuilder` correctly handles this "gap"
     * by identifying the "Bridge Path" and expanding the clean Parent.
     * 
     * It also verifies "Sparse Tree Generation": A clean sibling of the Parent ("Uncle")
     * should be pruned (ignored) if it is not on the bridge path.
     */
    test('Leapfrog Merging: Grandparent -> Clean Parent -> Dirty Grandchild (Sparse)', async () => {
        container = Neo.create(MockContainer, {
            appName,
            id: 'grandparent-' + testRun,
            items: [{
                module: MockContainer,
                id: 'parent-' + testRun,
                items: [{
                    module: MockComponent,
                    id: 'grandchild-' + testRun,
                    text: 'GC'
                }]
            }, {
                module: MockComponent,
                id: 'clean-uncle-' + testRun,
                text: 'Uncle'
            }]
        });

        await container.initVnode(true);
        container.mounted = true;

        const parent     = container.items[0];
        const grandChild = parent.items[0];
        const uncle      = container.items[1];

        // 1. Queue update on Grandparent
        container.setSilent({style: {color: 'purple'}});

        // 2. Queue update on Grandchild
        // Grandchild should skip the clean Parent and recurse to Grandparent.
        // We set Grandparent to Depth 2.
        // This tests if the "Bridge Path" logic works:
        // - Parent (Distance 1) is a Bridge -> Must be expanded.
        // - Uncle (Distance 1) is NOT a Bridge -> Should be pruned.
        container.updateDepth = 2;
        
        grandChild.setSilent({text: 'Leapfrog Update'});

        // 3. Trigger Grandparent
        const {deltas} = await container.promiseUpdate();

        // 4. Verify Grandchild Update (Positive Case)
        // The Grandchild update MUST be present. This proves the Bridge Parent was expanded.
        const gcDelta = deltas.find(d => d.id === grandChild.id);
        
        expect(gcDelta).toBeTruthy();
        expect(gcDelta.textContent).toBe('Leapfrog Update');

        // 5. Verify Uncle (Negative Case)
        // The Uncle should NOT be in the deltas (it was clean and pruned).
        const uncleDelta = deltas.find(d => d.id === uncle.id);
        expect(uncleDelta).toBeUndefined();
    });

    /**
     * Scenario 6: Structural Merging
     * Tests if adding a child component (structural change) is correctly merged
     * into a pending parent update.
     */
    test('Structural Merging: Adding a child during pending parent update', async () => {
        container = Neo.create(MockContainer, {
            appName,
            id: 'parent-' + testRun,
            items: []
        });

        await container.initVnode(true);
        container.mounted = true;

        // 1. Hold Parent
        container.setSilent({style: {color: 'orange'}});

        // 2. Add Child (Structural change)
        // Container.add() -> .insert() -> triggers VDOM update
        // This should merge into the silent Parent.
        const newChild = container.add({
            module: MockComponent,
            id: 'new-child-' + testRun,
            text: 'New Child'
        });

        // 3. Release Parent
        const {deltas} = await container.promiseUpdate();

        // 4. Verify
        // Should have an 'insertNode' action
        const insertDelta = deltas.find(d => d.action === 'insertNode');
        
        expect(insertDelta).toBeTruthy();
        expect(insertDelta.vnode.id).toBe(newChild.vdom.id);
    });
});
