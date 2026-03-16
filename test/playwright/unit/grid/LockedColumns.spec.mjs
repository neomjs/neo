/**
 * @file test/playwright/unit/grid/LockedColumns.spec.mjs
 * @summary Unit tests for the High-Performance Locked Columns feature in the Grid architecture.
 *
 * This test suite validates the core mechanics of the **Locked Columns** feature, a crucial part of the
 * Grid's performance-oriented architecture. It ensures that the mathematical layout engine correctly
 * interprets the `locked` configuration (`'start'`, `null`, `'end'`) and seamlessly reorders the
 * structural column definitions, both during instantiation and when updated dynamically at runtime.
 *
 * By leveraging the 'Single-Thread Simulation' architecture for Playwright, these tests bypass visual
 * rendering overhead, allowing us to perform high-speed, deterministic assertions on internal
 * array sorting, getter states (e.g., `hasLockedColumns`), and the integration with the `ScrollManager`.
 *
 * @see Neo.grid.Container
 * @see Neo.grid.column.Base
 * @see Neo.grid.ScrollManager
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
        name             : 'GridLockedColumnsTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

test.describe('Grid Locked Columns', () => {
    let grid, store;

    test.beforeEach(async () => {
        const data = [];
        for (let i = 0; i < 5; i++) {
            data.push({
                id: i,
                col1: `C1-${i}`,
                col2: `C2-${i}`,
                col3: `C3-${i}`,
                col4: `C4-${i}`,
                col5: `C5-${i}`
            });
        }

        store = Neo.create(Store, {
            keyProperty: 'id',
            data,
            model: {
                fields: [
                    {name: 'id',   type: 'Integer'},
                    {name: 'col1', type: 'String'},
                    {name: 'col2', type: 'String'},
                    {name: 'col3', type: 'String'},
                    {name: 'col4', type: 'String'},
                    {name: 'col5', type: 'String'}
                ]
            }
        });

        // Initialize with out-of-order locked states to test the automatic sorting during instantiation
        grid = Neo.create(GridContainer, {
            appName  : 'GridLockedColumnsTest',
            height   : 400,
            width    : 600,
            store    : store,
            rowHeight: 40,
            columns  : [{
                dataField: 'col1',
                text     : 'Col 1 (Unlocked)',
                width    : 100
            }, {
                dataField: 'col2',
                text     : 'Col 2 (End)',
                width    : 100,
                locked   : 'end'
            }, {
                dataField: 'col3',
                text     : 'Col 3 (Start)',
                width    : 100,
                locked   : 'start'
            }, {
                dataField: 'col4',
                text     : 'Col 4 (Start 2)',
                width    : 100,
                locked   : 'start'
            }, {
                dataField: 'col5',
                text     : 'Col 5 (Unlocked)',
                width    : 100
            }]
        });

        await grid.initVnode();
        grid.mounted = true;

        await grid.timeout(50);
    });

    test.afterEach(async () => {
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy();
    });

    test('Initial sortColumns properly orders start -> unlocked -> end', async () => {
        // The expected order of dataFields based on initial locked configurations:
        // start: col3, col4
        // unlocked: col1, col5
        // end: col2
        const expectedOrder = ['col3', 'col4', 'col1', 'col5', 'col2'];

        const actualOrder = grid.columns.items.map(col => col.dataField);

        expect(actualOrder).toEqual(expectedOrder);
    });

    test('hasLockedColumns getter evaluates correctly', async () => {
        expect(grid.hasLockedColumns).toBe(true);
    });

    test('Runtime onColumnLockChange triggers reorder', async () => {
        // Change 'col1' to locked: 'start'.
        // Expected new order: col3, col4, col1 (start), col5 (unlocked), col2 (end)
        const col1 = grid.columns.get('col1');
        
        // This triggers afterSetLocked -> grid.onColumnLockChange
        col1.locked = 'start';
        
        await grid.timeout(50);

        const expectedOrderAfterLock = ['col3', 'col4', 'col1', 'col5', 'col2'];
        const actualOrderAfterLock = grid.columns.items.map(col => col.dataField);
        expect(actualOrderAfterLock).toEqual(expectedOrderAfterLock);

        // Now unlock 'col4'
        // Expected new order: col3, col1 (start), col4, col5 (unlocked), col2 (end)
        const col4 = grid.columns.get('col4');
        col4.locked = null;
        
        await grid.timeout(50);
        
        const expectedOrderAfterUnlock = ['col3', 'col1', 'col4', 'col5', 'col2'];
        const actualOrderAfterUnlock = grid.columns.items.map(col => col.dataField);
        expect(actualOrderAfterUnlock).toEqual(expectedOrderAfterUnlock);
        
        // Change 'col5' to locked: 'end'
        // Original order before this step: col3, col1, col4, col5, col2 (col2 was already 'end')
        // When sorting: unlocked (col4) stays in place. 
        // end (col5, col2): stable sort maintains relative order so col5 then col2.
        const col5 = grid.columns.get('col5');
        col5.locked = 'end';
        
        await grid.timeout(50);
        
        const expectedOrderAfterEnd = ['col3', 'col1', 'col4', 'col5', 'col2'];
        const actualOrderAfterEnd = grid.columns.items.map(col => col.dataField);
        expect(actualOrderAfterEnd).toEqual(expectedOrderAfterEnd);
    });
    
    test('Header Toolbar items are synchronized with column collection order', async () => {
        const headerToolbar = grid.headerToolbar;
        
        const expectedOrder = ['col3', 'col4', 'col1', 'col5', 'col2'];
        const headerOrder = headerToolbar.items.map(item => item.dataField);
        expect(headerOrder).toEqual(expectedOrder);
        
        const col1 = grid.columns.get('col1');
        col1.locked = 'start';
        await grid.timeout(50);
        
        const expectedOrderAfterLock = ['col3', 'col4', 'col1', 'col5', 'col2'];
        const headerOrderAfterLock = headerToolbar.items.map(item => item.dataField);
        expect(headerOrderAfterLock).toEqual(expectedOrderAfterLock);
    });

    test('ScrollManager scroll pinning addon is updated on lock state change', async () => {
        const scrollManager = grid.scrollManager;
        let updateCalled = false;

        // Mock the method to intercept the call
        const originalUpdate = scrollManager.updateColumnScrollPinningAddon.bind(scrollManager);
        scrollManager.updateColumnScrollPinningAddon = (active, windowId) => {
            updateCalled = true;
            return originalUpdate(active, windowId);
        };

        const col1 = grid.columns.get('col1');
        col1.locked = 'start'; // This triggers afterSetLocked -> grid.onColumnLockChange -> scrollManager.update...
        
        await grid.timeout(50);

        expect(updateCalled).toBe(true);
    });

    test('Setting a new columns array at runtime correctly sorts them', async () => {
        // Provide a completely new set of columns, out of order regarding lock state.
        grid.columns = [{
            dataField: 'newCol1',
            text     : 'New Unlocked 1'
        }, {
            dataField: 'newCol2',
            text     : 'New End 1',
            locked   : 'end'
        }, {
            dataField: 'newCol3',
            text     : 'New Start 1',
            locked   : 'start'
        }];

        await grid.timeout(50);

        // Expected sorted order: start -> unlocked -> end
        const expectedOrder = ['newCol3', 'newCol1', 'newCol2'];
        const actualOrder = grid.columns.items.map(col => col.dataField);
        
        expect(actualOrder).toEqual(expectedOrder);
    });
});
