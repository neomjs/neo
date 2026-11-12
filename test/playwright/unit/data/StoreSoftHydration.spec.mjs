/**
 * @file test/playwright/unit/data/StoreSoftHydration.spec.mjs
 * @summary Pins Soft Hydration against the record of the same row: in Turbo Mode, `Neo.data.Store#resolveField()`
 * answers what the row's record holds, a second read answers what the first did, and a record created after any
 * read holds what an unread row's record holds. A row of another shape derives and hydrates by the model
 * `modelOf()` answers for it.
 *
 * Raw rows are read from `store._items`: `get()` and `getAt()` create the record.
 *
 * @see Neo.data.Store#modelOf
 * @see Neo.data.Store#resolveField
 * @see Neo.data.RecordFactory#deriveRecordData
 */
import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'StoreSoftHydrationTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';
import TreeModel      from '../../../../src/data/TreeModel.mjs';
import TreeStore      from '../../../../src/data/TreeStore.mjs';

/**
 * A store whose rows marked `total` are of another shape: their fields hold computed totals, not data.
 * @class Test.Unit.Data.StoreSoftHydration.ShapeStore
 * @extends Neo.data.Store
 */
class ShapeStore extends Store {
    static config = {
        className: 'Test.Unit.Data.StoreSoftHydration.ShapeStore'
    }

    /**
     * @member {Neo.data.Model|null} shape=null The model of the marked rows
     */
    shape = null

    /**
     * @param {Object|null} item
     * @returns {Neo.data.Model}
     */
    modelOf(item) {
        return item?.total ? this.shape : super.modelOf(item)
    }
}

/**
 * The same shape in a tree, whose maps hydration heals.
 * @class Test.Unit.Data.StoreSoftHydration.ShapeTreeStore
 * @extends Neo.data.TreeStore
 */
class ShapeTreeStore extends TreeStore {
    static config = {
        className: 'Test.Unit.Data.StoreSoftHydration.ShapeTreeStore'
    }

    /**
     * @member {Neo.data.Model|null} shape=null The model of the marked rows
     */
    shape = null

    /**
     * @param {Object|null} item
     * @returns {Neo.data.Model}
     */
    modelOf(item) {
        return item?.total ? this.shape : super.modelOf(item)
    }
}

Neo.setupClass(ShapeStore);
Neo.setupClass(ShapeTreeStore);

const
    // a parser: it cannot run on its own output
    toUsers = pairs => pairs.map(([login, avatarUrl]) => ({login, avatarUrl})),
    rowsOf  = (count, make) => Array.from({length: count}, (_, i) => ({id: i + 1, ...make(i + 1)}));

