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
import Launcher              from '../../../../../../src/desktop/Launcher.mjs';
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

        // Every node of the catalog: 5 groups and 10 apps
        expect(naive.getCount()).toBe(15)
    });

    test('the launcher renders the kept projection: groups as headers, apps as items', () => {
        const launcher = Neo.create(Launcher, {appName, bind: null, store: apps});

        instances.push(launcher);

        provider.setData('permissions', ['view-photos', 'view-music']);

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
    });

    // The arrangement survives the grants: the engine's launcher spec runs the order rules on a generic filter
    test('a permission change keeps the order of the remaining icons', () => {
        const launcher = Neo.create(Launcher, {appName, store: apps}),
              rendered = () => launcher.vdom.cn.map(item => apps.get(launcher.getItemRecordId(item.id)).id);

        instances.push(launcher);

        provider.setData('permissions', ['view-mail', 'view-messages', 'view-calendar']);
        apps.arrange({communication: ['calendar', 'messages', 'mail']});

        expect(rendered()).toEqual(['communication', 'calendar', 'messages', 'mail']);

        provider.setData('permissions', ['view-mail', 'view-calendar']);

        expect(rendered()).toEqual(['communication', 'calendar', 'mail']);

        provider.setData('permissions', ['view-mail', 'view-messages', 'view-calendar']);

        expect(rendered()).toEqual(['communication', 'calendar', 'messages', 'mail'])
    })
});
