/**
 * GraphQL query definitions for GitHub releases.
 *
 * @module Neo.ai.mcp.server.github-workflow.queries.releaseQueries
 * @ignoreDocs
 */

/**
 * Query to fetch the single latest release.
 * This is used for a quick check to see if the release cache is up-to-date.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 */
export const FETCH_LATEST_RELEASE = `
  query FetchLatestRelease(
    $owner: String!
    $repo: String!
  ) {
    repository(owner: $owner, name: $repo) {
      latestRelease {
        tagName
        name
        publishedAt
        isPrerelease
        isDraft
      }
    }
  }
`;

/**
 * Query to fetch releases with pagination support.
 *
 * This fetches release metadata including the description (release notes), which will be
 * saved as local Markdown files with frontmatter.
 *
 * Note: GitHub's GraphQL API uses 'description' for the release body content,
 * not 'body' like the REST API.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $limit: Int! - Number of releases per page
 * - $cursor: String - Pagination cursor (null for first page)
 */
export const FETCH_RELEASES = `
  query FetchReleases(
    $owner: String!
    $repo: String!
    $limit: Int!
    $cursor: String
  ) {
    repository(owner: $owner, name: $repo) {
      releases(
        first: $limit
        after: $cursor
        orderBy: {field: CREATED_AT, direction: DESC}
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          tagName
          name
          description
          publishedAt
          isPrerelease
          isDraft
        }
      }
    }
  }
`;
