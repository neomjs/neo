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

// setup() carries production-shaped no-op Stylesheet methods for composition specs. Replacing them
// here makes the plugin's inserted/deleted rule payloads the witness surface for the containing-block
// + transition rules. Installed in beforeAll and restored in afterAll, so nothing leaks past this file.
const
    insertedRules = [],
    deletedRules  = [];

let priorInsertCssRules, priorDeleteCssRules, priorGetAddon;

test.beforeAll(() => {
    Neo.ns('Neo.main.addon.Stylesheet', true);

    priorInsertCssRules = Neo.main.addon.Stylesheet.insertCssRules;
    priorDeleteCssRules = Neo.main.addon.Stylesheet.deleteCssRules;
    priorGetAddon       = Neo.currentWorker.getAddon;

    Neo.main.addon.Stylesheet.insertCssRules = ({rules}) => insertedRules.push(...rules);
    Neo.main.addon.Stylesheet.deleteCssRules = ({rules}) => deletedRules.push(...rules)
});

test.afterAll(() => {
    Neo.main.addon.Stylesheet.insertCssRules = priorInsertCssRules;
    Neo.main.addon.Stylesheet.deleteCssRules = priorDeleteCssRules;
    Neo.currentWorker.getAddon               = priorGetAddon
});

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

// neutral fixture identities — never real maintainer names or statuses
const rosterData = () => [
    {id: 1, name: 'alpha',   online: true},
    {id: 2, name: 'bravo',   online: true},
    {id: 3, name: 'charlie', online: false},
    {id: 4, name: 'delta',   online: true},
    {id: 5, name: 'echo',    online: false}
];

let runId = 0;

/**
 * One constructed fixture: a store-fed list carrying the Animate plugin with deterministic
 * geometry (applyGeometry replaces the mount-time getDomRect pass — mount never runs here unless
 * `mounted` asks for it: an update's promise parks until the owner is mounted, and the measured
 * mode settles on that promise).
 */
