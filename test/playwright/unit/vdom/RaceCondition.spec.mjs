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
 * @summary Regression tests for VDOM Update Race Conditions (Ticket #8814).
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
    let testIdCounter = 0;
    const getUniqueId = (prefix) => `${prefix}-${Date.now()}-${testIdCounter++}`;
    let createdComponentIds = [];

    test.afterEach(() => {
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
