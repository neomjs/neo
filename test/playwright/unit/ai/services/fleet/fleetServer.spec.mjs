import {setup}                     from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {
        name             : 'FleetServerTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}                  from '@playwright/test';
import Neo                             from '../../../../../../src/Neo.mjs';
import * as core                       from '../../../../../../src/core/_export.mjs';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {request as httpRequest}        from 'node:http';
import os                              from 'node:os';
import path                            from 'node:path';
import RequestContextService           from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';
import ConfigBase                      from '../../../../../../ai/configBase.mjs';
import {
    assertFleetPlaneReady,
    createFleetRequestContext,
    createFleetServerApp,
    deriveOwnerPrincipal,
    resolveFleetResourceUrl,
    startFleetServer
}                                  from '../../../../../../ai/services/fleet/fleetServer.mjs';
import {
    dispatchFleetS1Request,
    FLEET_METHOD_SCOPE_CLASSES,
    FLEET_S1_METHOD_POLICY,
    FLEET_S1_READY_METHODS
}                                  from '../../../../../../ai/services/fleet/fleetServerPolicy.mjs';
import {
    createFleetWireResponse,
    createFleetWireRequest,
    FLEET_WIRE_METHODS,
    FLEET_WIRE_RESPONSE_STATES
}                                  from '../../../../../../ai/services/fleet/fleetWireMethods.mjs';

const
    nativeFetch = globalThis.fetch,
    logger      = {info() {}, warn() {}, error() {}};

const wireBody = (method, params) => JSON.stringify(createFleetWireRequest(method, params));

function createConfig({authMiddleware=null, auth={}}={}) {
    return {
        publicUrl    : 'https://agent-os.example.test/mc/mcp',
        allowedHosts : null,
        mcpHttpHost  : '127.0.0.1',
        mcpListenHost: '127.0.0.1',
        authMiddleware,
        auth         : {
            mode                   : authMiddleware ? 'custom' : 'github-pat',
            host                   : null,
            issuerUrl              : null,
            trustProxyIdentity     : false,
            pinFirstProviderSubject: false,
            githubApiBaseUrl       : 'https://api.github.test',
            patCacheTtlSeconds     : 60,
            patValidationTimeoutMs : 5_000,
            allowedUsers           : [],
            ...auth
        },
        fleet: {
            port          : 8083,
            dataDir       : '/app/.neo-ai-data/fleet',
            cockpitOrigins: ['http://localhost:8080', 'http://127.0.0.1:8080']
        }
    }
}

async function startApp(options={}) {
    const app = await createFleetServerApp({
        aiConfig : createConfig(options),
        logger,
        planeGuard() {},
        ...options.serverOptions
    });
    const server = await new Promise((resolve, reject) => {
        const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
        candidate.once('error', reject)
    });

    return {
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close  : () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
}

async function rawHttpRequest(baseUrl, {body='', headers={}, method='GET', pathname='/fleet'}={}) {
    const url = new URL(baseUrl);

    return new Promise((resolve, reject) => {
        const request = httpRequest({
            headers,
            host: url.hostname,
            method,
            path: pathname,
            port: url.port
        }, response => {
            let responseBody = '';

            response.setEncoding('utf8');
            response.on('data', chunk => { responseBody += chunk });
            response.on('end', () => resolve({
                body   : JSON.parse(responseBody),
                headers: response.headers,
                status : response.statusCode
            }))
        });

        request.once('error', reject);
        request.end(body)
    })
}

test.describe.configure({mode: 'serial'});

test.describe('composed Fleet S1 server', () => {
    test.afterEach(() => {
        globalThis.fetch = nativeFetch
    });

    test('AuthService validates a GitHub PAT and probe exposes only frozen provider identity facts', async () => {
        const token = 'provider-secret-never-crosses-fleet';

        globalThis.fetch = async (input, init) => {
            if (String(input) === 'https://api.github.test/user') {
                expect(init.headers.Authorization).toBe(`Bearer ${token}`);

                return new Response(JSON.stringify({
                    id   : 280105177,
                    login: 'neo-gpt',
                    name : 'Euclid'
                }), {
                    status : 200,
                    headers: {
                        'content-type'  : 'application/json',
                        'x-oauth-scopes': 'repo, read:org'
                    }
                })
            }

            return nativeFetch(input, init)
        };

        const server = await startApp();

        try {
            const response = await nativeFetch(`${server.baseUrl}/fleet/probe`, {
                headers: {Authorization: `Bearer ${token}`}
            });
            const payload = await response.json();

            expect(response.status).toBe(200);
            expect(payload).toEqual({
                ok    : true,
                result: {
                    identity: {
                        userId             : 'neo-gpt',
                        username           : 'Euclid',
                        source             : 'github-pat',
                        authProvider       : 'github',
                        authSource         : 'github-pat',
                        providerBaseUrl    : 'https://api.github.test',
                        providerUserId     : '280105177',
                        providerUsername   : 'neo-gpt',
                        providerDisplayName: 'Euclid',
                        // The launch receipt carries the caller's own DERIVED admission subject —
                        // the immutable-tuple key, never the mutable login.
                        ownerPrincipal     : 'principal:github:https%3A%2F%2Fapi.github.test:280105177'
                    },
                    fleetDataDir: '/app/.neo-ai-data/fleet',
                    pid         : expect.any(Number),
                    startedAt   : expect.any(String)
                }
            });
            expect(JSON.stringify(payload)).not.toContain(token);
            expect(JSON.stringify(payload)).not.toContain('scopes')
        } finally {
            await server.close()
        }
    });

    test('the exact Fleet route adapts the SDK Host refusal without admitting auth or dispatch', async () => {
        const calls  = {auth: 0, dispatch: 0};
        const server = await startApp({
            authMiddleware(req, res, next) {
                calls.auth++;
                req.auth = {userId: 'alice', source: 'test-provider'};
                next()
            },
            serverOptions: {
                dispatch() {
                    calls.dispatch++;
                    return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: []})
                }
            }
        });

        try {
            const response = await rawHttpRequest(server.baseUrl, {
                body   : wireBody('listAgents'),
                headers: {
                    'Content-Type': 'application/json',
                    Host          : 'evil.example'
                },
                method: 'POST'
            });

            expect(response.status).toBe(403);
            expect(response.body).toEqual(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
                error: 'fleet: request not admitted'
            }));
            expect(response.body).not.toHaveProperty('jsonrpc');
            expect(JSON.stringify(response.body)).not.toContain('evil.example');
            expect(calls).toEqual({auth: 0, dispatch: 0})
        } finally {
            await server.close()
        }
    });

    test('built-in bearer refusals retain HTTP auth semantics but expose only the Fleet envelope', async () => {
        const invalidToken = 'invalid-provider-secret';

        globalThis.fetch = async (input, init) => {
            if (String(input) === 'https://api.github.test/user') {
                expect(init.headers.Authorization).toBe(`Bearer ${invalidToken}`);

                return new Response(JSON.stringify({message: 'provider denied the secret'}), {
                    status : 401,
                    headers: {'content-type': 'application/json'}
                })
            }

            return nativeFetch(input, init)
        };

        const server = await startApp();

        try {
            for (const headers of [
                {'Content-Type': 'application/json'},
                {Authorization: `Bearer ${invalidToken}`, 'Content-Type': 'application/json'}
            ]) {
                const response = await nativeFetch(`${server.baseUrl}/fleet`, {
                    body  : wireBody('listAgents'),
                    headers,
                    method: 'POST'
                });
                const payload = await response.json();

                expect(response.status).toBe(401);
                expect(response.headers.get('www-authenticate')).toContain('Bearer error="invalid_token"');
                expect(payload).toEqual(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
                    error: 'fleet: request not admitted'
                }));
                expect(payload).not.toHaveProperty('error_description');
                expect(JSON.stringify(payload)).not.toContain(invalidToken);
                expect(JSON.stringify(payload)).not.toContain('provider denied')
            }
        } finally {
            await server.close()
        }
    });

    test('custom auth send and end terminals are normalized onto the same finite refusal', async () => {
        const terminals = [
            ['string send', res => res.status(401).send('Unauthorized private detail')],
            ['object send', res => res.status(401).send({error: 'private auth detail'})],
            ['direct end',  res => { res.status(401); res.end('Unauthorized private detail') }],
            ['success envelope', res => res.status(401).json(createFleetWireResponse(
                FLEET_WIRE_RESPONSE_STATES.ok,
                {result: ['must-not-cross']}
            ))]
        ];

        for (const [name, terminate] of terminals) {
            let   dispatchCalls = 0;
            const server        = await startApp({
                authMiddleware(req, res) {
                    terminate(res)
                },
                serverOptions: {
                    dispatch() {
                        dispatchCalls++;
                        return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: []})
                    }
                }
            });

            try {
                const response = await nativeFetch(`${server.baseUrl}/fleet`, {
                    body   : wireBody('listAgents'),
                    headers: {'Content-Type': 'application/json'},
                    method : 'POST'
                });

                expect(response.status, name).toBe(401);
                expect(response.headers.get('content-type'), name).toContain('application/json');
                expect(await response.json(), name).toEqual(createFleetWireResponse(
                    FLEET_WIRE_RESPONSE_STATES.refused,
                    {error: 'fleet: request not admitted'}
                ));
                expect(dispatchCalls, name).toBe(0)
            } finally {
                await server.close()
            }
        }
    });

    test('custom auth end overload callbacks survive finite-envelope normalization', async () => {
        for (const withChunk of [false, true]) {
            let   callbackCalls = 0;
            const server        = await startApp({
                authMiddleware(req, res) {
                    res.status(401);

                    if (withChunk) {
                        res.end('private auth detail', () => { callbackCalls++ })
                    } else {
                        res.end(() => { callbackCalls++ })
                    }
                }
            });

            try {
                const response = await nativeFetch(`${server.baseUrl}/fleet`, {
                    body   : wireBody('listAgents'),
                    headers: {'Content-Type': 'application/json'},
                    method : 'POST'
                });

                expect(response.status, String(withChunk)).toBe(401);
                expect(await response.json(), String(withChunk)).toEqual(createFleetWireResponse(
                    FLEET_WIRE_RESPONSE_STATES.refused,
                    {error: 'fleet: request not admitted'}
                ));
                expect(callbackCalls, String(withChunk)).toBe(1)
            } finally {
                await server.close()
            }
        }
    });

    test('the plural-local posture authenticates two provider subjects but exposes no roster or tenant data', async () => {
        const subjects = new Map([
            ['alice-provider-token', {id: 7, login: 'alice', name: 'Alice'}],
            ['bob-provider-token', {id: 8, login: 'bob', name: 'Bob'}]
        ]);

        globalThis.fetch = async (input, init) => {
            if (String(input) === 'https://api.github.test/user') {
                const token   = init.headers.Authorization?.replace(/^Bearer /, '');
                const subject = subjects.get(token);

                return new Response(JSON.stringify(subject ?? {}), {
                    status : subject ? 200 : 401,
                    headers: {'content-type': 'application/json'}
                })
            }

            return nativeFetch(input, init)
        };

        const server = await startApp({auth: {pinFirstProviderSubject: false}});

        try {
            for (const [token, subject] of subjects) {
                const headers = {
                    Authorization : `Bearer ${token}`,
                    'Content-Type': 'application/json'
                };
                const probe = await nativeFetch(`${server.baseUrl}/fleet/probe`, {headers});

                expect(probe.status, subject.login).toBe(200);
                expect((await probe.json()).result.identity.userId, subject.login).toBe(subject.login);

                for (const [method, degraded] of [
                    ['listAgents', 'awaiting-s3'],
                    ['getAgent', 'awaiting-s3'],
                    ['listTenants', 'awaiting-s4']
                ]) {
                    const response = await nativeFetch(`${server.baseUrl}/fleet`, {
                        method: 'POST',
                        headers,
                        body  : wireBody(method, method === 'getAgent' ? subject.login : undefined)
                    });

                    expect(response.status, `${subject.login}:${method}`).toBe(200);
                    expect(await response.json(), `${subject.login}:${method}`).toMatchObject({
                        ok: false,
                        degraded
                    })
                }
            }
        } finally {
            await server.close()
        }
    });

    test('the downloadable profile bootstrap pins one provider subject before listen', async () => {
        const
            tempDir = await mkdtemp(path.join(os.tmpdir(), 'neo-fleet-bootstrap-')),
            file    = path.join(tempDir, 'mcp-auth-token'),
            token   = 'bootstrap-provider-token';

        await writeFile(file, `${token}\n`, {mode: 0o600});

        let providerCalls = 0;

        globalThis.fetch = async (input, init) => {
            if (String(input) === 'https://api.github.test/user') {
                providerCalls++;

                const admitted = init.headers.Authorization === `Bearer ${token}`;

                return new Response(JSON.stringify(admitted
                    ? {id: 7, login: 'alice', name: 'Alice'}
                    : {id: 8, login: 'bob', name: 'Bob'}), {
                    status : 200,
                    headers: {'content-type': 'application/json'}
                })
            }

            return nativeFetch(input, init)
        };

        let server;

        try {
            server = await startApp({
                auth: {
                    pinFirstProviderSubject : true,
                    providerBootstrapPat    : '',
                    providerBootstrapPatFile: file
                }
            });

            // Establishing the provider subject is a pre-listen operation; the request reuses the
            // verifier cache rather than establishing a second authority.
            expect(providerCalls).toBe(1);

            const admitted = await nativeFetch(`${server.baseUrl}/fleet/probe`, {
                headers: {Authorization: `Bearer ${token}`}
            });
            expect(admitted.status).toBe(200);
            expect((await admitted.json()).result.identity.userId).toBe('alice');
            expect(providerCalls).toBe(1);

            const wrongSubject = await nativeFetch(`${server.baseUrl}/fleet/probe`, {
                headers: {Authorization: 'Bearer another-valid-provider-token'}
            });
            expect(wrongSubject.status).toBe(401);
            expect(providerCalls).toBe(2)
        } finally {
            if (server) {
                await server.close()
            }
            await rm(tempDir, {recursive: true, force: true})
        }
    });

    test('anonymous malformed JSON is refused before parsing; authenticated malformed JSON is 400', async () => {
        const token = 'valid-provider-token';

        globalThis.fetch = async (input, init) => {
            if (String(input) === 'https://api.github.test/user') {
                if (init.headers.Authorization !== `Bearer ${token}`) {
                    return new Response('{}', {status: 401})
                }

                return new Response(JSON.stringify({id: 7, login: 'alice', name: 'Alice'}), {
                    status : 200,
                    headers: {'content-type': 'application/json'}
                })
            }

            return nativeFetch(input, init)
        };

        const server = await startApp();

        try {
            const anonymous = await nativeFetch(`${server.baseUrl}/fleet`, {
                method : 'POST',
                headers: {'Content-Type': 'application/json'},
                body   : '{'
            });
            expect(anonymous.status).toBe(401);

            const admitted = await nativeFetch(`${server.baseUrl}/fleet`, {
                method : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type' : 'application/json'
                },
                body: '{'
            });
            expect(admitted.status).toBe(400);
            expect(await admitted.json()).toMatchObject({
                error: 'fleet: invalid JSON body',
                ok   : false,
                state: FLEET_WIRE_RESPONSE_STATES.refused
            })
        } finally {
            await server.close()
        }
    });

    test('CORS grants only exact configured or public origins and never emits a wildcard', async () => {
        const server = await startApp({
            authMiddleware(req, res, next) {
                req.auth = {userId: 'alice', source: 'test-provider'};
                next()
            }
        });

        try {
            for (const origin of ['http://localhost:8080', 'https://agent-os.example.test']) {
                const response = await nativeFetch(`${server.baseUrl}/fleet/probe`, {
                    headers: {Origin: origin}
                });

                expect(response.status, origin).toBe(200);
                expect(response.headers.get('access-control-allow-origin'), origin).toBe(origin);
                expect(response.headers.get('access-control-allow-origin')).not.toBe('*');
                expect(response.headers.get('vary')).toContain('Origin')
            }

            for (const origin of ['https://foreign.example.test', 'null']) {
                const response = await nativeFetch(`${server.baseUrl}/fleet/probe`, {
                    headers: {Origin: origin}
                });

                expect(response.status, origin).toBe(403);
                expect(response.headers.get('access-control-allow-origin'), origin).toBeNull();
                expect(await response.json()).toMatchObject({
                    error: 'fleet: origin not admitted',
                    ok   : false,
                    state: FLEET_WIRE_RESPONSE_STATES.refused
                })
            }

            const preflight = await nativeFetch(`${server.baseUrl}/fleet`, {
                method : 'OPTIONS',
                headers: {
                    'Origin'                        : 'http://127.0.0.1:8080',
                    'Access-Control-Request-Method' : 'POST',
                    'Access-Control-Request-Headers': 'Authorization, Content-Type'
                }
            });

            expect(preflight.status).toBe(204);
            expect(preflight.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:8080');
            expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');
            expect(preflight.headers.get('vary')).toContain('Origin');

            const originless = await nativeFetch(`${server.baseUrl}/fleet/probe`);

            expect(originless.status).toBe(200);
            expect(originless.headers.get('access-control-allow-origin')).toBeNull()
        } finally {
            await server.close()
        }
    });

    test('authenticated oversized JSON fails with the bounded 413 envelope', async () => {
        const server = await startApp({
            authMiddleware(req, res, next) {
                req.auth = {userId: 'alice', source: 'test-provider'};
                next()
            },
            serverOptions: {maxBodyBytes: 16}
        });

        try {
            const response = await nativeFetch(`${server.baseUrl}/fleet`, {
                method : 'POST',
                headers: {'Content-Type': 'application/json'},
                body   : JSON.stringify({method: 'listAgents'})
            });

            expect(response.status).toBe(413);
            expect(await response.json()).toMatchObject({
                error: 'fleet: request body too large',
                ok   : false,
                state: FLEET_WIRE_RESPONSE_STATES.refused
            })
        } finally {
            await server.close()
        }
    });

    test('dispatch exceptions are collapsed in both the response and logs', async () => {
        const
            secret = 'provider-secret-must-not-reach-logs',
            logs   = [],
            server = await startApp({
                authMiddleware(req, res, next) {
                    req.auth = {userId: 'alice', source: 'test-provider'};
                    next()
                },
                serverOptions: {
                    dispatch() {
                        throw new Error(secret)
                    },
                    logger: {info() {}, warn() {}, error(message) { logs.push(message) }}
                }
            });

        try {
            const response = await nativeFetch(`${server.baseUrl}/fleet`, {
                method : 'POST',
                headers: {'Content-Type': 'application/json'},
                body   : JSON.stringify({method: 'listAgents'})
            });
            const payload = await response.json();

            expect(response.status).toBe(200);
            expect(payload).toMatchObject({
                error: 'fleet: request failed',
                ok   : false,
                state: FLEET_WIRE_RESPONSE_STATES.operationFailed
            });
            expect(logs).toEqual(['[FleetServer] dispatch failed']);
            expect(JSON.stringify({payload, logs})).not.toContain(secret)
        } finally {
            await server.close()
        }
    });

    test('the request projection is immutable, copy-isolated, and excludes credential/future-subject fields', () => {
        const authInfo = {
            userId             : 'neo-gpt',
            username           : 'Euclid',
            source             : 'github-pat',
            authProvider       : 'github',
            authSource         : 'github-pat',
            providerBaseUrl    : 'https://api.github.test',
            providerUserId     : '280105177',
            providerUsername   : 'neo-gpt',
            providerDisplayName: 'Euclid',
            token              : 'secret',
            clientId           : 'neo-gpt',
            scopes             : ['repo'],
            expiresAt          : 123,
            extra              : {arbitrary: true},
            agentIdentityNodeId: 'AGENT_IDENTITY:@neo-gpt',
            ownerPrincipal     : 'github:https://api.github.test:280105177'
        };
        const context = createFleetRequestContext(authInfo);

        authInfo.userId = 'mutated-after-copy';

        expect(Object.isFrozen(context)).toBe(true);
        expect(context.userId).toBe('neo-gpt');
        expect(context).not.toHaveProperty('token');
        expect(context).not.toHaveProperty('clientId');
        expect(context).not.toHaveProperty('scopes');
        expect(context).not.toHaveProperty('expiresAt');
        expect(context).not.toHaveProperty('extra');
        expect(context).not.toHaveProperty('agentIdentityNodeId');

        // The subject cannot be INJECTED: the fixture's poisoned `ownerPrincipal` is discarded by
        // the allowlist, and the context carries only this boundary's OWN derivation over the
        // provider-validated facts.
        expect(context.ownerPrincipal).toBe('principal:github:https%3A%2F%2Fapi.github.test:280105177');
        expect(createFleetRequestContext({source: 'local-bearer'})).toBeNull()
    });

    test('deriveOwnerPrincipal: immutable facts only — login mutation cannot move the subject, absent members derive nothing', () => {
        const facts = {
            authProvider   : 'github',
            providerBaseUrl: 'https://API.github.test/',
            providerUserId : '280105177'
        };

        // Minimal normalization pinned: parser-lowercased scheme/host, trailing slashes stripped,
        // the base encoded into the opaque key.
        const principal = deriveOwnerPrincipal(facts);

        expect(principal).toBe('principal:github:https%3A%2F%2Fapi.github.test:280105177');

        // The rename invariance the mutable login can never break: no login-bearing field
        // participates in the derivation at all.
        expect(deriveOwnerPrincipal({...facts, providerUsername: 'renamed-login', username: 'New Display'}))
            .toBe(principal);

        // Fail-closed: any absent tuple member derives NO subject — never a partial principal,
        // never a login fallback.
        expect(deriveOwnerPrincipal({...facts, providerUserId: undefined})).toBeNull();
        expect(deriveOwnerPrincipal({...facts, providerBaseUrl: ''})).toBeNull();
        expect(deriveOwnerPrincipal({...facts, authProvider: undefined})).toBeNull();
        expect(deriveOwnerPrincipal({...facts, providerBaseUrl: 'not a url'})).toBeNull();
        expect(deriveOwnerPrincipal(null)).toBeNull();

        // The possession-only admission mode carries no provider tuple: transport admitted,
        // subject absent — the verb-class policy owns what such a caller may do.
        expect(deriveOwnerPrincipal({userId: 'local', source: 'local-bearer'})).toBeNull()
    });

    test('identityless admitted middleware refuses with zero dispatch', async () => {
        let   dispatchCount = 0;
        const server        = await startApp({
            authMiddleware(req, res, next) {
                req.auth = {source: 'custom'};
                next()
            },
            serverOptions: {
                dispatch() {
                    dispatchCount++;
                    return {ok: true}
                }
            }
        });

        try {
            const response = await nativeFetch(`${server.baseUrl}/fleet`, {
                method : 'POST',
                headers: {'Content-Type': 'application/json'},
                body   : JSON.stringify({method: 'listAgents'})
            });

            expect(response.status).toBe(401);
            expect(dispatchCount).toBe(0)
        } finally {
            await server.close()
        }
    });

    test('concurrent requests retain separate frozen AsyncLocalStorage contexts', async () => {
        const server = await startApp({
            authMiddleware(req, res, next) {
                const userId = req.headers['x-test-user'];
                req.auth = {userId, username: userId, source: 'test-provider'};
                next()
            },
            serverOptions: {
                dispatch: async request => {
                    await new Promise(resolve => setTimeout(resolve, request.params.delay));
                    const context = RequestContextService.get();
                    return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {
                        protocol: {
                            version     : request.protocol.versions[0],
                            capabilities: request.protocol.capabilities
                        },
                        result: {userId: context.userId, frozen: Object.isFrozen(context)}
                    })
                }
            }
        });

        try {
            const call = (userId, delay) => nativeFetch(`${server.baseUrl}/fleet`, {
                method : 'POST',
                headers: {'Content-Type': 'application/json', 'X-Test-User': userId},
                body   : wireBody('listAgents', {delay})
            }).then(response => response.json());

            const [alice, bob] = await Promise.all([call('alice', 25), call('bob', 1)]);

            expect(alice.result).toEqual({userId: 'alice', frozen: true});
            expect(bob.result).toEqual({userId: 'bob', frozen: true})
        } finally {
            await server.close()
        }
    });

    test('strict route battery rejects suffixes, trailing slashes, and wrong methods', async () => {
        const server = await startApp({
            authMiddleware(req, res, next) {
                req.auth = {userId: 'alice', source: 'test-provider'};
                next()
            }
        });

        try {
            for (const [route, method] of [
                ['/fleet/', 'POST'],
                ['/fleetx', 'POST'],
                ['/fleet/probex', 'GET'],
                ['/fleet/probe/', 'GET'],
                ['/fleet', 'GET'],
                ['/fleet/probe', 'POST']
            ]) {
                const response = await nativeFetch(`${server.baseUrl}${route}`, {method});
                expect(response.status, `${method} ${route}`).toBe(404)
            }

            const withQuery = await nativeFetch(`${server.baseUrl}/fleet/probe?readiness=1`);
            expect(withQuery.status).toBe(200)
        } finally {
            await server.close()
        }
    });

    test('Fleet resource URL replaces an accidental MCP path with its own audience', () => {
        expect(String(resolveFleetResourceUrl(createConfig())))
            .toBe('https://agent-os.example.test/fleet')
    });

    test('the composed entrypoint refuses an unplaced listener host before app construction', async () => {
        await expect(startFleetServer({
            aiConfig: {mcpListenHost: null, fleet: {port: 8083}}
        })).rejects.toThrow('Fleet listener host is required')
    });

    test('the boot gate requires the mounted root and rejects absent, relative, or split placement', async () => {
        const
            root     = await mkdtemp(path.join(os.tmpdir(), 'neo-fleet-plane-')),
            dataRoot = path.join(root, '.neo-ai-data'),
            member   = suffix => path.join(dataRoot, suffix),
            aiConfig = {
                plane                       : {id: 'neo-local-canonical', dataRoot},
                auth                        : {seatTokenRegistryPath: member('seat-tokens/registry.json')},
                wakeDaemonHeartbeatAlivePath: member('wake-daemon/heartbeat.alive'),
                fleet                       : {
                    dataDir     : member('fleet'),
                    instanceRoot: member('fleet/instances')
                },
                engines        : {chroma: {dataDirProd: member('chroma/unified')}},
                heapObservation: {dir: member('heap-observation')},
                orchestrator   : {
                    dataDir              : member('orchestrator-daemon'),
                    dbPath               : member('orchestrator-daemon/orchestrator.sqlite'),
                    deploymentStateBridge: {snapshotPath: member('deployment-state/snapshot.json')},
                    recoveryActuator     : {
                        healAttemptsPath   : member('orchestrator-daemon/heal-attempts.json'),
                        recoveryRunStateDir: member('orchestrator-daemon/recovery-runs')
                    }
                }
            };

        try {
            await mkdir(member('fleet'), {recursive: true, mode: 0o700});

            expect(assertFleetPlaneReady({aiConfig, rootDir: root})).toEqual({
                planeId     : 'neo-local-canonical',
                dataRoot,
                fleetDataDir: member('fleet')
            });

            const absentRoot = {
                ...aiConfig,
                fleet: {...aiConfig.fleet, dataDir: member('missing-fleet-volume')}
            };

            expect(() => assertFleetPlaneReady({aiConfig: absentRoot, rootDir: root}))
                .toThrow(/must exist and be readable\/writable/);

            const partiallyMoved = {
                ...aiConfig,
                plane: {...aiConfig.plane, dataRoot: member('relocated')},
                fleet: {
                    ...aiConfig.fleet,
                    dataDir: ConfigBase.config.data.fleet.dataDir.default
                }
            };

            expect(() => assertFleetPlaneReady({aiConfig: partiallyMoved, rootDir: root}))
                .toThrow(/fleet\.dataDir/);

            const relativeRoot = {
                ...aiConfig,
                fleet: {...aiConfig.fleet, dataDir: 'relative/fleet'}
            };

            expect(() => assertFleetPlaneReady({aiConfig: relativeRoot, rootDir: root}))
                .toThrow(/absolute path/)
        } finally {
            await rm(root, {recursive: true, force: true})
        }
    })
});

