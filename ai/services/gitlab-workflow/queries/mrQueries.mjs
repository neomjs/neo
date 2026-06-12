/**
 * @summary GitLab GraphQL query constants for merge-request read + lookup operations.
 *
 * The merge-request twin of `issueQueries.mjs`: merge requests live under `project(fullPath)`,
 * the user-facing id is `iid`, and labels/assignees/reviewers are connection nodes
 * (`labels.nodes`, `assignees.nodes`, `reviewers.nodes`). MRs additionally expose
 * `sourceBranch` / `targetBranch`, which the issue surface has no analog for. These query
 * strings are best-knowledge against GitLab's GraphQL schema and are **not yet
 * integration-validated against a live instance**; the unit tests validate the
 * `MergeRequestService` response-parsing against mocked `GitLabClient` responses (the query
 * strings themselves are not exercised by unit mocks).
 *
 * The merge-request global-id lookup (`GET_MERGE_REQUEST_GID`) resolves the opaque
 * `gid://gitlab/MergeRequest/...` id that the shared `createNote` comment mutation requires as
 * its `noteableId` — the MR analog of `GET_ISSUE_GID`. Project-label resolution is shared with
 * the issue surface via `GET_PROJECT_LABEL_IDS` (project-scoped, re-used from `issueQueries.mjs`).
 */

/**
 * The merge-request fields shared by the list and single-MR reads. Factored out so the two
 * queries cannot drift apart.
 * @type {String}
 */
const MERGE_REQUEST_FIELDS = `
    iid
    title
    state
    webUrl
    sourceBranch
    targetBranch
    createdAt
    updatedAt
    labels    { nodes { title } }
    assignees { nodes { username } }
    reviewers { nodes { username } }
`;

/**
 * Lists a project's merge requests with optional state / author filters.
 * @type {String}
 */
export const LIST_MERGE_REQUESTS = `
    query ListMergeRequests($fullPath: ID!, $state: MergeRequestState, $first: Int, $authorUsername: String) {
        project(fullPath: $fullPath) {
            mergeRequests(state: $state, first: $first, authorUsername: $authorUsername) {
                nodes {${MERGE_REQUEST_FIELDS}}
            }
        }
    }
`;

/**
 * Reads a single merge request by `iid`.
 * @type {String}
 */
export const GET_MERGE_REQUEST = `
    query GetMergeRequest($fullPath: ID!, $iid: String!) {
        project(fullPath: $fullPath) {
            mergeRequest(iid: $iid) {${MERGE_REQUEST_FIELDS}}
        }
    }
`;

/**
 * Resolves a merge-request `iid` to its opaque global id (`gid://gitlab/MergeRequest/...`) —
 * required as the `noteableId` for the shared `createNote` comment mutation.
 * @type {String}
 */
export const GET_MERGE_REQUEST_GID = `
    query GetMergeRequestGid($fullPath: ID!, $iid: String!) {
        project(fullPath: $fullPath) {
            mergeRequest(iid: $iid) {
                id
            }
        }
    }
`;
