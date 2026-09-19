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

    test('the native close callback publishes the CloseEvent fields', () => {
        const socket = Neo.create(DetachedSocket),
              native = {send() {}},
              event  = {code: 1000, reason: 'job complete', wasClean: true};

        let received;

        try {
            socket.socket = native;
            socket.attemptReconnect = () => {};
            socket.on('close', data => {received = data});

            socket.socket.onclose(event);

            expect(received).toMatchObject({reason: 'job complete', wasClean: true});
            expect(received.event).toBe(event)
        } finally {
            socket.destroy()
        }
    });

    for (const {name, code, wasClean, config, attempts} of [
        {name: 'a normal clean close stays closed by default', code: 1000, wasClean: true, config: {}, attempts: 0},
        {name: 'an explicit opt-in reconnects after a normal clean close', code: 1000, wasClean: true, config: {reconnectOnCleanClose: true}, attempts: 1},
        {name: 'an unclean close still reconnects', code: 1006, wasClean: false, config: {}, attempts: 1},
        {name: 'a clean going-away close still reconnects', code: 1001, wasClean: true, config: {}, attempts: 1}
    ]) {
        test(name, () => {
            const socket = Neo.create(DetachedSocket, config);

            let calls = 0;

            try {
                socket.attemptReconnect = () => {calls++};
                socket.onClose({code, reason: '', wasClean});

                expect(calls).toBe(attempts)
            } finally {
                socket.destroy()
            }
        })
    }

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
