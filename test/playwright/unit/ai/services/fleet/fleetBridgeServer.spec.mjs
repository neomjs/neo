import {setup} from '../../../../setup.mjs';

const appName = 'FleetBridgeServerTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}           from '@playwright/test';
import http                     from 'node:http';
import {AsyncLocalStorage}      from 'node:async_hooks';
import Neo                      from '../../../../../../src/Neo.mjs';
import * as core                from '../../../../../../src/core/_export.mjs';
import {startFleetBridgeServer} from '../../../../../../ai/services/fleet/fleetBridgeServer.mjs';
import {
    createFleetWireResponse,
    FLEET_WIRE_RESPONSE_STATES
} from '../../../../../../ai/services/fleet/fleetWireMethods.mjs';
import {generateLocalBearerToken} from '../../../../../../ai/mcp/server/shared/helpers/localBearer.mjs';

/**
 * @summary The Fleet ingress trust boundary, witnessed at the transport layer.
 *
 * Loopback reachability is not authentication, bearer possession is not viewer identity, and a
 * browser-supplied viewer id is not authority. Every test below aims at one of those three claims:
 * the refusal battery proves nothing executes without the process bearer (before a body byte is
 * read), the CORS battery proves the wildcard grant is gone, and the context battery proves the
 * viewer identity is the SERVER's boot-resolved fact — never anything the request carried.
 */
