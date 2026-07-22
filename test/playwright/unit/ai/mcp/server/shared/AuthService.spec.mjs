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
 * the success cache (per-token), the TTL boundary, and the one-budget upstream deadline. A
 * minimal stand-in for the SDK `InvalidTokenError` avoids importing the MCP SDK in a unit spec.
 */
test.describe('Neo.ai.mcp.server.shared.services.AuthService — GitLab-PAT verifier', () => {
    let AuthService;
    let originalFetch;

    class FakeInvalidTokenError extends Error {}

    const logger   = {info: () => {}, warn: () => {}, error: () => {}};
    const aiConfig = {
        auth: {
            gitlabApiBaseUrl      : 'https://gitlab.example.com/',
            patCacheTtlSeconds    : 300,
            patValidationTimeoutMs: 5000
        }
    };

    function withAuth(overrides) {
        return {auth: {...aiConfig.auth, ...overrides}}
    }

    function stubFetchQueue(responses) {
        const calls = [];

        globalThis.fetch = async (url, opts = {}) => {
            calls.push({url, headers: opts.headers, signal: opts.signal});

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

    test('fails fast when the PAT validation deadline cannot map to a safe timer', () => {
        for (const value of [0, -1, 1.5, 2_147_483_648]) {
            expect(() => AuthService.createGitlabPatVerifier({
                aiConfig         : withAuth({patValidationTimeoutMs: value}),
                logger,
                InvalidTokenError: FakeInvalidTokenError
            })).toThrow('AuthService: auth.patValidationTimeoutMs must be an integer from 1 to 2147483647')
        }
    });

    test('maps a GitLab /user 200 to the RequestContextService identity shape', async () => {
        let calledUrl, calledHeaders, calledSignal;

        globalThis.fetch = async (url, opts) => {
            calledUrl     = url;
            calledHeaders = opts?.headers;
            calledSignal  = opts?.signal;
            return {ok: true, json: async () => ({id: 42, username: 'octocat', name: 'The Octocat'})};
        };

        const verifier = AuthService.createGitlabPatVerifier({aiConfig, logger, InvalidTokenError: FakeInvalidTokenError}),
              info     = await verifier.verifyAccessToken('glpat-abc');

        // Trailing slash on the configured base URL is trimmed before appending the API path.
        expect(calledUrl).toBe('https://gitlab.example.com/api/v4/user');
        expect(calledHeaders.Authorization).toBe('Bearer glpat-abc');
        expect(calledSignal).toBeInstanceOf(AbortSignal);
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
        expect(calls[0].signal).toBe(calls[1].signal); // One wall-clock deadline across both fetches.
        expect(info.userId).toBe('neo-gpt');          // Memory Core tenant identity remains GitLab username.
        expect(info.username).toBe('Neo GPT');
        expect(info.clientId).toBe('mcp-oauth-app');
        expect(info.scopes).toEqual(['read_user', 'api']);
        expect(logEntries.join('\n')).not.toContain('secret-token-value');
    });

    test('times out the full GitLab sequence and does not cache the failure', async () => {
        const
            signals = [],
            urls    = [];

        let calls = 0;

        globalThis.fetch = async (url, {signal} = {}) => {
            signals.push(signal);
            urls.push(String(url));
            calls++;

            if (calls === 1 || calls === 3) {
                return {ok: true, json: async () => ({username: 'neo-gpt'})}
            }

            if (calls === 2) {
                return new Promise((_, reject) => {
                    if (signal.aborted) {
                        reject(signal.reason);
                        return
                    }

                    signal.addEventListener('abort', () => reject(signal.reason), {once: true})
                })
            }

            return {ok: true, json: async () => ({application: {uid: 'mcp-oauth-app'}})}
        };

        const verifier = AuthService.createGitlabPatVerifier({
            aiConfig         : withAuth({allowedClientIds: ['mcp-oauth-app'], patValidationTimeoutMs: 10}),
            logger,
            InvalidTokenError: FakeInvalidTokenError
        });

        await expect(verifier.verifyAccessToken('glpat-timeout'))
            .rejects.toThrow('GitLab PAT validation timed out after 10ms');
        expect(calls).toBe(2);
        expect(signals[0]).toBe(signals[1]);
        expect(urls).toEqual([
            'https://gitlab.example.com/api/v4/user',
            'https://gitlab.example.com/oauth/token/info'
        ]);

        const info = await verifier.verifyAccessToken('glpat-timeout');

        expect(info.userId).toBe('neo-gpt');
        expect(calls).toBe(4); // Timeout was not cached; both upstream calls run again.
        expect(signals[2]).toBe(signals[3]);
        expect(signals[2]).not.toBe(signals[0]);
        expect(urls.slice(2)).toEqual([
            'https://gitlab.example.com/api/v4/user',
            'https://gitlab.example.com/oauth/token/info'
        ])
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
            aiConfig         : {auth: {
                gitlabApiBaseUrl      : 'https://gitlab.example.com',
                patCacheTtlSeconds    : 0,
                patValidationTimeoutMs: 5000
            }},
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
    const aiConfig = {auth: {
        mode                  : 'gitlab-pat',
        gitlabApiBaseUrl      : 'https://gitlab.example.com',
        patCacheTtlSeconds    : 300,
        patValidationTimeoutMs: 5000
    }};

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

/**
 * Unit coverage for the GitHub-PAT verifier in `AuthService`, mirroring the GitLab-PAT describe
 * above. `globalThis.fetch` is stubbed so no live GitHub call is made — covering the identity
 * mapping, the GitHub request contract (User-Agent / Accept / X-GitHub-Api-Version headers),
 * `x-oauth-scopes` scope extraction (classic PAT) vs its absence (fine-grained PAT), the
 * allowlist gate, the GHES base-url override, the success cache, the TTL boundary, and the
 * one-budget upstream deadline.
 */
test.describe('Neo.ai.mcp.server.shared.services.AuthService — GitHub-PAT verifier', () => {
    let AuthService;
    let originalFetch;

    class FakeInvalidTokenError extends Error {}

    const logger   = {info: () => {}, warn: () => {}, error: () => {}};
    const aiConfig = {
        auth: {
            githubApiBaseUrl      : 'https://github.example.com/',
            patCacheTtlSeconds    : 300,
            patValidationTimeoutMs: 5000
        }
    };

    function withAuth(overrides) {
        return {auth: {...aiConfig.auth, ...overrides}}
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

    test('fails fast on an invalid GitHub PAT validation deadline', () => {
        expect(() => AuthService.createGithubPatVerifier({
            aiConfig         : withAuth({patValidationTimeoutMs: 0}),
            logger,
            InvalidTokenError: FakeInvalidTokenError
        })).toThrow('AuthService: auth.patValidationTimeoutMs must be an integer from 1 to 2147483647')
    });

    test('maps a GitHub /user 200 to the identity shape, with the GitHub request contract honored', async () => {
        let calledUrl, calledHeaders, calledSignal;

        globalThis.fetch = async (url, opts) => {
            calledUrl     = url;
            calledHeaders = opts?.headers;
            calledSignal  = opts?.signal;
            return {
                ok     : true,
                headers: {get: name => name === 'x-oauth-scopes' ? 'repo, read:user' : null},
                json   : async () => ({id: 42, login: 'octocat', name: 'The Octocat'})
            };
        };

        const verifier = AuthService.createGithubPatVerifier({aiConfig, logger, InvalidTokenError: FakeInvalidTokenError}),
              info     = await verifier.verifyAccessToken('ghp_abc');

        // Trailing slash on the configured base URL is trimmed before appending the API path.
        expect(calledUrl).toBe('https://github.example.com/user');
        expect(calledHeaders.Authorization).toBe('Bearer ghp_abc');
        expect(calledSignal).toBeInstanceOf(AbortSignal);
        // GitHub rejects UA-less requests with 403; the version header pins the REST contract.
        expect(calledHeaders['User-Agent']).toBeTruthy();
        expect(calledHeaders.Accept).toBe('application/vnd.github+json');
        expect(calledHeaders['X-GitHub-Api-Version']).toBe('2022-11-28');
        expect(info.userId).toBe('octocat');
        expect(info.username).toBe('The Octocat');
        expect(info.source).toBe('github-pat');
        expect(info.authProvider).toBe('github');
        expect(info.authSource).toBe('github-pat');
        expect(info.providerBaseUrl).toBe('https://github.example.com');
        expect(info.providerUserId).toBe('42');
        expect(info.providerUsername).toBe('octocat');
        expect(info.providerDisplayName).toBe('The Octocat');
        // Classic PATs echo granted scopes in x-oauth-scopes.
        expect(info.scopes).toEqual(['repo', 'read:user']);
        expect(typeof info.expiresAt).toBe('number');
        expect(info.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    test('times out a hung GitHub validation and revalidates on the next request', async () => {
        const urls  = [];
        let   calls = 0;

        globalThis.fetch = async (url, {signal} = {}) => {
            urls.push(String(url));
            calls++;

            if (calls === 1) {
                return new Promise((_, reject) => {
                    if (signal.aborted) {
                        reject(signal.reason);
                        return
                    }

                    signal.addEventListener('abort', () => reject(signal.reason), {once: true})
                })
            }

            return {ok: true, json: async () => ({login: 'octocat'})}
        };

        const verifier = AuthService.createGithubPatVerifier({
            aiConfig         : withAuth({patValidationTimeoutMs: 10}),
            logger,
            InvalidTokenError: FakeInvalidTokenError
        });

        await expect(verifier.verifyAccessToken('ghp-timeout'))
            .rejects.toThrow('GitHub PAT validation timed out after 10ms');

        const info = await verifier.verifyAccessToken('ghp-timeout');

        expect(info.userId).toBe('octocat');
        expect(calls).toBe(2); // Timeout was not cached.
        expect(urls).toEqual([
            'https://github.example.com/user',
            'https://github.example.com/user'
        ])
    });

    test('falls back to login and empty scopes when name and x-oauth-scopes are absent (fine-grained PAT)', async () => {
        globalThis.fetch = async () => ({ok: true, json: async () => ({id: 9, login: 'fine-grained-bot', name: null})});

        const verifier = AuthService.createGithubPatVerifier({aiConfig, logger, InvalidTokenError: FakeInvalidTokenError}),
              info     = await verifier.verifyAccessToken('github_pat_x');

        expect(info.username).toBe('fine-grained-bot');
        expect(info.userId).toBe('fine-grained-bot');
        expect(info.providerDisplayName).toBe('fine-grained-bot');
        expect(info.scopes).toEqual([]);
    });

    test('allows a configured GitHub login and rejects an unlisted user without caching the failure', async () => {
        let calls = 0;

        globalThis.fetch = async () => {
            calls++;
            return {ok: true, json: async () => ({login: calls < 3 ? 'outsider' : 'neo-kimi-phoebe'})}
        };

        const verifier = AuthService.createGithubPatVerifier({
            aiConfig         : withAuth({allowedUsers: ['neo-kimi-phoebe']}),
            logger,
            InvalidTokenError: FakeInvalidTokenError
        });

        await expect(verifier.verifyAccessToken('ghp-outsider')).rejects.toThrow('GitHub user is not allowed');
        // The failure is not cached: a later correction on the allowlist/retry path re-fetches.
        await expect(verifier.verifyAccessToken('ghp-outsider')).rejects.toThrow('GitHub user is not allowed');
        const info = await verifier.verifyAccessToken('ghp-outsider');

        expect(calls).toBe(3);
        expect(info.userId).toBe('neo-kimi-phoebe');
    });

    test('rejects a non-OK GitHub response and does not cache the failure', async () => {
        let calls = 0;

        globalThis.fetch = async () => {
            calls++;
            return calls === 1
                ? {ok: false, status: 401, json: async () => ({})}
                : {ok: true, json: async () => ({login: 'octocat'})}
        };

        const verifier = AuthService.createGithubPatVerifier({aiConfig, logger, InvalidTokenError: FakeInvalidTokenError});

        await expect(verifier.verifyAccessToken('ghp-bad')).rejects.toThrow('GitHub PAT validation failed (HTTP 401)');
        const info = await verifier.verifyAccessToken('ghp-bad');

        expect(calls).toBe(2);
        expect(info.userId).toBe('octocat');
    });

    test('caches a successful validation per token and re-validates past the TTL window', async () => {
        let calls = 0;

        globalThis.fetch = async () => {
            calls++;
            return {ok: true, json: async () => ({login: 'octocat'})}
        };

        const cachedVerifier = AuthService.createGithubPatVerifier({aiConfig, logger, InvalidTokenError: FakeInvalidTokenError});

        await cachedVerifier.verifyAccessToken('ghp-cached');
        await cachedVerifier.verifyAccessToken('ghp-cached');
        expect(calls).toBe(1);

        const noCacheVerifier = AuthService.createGithubPatVerifier({
            aiConfig         : withAuth({patCacheTtlSeconds: 0}),
            logger,
            InvalidTokenError: FakeInvalidTokenError
        });

        await noCacheVerifier.verifyAccessToken('ghp-uncached');
        await noCacheVerifier.verifyAccessToken('ghp-uncached');
        // TTL 0: expiresAt = now + 0 is never strictly greater than a later Date.now() → re-fetch.
        expect(calls).toBe(3);
    });
});

/**
 * @summary Consumed-boundary coverage: drives the GitHub-PAT verifier through the REAL SDK
 * `requireBearerAuth` middleware (installed by `setupGithubPat`), not in isolation — the same
 * boundary discipline as the GitLab-PAT describe above (SDK AuthInfo contract + naked-401 shape).
 */
test.describe('Neo.ai.mcp.server.shared.services.AuthService — GitHub-PAT middleware boundary', () => {
    let AuthService, requireBearerAuth, InvalidTokenError, originalFetch;

    const logger   = {info: () => {}, warn: () => {}, error: () => {}};
    const aiConfig = {auth: {
        mode                  : 'github-pat',
        githubApiBaseUrl      : 'https://api.github.com',
        patCacheTtlSeconds    : 300,
        patValidationTimeoutMs: 5000
    }};

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

    // Installs the REAL SDK requireBearerAuth via setupGithubPat; returns the captured middleware.
    // The single-middleware assertion also confirms the naked-401 shape (no mcpAuthMetadataRouter).
    function installPatMiddleware(config = aiConfig) {
        const middlewares = [],
              app         = {use: mw => middlewares.push(mw)};

        AuthService.setupGithubPat({app, aiConfig: config, logger}, {requireBearerAuth, InvalidTokenError});

        expect(middlewares.length).toBe(1);
        return middlewares[0];
    }

    test('a valid GitHub PAT passes requireBearerAuth → next() called + req.auth populated', async () => {
        globalThis.fetch = async () => ({ok: true, json: async () => ({id: 7, login: 'octocat', name: 'The Octocat'})});

        const mw  = installPatMiddleware(),
              req = mockReq('Bearer ghp-valid'),
              res = mockRes();

        let nextErr = 'unset';
        await mw(req, res, err => { nextErr = err; });

        expect(nextErr).toBeUndefined();                     // next() invoked with no error
        expect(res.ended).toBe(false);                       // no 401 short-circuit
        expect(req.auth?.userId).toBe('octocat');
        expect(req.auth?.source).toBe('github-pat');
        expect(req.auth?.authProvider).toBe('github');
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

    test('an invalid PAT (GitHub 401) is rejected — next() not called', async () => {
        globalThis.fetch = async () => ({ok: false, status: 401, json: async () => ({})});

        const mw  = installPatMiddleware(),
              req = mockReq('Bearer ghp-bad'),
              res = mockRes();

        let nextCalled = false;
        await mw(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
    });

    test('allowedUsers gate passes through real requireBearerAuth with GitHub login identity intact', async () => {
        globalThis.fetch = async () => ({ok: true, json: async () => ({login: 'neo-kimi-phoebe', name: 'Phoebe'})});

        const mw  = installPatMiddleware({auth: {...aiConfig.auth, allowedUsers: ['neo-kimi-phoebe']}}),
              req = mockReq('Bearer ghp-valid'),
              res = mockRes();

        let nextErr = 'unset';
        await mw(req, res, err => { nextErr = err; });

        expect(nextErr).toBeUndefined();
        expect(res.ended).toBe(false);
        expect(req.auth?.userId).toBe('neo-kimi-phoebe');
        expect(req.auth?.username).toBe('Phoebe');
    });

    test('allowedUsers gate rejects an unlisted user through real requireBearerAuth', async () => {
        globalThis.fetch = async () => ({ok: true, json: async () => ({login: 'outsider'})});

        const mw  = installPatMiddleware({auth: {...aiConfig.auth, allowedUsers: ['neo-kimi-phoebe']}}),
              req = mockReq('Bearer ghp-outsider'),
              res = mockRes();

        let nextCalled = false;
        await mw(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
    });
});

/**
 * @summary Consumed-boundary coverage for the possession-only local-bearer strategy.
 *
 * Drives the verifier through the real SDK middleware so header parsing, AuthInfo expiry, strict
 * token shape, identity absence, and token non-observability are proven at the consumed seam.
 */
test.describe('Neo.ai.mcp.server.shared.services.AuthService — local-bearer middleware boundary', () => {
    let AuthService, generateLocalBearerToken, requireBearerAuth, InvalidTokenError;

    function mockReq(authHeader) {
        const headers = authHeader === undefined ? {} : {authorization: authHeader};

        return {headers, get(name) { return headers[String(name).toLowerCase()]; }}
    }

    function mockRes() {
        return {
            statusCode: 200,
            headers   : {},
            body      : undefined,
            ended     : false,
            status(code) { this.statusCode = code; return this; },
            set(field, value) {
                if (field && typeof field === 'object') {
                    Object.entries(field).forEach(([key, item]) => {
                        this.headers[String(key).toLowerCase()] = item
                    })
                } else {
                    this.headers[String(field).toLowerCase()] = value
                }
                return this
            },
            json(payload) { this.body = payload; this.ended = true; return this; }
        }
    }

    function installLocalMiddleware(token, logEntries = []) {
        const
            middlewares = [],
            app         = {use: middleware => middlewares.push(middleware)},
            aiConfig    = {auth: {mode: 'local-bearer', localBearerToken: token}},
            logger      = {info: message => logEntries.push(String(message))};

        AuthService.setupLocalBearer({app, aiConfig, logger}, {requireBearerAuth, InvalidTokenError});

        expect(middlewares).toHaveLength(1);
        return middlewares[0]
    }

    test.beforeAll(async () => {
        AuthService             = (await import('../../../../../../../ai/mcp/server/shared/services/AuthService.mjs')).default;
        generateLocalBearerToken = (await import('../../../../../../../ai/mcp/server/shared/helpers/localBearer.mjs')).generateLocalBearerToken;
        requireBearerAuth       = (await import('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js')).requireBearerAuth;
        InvalidTokenError       = (await import('@modelcontextprotocol/sdk/server/auth/errors.js')).InvalidTokenError;
    });

    test('a valid token passes with possession metadata and no resolved identity', async () => {
        const
            token      = generateLocalBearerToken(),
            logEntries = [],
            middleware = installLocalMiddleware(token, logEntries),
            req        = mockReq(`Bearer ${token}`),
            res        = mockRes();

        let nextError = 'unset';
        await middleware(req, res, error => { nextError = error; });

        expect(nextError).toBeUndefined();
        expect(res.ended).toBe(false);
        expect(req.auth).toMatchObject({
            clientId : 'neo-local-bearer',
            scopes   : [],
            expiresAt: Number.MAX_SAFE_INTEGER,
            source   : 'local-bearer'
        });
        expect(req.auth).not.toHaveProperty('userId');
        expect(req.auth).not.toHaveProperty('username');
        expect(logEntries.join('\n')).not.toContain(token);
    });

    test('missing headers, malformed schemes, and length mismatches fail through the SDK boundary', async () => {
        const
            token      = generateLocalBearerToken(),
            middleware = installLocalMiddleware(token);

        for (const authHeader of [undefined, `Basic ${token}`, 'Bearer short']) {
            const req = mockReq(authHeader),
                  res = mockRes();
            let nextCalled = false;

            await middleware(req, res, () => { nextCalled = true; });

            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(401);
        }
    });

    test('a different canonical token fails without exposing either credential', async () => {
        const
            configuredToken = generateLocalBearerToken(),
            presentedToken  = generateLocalBearerToken(),
            logEntries      = [],
            middleware      = installLocalMiddleware(configuredToken, logEntries),
            req             = mockReq(`Bearer ${presentedToken}`),
            res             = mockRes();

        let nextCalled = false;
        await middleware(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
        expect(String(res.body?.error_description || res.body?.error || '')).not.toContain(configuredToken);
        expect(String(res.body?.error_description || res.body?.error || '')).not.toContain(presentedToken);
        expect(logEntries.join('\n')).not.toContain(configuredToken);
        expect(logEntries.join('\n')).not.toContain(presentedToken);
    });

    test('startup rejects missing, padded, and non-32-byte configured credentials', () => {
        const token = generateLocalBearerToken();

        for (const invalidToken of ['', `${token}=`, 'short']) {
            expect(() => installLocalMiddleware(invalidToken)).toThrow(/canonical 32-byte unpadded-base64url token/)
        }
    });
});
