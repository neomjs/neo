/**
 * @file test/playwright/unit/list/ValuePicker.spec.mjs
 * @summary Host-owned checkbox selection, capped search and logical buffered keyboard contracts.
 */
import {setup} from '../../setup.mjs';

const appName = 'ListValuePickerTest';
setup({
    neoConfig: {allowVdomUpdatesInTests: true, unitTestMode: true, useDomApiRenderer: true, useVdomWorker: false},
    appConfig: {name: appName, vnodeInitialising: false}
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import ValuePicker        from '../../../../src/list/ValuePicker.mjs';
import Store              from '../../../../src/data/Store.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

const rows = list => list.vdom.cn.filter(node => node.cls?.includes('neo-list-item'));
const text = node => node.vtype === 'text' ? node.text : (node.cn || []).map(text).join('');
const data = count => Array.from({length: count}, (_, i) => ({key: 'number:' + i, value: i, label: 'Value ' + i, count: i}));

test.describe('Neo.list.ValuePicker', () => {
    let list, stores, events, navigateTo, calls, sequence = 0;

    const createStore = records => {
        const store = Neo.create(Store, {
            keyProperty: 'key', data: records,
            model      : {fields: [{name: 'key', type: 'String'}, {name: 'value'}, {name: 'label', type: 'String'}, {name: 'count', type: 'Number'}]}
        });
        stores.push(store);
        return store
    };

    const createList = async (config={}, records=data(10001)) => {
        const store = createStore(records);
        list = Neo.create(ValuePicker, {
            appName, id: 'value-picker-test-' + ++sequence, height: 96, bufferRowRange: 2, store, ...config
        });
        list.on('selectionChange', event => events.push(event));
        await list.initVnode();
        list.mounted = true;
        list.onResize({height: 96});
        await list.createItems();
        return store
    };

    test.beforeEach(() => {
        stores = []; events = []; calls = [];
        navigateTo = Neo.main.addon.Navigator.navigateTo;
        Neo.main.addon.Navigator.navigateTo = request => calls.push({...request, key: list?.getItemRecordId(request.target)})
    });

    test.afterEach(() => {
        list?.destroy(); list = null;
        stores.forEach(store => store.destroy());
        Neo.main.addon.Navigator.navigateTo = navigateTo
    });

    test('10,001 options have a fixed-height bounded plain-vdom pool and an honest cap', async () => {
        const store = await createList();
        expect(store.allItems.getCount()).toBe(10001);
        expect(store.getCount()).toBe(1000);
        expect(list.itemHeight).toBe(32);
        expect(rows(list)).toHaveLength(7);
        expect(list.items).toBeNull();
        expect(list.selectionModel).toBeNull();
        expect(rows(list)[0]).toMatchObject({role: 'checkbox', 'aria-checked': false});
        expect(rows(list)[0].cn.map(text)).toEqual(['Value 0', '0']);
        expect(text(list.vdom.cn.at(-1))).toBe('10,001 values match, narrow the search');
        expect(list.vdom.cn.at(-1).cls).not.toContain('neo-list-item');
        expect(list.getMaxScrollTop()).toBe(1001 * 32 - 96)
    });

    test('external checks are silent; pointer intent leaves projection unchanged until echoed', async () => {
        await createList({}, data(5));
        list.selection = ['number:1'];
        expect(events).toEqual([]);
        expect(rows(list)[1]['aria-checked']).toBe(true);
        list.onClick({path: [rows(list)[1]]});
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({added: [], removed: ['number:1'], selection: []});
        expect(list.selection).toEqual(['number:1']);
        expect(rows(list)[1]['aria-checked']).toBe(true);
        list.selection = events[0].selection;
        expect(events).toHaveLength(1);
        expect(rows(list)[1]['aria-checked']).toBe(false);
        list.selectedIndex = 2;
        list.selectedIndex = null;
        expect(events).toHaveLength(1);
        expect(list.selection).toEqual([])
    });

    test('case-insensitive literal search retains selected nonmatches and restores admitted options', async () => {
        const store = await createList({selection: ['number:4'], maxMatchingOptions: 2}, [
            {key: 'number:0', value: 0, label: 'Alpha (one)', count: 3},
            {key: 'number:1', value: 1, label: 'alpha [two]', count: 2},
            {key: 'number:2', value: 2, label: 'Gamma', count: 1},
            {key: 'number:3', value: 3, label: 'Delta', count: 0},
            {key: 'number:4', value: 4, label: 'Selected', count: 0}
        ]);
        list.searchValue = 'ALPHA';
        expect(store.items.map(record => record.key)).toEqual(['number:0', 'number:1', 'number:4']);
        expect(list.vdom.cn.at(-1).cls).toContain('neo-buffered-list-bottom-spacer');
        expect(rows(list).map(node => node['aria-checked'])).toEqual([false, false, true]);
        expect(list.selection).toEqual(['number:4']);
        list.searchValue = '(';
        expect(store.items.map(record => record.key)).toEqual(['number:0', 'number:4']);
        expect(text(rows(list)[0].cn[0])).toBe('Alpha (one)');
        expect(rows(list)[0].cn[0].cn.find(node => node.tag === 'span').cn[0].text).toBe('(');
        list.searchValue = '';
        expect(store.items.map(record => record.key)).toEqual(['number:0', 'number:1', 'number:4']);
        expect(list.selection).toEqual(['number:4']);
        expect(events).toEqual([])
    });

    test('cap admits exactly N unselected matches and every selected key, including equal labels', async () => {
        const store = await createList({maxMatchingOptions: 1, selection: ['string:1', 'number:9']}, [
            {key: 'number:1', value: 1, label: '1', count: 2},
            {key: 'string:1', value: '1', label: '1', count: 0},
            {key: 'number:2', value: 2, label: '2', count: 3},
            {key: 'number:9', value: 9, label: '9', count: 1}
        ]);
        expect(store.items.map(record => record.key)).toEqual(['number:1', 'string:1', 'number:9']);
        expect(rows(list).map(node => node['aria-checked'])).toEqual([false, true, true]);
        expect(text(list.vdom.cn.at(-1))).toBe('4 values match, narrow the search');
        list.maxMatchingOptions = 2;
        expect(store.getCount()).toBe(4);
        expect(list.vdom.cn.at(-1).cls).toContain('neo-buffered-list-bottom-spacer');
        list.maxMatchingOptions = 0;
        expect(store.items.map(record => record.key)).toEqual(['string:1', 'number:9']);
        expect(list.selection).toEqual(['string:1', 'number:9'])
    });

    test('count-zero selected options remain removable; arrivals and label edits recompute admission', async () => {
        const store    = await createList({selection: ['number:4'], searchValue: 'Value 0'}, data(5));
        const selected = store.get('number:4');
        selected.count = 0;
        selected.label = 'Unmatched';
        expect(rows(list).map(node => node.data.recordId)).toEqual(['number:0', 'number:4']);
        expect(rows(list)[1].cn.map(text)).toEqual(['Unmatched', '0']);
        list.onClick({path: [rows(list)[1]]});
        expect(events[0]).toMatchObject({removed: ['number:4'], selection: []});
        store.add({key: 'string:new', value: 'new', label: 'Value 0 new', count: 13});
        expect(rows(list).at(-1).cn.map(text)).toEqual(['Value 0 new', '13']);
        expect(rows(list).at(-1)['aria-checked']).toBe(false);
        const hidden = store.allItems.get('number:2');
        hidden.label = 'Value 0 now';
        expect(store.items.map(record => record.key)).toContain('number:2')
    });

    test('Space and Enter report logical focused toggles; arrow/Home/End cross the buffer', async () => {
        await createList({maxMatchingOptions: 200}, data(200));
        const press = key => list.keys.onKeyDown({key});
        press('Home');
        await expect.poll(() => calls.at(-1)?.key).toBe('number:0');
        for (let i = 0; i < 9; ++i) press('ArrowDown');
        await expect.poll(() => calls.at(-1)?.key).toBe('number:9');
        expect(list.focusIndex).toBe(9);
        expect(list.mountedRange[0]).toBeGreaterThan(0);
        expect(rows(list).find(row => row.id === calls.at(-1).target).data.recordId).toBe('number:9');
        press(' ');
        expect(events.at(-1)).toMatchObject({added: ['number:9'], selection: ['number:9']});
        expect(list.selection).toEqual([]);
        list.selection = events.at(-1).selection;
        press('Enter');
        expect(events.at(-1)).toMatchObject({removed: ['number:9'], selection: []});
        press('End');
        await expect.poll(() => calls.at(-1)?.key).toBe('number:199');
        press('ArrowUp');
        await expect.poll(() => calls.at(-1)?.key).toBe('number:198');
        press('Home');
        await expect.poll(() => calls.at(-1)?.key).toBe('number:0');
        expect(calls.at(-1).fromTarget).toBe(list.id)
    });

    test('focus remains record-owned after narrowing and stale stores cannot refresh the picker', async () => {
        const oldStore = await createList({}, data(20));
        list.focusIndex = 9;
        await expect.poll(() => calls.at(-1)?.key).toBe('number:9');
        list.searchValue = '9';
        expect(list.focusIndex).toBe(0);
        list.keys.onKeyDown({key: ' '});
        expect(events.at(-1).added).toEqual(['number:9']);
        const replacement = createStore([{key: 'string:x', value: 'x', label: '9 replacement', count: 3}]);
        list.store = replacement;
        oldStore.add({key: 'number:99', value: 99, label: '9 old', count: 1});
        expect(list.store).toBe(replacement);
        expect(rows(list).map(row => row.data.recordId)).toEqual(['string:x']);
        expect(oldStore.getCount()).toBe(21);
        expect(oldStore.filters).toHaveLength(0);
        list.destroy(); list = null;
        expect(replacement.isDestroyed).not.toBe(true);
        expect(replacement.filters).toHaveLength(0)
    });

    test('captured pointer and navigation identities do not follow a recycled slot', async () => {
        await createList({maxMatchingOptions: 200}, data(200));
        const old = {...rows(list)[0], data: {...rows(list)[0].data}};
        list.onScrollCapture({target: {id: list.id}, scrollTop: 320});
        expect(rows(list)[0].data.recordId).not.toBe(old.data.recordId);
        list.onClick({path: [old]});
        expect(events.at(-1).added).toEqual(['number:0']);
        list.focusIndex = 12;
        await expect.poll(() => calls.at(-1)?.key).toBe('number:12');
        list.onOptionNavigate({activeItem: old.id, activeRecordId: old.data.recordId});
        list.keys.onKeyDown({key: ' '});
        expect(events.at(-1).added).toEqual(['number:12'])
    });

    test('an invalid newer focus request releases pending scroll ownership', async () => {
        await createList({}, data(200));
        const original = list.promiseUpdate;
        let release;
        const gate = new Promise(resolve => {release = resolve});
        list.promiseUpdate = () => gate;
        const pending = list.updateItemFocus(100);
        list.focusIndex = 9000;
        list.promiseUpdate = original;
        release();
        await pending;
        list.onScrollCapture({target: {id: list.id}, scrollTop: 64});
        expect(list.scrollTop).toBe(64);
        expect(list.focusIndex).toBeNull()
    });
});