test.describe('fleetBridgeServer — the authenticated Fleet ingress', () => {
    const viewer = Object.freeze({userId: 'clio-test', username: 'Clio (test)', agentIdentityNodeId: '@clio-test'});

    let bearer, server, url, seen, contexts;

    const startServer = async overrides => {
        bearer   = generateLocalBearerToken();
        seen     = [];
        contexts = [];
        server   = await startFleetBridgeServer({
            port         : 0,
            bearerToken  : bearer,
            viewerContext: viewer,
            runInContext : (context, fn) => { contexts.push(context); return fn() },
            dispatch     : async req => {
                seen.push(req);
                return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: {echoed: req}})
            },
            ...overrides
        });
        url = `http://127.0.0.1:${server.address().port}`
    };

    const authHeaders = extra => ({'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, ...extra});

    /** Raw client so refusal paths (spoofed Host, torn-down sockets) stay observable. */
    const rawRequest = ({method = 'POST', path = '/fleet', headers = {}, body = null}) => new Promise((resolve, reject) => {
        const req = http.request(`${url}${path}`, {method, headers}, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: data}))
        });
        req.on('error', reject);
        body && req.write(body);
        req.end()
    });

    test.afterEach(async () => {
        server && await new Promise(resolve => server.close(resolve));
        server = null
    });

    test('startup fails closed: no bearer, malformed bearer, unbound viewer, or missing context runner never construct', () => {
        // The refusal is a SYNCHRONOUS throw — no server object, no listener, no promise exists
        // for a misconfigured ingress. That is the fail-closed startup contract itself.
        const base = {port: 0, viewerContext: viewer, runInContext: (context, fn) => fn()};

        for (const bad of [undefined, 'short', 'AAAA'.repeat(11), `${generateLocalBearerToken()}=`]) {
            expect(() => startFleetBridgeServer({...base, bearerToken: bad}), `bearer ${String(bad)} must be refused`)
                .toThrow(/bearerToken is required/)
        }

        expect(() => startFleetBridgeServer({...base, bearerToken: generateLocalBearerToken(), viewerContext: null}))
            .toThrow(/viewerContext/);
        expect(() => startFleetBridgeServer({...base, bearerToken: generateLocalBearerToken(), viewerContext: {userId: 'x', agentIdentityNodeId: null}}))
            .toThrow(/viewerContext/);
        expect(() => startFleetBridgeServer({...base, bearerToken: generateLocalBearerToken(), runInContext: null}))
            .toThrow(/runInContext/)
    });

    test('startup refusals never echo the presented credential material', async () => {
        const leaked = `${generateLocalBearerToken()}=`;

        try {
            await startFleetBridgeServer({port: 0, bearerToken: leaked, viewerContext: viewer, runInContext: (c, fn) => fn()});
            expect(true, 'startup must have refused').toBe(false)
        } catch (error) {
            expect(error.message).not.toContain(leaked)
        }
    });

    test('an admitted POST /fleet dispatches inside the server-stamped viewer context', async () => {
        await startServer();

        const res = await fetch(`${url}/fleet`, {method: 'POST', headers: authHeaders(), body: JSON.stringify({method: 'listAgents'})});

        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
            ok    : true,
            result: {echoed: {method: 'listAgents'}},
            state : FLEET_WIRE_RESPONSE_STATES.ok
        });
        expect(seen).toEqual([{method: 'listAgents'}]);
        expect(contexts).toEqual([{...viewer, source: 'fleet-ingress'}])
    });

    test('a caller-authored identity claim never becomes the stamped context', async () => {
        await startServer();

        // The request smuggles every identity-shaped field a hostile pane could invent; the stamp
        // must remain the boot-resolved viewer, and dispatch receives the request unmodified — the
        // transport neither honours nor strips it (admission downstream reads only the context).
        const smuggled = {method: 'fleetMailboxMirror', params: {subjectAgentId: '@peer'}, viewerIdentity: '@evil', userId: 'evil', agentIdentityNodeId: '@evil'};

        await fetch(`${url}/fleet`, {method: 'POST', headers: authHeaders(), body: JSON.stringify(smuggled)});

        expect(contexts).toEqual([{...viewer, source: 'fleet-ingress'}]);
        expect(seen).toEqual([smuggled])
    });

    test('missing, malformed, wrong, and length-mismatched bearers 401 before the body is ever parsed', async () => {
        await startServer();

        const wrongs = [
            ['missing',         undefined],
            ['malformed',       'Bearer not-a-token'],
            ['padded',          `Bearer ${bearer}=`],
            ['length-mismatch', `Bearer ${bearer.slice(0, 20)}`],
            ['wrong-value',     `Bearer ${generateLocalBearerToken()}`]
        ];

        for (const [label, authorization] of wrongs) {
            // The body is DELIBERATELY invalid JSON: a 401 (never a 400) proves the guard rejected
            // before parsing — the parse error is unreachable for an unauthenticated caller.
            const res = await rawRequest({headers: {'Content-Type': 'application/json', ...(authorization ? {Authorization: authorization} : {})}, body: 'not json{'});

            expect(res.status, `${label} must 401`).toBe(401);
            expect(JSON.parse(res.body).ok, label).toBe(false)
        }

        expect(seen, 'no refused request may reach dispatch').toEqual([]);
        expect(contexts, 'no refused request may enter the context boundary').toEqual([])
    });

    test('unauthenticated lifecycle / registry / tenant / credential verbs produce zero side effects', async () => {
        await startServer();

        for (const method of ['defineAgent', 'startAgent', 'restartAgent', 'removeAgent', 'connectTenant', 'setRepo']) {
            const res = await rawRequest({headers: {'Content-Type': 'application/json'}, body: JSON.stringify({method, params: {id: 'x'}})});
            expect(res.status, `${method} without a bearer must 401`).toBe(401)
        }

        expect(seen).toEqual([])
    });

    test('a spoofed Host header 403s without reaching dispatch', async () => {
        await startServer();

        const res = await rawRequest({headers: {...authHeaders(), Host: 'evil.example:8083'}, body: JSON.stringify({method: 'listAgents'})});

        expect(res.status).toBe(403);
        expect(seen).toEqual([])
    });

    test('foreign and literal-null Origins 403 with no CORS grant; the exact cockpit origin is echoed with Vary', async () => {
        await startServer();

        for (const origin of ['http://evil.example', 'null']) {
            const res = await rawRequest({headers: {...authHeaders(), Origin: origin}, body: JSON.stringify({method: 'listAgents'})});

            expect(res.status, `origin ${origin} must 403`).toBe(403);
            expect(res.headers['access-control-allow-origin'], `origin ${origin} gets no grant`).toBeUndefined()
        }

        const admitted = await rawRequest({headers: {...authHeaders(), Origin: 'http://localhost:8080'}, body: JSON.stringify({method: 'listAgents'})});

        expect(admitted.status).toBe(200);
        expect(admitted.headers['access-control-allow-origin']).toBe('http://localhost:8080');
        expect(admitted.headers['vary']).toBe('Origin');
        expect(seen).toEqual([{method: 'listAgents'}])
    });

    test('an absent Origin with a valid bearer is admitted without any CORS grant', async () => {
        await startServer();

        const res = await rawRequest({headers: authHeaders(), body: JSON.stringify({method: 'listAgents'})});

        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBeUndefined()
    });

    test('preflight: admitted on Host + Origin alone, echoes the exact origin (never *), permits Authorization', async () => {
        await startServer();

        const res = await rawRequest({method: 'OPTIONS', headers: {Origin: 'http://127.0.0.1:8080'}});

        expect(res.status).toBe(204);
        expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:8080');
        expect(res.headers['access-control-allow-headers']).toContain('Authorization');
        expect(res.headers['vary']).toBe('Origin');

        const foreign = await rawRequest({method: 'OPTIONS', headers: {Origin: 'http://evil.example'}});
        expect(foreign.status).toBe(403)
    });

    test('GET /fleet/probe answers the boot contract with identity facts and never the credential', async () => {
        await startServer();

        const denied = await rawRequest({method: 'GET', path: '/fleet/probe', headers: {}});
        expect(denied.status).toBe(401);

        const res = await rawRequest({method: 'GET', path: '/fleet/probe', headers: {Authorization: `Bearer ${bearer}`}});

        expect(res.status).toBe(200);

        const {ok, result} = JSON.parse(res.body);

        expect(ok).toBe(true);
        expect(result.agentIdentityNodeId).toBe(viewer.agentIdentityNodeId);
        expect(result.userId).toBe(viewer.userId);
        expect(result.pid).toBe(process.pid);
        expect(res.body, 'the probe must never carry the bearer').not.toContain(bearer)
    });

    test('a non-/fleet path 404s (authenticated) with a fail-closed envelope, never reaching dispatch', async () => {
        await startServer();

        const res = await rawRequest({method: 'GET', path: '/nope', headers: {Authorization: `Bearer ${bearer}`}});

        expect(res.status).toBe(404);
        expect(JSON.parse(res.body).ok).toBe(false);
        expect(seen).toEqual([])
    });

    test('a sibling path (POST /fleetx) fails closed — exact /fleet match only, never reaching dispatch', async () => {
        await startServer();

        const res = await rawRequest({path: '/fleetx', headers: authHeaders(), body: JSON.stringify({method: 'listAgents'})});

        expect(res.status).toBe(404);
        expect(seen).toEqual([])
    });

    test('an invalid JSON body from an AUTHENTICATED caller 400s without touching dispatch', async () => {
        await startServer();

        const res = await rawRequest({headers: authHeaders(), body: 'not json{'});

        expect(res.status).toBe(400);
        expect(seen).toEqual([])
    });

    test('UNARMED (default): GET /fleet/handshake has no special admission — 401 bearer-less, 404 authenticated, bearer never in a body', async () => {
        await startServer();

        // Bearer-less with a perfect cockpit Origin: the unarmed guard has no handshake branch, so
        // the request falls through to the bearer gate exactly like any other GET.
        const bearerless = await rawRequest({method: 'GET', path: '/fleet/handshake', headers: {Origin: 'http://localhost:8080'}});

        expect(bearerless.status).toBe(401);
        expect(bearerless.body).not.toContain(bearer);

        // Authenticated: the path is not a served route on an unarmed server — fail-closed 404.
        const authenticated = await rawRequest({method: 'GET', path: '/fleet/handshake', headers: {Authorization: `Bearer ${bearer}`, Origin: 'http://localhost:8080'}});

        expect(authenticated.status).toBe(404);
        expect(authenticated.body).not.toContain(bearer);
        expect(seen).toEqual([])
    });

    test('ARMED: an exact-allowlisted browser Origin redeems the process bearer — no-store, connection-close, exact-origin echo', async () => {
        await startServer({bearerHandshake: true});

        const res = await rawRequest({method: 'GET', path: '/fleet/handshake', headers: {Origin: 'http://localhost:8080'}});

        expect(res.status).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ok: true, result: {bearerToken: bearer}});
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8080');
        expect(res.headers['vary']).toBe('Origin');
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.headers['connection']).toBe('close');
        expect(seen, 'a redemption never reaches dispatch').toEqual([]);
        expect(contexts, 'a redemption never enters the context boundary').toEqual([])
    });

    test('ARMED: redemption stays available while armed — a page reload is a normal cockpit operation, not a lockout', async () => {
        await startServer({bearerHandshake: true});

        for (const attempt of [1, 2]) {
            const res = await rawRequest({method: 'GET', path: '/fleet/handshake', headers: {Origin: 'http://127.0.0.1:8080'}});

            expect(res.status, `redemption ${attempt}`).toBe(200);
            expect(JSON.parse(res.body).result.bearerToken, `redemption ${attempt}`).toBe(bearer)
        }
    });

    test('ARMED: an ABSENT Origin is refused — stricter than preflight, because only a browser page has business here', async () => {
        await startServer({bearerHandshake: true});

        const res = await rawRequest({method: 'GET', path: '/fleet/handshake', headers: {}});

        expect(res.status).toBe(403);
        expect(res.body).toContain('allowlisted browser origin');
        expect(res.body).not.toContain(bearer)
    });

    test('ARMED: foreign and literal-null Origins are refused with no CORS grant and no bearer', async () => {
        await startServer({bearerHandshake: true});

        for (const origin of ['http://evil.example', 'null']) {
            const res = await rawRequest({method: 'GET', path: '/fleet/handshake', headers: {Origin: origin}});

            expect(res.status, `origin ${origin}`).toBe(403);
            expect(res.headers['access-control-allow-origin'], `origin ${origin} gets no grant`).toBeUndefined();
            expect(res.body, `origin ${origin} never sees the bearer`).not.toContain(bearer)
        }
    });

    test('ARMED: a spoofed Host is refused before the handshake branch — the Host gate outranks arming', async () => {
        await startServer({bearerHandshake: true});

        const res = await rawRequest({method: 'GET', path: '/fleet/handshake', headers: {Host: 'evil.example:8083', Origin: 'http://localhost:8080'}});

        expect(res.status).toBe(403);
        expect(res.body).not.toContain(bearer)
    });

    test('ARMED: only the exact GET /fleet/handshake redeems — sibling paths and POST fall through to the bearer gate', async () => {
        await startServer({bearerHandshake: true});

        const sibling = await rawRequest({method: 'GET', path: '/fleet/handshakex', headers: {Origin: 'http://localhost:8080'}});
        expect(sibling.status).toBe(401);
        expect(sibling.body).not.toContain(bearer);

        const post = await rawRequest({method: 'POST', path: '/fleet/handshake', headers: {Origin: 'http://localhost:8080'}, body: '{}'});
        expect(post.status).toBe(401);
        expect(post.body).not.toContain(bearer)
    });

    test('delayed concurrent A/B: request contexts never leak or swap across in-flight requests', async () => {
        // Two servers with DISTINCT viewers share one real AsyncLocalStorage. The slow request
        // resolves after the fast one has entered and left the store; each dispatch reads the store
        // at resolve-time. Any leak/swap across the async boundary surfaces as a crossed viewer.
        const storage = new AsyncLocalStorage();
        const run     = (context, fn) => storage.run(context, fn);
        const results = {};

        const mkDispatch = (tag, delayMs) => async () => {
            await new Promise(resolve => setTimeout(resolve, delayMs));
            results[tag] = storage.getStore()?.agentIdentityNodeId;
            return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: tag})
        };

        const bearerA = generateLocalBearerToken(),
              bearerB = generateLocalBearerToken();

        const serverA = await startFleetBridgeServer({port: 0, bearerToken: bearerA, runInContext: run, dispatch: mkDispatch('A', 60), viewerContext: {userId: 'a', agentIdentityNodeId: '@viewer-a'}}),
              serverB = await startFleetBridgeServer({port: 0, bearerToken: bearerB, runInContext: run, dispatch: mkDispatch('B', 5),  viewerContext: {userId: 'b', agentIdentityNodeId: '@viewer-b'}});

        try {
            await Promise.all([
                fetch(`http://127.0.0.1:${serverA.address().port}/fleet`, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${bearerA}`}, body: JSON.stringify({method: 'fleetStatus'})}),
                fetch(`http://127.0.0.1:${serverB.address().port}/fleet`, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${bearerB}`}, body: JSON.stringify({method: 'fleetStatus'})})
            ]);

            expect(results).toEqual({A: '@viewer-a', B: '@viewer-b'})
        } finally {
            await new Promise(resolve => serverA.close(resolve));
            await new Promise(resolve => serverB.close(resolve))
        }
    })
});
