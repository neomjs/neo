import {setup} from '../../setup.mjs';

const appName = 'RaceConditionTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false, // Required for applyDeltas mock
        logVdomUpdateCollisions: false
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
import VDomUpdate         from '../../../../src/manager/VDomUpdate.mjs';

class RaceChildComponent extends Component {
    static config = {
        className: 'Test.RaceChildComponent',
        ntype: 'test-race-child',
        hideMode: 'removeDom', // Crucial for reproduction
        _vdom: {tag: 'div', cls: ['child']}
    }
}
RaceChildComponent = Neo.setupClass(RaceChildComponent);

class RaceContainer extends Container {
    static config = {
        className: 'Test.RaceContainer',
        // items defined dynamically in tests
        items: []
    }
}
RaceContainer = Neo.setupClass(RaceContainer);

/**
 * @summary Regression tests for VDOM update race conditions.
 *
 * These tests reproduce scenarios where concurrent updates between Parent and Child components
 * previously led to duplicate DOM nodes or state inconsistencies.
 *
 * Scenarios covered:
 * 1. Rapid Visibility Toggle (Wake Up Race): Parent inserts child while child updates itself.
 * 2. Parallel Sibling Updates: Siblings updating simultaneously shouldn't trigger parent interference.
 * 3. Parent (Depth 1) vs Child (Depth 1): Confirms serialization when scopes potentially overlap.
 * 4. Reverse Race: Parent starts update *after* child, risking overwrite.
 */
