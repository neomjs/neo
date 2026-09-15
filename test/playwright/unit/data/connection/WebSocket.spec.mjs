import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'WebSocketConnectionTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Socket         from '../../../../../src/data/connection/WebSocket.mjs';

/**
 * A socket that never opens: these arms drive the reconnect bookkeeping, not a connection.
 */
class DetachedSocket extends Socket {
    static config = {
        className: 'Test.Unit.Data.Connection.DetachedSocket'
    }

    close() {}

    createSocket() {}
}

DetachedSocket = Neo.setupClass(DetachedSocket);

/**
 * @summary `attemptReconnect` gives up after `maxReconnectAttempts`. An owner that reports that its own way marks the
 * `reconnectFailed` payload handled; any failure left unhandled is an error, whether or not someone listened.
 */
test.describe('Neo.data.connection.WebSocket', () => {
    let errors, realError;

    test.beforeEach(() => {
        errors        = [];
        realError     = console.error;
        console.error = (...args) => errors.push(args[0])
    });

    test.afterEach(() => {
        console.error = realError
    });

    const exhaust = socket => {
        socket.reconnectAttempts = socket.maxReconnectAttempts - 1;
        return socket.attemptReconnect()
    };

    test('an owner that marks the final reconnect failure handled is left to report it', async () => {
        let failures = 0;

        const socket = Neo.create(DetachedSocket, {listeners: {reconnectFailed: failure => {failures++; failure.handled = true}}});

        await exhaust(socket);

        expect(failures, 'the owner hears it').toBe(1);
        expect(errors, 'and the socket reports nothing itself').toEqual([]);

        socket.destroy()
    });

    test('a final reconnect failure nobody marks handled is an error, whether or not someone listened', async () => {
        const listened  = Neo.create(DetachedSocket, {listeners: {reconnectFailed: () => {}}}),
              unwatched = Neo.create(DetachedSocket);

        await exhaust(listened);
        await exhaust(unwatched);

        expect(errors).toEqual(['Max reconnection attempts reached', 'Max reconnection attempts reached']);

        listened.destroy();
        unwatched.destroy()
    })
});
