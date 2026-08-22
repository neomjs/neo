import {setup} from '../../setup.mjs';

const appName = 'AnimatePluginTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Animate            from '../../../../src/list/plugin/Animate.mjs';
import BaseList           from '../../../../src/list/Base.mjs';
import ComponentList      from '../../../../src/list/Component.mjs';
import Component          from '../../../../src/component/Base.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import Model              from '../../../../src/data/Model.mjs';
import Store              from '../../../../src/data/Store.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

// The setup() mock set carries no Stylesheet addon — recording it here makes the plugin's
// inserted/deleted rule payloads the witness surface for the containing-block + transition rules.
const
    insertedRules = [],
    deletedRules  = [];

Neo.ns('Neo.main.addon.Stylesheet', true);
Neo.main.addon.Stylesheet.insertCssRules = ({rules}) => insertedRules.push(...rules);
Neo.main.addon.Stylesheet.deleteCssRules = ({rules}) => deletedRules.push(...rules);

class RosterModel extends Model {
    static config = {
        className: 'Test.Unit.List.AnimatePlugin.RosterModel',
        fields   : [
            {name: 'id',     type: 'Integer'},
            {name: 'name',   type: 'String'},
            {name: 'online', type: 'Boolean'}
        ]
    }
}
RosterModel = Neo.setupClass(RosterModel);

class RosterStore extends Store {
    static config = {
        className  : 'Test.Unit.List.AnimatePlugin.RosterStore',
        keyProperty: 'id',
        model      : RosterModel
    }
}
RosterStore = Neo.setupClass(RosterStore);

class PlainList extends BaseList {
    static config = {
        className  : 'Test.Unit.List.AnimatePlugin.PlainList',
        itemHeight : 126,
        itemTagName: 'div'
    }
}
PlainList = Neo.setupClass(PlainList);

class CardItem extends Component {
    static config = {
        className: 'Test.Unit.List.AnimatePlugin.CardItem',
        cls      : ['test-animate-card']
    }
}
CardItem = Neo.setupClass(CardItem);

class CardList extends ComponentList {
    static config = {
        className  : 'Test.Unit.List.AnimatePlugin.CardList',
        itemHeight : 126,
        itemTagName: 'div',
        // key-stable item ids (the FM roster consumer shape: durable agentId keys)
        useInternalId: false
    }

    /**
     * The calendar-List sibling pattern: create once, reuse by index on later passes.
     * @param {Object} record
     * @param {Number} index
     * @returns {Object[]}
     */
    createItemContent(record, index) {
        let me    = this,
            items = me.items || [],
            comp  = items[index],

        config = {
            id  : me.getComponentId(index),
            text: record.name
        };

        if (comp) {
            comp.setSilent(config)
        } else {
            items[index] = comp = Neo.create({
                module  : CardItem,
                appName : me.appName,
                parentId: me.id,
                windowId: me.windowId,
                ...config
            })
        }

        me.items       = items;
        me.updateDepth = 2;

        return [comp.createVdomReference()]
    }
}
CardList = Neo.setupClass(CardList);

const rosterData = () => [
    {id: 1, name: 'Ada',   online: true},
    {id: 2, name: 'Clio',  online: true},
    {id: 3, name: 'Emmy',  online: false},
    {id: 4, name: 'Grace', online: true},
    {id: 5, name: 'Vega',  online: false}
];

let runId = 0;

/**
 * One constructed fixture: a store-fed list carrying the Animate plugin with deterministic
 * geometry (applyGeometry replaces the mount-time getDomRect pass — mount never runs here).
 */
async function createFixture({listClass = PlainList, listConfig = {}, pluginConfig = {}, rect = {width: 935, height: 400}}) {
    runId++;

    const store = Neo.create(RosterStore, {
        autoInitRecords: true,
        data           : rosterData()
    });

    const list = Neo.create(listClass, {
        appName,
        id     : `test-animate-list-${runId}`,
        store,
        plugins: [{module: Animate, itemMargin: 10, transitionDuration: 50, ...pluginConfig}],
        ...listConfig
    });

    const plugin = list.getPlugin('list-animate');

    await list.initVnode();

    plugin.applyGeometry(rect);
    list.createItems();
    await list.timeout(60);

    return {list, plugin, store}
}

