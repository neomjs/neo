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
 * Basic query to fetch discussions for local synchronization.
 * Includes nested comments and replies.
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
            nodes {
              author {
                login
              }
              body
              createdAt
              isAnswer
              replies(first: $maxReplies) {
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
