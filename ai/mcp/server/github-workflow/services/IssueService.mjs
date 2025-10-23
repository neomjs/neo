import aiConfig                    from '../config.mjs';
import Base                        from '../../../../../src/core/Base.mjs';
import GraphqlService              from './GraphqlService.mjs';
import logger                      from '../logger.mjs';
import {exec}                      from 'child_process';
import {promisify}                 from 'util';
import {spawn}                     from 'child_process';
import {GET_ISSUE_AND_LABEL_IDS}   from './queries/issueQueries.mjs';
import {ADD_LABELS, REMOVE_LABELS} from './queries/mutations.mjs';
import RepositoryService           from './RepositoryService.mjs';

const execAsync = promisify(exec);

/**
 * Service for interacting with GitHub issues via the GraphQL API.
 * @class Neo.ai.mcp.server.github-workflow.IssueService
 * @extends Neo.core.Base
 * @singleton
 */
class IssueService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.IssueService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.IssueService',
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
     * Assigns a GitHub issue to one or more users.
     * @param {object} options
     * @param {number} options.issue_number
     * @param {string[]} options.assignees
     * @returns {Promise<object>}
     */
    async assignIssue({issue_number, assignees}) {
        if (!this.writePermissions.includes(RepositoryService.viewerPermission)) {
            const message = [
                `Permission denied. Viewer has '${RepositoryService.viewerPermission}' permission, `,
                `but one of [${this.writePermissions.join(', ')}] is required to assign issues.`
            ].join('');

            logger.warn(message);
            return {
                error  : 'Permission Denied',
                message,
                code   : 'FORBIDDEN'
            };
        }

        logger.info(`Attempting to assign issue #${issue_number} to: ${assignees.join(', ')}`);

        try {
            const assigneeFlags = assignees.map(a => `--add-assignee "${a}"`).join(' ');
            const command       = `gh issue edit ${issue_number} ${assigneeFlags}`;

            await execAsync(command);

            const message = `Successfully assigned issue #${issue_number} to ${assignees.join(', ')}`;
            logger.info(message);
            return { message };

        } catch (error) {
            logger.error(`Error assigning issue #${issue_number}:`, error);
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
    async createIssue({title, body = '', labels = []}) {
        logger.info(`Attempting to create GitHub issue: "${title}"`);

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
}

export default Neo.setupClass(IssueService);
