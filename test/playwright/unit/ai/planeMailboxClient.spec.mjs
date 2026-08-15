import {test, expect} from '@playwright/test';

import {createPlaneMailboxClient} from '../../../../ai/services/fleet/planeMailboxClient.mjs';

/**
 * @summary Unit coverage for the plane mailbox client — the SDK-backed streamable-HTTP MCP client
 * the Fleet server binds its mailbox/compose/catch-up seams to in plane mode.
 *
 * Hermetic by construction, but NOT mock-shallow: every case drives the REAL MCP SDK client and
 * Streamable-HTTP transport through the transport's custom-fetch seam, so protocol negotiation,
 * request-id allocation, and response correlation are the production code paths under scripted
 * HTTP. The concurrent case pins the exact production call shape (the catch-up source's
 * `Promise.allSettled` pair) that a serial script cannot see.
 */

const LOOPBACK_URL = 'http://127.0.0.1:3102/mc/mcp';
const IDENTITY     = '@neo-fable-clio';

/**
 * @summary One Response-shaped object covering the subset the SDK transport reads.
 * @param {Object} options
 * @returns {Object}
 */
function planeResponse({status = 200, contentType = 'application/json', sessionId = null, body = null}) {
    const text = body === null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));

    return {
        ok        : status >= 200 && status < 300,
        status,
        statusText: String(status),
        headers   : {
            get: name => {
                const key = String(name).toLowerCase();

                if (key === 'mcp-session-id') return sessionId;
                if (key === 'content-type')   return body === null ? null : contentType;

                return null
            }
        },
        text: async () => text,
        json: async () => JSON.parse(text)
    }
}

/**
 * @summary A scripted plane: a handler-based fetch implementation speaking the MCP streamable-HTTP
 * dialect (initialize echo, session headers, tools/call correlation by echoed request id). Handlers
 * make failure injection per-call precise; `calls` records every request for sequence assertions.
 *
 * @param {Object}   [options]
 * @param {String[]} [options.identityBySession] `list_permissions` identity per session ordinal —
 *     index 0 answers the first established session, index 1 the session after one reconnect, etc.
 *     The last entry repeats for later sessions.
 * @param {Function} [options.toolResponder] `({name, args, call, sessionOrdinal}) =>` one of
 *     `{payload}`, `{textPayload}`, `{toolError}`, `{status}`, optionally `{delayMs}` — scripted
 *     behavior for non-`list_permissions` tools.
 * @param {Number}   [options.failInitializeTimes] Reject that many initialize attempts with 503
 *     before succeeding.
 * @returns {Object} `{fetchImpl, calls}`
 */
