import {setup} from '../../setup.mjs';

const appName = 'AiClientWindowRegistrationTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import UnitTestWebSocket from './UnitTestWebSocket.mjs';

/**
 * @summary Non-SharedWorker apps never fire the App-worker `connect` event that populates
 * `WindowManager.items`, so `Client#onSocketOpen`'s rehydration sent nothing — the NL bridge
 * never learned about the single implicit window, leaving `get_window_topology` empty and
 * `simulate_event` unroutable. These pin the client-side emission: the implicit window is
 * registered from the windowId-keyed `Neo.apps` registry for non-shared apps, and the
 * SharedWorker path is left untouched.
 *
 * The live end-to-end ACs (a real non-shared app window appearing in `get_window_topology` and a
 * `simulate_event` click routing to it) are L3 runtime evidence verified post-merge — they
 * need a running bridge + non-shared app the unit sandbox cannot host.
 */
test.describe('Neo.ai.Client — non-SharedWorker window registration', () => {
    let client, originalWebSocket;

    test.beforeAll(() => {
        originalWebSocket    = globalThis.WebSocket;
        globalThis.WebSocket = UnitTestWebSocket;

        if (!Neo.currentWorker) {
            Neo.currentWorker = {on: () => {}, isSharedWorker: false}
        }
        if (!Neo.worker) {
            Neo.worker = {App: {id: 'test-worker'}}
        }
    });

    test.afterAll(() => {
        globalThis.WebSocket = originalWebSocket
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
            Neo.apps                      = originalApps
        }

        return notifications
    };

    const runOnAppRegistered = (isSharedWorker, data) => {
        const notifications            = [];
        const originalSendNotification = client.sendNotification;
        const originalSharedWorker     = Neo.worker.App.isSharedWorker;

        client.sendNotification       = (method, params) => notifications.push({method, params});
        Neo.worker.App.isSharedWorker = isSharedWorker;

        try {
            client.onAppRegistered(data)
        } finally {
            client.sendNotification       = originalSendNotification;
            Neo.worker.App.isSharedWorker = originalSharedWorker
        }

        return notifications
    };

    test('an app that registers after the socket opened announces its window, once', () => {
        // The Bridge was up first, so the socket opened before any app registered
        expect(runOnSocketOpen(false, {}).filter(n => n.method === 'window_connected'), 'the open finds nothing to announce').toEqual([]);

        expect(runOnAppRegistered(false, {appName: 'LateApp', windowId: 'win-late-1'})).toEqual([
            {method: 'window_connected', params: {appName: 'LateApp', windowId: 'win-late-1'}}
        ]);

        client.onSocketClose({})
    });

    test('an app that registered before the open is announced by the open alone', () => {
        // No socket yet: the registration has no one to tell
        client.onSocketClose({});
        expect(runOnAppRegistered(false, {appName: 'EarlyApp', windowId: 'win-early-1'})).toEqual([]);

        expect(runOnSocketOpen(false, {'win-early-1': {name: 'EarlyApp'}}).filter(n => n.method === 'window_connected')).toEqual([
            {method: 'window_connected', params: {appName: 'EarlyApp', windowId: 'win-early-1'}}
        ]);

        client.onSocketClose({})
    });

    test('a SharedWorker app registering after the open is left to its port connect', () => {
        runOnSocketOpen(true, {});
        expect(runOnAppRegistered(true, {appName: 'PortalApp', windowId: 'win-shared-2'})).toEqual([]);

        client.onSocketClose({})
    });

    test('onSocketOpen registers the implicit window for a non-SharedWorker app', () => {
        const notifications = runOnSocketOpen(false, {'win-nonshared-1': {name: 'NonSharedApp'}});

        const implicit = notifications.find(
            n => n.method === 'window_connected' && n.params.windowId === 'win-nonshared-1'
        );

        expect(implicit, 'the non-shared implicit window must be registered with the bridge').toBeTruthy();
        expect(implicit.params.appName).toBe('NonSharedApp')
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

    test('projects capability facts without leaking the private native route', () => {
        const
            notifications  = [],
            originalGet    = Neo.manager.Window.get,
            originalSend   = client.sendNotification,
            originalSocket = client.socket;

        Neo.manager.Window.get = () => ({
            capabilities: {close: true, focus: true, position: true, resize: true},
            nativeRoute : {
                nativeHandleKey: 'handle-a',
                ownerWindowId  : 'owner-a',
                targetWindowId : 'popup-id'
            }
        });
        // `isConnected` reads the socket's readyState, so a connected client is a client holding an open socket
        client.socket           = {socket: {readyState: WebSocket.OPEN}, sendMessage: () => {}};
        client.sendNotification = (method, params) => notifications.push({method, params});

        try {
            client.onAppWorkerWindowConnect({appName: 'PopupApp', windowId: 'popup-id'})
        } finally {
            Neo.manager.Window.get  = originalGet;
            client.sendNotification = originalSend;
            client.socket           = originalSocket
        }

        expect(notifications).toEqual([{
            method: 'window_connected',
            params: {
                appName     : 'PopupApp',
                capabilities: {close: true, focus: true, position: true, resize: true},
                chrome      : undefined,
                innerRect   : undefined,
                outerRect   : undefined,
                windowId    : 'popup-id'
            }
        }]);
        expect(notifications[0].params.nativeRoute).toBeUndefined()
    });
});
