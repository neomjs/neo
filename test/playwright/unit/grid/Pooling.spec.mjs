/**
 * @file test/playwright/unit/grid/Pooling.spec.mjs
 * @summary Unit tests for Grid Row and Cell Pooling (Fixed-DOM-Order Architecture).
 *
 * This suite verifies the "Fixed-DOM-Order" strategy used by `Neo.grid.Body` and `Neo.grid.Row`.
 * It asserts that scrolling (vertical and horizontal) generates **ZERO** structural DOM deltas
 * (no `insertNode`, `removeNode`, or `moveNode` for pooled elements), ensuring O(1) performance.
 *
 * Key Verification Points:
 * 1.  **Vertical Scroll:** Verifies row recycling where rows are visually moved (transform) and updated with new data.
 * 2.  **Horizontal Scroll:** Verifies cell recycling where cells are repositioned (left) and updated with new column content.
 * 3.  **Performance Audit:** Strictly asserts that scrolling N rows results in exactly N row updates + associated cell updates, with no overhead.
 *
 * @see Neo.grid.Body
 * @see Neo.grid.Row
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
        name             : 'GridPoolingTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Grid Pooling & Fixed-DOM-Order', () => {
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

        // Create large dataset
        const data = [];
        for (let i = 0; i < 1000; i++) {
            data.push({
                id: i,
                name: `Row ${i}`,
                age: 20 + (i % 50),
                country: `Country ${i % 10}`,
                email: `user${i}@example.com`,
                score: Math.random() * 100
            });
        }

        store = Neo.create(Store, {
            keyProperty: 'id',
            data,
            model: {
                fields: [
                    {name: 'id',      type: 'Integer'},
                    {name: 'name',    type: 'String'},
                    {name: 'age',     type: 'Integer'},
                    {name: 'country', type: 'String'},
                    {name: 'email',   type: 'String'},
                    {name: 'score',   type: 'Float'}
                ]
            }
        });

        grid = Neo.create(GridContainer, {
            appName  : 'GridPoolingTest',
            height   : 400, // 10 rows visible (40px each)
            width    : 600,
            store    : store,
            rowHeight: 40,
            // Use small buffer for deterministic testing
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
                dataField: 'age',
                text     : 'Age',
                width    : 60
            }, {
                dataField: 'country',
                text     : 'Country',
                width    : 100
            }, {
                dataField: 'email',
                text     : 'Email',
                width    : 200
            }, {
                dataField: 'score',
                text     : 'Score',
                width    : 80
            }]
        });

        await grid.initVnode();
        grid.mounted = true;

        // Setup column positions (simulating HeaderToolbar behavior)
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
            availableHeight: 400 - 40, // height - header
            containerWidth : 600
        });

        await grid.timeout(50);
    });

    test.afterEach(async () => {
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy();
    });

    /**
     * Goal 1 & 2: Vertical Scroll & Strict Delta Verification
     */
    test('Vertical Scroll should recycle rows with ZERO structural deltas', async () => {
        const body = grid.body;
        
        // Initial check: Row pool size
        // Visible: 360px / 40px = 9 rows.
        // Buffer: 2 * 2 = 4 rows.
        // Total Pool ~= 13-14 rows.
        const poolSize = body.items.length;
        expect(poolSize).toBeGreaterThan(0);

        const scrollAmount = 400; // Scroll down 10 rows (one full page)

        const deltas = await captureDeltas(async () => {
            body.scrollTop = scrollAmount;
            // Wait for update
            await body.promiseUpdate();
        });

        // Analyze Deltas
        const moveNodes   = deltas.filter(d => d.action === 'moveNode');
        const insertNodes = deltas.filter(d => d.action === 'insertNode');
        const removeNodes = deltas.filter(d => d.action === 'removeNode');
        const updates     = deltas.filter(d => !['moveNode', 'insertNode', 'removeNode'].includes(d.action));

        // STRICT VERIFICATION: NO structural changes allowed
        expect(moveNodes.length, 'Should have 0 moveNode operations').toBe(0);
        expect(insertNodes.length, 'Should have 0 insertNode operations').toBe(0);
        expect(removeNodes.length, 'Should have 0 removeNode operations').toBe(0);

        expect(updates.length).toBeGreaterThan(0);

        // Verify that we are actually updating content
        const contentUpdates = updates.filter(d => d.textContent || d.innerHTML || (d.action === 'updateVtext' && d.value));
        const styleUpdates   = updates.filter(d => d.style);
        const rowUpdates     = updates.filter(d => d.id?.includes('__row-'));
        const cellUpdates    = updates.filter(d => d.id?.includes('__cell-') || d.id?.includes('__row') && !d.style?.transform); // Rough heuristic

        // We expect content updates for recycled rows
        expect(contentUpdates.length).toBeGreaterThan(0);
        
        // We expect transform updates for recycled rows (moving them to the bottom)
        const transformUpdates = styleUpdates.filter(d => d.style.transform);
        expect(transformUpdates.length).toBeGreaterThan(0);

        // Verify Data Correctness
        // At scrollTop 400, top row is index 10 (Row 10)
        const topRowIndex = 10;
        
        // Find the Row component responsible for index 10
        const rowCmp = body.items.find(row => row.rowIndex === topRowIndex);
        
        expect(rowCmp).toBeDefined();
        expect(rowCmp.record.id).toBe(10);
        expect(rowCmp.record.name).toBe('Row 10');

        // Check VDOM matches
        const nameCell = rowCmp.vdom.cn[1]; // Name column
        expect(nameCell.html || nameCell.cn[0].html).toContain('Row 10');
    });

    /**
     * Goal 2: Horizontal Scroll & Cell Recycling
     */
    test('Horizontal Scroll should recycle cells with ZERO structural deltas', async () => {
        const body = grid.body;

        // Force a small container width to trigger horizontal scrolling
        // Visible cols: ID (50), Name (150). Total 200.
        // Container: 200.
        body.containerWidth = 200;
        // Wait for column virtualization to kick in
        await grid.timeout(50);

        // Scroll Right to reveal Age, Country, Email...
        const scrollLeftAmount = 300; 

        const deltas = await captureDeltas(async () => {
            body.scrollLeft = scrollLeftAmount;
            await body.promiseUpdate();
        });

        // Analyze Deltas
        const moveNodes   = deltas.filter(d => d.action === 'moveNode');
        const insertNodes = deltas.filter(d => d.action === 'insertNode');
        const removeNodes = deltas.filter(d => d.action === 'removeNode');

        // STRICT VERIFICATION
        expect(moveNodes.length, 'Should have 0 moveNode operations').toBe(0);
        expect(insertNodes.length, 'Should have 0 insertNode operations').toBe(0);
        expect(removeNodes.length, 'Should have 0 removeNode operations').toBe(0);

        // Verify cell updates
        const updates = deltas.filter(d => d.style || d.textContent || d.innerHTML);
        expect(updates.length).toBeGreaterThan(0);
        
        // Verify 'left' style updates (cell positioning)
        const leftUpdates = updates.filter(d => d.style?.left);
        // Verify content updates (recycling)
        const contentUpdates = updates.filter(d => d.textContent || d.innerHTML || (d.action === 'updateVtext' && d.value));

        expect(leftUpdates.length).toBeGreaterThan(0);
        expect(contentUpdates.length).toBeGreaterThan(0);
    });

    /**
     * Goal 2 & 3: Diagonal Scroll
     */
    test('Diagonal Scroll should maintain zero structural deltas', async () => {
        const body = grid.body;
        body.containerWidth = 200;
        await grid.timeout(50);

        const deltas = await captureDeltas(async () => {
            // Batch updates
            body.set({
                scrollTop : 400,
                scrollLeft: 300
            });
            await body.promiseUpdate();
        });

        const structureChanges = deltas.filter(d => ['moveNode', 'insertNode', 'removeNode'].includes(d.action));
        expect(structureChanges.length, 'Should have 0 structural changes').toBe(0);
    });

    /**
     * Goal 2: Buffer Range & Clamping
     */
    test('Scrolling to end of store should clamp correctly', async () => {
        const body = grid.body;
        const totalHeight = (1000 * 40) + 40; // rows + header (approx)
        
        // Scroll to very bottom
        const maxScroll = totalHeight - 400;

        await captureDeltas(async () => {
            body.scrollTop = maxScroll;
            await body.promiseUpdate();
        });

        // Check the last visible row
        // Last index should be 999
        const lastRowCmp = body.items.find(row => row.rowIndex === 999);
        expect(lastRowCmp).toBeDefined();
        expect(lastRowCmp.record.name).toBe('Row 999');

        // Verify no "Row undefined" or blank rows are rendered visibly
        // The pool size might be larger than visible rows, so unused rows should be hidden or empty
        const activeRows = body.items.filter(row => row.rowIndex > -1);
        
        // Ensure all active rows have valid records
        activeRows.forEach(row => {
            expect(row.record).not.toBeNull();
            expect(row.record.id).toBeLessThan(1000);
        });
    });

    /**
     * Goal 3: Performance Auditing (Exact Delta Counting)
     */
    test('Performance Audit: Exact delta count for single row scroll', async () => {
        const body = grid.body;
        
        // Reset to top
        body.scrollTop = 0;
        await body.promiseUpdate();
        await grid.timeout(50);

        const deltas = await captureDeltas(async () => {
            // Jump 4 rows (160px) to be absolutely sure we cross the buffer (2 rows)
            // Start 0 (Mounted 0..12) -> Start 4 (Mounted 2..14)
            // Rows 0, 1 recycle to Rows 13, 14.
            body.scrollTop = 160;
            await body.promiseUpdate();
        });

        // Analysis
        const rowUpdates = deltas.filter(d => d.id?.includes('__row-') && d.style?.transform);
        // Cell updates are children of the moved row.
        // In Fixed-DOM-Order, the row ID is stable (e.g. row-0), but it moves to the bottom.
        // We expect updates for the cells inside this ONE row.
        const movedRowId = rowUpdates[0]?.id;
        const cellUpdates = deltas.filter(d => d.id?.startsWith(movedRowId + '__'));

        // STRICT ASSERTIONS
        // 1. Exactly 1 Row should move (recycling index 0 to index 10)
        expect(rowUpdates.length).toBe(1);

        // 2. Exactly 6 Cells should update (6 columns)
        // Note: If cells use "innerHTML", "text", or "style" (e.g. selection), they count.
        // In this clean test, all 6 columns update content.
        expect(cellUpdates.length).toBe(6);

        // 3. Total Deltas should be exactly 7
        expect(deltas.length).toBe(7);
        
        // 4. Verify no structural changes
        const structureChanges = deltas.filter(d => ['moveNode', 'insertNode', 'removeNode'].includes(d.action));
        expect(structureChanges.length).toBe(0);
    });
});
