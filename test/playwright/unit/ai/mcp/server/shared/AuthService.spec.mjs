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
        expect(info.scopes).toEqual([]);
    });

    test('falls back to username when GitLab returns no name field', async () => {
        globalThis.fetch = async () => ({ok: true, json: async () => ({username: 'anon'})});

        const verifier = AuthService.createGitlabPatVerifier({aiConfig, logger, InvalidTokenError: FakeInvalidTokenError}),
              info     = await verifier.verifyAccessToken('glpat-x');

        expect(info.username).toBe('anon');
        expect(info.userId).toBe('anon');
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

        expect(calls).toBe(1);
        expect(second.userId).toBe('cached-user');
        expect(second).toBe(first);

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
