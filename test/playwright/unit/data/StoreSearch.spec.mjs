import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'StoreSearchTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Collection     from '../../../../src/collection/Base.mjs';
import Filter         from '../../../../src/collection/Filter.mjs';
import SearchFilter   from '../../../../src/collection/SearchFilter.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';
import TreeStore      from '../../../../src/data/TreeStore.mjs';

/**
 * @summary Pins the Store-wide record search: terms across declared fields, the columnless owner slot, the read
 * set that counting and soft hydration use, and the refusals a writer checks first.
 *
 * The fixture's expected ids are an acceptance oracle computed independently of this implementation.
 */
test.describe('Store-wide record search', () => {
    let owned;

    test.beforeEach(() => owned = []);
    test.afterEach(() => owned.reverse().forEach(instance => instance.destroy()));

    const create = (module, config) => {
        const instance = Neo.create(module, config);
        owned.push(instance);
        return instance
    };

    const searchFields = ['title', 'summary', 'area', 'state'];

    const makeStore = async (config={}) => {
        const store = create(Store, {
            model: {module: Model, fields: [{name: 'id', type: 'Int'}, {name: 'state', type: 'String'},
                {name: 'title', type: 'String'}, {name: 'summary', type: 'String'}, {name: 'area', type: 'String'}]},
            data : [
                {id: 101, state: 'open',   title: 'Falcon',       summary: 'retry waits',   area: 'grid'},
                {id: 102, state: 'closed', title: 'Falcon',       summary: 'retry needs',   area: 'grid'},
                {id: 103, state: 'open',   title: 'falcon retry', summary: 'stale note',    area: 'Store'},
                {id: 104, state: 'open',   title: 'Worker',       summary: 'Falcon retry',  area: 'Store'},
                {id: 105, state: 'open',   title: 'Queue',        summary: 'ordinary work', area: 'grid'}
            ],
            ...config
        });
        await store.ready();
        return store
    };

    const ids    = store => store.items.map(item => item.id);
    const search = (value='Falcon retry', fields=searchFields) =>
        ({module: SearchFilter, ownerRole: 'grid-search', fields, value});

    test('the acceptance fixture: terms, case, scope and the composed predicates', async () => {
        const store = await makeStore({filters: [search()]});
        const query = store.getFilter(null, 'grid-search');

        expect(query).toBeInstanceOf(SearchFilter);
        expect(ids(store)).toEqual([101, 102, 103, 104]);

        query.caseSensitive = true;
        expect(ids(store)).toEqual([101, 102, 104]);

        query.caseSensitive = false;
        query.fields        = ['title'];
        expect(ids(store)).toEqual([103]);

        query.fields  = searchFields;
        store.filters = [...store.filters, {property: 'state', value: 'open', ownerRole: 'tenant'}];
        expect(ids(store)).toEqual([101, 103, 104]);

        store.filters = [...store.filters,
            {property: 'title', operator: 'like', value: 'falcon', ownerRole: 'header-inline'},
            {property: 'area', operator: 'typedIncluded', value: ['grid'], ownerRole: 'header-picker'}];
        expect(ids(store)).toEqual([101]);

        // The picker counts under every other predicate, the search included.
        const counts = store.getFilterValues('area', store.getFilter('area', 'header-picker'));
        expect(counts.map(({value, count}) => ({value, count}))).toEqual([{value: 'grid', count: 1}, {value: 'Store', count: 1}]);

        store.getFilter(null, 'grid-search').value = '';
        expect(ids(store)).toEqual([101]);

        // A clear by enumeration of the UI roles keeps the application-owned restriction.
        store.filters = store.filters.filter(filter => !['header-inline', 'header-picker', 'grid-search'].includes(filter.ownerRole));
        expect(ids(store)).toEqual([101, 103, 104, 105])
    });

    test('an empty or whitespace query is inert, keeps its fields and is not effective', async () => {
        const store = await makeStore({filters: [search('   ')]});
        const query = store.getFilter(null, 'grid-search');

        expect(ids(store)).toEqual([101, 102, 103, 104, 105]);
        expect(query.effective).toBe(false);
        expect(query.disabled).toBe(false);
        expect(query.fields).toEqual(searchFields);

        query.value = 'queue';
        expect(ids(store)).toEqual([105]);
        expect(query.effective).toBe(true);

        query.disabled = true;
        expect(ids(store)).toEqual([101, 102, 103, 104, 105]);
        expect(query.effective).toBe(false)
    });

    test('an explicit null property stays the columnless slot from config to complete replacement', async () => {
        const store  = await makeStore({filters: [search()]});
        const before = store.getFilter(null, 'grid-search');

        expect(before.property).toBeNull();
        expect(store.getFilter('id', 'grid-search')).toBeNull();

        store.filters = [search()];
        expect(store.getFilter(null, 'grid-search')).toBe(before);
        expect(before.isDestroyed).not.toBe(true);

        store.filters = [search('worker')];
        const after = store.getFilter(null, 'grid-search');
        expect(after).not.toBe(before);
        expect(after.property).toBeNull();
        expect(ids(store)).toEqual([104])
    });

    test('duplicate owned contributions are refused at each stage; an omitted property still resolves to id', async () => {
        const store  = await makeStore({filters: [search()]});
        const before = store.filters;

        expect(() => store.filters = [search(), search('worker')]).toThrow('Duplicate owned filter contribution: grid-search/null');
        expect(() => store.filters = [search(), {ownerRole: 'grid-search', property: null, filterBy: () => false}])
            .toThrow('Duplicate owned filter contribution: grid-search/null');
        expect(store.filters).toEqual(before);
        expect(ids(store)).toEqual([101, 102, 103, 104]);

        const filterBy   = () => false;
        const collection = create(Collection, {filters: [{ownerRole: 'app', filterBy}]});
        expect(collection.filters[0].property).toBe('id');
        expect(collection.getFilter('id', 'app')).toBe(collection.filters[0]);
        expect(() => collection.filters = [{ownerRole: 'app', filterBy}, {ownerRole: 'app', property: 'id', filterBy}])
            .toThrow('Duplicate owned filter contribution: app/id')
    });

    test('the columnless search coexists with per-field roles and unowned predicates', async () => {
        const store = await makeStore({filters: [
            search(),
            {property: 'title', operator: 'like', value: 'falcon', ownerRole: 'header-inline'},
            {property: 'title', operator: 'like', value: 'falcon', ownerRole: 'header-picker'},
            {property: 'state', value: 'open'}
        ]});

        expect(store.getFilter(null, 'grid-search')).toBeInstanceOf(SearchFilter);
        expect(store.getFilter('title', 'header-inline').ownerRole).toBe('header-inline');
        expect(store.getFilter('title', 'header-picker').ownerRole).toBe('header-picker');
        expect(store.getFilter('state', null).ownerRole).toBeNull();
        expect(ids(store)).toEqual([101, 103])
    });

    test('getSearchRefusal names what a Store cannot search', async () => {
        const store = await makeStore({model: {module: Model, fields: [{name: 'id', type: 'Int'}, {name: 'title', type: 'String'},
            {name: 'opened', type: 'Date'}, {name: 'tags', type: 'Array'}, {name: 'note'}]}, data: []});

        expect(store.getSearchRefusal(['title', 'id', 'note'])).toBeNull();
        expect(store.getSearchRefusal(['missing'])).toBe('unknown-field');
        expect(store.getSearchRefusal(['opened'])).toBe('unsupported-field');
        expect(store.getSearchRefusal(['tags'])).toBe('unsupported-field');
        expect(store.getSearchRefusal(['opened'], {opened: value => String(value)})).toBeNull();

        const remote = await makeStore({remoteFilter: true});
        expect(remote.getSearchRefusal(['title'])).toBe('remote-projection');

        const tree = create(TreeStore, {model: {module: Model, fields: [{name: 'id', type: 'Int'}, {name: 'title', type: 'String'}]}});
        expect(tree.getSearchRefusal(['title'])).toBe('tree-population')
    });

    test('a fieldText hook makes a Date searchable as the text users see', async () => {
        const store = await makeStore({
            model: {module: Model, fields: [{name: 'id', type: 'Int'}, {name: 'opened', type: 'Date'}]},
            data : [{id: 1, opened: new Date('2026-08-13T00:00:00Z')}, {id: 2, opened: new Date('2026-10-16T00:00:00Z')}]
        });

        store.filters = [{module: SearchFilter, ownerRole: 'grid-search', fields: ['opened'], value: '2026-10'}];
        expect(ids(store)).toEqual([]);

        store.getFilter(null, 'grid-search').fieldText = {opened: value => value.toISOString().slice(0, 10)};
        expect(ids(store)).toEqual([2])
    });

    test('soft hydration resolves declared fields and never writes a null key on raw items', async () => {
        const store = await makeStore({
            autoInitRecords: false,
            model          : {module: Model, fields: [{name: 'id', type: 'Int'}, {name: 'first', type: 'String'},
                {name: 'last', type: 'String'}, {name: 'name', type: 'String', calculate: data => data.first + ' ' + data.last}]},
            data : [{id: 1, first: 'Ann', last: 'Smith'}, {id: 2, first: 'Bob', last: 'Baker'}]
        });

        store.filters = [{module: SearchFilter, ownerRole: 'grid-search', fields: ['name'], value: 'ann smith'}];
        expect(ids(store)).toEqual([1]);
        expect(store.allItems._items.every(item => Object.hasOwn(item, 'name') && !Object.hasOwn(item, 'null'))).toBe(true)
    });

    test('raw-item counts under a search check the searched fields, never a null property', async () => {
        const store = await makeStore({autoInitRecords: false, filters: [search(),
            {property: 'area', operator: 'typedIncluded', value: ['grid'], ownerRole: 'header-picker'}]});
        const picker = store.getFilter('area', 'header-picker');

        expect(store.allItems._items.some(item => item.isRecord)).toBe(false);
        expect(store.getFilterValues('area', picker).map(({value, count}) => ({value, count})))
            .toEqual([{value: 'grid', count: 2}, {value: 'Store', count: 2}]);

        // A searched field holding a non-canonical value refuses the count instead of reading it raw.
        store.allItems._items[0].summary = 7;
        expect(store.getFilterValues('area', picker)).toEqual({refused: true, reason: 'noncanonical-field'})
    });

    test('Filter#effective follows disabled, callbacks and empty values; a search exports nothing', () => {
        const inline = create(Filter, {property: 'title', operator: 'like', value: ''});
        expect(inline.effective).toBe(false);
        inline.value = 'falcon';
        expect(inline.effective).toBe(true);
        inline.disabled = true;
        expect(inline.effective).toBe(false);

        expect(create(Filter, {filterBy: () => false}).effective).toBe(true);
        expect(create(SearchFilter, {fields: ['title'], value: 'falcon'}).export()).toBeNull()
    })
});
