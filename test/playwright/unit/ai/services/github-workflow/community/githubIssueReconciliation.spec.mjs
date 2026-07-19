import {setup} from '../../../../../setup.mjs';

const appName = 'GithubIssueReconciliationTest';

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

import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../../../../src/Neo.mjs';
import * as core                from '../../../../../../../src/core/_export.mjs';
import {reconcileIssueActivity} from '../../../../../../../ai/services/github-workflow/community/githubIssueReconciliation.mjs';

/**
 * @summary Witnesses that the issue-reconciliation runner exhausts all three pagination axes
 * (issues, per-issue comments, per-issue timeline) behind injected seams, enumerates every
 * issue state without filtering, and reports coverage honestly — a page cap always surfaces as
 * incomplete-with-gap, never a silent truncation.
 */
test.describe('reconcileIssueActivity runner', () => {
    const comment = id => ({id, createdAt: '2026-01-01T09:00:00Z', author: {login: 'commenter', __typename: 'User'}}),
          event   = (id, typename) => ({id, __typename: typename, createdAt: '2026-01-01T10:00:00Z', actor: {login: 'maintainer', __typename: 'User'}});

    const issues = [
        {
            id         : 'I_a', createdAt: '2026-01-01T00:00:00Z', author: {login: 'u1', __typename: 'User'},
            allComments: [comment('IC_a1'), comment('IC_a2'), comment('IC_a3'), comment('IC_a4'), comment('IC_a5')],
            allTimeline: [event('CE_a1', 'ClosedEvent'), event('RE_a1', 'ReopenedEvent'), event('LE_a1', 'LabeledEvent'), event('CE_a2', 'ClosedEvent')]
        },
        {
            id         : 'I_b', createdAt: '2026-01-02T00:00:00Z', author: {login: 'u2', __typename: 'User'},
            allComments: [comment('IC_b1')],
            allTimeline: [event('CE_b1', 'ClosedEvent')]
        },
        {
            id         : 'I_c', createdAt: '2026-01-03T00:00:00Z', author: null, // a deleted account — still enumerated
            allComments: [],
            allTimeline: []
        }
    ];

    // An in-memory paginated source: the first page arrives inline on the node, the overflow is
    // continuation-fetched from the same cursor space, so the runner must walk every page to see all.
    const buildSeams = ({issuePageSize, commentPageSize, timelinePageSize}) => {
        const inline = (items, size) => ({nodes: items.slice(0, size), pageInfo: {hasNextPage: items.length > size, endCursor: String(size)}}),
              pageOf = (items, size, cursor) => {
                  const start = Number(cursor), next = start + size;
                  return {slice: items.slice(start, next), pageInfo: {hasNextPage: next < items.length, endCursor: String(next)}}
              },
              byId   = new Map(issues.map(i => [i.id, i]));

        return {
            fetchIssuesPage: async ({cursor}) => {
                const {slice, pageInfo} = pageOf(issues, issuePageSize, cursor ?? 0);

                return {
                    issues: slice.map(i => ({
                        id      : i.id, createdAt: i.createdAt, author: i.author,
                        comments: inline(i.allComments, commentPageSize),
                        timeline: inline(i.allTimeline, timelinePageSize)
                    })),
                    pageInfo
                }
            },
            fetchCommentsPage: async ({issueId, cursor}) => {
                const {slice, pageInfo} = pageOf(byId.get(issueId).allComments, commentPageSize, cursor);
                return {comments: slice, pageInfo}
            },
            fetchTimelinePage: async ({issueId, cursor}) => {
                const {slice, pageInfo} = pageOf(byId.get(issueId).allTimeline, timelinePageSize, cursor);
                return {events: slice, pageInfo}
            }
        }
    };

    const kindCount = (observations, kind) => observations.filter(o => o.occurrenceKind === kind).length;

    // ------------------------------------------------------------------ full exhaustion across all axes

    test('walks every issue, every comment page, and every timeline page to exhaustion', async () => {
        const {observations, coverage} = await reconcileIssueActivity(buildSeams({issuePageSize: 2, commentPageSize: 2, timelinePageSize: 2}));

        expect(kindCount(observations, 'issue.opened'), 'one root per issue, no state filtered').toBe(3);
        expect(kindCount(observations, 'issue.comment'), 'all 6 comments across 3 comment-pages of I_a').toBe(6);
        expect(kindCount(observations, 'issue.closed'), 'timeline overflow of I_a fully walked').toBe(3);
        expect(coverage.complete).toBe(true);
        expect(coverage.gaps).toBeUndefined()
    });

    test('a deleted-author issue is still enumerated, its root actor fails closed to unknown', async () => {
        const {observations} = await reconcileIssueActivity(buildSeams({issuePageSize: 5, commentPageSize: 5, timelinePageSize: 5})),
              ghostRoot      = observations.find(o => o.providerEntityId === 'I_c');

        expect(ghostRoot.occurrenceKind).toBe('issue.opened');
        expect(ghostRoot.actorKind).toBe('unknown')
    });

    // ------------------------------------------------------------------ honest coverage under caps

    test('a per-issue comment cap surfaces as incomplete WITH an explicit gap, not silent truncation', async () => {
        const {observations, coverage} = await reconcileIssueActivity(
            buildSeams({issuePageSize: 5, commentPageSize: 2, timelinePageSize: 5}),
            {maxCommentPagesPerIssue: 1}
        );

        expect(kindCount(observations, 'issue.comment'), 'I_a truncated to its first comment page (2), plus I_b (1)').toBe(3);
        expect(coverage.complete).toBe(false);
        expect(coverage.gaps).toEqual(expect.arrayContaining([{axis: 'comments', issueId: 'I_a'}]))
    });

    test('an issue-list cap drops later pages and is recorded as an issues-axis gap', async () => {
        const {observations, coverage} = await reconcileIssueActivity(
            buildSeams({issuePageSize: 2, commentPageSize: 5, timelinePageSize: 5}),
            {maxIssuePages: 1}
        );

        expect(kindCount(observations, 'issue.opened'), 'only the first issue page [I_a, I_b]').toBe(2);
        expect(coverage.complete).toBe(false);
        expect(coverage.gaps.some(g => g.axis === 'issues')).toBe(true)
    });

    test('missing fetch seams fail loud', async () => {
        await expect(reconcileIssueActivity({fetchIssuesPage: async () => ({})})).rejects.toThrow('ISSUE_RECONCILIATION_REQUIRES_FETCH_SEAMS')
    });
});
