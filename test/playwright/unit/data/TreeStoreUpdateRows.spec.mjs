/**
 * @file test/playwright/unit/data/TreeStoreUpdateRows.spec.mjs
 * @summary `Neo.data.Store#updateRows()` on a `Neo.data.TreeStore`: the batch finds every row the Structural Layer
 * holds, a row under a collapsed parent included, reapplies opted-in sorters and filters by the fields it wrote, and a
 * subclass's `writeRows()` names the derived rows it rewrote in the one `rowsChange`.
 *
 * Raw rows are read from `store._items`, a collapsed parent's after expanding it: `get()`, `getAt()` and
 * `getChildren()` create the record.
 *
 * @see Neo.data.Store#updateRows
 * @see Neo.data.Store#getRow
 * @see Neo.data.TreeStore#getRow
 * @see https://github.com/neomjs/neo/issues/20985
 */
import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'TreeStoreUpdateRowsTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Model          from '../../../../src/data/Model.mjs';
import RecordFactory  from '../../../../src/data/RecordFactory.mjs';
import Store          from '../../../../src/data/Store.mjs';
import TreeModel      from '../../../../src/data/TreeModel.mjs';
import TreeStore      from '../../../../src/data/TreeStore.mjs';

/**
 * @summary A tree whose parents hold their children's score sum: its `writeRows()` follows each row's score into its
 * parent and appends the parent to the batch.
 */
class ScoreTreeStore extends TreeStore {
    static config = {
        className: 'Test.Unit.Data.TreeStoreUpdateRows.ScoreTreeStore'
    }

    writeRows(rows) {
        const deltas = new Map();

        // read before the write: what each row's new score adds to its parent's
        rows.forEach(({item, values}) => {
            if (Object.hasOwn(values, 'score') && item.parentId) {
                deltas.set(item.parentId, (deltas.get(item.parentId) || 0) + values.score - item.score)
            }
        });

        const errors = super.writeRows(rows);

        deltas.forEach((delta, key) => {
            const item = this.getRow(key);

            item.score += delta;
            rows.push({item, key, values: {score: item.score}})
        });

        return errors
    }
}

const ScoreStore = Neo.setupClass(ScoreTreeStore);

/**
 * @summary A tree batch writes every row the store holds and reapplies what reads the fields it wrote.
 */
