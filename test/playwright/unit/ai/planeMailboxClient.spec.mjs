import {test, expect} from '@playwright/test';

import {createPlaneMailboxClient} from '../../../../ai/services/fleet/planeMailboxClient.mjs';

/**
 * @summary Unit coverage for the plane mailbox client — the streamable-HTTP MCP client the
 * Fleet server binds its mailbox/compose/catch-up seams to in plane mode.
 *
 * Hermetic by construction: the module chain (client + mcpWireParsing + SDK type schemas) is pure,
 * so no Neo namespace, no setup(), and no network — every wire interaction rides the injected
 * `fetchImpl` seam with scripted responses.
 */

const BASE_URL = 'http://127.0.0.1:3102/mc/mcp';
const IDENTITY = '@neo-fable-clio';

/**
 * @summary One scripted Response-shaped object (the subset the client reads).
 * @param {Object} options
 * @returns {Object}
 */
function scriptedResponse({status = 200, sessionId = null, body = {}}) {
    return {
        ok     : status >= 200 && status < 300,
        status,
        headers: {get: name => (name === 'mcp-session-id' ? sessionId : null)},
        text   : async () => (typeof body === 'string' ? body : JSON.stringify(body))
    }
}

/**
 * @summary Scripted fetch: consumes one queued response per call and records every request for
 * sequence assertions. A queue underrun throws — an unexpected extra request is a test failure,
 * never a hang.
 * @param {Object[]} queue
 * @returns {Function} fetchImpl with a `.calls` recorder.
 */
function scriptedFetch(queue) {
    const calls = [];

    const impl = async (url, options) => {
        const parsedBody = options?.body ? JSON.parse(options.body) : null;

        calls.push({url, method: options?.method, headers: options?.headers ?? {}, body: parsedBody});

        const next = queue.shift();

        if (!next)               throw new Error(`scriptedFetch queue underrun (call ${calls.length})`);
        if (next.reject)         throw Object.assign(new Error('scripted network failure'), {name: next.reject});

        return scriptedResponse(next)
    };

    impl.calls = calls;

    return impl
}

/** @summary The standard happy-path handshake pair: initialize + initialized-notification. */
function handshakeResponses({sessionId = 'sess-1'} = {}) {
    return [
        {status: 200, sessionId, body: {jsonrpc: '2.0', id: 1, result: {
            protocolVersion: '2024-11-05',
            capabilities   : {},
            serverInfo     : {name: 'mc', version: '1'}
        }}},
        {status: 200}
    ]
}

/** @summary One successful tools/call response carrying a JSON text payload. */
function toolResponse(payload) {
    return {status: 200, body: {jsonrpc: '2.0', id: 2, result: {
        content: [{type: 'text', text: JSON.stringify(payload)}]
    }}}
}

/** @summary Init a client through the scripted happy-path handshake + identity probe. */
async function initializedClient({extraResponses = [], identity = IDENTITY} = {}) {
    const fetchImpl = scriptedFetch([
        ...handshakeResponses(),
        toolResponse({identity}),
        ...extraResponses
    ]);

    const client    = createPlaneMailboxClient({baseUrl: BASE_URL, credential: 'token-1', fetchImpl}),
          admission = await client.init({expectedIdentity: IDENTITY});

    return {client, fetchImpl, admission}
}

test.describe('planeMailboxClient: construction', () => {
    test('refuses an empty baseUrl', () => {
        expect(() => createPlaneMailboxClient({baseUrl: '  '})).toThrow('non-empty baseUrl')
    });

    test('callTool before init throws the uninitialized error, no request leaves', async () => {
        const fetchImpl = scriptedFetch([]),
              client    = createPlaneMailboxClient({baseUrl: BASE_URL, fetchImpl});

        await expect(client.callTool('list_messages')).rejects.toThrow('client not initialized');
        expect(fetchImpl.calls).toHaveLength(0)
    })
});

