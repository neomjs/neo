import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'StoreFilterValuesTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Collection      from '../../../../src/collection/Base.mjs';
import Filter          from '../../../../src/collection/Filter.mjs';
import Model           from '../../../../src/data/Model.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Store           from '../../../../src/data/Store.mjs';
import TreeStore       from '../../../../src/data/TreeStore.mjs';
import GridHeader      from '../../../../src/grid/header/Button.mjs';
import TableHeader     from '../../../../src/table/header/Button.mjs';
import List            from '../../../../src/list/Base.mjs';
import BigDataStore    from '../../../../examples/grid/bigData/MainStore.mjs';

/**
 * @summary Exercises Store-owned column contributions and observational value counts on real collections.
 */
test.describe('Store column filter contract', () => {
    let owned;

    test.beforeEach(() => owned = []);
    test.afterEach(() => owned.reverse().forEach(instance => instance.destroy()));

    const create = (module, config) => {
        const instance = Neo.create(module, config);
        owned.push(instance);
        return instance
    };
    const makeStore = async (config={}) => {
        const store = create(Store, {
            model: {module: Model, fields: [{name: 'id', type: 'Int'}, {name: 'category', type: 'String'}, {name: 'allowed'}]},
            data : [{id: 1, category: 'a', allowed: true}, {id: 2, category: 'b', allowed: true},
                    {id: 3, category: 'a', allowed: false}, {id: 4, category: 'c', allowed: true}],
            ...config
        });
        await store.ready();
        return store
    };

    test('role-aware lookup preserves legacy first-match and separates equal predicates', () => {
        const collection = create(Collection, {filters: [
            {property: 'category', value: 'a', ownerRole: 'header-picker'},
            {property: 'category', value: 'a', ownerRole: 'header-inline'},
            {property: 'category', value: 'a'}
        ]});
        expect(collection.getFilter('category')).toBe(collection.filters[0]);
        expect(collection.getFilter('category', 'header-inline')).toBe(collection.filters[1]);
        expect(collection.getFilter('category', null)).toBe(collection.filters[2]);
        collection.filters = [...collection.filters];
        expect(new Set(collection.filters).size).toBe(3);
        expect(collection.getFilter('category', 'header-picker').ownerRole).toBe('header-picker')
    });

    test('an explicitly undefined optional role is still unowned', () => {
        const collection = create(Collection, {filters: [{property: 'category', ownerRole: undefined, value: 'a'}]});
        expect(collection.getFilter('category', null)).toBe(collection.filters[0])
    });

    test('equal descriptors reuse live filters and a changed descriptor replaces only its contribution', () => {
        const descriptors = () => [
            {property: 'category', operator: 'typedIncluded', value: ['a', new Date('2026-01-01T00:00:00Z')], ownerRole: 'header-picker'},
            {property: 'allowed', value: true}
        ];
        const collection    = create(Collection, {items: [{id: 1, category: 'a', allowed: true}], filters: descriptors()});
        const [picker, app] = collection.filters;
        let   changes       = 0;
        picker.on('change', () => changes++);
        collection.filters = descriptors();
        expect(collection.filters[0]).toBe(picker);
        expect(collection.filters[1]).toBe(app);
        expect(picker.isDestroyed).not.toBe(true);
        expect(app.isDestroyed).not.toBe(true);
        collection.filters = [descriptors()[0], {property: 'allowed', value: false}];
        expect(collection.filters[0]).toBe(picker);
        expect(collection.filters[1]).not.toBe(app);
        expect(app.isDestroyed).toBe(true);
        picker.value = ['b'];
        expect(changes).toBe(1);
        expect(collection.count).toBe(0)
    });

    test('descriptor reuse keeps callback, scope and explicit listener identity authoritative', () => {
        const callback   = id => function predicate({item}) {return item.id !== id};
        const first      = callback(1), second = callback(2), scope = create(Collection, {}), events = [];
        const collection = create(Collection, {items: [{id: 1}, {id: 2}], filters: [{filterBy: first, scope}]});
        const original   = collection.filters[0];
        collection.filters = [{filterBy: second, scope}];
        expect(collection.filters[0]).not.toBe(original);
        expect(collection.filters[0].filterBy).toBe(second);
        expect(collection.filters[0].scope).toBe(scope);
        expect(collection.items.map(item => item.id)).toEqual([2]);
        collection.filters = [{property: 'id', value: 1, listeners: {change: () => events.push('old')}}];
        const withListeners = collection.filters[0];
        collection.filters = [{property: 'id', value: 1, listeners: {change: () => events.push('new')}}];
        expect(collection.filters[0]).not.toBe(withListeners);
        expect(withListeners.isDestroyed).toBe(true);
        collection.filters[0].value = 2;
        expect(events).toEqual(['new']);
        expect(collection.items.map(item => item.id)).toEqual([2])
    });

    test('snapshot queries reject stale and foreign exclusions', () => {
        const collection = create(Collection, {items: [{id: 1, category: 'a'}, {id: 2, category: 'b'}],
            filters: [{property: 'category', value: 'a', ownerRole: 'header-picker'}]});
        const stale = collection.filters[0], foreign = create(Filter, {property: 'category', value: 'b', ownerRole: 'header-picker'});
        collection.filters = [{property: 'category', value: 'b', ownerRole: 'header-picker'}];
        const current = collection.filters[0], before = collection.items, events = [];
        collection.on('filter', () => events.push('filter'));
        expect(stale.isDestroyed).toBe(true);
        for (const exclude of [stale, foreign]) expect(() => collection.getFilteredItems(exclude)).toThrow(/unknown.*filter/i);
        expect(collection.getFilteredItems(current).map(item => item.id)).toEqual([1, 2]);
        expect(collection.getFilteredItems(null)).toEqual(before);
        expect(collection.items).toEqual(before);
        expect(collection.get(2)).toBe(before[0]);
        expect(events).toEqual([])
    });

    test('value counts refuse stale and foreign exclusions instead of silently retaining the picker', async () => {
        const store = await makeStore();
        store.filters = [{property: 'category', value: 'a', ownerRole: 'header-picker'}];
        const stale = store.filters[0], foreign = create(Filter, {property: 'category', value: 'b', ownerRole: 'header-picker'});
        store.filters = [{property: 'category', value: 'b', ownerRole: 'header-picker'}];
        const current = store.filters[0], before = store.items, events = [];
        store.on('filter', () => events.push('filter'));
        for (const exclude of [stale, foreign]) {
            expect(store.getFilterValues('category', exclude)).toEqual({refused: true, reason: 'unknown-filter'})
        }
        expect(store.getFilterValues('category', current).map(({value, count}) => [value, count]))
            .toEqual([['a', 2], ['b', 1], ['c', 1]]);
        expect(store.getFilterValues('category', null).map(({value, count}) => [value, count])).toEqual([['b', 1]]);
        expect(store.items).toEqual(before);
        expect(store.filters[0]).toBe(current);
        expect(events).toEqual([])
    });

    test('authoritative replacement preserves complete owned configuration and refuses duplicates atomically', () => {
        const collection = create(Collection, {items: [{id: 1, category: 'a'}], filters: [
            {property: 'category', value: 'a', ownerRole: 'header-picker'}
        ]});
        const scope = create(Collection, {marker: true}), callback = function() {return !this.marker};
        collection.filters = [{property: 'category', value: 'a', ownerRole: 'header-picker',
            filterBy: callback, scope, disabled: true, includeEmptyValues: false, reapplyOnRecordChange: true, isUpdating: true}];
        const filter = collection.filters[0], previous = collection.filters;
        expect(filter.filterBy).toBe(callback);
        expect(filter.scope).toBe(scope);
        expect(filter.disabled).toBe(true);
        expect(filter.includeEmptyValues).toBe(false);
        expect(filter.reapplyOnRecordChange).toBe(true);
        expect(filter.isUpdating).toBe(true);
        expect(() => collection.filters = [...previous, {property: 'category', ownerRole: 'header-picker'}]).toThrow(/duplicate/i);
        expect(collection.filters).toEqual(previous);
        expect(Neo.get(filter.id)).toBe(filter);
        collection.filters = [];
        expect(collection.getFilter('category', 'header-picker')).toBe(null);
        expect(filter.isDestroyed).toBe(true)
    });

    test('typed inclusion preserves scalar and Date identities and rejects unsupported values', () => {
        const date   = new Date('2026-01-01T00:00:00Z');
        const values = [null, undefined, '', false, 0, '0', date, date.valueOf()];
        expect(new Set(values.map(value => Filter.getValueKey(value))).size).toBe(values.length);
        const filter = create(Filter, {property: 'category', operator: 'typedIncluded', value: [date, 0, false]});
        for (const value of [new Date(date), 0, false]) expect(filter.isFiltered({category: value})).toBe(false);
        for (const value of ['0', date.valueOf(), null, undefined, '']) expect(filter.isFiltered({category: value})).toBe(true);
        for (const value of [{}, [], NaN, new Date('invalid')]) {
            expect(() => Filter.getValueKey(value)).toThrow(/scalar|Date/i)
        }
        expect(() => filter.value = [{}]).toThrow(/scalar|Date/i);
        expect(filter.value).toEqual([date, 0, false])
    });

    test('changing the operator cannot admit an invalid typed value or clear membership maps', () => {
        const collection = create(Collection, {items: [{id: 1, category: 'a'}], filters: [{property: 'category', value: 'a'}]});
        const filter     = collection.filters[0], before = collection.items.slice(), events = [];
        collection.on('filter', () => events.push('filter'));
        expect(() => filter.operator = 'typedIncluded').toThrow(/array/);
        expect(filter.operator).toBe('===');
        expect(filter.value).toBe('a');
        expect(collection.items).toEqual(before);
        expect(collection.get(1)).toBe(before[0]);
        expect(events).toEqual([])
    });

    test('the filtering writer preserves progressive map visibility while queries do not publish into it', () => {
        const collection = create(Collection, {items: [{id: 1}, {id: 2}]});
        const seen       = [];
        collection.filters = [{filterBy: ({item}) => {seen.push([...collection.map.keys()]); return false}}];
        expect(seen).toEqual([[], [1]]);
        seen.length = 0;
        collection.getFilteredItems();
        expect(seen).toEqual([[1, 2], [1, 2]]);
        expect([...collection.map.keys()]).toEqual([1, 2])
    });

    for (const [kind, Header] of [['Grid', GridHeader], ['Table', TableHeader]]) {
        for (const order of [['picker', 'inline', 'app'], ['picker', 'app', 'inline'], ['inline', 'picker', 'app'],
                ['inline', 'app', 'picker'], ['app', 'inline', 'picker'], ['app', 'picker', 'inline']]) {
            test(`${kind} writers preserve other contributions in ${order.join('/')} order`, async () => {
                const store = await makeStore(), configs = {
                    picker: {property: 'category', operator: 'typedIncluded', value: ['a'], ownerRole: 'header-picker'},
                    inline: {property: 'category', operator: 'like', value: 'a', ownerRole: 'header-inline'},
                    app   : {property: 'category', operator: '!==', value: 'blocked'}
                };
                store.filters = order.map(name => configs[name]);
                const picker = store.getFilter('category', 'header-picker'), app = store.getFilter('category', null),
                    header   = create(Header, {dataField: 'category', resizable: false});
                header.up = () => ({store});
                header.changeFilterValue({value: 'b'});
                header.changeFilterOperator({value: '==='});
                expect(store.getFilter('category', 'header-inline').value).toBe('b');
                expect(store.getFilter('category', 'header-inline').operator).toBe('===');
                expect(picker.value).toEqual(['a']);
                expect(app.value).toBe('blocked');
                const second = create(Header, {dataField: 'category', resizable: false});
                second.up = () => ({store});
                second.changeFilterValue({value: 'a'});
                expect(store.filters.filter(filter => filter.ownerRole === 'header-inline').length).toBe(1)
            });
        }
    }

    test('new inline contribution cannot inherit a picker role or overwrite its input with defaults', async () => {
        const store  = await makeStore();
        const header = create(GridHeader, {dataField: 'category', resizable: false,
            filterConfig: {ownerRole: 'header-picker', property: 'allowed', value: 'stale', operator: '==='}});
        header.up = () => ({store});
        header.changeFilterValue({value: 'b'});
        expect(store.filters[0].ownerRole).toBe('header-inline');
        expect(store.filters[0].property).toBe('category');
        expect(store.filters[0].value).toBe('b');
        expect(store.filters[0].operator).toBe('===')
    });

    test('the actual built-in highlight caller reads only its unowned contribution', async () => {
        const store = await makeStore({data: [{id: 1, category: 'blue'}]});
        store.filters = [{property: 'category', operator: 'typedIncluded', value: ['blue'], ownerRole: 'header-picker'},
            {property: 'category', operator: 'like', value: 'bl'}];
        const list    = create(List, {store, autoDestroyStore: false, displayField: 'category', highlightFilterValue: true});
        const content = list.createItemContent(store.get(1), 0);
        expect(content).toBe('<span class="neo-highlight-search">bl</span>ue');
        expect(store.getFilter('category', 'header-picker').value).toEqual(['blue'])
    });

    for (const filterMode of ['primitive', 'advanced']) {
        test(`counts exclude exactly the picker and preserve ${filterMode} callback cohorts`, async () => {
            const store    = await makeStore({filterMode});
            const observed = [], scope = {label: 'app'};
            store.filters = [
                {property: 'category', operator: 'typedIncluded', value: ['a'], ownerRole: 'header-picker'},
                {property: 'category', filterBy: function({item, filteredItems, allItems}) {
                    observed.push([this.label, filteredItems.length, allItems.length]);
                    return !item.allowed
                }, scope},
                {property: 'category', operator: '!==', value: 'c', ownerRole: 'header-inline'}
            ];
            observed.length = 0;
            const picker = store.getFilter('category', 'header-picker'), before = store.items.slice(), events = [];
            store.on('filter', () => events.push('filter'));
            expect(store.getFilterValues('category', picker).map(({value, count}) => [value, count])).toEqual([['a', 1], ['b', 1]]);
            expect(observed).toEqual(Array(4).fill(['app', 4, 4]));
            expect(store.items).toEqual(before);
            expect(events).toEqual([]);
            expect(store.filters[0]).toBe(picker);
            expect(store.getFilterValues('category').map(({value, count}) => [value, count])).toEqual([['a', 1]])
        });
    }

    for (const autoInitRecords of [true, false]) {
        test(`key transactions publish settled selected membership (eager=${autoInitRecords})`, async () => {
            const store = await makeStore({autoInitRecords});
            store.filters = [{property: 'id', operator: 'typedIncluded', value: [1],
                ownerRole: 'header-picker', reapplyOnRecordChange: true}];
            const first = store.get(1), hidden = store.allItems.get(2), changes = [], keys = [];
            store.on('recordChange', ({index}) => changes.push([index, store.count]));
            store.on('updateKey', () => keys.push(store.count));
            let   passes = 0;
            const filter = store.filter;
            store.filter = function(...args) {passes++; return filter.apply(this, args)};
            store.updateKey(first, 10);
            expect(store.count).toBe(0);
            expect(store.get(10)).toBe(null);
            store.updateKey(hidden, 1);
            expect(store.get(1)).toBe(hidden);
            expect(changes).toEqual([[-1, 0], [0, 1]]);
            expect(keys).toEqual([0, 1]);
            expect(passes).toBe(2)
        });

        test(`initial filters preserve the full population before data ingestion (eager=${autoInitRecords})`, async () => {
            const store = await makeStore({autoInitRecords, filters: [{property: 'allowed', value: true},
                {property: 'category', operator: 'typedIncluded', value: ['a'], ownerRole: 'header-picker'}]});
            expect(store.items.map(item => item.id)).toEqual([1]);
            expect(store.allItems.count).toBe(4);
            expect(store.getFilterValues('category', store.getFilter('category', 'header-picker'))
                .map(({value, count}) => [value, count])).toEqual([['a', 1], ['b', 1], ['c', 1]]);
            store.clearFilters();
            expect(store.items.map(item => item.id)).toEqual([1, 2, 3, 4])
        });

        test(`record edits settle membership without views, including hidden records (eager=${autoInitRecords})`, async () => {
            const store = await makeStore({autoInitRecords});
            store.filters = [{property: 'category', operator: 'typedIncluded', value: ['a'],
                ownerRole: 'header-picker', reapplyOnRecordChange: true}];
            const picker = store.filters[0], visible = store.get(1), hidden = store.allItems.get(2), events = [];
            store.on('recordChange', ({record, index}) => events.push({id: record.id, index, ids: store.items.map(item => item.id)}));
            let   passes = 0;
            const filter = store.filter;
            store.filter = function(...args) {passes++; return filter.apply(this, args)};
            visible.category = 'b';
            hidden.set({category: 'a', allowed: false});
            expect(passes).toBe(2);
            expect(events).toEqual([{id: 1, index: -1, ids: [3]}, {id: 2, index: 0, ids: [2, 3]}]);
            expect(store.filters[0]).toBe(picker);
            expect(picker.value).toEqual(['a']);
            const count = passes;
            store.clearFilters();
            hidden.category = 'c';
            expect(passes).toBe(count + 1);
            expect(events.at(-1)).toEqual({id: 2, index: 1, ids: [1, 2, 3, 4]})
        });
    }

    test('legacy edits do not automatically refilter; opt-in disable and replacement remove reapplication', async () => {
        const store = await makeStore();
        store.filters = [{property: 'category', value: 'a'}];
        const record = store.get(1);
        record.category = 'b';
        expect(store.items.map(item => item.id)).toEqual([1, 3]);
        store.filter();
        expect(store.items.map(item => item.id)).toEqual([3]);
        store.filters = [{property: 'category', value: 'a', ownerRole: 'header-picker', reapplyOnRecordChange: true}];
        const picker = store.filters[0];
        picker.disabled = true;
        let   passes = 0;
        const filter = store.filter;
        store.filter = function(...args) {passes++; return filter.apply(this, args)};
        record.category = 'a';
        expect(passes).toBe(0);
        store.filters = [{property: 'category', value: 'a', ownerRole: 'header-picker', reapplyOnRecordChange: false}];
        passes = 0;
        record.category = 'b';
        expect(passes).toBe(0)
    });

    test('counting 100k canonical Turbo rows neither hydrates nor writes raw objects', async () => {
        const data    = Array.from({length: 100000}, (_, id) => ({id: id + 1, category: 'name-' + id % 50, allowed: true}));
        const store   = await makeStore({autoInitRecords: false, data});
        const samples = [store.items[0], store.items[49999], store.items[99999]], before = samples.map(item => ({...item}));
        for (const method of ['get', 'getAt', 'hydrateRecord', 'resolveField']) {
            store[method] = () => {throw new Error('query called ' + method)}
        }
        const counts = store.getFilterValues('category');
        expect(counts.length).toBe(50);
        expect(counts.every(({count}) => count === 2000)).toBe(true);
        expect(samples.map(item => ({...item}))).toEqual(before);
        expect(store.count).toBe(100000)
    });

    test('the actual bigData Store counts its normal 100k Turbo population', async () => {
        const store = create(BigDataStore, {amountRows: 100000, amountColumns: 5});
        await store.ready();
        expect(store.autoInitRecords).toBe(false);
        expect(store.count).toBe(100000);
        const samples = [store.items[0], store.items[49999], store.items[99999]], before = samples.map(item => ({...item}));
        const buckets = store.getFilterValues('firstname');
        expect(Array.isArray(buckets)).toBe(true);
        expect(buckets.reduce((total, {count}) => total + count, 0)).toBe(100000);
        const reference = new Map();
        for (const item of store.items) reference.set(item.firstname, (reference.get(item.firstname) || 0) + 1);
        expect(buckets.map(({value, count}) => [value, count])).toEqual([...reference]);
        expect(samples.map(item => ({...item}))).toEqual(before);
        store.filters = [...store.filters, {property: 'firstname', operator: 'typedIncluded',
            value: [buckets[0].value], ownerRole: 'header-picker', reapplyOnRecordChange: true}];
        expect(store.allItems.count).toBe(100000);
        expect(store.getFilterValues('firstname', store.getFilter('firstname', 'header-picker'))
            .map(({value, count}) => [value, count])).toEqual([...reference])
    });

    test('bucket identity and returned Dates preserve canonical scalar source values', async () => {
        const date  = new Date('2026-01-01T00:00:00Z'), timestamp = date.valueOf();
        const store = await makeStore({model: {module: Model, fields: [{name: 'id', type: 'Int'}, {name: 'category'}]},
            data: [{id: 1, category: null}, {id: 2}, {id: 3, category: ''}, {id: 4, category: false},
                {id: 5, category: 0}, {id: 6, category: '0'}, {id: 7, category: date}, {id: 8, category: timestamp}]});
        const buckets = store.getFilterValues('category');
        expect(buckets.length).toBe(8);
        expect(buckets.every(({count}) => count === 1)).toBe(true);
        const returned = buckets.find(({value}) => value instanceof Date).value;
        returned.setUTCFullYear(2000);
        expect(store.get(7).category.valueOf()).toBe(timestamp)
    });

    test('destroy detaches projection edit forwarding and releases the owned contribution', async () => {
        const store = await makeStore({autoInitRecords: false});
        store.filters = [{property: 'category', operator: 'typedIncluded', value: ['a'],
            ownerRole: 'header-picker', reapplyOnRecordChange: true}];
        const projection = store.allItems, hidden = projection.get(2), picker = store.filters[0], unbinds = [], un = projection.un;
        projection.un = function(...args) {unbinds.push(args); return un.apply(this, args)};
        store.destroy();
        expect(unbinds.some(([event, fn, scope]) => event === 'recordChange' && fn === store.onAllItemsRecordChange && scope === store)).toBe(true);
        expect(picker.isDestroyed).toBe(true);
        expect(Neo.get(projection.id)).toBe(null);
        expect(() => hidden.category = 'a').not.toThrow()
    });

    test('unsupported population and noncanonical raw values refuse instead of reconstructing', async () => {
        const store = await makeStore({autoInitRecords: false});
        expect(store.getFilterValues('missing')).toEqual({refused: true, reason: 'unknown-field'});
        for (const property of ['remoteFilter', 'remoteSort', 'isLoading', 'isStreaming']) {
            store[property] = true;
            expect(store.getFilterValues('category').refused).toBe(true);
            store[property] = false
        }
        store._pageSize = 2;
        expect(store.getFilterValues('category')).toEqual({refused: true, reason: 'remote-projection'});
        store._pageSize = 0;
        const complex = await makeStore({autoInitRecords: false,
            model: {module: Model, fields: [{name: 'id', type: 'Int'}, {name: 'category', mapping: 'raw'}]},
            data : [{id: 1, raw: 'a'}]});
        expect(complex.getFilterValues('category')).toEqual({refused: true, reason: 'raw-complex-fields'});
        const noncanonical = await makeStore({autoInitRecords: false,
            model: {module: Model, fields: [{name: 'id', type: 'Int'}, {name: 'category', type: 'Int'}]},
            data : [{id: 1, category: '2'}]});
        expect(noncanonical.getFilterValues('category')).toEqual({refused: true, reason: 'noncanonical-field'});
        const tree = create(TreeStore, {data: [{id: 1, name: 'a', isLeaf: true}]});
        await tree.ready();
        expect(tree.getFilterValues('name')).toEqual({refused: true, reason: 'tree-population'})
    });

    test('retained old records cannot refilter a replacement population', async () => {
        const store = await makeStore();
        store.filters = [{property: 'category', value: 'a', ownerRole: 'header-picker', reapplyOnRecordChange: true}];
        const old = store.get(1);
        store.data = [{id: 1, category: 'b', allowed: true}];
        let   passes = 0;
        const filter = store.filter;
        store.filter = function(...args) {passes++; return filter.apply(this, args)};
        old.category = 'c';
        expect(passes).toBe(0);
        expect(store.count).toBe(0)
    });

    test('subclass data and filter defaults do not replay or constrain the unfiltered mirror', async () => {
        class StaticDataStore extends Store {
            static config = {
                className: 'Test.Unit.Data.StoreFilterValues.StaticDataStore',
                model    : {module: Model, fields: [{name: 'id', type: 'Int'}, {name: 'category', type: 'String'}]},
                data     : [{id: 1, category: 'a'}, {id: 2, category: 'b'}],
                filters  : [{property: 'category', value: 'a'}]
            }
        }
        const store = create(Neo.setupClass(StaticDataStore), {});
        await store.ready();
        expect(store.allItems.filters).toEqual([]);
        expect(store.allItems.data).toBe(null);
        expect(store.allItems.count).toBe(2);
        expect(store.getFilterValues('category', store.filters[0]).map(({value, count}) => [value, count]))
            .toEqual([['a', 1], ['b', 1]])
    });
});
