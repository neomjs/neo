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

    test('adding a child to an expanded visible parent should immediately show the new child', () => {
        store.expand('child-1-1');
        expect(store.count).toBe(9);

        // Add a new child to 'component' (child-1-1)
        store.add({ id: 'child-1-1-3', parentId: 'child-1-1', name: 'NewFile.mjs', isLeaf: true });

        // The parent 'child-1-1' is expanded, so the new child should be instantly visible
        expect(store.count).toBe(10);

        // Find the new file in the flat view
        expect(store.items.find(i => i.name === 'NewFile.mjs')).toBeDefined();
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

        // Critical Fix check: the Store's _items array MUST contain the Hydrated record
        // and indexOf must find it.
        expect(store.indexOf(childNode)).toBe(1);
        expect(store._items[1]).toBe(childNode);

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

    test('siblingCount and siblingIndex should reflect the sorted order', () => {
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

        // Initial check
        let rootZ = store.get('1');
        expect(rootZ.siblingIndex).toBe(1);
        expect(rootZ.siblingCount).toBe(2);

        let rootA = store.get('2');
        expect(rootA.siblingIndex).toBe(2);
        expect(rootA.siblingCount).toBe(2);

        let child1_B = store.get('1-1');
        expect(child1_B.siblingIndex).toBe(1);
        expect(child1_B.siblingCount).toBe(2);

        let child1_A = store.get('1-2');
        expect(child1_A.siblingIndex).toBe(2);
        expect(child1_A.siblingCount).toBe(2);

        // Sort descending by name
        store.sorters = [{
            property: 'name',
            direction: 'DESC'
        }];

        // Expected sorted roots (DESC): 'Z' (id '1'), 'A' (id '2')
        // Expected sorted children of 'Z' (DESC): 'B' (id '1-1'), 'A' (id '1-2')
        // Expected sorted children of 'A' (DESC): 'Z' (id '2-1'), 'Y' (id '2-2')

        expect(rootZ.siblingIndex).toBe(1); // Z is still 1
        expect(rootA.siblingIndex).toBe(2); // A is still 2

        expect(child1_B.siblingIndex).toBe(1);
        expect(child1_A.siblingIndex).toBe(2);

        let child2_Z = store.get('2-1');
        let child2_Y = store.get('2-2');

        expect(child2_Z.siblingIndex).toBe(1);
        expect(child2_Y.siblingIndex).toBe(2);

        // Sort ascending by name
        store.sorters = [{
            property: 'name',
            direction: 'ASC'
        }];

        // Expected sorted roots (ASC): 'A' (id '2'), 'Z' (id '1')
        // Expected sorted children of 'Z' (ASC): 'A' (id '1-2'), 'B' (id '1-1')

        expect(rootA.siblingIndex).toBe(1);
        expect(rootZ.siblingIndex).toBe(2);

        expect(child1_A.siblingIndex).toBe(1);
        expect(child1_B.siblingIndex).toBe(2);

        expect(child2_Y.siblingIndex).toBe(1);
        expect(child2_Z.siblingIndex).toBe(2);
    });

    test('adding a node to a sorted TreeStore should place it in the correct sorted position', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            data : [
                { id: '1', name: 'Folder', isLeaf: false, collapsed: false },
                { id: '1-1', parentId: '1', name: 'A', isLeaf: true },
                { id: '1-3', parentId: '1', name: 'Z', isLeaf: true }
            ]
        });

        // Sort ascending by name
        store.sorters = [{
            property: 'name',
            direction: 'ASC'
        }];

        // Current order: Folder, A, Z
        expect(store.items[1].name).toBe('A');
        expect(store.items[2].name).toBe('Z');

        // Add a node that should sort between A and Z
        store.add({ id: '1-2', parentId: '1', name: 'M', isLeaf: true });

        // Verify sorted order: Folder, A, M, Z
        expect(store.items[1].name).toBe('A');
        expect(store.items[2].name).toBe('M');
        expect(store.items[3].name).toBe('Z');
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

    test('siblingCount and siblingIndex should reflect only visible siblings when filtered', () => {
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

        // Check pre-filter stats
        expect(store.get('1-1-1').siblingCount).toBe(2);
        expect(store.get('1-1-2').siblingCount).toBe(2);

        expect(store.get('1').siblingCount).toBe(2);
        expect(store.get('2').siblingCount).toBe(2);

        // Filter for 'Target Node'
        store.filters = [{
            property: 'name',
            value   : 'Target Node'
        }];

        // Only Root A -> Child A1 -> Target Node are visible

        let rootA = store.get('1');
        let childA1 = store.get('1-1');
        let targetNode = store.get('1-1-1');

        // Root A is now the only visible root sibling (Root B is hidden)
        expect(rootA.siblingCount).toBe(1);
        expect(rootA.siblingIndex).toBe(1);

        // Child A1 is the only visible child of Root A
        expect(childA1.siblingCount).toBe(1);
        expect(childA1.siblingIndex).toBe(1);

        // Target Node is the only visible child of Child A1
        expect(targetNode.siblingCount).toBe(1);
        expect(targetNode.siblingIndex).toBe(1);

        // Verify childCount on parents is correctly updated to reflect only visible children
        expect(rootA.childCount).toBe(1); // Only Child A1 is visible
        expect(childA1.childCount).toBe(1); // Only Target Node is visible

        // Let's clear the filter and ensure stats are restored
        store.filters = [];

        expect(store.get('1-1-1').siblingCount).toBe(2);
        expect(store.get('1-1-1').siblingIndex).toBe(1);
        expect(store.get('1-1-2').siblingCount).toBe(2);
        expect(store.get('1-1-2').siblingIndex).toBe(2);

        expect(store.get('1').siblingCount).toBe(2);
        expect(store.get('1').siblingIndex).toBe(1);
        expect(store.get('2').siblingCount).toBe(2);
        expect(store.get('2').siblingIndex).toBe(2);

        // Verify childCount is restored to structural counts
        expect(store.get('1').childCount).toBe(1); // Child A1
        expect(store.get('1-1').childCount).toBe(2); // Target Node and Other Node
    });

    test('adding a node to a filtered TreeStore should evaluate the filter and update projection', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            data : [
                { id: '1', name: 'Root A', isLeaf: false, collapsed: true },
                { id: '1-1', parentId: '1', name: 'Child A', isLeaf: true }
            ]
        });

        store.filters = [{ property: 'name', value: 'Target', operator: 'like' }];
        expect(store.count).toBe(0);

        // Add a node that matches the filter
        store.add({ id: '1-2', parentId: '1', name: 'Target Node', isLeaf: true });

        // Adding this node should force its parent ('Root A') to become visible
        expect(store.count).toBe(2);
        expect(store.items[0].name).toBe('Root A');
        expect(store.items[1].name).toBe('Target Node');
    });
});

