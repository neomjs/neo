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
import ViewportController from '../../../../../../apps/webdesktop/view/ViewportController.mjs';

/**
 * @summary The web desktop controller's own rules: what it hands `Neo.desktop.WindowManager` and the launcher, and the
 * order of a sign-in and a sign-out. The window rules are pinned in `unit/desktop/WindowManager.spec.mjs`, the
 * arrangements in `unit/desktop/Launcher.spec.mjs`.
 */

const proto = ViewportController.prototype;

test.describe('WebDesktop.view.ViewportController windows', () => {
    // A window still mounted when the account changes re-renders its content, and that update lands after its removal
    test('signing out resets the window manager before the account changes', () => {
        const calls      = [],
              controller = {
                  getReference : () => ({}),
                  setState     : state => calls.push(['setState', state.account]),
                  windowManager: {reset: () => calls.push(['reset'])}
              };

        proto.onSignOutButtonClick.call(controller);

        expect(calls).toEqual([['reset'], ['setState', null]])
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

// The launcher restores and saves the arrangements (`test/playwright/unit/desktop/Launcher.spec.mjs`). The controller
// only hands it the account's key, and the order of that hand-over against the grants is what keeps a held render honest.
test.describe('WebDesktop.view.ViewportController arrangements', () => {
    test('a sign-in hands the launcher the account\'s key before the grants, and a sign-out drops it after them', () => {
        const events     = [],
              launcher   = {set arrangementKey(value) {events.push(['key', value])}},
              controller = {
                  getArrangementKey: proto.getArrangementKey,
                  getReference     : () => launcher,
                  setState         : state => events.push(['grants', state.permissions]),
                  windowManager    : {reset() {}}
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
