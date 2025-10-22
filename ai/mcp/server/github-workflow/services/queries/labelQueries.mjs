/**
 * GraphQL query definitions for GitHub labels.
 * @module Neo.ai.mcp.server.github-workflow.queries.labelQueries
 */

/**
 * Query to fetch all labels in a repository.
 *
 * Variables required:
 * - $owner: String! - Repository owner
 * - $repo: String! - Repository name
 * - $limit: Int! - Number of labels per page
 * - $cursor: String - Pagination cursor (null for first page)
 */
export const FETCH_LABELS = `
  query FetchLabels($owner: String!, $repo: String!, $limit: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      labels(first: $limit, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          name
          color
          description
        }
      }
    }
  }
`;
