import {setup} from '../../setup.mjs';
const appName = 'GridHeaderMenuTest';
setup({neoConfig: {allowVdomUpdatesInTests: true, unitTestMode: true, useDomApiRenderer: true, useVdomWorker: false},
    appConfig: {name: appName, vnodeInitialising: false}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import DomEvent        from '../../../../src/manager/DomEvent.mjs';
import VdomHelper      from '../../../../src/vdom/Helper.mjs';
import Grid            from '../../../../src/grid/Container.mjs';
import Store           from '../../../../src/data/Store.mjs';
import Filter          from '../../../../src/collection/Filter.mjs';
import Menu            from '../../../../src/grid/header/plugin/Menu.mjs';
import NumberContainer from '../../../../src/filter/NumberContainer.mjs';

/** @summary Real host composition, typed ownership and source projection before browser input evidence. */
test.describe('Grid header value menu', () => {
    let owned, locale;
    const storeFor = (data=[{id: 1, status: 'Open'}, {id: 2, status: 'Closed'}], config={}) => {
        const store = Neo.create(Store, {keyProperty: 'id', data,
            model: {fields: [{name: 'id'}, {name: 'status'}, {name: 'other'}]}, ...config});
        owned.push(store);
        return store
    };
    const gridFor = (store, config={}) => {
        const grid = Neo.create(Grid, {appName, store, width: 400, height: 160,
            columns: [{dataField: 'status', text: 'Status', width: 180}, {dataField: 'other', text: 'Other', width: 180}], ...config});
        owned.push(grid);
        return grid
    };
    const menuFor = async grid => {
        const header = grid.getButton('status');
        await expect.poll(() => header.getPlugin('plugin-grid-header-menu')).toBeTruthy();
        const menu = header.getPlugin('plugin-grid-header-menu');
        menu.createSurface();
        menu.refreshOptions();
        return {header, menu}
    };
    test.beforeEach(() => {
        owned = [];
        locale = {present: Object.hasOwn(Neo.config, 'locale'), value: Neo.config.locale}
    });
    test.afterEach(() => {
        owned.reverse().forEach(item => {if (!item.isDestroyed) item.destroy()});
        if (locale.present) Neo.config.locale = locale.value;
        else delete Neo.config.locale
    });

    test('default stays native; opt-in composes sibling buttons and keeps native focus identity', async () => {
        const source = storeFor(), grid = gridFor(source), header = grid.getButton('status');
        expect(header.vdom.tag).toBe('button');
        expect(header.getPlugin('plugin-grid-header-menu')).toBeNull();
        grid.columnMenu = true;
        const {menu} = await menuFor(grid);
        expect(header.vdom.id).toBe(`${header.id}__wrapper`);
        expect(header.parent.getVdomItemsRoot().cn.find(node => node.componentId === header.id).id).toBe(header.vdom.id);
        expect(header.getVdomRoot().id).toBe(header.id);
        expect(header.getVdomRoot().tag).toBe('button');
        expect(header.vdom.cls).toContain('neo-draggable');
        expect(menu.trigger.getVdomRoot().tag).toBe('button');
        expect(header.vdom.cn[1].componentId).toBe(menu.trigger.id);
        header.width = 210;
        expect(header.wrapperStyle.width).toBe('210px');
        expect(header.getVdomRoot().width).toBeUndefined();
        grid.columnMenu = false;
        expect(menu.isDestroyed).toBe(true);
        expect(header.getPlugin('plugin-grid-header-menu')).toBeNull()
    });

    test('typed undefined survives options normalization; inline and application contributions remain intact', async () => {
        const source = storeFor([{id: 1, status: undefined}, {id: 2, status: null}, {id: 3, status: 'Open'}]);
        source.filters = [{property: 'status', operator: '!=', value: 'Closed'},
            {property: 'status', ownerRole: 'header-inline', operator: 'like', value: null},
            {property: 'status', ownerRole: 'header-picker', operator: 'typedIncluded', value: [undefined]}];
        const before = source.filters.filter(filter => filter.ownerRole !== 'header-picker'),
            {menu}   = await menuFor(gridFor(source, {columnMenu: true}));
        menu.onSelectionChange({selection: [menu.getOptionKey(undefined)]});
        expect(source.getFilter('status', 'header-picker').value).toEqual([undefined]);
        expect(source.filters).toEqual([...before, source.getFilter('status', 'header-picker')]);
        menu.onSelectionChange({selection: []});
        expect(source.filters).toEqual(before)
    });

    test('a combined source/columns/menu batch settles lazy configs before updating physical headers', async () => {
        const grid = gridFor(storeFor());
        grid.set({store: storeFor(), columns: [
            {dataField: 'status', text: 'Status', width: 180}, {dataField: 'other', text: 'Other', width: 180}
        ], columnMenu: true});
        const {header} = await menuFor(grid);
        expect(header.columnMenu).toBe(true);
        expect(grid.toJSON().columnMenu).toBe(true);
        expect(grid.columns.items[0].toJSON().columnMenu).toBeNull();
        expect(header.toJSON().columnMenu).toBe(true)
    });

    test('the inline writer accepts a default Auto field beside the picker contribution', () => {
        const source = storeFor(), grid = gridFor(source);
        source.filters = [{property: 'status', ownerRole: 'header-picker', operator: 'typedIncluded', value: ['Open']}];
        grid.getButton('status').changeFilterValue({value: 'Open'});
        expect(source.getFilter('status', 'header-inline').value).toBe('Open');
        expect(source.getFilter('status', 'header-picker').value).toEqual(['Open'])
    });

    test('column overrides and locked field retarget use the same observable physical header', async () => {
        const grid = gridFor(storeFor(), {columnMenu: true, columns: [
            {dataField: 'status', text: 'Status', width: 180, locked: 'start', columnMenu: false},
            {dataField: 'other', text: 'Other', width: 180}
        ]}), header = grid.getButton('status');
        expect(header.columnMenu).toBe(false);
        grid.columnMenu = false;
        grid.columnMenu = true;
        expect(header.columnMenu).toBe(false);
        grid.columns.items.find(column => column.dataField === 'status').dataField = 'id';
        expect(grid.getButton('id')).toBe(header);
        expect(header.dataField).toBe('id')
    });

    test('two hosts share selection and contextual counts, including selected zero-count values', async () => {
        const source = storeFor();
        source.filters = [{property: 'status', ownerRole: 'header-picker', operator: 'typedIncluded', value: ['Missing']}];
        const a   = await menuFor(gridFor(source, {columnMenu: true})), b = await menuFor(gridFor(source, {columnMenu: true}));
        const key = a.menu.getOptionKey('Missing');
        expect(a.menu.valuePicker.selection).toEqual([key]);
        expect(b.menu.valuePicker.selection).toEqual([key]);
        expect(a.menu.optionsStore.get(key).count).toBe(0);
        expect(b.menu.optionsStore.get(key).count).toBe(0);
        expect(a.menu.optionsStore.count).toBe(3);
        a.menu.onSelectionChange({selection: []});
        b.menu.refreshOptions();
        expect(b.menu.valuePicker.selection).toEqual([])
    });

    test('each open-surface toggle counts once across contribution creation, edits and removal', async () => {
        const source = storeFor(), {menu} = await menuFor(gridFor(source, {columnMenu: true}));
        menu.surface.align = null;
        menu.surface.hidden = false;
        const getValues = source.getFilterValues.bind(source);
        let   counts    = 0;
        source.getFilterValues = (...args) => {counts++; return getValues(...args)};
        for (const values of [['Open'], ['Open'], ['Open', 'Closed'], ['Closed'], [], []]) {
            counts = 0;
            const selection = values.map(value => menu.getOptionKey(value));
            menu.onSelectionChange({selection});
            await Promise.resolve();
            expect(counts).toBe(1);
            expect(menu.valuePicker.selection).toEqual(selection);
            expect(menu.surface.getItem('clear').hidden).toBe(!selection.length)
        }
    });

    test('outside mouse and touch observers use global transport and detach on each close', async () => {
        const grid = gridFor(storeFor(), {columnMenu: true}), {menu} = await menuFor(grid),
              app  = grid.app, previous = app.mainView;
        app.mainView = grid;
        try {
            for (let cycle=0; cycle<2; cycle++) {
                menu.syncOutsideListener(true);
                for (const name of ['mousedown', 'touchstart']) {
                    const listeners = DomEvent.items[grid.id][name];
                    expect(listeners.filter(listener => listener.scope === menu)).toHaveLength(1);
                    expect(listeners.find(listener => listener.scope === menu).mounted).toBe(true)
                }
                menu.syncOutsideListener(false);
                for (const name of ['mousedown', 'touchstart']) {
                    expect(DomEvent.items[grid.id][name].filter(listener => listener.scope === menu)).toEqual([])
                }
            }
        } finally {
            app.mainView = previous
        }
    });

    test('numeric options sort numerically, including selected zero-count values and infinities', async () => {
        const source = storeFor([20, 2, 100, 10, 1, Infinity, -Infinity].map((status, id) => ({id, status})));
        source.filters = [{property: 'status', ownerRole: 'header-picker', operator: 'typedIncluded', value: [3]}];
        const {menu} = await menuFor(gridFor(source, {columnMenu: true}));
        expect(menu.optionsStore.items.map(item => item.key)).toEqual(
            [-Infinity, 1, 2, 3, 10, 20, 100, Infinity].map(value => menu.getOptionKey(value)));
        expect(menu.optionsStore.get(menu.getOptionKey(3)).count).toBe(0);
        expect(menu.valuePicker.selection).toEqual([menu.getOptionKey(3)])
    });

    test('Date options sort by epoch rather than weekday labels', async () => {
        const values = ['2026-10-16', '2026-10-13', '2026-10-12'].map(value => new Date(value + 'T12:00:00Z')),
              source = storeFor(values.map((status, id) => ({id, status}))),
              {menu} = await menuFor(gridFor(source, {columnMenu: true}));
        expect(menu.optionsStore.items.map(item => item.key)).toEqual(
            [values[2], values[1], values[0]].map(value => menu.getOptionKey(value)))
    });

    test('Date labels show local dates at exact midnight and time for every other timestamp', async () => {
        Neo.config.locale = 'en-US';
        const midnight = new Date(2026, 0, 15), timed = new Date(2026, 0, 15, 13, 14, 15),
              second   = new Date(2026, 0, 15, 0, 0, 1), millisecond = new Date(2026, 0, 15, 0, 0, 0, 1),
              absent   = new Date(2026, 0, 16, 13, 14, 15),
              source   = storeFor([timed, midnight, millisecond, second, new Date(midnight)]
                  .map((status, id) => ({id, status})));
        source.filters = [{property: 'status', ownerRole: 'header-picker', operator: 'typedIncluded', value: [absent]}];
        const {menu} = await menuFor(gridFor(source, {columnMenu: true}));
        for (const [value, label, count] of [
            [midnight, 'Jan 15, 2026', 2], [millisecond, 'Jan 15, 2026, 12:00:00 AM', 1],
            [second, 'Jan 15, 2026, 12:00:01 AM', 1], [timed, 'Jan 15, 2026, 1:14:15 PM', 1],
            [absent, 'Jan 16, 2026, 1:14:15 PM', 0]
        ]) {
            const option = menu.optionsStore.get(menu.getOptionKey(value));
            expect(option.label).toBe(label);
            expect(option.value).toBeInstanceOf(Date);
            expect(option.value.getTime()).toBe(value.getTime());
            expect(option.count).toBe(count)
        }
        expect(menu.optionsStore.items.map(item => item.key)).toEqual(
            [midnight, millisecond, second, timed, absent].map(value => menu.getOptionKey(value)));
        menu.onSelectionChange({selection: [menu.getOptionKey(timed)]});
        expect(source.getFilter('status', 'header-picker').value).toEqual([timed]);
        expect(source.count).toBe(1)
    });

    test('blank, null and undefined labels keep distinct typed keys and filter values', async () => {
        const values = ['', null, undefined, '(blank)', 'null', 'undefined'],
              source = storeFor(values.map((status, id) => ({id, status})), {autoInitRecords: false}),
              {menu} = await menuFor(gridFor(source, {columnMenu: true})),
              keys   = values.map(value => menu.getOptionKey(value));
        expect(new Set(keys).size).toBe(values.length);
        expect(keys.map(key => menu.optionsStore.get(key).label)).toEqual(
            ['(blank)', '(null)', '(undefined)', '(blank)', 'null', 'undefined']);
        for (let index=0; index<values.length; index++) {
            menu.onSelectionChange({selection: [keys[index]]});
            expect(source.getFilter('status', 'header-picker').value[0]).toBe(values[index]);
            expect(source.count).toBe(1);
            expect(menu.optionsStore.get(keys[index]).count).toBe(1)
        }
        expect(source.allItems.items.map(item => item.status)).toEqual(values)
    });

    test('other scalar labels keep their plain string form without calling the column renderer', async () => {
        const values = ['<em>literal</em>', ' ', 12.5, -Infinity, Infinity, false, true],
              source = storeFor(values.map((status, id) => ({id, status}))),
              grid   = gridFor(source, {columnMenu: true});
        let renders = 0;
        grid.columns.items[0].renderer = () => {renders++; return 'Rendered cell'};
        const {menu} = await menuFor(grid);
        expect(values.map(value => menu.optionsStore.get(menu.getOptionKey(value)).label)).toEqual(
            ['<em>literal</em>', ' ', '12.5', '-Infinity', 'Infinity', 'false', 'true']);
        menu.refreshOptions();
        expect(renders).toBe(0)
    });

    test('existing Date options follow locale changes while their identity, counts and selection stay intact', async () => {
        Neo.config.locale = 'en-US';
        const midnight = new Date(2026, 0, 15), timed = new Date(2026, 0, 15, 13, 14, 15),
              source   = storeFor([midnight, timed].map((status, id) => ({id, status})));
        source.filters = [{property: 'status', ownerRole: 'header-picker', operator: 'typedIncluded', value: [timed]}];
        const {menu} = await menuFor(gridFor(source, {columnMenu: true})),
              keys   = [midnight, timed].map(value => menu.getOptionKey(value)),
              labels = () => keys.map(key => menu.optionsStore.get(key).label);
        expect(labels()).toEqual(['Jan 15, 2026', 'Jan 15, 2026, 1:14:15 PM']);
        Neo.config.locale = 'de-DE';
        menu.refreshOptions();
        expect(labels()).toEqual(['15.01.2026', '15.01.2026, 13:14:15']);
        Neo.config.locale = 'default';
        menu.refreshOptions();
        expect(labels()).toEqual([
            new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(midnight),
            new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'medium'}).format(timed)
        ]);
        expect(menu.optionsStore.items.map(item => item.key)).toEqual(keys);
        expect(keys.map(key => menu.optionsStore.get(key).count)).toEqual([1, 1]);
        expect(menu.valuePicker.selection).toEqual([keys[1]]);
        expect(source.getFilter('status', 'header-picker').value).toEqual([timed])
    });

    test('mixed types stay grouped and label fallback uses natural numeric collation', async () => {
        const date = new Date('2026-10-12T12:00:00Z'), values = ['Value 10', undefined, 10, null, date,
            'Value 2', true, 2, false, 'Value 02'], source = storeFor(values.map((status, id) => ({id, status})), {autoInitRecords: false}),
            {menu} = await menuFor(gridFor(source, {columnMenu: true}));
        expect(menu.optionsStore.items.map(item => item.key)).toEqual(
            [false, true, date, null, 2, 10, 'Value 02', 'Value 2', 'Value 10', undefined].map(value => menu.getOptionKey(value)));
        source.data = [...values].reverse().map((status, id) => ({id, status}));
        menu.refreshOptions();
        expect(menu.optionsStore.items.map(item => item.key)).toEqual(
            [false, true, date, null, 2, 10, 'Value 02', 'Value 2', 'Value 10', undefined].map(value => menu.getOptionKey(value)))
    });

    test('a high-cardinality options population keeps offscreen records raw beyond the visible cap', async () => {
        const source   = storeFor(Array.from({length: 1003}, (_, id) => ({id, status: `Value ${id}`}))),
            {menu}     = await menuFor(gridFor(source, {columnMenu: true})),
            population = menu.optionsStore.allItems || menu.optionsStore;
        expect(menu.optionsStore.autoInitRecords).toBe(false);
        expect(population.count).toBe(1003);
        expect(menu.optionsStore.count).toBe(1000);
        const tail = population._items[1002];
        expect(tail.isRecord).toBeFalsy();
        expect(menu.optionsStore.get(menu.getOptionKey('Value 0')).isRecord).toBe(true);
        expect(population._items[1002]).toBe(tail);
        expect(tail.isRecord).toBeFalsy()
    });

    test('source replacement, field retarget and external replacement read current intent without writes', async () => {
        const first = storeFor(), second = storeFor([{id: 3, status: 'Next', other: 'Else'}]),
            grid    = gridFor(first, {columnMenu: true}), {header, menu} = await menuFor(grid);
        menu.onSelectionChange({selection: [menu.getOptionKey('Open')]});
        const previous = first.getFilter('status', 'header-picker');
        grid.store = second;
        menu.refreshOptions();
        expect(menu.valuePicker.selection).toEqual([]);
        expect(first.getFilter('status', 'header-picker')).toBe(previous);
        second.filters = [{property: 'other', ownerRole: 'header-picker', operator: 'typedIncluded', value: ['Else']}];
        header.dataField = 'other';
        menu.refreshOptions();
        expect(menu.valuePicker.selection).toEqual([menu.getOptionKey('Else')]);
        second.filters = [{property: 'other', ownerRole: 'application', operator: 'typedIncluded', value: ['Else']}];
        menu.refreshOptions();
        expect(menu.valuePicker.selection).toEqual([]);
        expect(second.getFilter('other', 'header-picker')).toBeNull()
    });

    test('disposing the host leaves its source contribution alive', async () => {
        const source = storeFor(), {menu} = await menuFor(gridFor(source, {columnMenu: true}));
        menu.onSelectionChange({selection: [menu.getOptionKey('Open')]});
        const filter = source.getFilter('status', 'header-picker'), optionsStore = menu.optionsStore, surface = menu.surface;
        menu.destroy();
        expect(source.isDestroyed).toBeFalsy();
        expect(source.getFilter('status', 'header-picker')).toBe(filter);
        expect(optionsStore.isDestroyed).toBe(true);
        expect(surface.isDestroyed).toBe(true)
    });

    test('opening waits for the composed header and retirement cancels the pending surface', async () => {
        const source = storeFor(), grid = gridFor(source, {columnMenu: true}), header = grid.getButton('status');
        await expect.poll(() => header.getPlugin('plugin-grid-header-menu')).toBeTruthy();
        const menu = header.getPlugin('plugin-grid-header-menu');
        let settle;
        header.parent.promiseUpdate = () => new Promise(resolve => {settle = resolve});
        const flight = menu.open();
        await Promise.resolve();
        expect(menu.surface).toBeNull();
        header.columnMenu = false;
        settle();
        await expect(flight).rejects.toBe(Neo.isDestroyed);
        expect(menu.isDestroyed).toBe(true);
        expect(source.filters).toEqual([])
    });

    test('Escape at the header cancels a pending open before it allocates the surface', async () => {
        const source = storeFor(), grid = gridFor(source, {columnMenu: true}), header = grid.getButton('status');
        await expect.poll(() => header.getPlugin('plugin-grid-header-menu')).toBeTruthy();
        const menu = header.getPlugin('plugin-grid-header-menu');
        let settle;
        header.parent.promiseUpdate = () => new Promise(resolve => {settle = resolve});
        const flight = menu.open();
        menu.onHeaderKeyDown({key: 'Escape'});
        settle();
        await flight;
        expect(menu.surface).toBeNull();
        expect(source.filters).toEqual([])
    });

    for (const reason of ['remote-projection', 'incomplete-population', 'raw-complex-fields', 'noncanonical-field',
        'unsupported-value', 'tree-population', 'unknown-field']) {
        test(`refusal ${reason} renders a message and admits no contribution`, async () => {
            const source = storeFor();
            source.getFilterValues = () => ({refused: true, reason});
            const {menu} = await menuFor(gridFor(source, {columnMenu: true}));
            expect(menu.surface.getItem('status').hidden).toBe(false);
            expect(menu.valuePicker.hidden).toBe(true);
            menu.onSelectionChange({selection: [menu.getOptionKey('Open')]});
            expect(source.filters.length).toBe(0)
        })
    }

    test('a captured intent cannot cross source or field identity even when labels are equal', async () => {
        const first = storeFor(), second = storeFor([{id: 3, status: 'Open', other: 'Open'}]),
            grid    = gridFor(first, {columnMenu: true}), {header, menu} = await menuFor(grid), oldKey = menu.getOptionKey('Open');
        grid.store = second;
        menu.refreshOptions();
        menu.onSelectionChange({selection: [oldKey]});
        expect(second.getFilter('status', 'header-picker')).toBeNull();
        const statusKey = menu.getOptionKey('Open');
        second.filters = [{property: 'other', ownerRole: 'header-picker', operator: 'typedIncluded', value: ['Open']}];
        header.dataField = 'other';
        menu.refreshOptions();
        menu.onSelectionChange({selection: [statusKey]});
        const current = second.getFilter('other', 'header-picker');
        menu.onSelectionChange({selection: [], removed: [statusKey]});
        expect(second.getFilter('other', 'header-picker')).toBe(current);
        expect(current.value).toEqual(['Open'])
    });

    test('a closed surface discards captured intents when its source tuple changes', async () => {
        const first = storeFor(), second = storeFor(), grid = gridFor(first, {columnMenu: true}),
            {menu}  = await menuFor(grid), oldKey = menu.getOptionKey('Open');
        second.filters = [{property: 'status', ownerRole: 'header-picker', operator: 'typedIncluded', value: ['Closed']}];
        const intended = second.getFilter('status', 'header-picker');
        expect(menu.surface.hidden).toBe(true);
        grid.store = second;
        menu.onSelectionChange({selection: [oldKey]});
        menu.onSelectionChange({selection: [], removed: [oldKey]});
        expect(second.getFilter('status', 'header-picker')).toBe(intended);
        expect(intended.value).toEqual(['Closed']);
        menu.refreshOptions();
        expect(menu.valuePicker.selection).toEqual([menu.getOptionKey('Closed')])
    });

    test('option identity and literal labels survive Model normalization', async () => {
        const source = storeFor(), value = '<em>retained</em>';
        source.filters = [{property: 'status', ownerRole: 'header-picker', operator: 'typedIncluded', value: [value]}];
        const {menu} = await menuFor(gridFor(source, {columnMenu: true})), key = menu.getOptionKey(value);
        expect(menu.optionsStore.get(key).label).toBe(value);
        expect(menu.valuePicker.selection).toEqual([key]);
        menu.onSelectionChange({selection: [key]});
        expect(source.getFilter('status', 'header-picker').value).toEqual([value])
    });

    test('the host writes a Date bucket as a Date and keeps its numeric epoch option distinct', async () => {
        const date = new Date('2026-01-01T00:00:00Z'), source = storeFor([
            {id: 1, status: date}, {id: 2, status: date.getTime()}, {id: 3, status: new Date(date)}
        ]), {menu} = await menuFor(gridFor(source, {columnMenu: true})), key = menu.getOptionKey(date);
        expect(key).not.toBe(menu.getOptionKey(date.getTime()));
        menu.onSelectionChange({selection: [key]});
        const value = source.getFilter('status', 'header-picker').value[0];
        expect(value).toBeInstanceOf(Date);
        expect(value.getTime()).toBe(date.getTime());
        expect(source.count).toBe(2)
    });

    test('operator-capable inline controls repaint both children without echo events', () => {
        const field = Neo.create(NumberContainer, {appName, value: 12, operator: '>', fieldConfig: {disabledChars: null}});
        owned.push(field);
        let events = 0;
        field.on('change', () => events++);
        field.on('operatorChange', () => events++);
        field.suspendEvents = true;
        field.set({value: 34, operator: '<'});
        field.suspendEvents = false;
        expect(field.items[0].value).toBe('<');
        expect(field.items[0].text).toBe('<');
        expect(field.items[1].value).toBe(34);
        expect(events).toBe(0)
    })
});
