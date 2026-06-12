import {setup} from '../../../../setup.mjs';

const appName = 'IssueServiceTest';

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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

test.describe('Neo.ai.services.github-workflow.IssueService — listIssues projections (#12706)', () => {
    let IssueService;
    let GraphqlService;
    let originalQuery;

    test.beforeAll(async () => {
        GraphqlService = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        IssueService   = (await import('../../../../../../ai/services/github-workflow/IssueService.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterEach(() => {
        GraphqlService.query = originalQuery;
    });

    function installIssueListStub(capture = {}) {
        GraphqlService.query = async (query, variables) => {
            capture.query     = query;
            capture.variables = variables;

            return {
                repository: {
                    issues: {
                        nodes: [{
                            number   : 12706,
                            title    : 'Add lean projection to GitHub Workflow issue lists',
                            body     : 'Long ticket body that title scans should not return.',
                            state    : 'OPEN',
                            createdAt: '2026-06-08T00:00:00Z',
                            updatedAt: '2026-06-08T01:00:00Z',
                            url      : 'https://github.com/neomjs/neo/issues/12706',
                            author   : {login: 'neo-gpt'},
                            labels   : {nodes: [{name: 'ai'}, {name: 'model-experience'}]},
                            assignees: {nodes: [{login: 'neo-gpt'}]}
                        }, {
                            number   : 12705,
                            title    : 'Path-scope docs-only CI',
                            body     : 'Filtered body',
                            state    : 'OPEN',
                            createdAt: '2026-06-08T00:10:00Z',
                            updatedAt: '2026-06-08T01:10:00Z',
                            url      : 'https://github.com/neomjs/neo/issues/12705',
                            author   : {login: 'neo-opus-vega'},
                            labels   : {nodes: [{name: 'ci'}]},
                            assignees: {nodes: []}
                        }]
                    }
                }
            };
        };
    }

    test('keeps full projection as the default body-bearing response', async () => {
        const capture = {};
        installIssueListStub(capture);

        const result = await IssueService.listIssues({limit: 10, state: 'open'});

        expect(capture.variables).toMatchObject({
            limit : 10,
            states: ['OPEN']
        });
        expect(result.count).toBe(2);
        expect(result.issues[0]).toMatchObject({
            body     : 'Long ticket body that title scans should not return.',
            createdAt: '2026-06-08T00:00:00Z',
            updatedAt: '2026-06-08T01:00:00Z',
            labels   : [{name: 'ai'}, {name: 'model-experience'}],
            assignees: [{login: 'neo-gpt'}]
        });
    });

    test('summary projection omits body after label and assignee filters', async () => {
        installIssueListStub();

        const result = await IssueService.listIssues({
            assignee  : 'neo-gpt',
            labels    : 'ai, model-experience',
            projection: 'summary'
        });

        expect(result.count).toBe(1);
        expect(result.issues[0]).toEqual({
            number   : 12706,
            title    : 'Add lean projection to GitHub Workflow issue lists',
            state    : 'OPEN',
            url      : 'https://github.com/neomjs/neo/issues/12706',
            labels   : [{name: 'ai'}, {name: 'model-experience'}],
            assignees: [{login: 'neo-gpt'}],
            author   : {login: 'neo-gpt'},
            createdAt: '2026-06-08T00:00:00Z',
            updatedAt: '2026-06-08T01:00:00Z'
        });
        expect(result.issues[0]).not.toHaveProperty('body');
    });

    test('title_only projection returns the compact title-scan shape', async () => {
        installIssueListStub();

        const result = await IssueService.listIssues({projection: 'title_only'});

        expect(result.issues[0]).toEqual({
            number   : 12706,
            title    : 'Add lean projection to GitHub Workflow issue lists',
            state    : 'OPEN',
            url      : 'https://github.com/neomjs/neo/issues/12706',
            labels   : [{name: 'ai'}, {name: 'model-experience'}],
            assignees: [{login: 'neo-gpt'}]
        });
        expect(result.issues[0]).not.toHaveProperty('body');
        expect(result.issues[0]).not.toHaveProperty('createdAt');
    });

    test('invalid projection is rejected before GraphQL is called', async () => {
        let called = false;
        GraphqlService.query = async () => {
            called = true;
        };

        const result = await IssueService.listIssues({projection: 'fields'});

        expect(called).toBe(false);
        expect(result).toMatchObject({
            code : 'INVALID_PROJECTION',
            error: 'Bad Request'
        });
    });
});

/**
 * @summary Contract coverage for `IssueService.manageIssueComment` enriched return shape.
 *
 * Previously, `createComment` returned only `{message}` — callers had no access to the
 * canonical comment identifier (GitHub global node ID), URL, or creation timestamp. The missing
 * identifier blocked the A2A propagation pattern: review-posts couldn't be
 * referenced by the author for selective-fetch via `get_conversation({comment_id: ...})`.
 *
 * `updateComment` already returned `{message, commentId, url, updatedAt}` — this spec locks in the
 * symmetric create-path contract: `{message, commentId, url, createdAt}`. Backward-compatible
 * extension (existing consumers reading only `message` continue to work).
 *
 * Tests exercise the GraphQL response parsing path; the actual GitHub API call is mocked via the
 * established `GraphqlService.query` monkey-patch pattern.
 *
 * @see Neo.ai.services.github-workflow.IssueService#createComment
 * @see Neo.ai.services.github-workflow.IssueService#updateComment
 */
test.describe('Neo.ai.services.github-workflow.IssueService — manageIssueComment (#10272)', () => {
    let IssueService;
    let GraphqlService;
    let originalQuery;

    test.beforeAll(async () => {
        GraphqlService = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        IssueService   = (await import('../../../../../../ai/services/github-workflow/IssueService.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(() => {
        GraphqlService.query = originalQuery;
    });

    test.describe('create action', () => {
        test('returns {message, commentId, url, createdAt} on successful issue-comment creation', async () => {
            const ISSUE_NODE_ID     = 'I_kwDOABcD1234567890';
            const NEW_COMMENT_ID    = 'IC_kwDOABcD_newcomment_9876';
            const NEW_COMMENT_URL   = 'https://github.com/neomjs/neo/issues/10272#issuecomment-4309098042';
            const NEW_COMMENT_TS    = '2026-04-24T01:48:14Z';

            let callCount = 0;

            GraphqlService.query = async (query, variables) => {
                callCount++;
                if (callCount === 1) {
                    // Issue ID lookup
                    return {repository: {issue: {id: ISSUE_NODE_ID}}};
                }
                if (callCount === 2) {
                    // ADD_COMMENT mutation — matches the shape IssueService.createComment consumes
                    return {
                        addComment: {
                            commentEdge: {
                                node: {
                                    id       : NEW_COMMENT_ID,
                                    url      : NEW_COMMENT_URL,
                                    createdAt: NEW_COMMENT_TS
                                }
                            }
                        }
                    };
                }
                throw new Error(`Unexpected additional GraphqlService.query call: ${callCount}`);
            };

            const result = await IssueService.manageIssueComment({
                issue_number: 10272,
                body        : 'Test comment body',
                agent       : 'Claude Opus 4.7 (Claude Code)',
                action      : 'create'
            });

            expect(result).toEqual({
                message  : 'Successfully created comment on issue #10272',
                commentId: NEW_COMMENT_ID,
                url      : NEW_COMMENT_URL,
                createdAt: NEW_COMMENT_TS
            });

            expect(callCount).toBe(2);
        });

        test('returns {message, commentId, url, createdAt} on successful PR-comment creation', async () => {
            // PR path diverges only in the ID lookup (GET_PULL_REQUEST_ID vs GET_ISSUE_ID);
            // the ADD_COMMENT mutation is shared. Asserting the PR path explicitly prevents
            // regression on the divergent-lookup branch of createComment.
            const PR_NODE_ID      = 'PR_kwDOABcD1234567890';
            const NEW_COMMENT_ID  = 'IC_kwDOABcD_prcomment_5432';
            const NEW_COMMENT_URL = 'https://github.com/neomjs/neo/pull/10268#issuecomment-4309099999';
            const NEW_COMMENT_TS  = '2026-04-24T01:55:00Z';

            let callCount = 0;

            GraphqlService.query = async (query, variables) => {
                callCount++;
                if (callCount === 1) {
                    return {repository: {pullRequest: {id: PR_NODE_ID}}};
                }
                if (callCount === 2) {
                    return {
                        addComment: {
                            commentEdge: {
                                node: {
                                    id       : NEW_COMMENT_ID,
                                    url      : NEW_COMMENT_URL,
                                    createdAt: NEW_COMMENT_TS
                                }
                            }
                        }
                    };
                }
                throw new Error(`Unexpected additional GraphqlService.query call: ${callCount}`);
            };

            const result = await IssueService.manageIssueComment({
                pr_number: 10268,
                body     : 'PR review comment body',
                agent    : 'Claude Opus 4.7 (Claude Code)',
                action   : 'create'
            });

            expect(result).toEqual({
                message  : 'Successfully created comment on PR #10268',
                commentId: NEW_COMMENT_ID,
                url      : NEW_COMMENT_URL,
                createdAt: NEW_COMMENT_TS
            });
        });

        test('rejects ambiguous subject (both issue_number and pr_number)', async () => {
            // Input validation guard — must fail-fast before any GraphqlService.query is called.
            let callCount = 0;
            GraphqlService.query = async () => { callCount++; return null; };

            const result = await IssueService.manageIssueComment({
                issue_number: 10272,
                pr_number   : 10268,
                body        : 'Ambiguous',
                agent       : 'Claude Opus 4.7 (Claude Code)',
                action      : 'create'
            });

            expect(result.error).toBe('Bad Request');
            expect(result.code).toBe('INVALID_ARGUMENTS');
            expect(callCount).toBe(0);
        });

        test('rejects missing agent on create', async () => {
            let callCount = 0;
            GraphqlService.query = async () => { callCount++; return null; };

            const result = await IssueService.manageIssueComment({
                issue_number: 10272,
                body        : 'Missing agent',
                action      : 'create'
            });

            expect(result.error).toBe('Bad Request');
            expect(result.code).toBe('MISSING_ARGUMENTS');
            expect(callCount).toBe(0);
        });

        test('propagates GraphQL error shape on API failure', async () => {
            GraphqlService.query = async () => {
                throw new Error('GitHub API rate limit exceeded');
            };

            const result = await IssueService.manageIssueComment({
                issue_number: 10272,
                body        : 'Will fail',
                agent       : 'Claude Opus 4.7 (Claude Code)',
                action      : 'create'
            });

            expect(result.error).toBe('GraphQL API request failed');
            expect(result.code).toBe('GRAPHQL_API_ERROR');
            expect(result.message).toContain('rate limit');
        });
    });

    test.describe('update action (existing contract — regression lock)', () => {
        test('returns {message, commentId, url, updatedAt} — unchanged by create-path enrichment', async () => {
            // Update path was already enriched before the create-path work; this test pins the existing contract
            // so the create-path enrichment doesn't accidentally drift it. Symmetry matters.
            const COMMENT_ID      = 'IC_kwDOABcD_existing_1234';
            const COMMENT_URL     = 'https://github.com/neomjs/neo/issues/10272#issuecomment-4309098042';
            const UPDATED_TS      = '2026-04-24T02:15:33Z';

            GraphqlService.query = async (query, variables) => {
                expect(variables.commentId).toBe(COMMENT_ID);
                return {
                    updateIssueComment: {
                        issueComment: {
                            id       : COMMENT_ID,
                            url      : COMMENT_URL,
                            updatedAt: UPDATED_TS
                        }
                    }
                };
            };

            const result = await IssueService.manageIssueComment({
                comment_id: COMMENT_ID,
                body      : 'Updated body',
                action    : 'update'
            });

            expect(result).toEqual({
                message  : `Successfully updated comment ${COMMENT_ID}`,
                commentId: COMMENT_ID,
                url      : COMMENT_URL,
                updatedAt: UPDATED_TS
            });
        });

        test('rejects missing comment_id on update', async () => {
            let callCount = 0;
            GraphqlService.query = async () => { callCount++; return null; };

            const result = await IssueService.manageIssueComment({
                body  : 'No comment id',
                action: 'update'
            });

            expect(result.error).toBe('Bad Request');
            expect(result.code).toBe('MISSING_ARGUMENTS');
            expect(callCount).toBe(0);
        });
    });

    test.describe('dispatcher validation', () => {
        test('rejects invalid action (must be create or update)', async () => {
            test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: GraphqlService mock-pollution residual under workers:1 - bucket G (#10924)');
            let callCount = 0;
            GraphqlService.query = async () => { callCount++; return null; };

            const result = await IssueService.manageIssueComment({
                issue_number: 10272,
                body        : 'Ignored',
                action      : 'delete'  // not a supported action
            });

            expect(result.error).toBe('Bad Request');
            expect(result.code).toBe('INVALID_ARGUMENTS');
            expect(callCount).toBe(0);
        });
    });
});

/**
 * @summary Contract coverage for `IssueService.manageIssueLabels` issue-or-PR labelable lookup.
 *
 * `manage_issue_labels` advertises an `issue_number` path parameter that can target either a
 * GitHub Issue or Pull Request. GitHub GraphQL models those as distinct fields, but both implement
 * the `Labelable` interface consumed by `addLabelsToLabelable` / `removeLabelsFromLabelable`.
 * These tests lock the dual lookup so PR labels do not regress to an Issue-only query path.
 *
 * @see Neo.ai.services.github-workflow.IssueService#manageIssueLabels
 */
test.describe('Neo.ai.services.github-workflow.IssueService — manageIssueLabels (#10077)', () => {
    let IssueService;
    let GraphqlService;
    let originalQuery;

    const repoLabels = [
        {id: 'LA_bug', name: 'bug'},
        {id: 'LA_ai',  name: 'ai'}
    ];

    test.beforeAll(async () => {
        GraphqlService = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        IssueService   = (await import('../../../../../../ai/services/github-workflow/IssueService.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(() => {
        GraphqlService.query = originalQuery;
    });

    test('adds labels to an Issue using the issue Labelable id', async () => {
        const ISSUE_NODE_ID = 'I_kwDOABcD_issue10077';
        let callCount       = 0;

        GraphqlService.query = async (query, variables) => {
            callCount++;
            if (callCount === 1) {
                expect(variables.issueNumber).toBe(10077);
                return {
                    repository: {
                        issue      : {id: ISSUE_NODE_ID},
                        pullRequest: null,
                        labels     : {nodes: repoLabels}
                    }
                };
            }
            if (callCount === 2) {
                expect(variables).toEqual({
                    labelableId: ISSUE_NODE_ID,
                    labelIds   : ['LA_bug', 'LA_ai']
                });
                return {addLabelsToLabelable: {clientMutationId: null}};
            }
            throw new Error(`Unexpected additional GraphqlService.query call: ${callCount}`);
        };

        const result = await IssueService.manageIssueLabels({
            issue_number: 10077,
            action      : 'add',
            labels      : ['bug', 'ai']
        });

        expect(result.message).toContain('Successfully added labels');
        expect(callCount).toBe(2);
    });

    test('adds labels to a Pull Request using the pullRequest Labelable id', async () => {
        const PR_NODE_ID = 'PR_kwDOABcD_pr11695';
        let callCount    = 0;

        GraphqlService.query = async (query, variables) => {
            callCount++;
            if (callCount === 1) {
                expect(variables.issueNumber).toBe(11695);
                return {
                    repository: {
                        issue      : null,
                        pullRequest: {id: PR_NODE_ID},
                        labels     : {nodes: repoLabels}
                    }
                };
            }
            if (callCount === 2) {
                expect(variables).toEqual({
                    labelableId: PR_NODE_ID,
                    labelIds   : ['LA_ai']
                });
                return {addLabelsToLabelable: {clientMutationId: null}};
            }
            throw new Error(`Unexpected additional GraphqlService.query call: ${callCount}`);
        };

        const result = await IssueService.manageIssueLabels({
            issue_number: 11695,
            action      : 'add',
            labels      : ['ai']
        });

        expect(result.message).toContain('Successfully added labels');
        expect(callCount).toBe(2);
    });

    test('removes labels from a Pull Request using the pullRequest Labelable id', async () => {
        const PR_NODE_ID = 'PR_kwDOABcD_pr11695';
        let callCount    = 0;

        GraphqlService.query = async (query, variables) => {
            callCount++;
            if (callCount === 1) {
                return {
                    repository: {
                        issue      : null,
                        pullRequest: {id: PR_NODE_ID},
                        labels     : {nodes: repoLabels}
                    }
                };
            }
            if (callCount === 2) {
                expect(variables).toEqual({
                    labelableId: PR_NODE_ID,
                    labelIds   : ['LA_bug']
                });
                return {removeLabelsFromLabelable: {clientMutationId: null}};
            }
            throw new Error(`Unexpected additional GraphqlService.query call: ${callCount}`);
        };

        const result = await IssueService.manageIssueLabels({
            issue_number: 11695,
            action      : 'remove',
            labels      : ['bug']
        });

        expect(result.message).toContain('Successfully removed labels');
        expect(callCount).toBe(2);
    });

    test('returns a structured GraphQL error when neither issue nor Pull Request exists', async () => {
        let callCount = 0;

        GraphqlService.query = async () => {
            callCount++;
            return {
                repository: {
                    issue      : null,
                    pullRequest: null,
                    labels     : {nodes: repoLabels}
                }
            };
        };

        const result = await IssueService.manageIssueLabels({
            issue_number: 999999,
            action      : 'add',
            labels      : ['bug']
        });

        expect(result.error).toBe('GraphQL API request failed');
        expect(result.code).toBe('GRAPHQL_API_ERROR');
        expect(result.message).toContain('issue or pull request #999999');
        expect(callCount).toBe(1);
    });

    test('returns a structured GraphQL error when a requested label is missing', async () => {
        let callCount = 0;

        GraphqlService.query = async () => {
            callCount++;
            return {
                repository: {
                    issue      : {id: 'I_kwDOABcD_issue10077'},
                    pullRequest: null,
                    labels     : {nodes: repoLabels}
                }
            };
        };

        const result = await IssueService.manageIssueLabels({
            issue_number: 10077,
            action      : 'add',
            labels      : ['missing-label']
        });

        expect(result.error).toBe('GraphQL API request failed');
        expect(result.code).toBe('GRAPHQL_API_ERROR');
        expect(result.message).toContain('missing-label');
        expect(callCount).toBe(1);
    });
});

/**
 * @summary Contract coverage for `IssueService.manageIssueProjects` ProjectV2 membership surface.
 *
 * `manage_issue_projects` is the substrate-correct replacement for the deprecated `release:v*`
 * label-as-project-proxy pattern. The three actions (`add`, `remove`, `update_field`) mirror the
 * `manage_issue_labels` shape and dispatch into the `addProjectV2ItemById`, `deleteProjectV2Item`,
 * and `updateProjectV2ItemFieldValue` GraphQL mutations respectively.
 *
 * Tests exercise the dispatcher boundaries (invalid action, missing required params) and the
 * mutation chains for the three happy-paths via `GraphqlService.query` monkey-patching. Phase 2
 * (label-set migration) and Phase 3 (script deletion) are out of scope for these unit tests.
 *
 * @see Neo.ai.services.github-workflow.IssueService#manageIssueProjects
 * @see Neo.ai.services.github-workflow.IssueService#attachIssueToProjects
 * @see Neo.ai.services.github-workflow.IssueService#detachIssueFromProjects
 * @see Neo.ai.services.github-workflow.IssueService#updateProjectV2ItemSingleSelect
 */
test.describe('Neo.ai.services.github-workflow.IssueService — manageIssueProjects (#11233)', () => {
    let IssueService;
    let GraphqlService;
    let originalQuery;

    test.beforeAll(async () => {
        GraphqlService = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        IssueService   = (await import('../../../../../../ai/services/github-workflow/IssueService.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(() => {
        GraphqlService.query = originalQuery;
    });

    test.describe('dispatcher validation', () => {
        test('rejects invalid action', async () => {
            test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: GraphqlService mock-pollution residual under workers:1 - bucket G (#10924)');
            let callCount = 0;
            GraphqlService.query = async () => { callCount++; return null; };

            const result = await IssueService.manageIssueProjects({
                issue_number: 11233,
                action      : 'delete',  // not a supported action
                projectNumbers: [12]
            });

            expect(result.error).toBe('Bad Request');
            expect(result.code).toBe('INVALID_ARGUMENTS');
            expect(callCount).toBe(0);
        });

        test("rejects action:'add' with empty projectNumbers", async () => {
            test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: GraphqlService mock-pollution residual under workers:1 - bucket G (#10924)');
            let callCount = 0;
            GraphqlService.query = async () => { callCount++; return null; };

            const result = await IssueService.manageIssueProjects({
                issue_number  : 11233,
                action        : 'add',
                projectNumbers: []
            });

            expect(result.error).toBe('Bad Request');
            expect(result.code).toBe('INVALID_ARGUMENTS');
            expect(callCount).toBe(0);
        });

        test("rejects action:'update_field' missing required params", async () => {
            test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: GraphqlService mock-pollution residual under workers:1 - bucket G (#10924)');
            let callCount = 0;
            GraphqlService.query = async () => { callCount++; return null; };

            const result = await IssueService.manageIssueProjects({
                issue_number : 11233,
                action       : 'update_field',
                projectNumber: 12
                // missing fieldName + value
            });

            expect(result.error).toBe('Bad Request');
            expect(result.code).toBe('INVALID_ARGUMENTS');
            expect(callCount).toBe(0);
        });
    });

    test.describe("action:'add' — attach to ProjectV2", () => {
        test('attaches issue to a project via addProjectV2ItemById and returns attachment metadata', async () => {
            test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: GraphqlService mock-pollution residual under workers:1 - bucket G (#10924)');

            const ISSUE_NODE_ID = 'I_kwDOABcD_issue11233';
            const PROJECT_ID    = 'PVT_kwDOA0zl484BXGrv';
            const NEW_ITEM_ID   = 'PVTI_kwDOA0zl484BXGrv_item11233';

            let callCount = 0;
            GraphqlService.query = async (query, vars) => {
                callCount++;
                // 1: GET_ISSUE_ID
                if (callCount === 1) return {repository: {issue: {id: ISSUE_NODE_ID}}};
                // 2: GET_PROJECT_V2_METADATA
                if (callCount === 2) {
                    return {organization: {projectV2: {id: PROJECT_ID, title: 'v13 Release', fields: {nodes: []}}}};
                }
                // 3: ADD_PROJECT_V2_ITEM
                if (callCount === 3) return {addProjectV2ItemById: {item: {id: NEW_ITEM_ID}}};
                throw new Error(`Unexpected additional GraphqlService.query call: ${callCount}`);
            };

            const result = await IssueService.manageIssueProjects({
                issue_number  : 11233,
                action        : 'add',
                projectNumbers: [12]
            });

            expect(result.message).toContain('1 project(s)');
            expect(result.attachments).toEqual([{projectNumber: 12, projectId: PROJECT_ID, itemId: NEW_ITEM_ID}]);
            expect(result.warnings).toEqual([]);
        });

        test('collects per-project warnings when a project is not found (partial-attach)', async () => {
            test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: GraphqlService mock-pollution residual under workers:1 - bucket G (#10924)');

            const ISSUE_NODE_ID  = 'I_kwDOABcD_issue11233';
            const VALID_PROJECT  = 'PVT_kwDOA0zl484BXGrv';
            const NEW_ITEM_ID    = 'PVTI_kwDOA0zl484BXGrv_partialOK';

            let callCount = 0;
            GraphqlService.query = async () => {
                callCount++;
                // 1: GET_ISSUE_ID
                if (callCount === 1) return {repository: {issue: {id: ISSUE_NODE_ID}}};
                // 2: GET_PROJECT_V2_METADATA for #12 → exists
                if (callCount === 2) {
                    return {organization: {projectV2: {id: VALID_PROJECT, title: 'v13 Release', fields: {nodes: []}}}};
                }
                // 3: ADD_PROJECT_V2_ITEM for #12 → succeeds
                if (callCount === 3) return {addProjectV2ItemById: {item: {id: NEW_ITEM_ID}}};
                // 4: GET_PROJECT_V2_METADATA for #999 → not found
                if (callCount === 4) return {organization: {projectV2: null}};
                throw new Error(`Unexpected additional GraphqlService.query call: ${callCount}`);
            };

            const result = await IssueService.manageIssueProjects({
                issue_number  : 11233,
                action        : 'add',
                projectNumbers: [12, 999]
            });

            expect(result.attachments).toEqual([{projectNumber: 12, projectId: VALID_PROJECT, itemId: NEW_ITEM_ID}]);
            expect(result.warnings.length).toBe(1);
            expect(result.warnings[0].projectNumber).toBe(999);
            expect(result.warnings[0].error).toContain('not found');
        });
    });

    test.describe("action:'update_field' — single-select field mutation", () => {
        test("updates Status field via single-select option ID resolution + updateProjectV2ItemFieldValue", async () => {
            test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: GraphqlService mock-pollution residual under workers:1 - bucket G (#10924)');

            const ISSUE_NODE_ID  = 'I_kwDOABcD_issue11233';
            const PROJECT_ID     = 'PVT_kwDOA0zl484BXGrv';
            const STATUS_FIELD_ID = 'PVTF_kwDOA0zl484BXGrv_status';
            const IN_PROG_OPT_ID = 'opt_in_progress_xyz';
            const ITEM_ID        = 'PVTI_kwDOA0zl484BXGrv_item11233';

            let callCount = 0;
            GraphqlService.query = async () => {
                callCount++;
                // 1: GET_ISSUE_ID
                if (callCount === 1) return {repository: {issue: {id: ISSUE_NODE_ID}}};
                // 2: GET_PROJECT_V2_METADATA (with Status field + options)
                if (callCount === 2) {
                    return {
                        organization: {
                            projectV2: {
                                id: PROJECT_ID,
                                title: 'v13 Release',
                                fields: {
                                    nodes: [
                                        {
                                            id     : STATUS_FIELD_ID,
                                            name   : 'Status',
                                            options: [
                                                {id: 'opt_todo_aaa',    name: 'Todo'},
                                                {id: IN_PROG_OPT_ID,    name: 'In Progress'},
                                                {id: 'opt_done_ccc',    name: 'Done'}
                                            ]
                                        }
                                    ]
                                }
                            }
                        }
                    };
                }
                // 3: FIND_PROJECT_V2_ITEM_BY_CONTENT → returns matching item on first page
                if (callCount === 3) {
                    return {
                        node: {
                            items: {
                                pageInfo: {endCursor: null, hasNextPage: false},
                                nodes   : [{id: ITEM_ID, content: {id: ISSUE_NODE_ID, number: 11233}}]
                            }
                        }
                    };
                }
                // 4: UPDATE_PROJECT_V2_ITEM_SINGLE_SELECT
                if (callCount === 4) return {updateProjectV2ItemFieldValue: {projectV2Item: {id: ITEM_ID}}};
                throw new Error(`Unexpected additional GraphqlService.query call: ${callCount}`);
            };

            const result = await IssueService.manageIssueProjects({
                issue_number : 11233,
                action       : 'update_field',
                projectNumber: 12,
                fieldName    : 'Status',
                value        : 'In Progress'
            });

            expect(result.message).toContain('Status');
            expect(result.message).toContain('In Progress');
            expect(result.fieldId).toBe(STATUS_FIELD_ID);
            expect(result.optionId).toBe(IN_PROG_OPT_ID);
            expect(result.itemId).toBe(ITEM_ID);
        });

        test('returns OPTION_NOT_FOUND with available options when value does not match', async () => {
            test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: GraphqlService mock-pollution residual under workers:1 - bucket G (#10924)');

            const ISSUE_NODE_ID = 'I_kwDOABcD_issue11233';
            const PROJECT_ID    = 'PVT_kwDOA0zl484BXGrv';

            let callCount = 0;
            GraphqlService.query = async () => {
                callCount++;
                if (callCount === 1) return {repository: {issue: {id: ISSUE_NODE_ID}}};
                if (callCount === 2) {
                    return {
                        organization: {
                            projectV2: {
                                id: PROJECT_ID, title: 'v13 Release',
                                fields: {
                                    nodes: [
                                        {
                                            id: 'PVTF_status', name: 'Status',
                                            options: [{id: 'opt_todo', name: 'Todo'}, {id: 'opt_done', name: 'Done'}]
                                        }
                                    ]
                                }
                            }
                        }
                    };
                }
                throw new Error(`Unexpected additional GraphqlService.query call: ${callCount}`);
            };

            const result = await IssueService.manageIssueProjects({
                issue_number : 11233,
                action       : 'update_field',
                projectNumber: 12,
                fieldName    : 'Status',
                value        : 'BlockedByCustomerWaiting'  // not a real option
            });

            expect(result.error).toBe('Not Found');
            expect(result.code).toBe('OPTION_NOT_FOUND');
            expect(result.message).toContain('Todo');
            expect(result.message).toContain('Done');
        });
    });
});

/**
 * @summary Contract coverage for `IssueService.assignIssue` precondition + post-verify gate.
 *
 * Previously, `assignIssue` performed blind-add: passing `['@me']` to an issue already assigned
 * to another peer would silently add @me as a second assignee, producing parallel-claim collisions
 * between agents.
 *
 * The method now enforces a precondition + post-verify gate:
 * - Fetches current assignees via `GET_ISSUE_ASSIGNEES`.
 * - If non-empty and `requireUnassigned: true` (default), rejects with `ASSIGNEE_CONFLICT` (HTTP 409)
 *   unless `acknowledgedReassign: '<reason>'` is provided.
 * - On override, performs strict-replacement (clear + add) and posts an audit-trail comment on
 *   the issue capturing the reason (per GPT STEP_BACK AC8 carry-forward).
 *
 * This spec pins the **conflict-path** behavior — the substrate-discipline value-add of the gate.
 * Override/strict-replacement/audit-trail paths depend on `child_process.exec` (no ES-module-friendly
 * mock pattern in the current test harness), so this file keeps coverage at the service boundary.
 *
 * @see Neo.ai.services.github-workflow.IssueService#assignIssue
 * @see https://github.com/orgs/neomjs/discussions/11536 — graduation origin (Pre-Write Coordination Substrate)
 */
test.describe('Neo.ai.services.github-workflow.IssueService — assignIssue precondition gate (#11537)', () => {
    let IssueService;
    let GraphqlService;
    let RepositoryService;
    let originalQuery;
    let originalGetViewerPermission;

    test.beforeAll(async () => {
        GraphqlService    = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        RepositoryService = (await import('../../../../../../ai/services/github-workflow/RepositoryService.mjs')).default;
        IssueService      = (await import('../../../../../../ai/services/github-workflow/IssueService.mjs')).default;

        originalQuery               = GraphqlService.query.bind(GraphqlService);
        originalGetViewerPermission = RepositoryService.getViewerPermission.bind(RepositoryService);

        // Default permission stub — write-eligible for the duration of this describe block.
        RepositoryService.getViewerPermission = async () => ({permission: 'WRITE'});
    });

    test.afterAll(() => {
        GraphqlService.query                  = originalQuery;
        RepositoryService.getViewerPermission = originalGetViewerPermission;
    });

    test.describe('conflict path (the substrate-discipline value-add)', () => {
        test('returns ASSIGNEE_CONFLICT when issue already has assignees + default requireUnassigned + no acknowledgedReassign', async () => {
            GraphqlService.query = async () => ({
                repository: {
                    issue: {
                        assignees: {nodes: [{login: 'neo-gemini-3-1-pro'}]}
                    }
                }
            });

            const result = await IssueService.assignIssue({
                issue_number: 10148,
                assignees   : ['@me']
            });

            expect(result.error).toBe('Assignee Conflict');
            expect(result.code).toBe('ASSIGNEE_CONFLICT');
            expect(result.currentAssignees).toEqual(['neo-gemini-3-1-pro']);
            expect(result.attemptedAssignees).toEqual(['@me']);
            expect(result.message).toContain('acknowledgedReassign');
            expect(result.message).toContain('requireUnassigned');
        });

        test('includes multi-assignee currentAssignees in the conflict payload (caller introspection)', async () => {
            GraphqlService.query = async () => ({
                repository: {
                    issue: {
                        assignees: {nodes: [
                            {login: 'neo-gemini-3-1-pro'},
                            {login: 'tobiu'}
                        ]}
                    }
                }
            });

            const result = await IssueService.assignIssue({
                issue_number: 10148,
                assignees   : ['@me']
            });

            expect(result.code).toBe('ASSIGNEE_CONFLICT');
            expect(result.currentAssignees).toEqual(['neo-gemini-3-1-pro', 'tobiu']);
            // Co-owner-add deferral note per OQ3 surfaces in caller-facing message
            expect(result.message).toContain('Co-owner-add');
        });

        test('precondition fetch is invoked exactly once before the conflict gate returns', async () => {
            let preconditionCallCount = 0;
            GraphqlService.query = async () => {
                preconditionCallCount++;
                return {
                    repository: {
                        issue: {
                            assignees: {nodes: [{login: 'neo-opus-4-7'}]}
                        }
                    }
                };
            };

            const result = await IssueService.assignIssue({
                issue_number: 11235,
                assignees   : ['@me']
            });

            // Gate returns BEFORE mutation; only 1 GraphQL call (the precondition fetch)
            expect(preconditionCallCount).toBe(1);
            expect(result.code).toBe('ASSIGNEE_CONFLICT');
        });
    });

    test.describe('permission gate (preserved from pre-#11537 behavior)', () => {
        test('returns FORBIDDEN when viewer lacks WRITE/MAINTAIN/ADMIN permission; precondition fetch NOT called', async () => {
            const writePermStub                   = RepositoryService.getViewerPermission;
            RepositoryService.getViewerPermission = async () => ({permission: 'READ'});

            let graphqlCalled = false;
            GraphqlService.query = async () => {
                graphqlCalled = true;
                return {};
            };

            const result = await IssueService.assignIssue({
                issue_number: 10148,
                assignees   : ['@me']
            });

            expect(result.error).toBe('Permission Denied');
            expect(result.code).toBe('FORBIDDEN');
            expect(graphqlCalled).toBe(false);

            RepositoryService.getViewerPermission = writePermStub;
        });
    });

    test.describe('clear-mode preservation (no precondition gate for empty assignees)', () => {
        test('clear-mode (empty assignees array) does NOT trigger precondition fetch', async () => {
            // Clear-mode hits the `if (!assignees || assignees.length === 0)` branch BEFORE the precondition.
            // execAsync may fail in the test env (no real gh CLI) — the key assertion is that GraphqlService.query
            // is NOT called (precondition skipped for clear-mode), pinning the gate-boundary.
            let graphqlCalled = false;
            GraphqlService.query = async () => {
                graphqlCalled = true;
                return {};
            };

            const result = await IssueService.assignIssue({
                issue_number: 10148,
                assignees   : []
            });

            expect(graphqlCalled).toBe(false);
            // Result will be either GH_CLI_ERROR (execAsync threw in test env) or success message — both acceptable;
            // we are testing the gate-boundary, not the underlying CLI shell-through.
            expect(result.code === 'GH_CLI_ERROR' || result.message?.includes('Successfully unassigned')).toBe(true);
        });
    });
});

/**
 * @summary Contract coverage for `IssueService.getConversation`.
 *
 * Issue-side twin of `PullRequestService.getConversation` — `get_conversation` is now a
 * single dual-purpose tool routing by `pr_number` xor `issue_number`. This block pins the
 * issue path's selector contract (identical to the PR path: `comment_id` > `since_comment_id`
 * > `last_n` > full), the missing-`issue_number` guard, and GraphQL-error propagation.
 *
 * Each test mocks `GraphqlService.query` to return a controlled four-comment issue fixture.
 *
 * @see Neo.ai.services.github-workflow.IssueService#getConversation
 */
test.describe('Neo.ai.services.github-workflow.IssueService — getConversation (#10702)', () => {
    let IssueService;
    let GraphqlService;
    let originalQuery;

    const COMMENT_A = {id: 'IC_a1111', author: {login: 'alice'}, body: 'First comment',  createdAt: '2026-05-22T01:00:00Z'};
    const COMMENT_B = {id: 'IC_b2222', author: {login: 'bob'},   body: 'Second comment', createdAt: '2026-05-22T01:10:00Z'};
    const COMMENT_C = {id: 'IC_c3333', author: {login: 'alice'}, body: 'Third comment',  createdAt: '2026-05-22T01:20:00Z'};
    const COMMENT_D = {id: 'IC_d4444', author: {login: 'bob'},   body: 'Fourth comment', createdAt: '2026-05-22T01:30:00Z'};

    const ISSUE_FIXTURE = {
        title   : 'Test Issue',
        body    : 'Issue body text',
        author  : {login: 'alice'},
        comments: {
            nodes: [COMMENT_A, COMMENT_B, COMMENT_C, COMMENT_D]
        }
    };

    test.beforeAll(async () => {
        GraphqlService = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        IssueService   = (await import('../../../../../../ai/services/github-workflow/IssueService.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(() => {
        GraphqlService.query = originalQuery;
    });

    test.beforeEach(() => {
        GraphqlService.query = async () => ({repository: {issue: ISSUE_FIXTURE}});
    });

    test('returns full conversation when no selector is passed (backward-compat default)', async () => {
        const result = await IssueService.getConversation({issue_number: 10702});

        expect(result.title).toBe('Test Issue');
        expect(result.comments.nodes).toHaveLength(4);
        expect(result.comments.nodes[0].id).toBe('IC_a1111');
        expect(result.comments.nodes[3].id).toBe('IC_d4444');
    });

    test('comment_id selector returns only the matching comment', async () => {
        const result = await IssueService.getConversation({
            issue_number: 10702,
            comment_id  : 'IC_c3333'
        });

        expect(result.title).toBe('Test Issue');
        expect(result.comments.nodes).toHaveLength(1);
        expect(result.comments.nodes[0].id).toBe('IC_c3333');
        expect(result.comments.nodes[0].body).toBe('Third comment');
    });

    test('comment_id selector returns empty when id not found (no match is not a fallback to full)', async () => {
        const result = await IssueService.getConversation({
            issue_number: 10702,
            comment_id  : 'IC_nonexistent'
        });

        expect(result.title).toBe('Test Issue');
        expect(result.comments.nodes).toHaveLength(0);
    });

    test('since_comment_id selector returns comments strictly AFTER the anchor', async () => {
        const result = await IssueService.getConversation({
            issue_number    : 10702,
            since_comment_id: 'IC_b2222'
        });

        expect(result.comments.nodes).toHaveLength(2);
        expect(result.comments.nodes[0].id).toBe('IC_c3333');
        expect(result.comments.nodes[1].id).toBe('IC_d4444');
    });

    test('since_comment_id at the last comment returns empty (nothing after)', async () => {
        const result = await IssueService.getConversation({
            issue_number    : 10702,
            since_comment_id: 'IC_d4444'
        });

        expect(result.comments.nodes).toHaveLength(0);
    });

    test('since_comment_id with invalid id returns empty (same shape as "nothing after")', async () => {
        const result = await IssueService.getConversation({
            issue_number    : 10702,
            since_comment_id: 'IC_nonexistent'
        });

        expect(result.comments.nodes).toHaveLength(0);
    });

    test('last_n selector returns last N comments in order', async () => {
        const result = await IssueService.getConversation({
            issue_number: 10702,
            last_n      : 2
        });

        expect(result.comments.nodes).toHaveLength(2);
        expect(result.comments.nodes[0].id).toBe('IC_c3333');
        expect(result.comments.nodes[1].id).toBe('IC_d4444');
    });

    test('last_n larger than available returns all comments', async () => {
        const result = await IssueService.getConversation({
            issue_number: 10702,
            last_n      : 100
        });

        expect(result.comments.nodes).toHaveLength(4);
    });

    test('selector precedence: comment_id wins over since_comment_id and last_n', async () => {
        const result = await IssueService.getConversation({
            issue_number    : 10702,
            comment_id      : 'IC_a1111',
            since_comment_id: 'IC_b2222',
            last_n          : 2
        });

        expect(result.comments.nodes).toHaveLength(1);
        expect(result.comments.nodes[0].id).toBe('IC_a1111');
    });

    test('rejects missing issue_number with structured error', async () => {
        let callCount = 0;
        GraphqlService.query = async () => { callCount++; return null; };

        const result = await IssueService.getConversation({comment_id: 'IC_a1111'});

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(callCount).toBe(0);
    });

    test('propagates GraphQL error shape on API failure', async () => {
        GraphqlService.query = async () => {
            throw new Error('GitHub API authentication failed');
        };

        const result = await IssueService.getConversation({issue_number: 10702});

        expect(result.error).toBe('GraphQL API request failed');
        expect(result.code).toBe('GRAPHQL_API_ERROR');
        expect(result.message).toContain('authentication');
    });
});
