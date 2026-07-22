/**
 * @summary Exhaustive pull-request reconciliation queries. PR roots, issue comments, reviews,
 * their user-content revisions, and timeline events stay separate pagination axes. Inline review
 * comments use GitHub's REST collection for the entity census and GraphQL node ids for revision
 * history, because neither provider surface alone exposes the complete contract.
 *
 * Every selected field is metadata-only. Provider node ids anchor immutable occurrence identity,
 * actor typenames preserve the actor-kind axis, and author associations remain separate from it.
 * Popularity telemetry and prose are absent by construction.
 * @module ai/services/github-workflow/queries/pullRequestReconciliationQueries
 */

/**
 * @summary Supported lifecycle timeline families. Comments and reviews are deliberately absent
 * because their dedicated connections own those entities and prevent duplicate observations.
 * @member {String[]}
 */
export const RECONCILE_PULL_REQUEST_TIMELINE_ITEM_TYPES = [
    'CLOSED_EVENT', 'REOPENED_EVENT', 'MERGED_EVENT',
    'REVIEW_DISMISSED_EVENT', 'COMMENT_DELETED_EVENT'
];

const TIMELINE_ITEM_TYPES_ARG = RECONCILE_PULL_REQUEST_TIMELINE_ITEM_TYPES.join(', ');

const ACTOR_SELECTION = 'login __typename';

const USER_CONTENT_EDIT_CONNECTION_SELECTION = `
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        id editedAt
        editor { ${ACTOR_SELECTION} }
      }`;

const COMMENT_NODE_SELECTION = `
      id createdAt updatedAt lastEditedAt authorAssociation
      author { ${ACTOR_SELECTION} }`;

const REVIEW_NODE_SELECTION = `
      id createdAt updatedAt lastEditedAt submittedAt state authorAssociation
      author { ${ACTOR_SELECTION} }`;

const TIMELINE_NODE_SELECTION = `
      __typename
      ... on ClosedEvent          { id createdAt actor { ${ACTOR_SELECTION} } }
      ... on ReopenedEvent        { id createdAt actor { ${ACTOR_SELECTION} } }
      ... on MergedEvent          { id createdAt actor { ${ACTOR_SELECTION} } }
      ... on ReviewDismissedEvent {
        id createdAt previousReviewState
        actor { ${ACTOR_SELECTION} }
        review { id }
      }
      ... on CommentDeletedEvent  {
        id createdAt
        actor { ${ACTOR_SELECTION} }
        deletedCommentAuthor { ${ACTOR_SELECTION} }
      }`;

/**
 * @summary Enumerates OPEN, CLOSED, and MERGED pull-request roots in stable creation order with
 * the first page of every GraphQL child axis inline.
 * @member {String}
 */
export const FETCH_RECONCILE_PULL_REQUESTS = `
query ReconcilePullRequests(
  $owner: String!
  $repo: String!
  $after: String
  $rootPage: Int!
  $childPage: Int!
  $timelinePage: Int!
) {
  repository(owner: $owner, name: $repo) {
    pullRequests(
      first: $rootPage
      after: $after
      states: [OPEN, CLOSED, MERGED]
      orderBy: {field: CREATED_AT, direction: ASC}
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        id number state createdAt updatedAt lastEditedAt authorAssociation
        author { ${ACTOR_SELECTION} }
        comments(first: $childPage) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes { ${COMMENT_NODE_SELECTION} }
        }
        reviews(first: $childPage) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes { ${REVIEW_NODE_SELECTION} }
        }
        timelineItems(first: $timelinePage, itemTypes: [${TIMELINE_ITEM_TYPES_ARG}]) {
          filteredCount
          updatedAt
          pageInfo { hasNextPage endCursor }
          nodes { ${TIMELINE_NODE_SELECTION} }
        }
      }
    }
  }
}`;

/**
 * @summary Continues issue comments and reviews with independent cursors while echoing the root
 * revision token used to reject a mixed snapshot.
 * @member {String}
 */
export const FETCH_RECONCILE_PULL_REQUEST_CHILDREN = `
query ReconcilePullRequestChildren(
  $owner: String!
  $repo: String!
  $prNumber: Int!
  $childLimit: Int!
  $commentsCursor: String
  $reviewsCursor: String
) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      updatedAt
      comments(first: $childLimit, after: $commentsCursor) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { ${COMMENT_NODE_SELECTION} }
      }
      reviews(first: $childLimit, after: $reviewsCursor) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { ${REVIEW_NODE_SELECTION} }
      }
    }
  }
}`;

