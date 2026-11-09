import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'StoreRecordSortTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Model           from '../../../../src/data/Model.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Store           from '../../../../src/data/Store.mjs';
import TreeModel       from '../../../../src/data/TreeModel.mjs';
import TreeStore       from '../../../../src/data/TreeStore.mjs';

/**
 * @summary Record edits preserve explicitly requested local ordering and its consumer notifications.
 */
test.describe('Store sorting after record edits', () => {
    let owned;

    test.beforeEach(() => owned = []);
    test.afterEach(() => owned.reverse().forEach(store => store.destroy()));

    const create = async (config={}, module=Store) => {
        const store = Neo.create(module, {
            model: {module: module === TreeStore ? TreeModel : Model, fields: [
                {name: 'id', type: 'Int'}, {name: 'score', type: 'Int'}, {name: 'name', type: 'String'},
                ...(module === TreeStore ? [{name: 'parentId', type: 'Int', nullable: true}] : []),
                {name: 'active', type: 'Boolean'},
                {name: 'double', type: 'Int', calculate: data => data.score * 2},
                {name: 'keyRank', type: 'Int', calculate: data => data.id * 2},
                {name: 'virtualScore', virtual: true, calculate: data => data.score * 3},
                {name: 'details', fields: [{name: 'rank', type: 'Int'}]}
            ]},
            data: [
                {id: 1, score: 1, name: 'a', active: true, details: {rank: 1}},
                {id: 2, score: 2, name: 'b', active: true, details: {rank: 2}},
                {id: 3, score: 3, name: 'c', active: false, details: {rank: 3}}
            ],
            sorters: [{property: 'score', reapplyOnRecordChange: true}],
            ...config
        });
        owned.push(store);
        await store.ready();
        return store
    };
    const ids = store => store.items.map(record => record.id);

    for (const autoInitRecords of [true, false]) {
        test(`a batched edit publishes one settled sort before recordChange (eager=${autoInitRecords})`, async () => {
            const store = await create({autoInitRecords}), record = store.get(1), events = [];
            store.on({
                load        : data => events.push(['load', data.isSort, ...ids(store)]),
                sort        : data => events.push(['sort', ...data.previousItems.map(item => item.id)]),
                recordChange: data => events.push(['record', data.index, ...ids(store)])
            });
            record.set({score: 4, name: 'updated'});
            expect(events).toEqual([
                ['load', true, 2, 3, 1], ['sort', 1, 2, 3], ['record', 2, 2, 3, 1]
            ]);
            expect(store.get(1)).toBe(record);
            expect(store.internalIdMap.size).toBe(3)
        });

        test(`filtered edits keep membership and order coherent (eager=${autoInitRecords})`, async () => {
            const store = await create({autoInitRecords});
            store.filters = [{property: 'active', value: true, reapplyOnRecordChange: true}];
            const hidden = store.allItems.get(3), changes = [], events = [];
            store.on({
                filter      : () => events.push('filter'), sort: () => events.push('sort'),
                recordChange: data => changes.push([data.index, ...ids(store)])
            });
            hidden.set({active: true, score: 0});
            expect(ids(store)).toEqual([3, 1, 2]);
            expect(changes).toEqual([[0, 3, 1, 2]]);
            expect(events).toEqual(['filter']);
            store.get(1).set({active: false, score: 5});
            expect(ids(store)).toEqual([3, 2]);
            store.clearFilters();
            expect(ids(store)).toEqual([3, 2, 1])
        });
    }

    test('default sorters, autoSort false, and unrelated fields preserve edit stability', async () => {
        for (const config of [{sorters: [{property: 'score'}]}, {autoSort: false}]) {
            const store = await create(config);
            let   sorts = 0;
            store.on('sort', () => sorts++);
            store.get(1).score = 4;
            expect(ids(store)).toEqual([1, 2, 3]);
            expect(sorts).toBe(0)
        }
        const store = await create();
        let   sorts = 0;
        store.on('sort', () => sorts++);
        store.get(1).name = 'z';
        expect(sorts).toBe(0);
        store.sorters[0].reapplyOnRecordChange = false;
        store.get(1).score = 4;
        expect(ids(store)).toEqual([1, 2, 3])
    });

    test('all sort rules participate when an opted-in secondary field changes', async () => {
        const store = await create({sorters: [{property: 'active', direction: 'DESC'},
            {property: 'score', direction: 'DESC', reapplyOnRecordChange: true}]});
        store.get(1).score = 4;
        expect(ids(store)).toEqual([1, 2, 3])
    });

    for (const property of ['double', 'virtualScore', 'details.rank']) {
        test(`observes ${property} values`, async () => {
            const store = await create({sorters: [{property, reapplyOnRecordChange: true}]});
            store.get(1).set(property === 'details.rank' ? {details: {rank: 4}} : {score: 4});
            expect(ids(store)).toEqual([2, 3, 1])
        });
    }

    test('custom comparators reapply for an edit outside their nominal property', async () => {
        const store = await create({sorters: [{property: 'id', reapplyOnRecordChange: true,
            sortBy: (a, b) => a.score - b.score}]});
        store.get(1).score = 4;
        expect(ids(store)).toEqual([2, 3, 1])
    });

    test('ordinary filters keep their current membership while visible records re-sort', async () => {
        const store = await create();
        store.filters = [{property: 'active', value: true}];
        store.get(1).score = 4;
        expect(ids(store)).toEqual([2, 1]);
        store.allItems.get(3).score = 0;
        expect(ids(store)).toEqual([2, 1]);
        store.clearFilters();
        expect(ids(store)).toEqual([3, 2, 1])
    });

    test('remote, paged, loading and streaming projections do not sort on edits', async () => {
        for (const key of ['remoteSort', 'remoteFilter', 'pageSize', 'isLoading', 'isStreaming']) {
            const store = await create();
            store[key] = key === 'pageSize' ? 10 : true;
            let sorts = 0;
            store.on('sort', () => sorts++);
            store.get(1).score = 4;
            expect(sorts, key).toBe(0);
            expect(ids(store), key).toEqual([1, 2, 3])
        }
    });

    test('removed and replaced records cannot re-sort the current population', async () => {
        const store = await create(), removed = store.get(1), replaced = store.get(2);
        store.remove(removed);
        store.data = [{id: 2, score: 20}, {id: 3, score: 30}];
        let sorts = 0;
        store.on('sort', () => sorts++);
        removed.score = 50;
        replaced.score = 60;
        expect(sorts).toBe(0);
        expect(ids(store)).toEqual([2, 3])
    });

    test('key updates settle maps before sort and record notifications', async () => {
        const store = await create({sorters: [{property: 'id', reapplyOnRecordChange: true}]}), record = store.get(1), events = [];
        store.on({
            sort        : () => events.push(['sort', store.get(4) === record, store.get(1)]),
            recordChange: data => events.push(['record', data.index, store.get(4) === record]),
            updateKey   : () => events.push(['key', ...ids(store)])
        });
        store.updateKey(record, 4);
        expect(events).toEqual([['sort', true, null], ['record', 2, true], ['key', 2, 3, 4]])
    });

    test('key transactions also observe calculated sort fields', async () => {
        const store = await create({sorters: [{property: 'keyRank', reapplyOnRecordChange: true}]}), record = store.get(1);
        store.updateKey(record, 4);
        expect(ids(store)).toEqual([2, 3, 4]);
        expect(store.get(4)).toBe(record)
    });

    test('TreeStore sorts sibling sets, including a retained collapsed child', async () => {
        const store = await create({data: [{id: 1, score: 1, isLeaf: false, collapsed: true},
            {id: 2, parentId: 1, score: 2}, {id: 3, parentId: 1, score: 3}, {id: 4, score: 4}]}, TreeStore);
        store.get(2).score = 5;
        expect(store.getChildren(1).map(record => record.id)).toEqual([3, 2]);
        expect(ids(store)).toEqual([1, 4]);
        store.get(1).score = 6;
        expect(ids(store)).toEqual([4, 1]);
        expect(store.getChildren(1).map(record => record.siblingIndex)).toEqual([1, 2])
    });

    test('tree key transactions finish structural maps before publishing the sorted projection', async () => {
        const store = await create({data: [{id: 1, score: 1, isLeaf: false, collapsed: false},
            {id: 2, parentId: 1, score: 2}, {id: 3, score: 3}],
            sorters: [{property: 'id', reapplyOnRecordChange: true}]}, TreeStore);
        const root = store.get(1), events = [];
        store.on('recordChange', ({record, fields, index}) => {
            if (record === root && fields.some(field => field.name === 'id')) {
                events.push([index, store.get(4) === root, store.get(1), store.get(2).parentId,
                    ...store.getChildren(4).map(record => record.id)])
            }
        });
        expect(store.updateKey(root, 4)).toBe(true);
        expect(events).toEqual([[1, true, null, 4, 2]]);
        expect(ids(store)).toEqual([3, 4, 2]);
        expect(store.updateKey(root, 4)).toBe(false)
    });

    test('tree comparator edits do not recursively sort their derived sibling statistics', async () => {
        const store = await create({data: [{id: 1, score: 1}, {id: 2, score: 2}],
            sorters: [{sortBy: (a, b) => a.score - b.score, reapplyOnRecordChange: true}]}, TreeStore);
        let sorts = 0;
        store.on('sort', () => sorts++);
        store.get(1).score = 3;
        expect(ids(store)).toEqual([2, 1]);
        expect(sorts).toBe(1);
        expect(store.get(1).siblingIndex).toBe(2)
    });

    test('filtered trees keep their retained hierarchy when an edited sibling moves', async () => {
        const store = await create({data: [
            {id: 1, score: 10, active: true, isLeaf: false, collapsed: false},
            {id: 2, parentId: 1, score: 2, active: true}, {id: 3, parentId: 1, score: 3, active: true},
            {id: 4, score: 20, active: false}
        ]}, TreeStore);
        store.filters = [{property: 'active', value: true, reapplyOnRecordChange: true}];
        const record = store.get(2), indices = [];
        store.on('recordChange', data => {
            if (data.record === record && data.fields.some(field => field.name === 'score')) indices.push(data.index)
        });
        record.score = 4;
        expect(ids(store)).toEqual([1, 3, 2]);
        expect(indices).toEqual([2]);
        expect(store.get(4).id).toBe(4)
    });
});