test.describe('Neo.data.TreeStore (Clear override)', () => {
    let store, TestModel;

    class TestTreeModel6 extends TreeModel {
        static config = {
            className: 'Test.Unit.Data.TreeStore.TestTreeModel6',
            fields: [
                { name: 'id', type: 'String' },
                { name: 'name', type: 'String' }
            ]
        }
    }

    TestModel = Neo.setupClass(TestTreeModel6);

    test.afterEach(() => {
        store?.destroy();
    });

    test('clear() should wipe both visible items and internal structural maps', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            data : [
                { id: '1', name: 'Root A', isLeaf: false, collapsed: false },
                { id: '1-1', parentId: '1', name: 'Child A1', isLeaf: true }
            ]
        });

        // Ensure initially populated
        expect(store.count).toBe(2); // _items array length

        // We can test maps indirectly via get() which uses #allRecordsMap and #childrenMap internally
        // to return the item or expand nodes. But we'll test the actual properties via private access
        // fallback in test environment or just verify their size if possible.
        // Let's use stringification or direct map checks if available, or just verify get() fails.
        // Actually, we can check the size of the maps by peeking or checking side-effects.
        expect(store.get('1')).toBeDefined();

        // Let's check size via stringification or some reflection if possible.
        // Since they are private (#allRecordsMap), we cannot access them directly via dot notation.
        // However, we can assert that get() completely fails even for hidden items after clear().

        store.clear();

        // 1. The visible array must be empty
        expect(store.count).toBe(0);
        expect(store.items.length).toBe(0);

        // 2. The structural maps must be empty. If they weren't, `get()` would still find them
        // because get() falls back to #allRecordsMap.
        expect(store.get('1')).toBeNull();
        expect(store.get('1-1')).toBeNull();
    });
});

