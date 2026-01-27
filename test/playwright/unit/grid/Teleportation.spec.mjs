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

                // Check for insertions of text nodes
                const insertions = capturedDeltas.filter(d => d.action === 'insertNode' && d.vnode?.vtype === 'text');
                if (insertions.length > 0) {
                     // console.log(`Found ${insertions.length} text node insertions. Checking for duplicates...`);
                }
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

            if (textNodes.length > 1) {
                 console.error('DUPLICATION DETECTED!');
            }

            expect(textNodes.length).toBe(1);
    });
});
