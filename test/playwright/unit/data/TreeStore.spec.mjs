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
        expect(leaf2.childCount).toBe(0); // Leaves have 0 children
        
        // Let's verify childCount on parents
        // In the test data for Turbo Mode, root-1 only has ONE child ('child-1-1')
        expect(rootNode.childCount).toBe(1); // 'component'
        expect(childNode.childCount).toBe(2); // 'Base.mjs' and 'Button.mjs'
    });
});

test.describe('Neo.data.TreeStore (childCount and isLeaf decoupling)', () => {
    let store, TestModel;

    test.beforeEach(() => {
        class TestTreeModel3 extends TreeModel {
            static config = {
                className: 'Test.Unit.Data.TreeStore.TestTreeModel3',
                fields: [
                    { name: 'id', type: 'String' },
                    { name: 'name', type: 'String' }
                ]
            }
        }

        TestModel = Neo.setupClass(TestTreeModel3);

        store = Neo.create(TreeStore, {
            model: TestModel,
            autoInitRecords: true, // Let's test with full Records this time
            data : [
                { id: 'root-1', name: 'src', isLeaf: false, collapsed: false },
                { id: 'child-1-1', parentId: 'root-1', name: 'component', isLeaf: false, collapsed: false },
                { id: 'child-1-1-1', parentId: 'child-1-1', name: 'Base.mjs', isLeaf: true }
            ]
        });
    });

    test.afterEach(() => {
        store?.destroy();
    });

    test('childCount should accurately reflect the number of children and decouple from isLeaf', () => {
        let parent = store.get('child-1-1'); // 'component' folder
        
        expect(parent.isLeaf).toBe(false);
        expect(parent.childCount).toBe(1);

        // Add a new child
        store.add({ id: 'child-1-1-2', parentId: 'child-1-1', name: 'Button.mjs', isLeaf: true });
        
        expect(parent.isLeaf).toBe(false); // Still a folder
        expect(parent.childCount).toBe(2); // Count increased

        // Remove both children
        store.remove('child-1-1-1');
        store.remove('child-1-1-2');

        // This is the critical test: it should STILL be a folder (isLeaf: false), but empty
        expect(parent.isLeaf).toBe(false); 
        expect(parent.childCount).toBe(0);
    });
});

test.describe('Neo.data.TreeStore (Hierarchical Sorting)', () => {
    /**
     * @summary Tests the hierarchical sorting logic of Neo.data.TreeStore.
     * 
     * A standard `Store` sorts its flat `_items` array globally. If applied to a TreeStore,
     * this would destroy the parent-child relationships (e.g., sorting alphabetically would
     * mix all parents and children together).
     * 
     * These tests verify that `TreeStore.doSort()` correctly sorts sibling nodes *only within
     * their own parent's scope*, ensuring that the contiguous visual projection (parent
     * followed immediately by its children) remains structurally intact.
     */
    let store, TestModel;

    test.beforeEach(() => {
        class TestTreeModel4 extends TreeModel {
            static config = {
                className: 'Test.Unit.Data.TreeStore.TestTreeModel4',
                fields: [
                    { name: 'id', type: 'String' },
                    { name: 'name', type: 'String' }
                ]
            }
        }

        TestModel = Neo.setupClass(TestTreeModel4);
    });

    test.afterEach(() => {
        store?.destroy();
    });

    test('doSort should hierarchically sort siblings without mixing parents and children', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            data : [
                { id: '1', name: 'Z', isLeaf: false, collapsed: false },
                { id: '1-1', parentId: '1', name: 'B', isLeaf: true },
                { id: '1-2', parentId: '1', name: 'A', isLeaf: true },
                { id: '2', name: 'A', isLeaf: false, collapsed: false },
                { id: '2-1', parentId: '2', name: 'Z', isLeaf: true },
                { id: '2-2', parentId: '2', name: 'Y', isLeaf: true }
            ]
        });

        // Current order: Z, B, A, A, Z, Y
        
        // Sort descending by name
        store.sorters = [{
            property: 'name',
            direction: 'DESC'
        }];

        // Expected sorted roots (DESC): 'Z' (id '1'), 'A' (id '2')
        // Expected sorted children of 'Z' (DESC): 'B' (id '1-1'), 'A' (id '1-2')
        // Expected sorted children of 'A' (DESC): 'Z' (id '2-1'), 'Y' (id '2-2')
        // Flattened view should strictly keep children with their parents.
        
        let items = store.items; // items is the flattened _items array
        expect(items.length).toBe(6);
        expect(items[0].id).toBe('1');   // Z
        expect(items[1].id).toBe('1-1'); // B (child of Z)
        expect(items[2].id).toBe('1-2'); // A (child of Z)
        expect(items[3].id).toBe('2');   // A
        expect(items[4].id).toBe('2-1'); // Z (child of A)
        expect(items[5].id).toBe('2-2'); // Y (child of A)

        // Sort ascending by name
        store.sorters = [{
            property: 'name',
            direction: 'ASC'
        }];
        
        items = store.items;
        expect(items.length).toBe(6);
        // Expected sorted roots (ASC): 'A' (id '2'), 'Z' (id '1')
        // Expected sorted children of 'A' (ASC): 'Y' (id '2-2'), 'Z' (id '2-1')
        // Expected sorted children of 'Z' (ASC): 'A' (id '1-2'), 'B' (id '1-1')
        expect(items[0].id).toBe('2');   // A
        expect(items[1].id).toBe('2-2'); // Y (child of A)
        expect(items[2].id).toBe('2-1'); // Z (child of A)
        expect(items[3].id).toBe('1');   // Z
        expect(items[4].id).toBe('1-2'); // A (child of Z)
        expect(items[5].id).toBe('1-1'); // B (child of Z)
    });

    test('doSort should work correctly in Turbo Mode (autoInitRecords: false)', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            autoInitRecords: false, // Turbo Mode
            data : [
                { id: '2', name: 'B', isLeaf: false, collapsed: false },
                { id: '2-1', parentId: '2', name: 'X', isLeaf: true },
                { id: '2-2', parentId: '2', name: 'A', isLeaf: true },
                { id: '1', name: 'A', isLeaf: false, collapsed: false },
                { id: '1-1', parentId: '1', name: 'Z', isLeaf: true }
            ]
        });

        // Sort ascending by name
        store.sorters = [{
            property: 'name',
            direction: 'ASC'
        }];

        let items = store.items; // items is the flattened _items array
        expect(items.length).toBe(5);
        expect(items[0].isRecord).toBeUndefined(); // Verify we are still in Turbo Mode

        // Roots (ASC): 'A' (id '1'), 'B' (id '2')
        expect(items[0].id).toBe('1');
        expect(items[1].id).toBe('1-1'); // Z
        expect(items[2].id).toBe('2');   // B
        expect(items[3].id).toBe('2-2'); // A (child of B)
        expect(items[4].id).toBe('2-1'); // X (child of B)
    });
});

