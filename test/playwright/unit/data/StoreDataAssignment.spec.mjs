import {setup} from '../../setup.mjs';

const appName = 'StoreDataAssignmentTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Model           from '../../../../src/data/Model.mjs';
import Store           from '../../../../src/data/Store.mjs';
import TreeModel       from '../../../../src/data/TreeModel.mjs';
import TreeStore       from '../../../../src/data/TreeStore.mjs';

// Once per worker process: unitTestMode refuses a taken namespace
class TestTreeModel extends TreeModel {
    static config = {
        className: 'Test.Unit.Data.StoreDataAssignment.TestTreeModel',
        fields   : [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]
    }
}

const
    treeModel = Neo.setupClass(TestTreeModel),
    model     = {module: Model, fields: [{name: 'id', type: 'String'}, {name: 'v'}]},
    saved     = [{id: 'a', v: 'saved'}, {id: 'b', v: 'new'}];

/**
 * @summary A `data` assignment replaces what the store holds, wherever its records came from
 */
test.describe('Neo.data.Store data assignment replaces the records the store holds', () => {
    let store;

    test.afterEach(() => store?.destroy());

    // A shared key holds the new values, a key missing from `saved` is gone, the count is `saved.length`
    const expectSaved = () => expect({a: store.get('a')?.v, b: store.get('b')?.v, gone: store.get('gone'), count: store.count})
        .toEqual({a: 'saved', b: 'new', gone: null, count: 2});

    test('after add()', async () => {
        store = Neo.create(Store, {model});
        await store.ready();

        store.add([{id: 'a', v: 'file'}, {id: 'gone', v: 'file'}]);
        store.data = saved;

        expectSaved()
    });

    test('after a load', async () => {
        store = Neo.create(Store, {model});
        await store.ready();

        store.pipeline.read = async () => ({data: [{id: 'a', v: 'file'}, {id: 'gone', v: 'file'}]});
        await store.load();
        expect(store.count).toBe(2);

        store.data = saved;

        expectSaved()
    });

    test('while a filter hides every earlier record', async () => {
        store = Neo.create(Store, {model, filters: [{property: 'v', value: 'shown'}]});
        await store.ready();

        store.add([{id: 'a', v: 'file'}, {id: 'gone', v: 'file'}]);
        expect(store.count).toBe(0);

        store.data    = saved;
        store.filters = [];

        expectSaved()
    });

    test('a first assignment on an empty store fires the events it fired before', async () => {
        store = Neo.create(Store, {model});
        await store.ready();

        const events = [];
        store.on({
            load  : ({items}) => events.push(['load', items.length]),
            mutate: ({addedItems, removedItems}) => events.push(['mutate', addedItems?.length ?? 0, removedItems?.length ?? 0])
        });

        store.data = saved;

        // Nothing to clear: no empty mutation precedes the add
        expect(events).toEqual([['load', 2], ['mutate', 2, 0]])
    })
});

test.describe('Neo.data.TreeStore data assignment replaces the nodes the store holds', () => {
    let store;

    test.afterEach(() => store?.destroy());

    const nodes = [
        {id: 'p', name: 'Parent', isLeaf: false, collapsed: true},
        {id: 'hidden', parentId: 'p', name: 'Child'},
        {id: 'kept', name: 'Old'}
    ];

    test('a collapsed parent\'s hidden child is gone', async () => {
        store = Neo.create(TreeStore, {model: treeModel});
        await store.ready();

        store.add(nodes);
        expect(store.count).toBe(2);
        expect(store.get('hidden')).not.toBeNull();

        store.data = [{id: 'kept', name: 'New'}];

        expect({count: store.count, hidden: store.get('hidden'), kept: store.get('kept')?.name}).toEqual({count: 1, hidden: null, kept: 'New'})
    });

    test('a filter that hides every node', async () => {
        store = Neo.create(TreeStore, {model: treeModel});
        await store.ready();

        store.add(nodes);
        store.filters = [{property: 'name', value: 'none'}];
        expect(store.count).toBe(0);

        store.data    = [{id: 'kept', name: 'New'}];
        store.filters = [];

        expect({count: store.count, hidden: store.get('hidden'), parent: store.get('p'), kept: store.get('kept')?.name})
            .toEqual({count: 1, hidden: null, parent: null, kept: 'New'})
    })
});