function itemNodes(list) {
    return list.getVdomRoot().cn.filter(Boolean)
}

function transformOf(list, recordId) {
    const
        record = list.store.get(recordId),
        node   = itemNodes(list).find(node => node.id === list.getItemId(record));

    return node?.style?.transform
}

test.describe('Neo.list.plugin.Animate', () => {

    test('fixed-mode geometry matches the shipped formula', async () => {
        const {list, plugin} = await createFixture({listConfig: {itemWidth: 300}});

        expect(plugin.hasFixedItemWidth).toBe(true);
        expect(plugin.columns).toBe(3);            // floor(935 / 300)
        expect(plugin.rows).toBe(3);               // floor(400 / 126)
        expect(list.itemWidth).toBe(300);          // fixed mode never rewrites the owner width

        list.destroy()
    });

    test('fluid mode derives columns and writes the owner width — the measured cockpit fixture', async () => {
        const {list, plugin} = await createFixture({
            pluginConfig: {itemMargin: 9, minItemWidth: 420},
            rect        : {width: 903, height: 275}
        });

        expect(plugin.hasFixedItemWidth).toBe(false);
        expect(plugin.columns).toBe(2);            // floor((903 - 9) / (420 + 9))
        expect(list.itemWidth).toBe(438);          // floor((903 - 3 * 9) / 2) — outer margins included
        expect(plugin.rows).toBe(2);

        // a narrow pane floors at one column, never zero
        plugin.applyGeometry({width: 200, height: 275});
        expect(plugin.columns).toBe(1);
        expect(list.itemWidth).toBe(182);          // floor((200 - 2 * 9) / 1)

        // a wide pane earns the third column
        plugin.applyGeometry({width: 1400, height: 275});
        expect(plugin.columns).toBe(3);            // floor((1400 - 9) / 429)
        expect(list.itemWidth).toBe(454);          // floor((1400 - 4 * 9) / 3)

        list.destroy()
    });

    test('construct inserts the containing-block + transition rules and marks the owner', async () => {
        insertedRules.length = 0;

        const {list} = await createFixture({listConfig: {itemWidth: 300}});

        expect(list.cls).toContain('neo-animated-list');
        expect(insertedRules).toContain(`#${list.id} {position:relative}`);
        expect(insertedRules).toContain(`#${list.id} .neo-list-item {transition: opacity 50ms ease-in-out, transform 50ms ease-in-out}`);

        deletedRules.length = 0;
        const {id} = list;
        list.destroy();

        expect(deletedRules).toContain(`#${id}`);
        expect(deletedRules).toContain(`#${id} .neo-list-item`)
    });

    test('items render absolutely positioned at their grid slots', async () => {
        const {list} = await createFixture({listConfig: {itemWidth: 300}});

        // columns = 3, margin 10: index 0 → (10, 10) · index 1 → (320, 10) · index 3 → (10, 146)
        expect(transformOf(list, 1)).toBe('translate(10px, 10px)');
        expect(transformOf(list, 2)).toBe('translate(320px, 10px)');
        expect(transformOf(list, 4)).toBe('translate(10px, 146px)');

        const node = itemNodes(list)[0];
        expect(node.style.position).toBe('absolute');
        expect(node.style.height).toBe('126px');
        expect(node.style.width).toBe('300px');

        list.destroy()
    });

    test('an owner resize delivery reflows every rendered item — no rebuild', async () => {
        const {list, plugin} = await createFixture({listConfig: {itemWidth: 300}});

        const nodesBefore = itemNodes(list);
        expect(nodesBefore).toHaveLength(5);
        expect(plugin.columns).toBe(3);

        // shrink: 620px only fits two 300px columns → index 2 wraps to row 1
        plugin.onOwnerResize({rect: {width: 620, height: 400}});

        expect(plugin.columns).toBe(2);
        expect(transformOf(list, 1)).toBe('translate(10px, 10px)');
        expect(transformOf(list, 3)).toBe('translate(10px, 146px)');

        // the same vdom nodes were moved, not recreated
        expect(itemNodes(list)).toHaveLength(5);
        itemNodes(list).forEach((node, index) => expect(node).toBe(nodesBefore[index]));

        list.destroy()
    });

    test('a fluid resize rewrites the owner width onto every item', async () => {
        const {list, plugin} = await createFixture({
            pluginConfig: {minItemWidth: 300},
            rect        : {width: 935, height: 400}
        });

        expect(plugin.columns).toBe(2);            // floor((935 - 10) / 310)
        expect(list.itemWidth).toBe(452);          // floor((935 - 3 * 10) / 2)

        plugin.onOwnerResize({rect: {width: 1300, height: 400}});

        expect(plugin.columns).toBe(4);            // floor((1300 - 10) / 310)
        expect(list.itemWidth).toBe(312);          // floor((1300 - 5 * 10) / 4)
        itemNodes(list).forEach(node => expect(node.style.width).toBe('312px'));

        list.destroy()
    });

    test('a rect-less resize delivery is a no-op', async () => {
        const {list, plugin} = await createFixture({listConfig: {itemWidth: 300}});
        const columns        = plugin.columns;

        plugin.onOwnerResize({});
        plugin.onOwnerResize(null);

        expect(plugin.columns).toBe(columns);
        list.destroy()
    });

    test('component-list sort keeps the component instances and translates them', async () => {
        const {list, store} = await createFixture({listClass: CardList, listConfig: {itemWidth: 300}});

        const instancesBefore = new Set(list.items);
        expect(instancesBefore.size).toBe(5);

        // component-list item ids are index-coupled (`${listId}__${index}`) and mid-transition
        // they still carry the PRE-sort order — the settle pass re-normalizes them afterwards.
        // vdom node OBJECTS are disposable descriptors in Neo (update passes may recreate them),
        // so the witnesses anchor on the stable li ids, and component continuity is asserted on
        // the instances below.
        const byId = index => itemNodes(list).find(node => node.id === `${list.id}__${index}`);

        store.sorters = [{property: 'name', direction: 'DESC'}];
        await list.timeout(20);

        // geometry mid-transition (columns = 3, margin 10): Vega's li (created at index 4) now
        // targets slot 0; Ada's li (index 0) dropped to the last slot (column 1, row 1)
        expect(byId(4).style.transform).toBe('translate(10px, 10px)');
        expect(byId(0).style.transform).toBe('translate(320px, 146px)');

        // identity: the exact same component instances survive the sort
        expect(list.items).toHaveLength(5);
        list.items.forEach(item => expect(instancesBefore.has(item)).toBe(true));

        // after the settle pass (transitionDuration → createItems), id-based lookups agree with
        // the same geometry against the re-normalized vdom
        await list.timeout(150);
        expect(transformOf(list, 5)).toBe('translate(10px, 10px)');

        list.destroy()
    });

    test('filtering fades removed items out and re-entering items in', async () => {
        const {list, plugin, store} = await createFixture({listConfig: {itemWidth: 300}});

        store.filters = [{property: 'online', operator: '===', value: true}];
        await list.timeout(55);

        // during the transition the filtered-out nodes fade (opacity 0), then the settle pass
        // (triggerTransitionCallback → createItems) drops them from the vdom
        await list.timeout(120);
        expect(itemNodes(list)).toHaveLength(3);

        // clearing the filter re-enters the two offline records
        store.getFilter('online').disabled = true;
        await list.timeout(200);
        expect(itemNodes(list)).toHaveLength(5);

        list.destroy()
    });

    test('mount registers the owner with the ResizeObserver addon, destroy unregisters', async () => {
        const calls = [];

        Neo.currentWorker.getAddon = async () => ({
            register  : data => calls.push({op: 'register',   ...data}),
            unregister: data => calls.push({op: 'unregister', ...data})
        });

        const {list} = await createFixture({listConfig: {itemWidth: 300}});

        list.mounted = true;
        await list.timeout(20);

        expect(calls.some(call => call.op === 'register' && call.id === list.id)).toBe(true);

        const {id} = list;
        list.destroy();
        await list.timeout(20);

        expect(calls.some(call => call.op === 'unregister' && call.id === id)).toBe(true)
    });

    test('a missing ResizeObserver addon degrades to mount-time geometry without throwing', async () => {
        Neo.currentWorker.getAddon = async () => {
            throw new Error('addon unavailable')
        };

        const {list, plugin} = await createFixture({listConfig: {itemWidth: 300}});

        await expect(plugin.addResizeObserver(true)).resolves.toBeUndefined();
        expect(plugin.columns).toBe(3);

        list.destroy()
    })
});
