import Base          from '../../../src/core/Base.mjs';
import GitLabClient  from './GitLabClient.mjs';
import aiConfig      from '../../mcp/server/gitlab-workflow/config.mjs';
import logger        from '../../mcp/server/gitlab-workflow/logger.mjs';
import {GET_PROJECT_LABEL_IDS}                                         from './queries/issueQueries.mjs';
import {CREATE_NOTE, UPDATE_NOTE}                                      from './queries/mutations.mjs';
import {LIST_MERGE_REQUESTS, GET_MERGE_REQUEST, GET_MERGE_REQUEST_GID} from './queries/mrQueries.mjs';
import {MR_SET_LABELS, MR_SET_ASSIGNEES, MR_SET_REVIEWERS}             from './queries/mrMutations.mjs';

/**
 * @summary Merge-request-tool service for the GitLab Workflow MCP server.
 *
 * The merge-request twin of `IssueService`: implements real GitLab GraphQL behavior for the MR
 * surface — `listMergeRequests`, `getMergeRequest`, `manageMergeRequestComment`,
 * `manageMergeRequestLabels`, `manageMergeRequestAssignees`, `manageMergeRequestReviewers` — via
 * the shared `GitLabClient` (no new client — the GitLab MCP-parity epic mandates one
 * provider-agnostic transport). GitLab addresses MRs by `iid` under
 * `project(fullPath)`; comments are `notes`; labels/assignees/reviewers are set through the
 * dedicated `mergeRequestSet*` mutations with a `MutationOperationMode` (`APPEND` / `REMOVE`).
 *
 * **Reuse, not rebuild:** comment writes share the noteable-generic `createNote` / `updateNote`
 * mutations (`mutations.mjs`) and label resolution shares the project-scoped `GET_PROJECT_LABEL_IDS`
 * query (`issueQueries.mjs`) — duplicating identical GraphQL would be migration debt.
 *
 * **Read error contract (deliberate divergence from the issue twin):** `listMergeRequests` /
 * `getMergeRequest` wrap transport failures in `#apiErrorResponse` so the full MR surface returns
 * a uniform structured `{error, code}` (no throw across the MCP boundary — this ticket's Contract
 * Ledger). The issue read methods currently let transport errors propagate; aligning them is a
 * trivial follow-up, intentionally out of scope here to avoid touching the freshly-merged
 * issue-service code.
 *
 * Argument validation lives at the OpenAPI/Zod `makeSafe` boundary in `ai/services.mjs`, not inside
 * these methods; the per-method `action` guards here are domain routing, not schema validation. The
 * GraphQL strings are best-knowledge against GitLab's current schema and are **not yet
 * integration-validated against a live instance** (a deferred follow-up); the unit suite mocks
 * `GitLabClient.query` and exercises this service's logic (routing, id resolution, variable
 * forwarding, error surfacing).
 *
 * @class Neo.ai.services.gitlab-workflow.MergeRequestService
 * @extends Neo.core.Base
 * @singleton
 */