test.describe('Neo.data.TreeStore (Ancestor-Aware Filtering)', () => {
    /**
     * @summary Tests the hierarchical filtering logic of Neo.data.TreeStore.
     * 
     * Standard collection filtering hides any record that doesn't match the filter criteria.
     * In a TreeStore, this would orphan child nodes if their parents don't match the filter.
     * These tests verify that when a descendant node matches a filter, all of its direct
     * ancestors (up to the root) are forced to remain visible and are automatically expanded
     * to preserve the structural path to the matched node.
     */
    let store, TestModel;

    test.beforeEach(() => {
        class TestTreeModel5 extends TreeModel {
            static config = {
                className: 'Test.Unit.Data.TreeStore.TestTreeModel5',
                fields: [
                    { name: 'id', type: 'String' },
                    { name: 'name', type: 'String' }
                ]
            }
        }

        TestModel = Neo.setupClass(TestTreeModel5);
    });

    test.afterEach(() => {
        store?.destroy();
    });

    test('filter should keep ancestors visible when a child matches', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            data : [
                { id: '1', name: 'Root A', isLeaf: false, collapsed: true },
                { id: '1-1', parentId: '1', name: 'Child A1', isLeaf: false, collapsed: true },
                { id: '1-1-1', parentId: '1-1', name: 'Target Node', isLeaf: true },
                { id: '1-1-2', parentId: '1-1', name: 'Other Node', isLeaf: true },
                { id: '2', name: 'Root B', isLeaf: false, collapsed: true },
                { id: '2-1', parentId: '2', name: 'Child B1', isLeaf: true }
            ]
        });

        // Filter for 'Target Node'
        store.filters = [{
            property: 'name',
            value   : 'Target Node'
        }];

        let items = store.items;

        // Ancestors ('Root A' and 'Child A1') must be forced visible and expanded.
        // 'Target Node' must be visible.
        // 'Other Node' should NOT be visible because neither it nor its parent matched the filter directly.
        
        expect(items.length).toBe(3);
        expect(items[0].id).toBe('1');       // Root A
        expect(items[1].id).toBe('1-1');     // Child A1
        expect(items[2].id).toBe('1-1-1');   // Target Node
        
        expect(store.get('1').collapsed).toBe(false);
        expect(store.get('1-1').collapsed).toBe(false);
    });

    test('filter should work correctly in Turbo Mode (autoInitRecords: false)', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            autoInitRecords: false, // Turbo Mode
            data : [
                { id: '1', name: 'Root X', isLeaf: false, collapsed: true },
                { id: '1-1', parentId: '1', name: 'Hidden Child', isLeaf: true },
                { id: '1-2', parentId: '1', name: 'Deep Parent', isLeaf: false, collapsed: true },
                { id: '1-2-1', parentId: '1-2', name: 'Match Me', isLeaf: true }
            ]
        });

        // Filter for 'Match Me'
        store.filters = [{
            property: 'name',
            value   : 'Match Me'
        }];

        let items = store.items;

        expect(items.length).toBe(3);
        expect(items[0].isRecord).toBeUndefined(); // Still in Turbo Mode
        
        expect(items[0].id).toBe('1');       // Root X
        expect(items[1].id).toBe('1-2');     // Deep Parent
        expect(items[2].id).toBe('1-2-1');   // Match Me
        
        expect(items[0].collapsed).toBe(false);
        expect(items[1].collapsed).toBe(false);
    });
});