test.describe('planeMailboxClient: init (handshake + single-viewer invariant)', () => {
    test('happy path: initialize → initialized → identity probe, session held', async () => {
        const {admission, fetchImpl} = await initializedClient();

        expect(admission).toEqual({ok: true, status: 200, identity: IDENTITY});

        const [initCall, notifyCall, probeCall] = fetchImpl.calls;

        expect(initCall.body.method).toBe('initialize');
        expect(initCall.headers.Authorization).toBe('Bearer token-1');
        expect(notifyCall.body.method).toBe('notifications/initialized');
        expect(notifyCall.headers['mcp-session-id']).toBe('sess-1');
        expect(probeCall.body.params.name).toBe('list_permissions')
    });

    test('identity mismatch refuses plane mode with the bounded reason', async () => {
        const {admission} = await initializedClient({identity: '@someone-else'});

        expect(admission.ok).toBe(false);
        expect(admission.reason).toBe('plane identity mismatch')
    });

    test('rejected initialize yields a bounded status reason, never remote prose', async () => {
        const fetchImpl = scriptedFetch([{status: 401, body: 'go away, secret prose'}]),
              client    = createPlaneMailboxClient({baseUrl: BASE_URL, fetchImpl}),
              admission = await client.init({expectedIdentity: IDENTITY});

        expect(admission).toEqual({ok: false, status: 401, reason: 'plane MCP initialize failed (401)'})
    });

    test('unreachable plane yields a bounded transport reason', async () => {
        const fetchImpl = scriptedFetch([{reject: 'TimeoutError'}]),
              client    = createPlaneMailboxClient({baseUrl: BASE_URL, fetchImpl}),
              admission = await client.init({expectedIdentity: IDENTITY});

        expect(admission.ok).toBe(false);
        expect(admission.reason).toBe('plane unreachable (TimeoutError)')
    });

    test('non-canonical expectedIdentity is refused before any request leaves', async () => {
        const fetchImpl = scriptedFetch([]),
              client    = createPlaneMailboxClient({baseUrl: BASE_URL, fetchImpl}),
              admission = await client.init({expectedIdentity: '   '});

        expect(admission.ok).toBe(false);
        expect(fetchImpl.calls).toHaveLength(0)
    })
});

test.describe('planeMailboxClient: tool calls (error shape mirrors the in-process services)', () => {
    test('listMessages maps to the list_messages tool and resolves the parsed payload', async () => {
        const payload             = {messages: [{messageId: 'MESSAGE:1', subject: 'hi'}]},
              {client, fetchImpl} = await initializedClient({extraResponses: [toolResponse(payload)]});

        await expect(client.listMessages({limit: 5})).resolves.toEqual(payload);

        const call = fetchImpl.calls.at(-1);

        expect(call.body.params).toEqual({name: 'list_messages', arguments: {limit: 5}})
    });

    test('addMessage maps to the add_message tool', async () => {
        const {client, fetchImpl} = await initializedClient({extraResponses: [toolResponse({status: 'sent'})]});

        await expect(client.addMessage({to: '@peer', subject: 's', body: 'b'})).resolves.toEqual({status: 'sent'});
        expect(fetchImpl.calls.at(-1).body.params.name).toBe('add_message')
    });

    test('a tool-level isError result throws the tool text (the admission-classification contract)', async () => {
        const denial = 'Unauthorized: CAN_READ_INBOX_OF denied for @neo-fable-clio -> @peer';

        const {client} = await initializedClient({extraResponses: [
            {status: 200, body: {jsonrpc: '2.0', id: 2, result: {isError: true, content: [{type: 'text', text: denial}]}}}
        ]});

        await expect(client.callTool('list_messages', {to: '@peer'})).rejects.toThrow(denial)
    });

    test('a transport failure throws a bounded status-only diagnostic', async () => {
        const {client} = await initializedClient({extraResponses: [
            {status: 500, body: 'stack trace prose the caller must never see'}
        ]});

        await expect(client.listMessages()).rejects.toThrow('plane list_messages failed: HTTP 500')
    });

    test('a malformed tool payload throws bounded, never resolves null', async () => {
        const {client} = await initializedClient({extraResponses: [
            {status: 200, body: {jsonrpc: '2.0', id: 2, result: {content: [{type: 'text', text: 'not json'}]}}}
        ]});

        await expect(client.listMessages()).rejects.toThrow('plane list_messages failed: malformed tool payload')
    });

    test('a lost session (404) re-establishes ONCE and retries the call transparently', async () => {
        const payload = {messages: []};

        const {client, fetchImpl} = await initializedClient({extraResponses: [
            {status: 404},               // held session rejected → re-handshake expected
            ...handshakeResponses({sessionId: 'sess-2'}),
            toolResponse(payload)
        ]});

        await expect(client.listMessages()).resolves.toEqual(payload);

        // Sequence proof: probe(3) → failed call → initialize → initialized → retried call.
        const methods = fetchImpl.calls.slice(3).map(call => call.body?.method ?? null);

        expect(methods).toEqual(['tools/call', 'initialize', 'notifications/initialized', 'tools/call']);
        expect(fetchImpl.calls.at(-1).headers['mcp-session-id']).toBe('sess-2')
    });

    test('a lost session with an unreachable plane throws through, not into a retry loop', async () => {
        const {client} = await initializedClient({extraResponses: [
            {status: 404},
            {status: 503}
        ]});

        await expect(client.listMessages()).rejects.toThrow('session lost and plane MCP initialize failed (503)')
    })
});
