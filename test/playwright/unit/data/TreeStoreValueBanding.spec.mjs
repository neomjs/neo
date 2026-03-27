import {setup} from '../../setup.mjs';

const appName = 'TreeStoreValueBandingTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';
import TreeStore      from '../../../../src/data/TreeStore.mjs';
import TreeModel      from '../../../../src/data/TreeModel.mjs';

test.describe('Neo.data.TreeStore valueBanding', () => {
    let store, TestModel;

    class TestTreeModel extends TreeModel {
        static config = {
            className: 'Test.Unit.Data.TreeStoreValueBanding.TestTreeModel',
            fields: [
                { name: 'id', type: 'String' },
                { name: 'name', type: 'String' },
                { name: 'department', type: 'String' }
            ]
        }
    }

    test.beforeAll(() => {
        TestModel = Neo.setupClass(TestTreeModel);
    });

    test.afterEach(() => {
        store?.destroy();
    });

    test('value bands should update correctly upon expanding/collapsing nodes', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            valueBandingFields: ['department'],
            data : [
                { id: '1', name: 'Root A', department: 'Sales', isLeaf: false, collapsed: true },
                { id: '1-1', parentId: '1', name: 'Child A1', department: 'Sales', isLeaf: true },
                { id: '1-2', parentId: '1', name: 'Child A2', department: 'HR', isLeaf: true },
                { id: '2', name: 'Root B', department: 'HR', isLeaf: false, collapsed: true },
                { id: '2-1', parentId: '2', name: 'Child B1', department: 'HR', isLeaf: true },
                { id: '2-2', parentId: '2', name: 'Child B2', department: 'Sales', isLeaf: true }
            ]
        });

        // Initially only roots are visible: Root A (Sales), Root B (HR)
        expect(store.count).toBe(2);

        let bands1 = store.valueBandsMap.get('1');
        expect(bands1.department).toBe(true); // Sales

        let bands2 = store.valueBandsMap.get('2');
        expect(bands2.department).toBe(false); // HR

        // Expand '1' (Root A)
        store.expand('1');
        // Projection: 
        // 1 (Sales)   -> true
        // 1-1 (Sales) -> true
        // 1-2 (HR)    -> false
        // 2 (HR)      -> false

        expect(store.count).toBe(4);

        bands1 = store.valueBandsMap.get('1');
        expect(bands1.department).toBe(true);

        let bands1_1 = store.valueBandsMap.get('1-1');
        expect(bands1_1.department).toBe(true);

        let bands1_2 = store.valueBandsMap.get('1-2');
        expect(bands1_2.department).toBe(false);

        bands2 = store.valueBandsMap.get('2');
        expect(bands2.department).toBe(false);

        // Expand All
        store.expandAll();
        // Projection:
        // 1 (Sales)   -> true
        // 1-1 (Sales) -> true
        // 1-2 (HR)    -> false
        // 2 (HR)      -> false
        // 2-1 (HR)    -> false
        // 2-2 (Sales) -> true

        expect(store.count).toBe(6);

        bands1 = store.valueBandsMap.get('1');
        expect(bands1.department).toBe(true);

        bands1_1 = store.valueBandsMap.get('1-1');
        expect(bands1_1.department).toBe(true);

        bands1_2 = store.valueBandsMap.get('1-2');
        expect(bands1_2.department).toBe(false);

        bands2 = store.valueBandsMap.get('2');
        expect(bands2.department).toBe(false);

        let bands2_1 = store.valueBandsMap.get('2-1');
        expect(bands2_1.department).toBe(false);

        let bands2_2 = store.valueBandsMap.get('2-2');
        expect(bands2_2.department).toBe(true);

        // Collapse All
        store.collapseAll();
        expect(store.count).toBe(2);
        
        bands1 = store.valueBandsMap.get('1');
        expect(bands1.department).toBe(true);

        bands2 = store.valueBandsMap.get('2');
        expect(bands2.department).toBe(false);
    });

    test('value bands should update correctly upon sort', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            valueBandingFields: ['department'],
            data : [
                { id: '1', name: 'Z', department: 'Sales', isLeaf: false, collapsed: false },
                { id: '1-1', parentId: '1', name: 'Z1', department: 'Sales', isLeaf: true },
                { id: '1-2', parentId: '1', name: 'A1', department: 'HR', isLeaf: true },
                { id: '2', name: 'A', department: 'Sales', isLeaf: false, collapsed: false },
                { id: '2-1', parentId: '2', name: 'A2', department: 'Sales', isLeaf: true }
            ]
        });

        // Current Order:
        // 1: Z (Sales) -> true
        // 1-1: Z1 (Sales) -> true
        // 1-2: A1 (HR) -> false
        // 2: A (Sales) -> true
        // 2-1: A2 (Sales) -> true

        let bands1 = store.valueBandsMap.get('1');
        expect(bands1.department).toBe(true);

        let bands1_1 = store.valueBandsMap.get('1-1');
        expect(bands1_1.department).toBe(true);

        let bands1_2 = store.valueBandsMap.get('1-2');
        expect(bands1_2.department).toBe(false);

        let bands2 = store.valueBandsMap.get('2');
        expect(bands2.department).toBe(true);

        let bands2_1 = store.valueBandsMap.get('2-1');
        expect(bands2_1.department).toBe(true);

        // Sort by name ASC
        store.sorters = [{ property: 'name', direction: 'ASC' }];

        // New Order:
        // 2: A (Sales) -> true
        // 2-1: A2 (Sales) -> true
        // 1: Z (Sales) -> true
        // 1-2: A1 (HR) -> false
        // 1-1: Z1 (Sales) -> true

        bands2 = store.valueBandsMap.get('2');
        expect(bands2.department).toBe(true);

        bands2_1 = store.valueBandsMap.get('2-1');
        expect(bands2_1.department).toBe(true);

        bands1 = store.valueBandsMap.get('1');
        expect(bands1.department).toBe(true);

        bands1_2 = store.valueBandsMap.get('1-2');
        expect(bands1_2.department).toBe(false);

        bands1_1 = store.valueBandsMap.get('1-1');
        expect(bands1_1.department).toBe(true);
    });

    test('value bands should update correctly upon filtering', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            valueBandingFields: ['department'],
            data : [
                { id: '1', name: 'Z', department: 'Sales', isLeaf: false, collapsed: false },
                { id: '1-1', parentId: '1', name: 'B', department: 'HR', isLeaf: true },
                { id: '1-2', parentId: '1', name: 'C', department: 'HR', isLeaf: true },
                { id: '2', name: 'A', department: 'Sales', isLeaf: false, collapsed: false },
                { id: '2-1', parentId: '2', name: 'D', department: 'Sales', isLeaf: true }
            ]
        });

        // Filter for 'C' to ensure only its branch remains
        store.filters = [{
            property: 'name',
            value: 'C'
        }];

        // Projection:
        // 1 (Sales) -> true
        // 1-2 (HR) -> false

        expect(store.count).toBe(2);

        let bands1 = store.valueBandsMap.get('1');
        expect(bands1.department).toBe(true);

        let bands1_2 = store.valueBandsMap.get('1-2');
        expect(bands1_2.department).toBe(false);

        // Clear filters
        store.clearFilters();

        // Projection:
        // 1 (Sales) -> true
        // 1-1 (HR) -> false
        // 1-2 (HR) -> false
        // 2 (Sales) -> true
        // 2-1 (Sales) -> true

        expect(store.count).toBe(5);

        bands1 = store.valueBandsMap.get('1');
        expect(bands1.department).toBe(true);

        let bands1_1 = store.valueBandsMap.get('1-1');
        expect(bands1_1.department).toBe(false);

        bands1_2 = store.valueBandsMap.get('1-2');
        expect(bands1_2.department).toBe(false);

        let bands2 = store.valueBandsMap.get('2');
        expect(bands2.department).toBe(true);

        let bands2_1 = store.valueBandsMap.get('2-1');
        expect(bands2_1.department).toBe(true);
    });
});
