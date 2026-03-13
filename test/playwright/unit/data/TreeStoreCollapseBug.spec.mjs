import {setup} from '../../setup.mjs';

const appName = 'TreeStoreBugTest';

setup({
    neoConfig: {
        unitTestMode: true
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

test.describe('Neo.data.TreeStore Bug Reproduction', () => {
    let store;

    class TestTreeModelBug extends TreeModel {
        static config = {
            className: 'Test.Unit.Data.TreeStore.TestTreeModelBug',
            fields: [
                { name: 'id', type: 'String' },
                { name: 'name', type: 'String' }
            ]
        }
    }

    const TestModel = Neo.setupClass(TestTreeModelBug);

    test.beforeEach(() => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            data : [
                { id: '1', name: 'Root A', isLeaf: false, collapsed: true },
                { id: '1-1', parentId: '1', name: 'Child A1', isLeaf: false, collapsed: true },
                { id: '1-1-1', parentId: '1-1', name: 'Child A1-1', isLeaf: true },
                { id: '2', name: 'Root B', isLeaf: false, collapsed: true },
                { id: '2-1', parentId: '2', name: 'Child B1', isLeaf: true }
            ]
        });
    });

    test.afterEach(() => {
        store?.destroy();
    });

    test('collapse after expandAll should mathematically remove descendants', () => {
        // Initial state
        expect(store.count).toBe(2);
        
        // 1. Expand All
        store.expandAll();
        
        // Ensure all are expanded
        expect(store.count).toBe(5);
        expect(store.get('1').collapsed).toBe(false);
        expect(store.get('1-1').collapsed).toBe(false);
        
        // 2. The Bug Reproduction: Collapse a single folder *after* Expand All
        store.collapse('1-1'); // Collapse Child A1
        
        // Child A1-1 should be removed from the visible projection
        expect(store.count).toBe(4); // 5 - 1
        
        // Now collapse the root node
        store.collapse('1'); // Collapse Root A
        
        // Child A1 should be removed
        expect(store.count).toBe(3); // Root A, Root B, Child B1
    });

    test('collapse after expandAll should mathematically remove descendants (Turbo Mode)', () => {
        let turboStore = Neo.create(TreeStore, {
            model: TestModel,
            autoInitRecords: false,
            data : [
                { id: '1', name: 'Root A', isLeaf: false, collapsed: true },
                { id: '1-1', parentId: '1', name: 'Child A1', isLeaf: false, collapsed: true },
                { id: '1-1-1', parentId: '1-1', name: 'Child A1-1', isLeaf: true },
                { id: '2', name: 'Root B', isLeaf: false, collapsed: true },
                { id: '2-1', parentId: '2', name: 'Child B1', isLeaf: true }
            ]
        });
        
        expect(turboStore.count).toBe(2);
        turboStore.expandAll();
        expect(turboStore.count).toBe(5);
        
        // Collapse Child A1
        turboStore.collapse('1-1'); 
        
        // Count should decrease by 1
        expect(turboStore.count).toBe(4);
        
        turboStore.destroy();
    });
});
