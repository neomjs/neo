import {setup} from '../../setup.mjs';

const appName = 'TreeStoreTest';

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

test.describe('Neo.data.TreeStore (Splice Mechanics)', () => {
    let store;

    class TestTreeModel extends TreeModel {
        static config = {
            className: 'Test.Unit.Data.TreeStore.TestTreeModel',
            fields: [
                { name: 'id', type: 'String' },
                { name: 'name', type: 'String' }
            ]
        }
    }

    const TestModel = Neo.setupClass(TestTreeModel);

    test.beforeEach(() => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            data : [
                { id: 'root-1', name: 'src', isLeaf: false, collapsed: false },
                { id: 'child-1-1', parentId: 'root-1', name: 'component', isLeaf: false, collapsed: true },
                { id: 'child-1-1-1', parentId: 'child-1-1', name: 'Base.mjs', isLeaf: true },
                { id: 'child-1-1-2', parentId: 'child-1-1', name: 'Button.mjs', isLeaf: true },
                { id: 'child-1-2', parentId: 'root-1', name: 'grid', isLeaf: false, collapsed: false },
                { id: 'child-1-2-1', parentId: 'child-1-2', name: 'Container.mjs', isLeaf: true },
                { id: 'child-1-2-2', parentId: 'child-1-2', name: 'Row.mjs', isLeaf: true },
                { id: 'root-2', name: 'package.json', isLeaf: true },
                { id: 'root-3', name: 'README.md', isLeaf: true }
            ]
        });
    });

    test.afterEach(() => {
        store?.destroy();
    });

    test('should only remove visible descendants on collapse, not siblings', () => {
        // Initial state check
        expect(store.count).toBe(7);
        expect(store.getAt(0).name).toBe('src');
        expect(store.getAt(1).name).toBe('component');
        expect(store.getAt(2).name).toBe('grid');
        expect(store.getAt(3).name).toBe('Container.mjs');
        expect(store.getAt(4).name).toBe('Row.mjs');
        expect(store.getAt(5).name).toBe('package.json');
        expect(store.getAt(6).name).toBe('README.md');

        // Expand 'component'
        store.expand('child-1-1');
        
        expect(store.count).toBe(9);
        expect(store.getAt(1).name).toBe('component');
        expect(store.getAt(2).name).toBe('Base.mjs');
        expect(store.getAt(3).name).toBe('Button.mjs');
        expect(store.getAt(7).name).toBe('package.json');

        // Collapse 'component'
        store.collapse('child-1-1');

        // Count should go back to 7. package.json and README.md should still exist!
        expect(store.count).toBe(7);
        expect(store.getAt(1).name).toBe('component');
        expect(store.getAt(2).name).toBe('grid'); // Base.mjs is gone
        expect(store.getAt(3).name).toBe('Container.mjs');
        expect(store.getAt(4).name).toBe('Row.mjs');
        expect(store.getAt(5).name).toBe('package.json');
        expect(store.getAt(6).name).toBe('README.md');
    });

    test('singleExpand mode should collapse siblings when a node is expanded', () => {
        store.singleExpand = true;
        
        // Initial state: 'grid' is expanded (2 children), 'component' is collapsed.
        // Total count = 7.
        
        // Expand component -> Base.mjs and Button.mjs become visible.
        // Because of singleExpand, its sibling 'grid' will collapse -> Container.mjs and Row.mjs are hidden.
        store.expand('child-1-1');
        expect(store.get('child-1-1').collapsed).toBe(false);
        expect(store.get('child-1-2').collapsed).toBe(true);
        expect(store.count).toBe(7); // 7 + 2 - 2 = 7

        // Base.mjs and Button.mjs should be present, Container.mjs and Row.mjs should be gone
        expect(store.getAt(1).name).toBe('component');
        expect(store.getAt(2).name).toBe('Base.mjs');
        expect(store.getAt(3).name).toBe('Button.mjs');
        expect(store.getAt(4).name).toBe('grid');
        expect(store.getAt(5).name).toBe('package.json');
        
        // Now expand grid again.
        // It should expand grid AND collapse component.
        store.expand('child-1-2');
        
        expect(store.get('child-1-2').collapsed).toBe(false);
        expect(store.get('child-1-1').collapsed).toBe(true);
        
        // Base.mjs and Button.mjs should be gone, Container.mjs and Row.mjs should be present
        expect(store.count).toBe(7);
        expect(store.getAt(1).name).toBe('component');
        expect(store.getAt(2).name).toBe('grid');
        expect(store.getAt(3).name).toBe('Container.mjs');
        expect(store.getAt(4).name).toBe('Row.mjs');
        expect(store.getAt(5).name).toBe('package.json');
    });

    test('#childrenMap and #allRecordsMap caching logic', () => {
        // We can't access private fields directly, but we can verify O(1) retrieval
        // by checking that nodes are instantly retrievable even when collapsed.
        
        let hiddenNode = store.get('child-1-1-1'); // Base.mjs
        expect(hiddenNode).toBeDefined();
        expect(hiddenNode.name).toBe('Base.mjs');
        
        // Verify sibling stats are correctly cached inside the hidden nodes
        expect(hiddenNode.siblingCount).toBe(2);
        expect(hiddenNode.siblingIndex).toBe(1);
        
        let visibleNode = store.get('root-1');
        expect(visibleNode.siblingCount).toBe(3);
        expect(visibleNode.siblingIndex).toBe(1);
    });
});

