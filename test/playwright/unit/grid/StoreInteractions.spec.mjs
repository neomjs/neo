/**
 * @file test/playwright/unit/grid/StoreInteractions.spec.mjs
 * @summary Unit tests for Grid & Store Interactions (Fixed-DOM-Order Architecture).
 *
 * This suite verifies that runtime store mutations (add, remove, sort, filter)
 * interact correctly with the Grid's "Fixed-DOM-Order" strategy.
 * It asserts that these operations generate **ZERO** structural DOM deltas
 * (no `insertNode`, `removeNode`, or `moveNode` for pooled elements) where possible,
 * relying instead on content updates and recycling.
 *
 * @see Neo.grid.Body
 * @see Neo.data.Store
 */

import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridStoreInteractionsTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Grid & Store Interactions', () => {
    let grid, store;

    // Helper to capture deltas during an operation
    const captureDeltas = async (operation) => {
        const captured = [];
        const originalUpdateBatch = VdomHelper.updateBatch;

        // Spy on updateBatch
        VdomHelper.updateBatch = function(data) {
            const result = originalUpdateBatch.call(this, data);
            if (result.deltas && result.deltas.length > 0) {
                captured.push(...result.deltas);
            }
            return result;
        };

        try {
            await operation();
            // Allow async updates to settle
            await grid.timeout(50);
        } finally {
            VdomHelper.updateBatch = originalUpdateBatch;
        }

        return captured;
    };

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
                scrollIntoView: async () => {},
                scrollTo      : async () => {}
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

        // Mock Neo.worker.App
        Neo.worker = Neo.worker || {};
        Neo.worker.App = {
            promiseMessage: async () => {}
        };

        // Create dataset (20 records)
        const data = [];
        for (let i = 0; i < 20; i++) {
            data.push({
                id: i,
                name: `Row ${i}`,
                score: i * 10
            });
        }

        store = Neo.create(Store, {
            keyProperty: 'id',
            data,
            model: {
                fields: [
                    {name: 'id',    type: 'Integer'},
                    {name: 'name',  type: 'String'},
                    {name: 'score', type: 'Integer'}
                ]
            }
        });

        grid = Neo.create(GridContainer, {
            appName  : 'GridStoreInteractionsTest',
            height   : 400, // 10 rows visible (40px each)
            width    : 600,
            store    : store,
            rowHeight: 40,
            bufferRowRange: 2, 
            columns  : [{
                dataField: 'id',
                text     : 'ID',
                width    : 50
            }, {
                dataField: 'name',
                text     : 'Name',
                width    : 150
            }, {
                dataField: 'score',
                text     : 'Score',
                width    : 100
            }]
        });

        await grid.initVnode();
        grid.mounted = true;

        // Setup column positions
        const colPos = [];
        let x = 0;
        grid.columns.items.forEach(col => {
            colPos.push({
                dataField: col.dataField,
                width: col.width,
                x: x
            });
            x += col.width;
        });
        grid.body.columnPositions.clear();
        grid.body.columnPositions.add(colPos);

        // Force layout
        grid.body.set({
            availableHeight: 400 - 40,
            containerWidth : 600
        });

        await grid.timeout(50);
    });

    test.afterEach(async () => {
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy();
    });

    test('Runtime Insert: Should shift content with ZERO structural deltas', async () => {
        // Initial state: Row 0 is at index 0
        const firstRow = grid.body.items.find(r => r.rowIndex === 0);
        expect(firstRow.record.name).toBe('Row 0');

        const deltas = await captureDeltas(async () => {
            // Insert at top. Should shift everything down.
            store.insert(0, {id: 100, name: 'New Row', score: 999});
        });

        // 1. Verify Logical State
        // The previous Row 0 component should now display the NEW record
        // Wait, in Fixed-DOM-Order, visual index 0 is always item[0].
        // If we insert at 0, the pool rotates? No, the data shifts.
        // Item[0] should now hold 'New Row' (rowIndex 0).
        // Item[1] should now hold 'Row 0' (rowIndex 1).
        
        const newFirstRow = grid.body.items.find(r => r.rowIndex === 0);
        expect(newFirstRow.record.name).toBe('New Row');

        // 2. Verify VDOM State (The blueprint)
        // Access the cell for the 'name' column (index 1)
        const vdomCell = newFirstRow.vdom.cn[1];
        // The cell content might be direct html or a child node depending on renderer
        const vdomContent = vdomCell.html || vdomCell.cn?.[0]?.html || vdomCell.text;
        expect(vdomContent).toContain('New Row');

        // 3. Verify VNode State (The simulated live DOM)
        // Access the cell node in the VNode tree
        const vnodeCell = newFirstRow.vnode.childNodes[1]; // Name column
        expect(vnodeCell.innerHTML).toContain('New Row');
        
        // 4. Verify Deltas
        const moveNodes   = deltas.filter(d => d.action === 'moveNode');
        const insertNodes = deltas.filter(d => d.action === 'insertNode');
        const removeNodes = deltas.filter(d => d.action === 'removeNode');
        
        // Content updates: 'name' column
        const contentUpdates = deltas.filter(d => d.textContent || d.innerHTML);
        // Transform updates: Rows moving visually
        const transformUpdates = deltas.filter(d => d.style?.transform);
        
        // STRICT ASSERTION: No structural changes to rows
        expect(moveNodes.length).toBe(0);
        expect(insertNodes.length).toBe(0); 
        expect(removeNodes.length).toBe(0);

        // Verification of Modulo-Pooling (Fixed-DOM-Order) Behavior:
        // Inserting at Index 0 shifts the data index for every visible row.
        // Since DOM slots are fixed (Index % PoolSize), every slot stays at the same Y position
        // but receives a NEW record (Waterfall Effect).
        // Result: 0 Transform changes, but N*Cols Content changes.
        expect(transformUpdates.length).toBe(0);

        // Expect significant content updates (shifting rows)
        // 10 visible rows * 3 columns = 30 potential cell updates.
        // Plus buffer rows (2 top + 2 bottom) = 14 rows * 3 = 42 potential updates.
        expect(contentUpdates.length).toBeGreaterThan(0);
        expect(contentUpdates.length).toBeLessThanOrEqual(50); // 42 expected + margin
    });

    test('Runtime Remove: Should shift content up with ZERO structural deltas', async () => {
        const deltas = await captureDeltas(async () => {
            // Remove the first record
            store.removeAt(0);
        });

        const newFirstRow = grid.body.items.find(r => r.rowIndex === 0);
        // Was 'Row 0', now 'Row 1' shifted up to index 0
        expect(newFirstRow.record.name).toBe('Row 1');

        // Verify VDOM & VNode
        const vdomCell = newFirstRow.vdom.cn[1];
        const vdomContent = vdomCell.html || vdomCell.cn?.[0]?.html || vdomCell.text;
        expect(vdomContent).toContain('Row 1');

        const vnodeCell = newFirstRow.vnode.childNodes[1];
        expect(vnodeCell.innerHTML).toContain('Row 1');

        const moveNodes = deltas.filter(d => d.action === 'moveNode');
        const insertNodes = deltas.filter(d => d.action === 'insertNode');
        const removeNodes = deltas.filter(d => d.action === 'removeNode');
        
        const contentUpdates = deltas.filter(d => d.textContent || d.innerHTML);

        // STRICT ASSERTION
        expect(moveNodes.length).toBe(0);
        expect(insertNodes.length).toBe(0);
        expect(removeNodes.length).toBe(0); // Rows should be recycled/hidden, not removed
        
        expect(contentUpdates.length).toBeGreaterThan(0);
        expect(contentUpdates.length).toBeLessThanOrEqual(50);
    });

    test('Runtime Sort: Should update content without moving rows', async () => {
        const deltas = await captureDeltas(async () => {
            // Sort descending by ID (reverses the list)
            store.sort({property: 'id', direction: 'DESC'});
        });

        const newFirstRow = grid.body.items.find(r => r.rowIndex === 0);
        expect(newFirstRow.record.name).toBe('Row 19'); // Last item is now first

        // Verify VDOM & VNode
        const vdomCell = newFirstRow.vdom.cn[1];
        expect(vdomCell.html || vdomCell.cn?.[0]?.html).toContain('Row 19');

        const vnodeCell = newFirstRow.vnode.childNodes[1];
        expect(vnodeCell.innerHTML).toContain('Row 19');

        const moveNodes = deltas.filter(d => d.action === 'moveNode');
        const insertNodes = deltas.filter(d => d.action === 'insertNode');
        const removeNodes = deltas.filter(d => d.action === 'removeNode');
        const contentUpdates = deltas.filter(d => d.textContent || d.innerHTML);

        // STRICT ASSERTION
        expect(moveNodes.length).toBe(0); // Rows stay in place
        expect(insertNodes.length).toBe(0);
        expect(removeNodes.length).toBe(0);
        
        expect(contentUpdates.length).toBeGreaterThan(0); // Content updates
        // 14 rows * 3 cols = 42 updates expected
        expect(contentUpdates.length).toBeLessThanOrEqual(50);
    });

    test('Runtime Filter: Should hide unused rows without removing them', async () => {
        const deltas = await captureDeltas(async () => {
            // Filter to show only 2 items
            store.filters = [{
                property: 'id',
                operator: '<',
                value   : 2
            }];
        });

        expect(grid.body.store.count).toBe(2);

        // Verify Visible Row (Index 0)
        const visibleRow = grid.body.items.find(r => r.rowIndex === 0);
        expect(visibleRow.record.name).toBe('Row 0');
        expect(visibleRow.vdom.style.display).toBeNull(); // Should be visible (null removes display:none)
        
        // Verify Hidden Row (Index 2 - effectively unused/recycled to empty)
        // With Fixed-DOM-Order, unused items in the pool have rowIndex = -1
        const hiddenRow = grid.body.items.find(r => r.rowIndex === -1);
        expect(hiddenRow).toBeDefined();
        expect(hiddenRow.vdom.style.display).toBe('none');
        expect(hiddenRow.vnode.style.display).toBe('none');

        const moveNodes = deltas.filter(d => d.action === 'moveNode');
        const insertNodes = deltas.filter(d => d.action === 'insertNode');
        const removeNodes = deltas.filter(d => d.action === 'removeNode');
        const displayUpdates = deltas.filter(d => d.style && d.style.display === 'none');
        const contentUpdates = deltas.filter(d => d.textContent || d.innerHTML);

        // STRICT ASSERTION
        expect(moveNodes.length).toBe(0);
        expect(insertNodes.length).toBe(0);
        expect(removeNodes.length).toBe(0); // No DOM removal
        
        expect(displayUpdates.length).toBeGreaterThan(0); // Unused rows hidden
        // We have 14 rows total (10 visible + 4 buffer). 
        // 2 remain visible. 12 should be hidden.
        // Content updates for the 2 remaining rows (2 * 3 = 6).
        // Total deltas roughly 18-20.
        expect(deltas.length).toBeLessThanOrEqual(30);
    });
});
