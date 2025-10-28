import aiConfig                    from '../config.mjs';
import Base                        from '../../../../../src/core/Base.mjs';
import GraphqlService              from './GraphqlService.mjs';
import logger                      from '../logger.mjs';
import {exec}                      from 'child_process';
import {promisify}                 from 'util';
import {spawn}                     from 'child_process';
import {GET_ISSUE_AND_LABEL_IDS, FETCH_ISSUES_FOR_SYNC, DEFAULT_QUERY_LIMITS}   from './queries/issueQueries.mjs';
import {ADD_LABELS, REMOVE_LABELS} from './queries/mutations.mjs';
import RepositoryService           from './RepositoryService.mjs';

const execAsync = promisify(exec);

/**
 * Service for interacting with GitHub issues via the GraphQL API.
 * @class Neo.ai.mcp.server.github-workflow.services.IssueService
 * @extends Neo.core.Base
 * @singleton
 */
class IssueService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.IssueService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.IssueService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String[]} writePermissions=['ADMIN', 'MAINTAIN', 'WRITE']
         * @protected
         */
        writePermissions: ['ADMIN', 'MAINTAIN', 'WRITE']
    }

    /**
     * Convenience shortcut
     * @returns {Boolean}
     */
    hasWritePermission() {
        return this.writePermissions.includes(RepositoryService.viewerPermission);
    }

    /**
     * Assigns one or more users to a GitHub issue, or clears all assignees.
     * This method first verifies that the user has the required permissions (`WRITE`, `MAINTAIN`, or `ADMIN`)
     * before attempting to modify the issue.
     * - To add assignees, provide an array of GitHub logins.
     * - To clear all assignees, provide an empty array.
     * @param {object} options
     * @param {number} options.issue_number The number of the issue to modify.
     * @param {string[]} options.assignees An array of GitHub user logins to assign, or an empty array to clear all assignees.
     * @returns {Promise<object>}
     */
    async assignIssue({issue_number, assignees}) {
        if (!this.hasWritePermission()) {
            const message = [
                `Permission denied. Viewer has '${RepositoryService.viewerPermission}' permission, `,
                `but one of [${this.writePermissions.join(', ')}] is required to assign issues.`
            ].join('');

            logger.warn(message);
            return {
                error: 'Permission Denied',
                message,
                code : 'FORBIDDEN'
            };
        }

        try {
            let command;
            let successMessage;

            if (assignees?.length > 0) {
                logger.info(`Attempting to assign issue #${issue_number} to: ${assignees.join(', ')}`);
                const assigneeFlags = assignees.map(a => `--add-assignee "${a}"`).join(' ');
                command             = `gh issue edit ${issue_number} ${assigneeFlags}`;
                successMessage      = `Successfully assigned issue #${issue_number} to ${assignees.join(', ')}`;
            } else {
                logger.info(`Attempting to unassign all users from issue #${issue_number}`);
                // Passing an empty string to --remove-assignee has been experimentally verified to clear all assignees.
                command        = `gh issue edit ${issue_number} --remove-assignee ""`;
                successMessage = `Successfully unassigned all users from issue #${issue_number}`;
            }

            await execAsync(command);

            logger.info(successMessage);
            return {message: successMessage};

        } catch (error) {
            logger.error(`Error updating assignees for issue #${issue_number}:`, error);
            return {
                error  : 'GitHub CLI command failed',
                message: error.message,
                code   : 'GH_CLI_ERROR'
            };
        }
    }

    /**
     * Removes one or more specified assignees from a GitHub issue.
     * This method first verifies that the user has the required permissions (`WRITE`, `MAINTAIN`, or `ADMIN`)
     * before attempting to modify the issue.
     * @param {object} options
     * @param {number} options.issue_number The number of the issue to modify.
     * @param {string[]} options.assignees An array of GitHub user logins to unassign.
     * @returns {Promise<object>}
     */
    async unassignIssue({issue_number, assignees}) {
        if (!this.hasWritePermission()) {
            const message = [
                `Permission denied. Viewer has '${RepositoryService.viewerPermission}' permission, `,
                `but one of [${this.writePermissions.join(', ')}] is required to unassign issues.`
            ].join('');

            logger.warn(message);
            return {
                error  : 'Permission Denied',
                message,
                code   : 'FORBIDDEN'
            };
        }

        if (!assignees || assignees.length === 0) {
            return {
                error  : 'Bad Request',
                message: 'The `assignees` array cannot be empty for an unassign operation.',
                code   : 'BAD_REQUEST'
            };
        }

        logger.info(`Attempting to unassign issue #${issue_number} from: ${assignees.join(', ')}`);

        try {
            const assigneeFlags = assignees.map(a => `--remove-assignee "${a}"`).join(' ');
            const command       = `gh issue edit ${issue_number} ${assigneeFlags}`;

            await execAsync(command);

            const message = `Successfully unassigned ${assignees.join(', ')} from issue #${issue_number}`;
            logger.info(message);
            return { message };

        } catch (error) {
            logger.error(`Error unassigning from issue #${issue_number}:`, error);
            return {
                error  : 'GitHub CLI command failed',
                message: error.message,
                code   : 'GH_CLI_ERROR'
            };
        }
    }

    /**
     * Creates a new GitHub issue using the `gh` CLI.
     * @param {object} options - The options for creating the issue.
     * @param {string} options.title - The title of the issue.
     * @param {string} [options.body=''] - The Markdown body of the issue.
     * @param {string[]} [options.labels=[]] - An array of labels to add to the issue.
     * @returns {Promise<object>} A promise that resolves to the new issue's data or a structured error.
     */
    async createIssue({title, body = '', labels = [], assignees = []}) {
        logger.info(`Attempting to create GitHub issue: "${title}"`);

        // Permission check is only required if we are trying to assign users.
        if (assignees && assignees.length > 0) {
            if (!this.hasWritePermission()) {
                const message = [
                    `Permission denied. Viewer has '${RepositoryService.viewerPermission}' permission, `,
                    `but one of [${this.writePermissions.join(', ')}] is required to assign issues.`
                ].join('');

                logger.warn(message);
                return {
                    error: 'Permission Denied',
                    message,
                    code : 'FORBIDDEN'
                };
            }
        }

        const ghArgs = [
            'issue', 'create',
            '--title', title,
            '--body', body || 'No additional details provided.',
            '--repo', `${aiConfig.owner}/${aiConfig.repo}`
        ];

        if (labels && labels.length > 0) {
            labels.forEach(label => {
                ghArgs.push('--label', label);
            });
        }

        if (assignees && assignees.length > 0) {
            assignees.forEach(assignee => {
                ghArgs.push('--assignee', assignee);
            });
        }

        try {
            const ghProcess = spawn('gh', ghArgs);

            let stdout = '';
            let stderr = '';

            for await (const chunk of ghProcess.stdout) {
                stdout += chunk;
            }
            for await (const chunk of ghProcess.stderr) {
                stderr += chunk;
            }

            const exitCode = await new Promise(resolve => {
                ghProcess.on('close', resolve);
            });

            if (exitCode !== 0) {
                throw new Error(stderr || 'Failed to create GitHub issue.');
            }

            const issueUrl = stdout.trim();
            const issueNumber = parseInt(issueUrl.split('/').pop(), 10);

            if (!issueNumber) {
                throw new Error('Could not parse issue number from gh CLI output.');
            }

            logger.info(`Successfully created GitHub issue #${issueNumber}: ${issueUrl}`);
            return { issueNumber, url: issueUrl };

        } catch (error) {
            logger.error('Error creating GitHub issue:', error);
            return {
                error  : 'GitHub CLI command failed',
                message: error.message,
                code   : 'GH_CLI_ERROR'
            };
        }
    }

    /**
     * Fetches the GraphQL node IDs for an issue and a set of labels.
     * @param {number} issueNumber - The number of the issue or PR.
     * @param {string[]} labelNames - An array of label names.
     * @returns {Promise<{labelableId: string, labelIds: string[]}>} The node IDs.
     * @private
     */
    async #getIds(issueNumber, labelNames) {
        const variables = {
            owner      : aiConfig.owner,
            repo       : aiConfig.repo,
            issueNumber,
            maxLabels  : aiConfig.issueSync.maxRepoLabels
        };

        const data = await GraphqlService.query(GET_ISSUE_AND_LABEL_IDS, variables);

        const labelableId = data.repository.issue.id;
        const repoLabels = data.repository.labels.nodes;
        const labelIds = labelNames.map(name => {
            const label = repoLabels.find(l => l.name === name);
            return label ? label.id : null;
        }).filter(Boolean);

        if (!labelableId || labelIds.length !== labelNames.length) {
            throw new Error(`Could not find issue #${issueNumber} or one of the labels: ${labelNames.join(', ')}`);
        }

        return { labelableId, labelIds };
    }

    /**
     * Adds labels to an issue or pull request.
     * @param {number} issueNumber - The number of the issue or PR.
     * @param {string[]} labels - An array of labels to add.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async addLabels(issueNumber, labels) {
        try {
            const { labelableId, labelIds } = await this.#getIds(issueNumber, labels);

            await GraphqlService.query(ADD_LABELS, { labelableId, labelIds });
            return { message: `Successfully added labels to issue #${issueNumber}` };
        } catch (error) {
            logger.error(`Error adding labels to issue #${issueNumber} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Removes labels from an issue or pull request.
     * @param {number} issueNumber - The number of the issue or PR.
     * @param {string[]} labels - An array of labels to remove.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async removeLabels(issueNumber, labels) {
        try {
            const { labelableId, labelIds } = await this.#getIds(issueNumber, labels);

            await GraphqlService.query(REMOVE_LABELS, { labelableId, labelIds });
            return { message: `Successfully removed labels from issue #${issueNumber}` };
        } catch (error) {
            logger.error(`Error removing labels from issue #${issueNumber} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Lists issues from the repository using the GraphQL API.
     * Supports basic pagination and state filtering. Label and assignee
     * filters are applied client-side to keep the GraphQL query simple and
     * compatible with the existing sync query.
     *
     * @param {object} options
     * @param {number} [options.limit=30]
     * @param {string} [options.state='open']
     * @param {string[]|string} [options.labels]
     * @param {string} [options.assignee]
     * @param {string} [options.cursor]
     * @returns {Promise<object>}
     */
    async listIssues(options = {}) {
        const {
            limit = 30,
            state = 'open',
            labels = null,
            assignee = null,
            cursor = null
        } = options;

        // normalize state to uppercase array (GraphQL expects IssueState enum values)
        const states = state ? (Array.isArray(state) ? state.map(s => s.toUpperCase()) : [state.toUpperCase()]) : undefined;

        const variables = {
            owner     : aiConfig.owner,
            repo      : aiConfig.repo,
            limit,
            cursor,
            states,
            since     : null,
            ...DEFAULT_QUERY_LIMITS
        };

        try {
            const data = await GraphqlService.query(FETCH_ISSUES_FOR_SYNC, variables);
            let issues = data.repository.issues.nodes || [];

            // client-side label filtering if requested
            if (labels) {
                const labelList = Array.isArray(labels) ? labels : String(labels).split(',').map(s => s.trim()).filter(Boolean);
                issues = issues.filter(issue => {
                    const issueLabels = (issue.labels && issue.labels.nodes || []).map(l => l.name);
                    return labelList.every(l => issueLabels.includes(l));
                });
            }

            // client-side assignee filtering if requested
            if (assignee) {
                issues = issues.filter(issue => {
                    const assignees = (issue.assignees && issue.assignees.nodes || []).map(a => a.login);
                    return assignees.includes(assignee);
                });
            }

            return {
                count: issues.length,
                issues
            };
        } catch (error) {
            logger.error('Error fetching issues via GraphQL:', error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }
}

export default Neo.setupClass(IssueService);
