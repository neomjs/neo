import {setup} from '../../../setup.mjs';

const appName = 'ListSortZoneTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Instance       from '../../../../../src/manager/Instance.mjs';
import List           from '../../../../../src/list/Base.mjs';
import SortZone       from '../../../../../src/draggable/list/SortZone.mjs';
import TreeModel      from '../../../../../src/data/TreeModel.mjs';
import TreeStore      from '../../../../../src/data/TreeStore.mjs';

/**
 * @summary Neo.draggable.list.SortZone reorders a store-bound list with headers.
 *
 * The main thread's hit test arrives as `targetPath`, so each arm hands the zone the path a pointer over an item
 * would produce: the item with its rect, then the list. Items sit 100px apart in one row, so a pointer at x + 10 is
 * over an item's leading half and x + 90 over its trailing half.
 */

class SortModel extends TreeModel {
    static config = {
        className: 'Test.Unit.Draggable.List.SortZone.SortModel',
        fields   : [
            {name: 'id',       type: 'String'},
            {name: 'isHeader', type: 'Boolean', defaultValue: false},
            {name: 'order',    type: 'Number'},
            {name: 'text',     type: 'String'}
        ]
    }
}

const Model = Neo.setupClass(SortModel);

const
    realAddon       = Neo.main.addon.DragDrop,
    realApplyDeltas = Neo.applyDeltas,
    xOf             = {a1: 0, a2: 100, a3: 200, b1: 0, b2: 100, g1: 0, g2: 0};

/**
 * @returns {Neo.data.TreeStore}
 */
function createStore() {
    return Neo.create(TreeStore, {
        model  : Model,
        sorters: [{property: 'order', reapplyOnRecordChange: true}],
        data   : [
            {id: 'g1', text: 'G1', order: 0, isHeader: true, isLeaf: false, collapsed: false},
            {id: 'a1', text: 'A1', order: 0, parentId: 'g1'},
            {id: 'a2', text: 'A2', order: 1, parentId: 'g1'},
            {id: 'a3', text: 'A3', order: 2, parentId: 'g1'},
            {id: 'g2', text: 'G2', order: 1, isHeader: true, isLeaf: false, collapsed: false},
            {id: 'b1', text: 'B1', order: 0, parentId: 'g2'},
            {id: 'b2', text: 'B2', order: 1, parentId: 'g2'}
        ]
    })
}

