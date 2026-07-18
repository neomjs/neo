import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {
        name             : 'CommunityActivityShadowReaderTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

const WINDOW = {start: '2026-07-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z'};

const connection = (nodes, hasNextPage = false, endCursor = null) => ({
    totalCount: nodes.length,
    pageInfo  : {hasNextPage, endCursor},
    nodes
});

const response = data => ({data: {...data, rateLimit: {cost: 1, remaining: 4999, resetAt: WINDOW.end}}});

const operationName = queryString => queryString.match(/query\s+(\w+)/)?.[1];

const advancingClock = () => {
    let millis = Date.parse('2026-07-18T12:00:00.000Z');

    return () => (millis += 5)
};

/**
 * The source reader is the authority firewall's outer edge: source pagination receipts must survive,
 * while prose and production-authority concepts must not cross it.
 */
test.describe('communityActivityShadowReader — exhaustive metadata-only source acquisition', () => {
    let makeCommunityActivityShadowReader;

    test.beforeAll(async () => {
        ({makeCommunityActivityShadowReader} = await import(
            '../../../../../../ai/services/github-workflow/communityActivityShadowReader.mjs'
        ))
    });

    test('exhausts GraphQL pageInfo and REST empty terminals without leaking prose', async () => {
        const graphqlCalls = [];
        const restCalls    = [];
        const issue        = {
            id               : 'ISSUE_1', databaseId: 1, number: 15149, state: 'OPEN', stateReason: null,
            createdAt        : '2026-07-02T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z', closedAt: null,
            lastEditedAt     : null, author: {__typename: 'User', login: 'external-author'},
            authorAssociation: 'NONE', title: 'must never cross the seam'
        };
        const pullRequest = {
            id               : 'PR_1', databaseId: 2, number: 15480, state: 'OPEN', isDraft: false,
            createdAt        : '2026-07-03T00:00:00Z', updatedAt: '2026-07-13T00:00:00Z', closedAt: null,
            mergedAt         : null, lastEditedAt: null, author: {__typename: 'User', login: 'neo-gpt'},
            authorAssociation: 'MEMBER', title: 'must also stay out'
        };
        const discussion = {
            id        : 'DISCUSSION_1', databaseId: 3, number: 15200, closed: false, closedAt: null, locked: false,
            isAnswered: false, answerChosenAt: null, createdAt: '2026-07-04T00:00:00Z',
            updatedAt : '2026-07-14T00:00:00Z', lastEditedAt: null,
            author    : {__typename: 'User', login: 'neo-gpt-emmy'}, authorAssociation: 'MEMBER'
        };
        const discussionComments = [{
            id       : 'DISCUSSION_COMMENT_1', databaseId: 31, createdAt: '2026-07-05T00:00:00Z',
            updatedAt: '2026-07-15T00:00:00Z', lastEditedAt: '2026-07-15T00:00:00Z', deletedAt: null,
            isAnswer : false, author: {__typename: 'User', login: 'external-author'}, authorAssociation: 'NONE',
            body     : 'secret discussion prose'
        }, {
            id       : 'DISCUSSION_COMMENT_2', databaseId: 32, createdAt: '2026-07-06T00:00:00Z',
            updatedAt: '2026-07-06T00:00:00Z', lastEditedAt: null, deletedAt: null,
            isAnswer : false, author: {__typename: 'Bot', login: 'automation-bot'}, authorAssociation: 'NONE'
        }];

        const query = async (queryString, variables, options) => {
            const operation = operationName(queryString);

            graphqlCalls.push({queryString, variables, options, operation});

            if (operation === 'ShadowIssueRoots') {
                return response({repository: {issues: variables.cursor
                    ? connection([], false, null)
                    : connection([issue], true, 'ISSUE_ROOT_CURSOR')}})
            }
            if (operation === 'ShadowPullRequestRoots') {
                return response({search: connection([pullRequest])})
            }
            if (operation === 'ShadowPullRequestReviewsPage') {
                return response({repository: {pullRequest: {reviews: connection([{
                    id         : 'PR_REVIEW_1', fullDatabaseId: '22', state: 'APPROVED',
                    createdAt  : '2026-07-08T00:00:00Z', updatedAt: '2026-07-08T00:00:00Z',
                    submittedAt: '2026-07-08T00:00:00Z', lastEditedAt: null,
                    author     : {__typename: 'User', login: 'neo-gpt'}, authorAssociation: 'MEMBER'
                }])}}})
            }
            if (operation === 'ShadowDiscussionRoots') {
                return response({repository: {discussions: connection([discussion])}})
            }
            if (operation === 'ShadowDiscussionCommentsPage') {
                const index = variables.cursor ? 1 : 0;

                return response({repository: {discussion: {comments: connection(
                    [discussionComments[index]], index === 0, index === 0 ? 'DISCUSSION_COMMENT_CURSOR' : null
                )}}})
            }
            if (operation === 'ShadowDiscussionRepliesPage') {
                const replies = variables.commentId === 'DISCUSSION_COMMENT_1' ? [{
                    id       : 'DISCUSSION_REPLY_1', databaseId: 33, createdAt: '2026-07-16T00:00:00Z',
                    updatedAt: '2026-07-16T00:00:00Z', lastEditedAt: null, deletedAt: null, isAnswer: false,
                    author   : {__typename: 'User', login: 'neo-gpt-emmy'}, authorAssociation: 'MEMBER'
                }] : [];

                return response({node: {replies: connection(replies)}})
            }

            throw new Error(`Unexpected operation: ${operation}`)
        };

        const rest = async (method, path, body) => {
            restCalls.push({method, path, body});
            const page = Number(new URL(`https://api.github.test${path}`).searchParams.get('page'));

            if (path.includes('/collaborators')) {
                return page === 1 ? [{login: 'neo-gpt'}, {login: 'neo-gpt-emmy'}] : []
            }

            if (path.includes('/issues/comments')) {
                return page === 1 ? [{
                    id                : 10,
                    node_id           : 'ISSUE_COMMENT_1',
                    issue_url         : 'https://api.github.test/repos/neomjs/neo/issues/15149',
                    html_url          : 'https://github.test/neomjs/neo/issues/15149#issuecomment-10',
                    created_at        : '2026-07-08T00:00:00Z',
                    updated_at        : '2026-07-11T00:00:00Z',
                    author_association: 'NONE',
                    user              : {login: 'external-author', type: 'User'},
                    body              : 'secret issue prose'
                }, {
                    id                : 21,
                    node_id           : 'PR_COMMENT_1',
                    issue_url         : 'https://api.github.test/repos/neomjs/neo/issues/15480',
                    html_url          : 'https://github.test/neomjs/neo/pull/15480#issuecomment-21',
                    created_at        : '2026-07-07T00:00:00Z',
                    updated_at        : '2026-07-07T00:00:00Z',
                    author_association: 'CONTRIBUTOR',
                    user              : {login: 'external-reviewer', type: 'User'},
                    body              : 'secret PR issue-comment prose'
                }] : []
            }

            return page === 1 ? [{
                id                    : 23,
                node_id               : 'PR_REVIEW_COMMENT_1',
                pull_request_url      : 'https://api.github.test/repos/neomjs/neo/pulls/15480',
                pull_request_review_id: 22,
                in_reply_to_id        : null,
                created_at            : '2026-07-09T00:00:00Z',
                updated_at            : '2026-07-10T00:00:00Z',
                author_association    : 'CONTRIBUTOR',
                user                  : {login: 'external-reviewer', type: 'User'},
                body                  : 'secret inline review prose'
            }] : []
        };

        const reader   = makeCommunityActivityShadowReader({query, rest, now: advancingClock()});
        const snapshot = await reader({
            provider: 'github', owner: 'neomjs', repo: 'neo', window: WINDOW, pageSize: 2,
            families: ['issues', 'pullRequests', 'discussions'], runIndex: 1
        });

        expect(snapshot.collaboratorCensus).toMatchObject({
            status       : 'complete',
            collaborators: ['neo-gpt', 'neo-gpt-emmy']
        });
        expect(snapshot.collaboratorCensus.pages.at(-1).terminalReceipt).toBe(true);
        expect(restCalls.every(call => call.method === 'GET' && call.body === undefined)).toBe(true);
        expect(restCalls.filter(call => call.path.includes('/collaborators'))).toHaveLength(2);
        expect(restCalls.filter(call => call.path.includes('/issues/comments'))).toHaveLength(2);
        expect(restCalls.filter(call => call.path.includes('/pulls/comments'))).toHaveLength(2);

        expect(snapshot.families.issues.exhausted).toBe(true);
        expect(snapshot.families.issues.pages.filter(page => page.connection === 'roots')).toHaveLength(2);
        expect(snapshot.families.issues.pages[0]).toMatchObject({
            cursor: null, endCursor: 'ISSUE_ROOT_CURSOR', sourceHasNextPage: true
        });
        expect(snapshot.families.pullRequests.pages.find(page => page.connection === 'repositoryReviewComments'
            && page.terminalReceipt)).toBeTruthy();
        expect(snapshot.families.discussions.pages.filter(page => page.connection === 'comments')).toHaveLength(2);
        expect(snapshot.families.discussions.pages.filter(page => page.connection === 'replies')).toHaveLength(2);

        const rows = Object.values(snapshot.families).flatMap(family => family.pages.flatMap(page => page.rows));

        expect(rows.map(row => row.eventType)).toEqual(expect.arrayContaining([
            'IssueCreated', 'IssueComment', 'PullRequestCreated',
            'PullRequestIssueComment', 'PullRequestReview', 'PullRequestReviewComment',
            'DiscussionCreated', 'DiscussionComment', 'DiscussionReply'
        ]));
        expect(rows.some(row => row.eventType === 'IssueSnapshotUpdate')).toBe(false);
        expect(snapshot.families.issues.gaps).toContainEqual(expect.objectContaining({
            code: 'issue_comment_deletion_tombstones_unavailable'
        }));
        expect(rows.find(row => row.eventType === 'PullRequestReviewComment')).toMatchObject({
            actor          : {login: 'external-reviewer', type: 'User'},
            id             : 'PR_REVIEW_COMMENT_1:created',
            responseBearing: true,
            mutationKind   : 'create'
        });
        expect(rows.find(row => row.eventType === 'PullRequestReviewCommentRevision')).toMatchObject({
            actor          : {login: null, type: null},
            id             : 'PR_REVIEW_COMMENT_1:updated:2026-07-10T00:00:00Z',
            responseBearing: false,
            mutationKind   : 'revision'
        });
        expect(snapshot.popularity).toEqual({
            status: 'excluded', rows: [], gaps: [{code: 'popularity_telemetry_out_of_scope'}]
        });

        const serialized = JSON.stringify(snapshot);

        expect(serialized).not.toContain('secret');
        expect(serialized).not.toContain('must never');
        expect(graphqlCalls.every(call => !/\bbody\b/.test(call.queryString))).toBe(true);
        expect(graphqlCalls.every(call => call.options?.strict === false)).toBe(true);
    });

    test('fails collaborator trust closed and marks a source pagination contradiction incomplete', async () => {
        const permissionError = Object.assign(new Error('forbidden'), {status: 403});
        const rest            = async () => { throw permissionError };
        const query           = async () => response({
            repository: {issues: connection([], true, null)}
        });
        const reader   = makeCommunityActivityShadowReader({query, rest, now: advancingClock()});
        const snapshot = await reader({
            provider: 'github', owner: 'neomjs', repo: 'neo', window: WINDOW, pageSize: 100,
            families: ['issues'], runIndex: 2
        });

        expect(snapshot.collaboratorCensus).toMatchObject({status: 'unavailable', collaborators: []});
        expect(snapshot.collaboratorCensus.gaps[0]).toMatchObject({
            code: 'collaborator_census_failed', status: 403
        });
        expect(snapshot.families.issues.exhausted).toBe(false);
        expect(snapshot.families.issues.gaps).toContainEqual(expect.objectContaining({
            code: 'graphql_missing_end_cursor', scope: 'ShadowIssueRoots'
        }));
    });
});
