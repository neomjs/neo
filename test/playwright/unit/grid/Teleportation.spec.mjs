import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
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
        // Mock Neo.main and Neo.currentWorker
        Neo.main = {
            addon: {
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

    test.afterEach(() => {
        grid?.destroy();
        store?.destroy();
    });

    /**
     * @summary Baseline Teleportation Test
     * 
     * This test establishes the baseline behavior for VDOM Teleportation in the Grid.
     * It simulates a scroll event that triggers row recycling and component updates.
     * 
     * Current State: PASSING
     * This means the basic "Happy Path" of scrolling works correctly in the Unit Test environment.
     * 
     * To reproduce the "Stephanie ++" artifact (duplication), we likely need to simulate:
     * 1. Race Conditions: Trigger a second scroll *before* the first update completes.
     * 2. Component State Changes: Update the component state (e.g. click) while scrolling.
     * 3. Disjoint Updates: Force the component update to be processed separately from the grid body.
     */
    test('Scrolling should generate correct replacement deltas, not appends', async () => {
        const body = grid.body;

        // Spy on VdomHelper.update to capture ALL deltas globally
        // This is crucial for debugging multi-component updates where body.promiseUpdate() might miss side-effects
        const originalUpdate = VdomHelper.update;
        const capturedDeltas = [];
        
        VdomHelper.update = function(opts) {
            const result = originalUpdate.call(this, opts);
            if (result.deltas && result.deltas.length > 0) {
                capturedDeltas.push(...result.deltas);
            }
            return result;
        };

        // 1. Initial State Check
        const vdomRoot = body.getVdomRoot();
        expect(vdomRoot.cn.length).toBeGreaterThan(0);

        const scrollAmount = 800;
        
        console.log('--- SCROLLING ---');
        
        // Capture the update promise BEFORE triggering the change
        const updatePromise = body.promiseUpdate();
        
        body.scrollTop = scrollAmount;
        
        // FUTURE: To test race conditions, trigger another scroll here immediately:
        // body.scrollTop = scrollAmount + 40;
        
        // Wait for the update to complete
        await updatePromise;
        
        // Restore VdomHelper
        VdomHelper.update = originalUpdate;
        
        // Log Captured Deltas for detailed inspection
        if (capturedDeltas.length > 0) {
            console.log('--- CAPTURED DELTAS ---');
            // We verify that we are NOT seeing "insertNode" for the text span without "removeNode"
            // console.log(JSON.stringify(capturedDeltas, null, 2));
        }

        // Now inspect the DOM (VNode) of a recycled row.
        // With 100 items and 40px height, row 20 should be at 800px.
        const firstRenderedRow = body.getVdomRoot().cn[0];
        const rowIndex = parseInt(firstRenderedRow['aria-rowindex']) - 2;
        console.log(`First rendered row index: ${rowIndex}`);
        
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
});
