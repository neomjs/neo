import {setup} from '../../setup.mjs';

const appName = 'TreeStoreBatchSubtreeAddTest';

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
import TreeStore      from '../../../../src/data/TreeStore.mjs';
import TreeModel      from '../../../../src/data/TreeModel.mjs';

class BatchModel extends TreeModel {
    static config = {
        className: 'Test.Unit.Data.TreeStoreBatchSubtreeAdd.Model',
        fields   : [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]
    }
}

BatchModel = Neo.setupClass(BatchModel);

/**
 * @summary The ids of the visible projection, in order.
 * @param {Neo.data.TreeStore} store
 * @returns {String[]}
 */
const visible = store => Array.from({length: store.count}, (item, index) => store.getAt(index).id);

/**
 * @summary A store whose expanded `unit-1` is already projected, with a child before and a root after the new rows.
 * @returns {Neo.data.TreeStore}
 */
const createStore = () => Neo.create(TreeStore, {appName, model: BatchModel, data: [
    {id: 'unit-1', name: 'Unit 1', isLeaf: false, collapsed: false},
    {id: 'dept-0', name: 'Dept 0', parentId: 'unit-1', isLeaf: true},
    {id: 'unit-2', name: 'Unit 2', isLeaf: false}
]});

test.describe('Neo.data.TreeStore (a subtree added in one batch under a visible parent)', () => {
    test('an expanded node projects the children that follow it in the same add()', () => {
        const store = createStore();

        store.add([
            {id: 'dept-1',   name: 'Dept 1',   parentId: 'unit-1', isLeaf: false, collapsed: false},
            {id: 'person-1', name: 'Person 1', parentId: 'dept-1', isLeaf: true}
        ]);

        expect(visible(store)).toEqual(['unit-1', 'dept-0', 'dept-1', 'person-1', 'unit-2']);
        store.destroy()
    });

    test('three expanded levels in one add() all project, in tree order', () => {
        const store = createStore();

        store.add([
            {id: 'dept-1',   name: 'Dept 1',   parentId: 'unit-1', isLeaf: false, collapsed: false},
            {id: 'team-1',   name: 'Team 1',   parentId: 'dept-1', isLeaf: false, collapsed: false},
            {id: 'person-1', name: 'Person 1', parentId: 'team-1', isLeaf: true},
            {id: 'person-2', name: 'Person 2', parentId: 'dept-1', isLeaf: true}
        ]);

        expect(visible(store)).toEqual(['unit-1', 'dept-0', 'dept-1', 'team-1', 'person-1', 'person-2', 'unit-2']);
        store.destroy()
    });

    test('a collapsed node in the batch keeps its children in the hierarchy, out of the projection', () => {
        const store = createStore();

        store.add([
            {id: 'dept-1',   name: 'Dept 1',   parentId: 'unit-1', isLeaf: false, collapsed: true},
            {id: 'person-1', name: 'Person 1', parentId: 'dept-1', isLeaf: true}
        ]);

        expect(visible(store)).toEqual(['unit-1', 'dept-0', 'dept-1', 'unit-2']);

        store.expand('dept-1');

        expect(visible(store)).toEqual(['unit-1', 'dept-0', 'dept-1', 'person-1', 'unit-2']);
        store.destroy()
    });

    test('control: the same rows loaded through data project the same order', () => {
        const store = Neo.create(TreeStore, {appName, model: BatchModel, data: [
            {id: 'unit-1',   name: 'Unit 1',   isLeaf: false, collapsed: false},
            {id: 'dept-0',   name: 'Dept 0',   parentId: 'unit-1', isLeaf: true},
            {id: 'dept-1',   name: 'Dept 1',   parentId: 'unit-1', isLeaf: false, collapsed: false},
            {id: 'person-1', name: 'Person 1', parentId: 'dept-1', isLeaf: true},
            {id: 'unit-2',   name: 'Unit 2',   isLeaf: false}
        ]});

        expect(visible(store)).toEqual(['unit-1', 'dept-0', 'dept-1', 'person-1', 'unit-2']);
        store.destroy()
    })
});
