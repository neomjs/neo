/**
 * @summary GitLab GraphQL query constants for issue read + lookup operations.
 *
 * GitLab's GraphQL surface differs from GitHub's: issues live under `project(fullPath)`, the
 * user-facing id is `iid`, and labels/assignees are connection nodes (`labels.nodes`,
 * `assignees.nodes`). These query strings are best-knowledge against GitLab's GraphQL schema
 * and are not yet integration-validated against a live instance; the unit tests validate the
 * `IssueService` response-parsing against mocked `GitLabClient` responses (the query strings
 * themselves are not exercised by unit mocks).
 *
 * Lookup queries (`GET_ISSUE_GID`, `GET_PROJECT_LABEL_IDS`) resolve the opaque global ids
 * (`gid://gitlab/Issue/...`, `gid://gitlab/ProjectLabel/...`) that GitLab mutations require but
 * the MCP tool contract only carries as `iid` / label-name — the GitLab twin of the
 * github-workflow `GET_ISSUE_ID` / `GET_ISSUE_LABEL_IDS` two-step pattern.
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

/**
 * Resolves an issue `iid` to its opaque global id (`gid://gitlab/Issue/...`) — required as the
 * `noteableId` for the `createNote` comment mutation.
 * @type {String}
 */
export const GET_ISSUE_GID = `
    query GetIssueGid($fullPath: ID!, $iid: String!) {
        project(fullPath: $fullPath) {
            issue(iid: $iid) {
                id
            }
        }
    }
`;

/**
 * Resolves a project's label names to their opaque global ids — required for the
 * `addLabelIds` / `removeLabelIds` arguments of the `updateIssue` label mutation (GitLab's
 * `updateIssue` mutates labels by id, not name).
 * @type {String}
 */
export const GET_PROJECT_LABEL_IDS = `
    query GetProjectLabelIds($fullPath: ID!) {
        project(fullPath: $fullPath) {
            labels {
                nodes {
                    id
                    title
                }
            }
        }
    }
`;
