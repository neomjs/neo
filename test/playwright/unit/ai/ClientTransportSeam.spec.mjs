import {setup} from '../../setup.mjs';

const appName = 'AiClientTransportSeamTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}    from '@playwright/test';
import {execFile}        from 'node:child_process';
import path              from 'node:path';
import {promisify}       from 'node:util';
import {fileURLToPath}   from 'node:url';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import UnitTestWebSocket from './UnitTestWebSocket.mjs';

const
    root    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
    execute = promisify(execFile);

/**
 * @summary Imports `Neo.ai.Client` in a fresh Node process, so its construction is observed rather than cached by an
 * earlier spec, then drives the window lifecycle and the transport start against a dial-counting socket.
 * @returns {Promise<Object>} What the client did at each step
 */
async function seamProbe() {
    const script = `
        import Neo from './src/Neo.mjs';
        import * as core from './src/core/_export.mjs';
        import {setup} from './test/playwright/setup.mjs';

        setup({neoConfig: {unitTestMode: true}, appConfig: {name: 'AiClientTransportSeamProbe'}});

        let dials = 0;

        globalThis.WebSocket = class {
            static CLOSED = 3; static CLOSING = 2; static CONNECTING = 0; static OPEN = 1;
            readyState = 0;
            constructor() {dials++}
            close() {this.readyState = 3}
            send() {}
        };

        const listeners = {}, on = Neo.currentWorker.on;

        Neo.currentWorker.on = function(map) {
            if (map?.scope?.className === 'Neo.ai.Client') {
                Object.entries(map).forEach(([name, fn]) => {name !== 'scope' && (listeners[name] = fn.bind(map.scope))})
            }
            return on?.apply(this, arguments)
        };
        Neo.worker.App = {id: 'probe-worker', isSharedWorker: false};

        const {default: client} = await import('./src/ai/Client.mjs'), report = {};

        report.socketAfterImport = client.socket;
        report.listeners         = Object.keys(listeners).sort();

        listeners.windowFocus({});
        listeners.visibilityChange({hidden: false});
        report.dialsAfterLifecycle = dials;

        client.logs.push({type: 'log', message: 'no transport'});
        report.logsWithoutTransport = client.logs.length;

        client.connect();
        client.connect();
        report.dialsAfterConnect = dials;

        client.logs.push({type: 'log', message: 'before open'});
        report.logsWithTransport = client.logs.length;

        const flushed = [];

        client.socket.sendMessage = () => {};
        client.sendNotification   = (method, params) => {method === 'console_log' && flushed.push(params.message)};
        client.onSocketOpen({});

        report.flushed       = flushed;
        report.logsAfterOpen = client.logs.length;

        const owned = [...Object.values(client.services), client.writeGuard, client.transactionService, client.socket],
              un    = Neo.currentWorker.un;

        Neo.currentWorker.un = function(map) {
            map?.scope === client && (report.unsubscribed = Object.keys(map).filter(name => name !== 'scope').sort());
            return un?.apply(this, arguments)
        };

        client.destroy();
        report.ownedDestroyed = owned.every(item => item.isDestroyed);

        console.log(JSON.stringify(report));
    `;

    const {stdout} = await execute(process.execPath, ['--input-type=module', '-e', script], {
        cwd: root, encoding: 'utf8', timeout: 15000
    });

    return JSON.parse(stdout.trim().split('\n').at(-1))
}

test.describe('Neo.ai.Client - registry without transport (#20371)', () => {
    let report;

    test.beforeAll(async () => {report = await seamProbe()});

    test('constructing the client opens no socket, and window focus or a shown window dials none', () => {
        expect(report.socketAfterImport).toBeNull();
        expect(report.listeners).toEqual(['appRegistered', 'connect', 'disconnect', 'visibilityChange', 'windowFocus']);
        expect(report.dialsAfterLifecycle).toBe(0)
    });

    test('without a started transport, console lines are not retained', () => {
        expect(report.logsWithoutTransport).toBe(0)
    });

    test('connect() dials exactly once, however often it is called', () => {
        expect(report.dialsAfterConnect).toBe(1)
    });

    test('a started transport keeps the lines logged before the open, and the open flushes them', () => {
        expect(report.logsWithTransport).toBe(1);
        expect(report.flushed).toEqual(['before open']);
        expect(report.logsAfterOpen).toBe(0)
    });

    test('destroy() ends the worker subscriptions and destroys the services, write guard, undo stack and socket', () => {
        expect(report.unsubscribed).toEqual(report.listeners);
        expect(report.ownedDestroyed).toBe(true)
    })
});

test.describe('Neo.ai.Client#handleTestRequest (#20371)', () => {
    let calls, client, originalCheckNamespace, originalWebSocket;

    test.beforeAll(() => {
        originalWebSocket    = globalThis.WebSocket;
        globalThis.WebSocket = UnitTestWebSocket;

        Neo.currentWorker ??= {on: () => {}};
        Neo.worker        ??= {};
        Neo.worker.App    ??= {id: 'test-worker', isSharedWorker: false}
    });

    test.afterAll(() => {
        globalThis.WebSocket = originalWebSocket
    });

    test.beforeEach(async () => {
        await import('../../../../src/ai/Client.mjs');

        calls                  = [];
        client                 = Neo.ai.Client;
        originalCheckNamespace = client.services.runtime.checkNamespace;

        client.services.runtime.checkNamespace = (params, context) => {
            calls.push({params, context});
            return true
        }
    });

    test.afterEach(() => {
        client.services.runtime.checkNamespace = originalCheckNamespace;
        Neo.config.allowAiClientInTests        = false
    });

    test('refuses before dispatch unless the boot allows the client in tests', async () => {
        Neo.config.allowAiClientInTests = false;

        await expect(client.handleTestRequest('check_namespace', {namespace: 'Neo.button.Base'}, {agentId: 'a', sessionId: 's'}))
            .rejects.toThrow('allowAiClientInTests');

        expect(calls).toEqual([])
    });

    test('refuses an incomplete writer pair before dispatch', async () => {
        Neo.config.allowAiClientInTests = true;

        for (const context of [undefined, null, {}, {agentId: 'a'}, {agentId: 'a', sessionId: ''}, {agentId: 7, sessionId: 's'}]) {
            await expect(client.handleTestRequest('check_namespace', {namespace: 'Neo.button.Base'}, context))
                .rejects.toThrow('writer pair')
        }

        expect(calls).toEqual([])
    });

    test('dispatches a full pair to the registered service, in the envelope context shape', async () => {
        Neo.config.allowAiClientInTests = true;

        const result = await client.handleTestRequest('check_namespace', {namespace: 'Neo.button.Base'},
            {agentId: 'a', sessionId: 's', stray: true});

        expect(result).toBe(true);
        expect(calls).toEqual([{params: {namespace: 'Neo.button.Base'}, context: {agentId: 'a', sessionId: 's'}}])
    })
});
