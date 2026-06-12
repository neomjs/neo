/**
 * @summary GitLab GraphQL mutation constants for merge-request write operations.
 *
 * Unlike the issue label flow (which routes through `updateIssue` with split
 * `addLabelIds` / `removeLabelIds`), GitLab exposes dedicated `mergeRequestSetLabels` /
 * `mergeRequestSetAssignees` / `mergeRequestSetReviewers` mutations that all take a single
 * collection plus a `MutationOperationMode` (`APPEND` | `REMOVE` | `REPLACE`) — the same shape
 * as the issue `issueSetAssignees` mutation. `MergeRequestService` maps the MCP `add` / `remove`
 * action to `APPEND` / `REMOVE`.
 *
 * Comment (note) writes are **not** declared here: `createNote` / `updateNote` are noteable-generic
 * (an MR global id is a valid `NoteableID`), so the service re-uses them from `mutations.mjs`
 * rather than duplicating identical GraphQL.
 *
 * Each mutation payload carries a top-level `errors: [String!]` array of user-facing validation
 * errors (distinct from transport / GraphQL-level errors, which `GitLabClient.query` raises in
 * strict mode). These strings are best-knowledge against GitLab's GraphQL schema and are **not
 * yet integration-validated against a live instance**; the unit tests exercise the service logic
 * (action routing, id resolution, variable forwarding, error surfacing) against a mocked
 * `GitLabClient`.
 */

/**
 * Sets a merge request's labels by global id (resolved via `GET_PROJECT_LABEL_IDS`).
 * `operationMode` controls the semantics: `APPEND` (add), `REMOVE` (remove), or `REPLACE`.
 * @type {String}
 */
export const MR_SET_LABELS = `
    mutation MergeRequestSetLabels($projectPath: ID!, $iid: String!, $labelIds: [LabelID!]!, $operationMode: MutationOperationMode) {
        mergeRequestSetLabels(input: {projectPath: $projectPath, iid: $iid, labelIds: $labelIds, operationMode: $operationMode}) {
            mergeRequest {
                iid
                labels { nodes { title } }
            }
            errors
        }
    }
`;

/**
 * Sets a merge request's assignees by username. GitLab resolves usernames natively here, so no
 * user-id pre-lookup is needed. `operationMode`: `APPEND` (add), `REMOVE` (remove), or `REPLACE`.
 * @type {String}
 */
export const MR_SET_ASSIGNEES = `
    mutation MergeRequestSetAssignees($projectPath: ID!, $iid: String!, $assigneeUsernames: [String!]!, $operationMode: MutationOperationMode) {
        mergeRequestSetAssignees(input: {projectPath: $projectPath, iid: $iid, assigneeUsernames: $assigneeUsernames, operationMode: $operationMode}) {
            mergeRequest {
                iid
                assignees { nodes { username } }
            }
            errors
        }
    }
`;

/**
 * Sets a merge request's reviewers by username (the MR-only surface the issue twin has no analog
 * for). `operationMode`: `APPEND` (add), `REMOVE` (remove), or `REPLACE`.
 * @type {String}
 */
export const MR_SET_REVIEWERS = `
    mutation MergeRequestSetReviewers($projectPath: ID!, $iid: String!, $reviewerUsernames: [String!]!, $operationMode: MutationOperationMode) {
        mergeRequestSetReviewers(input: {projectPath: $projectPath, iid: $iid, reviewerUsernames: $reviewerUsernames, operationMode: $operationMode}) {
            mergeRequest {
                iid
                reviewers { nodes { username } }
            }
            errors
        }
    }
`;
