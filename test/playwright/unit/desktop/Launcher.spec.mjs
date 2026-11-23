import {setup} from '../../setup.mjs';

const appName = 'DesktopLauncherTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name    : appName,
        mainView: {id: 'desktop-launcher-main-view', domListeners: [], addDomListeners() {}, removeDomListeners() {}}
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Apps            from '../../../../src/desktop/store/Apps.mjs';
import Launcher        from '../../../../src/desktop/Launcher.mjs';

/**
 * @summary `Neo.desktop.Launcher` on a real apps store: the icons it renders, how they reorder, and how it keeps an
 * arrangement per key. `Neo.main.addon.LocalStorage` stands in as a map, and a read can be held to order the replies.
 */

class CatalogApps extends Apps {
    static config = {
        className: 'Test.Unit.Desktop.Launcher.CatalogApps',
        data     : [
            {id: 'work',  text: 'Work',  iconCls: 'fas fa-briefcase', isLeaf: false, collapsed: false},
            {id: 'mail',  text: 'Mail',  iconCls: 'fas fa-envelope', parentId: 'work', color: '#3b82f6'},
            {id: 'chat',  text: 'Chat',  iconCls: 'fas fa-message',  parentId: 'work', color: '#22c55e'},
            {id: 'notes', text: 'Notes', iconCls: 'fas fa-note',     parentId: 'work', color: '#f97316'}
        ]
    }
}

CatalogApps = Neo.setupClass(CatalogApps);

