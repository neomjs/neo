import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import * as yaml       from 'js-yaml';

/**
 * Unit tests for `.github/workflows/review-admission-mergeability.yml`.
 *
 * Verifies cursor-paginated GraphQL board discovery (`> 100` PRs), live `(headRefOid, refs/heads/dev)`
 * coordinate fencing before and after status writes (including frozen PR `base.sha` metadata),
 * `32 -> 33 -> 32` overflow/rate-limit/partial-page resilience without false author-side failures,
 * bounded persistent-`UNKNOWN` REST wakeups, write-free quiet sweeps, telemetry accounting, and
 * negative-control preservation of failing required test statuses.
 */

const __dirname     = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot      = path.resolve(__dirname, '../../../../..'),
      workflowsDir  = path.join(repoRoot, '.github/workflows'),
      AsyncFunction = Object.getPrototypeOf(async function() {}).constructor,
      WORKFLOW_NAME = 'review-admission-mergeability.yml',
      CONTEXT_KEY   = 'review-admission/mergeability';

const readWorkflow = name => yaml.load(fs.readFileSync(path.join(workflowsDir, name), 'utf8'));

/**
 * @summary Evaluates an inline `actions/github-script` body against a mocked runtime.
 * @param {String} script
 * @param {Object} runtime
 * @returns {Promise<void>}
 */
const executeScript = async(script, runtime) => {
    await new AsyncFunction('github', 'context', 'core', 'setTimeout', script)(
        runtime.github,
        runtime.context,
        runtime.core,
        runtime.setTimeout || globalThis.setTimeout
    )
};

/**
 * @summary Builds a pull-request state descriptor with frozen `baseSha` metadata to model real GitHub PR objects.
 * @param {Number} number
 * @param {Boolean|null|String} mergeable `true`/`'MERGEABLE'`, `false`/`'CONFLICTING'`, or `null`/`'UNKNOWN'`
 * @param {Object} [options]
 * @returns {Object}
 */
const makePr = (number, mergeable, {
    baseRefName = 'dev',
    baseSha     = 'frozen-pr-base-0',
    head        = `head-${number}`,
    isDraft     = false,
    merged      = false,
    state       = 'OPEN'
} = {}) => {
    const gqlMergeable = mergeable === true  ? 'MERGEABLE'
                       : mergeable === false ? 'CONFLICTING'
                       : mergeable === null  ? 'UNKNOWN'
                       : mergeable;

    const restMergeable = gqlMergeable === 'MERGEABLE'   ? true
                        : gqlMergeable === 'CONFLICTING' ? false
                        : null;

    return {
        baseRefName,
        baseSha,
        gqlMergeable,
        head,
        isDraft,
        merged,
        number,
        restMergeable,
        state
    }
};

/**
 * @summary Formats a GraphQL pull-request node reading live commit status from `statusesByHead`.
 * @param {Object} pr
 * @param {Map<String,Object>} statusesByHead
 * @returns {Object}
 */
const toGraphqlNode = (pr, statusesByHead) => {
    const contexts  = statusesByHead.get(pr.head) || {},
          published = contexts[CONTEXT_KEY];

    return {
        baseRefName: pr.baseRefName,
        commits    : {
            nodes: [{
                commit: {
                    status: {
                        context: published ? {state: published.toUpperCase()} : null
                    }
                }
            }]
        },
        headRefOid: pr.head,
        isDraft   : Boolean(pr.isDraft),
        mergeable : pr.gqlMergeable,
        number    : pr.number,
        state     : pr.state
    }
};

/**
 * @summary Creates a mock GitHub Actions runtime supporting cursor-paginated GraphQL, REST `pulls.get`, and multi-context commit statuses.
 * @param {Object} [options]
 * @returns {Object}
 */
