import {setup} from '../../setup.mjs';

const appName = 'AiClientAgentDisconnectTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';

const lock = (agentId, sessionId, subtreePath) => ({agentId, sessionId, subtreePath});

test.describe('Neo.ai.Client - agent disconnect lock release', () => {
    let client, originalWebSocket;

    test.beforeAll(() => {
        originalWebSocket = globalThis.WebSocket;

        globalThis.WebSocket = class UnitTestWebSocket {
            static CLOSED     = 3
            static CLOSING    = 2
            static CONNECTING = 0
            static OPEN       = 1

            readyState = UnitTestWebSocket.OPEN

            constructor(serverAddress) {
                this.serverAddress = serverAddress
            }

            close() {
                this.readyState = UnitTestWebSocket.CLOSED
            }

            send() {}
        };

        Neo.currentWorker = {
            on: () => {}
        };
        Neo.worker = {
            App: {
                id            : 'test-worker',
                isSharedWorker: false
            }
        }
    });

    test.afterAll(() => {
        globalThis.WebSocket = originalWebSocket
    });

    test.beforeEach(async () => {
        const {default: Client} = await import('../../../../src/ai/Client.mjs');

        client             = Neo.ai.Client || Neo.create(Client, {appName});
        client.writeGuard  = Neo.create('Neo.ai.WriteGuard');
        client.isConnected = false
    });

    test('onSocketMessage releases the disconnected writer and frees the held subtree', async () => {
        client.writeGuard.requestWrite(lock('neo-opus-ada', 'sess-1', ['root', 'panel']));

        expect(client.writeGuard.requestWrite(lock('neo-opus-vega', 'sess-2', ['root', 'panel'])).granted).toBe(false);

        await client.onSocketMessage({
            data: {
                type     : 'agent_disconnected',
                agentId  : 'neo-opus-ada',
                sessionId: 'sess-1'
            }
        });

        expect(client.writeGuard.heldLocks()).toHaveLength(0);
        expect(client.writeGuard.requestWrite(lock('neo-opus-vega', 'sess-2', ['root', 'panel'])).granted).toBe(true)
    });

    test('handleAgentDisconnected only releases the exact disconnected writer session', () => {
        client.writeGuard.requestWrite(lock('neo-opus-ada', 'sess-1', ['root', 'a']));
        client.writeGuard.requestWrite(lock('neo-opus-ada', 'sess-2', ['root', 'b']));

        const result = client.handleAgentDisconnected({agentId: 'neo-opus-ada', sessionId: 'sess-1'});

        expect(result.released).toBe(1);
        expect(client.writeGuard.heldLocks()).toEqual([lock('neo-opus-ada', 'sess-2', ['root', 'b'])])
    });

    test('an unknown disconnected writer is a no-op', () => {
        client.writeGuard.requestWrite(lock('neo-opus-ada', 'sess-1', ['root', 'panel']));

        const result = client.handleAgentDisconnected({agentId: 'neo-opus-vega', sessionId: 'sess-2'});

        expect(result.released).toBe(0);
        expect(client.writeGuard.heldLocks()).toEqual([lock('neo-opus-ada', 'sess-1', ['root', 'panel'])])
    });

    test('half-stamped disconnect frames fail closed and do not sweep broad selectors', () => {
        client.writeGuard.requestWrite(lock('neo-opus-ada',  'sess-1', ['root', 'a']));
        client.writeGuard.requestWrite(lock('neo-opus-ada',  'sess-2', ['root', 'b']));
        client.writeGuard.requestWrite(lock('neo-opus-vega', 'sess-1', ['root', 'c']));

        for (const frame of [
            {agentId: 'neo-opus-ada'},
            {sessionId: 'sess-1'},
            {agentId: '', sessionId: 'sess-1'},
            {agentId: 'neo-opus-ada', sessionId: ''},
            {agentId: null, sessionId: 'sess-1'},
            {agentId: 'neo-opus-ada', sessionId: null}
        ]) {
            expect(client.handleAgentDisconnected(frame).released).toBe(0)
        }

        expect(client.writeGuard.heldLocks()).toEqual([
            lock('neo-opus-ada',  'sess-1', ['root', 'a']),
            lock('neo-opus-ada',  'sess-2', ['root', 'b']),
            lock('neo-opus-vega', 'sess-1', ['root', 'c'])
        ])
    });

    // The lock + transaction lifecycles must not diverge: a disconnect frame that releases locks must ALSO
    // sweep the writer's open transaction. (sweep's own behavior is covered by TransactionService.spec; these
    // assert the Client WIRING — that handleAgentDisconnected calls it with the same validated writer pair.)
    test('handleAgentDisconnected sweeps the disconnected writer\'s transaction stack alongside releasing locks', () => {
        client.writeGuard.requestWrite(lock('neo-opus-ada', 'sess-1', ['root', 'panel']));

        const sweptIds      = [],
              realTxService = client.transactionService;

        client.transactionService = {sweep: ({id}) => { sweptIds.push(id); return {swept: true} }};

        try {
            const result = client.handleAgentDisconnected({agentId: 'neo-opus-ada', sessionId: 'sess-1'});

            expect(result.released).toBe(1);                                            // lock released
            expect(result.swept).toBe(true);                                            // tx stack swept (the wiring)
            expect(sweptIds).toEqual([{agentId: 'neo-opus-ada', sessionId: 'sess-1'}]); // keyed on the same writer pair
            expect(client.writeGuard.heldLocks()).toHaveLength(0)
        } finally {
            client.transactionService = realTxService
        }
    });

    test('a half-stamped disconnect frame never sweeps the transaction stack (fail-closed)', () => {
        const sweptIds      = [],
              realTxService = client.transactionService;

        client.transactionService = {sweep: ({id}) => { sweptIds.push(id); return {swept: true} }};

        try {
            for (const frame of [{agentId: 'neo-opus-ada'}, {sessionId: 'sess-1'}, {agentId: 'neo-opus-ada', sessionId: ''}]) {
                const result = client.handleAgentDisconnected(frame);

                expect(result.released).toBe(0);
                expect(result.swept).toBe(false)
            }

            expect(sweptIds).toHaveLength(0) // incomplete identity → neither release nor sweep
        } finally {
            client.transactionService = realTxService
        }
    });
});
