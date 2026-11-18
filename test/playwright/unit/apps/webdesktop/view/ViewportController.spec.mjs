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
        launcher   = {arrangementKey: null},
        controller = {
            createdWindows: {},
            getReference  : () => launcher,
            getStore      : key => ({apps, tasks})[key],
            hideAllWindows: proto.hideAllWindows,
            setState() {},
            signOuts: 0,
            windows : {}
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

            controller.createdWindows[id] = window;
            controller.windows[id]        = Promise.resolve(window);
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

    test('a failed or still-running window import does not hold the sign-out', () => {
        harness = createHarness(['view-mail', 'view-help']);

        const {controller} = harness,
              accounts     = [],
              failed       = Promise.reject(new Error('import failed'));

        failed.catch(() => {});
        controller.windows  = {help: failed, mail: new Promise(() => {})};
        controller.setState = state => accounts.push(state.account);

        proto.onSignOutButtonClick.call(controller);

        expect(accounts).toEqual([null])
    });

    test('a sign-out during the window import creates no window', async () => {
        harness = createHarness(['view-mail']);

        const {apps, controller} = harness;

        controller.getReference = name => name === 'launcher'
            ? {appName, getItemId: () => 'icon', store: {get: () => null}, windowId: 1}
            : {id: 'workspace'};

        const opening = proto.createWindow.call(controller, apps.get('mail'));

        proto.onSignOutButtonClick.call(controller);

        expect(await opening).toBeNull();
        expect(controller.createdWindows).toEqual({})
    });

    test('a failed or cancelled import is dropped, so the next open imports again', async () => {
        harness = createHarness(['view-mail']);

        const {apps, controller, tasks} = harness,
              mail                      = apps.get('mail'),
              results                   = [Promise.reject(new Error('import failed')), Promise.resolve(null),
                  Promise.resolve({hidden: false, show() {}, toFront() {}})];

        controller.createWindow = () => results.shift();

        await expect(proto.openApp.call(controller, mail)).rejects.toThrow('import failed');
        expect(controller.windows).toEqual({});

        await proto.openApp.call(controller, mail);
        expect(controller.windows).toEqual({});
        expect(tasks.getCount()).toBe(0);

        await proto.openApp.call(controller, mail);
        expect(tasks.items.map(task => task.id)).toEqual(['mail'])
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

        apps.on({filter: controller.onAppsFilter, scope: controller});

        const filters = listeners();

        proto.releaseWindows.call(controller);
        importDone();

        await flush();

        expect(destroyed.sort()).toEqual(['help', 'mail']);
        expect(controller.windows).toEqual({});
        expect(listeners()).toBe(filters - 1)
    })
});

// The launcher restores and saves the arrangements (`test/playwright/unit/desktop/Launcher.spec.mjs`). The controller
// only hands it the account's key, and the order of that hand-over against the grants is what keeps a held render honest.
test.describe('WebDesktop.view.ViewportController arrangements', () => {
    test('a sign-in hands the launcher the account\'s key before the grants, and a sign-out drops it after them', () => {
        const events     = [],
              launcher   = {set arrangementKey(value) {events.push(['key', value])}},
              controller = {
                  createdWindows   : {},
                  getArrangementKey: proto.getArrangementKey,
                  getReference     : () => launcher,
                  getStore         : () => ({clear() {}}),
                  hideAllWindows   : proto.hideAllWindows,
                  setState         : state => events.push(['grants', state.permissions]),
                  signOuts         : 0
              };

        proto.onAccountItemClick.call(controller, {record: {id: 'editor', permissions: ['view-mail', 'view-calendar']}});
        proto.onSignOutButtonClick.call(controller);

        expect(events).toEqual([
            ['key', 'neo-webdesktop-arrangement-editor'],
            ['grants', ['view-mail', 'view-calendar']],
            ['grants', []],
            ['key', null]
        ])
    })
});