test.describe('Neo.draggable.list.SortZone', () => {
    let list, store, zone;

    /**
     * @param {String} id
     * @returns {Object} The path node of an item, as the main thread reports it
     */
    const node = id => ({
        cls : ['neo-list-item'],
        id  : list.getItemId(store.get(id)),
        rect: {height: 100, left: xOf[id], top: 0, width: 100}
    });

    /**
     * @param {String} id
     * @returns {Promise<void>}
     */
    const drag = id => zone.onDragStart({
        clientX   : xOf[id] + 50,
        clientY   : 50,
        path      : [node(id), {cls: [], id: list.id}],
        targetPath: []
    });

    /**
     * @param {String|null} id The item under the pointer, or null for a gap of the list
     * @param {Number} [dx=10] The pointer's offset into the item
     * @param {Boolean} [inside=true] False puts the pointer outside the list
     */
    const move = (id, dx=10, inside=true) => zone.onDragMove({
        clientX   : (id ? xOf[id] : 500) + dx,
        clientY   : 50,
        targetPath: [...(id ? [node(id)] : []), ...(inside ? [{cls: [], id: list.id}] : [])]
    });

    const rendered = () => list.vdom.cn.map(item => store.get(list.getItemRecordId(item.id)).id);
    // A tree store keeps every descendant of a match, so the filters name leaves only and the groups stay as ancestors
    const hideA2 = () => {store.filters = [{operator: 'included', property: 'text', value: ['A1', 'A3', 'B1', 'B2']}]};
    const orders = () => Object.fromEntries(['a1', 'a2', 'a3', 'b1', 'b2'].map(id => [id, store.get(id).order]));

    test.beforeEach(async () => {
        Neo.main.addon.DragDrop = {
            registerZone       : async () => {},
            setConfigs         : async () => ({boundaryContainerRect: {bottom: 300, left: 0, right: 300, top: 0}}),
            setDragProxyElement: async () => {},
            unregisterZone     : async () => {}
        };

        Neo.applyDeltas = async () => {};

        store = createStore();
        list  = Neo.create(List, {
            appName,
            displayField  : 'text',
            draggable     : true,
            dragZoneConfig: {module: SortZone, sortDirection: 'horizontal', timeout: () => Promise.resolve()},
            store,
            useHeaders    : true
        });

        list.getDomRect = async () => ({height: 100, left: 0, top: 0, width: 100});

        await expect.poll(() => list.dragZone).toBeTruthy();
        zone = list.dragZone
    });

    test.afterEach(() => {
        list.destroy();
        store.destroy();
        Neo.applyDeltas         = realApplyDeltas;
        Neo.main.addon.DragDrop = realAddon
    });

    test('a drop over a sibling\'s trailing half moves the record after it, in one updateRows batch', async () => {
        let batches = 0;

        store.on('rowsChange', () => batches++);

        await drag('a1');
        move('a2', 90);

        expect(rendered()).toEqual(['g1', 'a2', 'a1', 'a3', 'g2', 'b1', 'b2']);

        await zone.onDragEnd({});

        expect(batches).toBe(1);
        expect(orders()).toEqual({a1: 1, a2: 0, a3: 2, b1: 0, b2: 1});
        expect(store.items.map(item => item.id)).toEqual(['g1', 'a2', 'a1', 'a3', 'g2', 'b1', 'b2']);
        expect(rendered()).toEqual(['g1', 'a2', 'a1', 'a3', 'g2', 'b1', 'b2']);
        expect(list.vdom.cn.some(item => item.cls.includes('neo-sort-source'))).toBe(false)
    });

    test('a header, another parent\'s item, a gap or the dragged item is no slot; leaving the list is the start order', async () => {
        await drag('a1');
        move('a3');

        const preview = ['g1', 'a2', 'a1', 'a3', 'g2', 'b1', 'b2'];

        expect(rendered()).toEqual(preview);

        for (const id of ['g1', 'b1', null, 'a1']) {
            move(id);
            expect(rendered()).toEqual(preview)
        }

        move('a2', 10, false);

        expect(rendered()).toEqual(['g1', 'a1', 'a2', 'a3', 'g2', 'b1', 'b2']);

        await zone.onDragEnd({});

        expect(orders()).toEqual({a1: 0, a2: 1, a3: 2, b1: 0, b2: 1})
    });

    test('the drag writes no record, and Escape renders the store\'s order back', async () => {
        let changes = 0;

        store.on({recordChange: () => changes++, rowsChange: () => changes++});

        await drag('a1');
        move('a3', 90);

        expect(rendered()).toEqual(['g1', 'a2', 'a3', 'a1', 'g2', 'b1', 'b2']);
        expect(list.vdom.cn[3].cls).toContain('neo-sort-source');

        zone.onDragCancel({});

        expect(changes).toBe(0);
        expect(orders()).toEqual({a1: 0, a2: 1, a3: 2, b1: 0, b2: 1});
        expect(rendered()).toEqual(['g1', 'a1', 'a2', 'a3', 'g2', 'b1', 'b2'])
    });

    test('a sibling the filters hide keeps its place relative to the others', async () => {
        hideA2();

        await drag('a3');
        move('a1');
        await zone.onDragEnd({});

        expect(orders()).toEqual({a1: 1, a2: 2, a3: 0, b1: 0, b2: 1});

        store.clearFilters();

        expect(rendered()).toEqual(['g1', 'a3', 'a1', 'a2', 'g2', 'b1', 'b2'])
    });

    test('a release commits nothing the list stopped showing during the drag', async () => {
        for (const [dragged, hidden] of [['a1', 'A1'], ['a1', 'A2']]) {
            store.clearFilters();

            await drag(dragged);
            move('a2', 90);

            // The dragged record, then the slot's target, leaves the list mid-drag
            store.filters = [{operator: 'excluded', property: 'text', value: [hidden, 'G1', 'G2']}];

            await zone.onDragEnd({});

            expect(orders()).toEqual({a1: 0, a2: 1, a3: 2, b1: 0, b2: 1})
        }
    });

    test('moveRecord() commits without a pointer and fires sort once per change', () => {
        const events = [];

        zone.on('sort', data => events.push(data.records.map(record => record.id)));

        expect(zone.moveRecord(store.get('b2'), store.get('b1'), true)).toBe(true);
        expect(zone.moveRecord(store.get('b2'), store.get('b1'), true)).toBe(false);

        expect(events).toEqual([['b2', 'b1']]);
        expect(orders()).toEqual({a1: 0, a2: 1, a3: 2, b1: 1, b2: 0})
    });

    test('a draggable list keeps neo-draggable on its items after a filter or sort re-render', () => {
        const draggable = () => list.vdom.cn.map(item => item.cls.includes('neo-draggable'));

        hideA2();

        expect(draggable()).toEqual([false, true, true, false, true, true]);

        store.sorters = [{direction: 'DESC', property: 'order', reapplyOnRecordChange: true}];

        expect(rendered()).toEqual(['g2', 'b2', 'b1', 'g1', 'a3', 'a1']);
        expect(draggable()).toEqual([false, true, true, false, true, true])
    })
});
