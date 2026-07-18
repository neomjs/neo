import {setup} from '../../../setup.mjs';

const appName = 'DevIndexGitHubServiceTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import GitHub         from '../../../../../apps/devindex/services/GitHub.mjs';

test.describe('DevIndex GitHub service', () => {
    let originalRest;
    let originalFetch;
    let originalGhToken;
    let restClient;

    const jsonResponse = (data, init={}) => {
        const {headers={}, ...responseInit} = init;

        return new Response(JSON.stringify(data), {
            status    : 200,
            statusText: 'OK',
            ...responseInit,
            headers   : {
                'content-type'         : 'application/json',
                'x-ratelimit-resource' : 'core',
                'x-ratelimit-remaining': '4999',
                ...headers
            }
        });
    };

    test.beforeEach(() => {
        originalRest                      = GitHub.rest;
        originalFetch                     = globalThis.fetch;
        originalGhToken                   = process.env.GH_TOKEN;

        process.env.GH_TOKEN                    = 'devindex-unit-test-token';
        restClient                              = new GitHub.constructor();
        restClient.restMaxRetryAttempts         = 2;
        restClient.restRetryBaseDelayMs         = 0;
        restClient.restRetryMaxDelayMs          = 0;
        restClient.restRetryJitterRatio         = 0;
        restClient.restRetryableHttpStatuses    = [429, 502, 503, 504]
    });

    test.afterEach(() => {
        GitHub.rest                         = originalRest;
        globalThis.fetch                    = originalFetch;

        if (originalGhToken === undefined) {
            delete process.env.GH_TOKEN
        } else {
            process.env.GH_TOKEN = originalGhToken
        }
    });

    test('getLoginByDatabaseId resolves the current login via REST account id lookup', async () => {
        let requestedEndpoint;
        let requestedContext;

        GitHub.rest = async (endpoint, logContext) => {
            requestedEndpoint = endpoint;
            requestedContext  = logContext;

            return {
                id   : 95193764,
                login: 'alleneubank',
                type : 'User'
            };
        };

        const login = await GitHub.getLoginByDatabaseId(95193764);

        expect(login).toBe('alleneubank');
        expect(requestedEndpoint).toBe('user/95193764');
        expect(requestedContext).toBe('DB_ID:95193764');
    });

    test('getLoginByDatabaseId returns null when GitHub cannot resolve the account id', async () => {
        GitHub.rest = async () => {
            throw new Error('REST Error: 404 Not Found');
        };

        await expect(GitHub.getLoginByDatabaseId(123)).resolves.toBeNull();
    });

    test('getLoginByDatabaseId rethrows transient REST failures', async () => {
        GitHub.rest = async () => {
            throw new Error('REST Error: 502 Bad Gateway');
        };

        await expect(GitHub.getLoginByDatabaseId(123)).rejects.toThrow('REST Error: 502 Bad Gateway');
    });

    test('rest retries a transient 503 and updates rate-limit state before the next attempt', async () => {
        let callCount = 0;
        let remainingBeforeSecondAttempt;

        globalThis.fetch = async () => {
            callCount++;

            if (callCount === 1) {
                return new Response('', {
                    status    : 503,
                    statusText: 'Service Unavailable',
                    headers   : {
                        'x-ratelimit-resource' : 'core',
                        'x-ratelimit-remaining': '321'
                    }
                });
            }

            remainingBeforeSecondAttempt = restClient.rateLimit.core.remaining;
            return jsonResponse({login: 'dregitsky'});
        };

        await expect(restClient.rest('user/5704244')).resolves.toEqual({login: 'dregitsky'});
        expect(callCount).toBe(2);
        expect(remainingBeforeSecondAttempt).toBe(321);
    });

    test('rest retries a recognized network failure and returns the eventual response', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;

            if (callCount === 1) {
                const error = new TypeError('request aborted');
                error.cause = {code: 'ECONNRESET'};
                throw error;
            }

            return jsonResponse({ok: true});
        };

        await expect(restClient.rest('meta')).resolves.toEqual({ok: true});
        expect(callCount).toBe(2);
    });

    test('rest retries a recognized transport failure while consuming a successful response body', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;

            if (callCount === 1) {
                return new Response(new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode('{"ok":'));
                        controller.error(new TypeError('terminated'));
                    }
                }), {
                    status : 200,
                    headers: {'content-type': 'application/json'}
                });
            }

            return jsonResponse({ok: true});
        };

        await expect(restClient.rest('meta')).resolves.toEqual({ok: true});
        expect(callCount).toBe(2);
    });

    test('rest cancels a retryable HTTP response body before the next attempt', async () => {
        let bodyCancelled = false;
        let callCount     = 0;

        globalThis.fetch = async () => {
            callCount++;

            if (callCount === 1) {
                return new Response(new ReadableStream({
                    cancel() {
                        bodyCancelled = true;
                    }
                }), {status: 503, statusText: 'Service Unavailable'});
            }

            expect(bodyCancelled).toBe(true);
            return jsonResponse({ok: true});
        };

        await expect(restClient.rest('meta')).resolves.toEqual({ok: true});
        expect(callCount).toBe(2);
    });

    test('rest preserves the terminal HTTP error after exhausting the retry budget', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;
            return new Response('', {status: 503, statusText: 'Service Unavailable'});
        };

        await expect(restClient.rest('meta')).rejects.toThrow('REST Error: 503 Service Unavailable');
        expect(callCount).toBe(3);
    });

    test('rest preserves the original network error identity after exhaustion', async () => {
        const networkError = new TypeError('fetch failed');
        let   callCount    = 0;

        networkError.cause = {code: 'ECONNRESET'};
        globalThis.fetch = async () => {
            callCount++;
            throw networkError;
        };

        await expect(restClient.rest('meta')).rejects.toBe(networkError);
        expect(callCount).toBe(3);
    });

    test('rest fails fast for 404 and 403 responses', async () => {
        let callCount = 0;

        restClient.restRetryableHttpStatuses = [403, 404, 503];
        globalThis.fetch = async () => {
            callCount++;
            return new Response('', {status: 404, statusText: 'Not Found'});
        };

        await expect(restClient.rest('missing')).rejects.toThrow('REST Error: 404 Not Found');
        expect(callCount).toBe(1);

        callCount = 0;
        globalThis.fetch = async () => {
            callCount++;
            return new Response('', {status: 403, statusText: 'Forbidden'});
        };

        await expect(restClient.rest('forbidden')).rejects.toThrow('REST Error: 403 Forbidden');
        expect(callCount).toBe(1);
        expect(restClient.rateLimit.core.remaining).toBe(0);
    });

    test('rest honors an overridden retryable status set', async () => {
        let callCount = 0;

        restClient.restRetryableHttpStatuses = [418];
        globalThis.fetch = async () => {
            callCount++;

            if (callCount === 1) {
                return new Response('', {status: 418, statusText: "I'm a Teapot"});
            }

            return jsonResponse({ok: true});
        };

        await expect(restClient.rest('meta')).resolves.toEqual({ok: true});
        expect(callCount).toBe(2);
    });

    test('rest honors numeric and HTTP-date Retry-After values', async () => {
        const originalSetTimeout = globalThis.setTimeout;
        const originalDateNow    = Date.now;
        const delays             = [];
        const fixedNow           = Date.parse('2026-07-17T00:00:00Z');
        let   callCount          = 0;

        globalThis.setTimeout = (callback, delay) => {
            delays.push(delay);
            callback();
            return 0
        };
        Date.now = () => fixedNow;

        try {
            globalThis.fetch = async () => {
                callCount++;

                if (callCount === 1) {
                    return new Response('', {
                        status    : 503,
                        statusText: 'Service Unavailable',
                        headers   : {'retry-after': '2'}
                    });
                }

                if (callCount === 2) {
                    return new Response('', {
                        status    : 503,
                        statusText: 'Service Unavailable',
                        headers   : {'retry-after': new Date(fixedNow + 5000).toUTCString()}
                    });
                }

                return jsonResponse({ok: true});
            };

            await expect(restClient.rest('meta')).resolves.toEqual({ok: true});
            expect(delays).toEqual([2000, 5000]);
        } finally {
            globalThis.setTimeout = originalSetTimeout;
            Date.now              = originalDateNow
        }
    });

    test('rest caps exponential backoff after applying jitter', async () => {
        const originalSetTimeout = globalThis.setTimeout;
        const originalRandom     = Math.random;
        const delays             = [];
        let   callCount          = 0;

        restClient.restRetryBaseDelayMs = 100;
        restClient.restRetryMaxDelayMs  = 150;
        restClient.restRetryJitterRatio = 0.2;
        globalThis.setTimeout = (callback, delay) => {
            delays.push(delay);
            callback();
            return 0
        };
        Math.random = () => 1;

        try {
            globalThis.fetch = async () => {
                callCount++;

                if (callCount < 3) {
                    return new Response('', {status: 503, statusText: 'Service Unavailable'});
                }

                return jsonResponse({ok: true});
            };

            await expect(restClient.rest('meta')).resolves.toEqual({ok: true});
            expect(delays).toEqual([120, 150]);
        } finally {
            globalThis.setTimeout = originalSetTimeout;
            Math.random           = originalRandom
        }
    });

    test('rest does not retry JSON parse failures from successful responses', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;
            return new Response('{not-json', {
                status : 200,
                headers: {'content-type': 'application/json'}
            });
        };

        await expect(restClient.rest('meta')).rejects.toBeInstanceOf(SyntaxError);
        expect(callCount).toBe(1);
    });

    // ---- GraphQL query() transient-retry ----
    // The transport treated GitHub's intermittent `Resource not accessible by integration` (a 200-body
    // GraphQL error, transient despite its permissions wording) as fatal on attempt 1, though OptIn calls
    // query() with 3 retries. These pin the retry — and, per the AC, that it still gives up.

    test('query retries the transient "Resource not accessible by integration" body error, then succeeds', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;

            if (callCount === 1) {
                // GitHub returns this intermittently as a 200-body error for a query it otherwise permits.
                return jsonResponse({errors: [{message: 'Resource not accessible by integration'}]});
            }

            return jsonResponse({data: {viewer: {login: 'ada'}}});
        };

        await expect(restClient.query('query { viewer { login } }', {}, 3, 'OptIn Stars'))
            .resolves.toEqual({viewer: {login: 'ada'}});
        expect(callCount).toBe(2);
    });

    test('query does NOT replay a mutation after a transient 200-body error — a read from the SAME error retries', async () => {
        const mutationDoc = `
            mutation($subjectId: ID!, $body: String!) {
                addComment(input: {subjectId: $subjectId, body: $body}) { clientMutationId }
            }`;
        let appliedWrites = 0;
        let mutationCalls = 0;

        globalThis.fetch = async () => {
            mutationCalls++;
            appliedWrites++;

            return jsonResponse({
                data  : {addComment: {clientMutationId: 'already-applied'}},
                errors: [{message: 'Resource not accessible by integration'}]
            });
        };

        await expect(restClient.query(mutationDoc, {}, 3, 'OptIn Comment'))
            .rejects.toThrow('GraphQL Query Errors: Resource not accessible by integration');
        expect(mutationCalls, 'a mutation must not replay a partial-data error response').toBe(1);
        expect(appliedWrites, 'the first response models a write that already applied').toBe(1);

        let readCalls = 0;

        globalThis.fetch = async () => {
            readCalls++;

            return readCalls === 1
                ? jsonResponse({
                    data  : {viewer: null},
                    errors: [{message: 'Resource not accessible by integration'}]
                })
                : jsonResponse({data: {viewer: {login: 'ada'}}});
        };

        await expect(restClient.query('query { viewer { login } }', {}, 3, 'OptIn Stars'))
            .resolves.toEqual({viewer: {login: 'ada'}});
        expect(readCalls, 'an idempotent read retries the same transient body error').toBe(2);
    });

    test('query exhausts the bounded budget on a persistent transient error, then throws (no infinite retry)', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;
            return jsonResponse({errors: [{message: 'Resource not accessible by integration'}]});
        };

        // retries=2 → attempt 1 + 2 retries = 3 calls, then the terminal throw. A retry that can never
        // give up is a hang, not a fix; a genuine permission misconfig fails here, loudly, after the budget.
        await expect(restClient.query('query { viewer { login } }', {}, 2, 'OptIn Stars'))
            .rejects.toThrow('GraphQL Query Errors: Resource not accessible by integration');
        expect(callCount).toBe(3);
    });

    test('query fails fast on a fatal error class — a genuine NOT_FOUND is never retried', async () => {
        let callCount = 0;

        globalThis.fetch = async () => {
            callCount++;
            return jsonResponse({errors: [{message: 'NOT_FOUND'}]});
        };

        await expect(restClient.query('query { node { id } }', {}, 3, 'ID lookup'))
            .rejects.toThrow('GraphQL Fatal Error: NOT_FOUND');
        expect(callCount).toBe(1);
    });

    test('query and rest classify transient failures from ONE shared source of truth (#15359 AC-2)', async () => {
        // Override the single shared list with a token neither transport hard-codes. If either path kept
        // its own inline list, that path would not retry this token and its assertion below would fail.
        restClient.retryableTransientErrorPatterns = ['neo-shared-transient-token'];

        // GraphQL: the token arrives as a 200-body error.
        let graphqlCalls = 0;
        globalThis.fetch = async () => {
            graphqlCalls++;
            return graphqlCalls === 1
                ? jsonResponse({errors: [{message: 'neo-shared-transient-token flapped'}]})
                : jsonResponse({data: {ok: true}});
        };
        await expect(restClient.query('query { ok }', {}, 3, 'shared')).resolves.toEqual({ok: true});
        expect(graphqlCalls).toBe(2);

        // REST: the same token arrives as a thrown transport error, classified from the same list.
        let restCalls = 0;
        globalThis.fetch = async () => {
            restCalls++;

            if (restCalls === 1) {
                throw new TypeError('neo-shared-transient-token flapped');
            }

            return jsonResponse({ok: true});
        };
        await expect(restClient.rest('meta')).resolves.toEqual({ok: true});
        expect(restCalls).toBe(2);
    });

    test('query does NOT replay a mutation after an ambiguous transport failure — a read from the SAME error retries (#15359 mutation-safety)', async () => {
        // Classify the transport failure as transient so the read below retries it: this pins retry
        // AUTHORIZATION, not classification. A transport disconnect leaves a mutation's server-side
        // outcome unknowable (the write may have applied before the socket dropped), so replaying it
        // could duplicate — a read is idempotent and safe, a mutation fails loud on attempt 1 instead.
        restClient.retryableTransientErrorPatterns = ['neo-transient-flap'];
        const throwTransport = () => { throw new TypeError('neo-transient-flap: socket hangup') };

        // A mutation in the OptIn/OptOut leading-whitespace shape — the gate must recognise it.
        const mutationDoc = `
            mutation($subjectId: ID!, $body: String!) {
                addComment(input: {subjectId: $subjectId, body: $body}) { clientMutationId }
            }`;

        // MUTATION: the transient transport failure is NOT replayed — one fetch, original error rethrown.
        let mutationCalls = 0;
        globalThis.fetch = async () => { mutationCalls++; throwTransport() };
        await expect(restClient.query(mutationDoc, {}, 3, 'OptIn Comment')).rejects.toThrow('neo-transient-flap');
        expect(mutationCalls, 'a mutation must not replay an ambiguous transport failure').toBe(1);

        // READ: the SAME transient failure IS retried — proving the gate is the operation, not the error.
        let readCalls = 0;
        globalThis.fetch = async () => {
            readCalls++;
            if (readCalls === 1) throwTransport();
            return jsonResponse({data: {viewer: {login: 'ada'}}});
        };
        await expect(restClient.query('query { viewer { login } }', {}, 3, 'OptIn Stars'))
            .resolves.toEqual({viewer: {login: 'ada'}});
        expect(readCalls, 'an idempotent read retries the same transient failure').toBe(2);
    });

    test('query does NOT replay a mutation after a 5xx server error — a read retries, and a 403 rate-limit still replays either (#15454)', async () => {
        // A `>= 500` leaves a MUTATION's server-side outcome ambiguous (the write may have applied before
        // the error), so it is not replayed — an idempotent read is. A `403` is a pre-execution rate-limit
        // rejection (the write never ran), so it is always safe to replay, mutation or not. retries=4 zeroes
        // this path's hardcoded `(4 - retries) * 2000` first-retry backoff — unlike the transient-body path
        // it is not wired to the configurable delay knobs (a noted follow-up).
        const mutationDoc = `
            mutation($subjectId: ID!, $body: String!) {
                addComment(input: {subjectId: $subjectId, body: $body}) { clientMutationId }
            }`;
        const badGateway = () => new Response('', {status: 502, statusText: 'Bad Gateway'});

        // MUTATION on a 5xx: NOT replayed — one fetch, the terminal status error thrown.
        let mutationCalls = 0;
        globalThis.fetch = async () => { mutationCalls++; return badGateway() };
        await expect(restClient.query(mutationDoc, {}, 4, 'OptIn Comment'))
            .rejects.toThrow('GraphQL Error: 502 Bad Gateway');
        expect(mutationCalls, 'a mutation must not replay a 5xx ambiguous outcome').toBe(1);

        // READ on the SAME 5xx: IS retried — proving the gate is the operation, not the status.
        let readCalls = 0;
        globalThis.fetch = async () => {
            readCalls++;
            return readCalls === 1 ? badGateway() : jsonResponse({data: {viewer: {login: 'ada'}}});
        };
        await expect(restClient.query('query { viewer { login } }', {}, 4, 'OptIn Stars'))
            .resolves.toEqual({viewer: {login: 'ada'}});
        expect(readCalls, 'an idempotent read retries the same 5xx').toBe(2);

        // MUTATION on a 403: IS replayed — a pre-execution rate-limit reject never ran the write. A zero
        // remaining bucket keeps it on the standard backoff (a >0 quota would trip the 10s abuse penalty).
        restClient.rateLimit.graphql.remaining = 0;
        let rateLimitedMutationCalls = 0;
        globalThis.fetch = async () => {
            rateLimitedMutationCalls++;
            return rateLimitedMutationCalls === 1
                ? new Response('', {status: 403, statusText: 'Forbidden'})
                : jsonResponse({data: {addComment: {clientMutationId: 'ok'}}});
        };
        await expect(restClient.query(mutationDoc, {}, 4, 'OptIn Comment'))
            .resolves.toEqual({addComment: {clientMutationId: 'ok'}});
        expect(rateLimitedMutationCalls, 'a 403 rate-limit is pre-execution, so a mutation safely replays').toBe(2);
    });

    test('query does NOT replay a mutation after an in-body gateway (502/504) error — a read retries (#15454)', async () => {
        // A gateway error can arrive as a 200-body error. Like a `>= 500` status it leaves a MUTATION's
        // outcome ambiguous, so it is not replayed — a read is. The transient patterns are overridden to a
        // token this message does not carry, so the gateway branch is the SOLE retry route under test (not
        // the shared transient-body path). retries=4 zeroes the same hardcoded first-retry backoff.
        restClient.retryableTransientErrorPatterns = ['neo-nonmatching-token'];
        const mutationDoc = `
            mutation($subjectId: ID!, $body: String!) {
                addComment(input: {subjectId: $subjectId, body: $body}) { clientMutationId }
            }`;
        const gatewayBody = () => jsonResponse({errors: [{message: 'Something went wrong (502)'}]});

        // MUTATION on an in-body gateway error: NOT replayed — one fetch, the error surfaced.
        let mutationCalls = 0;
        globalThis.fetch = async () => { mutationCalls++; return gatewayBody() };
        await expect(restClient.query(mutationDoc, {}, 4, 'OptIn Comment'))
            .rejects.toThrow('Something went wrong (502)');
        expect(mutationCalls, 'a mutation must not replay an ambiguous in-body gateway error').toBe(1);

        // READ on the SAME in-body gateway error: IS retried.
        let readCalls = 0;
        globalThis.fetch = async () => {
            readCalls++;
            return readCalls === 1 ? gatewayBody() : jsonResponse({data: {viewer: {login: 'ada'}}});
        };
        await expect(restClient.query('query { viewer { login } }', {}, 4, 'OptIn Stars'))
            .resolves.toEqual({viewer: {login: 'ada'}});
        expect(readCalls, 'an idempotent read retries the same in-body gateway error').toBe(2);
    });
});
