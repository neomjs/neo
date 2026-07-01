import {setup} from '../../../../../setup.mjs';

const appName = 'AuthServicePatTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

/**
 * Unit coverage for the GitLab-PAT verifier in `AuthService`. Exercises the verifier
 * factory in isolation — `globalThis.fetch` is stubbed so no live GitLab call is made — covering
 * the identity mapping, the `name`-absent fallback, the non-OK rejection (with no failure caching),
 * the success cache (per-token), and the TTL boundary. A minimal stand-in for the SDK
 * `InvalidTokenError` avoids importing the MCP SDK in a unit spec.
 */
test.describe('Neo.ai.mcp.server.shared.services.AuthService — GitLab-PAT verifier', () => {
    let AuthService;
    let originalFetch;

    class FakeInvalidTokenError extends Error {}

    const logger   = {info: () => {}, warn: () => {}, error: () => {}};
    const aiConfig = {
        auth: {
            gitlabApiBaseUrl  : 'https://gitlab.example.com/',
            patCacheTtlSeconds: 300
        }
    };

    function withAuth(overrides) {
        return {auth: {...aiConfig.auth, ...overrides}}
    }

    function stubFetchQueue(responses) {
        const calls = [];

        globalThis.fetch = async (url, opts = {}) => {
            calls.push({url, headers: opts.headers});

            const response = responses.shift();
            if (!response) {
                throw new Error(`Unexpected fetch call: ${url}`)
            }

            return {
                ok    : response.ok ?? true,
                status: response.status ?? 200,
                json  : async () => response.body ?? {}
            }
        };

        return calls
    }

    test.beforeAll(async () => {
        AuthService = (await import('../../../../../../../ai/mcp/server/shared/services/AuthService.mjs')).default;
    });

    test.beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    test.afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test('maps a GitLab /user 200 to the RequestContextService identity shape', async () => {
        let calledUrl, calledHeaders;

        globalThis.fetch = async (url, opts) => {
            calledUrl     = url;
            calledHeaders = opts?.headers;
            return {ok: true, json: async () => ({id: 42, username: 'octocat', name: 'The Octocat'})};
        };

        const verifier = AuthService.createGitlabPatVerifier({aiConfig, logger, InvalidTokenError: FakeInvalidTokenError}),
              info     = await verifier.verifyAccessToken('glpat-abc');

        // Trailing slash on the configured base URL is trimmed before appending the API path.
        expect(calledUrl).toBe('https://gitlab.example.com/api/v4/user');
        expect(calledHeaders.Authorization).toBe('Bearer glpat-abc');
        expect(info.userId).toBe('octocat');
        expect(info.username).toBe('The Octocat');
        expect(info.source).toBe('gitlab-pat');
        expect(info.authProvider).toBe('gitlab');
        expect(info.authSource).toBe('gitlab-pat');
        expect(info.providerBaseUrl).toBe('https://gitlab.example.com');
        expect(info.providerUserId).toBe('42');
        expect(info.providerUsername).toBe('octocat');
        expect(info.providerDisplayName).toBe('The Octocat');
        expect(info.scopes).toEqual([]);
        // expiresAt is REQUIRED by the SDK requireBearerAuth middleware (numeric, future) — a
        // missing/non-numeric value is rejected with "Token has no expiration time".
        expect(typeof info.expiresAt).toBe('number');
        expect(info.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    test('falls back to username when GitLab returns no name field', async () => {
        globalThis.fetch = async () => ({ok: true, json: async () => ({username: 'anon'})});

        const verifier = AuthService.createGitlabPatVerifier({aiConfig, logger, InvalidTokenError: FakeInvalidTokenError}),
              info     = await verifier.verifyAccessToken('glpat-x');

        expect(info.username).toBe('anon');
        expect(info.userId).toBe('anon');
        expect(info.providerDisplayName).toBe('anon');
    });

    test('allows a configured GitLab username and rejects an unlisted user without caching the failure', async () => {
        let calls = 0;

        globalThis.fetch = async () => {
            calls++;
            return {ok: true, json: async () => ({username: calls < 3 ? 'outsider' : 'neo-gpt'})}
        };

        const verifier = AuthService.createGitlabPatVerifier({
            aiConfig         : withAuth({allowedUsers: ['neo-gpt']}),
            logger,
            InvalidTokenError: FakeInvalidTokenError
        });

        await expect(verifier.verifyAccessToken('same-token')).rejects.toBeInstanceOf(FakeInvalidTokenError);
        await expect(verifier.verifyAccessToken('same-token')).rejects.toBeInstanceOf(FakeInvalidTokenError);
        expect(calls).toBe(2);

        const info = await verifier.verifyAccessToken('same-token');

        expect(info.userId).toBe('neo-gpt');
        expect(calls).toBe(3);
    });

    test('binds an OAuth access token to an allowed GitLab application client id', async () => {
        const calls = stubFetchQueue([
            {body: {id: 7, username: 'neo-gpt', name: 'Neo GPT'}},
            {body: {application: {uid: 'mcp-oauth-app'}, scope: ['read_user', 'api']}}
        ]);
        const logEntries = [];

        const verifier = AuthService.createGitlabPatVerifier({
            aiConfig         : withAuth({allowedClientIds: ['mcp-oauth-app']}),
            logger           : {...logger, info: message => logEntries.push(String(message))},
            InvalidTokenError: FakeInvalidTokenError
        });

        const info = await verifier.verifyAccessToken('secret-token-value');

        expect(calls.map(call => call.url)).toEqual([
            'https://gitlab.example.com/api/v4/user',
            'https://gitlab.example.com/oauth/token/info'
        ]);
        expect(calls[0].headers.Authorization).toBe('Bearer secret-token-value');
        expect(calls[1].headers.Authorization).toBe('Bearer secret-token-value');
        expect(info.userId).toBe('neo-gpt');          // Memory Core tenant identity remains GitLab username.
        expect(info.username).toBe('Neo GPT');
        expect(info.clientId).toBe('mcp-oauth-app');
        expect(info.scopes).toEqual(['read_user', 'api']);
        expect(logEntries.join('\n')).not.toContain('secret-token-value');
    });

    test('rejects tokens from non-listed GitLab OAuth apps', async () => {
        stubFetchQueue([
            {body: {username: 'neo-gpt'}},
            {body: {application: {uid: 'other-app'}, scope: 'read_user'}}
        ]);

        const verifier = AuthService.createGitlabPatVerifier({
            aiConfig         : withAuth({allowedClientIds: ['mcp-oauth-app']}),
            logger,
            InvalidTokenError: FakeInvalidTokenError
        });

        await expect(verifier.verifyAccessToken('wrong-app-token')).rejects.toBeInstanceOf(FakeInvalidTokenError);
    });

    test('rejects bare PATs when OAuth app binding is enabled and does not cache the failure', async () => {
        let calls = 0;

        globalThis.fetch = async (url) => {
            calls++;

            if (String(url).endsWith('/api/v4/user')) {
                return {ok: true, json: async () => ({username: 'neo-gpt'})}
            }

            return {ok: false, status: 404, json: async () => ({})}
        };

        const verifier = AuthService.createGitlabPatVerifier({
            aiConfig         : withAuth({allowedClientIds: ['mcp-oauth-app']}),
            logger,
            InvalidTokenError: FakeInvalidTokenError
        });

        await expect(verifier.verifyAccessToken('bare-pat')).rejects.toBeInstanceOf(FakeInvalidTokenError);
        await expect(verifier.verifyAccessToken('bare-pat')).rejects.toBeInstanceOf(FakeInvalidTokenError);
        expect(calls).toBe(4); // /user + /oauth/token/info for each attempt; failed gates are not cached.
    });

    test('throws InvalidTokenError on a non-OK GitLab response and does NOT cache the failure', async () => {
        let calls = 0;

        globalThis.fetch = async () => {
            calls++;
            return {ok: false, status: 401, json: async () => ({})};
        };

        const verifier = AuthService.createGitlabPatVerifier({aiConfig, logger, InvalidTokenError: FakeInvalidTokenError});

        await expect(verifier.verifyAccessToken('bad')).rejects.toBeInstanceOf(FakeInvalidTokenError);
        // A transient failure must not lock the client out — the next call re-hits GitLab.
        await expect(verifier.verifyAccessToken('bad')).rejects.toBeInstanceOf(FakeInvalidTokenError);
        expect(calls).toBe(2);
    });

    test('caches a successful validation per-token (second call does not re-hit GitLab)', async () => {
        let calls = 0;

        globalThis.fetch = async () => {
            calls++;
            return {ok: true, json: async () => ({username: 'cached-user'})};
        };

        const verifier = AuthService.createGitlabPatVerifier({aiConfig, logger, InvalidTokenError: FakeInvalidTokenError}),
              first    = await verifier.verifyAccessToken('same-token'),
              second   = await verifier.verifyAccessToken('same-token');

        expect(calls).toBe(1);                       // cache hit → no second GitLab round-trip
        expect(second.userId).toBe(first.userId);
        // info is rebuilt per-call (so `expiresAt` stays request-fresh on hits) — a new object each time.
        expect(typeof second.expiresAt).toBe('number');

        // A different token is a distinct cache key → a fresh validation.
        await verifier.verifyAccessToken('other-token');
        expect(calls).toBe(2);
    });

    test('a zero-TTL cache entry is never fresh — every call re-validates', async () => {
        let calls = 0;

        globalThis.fetch = async () => {
            calls++;
            return {ok: true, json: async () => ({username: 'u'})};
        };

        const verifier = AuthService.createGitlabPatVerifier({
            aiConfig         : {auth: {gitlabApiBaseUrl: 'https://gitlab.example.com', patCacheTtlSeconds: 0}},
            logger,
            InvalidTokenError: FakeInvalidTokenError
        });

        await verifier.verifyAccessToken('t');
        await verifier.verifyAccessToken('t');

        // expiresAt = now + 0 is never strictly greater than a later Date.now() → re-fetch.
        expect(calls).toBe(2);
    });
});

/**
 * @summary Consumed-boundary coverage: drives the GitLab-PAT verifier through the REAL SDK
 * `requireBearerAuth` middleware (installed by `setupGitlabPat`), not in isolation.
 *
 * A direct-verifier test is insufficient: `@modelcontextprotocol/sdk` `requireBearerAuth` enforces
 * its own `AuthInfo` contract (a numeric `expiresAt`) and rejects non-conforming results with a
 * `401` BEFORE `req.auth` is populated. This describe proves a valid PAT actually authenticates end
 * of middleware, a missing token yields a naked `401` (no `resource_metadata` → no Inspector DCR),
 * and an invalid PAT is rejected.
 */
test.describe('Neo.ai.mcp.server.shared.services.AuthService — GitLab-PAT middleware boundary', () => {
    let AuthService, requireBearerAuth, InvalidTokenError, originalFetch;

    const logger   = {info: () => {}, warn: () => {}, error: () => {}};
    const aiConfig = {auth: {mode: 'gitlab-pat', gitlabApiBaseUrl: 'https://gitlab.example.com', patCacheTtlSeconds: 300}};

    test.beforeAll(async () => {
        AuthService       = (await import('../../../../../../../ai/mcp/server/shared/services/AuthService.mjs')).default;
        requireBearerAuth = (await import('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js')).requireBearerAuth;
        InvalidTokenError = (await import('@modelcontextprotocol/sdk/server/auth/errors.js')).InvalidTokenError;
    });

    test.beforeEach(() => { originalFetch = globalThis.fetch; });
    test.afterEach(()  => { globalThis.fetch = originalFetch; });

    function mockReq(authHeader) {
        const headers = authHeader ? {authorization: authHeader} : {};
        return {headers, get(name) { return headers[String(name).toLowerCase()]; }};
    }

    // Minimal Express-style response double recording status + headers (lower-cased) + body.
    function mockRes() {
        return {
            statusCode: 200, headers: {}, body: undefined, ended: false,
            status(code) { this.statusCode = code; return this; },
            set(field, value) {
                if (field && typeof field === 'object') {
                    Object.entries(field).forEach(([k, v]) => { this.headers[String(k).toLowerCase()] = v; });
                } else {
                    this.headers[String(field).toLowerCase()] = value;
                }
                return this;
            },
            setHeader(field, value) { this.headers[String(field).toLowerCase()] = value; return this; },
            header(field, value)    { this.headers[String(field).toLowerCase()] = value; return this; },
            getHeader(field)        { return this.headers[String(field).toLowerCase()]; },
            json(payload) { this.body = payload; this.ended = true; return this; },
            send(payload) { this.body = payload; this.ended = true; return this; },
            end(payload)  { if (payload !== undefined) this.body = payload; this.ended = true; return this; }
        };
    }

    // Installs the REAL SDK requireBearerAuth via setupGitlabPat; returns the captured middleware.
    // The single-middleware assertion also confirms the naked-401 shape (no mcpAuthMetadataRouter).
    function installPatMiddleware(config = aiConfig) {
        const middlewares = [],
              app         = {use: mw => middlewares.push(mw)};

        AuthService.setupGitlabPat({app, aiConfig: config, logger}, {requireBearerAuth, InvalidTokenError});

        expect(middlewares.length).toBe(1);
        return middlewares[0];
    }

    test('a valid GitLab PAT passes requireBearerAuth → next() called + req.auth populated', async () => {
        globalThis.fetch = async () => ({ok: true, json: async () => ({id: 7, username: 'octocat', name: 'The Octocat'})});

        const mw  = installPatMiddleware(),
              req = mockReq('Bearer glpat-valid'),
              res = mockRes();

        let nextErr = 'unset';
        await mw(req, res, err => { nextErr = err; });

        expect(nextErr).toBeUndefined();                     // next() invoked with no error
        expect(res.ended).toBe(false);                       // no 401 short-circuit
        expect(req.auth?.userId).toBe('octocat');
        expect(req.auth?.source).toBe('gitlab-pat');
        expect(req.auth?.authProvider).toBe('gitlab');
        expect(req.auth?.providerUsername).toBe('octocat');
        expect(req.auth?.providerUserId).toBe('7');
        expect(typeof req.auth?.expiresAt).toBe('number');   // the SDK requires + propagates this
    });

    test('a missing token yields a naked 401 — WWW-Authenticate: Bearer, no resource_metadata', async () => {
        const mw  = installPatMiddleware(),
              req = mockReq(),
              res = mockRes();

        let nextCalled = false;
        await mw(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
        const wwwAuth = String(res.headers['www-authenticate'] || '');
        expect(wwwAuth).toContain('Bearer');
        expect(wwwAuth).not.toContain('resource_metadata');
    });

    test('an invalid PAT (GitLab 401) is rejected — next() not called', async () => {
        globalThis.fetch = async () => ({ok: false, status: 401, json: async () => ({})});

        const mw  = installPatMiddleware(),
              req = mockReq('Bearer glpat-bad'),
              res = mockRes();

        let nextCalled = false;
        await mw(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
    });

    test('allowedUsers gate passes through real requireBearerAuth with GitLab username identity intact', async () => {
        globalThis.fetch = async () => ({ok: true, json: async () => ({username: 'neo-gpt', name: 'Neo GPT'})});

        const mw  = installPatMiddleware({auth: {...aiConfig.auth, allowedUsers: ['neo-gpt']}}),
              req = mockReq('Bearer glpat-valid'),
              res = mockRes();

        let nextErr = 'unset';
        await mw(req, res, err => { nextErr = err; });

        expect(nextErr).toBeUndefined();
        expect(res.ended).toBe(false);
        expect(req.auth?.userId).toBe('neo-gpt');
        expect(req.auth?.username).toBe('Neo GPT');
    });

    test('allowedUsers gate rejects an unlisted user through real requireBearerAuth', async () => {
        globalThis.fetch = async () => ({ok: true, json: async () => ({username: 'outsider'})});

        const mw  = installPatMiddleware({auth: {...aiConfig.auth, allowedUsers: ['neo-gpt']}}),
              req = mockReq('Bearer glpat-outsider'),
              res = mockRes();

        let nextCalled = false;
        await mw(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
    });

    test('allowedClientIds gate passes through real requireBearerAuth and preserves GitLab username', async () => {
        globalThis.fetch = async (url) => {
            if (String(url).endsWith('/api/v4/user')) {
                return {ok: true, json: async () => ({username: 'neo-gpt', name: 'Neo GPT'})}
            }

            return {ok: true, json: async () => ({application: {uid: 'mcp-oauth-app'}, scope: 'read_user'})}
        };

        const mw  = installPatMiddleware({auth: {...aiConfig.auth, allowedClientIds: ['mcp-oauth-app']}}),
              req = mockReq('Bearer oauth-token'),
              res = mockRes();

        let nextErr = 'unset';
        await mw(req, res, err => { nextErr = err; });

        expect(nextErr).toBeUndefined();
        expect(res.ended).toBe(false);
        expect(req.auth?.userId).toBe('neo-gpt');
        expect(req.auth?.clientId).toBe('mcp-oauth-app');
        expect(req.auth?.scopes).toEqual(['read_user']);
    });

    test('allowedClientIds gate rejects a non-listed OAuth app through real requireBearerAuth', async () => {
        globalThis.fetch = async (url) => {
            if (String(url).endsWith('/api/v4/user')) {
                return {ok: true, json: async () => ({username: 'neo-gpt'})}
            }

            return {ok: true, json: async () => ({application: {uid: 'other-app'}, scope: 'read_user'})}
        };

        const mw  = installPatMiddleware({auth: {...aiConfig.auth, allowedClientIds: ['mcp-oauth-app']}}),
              req = mockReq('Bearer oauth-token'),
              res = mockRes();

        let nextCalled = false;
        await mw(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
    });
});