async function createFixture({listClass = PlainList, listConfig = {}, mounted = false, pluginConfig = {}, storeConfig = {}, rect = {width: 935, height: 400}}) {
    runId++;

    const store = Neo.create(RosterStore, {
        autoInitRecords: true,
        ...storeConfig,
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

    if (mounted) {
        list.mounted = true;
        await list.timeout(60)
    }

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
        const
            calls = [],
            prior = Neo.currentWorker.getAddon;

        try {
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
        } finally {
            Neo.currentWorker.getAddon = prior
        }
    });

    test('a missing ResizeObserver addon degrades to mount-time geometry without throwing', async () => {
        const prior = Neo.currentWorker.getAddon;

        try {
            Neo.currentWorker.getAddon = async () => {
                throw new Error('addon unavailable')
            };

            const {list, plugin} = await createFixture({listConfig: {itemWidth: 300}});

            await expect(plugin.addResizeObserver(true)).resolves.toBeUndefined();
            expect(plugin.columns).toBe(3);

            list.destroy()
        } finally {
            Neo.currentWorker.getAddon = prior
        }
    });

    test('a narrow fixed rect floors at one column — positions stay finite', async () => {
        const {list, plugin} = await createFixture({
            listConfig: {itemWidth: 300},
            rect      : {width: 200, height: 400}
        });

        expect(plugin.columns).toBe(1);                       // never floor(200/300) = 0
        expect(transformOf(list, 1)).toBe('translate(10px, 10px)');
        expect(transformOf(list, 2)).toBe('translate(10px, 146px)');
        itemNodes(list).forEach(node => expect(node.style.transform).not.toContain('NaN'));

        list.destroy()
    });

    test('a tiny fluid rect floors both the column count and the item width', async () => {
        const {list, plugin} = await createFixture({
            pluginConfig: {itemMargin: 9, minItemWidth: 420},
            rect        : {width: 10, height: 400}
        });

        expect(plugin.columns).toBe(1);
        expect(list.itemWidth).toBe(1);                       // floor((10 - 18) / 1) would be negative
        itemNodes(list).forEach(node => {
            expect(node.style.width).toBe('1px');
            expect(node.style.transform).not.toContain('NaN')
        });

        list.destroy()
    });

    test('invalid minItemWidth values are refused and the previous value survives', async () => {
        const {list, plugin} = await createFixture({
            pluginConfig: {minItemWidth: 300},
            rect        : {width: 935, height: 400}
        });

        for (const bad of [-5, 0, NaN, Infinity, 'wide']) {
            plugin.minItemWidth = bad;
            expect(plugin.minItemWidth).toBe(300)
        }

        plugin.minItemWidth = null;                           // fixed-mode opt-out stays legal
        expect(plugin.minItemWidth).toBeNull();

        list.destroy()
    });

    test('raw-record stores (autoInitRecords: false) reflow exactly like records', async () => {
        const {list, plugin} = await createFixture({
            listConfig : {itemWidth: 300},
            storeConfig: {autoInitRecords: false}
        });

        expect(itemNodes(list)).toHaveLength(5);

        plugin.onOwnerResize({rect: {width: 620, height: 400}});

        expect(plugin.columns).toBe(2);
        // every node was re-addressed through getRecordId → getItemId — none silently skipped
        const transforms = itemNodes(list).map(node => node.style.transform);
        expect(transforms[2]).toBe('translate(10px, 146px)'); // index 2 wrapped to row 1
        transforms.forEach(t => expect(t).toMatch(/^translate\(\d+px, \d+px\)$/));

        list.destroy()
    });

    test('component-list filtering settles the component rows against the correct records', async () => {
        const {list, store} = await createFixture({listClass: CardList, listConfig: {itemWidth: 300}});

        store.filters = [{property: 'online', operator: '===', value: true}];
        await list.timeout(200);                              // fade + settle (transitionDuration 50)

        expect(itemNodes(list)).toHaveLength(3);
        expect(list.items.slice(0, 3).map(item => item.text)).toEqual(['alpha', 'bravo', 'delta']);

        store.getFilter('online').disabled = true;
        await list.timeout(250);

        expect(itemNodes(list)).toHaveLength(5);
        expect(list.items.map(item => item.text)).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo']);

        list.destroy()
    });

    test('a filter pass that swaps the visible set fades the leaving rows and shows the entering ones', async () => {
        const
            {list, store} = await createFixture({listConfig: {itemWidth: 300}, pluginConfig: {transitionDuration: 300}}),
            nodeIds       = Object.fromEntries(store.items.map(record => [record.id, list.getItemId(record)])),
            opacityOf     = id => itemNodes(list).find(node => node.id === nodeIds[id])?.style?.opacity;

        store.filters = [{property: 'online', operator: '===', value: true}];
        await list.timeout(450);                              // fade + settle
        expect(itemNodes(list)).toHaveLength(3);

        // online → offline: alpha, bravo, delta leave while charlie, echo enter — the entering rows
        // are already in the vdom when the leaving ones fade, so an old index names the wrong row
        store.getFilter('online').value = false;
        await list.timeout(120);                              // past the 50ms frame, inside the transition

        expect([1, 2, 4].map(opacityOf)).toEqual([0, 0, 0]);
        expect([3, 5].map(opacityOf)).toEqual([1, 1]);

        list.destroy()
    });

    test('a list rebuilt before the fade frame lands fades no surviving row', async () => {
        const
            {list, store} = await createFixture({listConfig: {itemWidth: 300}, pluginConfig: {transitionDuration: 300}}),
            nodeIds       = Object.fromEntries(store.items.map(record => [record.id, list.getItemId(record)])),
            opacityOf     = id => itemNodes(list).find(node => node.id === nodeIds[id])?.style?.opacity;

        store.filters = [{property: 'online', operator: '===', value: true}];
        list.createItems();                                   // a load or a sort landing inside the 50ms frame
        await list.timeout(120);

        // charlie and echo are gone from the vdom: their old indexes 2 and 4 name delta and nothing
        expect(itemNodes(list)).toHaveLength(3);
        expect([1, 2, 4].map(opacityOf)).not.toContain(0);

        list.destroy()
    })
});

// The measured mode reads the item rects through the owner's getDomRect; the harness answers it from this
// map, keyed by record id, 78px for every record it does not name. Installed as the list's own
// getDomRect, so `this` is the list and an item id resolves back to its record.
const measuredHeights = new Map();

const measuredRects = async function(ids) {
    const list = this;

    // the single-id read is the owner's own rect (the mount-time geometry pass)
    if (!Array.isArray(ids)) {
        return {height: 400, width: 935}
    }

    return ids.map(id => {
        const record = list.store.items.find(item => list.getItemId(list.getRecordId(item)) === id);

        return {height: measuredHeights.get(record?.id) ?? 78, width: 300}
    })
};

const measuredConfig = () => ({listConfig: {getDomRect: measuredRects, itemHeight: null, itemWidth: 300}, mounted: true, pluginConfig: {measureItemHeight: true}});

// A rect read that does not answer until the test says so — the controlled interleavings: every item
// read parks its resolver here (the owner's own rect still answers at once), and `answer(i, height)`
// lets read `i` land with one height for every item, in whatever order the arm chooses.
const pendingReads = [];

const deferredRects = function(ids) {
    if (!Array.isArray(ids)) {
        return Promise.resolve({height: 400, width: 935})
    }

    return new Promise(resolve => pendingReads.push({count: ids.length, resolve}))
};

