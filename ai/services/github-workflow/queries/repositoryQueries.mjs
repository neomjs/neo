/**
 * GraphQL query definitions for GitHub repository data.
 *
 * @module Neo.ai.mcp.server.github-workflow.queries.repositoryQueries
 * @ignoreDocs
 */

/**
 * Query to fetch the viewer's permission level for the repository.
 *
 * This is used to determine the capabilities of the currently authenticated user.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 */
export const GET_VIEWER_PERMISSION = `
  query GetViewerPermission(
    $owner: String!
    $repo: String!
  ) {
    repository(owner: $owner, name: $repo) {
      viewerPermission
    }
  }
`;
