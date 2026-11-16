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

    // A window still mounted when the account changes re-renders its content, and that update lands after its removal
    test('signing out hides every window before the account changes', async () => {
        harness = createHarness(['view-mail', 'view-help']);

        const {addWindow, controller, hides} = harness,
              hiddenAtStateChange            = [];

        addWindow('mail');
        addWindow('help');

        controller.setState = () => hiddenAtStateChange.push(hides.length);

        await proto.onSignOutButtonClick.call(controller);

        expect(hiddenAtStateChange).toEqual([2])
    });

    test('teardown destroys every window, open or still being imported, and leaves the apps store', async () => {
        harness = createHarness(['view-mail']);

        const {apps, controller} = harness,
              destroyed          = [],
              listeners          = () => ['filter', 'rowsChange'].map(name => (apps.toJSON().listeners[name] || []).length),
              fake               = id => ({destroy() {this.isDestroyed = true; destroyed.push(id)}, isDestroyed: false});

        let importDone;

        controller.onAppsFilter     = proto.onAppsFilter;
        controller.onAppsRowsChange = proto.onAppsRowsChange;
        controller.windows          = {
            help: new Promise(resolve => {importDone = () => resolve(fake('help'))}),
            mail: Promise.resolve(fake('mail'))
        };

        apps.on({filter: controller.onAppsFilter, rowsChange: controller.onAppsRowsChange, scope: controller});

        const [filters, rowsChanges] = listeners();

        proto.releaseWindows.call(controller);
        importDone();

        await flush();

        expect(destroyed.sort()).toEqual(['help', 'mail']);
        expect(controller.windows).toEqual({});
        expect(listeners()).toEqual([filters - 1, rowsChanges - 1])
    })
});

test.describe('WebDesktop.view.ViewportController arrangements', () => {
    const realAddon = Neo.main.addon.LocalStorage;

    let apps, controller, state, storage, tasks;

    const editor = {id: 'editor', permissions: ['view-mail', 'view-calendar']},
          guest  = {id: 'guest',  permissions: ['view-help']};

    test.beforeEach(() => {
        apps    = Neo.create(Apps);
        tasks   = Neo.create(Tasks);
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
            getStore         : key => ({apps, tasks})[key],
            hideAllWindows   : proto.hideAllWindows,
            readArrangement  : proto.readArrangement,
            setState         : data => Object.assign(state, data),
            windows          : {}
        };

        apps.on({rowsChange: proto.onAppsRowsChange, scope: controller})
    });

    test.afterEach(() => {
        apps.destroy();
        tasks.destroy();
        Neo.main.addon.LocalStorage = realAddon
    });

    test('a sign-in still reading its arrangement does not outlive a sign-out', async () => {
        let reply;

        Neo.main.addon.LocalStorage.readLocalStorageItem = ({key}) => new Promise(resolve => {
            reply = () => resolve({key, value: storage[key] ?? null})
        });

        state.account = guest;

        // Editor's click was dispatched while Guest was active, and its read is still out when Guest signs out
        const signIn = proto.onAccountItemClick.call(controller, {record: editor});

        proto.onSignOutButtonClick.call(controller);
        reply();
        await signIn;

        expect(state.account).toBeNull()
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
    });

    test('of two quick sign-ins the later one wins in either reply order, and a restored order is never saved', async () => {
        const editorKey = proto.getArrangementKey(editor),
              saved     = storage[editorKey],
              replies   = [];

        Neo.main.addon.LocalStorage.readLocalStorageItem = ({key}) => new Promise(resolve => {
            replies.push(() => resolve({key, value: storage[key] ?? null}))
        });

        for (const order of [[0, 1], [1, 0]]) {
            state.account  = null;
            replies.length = 0;

            const first  = proto.onAccountItemClick.call(controller, {record: editor}),
                  second = proto.onAccountItemClick.call(controller, {record: guest});

            order.forEach(index => replies[index]());
            await Promise.all([first, second]);

            expect(state.account).toBe(guest);
            expect(apps.getChildren('communication').map(record => record.id)).toEqual(['mail', 'messages', 'calendar'])
        }

        // A click that reaches the controller after an account signed in restores an order, it does not arrange one
        Neo.main.addon.LocalStorage.readLocalStorageItem = async ({key}) => ({key, value: storage[key] ?? null});
        state.account = editor;

        await proto.onAccountItemClick.call(controller, {record: guest});

        expect(Object.keys(storage)).toEqual([editorKey]);
        expect(storage[editorKey]).toBe(saved)
    });

    test('an unreadable arrangement signs the account in with the catalog order', async () => {
        const reads = [
            async () => {throw new Error('storage blocked')},
            async ({key}) => ({key, value: '{not json'}),
            async ({key}) => ({key, value: JSON.stringify({communication: 'calendar'})})
        ];

        for (const read of reads) {
            Neo.main.addon.LocalStorage.readLocalStorageItem = read;
            state.account = null;

            await proto.onAccountItemClick.call(controller, {record: editor});

            expect(state.account).toBe(editor);
            expect(apps.getChildren('communication').map(record => record.id)).toEqual(['mail', 'messages', 'calendar'])
        }
    })
});
