import {setup} from '../../../../setup.mjs';

const appName = 'GitLabClientTest';
setup({neoConfig: {unitTestMode: true}, appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * Unit coverage for the GitLab GraphQL client. Mocks global `fetch` and uses the
 * `authTokenOverride` config so no shared AiConfig mutation occurs (the gitlab host defaults to
 * gitlab.com in a clean unit env). Mirrors the github-workflow GraphqlService test pattern.
 */
let GitLabClient, originalFetch, originalAuthOverride, originalRetryBaseDelay, originalRetryMaxDelay;

test.beforeAll(async () => {
    GitLabClient           = (await import('../../../../../../ai/services/gitlab-workflow/GitLabClient.mjs')).default;
    originalAuthOverride   = GitLabClient.authTokenOverride;
    originalRetryBaseDelay = GitLabClient.retryBaseDelayMs;
    originalRetryMaxDelay  = GitLabClient.retryMaxDelayMs;
});

test.beforeEach(() => {
    originalFetch                  = globalThis.fetch;
    GitLabClient.authTokenOverride = 'test-pat'; // authenticated by default for the positive tests
});

test.afterEach(() => {
    globalThis.fetch               = originalFetch;
    GitLabClient.authTokenOverride = originalAuthOverride;
    GitLabClient.retryBaseDelayMs  = originalRetryBaseDelay;
    GitLabClient.retryMaxDelayMs   = originalRetryMaxDelay;
});

// Minimal Response-like stub. `json` is the parsed GraphQL envelope ({data} / {errors} / both).
const response = ({ok = true, status = 200, statusText = 'OK', json = {}} = {}) => ({
    ok, status, statusText,
    headers: {get: () => null},
    json   : async () => json
});

test.describe('Neo.ai.services.gitlab-workflow.GitLabClient', () => {
    test('posts to ${hostUrl}/api/graphql with Bearer PAT and returns data (#12624)', async () => {
        let captured;
        globalThis.fetch = async (url, init) => {
            captured = {url, init};
            return response({json: {data: {project: {id: 'gid://gitlab/Project/1'}}}});
        };

        const data = await GitLabClient.query('query { project { id } }', {fullPath: 'group/proj'});

        expect(data).toEqual({project: {id: 'gid://gitlab/Project/1'}});
        expect(captured.url).toMatch(/\/api\/graphql$/);
        expect(captured.init.method).toBe('POST');
        expect(captured.init.headers['Authorization']).toBe('Bearer test-pat');
        expect(captured.init.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(captured.init.body)).toEqual({query: 'query { project { id } }', variables: {fullPath: 'group/proj'}});
    });

    test('retries on a transient 5xx then succeeds (#12624)', async () => {
        GitLabClient.retryBaseDelayMs = 0;
        GitLabClient.retryMaxDelayMs  = 0;

        let calls = 0;
        globalThis.fetch = async () => {
            calls++;
            return calls === 1
                ? response({ok: false, status: 503, statusText: 'Service Unavailable'})
                : response({json: {data: {project: {id: 'gid://gitlab/Project/1'}}}});
        };

        const data = await GitLabClient.query('query { project { id } }');

        expect(calls).toBe(2);
        expect(data).toEqual({project: {id: 'gid://gitlab/Project/1'}});
    });

    test('throws on GraphQL errors in strict mode (#12624)', async () => {
        globalThis.fetch = async () => response({json: {errors: [{message: 'boom'}]}});

        await expect(GitLabClient.query('mutation { x }')).rejects.toThrow(/GitLab API error: boom/);
    });

    test('returns partial data alongside errors in non-strict mode (#12624)', async () => {
        globalThis.fetch = async () => response({json: {data: {project: {id: '1'}}, errors: [{message: 'partial'}]}});

        const result = await GitLabClient.query('query { project { id } }', {}, {strict: false});

        expect(result).toEqual({data: {project: {id: '1'}}, errors: [{message: 'partial'}]});
    });

    test('throws a clear auth error when no PAT is configured (#12624)', async () => {
        GitLabClient.authTokenOverride = null; // and a clean unit env has no NEO_GITLAB_PAT
        globalThis.fetch = async () => response({json: {data: {}}}); // must never be reached

        await expect(GitLabClient.query('query { project { id } }')).rejects.toThrow(/Could not authenticate with GitLab/);
    });
});