test.describe('Neo.data.TreeStore (Turbo Mode / Soft Hydration)', () => {
    let store, TestModel;

    test.beforeEach(() => {
        class TestTreeModel2 extends TreeModel {
            static config = {
                className: 'Test.Unit.Data.TreeStore.TestTreeModel2',
                fields: [
                    { name: 'id', type: 'String' },
                    { name: 'name', type: 'String' }
                ]
            }
        }

        TestModel = Neo.setupClass(TestTreeModel2);

        store = Neo.create(TreeStore, {
            model: TestModel,
            autoInitRecords: false, // Turbo Mode!
            data : [
                { id: 'root-1', name: 'src', collapsed: false },
                { id: 'child-1-1', parentId: 'root-1', name: 'component', collapsed: true },
                { id: 'child-1-1-1', parentId: 'child-1-1', name: 'Base.mjs' },
                { id: 'child-1-1-2', parentId: 'child-1-1', name: 'Button.mjs' }
            ]
        });
    });

    test.afterEach(() => {
        store?.destroy();
    });

    test('siblingCount and siblingIndex are correctly resolved for raw data objects', () => {
        // In Turbo Mode, _items contains raw data objects, not Records.
        let rootNode = store._items[0];
        
        // Ensure it's a raw object
        expect(rootNode.isRecord).toBeUndefined();
        
        // Check that TreeStore.splice() mutated the raw object to include ARIA stats
        expect(rootNode.siblingCount).toBe(1);
        expect(rootNode.siblingIndex).toBe(1);
        expect(rootNode.depth).toBe(0);
        expect(rootNode.isLeaf).toBe(false);
        
        // The children map should contain raw objects, also with mutated stats
        let childNode = store.get('child-1-1'); // Wait, store.get() HYDRATES it!
        expect(childNode.isRecord).toBe(true);
        expect(childNode.siblingCount).toBe(1);
        expect(childNode.siblingIndex).toBe(1);
        expect(childNode.depth).toBe(1);
        expect(childNode.isLeaf).toBe(false);

        // However, we can check a hidden raw object via another way if needed,
        // but getting it will hydrate it. Since store.get() hydrates it, the values
        // must be transferred.
        let leaf1 = store.get('child-1-1-1');
        expect(leaf1.siblingCount).toBe(2);
        expect(leaf1.siblingIndex).toBe(1);
        expect(leaf1.depth).toBe(2);
        expect(leaf1.isLeaf).toBe(true);
        
        let leaf2 = store.get('child-1-1-2');
        expect(leaf2.siblingCount).toBe(2);
        expect(leaf2.siblingIndex).toBe(2);
        expect(leaf2.depth).toBe(2);
        expect(leaf2.isLeaf).toBe(true);
    });
});