import {setup} from '../../../../setup.mjs';

const appName = 'GraphqlServiceTest';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary Contract coverage for `GraphqlService.query` transient GitHub retry behavior.
 *
 * GitHub's GraphQL edge can return transient `502`/`503`/`504` gateway failures or
 * terminate a fetch mid-flight. The GitHub Workflow sync pipeline is long-running,
 * so a single transient response must not abort the entire run without a bounded retry.
 */
test.describe('Neo.ai.services.github-workflow.GraphqlService — transient retry (#11585)', () => {
    let GraphqlService;
    let originalFetch;
    let originalAuthTokenOverride;
    let originalMaxRetryAttempts;
    let originalRetryBaseDelayMs;
    let originalRetryMaxDelayMs;
    let originalRetryJitterRatio;

    const QUERY = 'query TestQuery { viewer { login } }';

    test.beforeAll(async () => {
        GraphqlService = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
    });

    test.beforeEach(() => {
        originalFetch              = globalThis.fetch;
        originalAuthTokenOverride  = GraphqlService.authTokenOverride;
        originalMaxRetryAttempts   = GraphqlService.maxRetryAttempts;
        originalRetryBaseDelayMs   = GraphqlService.retryBaseDelayMs;
        originalRetryMaxDelayMs    = GraphqlService.retryMaxDelayMs;
        originalRetryJitterRatio   = GraphqlService.retryJitterRatio;

        GraphqlService.authTokenOverride  = 'unit-test-token';
        GraphqlService.maxRetryAttempts = 2;
        GraphqlService.retryBaseDelayMs = 0;
        GraphqlService.retryMaxDelayMs  = 0;
        GraphqlService.retryJitterRatio = 0;
    });

    test.afterEach(() => {
        globalThis.fetch = originalFetch;

        GraphqlService.authTokenOverride  = originalAuthTokenOverride;
        GraphqlService.maxRetryAttempts = originalMaxRetryAttempts;
        GraphqlService.retryBaseDelayMs = originalRetryBaseDelayMs;
        GraphqlService.retryMaxDelayMs  = originalRetryMaxDelayMs;
        GraphqlService.retryJitterRatio = originalRetryJitterRatio;
    });

    test('retries a transient 504 response and returns the eventual data', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;

            if (callCount === 1) {
                return new Response('', {status: 504, statusText: 'Gateway Timeout'});
            }

            return new Response(JSON.stringify({data: {viewer: {login: 'neo-gpt'}}}), {
                status : 200,
                headers: {'content-type': 'application/json'}
            });
        };

        const result = await GraphqlService.query(QUERY);

        expect(result).toEqual({viewer: {login: 'neo-gpt'}});
        expect(callCount).toBe(2);
    });

    test('retries a transient fetch failure and returns the eventual data', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;

            if (callCount === 1) {
                const error = new TypeError('fetch failed');
                error.cause = {message: 'terminated'};
                throw error;
            }

            return new Response(JSON.stringify({data: {ok: true}}), {
                status : 200,
                headers: {'content-type': 'application/json'}
            });
        };

        const result = await GraphqlService.query(QUERY);

        expect(result).toEqual({ok: true});
        expect(callCount).toBe(2);
    });

    test('fails after the retry budget is exhausted', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;
            return new Response('', {status: 504, statusText: 'Gateway Timeout'});
        };

        await expect(GraphqlService.query(QUERY)).rejects.toThrow('GitHub API request failed: 504 Gateway Timeout');
        expect(callCount).toBe(3);
    });

    test('does not retry non-transient 400 responses', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;
            return new Response('', {status: 400, statusText: 'Bad Request'});
        };

        await expect(GraphqlService.query(QUERY)).rejects.toThrow('GitHub API request failed: 400 Bad Request');
        expect(callCount).toBe(1);
    });

    test('does not retry semantic GraphQL errors in a 200 response', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;
            return new Response(JSON.stringify({errors: [{message: 'Field does not exist'}]}), {
                status : 200,
                headers: {'content-type': 'application/json'}
            });
        };

        await expect(GraphqlService.query(QUERY)).rejects.toThrow('GitHub API error: Field does not exist');
        expect(callCount).toBe(1);
    });

    test('strict mode throws when GraphQL errors include partial data (#10096)', async () => {
        globalThis.fetch = async () => new Response(JSON.stringify({
            data: {
                repository: {
                    issue42: {number: 42},
                    issue43: null
                }
            },
            errors: [{message: 'Could not resolve to an Issue with the number of 43'}]
        }), {
            status : 200,
            headers: {'content-type': 'application/json'}
        });

        await expect(GraphqlService.query(QUERY)).rejects.toThrow(
            'GitHub API error: Could not resolve to an Issue with the number of 43'
        );
    });

    test('non-strict mode returns partial data with GraphQL errors (#10096)', async () => {
        const errors = [{message: 'Could not resolve to an Issue with the number of 43'}];
        const data   = {
            repository: {
                issue42: {number: 42},
                issue43: null
            }
        };

        globalThis.fetch = async () => new Response(JSON.stringify({data, errors}), {
            status : 200,
            headers: {'content-type': 'application/json'}
        });

        const result = await GraphqlService.query(QUERY, {}, {strict: false});

        expect(result).toEqual({data, errors});
    });

    test('non-strict mode throws when GraphQL errors have no usable data (#10096)', async () => {
        globalThis.fetch = async () => new Response(JSON.stringify({
            data  : {repository: null},
            errors: [{message: 'Could not resolve to a Repository'}]
        }), {
            status : 200,
            headers: {'content-type': 'application/json'}
        });

        await expect(GraphqlService.query(QUERY, {}, {strict: false}))
            .rejects.toThrow('GitHub API error: Could not resolve to a Repository');
    });

    test('legacy boolean option still enables the sub-issues header (#10096)', async () => {
        let featureHeader;

        globalThis.fetch = async (url, options) => {
            featureHeader = options.headers['GraphQL-Features'];

            return new Response(JSON.stringify({data: {ok: true}}), {
                status : 200,
                headers: {'content-type': 'application/json'}
            });
        };

        const result = await GraphqlService.query(QUERY, {}, true);

        expect(result).toEqual({ok: true});
        expect(featureHeader).toBe('sub_issues');
    });
});

