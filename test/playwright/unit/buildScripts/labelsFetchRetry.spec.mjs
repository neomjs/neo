import {test, expect} from '@playwright/test';

import {fetchAllLabels} from '../../../../buildScripts/docs/index/labels.mjs';

/**
 * Transient-retry parity for the self-contained label fetch. Dissolving the Brain's
 * `LabelService` import must not narrow the behavior: the Brain's `GraphqlService` attempted each
 * request up to four times, retrying classified network errors and retryable HTTP statuses with
 * `Retry-After` support. Each arm here pins one direction of that envelope — including the fatal
 * path, because a client that retries EVERYTHING is as wrong as one that retries nothing.
 */
test.describe('labels.mjs transient-retry envelope (#17239)', () => {
    const
        page          = (nodes, hasNextPage=false, endCursor=null) => ({
            data: {repository: {labels: {nodes, pageInfo: {hasNextPage, endCursor}}}}
        }),
        okResponse    = payload => ({ok: true, status: 200, statusText: 'OK', json: async () => payload}),
        errorResponse = (status, statusText, retryAfter=null) => ({
            ok     : false,
            status,
            statusText,
            headers: {get: name => (retryAfter !== null && name === 'retry-after') ? String(retryAfter) : null},
            json   : async () => ({})
        }),
        seams = responses => {
            const
                calls  = [],
                sleeps = [],
                queue  = [...responses];

            return {
                calls,
                sleeps,
                deps: {
                    fetchFn: async (url, init) => {
                        calls.push(JSON.parse(init.body));
                        const next = queue.shift();
                        if (next instanceof Error) throw next;
                        return next;
                    },
                    sleepFn          : async ms => { sleeps.push(ms); },
                    getAuthTokenFn   : () => 'test-token',
                    getRepoIdentityFn: () => ({owner: 'neomjs', repo: 'neo'})
                }
            };
        };

    test('429 with Retry-After, then success — the header wins over backoff, exactly', async () => {
        const {deps, sleeps} = seams([
            errorResponse(429, 'Too Many Requests', 2),
            okResponse(page([{name: 'bug', color: 'ff0000', description: null}]))
        ]);

        const labels = await fetchAllLabels(deps);

        expect(labels).toHaveLength(1);
        expect(sleeps).toEqual([2000]);
    });

    test('a 500-class response retries with bounded jittered backoff, then succeeds', async () => {
        const {deps, sleeps} = seams([
            errorResponse(503, 'Service Unavailable'),
            okResponse(page([{name: 'ai', color: '00ff00', description: 'd'}]))
        ]);

        const labels = await fetchAllLabels(deps);

        expect(labels).toHaveLength(1);
        expect(sleeps).toHaveLength(1);
        // First retry: base 1000ms + at most 20% jitter.
        expect(sleeps[0]).toBeGreaterThanOrEqual(1000);
        expect(sleeps[0]).toBeLessThanOrEqual(1200);
    });

    test('a classified transient network error retries, then succeeds', async () => {
        const {deps, sleeps} = seams([
            new Error('fetch failed'),
            okResponse(page([{name: 'epic', color: '0000ff', description: null}]))
        ]);

        const labels = await fetchAllLabels(deps);

        expect(labels).toHaveLength(1);
        expect(sleeps).toHaveLength(1);
    });

    test('a fatal 4xx fails immediately — one request, zero sleeps (the retries-everything mutant dies here)', async () => {
        const {deps, calls, sleeps} = seams([errorResponse(404, 'Not Found')]);

        await expect(fetchAllLabels(deps)).rejects.toThrow(/404 Not Found/);
        expect(calls).toHaveLength(1);
        expect(sleeps).toHaveLength(0);
    });

    test('an unclassified network error fails immediately without retry', async () => {
        const {deps, calls} = seams([new Error('boom')]);

        await expect(fetchAllLabels(deps)).rejects.toThrow(/boom/);
        expect(calls).toHaveLength(1);
    });

    test('a persistent transient failure exhausts after exactly four attempts', async () => {
        const {deps, calls, sleeps} = seams([
            errorResponse(502, 'Bad Gateway'),
            errorResponse(502, 'Bad Gateway'),
            errorResponse(502, 'Bad Gateway'),
            errorResponse(502, 'Bad Gateway')
        ]);

        await expect(fetchAllLabels(deps)).rejects.toThrow(/502 Bad Gateway/);
        expect(calls).toHaveLength(4);
        expect(sleeps).toHaveLength(3);
    });

    test('a GraphQL-errors payload fails without retry — transport succeeded, the request is wrong', async () => {
        const {deps, calls} = seams([
            okResponse({errors: [{message: 'Field does not exist'}], data: null})
        ]);

        await expect(fetchAllLabels(deps)).rejects.toThrow(/Field does not exist/);
        expect(calls).toHaveLength(1);
    });

    test('pagination follows endCursor across pages and concatenates nodes', async () => {
        const {deps, calls} = seams([
            okResponse(page([{name: 'a', color: '111111', description: null}], true, 'CURSOR-1')),
            okResponse(page([{name: 'b', color: '222222', description: null}]))
        ]);

        const labels = await fetchAllLabels(deps);

        expect(labels.map(label => label.name)).toEqual(['a', 'b']);
        expect(calls[0].variables.cursor).toBeNull();
        expect(calls[1].variables.cursor).toBe('CURSOR-1');
    });
});
