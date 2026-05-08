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
 * @see Neo.ai.mcp.server.github-workflow.services.IssueService#createComment
 * @see Neo.ai.mcp.server.github-workflow.services.IssueService#updateComment
 */
test.describe('Neo.ai.mcp.server.github-workflow.services.IssueService — manageIssueComment (#10272)', () => {
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
