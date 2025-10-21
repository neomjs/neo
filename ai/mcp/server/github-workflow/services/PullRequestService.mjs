import {exec}      from 'child_process';
import {promisify} from 'util';
import Base        from '../../../../../src/core/Base.mjs';
import GraphqlService from './GraphqlService.mjs';
import aiConfig from '../../config.mjs';
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

        const query = `
            query ListPullRequests($owner: String!, $repo: String!, $limit: Int!, $states: [PullRequestState!]) {
                repository(owner: $owner, name: $repo) {
                    pullRequests(first: $limit, states: $states, orderBy: {field: CREATED_AT, direction: DESC}) {
                        nodes {
                            number
                            title
                            author {
                                login
                            }
                            url
                            state
                            createdAt
                        }
                    }
                }
            }
        `;

        const variables = {
            owner : aiConfig.githubWorkflow.owner,
            repo  : aiConfig.githubWorkflow.repo,
            limit,
            states: state.toUpperCase()
        };

        try {
            const data = await GraphqlService.query(query, variables);
            const pullRequests = data.repository.pullRequests.nodes;
            return {
                count: pullRequests.length,
                pullRequests: pullRequests
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
        const idQuery = `
            query GetPullRequestId($owner: String!, $repo: String!, $prNumber: Int!) {
                repository(owner: $owner, name: $repo) {
                    pullRequest(number: $prNumber) {
                        id
                    }
                }
            }
        `;

        const idVariables = {
            owner   : aiConfig.githubWorkflow.owner,
            repo    : aiConfig.githubWorkflow.repo,
            prNumber: prNumber
        };

        try {
            const idData = await GraphqlService.query(idQuery, idVariables);
            const subjectId = idData.repository.pullRequest.id;

            const mutation = `
                mutation AddComment($subjectId: ID!, $body: String!) {
                    addComment(input: {subjectId: $subjectId, body: $body}) {
                        clientMutationId
                    }
                }
            `;

            await GraphqlService.query(mutation, { subjectId, body });
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
        const query = `
            query GetPullRequestConversation($owner: String!, $repo: String!, $prNumber: Int!) {
                repository(owner: $owner, name: $repo) {
                    pullRequest(number: $prNumber) {
                        title
                        body
                        comments(first: 100) { # Assuming max 100 comments
                            nodes {
                                author {
                                    login
                                }
                                body
                                createdAt
                            }
                        }
                    }
                }
            }
        `;

        const variables = {
            owner   : aiConfig.githubWorkflow.owner,
            repo    : aiConfig.githubWorkflow.repo,
            prNumber: prNumber
        };

        try {
            const data = await GraphqlService.query(query, variables);
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
