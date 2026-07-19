import {issueToObservations} from './githubIssueObservations.mjs';

/**
 * @summary The basis marker for the beginning of history — the `fromBasis` of a first run that
 * resumes from no prior cursor, and the `toBasis` of a run over an empty family. Keeps the coverage
 * window a pair of concrete bases rather than nulls the contract would reject.
 * @member {String}
 */
export const GENESIS_BASIS = 'genesis';

/**
 * @summary Drives one paginated connection to true exhaustion (or until a page cap truncates it),
 * merging every page's items into a single list. The first page arrives inline on the parent node;
 * only the overflow is continuation-fetched here.
 *
 * Exhaustion is `hasNextPage === false`, never a first page: a partial connection silently drops
 * tail items (late comments, late events), so the walk only stops early when a caller cap forces
 * it — and then it says so via `truncated`, so the omission is auditable rather than invisible.
 * @param {Object}   connection
 * @param {Object}   [connection.firstPage]  `{nodes:[...], pageInfo:{hasNextPage,endCursor}}` inline first page.
 * @param {Function} connection.fetchNext    async (cursor) => `{items:[...], pageInfo}` for the next page.
 * @param {Number}   connection.maxPages     Hard cap on pages walked (Infinity for unbounded).
 * @returns {Promise<{items: Object[], truncated: Boolean}>}
 */
async function exhaustConnection({firstPage, fetchNext, maxPages}) {
    const items = [...(firstPage?.nodes ?? [])];

    let pageInfo = firstPage?.pageInfo,
        pages    = 1;

    while (pageInfo?.hasNextPage) {
        if (pages >= maxPages) {
            return {items, truncated: true}
        }

        const next = await fetchNext(pageInfo.endCursor);

        items.push(...(next.items ?? []));
        pageInfo = next.pageInfo;
        pages++
    }

    return {items, truncated: false}
}

/**
 * @summary Exhaustively reconciles a GitHub issue resource-family into community-activity-batch.v1
 * observations, driving three independent pagination axes — the issue list across ALL states, then
 * each issue's comments and its timeline — to completion behind injected fetch seams.
 *
 * The three axes are independent by design: an issue's comments and its lifecycle timeline are
 * separate connections, each exhausted on its own, so neither truncates the other and a comment is
 * never double-counted against a timeline event. Closed and open issues are enumerated identically
 * — reconciliation reflects the provider, it does not filter by state.
 *
 * Completeness is earned, not assumed. With no caps every axis runs to `hasNextPage === false` and
 * the run reports `coverage.complete === true`. The moment any caller cap truncates any axis, the
 * run reports `complete === false` with an explicit `gaps` entry naming the axis (and issue), so a
 * bounded sweep is always distinguishable from a whole one. All I/O is injected, keeping the
 * exhaustion witness-testable without a browser or a live GitHub.
 * @param {Object}   seams
 * @param {Function} seams.fetchIssuesPage    async ({cursor}) => `{issues:[node], pageInfo}`; each node carries id, createdAt, author, and inline first pages of `comments` and `timeline`.
 * @param {Function} seams.fetchCommentsPage  async ({issueId, cursor}) => `{comments:[c], pageInfo}`.
 * @param {Function} seams.fetchTimelinePage  async ({issueId, cursor}) => `{events:[e], pageInfo}`.
 * @param {Object}   [options]
 * @param {String}   [options.fromBasis]                 Prior checkpoint cursor this run resumes after.
 * @param {Number}   [options.maxIssuePages]             Cap on issue-list pages (default: unbounded).
 * @param {Number}   [options.maxCommentPagesPerIssue]   Cap on per-issue comment pages (default: unbounded).
 * @param {Number}   [options.maxTimelinePagesPerIssue]  Cap on per-issue timeline pages (default: unbounded).
 * @returns {Promise<{observations: Object[], coverage: Object, nextProviderState: Object}>}
 */
export async function reconcileIssueActivity(seams, options = {}) {
    const {fetchIssuesPage, fetchCommentsPage, fetchTimelinePage} = seams || {};

    if ([fetchIssuesPage, fetchCommentsPage, fetchTimelinePage].some(fn => typeof fn !== 'function')) {
        throw new Error('ISSUE_RECONCILIATION_REQUIRES_FETCH_SEAMS')
    }

    const {
        fromBasis = null, maxIssuePages = Infinity,
        maxCommentPagesPerIssue = Infinity, maxTimelinePagesPerIssue = Infinity
    } = options;

    const observations = [],
          gaps         = [];

    let issuesCursor = fromBasis,
        issuePages   = 0,
        complete     = true;

    for (;;) {
        if (issuePages >= maxIssuePages) {
            complete = false;
            gaps.push({axis: 'issues', afterCursor: issuesCursor});
            break
        }

        const {issues, pageInfo} = await fetchIssuesPage({cursor: issuesCursor});

        issuePages++;

        for (const issue of issues ?? []) {
            const comments = await exhaustConnection({
                firstPage: issue.comments,
                fetchNext: async cursor => {
                    const page = await fetchCommentsPage({issueId: issue.id, cursor});
                    return {items: page.comments, pageInfo: page.pageInfo}
                },
                maxPages : maxCommentPagesPerIssue
            });

            const timeline = await exhaustConnection({
                firstPage: issue.timeline,
                fetchNext: async cursor => {
                    const page = await fetchTimelinePage({issueId: issue.id, cursor});
                    return {items: page.events, pageInfo: page.pageInfo}
                },
                maxPages : maxTimelinePagesPerIssue
            });

            if (comments.truncated) {
                complete = false;
                gaps.push({axis: 'comments', issueId: issue.id})
            }

            if (timeline.truncated) {
                complete = false;
                gaps.push({axis: 'timeline', issueId: issue.id})
            }

            observations.push(...issueToObservations({...issue, comments: comments.items, timeline: timeline.items}))
        }

        // Capture the reached cursor on EVERY page, including the last — the endpoint of a complete
        // walk is the final page's endCursor, not just the boundary before a continuation.
        if (pageInfo?.endCursor) {
            issuesCursor = pageInfo.endCursor
        }

        if (!pageInfo?.hasNextPage) {
            break
        }
    }

    const coverage = {
        fromBasis: fromBasis ?? GENESIS_BASIS,
        toBasis  : issuesCursor ?? GENESIS_BASIS,
        complete,
        ...(gaps.length ? {gaps} : {})
    };

    return {observations, coverage, nextProviderState: {issuesCursor}}
}
