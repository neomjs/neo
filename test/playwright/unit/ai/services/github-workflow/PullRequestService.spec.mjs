import {setup}      from '../../../../setup.mjs';
import {createHash} from 'node:crypto';

const appName                    = 'PullRequestServiceTest';
const skipCiGitHubAuth           = !!process.env.NEO_TEST_SKIP_CI;
const predecessorListQuerySha256 = '68b60ee57194252d68f3b50f2e174f25ff3859d3ba89bd2a66d7e2d873e1914f';

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

test.describe('Neo.ai.services.github-workflow.PullRequestService — list freshness and belief fields (#16165, #16191)', () => {
    let GraphqlService;
    let PullRequestService;
    let originalQuery;
    let capturedQuery;
    let capturedVariables;
    let capturedOptions;
    let queryCalls;

    const row = (overrides = {}) => ({
        number          : 16165,
        title           : 'Board freshness',
        url             : 'https://github.com/neomjs/neo/pull/16166',
        createdAt       : '2026-07-30T11:00:00Z',
        author          : {login: 'neo-gpt-emmy'},
        state           : 'OPEN',
        mergedAt        : null,
        reviewDecision  : 'REVIEW_REQUIRED',
        baseRefName     : 'dev',
        headRefOid      : 'a'.repeat(40),
        mergeStateStatus: 'CLEAN',
        reviewRequests  : {
            pageInfo: {hasNextPage: false},
            nodes   : [{
                requestedReviewer: {__typename: 'User', login: 'neo-opus-vega'}
            }, {
                requestedReviewer: {
                    __typename  : 'Team',
                    slug        : 'maintainers',
                    organization: {login: 'neomjs'}
                }
            }]
        },
        ...overrides
    });

    test.beforeAll(async () => {
        GraphqlService     = (await import(
            '../../../../../../ai/services/github-workflow/GraphqlService.mjs'
        )).default;
        PullRequestService = (await import(
            '../../../../../../ai/services/github-workflow/PullRequestService.mjs'
        )).default;
        originalQuery      = GraphqlService.query.bind(GraphqlService)
    });

    test.afterAll(() => {
        GraphqlService.query = originalQuery
    });

    test.beforeEach(() => {
        capturedQuery     = null;
        capturedVariables = null;
        capturedOptions   = null;
        queryCalls        = 0;

        GraphqlService.query = async (query, variables, options) => {
            queryCalls++;
            capturedQuery     = query;
            capturedVariables = variables;
            capturedOptions   = options;

            return {repository: {pullRequests: {nodes: [row()]}}}
        }
    });

    test('requests and returns the full current PR-state row without changing list inputs', async () => {
        const result = await PullRequestService.listPullRequests({limit: 7, state: 'open'});

        for (const field of [
            'mergedAt',
            'reviewDecision',
            'reviewRequests',
            'baseRefName',
            'headRefOid',
            'mergeStateStatus'
        ]) {
            expect(capturedQuery).toContain(field)
        }

        expect(capturedQuery).toContain('reviewRequests(first: 100)');
        expect(capturedQuery).toHaveLength(987);
        expect(createHash('sha256').update(capturedQuery).digest('hex')).toBe(predecessorListQuerySha256);
        expect(capturedVariables).toEqual({
            owner : 'neomjs',
            repo  : 'neo',
            limit : 7,
            states: 'OPEN'
        });
        expect(capturedOptions).toBeUndefined();
        expect(queryCalls).toBe(1);
        expect(result).toEqual({
            count       : 1,
            pullRequests: [{
                number        : 16165,
                title         : 'Board freshness',
                url           : 'https://github.com/neomjs/neo/pull/16166',
                createdAt     : '2026-07-30T11:00:00Z',
                author        : {login: 'neo-gpt-emmy'},
                state         : 'OPEN',
                mergedAt      : null,
                reviewDecision: 'REVIEW_REQUIRED',
                reviewRequests: [
                    {kind: 'team', login: 'neomjs/maintainers'},
                    {kind: 'user', login: 'neo-opus-vega'}
                ],
                baseRefName     : 'dev',
                headRefOid      : 'a'.repeat(40),
                mergeStateStatus: 'CLEAN'
            }]
        })
    });

    test('classifies exact believed-open numbers in the same read independently of board filters', async () => {
        GraphqlService.query = async (query, variables, options) => {
            queryCalls++;
            capturedQuery     = query;
            capturedVariables = variables;
            capturedOptions   = options;

            return {
                data: {
                    repository: {
                        pullRequests : {nodes: [row({number: 700})]},
                        believedOpen0: {number: 11, state: 'OPEN', mergedAt: null},
                        believedOpen1: {number: 12, state: 'MERGED', mergedAt: '2026-07-30T12:00:00Z'},
                        believedOpen2: {number: 13, state: 'CLOSED', mergedAt: null},
                        believedOpen3: null
                    }
                },
                errors: [{type: 'NOT_FOUND', path: ['repository', 'believedOpen3']}]
            }
        };

        const result = await PullRequestService.listPullRequests({
            believedOpen: [11, 12, 13, 999999],
            limit       : 1,
            state       : 'closed'
        });

        expect(queryCalls).toBe(1);
        expect(capturedOptions).toEqual({strict: false});
        expect(capturedVariables).toEqual({
            owner : 'neomjs',
            repo  : 'neo',
            limit : 1,
            states: 'CLOSED'
        });
        expect(capturedQuery).toContain('pullRequests(first: $limit');
        expect(capturedQuery).toContain('believedOpen0: pullRequest(number: 11)');
        expect(capturedQuery).toContain('believedOpen1: pullRequest(number: 12)');
        expect(capturedQuery).toContain('believedOpen2: pullRequest(number: 13)');
        expect(capturedQuery).toContain('believedOpen3: pullRequest(number: 999999)');
        expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
        expect(result.count).toBe(1);
        expect(result.pullRequests[0].number).toBe(700);
        expect(result.belief).toEqual({
            stillOpen: [11],
            falsified: [{
                number  : 12,
                state   : 'MERGED',
                mergedAt: '2026-07-30T12:00:00Z'
            }, {
                number  : 13,
                state   : 'CLOSED',
                mergedAt: null
            }],
            unverifiable: [{
                number: 999999,
                reason: 'not-found'
            }]
        })
    });

    test('#16196 classifies only exact-number rows and exact alias-scoped typed errors', async () => {
        GraphqlService.query = async () => ({
            data: {
                repository: {
                    pullRequests  : {nodes: [row({number: 700})]},
                    believedOpen0 : {number: 20, state: 'OPEN', mergedAt: null},
                    believedOpen1 : {number: 21, state: 'CLOSED', mergedAt: null},
                    believedOpen2 : {number: 999, state: 'MERGED', mergedAt: '2026-08-24T00:00:00Z'},
                    believedOpen3 : {number: 23, state: 'ALIEN', mergedAt: null},
                    believedOpen4 : null,
                    believedOpen5 : null,
                    believedOpen6 : {number: 26, state: 'OPEN', mergedAt: null},
                    believedOpen7 : null,
                    believedOpen8 : null,
                    believedOpen9 : null,
                    believedOpen10: {number: 30, state: 'MERGED', mergedAt: '2026-08-24T01:00:00Z'},
                    believedOpen12: 'malformed-row'
                }
            },
            errors: [
                {type: 'NOT_FOUND', path: ['repository', 'believedOpen4'], message: 'permission denied'},
                {type: 'FORBIDDEN', path: ['repository', 'believedOpen5'], message: 'Could not resolve PullRequest'},
                {type: 'NOT_FOUND', path: ['repository', 'believedOpen6']},
                {type: 'NOT_FOUND', path: ['repository', 'believedOpen7']},
                {type: 'NOT_FOUND', path: ['repository', 'believedOpen7']},
                {type: 'NOT_FOUND', path: ['repository', 'believedOpen8', 'extra']},
                {type: 'NOT_FOUND', path: ['repository', 'believedOpen9'], message: 'not an absence message'},
                {type: 'NOT_FOUND', path: ['repository', 'believedOpen13']},
                {type: 'NOT_FOUND', path: ['believedOpen11', 'repository']},
                {type: 'NOT_FOUND', path: 'repository.believedOpen11'},
                {type: 'NOT_FOUND'},
                {type: 'NOT_FOUND', path: ['repository', 'unrelatedAlias']}
            ]
        });

        const result = await PullRequestService.listPullRequests({
            believedOpen: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]
        });

        expect(result.belief).toEqual({
            stillOpen: [20],
            falsified: [{
                number  : 21,
                state   : 'CLOSED',
                mergedAt: null
            }, {
                number  : 30,
                state   : 'MERGED',
                mergedAt: '2026-08-24T01:00:00Z'
            }],
            unverifiable: [
                {number: 22, reason: 'unresolved'},
                {number: 23, reason: 'unrecognized-state'},
                {number: 24, reason: 'not-found'},
                {number: 25, reason: 'lookup-error'},
                {number: 26, reason: 'lookup-error'},
                {number: 27, reason: 'lookup-error'},
                {number: 28, reason: 'unresolved'},
                {number: 29, reason: 'not-found'},
                {number: 31, reason: 'unresolved'},
                {number: 32, reason: 'unresolved'},
                {number: 33, reason: 'lookup-error'}
            ]
        });
        expect(result.belief.stillOpen).toHaveLength(1);
        expect(result.belief.falsified).toHaveLength(2);
        expect(result.belief.unverifiable).toHaveLength(11);
    });

    test('accepts an explicit empty belief without changing the board query', async () => {
        const result = await PullRequestService.listPullRequests({believedOpen: []});

        expect(queryCalls).toBe(1);
        expect(createHash('sha256').update(capturedQuery).digest('hex')).toBe(predecessorListQuerySha256);
        expect(capturedOptions).toEqual({strict: false});
        expect(result.belief).toEqual({
            stillOpen   : [],
            falsified   : [],
            unverifiable: []
        });
        expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt)
    });

    test('rejects invalid believed-open coordinates before GitHub I/O', async () => {
        const invalidCoordinates = [
            null,
            '1',
            [0],
            [-1],
            [1.5],
            ['1'],
            [1, 1],
            Array.from({length: 101}, (_, index) => index + 1)
        ];

        for (const believedOpen of invalidCoordinates) {
            const result = await PullRequestService.listPullRequests({believedOpen});

            expect(result).toMatchObject({
                error: 'Invalid believedOpen input',
                code : 'INVALID_BELIEVED_OPEN'
            });
        }

        expect(queryCalls).toBe(0)
    });

    test('distinguishes complete-empty reviewer requests from unavailable or incomplete sources', async () => {
        GraphqlService.query = async () => ({
            repository: {
                pullRequests: {
                    nodes: [
                        row({number: 1, reviewRequests: {pageInfo: {hasNextPage: false}, nodes: []}}),
                        row({number: 2, reviewRequests: null}),
                        row({number: 3, reviewRequests: {pageInfo: {hasNextPage: true}, nodes: []}}),
                        row({
                            number        : 4,
                            reviewRequests: {
                                pageInfo: {hasNextPage: false},
                                nodes   : [{requestedReviewer: {__typename: 'Bot', login: 'unknown'}}]
                            }
                        })
                    ]
                }
            }
        });

        const result = await PullRequestService.listPullRequests();

        expect(result.pullRequests.map(item => item.reviewRequests)).toEqual([
            [],
            null,
            null,
            null
        ])
    });

    test('emits explicit nulls for unavailable scalar freshness fields', async () => {
        GraphqlService.query = async () => ({
            repository: {
                pullRequests: {
                    nodes: [row({
                        mergedAt        : undefined,
                        reviewDecision  : undefined,
                        baseRefName     : undefined,
                        headRefOid      : undefined,
                        mergeStateStatus: undefined
                    })]
                }
            }
        });

        const result = await PullRequestService.listPullRequests();

        expect(result.pullRequests[0]).toMatchObject({
            mergedAt        : null,
            reviewDecision  : null,
            baseRefName     : null,
            headRefOid      : null,
            mergeStateStatus: null
        })
    });

    test('preserves the structured GraphQL error shape', async () => {
        GraphqlService.query = async () => {
            throw new Error('source unavailable')
        };

        const result = await PullRequestService.listPullRequests();

        expect(result).toMatchObject({
            error  : 'GraphQL API request failed',
            message: 'source unavailable',
            code   : 'GRAPHQL_API_ERROR'
        })
    })
});

