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

/**
 * @summary Contract coverage for `IssueService.manageIssueComment` enriched return shape (#10272 Phase 1).
 *
 * Prior to #10272, `createComment` returned only `{message}` — callers had no access to the
 * canonical comment identifier (GitHub global node ID), URL, or creation timestamp. The missing
 * identifier blocked the A2A propagation pattern (§2.3 of #10272): review-posts couldn't be
 * referenced by the author for selective-fetch via `get_conversation({comment_id: ...})`.
 *
 * `updateComment` already returned `{message, commentId, url, updatedAt}` — this spec locks in the
 * symmetric create-path contract: `{message, commentId, url, createdAt}`. Backward-compatible
 * extension (existing consumers reading only `message` continue to work).
 *
 * Tests exercise the GraphQL response parsing path; the actual GitHub API call is mocked via
 * `GraphqlService.query` monkey-patch (pattern established by `LabelService.spec.mjs` #10112).
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
        test('returns {message, commentId, url, updatedAt} — unchanged by #10272', async () => {
            // Update path was already enriched pre-#10272; this test pins the existing contract
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
 * @summary Contract coverage for `IssueService.manageIssueProjects` ProjectV2 membership surface (#11233 Phase 1).
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
 * @summary Contract coverage for `IssueService.assignIssue` precondition + post-verify gate (#11537).
 *
 * Pre-#11537, `assignIssue` performed blind-add: passing `['@me']` to an issue already assigned
 * to another peer would silently add @me as a second assignee, producing parallel-claim collisions
 * (empirical anchor: PR #11245 in `peer-role-mode.md` §7).
 *
 * Post-#11537, the method enforces a precondition + post-verify gate:
 * - Fetches current assignees via `GET_ISSUE_ASSIGNEES`.
 * - If non-empty and `requireUnassigned: true` (default), rejects with `ASSIGNEE_CONFLICT` (HTTP 409)
 *   unless `acknowledgedReassign: '<reason>'` is provided.
 * - On override, performs strict-replacement (clear + add) and posts an audit-trail comment on
 *   the issue capturing the reason (per GPT STEP_BACK AC8 carry-forward).
 *
 * This spec pins the **conflict-path** behavior — the substrate-discipline value-add of the gate.
 * Override/strict-replacement/audit-trail paths depend on `child_process.exec` (no ES-module-friendly
 * mock pattern in the current test harness); coverage gap documented in #11537 PR body for follow-up.
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