test.describe('Neo.data.Store Soft Hydration and the record of the same row', () => {
    let owned;

    test.beforeEach(() => owned = []);
    test.afterEach(() => owned.reverse().forEach(instance => instance.destroy()));

    /**
     * @param {Object[]} fields
     * @param {Object[]} rows
     * @returns {Promise<Neo.data.Store>}
     */
    const makeStore = async (fields, rows) => {
        const store = Neo.create(Store, {
            autoInitRecords: false,
            model          : {module: Model, fields: [{name: 'id', type: 'Integer'}, ...fields]},
            data           : rows
        });

        owned.push(store);
        await store.ready();

        return store
    };

    const recordCount = store => store._items.filter(item => item.isRecord).length;

    test('a convert over a datum under its own name: every read answers the same, the record converts once', async () => {
        const store = await makeStore([{name: 'ms', convert: v => v * 1000}], rowsOf(60, i => ({ms: i}))),
              raw   = store._items[51];

        expect(store.resolveField(raw, 'ms')).toBe(52000);
        expect(store.resolveField(raw, 'ms')).toBe(52000);
        expect(store.get(52).ms).toBe(52000);
        expect(store.get(53).ms).toBe(53000)
    });

    test('a mapped parser: the record of a read row parses the mapped datum, not the kept value', async () => {
        const store = await makeStore([{name: 'organizations', mapping: 'o', convert: toUsers}],
                                      rowsOf(60, () => ({o: [['neomjs', 'avatar.png']]}))),
              users = [{login: 'neomjs', avatarUrl: 'avatar.png'}];

        expect(store.resolveField(store._items[51], 'organizations')).toEqual(users);
        expect(store.resolveField(store._items[51], 'organizations')).toEqual(users);
        expect(store.get(52).organizations).toEqual(users);
        expect(store.get(53).organizations).toEqual(users)
    });

    test('sorting, then filtering, by a mapped parser creates no record and leaves later records right', async () => {
        const store = await makeStore([{name: 'organizations', mapping: 'o', convert: toUsers}],
                                      rowsOf(60, i => ({o: [[`user${String(61 - i).padStart(2, '0')}`, 'a.png']]}))),
              login = item => item.organizations[0].login;

        store.sorters = [{property: 'organizations', sortBy: (a, b) => login(a).localeCompare(login(b))}];
        // a filterBy answers true for an item it filters out
        store.filters = [{property: 'organizations', filterBy: ({item}) => !login(item).startsWith('user0')}];

        expect(recordCount(store)).toBe(0);
        expect(store.getCount()).toBe(9);
        expect(store.getAt(0).organizations).toEqual([{login: 'user01', avatarUrl: 'a.png'}]);
        expect(store.getAt(8).organizations).toEqual([{login: 'user09', avatarUrl: 'a.png'}])
    });

    test('a convert for a missing datum: the raw read answers what the record holds', async () => {
        const store = await makeStore([{name: 'seq', convert: v => (v ?? 0) + 1}], rowsOf(60, () => ({})));

        expect(store.resolveField(store._items[51], 'seq')).toBe(store.get(53).seq);
        expect(store.get(52).seq).toBe(store.get(53).seq)
    });

    test('a default passes through convert, as in the record', async () => {
        const store = await makeStore([{name: 'd', defaultValue: 2, convert: v => v * 10}], rowsOf(60, () => ({})));

        expect(store.resolveField(store._items[51], 'd')).toBe(20);
        expect(store.get(53).d).toBe(20)
    });

    test('an [index] mapping reads as in the record', async () => {
        const store = await makeStore([{name: 'first', mapping: 'list[0]'}], rowsOf(60, i => ({list: [`a${i}`, 'b']})));

        expect(store.resolveField(store._items[51], 'first')).toBe('a52');
        expect(store.get(53).first).toBe('a53')
    });

    test('a typed field: the raw read answers the parsed type', async () => {
        const store = await makeStore([{name: 'n', type: 'Integer'}, {name: 'c', convert: v => v}],
                                      rowsOf(60, () => ({n: '7'})));

        expect(store.resolveField(store._items[51], 'n')).toBe(7);
        expect(store.get(52).n).toBe(7);
        expect(store.get(53).n).toBe(7)
    });

    test('a field mapped to another typed field reads that field\'s own datum, not its kept value', async () => {
        const store = await makeStore([{name: 'amount', type: 'Integer'}, {name: 'code', mapping: 'amount'}],
                                      rowsOf(60, i => ({amount: String(i).padStart(3, '0')}))),
              raw   = store._items[6];

        expect(store.resolveField(raw, 'amount')).toBe(7);
        expect(store.resolveField(raw, 'code')).toBe('007');
        expect(store.get(7).code).toBe('007');
        expect(store.get(7).amount).toBe(7)
    });

    test('a mapping onto a field the datum lacks reads that field\'s default, as the record does', async () => {
        const store = await makeStore(
                [{name: 'amount', defaultValue: 'D'}, {name: 'code', mapping: 'amount'}],
                rowsOf(60, () => ({}))
              ),
              raw   = store._items[51];

        expect(store.resolveField(raw, 'code')).toBe('D');
        expect(Object.hasOwn(raw, 'amount')).toBe(false);
        expect([store.get(52).amount, store.get(52).code]).toEqual(['D', 'D'])
    });

    test('an explicit write after Soft Hydration survives hydration: same row, spread copy, new key', async () => {
        const store = await makeStore([{name: 'qty', mapping: 'q', type: 'Integer'}],
                                      rowsOf(3, i => ({q: `0${i}`})));

        store.sorters = [{property: 'qty', direction: 'DESC'}];
        expect(recordCount(store)).toBe(0);

        const raw = store._items.find(item => item.id === 2);

        expect(raw.qty).toBe(2);

        store.add({...raw, id: 71, qty: '31'}, false);
        expect(store.get(71).qty).toBe(31);

        raw.qty = '41';
        expect(store.get(2).qty).toBe(41);

        // the untouched rows keep the double-conversion repair
        expect(store.get(1).qty).toBe(1);
        expect(store.get(3).qty).toBe(3)
    });

    test('a spread copy with an explicit value replaces the store\'s data and keeps that value', async () => {
        const store = await makeStore([{name: 'qty', mapping: 'q', type: 'Integer'}], [{id: 70, q: '07'}]);

        store.sorters = [{property: 'qty', direction: 'ASC'}];

        const raw = store._items[0];

        expect(raw.qty).toBe(7);
        store.data = [{...raw, qty: '31'}];
        expect(store.get(70).qty).toBe(31)
    });

    test('a record passed in answers its own value', async () => {
        const store = await makeStore([{name: 'ms', convert: v => v * 1000}, {name: 'geo', mapping: 'address'}],
                                       rowsOf(60, i => ({ms: i, address: {city: `City ${i}`}}))),
              record = store.get(52);

        expect(store.resolveField(record, 'ms')).toBe(52000);
        expect(store.resolveField(record, 'ms')).toBe(52000);
        expect(store.resolveField(record, 'geo')).toEqual({city: 'City 52'})
    })
});

