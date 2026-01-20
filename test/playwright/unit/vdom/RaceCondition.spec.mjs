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
        items: [{
            module: RaceChildComponent,
            id: 'child-1',
            hidden: true,
            text: 'Child 1'
        }, {
            module: RaceChildComponent,
            id: 'child-2',
            hidden: true,
            text: 'Child 2'
        }]
    }
}
RaceContainer = Neo.setupClass(RaceContainer);

test.describe('VdomLifecycle Race Condition', () => {

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

        const container = Neo.create(RaceContainer, {
            appName,
            id: 'test-container'
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
        const child2Inserts = capturedDeltas.filter(d =>
            d.action === 'insertNode' &&
            (d.id === 'child-2' || d.vnode?.id === 'child-2')
        );

        expect(child2Inserts.length).toBe(1);

        container.destroy();
    });

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

        const container = Neo.create(RaceContainer, {
            appName,
            id: 'test-container'
        });

        await container.initVnode(true);
        container.mounted = true;

        const child1 = container.items[0];
        const child2 = container.items[1];

        // Ensure visible initially for this test
        child1.hidden = false;
        child2.hidden = false;
        await container.promiseUpdate();
        await new Promise(resolve => setTimeout(resolve, 50)); // Allow time for initial inserts to settle
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
        // Should be no clobbering or duplicates
        expect(capturedDeltas.length).toBe(2);

        container.destroy();
    });

    test('Parent (Depth 1) and Child (Depth 1) should not conflict', async () => {
        const capturedDeltas = [];
        Neo.applyDeltas = async (appName, deltas) => {
            if (Array.isArray(deltas)) {
                capturedDeltas.push(...deltas);
            } else {
                capturedDeltas.push(deltas);
            }
        };

        const container = Neo.create(RaceContainer, {
            appName,
            id: 'test-container'
        });

        await container.initVnode(true);
        container.mounted = true;
        const child1 = container.items[0];

        // Ensure visible
        child1.hidden = false;
        await container.promiseUpdate();
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

        container.destroy();
    });

    test('Reverse Race: Parent starts AFTER Child has started (Reproduction)', async () => {
        // This test attempts to simulate the condition where Parent overwrites Child
        // It relies on manual timing or forcing the Parent to start late

        const capturedDeltas = [];
        Neo.applyDeltas = async (appName, deltas) => {
            if (Array.isArray(deltas)) {
                capturedDeltas.push(...deltas);
            } else {
                capturedDeltas.push(deltas);
            }
        };

        const container = Neo.create(RaceContainer, {
            appName,
            id: 'test-container'
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
        // We set silent to ensure it doesn't just queue locally
        container.updateDepth = -1;
        container.style = {backgroundColor: 'blue'}; // Trigger update

        await new Promise(resolve => setTimeout(resolve, 50));

        // If Parent clobbered Child, we might see:
        // - Duplicate updates for Child
        // - Child update missing (if Parent overwrote with old state)

        // In a "Duplicate Node" bug, Parent sends an insert/update for Child
        // that conflicts with Child's own update.

        const childUpdates = capturedDeltas.filter(d => d.id === child1.id || d.vnode?.id === child1.id);

        // Ideally we want 1 clean update from Child, and Parent updating itself.
        // If Parent included Child in its payload, we might see duplicates or conflicts.

        // Expectation: If safeguards work, Parent should have waited or merged.
        // If broken, we might see chaos.
        // For now, let's just assert basic sanity and see if it fails.

        expect(childUpdates.length).toBeGreaterThan(0);

        container.destroy();
    });

    test.afterEach(() => {
        const container = Neo.getComponent('test-container');
        if (container) {
            container.destroy();
        }
    });
});