class MergeRequestService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.gitlab-workflow.MergeRequestService'
         * @protected
         */
        className: 'Neo.ai.services.gitlab-workflow.MergeRequestService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Builds the structured error response for a GitLab API/transport failure.
     * @param {Error}  error
     * @param {String} context Human-readable description of the attempted operation.
     * @returns {Object}
     * @private
     */
    #apiErrorResponse(error, context) {
        logger.error(`Error ${context} via GitLab GraphQL:`, error);
        return {error: 'GitLab API request failed', message: error.message, code: 'GITLAB_API_ERROR'};
    }

    /**
     * @summary Builds the structured error response for a GitLab mutation that returned
     * user-facing validation errors in its `errors` payload.
     * @param {String[]} errors
     * @param {String}   context Human-readable description of the attempted operation.
     * @returns {Object}
     * @private
     */
    #mutationErrorResponse(errors, context) {
        const message = `GitLab rejected ${context}: ${errors.join('; ')}`;
        logger.warn(message);
        return {error: 'GitLab API error', message, code: 'GITLAB_MUTATION_ERROR'};
    }

    /**
     * @summary Returns a GitLab mutation payload's user-facing `errors` array if non-empty.
     * @param {Object} payload The named mutation payload (e.g. `data.mergeRequestSetLabels`).
     * @returns {String[]|null}
     * @private
     */
    #userErrors(payload) {
        const errors = payload?.errors;
        return Array.isArray(errors) && errors.length > 0 ? errors : null;
    }

    /**
     * @summary Maps a GitLab `mergeRequest` GraphQL node to the flat MCP-contract item shape.
     * Shared by `listMergeRequests` and `getMergeRequest` so the two reads cannot drift apart.
     * @param {Object} node
     * @returns {Object}
     * @private
     */
    #mapMergeRequest(node) {
        return {
            iid         : node.iid,
            title       : node.title,
            state       : node.state,
            webUrl      : node.webUrl,
            sourceBranch: node.sourceBranch,
            targetBranch: node.targetBranch,
            createdAt   : node.createdAt,
            updatedAt   : node.updatedAt,
            labels      : (node.labels?.nodes    || []).map(label => label.title),
            assignees   : (node.assignees?.nodes || []).map(user  => user.username),
            reviewers   : (node.reviewers?.nodes || []).map(user  => user.username)
        };
    }

    /**
     * @summary Resolves an MR `iid` to its opaque global id (the `noteableId` a comment needs).
     * @param {Number|String} iid
     * @returns {Promise<String|null>}
     * @private
     */
    async #resolveMergeRequestGid(iid) {
        const data = await GitLabClient.query(GET_MERGE_REQUEST_GID, {
            fullPath: aiConfig.gitlab.projectPath,
            iid     : String(iid)
        });
        return data?.project?.mergeRequest?.id || null;
    }

    /**
     * @summary Resolves project label names to their opaque global ids (drops unknown names).
     * Shares the project-scoped `GET_PROJECT_LABEL_IDS` query with the issue surface.
     * @param {String[]} labelNames
     * @returns {Promise<String[]>}
     * @private
     */
    async #resolveLabelIds(labelNames) {
        if (!labelNames?.length) return [];

        const data          = await GitLabClient.query(GET_PROJECT_LABEL_IDS, {fullPath: aiConfig.gitlab.projectPath}),
              projectLabels = data?.project?.labels?.nodes || [];

        return labelNames.map(name => projectLabels.find(label => label.title === name)?.id).filter(Boolean);
    }

    /**
     * @summary Shared `mergeRequestSetAssignees` mutation runner (username-native; no id pre-lookup).
     * @param {Number|String} iid
     * @param {String[]}      assignees     GitLab usernames.
     * @param {String}        operationMode `APPEND` | `REMOVE` | `REPLACE`.
     * @returns {Promise<Object>} `{message, assignees}` on success, or a structured error.
     * @private
     */
    async #setAssignees(iid, assignees, operationMode) {
        try {
            const data    = await GitLabClient.query(MR_SET_ASSIGNEES, {
                projectPath      : aiConfig.gitlab.projectPath,
                iid              : String(iid),
                assigneeUsernames: assignees,
                operationMode
            });
            const payload = data?.mergeRequestSetAssignees,
                  errors  = this.#userErrors(payload);

            if (errors) return this.#mutationErrorResponse(errors, `setting assignees on merge request !${iid}`);

            return {
                message  : `Successfully updated assignees on merge request !${iid}`,
                assignees: (payload?.mergeRequest?.assignees?.nodes || []).map(user => user.username)
            };
        } catch (error) {
            return this.#apiErrorResponse(error, `setting assignees on merge request !${iid}`);
        }
    }

    /**
     * @summary Shared `mergeRequestSetReviewers` mutation runner (username-native; no id pre-lookup).
     * The reviewer surface is MR-only — the issue twin has no analog.
     * @param {Number|String} iid
     * @param {String[]}      reviewers     GitLab usernames.
     * @param {String}        operationMode `APPEND` | `REMOVE` | `REPLACE`.
     * @returns {Promise<Object>} `{message, reviewers}` on success, or a structured error.
     * @private
     */
    async #setReviewers(iid, reviewers, operationMode) {
        try {
            const data    = await GitLabClient.query(MR_SET_REVIEWERS, {
                projectPath      : aiConfig.gitlab.projectPath,
                iid              : String(iid),
                reviewerUsernames: reviewers,
                operationMode
            });
            const payload = data?.mergeRequestSetReviewers,
                  errors  = this.#userErrors(payload);

            if (errors) return this.#mutationErrorResponse(errors, `setting reviewers on merge request !${iid}`);

            return {
                message  : `Successfully updated reviewers on merge request !${iid}`,
                reviewers: (payload?.mergeRequest?.reviewers?.nodes || []).map(user => user.username)
            };
        } catch (error) {
            return this.#apiErrorResponse(error, `setting reviewers on merge request !${iid}`);
        }
    }

    /**
     * @summary Lists the configured GitLab project's merge requests via the GitLab GraphQL API.
     * @param {Object} [options={}]
     * @param {Number} [options.limit=30]
     * @param {String} [options.state='opened'] One of `opened` / `closed` / `merged` / `all`.
     * @param {String} [options.author] A single GitLab username to filter by (author).
     * @returns {Promise<Object>} `{items, count}`, or a structured error.
     */
    async listMergeRequests({limit=30, state='opened', author=null} = {}) {
        try {
            const data = await GitLabClient.query(LIST_MERGE_REQUESTS, {
                fullPath      : aiConfig.gitlab.projectPath,
                state,
                first         : limit,
                authorUsername: author
            });

            const nodes = data?.project?.mergeRequests?.nodes || [];

            return {items: nodes.map(node => this.#mapMergeRequest(node)), count: nodes.length};
        } catch (error) {
            return this.#apiErrorResponse(error, 'listing merge requests');
        }
    }

    /**
     * @summary Reads a single GitLab merge request by `iid`.
     * @param {Object}        options
     * @param {Number|String} options.merge_request_iid The MR `iid`.
     * @returns {Promise<Object>} The merge-request item shape, or a structured error.
     */
    async getMergeRequest({merge_request_iid}) {
        try {
            const data = await GitLabClient.query(GET_MERGE_REQUEST, {
                fullPath: aiConfig.gitlab.projectPath,
                iid     : String(merge_request_iid)
            });
            const node = data?.project?.mergeRequest;

            if (!node) {
                return {error: 'Not Found', message: `Merge request !${merge_request_iid} not found in project '${aiConfig.gitlab.projectPath}'.`, code: 'MERGE_REQUEST_NOT_FOUND'};
            }

            return this.#mapMergeRequest(node);
        } catch (error) {
            return this.#apiErrorResponse(error, `reading merge request !${merge_request_iid}`);
        }
    }

    /**
     * @summary Creates or updates a comment (GitLab "note") on a merge request.
     *
     * `create` resolves the MR's global id (`noteableId`); `update` addresses the note by the
     * global id reconstructed from the numeric `note_id` (`gid://gitlab/Note/<id>`). Shares the
     * noteable-generic `createNote` / `updateNote` mutations with the issue surface.
     *
     * @param {Object} options
     * @param {String} options.action             `create` | `update`.
     * @param {Number} [options.merge_request_iid] MR `iid` (required for `create`).
     * @param {Number} [options.note_id]           Note id (required for `update`).
     * @param {String} options.body               Comment body.
     * @returns {Promise<Object>} `{message, noteId}` or a structured error.
     */
    async manageMergeRequestComment({action, merge_request_iid, note_id, body}) {
        if (!['create', 'update'].includes(action)) {
            return {error: 'Bad Request', message: "Invalid action. Must be 'create' or 'update'.", code: 'INVALID_ARGUMENTS'};
        }

        try {
            if (action === 'create') {
                const noteableId = await this.#resolveMergeRequestGid(merge_request_iid);

                if (!noteableId) {
                    return {error: 'Not Found', message: `Merge request !${merge_request_iid} not found in project '${aiConfig.gitlab.projectPath}'.`, code: 'MERGE_REQUEST_NOT_FOUND'};
                }

                const data    = await GitLabClient.query(CREATE_NOTE, {noteableId, body}),
                      payload = data?.createNote,
                      errors  = this.#userErrors(payload);

                if (errors) return this.#mutationErrorResponse(errors, `commenting on merge request !${merge_request_iid}`);

                return {message: `Successfully created comment on merge request !${merge_request_iid}`, noteId: payload?.note?.id};
            }

            // action === 'update'
            if (!note_id) {
                return {error: 'Bad Request', message: "Missing required argument: 'note_id' is required for updating comments.", code: 'MISSING_ARGUMENTS'};
            }

            const data    = await GitLabClient.query(UPDATE_NOTE, {id: `gid://gitlab/Note/${note_id}`, body}),
                  payload = data?.updateNote,
                  errors  = this.#userErrors(payload);

            if (errors) return this.#mutationErrorResponse(errors, `updating comment ${note_id}`);

            return {message: `Successfully updated comment ${note_id}`, noteId: payload?.note?.id};
        } catch (error) {
            return this.#apiErrorResponse(error, `managing comment on merge request !${merge_request_iid}`);
        }
    }

    /**
     * @summary Adds or removes labels on a merge request.
     *
     * Resolves label names to global ids (rejects unknown names with `LABEL_NOT_FOUND` rather than
     * silently dropping), then routes them through `mergeRequestSetLabels` with `APPEND` (add) /
     * `REMOVE` (remove).
     *
     * @param {Object}        options
     * @param {Number|String} options.merge_request_iid MR `iid`.
     * @param {String}        options.action            `add` | `remove`.
     * @param {String[]}      options.labels            Label names to add or remove.
     * @returns {Promise<Object>} `{message, labels}` or a structured error.
     */
    async manageMergeRequestLabels({merge_request_iid, action, labels}) {
        if (!['add', 'remove'].includes(action)) {
            return {error: 'Bad Request', message: "Invalid action. Must be 'add' or 'remove'.", code: 'INVALID_ARGUMENTS'};
        }

        try {
            const labelIds = await this.#resolveLabelIds(labels);

            if (labelIds.length !== (labels?.length || 0)) {
                return {error: 'Not Found', message: `One or more labels not found in project '${aiConfig.gitlab.projectPath}': ${labels.join(', ')}`, code: 'LABEL_NOT_FOUND'};
            }

            const data    = await GitLabClient.query(MR_SET_LABELS, {
                projectPath  : aiConfig.gitlab.projectPath,
                iid          : String(merge_request_iid),
                labelIds,
                operationMode: action === 'add' ? 'APPEND' : 'REMOVE'
            });
            const payload = data?.mergeRequestSetLabels,
                  errors  = this.#userErrors(payload);

            if (errors) return this.#mutationErrorResponse(errors, `${action === 'add' ? 'adding labels to' : 'removing labels from'} merge request !${merge_request_iid}`);

            return {
                message: `Successfully ${action === 'add' ? 'added labels to' : 'removed labels from'} merge request !${merge_request_iid}`,
                labels : (payload?.mergeRequest?.labels?.nodes || []).map(label => label.title)
            };
        } catch (error) {
            return this.#apiErrorResponse(error, `managing labels on merge request !${merge_request_iid}`);
        }
    }

    /**
     * @summary Adds or removes assignees on a merge request (username-native via `mergeRequestSetAssignees`).
     * @param {Object}        options
     * @param {Number|String} options.merge_request_iid MR `iid`.
     * @param {String}        options.action            `add` (APPEND) | `remove` (REMOVE).
     * @param {String[]}      options.assignees         GitLab usernames.
     * @returns {Promise<Object>} `{message, assignees}` or a structured error.
     */
    async manageMergeRequestAssignees({merge_request_iid, action, assignees}) {
        if (!['add', 'remove'].includes(action)) {
            return {error: 'Bad Request', message: "Invalid action. Must be 'add' or 'remove'.", code: 'INVALID_ARGUMENTS'};
        }

        return this.#setAssignees(merge_request_iid, assignees, action === 'add' ? 'APPEND' : 'REMOVE');
    }

    /**
     * @summary Adds or removes reviewers on a merge request (username-native via `mergeRequestSetReviewers`).
     * @param {Object}        options
     * @param {Number|String} options.merge_request_iid MR `iid`.
     * @param {String}        options.action            `add` (APPEND) | `remove` (REMOVE).
     * @param {String[]}      options.reviewers         GitLab usernames.
     * @returns {Promise<Object>} `{message, reviewers}` or a structured error.
     */
    async manageMergeRequestReviewers({merge_request_iid, action, reviewers}) {
        if (!['add', 'remove'].includes(action)) {
            return {error: 'Bad Request', message: "Invalid action. Must be 'add' or 'remove'.", code: 'INVALID_ARGUMENTS'};
        }

        return this.#setReviewers(merge_request_iid, reviewers, action === 'add' ? 'APPEND' : 'REMOVE');
    }
}

export default Neo.setupClass(MergeRequestService);
