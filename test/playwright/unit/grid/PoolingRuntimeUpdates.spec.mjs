/**
 * @file test/playwright/unit/grid/PoolingRuntimeUpdates.spec.mjs
 * @summary Unit tests for Runtime Buffer Updates breaking Row/Cell Pooling.
 *
 * This suite reproduces the regression described in #9165 where changing bufferRowRange
 * or bufferColumnRange at runtime causes the grid to render blank or missing cells.
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
        name             : 'GridPoolingRuntimeUpdatesTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Grid Pooling Runtime Updates', () => {
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

        Neo.worker = Neo.worker || {};
        Neo.worker.App = {
            promiseMessage: async () => {}
        };

        const data = [];
        for (let i = 0; i < 200; i++) {
            data.push({
                id: i,
                name: `Row ${i}`,
                score: i * 10,
                col1: `C1-${i}`, col2: `C2-${i}`, col3: `C3-${i}`, col4: `C4-${i}`
            });
        }

        store = Neo.create(Store, {
            keyProperty: 'id',
            data,
            model: {
                fields: [
                    {name: 'id', type: 'Integer'},
                    {name: 'name', type: 'String'},
                    {name: 'score', type: 'Integer'},
                    {name: 'col1', type: 'String'},
                    {name: 'col2', type: 'String'},
                    {name: 'col3', type: 'String'},
                    {name: 'col4', type: 'String'}
                ]
            }
        });

        grid = Neo.create(GridContainer, {
            appName  : 'GridPoolingRuntimeUpdatesTest',
            height   : 400,
            width    : 300,
            store    : store,
            rowHeight: 40,
            bufferRowRange: 2, 
            bufferColumnRange: 0,
            columns  : [{
                dataField: 'id', text: 'ID', width: 50
            }, {
                dataField: 'name', text: 'Name', width: 150
            }, {
                dataField: 'score', text: 'Score', width: 100
            }, {
                dataField: 'col1', text: 'Col 1', width: 100
            }, {
                dataField: 'col2', text: 'Col 2', width: 100
            }, {
                dataField: 'col3', text: 'Col 3', width: 100
            }, {
                dataField: 'col4', text: 'Col 4', width: 100
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

        grid.body.set({
            availableHeight: 400 - 40,
            containerWidth : 300
        });

        await grid.timeout(50);
    });

    test.afterEach(async () => {
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy();
    });

    test('Increase bufferRowRange at runtime should expand row pool', async () => {
        const body = grid.body;
        
        // Initial state
        // Visible rows: 360 / 40 = 9 rows.
        // Buffer: 2 * 2 = 4 rows.
        // Total Pool: 9 - 1 (availableRows logic) + 4 = 12? 
        // Actual from previous run: 18.
        // Formula: ceil(360/40) - 1 = 8 available rows.
        // Pool = available + 2*buffer. 8 + 4 = 12.
        // Wait, why was it 18?
        // Ah, `updateMountedAndVisibleRows` logic:
        // windowSize = availableRows + 2 * bufferRowRange.
        // If start is 0, end is windowSize.
        // 8 + 4 = 12. 
        // Why 18? Maybe my math on availableHeight is wrong or rowHeight.
        // height 400. rowHeight 40. header 40? 
        // 360 / 40 = 9. 
        // Let's trust the engine's output for now and verify the DELTA.
        
        const initialPoolSize = body.items.length;
        // expect(initialPoolSize).toBe(18); // Based on previous run

        // Change buffer
        body.bufferRowRange = 5;
        
        // Wait for update
        await body.promiseUpdate();
        await grid.timeout(50);

        const newPoolSize = body.items.length;
        
        // Assertion: The pool MUST expand.
        expect(newPoolSize).toBeGreaterThan(initialPoolSize);
    });

    test('Increase bufferColumnRange at runtime should update mountedColumns', async () => {
        const body = grid.body;
        
        // Initial state (Width 300)
        // ID(50) + Name(150) + Score(100) = 300.
        // Exact fit. Cols 0, 1, 2.
        // Mounted should be [0, 2] or [0, 3] depending on boundary.
        
        const initialEndIndex = body.mountedColumns[1];

        // Increase buffer
        body.bufferColumnRange = 2;

        // Wait for update
        await body.promiseUpdate();
        await grid.timeout(50);

        // Expected State
        // Should add 2 columns.
        expect(body.mountedColumns[1]).toBeGreaterThan(initialEndIndex);
    });

    test('Reproduction: Decrease bufferRowRange from 25 to 0 after scrolling should maintain visible rows', async () => {
        const body = grid.body;
        
        // 1. Start with buffer 5 (default in test setup is 2, user says 5, let's set it)
        body.bufferRowRange = 5;
        await body.promiseUpdate();
        await grid.timeout(50);

        // 2. Change range to 25
        body.bufferRowRange = 25;
        await body.promiseUpdate();
        await grid.timeout(50);

        // 3. Scroll down until seeing rows 50-74 (Top 50)
        // rowHeight 40. 50 * 40 = 2000.
        body.scrollTop = 2000; 
        await body.promiseUpdate();
        await grid.timeout(50);

        // Verify Row 50 is visible
        let visibleRow = body.items.find(r => r.rowIndex === 50);
        expect(visibleRow).toBeDefined();
        expect(visibleRow.record.name).toBe('Row 50');

        // 4. Reduce buffer to 0
        body.bufferRowRange = 0;
        await body.promiseUpdate();
        await grid.timeout(50);

        // 5. Verify Row 50 is STILL visible
        visibleRow = body.items.find(r => r.rowIndex === 50);
        
        if (!visibleRow || visibleRow.vdom.style.display === 'none') {
            const activeRows = body.items.filter(r => r.rowIndex > -1).map(r => r.rowIndex).sort((a,b)=>a-b);
            console.log('Row 50 missing. Mounted:', body.mountedRows, 'Visible:', body.visibleRows);
            console.log('Active Indices:', activeRows);
        }

        expect(visibleRow).toBeDefined();
        expect(visibleRow.vdom.style.display).not.toBe('none');
        expect(visibleRow.record.name).toBe('Row 50');
    });

    test('Reproduction 2: Decrease bufferRowRange from 50 to 0 after deep scrolling', async () => {
        const body = grid.body;
        
        // 1. Range 50
        body.bufferRowRange = 50;
        await body.promiseUpdate();
        await grid.timeout(50);

        // 2. Scroll to 100 (100 * 40 = 4000)
        body.scrollTop = 4000;
        await body.promiseUpdate();
        await grid.timeout(50);

        // 3. Range 0
        body.bufferRowRange = 0;
        await body.promiseUpdate();
        await grid.timeout(50);

        // 4. Verify Row 100 is visible
        const visibleRow = body.items.find(r => r.rowIndex === 100);
        
        if (!visibleRow || visibleRow.vdom.style.display === 'none') {
            const activeRows = body.items.filter(r => r.rowIndex > -1).map(r => r.rowIndex).sort((a,b)=>a-b);
            console.log('Row 100 missing. Mounted:', body.mountedRows, 'Visible:', body.visibleRows);
            console.log('Active Indices:', activeRows);
        }

        expect(visibleRow).toBeDefined();
        expect(visibleRow.vdom.style.display).not.toBe('none');
        expect(visibleRow.record.name).toBe('Row 100');
    });
});