test.describe('Store#updateRows on a TreeStore (#20985)', () => {
    let owned;

    test.beforeEach(() => owned = []);
    test.afterEach(() => owned.reverse().forEach(store => store.destroy()));

    const create = async (config={}, module=TreeStore) => {
        const store = Neo.create(module, {
            autoInitRecords: false,
            model: {module: module === Store ? Model : TreeModel, fields: [
                {name: 'id', type: 'String'},
                {name: 'name', type: 'String'},
                {name: 'score', type: 'Integer'},
                {name: 'active', type: 'Boolean'}
            ]},
            data: [
                {id: 'p', name: 'Parent', score: 3, active: true, isLeaf: false, collapsed: true},
                {id: 'c1', parentId: 'p', name: 'Child 1', score: 1, active: true},
                {id: 'c2', parentId: 'p', name: 'Child 2', score: 2, active: true},
                {id: 'a', name: 'A', score: 1, active: true},
                {id: 'b', name: 'B', score: 2, active: true}
            ],
            ...config
        });
        owned.push(store);
        await store.ready();
        return store
    };

    const ids       = store => store.items.map(item => item.id),
          hydrated  = items => items.filter(item => RecordFactory.isRecord(item)).length,
          rawRow    = (store, id) => store._items.find(item => item.id === id),
          recording = store => {
              const events = [];
              store.on({
                  filter      : () => events.push(['filter']),
                  recordChange: data => events.push(['record', data.record.id, data.isBatch]),
                  rowsChange  : data => events.push(['rows', ...data.keys]),
                  sort        : () => events.push(['sort'])
              });
              return events
          };

    test('a Turbo Mode batch writes a row under a collapsed parent, and the row stays raw', async () => {
        const store  = await create(),
              events = recording(store);

        expect(ids(store), 'the parent is collapsed').toEqual(['p', 'a', 'b']);

        const result = store.updateRows([{key: 'c1', values: {name: 'Child 1, edited'}}]);

        expect(result, 'the store holds the row').toEqual({errors: [], missing: []});
        expect(events, 'one event for the batch').toEqual([['rows', 'c1']]);
        expect(hydrated(store._items), 'no visible row became a record').toBe(0);

        await store.expand('p');

        const child = rawRow(store, 'c1');

        expect(RecordFactory.isRecord(child), 'the written row is still raw').toBe(false);
        expect(child.name).toBe('Child 1, edited')
    });

    test('an opted-in sorter reapplies after a tree batch that wrote its field, and no row is hydrated', async () => {
        const store  = await create({sorters: [{property: 'score', reapplyOnRecordChange: true}]}),
              events = recording(store);

        expect(ids(store)).toEqual(['a', 'b', 'p']);

        store.updateRows([{key: 'a', values: {score: 4}}]);

        expect(ids(store), 'the visible row moved').toEqual(['b', 'p', 'a']);
        expect(events, 'one sort, then the batch event').toEqual([['sort'], ['rows', 'a']]);

        store.updateRows([{key: 'c1', values: {score: 5}}]);

        expect(events.slice(2), 'a row under the collapsed parent sorts its level').toEqual([['sort'], ['rows', 'c1']]);
        expect(hydrated(store._items), 'neither batch nor its sort hydrated a row').toBe(0);

        await store.expand('p');

        expect(ids(store), 'the level shows its new order').toEqual(['b', 'p', 'c2', 'c1', 'a']);
        expect([rawRow(store, 'c1'), rawRow(store, 'c2')].map(item => RecordFactory.isRecord(item))).toEqual([false, false])
    });

    test('a writeRows() override that rewrites a derived row names it in the one rowsChange', async () => {
        const store  = await create({}, ScoreStore),
              events = [];

        store.on('rowsChange', data => events.push(data));

        const result = store.updateRows([{key: 'c1', values: {score: 5}}]);

        expect(result).toEqual({errors: [], missing: []});
        expect(events.length, 'one event for the batch').toBe(1);
        expect(events[0].keys, 'the row, then the parent the override rewrote').toEqual(['c1', 'p']);
        expect(events[0].fields).toContain('score');

        const parent = rawRow(store, 'p');

        expect([RecordFactory.isRecord(parent), parent.score], 'the parent holds the new sum, raw').toEqual([false, 7])
    });

    for (const module of [Store, TreeStore]) {
        test(`an opted-in property filter reapplies only for a batch that wrote its property, a filterBy filter for any (${module.name})`, async () => {
            const store = await create({data: [
                {id: 'a', name: 'A', score: 1, active: true},
                {id: 'b', name: 'B', score: 2, active: false},
                {id: 'c', name: 'C', score: 3, active: true}
            ]}, module);

            store.filters = [{property: 'active', value: true, reapplyOnRecordChange: true}];

            const events = recording(store);

            expect(ids(store)).toEqual(['a', 'c']);

            store.updateRows([{key: 'a', values: {score: 10}}]);

            expect(events, 'the filter reads no field the batch wrote').toEqual([['rows', 'a']]);

            store.updateRows([{key: 'b', values: {active: true}}]);

            expect(events.slice(1), 'the batch wrote the property the filter reads').toEqual([['filter'], ['rows', 'b']]);
            expect(ids(store)).toEqual(['a', 'b', 'c']);

            // a callback reads its declared fields, or any field without them
            store.filters = [{filterBy: ({item}) => item.score > 5, fields: ['score'], reapplyOnRecordChange: true}];
            events.length = 0;

            store.updateRows([{key: 'b', values: {name: 'B, renamed'}}]);
            store.updateRows([{key: 'b', values: {score: 20}}]);

            expect(events, 'declared fields: only the score write').toEqual([['rows', 'b'], ['filter'], ['rows', 'b']]);
            expect(ids(store)).toEqual(['c']);

            store.filters = [{filterBy: ({item}) => item.score > 5, reapplyOnRecordChange: true}];
            events.length = 0;

            store.updateRows([{key: 'c', values: {name: 'C, renamed'}}]);

            expect(events, 'no declared fields: a callback may read any field').toEqual([['filter'], ['rows', 'c']]);
            expect(hydrated(store.allItems?._items || store._items), 'reapplying hydrated nothing').toBe(0)
        });

        test(`a filter that declares a parent field reapplies after a batch writes a field below it (${module.name})`, async () => {
            const store = await create({
                      model: {module: module === Store ? Model : TreeModel, fields: [
                          {name: 'id', type: 'String'},
                          {name: 'profile', fields: [{name: 'city', type: 'String'}, {name: 'name', type: 'String'}]},
                          {name: 'score', type: 'Integer'}
                      ]},
                      data: [
                          {id: 'a', profile: {city: 'Berlin', name: 'hide'}, score: 1},
                          {id: 'b', profile: {city: 'Paris',  name: 'show'}, score: 2}
                      ]
                  }, module),
                  // a filterBy callback answers true for a row it filters out
                  hide  = ({item}) => item.profile.name !== 'show';

            store.filters = [{filterBy: hide, fields: ['profile'], reapplyOnRecordChange: true}];

            const events = recording(store);

            expect(ids(store)).toEqual(['b']);

            store.updateRows([{key: 'a', values: {score: 5}}]);

            expect(events, 'a field outside the declared one').toEqual([['rows', 'a']]);

            store.updateRows([{key: 'a', values: {'profile.name': 'show'}}]);

            expect(events.slice(1), 'a field below the declared one').toEqual([['filter'], ['rows', 'a']]);
            expect(ids(store)).toEqual(['a', 'b']);

            store.filters = [{filterBy: hide, fields: ['profile.city'], reapplyOnRecordChange: true}];
            events.length = 0;

            store.updateRows([{key: 'a', values: {'profile.name': 'hide'}}]);

            expect(events, 'a sibling of the declared field').toEqual([['rows', 'a']]);

            store.filters = [{filterBy: hide, fields: ['profile.name'], reapplyOnRecordChange: true}];
            events.length = 0;

            store.updateRows([{key: 'b', values: {'profile.name': 'hide'}}]);

            expect(events, 'the declared field itself').toEqual([['filter'], ['rows', 'b']]);
            expect(ids(store)).toEqual([]);
            expect(hydrated(store.allItems?._items || store._items), 'reapplying hydrated nothing').toBe(0)
        })
    }

    test('a tree batch to a row the filters hide reapplies an opted-in filter that reads the written field', async () => {
        const store = await create({data: [
            {id: 'p', name: 'Parent', active: false, isLeaf: false, collapsed: true},
            {id: 'c1', parentId: 'p', name: 'Child 1', active: false},
            {id: 'a', name: 'A', active: true}
        ]});

        store.filters = [{property: 'active', value: true, reapplyOnRecordChange: true}];

        const events = recording(store);

        expect(ids(store)).toEqual(['a']);

        const result = store.updateRows([{key: 'c1', values: {active: true}}]);

        expect(result.missing, 'the store holds the hidden row').toEqual([]);
        expect(events, 'one filter pass, then the batch event').toEqual([['filter'], ['rows', 'c1']]);
        expect(ids(store), 'the row matches now and shows under its parent').toEqual(['p', 'c1', 'a']);
        expect(hydrated(store._items), 'reapplying hydrated nothing').toBe(0)
    });

    test('a batch to a re-added visible row writes the row get() hydrates', async () => {
        const store = await create();

        // the projection keeps its own object for a re-added visible node until hydration heals both layers
        store.add({id: 'a', name: 'A, re-added', score: 1, active: true}, false);
        store.updateRows([{key: 'a', values: {name: 'A, batched'}}]);

        expect(store.get('a').name).toBe('A, batched');
        expect(store.getChildren().find(record => record.id === 'a').name).toBe('A, batched')
    })
});
