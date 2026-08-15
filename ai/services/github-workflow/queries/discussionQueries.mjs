/**
 * GraphQL queries for GitHub Discussions.
 *
 * @module Neo.ai.mcp.server.github-workflow.queries.discussionQueries
 */

/**
 * Query to fetch a repository's discussion categories.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 */
export const GET_REPO_AND_DISCUSSION_CATEGORIES = `
  query GetCategories($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      id
      discussionCategories(first: 10) {
        nodes {
          id
          name
        }
      }
    }
  }
`;

/**
 * Query to fetch a discussion's GraphQL ID (used for mutations like Comments).
 * Note: Discussions are identified by 'number', just like issues/PRs.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $number: Int!
 */
export const GET_DISCUSSION_ID = `
  query GetDiscussionId($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      discussion(number: $number) {
        id
      }
    }
  }
`;

/**
 * Query to fetch a discussion conversation, including top-level comments and replies.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $discussionNumber: Int!
 * - $maxComments: Int!
 * - $maxReplies: Int!
 */
export const GET_DISCUSSION_CONVERSATION = `
  query GetDiscussionConversation(
    $owner: String!
    $repo: String!
    $discussionNumber: Int!
    $maxComments: Int!
    $maxReplies: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      discussion(number: $discussionNumber) {
        id
        number
        title
        body
        url
        createdAt
        updatedAt

        author {
          login
        }

        category {
          name
        }

        comments(first: $maxComments) {
          nodes {
            id
            databaseId
            author {
              login
            }
            body
            createdAt
            updatedAt
            url
            isAnswer

            replies(first: $maxReplies) {
              nodes {
                id
                author {
                  login
                }
                body
                createdAt
                updatedAt
                url
                isAnswer
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * @summary Fetches Discussions for local synchronization, including the first nested comment/reply
 * pages plus each connection's `totalCount` / `pageInfo`. The syncer drives those exhaustion facts
 * through the continuation queries below before rendering, so the 50/20 page sizes never become
 * corpus caps.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $limit: Int!
 * - $cursor: String
 * - $maxComments: Int!
 * - $maxReplies: Int!
 */
export const FETCH_DISCUSSIONS_FOR_SYNC = `
  query FetchDiscussionsForSync(
    $owner: String!
    $repo: String!
    $limit: Int!
    $cursor: String
    $maxComments: Int!
    $maxReplies: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      discussions(
        first: $limit
        after: $cursor
        orderBy: {field: UPDATED_AT, direction: DESC}
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          number
          title
          body
          closed
          closedAt
          createdAt
          updatedAt

          author {
            login
          }

          category {
            name
          }

          comments(first: $maxComments) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              paginationId: id
              author {
                login
              }
              body
              createdAt
              isAnswer
              replies(first: $maxReplies) {
                totalCount
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  author {
                    login
                  }
                  body
                  createdAt
                  isAnswer
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * @summary Single-discussion variant of {@link FETCH_DISCUSSIONS_FOR_SYNC} for the force-refetch path.
 *
 * Returns the identical sync node shape (body + comments + nested replies + exhaustion facts) for
 * ONE discussion by number, bypassing the bulk delta-by-`updatedAt` gating so a known-stale local
 * mirror can be force-re-rendered from current GitHub state without weakening completeness evidence.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $number: Int!
 * - $maxComments: Int!
 * - $maxReplies: Int!
 */
export const FETCH_SINGLE_DISCUSSION_FOR_SYNC = `
  query FetchSingleDiscussionForSync(
    $owner: String!
    $repo: String!
    $number: Int!
    $maxComments: Int!
    $maxReplies: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      discussion(number: $number) {
        number
        title
        body
        closed
        closedAt
        createdAt
        updatedAt

        author {
          login
        }

        category {
          name
        }

        comments(first: $maxComments) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            paginationId: id
            author {
              login
            }
            body
            createdAt
            isAnswer
            replies(first: $maxReplies) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                author {
                  login
                }
                body
                createdAt
                isAnswer
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * @summary Continues the top-level comment connection for one Discussion.
 *
 * Every returned comment includes the first reply page plus its exhaustion facts, matching the
 * nested shape of the bulk and force-refetch queries. `paginationId` is an internal alias used only
 * to continue a comment's reply connection; the renderer deliberately ignores it so persisted
 * Markdown and content-trust signal paths keep their existing shape.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $number: Int!
 * - $cursor: String
 * - $maxComments: Int!
 * - $maxReplies: Int!
 */
export const FETCH_DISCUSSION_COMMENTS_PAGE = `
  query FetchDiscussionCommentsPage(
    $owner: String!
    $repo: String!
    $number: Int!
    $cursor: String
    $maxComments: Int!
    $maxReplies: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      discussion(number: $number) {
        comments(first: $maxComments, after: $cursor) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            paginationId: id
            author {
              login
            }
            body
            createdAt
            isAnswer
            replies(first: $maxReplies) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                author {
                  login
                }
                body
                createdAt
                isAnswer
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * @summary Continues the reply connection for one Discussion comment.
 *
 * The parent comment is addressed by the internal `paginationId` selected by the initial/comment
 * page queries. Replies retain the exact renderer-facing fields of the first page.
 *
 * Variables required:
 * - $commentId: ID!
 * - $cursor: String
 * - $maxReplies: Int!
 */
export const FETCH_DISCUSSION_REPLIES_PAGE = `
  query FetchDiscussionRepliesPage(
    $commentId: ID!
    $cursor: String
    $maxReplies: Int!
  ) {
    node(id: $commentId) {
      ... on DiscussionComment {
        replies(first: $maxReplies, after: $cursor) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            author {
              login
            }
            body
            createdAt
            isAnswer
          }
        }
      }
    }
  }
`;
