import {FETCH_ISSUES_LIST_NO_FILTER}  from './queries/issueQueries.mjs';
import {FETCH_PULL_REQUESTS_FOR_SYNC} from './queries/pullRequestQueries.mjs';

/**
 * @module ai/services/github-workflow/openWorkCensusReader
 * @summary Source-owned page readers for an open-work census: one page of open issues, one page of
 * open pull requests, each reporting the source's own `hasNextPage`.
 *
 * This exists because a current-state census cannot be answered from a local projection. Both local
 * stores lag: an open pull request was absent from the Native Edge Graph AND from the synced content
 * corpus while it was open, and neither carries assignee truth. So the census reads the source that
 * owns the facts, and these readers are that source's page boundary.
 *
 * Two properties are deliberate:
 *
 * - **`hasNextPage` is the SOURCE's, never inferred.** It is returned exactly as GitHub reports it, so
 *   a walk can prove exhaustion. Deriving it from `items.length === limit` would silently re-introduce
 *   the assumption the census exists to remove.
 * - **Absent facts stay absent.** A PR's draft/review state is not selected by the sync query, so it is
 *   simply not asserted here — the projection reports `unknown` rather than a fabricated default.
 *
 * The pull-request page deliberately uses the SYNC query rather than the list query: the list query
 * selects neither a cursor nor `pageInfo`, so it cannot prove a complete census at all.
 */

/**
 * @summary Binds the injected GraphQL transport + config into the two source page readers.
 *
 * Both are injected rather than imported so the readers stay hermetic under test and the owning service
 * keeps transport ownership.
 *
 * @param {Object}   params
 * @param {Function} params.query `async (queryString, variables) => data` — the GraphQL transport.
 * @param {Object}   params.config Repository + fan-out bounds `{owner, repo, maxLabels, maxAssignees,
 *   maxComments, maxReviews}`. Injected from the config layer — no local defaults.
 * @returns {{fetchIssuesPage: Function, fetchPullRequestsPage: Function}} Page readers shaped for the
 *   census walk: `async ({cursor, limit}) => {items, hasNextPage, endCursor}`.
 * @throws {Error} When an injection is missing — an unbound reader is a wiring bug, and a census that
 *   silently reads nothing is worse than one that fails loud.
 */
export function makeOpenWorkCensusReader({query, config} = {}) {
    if (typeof query !== 'function') {
        throw new Error('makeOpenWorkCensusReader: an injected `query` transport is required')
    }
    if (!config || typeof config !== 'object') {
        throw new Error('makeOpenWorkCensusReader: an injected `config` is required')
    }

    const {owner, repo} = config;

    if (!owner || !repo) {
        throw new Error('makeOpenWorkCensusReader: `config.owner` and `config.repo` are required')
    }

    /**
     * @summary Reads one page of OPEN issues, with the labels + assignees the landscape needs.
     * @param {Object} params
     * @param {String|null} params.cursor Source end cursor, or null for the first page.
     * @param {Number} params.limit Page size.
     * @returns {Promise<{items: Object[], hasNextPage: Boolean, endCursor: String|null}>}
     */
    const fetchIssuesPage = async ({cursor = null, limit} = {}) => {
        // The census never filters by assignee, so it reads through the no-filter query: a
        // `filterBy: {assignee: null}` connection is served from GitHub's stale filtered-read
        // path (#15603; ticket-ref-ok: measured-quirk evidence ledger), which would silently age the "current-state" census this reader exists for.
        const data = await query(FETCH_ISSUES_LIST_NO_FILTER, {
            owner,
            repo,
            limit,
            cursor,
            states      : ['OPEN'],
            maxLabels   : config.maxLabels,
            maxAssignees: config.maxAssignees
        });

        const connection = data?.repository?.issues;

        return {
            // Flattened to the census row shape here, at the source boundary, so the projection never
            // has to know GitHub's connection vocabulary.
            items: (connection?.nodes || []).map(node => ({
                number   : node.number,
                title    : node.title,
                state    : node.state,
                url      : node.url,
                author   : node.author?.login ?? null,
                labels   : (node.labels?.nodes || []).map(label => label.name),
                assignees: (node.assignees?.nodes || []).map(assignee => assignee.login)
            })),
            hasNextPage: connection?.pageInfo?.hasNextPage === true,
            endCursor  : connection?.pageInfo?.endCursor ?? null
        }
    };

    /**
     * @summary Reads one page of OPEN pull requests.
     *
     * Authority for a PR comes from its author — the source's real ownership evidence — rather than
     * from an assignee field the query does not select. Draft/review state is not asserted at all: the
     * sync query does not prove it, and an unknown fact must read as unknown.
     *
     * @param {Object} params
     * @param {String|null} params.cursor Source end cursor, or null for the first page.
     * @param {Number} params.limit Page size.
     * @returns {Promise<{items: Object[], hasNextPage: Boolean, endCursor: String|null}>}
     */
    const fetchPullRequestsPage = async ({cursor = null, limit} = {}) => {
        const data = await query(FETCH_PULL_REQUESTS_FOR_SYNC, {
            owner,
            repo,
            limit,
            cursor,
            states: ['OPEN'],
            // The sync query requires these fan-out bounds, but a census reads none of the comment or
            // review bodies they gate — only identity, state, url and author. So they are minimized to
            // keep the page cheap rather than configured: this is not a hidden default for a value the
            // census consumes, it is a deliberate refusal to fetch payload we would discard.
            maxComments: 1,
            maxReviews : 1
        });

        const connection = data?.repository?.pullRequests;

        return {
            items: (connection?.nodes || []).map(node => ({
                number   : node.number,
                title    : node.title,
                state    : node.state,
                url      : node.url,
                author   : node.author?.login ?? null,
                labels   : [],
                assignees: node.author?.login ? [node.author.login] : []
            })),
            hasNextPage: connection?.pageInfo?.hasNextPage === true,
            endCursor  : connection?.pageInfo?.endCursor ?? null
        }
    };

    return {fetchIssuesPage, fetchPullRequestsPage}
}