const createReviewAdmissionRuntime = ({
    boardSnapshots       = null,
    devTip               = 'dev-tip-1',
    eventAction          = 'synchronize',
    eventName            = 'push',
    eventPrNumber        = 42,
    graphqlHandler       = null,
    initialContextsBySha = {},
    onBeforeCreateStatus = null,
    onRestGet            = null,
    pageSize             = 100,
    prs                  = [makePr(42, true)],
    publishedStates      = {},
    singleReadsByPr      = null
} = {}) => {
    const delays         = [],
          errors         = [],
          failures       = [],
          graphqlCalls   = [],
          infos          = [],
          restReads      = [],
          statusCalls    = [],
          statusesByHead = new Map(),
          warnings       = [];

    for (const [sha, state] of Object.entries(publishedStates)) {
        statusesByHead.set(sha, {[CONTEXT_KEY]: state})
    }

    for (const [sha, ctxMap] of Object.entries(initialContextsBySha)) {
        statusesByHead.set(sha, {...(statusesByHead.get(sha) || {}), ...ctxMap})
    }

    const singleIndexByPr = new Map();
    let   boardCallIndex  = 0,
          liveDevTip      = devTip,
          livePrMap       = new Map(prs.map(pr => [pr.number, {...pr}]));

    const runtime = {
        context: {
            eventName,
            payload: {
                action      : eventAction,
                pull_request: eventPrNumber === null ? undefined : {number: eventPrNumber}
            },
            repo: {owner: 'neomjs', repo: 'neo'}
        },
        core: {
            error    : msg => errors.push(msg),
            info     : msg => infos.push(msg),
            setFailed: msg => failures.push(msg),
            warning  : msg => warnings.push(msg)
        },
        github: {
            graphql: async(query, variables) => {
                graphqlCalls.push({query, variables});

                if (typeof graphqlHandler === 'function') {
                    const custom = await graphqlHandler({
                        boardCallIndex,
                        graphqlCalls,
                        liveDevTip,
                        livePrMap,
                        query,
                        setDevTip: next => {liveDevTip = next},
                        statusesByHead,
                         toGraphqlNode,
                        variables
                    });

                    if (custom !== undefined) {
                        return custom
                    }
                }

                if (query.includes('ReviewAdmissionSingle')) {
                    const prNumber = variables.number,
                          stream   = singleReadsByPr?.[prNumber];

                    if (Array.isArray(stream) && stream.length > 0) {
                        const idx  = singleIndexByPr.get(prNumber) ?? 0,
                              item = stream[Math.min(idx, stream.length - 1)];

                        singleIndexByPr.set(prNumber, idx + 1);

                        if (item instanceof Error) {
                            throw item
                        }

                        const pr  = item.pr || item,
                              tip = item.devTip || liveDevTip;

                        return {
                            rateLimit : {cost: 1, remaining: 4999},
                            repository: {
                                pullRequest: toGraphqlNode(pr, statusesByHead),
                                ref        : {target: {oid: tip}}
                            }
                        }
                    }

                    const livePr = livePrMap.get(prNumber);

                    return {
                        rateLimit : {cost: 1, remaining: 4999},
                        repository: {
                            pullRequest: livePr ? toGraphqlNode(livePr, statusesByHead) : null,
                            ref        : {target: {oid: liveDevTip}}
                        }
                    }
                }

                // Board query with cursor pagination
                let activeList = [...livePrMap.values()].sort((a, b) => a.number - b.number),
                    tipForPage = liveDevTip;

                if (Array.isArray(boardSnapshots) && boardSnapshots.length > 0) {
                    const snap = boardSnapshots[Math.min(boardCallIndex, boardSnapshots.length - 1)];
                    if (!variables.cursor) {
                        boardCallIndex++
                    } else {
                        const currentSnap = boardSnapshots[Math.min(Math.max(0, boardCallIndex - 1), boardSnapshots.length - 1)];
                        if (currentSnap) {
                            if (currentSnap instanceof Error) throw currentSnap;
                            activeList = currentSnap.prs;
                            tipForPage = currentSnap.devTip || liveDevTip;
                            livePrMap  = new Map(activeList.map(p => [p.number, {...p}]));
                            liveDevTip = tipForPage
                        }
                    }

                    if (!variables.cursor) {
                        if (snap instanceof Error) {
                            throw snap
                        }
                        if (snap.rawResponse) {
                            return snap.rawResponse
                        }
                        activeList = snap.prs;
                        tipForPage = snap.devTip || liveDevTip;
                        livePrMap  = new Map(activeList.map(p => [p.number, {...p}]));
                        liveDevTip = tipForPage
                    }
                }

                const offset    = variables.cursor ? Number(variables.cursor.replace('cursor:', '')) : 0,
                      slice     = activeList.slice(offset, offset + pageSize),
                      nextIndex = offset + slice.length,
                      hasMore   = nextIndex < activeList.length;

                return {
                    rateLimit : {cost: 1, remaining: 4999},
                    repository: {
                        pullRequests: {
                            nodes   : slice.map(pr => toGraphqlNode(pr, statusesByHead)),
                            pageInfo: {
                                endCursor  : hasMore ? `cursor:${nextIndex}` : null,
                                hasNextPage: hasMore
                            },
                            totalCount: activeList.length
                        },
                        ref: {target: {oid: tipForPage}}
                    }
                }
            },
            rest: {
                pulls: {
                    get: async args => {
                        restReads.push(args);

                        if (typeof onRestGet === 'function') {
                            const custom = await onRestGet({
                                args,
                                liveDevTip,
                                livePrMap,
                                setPrMergeable: (num, val) => {
                                    const existing = livePrMap.get(num);
                                    if (existing) {
                                        const updated = makePr(num, val, existing);
                                        livePrMap.set(num, updated)
                                    }
                                }
                            });

                            if (custom !== undefined) {
                                if (custom instanceof Error) throw custom;
                                return {data: custom}
                            }
                        }

                        const pr = livePrMap.get(args.pull_number);
                        if (!pr) {
                            throw new Error(`PR ${args.pull_number} not found`)
                        }

                        return {
                            data: {
                                base     : {ref: pr.baseRefName, sha: pr.baseSha},
                                head     : {sha: pr.head},
                                mergeable: pr.restMergeable,
                                merged   : pr.merged,
                                number   : pr.number,
                                state    : pr.state.toLowerCase()
                            }
                        }
                    }
                },
                repos: {
                    createCommitStatus: async args => {
                        if (typeof onBeforeCreateStatus === 'function') {
                            await onBeforeCreateStatus({
                                args,
                                setDevTip: next => {liveDevTip = next},
                                setPr    : pr => livePrMap.set(pr.number, pr),
                                statusCalls,
                                statusesByHead
                            })
                        }

                        statusCalls.push(args);
                        const prev = statusesByHead.get(args.sha) || {};
                        statusesByHead.set(args.sha, {...prev, [args.context]: args.state});
                        return {data: args}
                    }
                }
            }
        },
        delays,
        errors,
        failures,
        graphqlCalls,
        infos,
        restReads,
        setDevTip : next => {liveDevTip = next},
        setPr     : pr => livePrMap.set(pr.number, pr),
        setTimeout: (resolve, delay) => {
            delays.push(delay);
            resolve()
        },
        statusCalls,
        statusesByHead,
        warnings
    };

    return runtime
};