function scriptedPlane({identityBySession = [IDENTITY], toolResponder = null, failInitializeTimes = 0, deleteDelayMs = 0} = {}) {
    const calls = [];

    let sessions           = 0,
        initializeFailures = failInitializeTimes;

    const fetchImpl = async (url, init = {}) => {
        const method  = init.method || 'GET',
              headers = new Headers(init.headers || {}),
              rawBody = typeof init.body === 'string' ? init.body : null,
              body    = rawBody ? JSON.parse(rawBody) : null;

        const call = {
            method,
            url          : String(url),
            authorization: headers.get('authorization'),
            sessionHeader: headers.get('mcp-session-id'),
            rpcMethod    : body?.method ?? null,
            rpcId        : body?.id ?? null,
            toolName     : body?.method === 'tools/call' ? body?.params?.name : null,
            toolArgs     : body?.method === 'tools/call' ? body?.params?.arguments : null
        };

        calls.push(call);

        if (method === 'GET') return planeResponse({status: 405});

        if (method === 'DELETE') {
            // Slow teardown widens the window in which a concurrent caller's failure lands while a
            // predecessor is still being torn down — the reviewer's asymmetric-teardown probe shape.
            if (deleteDelayMs) await new Promise(resolve => setTimeout(resolve, deleteDelayMs));

            return planeResponse({status: 200, body: {}})
        }

        if (body?.method === 'initialize') {
            if (initializeFailures > 0) {
                initializeFailures--;

                return planeResponse({status: 503, body: 'unavailable'})
            }

            sessions++;

            return planeResponse({
                sessionId: `sess-${sessions}`,
                body     : {jsonrpc: '2.0', id: body.id, result: {
                    protocolVersion: body.params.protocolVersion,
                    capabilities   : {tools: {}},
                    serverInfo     : {name: 'scripted-plane', version: '1'}
                }}
            })
        }

        if (body?.method === 'notifications/initialized') {
            return planeResponse({status: 202})
        }

        if (body?.method === 'tools/call') {
            const sessionOrdinal = Math.max(0, sessions - 1);

            if (call.toolName === 'list_permissions') {
                const identity = identityBySession[Math.min(sessionOrdinal, identityBySession.length - 1)];

                return planeResponse({body: {jsonrpc: '2.0', id: body.id, result: {
                    content: [{type: 'text', text: JSON.stringify({identity})}]
                }}})
            }

            const scripted = toolResponder
                ? await toolResponder({name: call.toolName, args: call.toolArgs, call, sessionOrdinal})
                : {payload: {}};

            if (scripted.delayMs) await new Promise(resolve => setTimeout(resolve, scripted.delayMs));

            if (scripted.status) return planeResponse({status: scripted.status, body: 'scripted failure'});

            if (scripted.toolError) {
                return planeResponse({body: {jsonrpc: '2.0', id: body.id, result: {
                    isError: true,
                    content: [{type: 'text', text: scripted.toolError}]
                }}})
            }

            if (scripted.textPayload !== undefined) {
                return planeResponse({body: {jsonrpc: '2.0', id: body.id, result: {
                    content: [{type: 'text', text: scripted.textPayload}]
                }}})
            }

            return planeResponse({body: {jsonrpc: '2.0', id: body.id, result: {
                structuredContent: scripted.payload,
                content          : [{type: 'text', text: JSON.stringify(scripted.payload)}]
            }}})
        }

        return planeResponse({status: 400, body: 'unscripted request'})
    };

    return {fetchImpl, calls}
}

/** @summary Create + init one client against a scripted plane. */
async function initializedClient(planeOptions = {}, clientOptions = {}) {
    const plane  = scriptedPlane(planeOptions),
          client = createPlaneMailboxClient({
              baseUrl   : LOOPBACK_URL,
              credential: 'token-1',
              fetchImpl : plane.fetchImpl,
              ...clientOptions
          }),
          admission = await client.init({expectedIdentity: IDENTITY});

    return {client, plane, admission}
}

test.describe('planeMailboxClient: endpoint boundary (before any request)', () => {
    test('rejects a non-loopback http endpoint — TLS required off-loopback', () => {
        expect(() => createPlaneMailboxClient({baseUrl: 'http://fleet.example.com/mc/mcp'}))
            .toThrow('TLS is required')
    });

    test('rejects URL-embedded credentials outright', () => {
        expect(() => createPlaneMailboxClient({baseUrl: 'https://user:secret@fleet.example.com/mc/mcp'}))
            .toThrow('URL-embedded')
    });

    test('rejects a malformed endpoint', () => {
        expect(() => createPlaneMailboxClient({baseUrl: 'not a url'})).toThrow('refused the endpoint')
    });

    test('accepts loopback http and any https, emitting no request at construction', () => {
        const plane = scriptedPlane();

        createPlaneMailboxClient({baseUrl: LOOPBACK_URL, fetchImpl: plane.fetchImpl});
        createPlaneMailboxClient({baseUrl: 'https://fleet.example.com/mc/mcp', fetchImpl: plane.fetchImpl});

        expect(plane.calls).toHaveLength(0)
    })
});

