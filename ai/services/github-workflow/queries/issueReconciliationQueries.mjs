/**
 * @summary Exhaustive issue-reconciliation GraphQL queries — distinct from the snapshot-oriented
 * sync query. Three deliberate differences make them reconciliation-grade:
 *
 * 1. Every entity carries its provider node `id` (stable identity across runs) and every actor its
 *    `__typename` (the provider actor-kind axis) plus `authorAssociation` (source-relative trust).
 * 2. Comments are their OWN paginated connection, and `timelineItems` deliberately EXCLUDES
 *    `ISSUE_COMMENT` — comments and the lifecycle timeline are two independent exhaustion axes, so
 *    a comment is never double-counted against a timeline event.
 * 3. Issues are drawn across BOTH states with a stable ascending order, so a cursor walk reaches
 *    every open and closed root.
 * @module ai/services/github-workflow/queries/issueReconciliationQueries
 */

/**
 * @summary Lifecycle/metadata timeline event types — ISSUE_COMMENT intentionally absent (own axis).
 * @member {String[]}
 */
export const RECONCILE_TIMELINE_ITEM_TYPES = [
    'CLOSED_EVENT', 'REOPENED_EVENT', 'LABELED_EVENT', 'UNLABELED_EVENT',
    'ASSIGNED_EVENT', 'UNASSIGNED_EVENT', 'RENAMED_TITLE_EVENT',
    'MILESTONED_EVENT', 'DEMILESTONED_EVENT', 'REFERENCED_EVENT', 'CROSS_REFERENCED_EVENT'
];

const TIMELINE_ITEM_TYPES_ARG = RECONCILE_TIMELINE_ITEM_TYPES.join(', ');

// One id + createdAt + actor selection per lifecycle event type; each such event is a Node with an id.
const TIMELINE_NODE_SELECTION = `
      __typename
      ... on ClosedEvent          { id createdAt actor { login __typename } }
      ... on ReopenedEvent        { id createdAt actor { login __typename } }
      ... on LabeledEvent         { id createdAt actor { login __typename } }
      ... on UnlabeledEvent       { id createdAt actor { login __typename } }
      ... on AssignedEvent        { id createdAt actor { login __typename } }
      ... on UnassignedEvent      { id createdAt actor { login __typename } }
      ... on RenamedTitleEvent    { id createdAt actor { login __typename } }
      ... on MilestonedEvent      { id createdAt actor { login __typename } }
      ... on DemilestonedEvent    { id createdAt actor { login __typename } }
      ... on ReferencedEvent      { id createdAt actor { login __typename } }
      ... on CrossReferencedEvent { id createdAt actor { login __typename } }`;

const COMMENT_NODE_SELECTION = `id createdAt lastEditedAt authorAssociation author { login __typename }`;

/**
 * @summary The issue-list axis: open and closed roots, ascending, with the first page of each
 * issue's comments and timeline inline so single-page issues need no continuation fetch.
 * @member {String}
 */
export const FETCH_RECONCILE_ISSUES = `
query ReconcileIssues($owner: String!, $repo: String!, $after: String, $issuePage: Int!, $commentPage: Int!, $timelinePage: Int!) {
  repository(owner: $owner, name: $repo) {
    issues(first: $issuePage, after: $after, states: [OPEN, CLOSED], orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id createdAt updatedAt lastEditedAt authorAssociation
        author { login __typename }
        comments(first: $commentPage) {
          pageInfo { hasNextPage endCursor }
          nodes { ${COMMENT_NODE_SELECTION} }
        }
        timelineItems(first: $timelinePage, itemTypes: [${TIMELINE_ITEM_TYPES_ARG}]) {
          pageInfo { hasNextPage endCursor }
          nodes {${TIMELINE_NODE_SELECTION}
          }
        }
      }
    }
  }
}`;

/**
 * @summary The per-issue comments continuation axis, exhausted independently of the timeline.
 * @member {String}
 */
export const FETCH_RECONCILE_COMMENTS_PAGE = `
query ReconcileComments($issueId: ID!, $after: String, $commentPage: Int!) {
  node(id: $issueId) {
    ... on Issue {
      comments(first: $commentPage, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ${COMMENT_NODE_SELECTION} }
      }
    }
  }
}`;

/**
 * @summary The per-issue timeline continuation axis, exhausted independently of comments.
 * @member {String}
 */
export const FETCH_RECONCILE_TIMELINE_PAGE = `
query ReconcileTimeline($issueId: ID!, $after: String, $timelinePage: Int!) {
  node(id: $issueId) {
    ... on Issue {
      timelineItems(first: $timelinePage, after: $after, itemTypes: [${TIMELINE_ITEM_TYPES_ARG}]) {
        pageInfo { hasNextPage endCursor }
        nodes {${TIMELINE_NODE_SELECTION}
        }
      }
    }
  }
}`;
