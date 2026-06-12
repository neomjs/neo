import Base          from '../../../src/core/Base.mjs';
import GitLabClient  from './GitLabClient.mjs';
import aiConfig      from '../../mcp/server/gitlab-workflow/config.mjs';
import logger        from '../../mcp/server/gitlab-workflow/logger.mjs';
import {LIST_ISSUES, GET_ISSUE_GID, GET_PROJECT_LABEL_IDS}                          from './queries/issueQueries.mjs';
import {CREATE_ISSUE, CREATE_NOTE, UPDATE_NOTE, UPDATE_ISSUE_LABELS, ISSUE_SET_ASSIGNEES} from './queries/mutations.mjs';

/**
 * @summary Issue-tool service for the GitLab Workflow MCP server.
 *
 * Implements real GitLab GraphQL behavior for the full issue-tool surface — `listIssues`,
 * `createIssue`, `manageIssueComment`, `manageIssueLabels`, `manageIssueAssignees` — via the
 * shared `GitLabClient`. The GitLab-vs-GitHub shape differences are handled here: issues are
 * addressed by `iid` under a `project(fullPath)`, comments are `notes`, and mutations that
 * require opaque global ids (`noteableId`, label ids) resolve them through the lookup queries
 * before mutating.
 *
 * Argument validation lives at the OpenAPI/Zod `makeSafe` boundary in `ai/services.mjs`, not
 * inside these methods; the per-method `action` guards here are domain routing, not schema
 * validation. The GraphQL strings are best-knowledge against GitLab's current schema and are
 * not yet integration-validated against a live instance (that validation is a deferred
 * follow-up); the unit suite mocks `GitLabClient.query` and exercises this service's logic
 * (routing, id resolution, variable forwarding, error surfacing).
 *
 * @class Neo.ai.services.gitlab-workflow.IssueService
 * @extends Neo.core.Base
 * @singleton
 */