test.describe('planeMailboxClient: init (SDK handshake + single-viewer proof)', () => {
    test('happy path: SDK connect handshake, then list_permissions proves the viewer', async () => {
        const {admission, plane} = await initializedClient();

        expect(admission).toEqual({ok: true, identity: IDENTITY});

        const rpcMethods = plane.calls.filter(call => call.rpcMethod).map(call => call.rpcMethod);

        expect(rpcMethods[0]).toBe('initialize');
        expect(rpcMethods).toContain('notifications/initialized');
        expect(plane.calls.at(-1).toolName).toBe('list_permissions');
        expect(plane.calls[0].authorization).toBe('Bearer token-1')
    });

    test('identity mismatch refuses fail-closed AND tears the session down (awaited DELETE)', async () => {
        const {admission, plane} = await initializedClient({identityBySession: ['@someone-else']});

        expect(admission).toEqual({ok: false, reason: 'plane identity mismatch', blockerCode: 'viewer-binding-unavailable'});
        expect(plane.calls.some(call => call.method === 'DELETE')).toBe(true)
    });

    test('unreachable plane yields a bounded transport reason', async () => {
        const client = createPlaneMailboxClient({
            baseUrl  : LOOPBACK_URL,
            fetchImpl: async () => { throw Object.assign(new Error('boom'), {name: 'TypeError'}) }
        });

        const admission = await client.init({expectedIdentity: IDENTITY});

        expect(admission.ok).toBe(false);
        expect(admission.reason).toMatch(/^plane unreachable \(/)
    });

    test('non-canonical expectedIdentity is refused before any request leaves', async () => {
        const plane  = scriptedPlane(),
              client = createPlaneMailboxClient({baseUrl: LOOPBACK_URL, fetchImpl: plane.fetchImpl});

        const admission = await client.init({expectedIdentity: '   '});

        expect(admission.ok).toBe(false);
        expect(plane.calls).toHaveLength(0)
    })
});

test.describe('planeMailboxClient: tool calls (error shape mirrors the in-process services)', () => {
    test('callTool before init throws the uninitialized error, no request leaves', async () => {
        const plane  = scriptedPlane(),
              client = createPlaneMailboxClient({baseUrl: LOOPBACK_URL, fetchImpl: plane.fetchImpl});

        await expect(client.callTool('list_messages')).rejects.toThrow('client not initialized');
        expect(plane.calls).toHaveLength(0)
    });

    test('listMessages maps to the list_messages tool and resolves the parsed payload', async () => {
        const payload = {messages: [{messageId: 'MESSAGE:1', subject: 'hi'}]};

        const {client, plane} = await initializedClient({
            toolResponder: ({name}) => (name === 'list_messages' ? {payload} : {payload: {}})
        });

        await expect(client.listMessages({limit: 5})).resolves.toEqual(payload);

        const call = plane.calls.at(-1);

        expect(call.toolName).toBe('list_messages');
        expect(call.toolArgs).toEqual({limit: 5})
    });

    test('addMessage maps to the add_message tool; text-only payloads parse too', async () => {
        const {client, plane} = await initializedClient({
            toolResponder: () => ({textPayload: JSON.stringify({status: 'sent'})})
        });

        await expect(client.addMessage({to: '@peer', subject: 's', body: 'b'})).resolves.toEqual({status: 'sent'});
        expect(plane.calls.at(-1).toolName).toBe('add_message')
    });

    test('a tool-level isError result throws the tool text (the admission-classification contract)', async () => {
        const denial = 'Unauthorized: CAN_READ_INBOX_OF denied for @neo-fable-clio -> @peer';

        const {client} = await initializedClient({toolResponder: () => ({toolError: denial})});

        await expect(client.callTool('list_messages', {to: '@peer'})).rejects.toThrow(denial)
    });

    test('a malformed tool payload throws bounded, never resolves null', async () => {
        const {client} = await initializedClient({toolResponder: () => ({textPayload: 'not json'})});

        await expect(client.listMessages()).rejects.toThrow('plane list_messages failed: malformed tool payload')
    })
});

test.describe('planeMailboxClient: concurrency (the production catch-up call shape)', () => {
    test('two in-flight tool calls carry UNIQUE request ids and correlate to their own payloads', async () => {
        const {client, plane} = await initializedClient({
            toolResponder: ({name}) => ({
                // Answer the FIRST tool slower than the second: correct correlation must survive
                // out-of-order completion, which is exactly what a shared static id cannot do.
                delayMs: name === 'explore_memory_history' ? 40 : 5,
                payload: {tool: name}
            })
        });

        const [memory, pulls] = await Promise.allSettled([
            client.callTool('explore_memory_history',       {limit: 1}),
            client.callTool('explore_pull_request_history', {limit: 1})
        ]);

        expect(memory.status).toBe('fulfilled');
        expect(pulls.status).toBe('fulfilled');
        expect(memory.value).toEqual({tool: 'explore_memory_history'});
        expect(pulls.value).toEqual({tool: 'explore_pull_request_history'});

        const inFlightIds = plane.calls
            .filter(call => ['explore_memory_history', 'explore_pull_request_history'].includes(call.toolName))
            .map(call => call.rpcId);

        expect(inFlightIds).toHaveLength(2);
        expect(new Set(inFlightIds).size).toBe(2)
    })
});

test.describe('planeMailboxClient: replay boundary (proven session-invalid only)', () => {
    test('an AMBIGUOUS mutating failure commits at most once: response lost AFTER commit → throw, no replay', async () => {
        // Reviewer-reproduced shape (committedCopies: 2 on the broken build): the plane COMMITS the
        // add_message, then the response is lost to a network error. Ambiguity must throw — a
        // replay would be a SECOND durable message, since MC mints a fresh id per invocation.
        let committedCopies = 0;

        const plane = scriptedPlane({
            toolResponder: ({name}) => {
                if (name === 'add_message') {
                    committedCopies++;

                    throw Object.assign(new Error('socket closed mid-response'), {name: 'TypeError'})
                }

                return {payload: {}}
            }
        });

        const client = createPlaneMailboxClient({baseUrl: LOOPBACK_URL, credential: 't', fetchImpl: plane.fetchImpl});

        expect((await client.init({expectedIdentity: IDENTITY})).ok).toBe(true);

        await expect(client.addMessage({to: '@peer', subject: 's', body: 'b'}))
            .rejects.toThrow(/ambiguous — not replayed/);

        expect(committedCopies).toBe(1);
        expect(plane.calls.filter(call => call.toolName === 'add_message')).toHaveLength(1)
    });

    test('an ambiguous 5xx read failure throws without replay — the adapters own the degraded state', async () => {
        const {client, plane} = await initializedClient({toolResponder: () => ({status: 503})});

        await expect(client.listMessages()).rejects.toThrow(/ambiguous — not replayed/);
        expect(plane.calls.filter(call => call.toolName === 'list_messages')).toHaveLength(1)
    })
});

test.describe('planeMailboxClient: session loss (one bounded recovery, identity re-proven)', () => {
    test('CONCURRENT callers after a FAILED recovery share ONE single-flight re-proof — no orphan session', async () => {
        // Reviewer-named race: session === null after a failed recovery, then two production-shaped
        // concurrent callers. Broken build: two parallel handshakes, the later candidate overwrites
        // the shared slot, the earlier proven session is orphaned. Contract: ONE shared re-proof.
        let initializeAttempts = 0,
            firstToolFailed    = false;

        const plane = scriptedPlane({
            identityBySession: [IDENTITY, IDENTITY, IDENTITY],
            toolResponder    : ({name}) => {
                if (!firstToolFailed) {
                    firstToolFailed = true;

                    return {status: 404}
                }

                return {payload: {tool: name}}
            }
        });

        const fetchImpl = async (url, init = {}) => {
            const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;

            // Initialize #2 (the first recovery) fails — that failed recovery leaves session null.
            if (body?.method === 'initialize' && ++initializeAttempts === 2) {
                return planeResponse({status: 503, body: 'down'})
            }

            return plane.fetchImpl(url, init)
        };

        const client = createPlaneMailboxClient({baseUrl: LOOPBACK_URL, credential: 't', fetchImpl});

        expect((await client.init({expectedIdentity: IDENTITY})).ok).toBe(true);

        // Call 1: 404 → recovery initialize 503s → session stays null.
        await expect(client.listMessages()).rejects.toThrow(/session lost and plane unreachable/);

        // The production catch-up pair arrives concurrently against the null session.
        const [memory, pulls] = await Promise.allSettled([
            client.callTool('explore_memory_history',       {limit: 1}),
            client.callTool('explore_pull_request_history', {limit: 1})
        ]);

        expect(memory.status).toBe('fulfilled');
        expect(pulls.status).toBe('fulfilled');
        expect(memory.value).toEqual({tool: 'explore_memory_history'});
        expect(pulls.value).toEqual({tool: 'explore_pull_request_history'});

        // Single-flight: exactly 3 initialize attempts total (boot, failed recovery, ONE shared
        // re-proof) and exactly 2 identity proofs (boot + the shared re-proof).
        expect(initializeAttempts).toBe(3);
        expect(plane.calls.filter(call => call.toolName === 'list_permissions')).toHaveLength(2);

        // No orphan: the only torn session is the boot session (one DELETE); the shared re-proof
        // session is current, never overwritten by a second candidate.
        expect(plane.calls.filter(call => call.method === 'DELETE')).toHaveLength(1)
    });

    test('a transport-level failure reconnects ONCE, re-proves the SAME identity, then replays', async () => {
        let failed = false;

        const {client, plane} = await initializedClient({
            identityBySession: [IDENTITY, IDENTITY],
            toolResponder    : ({name}) => {
                if (name === 'list_messages' && !failed) {
                    failed = true;

                    return {status: 404}
                }

                return {payload: {recovered: true}}
            }
        });

        await expect(client.listMessages()).resolves.toEqual({recovered: true});

        // Sequence proof: failed call → teardown DELETE → fresh initialize → re-proof → replay.
        const tail        = plane.calls.map(call => call.rpcMethod ?? call.method);
        const failedIndex = plane.calls.findIndex(call => call.toolName === 'list_messages');

        expect(tail.slice(failedIndex + 1)).toEqual(
            expect.arrayContaining(['DELETE', 'initialize', 'notifications/initialized', 'tools/call'])
        );
        expect(plane.calls.filter(call => call.toolName === 'list_permissions')).toHaveLength(2);
        expect(plane.calls.filter(call => call.toolName === 'list_messages')).toHaveLength(2)
    });

    test('a reconnect that proves a CHANGED identity rejects WITHOUT replaying the original tool', async () => {
        const {client, plane} = await initializedClient({
            identityBySession: [IDENTITY, '@rotated-subject'],
            toolResponder    : () => ({status: 404})
        });

        const failure = await client.listMessages().then(() => null, error => error);

        expect(failure?.message).toBe('plane list_messages failed: session lost and plane identity mismatch');
        // the binding-class stamp travels the throw: the refusal site classified, the error CARRIES
        expect(failure?.planeBlockerCode).toBe('viewer-binding-unavailable');

        expect(plane.calls.filter(call => call.toolName === 'list_messages')).toHaveLength(1);
        expect(plane.calls.filter(call => call.toolName === 'list_permissions')).toHaveLength(2)
    });

    test('an ambiguous transport failure carries NO binding stamp — ambiguity never classifies', async () => {
        const {client} = await initializedClient({
            toolResponder: () => ({status: 500})
        });

        const failure = await client.listMessages().then(() => null, error => error);

        expect(failure).toBeInstanceOf(Error);
        expect(failure.planeBlockerCode).toBeUndefined()
    });

    test('a reconnect against a dead plane throws through, not into a retry loop', async () => {
        // The plane dies mid-life: the first initialize succeeds (healthy boot), every later
        // initialize 503s, and tool calls 404 — so the single recovery attempt must fail loudly.
        const plane = scriptedPlane({toolResponder: () => ({status: 404})});

        let initializes = 0;

        const fetchImpl = async (url, init = {}) => {
            const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;

            if (body?.method === 'initialize' && ++initializes > 1) {
                return planeResponse({status: 503, body: 'gone'})
            }

            return plane.fetchImpl(url, init)
        };

        const client    = createPlaneMailboxClient({baseUrl: LOOPBACK_URL, credential: 't', fetchImpl}),
              admission = await client.init({expectedIdentity: IDENTITY});

        expect(admission.ok).toBe(true);

        await expect(client.listMessages())
            .rejects.toThrow(/^plane list_messages failed: session lost and plane unreachable/);

        expect(initializes).toBe(2)
    })
});

test.describe('planeMailboxClient: generation safety + the terminal close barrier', () => {
    test('dual 404 from ONE live predecessor with slow teardown: the replacement is reused, never overwritten — every candidate closes', async () => {
        // Reviewer-reproduced shape: two concurrent callers fail 404 on the SAME live session while
        // the predecessor teardown is still in flight. Broken build: generations 2 AND 3 proven,
        // generation 2 overwritten and left unclosed after explicit close. Contract: the later
        // failure RIDES the current proven replacement.
        const plane = scriptedPlane({
            identityBySession: [IDENTITY, IDENTITY],
            deleteDelayMs    : 30,
            toolResponder    : ({name, sessionOrdinal}) => {
                if (sessionOrdinal === 0) {
                    // Both first-session calls fail 404, landing staggered so the second failure
                    // arrives while the first caller's teardown/re-proof is in progress.
                    return {status: 404, delayMs: name === 'explore_memory_history' ? 5 : 20}
                }

                return {payload: {tool: name}}
            }
        });

        const client = createPlaneMailboxClient({baseUrl: LOOPBACK_URL, credential: 't', fetchImpl: plane.fetchImpl});

        expect((await client.init({expectedIdentity: IDENTITY})).ok).toBe(true);

        const [memory, pulls] = await Promise.allSettled([
            client.callTool('explore_memory_history',       {limit: 1}),
            client.callTool('explore_pull_request_history', {limit: 1})
        ]);

        expect(memory.status).toBe('fulfilled');
        expect(pulls.status).toBe('fulfilled');
        expect(memory.value).toEqual({tool: 'explore_memory_history'});
        expect(pulls.value).toEqual({tool: 'explore_pull_request_history'});

        // Generation safety: exactly TWO sessions ever proven (boot + ONE replacement) — no
        // generation 3, and the identity oracle ran exactly twice.
        const initializes = plane.calls.filter(call => call.rpcMethod === 'initialize');

        expect(initializes).toHaveLength(2);
        expect(plane.calls.filter(call => call.toolName === 'list_permissions')).toHaveLength(2);

        // Every candidate closes: after the terminal close, both proven sessions carry a DELETE.
        await client.close();

        expect(plane.calls.filter(call => call.method === 'DELETE')).toHaveLength(2)
    });

    test('close during establishment FENCES the in-flight proof: candidate torn before close resolves, no resurrection', async () => {
        const plane = scriptedPlane();

        let initializeStarted;

        const started   = new Promise(resolve => { initializeStarted = resolve });
        const fetchImpl = async (url, init = {}) => {
            const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;

            if (body?.method === 'initialize') {
                initializeStarted();
                await new Promise(resolve => setTimeout(resolve, 40))
            }

            return plane.fetchImpl(url, init)
        };

        const client = createPlaneMailboxClient({baseUrl: LOOPBACK_URL, credential: 't', fetchImpl});

        const admissionPromise = client.init({expectedIdentity: IDENTITY});

        await started;

        await client.close();

        // The barrier resolved only after the fenced proof settled and its candidate was torn.
        expect(plane.calls.filter(call => call.method === 'DELETE').length).toBeGreaterThanOrEqual(1);

        const admission = await admissionPromise;

        expect(admission.ok).toBe(false);

        await expect(client.callTool('list_messages')).rejects.toThrow('client not initialized')
    });

    test('close during a FAILURE teardown waits for it: no exit while a stale-session DELETE pends', async () => {
        // Reviewer-measured shape: a live call gets 404, clears the session, and enters a slow
        // teardown; close() then saw session === null / establishing === null and resolved with the
        // DELETE still pending ({closeResolvedBeforeInFlightDelete: true} on the broken build). The
        // barrier must drain OBSERVABLE teardown ownership, whoever started the teardown.
        const order = [];

        let initializes = 0;

        const plane = scriptedPlane({
            deleteDelayMs: 40,
            toolResponder: () => ({status: 404})
        });

        const fetchImpl = async (url, init = {}) => {
            const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;

            // The recovery initialize finds the plane down — the failing call ends in its slow
            // candidate-local teardown with nothing else to observe it but the barrier.
            if (body?.method === 'initialize' && ++initializes > 1) {
                return planeResponse({status: 503, body: 'down'})
            }

            const response = await plane.fetchImpl(url, init);

            if (init.method === 'DELETE') order.push('delete-done');

            return response
        };

        const client = createPlaneMailboxClient({baseUrl: LOOPBACK_URL, credential: 't', fetchImpl});

        expect((await client.init({expectedIdentity: IDENTITY})).ok).toBe(true);

        const failing = client.listMessages().catch(error => error);

        // Let the 404 land and the slow teardown begin before closing.
        await new Promise(resolve => setTimeout(resolve, 10));

        await client.close();
        order.push('close-resolved');

        expect(order.indexOf('delete-done')).toBeGreaterThanOrEqual(0);
        expect(order.indexOf('delete-done')).toBeLessThan(order.indexOf('close-resolved'));

        expect((await failing) instanceof Error).toBe(true)
    });

    test('concurrent closers share ONE terminal barrier: a single teardown sequence', async () => {
        const {client, plane} = await initializedClient();

        await Promise.all([client.close(), client.close(), client.close()]);

        expect(plane.calls.filter(call => call.method === 'DELETE')).toHaveLength(1)
    })
});

test.describe('planeMailboxClient: post-failure liveness (the bricked-client regression)', () => {
    test('a FAILED recovery does not brick the client — the next call lazily re-establishes with proof', async () => {
        // Reproduces the live-receipt defect: call 1 loses its session AND its recovery fails
        // (plane down); call 2 arrives later when the plane is back. The broken shape answered
        // "client not initialized" forever; the contract is lazy proven re-establishment.
        let initializes = 0,
            planeDown   = false;

        const plane = scriptedPlane({
            identityBySession: [IDENTITY, IDENTITY, IDENTITY],
            toolResponder    : ({name, sessionOrdinal}) =>
                (name === 'list_messages' && sessionOrdinal === 0 ? {status: 404} : {payload: {alive: true}})
        });

        const fetchImpl = async (url, init = {}) => {
            const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;

            if (body?.method === 'initialize') {
                initializes++;

                if (planeDown) return planeResponse({status: 503, body: 'down'})
            }

            return plane.fetchImpl(url, init)
        };

        const client = createPlaneMailboxClient({baseUrl: LOOPBACK_URL, credential: 't', fetchImpl});

        expect((await client.init({expectedIdentity: IDENTITY})).ok).toBe(true);

        // Call 1: session lost (404) and the recovery initialize finds the plane DOWN.
        planeDown = true;
        await expect(client.listMessages()).rejects.toThrow(/session lost and plane unreachable/);

        // Call 2: the plane is back — the client must re-establish WITH identity proof and serve.
        planeDown = false;
        await expect(client.listMessages()).resolves.toEqual({alive: true});

        expect(initializes).toBeGreaterThanOrEqual(3);
        expect(plane.calls.filter(call => call.toolName === 'list_permissions').length).toBeGreaterThanOrEqual(2)
    })
});

test.describe('planeMailboxClient: teardown', () => {
    test('close() is awaited and idempotent — one DELETE, then no-ops', async () => {
        const {client, plane} = await initializedClient();

        await client.close();
        await client.close();

        expect(plane.calls.filter(call => call.method === 'DELETE')).toHaveLength(1);

        await expect(client.callTool('list_messages')).rejects.toThrow('client not initialized')
    })
});
