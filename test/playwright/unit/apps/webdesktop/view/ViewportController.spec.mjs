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
import Tasks              from '../../../../../../src/desktop/store/Tasks.mjs';
import Apps               from '../../../../../../apps/webdesktop/store/Apps.mjs';
import ViewportController from '../../../../../../apps/webdesktop/view/ViewportController.mjs';

/**
 * @summary The web desktop controller's own rules: what it hands `Neo.desktop.WindowManager`, the order of a sign-out,
 * and the saved icon arrangements. The window rules themselves are pinned in `unit/desktop/WindowManager.spec.mjs`.
 */

const proto = ViewportController.prototype;

test.describe('WebDesktop.view.ViewportController windows', () => {
    // A window still mounted when the account changes re-renders its content, and that update lands after its removal
    test('signing out resets the window manager before the account changes', () => {
        const calls      = [],
              controller = {
                  pendingSignIn: {record: {id: 'editor'}},
                  setState     : state => calls.push(['setState', state.account]),
                  windowManager: {reset: () => calls.push(['reset'])}
              };

        proto.onSignOutButtonClick.call(controller);

        expect(calls).toEqual([['reset'], ['setState', null]]);
        expect(controller.pendingSignIn).toBeNull()
    });

    test('a window grows out of its app\'s launcher icon, stays in the workspace and binds the app', () => {
        const record     = {id: 'mail'},
              parent     = {id: 'desktop-provider'},
              launcher   = {appName, getItemId: item => `icon-${item.id}`, store: {get: id => ({id})}, windowId: 7},
              controller = {
                  getReference    : name => name === 'launcher' ? launcher : {id: 'workspace'},
                  getStateProvider: () => parent
              };

        expect(proto.getWindowConfig.call(controller, record)).toEqual({
            animateTargetId      : 'icon-mail',
            appName,
            boundaryContainerId  : 'workspace',
            resizablePluginConfig: {boundaryContainerId: 'workspace'},
            stateProvider        : {data: {app: record}, parent},
            windowId             : 7
        })
    });

    test('a task click restores its window through the manager', () => {
        const restored   = [],
              controller = {windowManager: {restore: appId => restored.push(appId)}};

        proto.onTaskItemClick.call(controller, {record: {id: 'photos'}});

        expect(restored).toEqual(['photos'])
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
            readArrangement  : proto.readArrangement,
            setState         : data => Object.assign(state, data),
            windowManager    : {reset() {}}
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