test.describe('VdomLifecycle Race Condition', () => {
    // Four tests below replace Neo.applyDeltas with closures over their OWN capturedDeltas array.
    // Playwright reuses a worker across spec files, so an unrestored override runs this file's
    // fixture against a later spec's components — the tell is a stack frame from here surfacing
    // in an unrelated suite. Captured once here, restored after every test.
    const realApplyDeltas = Neo.applyDeltas;

    let testIdCounter = 0;
    const getUniqueId = (prefix) => `${prefix}-${Date.now()}-${testIdCounter++}`;
    let createdComponentIds = [];

    test.afterEach(() => {
        Neo.applyDeltas = realApplyDeltas;

        createdComponentIds.forEach(id => {
            const cmp = Neo.getComponent(id);
            if (cmp) {
                cmp.destroy();
            }
        });
        createdComponentIds = [];
    });

    /**
     * Reproduces the original "Duplicate Button" bug.
     *
     * Scenario:
     * - Child components start hidden (`removeDom`).
     * - Both are set to visible AND have a text change in the same tick.
     * - This triggers:
     *    1. Parent Update (due to visibility change, Depth -1).
     *    2. Child Update (due to text change, Depth 1).
     *
     * Expectations:
     * - Updates should be serialized or handled such that only ONE `insertNode` occurs per child.
     * - Final state should be 1 DOM node per child.
     */
    test('Rapid visibility AND text changes should not duplicate nodes', async () => {
        // Mock applyDeltas to capture them
        const capturedDeltas = [];
        Neo.applyDeltas = async (appName, deltas) => {
            if (Array.isArray(deltas)) {
                capturedDeltas.push(...deltas);
            } else {
                capturedDeltas.push(deltas);
            }
        };

        const containerId = getUniqueId('test-container');
        const child1Id = getUniqueId('child-1');
        const child2Id = getUniqueId('child-2');
        createdComponentIds.push(containerId); // Cleanup tracking

        const container = Neo.create(RaceContainer, {
            appName,
            id: containerId,
            items: [{
                module: RaceChildComponent,
                id: child1Id,
                hidden: true,
                text: 'Child 1'
            }, {
                module: RaceChildComponent,
                id: child2Id,
                hidden: true,
                text: 'Child 2'
            }]
        });

        // 1. Initial Mount (Children are hidden)
        await container.initVnode(true);
        container.mounted = true;

        const child1 = container.items[0];
        const child2 = container.items[1];

        // Clear initial mount deltas
        capturedDeltas.length = 0;

        // 2. Trigger rapid updates (Hidden + Text)
        child1.set({hidden: false, text: 'Visible 1'});

        child2.set({hidden: false, text: 'Visible 2'});

        await container.promiseUpdate();
        await new Promise(resolve => setTimeout(resolve, 50));

        // Analyze Deltas
        // We expect exactly ONE insertNode for child-2 (and child-1).
        const child2Inserts = capturedDeltas.filter(d =>
            d.action === 'insertNode' &&
            (d.id === child2Id || d.vnode?.id === child2Id)
        );

        expect(child2Inserts.length).toBe(1);
    });

    /**
     * The in-flight registry reports a scope the payload no longer has.
     *
     * The depth is registered ONCE, when the cycle starts; the payload is built from
     * `component.updateDepth` read LIVE after a macrotask yield. Between those two reads sits
     * `Component#show()`, which sets `parent.updateDepth = -1` and calls `parent.update()` — so a
     * header-action button becoming visible escalates its parent's depth mid-flight. That escalation
     * is correct and these arms must never narrow it: a floating widget mounting into its parent
     * needs the full tree.
     *
     * `isParentUpdating` and `hasUpdateCollision` both consult the REGISTERED depth, so every
     * consumer of the collision contract is answered from a scope the payload no longer has. **That
     * incoherence is the whole claim.** What it goes on to cause is not asserted here — a second
     * overlapping flight was hypothesised and measured NOT to occur, because something further down
     * still queues the sibling write, and the duplicate-render defect that hypothesis named was
     * separate and separately cured.
     *
     * Reaching the window deterministically needs a SECOND cycle: `getVdomUpdatePayload` resets the
     * depth to the config default by writing `_updateDepth`, so a container that has ever been at -1
     * stays there until one payload is collected. The first drain below is what makes the window
     * exist at all.
     */
    test.describe('a depth escalation arriving mid-flight', () => {
        /**
         * Opens a real second cycle and returns once it is genuinely in flight at depth 1.
         * Returns false when the window could not be entered, so a caller can refuse to report a
         * verdict it never observed.
         */
        const openSecondCycleAtDepthOne = async (container, child) => {
            child.text = `${child.text} drain`;
            await container.promiseUpdate();
            await new Promise(resolve => setTimeout(resolve, 40));

            child.text = `${child.text} again`;
            container.update();

            for (let i = 0; i < 40 && !container.isVdomUpdating; i++) {
                await new Promise(resolve => setTimeout(resolve, 0))
            }

            return container.isVdomUpdating && VDomUpdate.getInFlightUpdateDepth(container.id) === 1
        };

        const buildContainer = async (containerId, hiddenId, siblingId) => {
            const container = Neo.create(RaceContainer, {
                appName,
                id   : containerId,
                items: [
                    {module: RaceChildComponent, id: hiddenId,  hidden: true, text: 'Hidden'},
                    {module: RaceChildComponent, id: siblingId, text: 'Sibling'}
                ]
            });

            await container.initVnode(true);
            container.mounted = true;
            await new Promise(resolve => setTimeout(resolve, 40));

            return container
        };

        test('reaches the collision check, while leaving the payload scope exactly as show() set it', async () => {
            const containerId = getUniqueId('escalation-container');
            createdComponentIds.push(containerId);

            const container = await buildContainer(containerId, getUniqueId('hidden'), getUniqueId('sibling')),
                  opened    = await openSecondCycleAtDepthOne(container, container.items[1]);

            expect(opened, 'the depth-1 flight must be open, or this arm witnesses nothing').toBe(true);

            // The real path: `hidden = false` runs Component#show().
            container.items[0].hidden = false;

            // The escalation itself is untouched. A floating widget mounting through show() still
            // gets the full tree — narrowing this is the regression this arm exists to forbid.
            expect(container.updateDepth, 'show() must still widen the payload to the full tree').toBe(-1);

            // ...and the collision check now knows about it.
            expect(
                VDomUpdate.getInFlightUpdateDepth(containerId),
                'the registered depth must track the scope the payload will be built from'
            ).toBe(-1);

            await new Promise(resolve => setTimeout(resolve, 60))
        });

        // A sibling arm lived here and was removed: it passed with the fix disabled, because
        // `update()` tries `mergeIntoParentUpdate` BEFORE `isParentUpdating`, so in a plain
        // container the sibling is absorbed by the merge and never reaches the collision check at
        // all. It therefore witnessed nothing about this defect. The DOM-level consequence is
        // covered at the component tier, where a real tab bar reaches the check; keeping a green
        // arm here that cannot fail would have been worse than having none.

        test('never narrows a flight: a reset written during collection cannot lower the record', () => {
            const containerId = getUniqueId('escalation-guard');

            VDomUpdate.registerInFlightUpdate(containerId, -1);

            VDomUpdate.escalateInFlightUpdate(containerId, 1);
            expect(VDomUpdate.getInFlightUpdateDepth(containerId), '-1 absorbs').toBe(-1);

            VDomUpdate.unregisterInFlightUpdate(containerId);

            // A component that is not in flight must not gain an entry.
            VDomUpdate.escalateInFlightUpdate(containerId, -1);
            expect(VDomUpdate.getInFlightUpdateDepth(containerId), 'no entry is created').toBeUndefined()
        })
    });

    /**
     * Verifies that two siblings updating strictly their own internal structure (Depth 1)
     * do not cause conflicts or trigger unnecessary parent updates that lead to duplication.
     */
    test('Parallel Sibling Updates should not conflict', async () => {
        // Mock applyDeltas to capture them
        const capturedDeltas = [];
        Neo.applyDeltas = async (appName, deltas) => {
            if (Array.isArray(deltas)) {
                capturedDeltas.push(...deltas);
            } else {
                capturedDeltas.push(deltas);
            }
        };

        const containerId = getUniqueId('test-container');
        const child1Id = getUniqueId('child-1');
        const child2Id = getUniqueId('child-2');
        createdComponentIds.push(containerId);

        const container = Neo.create(RaceContainer, {
            appName,
            id: containerId,
            items: [{
                module: RaceChildComponent,
                id: child1Id,
                hidden: true, // Start hidden to mimic prev setup
                text: 'Child 1'
            }, {
                module: RaceChildComponent,
                id: child2Id,
                hidden: true, // Start hidden
                text: 'Child 2'
            }]
        });

        await container.initVnode(true);
        container.mounted = true;

        const child1 = container.items[0];
        const child2 = container.items[1];

        // Ensure visible initially for this test and wait for settlement
        child1.hidden = false;
        child2.hidden = false;
        await container.promiseUpdate();
        await new Promise(resolve => setTimeout(resolve, 50));
        capturedDeltas.length = 0;

        // Trigger simultaneous internal updates (Depth 1 default)
        child1.text = 'Sibling 1 Updated';
        child2.text = 'Sibling 2 Updated';

        // Wait for updates to settle
        await new Promise(resolve => setTimeout(resolve, 50));

        // Both should have updated successfully
        const child1Update = capturedDeltas.find(d => d.id === child1.id || d.vnode?.id === child1.id);
        const child2Update = capturedDeltas.find(d => d.id === child2.id || d.vnode?.id === child2.id);

        expect(child1Update).toBeTruthy();
        expect(child2Update).toBeTruthy();

        // Ensure we don't have duplicate inserts or excessive updates
        expect(capturedDeltas.length).toBe(2);
    });

    /**
     * Verifies the "Non-Collision" logic for disjoint scopes.
     * Parent updates itself (Depth 1) and Child updates itself (Depth 1).
     * Since scopes don't overlap (1 < 1 is false), they should ideally run in parallel.
     * However, if Parent Update implies checking Child References, serialization might be enforced.
     */
    test('Parent (Depth 1) and Child (Depth 1) should not conflict', async () => {
        const capturedDeltas = [];
        Neo.applyDeltas = async (appName, deltas) => {
            if (Array.isArray(deltas)) {
                capturedDeltas.push(...deltas);
            } else {
                capturedDeltas.push(deltas);
            }
        };

        const containerId = getUniqueId('test-container');
        const child1Id = getUniqueId('child-1');
        const child2Id = getUniqueId('child-2'); // Add second child to match structure if needed, or stick to 1
        createdComponentIds.push(containerId);

        const container = Neo.create(RaceContainer, {
            appName,
            id: containerId,
            items: [{
                module: RaceChildComponent,
                id: child1Id,
                hidden: true,
                text: 'Child 1'
            }]
        });

        await container.initVnode(true);
        container.mounted = true;
        const child1 = container.items[0];

        // Ensure visible
        child1.hidden = false;
        await container.promiseUpdate();

        // Wait for any potential late-arriving deltas or queued updates to clear
        await new Promise(resolve => setTimeout(resolve, 50));

        capturedDeltas.length = 0;

        // Parent updates its own property (e.g. style) - Depth 1
        container.style = {border: '1px solid red'};

        // Child updates its own property - Depth 1
        child1.text = 'Child Updated';

        await new Promise(resolve => setTimeout(resolve, 50));

        const parentUpdate = capturedDeltas.find(d => d.id === container.id);
        const childUpdate  = capturedDeltas.find(d => d.id === child1.id || d.vnode?.id === child1.id);

        expect(parentUpdate).toBeTruthy();
        expect(childUpdate).toBeTruthy();

        expect(capturedDeltas.length).toBe(2);
    });

    /**
     * Verifies the `isChildUpdating` guard.
     * Scenario: Child starts update. Parent tries to start update (Depth -1) covering the Child.
     * Expectation: Parent detects Child is in-flight and yields.
     * Result: Parent update runs *after* Child, finding the node already exists (no clobber).
     */
    test('Reverse Race: Parent starts AFTER Child has started (Reproduction)', async () => {
        const capturedDeltas = [];
        Neo.applyDeltas = async (appName, deltas) => {
            if (Array.isArray(deltas)) {
                capturedDeltas.push(...deltas);
            } else {
                capturedDeltas.push(deltas);
            }
        };

        const containerId = getUniqueId('test-container');
        const child1Id = getUniqueId('child-1');
        createdComponentIds.push(containerId);

        const container = Neo.create(RaceContainer, {
            appName,
            id: containerId,
            items: [{
                module: RaceChildComponent,
                id: child1Id,
                hidden: true,
                text: 'Child 1'
            }]
        });

        await container.initVnode(true);
        container.mounted = true;
        const child1 = container.items[0];

        // Ensure visible
        child1.hidden = false;
        await container.promiseUpdate();
        capturedDeltas.length = 0;

        // 1. Start Child Update
        child1.text = 'Child Starting...';

        // 2. Force Parent Update (Depth -1 to cover children)
        // We set silent to ensure it doesn't just queue locally if logic differs
        container.updateDepth = -1;
        container.style = {backgroundColor: 'blue'}; // Trigger update

        await new Promise(resolve => setTimeout(resolve, 50));

        const childUpdates = capturedDeltas.filter(d => d.id === child1.id || d.vnode?.id === child1.id);

        // Expect Child update to succeed.
        expect(childUpdates.length).toBeGreaterThan(0);
    });
});