test.describe('Neo.ai.services.github-workflow.PullRequestService — merge-readiness projection (#16029, #16902)', () => {
    let GET_MERGE_READINESS;
    let PullRequestService;

    const HEAD       = 'a'.repeat(40);
    const NEXT_HEAD  = 'b'.repeat(40);
    const PRINCIPALS = {
        agentIdentity     : '@neo-gpt',
        githubLogin       : 'neo-gpt',
        memoryCoreIdentity: '@neo-gpt'
    };
    const IDENTITY = {ok: true, code: 'OK', reason: null, principals: PRINCIPALS};
    const RULES    = [{
        type      : 'required_status_checks',
        parameters: {
            required_status_checks: [{context: 'integration-parity', integration_id: 15368}]
        }
    }];

    const checkRun = (state = 'success', {
        integrationId = 15368,
        integration = 'github-actions',
        name = 'integration-parity',
        workflow = workflowFixture()
    } = {}) => {
        const variants = {
            success         : {status: 'COMPLETED', conclusion: 'SUCCESS'},
            pending         : {status: 'IN_PROGRESS', conclusion: null},
            failing         : {status: 'COMPLETED', conclusion: 'FAILURE'},
            skipped         : {status: 'COMPLETED', conclusion: 'SKIPPED'},
            'not-applicable': {status: 'COMPLETED', conclusion: 'NEUTRAL'}
        };

        return {
            __typename: 'CheckRun',
            name,
            ...variants[state],
            detailsUrl: `https://example.test/checks/${name}`,
            checkSuite: {
                app: {
                    databaseId: integrationId,
                    slug      : integration
                },
                workflowRun: workflow ? {
                    databaseId: workflow.runId,
                    runNumber : workflow.runNumber,
                    runAttempt: workflow.runAttempt ?? 1,
                    workflow  : {
                        databaseId  : workflow.id,
                        name        : workflow.name,
                        resourcePath: workflow.resourcePath
                    }
                } : null
            }
        };
    };

    const workflowFixture = ({
        id = 278020769,
        name = 'Tests',
        resourcePath = '/neomjs/neo/actions/workflows/test.yml',
        runId = 31404273390,
        runNumber = 8462,
        runAttempt = 1
    } = {}) => ({
        id,
        name,
        resourcePath,
        runId,
        runNumber,
        runAttempt
    });

    const pullRequest = ({
        baseRefName = 'dev',
        checkCommit = HEAD,
        checkHasNextPage = false,
        checkRollupAvailable = true,
        checkTotalCount,
        contexts = [checkRun()],
        headRefOid = HEAD,
        mergeStateStatus = 'CLEAN',
        mergedAt = null,
        reviewDecision = 'APPROVED',
        reviewHasNextPage = false,
        reviewers = [],
        // `null` models a connection GitHub did not return at all — the silence case — which is
        // distinct from an empty node list (fetched, no approvals).
        // Rostered logins, and DIFFERENT families on purpose: the default fixture models a healthy
        // PR, and after the §6.1 rule a same-family default would block every arm here for a reason
        // none of them is about. `neo-opus-vega` is claude, `neo-gpt-emmy` is gpt.
        authorLogin = 'neo-opus-vega',
        // Default body carries a self-id matching the opener, so arms about other things are not
        // silently exercising author drift.
        body = 'Authored by Vega (Claude Opus 5, Claude Code).',
        reviews = [{state: 'APPROVED', submittedAt: '2026-07-29T07:00:00.000Z', commit: {oid: HEAD}, author: {login: 'neo-gpt-emmy'}}],
        reviewsHasPreviousPage = false,
        // A fetched-and-empty comment connection: the default fixture models a PR nobody has held,
        // which is what arms about other rules need. `null` models a connection GitHub did not
        // return, and the fail-closed arm uses that explicitly rather than relying on this default.
        comments = [],
        commentsHasPreviousPage = false,
        state = 'OPEN'
    } = {}) => ({
        number        : 16029,
        state,
        mergedAt,
        baseRefName,
        headRefOid,
        mergeStateStatus,
        reviewDecision,
        author        : authorLogin === null ? null : {login: authorLogin},
        body,
        reviewRequests: {
            pageInfo: {hasNextPage: reviewHasNextPage, endCursor: null},
            nodes   : reviewers.map(login => ({
                requestedReviewer: {__typename: 'User', login}
            }))
        },
        reviews: reviews === null ? null : {
            pageInfo: {hasPreviousPage: reviewsHasPreviousPage},
            nodes   : reviews
        },
        comments: comments === null ? null : {
            pageInfo: {hasPreviousPage: commentsHasPreviousPage},
            nodes   : comments
        },
        commits: {
            nodes: [{
                commit: {
                    oid              : checkCommit,
                    statusCheckRollup: checkRollupAvailable ? {
                        contexts: {
                            totalCount: checkTotalCount ?? contexts.length,
                            pageInfo  : {hasNextPage: checkHasNextPage, endCursor: null},
                            nodes     : contexts
                        }
                    } : null
                }
            }]
        }
    });

    const dependencies = ({
        snapshots = [pullRequest(), pullRequest()],
        rules = [RULES, RULES],
        restError = null
    } = {}) => {
        let   queryCall = 0;
        let   restCall  = 0;
        const restPaths = [];

        return {
            now  : () => new Date('2026-07-29T08:00:00.000Z'),
            query: async () => ({
                repository: {
                    pullRequest: snapshots[Math.min(queryCall++, snapshots.length - 1)]
                }
            }),
            rest: async (method, path) => {
                if (restError) {
                    throw restError;
                }

                restPaths.push({method, path});

                return rules[Math.min(restCall++, rules.length - 1)];
            },
            calls    : () => ({queryCall, restCall}),
            restPaths: () => restPaths
        };
    };

    const project = (deps, extra = {}) => PullRequestService.getConversation({
        pr_number : 16029,
        projection: 'merge-readiness',
        ...extra,
        identityAssertion: IDENTITY
    }, deps);

    test.beforeAll(async () => {
        PullRequestService = (await import(
            '../../../../../../ai/services/github-workflow/PullRequestService.mjs'
        )).default;
        ({GET_MERGE_READINESS} = await import(
            '../../../../../../ai/services/github-workflow/queries/pullRequestQueries.mjs'
        ));
    });

    test('returns one immutable positive exact-head observation and ignores caller readiness fields', async () => {
        const deps   = dependencies();
        const result = await project(deps, {
            checksGreen     : false,
            mergeStateStatus: 'DIRTY',
            reviewDecision  : 'CHANGES_REQUESTED'
        });

        expect(result.verdict).toBe('merge-ready-observed');
        expect(result.marker).toMatch(/^\[merge-eligible]\[B-prime:sha256:/);
        expect(result.head).toBe(HEAD);
        expect(result.mergeStateStatus).toBe('CLEAN');
        expect(result.reviewDecision).toBe('APPROVED');
        expect(result.requiredSet.contexts).toEqual([
            {context: 'integration-parity', integrationId: 15368}
        ]);
        expect(result.principals).toEqual(PRINCIPALS);
        expect(result.checksVerdict).toBe('green');
        expect(result.predicate.strictMergeReady).toBe(true);
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.requiredSet.contexts)).toBe(true);
        expect(deps.calls()).toEqual({queryCall: 2, restCall: 2});
    });

    // The approval anchor. `validateMergeReady`'s own spec covers the advisory text; these cover the
    // WIRING, which is the half that can silently not exist. The predicate grew the channel before
    // any caller supplied it, and a parameter with no producer reports nothing and fails nothing —
    // so each case below is written to go red against a call site that never passes an oid.
    test('#17339: an approval earned on the current head raises no anchor advisory', async () => {
        const result = await project(dependencies());

        expect(result.verdict).toBe('merge-ready-observed');
        expect(result.predicate.advisories).toEqual([]);
    });

    test('#17339: an approval earned on a superseded commit is reported without blocking readiness', async () => {
        // Approved at HEAD, then the head MOVED — the real shape of this defect, and it also proves
        // the anchor is compared against the observed head rather than against a fixed constant.
        // `checkCommit` moves with it: an exact-head rollup is required for the observation to stay
        // positive, which is what makes this an advisory-on-a-green-PR rather than a red one.
        const moved = () => pullRequest({
            checkCommit: NEXT_HEAD,
            headRefOid : NEXT_HEAD,
            reviews    : [{state: 'APPROVED', submittedAt: '2026-07-29T07:00:00.000Z', commit: {oid: HEAD}, author: {login: 'neo-gpt-emmy'}}]
        });
        const result = await project(dependencies({snapshots: [moved(), moved()]}));

        // ADVISORY, not blocker: the badge is genuinely APPROVED and CI is genuinely green, so the
        // observation must stay positive. A stale anchor that flipped the verdict would red every
        // rebased PR in the repo and train readers to ignore the signal.
        expect(result.verdict).toBe('merge-ready-observed');
        expect(result.predicate.strictMergeReady).toBe(true);
        expect(result.predicate.advisories).toHaveLength(1);
        expect(result.predicate.advisories[0]).toContain(HEAD);
        expect(result.predicate.advisories[0]).toContain(NEXT_HEAD);

        // …and it REACHES the surface that travels to the merge gate. Nested inside `predicate` the
        // advisory fires only on an otherwise-green observation, so it competes with nothing and is
        // seen by no one: `verdict` still reads merge-ready, `marker` still reads merge-eligible.
        // Top-level and coded, in the same shape as `blockers`.
        expect(result.advisories).toEqual([{
            code   : 'APPROVAL_ANCHOR_STALE',
            message: result.predicate.advisories[0]
        }]);
        // the statement carries it too — that sentence travels beside `[merge-eligible]`, and one
        // that says "strict merge-ready" and stops is true and misleading in the same breath.
        // Asserted with the singular AGREEING, not merely present: this is the one human-facing
        // string in the observation, and `1 advisory/advisories require` reads as generated text a
        // reader discounts — so the grammar is part of the deliverable, not polish on top of it.
        expect(result.statement).toContain('1 advisory requires a reader judgement');
        expect(result.statement).not.toContain('advisory/advisories');
        expect(result.marker).toMatch(/^\[merge-eligible]/)
    });

    test('#17339: a clean observation carries an EMPTY advisories surface, not an absent one', async () => {
        const result = await project(dependencies());

        // The non-vacuity control for the case above: a top-level surface that only appears when
        // non-empty is a surface a consumer has to guard for, and `blockers` is unconditionally
        // present. An absent key and an empty one read the same at a glance and differently in code.
        expect(result.advisories).toEqual([]);
        expect(result.statement).not.toContain('advisory')
    });

    test('#17339: the LATEST approval is the anchor, whatever order the connection arrives in', async () => {
        const stale   = 'c'.repeat(40);
        const reviews = [
            // newest FIRST in the payload: if the derivation trusted connection order instead of
            // sorting, it would anchor on the stale one and report a false advisory — a WRONG
            // anchor rather than a missing one, which is the failure that would not look like a bug.
            {state: 'APPROVED',          submittedAt: '2026-07-29T07:30:00.000Z', commit: {oid: HEAD}},
            {state: 'APPROVED',          submittedAt: '2026-07-29T07:00:00.000Z', commit: {oid: stale}},
            {state: 'CHANGES_REQUESTED', submittedAt: '2026-07-29T07:45:00.000Z', commit: {oid: stale}},
            {state: 'COMMENTED',         submittedAt: '2026-07-29T07:50:00.000Z', commit: {oid: stale}}
        ];
        const result = await project(dependencies({snapshots: [pullRequest({reviews}), pullRequest({reviews})]}));

        // and a later COMMENTED/CHANGES_REQUESTED review does not become the anchor: only an
        // APPROVED review earns one.
        expect(result.predicate.advisories).toEqual([]);
    });

    test('#17339: an unfetched review connection yields silence, never a fresh-anchor claim', async () => {
        const deps   = dependencies({snapshots: [pullRequest({reviews: null}), pullRequest({reviews: null})]});
        const result = await project(deps);

        // The arm's subject, unchanged: the anchor certifies nothing, so a caller that never asked
        // for it is not making a weaker claim, and what must NOT happen is an advisory asserting
        // freshness it never observed.
        expect(result.predicate.advisories).toEqual([]);

        // The verdict, however, DID move with the §6.1 rule, and the two facts sit either side of
        // this module's fail-closed line. The same unfetched connection that leaves the anchor
        // silent also means nobody can see WHO approved — and the cross-family mandate is a
        // predicate field, not a reporting channel, so it must block rather than certify. Asserting
        // the reason as well as the outcome, so a future change cannot flip this back by accident.
        expect(result.verdict).not.toBe('merge-ready-observed');
        expect(result.predicate.blockers.some(entry => entry.includes('cross-family review mandate'))).toBe(true);
    });

    test('the CANONICAL body author wins over the opener login — drift cannot certify a merge', async () => {
        // The failure this arm exists for: an MCP `@me` drift stamps a different agent's login on
        // the PR. Body declares Grace (claude); the opener resolves to Emmy (gpt); the only approver
        // is Vega (claude). Reading the OPENER gives gpt-vs-claude and certifies. Reading the body
        // gives claude-vs-claude and blocks, which is the truth about who wrote it.
        const deps = dependencies({snapshots: [
            pullRequest({
                authorLogin: 'neo-gpt-emmy',
                body       : 'Authored by Grace (Claude Opus 5, Claude Code).',
                reviews    : [{state: 'APPROVED', submittedAt: '2026-07-29T07:00:00.000Z', commit: {oid: HEAD}, author: {login: 'neo-opus-vega'}}]
            }),
            pullRequest({
                authorLogin: 'neo-gpt-emmy',
                body       : 'Authored by Grace (Claude Opus 5, Claude Code).',
                reviews    : [{state: 'APPROVED', submittedAt: '2026-07-29T07:00:00.000Z', commit: {oid: HEAD}, author: {login: 'neo-opus-vega'}}]
            })
        ]});
        const result = await project(deps);

        expect(result.predicate.strictMergeReady).toBe(false);
        expect(result.predicate.blockers.some(entry => entry.includes('cross-family review mandate unsatisfied'))).toBe(true);
    });

    test('a truncated approvals window turns a NEGATIVE into unresolved, never a factual unsatisfied', async () => {
        // `reviews(last: 100)` is a suffix. With `hasPreviousPage: true`, a qualifying older approval
        // may sit outside it — so "no cross-family approver here" is missing evidence, not evidence
        // of absence. It must block, but with the could-not-evaluate reason, because the factual
        // message would assert something the data cannot support.
        const truncated = () => pullRequest({
            reviewsHasPreviousPage: true,
            reviews               : [{state: 'APPROVED', submittedAt: '2026-07-29T07:00:00.000Z', commit: {oid: HEAD}, author: {login: 'neo-opus-ada'}}]
        });
        const result = await project(dependencies({snapshots: [truncated(), truncated()]}));

        expect(result.predicate.strictMergeReady).toBe(false);
        expect(result.predicate.blockers.some(entry => entry.includes('could not be evaluated'))).toBe(true);
        expect(result.predicate.blockers.some(entry => entry.includes('mandate unsatisfied'))).toBe(false);
    });

    test('a POSITIVE cross-family witness inside a truncated window is still decisive', async () => {
        // The control that stops truncation-awareness from collapsing into "bounded means unknown":
        // one qualifying witness settles the question however many approvals lie beyond the suffix.
        const witnessed = () => pullRequest({
            reviewsHasPreviousPage: true,
            reviews               : [{state: 'APPROVED', submittedAt: '2026-07-29T07:00:00.000Z', commit: {oid: HEAD}, author: {login: 'neo-gpt-emmy'}}]
        });
        const result = await project(dependencies({snapshots: [witnessed(), witnessed()]}));

        expect(result.predicate.blockers.filter(entry => entry.includes('cross-family'))).toEqual([]);
    });

    /**
     * @summary The T1 window from the live incident: approved, then held, still reporting green.
     *
     * A reviewer approved, then posted `[MERGE_HOLD]` stating the prior approval was not a current
     * merge authorization. `reviewDecision` stayed APPROVED — it is a flattened snapshot with no
     * notion of supersession — and merge-readiness reported true while the owner had said stop. The
     * author had already broadcast merge-ready inside that window.
     */
    const withHold = ({token = 'MERGE_HOLD', holdAt = '2026-07-29T09:00:00.000Z', reviewAt = '2026-07-29T07:00:00.000Z', holder = 'neo-gpt-emmy', ...rest} = {}) => pullRequest({
        reviews : [{state: 'APPROVED', submittedAt: reviewAt, commit: {oid: HEAD}, author: {login: holder}}],
        comments: [{databaseId: 5301580683, createdAt: holdAt, author: {login: holder}, body: `## \`[${token}]\`\n\nMy prior approval is not a current merge authorization.`}],
        ...rest
    });

    test('a reviewer hold posted AFTER their approval blocks readiness, and names the holder', async () => {
        const result = await project(dependencies({snapshots: [withHold(), withHold()]}));

        expect(result.predicate.strictMergeReady).toBe(false);
        expect(result.predicate.blockers.some(entry => entry.includes('reviewer hold outstanding') && entry.includes('@neo-gpt-emmy'))).toBe(true);
    });

    test('only a NEWER submitted review from the SAME reviewer clears a hold', async () => {
        // Cleared: the holder reviews again after holding.
        const cleared = () => pullRequest({
            reviews : [
                {state: 'APPROVED', submittedAt: '2026-07-29T07:00:00.000Z', commit: {oid: HEAD}, author: {login: 'neo-gpt-emmy'}},
                {state: 'APPROVED', submittedAt: '2026-07-29T11:00:00.000Z', commit: {oid: HEAD}, author: {login: 'neo-gpt-emmy'}}
            ],
            comments: [{databaseId: 1, createdAt: '2026-07-29T09:00:00.000Z', author: {login: 'neo-gpt-emmy'}, body: '## `[MERGE_HOLD]`'}]
        });

        expect((await project(dependencies({snapshots: [cleared(), cleared()]}))).predicate.blockers.some(e => e.includes('reviewer hold'))).toBe(false);

        // NOT cleared by another peer's later review — a third party dispositioning someone else's
        // stop would read as deliberate while the holder still objects.
        const otherPeer = () => pullRequest({
            reviews : [
                {state: 'APPROVED', submittedAt: '2026-07-29T07:00:00.000Z', commit: {oid: HEAD}, author: {login: 'neo-gpt-emmy'}},
                {state: 'APPROVED', submittedAt: '2026-07-29T11:00:00.000Z', commit: {oid: HEAD}, author: {login: 'neo-opus-vega'}}
            ],
            comments: [{databaseId: 1, createdAt: '2026-07-29T09:00:00.000Z', author: {login: 'neo-gpt-emmy'}, body: '## `[MERGE_HOLD]`'}]
        });

        expect((await project(dependencies({snapshots: [otherPeer(), otherPeer()]}))).predicate.blockers.some(e => e.includes('reviewer hold'))).toBe(true);
    });

    test('prose containing the word hold is NOT a hold, and an unrecognised token is not one either', async () => {
        // Reviewers write "hold" constantly, including while declining to. Blocking on that would be
        // worse than the gap, because the reason would read as deliberate.
        const prose = () => withHold({token: 'NOT_A_REAL_TOKEN'});
        expect((await project(dependencies({snapshots: [prose(), prose()]}))).predicate.blockers.some(e => e.includes('reviewer hold'))).toBe(false);

        const chatty = () => pullRequest({
            reviews : [{state: 'APPROVED', submittedAt: '2026-07-29T07:00:00.000Z', commit: {oid: HEAD}, author: {login: 'neo-gpt-emmy'}}],
            comments: [{databaseId: 2, createdAt: '2026-07-29T09:00:00.000Z', author: {login: 'neo-gpt-emmy'}, body: 'No reason to hold this one — [MERGE_HOLD] would be overkill here.'}]
        });
        expect((await project(dependencies({snapshots: [chatty(), chatty()]}))).predicate.blockers.some(e => e.includes('reviewer hold'))).toBe(false);
    });

    test('an unfetched comment connection fails closed, and a truncated one is unresolved not "no hold"', async () => {
        const unfetched = () => pullRequest({comments: null});
        const a         = await project(dependencies({snapshots: [unfetched(), unfetched()]}));

        expect(a.predicate.blockers.some(e => e.includes('holdVerdict was not resolved'))).toBe(true);

        const truncated = () => pullRequest({commentsHasPreviousPage: true});
        const b         = await project(dependencies({snapshots: [truncated(), truncated()]}));

        expect(b.predicate.blockers.some(e => e.includes('could not be evaluated'))).toBe(true);
        expect(b.predicate.blockers.some(e => e.includes('reviewer hold outstanding'))).toBe(false);
    });

    test('#16902: query carries exact workflow-run coordinates instead of inferring attempts by job name', () => {
        for (const field of ['workflowRun', 'runNumber', 'runAttempt', 'resourcePath', 'databaseId']) {
            expect(GET_MERGE_READINESS).toContain(field);
        }
    });

    test('#16902: returns a checks verdict but withholds B-prime when Memory Core identity is unbound', async () => {
        const identityAssertion = {
            ok        : true,
            code      : 'OK',
            reason    : null,
            principals: {...PRINCIPALS, memoryCoreIdentity: null}
        };
        const deps   = dependencies();
        const result = await PullRequestService.getConversation({
            pr_number : 16029,
            projection: 'merge-readiness',
            identityAssertion
        }, deps);

        expect(result.verdict).toBe('unavailable');
        expect(result.checksVerdict).toBe('green');
        expect(result.checksGreen).toBe(true);
        expect(result.predicate.strictMergeReady).toBe(true);
        expect(result.identityBinding).toEqual({complete: false, missing: ['memoryCoreIdentity']});
        expect(result.principals.memoryCoreIdentity).toBeNull();
        expect(result.blockers).toContainEqual(expect.objectContaining({
            code             : 'IDENTITY_BINDING_MISSING',
            missingPrincipals: ['memoryCoreIdentity'],
            affects          : ['b-prime-certification']
        }));
        expect(result.marker).toBeUndefined();
        expect(result.audit).toContainEqual({
            source : 'memory-core-identity',
            outcome: 'unbound-certification-withheld'
        });
        expect(deps.calls()).toEqual({queryCall: 2, restCall: 2});
    });

    test('#16902: latest workflow invocation supersedes an earlier failure on the same exact head', async () => {
        const oldRun = workflowFixture({
            runId    : 31404455665,
            runNumber: 7355
        });
        const newRun = workflowFixture({
            runId    : 31406709306,
            runNumber: 7357
        });
        const contexts = [
            checkRun('failing', {workflow: oldRun}),
            checkRun('success', {workflow: newRun})
        ];
        const result = await project(dependencies({
            snapshots: [pullRequest({contexts}), pullRequest({contexts})]
        }));

        expect(result.verdict).toBe('merge-ready-observed');
        expect(result.contextStates[0].state).toBe('success');
        expect(result.emittedContexts).toHaveLength(1);
        expect(result.emittedContexts[0].workflow.runNumber).toBe(7357);
    });

    test('#16902: a genuinely failing latest workflow invocation remains red', async () => {
        const oldRun   = workflowFixture({runId: 10, runNumber: 9});
        const newRun   = workflowFixture({runId: 11, runNumber: 10});
        const contexts = [
            checkRun('success', {workflow: oldRun}),
            checkRun('failing', {workflow: newRun})
        ];
        const result = await project(dependencies({
            snapshots: [pullRequest({contexts}), pullRequest({contexts})]
        }));

        expect(result.verdict).toBe('not-merge-ready');
        expect(result.contextStates[0].state).toBe('failing');
        expect(result.emittedContexts[0].workflow.runNumber).toBe(10);
    });

    test('#16902: an optional latest failure makes the checks verdict non-green without changing B-prime', async () => {
        const optionalWorkflow = workflowFixture({
            id          : 288951422,
            name        : 'Agent PR Body Lint',
            resourcePath: '/neomjs/neo/actions/workflows/agent-pr-body-lint.yml',
            runId       : 12,
            runNumber   : 7355
        });
        const contexts = [
            checkRun('success'),
            checkRun('failing', {name: 'lint-pr-body', workflow: optionalWorkflow})
        ];
        const result = await project(dependencies({
            snapshots: [pullRequest({contexts}), pullRequest({contexts})]
        }));

        expect(result.checksGreen).toBe(true);
        expect(result.predicate.strictMergeReady).toBe(true);
        expect(result.verdict).toBe('merge-ready-observed');
        expect(result.emittedOnly).toEqual([
            expect.objectContaining({name: 'lint-pr-body', state: 'failing'})
        ]);
        expect(result.checksVerdict).toBe('not-green');
    });

    test('#16902: a newer attempt of one workflow run supersedes its earlier attempt', async () => {
        const oldAttempt = workflowFixture({runId: 20, runNumber: 12, runAttempt: 1});
        const newAttempt = workflowFixture({runId: 20, runNumber: 12, runAttempt: 2});
        const contexts   = [
            checkRun('failing', {workflow: oldAttempt}),
            checkRun('success', {workflow: newAttempt})
        ];
        const result = await project(dependencies({
            snapshots: [pullRequest({contexts}), pullRequest({contexts})]
        }));

        expect(result.contextStates[0].state).toBe('success');
        expect(result.emittedContexts[0].workflow.runAttempt).toBe(2);
    });

    test('#16902: generic job names from different workflows do not collapse into one population', async () => {
        const lintA = workflowFixture({
            id          : 278020769,
            name        : 'Agent PR Body Lint',
            resourcePath: '/neomjs/neo/actions/workflows/agent-pr-body-lint.yml',
            runId       : 30,
            runNumber   : 7357
        });
        const lintB = workflowFixture({
            id          : 288951422,
            name        : 'Config Template SSOT Lint',
            resourcePath: '/neomjs/neo/actions/workflows/config-template-ssot-lint.yml',
            runId       : 31,
            runNumber   : 970
        });
        const contexts = [
            checkRun('success', {name: 'lint', workflow: lintA}),
            checkRun('success', {name: 'lint', workflow: lintB})
        ];
        const result = await project(dependencies({
            rules    : [[], []],
            snapshots: [pullRequest({contexts}), pullRequest({contexts})]
        }));

        expect(result.emittedContexts).toHaveLength(2);
        expect(result.emittedContexts.map(item => item.workflow.resourcePath).sort()).toEqual([
            '/neomjs/neo/actions/workflows/agent-pr-body-lint.yml',
            '/neomjs/neo/actions/workflows/config-template-ssot-lint.yml'
        ]);
    });

    test('#16902: retains every job from the selected latest workflow run', async () => {
        const oldRun   = workflowFixture({runId: 40, runNumber: 20});
        const newRun   = workflowFixture({runId: 41, runNumber: 21});
        const contexts = [
            checkRun('failing', {name: 'old-job', workflow: oldRun}),
            checkRun('success', {name: 'lint', workflow: newRun}),
            checkRun('success', {name: 'unit', workflow: newRun})
        ];
        const result = await project(dependencies({
            rules    : [[], []],
            snapshots: [pullRequest({contexts}), pullRequest({contexts})]
        }));

        expect(result.emittedContexts.map(item => item.name).sort()).toEqual(['lint', 'unit']);
        expect(result.emittedContexts.every(item => item.workflow.runId === 41)).toBe(true);
    });

    test('#16902: preserves external checks without workflow-run coordinates', async () => {
        const contexts = [checkRun('success', {
            integration  : 'advanced-security',
            integrationId: 57789,
            name         : 'CodeQL',
            workflow     : null
        })];
        const result = await project(dependencies({
            rules    : [[], []],
            snapshots: [pullRequest({contexts}), pullRequest({contexts})]
        }));

        expect(result.checksVerdict).toBe('green');
        expect(result.emittedContexts).toHaveLength(1);
        expect(result.emittedContexts[0].workflow).toBeNull();
    });

    test('#16902: fails closed on incomplete or ambiguous workflow-run evidence', async () => {
        const sameTupleA = workflowFixture({id: 10, runId: 50, runNumber: 30, runAttempt: 2});
        const sameTupleB = workflowFixture({id: 10, runId: 51, runNumber: 30, runAttempt: 2});
        const cases      = [
            pullRequest({contexts: [checkRun('success', {workflow: null})]}),
            pullRequest({
                contexts: [
                    checkRun('success', {workflow: sameTupleA}),
                    checkRun('success', {workflow: sameTupleB})
                ]
            }),
            pullRequest({checkTotalCount: 2})
        ];

        for (const snapshot of cases) {
            const result = await project(dependencies({snapshots: [snapshot, snapshot]}));

            expect(result.checksVerdict).toBe('unknown');
            expect(result.blockers.map(item => item.code)).toContain('EMITTED_CONTEXTS_UNREADABLE');
            expect(result.marker).toBeUndefined();
        }
    });

    test('#16902: a missing exact-head rollup or commit mismatch cannot inherit another head', async () => {
        for (const snapshot of [
            pullRequest({checkRollupAvailable: false}),
            pullRequest({checkCommit: NEXT_HEAD})
        ]) {
            const result = await project(dependencies({snapshots: [snapshot, snapshot]}));

            expect(result.checksVerdict).toBe('unknown');
            expect(result.blockers.map(item => item.code)).toContain('EMITTED_CONTEXTS_UNREADABLE');
            expect(result.marker).toBeUndefined();
        }
    });

    test('preserves the default conversation projection shape and source count', async () => {
        let   calls  = 0;
        const result = await PullRequestService.getConversation({pr_number: 16029}, {
            query: async () => {
                calls++;
                return {
                    repository: {
                        pullRequest: {
                            title   : 'Conversation',
                            body    : 'Body',
                            author  : {login: 'neo-gpt'},
                            comments: {nodes: []}
                        }
                    }
                };
            }
        });

        expect(result.title).toBe('Conversation');
        expect(result.comments.nodes).toEqual([]);
        expect(result.projection).toBeUndefined();
        expect(calls).toBe(1);
    });

    test('distinguishes an unreadable required set from a readable empty set', async () => {
        const unreadable = await project(dependencies({
            restError: new Error('403 Forbidden')
        }));
        const empty = await project(dependencies({
            rules: [[], []]
        }));

        expect(unreadable.verdict).toBe('unavailable');
        expect(unreadable.blockers[0].code).toBe('REQUIRED_SET_UNREADABLE');
        expect(unreadable.marker).toBeUndefined();
        expect(empty.verdict).toBe('merge-ready-observed');
        expect(empty.requiredSet.contexts).toEqual([]);
    });

    test('#16902: reads every branch-rule page before an empty required set can become green', async () => {
        const fullPage = Array.from({length: 100}, (value, index) => ({
            type      : 'deletion',
            ruleset_id: index + 1
        }));
        const deps   = dependencies({rules: [fullPage, RULES, fullPage, RULES]});
        const result = await project(deps);

        expect(result.verdict).toBe('merge-ready-observed');
        expect(result.requiredSet.contexts).toEqual([
            {context: 'integration-parity', integrationId: 15368}
        ]);
        expect(deps.calls()).toEqual({queryCall: 2, restCall: 4});
        expect(deps.restPaths()).toEqual([
            {method: 'GET', path: '/repos/neomjs/neo/rules/branches/dev?per_page=100&page=1'},
            {method: 'GET', path: '/repos/neomjs/neo/rules/branches/dev?per_page=100&page=2'},
            {method: 'GET', path: '/repos/neomjs/neo/rules/branches/dev?per_page=100&page=1'},
            {method: 'GET', path: '/repos/neomjs/neo/rules/branches/dev?per_page=100&page=2'}
        ]);
    });

    test('#16902: fails closed when the bounded branch-rule read never reaches a terminal page', async () => {
        const fullPage = Array.from({length: 100}, (value, index) => ({
            type      : 'deletion',
            ruleset_id: index + 1
        }));
        const deps   = dependencies({rules: Array.from({length: 10}, () => fullPage)});
        const result = await project(deps);

        expect(result.verdict).toBe('unavailable');
        expect(result.blockers[0]).toEqual(expect.objectContaining({
            code   : 'REQUIRED_SET_UNREADABLE',
            message: 'Branch-rules response exceeded the bounded 10-page read.'
        }));
        expect(result.marker).toBeUndefined();
        expect(deps.calls()).toEqual({queryCall: 1, restCall: 10});
    });

    test('fails closed when the PR source moves during the observation', async () => {
        const result = await project(dependencies({
            snapshots: [pullRequest(), pullRequest({headRefOid: NEXT_HEAD, checkCommit: NEXT_HEAD})]
        }));

        expect(result.verdict).toBe('unavailable');
        expect(result.blockers[0].code).toBe('SOURCE_CHANGED_DURING_READ');
        expect(result.marker).toBeUndefined();
        expect(result.source.initial.head).toBe(HEAD);
        expect(result.source.final.head).toBe(NEXT_HEAD);
    });

    test('fails closed before source reads when AgentIdentity or GitHub identity is unbound', async () => {
        const assertions = [
            undefined,
            {...IDENTITY, principals: {...PRINCIPALS, agentIdentity: null}},
            {...IDENTITY, principals: {...PRINCIPALS, githubLogin: null}}
        ];

        for (const identityAssertion of assertions) {
            const deps   = dependencies();
            const result = await PullRequestService.getConversation({
                pr_number : 16029,
                projection: 'merge-readiness',
                identityAssertion
            }, deps);

            expect(result.verdict).toBe('unavailable');
            expect(result.blockers[0].code).toBe('IDENTITY_BINDING_MISSING');
            expect(result.marker).toBeUndefined();
            expect(deps.calls()).toEqual({queryCall: 0, restCall: 0});
        }
    });

    test('fails closed for a missing or wrong-integration required context', async () => {
        for (const contexts of [[], [checkRun('success', {integrationId: 999})]]) {
            const result = await project(dependencies({
                snapshots: [pullRequest({contexts}), pullRequest({contexts})]
            }));

            expect(result.verdict).toBe('not-merge-ready');
            expect(result.contextStates[0].state).toBe('absent-required');
            expect(result.marker).toBeUndefined();
        }
    });

    for (const state of ['pending', 'failing', 'skipped', 'not-applicable']) {
        test(`preserves required context state '${state}' and withholds the marker`, async () => {
            const contexts = [checkRun(state)];
            const result   = await project(dependencies({
                snapshots: [pullRequest({contexts}), pullRequest({contexts})]
            }));

            expect(result.verdict).toBe('not-merge-ready');
            expect(result.contextStates[0].state).toBe(state);
            expect(result.marker).toBeUndefined();
            expect(result.checksGreen).toBe(false);
        });
    }

    test('fails closed on truncated checks or reviewer requests', async () => {
        const checks = await project(dependencies({
            snapshots: [
                pullRequest({checkHasNextPage: true}),
                pullRequest({checkHasNextPage: true})
            ]
        }));
        const reviewers = await project(dependencies({
            snapshots: [
                pullRequest({reviewHasNextPage: true}),
                pullRequest({reviewHasNextPage: true})
            ]
        }));

        expect(checks.blockers.map(item => item.code)).toContain('EMITTED_CONTEXTS_UNREADABLE');
        expect(reviewers.blockers.map(item => item.code)).toContain('REVIEW_REQUESTS_UNREADABLE');
        expect(checks.marker).toBeUndefined();
        expect(reviewers.marker).toBeUndefined();
    });
});

import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'fs';
import os              from 'node:os';
import path            from 'path';
import vm              from 'vm';
import * as yaml       from 'js-yaml';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

test.describe('Neo.ai.services.github-workflow.PullRequestService — checkoutPullRequest (#13052)', () => {
    let buildCheckoutPullRequest;

    const silentLogger = {error: () => {}};

    test.beforeAll(async () => {
        ({buildCheckoutPullRequest} = await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs'));
    });

    test('refuses checkout when caller workspace repoPath is absent', async () => {
        let   execCalls           = 0;
        const checkoutPullRequest = buildCheckoutPullRequest({
            projectRoot: '/server/shared-repo',
            log        : silentLogger,
            execFileFn : async () => {
                execCalls++;
                throw new Error('should not execute git or gh');
            }
        });

        const result = await checkoutPullRequest(13050);

        expect(result.error).toBe('Unsafe checkout refused');
        expect(result.code).toBe('CALLER_WORKSPACE_REQUIRED');
        expect(result.repoPath).toBe('/server/shared-repo');
        expect(result.message).toContain('cannot infer the caller workspace');
        expect(execCalls).toBe(0);
    });

    test('rejects repoPath that is not the git top-level', async () => {
        const calls               = [];
        const checkoutPullRequest = buildCheckoutPullRequest({
            projectRoot: '/server/shared-repo',
            log        : silentLogger,
            execFileFn : async (command, args, options) => {
                calls.push({command, args, cwd: options.cwd});
                return {stdout: '/tmp/caller-worktree\n'};
            }
        });

        const result = await checkoutPullRequest({
            pr_number: 13050,
            repoPath : '/tmp/caller-worktree/subdir'
        });

        expect(result.error).toBe('Unsafe checkout refused');
        expect(result.code).toBe('REPO_PATH_NOT_GIT_ROOT');
        expect(result.repoPath).toBe('/tmp/caller-worktree/subdir');
        expect(result.gitTopLevel).toBe('/tmp/caller-worktree');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({
            command: 'git',
            args   : ['rev-parse', '--show-toplevel'],
            cwd    : '/tmp/caller-worktree/subdir'
        });
    });

    test('checks out explicit repoPath and returns read-back git state', async () => {
        const calls               = [];
        const checkoutPullRequest = buildCheckoutPullRequest({
            projectRoot: '/server/shared-repo',
            log        : silentLogger,
            execFileFn : async (command, args, options) => {
                calls.push({command, args, cwd: options.cwd});

                if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return {stdout: '/tmp/caller-worktree\n'};
                }

                if (command === 'gh') {
                    return {stdout: "Switched to branch 'agent/13050-fixture'\n"};
                }

                if (command === 'git' && args[0] === 'branch') {
                    return {stdout: 'agent/13050-fixture\n'};
                }

                if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
                    return {stdout: '0123456789abcdef0123456789abcdef01234567\n'};
                }

                throw new Error(`unexpected command ${command} ${args.join(' ')}`);
            }
        });

        const result = await checkoutPullRequest({
            pr_number: 13050,
            repoPath : '/tmp/caller-worktree'
        });

        expect(result.error).toBeUndefined();
        expect(result.repoPath).toBe('/tmp/caller-worktree');
        expect(result.branch).toBe('agent/13050-fixture');
        expect(result.headSha).toBe('0123456789abcdef0123456789abcdef01234567');
        expect(result.details).toContain('Switched to branch');
        expect(calls.map(call => call.cwd)).toEqual([
            '/tmp/caller-worktree',
            '/tmp/caller-worktree',
            '/tmp/caller-worktree',
            '/tmp/caller-worktree'
        ]);
        expect(calls[1]).toEqual({
            command: 'gh',
            args   : ['pr', 'checkout', '13050'],
            cwd    : '/tmp/caller-worktree'
        });
    });

    test('surfaces gh checkout failure without reporting success state', async () => {
        const calls = [];
        const error = new Error('checkout failed');
        error.code = 1;
        error.stderr = 'could not find remote ref';

        const checkoutPullRequest = buildCheckoutPullRequest({
            projectRoot: '/server/shared-repo',
            log        : silentLogger,
            execFileFn : async (command, args, options) => {
                calls.push({command, args, cwd: options.cwd});

                if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return {stdout: '/tmp/caller-worktree\n'};
                }

                throw error;
            }
        });

        const result = await checkoutPullRequest({
            pr_number: 99999,
            repoPath : '/tmp/caller-worktree'
        });

        expect(result.error).toBe('GitHub CLI command failed');
        expect(result.code).toBe('GH_CLI_ERROR');
        expect(result.repoPath).toBe('/tmp/caller-worktree');
        expect(result.details).toContain('could not find remote ref');
        expect(result.branch).toBeUndefined();
        expect(result.headSha).toBeUndefined();
        expect(calls).toHaveLength(2);
    });
});

