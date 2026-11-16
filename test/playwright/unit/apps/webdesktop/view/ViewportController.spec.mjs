import {setup} from '../../../../setup.mjs';

const appName = 'WebDesktopControllerTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name    : appName,
        mainView: {id: 'webdesktop-controller-main-view', domListeners: [], addDomListeners() {}, removeDomListeners() {}}
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../../src/Neo.mjs';
import * as core          from '../../../../../../src/core/_export.mjs';
import Instance           from '../../../../../../src/manager/Instance.mjs';
import Apps               from '../../../../../../apps/webdesktop/store/Apps.mjs';
import Tasks              from '../../../../../../apps/webdesktop/store/Tasks.mjs';
import ViewportController from '../../../../../../apps/webdesktop/view/ViewportController.mjs';

/**
 * @summary The window rules of the web desktop controller, run against the real apps and tasks stores. A window stands
 * in for `WebDesktop.view.AppWindow`: hiding it calls the controller's `hide` listener, as the real one does.
 */

const proto = ViewportController.prototype;

/**
 * @param {String[]} permissions
 * @returns {Object}
 */
function createHarness(permissions) {
    const
        apps       = Neo.create(Apps),
        tasks      = Neo.create(Tasks),
        hides      = [],
        controller = {
            getStore      : key => ({apps, tasks})[key],
            hideAllWindows: proto.hideAllWindows,
            setState() {},
            windows: {}
        },
        addWindow = id => {
            const window = {
                hidden: false,
                hide(animate) {
                    this.hidden = true;
                    hides.push({animate, id});
                    proto.onWindowHide.call(controller, id)
                },
                show() {this.hidden = false},
                toFront() {}
            };

            controller.windows[id] = Promise.resolve(window);
            tasks.add({id, text: id});

            return window
        };

    apps.getFilter('permission').value = permissions;

    return {addWindow, apps, controller, destroy() {apps.destroy(); tasks.destroy()}, hides, tasks}
}

/**
 * Lets the windows' promise callbacks run
 * @returns {Promise<void>}
 */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test.describe('WebDesktop.view.ViewportController window rules', () => {
    let harness;

    test.afterEach(() => {
        harness.destroy()
    });

    test('a double open creates one window and one task', async () => {
        harness = createHarness(['view-mail']);

        const {apps, controller, tasks} = harness;
        let   created                   = 0;

        controller.createWindow = async () => {created++; return {hidden: false, show() {}, toFront() {}}};

        await Promise.all([proto.openApp.call(controller, apps.get('mail')), proto.openApp.call(controller, apps.get('mail'))]);

        expect(created).toBe(1);
        expect(tasks.items.map(task => task.id)).toEqual(['mail'])
    });

    test('minimizing keeps the task, closing removes it', () => {
        harness = createHarness(['view-mail', 'view-photos']);

        const {addWindow, controller, tasks} = harness,
              mail                           = addWindow('mail'),
              photos                         = addWindow('photos');

        proto.onWindowHeaderAction.call(controller, 'photos', {action: 'minimize', dialog: photos});

        expect(photos.hidden).toBe(true);
        expect(tasks.get('photos').minimized).toBe(true);

        mail.hide(true); // the header X, or Escape

        expect(tasks.items.map(task => task.id)).toEqual(['photos'])
    });

    test('a revoked permission closes its app, minimized or not, without animating into a removed icon', async () => {
        harness = createHarness(['view-mail', 'view-photos', 'view-help']);

        const {addWindow, apps, controller, hides, tasks} = harness,
              photos                                      = addWindow('photos');

        addWindow('mail');
        addWindow('help');

        photos.hidden = true;
        tasks.get('photos').minimized = true;

        apps.getFilter('permission').value = ['view-help'];
        proto.onAppsFilter.call(controller);

        await flush();

        expect(tasks.items.map(task => task.id)).toEqual(['help']);
        expect(hides).toEqual([{animate: false, id: 'mail'}])
    });

    test('signing out hides every window without animation and empties the taskbar', async () => {
        harness = createHarness(['view-mail', 'view-help']);

        const {addWindow, controller, hides, tasks} = harness;

        addWindow('mail');
        addWindow('help');

        proto.onSignOutButtonClick.call(controller);

        await flush();

        expect(tasks.getCount()).toBe(0);
        expect(hides).toEqual([{animate: false, id: 'mail'}, {animate: false, id: 'help'}])
    });

    test('teardown destroys every window, open or still being imported, and leaves the apps store', async () => {
        harness = createHarness(['view-mail']);

        const {apps, controller} = harness,
              destroyed          = [],
              listeners          = () => (apps.toJSON().listeners.filter || []).length,
              fake               = id => ({destroy() {this.isDestroyed = true; destroyed.push(id)}, isDestroyed: false});

        let importDone;

        controller.onAppsFilter = proto.onAppsFilter;
        controller.windows      = {
            help: new Promise(resolve => {importDone = () => resolve(fake('help'))}),
            mail: Promise.resolve(fake('mail'))
        };

        apps.on('filter', controller.onAppsFilter, controller);

        const before = listeners();

        proto.releaseWindows.call(controller);
        importDone();

        await flush();

        expect(destroyed.sort()).toEqual(['help', 'mail']);
        expect(controller.windows).toEqual({});
        expect(listeners()).toBe(before - 1)
    })
});

