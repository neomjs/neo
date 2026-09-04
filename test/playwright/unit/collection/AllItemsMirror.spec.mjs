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
    })
});
