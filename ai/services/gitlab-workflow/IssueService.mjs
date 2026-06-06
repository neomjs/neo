import Base          from '../../../src/core/Base.mjs';
import GitLabClient  from './GitLabClient.mjs';
import aiConfig      from '../../mcp/server/gitlab-workflow/config.mjs';
import {LIST_ISSUES} from './queries/issueQueries.mjs';

/**
 * @summary Issue-tool service for the GitLab Workflow MCP server.
 *
 * `listIssues` is implemented against the GitLab GraphQL API via `GitLabClient`; the remaining
 * issue mutations (create / comment / labels / assignees) are still truthful scaffold responses
 * pending follow-up subtasks. Argument validation lives at the OpenAPI/Zod `makeSafe` boundary
 * in `ai/services.mjs`, not inside these methods.
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
     * @summary Builds a truthful scaffold response for a GitLab issue tool.
     * @param {String} tool
     * @param {Object} [received={}]
     * @returns {Object}
     * @private
     */
    #scaffold(tool, received = {}) {
        return {
            status : 'scaffolded',
            tool,
            message: 'GitLab Workflow MCP tool is registered; real GitLab API behavior lands with the GitLabClient subtask.',
            received
        };
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
     * @summary Creates a GitLab issue once the GitLabClient subtask is implemented.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async createIssue(options) {
        return this.#scaffold('create_issue', options);
    }

    /**
     * @summary Creates or updates GitLab issue comments once the GitLabClient subtask is implemented.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async manageIssueComment(options) {
        return this.#scaffold('manage_issue_comment', options);
    }

    /**
     * @summary Adds or removes GitLab issue labels once the GitLabClient subtask is implemented.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async manageIssueLabels(options) {
        return this.#scaffold('manage_issue_labels', options);
    }

    /**
     * @summary Adds or removes GitLab issue assignees once the GitLabClient subtask is implemented.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async manageIssueAssignees(options) {
        return this.#scaffold('manage_issue_assignees', options);
    }
}

export default Neo.setupClass(IssueService);
