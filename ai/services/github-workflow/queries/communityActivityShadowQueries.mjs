/**
 * Read-only GitHub queries for the community-activity shadow probe.
 *
 * @module ai/services/github-workflow/queries/communityActivityShadowQueries
 * @summary Metadata-only, cursor-bearing source queries for issues, pull requests/reviews and
 * Discussions. These queries intentionally select no title, body, excerpt or other prose.
 */

/** @summary Exhaust one page of repository issues whose root changed since the probe window opened. */
export const FETCH_SHADOW_ISSUE_ROOTS = `
  query ShadowIssueRoots(
    $owner: String!
    $repo: String!
    $limit: Int!
    $cursor: String
    $windowStart: DateTime!
  ) {
    repository(owner: $owner, name: $repo) {
      issues(
        first: $limit
        after: $cursor
        states: [OPEN, CLOSED]
        orderBy: {field: UPDATED_AT, direction: DESC}
        filterBy: {since: $windowStart}
      ) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          databaseId
          number
          state
          stateReason
          createdAt
          updatedAt
          closedAt
          lastEditedAt
          author { __typename login }
          authorAssociation
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;

/** @summary Exhaust one GitHub-search page of PR roots updated since the probe window opened. */
export const FETCH_SHADOW_PULL_REQUEST_ROOTS = `
  query ShadowPullRequestRoots($searchQuery: String!, $limit: Int!, $cursor: String) {
    search(query: $searchQuery, type: ISSUE, first: $limit, after: $cursor) {
      totalCount: issueCount
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on PullRequest {
          id
          databaseId
          number
          state
          isDraft
          createdAt
          updatedAt
          closedAt
          mergedAt
          lastEditedAt
          author { __typename login }
          authorAssociation
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;

/** @summary Exhaust one metadata-only review page for a known pull request. */
export const FETCH_SHADOW_PULL_REQUEST_REVIEWS_PAGE = `
  query ShadowPullRequestReviewsPage(
    $owner: String!
    $repo: String!
    $number: Int!
    $limit: Int!
    $cursor: String
  ) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        id
        reviews(first: $limit, after: $cursor) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            fullDatabaseId
            state
            createdAt
            updatedAt
            submittedAt
            lastEditedAt
            author { __typename login }
            authorAssociation
          }
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;

/** @summary Exhaust one page of Discussion roots without trusting their timestamps for child freshness. */
export const FETCH_SHADOW_DISCUSSION_ROOTS = `
  query ShadowDiscussionRoots($owner: String!, $repo: String!, $limit: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      discussions(
        first: $limit
        after: $cursor
        orderBy: {field: UPDATED_AT, direction: DESC}
      ) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          databaseId
          number
          closed
          closedAt
          locked
          isAnswered
          answerChosenAt
          createdAt
          updatedAt
          lastEditedAt
          author { __typename login }
          authorAssociation
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;

/** @summary Exhaust one metadata-only top-level comment page for a known Discussion. */
export const FETCH_SHADOW_DISCUSSION_COMMENTS_PAGE = `
  query ShadowDiscussionCommentsPage(
    $owner: String!
    $repo: String!
    $number: Int!
    $limit: Int!
    $cursor: String
  ) {
    repository(owner: $owner, name: $repo) {
      discussion(number: $number) {
        id
        comments(first: $limit, after: $cursor) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            databaseId
            createdAt
            updatedAt
            lastEditedAt
            deletedAt
            isAnswer
            author { __typename login }
            authorAssociation
          }
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;

/** @summary Exhaust one metadata-only reply page for a known Discussion comment. */
export const FETCH_SHADOW_DISCUSSION_REPLIES_PAGE = `
  query ShadowDiscussionRepliesPage($commentId: ID!, $limit: Int!, $cursor: String) {
    node(id: $commentId) {
      ... on DiscussionComment {
        id
        replies(first: $limit, after: $cursor) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            databaseId
            createdAt
            updatedAt
            lastEditedAt
            deletedAt
            isAnswer
            author { __typename login }
            authorAssociation
          }
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;
