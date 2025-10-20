import {exec}      from 'child_process';
import {promisify} from 'util';
import Base        from '../../../../../src/core/Base.mjs';
import logger      from '../../logger.mjs';

const execAsync = promisify(exec);

/**
 * Service for interacting with GitHub Pull Requests via the `gh` CLI.
 * @class Neo.ai.mcp.server.github-workflow.PullRequestService
 * @extends Neo.core.Base
 * @singleton
 */
class PullRequestService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.PullRequestService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.PullRequestService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Fetches a list of pull requests from GitHub.
     * @param {object} [options] - The options for listing pull requests.
     * @param {number} [options.limit=30] - The maximum number of PRs to return.
     * @param {string} [options.state='open'] - The state of the pull requests to list (open, closed, merged, all).
     * @returns {Promise<object>} A promise that resolves to the list of pull requests or a structured error.
     */
    async listPullRequests(options = {}) {
        const {limit = 30, state = 'open'} = options;
        
        try {
            const command = `gh pr list --state ${state} --limit ${limit} --json number,title,author,url,state,createdAt`;
            const {stdout} = await execAsync(command);
            const pullRequests = JSON.parse(stdout);
            return {
                count: pullRequests.length,
                pullRequests: pullRequests.map(pr => ({
                    ...pr,
                    author: pr.author.login
                }))
            };
        } catch (error) {
            logger.error('Error fetching pull requests:', error);
            return {
                error  : 'GitHub CLI command failed',
                message: `gh pr list failed with exit code ${error.code}`,
                code   : 'GH_CLI_ERROR'
            };
        }
    }

    /**
     * Checks out a specific pull request locally.
     * @param {number} prNumber - The number of the pull request to check out.
     * @returns {Promise<object>} A promise that resolves to a success message or a structured error.
     */
    async checkoutPullRequest(prNumber) {
        try {
            const {stdout} = await execAsync(`gh pr checkout ${prNumber}`);
            return {message: `Successfully checked out PR #${prNumber}`, details: stdout.trim()};
        } catch (error) {
            logger.error(`Error checking out PR #${prNumber}:`, error);
            return {
                error  : 'GitHub CLI command failed',
                message: `gh pr checkout ${prNumber} failed with exit code ${error.code}`,
                code   : 'GH_CLI_ERROR'
            };
        }
    }

    /**
     * Gets the diff for a specific pull request.
     * @param {number} prNumber - The number of the pull request.
     * @returns {Promise<string|object>} A promise that resolves to the diff text or a structured error.
     */
    async getPullRequestDiff(prNumber) {
        try {
            const {stdout} = await execAsync(`gh pr diff ${prNumber}`);
            return stdout;
        } catch (error) {
            logger.error(`Error getting diff for PR #${prNumber}:`, error);
            return {
                error  : 'GitHub CLI command failed',
                message: `gh pr diff ${prNumber} failed with exit code ${error.code}`,
                code   : 'GH_CLI_ERROR'
            };
        }
    }

    /**
     * Creates a comment on a specific pull request.
     * @param {number} prNumber - The number of the pull request.
     * @param {string} body - The content of the comment.
     * @returns {Promise<object>} A promise that resolves to a success message or a structured error.
     */
    async createComment(prNumber, body) {
        return new Promise((resolve) => {
            const command = `gh pr comment ${prNumber} --body-file -`;
            const child = exec(command, (error, stdout, stderr) => {
                if (error) {
                    logger.error(`Error creating comment on PR #${prNumber}:`, error);
                    resolve({
                        error  : 'GitHub CLI command failed',
                        message: `gh pr comment ${prNumber} failed with exit code ${error.code}`,
                        code   : 'GH_CLI_ERROR'
                    });
                    return;
                }
                resolve({message: `Successfully created comment on PR #${prNumber}`, details: stdout.trim()});
            });

            // Write the comment body to the stdin of the child process
            child.stdin.write(body);
            child.stdin.end();
        });
    }

    /**
     * Gets the full conversation for a specific pull request.
     * @param {number} prNumber - The number of the pull request.
     * @returns {Promise<object>} A promise that resolves to the conversation data or a structured error.
     */
    async getConversation(prNumber) {
        try {
            const {stdout} = await execAsync(`gh pr view ${prNumber} --json title,body,comments`);
            return JSON.parse(stdout);
        } catch (error) {
            logger.error(`Error getting conversation for PR #${prNumber}:`, error);
            return {
                error  : 'GitHub CLI command failed',
                message: `gh pr view ${prNumber} failed with exit code ${error.code}`,
                code   : 'GH_CLI_ERROR'
            };
        }
    }
}

export default Neo.setupClass(PullRequestService);