class IssueService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.gitlab-workflow.IssueService'
         * @protected
         */
        className: 'Neo.ai.services.gitlab-workflow.IssueService',
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
     * @param {Object} payload The named mutation payload (e.g. `data.createIssue`).
     * @returns {String[]|null}
     * @private
     */
    #userErrors(payload) {
        const errors = payload?.errors;
        return Array.isArray(errors) && errors.length > 0 ? errors : null;
    }

    /**
     * @summary Resolves an issue `iid` to its opaque global id (the `noteableId` a comment needs).
     * @param {Number|String} iid
     * @returns {Promise<String|null>}
     * @private
     */
    async #resolveIssueGid(iid) {
        const data = await GitLabClient.query(GET_ISSUE_GID, {
            fullPath: aiConfig.gitlab.projectPath,
            iid     : String(iid)
        });
        return data?.project?.issue?.id || null;
    }

    /**
     * @summary Resolves project label names to their opaque global ids (drops unknown names).
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
     * @summary Shared `issueSetAssignees` mutation runner (username-native; no id pre-lookup).
     *
     * Self-contained error handling so callers can treat a failed assign as a soft warning
     * (`createIssue`) or a hard error (`manageIssueAssignees`) without a throw escaping.
     *
     * @param {Number|String} iid
     * @param {String[]}      assignees     GitLab usernames.
     * @param {String}        operationMode `APPEND` | `REMOVE` | `REPLACE`.
     * @returns {Promise<Object>} `{message, assignees}` on success, or a structured error.
     * @private
     */
    async #setAssignees(iid, assignees, operationMode) {
        try {
            const data    = await GitLabClient.query(ISSUE_SET_ASSIGNEES, {
                projectPath      : aiConfig.gitlab.projectPath,
                iid              : String(iid),
                assigneeUsernames: assignees,
                operationMode
            });
            const payload = data?.issueSetAssignees,
                  errors  = this.#userErrors(payload);

            if (errors) return this.#mutationErrorResponse(errors, `setting assignees on issue #${iid}`);

            return {
                message  : `Successfully updated assignees on issue #${iid}`,
                assignees: (payload?.issue?.assignees?.nodes || []).map(user => user.username)
            };
        } catch (error) {
            return this.#apiErrorResponse(error, `setting assignees on issue #${iid}`);
        }
    }

    /**
     * @summary Lists the configured GitLab project's issues via the GitLab GraphQL API.
     * @param {Object} [options={}]
     * @param {Number} [options.limit=30]
     * @param {String} [options.state='opened'] One of `opened` / `closed` / `all`.
     * @param {String} [options.labels] Comma-separated label names to filter by.
     * @param {String} [options.assignee] A single GitLab username to filter by.
     * @returns {Promise<Object>} `{items, count}`.
     */
    async listIssues({limit=30, state='opened', labels=null, assignee=null} = {}) {
        const data = await GitLabClient.query(LIST_ISSUES, {
            fullPath         : aiConfig.gitlab.projectPath,
            state,
            first            : limit,
            labelName        : labels ? labels.split(',').map(label => label.trim()).filter(Boolean) : null,
            assigneeUsernames: assignee ? [assignee] : null
        });

        const nodes = data?.project?.issues?.nodes || [];

        return {
            items: nodes.map(node => ({
                iid      : node.iid,
                title    : node.title,
                state    : node.state,
                webUrl   : node.webUrl,
                createdAt: node.createdAt,
                updatedAt: node.updatedAt,
                labels   : (node.labels?.nodes    || []).map(label => label.title),
                assignees: (node.assignees?.nodes || []).map(user  => user.username)
            })),
            count: nodes.length
        };
    }

    /**
     * @summary Creates a GitLab issue, then optionally applies assignees.
     *
     * Labels are assigned by name during creation. Assignees are username-keyed and applied in
     * a follow-up `issueSetAssignees`; a failed assign does NOT roll back the created issue
     * (the issue exists — graceful degradation) and is surfaced as `assigneeWarning`.
     *
     * @param {Object}   options
     * @param {String}   options.title
     * @param {String}   [options.body='']      Markdown issue description.
     * @param {String[]} [options.labels=[]]    Label names to assign on creation.
     * @param {String[]} [options.assignees=[]] GitLab usernames to assign.
     * @returns {Promise<Object>} `{iid, title, webUrl, assignees?|assigneeWarning?}` or a structured error.
     */
    async createIssue({title, body='', labels=[], assignees=[]}) {
        try {
            const data    = await GitLabClient.query(CREATE_ISSUE, {
                projectPath: aiConfig.gitlab.projectPath,
                title,
                description: body,
                labels     : labels?.length ? labels : null
            });
            const payload = data?.createIssue,
                  errors  = this.#userErrors(payload);

            if (errors) return this.#mutationErrorResponse(errors, `creating issue "${title}"`);

            const issue  = payload?.issue,
                  result = {iid: issue?.iid, title: issue?.title, webUrl: issue?.webUrl};

            if (assignees?.length && issue?.iid) {
                const assignResult = await this.#setAssignees(issue.iid, assignees, 'APPEND');

                if (assignResult.error) {
                    result.assigneeWarning = assignResult.message;
                } else {
                    result.assignees = assignResult.assignees;
                }
            }

            return result;
        } catch (error) {
            return this.#apiErrorResponse(error, `creating issue "${title}"`);
        }
    }

    /**
     * @summary Creates or updates a comment (GitLab "note") on an issue.
     *
     * `create` resolves the issue's global id (`noteableId`); `update` addresses the note by the
     * global id reconstructed from the numeric `note_id` (`gid://gitlab/Note/<id>`).
     *
     * @param {Object} options
     * @param {String} options.action          `create` | `update`.
     * @param {Number} [options.issue_number]  Issue `iid` (required for `create`).
     * @param {Number} [options.note_id]       Note id (required for `update`).
     * @param {String} options.body            Comment body.
     * @returns {Promise<Object>} `{message, noteId}` or a structured error.
     */
    async manageIssueComment({action, issue_number, note_id, body}) {
        if (!['create', 'update'].includes(action)) {
            return {error: 'Bad Request', message: "Invalid action. Must be 'create' or 'update'.", code: 'INVALID_ARGUMENTS'};
        }

        try {
            if (action === 'create') {
                const noteableId = await this.#resolveIssueGid(issue_number);

                if (!noteableId) {
                    return {error: 'Not Found', message: `Issue #${issue_number} not found in project '${aiConfig.gitlab.projectPath}'.`, code: 'ISSUE_NOT_FOUND'};
                }

                const data    = await GitLabClient.query(CREATE_NOTE, {noteableId, body}),
                      payload = data?.createNote,
                      errors  = this.#userErrors(payload);

                if (errors) return this.#mutationErrorResponse(errors, `commenting on issue #${issue_number}`);

                return {message: `Successfully created comment on issue #${issue_number}`, noteId: payload?.note?.id};
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
            return this.#apiErrorResponse(error, `managing comment on issue #${issue_number}`);
        }
    }

    /**
     * @summary Adds or removes labels on an issue.
     *
     * Resolves label names to global ids (GitLab's `updateIssue` mutates labels by id), then
     * routes them to `addLabelIds` / `removeLabelIds`. Unknown label names are rejected with
     * `LABEL_NOT_FOUND` rather than silently dropped.
     *
     * @param {Object}   options
     * @param {Number}   options.issue_number Issue `iid`.
     * @param {String}   options.action       `add` | `remove`.
     * @param {String[]} options.labels       Label names to add or remove.
     * @returns {Promise<Object>} `{message, labels}` or a structured error.
     */
    async manageIssueLabels({issue_number, action, labels}) {
        if (!['add', 'remove'].includes(action)) {
            return {error: 'Bad Request', message: "Invalid action. Must be 'add' or 'remove'.", code: 'INVALID_ARGUMENTS'};
        }

        try {
            const labelIds = await this.#resolveLabelIds(labels);

            if (labelIds.length !== (labels?.length || 0)) {
                return {error: 'Not Found', message: `One or more labels not found in project '${aiConfig.gitlab.projectPath}': ${labels.join(', ')}`, code: 'LABEL_NOT_FOUND'};
            }

            const data    = await GitLabClient.query(UPDATE_ISSUE_LABELS, {
                projectPath   : aiConfig.gitlab.projectPath,
                iid           : String(issue_number),
                addLabelIds   : action === 'add'    ? labelIds : null,
                removeLabelIds: action === 'remove' ? labelIds : null
            });
            const payload = data?.updateIssue,
                  errors  = this.#userErrors(payload);

            if (errors) return this.#mutationErrorResponse(errors, `${action === 'add' ? 'adding labels to' : 'removing labels from'} issue #${issue_number}`);

            return {
                message: `Successfully ${action === 'add' ? 'added labels to' : 'removed labels from'} issue #${issue_number}`,
                labels : (payload?.issue?.labels?.nodes || []).map(label => label.title)
            };
        } catch (error) {
            return this.#apiErrorResponse(error, `managing labels on issue #${issue_number}`);
        }
    }

    /**
     * @summary Adds or removes assignees on an issue (username-native via `issueSetAssignees`).
     * @param {Object}   options
     * @param {Number}   options.issue_number Issue `iid`.
     * @param {String}   options.action       `add` (APPEND) | `remove` (REMOVE).
     * @param {String[]} options.assignees    GitLab usernames.
     * @returns {Promise<Object>} `{message, assignees}` or a structured error.
     */
    async manageIssueAssignees({issue_number, action, assignees}) {
        if (!['add', 'remove'].includes(action)) {
            return {error: 'Bad Request', message: "Invalid action. Must be 'add' or 'remove'.", code: 'INVALID_ARGUMENTS'};
        }

        return this.#setAssignees(issue_number, assignees, action === 'add' ? 'APPEND' : 'REMOVE');
    }
}

export default Neo.setupClass(IssueService);
