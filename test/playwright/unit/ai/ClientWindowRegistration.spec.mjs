import {setup} from '../../setup.mjs';

const appName = 'AiClientWindowRegistrationTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';

/**
 * @summary Non-SharedWorker apps never fire the App-worker `connect` event that populates
 * `WindowManager.items`, so `Client#onSocketOpen`'s rehydration sent nothing — the NL bridge
 * never learned about the single implicit window, leaving `get_window_topology` empty and
 * `simulate_event` unroutable. These pin the client-side emission: the implicit window is
 * registered from the windowId-keyed `Neo.apps` registry for non-shared apps, and the
 * SharedWorker path is left untouched.
 *
 * The live end-to-end ACs (a real devindex window appearing in `get_window_topology` and a
 * `simulate_event` click routing to it) are L3 runtime evidence verified post-merge — they
 * need a running bridge + non-shared app the unit sandbox cannot host.
 */
test.describe('Neo.ai.Client — non-SharedWorker window registration', () => {
    let client;

    test.beforeAll(() => {
        if (!Neo.currentWorker) {
            Neo.currentWorker = {on: () => {}, isSharedWorker: false}
        }
        if (!Neo.worker) {
            Neo.worker = {App: {id: 'test-worker'}}
        }
    });

    test.beforeEach(async () => {
        const {default: Client} = await import('../../../../src/ai/Client.mjs');
        client = Neo.ai.Client || Neo.create(Client, {appName})
    });

    const runOnSocketOpen = (isSharedWorker, apps) => {
        const notifications            = [];
        const originalSendNotification = client.sendNotification;
        const originalSocket           = client.socket;
        const originalSharedWorker     = Neo.worker.App.isSharedWorker;
        const originalApps             = Neo.apps;

        client.sendNotification       = (method, params) => notifications.push({method, params});
        client.socket                 = {sendMessage: () => {}};
        Neo.worker.App.isSharedWorker = isSharedWorker;
        Neo.apps                      = apps;

        try {
            client.onSocketOpen({})
        } finally {
            client.sendNotification       = originalSendNotification;
            client.socket                 = originalSocket;
            Neo.worker.App.isSharedWorker = originalSharedWorker;
            Neo.apps                      = originalApps;
            client.isConnected            = false
        }

        return notifications
    };

    test('onSocketOpen registers the implicit window for a non-SharedWorker app', () => {
        const notifications = runOnSocketOpen(false, {'win-nonshared-1': {name: 'DevIndexApp'}});

        const implicit = notifications.find(
            n => n.method === 'window_connected' && n.params.windowId === 'win-nonshared-1'
        );

        expect(implicit, 'the non-shared implicit window must be registered with the bridge').toBeTruthy();
        expect(implicit.params.appName).toBe('DevIndexApp')
    });

    test('a SharedWorker app does NOT get the implicit-app-registry fallback', () => {
        const notifications = runOnSocketOpen(true, {'win-shared-1': {name: 'PortalApp'}});

        // SharedWorker windows register via WindowManager rehydration / connect events, never the
        // implicit Neo.apps fallback — so no window_connected for this window originates here.
        const fromApps = notifications.filter(
            n => n.method === 'window_connected' && n.params.windowId === 'win-shared-1'
        );

        expect(fromApps.length).toBe(0)
    });
});