test.describe('Neo.data.TreeStore (clearFilters override)', () => {
    let store, TestModel;

    class TestTreeModel7 extends TreeModel {
        static config = {
            className: 'Test.Unit.Data.TreeStore.TestTreeModel7',
            fields: [
                { name: 'id', type: 'String' },
                { name: 'name', type: 'String' }
            ]
        }
    }

    TestModel = Neo.setupClass(TestTreeModel7);

    test.afterEach(() => {
        store?.destroy();
    });

    test('clearFilters() should completely restore the visible projection from structural maps', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            data : [
                { id: '1', name: 'Root A', isLeaf: false, collapsed: true },
                { id: '1-1', parentId: '1', name: 'Child A1', isLeaf: true },
                { id: '2', name: 'Root B', isLeaf: false, collapsed: false },
                { id: '2-1', parentId: '2', name: 'Child B1', isLeaf: true }
            ]
        });

        // Verify initial state
        expect(store.count).toBe(3); // Root A, Root B, Child B1

        // Apply a filter that matches only Root A
        store.filters = [{
            property: 'name',
            value   : 'Root A'
        }];

        // Only Root A should be visible
        expect(store.count).toBe(1);
        expect(store.items[0].id).toBe('1');

        // Ensure _keptNodes mask is active
        expect(store._keptNodes).toBeDefined();
        expect(store._keptNodes.has('1')).toBe(true);
        expect(store._keptNodes.has('2')).toBe(false);

        // Call clearFilters()
        store.clearFilters();

        // 1. The mask should be gone
        expect(store._keptNodes).toBeNull();

        // 2. The filters array should be empty
        expect(store.filters.length).toBe(0);

        // 3. The isFiltered flag should be false
        expect(store[Symbol.for('isFiltered')]).toBe(false);

        // 4. The projection should be fully restored to its pre-filtered state
        expect(store.count).toBe(3);
        expect(store.items[0].id).toBe('1');
        expect(store.items[1].id).toBe('2');
        expect(store.items[2].id).toBe('2-1');
    });
});

test.describe('Neo.data.TreeStore (Bulk Operations)', () => {
    let store, TestModel;

    class TestTreeModel8 extends TreeModel {
        static config = {
            className: 'Test.Unit.Data.TreeStore.TestTreeModel8',
            fields: [
                { name: 'id', type: 'String' },
                { name: 'name', type: 'String' }
            ]
        }
    }

    TestModel = Neo.setupClass(TestTreeModel8);

    test.afterEach(() => {
        store?.destroy();
    });

    test('expandAll() should expand every node in the tree', () => {
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

        // Initially only roots are visible
        expect(store.count).toBe(2);

        let loadFired = false;
        store.on('load', () => loadFired = true);

        store.expandAll();

        // All nodes should be visible
        expect(store.count).toBe(5);
        expect(store.items[0].id).toBe('1');
        expect(store.items[1].id).toBe('1-1');
        expect(store.items[2].id).toBe('1-1-1');
        expect(store.items[3].id).toBe('2');
        expect(store.items[4].id).toBe('2-1');

        expect(store.get('1').collapsed).toBe(false);
        expect(store.get('1-1').collapsed).toBe(false);
        expect(store.get('2').collapsed).toBe(false);

        expect(loadFired).toBe(true);
    });

    test('collapseAll() should collapse every node in the tree, leaving only roots visible', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            data : [
                { id: '1', name: 'Root A', isLeaf: false, collapsed: false },
                { id: '1-1', parentId: '1', name: 'Child A1', isLeaf: false, collapsed: false },
                { id: '1-1-1', parentId: '1-1', name: 'Child A1-1', isLeaf: true },
                { id: '2', name: 'Root B', isLeaf: false, collapsed: false },
                { id: '2-1', parentId: '2', name: 'Child B1', isLeaf: true }
            ]
        });

        // Initially all nodes are visible
        expect(store.count).toBe(5);

        let loadFired = false;
        store.on('load', () => loadFired = true);

        store.collapseAll();

        // Only roots should be visible
        expect(store.count).toBe(2);
        expect(store.items[0].id).toBe('1');
        expect(store.items[1].id).toBe('2');

        expect(store.get('1').collapsed).toBe(true);
        expect(store.get('1-1').collapsed).toBe(true);
        expect(store.get('2').collapsed).toBe(true);

        expect(loadFired).toBe(true);
    });

    test('expandAll() should work correctly in Turbo Mode (autoInitRecords: false)', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            autoInitRecords: false,
            data : [
                { id: '1', name: 'Root A', isLeaf: false, collapsed: true },
                { id: '1-1', parentId: '1', name: 'Child A1', isLeaf: true }
            ]
        });

        expect(store.count).toBe(1);

        store.expandAll();

        expect(store.count).toBe(2);
        expect(store.items[0].isRecord).toBeUndefined(); // Still in Turbo Mode
        expect(store.items[0].collapsed).toBe(false);
    });

    test('expandAll() + get() via internalId hydration updates _items and map so indexOf works', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            autoInitRecords: false,
            data : [
                { id: '1', name: 'Root A', isLeaf: false, collapsed: true },
                { id: '1-1', parentId: '1', name: 'Child A1', isLeaf: true }
            ]
        });

        store.expandAll();

        // mimic the grid using internalId from the DOM to get the record
        const rawObj = store._items[1];
        const internalId = store.getInternalKey(rawObj);

        // This is exactly what RowModel does: store.get(internalId)
        const record = store.get(internalId);

        expect(record).not.toBeNull();
        expect(record.isRecord).toBe(true);
        expect(store._items[1]).toBe(record);
        expect(store.indexOf(record)).toBe(1);
    });
});

