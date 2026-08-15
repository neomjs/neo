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
                errors: [{path: ['repository', 'believedOpen3']}]
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
                reason: 'not-found-or-inaccessible'
            }]
        })
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
        state = 'OPEN'
    } = {}) => ({
        number        : 16029,
        state,
        mergedAt,
        baseRefName,
        headRefOid,
        mergeStateStatus,
        reviewDecision,
        reviewRequests: {
            pageInfo: {hasNextPage: reviewHasNextPage, endCursor: null},
            nodes   : reviewers.map(login => ({
                requestedReviewer: {__typename: 'User', login}
            }))
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
    const COMMENT_C = {id: 'IC_c3333', author: {login: 'alice'}, body: 'Third comment',  createdAt: '2026-04-24T01:20:00Z'};
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
        '# PR Review Follow-Up Summary',
        '',
        '**Status:** Approved',
        '',
        '**Cycle:** Cycle 2 follow-up',
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
        '* **Documented delta search:** I actively checked changed metadata, the prior blocker, and close-target state and found no new concerns.',
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

    const priorRequestChanges = ({
        body='Prior ordinary request changes.',
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
        '**Glance:** Premise + correctness: the change is the right shape (fixes the stale wording) and is correct + safe; no behavior touched.'
    ].join('\n');

    test.beforeAll(async () => {
        GraphqlService     = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        PullRequestService = (await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs')).default;
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
            body     : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')
        });

        expect(managedResult.error).toBeUndefined();
        expect(capturedVariables.body.match(/^\[review-budget-managed\]$/gm)).toHaveLength(1);
        expect(capturedVariables.body.match(/^\[review-budget-override\]$/gm)).toBeNull()
    });

    test('#15257: post-cutover third ordinary RC is refused across heads, reviewers, and an honest retraction', async () => {
        let   mutationCallCount = 0;
        const reviews           = [
            priorRequestChanges({
                body : `${VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')}\n\n[review-budget-managed]`,
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
            body     : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')
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
            body     : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')
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
            body     : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')
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
                body     : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')
            });

            expect(result.code, label).toBe('PR_REVIEW_BUDGET_VALIDATION_FAILED');
            expect(result.message, label).toContain('not a classifiable maintainer family');
        }

        // Note the shape: a PR with ZERO prior reviews. Under the old global count this was the freest
        // possible case, so the refusal cannot be inherited from an exhausted budget — it comes only
        // from the submitter being unplaceable.
        expect(mutationCallCount, 'neither unclassified submitter reached a mutation').toBe(0);
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
            body     : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')
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
            body     : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')
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
                body     : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')
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
            body     : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')
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
        const inputBody = VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes');

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
            action                    : 'create',
            pr_number                 : 15257,
            state                     : 'REQUEST_CHANGES',
            body                      : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes'),
            reviewBudgetOverrideReason: 'Operator-declared release safety exception with audit receipt #15257.'
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewBudget.outcome).toBe('disclosed-override');
        expect(result.reviewBudget.overrideReason).toContain('release safety exception');
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
            VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')
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

    test('#15257: review updates cannot add/remove provenance or rewrite managed audit fields', async () => {
        const currentBody = managedReviewBody(
            VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')
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
        const body          = VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes');
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
            body     : VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes'),
            createdAt: '2026-07-16T14:00:00Z',
            state    : 'changes_requested'
        });

        expect(result.failures).toEqual([])
    });

    test('#15257: workflow fails closed on missing, truncated, or malformed activation relations', async () => {
        const body  = VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes');
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
            VALID_FOLLOWUP_REVIEW_BODY.replace('**Status:** Approved', '**Status:** Request Changes')
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
        expect(result.missing_micro_review).toContain('Class: micro | contained (the blast-class assertion)');
        expect(result.message).toContain('no architectural concept to teach'); // the graph-ingestion gate keeps the concept-graph fed
        expect(graphqlCallCount).toBe(0);
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
});
