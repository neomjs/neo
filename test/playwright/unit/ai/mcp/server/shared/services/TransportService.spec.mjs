import {setup} from '../../../../../../setup.mjs';

const appName = 'TransportServiceTest';

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

import { test, expect } from '@playwright/test';
import fs               from 'node:fs';
import http             from 'http';
import net              from 'net';
import os               from 'os';
import path             from 'node:path';
import Neo              from '../../../../../../../../src/Neo.mjs';
import * as core        from '../../../../../../../../src/core/_export.mjs';

const noOpAuthMiddleware = (_req, _res, next) => next();

test.describe('Neo.ai.mcp.server.shared.services.TransportService', () => {

    test('onsessionclosed hook removes transport and calls server.onSessionClosed via actual HTTP request', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: HTTP bind race residual post-#10930 fix (#10935)');
        const TransportService = (await import('../../../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;

        let closedSessionId = null;
        let resolveClosed;
        const closedPromise = new Promise(resolve => resolveClosed = resolve);

        const mockServer = {
            mcpServer      : { connect: async () => {} },
            onSessionClosed: (id) => {
                closedSessionId = id;
                resolveClosed();
            }
        };

        const testPort     = 3125;
        const mockAiConfig = {
            mcpHttpHost   : 'localhost',
            mcpHttpPort   : testPort,
            auth          : {},
            authMiddleware: noOpAuthMiddleware
        };
        const mockLogger = { info: () => {} };

        // Setup the real transport service which starts the Express app
        await TransportService.setup({
            server      : mockServer,
            aiConfig    : mockAiConfig,
            logger      : mockLogger,
            resourceName: 'TestResource'
        });

        // 1. Initialize the session via POST
        const initResponse = await fetch(`http://localhost:${testPort}/mcp`, {
            method : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept'      : 'application/json, text/event-stream'
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id     : 1,
                method : "initialize",
                params : {
                    protocolVersion: "2024-11-05",
                    capabilities   : {},
                    clientInfo     : { name: "test", version: "1.0.0" }
                }
            })
        });

        const sessionId = initResponse.headers.get('mcp-session-id');

        // 2. Terminate the session via DELETE
        // This triggers handleDeleteRequest -> onsessionclosed
        await fetch(`http://localhost:${testPort}/mcp`, {
            method : 'DELETE',
            headers: {
                'mcp-session-id'      : sessionId,
                'mcp-protocol-version': '2024-11-05'
            }
        });

        // Wait for the server-side callback to fire
        await closedPromise;

        // Verify the server's onSessionClosed was called with a valid string ID
        expect(typeof closedSessionId).toBe('string');
        expect(closedSessionId.length).toBeGreaterThan(0);

        // Verify the transport service map was cleaned up
        expect(TransportService.transports.has(closedSessionId)).toBe(false);

        TransportService.destroy();
    });

    test('setup() awaits listener accept-state before resolving (#10932)', async () => {
        // Bind-race regression guard: prior to the listen-callback fix, TransportService.setup() returned
        // synchronously after `app.listen()` without awaiting the listen-callback. Under load
        // or fullyParallel test interleaving, the calling spec's subsequent `fetch()` could
        // race the bind and observe the response object lacking expected shape (e.g.,
        // `initResponse.headers` undefined). The fix wraps `app.listen()` in a Promise that
        // resolves only after the listen-callback fires. This test asserts the deterministic
        // accept-state guarantee directly: immediately after `setup` resolves, an HTTP probe
        // must not surface a connection-refused error.
        const TransportService = (await import('../../../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;

        const probePort  = 3126; // distinct from the prior test's 3125 to avoid intra-spec collision
        const mockServer = {
            mcpServer      : { connect: async () => {} },
            onSessionClosed: () => {}
        };
        const mockAiConfig = {
            mcpHttpHost   : 'localhost',
            mcpHttpPort   : probePort,
            auth          : {},
            authMiddleware: noOpAuthMiddleware
        };
        const mockLogger = { info: () => {} };

        await TransportService.setup({
            server      : mockServer,
            aiConfig    : mockAiConfig,
            logger      : mockLogger,
            resourceName: 'BindRaceProbeResource'
        });

        // Probe immediately — if the bind raced, fetch would surface ECONNREFUSED via thrown
        // error. Status code itself is irrelevant for the bind-race regression test; what
        // matters is that fetch resolves (listener accepted the TCP connection) rather than
        // rejecting with a connection error. Any HTTP status (200 / 401 / 404 / 405) is proof
        // the listener was accepting at the moment `setup` resolved.
        let response;
        let connectionError;
        try {
            response = await fetch(`http://localhost:${probePort}/mcp`, {
                method : 'GET',
                headers: { 'Accept': 'application/json' }
            });
        } catch (e) {
            connectionError = e;
        }

        expect(connectionError).toBeUndefined();
        expect(response).toBeDefined();
        expect(typeof response.status).toBe('number');

        TransportService.destroy();
    });

    test.describe('resolveAuthContext proxy-identity injection', () => {
        let TransportService;

        test.beforeAll(async () => {
            TransportService = (await import('../../../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;
        });

        test('OIDC precedence: native req.auth overrides proxy headers', () => {
            const req = {
                auth   : { userId: 'oidc-user', username: 'oidc-user', source: 'jwt' },
                headers: { 'x-preferred-username': 'spoofed-user' }
            };
            const aiConfig = { auth: { trustProxyIdentity: true } };

            const result = TransportService.resolveAuthContext(req, aiConfig);

            expect(result.error).toBeUndefined();
            expect(result.auth).toEqual({
                userId  : 'oidc-user',
                username: 'oidc-user',
                source  : 'jwt'
            });
        });

        test('Active proxy identity injection (canonical header)', () => {
            const req = {
                auth   : undefined,
                headers: { 'x-preferred-username': 'proxy-user' }
            };
            const aiConfig = { auth: { trustProxyIdentity: true } };

            const result = TransportService.resolveAuthContext(req, aiConfig);

            expect(result.error).toBeUndefined();
            expect(result.auth).toEqual({
                userId  : 'proxy-user',
                username: 'proxy-user',
                source  : 'proxy-header'
            });
        });

        test('OAuth2-proxy variant header fallback', () => {
            const req = {
                auth   : undefined,
                headers: { 'x-auth-request-preferred-username': 'oauth2-user' }
            };
            const aiConfig = { auth: { trustProxyIdentity: true } };

            const result = TransportService.resolveAuthContext(req, aiConfig);

            expect(result.error).toBeUndefined();
            expect(result.auth).toEqual({
                userId  : 'oauth2-user',
                username: 'oauth2-user',
                source  : 'proxy-header'
            });
        });

        test('Gate-disabled behavior: ignores headers when trustProxyIdentity is false', () => {
            const req = {
                auth   : undefined,
                headers: { 'x-preferred-username': 'ignored-user' }
            };
            const aiConfig = { auth: { trustProxyIdentity: false } };

            const result = TransportService.resolveAuthContext(req, aiConfig);

            expect(result.error).toBeUndefined();
            expect(result.auth).toBeUndefined();
        });

        test('Both headers provided: prioritizes canonical over oauth2-proxy', () => {
            const req = {
                auth   : undefined,
                headers: {
                    'x-preferred-username'             : 'primary-user',
                    'x-auth-request-preferred-username': 'secondary-user'
                }
            };
            const aiConfig = { auth: { trustProxyIdentity: true } };

            const result = TransportService.resolveAuthContext(req, aiConfig);

            expect(result.error).toBeUndefined();
            expect(result.auth).toEqual({
                userId  : 'primary-user',
                username: 'primary-user',
                source  : 'proxy-header'
            });
        });

        test('Header-spoof resistance / required identity: returns 401 when enabled but headers are missing', () => {
            const req = {
                auth   : undefined,
                headers: {}
            };
            const aiConfig = { auth: { trustProxyIdentity: true } };

            const result = TransportService.resolveAuthContext(req, aiConfig);

            expect(result.error).toBe('Unauthorized: Missing proxy identity header');
            expect(result.status).toBe(401);
            expect(result.auth).toBeUndefined();
        });
    });

    test.describe('mcpServerUrl resolution (publicUrl branch)', () => {
        let TransportService;

        test.beforeAll(async () => {
            TransportService = (await import('../../../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;
        });

        test.afterEach(() => {
            if (TransportService.app) {
                TransportService.destroy();
            }
        });

        // The `HOST` env binding lives on the `mcpHttpHost` config leaf (covered by the root
        // config.template spec); TransportService only ever sees the resolved config value, so
        // these mocks model the resolved contract instead of mutating process.env.
        test('uses aiConfig.publicUrl when set (wins over mcpHttpHost)', async () => {
            await TransportService.setup({
                server  : { mcpServer: { connect: async () => {} } },
                aiConfig: {
                    publicUrl     : 'https://public.example.com',
                    mcpHttpHost   : 'internal-host',
                    mcpHttpPort   : 3000,
                    auth          : {},
                    authMiddleware: noOpAuthMiddleware
                },
                logger      : { info: () => {} },
                resourceName: 'Test'
            });

            expect(TransportService.mcpServerUrl.href).toBe('https://public.example.com/');
        });

        test('falls back to mcpHttpHost and port when publicUrl is unset', async () => {
            await TransportService.setup({
                server  : { mcpServer: { connect: async () => {} } },
                aiConfig: {
                    mcpHttpHost   : 'internal-host',
                    mcpHttpPort   : 3000,
                    auth          : {},
                    authMiddleware: noOpAuthMiddleware
                },
                logger      : { info: () => {} },
                resourceName: 'Test'
            });

            expect(TransportService.mcpServerUrl.href).toBe('https://internal-host:3000/');
        });

        test('falls back to mcpHttpHost and port when publicUrl is empty string', async () => {
            await TransportService.setup({
                server  : { mcpServer: { connect: async () => {} } },
                aiConfig: {
                    publicUrl     : '',
                    mcpHttpHost   : 'internal-host',
                    mcpHttpPort   : 3000,
                    auth          : {},
                    authMiddleware: noOpAuthMiddleware
                },
                logger      : { info: () => {} },
                resourceName: 'Test'
            });

            expect(TransportService.mcpServerUrl.href).toBe('https://internal-host:3000/');
        });
    });

    test.describe('computeAllowedHosts host-allowlist (DNS-rebinding) — #12371', () => {
        let TransportService;

        test.beforeAll(async () => {
            TransportService = (await import('../../../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;
        });

        test('always includes the localhost set (empty config) — healthcheck-safe', () => {
            expect(TransportService.computeAllowedHosts({})).toEqual(['localhost', '127.0.0.1', '[::1]']);
        });

        test('derives the public hostname from publicUrl, keeping localhost', () => {
            const hosts = TransportService.computeAllowedHosts({publicUrl: 'https://mcp.example.com/knowledge-base'});
            expect(hosts).toContain('mcp.example.com');
            expect(hosts).toContain('localhost');
            expect(hosts).toContain('127.0.0.1');
        });

        test('adds comma-separated NEO_MCP_ALLOWED_HOSTS entries, trimmed, dropping blanks', () => {
            const hosts = TransportService.computeAllowedHosts({allowedHosts: 'a.example.com, b.example.com ,, c.example.com'});
            expect(hosts).toEqual(expect.arrayContaining(['a.example.com', 'b.example.com', 'c.example.com']));
            expect(hosts).not.toContain('');
            expect(hosts).toContain('127.0.0.1');
        });

        test('de-duplicates when publicUrl host also appears in the explicit list', () => {
            const hosts = TransportService.computeAllowedHosts({publicUrl: 'https://mcp.example.com', allowedHosts: 'mcp.example.com'});
            expect(hosts.filter(host => host === 'mcp.example.com')).toHaveLength(1);
        });

        test('ignores an unparseable publicUrl without throwing', () => {
            expect(TransportService.computeAllowedHosts({publicUrl: 'not a url'})).toEqual(['localhost', '127.0.0.1', '[::1]']);
        });
    });

    /**
     * @summary Guards the activation defect at Transport's consumed seam.
     *
     * AuthService owns legal-state discrimination. Transport must therefore delegate every HTTP
     * boot, including later-added built-ins, instead of maintaining a subset that can drift.
     */
    test.describe('unconditional AuthService activation', () => {
        let TransportService, AuthService;

        test.beforeAll(async () => {
            TransportService = (await import('../../../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;
            AuthService      = (await import('../../../../../../../../ai/mcp/server/shared/services/AuthService.mjs')).default
        });

        test.afterEach(async () => {
            if (TransportService.httpServer?.listening) {
                await new Promise((resolve, reject) => {
                    TransportService.httpServer.close(error => error ? reject(error) : resolve())
                })
            }

            TransportService.app        = null;
            TransportService.httpServer = null;
            TransportService.transports = new Map();
            TransportService.mcpServers = new Map()
        });

        test('delegates github-pat and seat-token boots without a hand-maintained mode predicate', async () => {
            const
                originalSetup = AuthService.setup,
                calls         = [];

            AuthService.setup = async ({aiConfig}) => {
                calls.push(aiConfig.auth.mode)
            };

            try {
                for (const mode of ['github-pat', 'seat-token']) {
                    await TransportService.setup({
                        server: {
                            mcpServer      : {connect: async () => {}},
                            onSessionClosed: () => {}
                        },
                        aiConfig: {
                            mcpHttpHost: '127.0.0.1',
                            mcpHttpPort: 0,
                            auth       : {mode}
                        },
                        logger      : {info: () => {}, warn: () => {}, error: () => {}},
                        resourceName: `Activation-${mode}`
                    });

                    await new Promise((resolve, reject) => {
                        TransportService.httpServer.close(error => error ? reject(error) : resolve())
                    });

                    TransportService.app        = null;
                    TransportService.httpServer = null
                }
            } finally {
                AuthService.setup = originalSetup
            }

            expect(calls).toEqual(['github-pat', 'seat-token'])
        });

        test('does not create or open the HTTP server until AuthService setup resolves', async () => {
            const originalSetup = AuthService.setup;

            let
                releaseAuth,
                markAuthEntered;

            const authEntered = new Promise(resolve => {
                markAuthEntered = resolve
            });

            AuthService.setup = async () => {
                markAuthEntered();
                await new Promise(resolve => {
                    releaseAuth = resolve
                })
            };

            try {
                const setupPromise = TransportService.setup({
                    server: {
                        mcpServer      : {connect: async () => {}},
                        onSessionClosed: () => {}
                    },
                    aiConfig: {
                        mcpHttpHost: '127.0.0.1',
                        mcpHttpPort: 0,
                        auth       : {mode: 'github-pat'}
                    },
                    logger      : {info: () => {}, warn: () => {}, error: () => {}},
                    resourceName: 'Activation-before-listen'
                });

                await authEntered;

                expect(TransportService.httpServer?.listening).not.toBe(true);

                releaseAuth();
                await setupPromise;

                expect(TransportService.httpServer?.listening).toBe(true)
            } finally {
                releaseAuth?.();
                AuthService.setup = originalSetup
            }
        });
    });

    /**
     * @summary Consumed HTTP proof for the rosterless GitHub-PAT admission profile.
     *
     * Provider validation establishes the process pin before Transport creates a listener.
     * Requests then cross the real SDK bearer middleware and Express route: the pinned subject
     * can initialize MCP, while a second valid provider subject receives 401 before connect,
     * transport creation, or session-id issuance.
     */
    test.describe('first-provider-subject HTTP ingress', () => {
        let TransportService, McpServer, originalFetch;

        const logger = {info: () => {}, warn: () => {}, error: () => {}};

        function authConfig(bootstrapPat = 'bootstrap-pat') {
            return {
                mcpHttpHost  : '127.0.0.1',
                mcpListenHost: '127.0.0.1',
                mcpHttpPort  : 0,
                auth         : {
                    mode                   : 'github-pat',
                    host                   : null,
                    issuerUrl              : null,
                    trustProxyIdentity     : false,
                    githubApiBaseUrl       : 'https://api.github.test',
                    patCacheTtlSeconds     : 300,
                    patValidationTimeoutMs : 5000,
                    allowedUsers           : [],
                    allowedClientIds       : [],
                    pinFirstProviderSubject: true,
                    providerBootstrapPat   : bootstrapPat
                }
            }
        }

        function initializeBody() {
            return {
                jsonrpc: '2.0',
                id     : 1,
                method : 'initialize',
                params : {
                    protocolVersion: '2024-11-05',
                    capabilities   : {},
                    clientInfo     : {name: 'provider-pat-ingress-test', version: '1.0.0'}
                }
            }
        }

        function mockProviderUsers() {
            globalThis.fetch = async (url, options) => {
                if (!String(url).startsWith('https://api.github.test/')) {
                    return originalFetch(url, options)
                }

                const
                    token = options.headers.Authorization.replace(/^Bearer /, ''),
                    login = token === 'outsider-pat' ? 'other-user' : 'neo-gpt';

                return {
                    ok     : true,
                    headers: {get: () => ''},
                    json   : async () => ({id: login === 'neo-gpt' ? 1 : 2, login})
                }
            }
        }

        async function setupPinned(server) {
            await TransportService.setup({
                server,
                aiConfig    : authConfig(),
                logger,
                resourceName: 'ProviderPatIngressTest'
            });

            return TransportService.httpServer.address().port
        }

        test.beforeAll(async () => {
            TransportService = (await import('../../../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;
            McpServer        = (await import('@modelcontextprotocol/sdk/server/mcp.js')).McpServer
        });

        test.beforeEach(() => {
            originalFetch = globalThis.fetch;

            TransportService.app        = null;
            TransportService.httpServer = null;
            TransportService.transports = new Map();
            TransportService.mcpServers = new Map()
        });

        test.afterEach(async () => {
            globalThis.fetch = originalFetch;

            if (TransportService.httpServer?.listening) {
                await new Promise((resolve, reject) => {
                    TransportService.httpServer.close(error => error ? reject(error) : resolve())
                })
            }

            TransportService.app        = null;
            TransportService.httpServer = null;
            TransportService.transports.clear();
            TransportService.mcpServers.clear()
        });

        test('an invalid bootstrap PAT prevents listener creation', async () => {
            globalThis.fetch = async url => {
                if (String(url).startsWith('https://api.github.test/')) {
                    return {ok: false, status: 401, headers: {get: () => ''}, json: async () => ({})}
                }

                return originalFetch(url)
            };

            await expect(TransportService.setup({
                server      : {mcpServer: {connect: async () => {}}, onSessionClosed: () => {}},
                aiConfig    : authConfig('invalid-bootstrap-pat'),
                logger,
                resourceName: 'InvalidProviderPatBootstrap'
            })).rejects.toThrow('GitHub PAT validation failed (HTTP 401)');

            expect(TransportService.httpServer?.listening).not.toBe(true)
        });

        test('an unauthenticated GitHub-PAT initialize is challenged before MCP dispatch', async () => {
            mockProviderUsers();

            let connectCalls = 0;

            const
                port     = await setupPinned({
                    mcpServer: {
                        connect: async () => {
                            connectCalls++
                        }
                    },
                    onSessionClosed: () => {}
                }),
                response = await originalFetch(`http://127.0.0.1:${port}/mcp`, {
                    method : 'POST',
                    headers: {
                        Accept        : 'application/json, text/event-stream',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(initializeBody())
                }),
                challenge = response.headers.get('www-authenticate') || '';

            expect(response.status).toBe(401);
            expect(challenge).toContain('Bearer');
            expect(challenge).not.toContain('resource_metadata');
            expect(response.headers.get('mcp-session-id')).toBeNull();
            expect(connectCalls).toBe(0);
            expect(TransportService.transports.size).toBe(0)
        });

        test('the pinned provider subject can initialize a real MCP session', async () => {
            mockProviderUsers();

            const
                mcpServer = new McpServer({name: 'provider-pat-ingress-test', version: '1.0.0'}),
                port      = await setupPinned({mcpServer, onSessionClosed: () => {}}),
                response  = await originalFetch(`http://127.0.0.1:${port}/mcp`, {
                    method : 'POST',
                    headers: {
                        Accept        : 'application/json, text/event-stream',
                        Authorization : 'Bearer same-subject-pat',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(initializeBody())
                });

            expect(response.status).toBe(200);
            expect(response.headers.get('mcp-session-id')).toBeTruthy()
        });

        test('a second valid provider subject is denied before MCP dispatch or session creation', async () => {
            mockProviderUsers();

            let connectCalls = 0;

            const
                port     = await setupPinned({
                    mcpServer: {
                        connect: async () => {
                            connectCalls++
                        }
                    },
                    onSessionClosed: () => {}
                }),
                response = await originalFetch(`http://127.0.0.1:${port}/mcp`, {
                    method : 'POST',
                    headers: {
                        Accept        : 'application/json, text/event-stream',
                        Authorization : 'Bearer outsider-pat',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(initializeBody())
                });

            expect(response.status).toBe(401);
            expect(response.headers.get('mcp-session-id')).toBeNull();
            expect(connectCalls).toBe(0);
            expect(TransportService.transports.size).toBe(0)
        });
    });

    /**
     * @summary Consumed HTTP activation proof for the registry-backed seat-token strategy.
     *
     * A provisioned registry is a boot gate, but a caller still has to present a bearer before
     * Transport may dispatch `initialize`, allocate a transport, or issue a session id.
     */
    test.describe('seat-token HTTP ingress', () => {
        let TransportService, buildSeatTokenRegistry, mintSeatToken, writeSeatTokenRegistry;

        test.beforeAll(async () => {
            TransportService = (await import('../../../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;

            const helpers = await import('../../../../../../../../ai/mcp/server/shared/helpers/seatToken.mjs');

            buildSeatTokenRegistry = helpers.buildSeatTokenRegistry;
            mintSeatToken          = helpers.mintSeatToken;
            writeSeatTokenRegistry = helpers.writeSeatTokenRegistry
        });

        test.beforeEach(() => {
            TransportService.app        = null;
            TransportService.httpServer = null;
            TransportService.transports = new Map();
            TransportService.mcpServers = new Map()
        });

        test.afterEach(async () => {
            if (TransportService.httpServer?.listening) {
                await new Promise((resolve, reject) => {
                    TransportService.httpServer.close(error => error ? reject(error) : resolve())
                })
            }

            TransportService.app        = null;
            TransportService.httpServer = null;
            TransportService.transports.clear();
            TransportService.mcpServers.clear()
        });

        test('an unauthenticated initialize receives a naked bearer challenge and no session', async () => {
            const
                planeId  = 'seat-token-http-ingress',
                tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-seat-token-ingress-')),
                filePath = path.join(tempDir, 'registry.json'),
                {row}    = mintSeatToken({agentIdentityNodeId: 'AGENT_IDENTITY:@neo-test-seat'});

            writeSeatTokenRegistry(filePath, buildSeatTokenRegistry({
                planeId,
                generation: 1,
                rows      : [row]
            }));

            let connectCalls = 0;

            try {
                await TransportService.setup({
                    server: {
                        mcpServer: {
                            connect: async () => {
                                connectCalls++
                            }
                        },
                        onSessionClosed: () => {}
                    },
                    aiConfig: {
                        mcpHttpHost  : '127.0.0.1',
                        mcpListenHost: '127.0.0.1',
                        mcpHttpPort  : 0,
                        plane        : {id: planeId},
                        auth         : {
                            mode                   : 'seat-token',
                            pinFirstProviderSubject: false,
                            seatTokenRegistryPath  : filePath,
                            trustProxyIdentity     : false
                        }
                    },
                    logger      : {info: () => {}, warn: () => {}, error: () => {}},
                    resourceName: 'SeatTokenIngressTest'
                });

                const
                    port     = TransportService.httpServer.address().port,
                    response = await fetch(`http://127.0.0.1:${port}/mcp`, {
                        method : 'POST',
                        headers: {
                            Accept        : 'application/json, text/event-stream',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id     : 1,
                            method : 'initialize',
                            params : {
                                protocolVersion: '2024-11-05',
                                capabilities   : {},
                                clientInfo     : {name: 'seat-token-ingress-test', version: '1.0.0'}
                            }
                        })
                    }),
                    challenge = response.headers.get('www-authenticate') || '';

                expect(response.status).toBe(401);
                expect(challenge).toContain('Bearer');
                expect(challenge).not.toContain('resource_metadata');
                expect(response.headers.get('mcp-session-id')).toBeNull();
                expect(connectCalls).toBe(0);
                expect(TransportService.transports.size).toBe(0)
            } finally {
                fs.rmSync(tempDir, {recursive: true, force: true})
            }
        });
    });

    /**
     * @summary Real-socket coverage for the loopback/origin/Host/bearer ingress contract.
     */
    test.describe('local-bearer ingress', () => {
        let TransportService, McpServer, generateLocalBearerToken;

        const externalIpv4 = Object.values(os.networkInterfaces())
            .flat()
            .find(address => address && !address.internal && (address.family === 'IPv4' || address.family === 4))
            ?.address;

        function localConfig(token, overrides = {}) {
            return {
                mcpHttpHost  : '127.0.0.1',
                mcpListenHost: '127.0.0.1',
                mcpHttpPort  : 0,
                auth         : {
                    mode              : 'local-bearer',
                    localBearerToken  : token,
                    trustProxyIdentity: false
                },
                ...overrides
            }
        }

        function httpRequest({port, method='POST', headers={}, body}) {
            return new Promise((resolve, reject) => {
                const request = http.request({
                    host: '127.0.0.1',
                    port,
                    path: '/mcp',
                    method,
                    headers
                }, response => {
                    const chunks = [];

                    response.on('data', chunk => chunks.push(chunk));
                    response.on('end', () => resolve({
                        body   : Buffer.concat(chunks).toString('utf8'),
                        headers: response.headers,
                        status : response.statusCode
                    }));
                });

                request.on('error', reject);
                if (body !== undefined) {
                    request.write(body)
                }
                request.end()
            })
        }

        function initializeBody() {
            return JSON.stringify({
                jsonrpc: '2.0',
                id     : 1,
                method : 'initialize',
                params : {
                    protocolVersion: '2024-11-05',
                    capabilities   : {},
                    clientInfo     : {name: 'local-bearer-test', version: '1.0.0'}
                }
            })
        }

        async function setupLocal({token=generateLocalBearerToken(), aiConfig={}, server} = {}) {
            const mcpServer = new McpServer({name: 'local-bearer-test', version: '1.0.0'});

            await TransportService.setup({
                server: server || {
                    mcpServer,
                    onSessionClosed: () => {}
                },
                aiConfig    : localConfig(token, aiConfig),
                logger      : {info: () => {}, warn: () => {}, error: () => {}},
                resourceName: 'LocalBearerTest'
            });

            return {
                port: TransportService.httpServer.address().port,
                token
            }
        }

        function canConnect(host, port) {
            return new Promise(resolve => {
                const socket  = net.createConnection({host, port});
                let   settled = false;

                const finish = connected => {
                    if (settled) {
                        return
                    }
                    settled = true;
                    socket.destroy();
                    resolve(connected)
                };

                socket.setTimeout(1000);
                socket.once('connect', () => finish(true));
                socket.once('error',   () => finish(false));
                socket.once('timeout', () => finish(false));
            })
        }

        test.beforeAll(async () => {
            TransportService        = (await import('../../../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;
            McpServer               = (await import('@modelcontextprotocol/sdk/server/mcp.js')).McpServer;
            generateLocalBearerToken = (await import('../../../../../../../../ai/mcp/server/shared/helpers/localBearer.mjs')).generateLocalBearerToken;
        });

        test.beforeEach(() => {
            // Legacy cases above call Base.destroy(), which clears instance-owned maps. Recreate
            // this describe's isolated session state so CI's single worker does not inherit it.
            TransportService.app        = null;
            TransportService.httpServer = null;
            TransportService.transports = new Map();
            TransportService.mcpServers = new Map()
        });

        test.afterEach(async () => {
            if (TransportService.httpServer?.listening) {
                await new Promise((resolve, reject) => {
                    TransportService.httpServer.close(error => error ? reject(error) : resolve())
                })
            }

            TransportService.app        = null;
            TransportService.httpServer = null;
            TransportService.transports.clear();
            TransportService.mcpServers.clear()
        });

        test('fails startup unless the actual listener bind is literal 127.0.0.1', async () => {
            const token = generateLocalBearerToken();

            await expect(TransportService.setup({
                server      : {mcpServer: {connect: async () => {}}},
                aiConfig    : localConfig(token, {mcpListenHost: 'localhost'}),
                logger      : {info: () => {}},
                resourceName: 'InvalidLocalBind'
            })).rejects.toThrow(/literal IPv4 loopback address '127\.0\.0\.1'/);

            expect(TransportService.httpServer?.listening).not.toBe(true);
        });

        test('binds the real socket to IPv4 loopback and accepts an absent-Origin valid request', async () => {
            const {port, token} = await setupLocal();
            const address       = TransportService.httpServer.address();

            expect(address.address).toBe('127.0.0.1');

            const response = await httpRequest({
                port,
                headers: {
                    Accept        : 'application/json, text/event-stream',
                    Authorization : `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: initializeBody()
            });

            expect(response.status).toBe(200);
            expect(response.headers['mcp-session-id']).toBeTruthy();
        });

        test('rejects every present Origin before auth or MCP dispatch, including an empty value', async () => {
            let   connectCalls = 0;
            const token        = generateLocalBearerToken();
            const {port}       = await setupLocal({
                token,
                server: {mcpServer: {connect: async () => { connectCalls++ }}}
            });

            for (const origin of ['https://browser.example', '']) {
                const response = await httpRequest({
                    port,
                    method : 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Origin       : origin
                    }
                });

                expect(response.status).toBe(403);
                expect(response.body).toContain('Origin header is not allowed');
            }

            expect(connectCalls).toBe(0);
        });

        test('keeps bearer and Host validation as independent guards', async () => {
            const {port, token} = await setupLocal({
                server: {mcpServer: {connect: async () => {}}}
            });

            const missing = await httpRequest({port, method: 'GET'});
            expect(missing.status).toBe(401);

            const invalidBearer = await httpRequest({
                port,
                method : 'GET',
                headers: {Authorization: `Bearer ${generateLocalBearerToken()}`}
            });
            expect(invalidBearer.status).toBe(401);

            const invalidHost = await httpRequest({
                port,
                method : 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Host         : 'attacker.example'
                }
            });
            expect(invalidHost.status).toBe(403);
            expect(invalidHost.body).toContain('Invalid Host');
        });

        test('is unreachable through a discovered non-loopback IPv4 interface', async () => {
            test.skip(!externalIpv4, 'No non-loopback IPv4 interface is available in this test environment');

            const {port} = await setupLocal();

            expect(await canConnect(externalIpv4, port)).toBe(false);
        });
    });

});