test.describe('Neo.data.Store#modelOf — a row of another shape', () => {
    let owned;

    test.beforeEach(() => owned = []);
    test.afterEach(() => owned.reverse().forEach(instance => instance.destroy()));

    // A leaf's fields parse their data; the marked row's fields hold computed totals and parse nothing
    const
        leafFields  = [{name: 'id', type: 'Integer'}, {name: 'p', type: 'Integer'}, {name: 'ms', convert: v => v * 1000}],
        shapeFields = [{name: 'id', type: 'Integer'}, {name: 'p'}, {name: 'ms'}],
        rows        = () => [{id: 1, p: 2, ms: 1}, {id: 2, total: true, p: 2.5, ms: 3000}];

    /**
     * @param {Boolean} autoInitRecords
     * @returns {Promise<Test.Unit.Data.StoreSoftHydration.ShapeStore>}
     */
    const makeStore = async autoInitRecords => {
        const shape = Neo.create(Model, {fields: shapeFields}),
              store = Neo.create(ShapeStore, {autoInitRecords, model: {module: Model, fields: leafFields}, shape, data: rows()});

        owned.push(shape, store);
        await store.ready();
        return store
    };

    test('without an override, every row is of the store\'s model', async () => {
        const store = Neo.create(Store, {model: {module: Model, fields: leafFields}});

        owned.push(store);
        expect(store.modelOf({id: 1})).toBe(store.model);
        expect(store.modelOf(null)).toBe(store.model)
    });

    test('Turbo Mode: a marked row reads, resolves and hydrates by its own model; a leaf by the store\'s', async () => {
        const store = await makeStore(false), [leaf, total] = store._items;

        expect(store.resolveField(total, 'ms')).toBe(3000);
        expect(store.resolveRow(total, ['p', 'ms'])).toMatchObject({p: 2.5, ms: 3000});
        expect(store.resolveField(leaf, 'ms')).toBe(1000);
        expect(store.resolveRow(leaf, ['p'])).toMatchObject({p: 2});

        const record = store.get(2);

        expect(record.isRecord).toBe(true);
        expect([record.p, record.ms]).toEqual([2.5, 3000]);
        expect([store.get(1).p, store.get(1).ms]).toEqual([2, 1000])
    });

    test('with records, a marked row is created as a record of its own model', async () => {
        const store = await makeStore(true);

        expect([store.get(2).p, store.get(2).ms]).toEqual([2.5, 3000]);
        expect([store.get(1).p, store.get(1).ms]).toEqual([2, 1000])
    });

    test('a tree heals its maps for a marked node hydrated by its own model', async () => {
        const shape = Neo.create(TreeModel, {fields: [{name: 'p'}]}),
              tree  = Neo.create(ShapeTreeStore, {
                  autoInitRecords: false,
                  model          : {module: TreeModel, fields: [{name: 'p', type: 'Integer'}]},
                  shape,
                  data           : [{id: 'g', isLeaf: false, p: 2.5, parentId: null, total: true}, {id: 'a', isLeaf: true, p: 2, parentId: 'g'}]
              });

        owned.push(shape, tree);
        await tree.ready();

        const [group] = tree.getChildren('root');

        expect(group.p).toBe(2.5);
        expect(tree.getChildren('root')[0]).toBe(group);
        expect(tree.get('g').p).toBe(2.5);
        expect(tree.getChildren('g')[0].p).toBe(2)
    })
});
