import {setup} from '../../../../setup.mjs';

const
    appName  = 'WebDesktopStateProviderTest',
    mainView = {
        id          : 'webdesktop-test-main-view',
        domListeners: [],
        addDomListeners() {},
        removeDomListeners() {}
    };

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: appName,
        mainView
    }
});

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../src/core/_export.mjs';
import Instance              from '../../../../../../src/manager/Instance.mjs';
import MenuList              from '../../../../../../src/menu/List.mjs';
import Apps                  from '../../../../../../apps/webdesktop/store/Apps.mjs';
import Launcher              from '../../../../../../apps/webdesktop/view/Launcher.mjs';
import PermissionList        from '../../../../../../apps/webdesktop/view/PermissionList.mjs';
import Permissions           from '../../../../../../apps/webdesktop/store/Permissions.mjs';
import Taskbar               from '../../../../../../apps/webdesktop/view/Taskbar.mjs';
import ViewportStateProvider from '../../../../../../apps/webdesktop/view/ViewportStateProvider.mjs';

/**
 * @summary The web desktop decides what an account sees in one place: the apps store's permission filter, fed by the
 * root provider's `permissions`. Every view is bound to that store, so these arms drive the provider and read the
 * views, never a view-level rule.
 */

/**
 * @param {Neo.data.Store} store
 * @returns {String[]}
 */
const ids = store => store.items.map(record => record.id);

/**
 * @param {Object} config
 * @returns {Neo.menu.List}
 */
function createMenu(config) {
    const menu = Neo.create(MenuList, {appName, id: Neo.getId('webdesktop-menu'), ...config});

    menu.alignTo       = Neo.emptyFn;
    menu.focus         = Neo.emptyFn;
    menu.initDomEvents = Neo.emptyFn;

    return menu
}

test.describe('WebDesktop.view.ViewportStateProvider', () => {
    let apps, instances, provider;

    test.beforeEach(() => {
        instances = [];
        // The accounts store reads its JSON over the network, which this suite does not need
        provider  = Neo.create(ViewportStateProvider, {stores: {apps: Apps}});
        apps      = provider.getStore('apps')
    });

    test.afterEach(() => {
        instances.forEach(instance => {!instance.isDestroyed && instance.destroy()});
        provider.destroy()
    });

    test('nobody signed in: the apps store keeps nothing', () => {
        expect(apps.getFilter('permission').value).toEqual([]);
        expect(apps.getCount()).toBe(0)
    });

    test('granted keys reach the filter, and a group shows exactly when one of its apps does', () => {
        provider.setData('permissions', ['view-mail', 'view-help']);

        expect(ids(apps)).toEqual(['communication', 'mail', 'support', 'help'])
    });

    test('an empty grant stays closed, where the default includeEmptyValues would show every app', () => {
        provider.setData('permissions', ['view-mail']);
        provider.setData('permissions', []);

        expect(apps.getCount()).toBe(0);

        // The trap the store's filter config avoids: by default an empty value turns the filter off
        const naive = Neo.create(Apps, {filters: [{operator: 'included', property: 'permission', value: []}]});

        instances.push(naive);

        expect(naive.getCount()).toBe(16)
    });

    test('the launcher renders the kept projection: groups as headers, apps as items', () => {
        const launcher = Neo.create(Launcher, {appName, bind: null, store: apps});

        instances.push(launcher);

        provider.setData('permissions', ['view-photos', 'view-videos']);

        const items = launcher.vdom.cn;

        expect(items.map(item => item.tag)).toEqual(['dt', 'dd', 'dd']);
        expect(items[0].html).toBe('Media');

        // A revoke reaches the same launcher instance
        provider.setData('permissions', ['view-settings']);

        expect(launcher.vdom.cn.map(item => item.tag)).toEqual(['dt', 'dd']);
        expect(launcher.vdom.cn[0].html).toBe('System')
    });

    test('every start-menu level follows the same filter, live', () => {
        provider.setData('permissions', ['view-mail', 'view-calendar', 'view-photos']);

        const root          = createMenu({store: apps}),
              communication = createMenu({parentRecordId: 'communication', store: apps});

        instances.push(communication, root);

        expect(ids(root.store)).toEqual(['communication', 'media']);
        expect(ids(communication.store)).toEqual(['mail', 'calendar']);

        provider.setData('permissions', ['view-messages']);

        expect(ids(root.store)).toEqual(['communication']);
        expect(ids(communication.store)).toEqual(['messages'])
    });

    test('a permission row states its grant to assistive technology, and a toggle updates the same row', () => {
        const store = Neo.create(Permissions),
              list  = Neo.create(PermissionList, {appName, bind: null, granted: ['view-mail'], store}),
              row   = key => list.vdom.cn[store.indexOf(key)];

        instances.push(list, store);

        expect(list.vdom).toMatchObject({role: 'listbox', 'aria-label': 'Permissions', 'aria-multiselectable': true});
        expect(row('view-mail')).toMatchObject({role: 'option', 'aria-selected': true});
        expect(row('view-help')['aria-selected']).toBe(false);

        list.granted = ['view-help'];

        expect(row('view-mail')['aria-selected']).toBe(false);
        expect(row('view-help')['aria-selected']).toBe(true)
    });

    test('the icon-only theme button has an accessible name', () => {
        const taskbar = Neo.create(Taskbar, {appName}),
              button  = taskbar.items.find(item => item.handler === 'onThemeButtonClick');

        instances.push(taskbar);

        expect(button.vdom['aria-label']).toBe('Switch theme')
    });

    test('an open start-menu level survives its group collapsing and expanding, and the last revoke closes it', async () => {
        provider.setData('permissions', ['view-mail', 'view-calendar']);

        const root  = createMenu({store: apps}),
              group = root.store.get('communication');

        root.showSubMenu(root.getItemId(root.store.getKey(group)), group);

        const submenu = root.activeSubMenu;

        instances.push(submenu, root);

        apps.collapse('communication');

        expect(ids(submenu.store)).toEqual(['mail', 'calendar']);

        await apps.expand('communication');

        expect(ids(submenu.store)).toEqual(['mail', 'calendar']);
        expect(root.activeSubMenu).toBe(submenu);

        provider.setData('permissions', []);

        expect(root.activeSubMenu).toBeNull()
    })
});