/**
 * Lets the restore's promise callbacks run
 * @returns {Promise<void>}
 */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test.describe('Neo.desktop.Launcher', () => {
    const
        realDragDrop    = Neo.main.addon.DragDrop,
        realApplyDeltas = Neo.applyDeltas;

    let focused, launcher, store;

    /**
     * A group is a column, so an icon's place in it is its `top`
     * @param {String} id
     * @param {Number} [top=0]
     * @returns {Object} The path node of an icon, as the main thread reports it
     */
    const icon = (id, top=0) => ({cls: ['neo-list-item'], id: launcher.getItemId(store.get(id)), rect: {height: 100, left: 0, top, width: 100}});

    /**
     * @returns {String[]} The rendered launcher, by record id
     */
    const rendered = () => launcher.vdom.cn.map(item => store.get(launcher.getItemRecordId(item.id)).id);

    test.beforeEach(async () => {
        Neo.main.addon.DragDrop = {
            registerZone       : async () => {},
            setConfigs         : async () => ({boundaryContainerRect: {bottom: 600, left: 0, right: 800, top: 0}}),
            setDragProxyElement: async () => {},
            unregisterZone     : async () => {}
        };

        Neo.applyDeltas = async () => {};

        focused  = [];
        store    = Neo.create(CatalogApps);
        launcher = Neo.create(Launcher, {appName, store});

        launcher.focus      = id => focused.push(id);
        launcher.getDomRect = async () => ({height: 100, left: 0, top: 0, width: 100});

        await expect.poll(() => launcher.dragZone).toBeTruthy();
        launcher.dragZone.timeout = () => Promise.resolve()
    });

    test.afterEach(() => {
        launcher.destroy();
        store.destroy();
        Neo.applyDeltas         = realApplyDeltas;
        Neo.main.addon.DragDrop = realDragDrop
    });

    test('groups render as headers and apps as icon tiles in the app\'s color', () => {
        const [header, mail] = launcher.vdom.cn;

        expect(launcher.vdom.cn.map(item => item.tag)).toEqual(['dt', 'dd', 'dd', 'dd']);
        expect(header.html).toBe('Work');
        expect(mail.cn[0].cls).toEqual(['neo-desktop-app-icon']);
        expect(mail.cn[0].style).toEqual({'--desktop-app-color': '#3b82f6'});
        expect(mail.cn[1].text).toBe('Mail')
    });

    test('the vertical halves of a target place a drop, which writes the apps\' order the launcher renders', async () => {
        const zone = launcher.dragZone;

        await zone.onDragStart({clientX: 50, clientY: 50, path: [icon('mail'), {cls: [], id: launcher.id}], targetPath: []});

        // The upper half of the target, at its right edge: before it
        zone.onDragMove({clientX: 90, clientY: 210, targetPath: [icon('notes', 200), {cls: [], id: launcher.id}]});

        expect(rendered()).toEqual(['work', 'chat', 'mail', 'notes']);

        // Its lower half, at its left edge: after it
        zone.onDragMove({clientX: 10, clientY: 290, targetPath: [icon('notes', 200), {cls: [], id: launcher.id}]});

        // The preview lives in the vdom only
        expect(rendered()).toEqual(['work', 'chat', 'notes', 'mail']);
        expect(store.get('mail').order).toBe(0);

        // The preview moved the faded source into the landing slot under the pointer.
        await zone.onDragEnd({targetPath: [icon('mail', 200), {id: launcher.id}]});

        expect(['mail', 'chat', 'notes'].map(id => store.get(id).order)).toEqual([2, 0, 1]);
        expect(rendered()).toEqual(['work', 'chat', 'notes', 'mail'])
    });

    test('leaving the source group clears the preview and marks the drop unavailable', async () => {
        const zone = launcher.dragZone, root = {id: launcher.id};

        store.add([
            {id: 'media', text: 'Media', isLeaf: false, collapsed: false},
            {id: 'photos', text: 'Photos', parentId: 'media'}
        ]);
        launcher.createItems();

        const before = rendered();

        await zone.onDragStart({clientX: 50, clientY: 50, path: [icon('mail'), root], targetPath: []});
        zone.onDragMove({clientX: 50, clientY: 290, targetPath: [icon('notes', 200), root]});
        expect(rendered()).not.toEqual(before);

        zone.onDragMove({clientX: 180, clientY: 50, targetPath: [icon('photos'), root]});
        expect(rendered()).toEqual(before);
        expect(zone.dragProxy.cls).toContain('neo-sort-drop-rejected');

        zone.onDragMove({clientX: 50, clientY: 290, targetPath: [icon('notes', 200), root]});
        expect(zone.dragProxy.cls).not.toContain('neo-sort-drop-rejected');
        await zone.onDragEnd({targetPath: [icon('mail', 200), root]});
        expect(store.get('mail').order).toBe(2)
    });

    test('a release over a header rejects a preview even without a final move event', async () => {
        const zone = launcher.dragZone, root = {id: launcher.id}, before = rendered();

        let batches = 0;
        store.on('rowsChange', () => batches++);

        await zone.onDragStart({clientX: 50, clientY: 50, path: [icon('mail'), root], targetPath: []});
        zone.onDragMove({clientX: 50, clientY: 290, targetPath: [icon('notes', 200), root]});
        expect(rendered()).not.toEqual(before);

        await zone.onDragEnd({targetPath: [icon('work'), root]});
        expect(rendered()).toEqual(before);
        expect(batches).toBe(0)
    });

    test('Ctrl+Shift+Right moves the focused app one place and keeps the focus on it; a bare arrow moves nothing', async () => {
        const path = [icon('mail'), {cls: [], id: launcher.id}];

        await launcher.moveFocusedApp({path}, 1);

        expect(store.get('mail').order).toBe(0);

        await launcher.moveFocusedApp({ctrlKey: true, path, shiftKey: true}, 1);

        expect(rendered()).toEqual(['work', 'chat', 'mail', 'notes']);
        expect(focused).toEqual([launcher.getItemId(store.get('mail'))]);

        await launcher.moveFocusedApp({metaKey: true, path, shiftKey: true}, -1);

        expect(rendered()).toEqual(['work', 'mail', 'chat', 'notes'])
    });

    test('in a column, Ctrl+Shift+Down and Up move the focused app as Right and Left do', async () => {
        const path = [icon('mail'), {cls: [], id: launcher.id}];

        launcher.keys.onKeyDown({ctrlKey: true, key: 'ArrowDown', path, shiftKey: true});
        await expect.poll(rendered).toEqual(['work', 'chat', 'mail', 'notes']);

        launcher.keys.onKeyDown({key: 'ArrowUp', metaKey: true, path, shiftKey: true});
        await expect.poll(rendered).toEqual(['work', 'mail', 'chat', 'notes']);

        launcher.keys.onKeyDown({ctrlKey: true, key: 'ArrowRight', path, shiftKey: true});
        await expect.poll(rendered).toEqual(['work', 'chat', 'mail', 'notes'])
    });

    test('the click\'s pointer decides: a finger or pen tap opens an app, a mouse click selects, on one touch device', () => {
        const opened    = [],
              realTouch = Neo.config.hasTouchEvents,
              node      = icon('mail'),
              click     = pointerType => launcher.onItemClick(node, {path: [node, {cls: [], id: launcher.id}], pointerType});

        launcher.on('openApp', ({record}) => opened.push(record.id));

        try {
            // A touch-capable computer, used with a mouse, a finger and a pen
            Neo.config.hasTouchEvents = true;

            click('mouse');
            expect(opened, 'a mouse click only selects').toEqual([]);

            click('touch');
            click('pen');
            expect(opened).toEqual(['mail', 'mail']);

            // A browser that reports no pointer on a click: the device decides
            opened.length = 0;
            click(undefined);
            Neo.config.hasTouchEvents = false;
            click(undefined);

            expect(opened).toEqual(['mail'])
        } finally {
            Neo.config.hasTouchEvents = realTouch
        }
    });

    test('a filter change keeps the order of the remaining icons', () => {
        store.arrange({work: ['notes', 'chat', 'mail']});
        store.filters = [{operator: 'included', property: 'id', value: ['mail', 'notes']}];

        expect(rendered()).toEqual(['work', 'notes', 'mail']);

        store.clearFilters();

        expect(rendered()).toEqual(['work', 'notes', 'chat', 'mail'])
    })
});