test.describe('Fleet S1 wire policy', () => {
    const PRINCIPAL_CONTEXT = Object.freeze({ownerPrincipal: 'principal:github:https%3A%2F%2Fapi.github.com:9'});

    test('classifies every wire verb in BOTH ledgers — slice ownership and scope class — with getBootIdentity as the one served verb', () => {
        expect(Object.keys(FLEET_S1_METHOD_POLICY).sort()).toEqual([...FLEET_WIRE_METHODS].sort());
        expect(Object.keys(FLEET_METHOD_SCOPE_CLASSES).sort()).toEqual([...FLEET_WIRE_METHODS].sort());
        expect(FLEET_S1_READY_METHODS).toEqual(['getBootIdentity']);

        for (const scopeClass of Object.values(FLEET_METHOD_SCOPE_CLASSES)) {
            expect(['read-observe', 'lifecycle-write']).toContain(scopeClass)
        }
    });

    test('serves ready verbs, refuses lifecycle-write without a subject BEFORE naming slices, and degrades the rest with their owning slice', async () => {
        const calls  = [];
        const bridge = Object.fromEntries(FLEET_WIRE_METHODS.map(method => [method, params => {
            calls.push([method, params]);
            return method
        }]));

        for (const method of FLEET_S1_READY_METHODS) {
            expect(await dispatchFleetS1Request(createFleetWireRequest(method, 'x'), bridge))
                .toMatchObject({ok: true, result: method, state: FLEET_WIRE_RESPONSE_STATES.ok})
        }

        const expectedSlices = {
            listAgents            : 'awaiting-s3',
            getAgent              : 'awaiting-s3',
            fleetStatus           : 'awaiting-s3',
            fleetRuntimeStatus    : 'awaiting-s3',
            fleetActivity         : 'awaiting-s3',
            fleetHistory          : 'awaiting-s3',
            fleetRoster           : 'awaiting-s3',
            fleetWakeRoutes       : 'awaiting-s3',
            defineAgent           : 'awaiting-s4',
            configureAgent        : 'awaiting-s4',
            setRepo               : 'awaiting-s4',
            setAvatar             : 'awaiting-s4',
            markFleetCaughtUp     : 'awaiting-s4',
            resolveViewerIdentity : 'awaiting-s4',
            composeOperatorMessage: 'awaiting-s4',
            listTenants           : 'awaiting-s4',
            startAgent            : 'awaiting-s5',
            stopAgent             : 'awaiting-s5',
            restartAgent          : 'awaiting-s5',
            removeAgent           : 'awaiting-s5',
            fleetMemories         : 'awaiting-s5',
            fleetMailboxMirror    : 'awaiting-s5',
            connectTenant         : 'awaiting-c1'
        };

        for (const [method, degraded] of Object.entries(expectedSlices)) {
            const withSubject = await dispatchFleetS1Request(createFleetWireRequest(method, 'x'), bridge, PRINCIPAL_CONTEXT);

            // WITH a forge-resolved subject, every awaiting verb names its owning slice.
            expect(withSubject).toMatchObject({
                ok   : false,
                state: FLEET_WIRE_RESPONSE_STATES.degraded,
                degraded
            });

            const withoutSubject = await dispatchFleetS1Request(createFleetWireRequest(method, 'x'), bridge);

            if (FLEET_METHOD_SCOPE_CLASSES[method] === 'lifecycle-write') {
                // WITHOUT one, a lifecycle-write verb refuses at the authority boundary and the
                // slice name never leaks — authority shape precedes feature topology.
                expect(withoutSubject.state).toBe(FLEET_WIRE_RESPONSE_STATES.refused);
                expect(withoutSubject.error).toContain('forge-resolved admission subject');
                expect(withoutSubject.error).not.toContain('awaits')
            } else {
                expect(withoutSubject).toMatchObject({
                    ok   : false,
                    state: FLEET_WIRE_RESPONSE_STATES.degraded,
                    degraded
                })
            }
        }

        expect(Object.keys(expectedSlices).sort())
            .toEqual(FLEET_WIRE_METHODS.filter(method => !FLEET_S1_READY_METHODS.includes(method)).sort());
        expect(calls.map(([method]) => method)).toEqual(FLEET_S1_READY_METHODS)
    });

    test('unknown methods retain the canonical fail-closed wire envelope', async () => {
        for (const method of ['futureUnclassifiedVerb', 'constructor', 'toString', '__proto__']) {
            expect(await dispatchFleetS1Request({
                method,
                protocol: createFleetWireRequest('listAgents').protocol
            }, {})).toMatchObject({
                error: `fleet: method '${method}' is not on the control surface`,
                ok   : false,
                state: FLEET_WIRE_RESPONSE_STATES.unsupportedMethod
            })
        }
    })
});
