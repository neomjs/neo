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

    test('preserves typed GraphQL error details for bounded caller recovery (#15977)', async () => {
        const errors = [{
            type   : 'RESOURCE_LIMITS_EXCEEDED',
            path   : ['repository', 'discussions', 'nodes', 29, 'comments'],
            message: 'Resource limits for this query exceeded'
        }];

        globalThis.fetch = async () => new Response(JSON.stringify({errors}), {
            status : 200,
            headers: {'content-type': 'application/json'}
        });

        const error = await GraphqlService.query(QUERY).catch(error => error);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('GitHub API error: Resource limits for this query exceeded');
        expect(error.graphqlErrors).toEqual(errors);
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

/**
 * Credential resolution order.
 *
 * The only source `#getAuthToken` once consulted was `gh auth token`, and **every describe block
 * above sets `authTokenOverride`** — so the resolution path itself was never exercised. That is how
 * a CI consumer could depend on an authenticated `gh` CLI unnoticed until scheduled runs failed on
 * it, reporting a missing credential as advice to run an interactive login CI cannot perform.
 *
 * These cover the override and environment branches: override → `GH_TOKEN` → `GITHUB_TOKEN`.
 *
 * **Scope limit, stated rather than implied:** the cached-CLI and CLI-shell-out branches are NOT
 * covered here, so this suite pins the *environment* precedence, not the full resolution order. A
 * bare `gh auth token` assertion succeeds on a developer machine and fails on CI, which would pin the
 * environment instead of the code. Covering them needs a deterministic CLI seam.
 *
 * Env-before-cache is intentional, but for **cost and staleness**, not isolation: an env read is free
 * so memoizing it buys nothing while adding a staleness window for long-lived in-process consumers
 * whose credential is re-pointed between calls. It is *not* justified by `dataSyncPipeline`'s
 * per-stage scoping — that pipeline spawns a fresh child process per stage, so a singleton cache
 * cannot cross stages there at all.
 */
test.describe('Neo.ai.services.github-workflow.GraphqlService — credential resolution order (#15986)', () => {
    let GraphqlService;
    let originalAuthTokenOverride;
    let originalFetch;
    let originalGhToken;
    let originalGithubToken;

    const QUERY = 'query TestQuery { viewer { login } }';

    /**
     * Stubs `fetch` and captures the Authorization header the service actually sent.
     * @returns {Object} A holder whose `value` is populated by the next call.
     */
    const captureAuthHeader = () => {
        const seen = {value: null};

        globalThis.fetch = async (url, options) => {
            seen.value = new Headers(options.headers).get('authorization');

            return new Response(JSON.stringify({data: {viewer: {login: 'neo-opus-grace'}}}), {
                status : 200,
                headers: {'content-type': 'application/json'}
            });
        };

        return seen
    };

    test.beforeAll(async () => {
        GraphqlService = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
    });

    test.beforeEach(() => {
        originalAuthTokenOverride = GraphqlService.authTokenOverride;
        originalFetch             = globalThis.fetch;
        originalGhToken           = process.env.GH_TOKEN;
        originalGithubToken       = process.env.GITHUB_TOKEN;

        GraphqlService.authTokenOverride = null;

        delete process.env.GH_TOKEN;
        delete process.env.GITHUB_TOKEN;
    });

    test.afterEach(() => {
        globalThis.fetch = originalFetch;

        GraphqlService.authTokenOverride = originalAuthTokenOverride;

        if (originalGhToken === undefined) {
            delete process.env.GH_TOKEN;
        } else {
            process.env.GH_TOKEN = originalGhToken;
        }

        if (originalGithubToken === undefined) {
            delete process.env.GITHUB_TOKEN;
        } else {
            process.env.GITHUB_TOKEN = originalGithubToken;
        }
    });

    test('reads GH_TOKEN from the environment when no override is set', async () => {
        process.env.GH_TOKEN = 'env-gh-token';

        const seen = captureAuthHeader();

        await GraphqlService.query(QUERY);

        expect(seen.value).toContain('env-gh-token');
    });

    test('falls back to GITHUB_TOKEN when GH_TOKEN is absent', async () => {
        process.env.GITHUB_TOKEN = 'env-github-token';

        const seen = captureAuthHeader();

        await GraphqlService.query(QUERY);

        expect(seen.value).toContain('env-github-token');
    });

    test('prefers GH_TOKEN over GITHUB_TOKEN when both are set', async () => {
        process.env.GH_TOKEN     = 'env-gh-token';
        process.env.GITHUB_TOKEN = 'env-github-token';

        const seen = captureAuthHeader();

        await GraphqlService.query(QUERY);

        expect(seen.value).toContain('env-gh-token');
        expect(seen.value).not.toContain('env-github-token');
    });

    test('an explicit override still outranks the environment', async () => {
        GraphqlService.authTokenOverride = 'override-token';
        process.env.GH_TOKEN             = 'env-gh-token';

        const seen = captureAuthHeader();

        await GraphqlService.query(QUERY);

        expect(seen.value).toContain('override-token');
        expect(seen.value).not.toContain('env-gh-token');
    });

    test('treats a whitespace-only credential as absent rather than sending it', async () => {
        process.env.GH_TOKEN     = '   ';
        process.env.GITHUB_TOKEN = 'env-github-token';

        const seen = captureAuthHeader();

        await GraphqlService.query(QUERY);

        expect(seen.value).toContain('env-github-token');
        expect(seen.value).not.toContain('   ');
    });

    /**
     * The no-credential error path, driven through a deterministic `gh` stand-in.
     *
     * A `PATH`-prepended stub makes the CLI branch fail on demand without depending on whether the
     * host has a real `gh` login — the same seam used to red-prove this change, and the reason the
     * red proof could not simply unset the token: on an authenticated developer machine the real CLI
     * would have returned a live credential into the assertion diff.
     *
     * **Only the failing CLI branch is exercised here, deliberately.** A *successful* CLI call
     * populates the service's private `#authToken` cache, which has no reset seam, so asserting it
     * would leave a resolved credential on the singleton and silently change what every later test in
     * the worker resolves — order-dependent pollution. The failure path caches nothing, so it is
     * order-independent. Covering the cached and CLI-success branches needs a cache-reset seam on the
     * service; that is a deliberate API cost and is left unclaimed here rather than smuggled in as a
     * test-only mutator.
     */
    /**
     * The cache-dependent branches, proven in an ISOLATED CHILD PROCESS.
     *
     * These three cannot be asserted in-worker: a successful `gh auth token` populates the service's
     * private `#authToken`, which has no reset seam, so the credential would leak into every later
     * test. The seam is a child process, not a production reset API — cache state cannot escape a
     * process that exits. Lifted from the repository's existing
     * `spawnSync(process.execPath, ['--input-type=module', '-e', …])` pattern.
     *
     * One child proves all three, because the ordering itself is the contract: the `gh` stub emits a
     * DIFFERENT token per invocation, so a reused cache and a second shell-out are distinguishable.
     *
     *   1. call with no env       → CLI resolves, caching `cli-token-1`
     *   2. call again, no env     → still `cli-token-1` ⇒ the cache was reused (no 2nd shell-out)
     *   3. set `GH_TOKEN`, call   → `env-token` ⇒ env outranks a POPULATED cache
     *
     * Step 3 is the one the in-worker suite structurally cannot reach: every case there starts from
     * an empty cache, so none of them can prove environment-OVER-cache rather than merely
     * environment-when-empty.
     */
    test('env outranks a populated cache, and the CLI result is cached — proven in an isolated child', async () => {
        const
            {spawnSync} = await import('child_process'),
            fs          = await import('fs'),
            os          = await import('os'),
            path        = await import('path'),
            repoRoot    = path.resolve(import.meta.dirname, '../../../../../..'),
            shimDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-gh-seq-')),
            counter     = path.join(shimDir, 'n');

        // a `gh` that returns a new token on every invocation, so cache reuse is observable
        fs.writeFileSync(counter, '0');
        fs.writeFileSync(path.join(shimDir, 'gh'),
            `#!/bin/sh\nn=$(cat ${counter})\nn=$((n+1))\necho $n > ${counter}\necho cli-token-$n\n`,
            {mode: 0o755}
        );

        const code = `
            const root = ${JSON.stringify(repoRoot)};
            await import(root + '/src/Neo.mjs');
            await import(root + '/src/core/_export.mjs');
            const {default: GraphqlService} = await import(root + '/ai/services/github-workflow/GraphqlService.mjs');

            const seen = [];
            globalThis.fetch = async (url, options) => {
                seen.push(new Headers(options.headers).get('authorization'));
                return new Response(JSON.stringify({data: {viewer: {login: 'x'}}}), {
                    status : 200,
                    headers: {'content-type': 'application/json'}
                });
            };

            const QUERY = 'query T { viewer { login } }';

            delete process.env.GH_TOKEN;
            delete process.env.GITHUB_TOKEN;

            await GraphqlService.query(QUERY);            // 1: CLI resolves + caches
            await GraphqlService.query(QUERY);            // 2: cache reused?
            process.env.GH_TOKEN = 'env-token';
            await GraphqlService.query(QUERY);            // 3: env vs populated cache

            console.log('RESULT ' + JSON.stringify(seen));
        `;

        const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
            cwd     : repoRoot,
            encoding: 'utf8',
            env     : {...process.env, PATH: `${shimDir}${path.delimiter}${process.env.PATH}`}
        });

        try {
            const line = child.stdout.split('\n').find(l => l.startsWith('RESULT '));

            expect(line, child.stdout + child.stderr).toBeTruthy();

            const [first, second, third] = JSON.parse(line.slice('RESULT '.length));

            expect(first,  'call 1 resolves through the gh CLI').toContain('cli-token-1');
            expect(second, 'call 2 reuses the cached CLI token instead of shelling out again').toContain('cli-token-1');
            expect(third,  'call 3 prefers GH_TOKEN over the already-populated cache').toContain('env-token');
        } finally {
            fs.rmSync(shimDir, {force: true, recursive: true});
        }
    });

    test('names the env vars it looked for when no credential exists anywhere', async () => {
        const
            fs           = await import('fs'),
            os           = await import('os'),
            path         = await import('path'),
            shimDir      = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-gh-shim-')),
            originalPath = process.env.PATH;

        fs.writeFileSync(path.join(shimDir, 'gh'), '#!/bin/sh\nexit 1\n', {mode: 0o755});

        process.env.PATH = `${shimDir}${path.delimiter}${originalPath}`;

        try {
            await expect(GraphqlService.query(QUERY)).rejects.toThrow(/GH_TOKEN.*GITHUB_TOKEN/s);
        } finally {
            process.env.PATH = originalPath;
            fs.rmSync(shimDir, {force: true, recursive: true});
        }
    });
});
