import {setup} from '../../setup.mjs';

const appName = 'CollectionAllItemsMirrorTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Collection      from '../../../../src/collection/Base.mjs';
import Model           from '../../../../src/data/Model.mjs';
import Store           from '../../../../src/data/Store.mjs';
import TreeStore       from '../../../../src/data/TreeStore.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';

/**
 * @summary The unfiltered projection (`allItems`) is part of the mutation, never a subscriber
 * racing the other subscribers for it.
 *
 * Two facets, measured on a live consumer before they were understood in source:
 * 1. `splice` / `endUpdate` used to fire `mutate` and let the projection catch up as ONE of the
 *    listeners — registered after the store's own, which fires `load` synchronously. A filter
 *    toggled inside that `load` rebuilt the view from an `allItems` the batch had not reached:
 *    every row being added vanished, and `add` answered nulls.
 * 2. The projection received the rows as they were at splice time. A listener that hydrated a row
 *    first (a mounted list rendering inside `load`) left the projection with a stale raw reference
 *    of a resident the store already held as a record — two representations of one row, and a
 *    filter on a calculated field saw `undefined` on the projected one.
 *
 * The mirror now runs inside the mutation, before `mutate` fires. These arms are the contract:
 * every listener sees the projection holding the batch, and a hydration inside a listener lands
 * in both collections. The filters are assigned AFTER construction, the consumer's own shape —
 * the projection is created by the first filter pass, not by the config.
 */
