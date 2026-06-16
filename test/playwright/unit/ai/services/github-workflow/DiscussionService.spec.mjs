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
 * @summary Contract coverage for `DiscussionService.manageDiscussionComment` enriched return shape.
 */
test.describe('Neo.ai.services.github-workflow.DiscussionService — manageDiscussionComment (#10841)', () => {
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
                    expect(variables).toMatchObject({
                        discussionId: DISCUSSION_NODE_ID,
                        body        : 'Test comment body'
                    });
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

        test('propagates GraphQL error shape on API failure', async () => {
            GraphqlService.query = async () => {
                throw new Error('GitHub API rate limit exceeded');
            };

            const result = await DiscussionService.manageDiscussionComment({
                discussion_number: 10841,
                body             : 'Will fail',
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

/**
 * @summary Contract coverage for `DiscussionService.getConversation` selector narrowing.
 */
test.describe('Neo.ai.services.github-workflow.DiscussionService — getConversation (#10304)', () => {
    let DiscussionService;
    let GraphqlService;
    let originalQuery;

    const buildDiscussion = () => ({
        id       : 'D_kwDODSospM4AmbhL',
        number   : 10137,
        title    : 'MX Model Experience',
        body     : 'Discussion body',
        url      : 'https://github.com/orgs/neomjs/discussions/10137',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-02T00:00:00Z',
        author   : {login: 'neo-opus-4-7'},
        category : {name: 'Ideas'},
        comments : {
            nodes: [
                {
                    id       : 'DC_first',
                    author   : {login: 'neo-gpt'},
                    body     : 'First comment',
                    createdAt: '2026-05-02T00:01:00Z',
                    updatedAt: '2026-05-02T00:01:00Z',
                    url      : 'https://github.com/orgs/neomjs/discussions/10137#discussioncomment-1',
                    isAnswer : false,
                    replies  : {nodes: []}
                },
                {
                    id       : 'DC_second',
                    author   : {login: 'neo-opus-grace'},
                    body     : 'Second comment',
                    createdAt: '2026-05-02T00:02:00Z',
                    updatedAt: '2026-05-02T00:02:00Z',
                    url      : 'https://github.com/orgs/neomjs/discussions/10137#discussioncomment-2',
                    isAnswer : false,
                    replies  : {
                        nodes: [{
                            id       : 'DCR_reply',
                            author   : {login: 'neo-gpt'},
                            body     : 'Nested reply',
                            createdAt: '2026-05-02T00:03:00Z',
                            updatedAt: '2026-05-02T00:03:00Z',
                            url      : 'https://github.com/orgs/neomjs/discussions/10137#discussioncomment-3',
                            isAnswer : false
                        }]
                    }
                },
                {
                    id       : 'DC_third',
                    author   : {login: 'neo-opus-vega'},
                    body     : 'Third comment',
                    createdAt: '2026-05-02T00:04:00Z',
                    updatedAt: '2026-05-02T00:04:00Z',
                    url      : 'https://github.com/orgs/neomjs/discussions/10137#discussioncomment-4',
                    isAnswer : true,
                    replies  : {nodes: []}
                }
            ]
        }
    });

    const installFixture = () => {
        let callCount = 0;

        GraphqlService.query = async (query, variables) => {
            callCount++;
            expect(variables.discussionNumber).toBe(10137);
            expect(variables.maxComments).toBeGreaterThan(0);
            expect(variables.maxReplies).toBeGreaterThan(0);

            return {repository: {discussion: buildDiscussion()}};
        };

        return () => callCount;
    };

    test.beforeAll(async () => {
        GraphqlService    = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        DiscussionService = (await import('../../../../../../ai/services/github-workflow/DiscussionService.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(() => {
        GraphqlService.query = originalQuery;
    });

    test('rejects missing discussion_number without GraphQL call', async () => {
        let callCount = 0;
        GraphqlService.query = async () => { callCount++; return null; };

        const result = await DiscussionService.getConversation({comment_id: 'DC_first'});

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(callCount).toBe(0);
    });

    test('no selectors returns the full bounded discussion conversation', async () => {
        const getCallCount = installFixture();

        const result = await DiscussionService.getConversation({discussion_number: 10137});

        expect(result.title).toBe('MX Model Experience');
        expect(result.comments.nodes.map(c => c.id)).toEqual(['DC_first', 'DC_second', 'DC_third']);
        expect(result.comments.nodes[1].replies.nodes[0].id).toBe('DCR_reply');
        expect(getCallCount()).toBe(1);
    });

    test('comment_id returns only the matching top-level discussion comment', async () => {
        installFixture();

        const result = await DiscussionService.getConversation({
            discussion_number: 10137,
            comment_id       : 'DC_second'
        });

        expect(result.body).toBe('Discussion body');
        expect(result.comments.nodes.map(c => c.id)).toEqual(['DC_second']);
        expect(result.comments.nodes[0].replies.nodes[0].id).toBe('DCR_reply');
    });

    test('unknown comment_id returns empty comments while preserving discussion metadata', async () => {
        installFixture();

        const result = await DiscussionService.getConversation({
            discussion_number: 10137,
            comment_id       : 'DC_missing'
        });

        expect(result.number).toBe(10137);
        expect(result.comments.nodes).toEqual([]);
    });

    test('since_comment_id returns comments strictly after the anchor', async () => {
        installFixture();

        const result = await DiscussionService.getConversation({
            discussion_number: 10137,
            since_comment_id : 'DC_first'
        });

        expect(result.comments.nodes.map(c => c.id)).toEqual(['DC_second', 'DC_third']);
    });

    test('unknown since_comment_id returns empty comments', async () => {
        installFixture();

        const result = await DiscussionService.getConversation({
            discussion_number: 10137,
            since_comment_id : 'DC_missing'
        });

        expect(result.comments.nodes).toEqual([]);
    });

    test('last_n returns the tail comments', async () => {
        installFixture();

        const result = await DiscussionService.getConversation({
            discussion_number: 10137,
            last_n           : 2
        });

        expect(result.comments.nodes.map(c => c.id)).toEqual(['DC_second', 'DC_third']);
    });

    test('selector precedence prefers comment_id over since_comment_id and last_n', async () => {
        installFixture();

        const result = await DiscussionService.getConversation({
            discussion_number: 10137,
            comment_id       : 'DC_first',
            since_comment_id : 'DC_second',
            last_n           : 1
        });

        expect(result.comments.nodes.map(c => c.id)).toEqual(['DC_first']);
    });

    test('returns NOT_FOUND when the discussion does not exist', async () => {
        let callCount = 0;
        GraphqlService.query = async () => {
            callCount++;
            return {repository: {discussion: null}};
        };

        const result = await DiscussionService.getConversation({discussion_number: 999999});

        expect(result.error).toBe('Not Found');
        expect(result.code).toBe('NOT_FOUND');
        expect(callCount).toBe(1);
    });

    test('propagates GraphQL error shape on auth/API failure', async () => {
        GraphqlService.query = async () => {
            throw new Error('Resource not accessible by integration');
        };

        const result = await DiscussionService.getConversation({discussion_number: 10137});

        expect(result.error).toBe('GraphQL API request failed');
        expect(result.code).toBe('GRAPHQL_API_ERROR');
        expect(result.message).toContain('not accessible');
    });
});

/**
 * @summary Contract coverage for `DiscussionService.manageDiscussion` discussion-body update.
 *
 * `manageDiscussion` is a method on `DiscussionService` (mirroring `manageDiscussionComment`),
 * so its spec lives alongside the existing service spec rather than under the `ai/mcp/server/`
 * test tree originally named by the AC — that AC assumed a standalone tool file that does not exist.
 */
test.describe('Neo.ai.services.github-workflow.DiscussionService — manageDiscussion (#10138)', () => {
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

    test('update_body returns {discussionId, url, updatedAt} on success', async () => {
        const DISCUSSION_NODE_ID = 'D_kwDODSospM4AmbhL';
        const DISCUSSION_URL     = 'https://github.com/orgs/neomjs/discussions/10137';
        const UPDATED_TS         = '2026-05-16T02:49:38Z';
        const NEW_BODY           = 'Corrected discussion body';

        let callCount = 0;

        GraphqlService.query = async (query, variables) => {
            callCount++;
            if (callCount === 1) {
                // GET_DISCUSSION_ID lookup
                expect(variables.number).toBe(10137);
                return {repository: {discussion: {id: DISCUSSION_NODE_ID}}};
            }
            if (callCount === 2) {
                // UPDATE_DISCUSSION mutation
                expect(variables.discussionId).toBe(DISCUSSION_NODE_ID);
                expect(variables.body).toBe(NEW_BODY);
                return {
                    updateDiscussion: {
                        discussion: {
                            id       : DISCUSSION_NODE_ID,
                            url      : DISCUSSION_URL,
                            updatedAt: UPDATED_TS
                        }
                    }
                };
            }
            throw new Error(`Unexpected additional GraphqlService.query call: ${callCount}`);
        };

        const result = await DiscussionService.manageDiscussion({
            action           : 'update_body',
            discussion_number: 10137,
            body             : NEW_BODY
        });

        expect(result).toEqual({
            discussionId: DISCUSSION_NODE_ID,
            url         : DISCUSSION_URL,
            updatedAt   : UPDATED_TS
        });

        expect(callCount).toBe(2);
    });

    test('rejects invalid action (must be update_body)', async () => {
        let callCount = 0;
        GraphqlService.query = async () => { callCount++; return null; };

        const result = await DiscussionService.manageDiscussion({
            action           : 'update',
            discussion_number: 10137,
            body             : 'Ignored'
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('INVALID_ARGUMENTS');
        expect(callCount).toBe(0);
    });

    test('rejects missing discussion_number', async () => {
        let callCount = 0;
        GraphqlService.query = async () => { callCount++; return null; };

        const result = await DiscussionService.manageDiscussion({
            action: 'update_body',
            body  : 'No discussion number'
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(callCount).toBe(0);
    });

    test('rejects missing body', async () => {
        let callCount = 0;
        GraphqlService.query = async () => { callCount++; return null; };

        const result = await DiscussionService.manageDiscussion({
            action           : 'update_body',
            discussion_number: 10137
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(callCount).toBe(0);
    });

    test('returns NOT_FOUND when the discussion does not exist', async () => {
        let callCount = 0;
        GraphqlService.query = async () => {
            callCount++;
            return {repository: {discussion: null}};
        };

        const result = await DiscussionService.manageDiscussion({
            action           : 'update_body',
            discussion_number: 999999,
            body             : 'Body for a missing discussion'
        });

        expect(result.error).toBe('Not Found');
        expect(result.code).toBe('NOT_FOUND');
        expect(callCount).toBe(1);
    });

    test('propagates GraphQL error shape on auth/API failure', async () => {
        let callCount = 0;
        GraphqlService.query = async () => {
            callCount++;
            if (callCount === 1) {
                return {repository: {discussion: {id: 'D_kwDODSospM4AmbhL'}}};
            }
            // updateDiscussion on a non-owned discussion → GitHub permission error
            throw new Error('Resource not accessible by integration');
        };

        const result = await DiscussionService.manageDiscussion({
            action           : 'update_body',
            discussion_number: 10137,
            body             : 'Will fail on the mutation'
        });

        expect(result.error).toBe('GraphQL API request failed');
        expect(result.code).toBe('GRAPHQL_API_ERROR');
        expect(result.message).toContain('not accessible');
    });
});