test.describe('WebDesktop launcher arrangement', () => {
    const
        realAddon       = Neo.main.addon.DragDrop,
        realApplyDeltas = Neo.applyDeltas;

    let apps, focused, launcher, provider;

    /**
     * @param {String} id
     * @returns {Object} The path node of an icon, as the main thread reports it
     */
    const icon = (id, left=0) => ({cls: ['neo-list-item'], id: launcher.getItemId(apps.get(id)), rect: {height: 100, left, top: 0, width: 100}});

    /**
     * @returns {String[]} The rendered launcher, by record id
     */
    const rendered = () => launcher.vdom.cn.map(item => apps.get(launcher.getItemRecordId(item.id)).id);

    test.beforeEach(async () => {
        Neo.main.addon.DragDrop = {
            registerZone       : async () => {},
            setConfigs         : async () => ({boundaryContainerRect: {bottom: 600, left: 0, right: 800, top: 0}}),
            setDragProxyElement: async () => {},
            unregisterZone     : async () => {}
        };

        Neo.applyDeltas = async () => {};

        focused  = [];
        provider = Neo.create(ViewportStateProvider, {stores: {apps: Apps}});
        apps     = provider.getStore('apps');
        launcher = Neo.create(Launcher, {appName, bind: null, store: apps});

        launcher.focus      = id => focused.push(id);
        launcher.getDomRect = async () => ({height: 100, left: 0, top: 0, width: 100});

        provider.setData('permissions', ['view-mail', 'view-messages', 'view-calendar']);

        await expect.poll(() => launcher.dragZone).toBeTruthy();
        launcher.dragZone.timeout = () => Promise.resolve()
    });

    test.afterEach(() => {
        launcher.destroy();
        provider.destroy();
        Neo.applyDeltas         = realApplyDeltas;
        Neo.main.addon.DragDrop = realAddon
    });

    test('a drop writes the apps\' order, and the launcher renders the store\'s sort', async () => {
        const zone = launcher.dragZone;

        await zone.onDragStart({clientX: 50, clientY: 50, path: [icon('mail'), {cls: [], id: launcher.id}], targetPath: []});
        zone.onDragMove({clientX: 290, clientY: 50, targetPath: [icon('calendar', 200), {cls: [], id: launcher.id}]});

        // The preview lives in the vdom only
        expect(rendered()).toEqual(['communication', 'messages', 'calendar', 'mail']);
        expect(apps.get('mail').order).toBe(0);

        await zone.onDragEnd({});

        expect(['mail', 'messages', 'calendar'].map(id => apps.get(id).order)).toEqual([2, 0, 1]);
        expect(apps.items.map(record => record.id)).toEqual(['communication', 'messages', 'calendar', 'mail']);
        expect(rendered()).toEqual(apps.items.map(record => record.id))
    });

    test('Ctrl+Shift+Right moves the focused app one place and keeps the focus on it; a bare arrow moves nothing', async () => {
        const path = [icon('mail'), {cls: [], id: launcher.id}];

        await launcher.moveFocusedApp({path}, 1);

        expect(apps.get('mail').order).toBe(0);

        await launcher.moveFocusedApp({ctrlKey: true, path, shiftKey: true}, 1);

        expect(rendered()).toEqual(['communication', 'messages', 'mail', 'calendar']);
        expect(focused).toEqual([launcher.getItemId(apps.get('mail'))]);

        await launcher.moveFocusedApp({metaKey: true, path, shiftKey: true}, -1);

        expect(rendered()).toEqual(['communication', 'mail', 'messages', 'calendar'])
    });

    test('a permission change keeps the order of the remaining icons', () => {
        apps.arrange({communication: ['calendar', 'messages', 'mail']});

        expect(rendered()).toEqual(['communication', 'calendar', 'messages', 'mail']);

        provider.setData('permissions', ['view-mail', 'view-calendar']);

        expect(rendered()).toEqual(['communication', 'calendar', 'mail']);

        provider.setData('permissions', ['view-mail', 'view-messages', 'view-calendar']);

        expect(rendered()).toEqual(['communication', 'calendar', 'messages', 'mail'])
    })
});