/**
 * @summary Executes the single-job workflow publisher with deterministic env overrides.
 * @param {String} script
 * @param {Object} runtime
 * @param {Object} [envOverrides]
 * @returns {Promise<void>}
 */
const executeReviewAdmissionPublisher = async(script, runtime, envOverrides = {}) => {
    const keys = {
        GITHUB_RUN_ID                  : '32700000000',
        GITHUB_SERVER_URL              : 'https://github.com',
        MERGEABILITY_API_RETRIES       : '2',
        MERGEABILITY_API_RETRY_DELAY_MS: '0',
        MERGEABILITY_CONCURRENCY       : '4',
        MERGEABILITY_MAX_RESTARTS      : '3',
        MERGEABILITY_POLL_ATTEMPTS     : '4',
        MERGEABILITY_POLL_DELAY_MS     : '0',
        MERGEABILITY_POLL_MAX_DELAY_MS : '30000',
        MERGEABILITY_REST_WAKE_BATCH   : '32',
        MERGEABILITY_REST_WAKE_BUDGET  : '64',
        ...envOverrides
    };
    const previous = Object.fromEntries(Object.keys(keys).map(key => [key, process.env[key]]));

    Object.assign(process.env, keys);

    try {
        await executeScript(script, runtime)
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            value === undefined ? delete process.env[key] : process.env[key] = value
        }
    }
};

const publishStep = () => readWorkflow(WORKFLOW_NAME).jobs.publish.steps.find(
    step => String(step.uses || '').startsWith('actions/github-script@')
);

