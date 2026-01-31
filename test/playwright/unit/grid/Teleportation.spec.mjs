import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridTeleportationTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Button             from '../../../../src/button/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Grid Teleportation & VDOM Deltas', () => {
    let grid, store;

    test.beforeEach(async () => {
        // Mock Neo.applyDeltas
        Neo.applyDeltas = async () => {};

        // Mock Neo.main and Neo.currentWorker
        Neo.main = {
            addon: {
                DragDrop: {},
                ResizeObserver: {
                    register  : () => {},
                    unregister: () => {}
                }
            },
            DomAccess: {
                getBoundingClientRect: async ({id}) => {
                    const rect = {width: 600, height: 400, x: 0, y: 0};
                    if (Array.isArray(id)) {
                        return id.map(() => rect);
                    }
                    return rect;
                },
                scrollIntoView       : async () => {},
                scrollTo             : async () => {}
            }
        };

        Neo.currentWorker = {
            getAddon: async () => ({
                register  : () => {},
                unregister: () => {}
            }),
            insertThemeFiles: () => {},
            on              : () => {},
            promiseMessage  : async () => {}
        };

        // Mock Neo.worker.App for DomEvent manager
        Neo.worker = Neo.worker || {};
        Neo.worker.App = {
            promiseMessage: async () => {}
        };

        // create a store with enough data to scroll
        store = Neo.create(Store, {
            keyProperty: 'id',
            model: {
                fields: [
                    {name: 'id',   type: 'Integer'},
                    {name: 'name', type: 'String'}
                ]
            }
        });

        const data = [];
        for (let i = 0; i < 100; i++) {
            data.push({id: i, name: `Row ${i}`});
        }
        store.data = data;

        grid = Neo.create(GridContainer, {
            appName  : 'GridTeleportationTest',
            height   : 400,
            width    : 600,
            store    : store,
            rowHeight: 40,
            columns  : [{
                dataField: 'id',
                text     : 'ID',
                width    : 50
            }, {
                type     : 'component',
                dataField: 'name',
                text     : 'Name (Component)',
                width    : 200,
                component: ({record}) => ({
                    module : Button,
                    iconCls: 'fa fa-home',
                    text   : record.name
                })
            }]
        });

        await grid.initVnode();
        grid.mounted = true;

        // Manually trigger sizing to force row creation (since ResizeObserver is mocked)
        // We also need to setup column positions which is usually done by headerToolbar.passSizeToBody
        grid.body.columnPositions.clear();
        grid.body.columnPositions.add([
            {dataField: 'id',   width: 50,  x: 0},
            {dataField: 'name', width: 200, x: 50}
        ]);

        grid.body.set({
            availableHeight: 400 - 40, // height - header
            containerWidth : 600
        });

        // Wait for potential async view creation
        await grid.timeout(50);
    });

    test.afterEach(async () => {
        // Give pending promises a tick to settle or reject before we destroy
        await new Promise(resolve => setTimeout(resolve, 50));
        grid?.destroy();
        store?.destroy();
        await new Promise(resolve => setTimeout(resolve, 50));
    });

    /**
     * @summary Baseline Teleportation Test & Internal Mechanics
     *
     * This test establishes the baseline behavior for VDOM Teleportation in the Grid.
     * It simulates a scroll event that triggers row recycling and component updates.
     *
     * Current State: PASSING
     * This means the basic "Happy Path" of scrolling works correctly in the Unit Test environment.
     *
     * **Internal Mechanics & The "ID Desync" Hypothesis:**
     *
     * 1. **Stable IDs (`ensureStableIds`):**
     *    - `Neo.mixin.VdomLifecycle` forces stable IDs on component VDOM roots (`this.id`) and wrappers (`this.id + '__wrapper'`).
     *    - However, children of components (like the text span inside a button) rely on auto-generated IDs from the VDOM Worker.
     *
     * 2. **ID Synchronization (`syncVnodeTree`):**
     *    - When the App Worker receives a VNode from the VDOM Worker (via `onInitVnode` or `resolveVdomUpdate`), it calls `syncVnodeTree`.
     *    - Crucially, `syncVdomState` copies the auto-generated IDs from the `vnode` back into the App Worker's `vdom` object.
     *    - This feedback loop ensures that the *next* update sent by the App Worker includes the correct IDs, allowing the VDOM Worker to match nodes (Update vs Replace).
     *
     * 3. **The Trap (Hypothesis):**
     *    - If "Teleportation" (Disjoint Updates) causes an update to be sent *before* the previous ID sync cycle completes (Race Condition), the App Worker sends a `vdom` tree with missing or stale IDs.
     *    - The VDOM Worker sees a node without an ID (or a mismatched ID) and assumes it's a new node.
     *    - It generates an `insertNode` delta.
     *    - If the "removeNode" logic fails (e.g., due to sparse tree pruning or mismatching parent pointers), we get duplication (The "Stephanie ++Stephanie ++" artifact).
     *
     * To reproduce the bug, we must break the ID sync loop by triggering a new update while the previous one in-flight.
     */
    test('Scrolling should generate correct replacement deltas, not appends', async () => {
        const body = grid.body;

        // Spy on VdomHelper.updateBatch to capture ALL deltas globally
        const originalUpdateBatch = VdomHelper.updateBatch;
        const capturedDeltas = [];

        // Mock updateBatch to be async and introduce latency
        VdomHelper.updateBatch = async function(data) {
            // Simulate Worker Roundtrip Latency (e.g. 20ms)
            await new Promise(resolve => setTimeout(resolve, 20));

            const result = originalUpdateBatch.call(this, data);
            if (result.deltas && result.deltas.length > 0) {
                capturedDeltas.push(...result.deltas);
            }
            return result;
        };

        // 1. Initial State Check
        const vdomRoot = body.getVdomRoot();
        expect(vdomRoot.cn.length).toBeGreaterThan(0);

        const scrollAmount = 800;

        // console.log('--- SCROLLING ---');

        // Capture the update promise BEFORE triggering the change
        const updatePromise = body.promiseUpdate();
        updatePromise.catch(() => {}); // Handle potential isDestroyed rejection

        body.scrollTop = scrollAmount;

        // FUTURE: To test race conditions, trigger another scroll here immediately:
        // body.scrollTop = scrollAmount + 40;

        // Wait for the update to complete
        await updatePromise;

        // Restore VdomHelper
        VdomHelper.updateBatch = originalUpdateBatch;

        // Log Captured Deltas for detailed inspection
        if (capturedDeltas.length > 0) {
             // console.log('--- CAPTURED DELTAS ---');
             // We verify that we are NOT seeing "insertNode" for the text span without "removeNode"
             // console.log(JSON.stringify(capturedDeltas, null, 2));

             const moveNodes = capturedDeltas.filter(d => d.action === 'moveNode');
             const insertNodes = capturedDeltas.filter(d => d.action === 'insertNode');
             const removeNodes = capturedDeltas.filter(d => d.action === 'removeNode');
             const textUpdates = capturedDeltas.filter(d => d.textContent && d.id?.startsWith('neo-vnode-'));

             // In a clean recycle scroll (800px / 40px rowHeight):
             // We observed 8 moves, 3 insertions (new rows at bottom), and 11 text updates.
             expect(moveNodes.length).toBe(8);
             expect(insertNodes.length).toBe(3);
             expect(textUpdates.length).toBe(11);

             // Specific check: We should NOT be inserting 'text' vtypes (span wrapper for text) into existing buttons.
             // The text span is part of the button structure and should be stable.
             // Valid insertions are new Rows (parentId = grid body).
             // Invalid insertions (Duplication Bug) would be text spans inserted into Buttons (parentId = button id).
             const textSpanInsertions = insertNodes.filter(d => d.parentId.includes('component') && d.vnode?.className?.includes('neo-button-text'));
             expect(textSpanInsertions.length).toBe(0);
        }

        // Now inspect the DOM (VNode) of a recycled row.
        // With 100 items and 40px height, row 20 should be at 800px.
        const firstRenderedRow = body.getVdomRoot().cn[0];
        const rowIndex = parseInt(firstRenderedRow['aria-rowindex']) - 2;
        // console.log(`First rendered row index: ${rowIndex}`);

        const cell = firstRenderedRow.cn[1];
        const buttonRef = cell.cn[0];
        const button = Neo.getComponent(buttonRef.componentId);

        const expectedText = `Row ${rowIndex}`;
        expect(button.text).toBe(expectedText);

        const buttonVnode = button.vnode;
        // console.log('Button VNode:', JSON.stringify(buttonVnode, null, 2));

        // Find the text span
        const textNode = buttonVnode.childNodes.find(c => c.className?.includes('neo-button-text'));

        // Assertion: Text content must match the new row index
        expect(textNode.textContent).toBe(expectedText);

        // Assertion: There should be EXACTLY ONE text span.
        // The bug manifests as multiple text spans (duplication).
        const textNodes = buttonVnode.childNodes.filter(c => c.className?.includes('neo-button-text'));
        expect(textNodes.length).toBe(1);
    });

    test('Scrolling with Race Conditions (Async Updates) should not duplicate nodes', async () => {
        const body = grid.body;

        // Spy on VdomHelper.updateBatch to capture ALL deltas globally
        const originalUpdateBatch = VdomHelper.updateBatch;
        const capturedDeltas = [];

            // Mock updateBatch to be async and introduce latency
            VdomHelper.updateBatch = async function(data) {
                // Simulate Worker Roundtrip Latency (e.g. 20ms)
                await new Promise(resolve => setTimeout(resolve, 20));

                const result = originalUpdateBatch.call(this, data);
                if (result.deltas && result.deltas.length > 0) {
                    capturedDeltas.push(...result.deltas);
                }
                return result;
            };

            // Force frequent updates by disabling buffer
            body.bufferRowRange = 0;

            // 1. Initial State Check
            const vdomRoot = body.getVdomRoot();
            expect(vdomRoot.cn.length).toBeGreaterThan(0);

            const scrollAmount = 800;

            // console.log('--- SCROLLING (RACE) ---');

            // Trigger first scroll
            body.scrollTop = scrollAmount;

            // Trigger second scroll immediately (Race Condition)
            // With buffer=0, this GUARANTEES a second 'createViewData' call on overlapping rows.
            // We capture the update promise to synchronize the test with the completion of the update cycle.
            const updatePromise = body.promiseUpdate();
            updatePromise.catch(() => {}); // Handle potential isDestroyed rejection

            body.scrollTop = scrollAmount + 40;

            // Wait for the updates to complete (handles the 20ms latency)
            await updatePromise;

            // Restore VdomHelper
            VdomHelper.updateBatch = originalUpdateBatch;

            // Log Captured Deltas for detailed inspection
            if (capturedDeltas.length > 0) {
                // console.log('--- CAPTURED DELTAS (RACE) ---');

                const moveNodes = capturedDeltas.filter(d => d.action === 'moveNode');
                const insertNodes = capturedDeltas.filter(d => d.action === 'insertNode');
                const textUpdates = capturedDeltas.filter(d => d.textContent && d.id?.startsWith('neo-vnode-'));

                // Verify we have activity
                // In this specific race scenario with bufferRowRange=0:
                // We observe 3 moves, 0 row insertions (pure recycling!), and 8 text updates.
                // The presence of 3 'removeNode' deltas (seen in analysis) confirms the grid is pruning rows 8, 9, 10.
                expect(moveNodes.length).toBe(3);
                expect(insertNodes.length).toBe(0);
                expect(textUpdates.length).toBe(8);

                // Diagnosis: The test currently PASSES because 'VdomLifecycle' correctly serializes the updates
                // via 'isVdomUpdating' / 'needsVdomUpdate'. The second scroll waits for the first to finish.
                // To reproduce the bug, we likely need to trigger a disjoint component update (e.g. Button text)
                // that falsely believes it does not collide with the Grid update.
                // We observe 3 moves, 0 row insertions (pure recycling!), and 8 text updates.
                expect(moveNodes.length).toBe(3);
                expect(insertNodes.length).toBe(0);
                expect(textUpdates.length).toBe(8);

                // Specific check: We should NOT be inserting 'text' vtypes (span wrapper for text).
                // The duplication bug manifests as inserting a NEW text span instead of updating the existing one.
                const textSpanInsertions = insertNodes.filter(d => d.parentId.includes('component') && d.vnode?.className?.includes('neo-button-text'));
                
                // Ideally, we should have 0 text span insertions in a clean recycle
                expect(textSpanInsertions.length).toBe(0);

                // Verify that deltas target valid nodes
                capturedDeltas.forEach(delta => {
                    if (delta.action === 'updateVtext' || delta.action === 'moveNode') {
                        // Ensure we are not targeting undefined or null IDs
                        expect(delta.id).toBeTruthy();
                        // Ideally, we would check if ID exists in a snapshot, but for now we ensure it's not a known bad pattern
                        expect(delta.id).not.toContain('undefined');
                        expect(delta.id).not.toContain('null');
                    }
                });

                // Analysis of Real Breaking Deltas:
                // The logs show a pattern where a node (neo-vnode-121) is MOVED (index 0) and then immediately updated (textContent).
                // 1: {action: 'moveNode', id: 'neo-vnode-121', parentId: 'neo-base-10-component-36', index: 0}
                // 2: {textContent: 'Emily ++', id: 'neo-vnode-121'}
                //
                // We must verify if this pattern exists in our captured deltas.
                const movedIds = new Set(moveNodes.map(d => d.id));
                const updatedIds = new Set(textUpdates.map(d => d.id));
                
                // Find IDs that are BOTH moved and updated
                const intersection = [...movedIds].filter(id => updatedIds.has(id));
                
                // In a clean recycle, we DO expect the row container to move, and the text content to update.
                // However, the text NODE itself (neo-vnode-XXX) usually just updates content. 
                // Does it move? 
                // If it is inside a Button, and the Button moves (recycled), the text node moves with it implicitly.
                // Explicitly moving the text node implies it was re-ordered within the Button?
                // The Button only has [Icon, Text, Badge, Ripple].
                // If the Text node is index 1, and stays index 1, it should NOT have a moveNode delta.
                
                // Filter for "text node" moves (neo-vnode-XXX inside a component)
                // We assume 'neo-vnode-' IDs are the internal ones.
                const textNodeMoves = moveNodes.filter(d => d.id.startsWith('neo-vnode-'));
                
                // We expect 0 explicit moves for the internal text span if the structure is stable.
                expect(textNodeMoves.length).toBe(0);
            }

            // Inspect the final state
            // Scroll 800 -> Row 20. Scroll 840 -> Row 21.
            const finalScrollTop = 840;
            const firstRenderedRow = body.getVdomRoot().cn[0];
            const firstRowIndex = parseInt(firstRenderedRow['aria-rowindex']) - 2;
            // console.log(`First rendered row index (RACE): ${firstRowIndex}`);

            // Let's inspect the FIRST row in the VDOM.
            const cell = firstRenderedRow.cn[1];
            const buttonRef = cell.cn[0];
            const button = Neo.getComponent(buttonRef.componentId);

            const expectedText = `Row ${firstRowIndex}`;

            // console.log(`Button Text: "${button.text}", Expected: "${expectedText}"`);
            expect(button.text).toBe(expectedText);

            const buttonVnode = button.vnode;

            // Find the text span
            const textNode = buttonVnode.childNodes.find(c => c.className?.includes('neo-button-text'));

            // Assertion: Text content must match the new row index
            expect(textNode.textContent).toBe(expectedText);

            // Assertion: There should be EXACTLY ONE text span.
            const textNodes = buttonVnode.childNodes.filter(c => c.className?.includes('neo-button-text'));

            expect(textNodes.length).toBe(1);

            // Verify ALL visible rows have correct text
            body.getVdomRoot().cn.forEach(row => {
                if (!row.attributes) return; // Skip spacers or non-row nodes
                
                const cell = row.cn?.[1]; // Component column
                if (!cell) return;

                const btnRef = cell.cn?.[0];
                if (btnRef?.componentId) {
                    const btn = Neo.getComponent(btnRef.componentId);
                    if (btn && btn.record) {
                        expect(btn.text).toBe(`Row ${btn.record.id}`);
                    }
                }
            });
    });
});
