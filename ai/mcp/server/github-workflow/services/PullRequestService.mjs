import {exec}         from 'child_process';
import {promisify}    from 'util';
import Base           from '../../../../../src/core/Base.mjs';
import GraphqlService from './GraphqlService.mjs';
import aiConfig       from '../config.mjs';
import logger         from '../logger.mjs';
import {
    ADD_COMMENT,
    DEFAULT_QUERY_LIMITS,
    FETCH_PULL_REQUESTS,
    GET_CONVERSATION,
    GET_PULL_REQUEST_ID
} from './queries/pullRequestQueries.mjs';

const execAsync = promisify(exec);

/**
 * Service for interacting with GitHub Pull Requests via the `gh` CLI and GraphQL API.
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
        const {limit = aiConfig.pullRequest.defaults.limit, state = aiConfig.pullRequest.defaults.state} = options;

        const variables = {
            owner : aiConfig.owner,
            repo  : aiConfig.repo,
            limit,
            states: state.toUpperCase()
        };

        try {
            const data = await GraphqlService.query(FETCH_PULL_REQUESTS, variables);
            const pullRequests = data.repository.pullRequests.nodes;
            return {
                count: pullRequests.length,
                pullRequests
            };
        } catch (error) {
            logger.error('Error fetching pull requests via GraphQL:', error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
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
            return { result: stdout };
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
     * @param {string} body - The raw content of the comment, as the tool now handles formatting.
     * @param {string} [agent] - The identity of the calling agent (e.g., "Gemini 2.5 pro").
     * @returns {Promise<object>} A promise that resolves to a success message or a structured error.
     */
    async createComment(prNumber, body, agent) {
        const idVariables = {
            owner   : aiConfig.owner,
            repo    : aiConfig.repo,
            prNumber
        };

        let finalBody;

        if (agent) {
            const header = `Input from ${agent}:\n\n`;
            let icon = '';

            if (agent.toLowerCase().includes('gemini')) {
                icon = '✦ ';
            } else if (agent.toLowerCase().includes('claude')) {
                icon = '❋ ';
            }
            // The agent is expected to provide the body with any desired markdown (e.g., blockquotes).
            // The tool's only job is to add the header and icon prefix.
            finalBody = `${header}${icon}${body}`;
        } else {
            finalBody = body; // Fallback to raw body if no agent is specified
        }

        try {
            const idData    = await GraphqlService.query(GET_PULL_REQUEST_ID, idVariables);
            const subjectId = idData.repository.pullRequest.id;

            await GraphqlService.query(ADD_COMMENT, { subjectId, body: finalBody });
            return { message: `Successfully created comment on PR #${prNumber}` };

        } catch (error) {
            logger.error(`Error creating comment on PR #${prNumber} via GraphQL:`, error);
            return {
                error: 'GraphQL API request failed',
                message: error.message,
                code: 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Gets the full conversation for a specific pull request.
     * @param {number} prNumber - The number of the pull request.
     * @returns {Promise<object>} A promise that resolves to the conversation data or a structured error.
     */
    async getConversation(prNumber) {
        const variables = {
            owner      : aiConfig.owner,
            repo       : aiConfig.repo,
            prNumber,
            maxComments: DEFAULT_QUERY_LIMITS.maxComments
        };

        try {
            const data = await GraphqlService.query(GET_CONVERSATION, variables);
            return data.repository.pullRequest;
        } catch (error) {
            logger.error(`Error getting conversation for PR #${prNumber} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }
}

export default Neo.setupClass(PullRequestService);
