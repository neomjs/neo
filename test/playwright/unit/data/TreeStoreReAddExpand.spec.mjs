import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'TreeStoreReAddExpandTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import TreeStore      from '../../../../src/data/TreeStore.mjs';
import TreeModel      from '../../../../src/data/TreeModel.mjs';

class ReAddNode extends TreeModel {
    static config = {
        className: 'Test.Unit.Data.TreeStoreReAddExpand.Node',
        fields   : [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]
    }
}

const NodeModel = Neo.setupClass(ReAddNode);

/**
 * @summary A node re-added as a new object still expands, also while the store sorts.
 *
 * In Turbo Mode (`autoInitRecords: false`) a re-add replaces the node in the Structural Layer, while the visible
 * layer keeps the object it already holds for that key. `get()` then hydrates the visible object, and
 * `hydrateRecord()` must heal the Structural Layer for that key too: a sorted store re-projects its rows from the
 * Structural Layer after every add, so a node left behind there would come back collapsed, without its children.
 */
test.describe('Neo.data.TreeStore: expanding a re-added node', () => {
    let store;

    const data = () => [
        {id: 'a',  name: 'a',  parentId: null},
        {id: 'a1', name: 'a1', parentId: 'a'},
        {id: 'b',  name: 'b',  parentId: null}
    ];

    test.afterEach(() => {
        store?.destroy();
        store = null
    });

    for (const sorters of [[{property: 'name'}], []]) {
        test(`the node expands in place ${sorters.length ? 'while the store sorts' : '(control: no sorters)'}`, async () => {
            store = Neo.create(TreeStore, {autoInitRecords: false, data: data(), model: NodeModel, sorters});

            // The same key again, as a new object
            store.add({id: 'a', name: 'a', parentId: null});

            await store.expand('a');

            expect(store.items.map(node => store.getKey(node))).toEqual(['a', 'a1', 'b'])
        })
    }
});
