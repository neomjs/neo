/**
 * GraphQL query definitions for GitHub Pull Requests.
 * @module Neo.ai.mcp.server.github-workflow.queries.pullRequestQueries
 * @ignoreDocs
 */

/**
 * Query to fetch the full conversation for a pull request.
 *
 * Variables required:
 * - $owner: String! - Repository owner
 * - $repo: String! - Repository name
 * - $prNumber: Int! - The pull request number
 * - $maxComments: Int! - Max comments to fetch
 */
export const GET_CONVERSATION = `
  query GetConversation($owner: String!, $repo: String!, $prNumber: Int!, $maxComments: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        title
        body
        author {
          login
        }
        comments(first: $maxComments) {
          nodes {
            author {
              login
            }
            body
            createdAt
          }
        }
      }
    }
  }
`;

/**
 * Query to fetch a list of pull requests.
 *
 * Variables required:
 * - $owner: String! - Repository owner
 * - $repo: String! - Repository name
 * - $limit: Int! - Number of PRs per page
 * - $states: [PullRequestState!] - Filter by state (e.g., [OPEN])
 */
export const FETCH_PULL_REQUESTS = `
  query ListPullRequests($owner: String!, $repo: String!, $limit: Int!, $states: [PullRequestState!]) {
    repository(owner: $owner, name: $repo) {
      pullRequests(first: $limit, states: $states, orderBy: {field: CREATED_AT, direction: DESC}) {
        nodes {
          number
          title
          url
          createdAt
          author {
            login
          }
          state
        }
      }
    }
  }
`;

/**
 * Query to fetch pull requests for synchronization, including reviews and comments.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $limit: Int!
 * - $cursor: String
 * - $states: [PullRequestState!]
 * - $since: DateTime
 * - $maxComments: Int!
 * - $maxReviews: Int!
 */
export const FETCH_PULL_REQUESTS_FOR_SYNC = `
  query FetchPullRequestsForSync(
    $owner: String!
    $repo: String!
    $limit: Int!
    $cursor: String
    $states: [PullRequestState!]
    $maxComments: Int!
    $maxReviews: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      pullRequests(
        first: $limit
        after: $cursor
        states: $states
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
          state
          createdAt
          updatedAt
          closedAt
          mergedAt
          url
          headRefName
          baseRefName
          
          author {
            login
          }
          
          comments(first: $maxComments) {
            nodes {
              createdAt
              author {
                login
              }
              body
            }
          }

          reviews(first: $maxReviews) {
            nodes {
              createdAt
              author {
                login
              }
              body
              state
            }
          }
        }
      }
    }
  }
`;

/**
 * Query to get the global ID of a pull request.
 *
 * Variables required:
 * - $owner: String! - Repository owner
 * - $repo: String! - Repository name
 * - $prNumber: Int! - The pull request number
 */
export const GET_PULL_REQUEST_ID = `
  query GetPullRequestId($owner: String!, $repo: String!, $prNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        id
      }
    }
  }
`;