test.describe('Neo.desktop.Launcher arrangements', () => {
    const realStorage = {...Neo.main.addon.LocalStorage};

    let launcher, replies, storage, store, writes;

    /**
     * Reads the vdom alone: a held render has items the filtered store no longer resolves
     * @returns {String[]} The rendered launcher, by header text and icon label
     */
    const rendered = () => launcher.vdom.cn.map(item => item.html ?? item.cn[1].text);

    /**
     * Holds every read until the test replies to it
     */
    const holdReads = () => {
        Neo.main.addon.LocalStorage.readLocalStorageItem = ({key}) => new Promise(resolve => {
            replies.push(() => resolve({key, value: storage[key] ?? null}))
        })
    };

    test.beforeEach(() => {
        replies = [];
        writes  = [];
        storage = {
            one: JSON.stringify({work: ['notes', 'mail', 'chat']}),
            two: JSON.stringify({work: ['chat', 'notes', 'mail']})
        };

        Object.assign(Neo.main.addon.LocalStorage, {
            readLocalStorageItem  : async ({key}) => ({key, value: storage[key] ?? null}),
            updateLocalStorageItem: ({key, value}) => {writes.push(key); storage[key] = value}
        });

        store    = Neo.create(CatalogApps);
        launcher = Neo.create(Launcher, {appName, store})
    });

    test.afterEach(() => {
        launcher.destroy();
        store.destroy();
        Object.assign(Neo.main.addon.LocalStorage, realStorage)
    });

    test('a new key restores before the launcher renders the store\'s next filter', async () => {
        holdReads();

        launcher.arrangementKey = 'one';
        store.filters           = [{operator: 'included', property: 'id', value: ['mail', 'notes']}];

        expect(rendered(), 'the render waits for the arrangement').toEqual(['Work', 'Mail', 'Chat', 'Notes']);

        replies[0]();
        await flush();

        expect(rendered()).toEqual(['Work', 'Notes', 'Mail'])
    });

    test('of two quick key changes the later one wins, in either reply order', async () => {
        holdReads();

        for (const order of [[0, 1], [1, 0]]) {
            launcher.arrangementKey = null;
            replies.length          = 0;

            launcher.arrangementKey = 'one';
            launcher.arrangementKey = 'two';

            order.forEach(index => replies[index]());
            await flush();

            expect(store.getChildren('work').map(record => record.id)).toEqual(['chat', 'notes', 'mail'])
        }
    });

    test('a failed or unreadable read gives the catalog order', async () => {
        const reads = [
            async () => {throw new Error('storage blocked')},
            async ({key}) => ({key, value: '{not json'}),
            async ({key}) => ({key, value: JSON.stringify('not an arrangement')})
        ];

        for (const read of reads) {
            launcher.arrangementKey = null;
            store.arrange({work: ['notes', 'chat', 'mail']});

            Neo.main.addon.LocalStorage.readLocalStorageItem = read;
            launcher.arrangementKey = 'broken';
            await flush();

            expect(store.getChildren('work').map(record => record.id)).toEqual(['mail', 'chat', 'notes'])
        }

        expect(writes, 'a restore is no new order').toEqual([])
    });

    test('a restore saves nothing, a reorder saves once under the current key, and another field saves nothing', async () => {
        const saved = storage.one;

        launcher.arrangementKey = 'one';
        await flush();

        expect(store.getChildren('work').map(record => record.id)).toEqual(['notes', 'mail', 'chat']);
        expect(writes).toEqual([]);

        store.updateRows([{key: 'mail', values: {order: 0}}, {key: 'notes', values: {order: 1}}]);

        expect(writes).toEqual(['one']);
        expect(JSON.parse(storage.one).work).toEqual(['mail', 'notes', 'chat']);
        expect(storage.one).not.toBe(saved);

        store.updateRows([{key: 'mail', values: {text: 'Post'}}]);

        expect(writes).toEqual(['one'])
    });

    test('without a key nothing is saved, and an order written during a read is left to the restore', async () => {
        store.updateRows([{key: 'mail', values: {order: 2}}, {key: 'notes', values: {order: 0}}]);

        expect(writes).toEqual([]);

        holdReads();
        launcher.arrangementKey = 'two';
        store.updateRows([{key: 'mail', values: {order: 0}}, {key: 'notes', values: {order: 2}}]);

        expect(writes).toEqual([]);

        replies[0]();
        await flush();

        expect(store.getChildren('work').map(record => record.id)).toEqual(['chat', 'notes', 'mail']);
        expect(writes).toEqual([])
    });

    test('dropping the key ends a restore in flight: a late reply arranges nothing, and the held render shows', async () => {
        holdReads();

        launcher.arrangementKey = 'one';
        store.filters           = [{operator: 'included', property: 'id', value: ['chat']}];
        launcher.arrangementKey = null;

        expect(rendered()).toEqual(['Work', 'Chat']);

        replies[0]();
        await flush();

        expect(store.getChildren('work').map(record => record.id)).toEqual(['mail', 'chat', 'notes'])
    });

    // A list config is applied before the launcher's own, so the store arrives before the key at construction
    test('a key given with the store at construction holds the first render until its arrangement is in place', async () => {
        holdReads();

        // The launcher owns its store, so the next one gets a store of its own
        launcher.destroy();
        store    = Neo.create(CatalogApps);
        launcher = Neo.create(Launcher, {appName, arrangementKey: 'one', store});

        expect(launcher.vdom.cn, 'no catalog order shows first').toEqual([]);

        replies[0]();
        await flush();

        expect(rendered()).toEqual(['Work', 'Notes', 'Mail', 'Chat'])
    });

    test('a store attached to a launcher with a key renders in that key\'s arrangement, never in catalog order first', async () => {
        launcher.arrangementKey = 'one';
        await flush();

        holdReads();

        // The launcher owns its store: the previous one goes with the swap
        launcher.store = store = Neo.create(CatalogApps);

        expect(rendered(), 'the held render still shows the previous store').toEqual(['Work', 'Notes', 'Mail', 'Chat']);

        replies[0]();
        await flush();

        expect(store.getChildren('work').map(record => record.id)).toEqual(['notes', 'mail', 'chat']);
        expect(rendered()).toEqual(['Work', 'Notes', 'Mail', 'Chat'])
    });

    test('clearing the store during a held restore throws nothing', async () => {
        holdReads();

        launcher.arrangementKey = 'one';
        store.filters           = [{operator: 'included', property: 'id', value: ['chat']}];

        expect(() => {launcher.store = null}).not.toThrow();

        replies.forEach(reply => reply());
        await flush();

        expect(launcher.isDestroyed).toBeFalsy()
    })
});