test.describe('Neo.collection.Base — allItems mirrors inside the mutation', () => {
    const
        rows    = () => [
            {id: 'a', state: 'ok'},
            {id: 'b', state: 'idle'},
            {id: 'c', state: 'idle'},
            {id: 'd', state: 'off'}
        ],
        tierModel = () => ({
            module: Model,
            fields: [
                {name: 'id',    type: 'String'},
                {name: 'state', type: 'String'},
                {name: 'tier',  calculate: data => data.state === 'idle' ? 1 : 0}
            ]
        }),
        created = [];

    test.afterEach(() => {
        created.splice(0).forEach(instance => instance.destroy())
    });

    test('a filter enabled inside a mutate listener keeps the rows the same mutation added', () => {
        const collection = Neo.create(Collection, {
            keyProperty: 'id',
            items      : [{id: 'seed', state: 'ok'}]
        });

        created.push(collection);

        // the consumer's shape — and the store's: a `mutate` listener registered BEFORE the
        // projection subscribes (the store registers its own `load`-firing listener at construct,
        // the projection only on the first filter pass), flipping the filter on inside the mutation
        collection.on('mutate', () => {
            collection.getFilter('state').disabled = false
        });

        collection.filters = [{disabled: true, property: 'state', filterBy: ({item}) => item.state === 'idle'}];

        // the projection exists once a filter pass ran, and holds the seed
        expect(collection.allItems.count).toBe(1);

        const added = collection.add(rows());

        expect(added.map(item => item.id)).toEqual(['a', 'b', 'c', 'd']);
        // the projection held the batch BEFORE the listener re-filtered from it
        expect(collection.allItems.count).toBe(5);
        expect(collection.allItems.map.has('a')).toBe(true);
        // the view kept every row the filter does not target — nothing was lost to the toggle
        expect(collection.items.map(item => item.id)).toEqual(['seed', 'a', 'd']);
        expect(collection.count).toBe(3)
    });

    test('a store filter on a calculated field, enabled inside `load`, folds the batch it was added with', () => {
        const store = Neo.create(Store, {
            keyProperty: 'id',
            model      : tierModel(),
            data       : [{id: 'seed', state: 'ok'}]
        });

        created.push(store);

        store.filters = [{disabled: true, property: 'tier', filterBy: ({item}) => item.tier === 1}];

        // the store's own `load` fires synchronously inside the mutation — the consumer's fold
        store.on('load', () => {
            store.count >= 3 && (store.getFilter('tier').disabled = false)
        });

        const added = store.add(rows());

        // `add` resolves the VISIBLE instance per key: the rows the fold now hides answer null
        // (the contract for a filtered row), the visible ones answer their record — none was
        // dropped by the toggle, the projection holds every one
        expect(added.map(item => item?.isRecord ? item.id : null)).toEqual(['a', null, null, 'd']);
        // the whole batch lives in the projection, the folded view keeps the non-idle rows
        expect(store.allItems.count).toBe(5);
        expect(store.allItems.get('b').isRecord).toBe(true);
        expect(store.items.map(item => item.id)).toEqual(['seed', 'a', 'd']);
        expect(store.count).toBe(3)
    });

    test('a record hydrated inside `load` is the same instance in the store and its projection', () => {
        const store = Neo.create(Store, {
            keyProperty: 'id',
            model      : tierModel(),
            data       : [{id: 'seed', state: 'ok'}]
        });

        created.push(store);

        store.filters = [{disabled: true, property: 'tier', filterBy: ({item}) => item.tier === 1}];

        // a mounted list rendering inside `load` hydrates rows before anything else runs; the
        // toggle then re-filters the view from the projection
        store.on('load', () => {
            if (store.count >= 3) {
                store.get('b');
                store.getFilter('tier').disabled = false
            }
        });

        store.add(rows());

        for (const id of ['a', 'b', 'c', 'd']) {
            const record = store.allItems.get(id);

            expect(record?.isRecord, `${id} is a record in the projection`).toBe(true);
            expect(store.get(id) ?? store.allItems.get(id), `${id} resolves to one instance`).toBe(record)
        }

        // the calculated field is readable through the projection — the filter saw records
        expect(store.allItems.get('b').tier).toBe(1);
        expect(store.items.map(item => item.id)).toEqual(['seed', 'a', 'd'])
    });

    // The mirror is per splice, not per event: a batch — ordinary or silent — reaches the projection
    // while the batch is still open, and the projection ends with the primary's row set.
    for (const silent of [false, true]) {
        test(`a${silent ? ' silent' : 'n ordinary'} batch — startUpdate(${silent}) … endUpdate(${silent}) — lands in the projection with the primary`, () => {
            const collection = Neo.create(Collection, {
                keyProperty: 'id',
                items      : [{id: 'seed', state: 'ok'}]
            });

            created.push(collection);

            collection.filters = [{disabled: true, property: 'state', filterBy: ({item}) => item.state === 'idle'}];

            collection.startUpdate(silent);
            collection.add({id: 'batched', state: 'ok'});

            // inside the open batch: the primary holds the row, and so does the projection
            expect(collection.map.has('batched')).toBe(true);
            expect(collection.allItems.get('batched')?.id).toBe('batched');

            collection.endUpdate(silent);

            expect(collection.items.map(item => item.id)).toEqual(['seed', 'batched']);
            expect(collection.allItems.items.map(item => item.id)).toEqual(['seed', 'batched'])
        })
    }

    test('the projection fires nothing of its own — the primary\'s `mutate` is the one event', () => {
        const collection = Neo.create(Collection, {
            keyProperty: 'id',
            items      : [{id: 'seed', state: 'ok'}]
        });

        created.push(collection);

        collection.filters = [{disabled: true, property: 'state', filterBy: ({item}) => item.state === 'idle'}];

        const events = {primary: 0, projection: 0};

        collection.on('mutate', () => events.primary++);
        collection.allItems.on('mutate', () => events.projection++);

        collection.add(rows());

        expect(events).toEqual({primary: 1, projection: 0});
        expect(collection.allItems.count).toBe(5);
        // the projection is not a derived collection either: no source, no subscription
        expect(collection.allItems.sourceId).toBeNull()
    });

    test('a `sourceId` collection keeps receiving its source\'s mutations — that contract is untouched', () => {
        const source = Neo.create(Collection, {
            keyProperty: 'id',
            items      : [{id: 'seed', state: 'ok'}]
        });

        const derived = Neo.create(Collection, {
            keyProperty: 'id',
            sourceId   : source.id
        });

        created.push(source, derived);

        source.filters = [{disabled: true, property: 'state', filterBy: ({item}) => item.state === 'idle'}];

        source.add(rows());

        expect(['a', 'b', 'c', 'd'].map(id => derived.map.has(id))).toEqual([true, true, true, true]);
        expect(source.allItems.count).toBe(5)
    });

    // A tree store's projection write is event-free on EVERY exit of `TreeStore#splice`: the
    // visible-delta exit reaches the Collection's `splice`; the two exits that do not — a node added
    // under a collapsed parent (no visible delta) and a store with an active filter — fire their own
    // `mutate`, and honor `silent` there too. The same exit without `silent` keeps its one event.
    const treeRows = () => [
        {id: 'file',      text: 'File',  isLeaf: false, collapsed: true},
        {id: 'file-open', text: 'Open',  isLeaf: true,  parentId: 'file'},
        {id: 'about',     text: 'About', isLeaf: true}
    ];

    for (const [label, filters, row] of [
        ['a node under a collapsed parent — the hidden-node exit', null, {id: 'file-save', text: 'Save', isLeaf: true, parentId: 'file'}],
        ['a store with an active filter — the filtered exit', [{property: 'id', operator: 'like', value: 'o'}], {id: 'help', text: 'Help', isLeaf: true}]
    ]) {
        test(`a tree store's silent splice fires nothing: ${label}`, () => {
            const store = Neo.create(TreeStore, {data: treeRows()});

            created.push(store);

            // assigned after construction, the consumer's shape: the filter pass runs on the
            // populated tree and the store takes its filtered exit from here on
            filters && (store.filters = filters);

            let events = 0;

            store.on('mutate', () => events++);

            store.splice(null, [], [row], true);
            expect(events).toBe(0);

            store.splice(null, [], [{...row, id: row.id + '-2'}]);
            expect(events).toBe(1)
        })
    }
});
