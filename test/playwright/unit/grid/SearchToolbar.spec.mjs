import {setup} from '../../setup.mjs';

const appName = 'GridSearchToolbarTest';

setup({
    neoConfig: {allowVdomUpdatesInTests: true, useDomApiRenderer: true, useVdomWorker: false},
    appConfig: {name: appName, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Grid           from '../../../../src/grid/Container.mjs';
import SearchToolbar  from '../../../../src/grid/SearchToolbar.mjs';
import SearchFilter   from '../../../../src/collection/SearchFilter.mjs';
import Store          from '../../../../src/data/Store.mjs';
import Model          from '../../../../src/data/Model.mjs';
import SearchField    from '../../../../src/form/field/Search.mjs';

// `initVnode()` needs the VDOM rig, while Grid/Container child construction resolves ids through Neo.get.
import '../../../../src/manager/Instance.mjs';
import '../../../../src/vdom/Helper.mjs';
import '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

/** @summary Covers the native grid toolbar as a view over Store-owned search intent and grid UI predicates. */
test.describe('Grid record search toolbar', () => {
    let owned;

    test.beforeEach(() => owned = []);
    test.afterEach(() => owned.reverse().forEach(instance => {
        if (!instance.isDestroyed) instance.destroy()
    }));

    const create = (module, config) => {
        const instance = Neo.create(module, config);
        owned.push(instance);
        return instance
    };

    const rows = [
        {id: 101, state: 'open',   title: 'Falcon',       summary: 'retry waits',   area: 'grid'},
        {id: 102, state: 'closed', title: 'Falcon',       summary: 'retry needs',   area: 'grid'},
        {id: 103, state: 'open',   title: 'falcon retry', summary: 'stale note',    area: 'Store'},
        {id: 104, state: 'open',   title: 'Worker',       summary: 'Falcon retry',  area: 'Store'},
        {id: 105, state: 'open',   title: 'Queue',        summary: 'ordinary work', area: 'grid'}
    ];

    const storeFor = async (config={}) => {
        const store = create(Store, {
            model: {module: Model, fields: [
                {name: 'id', type: 'Int'}, {name: 'state', type: 'String'},
                {name: 'title', type: 'String'}, {name: 'summary', type: 'String'},
                {name: 'area', type: 'String'}
            ]},
            data: rows,
            ...config
        });
        await store.ready();
        return store
    };

    const gridFor = (store, columns) => create(Grid, {appName, store, columns, width: 500, height: 240});

    const initializedGridFor = async (store, config={}) => {
        const grid = create(Grid, {
            appName,
            columns: [{dataField: 'title', text: 'Title', width: 180}, {dataField: 'summary', text: 'Summary', width: 180}],
            height : 240,
            store,
            width  : 500,
            ...config
        });
        await grid.initVnode();
        grid.mounted = true;
        return grid
    };

    const toolbarFor = async (store, gridContainer=null) => {
        const toolbar = create(SearchToolbar, {appName, store, gridContainer});
        await toolbar.initVnode();
        toolbar.mounted = true;
        return toolbar
    };

    const ids = store => store.items.map(record => record.id);

    const clearIsVisible = toolbar => {
        const clear = toolbar.getItem('clear');
        return Boolean(clear && !clear.hidden)
    };

    test('a new search includes locked grid columns, while searching undisplayed record fields is an explicit choice', async () => {
        const store = await storeFor(),
            grid    = gridFor(store, [
                {dataField: 'state', text: 'Status', width: 100, locked: 'start'},
                {dataField: 'title', text: 'Title', width: 180},
                {dataField: 'area', text: 'Area', width: 100, locked: 'end'}
            ]),
            toolbar = await toolbarFor(store, grid),
            scopeButton = toolbar.getItem('scope');

        expect(toolbar.getSearchFilter()).toBeNull();
        expect(toolbar.getSearchFields()).toEqual(['state', 'title', 'area']);
        expect(scopeButton.text).toBe('Grid columns');
        expect(clearIsVisible(toolbar)).toBe(false);

        toolbar.writeSearch({value: 'closed'});
        expect(ids(store)).toEqual([102]);
        toolbar.writeSearch({value: 'Store'});
        expect(ids(store)).toEqual([103, 104]);
        toolbar.writeSearch({value: 'retry'});
        expect(ids(store)).toEqual([103]);

        toolbar.updateScopeMenu();
        await scopeButton.menuListReady;
        const choices  = scopeButton.menuList.items,
            gridChoice = choices.find(item => item.text === 'Grid columns'),
            allChoice  = choices.find(item => item.text === 'All record fields');

        expect(gridChoice).toBeTruthy();
        expect(allChoice).toBeTruthy();
        expect(choices.some(item => item.text === 'Status')).toBe(true);
        expect(choices.some(item => item.text === 'Area')).toBe(true);
        const menu       = scopeButton.menuList,
            selectedAria = id => menu.createItem(menu.store.get(id), menu.store.indexOf(id))['aria-selected'];
        expect(selectedAria('columns')).toBe(true);
        expect(selectedAria('all')).toBe(false);
        allChoice.handler();

        expect(toolbar.getSearchFilter().fields).toEqual(['id', 'state', 'title', 'summary', 'area']);
        expect(scopeButton.text).toBe('All record fields');
        expect(ids(store)).toEqual([101, 102, 103, 104]);
        expect(clearIsVisible(toolbar)).toBe(true);
        expect(toolbar.getItem('summary').items).toContain(toolbar.getItem('clear'));
        toolbar.updateScopeMenu();
        await scopeButton.menuListReady;
        expect(selectedAria('columns')).toBe(false);
        expect(selectedAria('all')).toBe(true);

        const standaloneStore = await storeFor(),
            standaloneToolbar = await toolbarFor(standaloneStore);
        expect(standaloneToolbar.getSearchFields()).toEqual(['id', 'state', 'title', 'summary', 'area']);
        expect(standaloneToolbar.getSearchFilter()).toBeNull()
    });

    test('column fields named all and columns remain literal menu choices, distinct from aggregate scopes', async () => {
        const store = await storeFor({
                model: {module: Model, fields: [
                    {name: 'id', type: 'Int'}, {name: 'all', type: 'String'},
                    {name: 'columns', type: 'String'}, {name: 'title', type: 'String'}
                ]},
                data: [
                    {id: 201, all: 'needle', columns: 'other', title: 'other'},
                    {id: 202, all: 'other', columns: 'needle', title: 'other'},
                    {id: 203, all: 'other', columns: 'other', title: 'needle'}
                ]
            }),
            grid = gridFor(store, [
                {dataField: 'all', text: 'All values', width: 120},
                {dataField: 'columns', text: 'Column values', width: 120},
                {dataField: 'title', text: 'Title', width: 120}
            ]),
            toolbar = await toolbarFor(store, grid),
            scopeButton = toolbar.getItem('scope');

        toolbar.writeSearch({value: 'needle'});
        toolbar.updateScopeMenu();
        await scopeButton.menuListReady;
        const choices = scopeButton.menuList.items;

        for (const [name, expectedId] of [['all', 201], ['columns', 202]]) {
            choices.find(item => item.id === name).handler();
            expect(ids(store)).toEqual([201, 202, 203]);
            choices.find(item => item.id === `field:${name}`).handler();
            expect(toolbar.getSearchFilter().fields).toEqual([name]);
            expect(ids(store)).toEqual([expectedId])
        }
    });

    test('two grid hosts share Store-owned search settings and query, case and scope edits preserve disabled state', async () => {
        const store   = await storeFor(),
            firstGrid = gridFor(store, [
                {dataField: 'title', text: 'Title', width: 180},
                {dataField: 'state', text: 'State', width: 100}
            ]),
            secondGrid = gridFor(store, [
                {dataField: 'summary', text: 'Summary', width: 180},
                {dataField: 'area', text: 'Area', width: 100}
            ]),
            first = await toolbarFor(store, firstGrid),
            second = await toolbarFor(store, secondGrid);

        expect(first.getItem('query')).toBeInstanceOf(SearchField);
        expect(first.getSearchFilter()).toBeNull();
        expect(first.getSearchFields()).toEqual(['title', 'state']);
        expect(second.getSearchFields()).toEqual(['summary', 'area']);

        first.writeSearch({value: 'closed'});
        expect(ids(store)).toEqual([102]);
        expect(second.getSearchFields()).toEqual(['title', 'state']);

        expect(first.writeSearch({value: 'Falcon retry', fields: ['title', 'summary'], caseSensitive: false}))
            .toEqual({status: 'written'});
        const filter = store.getFilter(null, 'grid-search');
        expect(filter).toBeInstanceOf(SearchFilter);
        expect(first.getSearchFilter()).toBe(filter);
        expect(second.getSearchFilter()).toBe(filter);
        expect(second.getSearchFields()).toEqual(['title', 'summary']);
        expect(first.getItem('query').value).toBe('Falcon retry');
        expect(second.getItem('query').value).toBe('Falcon retry');
        expect(ids(store)).toEqual([101, 102, 103, 104]);

        // Application-owned disabled state remains authoritative across toolbar edits.
        filter.disabled = true;
        first.writeSearch({value: 'queue'});
        expect(filter.value).toBe('queue');
        expect(filter.disabled).toBe(true);
        expect(ids(store)).toEqual([101, 102, 103, 104, 105]);

        first.writeSearch({caseSensitive: true});
        expect(filter.caseSensitive).toBe(true);
        expect(filter.disabled).toBe(true);
        first.writeSearch({fields: ['title']});
        expect(filter.fields).toEqual(['title']);
        expect(filter.disabled).toBe(true);
        expect(second.getSearchFields()).toEqual(['title']);
        expect(first.getItem('scope').text).toBe('Title');

        filter.disabled = false;
        first.writeSearch({value: 'Falcon retry', caseSensitive: true, fields: ['title', 'summary']});
        expect(ids(store)).toEqual([101, 102, 104]);
        expect(first.getItem('scope').text).toBe('Selected fields (2)');

        // Rebinding a displayed column and attaching another host must not reinterpret the shared scope.
        firstGrid.columns.items.find(column => column.dataField === 'title').dataField = 'area';
        const thirdGrid = gridFor(store, [{dataField: 'state', text: 'Status', width: 100}]),
            third       = await toolbarFor(store, thirdGrid);
        expect(third.getSearchFilter()).toBe(filter);
        expect(third.getSearchFields()).toEqual(['title', 'summary']);
        expect(first.getSearchFields()).toEqual(['title', 'summary']);
        expect(ids(store)).toEqual([101, 102, 104]);
        third.writeSearch({value: 'retry'});
        expect(filter.fields).toEqual(['title', 'summary']);
        expect(ids(store)).toEqual([101, 102, 103, 104]);

        first.destroy();
        expect(second.getSearchFilter()).toBe(filter);
        expect(ids(store)).toEqual([101, 102, 103, 104])
    });

    test('a Grid-owned toolbar updates its scope caption after column changes without rewriting the stored search', async () => {
        const store = await storeFor(),
            grid    = await initializedGridFor(store, {
                columns: [
                    {dataField: 'title', text: 'Title', width: 180},
                    {dataField: 'state', text: 'Status', width: 100}
                ],
                searchToolbar: {}
            }),
            toolbar = grid.searchToolbar,
            titleColumn = grid.columns.get('title'),
            stateColumn = grid.columns.get('state');

        owned.push(stateColumn);
        grid.columns.remove(stateColumn);
        toolbar.writeSearch({value: 'Falcon'});
        const filter = toolbar.getSearchFilter(), scopeButton = toolbar.getItem('scope');
        expect(scopeButton.text).toBe('Grid columns');
        expect(filter.fields).toEqual(['title']);
        expect(ids(store)).toEqual([101, 102, 103]);

        titleColumn.dataField = 'summary';
        expect(scopeButton.text).toBe('title');
        expect(toolbar.getSearchFilter()).toBe(filter);
        expect(filter.fields).toEqual(['title']);
        expect(ids(store)).toEqual([101, 102, 103]);

        titleColumn.dataField = 'title';
        expect(scopeButton.text).toBe('Grid columns');
        grid.columns.add(stateColumn);
        expect(scopeButton.text).toBe('Title');
        grid.columns.remove(stateColumn);
        expect(scopeButton.text).toBe('Grid columns');
        expect(toolbar.getSearchFilter()).toBe(filter);
        expect(filter.fields).toEqual(['title']);
        expect(ids(store)).toEqual([101, 102, 103])
    });

    test('clear removes every grid filter role while application predicates survive; empty scope stays inert', async () => {
        const store = await storeFor({filters: [
                {ownerRole: 'application', property: 'state', value: 'open'},
                {ownerRole: 'header-inline', property: 'title', operator: 'like', value: 'Falcon'},
                {ownerRole: 'header-picker', property: 'area', operator: 'typedIncluded', value: ['grid']},
                {module: SearchFilter, ownerRole: 'grid-search', property: null, fields: ['title', 'summary'], value: 'Falcon retry'}
            ]}),
            toolbar = await toolbarFor(store),
            appFilter = store.getFilter('state', 'application');

        expect(ids(store)).toEqual([101]);
        expect(clearIsVisible(toolbar)).toBe(true);
        toolbar.clearFilters();
        expect(store.getFilter('title', 'header-inline')).toBeNull();
        expect(store.getFilter('area', 'header-picker')).toBeNull();
        expect(store.getFilter(null, 'grid-search')).toBeNull();
        expect(store.getFilter('state', 'application')).toBe(appFilter);
        expect(ids(store)).toEqual([101, 103, 104, 105]);
        expect(clearIsVisible(toolbar)).toBe(false);
        expect(toolbar.getItem('entries').items.some(item => item.text.startsWith('Application restriction'))).toBe(true);

        const result = toolbar.writeSearch({value: 'Falcon retry', fields: []});
        expect(result).toEqual({status: 'written'});
        const filter = store.getFilter(null, 'grid-search');
        expect(filter.fields).toEqual([]);
        expect(filter.value).toBe('Falcon retry');
        expect(filter.effective).toBe(false);
        expect(ids(store)).toEqual([101, 103, 104, 105]);
        expect(clearIsVisible(toolbar)).toBe(false);
        expect(toolbar.getItem('entries').items.some(item => item.text === 'No field is searchable')).toBe(true);

        toolbar.writeSearch({fields: ['title']});
        expect(filter.fields).toEqual(['title']);
        expect(filter.effective).toBe(true);
        expect(ids(store)).toEqual([103]);
        expect(clearIsVisible(toolbar)).toBe(true);

        toolbar.writeSearch({value: 'Falcon', caseSensitive: false});
        expect(ids(store)).toEqual([101, 103]);

        const appFilterCount = store.filters.length;
        expect(toolbar.writeSearch({fields: ['missing']})).toEqual({status: 'refused', reason: 'unknown-field'});
        expect(store.filters).toHaveLength(appFilterCount);
        expect(store.getFilter(null, 'grid-search')).toBe(filter);
        expect(filter.fields).toEqual(['title']);
        expect(filter.value).toBe('Falcon');
        expect(toolbar.refusal).toBe('unknown-field');
        expect(toolbar.getItem('entries').items.some(item => item.text === 'Search unavailable: unknown-field')).toBe(true)
    });

    test('each toolbar removes only its Store listener and recreate/swap projects the destination Store without moving intent', async () => {
        const firstStore = await storeFor({filters: [
                {module: SearchFilter, ownerRole: 'grid-search', property: null, fields: ['title'], value: 'Falcon'}
            ]}),
            secondStore = await storeFor({filters: [
                {module: SearchFilter, ownerRole: 'grid-search', property: null, fields: ['summary'], value: 'ordinary'}
            ]}),
            firstFilter = firstStore.getFilter(null, 'grid-search'),
            secondFilter = secondStore.getFilter(null, 'grid-search'),
            firstToolbar = await toolbarFor(firstStore),
            secondToolbar = await toolbarFor(firstStore);

        expect(firstToolbar.getItem('query').value).toBe('Falcon');
        expect(secondToolbar.getItem('query').value).toBe('Falcon');
        firstToolbar.destroy();

        secondToolbar.store = secondStore;
        expect(secondToolbar.getSearchFilter()).toBe(secondFilter);
        expect(secondToolbar.getItem('query').value).toBe('ordinary');
        expect(firstStore.getFilter(null, 'grid-search')).toBe(firstFilter);
        expect(secondStore.getFilter(null, 'grid-search')).toBe(secondFilter);

        // Subsequent writes on the old Store cannot drive a toolbar that has moved.
        firstFilter.value = 'Queue';
        expect(secondToolbar.getItem('query').value).toBe('ordinary');
        secondFilter.value = 'retry';
        expect(secondToolbar.getItem('query').value).toBe('retry');

        const recreated = await toolbarFor(secondStore);
        expect(recreated.getSearchFilter()).toBe(secondFilter);
        expect(recreated.getItem('query').value).toBe('retry')
    });

    test('Grid opt-in, shared Store swap, destroy/recreate and runtime toolbar toggles preserve each Store intent', async () => {
        const firstStore = await storeFor(),
            secondStore  = await storeFor({filters: [
                {module: SearchFilter, ownerRole: 'grid-search', property: null, fields: ['summary'], value: 'ordinary'}
            ]}),
            firstGrid = await initializedGridFor(firstStore),
            secondGrid = await initializedGridFor(firstStore);

        expect(firstGrid.searchToolbar).toBeNull();
        expect(firstGrid.items[0]).toBe(firstGrid.headerWrapper);

        firstGrid.searchToolbar = {};
        secondGrid.searchToolbar = {};
        const firstToolbar = firstGrid.searchToolbar,
            secondToolbar  = secondGrid.searchToolbar;

        expect(firstToolbar).toBeInstanceOf(SearchToolbar);
        expect(firstGrid.items[0]).toBe(firstToolbar);
        expect(secondGrid.items[0]).toBe(secondToolbar);

        firstToolbar.writeSearch({value: 'Falcon', fields: ['title'], caseSensitive: false});
        const firstFilter = firstStore.getFilter(null, 'grid-search');
        expect(secondToolbar.getSearchFilter()).toBe(firstFilter);
        expect(secondToolbar.getItem('query').value).toBe('Falcon');
        expect(ids(firstStore)).toEqual([101, 102, 103]);

        firstGrid.store = secondStore;
        const secondFilter = secondStore.getFilter(null, 'grid-search');
        expect(firstToolbar.store).toBe(secondStore);
        expect(firstToolbar.getSearchFilter()).toBe(secondFilter);
        expect(firstToolbar.getItem('query').value).toBe('ordinary');
        expect(ids(secondStore)).toEqual([105]);

        firstGrid.destroy();
        const recreatedGrid = await initializedGridFor(secondStore);
        expect(recreatedGrid.searchToolbar).toBeNull();
        recreatedGrid.searchToolbar = {};
        const recreatedToolbar = recreatedGrid.searchToolbar;
        expect(recreatedGrid.items[0]).toBe(recreatedToolbar);
        expect(recreatedToolbar.getSearchFilter()).toBe(secondFilter);
        expect(recreatedToolbar.getItem('query').value).toBe('ordinary');

        // The original grid remains bound to its first Store and its result set after the other grid is rebuilt.
        expect(secondGrid.store).toBe(firstStore);
        expect(secondGrid.searchToolbar.getSearchFilter()).toBe(firstFilter);
        expect(ids(firstStore)).toEqual([101, 102, 103]);

        recreatedGrid.searchToolbar = null;
        expect(recreatedGrid.searchToolbar).toBeNull();
        expect(recreatedGrid.items.includes(recreatedToolbar)).toBe(false);
        expect(recreatedToolbar.isDestroyed).toBe(true);
        secondFilter.value = 'retry';
        expect(recreatedToolbar.getItem('query').value).toBe('ordinary');
        expect(ids(secondStore)).toEqual([101, 102, 104]);

        recreatedGrid.searchToolbar = {};
        expect(recreatedGrid.searchToolbar).not.toBe(recreatedToolbar);
        expect(recreatedGrid.items[0]).toBe(recreatedGrid.searchToolbar);
        expect(recreatedGrid.searchToolbar.getSearchFilter()).toBe(secondFilter);
        expect(recreatedGrid.searchToolbar.getItem('query').value).toBe('retry');
        expect(ids(firstStore)).toEqual([101, 102, 103])
    });
});
