/**
 * @summary GitLab GraphQL mutation constants for issue write operations.
 *
 * Each GitLab mutation payload carries a top-level `errors: [String!]` array of user-facing
 * validation errors (distinct from transport / GraphQL-level errors, which `GitLabClient.query`
 * raises in strict mode). `IssueService` inspects this array and surfaces a structured error
 * when it is non-empty. These mutation strings are best-knowledge against GitLab's GraphQL
 * schema and are not yet integration-validated against a live instance; the unit tests exercise
 * the `IssueService` logic (action routing, id resolution, variable forwarding, error
 * surfacing) against a mocked `GitLabClient`.
 */

/**
 * Creates an issue in a project. `labels` are assigned by name on creation; assignees are
 * applied in a follow-up `issueSetAssignees` call (GitLab's `createIssue` takes assignee ids,
 * not usernames, so username-keyed assignment is deferred to the username-native mutation).
 * @type {String}
 */
export const CREATE_ISSUE = `
    mutation CreateIssue($projectPath: ID!, $title: String!, $description: String, $labels: [String!]) {
        createIssue(input: {projectPath: $projectPath, title: $title, description: $description, labels: $labels}) {
            issue {
                iid
                title
                webUrl
            }
            errors
        }
    }
`;

/**
 * Creates a note (comment) on an issue. `noteableId` is the issue's global id (resolved via
 * `GET_ISSUE_GID`).
 * @type {String}
 */
export const CREATE_NOTE = `
    mutation CreateNote($noteableId: NoteableID!, $body: String!) {
        createNote(input: {noteableId: $noteableId, body: $body}) {
            note {
                id
                body
            }
            errors
        }
    }
`;

/**
 * Updates an existing note (comment). `id` is the note's global id (`gid://gitlab/Note/<id>`).
 * @type {String}
 */
export const UPDATE_NOTE = `
    mutation UpdateNote($id: NoteID!, $body: String!) {
        updateNote(input: {id: $id, body: $body}) {
            note {
                id
                body
            }
            errors
        }
    }
`;

/**
 * Adds and/or removes labels on an issue by global id (resolved via `GET_PROJECT_LABEL_IDS`).
 * `updateIssue` addresses the issue by `projectPath` + `iid`, so no issue-id pre-lookup is needed.
 * @type {String}
 */
export const UPDATE_ISSUE_LABELS = `
    mutation UpdateIssueLabels($projectPath: ID!, $iid: String!, $addLabelIds: [LabelID!], $removeLabelIds: [LabelID!]) {
        updateIssue(input: {projectPath: $projectPath, iid: $iid, addLabelIds: $addLabelIds, removeLabelIds: $removeLabelIds}) {
            issue {
                iid
                labels { nodes { title } }
            }
            errors
        }
    }
`;

/**
 * Sets an issue's assignees by username. `operationMode` controls the semantics:
 * `APPEND` (add), `REMOVE` (remove), or `REPLACE`. GitLab resolves usernames natively here,
 * so no user-id pre-lookup is needed.
 * @type {String}
 */
export const ISSUE_SET_ASSIGNEES = `
    mutation IssueSetAssignees($projectPath: ID!, $iid: String!, $assigneeUsernames: [String!]!, $operationMode: MutationOperationMode) {
        issueSetAssignees(input: {projectPath: $projectPath, iid: $iid, assigneeUsernames: $assigneeUsernames, operationMode: $operationMode}) {
            issue {
                iid
                assignees { nodes { username } }
            }
            errors
        }
    }
`;