const answer = (index, height) => {
    const read = pendingReads.at(index);
    read.resolve(Array.from({length: read.count}, () => ({height, width: 300})))
};

const deferredConfig = () => ({listConfig: {getDomRect: deferredRects, itemHeight: null, itemWidth: 300}, mounted: true, pluginConfig: {measureItemHeight: true}});

test.describe('Neo.list.plugin.Animate — measured row height', () => {
    test.beforeEach(() => measuredHeights.clear());

    /**
     * @summary Runs `fn` and returns what the Animate guard complained about while it ran.
     *
     * `console.error` is the whole process's, and one worker runs many spec files, so the capture sees messages
     * this arm never caused — a wedge watchdog is a five-second timer armed by whichever component was updating
     * when it started. Only the guard's own messages decide a question about the guard.
     * @param {Function} fn
     * @returns {Promise<String[]>}
     */
    async function captureGuardErrors(fn) {
        const captured = [],
              prior    = console.error;

        console.error = (...args) => captured.push(String(args[0]));

        try {
            await fn()
        } finally {
            console.error = prior
        }

        // The guard names itself; a blacklist of everything else would grow with every new logger in the process
        return captured.filter(message => message.includes('list.plugin.Animate'))
    }

    test('the guard admits itemHeight null with measureItemHeight, and refuses it without', async () => {
        const admitted = await captureGuardErrors(async () => {
            const {list} = await createFixture(measuredConfig());
            list.destroy()
        });

        expect(admitted, 'a measured config draws no complaint').toEqual([]);

        const refused = await captureGuardErrors(async () => {
            const {list: bare} = await createFixture({listConfig: {getDomRect: measuredRects, itemHeight: null, itemWidth: 300}});
            bare.destroy()
        });

        expect(refused.some(message => message.includes('measureItemHeight')), 'itemHeight null without it is refused').toBe(true)
    });

    test('an error from elsewhere in the process does not decide this guard', async () => {
        const admitted = await captureGuardErrors(async () => {
            const {list} = await createFixture(measuredConfig());

            // What another spec file's wedge watchdog looks like from inside this window
            console.error('vdom update wedged: "a-component-from-another-spec" has been in-flight for over 5000ms.');

            list.destroy()
        });

        expect(admitted, 'only the guard\'s own messages decide it').toEqual([])
    });

    test('the settle pass measures the tallest item into rowHeight, positions by it and reveals; the first pass was hidden and height-less', async () => {
        measuredHeights.set(2, 110);                        // one taller card decides the row

        const {list, plugin} = await createFixture(measuredConfig());

        expect(plugin.hasFixedItemHeight).toBe(false);
        expect(plugin.measuresItemHeight).toBe(true);
        expect(plugin.rowHeight).toBe(110);
        expect(plugin.rows).toBe(3);                        // floor(400 / 110)

        // columns = 3, margin 10: row 1 sits at y = 10 + 110 + 10
        expect(transformOf(list, 1)).toBe('translate(10px, 10px)');
        expect(transformOf(list, 4)).toBe('translate(10px, 130px)');

        itemNodes(list).forEach(node => {
            expect(node.style.height,     'an item stays as tall as its content').toBeUndefined();
            expect(node.style.visibility, 'the measurement revealed it').toBeUndefined()
        });

        // the first pass, replayed: no row height yet → hidden, and no height
        plugin.measuredRowHeight = null;
        const item = list.createItem(list.store.getAt(0), 0);
        expect(item.style.visibility).toBe('hidden');
        expect(item.style.height).toBeUndefined();

        list.destroy()
    });

    test('a record change that wraps grows the row as a reposition; an equal measurement repositions nothing; a resize that unwraps shrinks it back', async () => {
        const {list, plugin, store} = await createFixture(measuredConfig());

        let   repositions = 0;
        const reposition  = plugin.repositionItems;
        plugin.repositionItems = function(...args) { repositions++; return reposition.apply(this, args) };

        expect(plugin.rowHeight).toBe(78);

        await plugin.measureRows();
        expect(repositions, 'an equal measurement repositions nothing').toBe(0);

        measuredHeights.set(2, 140);
        store.get(2).name = 'charlie, wrapping onto a second line';
        await list.timeout(60);

        expect(plugin.rowHeight).toBe(140);
        expect(repositions).toBe(1);
        expect(transformOf(list, 4)).toBe('translate(10px, 160px)');
        expect(itemNodes(list)).toHaveLength(5);

        measuredHeights.clear();                            // wider items unwrap
        plugin.onOwnerResize({rect: {width: 935, height: 400}});
        await list.timeout(60);

        expect(plugin.rowHeight, 'the row shrinks back — no height was written into the items').toBe(78);
        expect(repositions, 'the resize reflow and the measurement').toBe(3);
        expect(transformOf(list, 4)).toBe('translate(10px, 98px)');

        list.destroy()
    });

    test('fixed mode never measures: rowHeight is the owner itemHeight and the items carry it inline', async () => {
        let reads = 0;

        const {list, plugin} = await createFixture({
            listConfig: {getDomRect: async function(ids) { Array.isArray(ids) && reads++; return measuredRects.call(this, ids) }, itemWidth: 300},
            mounted   : true
        });

        expect(plugin.hasFixedItemHeight).toBe(true);
        expect(plugin.measuresItemHeight).toBe(false);
        expect(plugin.rowHeight).toBe(126);
        expect(reads, 'no item rect was ever read').toBe(0);
        itemNodes(list).forEach(node => expect(node.style.height).toBe('126px'));

        list.destroy()
    });

    test('a runtime switch: itemHeight null + measureItemHeight true measures; a fixed itemHeight again restores the inline heights', async () => {
        measuredHeights.set(3, 96);

        const {list, plugin} = await createFixture({listConfig: {getDomRect: measuredRects, itemWidth: 300}, mounted: true});

        list.itemHeight          = null;
        plugin.measureItemHeight = true;
        await list.timeout(60);

        expect(plugin.rowHeight).toBe(96);
        itemNodes(list).forEach(node => expect(node.style.height).toBeUndefined());

        list.itemHeight          = 126;
        plugin.measureItemHeight = false;
        await list.timeout(60);

        expect(plugin.rowHeight).toBe(126);
        itemNodes(list).forEach(node => expect(node.style.height).toBe('126px'));

        list.destroy()
    });

    test('fixed mode follows a live itemHeight change: 126 → 200 rebuilds 200px items spaced as 200px rows, no mode toggle involved', async () => {
        const {list, plugin} = await createFixture({listConfig: {itemWidth: 300}});

        expect(transformOf(list, 4)).toBe('translate(10px, 146px)');

        list.itemHeight = 200;
        list.createItems();
        await list.timeout(20);

        expect(plugin.rowHeight, 'the row height is the owner\'s live height').toBe(200);
        itemNodes(list).forEach(node => expect(node.style.height).toBe('200px'));
        expect(transformOf(list, 4), 'row 1 sits at 10 + 200 + 10').toBe('translate(10px, 220px)');

        plugin.onOwnerResize({rect: {width: 935, height: 400}});

        expect(plugin.rows, 'floor(400 / 200)').toBe(2);
        expect(transformOf(list, 4)).toBe('translate(10px, 220px)');

        list.destroy()
    });

    test('a read still pending across a switch to fixed mode publishes nothing when it lands', async () => {
        pendingReads.length = 0;

        const {list, plugin} = await createFixture(deferredConfig());

        expect(pendingReads.length, 'the settle pass asked for a read').toBeGreaterThan(0);
        expect(plugin.rowHeight, 'no answer yet').toBeNull();

        list.itemHeight          = 126;
        plugin.measureItemHeight = false;
        await list.timeout(60);

        expect(plugin.rowHeight).toBe(126);
        expect(transformOf(list, 4)).toBe('translate(10px, 146px)');

        pendingReads.forEach((read, index) => answer(index, 180));
        await list.timeout(30);

        expect(plugin.rowHeight, 'the stale measured answer did not overwrite the fixed height').toBe(126);
        expect(plugin.measuredRowHeight).toBeNull();
        expect(transformOf(list, 4), 'row 1 never moved').toBe('translate(10px, 146px)');
        itemNodes(list).forEach(node => expect(node.style.height).toBe('126px'));

        list.destroy()
    });

    test('two reads resolving in reverse order: the newer request wins, the older answer is dropped', async () => {
        pendingReads.length = 0;

        const {list, plugin} = await createFixture(deferredConfig());

        pendingReads.forEach((read, index) => answer(index, 78));
        await list.timeout(30);
        expect(plugin.rowHeight, 'the settle reads landed').toBe(78);

        pendingReads.length = 0;

        const older = plugin.measureRows(),
              newer = plugin.measureRows();

        await list.timeout(10);
        expect(pendingReads.length).toBe(2);

        answer(1, 180);                                     // the newer read answers first
        await newer;
        expect(plugin.rowHeight).toBe(180);
        expect(transformOf(list, 4)).toBe('translate(10px, 200px)');

        answer(0, 78);                                      // the older read lands late
        await older;
        expect(plugin.rowHeight, 'the older answer did not win').toBe(180);
        expect(transformOf(list, 4)).toBe('translate(10px, 200px)');

        list.destroy()
    })
});