test.describe('Neo.data.TreeStore (updateKey override)', () => {
    let store, TestModel;

    class TestTreeModel9 extends TreeModel {
        static config = {
            className: 'Test.Unit.Data.TreeStore.TestTreeModel9',
            fields: [
                { name: 'id', type: 'String' },
                { name: 'name', type: 'String' }
            ]
        }
    }

    TestModel = Neo.setupClass(TestTreeModel9);

    test.afterEach(() => {
        store?.destroy();
    });

    test('updateKey() should update #allRecordsMap and #childrenMap hierarchies dynamically', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            data : [
                { id: '1', name: 'Root A', isLeaf: false, collapsed: false },
                { id: '1-1', parentId: '1', name: 'Child A1', isLeaf: false, collapsed: false },
                { id: '1-1-1', parentId: '1-1', name: 'Child A1-1', isLeaf: true },
                { id: '1-1-2', parentId: '1-1', name: 'Child A1-2', isLeaf: true }
            ]
        });

        // Validate initial state
        expect(store.get('1-1')).toBeDefined();
        expect(store.get('1-1-1').parentId).toBe('1-1');

        let itemToUpdate = store.get('1-1');
        
        // Perform the key update
        store.updateKey(itemToUpdate, 'new-id');

        // Validate item itself updated
        expect(store.getKey(itemToUpdate)).toBe('new-id');
        expect(itemToUpdate.id).toBe('new-id'); // Assuming keyProperty map applies

        // Validate base maps fallback resolving correctly
        expect(store.get('1-1')).toBeNull();
        expect(store.get('new-id')).toBe(itemToUpdate);
        
        // Validate children have correct new parentId
        let child1 = store.get('1-1-1');
        let child2 = store.get('1-1-2');

        expect(child1.parentId).toBe('new-id');
        expect(child2.parentId).toBe('new-id');
    });

    test('updateKey() should work for nodes inside un-initialized #allRecordsMap correctly (Turbo Mode)', () => {
        store = Neo.create(TreeStore, {
            model: TestModel,
            autoInitRecords: false, // Turbo Mode
            data : [
                { id: '1', name: 'Root X', isLeaf: false, collapsed: true },
                { id: '1-1', parentId: '1', name: 'Child X1', isLeaf: true }
            ]
        });

        let itemToUpdate = store._items[0]; // Raw Root X object
        expect(itemToUpdate.isRecord).toBeUndefined(); // Still in Turbo Mode

        store.updateKey(itemToUpdate, 'new-root-x');

        expect(store.getKey(itemToUpdate)).toBe('new-root-x');
        
        // Child X1 is hidden because root is collapsed.
        // Getting it will hydrate it via allRecordsMap.
        let hydratedChild = store.get('1-1');
        
        expect(hydratedChild.parentId).toBe('new-root-x');
    });
});
