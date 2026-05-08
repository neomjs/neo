import {setup} from '../../../../setup.mjs';

const appName = 'DiscussionServiceTest';

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
 * @summary Contract coverage for `DiscussionService.manageDiscussionComment` enriched return shape (#10841).
 */
test.describe('Neo.ai.mcp.server.github-workflow.services.DiscussionService — manageDiscussionComment (#10841)', () => {
    let DiscussionService;
    let GraphqlService;
    let originalQuery;

    test.beforeAll(async () => {
        GraphqlService    = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        DiscussionService = (await import('../../../../../../ai/services/github-workflow/DiscussionService.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(() => {
        GraphqlService.query = originalQuery;
    });

    test.describe('create action', () => {
        test('returns {message, commentId, url, createdAt} on successful discussion-comment creation', async () => {
            const DISCUSSION_NODE_ID = 'D_kwDOABcD1234567890';
            const NEW_COMMENT_ID     = 'DC_kwDOABcD_newcomment_9876';
            const NEW_COMMENT_URL    = 'https://github.com/neomjs/neo/discussions/10841#discussioncomment-4309098042';
            const NEW_COMMENT_TS     = '2026-05-07T01:48:14Z';

            let callCount = 0;

            GraphqlService.query = async (query, variables) => {
                callCount++;
                if (callCount === 1) {
                    // Discussion ID lookup
                    return {repository: {discussion: {id: DISCUSSION_NODE_ID}}};
                }
                if (callCount === 2) {
                    // ADD_DISCUSSION_COMMENT mutation
                    return {
                        addDiscussionComment: {
                            comment: {
                                id       : NEW_COMMENT_ID,
                                url      : NEW_COMMENT_URL,
                                createdAt: NEW_COMMENT_TS
                            }
                        }
                    };
                }
                throw new Error(`Unexpected additional GraphqlService.query call: ${callCount}`);
            };

            const result = await DiscussionService.manageDiscussionComment({
                discussion_number: 10841,
                body             : 'Test comment body',
                agent            : 'Gemini 3.1 Pro (Antigravity)',
                action           : 'create'
            });

            expect(result).toEqual({
                message  : 'Successfully created comment on discussion #10841',
                commentId: NEW_COMMENT_ID,
                url      : NEW_COMMENT_URL,
                createdAt: NEW_COMMENT_TS
            });

            expect(callCount).toBe(2);
        });

        test('rejects missing agent on create', async () => {
            let callCount = 0;
            GraphqlService.query = async () => { callCount++; return null; };

            const result = await DiscussionService.manageDiscussionComment({
                discussion_number: 10841,
                body             : 'Missing agent',
                action           : 'create'
            });

            expect(result.error).toBe('Bad Request');
            expect(result.code).toBe('MISSING_ARGUMENTS');
            expect(callCount).toBe(0);
        });

        test('propagates GraphQL error shape on API failure', async () => {
            GraphqlService.query = async () => {
                throw new Error('GitHub API rate limit exceeded');
            };

            const result = await DiscussionService.manageDiscussionComment({
                discussion_number: 10841,
                body             : 'Will fail',
                agent            : 'Gemini 3.1 Pro (Antigravity)',
                action           : 'create'
            });

            expect(result.error).toBe('GraphQL API request failed');
            expect(result.code).toBe('GRAPHQL_API_ERROR');
            expect(result.message).toContain('rate limit');
        });
    });

    test.describe('update action', () => {
        test('returns {message, commentId, url, updatedAt}', async () => {
            const COMMENT_ID  = 'DC_kwDOABcD_existing_1234';
            const COMMENT_URL = 'https://github.com/neomjs/neo/discussions/10841#discussioncomment-4309098042';
            const UPDATED_TS  = '2026-05-07T02:15:33Z';

            GraphqlService.query = async (query, variables) => {
                expect(variables.commentId).toBe(COMMENT_ID);
                return {
                    updateDiscussionComment: {
                        comment: {
                            id       : COMMENT_ID,
                            url      : COMMENT_URL,
                            updatedAt: UPDATED_TS
                        }
                    }
                };
            };

            const result = await DiscussionService.manageDiscussionComment({
                comment_id: COMMENT_ID,
                body      : 'Updated body',
                action    : 'update'
            });

            expect(result).toEqual({
                message  : `Successfully updated discussion comment ${COMMENT_ID}`,
                commentId: COMMENT_ID,
                url      : COMMENT_URL,
                updatedAt: UPDATED_TS
            });
        });

        test('rejects missing comment_id on update', async () => {
            let callCount = 0;
            GraphqlService.query = async () => { callCount++; return null; };

            const result = await DiscussionService.manageDiscussionComment({
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
            let callCount = 0;
            GraphqlService.query = async () => { callCount++; return null; };

            const result = await DiscussionService.manageDiscussionComment({
                discussion_number: 10841,
                body             : 'Ignored',
                action           : 'delete'  // not a supported action
            });

            expect(result.error).toBe('Bad Request');
            expect(result.code).toBe('INVALID_ARGUMENTS');
            expect(callCount).toBe(0);
        });
    });
});