/**
 * @summary Continues one pull request's lifecycle/dismissal/deletion-event timeline independently.
 * @member {String}
 */
export const FETCH_RECONCILE_PULL_REQUEST_TIMELINE = `
query ReconcilePullRequestTimeline($pullRequestId: ID!, $after: String, $timelinePage: Int!) {
  node(id: $pullRequestId) {
    ... on PullRequest {
      updatedAt
      timelineItems(first: $timelinePage, after: $after, itemTypes: [${TIMELINE_ITEM_TYPES_ARG}]) {
        filteredCount
        updatedAt
        pageInfo { hasNextPage endCursor }
        nodes { ${TIMELINE_NODE_SELECTION} }
      }
    }
  }
}`;

const USER_CONTENT_EDIT_NODE_SELECTION = `
      id __typename createdAt updatedAt includesCreatedEdit
      userContentEdits(first: $editPage, after: $after) {
        ${USER_CONTENT_EDIT_CONNECTION_SELECTION}
      }`;

const USER_CONTENT_EDIT_HEAD_SELECTION = `
      id __typename createdAt updatedAt includesCreatedEdit
      userContentEdits(first: $editPage) {
        ${USER_CONTENT_EDIT_CONNECTION_SELECTION}
      }`;

/**
 * @summary Reads one page of a PR, issue-comment, review, or inline-review-comment revision
 * connection by stable GraphQL node id. The shared shape lets the runner apply one progress/count
 * contract to all four provider entity families.
 * @member {String}
 */
export const FETCH_RECONCILE_USER_CONTENT_EDITS = `
query ReconcilePullRequestContentEdits($entityId: ID!, $after: String, $editPage: Int!) {
  node(id: $entityId) {
    ... on PullRequest              { ${USER_CONTENT_EDIT_NODE_SELECTION} }
    ... on IssueComment             { ${USER_CONTENT_EDIT_NODE_SELECTION} }
    ... on PullRequestReview        { ${USER_CONTENT_EDIT_NODE_SELECTION} }
    ... on PullRequestReviewComment { ${USER_CONTENT_EDIT_NODE_SELECTION} }
  }
}`;

/**
 * @summary Hydrates first revision pages for every content entity in bounded GraphQL node batches.
 * Keeping revision connections outside the root/comment/review query avoids GitHub's nested-node
 * multiplier while preserving each entity's independent cursor and total.
 * @member {String}
 */
export const FETCH_RECONCILE_USER_CONTENT_EDIT_HEADS = `
query ReconcilePullRequestContentEditHeads($ids: [ID!]!, $editPage: Int!) {
  nodes(ids: $ids) {
    ... on PullRequest              { ${USER_CONTENT_EDIT_HEAD_SELECTION} }
    ... on IssueComment             { ${USER_CONTENT_EDIT_HEAD_SELECTION} }
    ... on PullRequestReview        { ${USER_CONTENT_EDIT_HEAD_SELECTION} }
    ... on PullRequestReviewComment { ${USER_CONTENT_EDIT_HEAD_SELECTION} }
  }
}`;

/**
 * @summary Re-reads mutable entity revision tokens after all independent child/edit axes finish.
 * Missing or changed nodes make the PR snapshot inadmissible rather than mixing revisions.
 * @member {String}
 */
export const FETCH_RECONCILE_PULL_REQUEST_CONTENT_REVISIONS = `
query ReconcilePullRequestContentRevisions($ids: [ID!]!) {
  nodes(ids: $ids) {
    id __typename
    ... on PullRequest              { updatedAt }
    ... on IssueComment             { updatedAt }
    ... on PullRequestReview        { updatedAt }
    ... on PullRequestReviewComment { updatedAt }
  }
}`;

/**
 * @summary Cheap second-pass root census. Comparing provider ids + revision tokens with the
 * evidence-bearing pass proves that root membership did not mutate while it was traversed.
 * @member {String}
 */
export const FETCH_RECONCILE_PULL_REQUEST_CENSUS = `
query ReconcilePullRequestCensus($owner: String!, $repo: String!, $after: String, $rootPage: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(
      first: $rootPage
      after: $after
      states: [OPEN, CLOSED, MERGED]
      orderBy: {field: CREATED_AT, direction: ASC}
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        id updatedAt
        timelineItems(first: 1, itemTypes: [${TIMELINE_ITEM_TYPES_ARG}]) {
          filteredCount
          updatedAt
        }
      }
    }
  }
}`;
