import {test, expect} from '@playwright/test';

import {
    recordTurnPresenceOverMcp,
    readToolJson
} from '../../../../../../../ai/mcp/server/memory-core/helpers/recordTurnPresenceOverMcp.mjs';

const BASE_URL = 'http://plane.test/mc/mcp';

/**
 * @summary Builds the client/transport seam pair, capturing what the collaborator sent.
 * @param {Object} [options]
 * @param {Object} [options.payload] JSON the fake tool returns.
 * @param {Boolean} [options.isError=false] Whether the tool result reports an error.
 * @returns {Object} Captured state plus the two seam classes.
 */
function createClientSeam({payload = {agentIdentity: '@test-seat', status: 'recorded'}, isError = false} = {}) {
    const state = {calls: [], headers: null, url: null, closed: false};

    class TransportStub {
        constructor(url, {requestInit} = {}) {
            state.url     = url.toString();
            state.headers = requestInit?.headers
        }
    }

    class ClientStub {
        async connect() {}

        async callTool(request) {
            state.calls.push(request);

            return {isError, content: [{type: 'text', text: JSON.stringify(payload)}]}
        }

        async close() { state.closed = true }
    }

    return {state, ClientClass: ClientStub, TransportClass: TransportStub}
}

test.describe('recordTurnPresenceOverMcp', () => {
    test('sends the event to the served store and names the seat in the identity header', async () => {
        const {state, ClientClass, TransportClass} = createClientSeam();

        const result = await recordTurnPresenceOverMcp({
            baseUrl   : BASE_URL,
            identity  : '@test-seat',
            credential: 'test-bearer',
            action    : 'progress',
            note      : 'claude PostToolUse Read',
            source    : 'claude-post-tool-use',
            ClientClass,
            TransportClass
        });

        expect(state.url).toBe(BASE_URL);
        expect(state.calls).toHaveLength(1);
        expect(state.calls[0].name).toBe('record_turn_presence');
        expect(state.calls[0].arguments).toEqual({
            action: 'progress',
            note  : 'claude PostToolUse Read',
            source: 'claude-post-tool-use'
        });
        expect(result.status).toBe('recorded');
        expect(state.closed).toBe(true);

        // The header is not decoration. Without it the plane records the beacon against the credential's
        // owner, which for a WRITE means publishing a peer as mid-turn when they are not.
        expect(state.headers['X-PREFERRED-USERNAME']).toBe('@test-seat');
        expect(state.headers.Authorization).toBe('Bearer test-bearer')
    });

    test('omits unspecified fields rather than sending explicit undefined', async () => {
        const {state, ClientClass, TransportClass} = createClientSeam();

        await recordTurnPresenceOverMcp({baseUrl: BASE_URL, identity: '@test-seat', ClientClass, TransportClass});

        // Passing `turnId: undefined` through would override the tool's own resolution with an explicit
        // absence — a different contract from not mentioning it.
        expect(Object.keys(state.calls[0].arguments)).toEqual(['action']);
        expect(state.headers.Authorization).toBeUndefined()
    });

    test('refuses to resolve its own endpoint or identity', async () => {
        const {ClientClass, TransportClass} = createClientSeam();

        await expect(recordTurnPresenceOverMcp({identity: '@test-seat', ClientClass, TransportClass}))
            .rejects.toThrow(/requires an injected baseUrl/);

        await expect(recordTurnPresenceOverMcp({baseUrl: BASE_URL, ClientClass, TransportClass}))
            .rejects.toThrow(/requires an identity/)
    });

    test('rejects a beacon the plane recorded against a DIFFERENT agent', async () => {
        const {state, ClientClass, TransportClass} = createClientSeam({
            payload: {agentIdentity: '@somebody-else', status: 'recorded'}
        });

        // The header names the seat; it does not guarantee the plane honoured it. Reporting success here
        // would publish another agent as mid-turn — strictly worse than recording nothing.
        await expect(recordTurnPresenceOverMcp({
            baseUrl : BASE_URL,
            identity: '@test-seat',
            ClientClass,
            TransportClass
        })).rejects.toThrow(/recorded presence for '@somebody-else' but this seat is '@test-seat'/);

        expect(state.closed).toBe(true)
    });

    test('surfaces a tool-level error instead of returning a hollow success', async () => {
        const {ClientClass, TransportClass} = createClientSeam({isError: true});

        await expect(recordTurnPresenceOverMcp({
            baseUrl : BASE_URL,
            identity: '@test-seat',
            ClientClass,
            TransportClass
        })).rejects.toThrow(/isError=true/)
    });

    test('a no-op result carries no identity to disagree with and passes through', async () => {
        const {ClientClass, TransportClass} = createClientSeam({
            payload: {status: 'noop', reason: 'no-active-turn'}
        });

        await expect(recordTurnPresenceOverMcp({
            baseUrl : BASE_URL,
            identity: '@test-seat',
            action  : 'terminal',
            ClientClass,
            TransportClass
        })).resolves.toMatchObject({status: 'noop', reason: 'no-active-turn'})
    });

    test('readToolJson refuses an empty content block rather than inventing a payload', () => {
        expect(() => readToolJson({content: []})).toThrow(/no text content/);
        expect(() => readToolJson({content: [{type: 'text', text: '  '}]})).toThrow(/no text content/);
        expect(readToolJson({content: [{type: 'text', text: '{"status":"recorded"}'}]})).toEqual({status: 'recorded'})
    })
});
