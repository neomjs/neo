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
    let store, TestModel;

    test.beforeEach(() => {
        class TestTreeModel extends TreeModel {
            static config = {
                className: 'Test.Unit.Data.TreeStore.TestTreeModel',
                fields: [
                    { name: 'id', type: 'String' },
                    { name: 'name', type: 'String' }
                ]
            }
        }

        TestModel = Neo.setupClass(TestTreeModel);

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
        let names = store.items.map(i => i.name);
        console.log('Initial items in store:', names);
        
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
});