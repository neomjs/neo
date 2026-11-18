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
 * @summary The web desktop controller's own rules: the order of a sign-in and a sign-out against the desktop's window
 * manager and launcher. The desktop's own rules are pinned in `unit/desktop/Container.spec.mjs`, the window rules in
 * `unit/desktop/WindowManager.spec.mjs` and the arrangement rules in `unit/desktop/Launcher.spec.mjs`.
 */

const proto = ViewportController.prototype;

test.describe('WebDesktop.view.ViewportController windows', () => {
    // A window still mounted when the account changes re-renders its content, and that update lands after its removal
    test('signing out resets the window manager before the account changes, and drops the launcher key after it', () => {
        const calls      = [],
              desktop    = {windowManager: {reset: () => calls.push(['reset'])}},
              launcher   = {set arrangementKey(value) {calls.push(['key', value])}},
              controller = {
                  getReference: name => name === 'desktop' ? desktop : launcher,
                  setState    : state => calls.push(['setState', state.account])
              };

        proto.onSignOutButtonClick.call(controller);

        expect(calls).toEqual([['reset'], ['setState', null], ['key', null]])
    })
});

// The launcher restores and saves the arrangements. The controller only hands it the account's key, and the order of
// that hand-over against the grants is what keeps a held render honest.
test.describe('WebDesktop.view.ViewportController arrangements', () => {
    test('a sign-in hands the launcher the account\'s key before the grants', () => {
        const events     = [],
              launcher   = {set arrangementKey(value) {events.push(['key', value])}},
              controller = {
                  getArrangementKey: proto.getArrangementKey,
                  getReference     : () => launcher,
                  setState         : state => events.push(['grants', state.permissions])
              };

        proto.onAccountItemClick.call(controller, {record: {id: 'editor', permissions: ['view-mail', 'view-calendar']}});

        expect(events).toEqual([
            ['key', 'neo-webdesktop-arrangement-editor'],
            ['grants', ['view-mail', 'view-calendar']]
        ])
    })
});
