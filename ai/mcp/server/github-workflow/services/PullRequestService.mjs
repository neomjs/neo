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
    GET_PULL_REQUEST_ID,
    UPDATE_COMMENT
} from './queries/pullRequestQueries.mjs';

const execAsync = promisify(exec);

const AGENT_ICONS = {
    gemini : '✦',
    claude : '❋',
    gpt    : '●',
    default: '◆'
};

/**
 * Service for interacting with GitHub Pull Requests via the `gh` CLI and GraphQL API.
 * @class Neo.ai.mcp.server.github-workflow.services.PullRequestService
 * @extends Neo.core.Base
 * @singleton
 */
class PullRequestService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.PullRequestService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.PullRequestService',
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
     * Extracts the agent type from the agent string for icon selection.
     * @param {string} agent - The full agent identifier (e.g., "Gemini 2.5 Pro", "Claude Sonnet 4.5", "Chat GPT 4")
     * @returns {string} The agent type key for AGENT_ICONS lookup
     */
    getAgentType(agent) {
        const agentLower = agent.toLowerCase();

        if (agentLower.includes('gemini')) return 'gemini';
        if (agentLower.includes('claude')) return 'claude';
        if (agentLower.includes('gpt'))    return 'gpt';

        return 'default';
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
     * @param {string} body     - The raw content of the comment. The agent should provide
     *                            any desired markdown formatting (e.g., blockquotes, code blocks).
     *                            This tool will only add the agent header and icon prefix.
     * @param {string} agent    - The identity of the calling agent (e.g., "Gemini 2.5 Pro", "Claude Sonnet 4.5").
     *                            Adds a formatted header with the appropriate icon.
     * @returns {Promise<object>} A promise that resolves to a success message or a structured error.
     */
    async createComment(prNumber, body, agent) {
        const idVariables = {
            owner   : aiConfig.owner,
            repo    : aiConfig.repo,
            prNumber
        };

        const header       = `**Input from ${agent}:**\n\n`;
        const agentIcon    = AGENT_ICONS[this.getAgentType(agent)];
        const headingMatch = body.match(/^(#+\s*)(.*)$/);
        let processedBody;

        if (headingMatch) {
            const headingMarkers = headingMatch[1];
            const headingContent = headingMatch[2];
            processedBody = `${headingMarkers}${agentIcon} ${headingContent}\n${body.substring(headingMatch[0].length)}`;
        } else {
            processedBody = `${agentIcon} ${body}`;
        }

        const finalBody = `${header}${processedBody.split('\n').map(line => `> ${line}`).join('\n')}`;

        try {
            const idData    = await GraphqlService.query(GET_PULL_REQUEST_ID, idVariables);
            const subjectId = idData.repository.pullRequest.id;

            await GraphqlService.query(ADD_COMMENT, { subjectId, body: finalBody });
            return { message: `Successfully created comment on PR #${prNumber}` };

        } catch (error) {
            logger.error(`Error creating comment on PR #${prNumber} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
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

    /**
     * Updates an existing comment on a pull request or issue.
     * @param {string} comment_id - The global node ID of the comment to update.
     * @param {string} body       - The new body content for the comment.
     * @returns {Promise<object>} A promise that resolves to a success message or a structured error.
     */
    async updateComment(comment_id, body) {
        try {
            const result = await GraphqlService.query(UPDATE_COMMENT, {
                commentId: comment_id,
                body
            });

            return {
                message  : `Successfully updated comment ${comment_id}`,
                commentId: result.updateIssueComment.issueComment.id,
                url      : result.updateIssueComment.issueComment.url,
                updatedAt: result.updateIssueComment.issueComment.updatedAt
            };
        } catch (error) {
            logger.error(`Error updating comment ${comment_id} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }
}

export default Neo.setupClass(PullRequestService);
