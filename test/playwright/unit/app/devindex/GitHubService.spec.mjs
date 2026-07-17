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
});