/**
 * @summary Contract coverage for `GraphqlService.rest` — the authenticated REST path.
 *
 * `rest()` shares the cached `gh auth token` and the transient-retry machinery with `query()`,
 * but targets the REST base URL and returns the parsed JSON body (or `null` for `204`). These
 * tests pin request construction (method, `restApiUrl`-based URL, bearer auth, JSON body for
 * write methods), `204`→`null`, retry on transient status + network failure, and the
 * error-detail extraction for non-transient failures.
 */
test.describe('Neo.ai.services.github-workflow.GraphqlService — rest() authenticated REST path (#13352)', () => {
    let GraphqlService;
    let originalFetch;
    let originalAuthTokenOverride;
    let originalMaxRetryAttempts;
    let originalRetryBaseDelayMs;
    let originalRetryMaxDelayMs;
    let originalRetryJitterRatio;

    test.beforeAll(async () => {
        GraphqlService = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
    });

    test.beforeEach(() => {
        originalFetch             = globalThis.fetch;
        originalAuthTokenOverride = GraphqlService.authTokenOverride;
        originalMaxRetryAttempts  = GraphqlService.maxRetryAttempts;
        originalRetryBaseDelayMs  = GraphqlService.retryBaseDelayMs;
        originalRetryMaxDelayMs   = GraphqlService.retryMaxDelayMs;
        originalRetryJitterRatio  = GraphqlService.retryJitterRatio;

        GraphqlService.authTokenOverride = 'unit-test-token';
        GraphqlService.maxRetryAttempts  = 2;
        GraphqlService.retryBaseDelayMs  = 0;
        GraphqlService.retryMaxDelayMs   = 0;
        GraphqlService.retryJitterRatio  = 0;
    });

    test.afterEach(() => {
        globalThis.fetch = originalFetch;

        GraphqlService.authTokenOverride = originalAuthTokenOverride;
        GraphqlService.maxRetryAttempts  = originalMaxRetryAttempts;
        GraphqlService.retryBaseDelayMs  = originalRetryBaseDelayMs;
        GraphqlService.retryMaxDelayMs   = originalRetryMaxDelayMs;
        GraphqlService.retryJitterRatio  = originalRetryJitterRatio;
    });

    test('POSTs to the REST base URL with bearer auth + JSON body and returns parsed data', async () => {
        let captured;

        globalThis.fetch = async (url, options) => {
            captured = {url, options};
            return new Response(JSON.stringify({number: 13999, html_url: 'https://github.com/o/r/issues/13999'}), {
                status : 201,
                headers: {'content-type': 'application/json'}
            });
        };

        const result = await GraphqlService.rest('POST', '/repos/o/r/issues', {title: 'Hi'});

        expect(captured.url).toBe('https://api.github.com/repos/o/r/issues');
        expect(captured.options.method).toBe('POST');
        expect(captured.options.headers.Authorization).toBe('bearer unit-test-token');
        expect(captured.options.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(captured.options.body)).toEqual({title: 'Hi'});
        expect(result).toEqual({number: 13999, html_url: 'https://github.com/o/r/issues/13999'});
    });

    test('returns null for a 204 No Content response', async () => {
        globalThis.fetch = async () => new Response(null, {status: 204, statusText: 'No Content'});

        const result = await GraphqlService.rest('DELETE', '/repos/o/r/issues/1/assignees', {assignees: ['x']});

        expect(result).toBeNull();
    });

    test('omits the request body + Content-Type header for bodyless calls', async () => {
        let captured;

        globalThis.fetch = async (url, options) => {
            captured = options;
            return new Response(JSON.stringify({ok: true}), {status: 200, headers: {'content-type': 'application/json'}});
        };

        await GraphqlService.rest('GET', '/repos/o/r');

        expect(captured.body).toBeUndefined();
        expect(captured.headers['Content-Type']).toBeUndefined();
    });

    test('retries a transient 503 response and returns the eventual data', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;

            if (callCount === 1) {
                return new Response('', {status: 503, statusText: 'Service Unavailable'});
            }

            return new Response(JSON.stringify({number: 1}), {status: 201, headers: {'content-type': 'application/json'}});
        };

        const result = await GraphqlService.rest('POST', '/repos/o/r/issues', {title: 'x'});

        expect(result).toEqual({number: 1});
        expect(callCount).toBe(2);
    });

    test('retries a transient fetch failure and returns the eventual data', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;

            if (callCount === 1) {
                const error = new TypeError('fetch failed');
                error.cause = {message: 'terminated'};
                throw error;
            }

            return new Response(JSON.stringify({number: 2}), {status: 201, headers: {'content-type': 'application/json'}});
        };

        const result = await GraphqlService.rest('POST', '/repos/o/r/issues', {title: 'y'});

        expect(result).toEqual({number: 2});
        expect(callCount).toBe(2);
    });

    test('throws with the GitHub error detail on a non-transient 422 (no retry)', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;
            return new Response(JSON.stringify({message: 'Validation Failed'}), {
                status    : 422,
                statusText: 'Unprocessable Entity',
                headers   : {'content-type': 'application/json'}
            });
        };

        await expect(GraphqlService.rest('POST', '/repos/o/r/issues', {title: 'z'}))
            .rejects.toThrow('GitHub REST request failed: POST /repos/o/r/issues -> 422 Unprocessable Entity - Validation Failed');
        expect(callCount).toBe(1);
    });
});