/**
 * @summary Contract coverage for `PullRequestService.getConversation` comment-selector params.
 *
 * Before selector support, `getConversation(prNumber)` always returned the full PR conversation;
 * every review cycle N+1 paid context-fetch cost proportional to cumulative thread size. The
 * service now exposes three optional selectors (`comment_id`, `since_comment_id`, `last_n`) that
 * narrow the returned comments array at the cost of one client-side filter pass.
 *
 * These tests pin the selector contract:
 * 1. No selectors → full conversation (backward-compat path).
 * 2. `comment_id` → single-comment result (exact-match filter).
 * 3. `since_comment_id` → comments strictly after the anchor (exclusive).
 * 4. `last_n` → last N comments (by order).
 * 5. Selector precedence (comment_id > since_comment_id > last_n) when multiple passed.
 * 6. Legacy positional `prNumber` accepted (backward compat migration path).
 *
 * Each test mocks `GraphqlService.query` to return a controlled four-comment fixture so
 * filter behavior is assertable without an actual GitHub API round-trip.
 *
 * @see Neo.ai.services.github-workflow.PullRequestService#getConversation
 */
test.describe('Neo.ai.services.github-workflow.PullRequestService — getConversation (#10272)', () => {
    let PullRequestService;
    let GraphqlService;
    let originalQuery;

    const COMMENT_A = {id: 'IC_a1111', author: {login: 'alice'}, body: 'First comment',  createdAt: '2026-04-24T01:00:00Z'};
    const COMMENT_B = {id: 'IC_b2222', author: {login: 'bob'},   body: 'Second comment', createdAt: '2026-04-24T01:10:00Z'};
    const COMMENT_C = {id: 'IC_c3333', databaseId: 5301283039, author: {login: 'alice'}, body: 'Third comment',  createdAt: '2026-04-24T01:20:00Z'};
    const COMMENT_D = {id: 'IC_d4444', author: {login: 'bob'},   body: 'Fourth comment', createdAt: '2026-04-24T01:30:00Z'};

    const PR_FIXTURE = {
        title   : 'Test PR',
        body    : 'Body text',
        author  : {login: 'alice'},
        comments: {
            nodes: [COMMENT_A, COMMENT_B, COMMENT_C, COMMENT_D]
        }
    };

    test.beforeAll(async () => {
        GraphqlService      = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        PullRequestService  = (await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(() => {
        GraphqlService.query = originalQuery;
    });

    test.beforeEach(() => {
        GraphqlService.query = async () => ({repository: {pullRequest: PR_FIXTURE}});
    });

    test('returns full conversation when no selector is passed (backward-compat default)', async () => {
        const result = await PullRequestService.getConversation({pr_number: 10272});

        expect(result.title).toBe('Test PR');
        expect(result.comments.nodes).toHaveLength(4);
        expect(result.comments.nodes[0].id).toBe('IC_a1111');
        expect(result.comments.nodes[3].id).toBe('IC_d4444');
    });

    test('accepts legacy positional prNumber form (backward-compat migration path)', async () => {
        // Existing callers may pass `prNumber` positionally. The object-form
        // signature must tolerate both forms to avoid a breaking change. Same result as
        // the object form, just demonstrating the calling convention still works.
        const result = await PullRequestService.getConversation(10272);

        expect(result.title).toBe('Test PR');
        expect(result.comments.nodes).toHaveLength(4);
    });

    test('comment_id accepts every spelling, and a scoped request omits the PR body (#17142)', async () => {
        // The PR path had no service-level selector arms at all — only the pure helper and the
        // Discussion path were covered, so this surface's wiring was asserted nowhere (@neo-gpt).
        // `5301283039` is a real PR-comment databaseId shape; the legacy base64 form is the
        // regression case strict equality used to accept.
        for (const spelling of [
            'IC_c3333',
            '5301283039',
            'issuecomment-5301283039',
            'https://github.com/neomjs/neo/pull/10272#issuecomment-5301283039'
        ]) {
            const result = await PullRequestService.getConversation({pr_number: 10272, comment_id: spelling});

            expect(result.comments.nodes.map(c => c.id), spelling).toEqual(['IC_c3333']);
            expect(result.body,        `${spelling}: scoped body omitted`).toBeUndefined();
            expect(result.bodyOmitted, `${spelling}: omission announced`).toBe(true);
            expect(result.title,       `${spelling}: title survives scoping`).toBe('Test PR');
        }
    });

    test('a malformed comment_id ERRORS; a well-formed absent one returns empty (#17142)', async () => {
        const malformed = await PullRequestService.getConversation({pr_number: 10272, comment_id: 'not_an_id'});

        expect(malformed.code).toBe('MALFORMED_COMMENT_ID');
        expect(malformed.comments).toBeUndefined();

        const absent = await PullRequestService.getConversation({pr_number: 10272, comment_id: 'IC_nope9999'});

        expect(absent.code).toBeUndefined();
        expect(absent.comments.nodes).toEqual([]);
    });

    test('an EMPTY comment_id errors instead of returning the whole unscoped thread (#17142)', async () => {
        const result = await PullRequestService.getConversation({pr_number: 10272, comment_id: ''});

        expect(result.code).toBe('MALFORMED_COMMENT_ID');
        expect(result.body).toBeUndefined();
    });

    test('since_comment_id accepts the same spellings and is scoped too (#17142)', async () => {
        const result = await PullRequestService.getConversation({
            pr_number       : 10272,
            since_comment_id: 'issuecomment-5301283039'
        });

        expect(result.comments.nodes.map(c => c.id)).toEqual(['IC_d4444']);
        expect(result.bodyOmitted).toBe(true);

        const malformed = await PullRequestService.getConversation({pr_number: 10272, since_comment_id: 'evilcomment-1'});

        expect(malformed.code).toBe('MALFORMED_COMMENT_ID');
    });

    test('comment_id selector returns only the matching comment', async () => {
        const result = await PullRequestService.getConversation({
            pr_number : 10272,
            comment_id: 'IC_c3333'
        });

        expect(result.title).toBe('Test PR');  // PR metadata preserved
        expect(result.comments.nodes).toHaveLength(1);
        expect(result.comments.nodes[0].id).toBe('IC_c3333');
        expect(result.comments.nodes[0].body).toBe('Third comment');
    });

    test('comment_id selector returns empty when id not found (no match ≠ fallback to full)', async () => {
        // Critical distinction: a non-matching id must return zero comments, not fall
        // through to full-conversation fetch. Silent fallthrough would mask bugs where
        // caller's comment_id is stale/invalid.
        const result = await PullRequestService.getConversation({
            pr_number : 10272,
            comment_id: 'IC_nonexistent'
        });

        expect(result.title).toBe('Test PR');
        expect(result.comments.nodes).toHaveLength(0);
    });

    test('since_comment_id selector returns comments strictly AFTER the anchor', async () => {
        const result = await PullRequestService.getConversation({
            pr_number       : 10272,
            since_comment_id: 'IC_b2222'  // anchor = 2nd comment
        });

        expect(result.comments.nodes).toHaveLength(2);
        expect(result.comments.nodes[0].id).toBe('IC_c3333');  // 3rd
        expect(result.comments.nodes[1].id).toBe('IC_d4444');  // 4th
    });

    test('since_comment_id at the last comment returns empty (nothing after)', async () => {
        // Common usage pattern: agent tracks last-seen commentId, polls for new comments.
        // When no new comments exist, empty result is the correct "nothing new" signal.
        const result = await PullRequestService.getConversation({
            pr_number       : 10272,
            since_comment_id: 'IC_d4444'  // anchor = last comment
        });

        expect(result.comments.nodes).toHaveLength(0);
    });

    test('since_comment_id with invalid id returns empty (same shape as "nothing after")', async () => {
        // Caller interprets empty result as either "nothing new since N" or "invalid id".
        // Inferring intent would hide bugs; surfacing empty result lets caller decide.
        const result = await PullRequestService.getConversation({
            pr_number       : 10272,
            since_comment_id: 'IC_nonexistent'
        });

        expect(result.comments.nodes).toHaveLength(0);
    });

    test('last_n selector returns last N comments in order', async () => {
        const result = await PullRequestService.getConversation({
            pr_number: 10272,
            last_n   : 2
        });

        expect(result.comments.nodes).toHaveLength(2);
        expect(result.comments.nodes[0].id).toBe('IC_c3333');  // 3rd of 4
        expect(result.comments.nodes[1].id).toBe('IC_d4444');  // 4th of 4
    });

    test('last_n larger than available returns all comments', async () => {
        // Array.slice(-N) behavior: negative index larger than length returns whole array.
        // Asserting this explicitly so agents don't second-guess the edge case.
        const result = await PullRequestService.getConversation({
            pr_number: 10272,
            last_n   : 100
        });

        expect(result.comments.nodes).toHaveLength(4);
    });

    test('selector precedence: comment_id wins over since_comment_id and last_n', async () => {
        // When multiple selectors are passed, documented precedence applies.
        // Comment_id is the most specific (single-comment fetch) so it takes priority.
        const result = await PullRequestService.getConversation({
            pr_number       : 10272,
            comment_id      : 'IC_a1111',
            since_comment_id: 'IC_b2222',
            last_n          : 2
        });

        expect(result.comments.nodes).toHaveLength(1);
        expect(result.comments.nodes[0].id).toBe('IC_a1111');  // comment_id won
    });

    test('selector precedence: since_comment_id wins over last_n when comment_id absent', async () => {
        const result = await PullRequestService.getConversation({
            pr_number       : 10272,
            since_comment_id: 'IC_c3333',
            last_n          : 2
        });

        expect(result.comments.nodes).toHaveLength(1);
        expect(result.comments.nodes[0].id).toBe('IC_d4444');  // since_comment_id won
    });

    test('rejects missing pr_number with structured error (object form)', async () => {
        let callCount = 0;
        GraphqlService.query = async () => { callCount++; return null; };

        const result = await PullRequestService.getConversation({comment_id: 'IC_a1111'});

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(callCount).toBe(0);  // no GraphQL call made
    });

    test('propagates GraphQL error shape on API failure', async () => {
        GraphqlService.query = async () => {
            throw new Error('GitHub API authentication failed');
        };

        const result = await PullRequestService.getConversation({pr_number: 10272});

        expect(result.error).toBe('GraphQL API request failed');
        expect(result.code).toBe('GRAPHQL_API_ERROR');
        expect(result.message).toContain('authentication');
    });
});

test.describe('Neo.ai.services.github-workflow.PullRequestService — getPullRequestDiff (#10748)', () => {
    test.skip(skipCiGitHubAuth, 'CI-skip: gh CLI auth not configured - bucket C (#10903)');

    let PullRequestService;
    let fs;
    let path;
    let aiConfig;

    test.beforeAll(async () => {
        PullRequestService = (await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs')).default;
        aiConfig           = (await import('../../../../../../ai/mcp/server/github-workflow/config.template.mjs')).default;
        fs                 = await import('fs/promises');
        path               = await import('path');
    });

    test('files_only parameter returns structured JSON without diff body', async () => {
        const result = await PullRequestService.getPullRequestDiff({
            pr_number : 10747,
            files_only: true
        });

        expect(Array.isArray(result.files)).toBe(true);
        expect(result.files.some(f => f.path.includes('cognitive-load-baseline'))).toBe(true);
    });

    test('file parameter filters the diff output', async () => {
        const result = await PullRequestService.getPullRequestDiff({
            pr_number: 10747,
            file     : 'learn/agentos/measurements/cognitive-load-baseline-2026-05.md'
        });

        expect(typeof result.result).toBe('string');
        expect(result.result).toContain('Sub 4 Payload Audit Results');
    });

    test('AC3 Empirical Guard: sha-pinned diff is immune to local working tree mutations', async () => {
        const params = {
            pr_number: 10747,
            file     : 'learn/agentos/measurements/cognitive-load-baseline-2026-05.md',
            sha      : 'd8913f1fa89f585a237a5e54992b2d12865e4fb6'
        };

        // 1. Capture baseline output
        const baseline = await PullRequestService.getPullRequestDiff(params);

        // 2. Mutate local working tree
        const targetFilePath  = path.join(aiConfig.projectRoot, params.file);
        const originalContent = await fs.readFile(targetFilePath, 'utf-8');
        const mutatedContent  = originalContent + '\n\n# MUTATED WORKING TREE\n';
        await fs.writeFile(targetFilePath, mutatedContent);

        try {
            // 3. Re-run
            const rerunning = await PullRequestService.getPullRequestDiff(params);

            // 4. Assert byte-identical output
            expect(rerunning.result).toBe(baseline.result);
        } finally {
            // Restore
            await fs.writeFile(targetFilePath, originalContent);
        }
    });

    test('rejects invalid sha format', async () => {
        const result = await PullRequestService.getPullRequestDiff({
            pr_number: 10747,
            file     : 'some/file.md',
            sha      : 'invalid-sha-xyz; touch /tmp/pwned'
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('INVALID_ARGUMENTS');
    });

    test('rejects sha without file parameter', async () => {
        const result = await PullRequestService.getPullRequestDiff({
            pr_number: 10747,
            sha      : 'd8913f1fa89f585a237a5e54992b2d12865e4fb6'
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('INVALID_ARGUMENTS');
    });

    test('returns SHA_NOT_FOUND for non-existent commit', async () => {
        const result = await PullRequestService.getPullRequestDiff({
            pr_number: 10747,
            file     : 'some/file.md',
            sha      : '0000000000000000000000000000000000000000'
        });

        expect(result.error).toBe('SHA not found');
        expect(result.code).toBe('SHA_NOT_FOUND');
    });
});

/**
 * @summary Returns the inline GitHub Script used by the agent PR review-body lint workflow.
 * @returns {String} The workflow script source.
 */
function getAgentPrReviewBodyLintScript() {
    const
        workflowPath = path.resolve(process.cwd(), '.github/workflows/agent-pr-review-body-lint.yml'),
        workflow     = yaml.load(fs.readFileSync(workflowPath, 'utf8')),
        step         = workflow.jobs['lint-pr-review-body'].steps.find(item => item.name === 'Validate PR Review Body');

    return step.with.script;
}

/**
 * @summary Executes the review-body lint workflow script with stubbed GitHub Actions services.
 * @param {Object} options Execution options.
 * @param {String} options.body Review body to validate.
 * @param {Object|null} [options.activationIssue] Activation issue GraphQL projection.
 * @param {String} [options.createdAt='2026-07-16T13:57:02Z'] Reviewed PR creation timestamp.
 * @param {String} [options.reviewer='neo-gpt'] GitHub login for the simulated reviewer.
 * @param {String} [options.state='approved'] GitHub webhook review state.
 * @returns {Promise<Object>} Captured workflow comments, failures, and log lines.
 */
async function runAgentPrReviewBodyLintWorkflow({
    activationIssue,
    body,
    createdAt = '2026-07-16T13:57:02Z',
    reviewer = 'neo-gpt',
    state = 'approved'
} = {}) {
    const
        comments = [],
        failures = [],
        logs     = [],
        context  = {
            repo   : {owner: 'neomjs', repo: 'neo'},
            payload: {
                review: {
                    id  : 1391001,
                    user: {login: reviewer},
                    body,
                    state
                },
                pull_request: {created_at: createdAt, number: 13910}
            }
        },
        coreStub = {
            setFailed: message => failures.push(message)
        },
        defaultActivationIssue = {
            id                            : 'I_kwDOABcD15257',
            closedByPullRequestsReferences: {
                totalCount: 1,
                nodes     : [{
                    number     : 15310,
                    state      : 'MERGED',
                    mergedAt   : '2026-07-16T13:57:03Z',
                    baseRefName: 'dev'
                }],
                pageInfo: {hasNextPage: false}
            }
        },
        githubStub = {
            graphql: async () => ({
                repository: {
                    activationIssue: activationIssue === undefined ? defaultActivationIssue : activationIssue
                }
            }),
            rest: {
                issues: {
                    createComment: async payload => comments.push(payload)
                }
            }
        },
        consoleStub = {
            log: message => logs.push(message)
        };

    await vm.runInNewContext(
        `(async () => {\n${getAgentPrReviewBodyLintScript()}\n})()`,
        {
            console: consoleStub,
            context,
            core   : coreStub,
            github : githubStub
        },
        {timeout: 1000}
    );

    return {comments, failures, logs};
}

/**
 * @summary Contract coverage for `PullRequestService.managePrReview`.
 *
 * Closes the formal-state gap: atomic create or update of a formal pull request review
 * via the `addPullRequestReview` / `updatePullRequestReview` GraphQL mutations.
 *
 * Tests pin the contract:
 * 1. `action: 'create'` requires `pr_number`, `state` (mapped to event enum), `body`.
 * 2. State enum `APPROVED|REQUEST_CHANGES|COMMENT` maps to GraphQL event `APPROVE|REQUEST_CHANGES|COMMENT`.
 * 3. `action: 'update'` requires `review_id` + `body`; body-only update; state cannot transition.
 * 4. PR-id resolution failure (PR not found) returns `PR_NOT_FOUND` cleanly.
 * 5. Argument validation errors are surfaced (invalid action / missing body / invalid state / etc.).
 *
 * Each test mocks `GraphqlService.query` to return controlled fixtures so the mutation
 * contract is assertable without GitHub API round-trips.
 *
 * @see Neo.ai.services.github-workflow.PullRequestService#managePrReview
 */
test.describe('Neo.ai.services.github-workflow.PullRequestService — managePrReview (#11273)', () => {
    let PullRequestService;
    let GraphqlService;
    let RepositoryService;
    let getRound2DispositionRelationFailure;
    let originalQuery;
    let originalViewerLogin;

    // The submitting reviewer's family is what a round is charged to, so every budget case has to say
    // who is submitting. Seeded as a rostered gpt identity by default; the cases that care about
    // cross-family independence or an unclassifiable submitter override it per test.
    const SUBMITTING_LOGIN           = 'neo-gpt-emmy';
    const PR_NODE_ID                 = 'PR_kwDOABcD9999999999';
    const PR_HEAD_OID                = 'abcdef1234567890abcdef1234567890abcdef12';
    const REVIEW_BUDGET_ACTIVATED_AT = '2026-07-16T13:57:03Z';
    const REVIEW_NODE                = {
        id         : 'PRR_kwDOABcD1111111111',
        url        : 'https://github.com/neomjs/neo/pull/11273#pullrequestreview-12345',
        state      : 'APPROVED',
        submittedAt: '2026-05-13T00:00:00Z',
        databaseId : 12345
    };
    const pullRequestNode = (overrides = {}) => ({
        createdAt     : '2026-07-16T13:57:02Z',
        id            : PR_NODE_ID,
        headRefOid    : PR_HEAD_OID,
        reviewDecision: 'APPROVED',
        reviews       : {nodes: [], pageInfo: {hasPreviousPage: false}},
        ...overrides
    });
    const activationPullRequest = (overrides = {}) => ({
        id         : 'PR_kwDOABcD15310',
        number     : 15310,
        state      : 'MERGED',
        mergedAt   : REVIEW_BUDGET_ACTIVATED_AT,
        baseRefName: 'dev',
        ...overrides
    });
    const activationIssueNode = (nodes = [activationPullRequest()], overrides = {}) => ({
        id                            : 'I_kwDOABcD15257',
        closedByPullRequestsReferences: {
            totalCount: nodes.length,
            nodes,
            pageInfo  : {hasNextPage: false}
        },
        ...overrides
    });
    const pullRequestLookup = (pullRequestOverrides = {}, activationIssue = activationIssueNode()) => ({
        repository: {
            activationIssue,
            pullRequest: pullRequestNode(pullRequestOverrides)
        }
    });

    // Compact review body that passes BOTH layers of the tool-boundary template-anchor validator:
    // - VISIBLE layer: the 7 evaluation-metric tags from pr-review-template.md / pr-review-followup-template.md
    // - INVISIBLE layer: structural anchors NOT enumerated in error responses; see
    //   `INVISIBLE_PR_REVIEW_ANCHORS` constant in `ai/services/github-workflow/PullRequestService.mjs`
    //   for the canonical list. Tests deliberately compose this constant with structural substrings
    //   present (rather than naming the invisible-list in test prose) to avoid leaking the safeguard
    //   into discovery surfaces while still asserting behavior.
    // Substantive review content (prose, depth-floor, audit findings) is the peer-reviewer's responsibility;
    // this constant only satisfies the mechanical depth-floor gate so the downstream behavior under test
    // (action dispatch, GraphQL error handling, PR_NOT_FOUND) can be exercised.
    const REVIEW_ORIGIN_SESSION_ID = '8c622ae9-0ef1-4bf1-9a27-5dfe228b4fac';

    const VALID_REVIEW_BODY = [
        '# PR Review Summary',
        '',
        '**Status:** Approved',
        '',
        '### 🪜 Strategic-Fit Decision',
        '- Decision: Approve',
        '',
        '### 🧭 Patch-Blind Premise Snapshot',
        '* **Inputs Read Before Patch:** ticket, changed-file list, current dev source.',
        '* **Expected Solution Shape:** preserve the selected review template skeleton.',
        '* **Patch Verdict:** matches the expected shape.',
        '* **Premise Coherence:** coheres: a substrate validator fix; flat-peer-team / facilitator-not-delegator unaffected.',
        '',
        '### 🕸️ Context & Graph Linking',
        '* **Target Epic / Issue ID:** Resolves #11273',
        '* **Related Graph Nodes:** #11491',
        `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
        '',
        '### 🔬 Depth Floor',
        '- Documented search: scanned all relevant surfaces.',
        '',
        '### 🧠 Graph Ingestion Notes',
        '* **`[KB_GAP]`**: N/A.',
        '* **`[TOOLING_GAP]`**: N/A.',
        '* **`[RETROSPECTIVE]`**: Template validator fixture.',
        '',
        '### 📋 Required Actions',
        'No required actions — eligible for human merge.',
        '',
        '### 📊 Evaluation Metrics',
        '[ARCH_ALIGNMENT]: 80 - structural fit',
        '[CONTENT_COMPLETENESS]: 80 - covers AC matrix',
        '[EXECUTION_QUALITY]: 80 - tests pass',
        '[PRODUCTIVITY]: 70 - bounded scope',
        '[IMPACT]: 60 - localized substrate fix',
        '[COMPLEXITY]: 40 - mechanical change',
        '[EFFORT_PROFILE]: Quick Win'
    ].join('\n');

    const VALID_FOLLOWUP_REVIEW_BODY = [
        '# PR Review Follow-Up — exceptional verdicts only',
        '',
        '**Status:** Approved',
        '',
        '**Opening:** Re-checking the addressed delta.',
        '',
        '### 🧭 Patch-Blind Premise Snapshot',
        '* **Inputs Read Before Patch:** prior review, author response, changed-file list.',
        '* **Expected Solution Shape:** narrow delta preserves prior approval anchors.',
        '* **Patch Verdict:** matches the expected delta.',
        '* **Premise Coherence:** coheres: a narrow delta; no value-surface change.',
        '',
        '### 🪜 Strategic-Fit Decision',
        '- **Decision**: Approve',
        '- **Rationale**: The delta resolves the prior blocker.',
        '',
        '### ⚓ Prior Review Anchor',
        '* **PR:** #11273',
        '* **Target Issue:** #11491',
        '* **Prior Review Comment ID:** PRR_123',
        '* **Author Response Comment ID:** IC_456',
        '* **Latest Head SHA:** abc1234',
        `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
        '',
        '### 🔁 Delta Scope',
        '* **Files changed:** PR body only',
        '* **PR body / close-target changes:** pass',
        '* **Branch freshness / merge state:** clean',
        '',
        '### ✅ Previous Required Actions Audit',
        '* **Addressed:** prior template miss — current body keeps canonical headings.',
        '',
        '### 🔬 Delta Depth Floor',
        '* **Documented search:** I actively checked changed metadata, the prior blocker, and close-target state and found no new concerns.',
        '',
        '### 🔬 Premise Falsifiers',
        '* **Source-coordinate falsifiers:** N/A — this fixture is not a Drop+Supersede.',
        '* **What survives:** the whole diff; nothing is being retired.',
        '',
        '### 📊 Metrics Delta',
        '* **`[ARCH_ALIGNMENT]`**: unchanged from prior review',
        '* **`[CONTENT_COMPLETENESS]`**: unchanged from prior review',
        '* **`[EXECUTION_QUALITY]`**: unchanged from prior review',
        '* **`[PRODUCTIVITY]`**: unchanged from prior review',
        '* **`[IMPACT]`**: unchanged from prior review',
        '* **`[COMPLEXITY]`**: unchanged from prior review',
        '* **`[EFFORT_PROFILE]`**: unchanged from prior review',
        '',
        '### 📋 Required Actions',
        '',
        'No required actions — eligible for human merge.'
    ].join('\n');

    // An ATTEMPTED SECOND ORDINARY RC, which is a different body class from a Round-2 disposition and
    // is the vehicle the ordinary-budget cases need. A second RC raises a fresh action packet, so its
    // valid shape is the canonical full Round-1 review — the budget still sees it and still refuses it.
    //
    // The comment that stood here claimed ordinary `REQUEST_CHANGES` reviews are "precisely this
    // [Round-2 disposition] shape". That was my false premise, and @neo-gpt named it: once Round 2
    // became disposition-only it can never BE a Request Changes, so pointing the budget cases at the
    // disposition body made their vehicle semantically stale rather than corrected.
    const VALID_ORDINARY_REQUEST_CHANGES_BODY = VALID_REVIEW_BODY
        .replace('**Status:** Approved', '**Status:** Request Changes')
        .replace('- Decision: Approve', '- Decision: Request Changes')
        .replace(
            '### 📋 Required Actions\nNo required actions — eligible for human merge.',
            '### 📋 Required Actions\n\n- [ ] name the boundary this must not hardcode'
        );

    // Ordinary Round 2 — the carried-action disposition. Reserved for relation and state cases:
    // COMMENT when anything is STILL_OPEN, APPROVED when every prior action is discharged.
    const VALID_ROUND_2_REVIEW_BODY = [
        '# PR Review — Round 2 (disposition only)',
        '',
        '**Status:** Approved',
        '',
        '**Opening:** Dispositioning the Round-1 actions at the repaired head.',
        '',
        '### ⚓ Anchor',
        '* **PR / Target Issue:** #11273 / #11491',
        '* **Round-1 Review ID:** PRR_123 · **Author Response:** IC_456',
        '* **Head under review:** abc1234',
        `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
        '',
        '### 📋 Disposition',
        '',
        '| # | Required Action (verbatim from Round 1) | Disposition | Evidence |',
        '|---|---|---|---|',
        '| RA-1 | prior template miss | ADDRESSED | current body keeps canonical headings |',
        '',
        '### 🔚 Verdict',
        '',
        'Approve — no remaining blocker.'
    ].join('\n');

    const VALID_MICRO_DELTA_REVIEW_BODY = [
        '# Pull Request Micro-Delta Review',
        '',
        '> **Context:** This review uses the Micro-Delta format because prior semantic review is complete and only mechanical-hygiene or metadata-drift remains.',
        '',
        '### State Vector',
        '- **Target SHA:** abc1234',
        `- **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
        '- **Current reviewDecision:** CHANGES_REQUESTED',
        '- **Semantic Status:** APPROVED',
        '- **CI Status:** GREEN',
        '- **Remaining Blocker Class:** mechanical-hygiene',
        '- **Measured Discussion Cost:** > 24KB',
        '',
        '### Micro-Delta Focus',
        '*Only defects classified as `mechanical-hygiene` or `metadata-drift` are reviewed here.*',
        '',
        '- `[x]` **Issue 1:** ai/config.template.mjs - stale wording repaired.',
        '',
        '### Verdict',
        '- [ ] **APPROVED** (All mechanical-hygiene cleared. Merge-ready.)',
        '- [x] **COMMENTED CLOSURE** (RC2 budget spent; record the closure packet without creating another ordinary RC.)',
        '- [ ] **MAINTAINER POLISH FAST PATH APPLIED** (Reviewer unilaterally patched and pushed fixes. Approved.)',
        '',
        '### RC2 Closure Packet',
        '- **Consumer sweep:** Fleet card and detail consumers checked.',
        '- **Falsifier/property matrix:** Existing RA properties all pass.',
        '- **Carried-vs-new census:** two carried, zero new.',
        '- **Truth-fold:** ticket and PR body now match the exact head.',
        '- **Semantic-surface freeze:** only the existing roster capability may receive property refinements.'
    ].join('\n');

    const VALID_DROP_SUPERSEDE_REVIEW_BODY = VALID_FOLLOWUP_REVIEW_BODY
        .replace('**Status:** Approved', '**Status:** Drop+Supersede')
        .replace('- **Decision**: Approve', '- **Decision**: Drop+Supersede') + [
            '',
            '- **Disposition:** ticket-prescription-off',
            '- **Source-coordinate falsifiers:** `src/owner.mjs:42` contradicts the ticket-owned boundary.',
            '- **Salvage map:** Preserve the parser fixture; discard the stale adapter.',
            '- **Successor landing pad:** Amend issue #15257 in place.',
            '- **Successor map citation:** https://github.com/neomjs/neo/issues/15257#issuecomment-1'
        ].join('\n');

    // The default body now carries a Required Actions packet matching `VALID_ROUND_2_REVIEW_BODY`'s
    // single disposition row. Before the relation check existed, a prior round only had to EXIST for
    // these budget cases; now an ordinary Round 2 must actually disposition it, which is what the
    // managed path sees in production. A fixture whose prior round raises nothing is a first review,
    // and a Round 2 against it is exactly the shape the relation refuses.
    const priorRequestChanges = ({
        body=['# PR Review Summary', '', '### 📋 Required Actions', '', '- [ ] prior template miss'].join('\n'),
        commit='1111111111111111111111111111111111111111',
        id='PRR_prior',
        reviewer='neo-gpt',
        state='CHANGES_REQUESTED',
        submittedAt='2026-07-16T16:40:00Z'
    } = {}) => ({
        body,
        id,
        state,
        submittedAt,
        author: {login: reviewer},
        commit: {oid: commit}
    });
    const managedReviewBody = (body, outcome='within-budget', extraAudit=[]) => [
        body,
        '',
        '---',
        '[review-budget-managed]',
        `- outcome: ${outcome}`,
        '- ordinary-limit: 2',
        '- activation-issue: 15257',
        '- activation-pr: 15310',
        `- activated-at: ${REVIEW_BUDGET_ACTIVATED_AT}`,
        ...extraAudit
    ].join('\n');

    // Micro-Review (Cycle-1, blast-scaled light shape) — the minimal floor: header + Class
    // (asserting micro|contained|mechanical) + Verdict + Glance.
    const VALID_MICRO_REVIEW_BODY = [
        '# PR Micro-Review',
        '',
        '**Class:** micro — a one-line doc typo fix; no ADR / subsystem / consumed-contract / security / migration trigger, 2-line diff.',
        '',
        '**Verdict:** APPROVED',
        '',
        '**Glance:** Premise + correctness: the change is the right shape (fixes the stale wording) and is correct + safe; no behavior touched.',
        '',
        `- **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`
    ].join('\n');

    test.beforeAll(async () => {
        GraphqlService     = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        const prServiceModule = await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs');

        PullRequestService                  = prServiceModule.default;
        getRound2DispositionRelationFailure = prServiceModule.getRound2DispositionRelationFailure;
        RepositoryService  = (await import('../../../../../../ai/services/github-workflow/RepositoryService.mjs')).default;
        originalQuery      = GraphqlService.query.bind(GraphqlService);
        originalViewerLogin = RepositoryService.viewerLogin;
    });

    test.afterAll(() => {
        GraphqlService.query         = originalQuery;
        // Restored rather than left seeded: `RepositoryService` is a singleton every later spec in this
        // worker shares, and a leaked viewer identity would silently decide another suite's budget.
        RepositoryService.viewerLogin = originalViewerLogin;
    });

    test.beforeEach(() => {
        RepositoryService.viewerLogin = SUBMITTING_LOGIN;

        // Default mock: resolve PR id then return create-shaped review payload.
        // Tests override per-case via reassigning GraphqlService.query.
        GraphqlService.query = async (queryString) => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup();
            }

            if (queryString.includes('AddPullRequestReview')) {
                return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            }

            if (queryString.includes('UpdatePullRequestReview')) {
                return {updatePullRequestReview: {pullRequestReview: {...REVIEW_NODE, submittedAt: '2026-05-13T01:00:00Z'}}};
            }

            return null;
        };
    });

    // The Round-2 tier's negative corpus. @neo-gpt falsified the first implementation at review: it
    // filtered heading presence and nothing else, so a body carrying the four headings, no prior
    // round, no origin, and an invented `RA-999` was admitted with zero missing anchors. Each case
    // below is one way that body got through; the positive control travels with them, because a gate
    // that rejects everything passes a negative corpus just as well as a correct one.
    test('#17178: the Round-2 tier refuses a body that is disposition-SHAPED but dispositions nothing', () => {
        const invented = [
            '# PR Review — Round 2',
            '',
            '### ⚓ Anchor',
            '',
            'No PR, no prior review, no origin session.',
            '',
            '### 📋 Disposition',
            '',
            '| # | Required Action | Disposition |',
            '|---|---|---|',
            '| RA-999 | an action no Round 1 ever raised | ADDRESSED |',
            '',
            '### 🔚 Verdict',
            '',
            'APPROVED'
        ].join('\n');

        const result = PullRequestService.validatePrReviewBody({body: invented});

        expect(result.code, 'the exact falsifier from the #17179 review is refused').toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.message, 'and it says WHICH obligation failed, not just that one did').toContain('names no Round-1 review to disposition');
        expect(result.message).toContain('Origin Session ID');
    });

    test('#17178: the Round-2 tier refuses a round that opens a fresh action checklist', () => {
        // The whole point of the format: a second round dispositions prior actions and never mints a
        // new packet. A `- [ ]` list is a new packet by construction, so the tier that admits one has
        // re-permitted exactly what the substrate removed.
        const minting = VALID_ROUND_2_REVIEW_BODY.replace(
            '### 🔚 Verdict',
            '### 📋 Required Actions\n\n- [ ] a demand this round invented\n\n### 🔚 Verdict'
        );

        const result = PullRequestService.validatePrReviewBody({body: minting});

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.message).toContain('mints a new action checklist');
    });

    test('#17178: a legend explaining the verbs is not a disposition — the row must be a row', () => {
        // The template prints the three verbs in prose directly under the table. A substring test for
        // them reads that legend as evidence, so a document EXPLAINING the vocabulary would satisfy
        // the gate for USING it. The row pattern is cell-anchored to keep those apart.
        const legendOnly = VALID_ROUND_2_REVIEW_BODY
            .replace('| RA-1 | prior template miss | ADDRESSED | current body keeps canonical headings |',
                '*   **ADDRESSED** — the action is discharged; name where.');

        const result = PullRequestService.validatePrReviewBody({body: legendOnly});

        expect(result.code, 'prose about the verbs is not a dispositioned row').toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.message).toContain('dispositions nothing');
    });

    test('#17178: the service and CI agree on origin — a Round 2 without one is refused by BOTH', () => {
        // The two copies of this contract disagreed here: CI required a valid origin line for a
        // Round 2 and the managed service did not, so the service could admit a body the post-submit
        // lint would then reject. Same constant, same verdict, both sides.
        const noOrigin = VALID_ROUND_2_REVIEW_BODY
            .replace(`* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`, '* **Origin Session ID:** my-harness-task-id');

        const result = PullRequestService.validatePrReviewBody({body: noOrigin});

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.message).toContain('Origin Session ID');
    });

    // The RELATION corpus. The shape tier proves a body is disposition-shaped; @neo-gpt then showed a
    // shaped body with a plausible review id and an invented RA-999 still passed, because "is this a
    // disposition OF that round" is a claim about two documents. These drive the relation directly.
    const PRIOR_RC = {
        author: {login: 'neo-gpt'},
        body  : ['# PR Review Summary', '', '### 📋 Required Actions', '',
                      '- [ ] make the tier semantic', '- [ ] update the stale predecessors'].join('\n'),
        id         : 'PRR_prior',
        state      : 'CHANGES_REQUESTED',
        submittedAt: '2026-08-15T10:00:00Z',
        url        : 'https://github.com/neomjs/neo/pull/1#pullrequestreview-1'
    };

    const round2With = rows => [
        '# PR Review — Round 2 (disposition only)', '', '**Status:** Approved', '',
        '### ⚓ Anchor',
        '* **Round-1 Review ID:** PRR_prior',
        `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`, '',
        '### 📋 Disposition', '',
        '| # | Required Action | Disposition | Evidence |', '|---|---|---|---|',
        ...rows, '',
        '### 🔚 Verdict', '', 'Approve'
    ].join('\n');

    test('#17178: an invented action is refused — the row must exist in the prior round', () => {
        const failure = getRound2DispositionRelationFailure({
            body   : round2With(['| RA-1 | make the tier semantic | ADDRESSED | done |',
                                 '| RA-2 | update the stale predecessors | ADDRESSED | done |',
                                 '| RA-999 | an action no round raised | ADDRESSED | done |']),
            reviews: [PRIOR_RC],
            state  : 'APPROVED'
        });

        expect(failure?.code, "@neo-gpt's exact-head falsifier").toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(failure.message).toContain('appears in the table but not in the prior round');
    });

    test('#17178: a reworded action is refused — verbatim is what stops a demand being softened', () => {
        const failure = getRound2DispositionRelationFailure({
            body   : round2With(['| RA-1 | make the tier a bit more semantic | ADDRESSED | done |',
                                 '| RA-2 | update the stale predecessors | ADDRESSED | done |']),
            reviews: [PRIOR_RC],
            state  : 'APPROVED'
        });

        expect(failure?.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(failure.message, 'it names the drift rather than just refusing').toContain('carry it verbatim');
    });

    /**
     * The third live specimen: a prior action quoted correctly, with its markdown stripped.
     * `**RA-1 (scope):** make the tier semantic` became `RA-1 (scope): make the tier semantic`.
     *
     * The byte-verbatim rule is right and is not being relaxed — it is what stops a Round 2 quietly
     * softening the demand it claims to discharge. The defect is that the rule is unstated and its
     * violation unnamed: the refusal prints both strings, and when the only difference is emphasis
     * the two render nearly identically, so the author is told to "carry it verbatim" while looking
     * at what appears to be a verbatim copy.
     */
    const PRIOR_RC_WITH_MARKDOWN = {
        ...PRIOR_RC,
        body: ['# PR Review Summary', '', '### 📋 Required Actions', '',
               '- [ ] **make the tier semantic** so the label survives a rename'].join('\n')
    };

    test('#17354: a quote differing only in formatting is told so, not just "carry it verbatim"', () => {
        const failure = getRound2DispositionRelationFailure({
            body   : round2With(['| RA-1 | make the tier semantic so the label survives a rename | ADDRESSED | done |']),
            reviews: [PRIOR_RC_WITH_MARKDOWN],
            state  : 'APPROVED'
        });

        expect(failure?.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(failure.message, 'the refusal names formatting as the difference')
            .toMatch(/formatting|emphasis|markdown/i)
    });

    test('#17354: a genuinely reworded action is NOT excused as formatting — the non-vacuity control', () => {
        // Without this, a fix that labels every verbatim mismatch "formatting" passes the arm above
        // while telling an author who softened a demand that they merely mis-styled it.
        const failure = getRound2DispositionRelationFailure({
            body   : round2With(['| RA-1 | make the tier a bit more semantic | ADDRESSED | done |',
                                 '| RA-2 | update the stale predecessors | ADDRESSED | done |']),
            reviews: [PRIOR_RC],
            state  : 'APPROVED'
        });

        expect(failure.message, 'real drift keeps the verbatim demand').toContain('carry it verbatim');
        expect(failure.message, 'and is not excused as styling').not.toMatch(/only in formatting/i)
    });

    test('#17178: a dropped action is refused — omission must not retire a demand', () => {
        const failure = getRound2DispositionRelationFailure({
            body   : round2With(['| RA-1 | make the tier semantic | ADDRESSED | done |']),
            reviews: [PRIOR_RC],
            state  : 'APPROVED'
        });

        expect(failure?.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(failure.message).toContain("against the prior round's 2");
    });

    /**
     * The count in the refusal is DERIVED from the parse, and it was reported as if it were an
     * observation. A cell reading `**ADDRESSED** — and answered better than the action asked` carries
     * its verdict, but the extractor matches a cell that IS the verb, so the row is dropped silently
     * and the author is told they dispositioned nothing. That accuses them of the wrong mistake: they
     * wrote the row, and the message sends them to write it again rather than to unwrap the cell.
     */
    test('#17354: an unparseable disposition cell is named, not counted as absent', () => {
        const failure = getRound2DispositionRelationFailure({
            body: round2With([
                '| RA-1 | make the tier semantic | **ADDRESSED** — and answered better than the action asked | done |',
                '| RA-2 | name the anchors | ADDRESSED | done |'
            ]),
            reviews: [PRIOR_RC],
            state  : 'APPROVED'
        });

        expect(failure?.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');

        // The defect is the cell, so the refusal must say so.
        expect(failure.message, 'the refusal names the unreadable cell')
            .toMatch(/could not be read|unparseable|unreadable/i);

        // And it must NOT claim the author dispositioned fewer actions than they wrote. Asserted
        // separately because a fix that only appends a hint would leave the false accusation standing.
        expect(failure.message, 'no derived count is presented as an observation')
            .not.toContain("dispositions 1 action(s) against the prior round's 2");
    });

    test('#17354: a genuinely short table still reports the count — the non-vacuity control', () => {
        // Without this, a fix that deletes the count message entirely passes the arm above. A table
        // that parses cleanly and is simply missing a row must still be told so.
        const failure = getRound2DispositionRelationFailure({
            body   : round2With(['| RA-1 | make the tier semantic | ADDRESSED | done |']),
            reviews: [PRIOR_RC],
            state  : 'APPROVED'
        });

        expect(failure.message, 'a clean short table keeps the count').toContain("against the prior round's 2");
        expect(failure.message, 'and is not blamed on a parse failure').not.toMatch(/could not be read/i)
    });

    test('#17178: a STILL_OPEN round submitted as APPROVED is refused', () => {
        // The second exact-head falsifier: an APPROVED round carrying a STILL_OPEN silently discharges
        // the item it just declared unresolved.
        const failure = getRound2DispositionRelationFailure({
            body   : round2With(['| RA-1 | make the tier semantic | ADDRESSED | done |',
                                 '| RA-2 | update the stale predecessors | STILL_OPEN | not yet |']),
            reviews: [PRIOR_RC],
            state  : 'APPROVED'
        });

        expect(failure?.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(failure.message).toContain('must be COMMENT');
    });

    test('#17178: the same STILL_OPEN round as COMMENT is accepted — the state the format prescribes', () => {
        const failure = getRound2DispositionRelationFailure({
            body   : round2With(['| RA-1 | make the tier semantic | ADDRESSED | done |',
                                 '| RA-2 | update the stale predecessors | STILL_OPEN | not yet |']),
            reviews: [PRIOR_RC],
            state  : 'COMMENT'
        });

        expect(failure, 'COMMENT preserves the original RC and spends no budget').toBeNull();
    });

    test('#17178: a faithful, fully discharged round is accepted', () => {
        const failure = getRound2DispositionRelationFailure({
            body   : round2With(['| RA-1 | make the tier semantic | ADDRESSED | done |',
                                 '| RA-2 | update the stale predecessors | DEFENDED | argued and accepted |']),
            reviews: [PRIOR_RC],
            state  : 'APPROVED'
        });

        expect(failure, 'the positive control — the relation is not reject-everything').toBeNull();
    });

    test('#17178: a Round 2 with no prior CHANGES_REQUESTED to disposition is refused', () => {
        const failure = getRound2DispositionRelationFailure({
            body   : round2With(['| RA-1 | make the tier semantic | ADDRESSED | done |']),
            reviews: [{...PRIOR_RC, state: 'COMMENTED'}],
            state  : 'APPROVED'
        });

        expect(failure?.code, 'a first review cannot wear the Round-2 H1').toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(failure.message).toContain('no submitted');
    });

    test('#17178: the relation is REACHABLE through managePrReview for APPROVED and COMMENT', async () => {
        // The states a valid Round 2 can actually use. The relation first ran ahead of budget
        // validation (masking its fail-closed refusals), then inside the REQUEST_CHANGES branch —
        // which made it unreachable for every state the state matrix permits, so the guard existed
        // only in the one state its own rule forbids. Driving it end-to-end is what catches that;
        // calling the helper directly never would, which is why this case exists beside those.
        GraphqlService.query = async query => {
            if (query.includes('GetPullRequestId')) {
                return {
                    repository: {
                        activationIssue: null,
                        pullRequest    : {
                            createdAt     : '2026-07-01T00:00:00Z',
                            headRefOid    : PR_HEAD_OID,
                            id            : PR_NODE_ID,
                            reviewDecision: 'CHANGES_REQUESTED',
                            reviews       : {
                                nodes   : [priorRequestChanges()],
                                pageInfo: {hasPreviousPage: false}
                            }
                        }
                    }
                }
            }

            throw new Error('managePrReview must not reach the mutation with an invalid relation');
        };

        for (const state of ['APPROVED', 'COMMENT']) {
            const result = await PullRequestService.managePrReview({
                action   : 'create',
                pr_number: 11273,
                state,
                // An invented action: the relation must refuse it in BOTH states.
                body     : VALID_ROUND_2_REVIEW_BODY.replace(
                    '| RA-1 | prior template miss | ADDRESSED | current body keeps canonical headings |',
                    '| RA-1 | an action no prior round raised | ADDRESSED | invented |'
                )
            });

            expect(result.code, `the relation runs for ${state}`).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        }
    });

    /**
     * The dry-run used to accept a Round-2 body that contradicts ITSELF.
     *
     * The submit gate refuses `stillOpen && state !== 'COMMENT'` by comparing the disposition column
     * to the API `state` parameter, which the dry-run never receives. That much is structural. But the
     * body ALSO declares its own verdict on its `**Status:**` line, so the same contradiction is
     * visible with no PR context at all — and naming it is not stuffable, because the fix is to decide
     * which of the author's two declarations is true.
     *
     * The live specimen that motivated this carried `**Status:** Request Changes`, two STILL_OPEN rows
     * and a Verdict opening `COMMENT.`. The dry-run and CI both accepted it; only the submit gate
     * refused, and the author's eventual direct submission landed as COMMENTED — agreeing with the
     * gate. The dry-run held everything needed to say so first, and the template's Status enum had
     * offered no coherent value for a STILL_OPEN round, so the author was following it.
     */
    const ROUND_2_STILL_OPEN_BODY = VALID_ROUND_2_REVIEW_BODY.replace(
        '| RA-1 | prior template miss | ADDRESSED | current body keeps canonical headings |',
        '| RA-1 | prior template miss | STILL_OPEN | the original review stays authoritative |'
    );

    /**
     * A mismatch the PARSE caused is not one the author can fix by carrying the text more carefully.
     *
     * A Required Action carrying a literal `|` — an enum like `observed|partial` is the ordinary
     * case — was cut at that byte, its halves rejoined across a space, and the row rejected as
     * non-verbatim. Escaping was worse: `\|` was cut too, so the backslash survived into the
     * compared text and the author doing the correct Markdown thing got a stranger mismatch. There
     * was no wording that got them out; the only escape was rewording the Round-1 action to contain
     * no pipe, which makes Round-1 text a function of the Round-2 parser.
     */
    // TWO pipes, not one. CodeQL flagged the single-pipe fixture's `replace('|', …)` as incomplete
    // sanitization, and it was right about more than the idiom: with one pipe, a non-global escape
    // and a global one are indistinguishable, so the arm could not tell whether every pipe survives
    // or only the first. The second pipe is what makes the assertion mean what it says.
    const PIPED_PRIOR_ACTION = 'Record the observed|partial contract, not the stale|fresh one',
          // Only `GetPullRequestId` is overridden; the mutation branches stay on the suite default,
          // so a body that passes validation actually submits rather than dying in the mock.
          withPriorAction    = action => {
              const base = GraphqlService.query;

              GraphqlService.query = async queryString => queryString.includes('GetPullRequestId')
                  ? pullRequestLookup({
                      reviewDecision: 'CHANGES_REQUESTED',
                      reviews       : {
                          nodes: [priorRequestChanges({
                              body: ['# PR Review Summary', '', '### 📋 Required Actions', '', `- [ ] ${action}`].join('\n')
                          })],
                          pageInfo: {hasPreviousPage: false}
                      }
                  })
                  : base(queryString)
          },
          pipedRoundTwo      = cell => VALID_ROUND_2_REVIEW_BODY.replace(
              '| RA-1 | prior template miss | ADDRESSED | current body keeps canonical headings |',
              `| RA-1 | ${cell} | ADDRESSED | escaped per markdown |`
          ),
          submitRoundTwo     = body => PullRequestService.managePrReview({
              action: 'create', pr_number: 11273, state: 'APPROVED', body
          });

    test('#17284: an ESCAPED pipe survives the cell parse as a literal pipe', async () => {
        withPriorAction(PIPED_PRIOR_ACTION);

        const result = await submitRoundTwo(pipedRoundTwo(PIPED_PRIOR_ACTION.replaceAll('|', '\\|')));

        expect(result.code, 'the escaped row carries the action verbatim').not.toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
    });

    test('#17284: an UNESCAPED pipe is refused by naming the escape, not by repeating "verbatim"', async () => {
        withPriorAction(PIPED_PRIOR_ACTION);

        const result = await submitRoundTwo(pipedRoundTwo(PIPED_PRIOR_ACTION));

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        // The old message told the author to carry verbatim text they had already carried verbatim.
        // Naming the mechanism is the difference between an instruction they can follow and one they
        // cannot — the refusal is correct either way, and only one of them is actionable.
        expect(result.message, 'the refusal names the pipe').toMatch(/must be escaped as/);
        expect(result.message).toContain('ends the cell');
    });

    test('#17284: a no-pipe difference is NOT diagnosed as a pipe — the byte is the witness', async () => {
        // Emmy's falsifier, RA-1 on the round-2 review. `collapsePipesAndSpace` removes spaces as
        // well as pipes, so "observed partial" and "observedpartial" compare equal with no pipe
        // anywhere in either string. Similarity alone was enough to reach the pipe branch, which then
        // told an author to escape a pipe their text does not contain -- the exact unfollowable
        // instruction this gate exists to remove, reintroduced by the diagnosis rather than the rule.
        //
        // The discriminating half is the SECOND assertion. Refusing is right either way; refusing
        // with the wrong mechanism is the defect, so an arm that only checked for rejection would
        // have passed against the broken code.
        const spacedPrior = 'Record the observed partial contract';

        withPriorAction(spacedPrior);

        const result = await submitRoundTwo(pipedRoundTwo('Record the observedpartial contract'));

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.message, 'no pipe in the expected text means no pipe diagnosis').not.toMatch(/must be escaped as/);
        expect(result.message, 'it falls through to the ordinary verbatim demand').toContain('carry it verbatim')
    });

    test('#17284: sub-lettered and section labels are stripped, and a real first cell is NOT', async () => {
        // The original defect. `RA-1a` / `§0` were folded into the carried action, so the row compared
        // as reworded against a prior round that never contained the label.
        const withLabel = label => VALID_ROUND_2_REVIEW_BODY.replace(
            '| RA-1 | prior template miss |', `| ${label} | prior template miss |`
        );

        for (const label of ['§0', 'RA-1a', 'RA-1b', 'RA-1B', '1', '#3', 'RA-2.', 'RA-10']) {
            withPriorAction('prior template miss');

            const result = await submitRoundTwo(withLabel(label));

            expect(result.code, `${label} is a label, not part of the action`).not.toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        }

        // CONTROL, and it is the half that keeps the widening honest: a first cell that is genuinely
        // part of an action must still be compared. Without it, "recognise more labels" degrades into
        // "strip whatever sits in column one", which discharges every row by construction.
        withPriorAction('prior template miss');

        const genuine = await submitRoundTwo(VALID_ROUND_2_REVIEW_BODY.replace(
            '| RA-1 | prior template miss |', '| something the prior round never said | prior template miss |'
        ));

        expect(genuine.code, 'a prose first cell is still compared').toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
    });

    test('#17354: a STILL_OPEN row under a non-COMMENT Status is refused by the dry-run', () => {
        // Status says Approved, the row says STILL_OPEN. A STILL_OPEN round keeps the original review
        // authoritative and must be COMMENT, so these two cannot both be true.
        const result = PullRequestService.validatePrReviewBody({body: ROUND_2_STILL_OPEN_BODY});

        expect(result.valid, 'the body contradicts its own Status line').toBe(false);
        expect(result.message, 'the refusal names the contradiction rather than the template')
            .toMatch(/STILL_OPEN/)
    });

    test('#17354: a fully-dispositioned round under a Request Changes Status is refused by the dry-run', () => {
        // The mirror: no STILL_OPEN row anywhere, yet the body spends a REQUEST_CHANGES round. A fully
        // discharged round is APPROVED or COMMENT. Asserted separately so a fix that only handles the
        // STILL_OPEN direction cannot pass both.
        const body   = VALID_ROUND_2_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes'),
              result = PullRequestService.validatePrReviewBody({body});

        expect(result.valid, 'every action is dispositioned, so the round is not a Request Changes').toBe(false)
    });

    test('#17354: the coherent bodies stay accepted — the non-vacuity control', () => {
        // Without this, a fix that refuses every Round 2 passes both arms above. Each accepted shape
        // pairs with one refused shape on a single differing declaration.
        expect(PullRequestService.validatePrReviewBody({body: VALID_ROUND_2_REVIEW_BODY}).valid,
            'ADDRESSED under Approved').toBe(true);

        expect(PullRequestService.validatePrReviewBody({
            body: ROUND_2_STILL_OPEN_BODY.replace('**Status:** Approved', '**Status:** Comment')
        }).valid, 'STILL_OPEN under Comment').toBe(true)
    });

    /**
     * A coherence rule that reads one declaration is only as good as the guarantee that the
     * declaration EXISTS. The first revision deferred a missing Status to the structural anchor
     * layer in a code comment — and never checked that the anchor layer refuses it. It does not: a
     * Round 2 with no Status at all returned `valid: true`, so the rule silently did not apply to
     * the one body that most needed it. Found in review by @neo-gpt.
     *
     * `Request Changes` is likewise not a legal Round-2 Status: every branch of the coherence rule
     * refuses it — with a STILL_OPEN row it must be Comment, and without one a fully dispositioned
     * round does not spend another round. An enum offering a value with no legal branch is the same
     * defect this PR started from, one value over.
     */
    test('#17354: a Round 2 with no Status is refused', () => {
        const body   = VALID_ROUND_2_REVIEW_BODY.replace('**Status:** Approved\n\n', ''),
              result = PullRequestService.validatePrReviewBody({body});

        expect(result.valid, 'the coherence rule needs a declaration to read').toBe(false);
        expect(result.message).toMatch(/Status/)
    });

    test('#17354: an unknown or placeholder Status is refused', () => {
        for (const status of ['Request Changes', 'Merged', '[Approved / Approve+Follow-Up / Comment]']) {
            const body   = VALID_ROUND_2_REVIEW_BODY.replace('**Status:** Approved', `**Status:** ${status}`),
                  result = PullRequestService.validatePrReviewBody({body});

            expect(result.valid, `"${status}" is not a legal Round-2 Status`).toBe(false)
        }
    });

    test('#17354: each legal Status is accepted in its coherent shape — the paired controls', () => {
        // One accepted shape per legal value, so a fix that simply refuses more cannot pass.
        expect(PullRequestService.validatePrReviewBody({body: VALID_ROUND_2_REVIEW_BODY}).valid,
            'Approved with everything dispositioned').toBe(true);

        expect(PullRequestService.validatePrReviewBody({
            body: VALID_ROUND_2_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Approve+Follow-Up')
        }).valid, 'Approve+Follow-Up with everything dispositioned').toBe(true);

        expect(PullRequestService.validatePrReviewBody({
            body: ROUND_2_STILL_OPEN_BODY.replace('**Status:** Approved', '**Status:** Comment')
        }).valid, 'Comment carrying a STILL_OPEN row').toBe(true)
    });

    test('#17354: a body missing a silent anchor is refused SILENTLY, even when it also contradicts itself', () => {
        // The ordering is the anti-Goodhart guard, and making refusals friendlier is exactly what
        // would sand it off. A body that trips BOTH layers must return the silent one: the named
        // coherence message must never become a side channel that tells a caller which unnamed
        // anchor they are missing, one bisected submission at a time.
        //
        // The heading is REMOVED rather than renamed. A first attempt renamed `Disposition` to
        // `Dispositions`, which the presence check reads as still present because it is a substring —
        // so the body tripped only the coherence layer and the test proved nothing about ordering.
        const body   = ROUND_2_STILL_OPEN_BODY.replace('### ⚓ Anchor\n', ''),
              result = PullRequestService.validatePrReviewBody({body});

        expect(result.valid, 'the structural layer still refuses').toBe(false);
        expect(result.message, 'and the coherence message did not preempt it')
            .not.toContain('contradicts itself')
    });

    test('#17178: validatePrReviewBody names the template it ACTUALLY applied', () => {
        // It returned the canonical path unconditionally, so a Round-2 body was told it matched
        // `pr-review-template.md` — sending an author who later hit a rejection to the wrong file.
        const result = PullRequestService.validatePrReviewBody({body: VALID_ROUND_2_REVIEW_BODY});

        expect(result.valid).toBe(true);
        expect(result.template, 'the selected asset, not a constant').toBe('.agents/skills/pr-review/assets/pr-review-round-2-template.md');
    });

    test('#17178: the positive control still passes — the tier did not become reject-everything', () => {
        const result = PullRequestService.validatePrReviewBody({body: VALID_ROUND_2_REVIEW_BODY});

        expect(result.valid, 'a real disposition round is still admitted').toBe(true);
    });

    test('#14688: validatePrReviewBody dry-runs a valid body without GraphQL dispatch', () => {
        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            throw new Error('validatePrReviewBody must not query GitHub');
        };

        const result = PullRequestService.validatePrReviewBody({
            body: VALID_REVIEW_BODY
        });

        expect(result).toEqual({
            valid   : true,
            message : 'Review body matches the pr-review template structure.',
            skill   : '.agents/skills/pr-review/SKILL.md',
            template: '.agents/skills/pr-review/assets/pr-review-template.md'
        });
        expect(graphqlCallCount).toBe(0);
    });

    test('#14688: validatePrReviewBody names the missing Graph Ingestion Notes skeleton anchor before posting', () => {
        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            throw new Error('validatePrReviewBody must not query GitHub');
        };

        const bodyWithoutGraphHeading = VALID_REVIEW_BODY
            .replace('### 🧠 Graph Ingestion Notes\n', '');

        const result = PullRequestService.validatePrReviewBody({
            body: bodyWithoutGraphHeading
        });

        expect(result.valid).toBe(false);
        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.missing_template_skeleton).toEqual(['### 🧠 Graph Ingestion Notes']);
        expect(result.message).toContain('.agents/skills/pr-review/SKILL.md');
        expect(graphqlCallCount).toBe(0);
    });

    test('#14688: PullRequestService import stays total when template files are absent at projectRoot', () => {
        const tmpDir      = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-pr-review-missing-template-')),
              neoPath     = path.resolve('src/Neo.mjs'),
              corePath    = path.resolve('src/core/_export.mjs'),
              servicePath = path.resolve('ai/services/github-workflow/PullRequestService.mjs'),
              script      = [
                  `import ${JSON.stringify(neoPath)};`,
                  `import ${JSON.stringify(corePath)};`,
                  `const {default: PullRequestService} = await import(${JSON.stringify(servicePath)});`,
                  `const result = PullRequestService.validatePrReviewBody({body: '# PR Review Summary\\n\\n[ARCH_ALIGNMENT]: 1'});`,
                  `console.log(JSON.stringify({imported: true, valid: result.valid, missingTemplateSkeleton: result.missing_template_skeleton || []}));`
              ].join('\n');

        try {
            const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
                      cwd     : tmpDir,
                      encoding: 'utf8'
                  }),
                  payload = JSON.parse(stdout.trim().split('\n').at(-1));

            expect(payload.imported).toBe(true);
            expect(payload.valid).toBe(false);
            expect(payload.missingTemplateSkeleton).toContain('### 🧠 Graph Ingestion Notes');
        } finally {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    test('#14688: managePrReview keeps exact skeleton misses out of the mutation-path response', async () => {
        const bodyWithoutGraphHeading = VALID_REVIEW_BODY
            .replace('### 🧠 Graph Ingestion Notes\n', '');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return pullRequestLookup();
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 14688,
            state    : 'APPROVED',
            body     : bodyWithoutGraphHeading
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.missing_template_skeleton).toBeUndefined();
        expect(result.message).toContain('structural template anchors do not');
        expect(graphqlCallCount).toBe(0);
    });

    test('#17420: same PR number in home/non-default repos reads separate target histories while activation stays home-owned', async () => {
        const observations = [];

        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestId')) {
                observations.push(variables);
                return {
                    homeRepository  : {activationIssue: activationIssueNode()},
                    targetRepository: {pullRequest: pullRequestNode()}
                }
            }

            if (queryString.includes('AddPullRequestReview')) {
                return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}}
            }

            return null
        };

        for (const repo of [undefined, 'devindex']) {
            const result = await PullRequestService.managePrReview({
                ...(repo ? {repo} : {}),
                action   : 'create',
                pr_number: 73,
                state    : 'APPROVED',
                body     : VALID_REVIEW_BODY
            });

            expect(result.error, repo || 'home').toBeUndefined();
        }

        expect(observations).toEqual([{
            activationIssueNumber: PullRequestService.reviewBudgetActivationIssueNumber,
            homeOwner            : 'neomjs',
            homeRepo             : 'neo',
            owner                : 'neomjs',
            repo                 : 'neo',
            prNumber             : 73
        }, {
            activationIssueNumber: PullRequestService.reviewBudgetActivationIssueNumber,
            homeOwner            : 'neomjs',
            homeRepo             : 'neo',
            owner                : 'neomjs',
            repo                 : 'devindex',
            prNumber             : 73
        }]);
    });

    test('action:create + state:APPROVED → submits APPROVE event, returns review payload', async () => {
        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11273,
            state    : 'APPROVED',
            body     : `LGTM, cross-family review complete.\n\n${VALID_REVIEW_BODY}`
        });

        expect(result.error).toBeUndefined();
        expect(result.message).toContain('Successfully created APPROVED review on PR #11273');
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(result.state).toBe('APPROVED');
        expect(result.url).toBe('https://github.com/neomjs/neo/pull/11273#pullrequestreview-12345');
        expect(result.submittedAt).toBe('2026-05-13T00:00:00Z');
        expect(result.databaseId).toBe(12345);
    });

    test('#14534: action:create + state:APPROVED rejects over outstanding current-head CHANGES_REQUESTED', async () => {
        let mutationCallCount = 0;

        GraphqlService.query = async (queryString) => {
            if (queryString.includes('GetPullRequestId')) {
                return {
                    repository: {
                        pullRequest: {
                            id            : PR_NODE_ID,
                            headRefOid    : PR_HEAD_OID,
                            reviewDecision: 'CHANGES_REQUESTED',
                            reviews       : {
                                nodes: [{
                                    state      : 'CHANGES_REQUESTED',
                                    submittedAt: '2026-07-03T01:34:00Z',
                                    url        : 'https://github.com/neomjs/neo/pull/14527#pullrequestreview-1',
                                    databaseId : 1,
                                    author     : {login: 'neo-gpt'},
                                    commit     : {oid: PR_HEAD_OID}
                                }, {
                                    state      : 'COMMENTED',
                                    submittedAt: '2026-07-03T02:00:00Z',
                                    url        : 'https://github.com/neomjs/neo/pull/14527#pullrequestreview-2',
                                    databaseId : 2,
                                    author     : {login: 'neo-gpt'},
                                    commit     : {oid: PR_HEAD_OID}
                                }]
                            }
                        }
                    }
                };
            }

            if (queryString.includes('AddPullRequestReview')) {
                mutationCallCount++;
                return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            }

            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 14527,
            state    : 'APPROVED',
            body     : VALID_REVIEW_BODY
        });

        expect(result.error).toBe('PR Review State Validation Failed');
        expect(result.code).toBe('PR_REVIEW_STATE_VALIDATION_FAILED');
        expect(result.message).toContain('@neo-gpt');
        expect(result.message).toContain(PR_HEAD_OID);
        expect(result.message).toContain('pr-review §9.1 Reviewer-Yield');
        expect(result.outstandingRequestChanges.map(({reviewer}) => reviewer)).toEqual(['neo-gpt']);
        expect(mutationCallCount).toBe(0);
    });

    test('#14534: action:create + state:APPROVED accepts complete current-head acknowledgment', async () => {
        let capturedVariables;

        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestId')) {
                return {
                    repository: {
                        pullRequest: {
                            id            : PR_NODE_ID,
                            headRefOid    : PR_HEAD_OID,
                            reviewDecision: 'CHANGES_REQUESTED',
                            reviews       : {
                                nodes: [{
                                    state      : 'CHANGES_REQUESTED',
                                    submittedAt: '2026-07-03T01:34:00Z',
                                    url        : 'https://github.com/neomjs/neo/pull/14527#pullrequestreview-1',
                                    databaseId : 1,
                                    author     : {login: 'neo-gpt'},
                                    commit     : {oid: PR_HEAD_OID}
                                }]
                            }
                        }
                    }
                };
            }

            if (queryString.includes('AddPullRequestReview')) {
                capturedVariables = variables;
                return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            }

            return null;
        };

        const result = await PullRequestService.managePrReview({
            acknowledgedRequestChanges: {
                'neo-gpt': `addressed-by-${PR_HEAD_OID.slice(0, 12)}`
            },
            action   : 'create',
            pr_number: 14527,
            state    : 'APPROVED',
            body     : VALID_REVIEW_BODY
        });

        expect(result.error).toBeUndefined();
        expect(capturedVariables.event).toBe('APPROVE');
        expect(result.state).toBe('APPROVED');
    });

    test('#14534: action:create + state:APPROVED rejects stale acknowledgment', async () => {
        GraphqlService.query = async (queryString) => {
            if (queryString.includes('GetPullRequestId')) {
                return {
                    repository: {
                        pullRequest: {
                            id            : PR_NODE_ID,
                            headRefOid    : PR_HEAD_OID,
                            reviewDecision: 'CHANGES_REQUESTED',
                            reviews       : {
                                nodes: [{
                                    state : 'CHANGES_REQUESTED',
                                    author: {login: 'neo-gpt'},
                                    commit: {oid: PR_HEAD_OID}
                                }]
                            }
                        }
                    }
                };
            }

            throw new Error('review mutation must not run');
        };

        const result = await PullRequestService.managePrReview({
            acknowledgedRequestChanges: {
                'neo-gpt': 'addressed-by-deadbee'
            },
            action   : 'create',
            pr_number: 14527,
            state    : 'APPROVED',
            body     : VALID_REVIEW_BODY
        });

        expect(result.code).toBe('PR_REVIEW_STATE_VALIDATION_FAILED');
        expect(result.message).toContain('Invalid acknowledgment disposition(s): @neo-gpt');
    });

    test('action:create + state:REQUEST_CHANGES → state enum maps to REQUEST_CHANGES event', async () => {
        // Mock returns CHANGES_REQUESTED state to mirror real GitHub semantics
        // (event REQUEST_CHANGES → review state CHANGES_REQUESTED).
        let capturedVariables;
        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestId')) return pullRequestLookup();
            if (queryString.includes('AddPullRequestReview')) {
                capturedVariables = variables;
                return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}};
            }
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11273,
            state    : 'REQUEST_CHANGES',
            body     : `Required Action: address X.\n\n${VALID_REVIEW_BODY}`
        });

        expect(result.error).toBeUndefined();
        expect(capturedVariables.event).toBe('REQUEST_CHANGES');
        expect(capturedVariables.pullRequestId).toBe(PR_NODE_ID);
        expect(result.state).toBe('CHANGES_REQUESTED');
    });

    test('#15309: create reserves service-owned review-budget provenance before GraphQL', async () => {
        const reservedAuditFields = [
            'outcome',
            'ordinary-limit',
            'activation-issue',
            'activation-pr',
            'activated-at',
            'reason',
            'submitted-request-changes'
        ];
        const cases = [{
            name : 'displaced managed marker',
            state: 'APPROVED',
            body : `${VALID_REVIEW_BODY}\n\n[review-budget-managed]`,
            field: '[review-budget-managed]'
        }, {
            name : 'duplicate managed marker',
            state: 'COMMENT',
            body : `${VALID_REVIEW_BODY}\n\n---\n[review-budget-managed]\n\n---\n[review-budget-managed]`,
            field: '[review-budget-managed]'
        }, {
            name : 'override marker without service provenance',
            state: 'COMMENT',
            body : `${VALID_REVIEW_BODY}\n\n[review-budget-override]`,
            field: '[review-budget-override]'
        }, ...reservedAuditFields.map((field, index) => ({
            name : `reserved audit field ${field}`,
            state: ['APPROVED', 'COMMENT', 'REQUEST_CHANGES'][index % 3],
            body : `${VALID_REVIEW_BODY}\n\n- ${field}: caller-authored`,
            field
        }))];

        for (const item of cases) {
            let graphqlCallCount = 0;
            GraphqlService.query = async () => {
                graphqlCallCount++;
                return pullRequestLookup()
            };

            const result = await PullRequestService.managePrReview({
                action   : 'create',
                pr_number: 15309,
                state    : item.state,
                body     : item.body
            });

            expect(result.code, item.name).toBe('PR_REVIEW_BUDGET_AUDIT_RESERVED');
            expect(result.reservedReviewBudgetProvenance, item.name).toContain(item.field);
            expect(graphqlCallCount, item.name).toBe(0)
        }
    });

    test('#15309: incidental prose passes while managed CREATE appends one canonical receipt', async () => {
        let capturedVariables;

        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestId')) return pullRequestLookup();

            capturedVariables = variables;
            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'COMMENTED'}}}
        };

        const proseResult = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 15309,
            state    : 'COMMENT',
            body     : `The strings [review-budget-managed] and "- outcome:" are discussed inline, not supplied as machine fields.\n\n${VALID_REVIEW_BODY}`
        });

        expect(proseResult.error).toBeUndefined();
        expect(capturedVariables.event).toBe('COMMENT');

        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup({createdAt: '2026-07-16T13:57:04Z'})
            }

            capturedVariables = variables;
            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}}
        };

        const managedResult = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 15309,
            state    : 'REQUEST_CHANGES',
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY
        });

        expect(managedResult.error).toBeUndefined();
        expect(capturedVariables.body.match(/^\[review-budget-managed\]$/gm)).toHaveLength(1);
        expect(capturedVariables.body.match(/^\[review-budget-override\]$/gm)).toBeNull()
    });

    test('#15257: post-cutover third ordinary RC is refused across heads, reviewers, and an honest retraction', async () => {
        let   mutationCallCount = 0;
        const reviews           = [
            priorRequestChanges({
                body : `${VALID_ORDINARY_REQUEST_CHANGES_BODY}\n\n[review-budget-managed]`,
                state: 'DISMISSED'
            }),
            {
                body       : 'Retraction after repair.',
                id         : 'PRR_retraction',
                state      : 'APPROVED',
                submittedAt: '2026-07-16T16:45:00Z',
                author     : {login: 'neo-gpt'},
                commit     : {oid: '2222222222222222222222222222222222222222'}
            },
            priorRequestChanges({
                commit     : '3333333333333333333333333333333333333333',
                id         : 'PRR_second',
                reviewer   : 'neo-opus-ada',
                submittedAt: '2026-07-16T16:50:00Z'
            })
        ];

        GraphqlService.query = async queryString => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup({
                    createdAt: '2026-07-16T13:57:04Z',
                    reviews  : {nodes: reviews, pageInfo: {hasPreviousPage: false}}
                });
            }

            if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 15257,
            state    : 'REQUEST_CHANGES',
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY
        });

        // The budget is now PER FAMILY, so this fixture proves a narrower and truer thing than it did:
        // the gpt family's single round survives a dismissal and an honest retraction, and its second
        // ordinary RC is refused. The claude RC in the same fixture belongs to another family and is
        // deliberately NOT what exhausts gpt's round — the cross-family independence case below is what
        // pins that, and this assertion would silently pass on a global count without it.
        expect(result.code).toBe('PR_REVIEW_BUDGET_VALIDATION_FAILED');
        expect(result.reviewBudget.submittedRequestChanges).toBe(2);
        expect(result.reviewBudget.familySubmittedRequestChanges, 'only gpt\'s own round counts').toBe(1);
        expect(result.reviewBudget.reviewerFamily).toBe('gpt');
        expect(result.message).toContain('gpt family has already spent');
        expect(mutationCallCount).toBe(0);
    });

    test('#17141: another family keeps its own round — one family\'s spent budget does not silence a second', async () => {
        // The defect the per-family unit exists to fix, and the one a global count cannot express: an
        // exhausted gpt round used to refuse a claude reviewer who had never seen the PR. Same fixture,
        // same PR, only the submitting seat differs — so a passing result here cannot come from any
        // clause except the family keying.
        let mutationCallCount = 0;

        GraphqlService.query = async queryString => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup({
                    createdAt: '2026-07-16T13:57:04Z',
                    reviews  : {
                        nodes   : [priorRequestChanges({reviewer: 'neo-gpt'})],
                        pageInfo: {hasPreviousPage: false}
                    }
                })
            }

            if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}}
        };

        RepositoryService.viewerLogin = 'neo-opus-grace';

        const claudeRound = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 17141,
            state    : 'REQUEST_CHANGES',
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY
        });

        expect(claudeRound.error, 'claude has spent nothing on this PR').toBeUndefined();
        expect(claudeRound.reviewBudget.outcome).toBe('within-budget');
        expect(claudeRound.reviewBudget.reviewerFamily).toBe('claude');
        expect(claudeRound.reviewBudget.familySubmittedRequestChanges).toBe(0);
        expect(claudeRound.reviewBudget.submittedRequestChanges, 'the PR total is still reported').toBe(1);
        expect(mutationCallCount).toBe(1);

        // The mirror, on the identical fixture: the family that already spent its round is refused.
        // Without this half the test above would pass on a guard that admits everyone.
        RepositoryService.viewerLogin = 'neo-gpt-emmy';

        const gptSecondRound = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 17141,
            state    : 'REQUEST_CHANGES',
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY
        });

        expect(gptSecondRound.code).toBe('PR_REVIEW_BUDGET_VALIDATION_FAILED');
        expect(gptSecondRound.reviewBudget.familySubmittedRequestChanges).toBe(1);
        expect(mutationCallCount, 'the refusal reached no mutation').toBe(1);
    });

    test('#17141: an unclassifiable submitter is refused, never granted an unbounded round', async () => {
        // Fail CLOSED. Waiving the charge reads as generosity and is the opposite: a login the identity
        // graph cannot place would spend nobody's budget, so it could request changes without limit
        // while every rostered family stayed bounded. A gate that cannot name the spender must refuse.
        let mutationCallCount = 0;

        GraphqlService.query = async queryString => {
            if (queryString.includes('GetPullRequestId')) return pullRequestLookup({createdAt: '2026-07-16T13:57:04Z'});
            if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}}
        };

        for (const [label, login] of [
            ['an unrostered human contributor', 'some-human-contributor'],
            ['a cold viewer cache',             null]
        ]) {
            RepositoryService.viewerLogin = login;

            const result = await PullRequestService.managePrReview({
                action   : 'create',
                pr_number: 17141,
                state    : 'REQUEST_CHANGES',
                body     : VALID_ORDINARY_REQUEST_CHANGES_BODY
            });

            expect(result.code, label).toBe('PR_REVIEW_BUDGET_VALIDATION_FAILED');
            expect(result.message, label).toContain('not a classifiable maintainer family');
        }

        // Note the shape: a PR with ZERO prior reviews. Under the old global count this was the freest
        // possible case, so the refusal cannot be inherited from an exhausted budget — it comes only
        // from the submitter being unplaceable.
        expect(mutationCallCount, 'neither unclassified submitter reached a mutation').toBe(0);
    });

    test('#17141: a repair-minted re-entry is refused unless every clause checks out', async () => {
        // The exception exists for one situation: a defect that did NOT exist, or was undiscoverable,
        // at the head Round 1 reviewed, and that the author's own repair created or exposed. "Noticed
        // later" is not that situation, and free prose cannot tell the two apart — which is why the
        // prior contract accepted "release safety exception" and asserted nothing checkable.
        //
        // Each row removes exactly ONE clause from an otherwise-valid receipt, so a refusal cannot be
        // inherited from any other check.
        const valid = {
            'old-head'         : '1111111111111111111111111111111111111111',
            'new-head'         : PR_HEAD_OID,
            'prior-fact'       : 'the seam did not exist at that head',
            'repair-coordinate': 'ai/x.mjs:42'
        };
        const receipt = overrides => Object.entries({...valid, ...overrides})
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${key}: ${value}`)
            .join(' | ');

        let mutationCallCount = 0;

        GraphqlService.query = async (queryString) => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup({
                    createdAt: '2026-07-16T13:57:04Z',
                    reviews  : {
                        nodes   : [priorRequestChanges({reviewer: SUBMITTING_LOGIN})],
                        pageInfo: {hasPreviousPage: false}
                    }
                })
            }

            if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}}
        };

        const submit = reviewBudgetOverrideReason => PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 17141,
            state    : 'REQUEST_CHANGES',
            body     : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes'),
            reviewBudgetOverrideReason
        });

        for (const [label, reason] of [
            ['free text, the prior contract',   'Operator-declared release safety exception.'],
            ['no old-head',                     receipt({'old-head': undefined})],
            ['no prior-fact',                   receipt({'prior-fact': undefined})],
            ['no repair-coordinate',            receipt({'repair-coordinate': undefined})],
            ['identical heads describe no repair', receipt({'old-head': PR_HEAD_OID})],
            // The falsifiable clause: every other row checks the sentence against itself, this one
            // checks it against the PR's own history. An invented old-head cannot be written better.
            ['old-head no prior review used',   receipt({'old-head': '9999999999999999999999999999999999999999'})],
            ['new-head is not the head under review', receipt({'new-head': '8888888888888888888888888888888888888888'})]
        ]) {
            const result = await submit(reason);

            expect(result.code, label).toBe('PR_REVIEW_BUDGET_VALIDATION_FAILED');
        }

        expect(mutationCallCount, 'no malformed receipt reached a mutation').toBe(0);

        // The control: the complete receipt on the identical fixture passes, so the matrix above
        // refuses malformed receipts rather than refusing re-entry altogether.
        const admitted = await submit(receipt({}));

        expect(admitted.error).toBeUndefined();
        expect(admitted.reviewBudget.outcome).toBe('disclosed-override');
        expect(mutationCallCount).toBe(1);
    });

    test('#17141: a re-entry cannot borrow another family\'s Round-1 head, and refuses when its own is unrecorded', async () => {
        // Two holes @neo-gpt found by execution, both of which my earlier arm could not reach: it used
        // ONE same-family prior review WITH a commit oid, so the head set was never foreign and never
        // empty. A fixture that cannot produce the failing shape cannot falsify it.
        //
        // The claim a receipt makes is "the defect did not exist at the head I reviewed". A head some
        // OTHER family reviewed proves nothing about this family's Round 1, and no recorded head at all
        // makes the claim uncheckable — which must refuse, not pass.
        const receiptFor = oldHead => [
            `old-head: ${oldHead}`,
            `new-head: ${PR_HEAD_OID}`,
            'prior-fact: the seam did not exist at that head',
            'repair-coordinate: ai/x.mjs:42'
        ].join(' | ');

        const FOREIGN_HEAD = '1111111111111111111111111111111111111111';
        const OWN_HEAD     = '2222222222222222222222222222222222222222';

        let mutationCallCount = 0;

        const withReviews = nodes => {
            GraphqlService.query = async queryString => {
                if (queryString.includes('GetPullRequestId')) {
                    return pullRequestLookup({createdAt: '2026-07-16T13:57:04Z', reviews: {nodes, pageInfo: {hasPreviousPage: false}}})
                }

                if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
                return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}}
            }
        };

        const submit = reason => PullRequestService.managePrReview({
            action                    : 'create',
            pr_number                 : 17141,
            state                     : 'REQUEST_CHANGES',
            body                      : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes'),
            reviewBudgetOverrideReason: reason
        });

        // ARM A — mixed families. Claude reviewed FOREIGN_HEAD, gpt reviewed OWN_HEAD, gpt now re-enters.
        withReviews([
            priorRequestChanges({commit: FOREIGN_HEAD, id: 'PRR_claude', reviewer: 'neo-opus-grace'}),
            priorRequestChanges({commit: OWN_HEAD,     id: 'PRR_gpt',    reviewer: SUBMITTING_LOGIN})
        ]);

        const borrowed = await submit(receiptFor(FOREIGN_HEAD));

        expect(borrowed.code, 'a head only another family reviewed is not corroboration').toBe('PR_REVIEW_BUDGET_VALIDATION_FAILED');

        // The control on the identical fixture: gpt's OWN head is accepted, so the arm above refuses
        // borrowing rather than refusing re-entry.
        const own = await submit(receiptFor(OWN_HEAD));

        expect(own.error, 'the family\'s own Round-1 head corroborates').toBeUndefined();
        expect(own.reviewBudget.outcome).toBe('disclosed-override');

        // ARM B — the family's prior review carries NO usable commit oid. Under the previous guard the
        // head check short-circuited and an invented head sailed through; it must refuse instead.
        mutationCallCount = 0;

        withReviews([{
            body       : 'Prior ordinary request changes.',
            id         : 'PRR_no_commit',
            state      : 'CHANGES_REQUESTED',
            submittedAt: '2026-07-16T16:40:00Z',
            author     : {login: SUBMITTING_LOGIN},
            commit     : null
        }]);

        const uncheckable = await submit(receiptFor('9999999999999999999999999999999999999999'));

        expect(uncheckable.code, 'missing evidence must refuse, not skip').toBe('PR_REVIEW_BUDGET_VALIDATION_FAILED');
        expect(mutationCallCount, 'no uncorroborated re-entry reached a mutation').toBe(0);
    });

    test('#17141: the repair-minted re-entry is terminal — a second is refused', async () => {
        // Otherwise the exception becomes the budget: reachable indefinitely by writing a well-formed
        // receipt each time. Prior re-entries are countable because the override audit is appended
        // durably to the review body it authorized, so the record of the exception is the evidence
        // that it was spent.
        let mutationCallCount = 0;

        GraphqlService.query = async (queryString) => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup({
                    createdAt: '2026-07-16T13:57:04Z',
                    reviews  : {
                        nodes: [
                            priorRequestChanges({reviewer: SUBMITTING_LOGIN}),
                            priorRequestChanges({
                                body    : `Prior re-entry.\n\n${'[review-budget-override]'}`,
                                id      : 'PRR_reentry',
                                reviewer: SUBMITTING_LOGIN
                            })
                        ],
                        pageInfo: {hasPreviousPage: false}
                    }
                })
            }

            if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}}
        };

        const result = await PullRequestService.managePrReview({
            action                    : 'create',
            pr_number                 : 17141,
            state                     : 'REQUEST_CHANGES',
            body                      : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes'),
            reviewBudgetOverrideReason: [
                'old-head: 1111111111111111111111111111111111111111',
                `new-head: ${PR_HEAD_OID}`,
                'prior-fact: undiscoverable at that head',
                'repair-coordinate: ai/y.mjs:7'
            ].join(' | ')
        });

        expect(result.code).toBe('PR_REVIEW_BUDGET_VALIDATION_FAILED');
        expect(result.message).toContain('already used its one repair-minted re-entry');
        expect(mutationCallCount, 'a second re-entry reached no mutation').toBe(0);
    });

    test('#15257: PR lookup projects cutover, prior bodies, and history completeness', async () => {
        let lookupQuery;
        let lookupVariables;

        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestId')) {
                lookupQuery = queryString;
                lookupVariables = variables;
                return pullRequestLookup();
            }

            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}};
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 15257,
            state    : 'REQUEST_CHANGES',
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY
        });

        expect(result.error).toBeUndefined();
        expect(lookupQuery).toContain('createdAt');
        expect(lookupQuery).toContain('activationIssue');
        expect(lookupQuery).toContain('closedByPullRequestsReferences');
        expect(lookupQuery).toContain('mergedAt');
        expect(lookupQuery).toContain('baseRefName');
        expect(lookupQuery).toContain('body');
        expect(lookupQuery).toContain('hasPreviousPage');
        expect(lookupVariables.activationIssueNumber).toBe(15257);
    });

    test('#15257/#15309: OpenAPI documents the cutover receipt and reserved CREATE provenance', () => {
        const openApi = yaml.load(fs.readFileSync(
            path.resolve(process.cwd(), 'ai/mcp/server/github-workflow/openapi.yaml'),
            'utf8'
        ));
        const operation   = openApi.paths['/pulls/{pr_number}/review/manage'].post;
        const bodySchema  = operation.requestBody.content['application/json'].schema.properties.body;
        const activatedAt = operation.responses['200'].content['application/json'].schema
            .properties.reviewBudget.properties.activatedAt;

        expect(operation.description).toContain('[review-budget-managed]');
        expect(operation.description).toContain('[review-budget-override]');
        expect(operation.description).toContain('rejects them before GitHub access');
        expect(bodySchema.description).toContain('reserved audit-field list entries are rejected');
        expect(activatedAt.type).toBe('string');
        expect(activatedAt.format).toBe('date-time');
        expect(activatedAt.nullable).toBe(true)
    });

    test('#15257: earliest merged dev closer is the stable cutover while non-dev and unmerged refs are ignored', async () => {
        let capturedBody;
        const activationIssue = activationIssueNode([
            activationPullRequest({number: 15314, mergedAt: '2026-07-16T14:05:00Z'}),
            activationPullRequest({number: 15309, mergedAt: '2026-07-16T13:50:00Z', baseRefName: 'main'}),
            activationPullRequest({number: 15312, mergedAt: '2026-07-16T13:57:03Z'}),
            activationPullRequest({number: 15311, state: 'OPEN', mergedAt: null})
        ], {state: 'OPEN'});

        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup({createdAt: '2026-07-16T14:06:00Z'}, activationIssue)
            }

            capturedBody = variables.body;
            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}}
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 15320,
            state    : 'REQUEST_CHANGES',
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewBudget.activatedAt).toBe('2026-07-16T13:57:03Z');
        expect(result.reviewBudget.activationIssueNumber).toBe(15257);
        expect(result.reviewBudget.activationPullRequestNumber).toBe(15312);
        expect(capturedBody).toContain('- activation-issue: 15257');
        expect(capturedBody).toContain('- activation-pr: 15312')
    });

    test('#15257: missing, incomplete, and malformed activation relations fail closed', async () => {
        const cases = [{
            name           : 'missing activation issue',
            activationIssue: null,
            message        : 'Cannot resolve review-budget activation issue'
        }, {
            name           : 'truncated activation relation',
            activationIssue: activationIssueNode([], {
                closedByPullRequestsReferences: {
                    totalCount: 1,
                    nodes     : [],
                    pageInfo  : {hasNextPage: true}
                }
            }),
            message: 'complete closing-PR history'
        }, {
            name           : 'merged dev closer without timestamp',
            activationIssue: activationIssueNode([
                activationPullRequest({number: 15312, mergedAt: null})
            ]),
            message: 'without a valid mergedAt'
        }];

        for (const item of cases) {
            GraphqlService.query = async queryString => {
                if (queryString.includes('GetPullRequestId')) {
                    return pullRequestLookup({createdAt: '2026-07-16T14:06:00Z'}, item.activationIssue)
                }

                throw new Error(`${item.name}: mutation must not run`)
            };

            const result = await PullRequestService.managePrReview({
                action   : 'create',
                pr_number: 15320,
                state    : 'REQUEST_CHANGES',
                body     : VALID_ORDINARY_REQUEST_CHANGES_BODY
            });

            expect(result.code, item.name).toBe('PR_REVIEW_BUDGET_VALIDATION_FAILED');
            expect(result.message, item.name).toContain(item.message)
        }
    });

    test('#15257: createdAt equality is grandfathered while one millisecond after cutover is gated', async () => {
        const prior             = [priorRequestChanges(), priorRequestChanges({id: 'PRR_second'})];
        let   createdAt         = REVIEW_BUDGET_ACTIVATED_AT;
        let   mutationCallCount = 0;

        GraphqlService.query = async queryString => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup({
                    createdAt,
                    reviews: {nodes: prior, pageInfo: {hasPreviousPage: false}}
                });
            }

            mutationCallCount++;
            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}};
        };

        const input = {
            action   : 'create',
            pr_number: 15257,
            state    : 'REQUEST_CHANGES',
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY
        };

        const grandfathered = await PullRequestService.managePrReview(input);

        expect(grandfathered.error).toBeUndefined();
        expect(grandfathered.reviewBudget.outcome).toBe('grandfathered');

        createdAt = '2026-07-16T13:57:03.001Z';
        const gated = await PullRequestService.managePrReview(input);

        expect(gated.code).toBe('PR_REVIEW_BUDGET_VALIDATION_FAILED');
        expect(mutationCallCount).toBe(1);
    });

    test('#15257: pre-activation and grandfathered RC bodies are dispatched byte-for-byte unchanged', async () => {
        const inputBody = VALID_ORDINARY_REQUEST_CHANGES_BODY;

        for (const item of [{
            name      : 'activation issue has no merged closer',
            createdAt : '2026-07-16T13:57:04Z',
            activation: activationIssueNode([]),
            outcome   : 'pre-activation'
        }, {
            name      : 'created before cutover',
            createdAt : '2026-07-16T13:57:02Z',
            activation: activationIssueNode(),
            outcome   : 'grandfathered'
        }]) {
            let submittedBody;
            GraphqlService.query = async (queryString, variables) => {
                if (queryString.includes('GetPullRequestId')) {
                    return pullRequestLookup({createdAt: item.createdAt}, item.activation)
                }

                submittedBody = variables.body;
                return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}}
            };

            const result = await PullRequestService.managePrReview({
                action   : 'create',
                pr_number: 15257,
                state    : 'REQUEST_CHANGES',
                body     : inputBody
            });

            expect(result.error, item.name).toBeUndefined();
            expect(result.reviewBudget.outcome, item.name).toBe(item.outcome);
            expect(submittedBody, item.name).toBe(inputBody)
        }
    });

    test('#15257: one complete terminal Drop+Supersede passes after RC2; a second is refused', async () => {
        let capturedVariables;
        let reviews = [priorRequestChanges(), priorRequestChanges({id: 'PRR_second'})];

        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup({
                    createdAt: '2026-07-16T13:57:04Z',
                    reviews  : {nodes: reviews, pageInfo: {hasPreviousPage: false}}
                });
            }

            capturedVariables = variables;
            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}};
        };

        const first = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 15257,
            state    : 'REQUEST_CHANGES',
            body     : VALID_DROP_SUPERSEDE_REVIEW_BODY
        });

        expect(first.error).toBeUndefined();
        expect(first.reviewBudget.outcome).toBe('terminal-drop-supersede');
        expect(capturedVariables.body).toContain(VALID_DROP_SUPERSEDE_REVIEW_BODY);
        expect(capturedVariables.body).toContain('[review-budget-managed]');
        expect(capturedVariables.body).toContain('- outcome: terminal-drop-supersede');

        reviews = [...reviews, priorRequestChanges({
            body: VALID_DROP_SUPERSEDE_REVIEW_BODY,
            id  : 'PRR_terminal'
        })];

        const second = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 15257,
            state    : 'REQUEST_CHANGES',
            body     : VALID_DROP_SUPERSEDE_REVIEW_BODY
        });

        expect(second.code).toBe('PR_REVIEW_BUDGET_VALIDATION_FAILED');
        expect(second.message).toContain('already has a validated terminal Drop+Supersede');
    });

    test('#15257: incomplete Drop+Supersede fails before GraphQL dispatch', async () => {
        let graphqlCallCount = 0;
        GraphqlService.query = async () => { graphqlCallCount++ };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 15257,
            state    : 'REQUEST_CHANGES',
            body     : VALID_FOLLOWUP_REVIEW_BODY
                .replace('**Status:** Approved', '**Status:** Drop+Supersede')
                .replace('- **Decision**: Approve', '- **Decision**: Drop+Supersede')
        });

        expect(result.code).toBe('DROP_SUPERSEDE_CONTRACT_VALIDATION_FAILED');
        expect(result.missing_drop_supersede).toContain('Salvage map');
        expect(graphqlCallCount).toBe(0);
    });

    test('#15257: one-sided Drop+Supersede anchors are intent but never a valid terminal exception', async () => {
        const cases = [
            VALID_DROP_SUPERSEDE_REVIEW_BODY.replace('**Status:** Drop+Supersede', '**Status:** Request Changes'),
            VALID_DROP_SUPERSEDE_REVIEW_BODY.replace('- **Decision**: Drop+Supersede', '- **Decision**: Request Changes')
        ];

        for (const body of cases) {
            let graphqlCallCount = 0;
            GraphqlService.query = async () => { graphqlCallCount++ };

            const result = await PullRequestService.managePrReview({
                action   : 'create',
                pr_number: 15257,
                state    : 'REQUEST_CHANGES',
                body
            });

            expect(result.code).toBe('DROP_SUPERSEDE_CONTRACT_VALIDATION_FAILED');
            expect(result.missing_drop_supersede).toContain('Status + Decision: Drop+Supersede');
            expect(graphqlCallCount).toBe(0)
        }
    });

    test('#15257/#15309: reason-bearing override appends one canonical override and managed receipt', async () => {
        let capturedVariables;

        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup({
                    createdAt: '2026-07-16T13:57:04Z',
                    reviews  : {
                        nodes   : [priorRequestChanges(), priorRequestChanges({id: 'PRR_second'})],
                        pageInfo: {hasPreviousPage: false}
                    }
                });
            }

            capturedVariables = variables;
            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}};
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 15257,
            state    : 'REQUEST_CHANGES',
            body     : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes'),
            // A repair-minted receipt, not a free-text reason. `old-head` is the head the prior review
            // was actually submitted against, so the claim is checkable against this PR's own history;
            // `new-head` is the head under review.
            reviewBudgetOverrideReason: [
                'old-head: 1111111111111111111111111111111111111111',
                `new-head: ${PR_HEAD_OID}`,
                'prior-fact: the branch had no cadence leaf at that head, so the stride could not be observed',
                'repair-coordinate: ai/daemons/wake/daemon.mjs:106'
            ].join(' | ')
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewBudget.outcome).toBe('disclosed-override');
        expect(result.reviewBudget.overrideReason).toContain('repair-coordinate');
        expect(result.reviewBudget.repairMintedReceipt['old-head']).toBe('1111111111111111111111111111111111111111');
        expect(result.reviewBudget.repairMintedReceipt['repair-coordinate']).toBe('ai/daemons/wake/daemon.mjs:106');
        expect(capturedVariables.body.match(/^\[review-budget-override\]$/gm)).toHaveLength(1);
        expect(capturedVariables.body.match(/^\[review-budget-managed\]$/gm)).toHaveLength(1);
        expect(capturedVariables.body).toContain('- submitted-request-changes: 2');
        expect(capturedVariables.body).toContain('- ordinary-limit: 1');
    });

    test('#15257: incomplete/truncated history and invalid override disclosure fail closed', async () => {
        const cases = [{
            name    : 'truncated history',
            reviews : {nodes: [], pageInfo: {hasPreviousPage: true}},
            override: undefined,
            message : 'complete submitted-review history'
        }, {
            name   : 'newline override',
            reviews: {
                nodes   : [priorRequestChanges(), priorRequestChanges({id: 'PRR_second'})],
                pageInfo: {hasPreviousPage: false}
            },
            override: 'line one\nline two',
            message : 'non-empty single line'
        }];

        for (const item of cases) {
            GraphqlService.query = async queryString => {
                if (queryString.includes('GetPullRequestId')) {
                    return pullRequestLookup({
                        createdAt: '2026-07-16T13:57:04Z',
                        reviews  : item.reviews
                    });
                }

                throw new Error(`${item.name}: mutation must not run`);
            };

            const result = await PullRequestService.managePrReview({
                action                    : 'create',
                pr_number                 : 15257,
                state                     : 'REQUEST_CHANGES',
                body                      : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes'),
                reviewBudgetOverrideReason: item.override
            });

            expect(result.code, item.name).toBe('PR_REVIEW_BUDGET_VALIDATION_FAILED');
            expect(result.message, item.name).toContain(item.message);
        }
    });

    test('action:create + state:COMMENT → state enum maps to COMMENT event', async () => {
        let capturedVariables;
        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestId')) return pullRequestLookup();
            if (queryString.includes('AddPullRequestReview')) {
                capturedVariables = variables;
                return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'COMMENTED'}}};
            }
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11273,
            state    : 'COMMENT',
            body     : `Substantive review comment without formal state transition.\n\n${VALID_REVIEW_BODY}`
        });

        expect(result.error).toBeUndefined();
        expect(capturedVariables.event).toBe('COMMENT');
        expect(result.state).toBe('COMMENTED');
    });

    test('action:update → returns updated review payload via UPDATE_PULL_REQUEST_REVIEW', async () => {
        let capturedQuery;
        let capturedVariables;
        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestReview')) {
                return {node: {id: REVIEW_NODE.id, body: VALID_REVIEW_BODY, state: 'APPROVED'}}
            }

            capturedQuery     = queryString;
            capturedVariables = variables;
            return {updatePullRequestReview: {pullRequestReview: {...REVIEW_NODE, submittedAt: '2026-05-13T01:00:00Z'}}};
        };

        const result = await PullRequestService.managePrReview({
            action   : 'update',
            review_id: 'PRR_kwDOABcD1111111111',
            body     : `Updated review body.\n\n${VALID_REVIEW_BODY}`
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(result.submittedAt).toBe('2026-05-13T01:00:00Z');
        expect(capturedQuery).toContain('UpdatePullRequestReview');
        expect(capturedVariables.pullRequestReviewId).toBe('PRR_kwDOABcD1111111111');
        expect(capturedVariables.body).toContain('Updated review body.');
        expect(capturedVariables.body).toContain('[ARCH_ALIGNMENT]'); // template anchor preserved through dispatch
    });

    test('#15257: review updates cannot promote or demote ordinary RC and terminal Drop+Supersede', async () => {
        const ordinaryBody = managedReviewBody(
            VALID_ORDINARY_REQUEST_CHANGES_BODY
        );
        const terminalBody = managedReviewBody(VALID_DROP_SUPERSEDE_REVIEW_BODY, 'terminal-drop-supersede');

        for (const item of [{current: ordinaryBody, incoming: terminalBody}, {current: terminalBody, incoming: ordinaryBody}]) {
            let updateCalls = 0;

            GraphqlService.query = async queryString => {
                if (queryString.includes('GetPullRequestReview')) {
                    return {node: {id: REVIEW_NODE.id, body: item.current, state: 'CHANGES_REQUESTED'}}
                }

                updateCalls++;
                return null
            };

            const result = await PullRequestService.managePrReview({
                action   : 'update',
                review_id: REVIEW_NODE.id,
                body     : item.incoming
            });

            expect(result.code).toBe('PR_REVIEW_BUDGET_AUDIT_IMMUTABLE');
            expect(result.terminalClassificationChanged).toBe(true);
            expect(updateCalls).toBe(0)
        }
    });

    /**
     * The refusal's measured cost: a reviewer who hit it concluded the capability did not exist,
     * told the PR author and the operator that a submitted review body is immutable to this tool,
     * and fell back to a comment. Body edits ARE supported. What happened is that `create` appends
     * a machine-owned tail the caller never wrote, and `update` requires it back byte-identical —
     * so resubmitting your own edited body trips the comparison and is refused as an "audit-field
     * change". The refusal held every fact needed to print the remedy and printed a category.
     */
    test('#17354: the update refusal names the tail round-trip as its remedy', async () => {
        const current     = managedReviewBody(VALID_ORDINARY_REQUEST_CHANGES_BODY, 'within-budget');
        let   updateCalls = 0;

        GraphqlService.query = async queryString => {
            if (queryString.includes('GetPullRequestReview')) {
                return {node: {id: REVIEW_NODE.id, body: current, state: 'CHANGES_REQUESTED'}}
            }

            updateCalls++;
            return null
        };

        // Exactly what an author who edited their own copy sends: the prose, without a tail they
        // never wrote and cannot know about.
        const result = await PullRequestService.managePrReview({
            action   : 'update',
            review_id: REVIEW_NODE.id,
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY
        });

        expect(result.code, 'the guard still refuses — it is load-bearing').toBe('PR_REVIEW_BUDGET_AUDIT_IMMUTABLE');
        expect(updateCalls, 'and never reaches the mutation').toBe(0);

        // The remedy is mechanical and therefore not stuffable: re-fetch, edit above the marker,
        // resubmit the tail unchanged.
        expect(result.message, 'names the machine-owned tail').toContain('[review-budget-managed]');
        expect(result.message, 'names the round-trip as the fix').toMatch(/unchanged|re-?fetch|resubmit/i);

        // And hands back the exact bytes to restore, so the caller does not have to reconstruct them.
        expect(result.requiredTail, 'the tail to resubmit is returned verbatim').toContain('[review-budget-managed]')
    });

    test('#17354: create surfaces the machine-owned tail it appended', async () => {
        // A caller planning an update learns the tail exists from the create response, rather than
        // from a refusal after the fact. This is the half that stops the loop from starting.
        GraphqlService.query = async queryString => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup({
                    createdAt: '2026-07-16T13:57:04Z',
                    reviews  : {nodes: [], pageInfo: {hasPreviousPage: false}}
                })
            }

            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}}
        };

        RepositoryService.viewerLogin = 'neo-opus-grace';

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 17354,
            state    : 'REQUEST_CHANGES',
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY
        });

        expect(result.reviewBudget, 'the create response reports the budget').toBeTruthy();
        expect(result.machineOwnedTail, 'and names the tail it appended')
            .toContain('[review-budget-managed]')
    });

    test('#15257: review updates cannot add/remove provenance or rewrite managed audit fields', async () => {
        const currentBody = managedReviewBody(
            VALID_ORDINARY_REQUEST_CHANGES_BODY
        );
        const cases = [{
            incoming: currentBody.replace('[review-budget-managed]\n', ''),
            changed : 'marker'
        }, {
            incoming: currentBody.replace('- ordinary-limit: 2', '- ordinary-limit: 3'),
            changed : 'audit'
        }, {
            incoming: `- ordinary-limit: 2\n${currentBody.replace('- ordinary-limit: 2', '- ordinary-limit: 3')}`,
            changed : 'duplicate-field-mask'
        }];

        for (const item of cases) {
            let updateCalls = 0;
            GraphqlService.query = async queryString => {
                if (queryString.includes('GetPullRequestReview')) {
                    return {node: {id: REVIEW_NODE.id, body: currentBody, state: 'CHANGES_REQUESTED'}}
                }

                updateCalls++;
                return null
            };

            const result = await PullRequestService.managePrReview({
                action   : 'update',
                review_id: REVIEW_NODE.id,
                body     : item.incoming
            });

            expect(result.code, item.changed).toBe('PR_REVIEW_BUDGET_AUDIT_IMMUTABLE');
            expect(updateCalls, item.changed).toBe(0)
        }
    });

    test('rejects invalid action', async () => {
        const result = await PullRequestService.managePrReview({
            action: 'submit',
            body  : 'irrelevant'
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('INVALID_ARGUMENTS');
        expect(result.message).toContain("Must be 'create' or 'update'");
    });

    test('rejects missing body', async () => {
        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11273,
            state    : 'APPROVED'
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(result.message).toContain("'body' is required");
    });

    test('create: rejects missing pr_number', async () => {
        const result = await PullRequestService.managePrReview({
            action: 'create',
            state : 'APPROVED',
            body  : VALID_REVIEW_BODY
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(result.message).toContain("'pr_number'");
    });

    test('create: rejects invalid state', async () => {
        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11273,
            state    : 'INVALID_STATE',
            body     : VALID_REVIEW_BODY
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('INVALID_ARGUMENTS');
        expect(result.message).toContain('Invalid state');
    });

    test('update: rejects missing review_id', async () => {
        const result = await PullRequestService.managePrReview({
            action: 'update',
            body  : VALID_REVIEW_BODY
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(result.message).toContain("'review_id'");
    });

    test('create: surfaces PR_NOT_FOUND when GET_PULL_REQUEST_ID returns no id', async () => {
        // Simulates a non-existent PR number — GraphQL returns repository.pullRequest = null.
        GraphqlService.query = async (queryString) => {
            if (queryString.includes('GetPullRequestId')) return {repository: {pullRequest: null}};
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 99999,
            state    : 'APPROVED',
            body     : VALID_REVIEW_BODY
        });

        expect(result.error).toBe('Not Found');
        expect(result.code).toBe('PR_NOT_FOUND');
    });

    test('create: surfaces GraphQL errors cleanly', async () => {
        // When the underlying GraphQL request throws, we should return a structured
        // error rather than letting the exception propagate to the caller.
        GraphqlService.query = async () => {
            throw new Error('Network failure');
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11273,
            state    : 'APPROVED',
            body     : VALID_REVIEW_BODY
        });

        expect(result.error).toBe('GraphQL API request failed');
        expect(result.code).toBe('GRAPHQL_API_ERROR');
        expect(result.message).toBe('Network failure');
    });

    // ────────────────────────────────────────────────────────────────────────
    // Tool-boundary mechanical body-shape validation
    //   Visible layer: 7 metric tags, misses named in error
    //   Invisible layer: structural anchors, checked but NOT named in error
    //                    (defeats Goodhart anchor-stuffing — operator-directed 2026-05-16)
    // ────────────────────────────────────────────────────────────────────────

    test('#11491: rejects body missing all 7 visible metric anchors AND structural anchors', async () => {
        // The empirical recurrence: prior reviews shipped a hallucinated "Structural Evaluation
        // Matrix" with 5 invented metric names on a 1-10 scale, completely bypassing the template's
        // 7 evaluation-metric tags. The Retrospective daemon's regex parser saw zero ingest signal,
        // losing review-substrate data from the Native Edge Graph. This test pins the tool-boundary
        // gate that prevents this class of substrate loss.
        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return pullRequestLookup();
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11491,
            state    : 'APPROVED',
            body     : 'LGTM, looks great!'
        });

        expect(result.error).toBe('PR Review Template Validation Failed');
        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        // Visible-layer surface: missing_visible IS enumerated for caller diagnostics.
        expect(result.missing_visible).toEqual([
            '[ARCH_ALIGNMENT]',
            '[CONTENT_COMPLETENESS]',
            '[EXECUTION_QUALITY]',
            '[PRODUCTIVITY]',
            '[IMPACT]',
            '[COMPLEXITY]',
            '[EFFORT_PROFILE]'
        ]);
        // Skill-pointing discipline: the error MUST direct the agent to read the skill rather
        // than rely on the named-list to stuff anchors.
        expect(result.skill).toBe('.agents/skills/pr-review/SKILL.md');
        expect(result.template).toBe('.agents/skills/pr-review/assets/pr-review-template.md');
        // Anti-hallucination phrasing must be present so agents see the "do not compose substitute"
        // guidance. Case-insensitive match to avoid coupling to exact capitalization.
        expect(result.message.toLowerCase()).toContain('do not compose a substitute');
        expect(result.message).toContain('.agents/skills/pr-review/SKILL.md');
        // Critical: no GitHub API call should have been made — bad data must not land on GitHub.
        expect(graphqlCallCount).toBe(0);
    });

    test('#11491: Goodhart-stuffed body — all 7 metric tags present but missing structural anchors — still REJECTED', async () => {
        // Empirical anchor: a prior review contained ALL 7 metric tags but missed the structural
        // template anchors. The visible-only validator would have PASSED this body (the canonical
        // Goodhart-stuffing failure mode the invisible layer prevents). This test asserts that
        // structural-only-stuffing IS rejected without naming the invisible anchors in test prose.
        const stuffedBody = [
            'Approval granted.',
            // Premise snapshot complete, so the structural-skeleton miss (not the premise) is the isolated failure.
            '* **Inputs Read Before Patch:** ticket, changed-file list, current dev source.',
            '* **Expected Solution Shape:** preserve the selected review template skeleton.',
            '* **Patch Verdict:** matches the expected shape.',
            '* **Premise Coherence:** coheres: a stuffing-regression fixture; no value-surface.',
            `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
            '[ARCH_ALIGNMENT]: 100',
            '[CONTENT_COMPLETENESS]: 100',
            '[EXECUTION_QUALITY]: 100',
            '[PRODUCTIVITY]: 100',
            '[IMPACT]: 80',
            '[COMPLEXITY]: 20',
            '[EFFORT_PROFILE]: Quick Win'
            // Deliberately missing the structural template anchors that VALID_REVIEW_BODY contains.
            // The invisible layer rejects this without naming what's missing.
        ].join('\n');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return pullRequestLookup();
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11491,
            state    : 'APPROVED',
            body     : stuffedBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        // All 7 visible anchors present → missing_visible is empty.
        expect(result.missing_visible).toEqual([]);
        // But the message must still direct the agent to read the skill.
        expect(result.message).toContain('.agents/skills/pr-review/SKILL.md');
        expect(result.message).toContain('does not match the pr-review template structure');
        // Diagnostic-hint branch when no visible anchors are missing: must communicate
        // structural-anchor-class miss without enumerating the invisible list.
        expect(result.message).toContain('structural template anchors do not');
        // No GitHub API call — Goodhart-stuffing must not reach the wire.
        expect(graphqlCallCount).toBe(0);
    });

    test('#13547: rejects plain-heading cycle-1 review skeleton drift', async () => {
        const plainFullReviewBody = [
            '# PR Review Summary',
            '',
            '**Status:** Approved',
            '',
            '### Strategic-Fit Decision',
            '- Decision: Approve',
            '',
            '### Patch-Blind Premise Snapshot',
            '* **Inputs Read Before Patch:** ticket, changed-file list, current dev source.',
            '* **Expected Solution Shape:** preserve the selected review template skeleton.',
            '* **Patch Verdict:** matches the expected shape.',
            '* **Premise Coherence:** coheres: a plain-heading regression fixture; no value-surface.',
            '',
            '### Context & Graph Linking',
            '* **Target Epic / Issue ID:** Resolves #13547',
            '',
            '### Depth Floor',
            '- Documented search: scanned all relevant surfaces.',
            '',
            '### Graph Ingestion Notes',
            '* **`[KB_GAP]`**: N/A.',
            '* **`[TOOLING_GAP]`**: N/A.',
            '* **`[RETROSPECTIVE]`**: Plain-heading regression fixture.',
            '',
            '### Required Actions',
            'No required actions — eligible for human merge.',
            '',
            '### Evaluation Metrics',
            '[ARCH_ALIGNMENT]: 90 - aligned',
            '[CONTENT_COMPLETENESS]: 90 - complete',
            '[EXECUTION_QUALITY]: 90 - verified',
            '[PRODUCTIVITY]: 90 - delivers scope',
            '[IMPACT]: 70 - workflow guard',
            '[COMPLEXITY]: 40 - bounded validator',
            '[EFFORT_PROFILE]: Quick Win'
        ].join('\n');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return pullRequestLookup();
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 13547,
            state    : 'APPROVED',
            body     : plainFullReviewBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.missing_visible).toEqual([]);
        expect(result.missing_premise_snapshot).toEqual([]);
        expect(result.message).toContain('does not match the pr-review template structure');
        expect(graphqlCallCount).toBe(0);
    });

    test('#13547: accepts icon-bearing follow-up review skeleton', async () => {
        let graphqlCallCount = 0;
        GraphqlService.query = async (queryString) => {
            graphqlCallCount++;
            if (queryString.includes('GetPullRequestId')) return pullRequestLookup();
            if (queryString.includes('AddPullRequestReview')) return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 13547,
            state    : 'APPROVED',
            body     : VALID_FOLLOWUP_REVIEW_BODY
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(graphqlCallCount).toBe(2);
    });

    test('#13910: accepts documented Micro-Delta review without full metric anchors', async () => {
        let graphqlCallCount = 0;
        GraphqlService.query = async (queryString) => {
            graphqlCallCount++;
            if (queryString.includes('GetPullRequestId')) return pullRequestLookup();
            if (queryString.includes('AddPullRequestReview')) return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 13910,
            state    : 'COMMENT',
            body     : VALID_MICRO_DELTA_REVIEW_BODY
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(graphqlCallCount).toBe(2);
    });

    test('#16148: rejects missing, placeholder, or malformed origin sessions in every documented review format', async () => {
        const formats = [{
            body         : VALID_REVIEW_BODY,
            field        : `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
            missingBucket: 'missing_origin_session',
            name         : 'full',
            state        : 'APPROVED'
        }, {
            body         : VALID_FOLLOWUP_REVIEW_BODY,
            field        : `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
            missingBucket: 'missing_origin_session',
            name         : 'follow-up',
            state        : 'APPROVED'
        }, {
            body         : VALID_MICRO_DELTA_REVIEW_BODY,
            field        : `- **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
            missingBucket: 'missing_micro_delta',
            name         : 'micro-delta',
            state        : 'COMMENT'
        }];
        const invalidValues = [{
            name : 'missing',
            value: null
        }, {
            name : 'placeholder',
            value: '[Neo Memory Core session UUID]'
        }, {
            name : 'malformed',
            value: 'codex-task-019fac51'
        }];

        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return pullRequestLookup();
        };

        for (const format of formats) {
            for (const invalid of invalidValues) {
                const body = invalid.value === null
                    ? format.body.replace(`${format.field}\n`, '')
                    : format.body.replace(REVIEW_ORIGIN_SESSION_ID, invalid.value);
                const result = await PullRequestService.managePrReview({
                    action   : 'create',
                    body,
                    pr_number: 16148,
                    state    : format.state
                });

                expect(result.code, `${format.name} ${invalid.name}`).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
                expect(result[format.missingBucket], `${format.name} ${invalid.name}`)
                    .toContain('Origin Session ID: Neo Memory Core UUID');
                expect(result.message, `${format.name} ${invalid.name}`).toContain('Neo Memory Core session UUID');
            }
        }

        expect(graphqlCallCount).toBe(0);
    });

    test('#13910: rejects incomplete Micro-Delta review before GraphQL dispatch', async () => {
        const incompleteBody = VALID_MICRO_DELTA_REVIEW_BODY
            .replace('- **Measured Discussion Cost:** > 24KB\n', '');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return pullRequestLookup();
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 13910,
            state    : 'REQUEST_CHANGES',
            body     : incompleteBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.circuitBreaker).toBe('.agents/skills/pr-review/audits/review-cost-circuit-breaker.md');
        expect(result.template).toBe('.agents/skills/pr-review/assets/pr-review-micro-delta-template.md');
        expect(result.missing_micro_delta).toContain('- **Measured Discussion Cost:**');
        expect(result.message).toContain('pr-review-micro-delta-template.md');
        expect(graphqlCallCount).toBe(0);
    });

    test('#13910: rejects Micro-Delta review with a semantic blocker class', async () => {
        const semanticShortcutBody = VALID_MICRO_DELTA_REVIEW_BODY
            .replace('- **Remaining Blocker Class:** mechanical-hygiene', '- **Remaining Blocker Class:** semantic-blocker');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return pullRequestLookup();
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 13910,
            state    : 'REQUEST_CHANGES',
            body     : semanticShortcutBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.missing_micro_delta).toContain('Remaining Blocker Class: mechanical-hygiene | metadata-drift');
        expect(result.message).toContain('full follow-up review template instead');
        expect(graphqlCallCount).toBe(0);
    });

    test('#13910: workflow lint accepts documented Micro-Delta review bodies', async () => {
        const result = await runAgentPrReviewBodyLintWorkflow({
            body : VALID_MICRO_DELTA_REVIEW_BODY,
            state: 'commented'
        });

        expect(result.failures).toEqual([]);
        expect(result.comments).toEqual([]);
        expect(result.logs).toContain('✅ Micro-Delta body matches the documented circuit-breaker shape.');
    });

    test('#16148: workflow lint accepts concrete origin sessions in every documented review format', async () => {
        const formats = [{
            body : VALID_REVIEW_BODY,
            state: 'approved'
        }, {
            body : VALID_FOLLOWUP_REVIEW_BODY,
            state: 'approved'
        }, {
            body : VALID_MICRO_DELTA_REVIEW_BODY,
            state: 'commented'
        }];

        for (const format of formats) {
            const result = await runAgentPrReviewBodyLintWorkflow(format);

            expect(result.failures).toEqual([]);
            expect(result.comments).toEqual([]);
        }
    });

    test('#16148: workflow lint rejects missing, placeholder, or malformed origin sessions in every documented review format', async () => {
        const formats = [{
            body : VALID_REVIEW_BODY,
            field: `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
            name : 'full',
            state: 'approved'
        }, {
            body : VALID_FOLLOWUP_REVIEW_BODY,
            field: `* **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
            name : 'follow-up',
            state: 'approved'
        }, {
            body : VALID_MICRO_DELTA_REVIEW_BODY,
            field: `- **Origin Session ID:** ${REVIEW_ORIGIN_SESSION_ID}`,
            name : 'micro-delta',
            state: 'commented'
        }];
        const invalidValues = [{
            name : 'missing',
            value: null
        }, {
            name : 'placeholder',
            value: '[Neo Memory Core session UUID]'
        }, {
            name : 'malformed',
            value: 'codex-task-019fac51'
        }];

        for (const format of formats) {
            for (const invalid of invalidValues) {
                const body = invalid.value === null
                    ? format.body.replace(`${format.field}\n`, '')
                    : format.body.replace(REVIEW_ORIGIN_SESSION_ID, invalid.value);
                const result = await runAgentPrReviewBodyLintWorkflow({
                    body,
                    state: format.state
                });

                expect(result.failures, `${format.name} ${invalid.name}`).toHaveLength(1);
                expect(result.comments, `${format.name} ${invalid.name}`).toHaveLength(1);
                expect(result.comments[0].body, `${format.name} ${invalid.name}`).toContain('Origin Session');
            }
        }
    });

    test('#13910: workflow lint rejects incomplete Micro-Delta bodies before canonical fallback', async () => {
        const incompleteBody = VALID_MICRO_DELTA_REVIEW_BODY
            .replace('- **Measured Discussion Cost:** > 24KB\n', '');

        const result = await runAgentPrReviewBodyLintWorkflow({
            body : incompleteBody,
            state: 'commented'
        });

        expect(result.failures).toEqual([
            'Agent micro-delta review body missing required circuit-breaker anchors. See follow-up comment on PR #13910.'
        ]);
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].body).toContain('Agent Micro-Delta Review Body Lint Violation');
        expect(result.comments[0].body).toContain('.agents/skills/pr-review/assets/pr-review-micro-delta-template.md');
        expect(result.comments[0].body).not.toContain('Visible anchors missing');
    });

    test('#13910: workflow lint rejects Micro-Delta semantic blocker shortcuts', async () => {
        const semanticShortcutBody = VALID_MICRO_DELTA_REVIEW_BODY
            .replace('- **Remaining Blocker Class:** mechanical-hygiene', '- **Remaining Blocker Class:** semantic-blocker');

        const result = await runAgentPrReviewBodyLintWorkflow({
            body : semanticShortcutBody,
            state: 'commented'
        });

        expect(result.failures[0]).toContain('micro-delta review body missing required circuit-breaker anchors');
        expect(result.comments[0].body).toContain('mechanical-hygiene or metadata-drift');
        expect(result.comments[0].body).toContain('full follow-up review template instead');
    });

    test('#15257: workflow provenance applies only after the activation issue closing-PR cutover', async () => {
        const body          = VALID_ORDINARY_REQUEST_CHANGES_BODY;
        const grandfathered = await runAgentPrReviewBodyLintWorkflow({
            body,
            createdAt: '2026-07-16T13:57:02Z',
            state    : 'changes_requested'
        });
        const postCutover = await runAgentPrReviewBodyLintWorkflow({
            body,
            createdAt: '2026-07-16T13:57:04Z',
            state    : 'changes_requested'
        });

        expect(grandfathered.failures).toEqual([]);
        expect(postCutover.failures).toEqual([
            'Post-activation agent REQUEST_CHANGES review lacks managed-path provenance or `[review-budget-bypass] reason: ...` disclosure. Use manage_pr_review or disclose the direct gh/UI bypass.'
        ])
    });

    test('#15257: workflow treats zero merged dev closers as pre-activation', async () => {
        const result = await runAgentPrReviewBodyLintWorkflow({
            activationIssue: {
                id                            : 'I_kwDOABcD15257',
                closedByPullRequestsReferences: {
                    totalCount: 2,
                    nodes     : [{number: 15311, state: 'OPEN', mergedAt: null, baseRefName: 'dev'}, {
                        number     : 15312,
                        state      : 'MERGED',
                        mergedAt   : '2026-07-16T13:50:00Z',
                        baseRefName: 'main'
                    }],
                    pageInfo: {hasNextPage: false}
                }
            },
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY,
            createdAt: '2026-07-16T14:00:00Z',
            state    : 'changes_requested'
        });

        expect(result.failures).toEqual([])
    });

    test('#15257: workflow fails closed on missing, truncated, or malformed activation relations', async () => {
        const body  = VALID_ORDINARY_REQUEST_CHANGES_BODY;
        const cases = [{
            name           : 'missing issue',
            activationIssue: null,
            message        : 'Cannot resolve review-budget activation issue #15257.'
        }, {
            name           : 'truncated relation',
            activationIssue: {
                id                            : 'I_kwDOABcD15257',
                closedByPullRequestsReferences: {
                    totalCount: 1,
                    nodes     : [],
                    pageInfo  : {hasNextPage: true}
                }
            },
            message: 'Cannot prove the complete closing-PR history for review-budget activation issue #15257.'
        }, {
            name           : 'invalid mergedAt',
            activationIssue: {
                id                            : 'I_kwDOABcD15257',
                closedByPullRequestsReferences: {
                    totalCount: 1,
                    nodes     : [{number: 15312, state: 'MERGED', mergedAt: null, baseRefName: 'dev'}],
                    pageInfo  : {hasNextPage: false}
                }
            },
            message: 'Review-budget activation issue #15257 has a merged dev closer without a valid mergedAt.'
        }];

        for (const item of cases) {
            const result = await runAgentPrReviewBodyLintWorkflow({
                activationIssue: item.activationIssue,
                body,
                createdAt      : '2026-07-16T14:00:00Z',
                state          : 'changes_requested'
            });

            expect(result.failures, item.name).toEqual([item.message])
        }
    });

    test('#15257: workflow never lets bypass or COMMENTED weaken Drop+Supersede validation', async () => {
        const commented = await runAgentPrReviewBodyLintWorkflow({
            body : VALID_DROP_SUPERSEDE_REVIEW_BODY,
            state: 'commented'
        });
        const malformedBypass = await runAgentPrReviewBodyLintWorkflow({
            body: [
                VALID_FOLLOWUP_REVIEW_BODY
                    .replace('**Status:** Approved', '**Status:** Drop+Supersede')
                    .replace('- **Decision**: Approve', '- **Decision**: Drop+Supersede'),
                '[review-budget-bypass] reason: emergency direct review'
            ].join('\n'),
            createdAt: '2026-07-16T13:57:04Z',
            state    : 'changes_requested'
        });

        expect(commented.failures).toEqual([
            'A terminal Drop+Supersede verdict must use GitHub review state CHANGES_REQUESTED.'
        ]);
        expect(malformedBypass.failures[0]).toContain('Drop+Supersede body is incomplete')
    });

    test('#15257: workflow rejects either one-sided Drop+Supersede contradiction', async () => {
        const cases = [
            VALID_DROP_SUPERSEDE_REVIEW_BODY.replace('**Status:** Drop+Supersede', '**Status:** Request Changes'),
            VALID_DROP_SUPERSEDE_REVIEW_BODY.replace('- **Decision**: Drop+Supersede', '- **Decision**: Request Changes')
        ];

        for (const body of cases) {
            const result = await runAgentPrReviewBodyLintWorkflow({body, state: 'changes_requested'});

            expect(result.failures).toHaveLength(1);
            expect(result.failures[0]).toContain('Drop+Supersede body is incomplete');
            expect(result.failures[0]).toContain('Status + Decision')
        }
    });

    test('#15257: workflow rejects override-only provenance after cutover', async () => {
        const body = managedReviewBody(
            VALID_ORDINARY_REQUEST_CHANGES_BODY
        ).replace('[review-budget-managed]\n', '[review-budget-override]\n');
        const result = await runAgentPrReviewBodyLintWorkflow({
            body,
            createdAt: '2026-07-16T13:57:04Z',
            state    : 'changes_requested'
        });

        expect(result.failures).toEqual([
            '`[review-budget-override]` is valid only with managed-path provenance.'
        ])
    });

    test('#13910: workflow lint requires Premise Coherence for canonical reviews', async () => {
        const bodyWithoutPremiseCoherence = VALID_REVIEW_BODY
            .replace('* **Premise Coherence:** coheres: a substrate validator fix; flat-peer-team / facilitator-not-delegator unaffected.\n', '');

        const result = await runAgentPrReviewBodyLintWorkflow({
            body: bodyWithoutPremiseCoherence
        });

        expect(result.failures).toEqual([
            'Agent review body missing required template anchors. See follow-up comment on PR #13910.'
        ]);
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].body).toContain('Agent PR Review Body Lint Violation');
        expect(result.comments[0].body).toContain('Premise Coherence');
        expect(result.comments[0].body).toContain('all four premise fields');
    });

    test('#14263: accepts a Micro-Review (blast-scaled light shape) — micro PRs are not gauntletted', async () => {
        let graphqlCallCount = 0;
        GraphqlService.query = async (queryString) => {
            graphqlCallCount++;
            if (queryString.includes('GetPullRequestId')) return pullRequestLookup();
            if (queryString.includes('AddPullRequestReview')) return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 14263,
            state    : 'APPROVED',
            body     : VALID_MICRO_REVIEW_BODY
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(graphqlCallCount).toBe(2);
    });

    test('#14263: rejects a Micro-Review missing the Class blast-assertion (anti-backdoor)', async () => {
        // Drop the micro|contained token from the Class line — the light path must not be a backdoor
        // for an intense PR. Fail-safe-toward-accept applies to the TIER choice, not the class gate.
        const noClassBody = VALID_MICRO_REVIEW_BODY
            .replace('**Class:** micro — a one-line doc typo fix', '**Class:** a one-line doc typo fix');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => { graphqlCallCount++; return pullRequestLookup(); };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 14263,
            state    : 'APPROVED',
            body     : noClassBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.missing_micro_review).toContain('Class: micro | contained | mechanical (the blast-class assertion)');
        expect(result.message).toContain('no architectural concept to teach'); // the graph-ingestion gate keeps the concept-graph fed
        expect(graphqlCallCount).toBe(0);
    });

    test('#17527: a valid Micro-Review selects the micro template path — the wired asset, not the canonical fallback', () => {
        const result = PullRequestService.validatePrReviewBody({body: VALID_MICRO_REVIEW_BODY});

        expect(result.valid).toBe(true);
        expect(result.template).toBe('.agents/skills/pr-review/assets/pr-review-micro-review-template.md');
    });

    test('#17527: a full review that merely DISCUSSES the light form is not routed to the micro floor', () => {
        // the header quoted inside a fenced example must not reclassify the body — the
        // misclassification would silently waive every canonical anchor the full review owes
        const discussing = `${VALID_REVIEW_BODY}\n\n\`\`\`markdown\n# PR Micro-Review\n**Class:** micro\n\`\`\`\n`;

        const result = PullRequestService.validatePrReviewBody({body: discussing});

        expect(result.valid).toBe(true);
        expect(result.template).toBe('.agents/skills/pr-review/assets/pr-review-template.md');
    });

    test('#13547: rejects old plain-heading follow-up review skeleton', async () => {
        const plainFollowupBody = VALID_FOLLOWUP_REVIEW_BODY
            .replaceAll('### 🧭 Patch-Blind Premise Snapshot', '### Patch-Blind Premise Snapshot')
            .replaceAll('### 🪜 Strategic-Fit Decision', '### Strategic-Fit Decision')
            .replaceAll('### ⚓ Prior Review Anchor', '### Prior Review Anchor')
            .replaceAll('### 🔁 Delta Scope', '### Delta Scope')
            .replaceAll('### ✅ Previous Required Actions Audit', '### Previous Required Actions Audit')
            .replaceAll('### 🔬 Delta Depth Floor', '### Delta Depth Floor')
            .replaceAll('### 📊 Metrics Delta', '### Metrics Delta')
            .replaceAll('### 📋 Required Actions', '### Required Actions');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return pullRequestLookup();
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 13547,
            state    : 'APPROVED',
            body     : plainFollowupBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.missing_visible).toEqual([]);
        expect(result.missing_premise_snapshot).toEqual([]);
        expect(graphqlCallCount).toBe(0);
    });

    test('#11491: rejects body missing some visible anchors and names ONE diagnostic anchor only', async () => {
        // Operator-directed change: even when visible anchors are missing, the error names AT MOST
        // one diagnostic anchor rather than the full list, reducing the "stuff just these tags"
        // attack surface. The `missing_visible` field still carries the full list for programmatic
        // callers, but the human-facing message names only the first as a hint.
        const partialBody = [
            'My substantive review prose here.',
            '### 🪜 Strategic-Fit Decision',
            '### 🔬 Depth Floor',
            '### 📋 Required Actions',
            '[ARCH_ALIGNMENT]: 75',
            '[CONTENT_COMPLETENESS]: 75',
            '[EXECUTION_QUALITY]: 75',
            '[PRODUCTIVITY]: 75'
            // Missing: [IMPACT], [COMPLEXITY], [EFFORT_PROFILE]
        ].join('\n');

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11491,
            state    : 'APPROVED',
            body     : partialBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        // Programmatic surface preserves the full list for callers that want it.
        expect(result.missing_visible).toEqual(['[IMPACT]', '[COMPLEXITY]', '[EFFORT_PROFILE]']);
        // Human-facing message names ONE diagnostic only — the first miss.
        expect(result.message).toContain('[IMPACT]');
        // Other missing visible anchors are NOT enumerated in the message (anti-stuffing).
        expect(result.message).not.toContain('[COMPLEXITY]');
        expect(result.message).not.toContain('[EFFORT_PROFILE]');
    });

    test('#11491: accepts body with all visible AND invisible anchors present, proceeds to GraphQL dispatch', async () => {
        // Smoke test that the two-layer validator does NOT block well-formed reviews — the
        // depth-floor gate is permissive once both visible + invisible anchors are present;
        // quality remains the peer-V-B-A reviewer's responsibility.
        let graphqlCallCount = 0;
        GraphqlService.query = async (queryString) => {
            graphqlCallCount++;
            if (queryString.includes('GetPullRequestId')) return pullRequestLookup();
            if (queryString.includes('AddPullRequestReview')) return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11491,
            state    : 'APPROVED',
            body     : VALID_REVIEW_BODY
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        // Two GraphQL queries: GetPullRequestId + AddPullRequestReview
        expect(graphqlCallCount).toBe(2);
    });

    test('#12448: accepts a complete required premise snapshot (all four fields)', async () => {
        // The premise snapshot is REQUIRED: a body carrying all four bold-label fields passes
        // (here via VALID_REVIEW_BODY, which now includes the Premise Coherence field).
        let graphqlCallCount = 0;
        GraphqlService.query = async (queryString) => {
            graphqlCallCount++;
            if (queryString.includes('GetPullRequestId')) return pullRequestLookup();
            if (queryString.includes('AddPullRequestReview')) return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            return null;
        };

        const body = [
            '### Patch-Blind Premise Snapshot',
            '* **Inputs Read Before Patch:** ticket, changed-file list, current dev source.',
            '* **Expected Solution Shape:** optional validator recognition without hard enforcement.',
            '* **Patch Verdict:** matches expected optional-first migration.',
            '',
            VALID_REVIEW_BODY
        ].join('\n');

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 12448,
            state    : 'APPROVED',
            body
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(graphqlCallCount).toBe(2);
    });

    test('#12448: rejects partial premise snapshot without making a GitHub call', async () => {
        // All four premise fields are now REQUIRED. A partial snapshot (here: only Inputs Read
        // Before Patch) is the exact back-rationalization theater the required gate is meant to expose.
        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return pullRequestLookup();
        };

        const body = [
            '# PR Review Summary',
            '',
            '**Status:** Approved',
            '',
            '### 🪜 Strategic-Fit Decision',
            '- Decision: Approve',
            '',
            '### 🧭 Patch-Blind Premise Snapshot',
            '* **Inputs Read Before Patch:** ticket, changed-file list, current dev source.',
            '',
            '### 🕸️ Context & Graph Linking',
            '* **Target Epic / Issue ID:** Resolves #12448',
            '',
            '### 🔬 Depth Floor',
            '- Documented search: scanned all relevant surfaces.',
            '',
            '### 🧠 Graph Ingestion Notes',
            '* **`[KB_GAP]`**: N/A.',
            '* **`[TOOLING_GAP]`**: N/A.',
            '* **`[RETROSPECTIVE]`**: Partial snapshot fixture.',
            '',
            '### 📋 Required Actions',
            'No required actions — eligible for human merge.',
            '',
            '### 📊 Evaluation Metrics',
            '[ARCH_ALIGNMENT]: 80 - structural fit',
            '[CONTENT_COMPLETENESS]: 80 - covers AC matrix',
            '[EXECUTION_QUALITY]: 80 - tests pass',
            '[PRODUCTIVITY]: 70 - bounded scope',
            '[IMPACT]: 60 - localized substrate fix',
            '[COMPLEXITY]: 40 - mechanical change',
            '[EFFORT_PROFILE]: Quick Win'
        ].join('\n');

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 12448,
            state    : 'APPROVED',
            body
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.missing_visible).toEqual([]);
        expect(result.missing_premise_snapshot).toEqual(['Expected Solution Shape', 'Patch Verdict', 'Premise Coherence']);
        expect(result.message).toContain('Premise snapshot note');
        expect(graphqlCallCount).toBe(0);
    });

    test('#12448: ignores incidental premise-snapshot prose without making it partial', async () => {
        // Bare phrases in review prose must not activate the optional snapshot contract; only the
        // distinctive bold template labels should require the full three-field snapshot.
        let graphqlCallCount = 0;
        GraphqlService.query = async (queryString) => {
            graphqlCallCount++;
            if (queryString.includes('GetPullRequestId')) return pullRequestLookup();
            if (queryString.includes('AddPullRequestReview')) return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            return null;
        };

        const body = [
            'The Patch Verdict from the prior cycle still stands.',
            '',
            VALID_REVIEW_BODY
        ].join('\n');

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 12448,
            state    : 'APPROVED',
            body
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(graphqlCallCount).toBe(2);
    });

    test('#11491: invisible-anchor enforcement is NOT discoverable from the error response', async () => {
        // Surface contract: the invisible-anchor strings MUST NOT appear in the error response
        // body (neither `message` prose nor programmatic field). Discovery from outside requires
        // reading the validator source — which is the intended safeguard.
        const stuffedBody = [
            'Approval granted.',
            '[ARCH_ALIGNMENT]: 100',
            '[CONTENT_COMPLETENESS]: 100',
            '[EXECUTION_QUALITY]: 100',
            '[PRODUCTIVITY]: 100',
            '[IMPACT]: 80',
            '[COMPLEXITY]: 20',
            '[EFFORT_PROFILE]: Quick Win'
        ].join('\n');

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11491,
            state    : 'APPROVED',
            body     : stuffedBody
        });

        // Serialize the entire response and assert NONE of the invisible anchor substrings appear.
        // Reading these strings from the test source is OK; the production response must not.
        const responseJson = JSON.stringify(result);
        expect(responseJson).not.toContain('Depth Floor');
        expect(responseJson).not.toContain('Required Actions');
        expect(responseJson).not.toContain('Strategic-Fit Decision');
        // A `missing_invisible` field would leak the safeguard surface — must NOT exist.
        expect(result.missing_invisible).toBeUndefined();
    });

    test('#11491: action-check precedence preserved — invalid action returns INVALID_ARGUMENTS even with missing-anchor body', async () => {
        // Existing test on line ~488 covers the action-check; this one explicitly pins the
        // precedence ordering: action-validation must fire BEFORE body-validation so callers
        // get the more specific error first.
        const result = await PullRequestService.managePrReview({
            action: 'submit', // invalid
            body  : 'no anchors here'
        });

        expect(result.code).toBe('INVALID_ARGUMENTS');
        expect(result.code).not.toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
    });

    test('#11491: missing-body check precedence preserved — undefined body returns MISSING_ARGUMENTS not validation error', async () => {
        // Body-presence check must fire BEFORE body-shape validation so the error names the
        // more fundamental gap (`body is required`) rather than emitting a 7-anchor missing
        // list against an empty body.
        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11491,
            state    : 'APPROVED'
            // body intentionally omitted
        });

        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(result.message).toContain("'body' is required");
    });

    // ---------------------------------------------------------------------------------------------
    // The action-demand channels the budget could not see: COMMENT and A+FU approve, create + update
    // ---------------------------------------------------------------------------------------------

    const postBudgetCommentLookup = (body = VALID_ORDINARY_REQUEST_CHANGES_BODY) => ({
        body,
        reviews: {nodes: [priorRequestChanges()], pageInfo: {hasPreviousPage: false}}
    });

    const submitComment = async ({body, createdAt = '2026-07-16T13:57:04Z', reviews, activationIssue}) => {
        let mutationCallCount = 0;

        GraphqlService.query = async queryString => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup({createdAt, reviews}, activationIssue)
            }

            if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
            return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'COMMENTED'}}}
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 17214,
            state    : 'COMMENT',
            body
        });

        return {mutationCallCount, result}
    };

    // Editing an already-submitted review is the second way to raise a packet, and the create-side
    // guards never saw it. `state` is the EXISTING review's state, which is all the update path holds.
    const updateReview = async ({body, state}) => {
        let mutationCallCount = 0;

        GraphqlService.query = async queryString => {
            if (queryString.includes('GetPullRequestReview')) {
                return {node: {id: REVIEW_NODE.id, body: VALID_REVIEW_BODY, state}}
            }

            if (queryString.includes('UpdatePullRequestReview')) mutationCallCount++;
            return {updatePullRequestReview: {pullRequestReview: {...REVIEW_NODE, state}}}
        };

        const result = await PullRequestService.managePrReview({action: 'update', review_id: REVIEW_NODE.id, body});

        return {mutationCallCount, result}
    };

    // A body that raises its demand as RA-N PROSE rather than as a checkbox. @neo-gpt submitted exactly
    // this shape at the exact head and it was admitted: the first detector read the measured checkbox
    // population as the whole grammar.
    const RA_PROSE_BODY = VALID_ORDINARY_REQUEST_CHANGES_BODY.replace(
        '- [ ] name the boundary this must not hardcode',
        'RA-999: fix the production boundary'
    );

    // THE EVASION, replayed from the measured history behind this contract: the budget recorded ONE
    // ordinary round while three reviewer-pushed COMMENTED rounds carried 2, 1 and 1 live action items
    // straight past it — every one under a `### 📋 Required Action(s)` heading. Same shape here.
    test('#17214: a COMMENT that mints a new action packet is refused', async () => {
        const {mutationCallCount, result} = await submitComment(postBudgetCommentLookup());

        expect(result.code).toBe('PR_REVIEW_ACTION_PACKET_REFUSED');
        expect(result.demandedActionItems).toBe(1);
        expect(result.message).toContain('does not open a new packet');
        expect(mutationCallCount, 'the packet never reaches GitHub').toBe(0)
    });

    // THE DEFECT THE FIRST VERSION SHIPPED, and the reason this guard is now stateless. It refused a
    // demand COMMENT only once the family had spent an ordinary CHANGES_REQUESTED round — so a family
    // that never chose that enum was never "post-budget" and could demand forever. @neo-gpt admitted
    // the same packet after 0, 1 and 2 prior same-family demand COMMENTs at the exact head.
    test('#17214: the 0 -> 1 -> 2 prior-demand-COMMENT sequence refuses at every step', async () => {
        const demandComment = index => ({
            body       : VALID_ORDINARY_REQUEST_CHANGES_BODY,
            id         : `PRR_demand_${index}`,
            state      : 'COMMENTED',
            submittedAt: `2026-07-16T1${index}:00:00Z`,
            author     : {login: 'neo-gpt'},
            commit     : {oid: '1111111111111111111111111111111111111111'}
        });

        for (const priorCount of [0, 1, 2]) {
            const {mutationCallCount, result} = await submitComment({
                body   : VALID_ORDINARY_REQUEST_CHANGES_BODY,
                reviews: {
                    nodes   : Array.from({length: priorCount}, (_, index) => demandComment(index)),
                    pageInfo: {hasPreviousPage: false}
                }
            });

            expect(result.code, `${priorCount} prior demand COMMENT(s)`).toBe('PR_REVIEW_ACTION_PACKET_REFUSED');
            expect(mutationCallCount, `${priorCount} prior demand COMMENT(s)`).toBe(0)
        }
    });

    // The demand grammar is not only a checkbox. This exact specimen was admitted before the RA-N arm.
    test('#17214: an RA-N prose demand under Required Actions is refused', async () => {
        const {mutationCallCount, result} = await submitComment({body: RA_PROSE_BODY});

        expect(result.code).toBe('PR_REVIEW_ACTION_PACKET_REFUSED');
        expect(result.demandedActionItems).toBe(1);
        expect(mutationCallCount).toBe(0)
    });

    // The update path had NO demand guard, so both create-side guards could be walked around: submit
    // an admissible review, then edit the demand in. Both injections reached the mutation at the head.
    test('#17214: editing a demand into a submitted COMMENTED or APPROVED review is refused', async () => {
        const commented = await updateReview({body: VALID_ORDINARY_REQUEST_CHANGES_BODY, state: 'COMMENTED'});

        expect(commented.result.code).toBe('PR_REVIEW_ACTION_PACKET_REFUSED');
        expect(commented.mutationCallCount).toBe(0);

        const approved = await updateReview({body: VALID_ORDINARY_REQUEST_CHANGES_BODY, state: 'APPROVED'});

        expect(approved.result.code).toBe('PR_REVIEW_FOLLOW_UP_OWNERSHIP_FAILED');
        expect(approved.mutationCallCount).toBe(0)
    });

    // The mirror, and the reason the update guard is state-keyed rather than blanket: a demand packet
    // is what CHANGES_REQUESTED is FOR, and its ordinary round was charged when the review was created.
    // Without this, the guard would forbid an author-requested edit to a legitimate Round-1 packet.
    test('#17214: editing a CHANGES_REQUESTED review\'s own packet stays permitted', async () => {
        const {mutationCallCount, result} = await updateReview({
            body : VALID_ORDINARY_REQUEST_CHANGES_BODY,
            state: 'CHANGES_REQUESTED'
        });

        expect(result.error).toBeUndefined();
        expect(mutationCallCount).toBe(1)
    });

    // The other direction, and the one that decides whether the guard is usable at all: the SAME
    // exhausted family, the SAME PR, carrying the disposition it is supposed to carry. If this refuses,
    // the guard has closed the terminal round instead of the evasion — which is the failure mode that
    // matters, because a COMMENT is the only state a STILL_OPEN disposition may use.
    test('#17214: the same post-budget family passes when the COMMENT is a carried-action disposition', async () => {
        const {mutationCallCount, result} = await submitComment(
            postBudgetCommentLookup(VALID_ROUND_2_REVIEW_BODY)
        );

        expect(result.error, 'a disposition is what the budget refusal ASKS for').toBeUndefined();
        expect(mutationCallCount).toBe(1)
    });

    // The non-vacuity control for the section scoping, and the sharpest specimen available: a verdict
    // block is a list of UNCHECKED OPTIONS (`- [ ] **APPROVED**`, `- [ ] **MAINTAINER POLISH FAST PATH
    // APPLIED**`), which a body-wide checkbox scan reads as two fresh demands. Verified by mutation —
    // dropping the section scope fails exactly this test and no other.
    test('#17214: a post-budget COMMENTED CLOSURE passes — verdict options are not demands', async () => {
        const {mutationCallCount, result} = await submitComment(
            postBudgetCommentLookup(VALID_MICRO_DELTA_REVIEW_BODY)
        );

        expect(result.error).toBeUndefined();
        expect(mutationCallCount).toBe(1)
    });

    // THE STATELESSNESS ITSELF, pinned from three directions at once. Every one of these was an ADMIT
    // under the budget-scoped version — a family with no spent round, a different family, and a
    // grandfathered PR each supplied a state in which the demand was waved through. The refusal must
    // not depend on any of them, because each was a way to be right about the demand and admit it.
    test('#17214: the demand refusal does not depend on budget, family, or cutover state', async () => {
        const cases = [
            {name: 'family that has spent nothing', lookup: {body: VALID_ORDINARY_REQUEST_CHANGES_BODY, reviews: {nodes: [], pageInfo: {hasPreviousPage: false}}}},
            {name: 'pre-cutover (grandfathered) PR', lookup: {...postBudgetCommentLookup(), createdAt: '2026-07-16T13:57:02Z'}},
            {name: 'unresolvable activation',        lookup: {...postBudgetCommentLookup(), activationIssue: activationIssueNode([])}}
        ];

        for (const item of cases) {
            const {mutationCallCount, result} = await submitComment(item.lookup);

            expect(result.code, item.name).toBe('PR_REVIEW_ACTION_PACKET_REFUSED');
            expect(mutationCallCount, item.name).toBe(0)
        }

        // ...and a different family gets no separate allowance either: the bound is the demand, so
        // there is no per-family COMMENT quota to spend in the first place.
        RepositoryService.viewerLogin = 'neo-opus-grace';

        const otherFamily = await submitComment(postBudgetCommentLookup());

        expect(otherFamily.result.code).toBe('PR_REVIEW_ACTION_PACKET_REFUSED');
        expect(otherFamily.mutationCallCount).toBe(0)
    });

    // AC-8. A+FU existed only as prose — the string `A+FU` appears nowhere under `ai/` — so an approval
    // could demand work and name nobody to do it, at the exact moment the PR becomes mergeable.
    test('#17214: an APPROVE carrying an unowned follow-up action is refused', async () => {
        let mutationCallCount = 0;

        GraphqlService.query = async queryString => {
            if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
            return queryString.includes('GetPullRequestId')
                ? pullRequestLookup()
                : {addPullRequestReview: {pullRequestReview: REVIEW_NODE}}
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 17214,
            state    : 'APPROVED',
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY
        });

        expect(result.code).toBe('PR_REVIEW_FOLLOW_UP_OWNERSHIP_FAILED');
        expect(result.unownedFollowUpItems).toBe(1);
        expect(mutationCallCount).toBe(0)
    });

    // INDEPENDENT is the load-bearing word, and this suite originally proved the opposite: its positive
    // fixture cited the very issue the PR closes as evidence of independent follow-up ownership.
    // @neo-gpt caught it — an item pointing at the close target names work the merge is about to
    // declare finished. The anti-pattern was shipped as its own proof.
    //
    // `line #42` is the second non-owner: a coordinate names a place, not a ticket accepting work.
    test('#17214: a coordinate and the PR\'s own close target are both refused as owners', async () => {
        const approveWith = async followUp => {
            let mutationCallCount = 0;

            GraphqlService.query = async queryString => {
                if (queryString.includes('GetPullRequestId')) {
                    return pullRequestLookup({body: 'Resolves #17214\n\nthe close target this PR declares'})
                }

                // The owner-resolution lookup this suite gained later: the positive control below
                // cites a real open issue, so it must resolve as one or it would refuse for the
                // wrong reason and the test would pass while proving something else.
                if (queryString.includes('IssueStates')) {
                    return {repository: {issue17141: {number: 17141, state: 'OPEN'}}}
                }

                if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
                return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}}
            };

            const result = await PullRequestService.managePrReview({
                action   : 'create',
                pr_number: 17214,
                state    : 'APPROVED',
                body     : VALID_ORDINARY_REQUEST_CHANGES_BODY.replace(
                    '- [ ] name the boundary this must not hardcode',
                    `- [ ] name the boundary this must not hardcode ${followUp}`
                )
            });

            return {mutationCallCount, result}
        };

        for (const item of [
            {name: 'a coordinate',                 followUp: '— line #42'},
            {name: 'the PR\'s own close target',   followUp: '— #17214'},
            {name: 'a close-target issue URL',     followUp: '— https://github.com/neomjs/neo/issues/17214'}
        ]) {
            const {mutationCallCount, result} = await approveWith(item.followUp);

            expect(result.code, item.name).toBe('PR_REVIEW_FOLLOW_UP_OWNERSHIP_FAILED');
            expect(mutationCallCount, item.name).toBe(0)
        }

        // The positive control, and it has to be an issue this PR does NOT close — otherwise the three
        // refusals above would pass against a guard that simply rejects every approval with a checkbox.
        const owned = await approveWith('— #17141');

        expect(owned.result.error, 'an independent owning issue is the whole point of A+FU').toBeUndefined();
        expect(owned.mutationCallCount).toBe(1)
    });

    // A citation is only ownership if it resolves. I argued this belonged in the post-submit audit
    // rather than at admission, because admission should not make network round trips; @neo-gpt held
    // that admission is the layer and showed why at the exact head — a CLOSED issue and a NONEXISTENT
    // one both satisfied the lexical check and reached the mutation. The cost objection is answered
    // rather than overruled: ONE batched request for any number of citations, issued only when the
    // approval carries follow-up items at all.
    const approveWithOwners = async (followUp, issueStates) => {
        let mutationCallCount = 0,
            issueQueryCount   = 0;

        GraphqlService.query = async queryString => {
            if (queryString.includes('GetPullRequestId')) {
                return pullRequestLookup({body: 'Resolves #17214'})
            }

            if (queryString.includes('IssueStates')) {
                issueQueryCount++;
                return {repository: Object.fromEntries(
                    Object.entries(issueStates).map(([number, state]) => [`issue${number}`, state && {number: Number(number), state}])
                )}
            }

            if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
            return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}}
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 17214,
            state    : 'APPROVED',
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY.replace(
                '- [ ] name the boundary this must not hardcode',
                `- [ ] name the boundary this must not hardcode ${followUp}`
            )
        });

        return {issueQueryCount, mutationCallCount, result}
    };

    test('#17214: a closed or nonexistent follow-up owner is refused', async () => {
        // @neo-gpt's two exact specimens.
        const closed = await approveWithOwners('— #15257', {15257: 'CLOSED'});

        expect(closed.result.code).toBe('PR_REVIEW_FOLLOW_UP_OWNERSHIP_FAILED');
        expect(closed.result.message).toContain('already closed');
        expect(closed.mutationCallCount).toBe(0);

        const missing = await approveWithOwners('— #999999', {999999: null});

        expect(missing.result.code).toBe('PR_REVIEW_FOLLOW_UP_OWNERSHIP_FAILED');
        expect(missing.result.message).toContain('no such issue');
        expect(missing.mutationCallCount).toBe(0)
    });

    test('#17214: an OPEN independent owner still passes, in one batched lookup', async () => {
        const {issueQueryCount, mutationCallCount, result} = await approveWithOwners('— #17141', {17141: 'OPEN'});

        expect(result.error, 'the whole point of A+FU is that this case works').toBeUndefined();
        expect(mutationCallCount).toBe(1);
        expect(issueQueryCount, 'one request resolves every citation, not one per citation').toBe(1)
    });

    test('#17214: a plain APPROVE performs no owner lookup at all', async () => {
        // The cost argument, pinned. If this ever goes to 1, the default merge-safe terminal has
        // started paying for a feature it does not use. A plain APPROVE means NO follow-up items at
        // all — the canonical body's "No required actions", not an item with its owner removed.
        let mutationCallCount = 0,
            issueQueryCount   = 0;

        GraphqlService.query = async queryString => {
            if (queryString.includes('GetPullRequestId'))     return pullRequestLookup();
            if (queryString.includes('IssueStates'))          issueQueryCount++;
            if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
            return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}}
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 17214,
            state    : 'APPROVED',
            body     : VALID_REVIEW_BODY
        });

        expect(result.error).toBeUndefined();
        expect(mutationCallCount).toBe(1);
        expect(issueQueryCount).toBe(0)
    });

    test('#17214: an unreadable owner lookup admits rather than blocking the merge-safe terminal', async () => {
        let mutationCallCount = 0;

        GraphqlService.query = async queryString => {
            if (queryString.includes('GetPullRequestId')) return pullRequestLookup({body: 'Resolves #17214'});
            if (queryString.includes('IssueStates'))      throw new Error('network');
            if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
            return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}}
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 17214,
            state    : 'APPROVED',
            body     : VALID_ORDINARY_REQUEST_CHANGES_BODY.replace(
                '- [ ] name the boundary this must not hardcode',
                '- [ ] name the boundary this must not hardcode — #17141'
            )
        });

        // Deliberately the opposite direction from the budget's fail-closed refusals: blocking an
        // approval because GitHub hiccuped denies the path this whole contract exists to make
        // reachable, while admitting an unverifiable citation leaves work the audit can still surface.
        expect(result.error).toBeUndefined();
        expect(mutationCallCount).toBe(1)
    });

    // Plain APPROVE is the default merge-safe terminal outcome and must gain no new obligation. The
    // canonical body says "No required actions", which is the shape AC-8 protects.
    test('#17214: plain APPROVE is unchanged — no follow-up, no new anchors', async () => {
        let mutationCallCount = 0;

        GraphqlService.query = async queryString => {
            if (queryString.includes('AddPullRequestReview')) mutationCallCount++;
            return queryString.includes('GetPullRequestId')
                ? pullRequestLookup()
                : {addPullRequestReview: {pullRequestReview: REVIEW_NODE}}
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 17214,
            state    : 'APPROVED',
            body     : VALID_REVIEW_BODY
        });

        expect(result.error).toBeUndefined();
        expect(mutationCallCount).toBe(1)
    });
});
