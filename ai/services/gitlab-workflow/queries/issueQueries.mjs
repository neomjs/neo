/**
 * @summary GitLab GraphQL query constants for issue read operations.
 *
 * GitLab's GraphQL surface differs from GitHub's: issues live under `project(fullPath)`, the
 * user-facing id is `iid`, and labels/assignees are connection nodes (`labels.nodes`,
 * `assignees.nodes`). These query strings are integration-validated against a live GitLab
 * instance; the unit tests validate the `IssueService` response-parsing against mocked
 * `GitLabClient` responses (the query strings themselves are not exercised by unit mocks).
 */

/**
 * Lists a project's issues with optional state / label / assignee filters.
 * @type {String}
 */
export const LIST_ISSUES = `
    query ListIssues($fullPath: ID!, $state: IssuableState, $first: Int, $labelName: [String!], $assigneeUsernames: [String!]) {
        project(fullPath: $fullPath) {
            issues(state: $state, first: $first, labelName: $labelName, assigneeUsernames: $assigneeUsernames) {
                nodes {
                    iid
                    title
                    state
                    webUrl
                    createdAt
                    updatedAt
                    labels    { nodes { title } }
                    assignees { nodes { username } }
                }
            }
        }
    }
`;