test.describe('WebDesktop.view.ViewportController arrangements', () => {
    const realAddon = Neo.main.addon.LocalStorage;

    let apps, controller, state, storage;

    const editor = {id: 'editor', permissions: ['view-mail', 'view-calendar']},
          guest  = {id: 'guest',  permissions: ['view-help']};

    test.beforeEach(() => {
        apps    = Neo.create(Apps);
        state   = {account: null};
        storage = {[proto.getArrangementKey(editor)]: JSON.stringify({communication: ['calendar', 'mail', 'messages']})};

        Neo.main.addon.LocalStorage = {
            readLocalStorageItem  : async ({key}) => ({key, value: storage[key] ?? null}),
            updateLocalStorageItem: ({key, value}) => {storage[key] = value}
        };

        // Observable#fire drops a listener whose scope has no id
        controller = {
            id               : 'webdesktop-arrangement-controller',
            component        : {windowId: 1},
            getArrangementKey: proto.getArrangementKey,
            getState         : key => state[key],
            getStore         : key => ({apps})[key],
            setState         : data => Object.assign(state, data)
        };

        apps.on({rowsChange: proto.onAppsRowsChange, scope: controller})
    });

    test.afterEach(() => {
        apps.destroy();
        Neo.main.addon.LocalStorage = realAddon
    });

    test('an account signs in with its saved arrangement, and a new order is saved under it', async () => {
        const saved = storage[proto.getArrangementKey(editor)];

        await proto.onAccountItemClick.call(controller, {record: editor});

        expect(apps.getChildren('communication').map(record => record.id)).toEqual(['calendar', 'mail', 'messages']);
        // Applying the arrangement happens before the account is signed in, so it writes nothing back
        expect(Object.keys(storage)).toEqual([proto.getArrangementKey(editor)]);
        expect(storage[proto.getArrangementKey(editor)]).toBe(saved);

        apps.updateRows([{key: 'mail', values: {order: 0}}, {key: 'calendar', values: {order: 1}}]);

        expect(JSON.parse(storage[proto.getArrangementKey(editor)]).communication).toEqual(['mail', 'calendar', 'messages'])
    });

    test('an account without a saved arrangement sees the catalog order', async () => {
        await proto.onAccountItemClick.call(controller, {record: editor});

        state.account = null;

        await proto.onAccountItemClick.call(controller, {record: guest});

        expect(apps.getChildren('communication').map(record => record.id)).toEqual(['mail', 'messages', 'calendar']);
        expect(state.account).toBe(guest)
    })
});