test.describe('review-admission mergeability GraphQL controller', () => {
    test('runs in a single job without checkout and grants contents:read, pull-requests:read, statuses:write', () => {
        const workflow = readWorkflow(WORKFLOW_NAME),
              jobKeys  = Object.keys(workflow.jobs),
              job      = workflow.jobs.publish,
              step     = publishStep();

        expect(jobKeys).toEqual(['publish']);
        expect(job.strategy).toBeUndefined();
        expect(job.needs).toBeUndefined();

        expect(workflow.on.pull_request_target).toEqual({
            branches: ['dev'],
            types   : ['opened', 'reopened', 'synchronize', 'ready_for_review']
        });
        expect(workflow.on.push).toEqual({branches: ['dev']});
        expect(workflow.on.workflow_run).toEqual({
            workflows: ['Data Sync Pipeline'],
            types    : ['completed']
        });
        expect(workflow.on).toHaveProperty('workflow_dispatch');
        expect(workflow.permissions).toEqual({
            contents       : 'read',
            'pull-requests': 'read',
            statuses       : 'write'
        });

        expect(job.steps.some(s => String(s.uses || '').startsWith('actions/checkout@'))).toBe(false);
        expect(job.concurrency).toEqual({
            group               : "review-admission-mergeability-${{ github.event_name == 'pull_request_target' && format('pr-{0}', github.event.pull_request.number) || 'board' }}",
            'cancel-in-progress': false
        });
        expect(step.uses).toBe('actions/github-script@v9');
        expect(step.with.retries).toBe(0)
    });

    test('replays 32 -> 33 -> 32 targets, preserves genuine conflict as failure, avoids false failures on rate-limit/API/incomplete pages, and recovers the oldest eligible PR', async () => {
        const script = publishStep().with.script;

        // 1. 32 targets on dev-1: seventh target conflicts, 31 are mergeable
        const prs32 = Array.from({length: 32}, (_, idx) => makePr(idx + 1, idx + 1 === 7 ? false : true));
        const run32 = createReviewAdmissionRuntime({devTip: 'dev-1', prs: prs32});
        await executeReviewAdmissionPublisher(script, run32);

        expect(run32.failures).toEqual([]);
        expect(run32.statusCalls).toHaveLength(32);
        expect(run32.statusesByHead.get('head-7')[CONTEXT_KEY]).toBe('failure');
        expect(run32.statusesByHead.get('head-1')[CONTEXT_KEY]).toBe('success');

        const stateAfter32 = Object.fromEntries(
            prs32.map(pr => [pr.head, run32.statusesByHead.get(pr.head)[CONTEXT_KEY]])
        );

        // 2a. 33 targets under rate-limit + incomplete page + GraphQL errors -> zero author-side false failure/error
        const prs33 = [
            makePr(1, null), // oldest eligible PR invalidated to UNKNOWN after base move
            ...prs32.slice(1),
            makePr(33, true)
        ];

        const truncatedPage = createReviewAdmissionRuntime({
            boardSnapshots: [{
                rawResponse: {
                    rateLimit : {cost: 1, remaining: 4990},
                    repository: {
                        pullRequests: {
                            nodes     : prs33.slice(0, 20).map(pr => toGraphqlNode(pr, new Map())),
                            pageInfo  : {endCursor: null, hasNextPage: false},
                            totalCount: 33
                        },
                        ref: {target: {oid: 'dev-2'}}
                    }
                }
            }],
            publishedStates: {...stateAfter32, 'head-1': 'pending'}
        });
        await executeReviewAdmissionPublisher(script, truncatedPage, {MERGEABILITY_API_RETRIES: '1'});

        expect(truncatedPage.statusCalls).toEqual([]);
        expect(truncatedPage.failures[0]).toContain('returned 20 distinct PR(s) (20 nodes) of 33 declared across 1 page(s) with hasNextPage=false');
        expect(truncatedPage.failures[0]).toContain('No author-side failure published');
        expect(truncatedPage.statusesByHead.get('head-7')[CONTEXT_KEY]).toBe('failure');

        const gqlErrorsPage = createReviewAdmissionRuntime({
            boardSnapshots: [{
                rawResponse: {
                    errors    : [{message: 'Resource limits exceeded'}],
                    rateLimit : {cost: 1, remaining: 0},
                    repository: null
                }
            }],
            publishedStates: {...stateAfter32, 'head-1': 'pending'}
        });
        await executeReviewAdmissionPublisher(script, gqlErrorsPage, {MERGEABILITY_API_RETRIES: '1'});

        expect(gqlErrorsPage.statusCalls).toEqual([]);
        expect(gqlErrorsPage.failures[0]).toContain('GraphQL response carried errors');
        expect(gqlErrorsPage.failures[0]).toContain('retries=1');

        // 2b. 33 targets with transient rate-limit on attempt 1 + persistent UNKNOWN on oldest target resolved by REST wakeup
        let   transientFailedOnce = false;
        const run33               = createReviewAdmissionRuntime({
            devTip         : 'dev-2',
            prs            : prs33,
            publishedStates: {...stateAfter32, 'head-1': 'pending'},
            graphqlHandler : ({graphqlCalls}) => {
                if (!transientFailedOnce && graphqlCalls.length === 1) {
                    transientFailedOnce = true;
                    throw new Error('HttpError: secondary rate limit')
                }
            },
            onRestGet: ({args, setPrMergeable}) => {
                if (args.pull_number === 1) {
                    setPrMergeable(1, true);
                    return {
                        base     : {ref: 'dev', sha: 'frozen-pr-base-0'},
                        head     : {sha: 'head-1'},
                        mergeable: true,
                        merged   : false,
                        number   : 1,
                        state    : 'open'
                    }
                }
            }
        });

        await executeReviewAdmissionPublisher(script, run33, {
            MERGEABILITY_API_RETRIES       : '2',
            MERGEABILITY_API_RETRY_DELAY_MS: '500',
            MERGEABILITY_POLL_DELAY_MS     : '1000'
        });

        expect(run33.failures).toEqual([]);
        expect(run33.restReads.map(r => r.pull_number)).toEqual([1]);
        // Only the new entry and the recovered oldest entry needed writes; 30 clean + the conflicting entry stayed write-free!
        expect(run33.statusCalls.map(c => [c.sha, c.state])).toEqual([
            ['head-33', 'success'],
            ['head-1', 'success']
        ]);
        expect(run33.statusesByHead.get('head-7')[CONTEXT_KEY]).toBe('failure');
        expect(run33.infos.join(' ')).toContain('retries=1');

        // 3. 33 -> 32 targets after the 33rd entry merges & the oldest entry recovers on next push/dispatch
        const prs32After = [
            makePr(1, true),
            ...prs32.slice(1)
        ];
        const run32Recovery = createReviewAdmissionRuntime({
            devTip         : 'dev-3',
            eventName      : 'workflow_dispatch',
            prs            : prs32After,
            publishedStates: {...stateAfter32, 'head-1': 'pending'}
        });
        await executeReviewAdmissionPublisher(script, run32Recovery);

        expect(run32Recovery.failures).toEqual([]);
        expect(run32Recovery.restReads).toEqual([]);
        expect(run32Recovery.statusCalls.map(c => [c.sha, c.state])).toEqual([
            ['head-1', 'success']
        ]);
        expect(run32Recovery.statusesByHead.get('head-7')[CONTEXT_KEY]).toBe('failure')
    });

    test('paginates > 100 targets on a consistent live base, skips closed or retargeted PRs, and converges when frozen-base single-PR run races a newer board sweep', async () => {
        const script = publishStep().with.script;

        // 1. 135 targets across 2 pages (100 + 35), where page 2 first observes a mid-pagination devTip advance
        const prs135 = Array.from({length: 135}, (_, idx) => {
            const num = idx + 1;
            if (num === 10)  return makePr(num, true, {state: 'MERGED', merged: true});
            if (num === 115) return makePr(num, true, {baseRefName: 'main'});
            if (num === 120) return makePr(num, false);
            return makePr(num, true)
        });

        const publishedFor132 = Object.fromEntries(
            prs135
                .filter(p => p.number !== 10 && p.number !== 115 && p.number !== 120 && p.number !== 135)
                .map(p => [p.head, 'success'])
        );

        let   splitTipInjected = false;
        const paginated        = createReviewAdmissionRuntime({
            devTip         : 'dev-page-1',
            pageSize       : 100,
            prs            : prs135,
            publishedStates: publishedFor132,
            graphqlHandler : ({query, setDevTip, variables}) => {
                if (query.includes('ReviewAdmissionBoard') && variables.cursor === 'cursor:100' && !splitTipInjected) {
                    splitTipInjected = true;
                    setDevTip('dev-page-2-consistent')
                }
            }
        });

        await executeReviewAdmissionPublisher(script, paginated);

        expect(paginated.failures).toEqual([]);
        // Closed and retargeted entries received zero status writes; only the conflicting and newly added entries wrote
        expect(paginated.statusCalls.map(c => [c.sha, c.state]).sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
            ['head-120', 'failure'],
            ['head-135', 'success']
        ]);
        expect(paginated.statusesByHead.has('head-10')).toBe(false);
        expect(paginated.statusesByHead.has('head-115')).toBe(false);
        expect(paginated.infos.some(m => m.includes('PR #10 is merged'))).toBe(true);
        expect(paginated.infos.some(m => m.includes('PR #115 targets main, not dev'))).toBe(true);

        // 2. Frozen PR baseSha (`frozen-pr-base-0`) while live `refs/heads/dev` moves during an older `pr-42` status write
        let   boardInterleaved = false;
        const racingPr         = createReviewAdmissionRuntime({
            devTip              : 'dev-b1',
            eventName           : 'pull_request_target',
            eventPrNumber       : 42,
            prs                 : [makePr(42, true, {baseSha: 'frozen-pr-base-0', head: 'pr-42-head'})],
            onBeforeCreateStatus: ({args, setDevTip, setPr, statusCalls, statusesByHead}) => {
                if (!boardInterleaved && args.state === 'success') {
                    boardInterleaved = true;
                    // `dev` advances B1 -> B2, making the active head CONFLICTING while its `baseSha` stays frozen!
                    setDevTip('dev-b2');
                    setPr(makePr(42, false, {baseSha: 'frozen-pr-base-0', head: 'pr-42-head'}));
                    statusCalls.push({
                        actor  : 'newer-board-sweep',
                        context: CONTEXT_KEY,
                        sha    : 'pr-42-head',
                        state  : 'failure'
                    });
                    statusesByHead.set('pr-42-head', {[CONTEXT_KEY]: 'failure'})
                }
            }
        });

        await executeReviewAdmissionPublisher(script, racingPr);

        expect(racingPr.failures).toEqual([]);
        expect(racingPr.statusCalls.map(c => c.state)).toEqual([
            'failure',
            'success',
            'failure'
        ]);
        expect(racingPr.statusesByHead.get('pr-42-head')[CONTEXT_KEY]).toBe('failure')
    });

    test('keeps unchanged verdicts write-free on a quiet board and logs exact GraphQL cost, REST reads, writes, and retries', async () => {
        const script   = publishStep().with.script,
              prs35    = Array.from({length: 35}, (_, i) => makePr(i + 1, i + 1 <= 2 ? false : true)),
              existing = Object.fromEntries(prs35.map(p => [p.head, p.number <= 2 ? 'failure' : 'success'])),
              quiet    = createReviewAdmissionRuntime({
                  devTip         : 'dev-quiet',
                  eventName      : 'workflow_dispatch',
                  prs            : prs35,
                  publishedStates: existing
              });

        await executeReviewAdmissionPublisher(script, quiet);

        expect(quiet.failures).toEqual([]);
        expect(quiet.graphqlCalls).toHaveLength(1);
        expect(quiet.restReads).toEqual([]);
        expect(quiet.statusCalls).toEqual([]);
        expect(quiet.infos.join(' ')).toContain(
            'graphqlCalls=1 graphqlCost=1 restReads=0 statusReads=0 statusWrites=0 failedRequests=0 retries=0'
        )
    });

    test('fails before writes on incomplete or duplicate multi-page boards, recovers on mid-pagination board movement, and preserves oldest-eligible wake ordering', async () => {
        const script = publishStep().with.script,
              prs135 = Array.from({length: 135}, (_, i) => makePr(i + 1, i + 1 === 7 ? false : true));

        // 1a. 2-page truncated board: declares 135, yields 100 + 34 = 134 distinct targets -> zero writes
        const truncatedMultiPage = createReviewAdmissionRuntime({
            devTip        : 'dev-mp-trunc',
            prs           : prs135,
            graphqlHandler: ({query, statusesByHead, toGraphqlNode, variables}) => {
                if (!query.includes('ReviewAdmissionBoard')) return;

                if (!variables.cursor) {
                    return {
                        rateLimit : {cost: 1, remaining: 4990},
                        repository: {
                            pullRequests: {
                                nodes     : prs135.slice(0, 100).map(pr => toGraphqlNode(pr, statusesByHead)),
                                pageInfo  : {endCursor: 'cursor:100', hasNextPage: true},
                                totalCount: 135
                            },
                            ref: {target: {oid: 'dev-mp-trunc'}}
                        }
                    }
                }

                return {
                    rateLimit : {cost: 1, remaining: 4989},
                    repository: {
                        pullRequests: {
                            nodes     : prs135.slice(100, 134).map(pr => toGraphqlNode(pr, statusesByHead)),
                            pageInfo  : {endCursor: null, hasNextPage: false},
                            totalCount: 135
                        },
                        ref: {target: {oid: 'dev-mp-trunc'}}
                    }
                }
            }
        });

        await executeReviewAdmissionPublisher(script, truncatedMultiPage, {MERGEABILITY_MAX_RESTARTS: '1'});
        expect(truncatedMultiPage.statusCalls).toEqual([]);
        expect(truncatedMultiPage.failures[0]).toContain('returned 134 distinct PR(s) (134 nodes) of 135 declared across 2 page(s)');

        // 1b. 2-page duplicate terminal page: declares 135, yields 100 + 35 raw nodes containing a duplicate -> 134 distinct targets, zero writes
        const duplicateTerminalPage = createReviewAdmissionRuntime({
            devTip        : 'dev-mp-dup',
            prs           : prs135,
            graphqlHandler: ({query, statusesByHead, toGraphqlNode, variables}) => {
                if (!query.includes('ReviewAdmissionBoard')) return;

                if (!variables.cursor) {
                    return {
                        rateLimit : {cost: 1, remaining: 4990},
                        repository: {
                            pullRequests: {
                                nodes     : prs135.slice(0, 100).map(pr => toGraphqlNode(pr, statusesByHead)),
                                pageInfo  : {endCursor: 'cursor:100', hasNextPage: true},
                                totalCount: 135
                            },
                            ref: {target: {oid: 'dev-mp-dup'}}
                        }
                    }
                }

                const terminalNodes = [...prs135.slice(100, 134), prs135[0]].map(pr => toGraphqlNode(pr, statusesByHead));
                return {
                    rateLimit : {cost: 1, remaining: 4989},
                    repository: {
                        pullRequests: {
                            nodes     : terminalNodes,
                            pageInfo  : {endCursor: null, hasNextPage: false},
                            totalCount: 135
                        },
                        ref: {target: {oid: 'dev-mp-dup'}}
                    }
                }
            }
        });

        await executeReviewAdmissionPublisher(script, duplicateTerminalPage, {MERGEABILITY_MAX_RESTARTS: '1'});
        expect(duplicateTerminalPage.statusCalls).toEqual([]);
        expect(duplicateTerminalPage.failures[0]).toContain('duplicate');

        // 1c. Mid-pagination totalCount movement on sweep 1 recovers cleanly on restart 1 without partial writes
        let   firstSweepShifted = false;
        const prs134            = prs135.slice(0, 134),
              recoveredBoard    = createReviewAdmissionRuntime({
                  devTip         : 'dev-mp-recover',
                  prs            : prs134,
                  publishedStates: Object.fromEntries(prs134.slice(0, 133).map(p => [p.head, p.number === 7 ? 'failure' : 'success'])),
                  graphqlHandler : ({query, statusesByHead, toGraphqlNode, variables}) => {
                      if (!query.includes('ReviewAdmissionBoard')) return;

                      if (!firstSweepShifted && variables.cursor === 'cursor:100') {
                          firstSweepShifted = true;
                          return {
                              rateLimit : {cost: 1, remaining: 4988},
                              repository: {
                                  pullRequests: {
                                      nodes     : prs134.slice(100).map(pr => toGraphqlNode(pr, statusesByHead)),
                                      pageInfo  : {endCursor: null, hasNextPage: false},
                                      totalCount: 135
                                  },
                                  ref: {target: {oid: 'dev-mp-recover'}}
                              }
                          }
                      }
                  }
              });

        await executeReviewAdmissionPublisher(script, recoveredBoard, {MERGEABILITY_MAX_RESTARTS: '2'});
        expect(recoveredBoard.failures).toEqual([]);
        expect(recoveredBoard.statusCalls.map(c => [c.sha, c.state])).toEqual([['head-134', 'success']]);

        // 2. Oldest-eligible wake ordering when verification discovers UNKNOWN on an older target ahead of a younger board-UNKNOWN target
        let   wokenOlder   = false;
        const wakeOrderRun = createReviewAdmissionRuntime({
            devTip        : 'dev-wake-order',
            prs           : [makePr(1, true), makePr(20, null)],
            graphqlHandler: ({query, statusesByHead, toGraphqlNode, variables}) => {
                if (query.includes('ReviewAdmissionSingle') && variables.number === 1 && !wokenOlder) {
                    return {
                        rateLimit : {cost: 1, remaining: 4990},
                        repository: {
                            pullRequest: toGraphqlNode(makePr(1, null), statusesByHead),
                            ref        : {target: {oid: 'dev-wake-order'}}
                        }
                    }
                }
            },
            onRestGet: ({args, setPrMergeable}) => {
                if (args.pull_number === 1) {
                    wokenOlder = true
                }
                setPrMergeable(args.pull_number, true);
                return {
                    base     : {ref: 'dev', sha: 'frozen-pr-base-0'},
                    head     : {sha: `head-${args.pull_number}`},
                    mergeable: true,
                    merged   : false,
                    number   : args.pull_number,
                    state    : 'open'
                }
            }
        });

        await executeReviewAdmissionPublisher(script, wakeOrderRun, {
            MERGEABILITY_POLL_ATTEMPTS   : '2',
            MERGEABILITY_REST_WAKE_BATCH : '1',
            MERGEABILITY_REST_WAKE_BUDGET: '1'
        });

        expect(wakeOrderRun.restReads.map(r => r.pull_number)).toEqual([1]);
        expect(wakeOrderRun.statusesByHead.get('head-1')[CONTEXT_KEY]).toBe('success');
        expect(wakeOrderRun.statusesByHead.get('head-20')[CONTEXT_KEY]).toBe('pending')
    });

    test('fences every POST retry behind a fresh coordinate/active check, charges each REST wake attempt to budget, and counts failed GraphQL/API attempts', async () => {
        const script = publishStep().with.script;

        // 1a. Rejected first POST followed by target close -> zero second POST
        let   closePostAttempts = 0;
        const closeOnRetry      = createReviewAdmissionRuntime({
            devTip              : 'dev-fence-1',
            eventName           : 'pull_request_target',
            eventPrNumber       : 11,
            prs                 : [makePr(11, true)],
            onBeforeCreateStatus: ({setPr}) => {
                closePostAttempts++;
                if (closePostAttempts === 1) {
                    setPr(makePr(11, true, {merged: true, state: 'MERGED'}));
                    throw new Error('HttpError: 502 Bad Gateway')
                }
            }
        });

        await executeReviewAdmissionPublisher(script, closeOnRetry, {MERGEABILITY_API_RETRIES: '2'});
        expect(closePostAttempts).toBe(1);
        expect(closeOnRetry.statusCalls).toEqual([]);
        expect(closeOnRetry.failures).toEqual([]);
        expect(closeOnRetry.infos.join(' ')).toContain('failedRequests=1');

        // 1b. Rejected first POST followed by target retarget -> zero second POST
        let   retargetPostAttempts = 0;
        const retargetOnRetry      = createReviewAdmissionRuntime({
            devTip              : 'dev-fence-2',
            eventName           : 'pull_request_target',
            eventPrNumber       : 12,
            prs                 : [makePr(12, true)],
            onBeforeCreateStatus: ({setPr}) => {
                retargetPostAttempts++;
                if (retargetPostAttempts === 1) {
                    setPr(makePr(12, true, {baseRefName: 'main'}));
                    throw new Error('HttpError: 503 Service Unavailable')
                }
            }
        });

        await executeReviewAdmissionPublisher(script, retargetOnRetry, {MERGEABILITY_API_RETRIES: '2'});
        expect(retargetPostAttempts).toBe(1);
        expect(retargetOnRetry.statusCalls).toEqual([]);
        expect(retargetOnRetry.failures).toEqual([]);

        // 1c. Rejected first POST followed by base advance + newer failure publication -> never overwrites newer state with stale success
        let   baseMovePostAttempts = 0;
        const baseAdvanceOnRetry   = createReviewAdmissionRuntime({
            devTip              : 'dev-old',
            eventName           : 'pull_request_target',
            eventPrNumber       : 13,
            prs                 : [makePr(13, true, {head: 'head-13'})],
            onBeforeCreateStatus: ({args, setDevTip, setPr, statusesByHead}) => {
                baseMovePostAttempts++;
                if (baseMovePostAttempts === 1 && args.state === 'success') {
                    setDevTip('dev-new');
                    setPr(makePr(13, false, {head: 'head-13'}));
                    statusesByHead.set('head-13', {[CONTEXT_KEY]: 'failure'});
                    throw new Error('HttpError: 502 Bad Gateway')
                }
            }
        });

        await executeReviewAdmissionPublisher(script, baseAdvanceOnRetry, {MERGEABILITY_API_RETRIES: '2'});
        expect(baseMovePostAttempts).toBe(1);
        expect(baseAdvanceOnRetry.statusCalls).toEqual([]);
        expect(baseAdvanceOnRetry.statusesByHead.get('head-13')[CONTEXT_KEY]).toBe('failure');
        expect(baseAdvanceOnRetry.failures).toEqual([]);

        // 1d. Stable open control: first POST fails transiently, second attempt re-reads same coordinate and succeeds
        let   stablePostAttempts = 0;
        const stableControl      = createReviewAdmissionRuntime({
            devTip              : 'dev-stable',
            eventName           : 'pull_request_target',
            eventPrNumber       : 14,
            prs                 : [makePr(14, true)],
            onBeforeCreateStatus: ({args}) => {
                expect(args.request).toEqual({retries: 0});
                stablePostAttempts++;
                if (stablePostAttempts === 1) {
                    throw new Error('HttpError: 500 Internal Server Error')
                }
            }
        });

        await executeReviewAdmissionPublisher(script, stableControl, {MERGEABILITY_API_RETRIES: '2'});
        expect(stablePostAttempts).toBe(2);
        expect(stableControl.failures).toEqual([]);
        expect(stableControl.statusCalls.map(c => [c.sha, c.state])).toEqual([['head-14', 'success']]);
        expect(stableControl.infos.join(' ')).toContain('statusWrites=1 failedRequests=1 retries=1');

        // 2. REST wake budget=1 with apiRetries=2 charges every physical GET attempt -> exactly 1 GET call
        const budgetOneWake = createReviewAdmissionRuntime({
            devTip   : 'dev-wake-budget',
            prs      : [makePr(15, null)],
            onRestGet: ({args}) => {
                expect(args.request).toEqual({retries: 0});
                return new Error('HttpError: 504 Gateway Timeout')
            }
        });

        await executeReviewAdmissionPublisher(script, budgetOneWake, {
            MERGEABILITY_API_RETRIES     : '2',
            MERGEABILITY_POLL_ATTEMPTS   : '2',
            MERGEABILITY_REST_WAKE_BUDGET: '1'
        });

        expect(budgetOneWake.restReads).toHaveLength(1);
        expect(budgetOneWake.failures[0]).toContain('restReads=1');
        expect(budgetOneWake.failures[0]).toContain('failedRequests=1');

        // 3. Three thrown GraphQL invocations log graphqlCalls=3, graphqlCost=0, statusWrites=0, failedRequests=3, retries=2
        const thrownGraphql = createReviewAdmissionRuntime({
            devTip        : 'dev-gql-throw',
            graphqlHandler: () => {
                throw new Error('ECONNRESET')
            }
        });

        await executeReviewAdmissionPublisher(script, thrownGraphql, {MERGEABILITY_API_RETRIES: '2'});
        expect(thrownGraphql.graphqlCalls).toHaveLength(3);
        expect(thrownGraphql.statusCalls).toEqual([]);
        expect(thrownGraphql.failures[0]).toContain(
            'graphqlCalls=3 graphqlCost=0 restReads=0 statusReads=0 statusWrites=0 failedRequests=3 retries=2'
        )
    });

    test('converges on same-base moved heads, overwrites externally regressed PENDING statuses on later polls, and settles post-pending MERGEABLE reads', async () => {
        const script = publishStep().with.script;

        // 1. Board recheck sees a new head (`head-21-b`) at the SAME dev tip -> does not report current early; converges on `head-21-b`
        let   movedHeadInjected = false;
        const sameBaseMovedHead = createReviewAdmissionRuntime({
            devTip        : 'dev-same-tip',
            prs           : [makePr(21, true, {head: 'head-21-a'})],
            graphqlHandler: ({query, setDevTip, statusesByHead, toGraphqlNode, variables}) => {
                if (query.includes('ReviewAdmissionSingle') && variables.number === 21 && !movedHeadInjected) {
                    movedHeadInjected = true;
                    const nextPr = makePr(21, true, {head: 'head-21-b'});
                    sameBaseMovedHead.setPr(nextPr);
                    setDevTip('dev-same-tip');
                    return {
                        rateLimit : {cost: 1, remaining: 4995},
                        repository: {
                            pullRequest: toGraphqlNode(nextPr, statusesByHead),
                            ref        : {target: {oid: 'dev-same-tip'}}
                        }
                    }
                }
            }
        });

        await executeReviewAdmissionPublisher(script, sameBaseMovedHead, {MERGEABILITY_POLL_ATTEMPTS: '3'});
        expect(sameBaseMovedHead.failures).toEqual([]);
        expect(sameBaseMovedHead.statusesByHead.has('head-21-a')).toBe(false);
        expect(sameBaseMovedHead.statusesByHead.get('head-21-b')[CONTEXT_KEY]).toBe('success');

        // 2. Later board poll sees PENDING on an already-published head -> re-publishes SUCCESS instead of skipping from stale cache
        let   pollCount            = 0;
        const regressedPendingRead = createReviewAdmissionRuntime({
            devTip        : 'dev-pending-regress',
            prs           : [makePr(31, true), makePr(32, null)],
            graphqlHandler: ({query, statusesByHead, variables}) => {
                if (query.includes('ReviewAdmissionBoard') && !variables.cursor) {
                    pollCount++;
                    if (pollCount === 2) {
                        // Simulate external/stale writer regressing head-31 to pending while target 32 resolves
                        statusesByHead.set('head-31', {[CONTEXT_KEY]: 'pending'});
                        regressedPendingRead.setPr(makePr(32, true))
                    }
                }
            }
        });

        await executeReviewAdmissionPublisher(script, regressedPendingRead, {MERGEABILITY_POLL_ATTEMPTS: '3'});
        expect(regressedPendingRead.failures).toEqual([]);
        expect(regressedPendingRead.statusesByHead.get('head-31')[CONTEXT_KEY]).toBe('success');
        expect(regressedPendingRead.statusesByHead.get('head-32')[CONTEXT_KEY]).toBe('success');
        expect(regressedPendingRead.statusCalls.filter(c => c.sha === 'head-31' && c.state === 'success')).toHaveLength(2);

        // 3. Single-PR post-write read sees MERGEABLE on the same coordinate right after writing pending -> publishes success without UNKNOWN warning
        const singlePostPendingResolved = createReviewAdmissionRuntime({
            devTip              : 'dev-post-pending',
            eventName           : 'pull_request_target',
            eventPrNumber       : 41,
            prs                 : [makePr(41, null, {head: 'head-41'})],
            onBeforeCreateStatus: ({args, setPr}) => {
                if (args.state === 'pending') {
                    setPr(makePr(41, true, {head: 'head-41'}))
                }
            }
        });

        await executeReviewAdmissionPublisher(script, singlePostPendingResolved, {
            MERGEABILITY_POLL_ATTEMPTS   : '1',
            MERGEABILITY_REST_WAKE_BUDGET: '0'
        });

        expect(singlePostPendingResolved.failures).toEqual([]);
        expect(singlePostPendingResolved.warnings).toEqual([]);
        expect(singlePostPendingResolved.statusCalls.map(c => c.state)).toEqual(['pending', 'success']);
        expect(singlePostPendingResolved.statusesByHead.get('head-41')[CONTEXT_KEY]).toBe('success');

        // 4. Same-base perpetually moving head within poll bounds explicitly fails controller rather than reporting current
        let   moveCounter     = 0;
        const perpetuallyMove = createReviewAdmissionRuntime({
            devTip        : 'dev-perpetual',
            prs           : [makePr(51, true, {head: 'head-51-0'})],
            graphqlHandler: ({query, statusesByHead, toGraphqlNode, variables}) => {
                if (query.includes('ReviewAdmissionSingle') && variables.number === 51) {
                    moveCounter++;
                    const movingPr = makePr(51, true, {head: `head-51-${moveCounter}`});
                    perpetuallyMove.setPr(movingPr);
                    return {
                        rateLimit : {cost: 1, remaining: 4990},
                        repository: {
                            pullRequest: toGraphqlNode(movingPr, statusesByHead),
                            ref        : {target: {oid: 'dev-perpetual'}}
                        }
                    }
                }
            }
        });

        await executeReviewAdmissionPublisher(script, perpetuallyMove, {
            MERGEABILITY_MAX_RESTARTS : '0',
            MERGEABILITY_POLL_ATTEMPTS: '2'
        });

        expect(perpetuallyMove.failures[0]).toContain('kept moving at dev-perpet');
        expect(perpetuallyMove.infos.some(m => m.includes('Board mergeability current'))).toBe(false)
    });

    test('preserves failing required test statuses in a negative control across green, pending, and error runs', async () => {
        const script  = publishStep().with.script,
              control = createReviewAdmissionRuntime({
                  devTip              : 'dev-neg',
                  initialContextsBySha: {
                      'head-1': {'PR baseline': 'success', 'test / unit': 'failure'},
                      'head-2': {'test / e2e' : 'failure'}
                  },
                  prs: [
                      makePr(1, true),
                      makePr(2, null)
                  ]
              });

        await executeReviewAdmissionPublisher(script, control, {MERGEABILITY_POLL_ATTEMPTS: '2'});

        expect(control.statusesByHead.get('head-1')).toEqual({
            'PR baseline': 'success',
            [CONTEXT_KEY]: 'success',
            'test / unit': 'failure'
        });
        expect(control.statusesByHead.get('head-2')).toEqual({
            [CONTEXT_KEY]: 'pending',
            'test / e2e' : 'failure'
        });
        expect(control.failures[0]).toContain('1 PR(s) stayed UNKNOWN (#2)')
    })
});
