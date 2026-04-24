import {exec}                                  from 'child_process';
import {promisify}                             from 'util';
import Base                                    from '../../../../../src/core/Base.mjs';
import GraphqlService                          from './GraphqlService.mjs';
import aiConfig                                from '../config.mjs';
import logger                                  from '../logger.mjs';
import {FETCH_PULL_REQUESTS, GET_CONVERSATION} from './queries/pullRequestQueries.mjs';

const execAsync = promisify(exec);

/**
 * @summary Service for interacting with GitHub Pull Requests via the `gh` CLI and GraphQL API.
 *
 * This service acts as a unified interface for Pull Request operations.
 * It combines the `gh` CLI (for operations like `checkout` and `diff`) with
 * the GraphQL API (for metadata retrieval, listing, and conversation history)
 * to provide a comprehensive toolset for managing PRs.
 *
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
     * Checks out a specific pull request locally.
     * @param {number} prNumber The number of the pull request to check out
     * @returns {Promise<object>} A promise that resolves to a success message or a structured error.
     */
    async checkoutPullRequest(prNumber) {
        try {
            const {stdout} = await execAsync(`gh pr checkout ${prNumber}`, {cwd: aiConfig.projectRoot});
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
     * Gets the conversation for a specific pull request, optionally filtered by comment
     * selector to reduce context-fetch cost across review cycles (#10272 §2.2).
     *
     * **Default behavior (no selectors):** returns full conversation — backward compatible
     * with the pre-#10272 shape that callers depend on.
     *
     * **Selectors (first-match precedence, pick at most one):**
     * - `comment_id` — fetch ONLY the comment whose GitHub node ID matches. Used for A2A
     *   hand-off: a reviewer posts a comment, mailboxes the `commentId` from the create-path
     *   return shape to the peer, peer fetches just-this-comment for near-zero context cost.
     * - `since_comment_id` — fetch all comments AFTER the one with the given ID (exclusive).
     *   Used for incremental review cycles: agent tracks the last seen commentId and fetches
     *   only what's new. Scales linearly with new-comment volume, not cumulative thread size.
     * - `last_n` — fetch the last N comments. Coarse-grained alternative when comment IDs
     *   aren't tracked. Useful for quick catch-up scans.
     *
     * Selectors are applied client-side after a single GraphQL fetch (the fetch itself already
     * caps at `aiConfig.pullRequest.maxCommentsPerPullRequest`). Server-side pagination
     * optimization is a follow-up concern if empirical volume demands it; for current
     * conversation sizes (up to a few dozen comments) client-side filter is simpler and
     * avoids multi-query cursor choreography.
     *
     * @param {Object|number} options Either a number (legacy `prNumber` positional form, retained for
     *                                backward compat) or an object with the shape below.
     * @param {number}        options.pr_number         The pull request number (required when object form).
     * @param {string}        [options.comment_id]      Return only the matching comment's data; other
     *                                                  comments elided. PR title/body still returned.
     * @param {string}        [options.since_comment_id] Return comments strictly after the matching
     *                                                  comment (by createdAt order). If the id isn't found,
     *                                                  returns empty comments (callers can interpret as
     *                                                  "nothing new" or "id invalid").
     * @param {number}        [options.last_n]          Return only the last N comments (by createdAt order).
     * @returns {Promise<object>} Conversation data (optionally filtered) or a structured error.
     */
    async getConversation(options) {
        // Accept legacy positional `prNumber` form for backward compatibility with any
        // caller predating #10272. New callers use the object form for filter support.
        const {pr_number, comment_id, since_comment_id, last_n} = typeof options === 'number'
            ? {pr_number: options}
            : (options || {});

        if (!pr_number) {
            return {
                error  : 'Bad Request',
                message: "Missing required argument: 'pr_number' is required.",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        const variables = {
            owner      : aiConfig.owner,
            repo       : aiConfig.repo,
            prNumber   : pr_number,
            maxComments: aiConfig.pullRequest.maxCommentsPerPullRequest
        };

        try {
            const data         = await GraphqlService.query(GET_CONVERSATION, variables);
            const pullRequest  = data.repository.pullRequest;
            const allComments  = pullRequest.comments?.nodes || [];

            // Selector precedence: comment_id > since_comment_id > last_n > full.
            let filtered;

            if (comment_id) {
                filtered = allComments.filter(c => c.id === comment_id);
            } else if (since_comment_id) {
                const anchorIdx = allComments.findIndex(c => c.id === since_comment_id);
                // Anchor not found → empty result set (callers interpret as "nothing after" or
                // "invalid id"). Trying to infer intent would hide bugs.
                filtered = anchorIdx === -1 ? [] : allComments.slice(anchorIdx + 1);
            } else if (typeof last_n === 'number' && last_n > 0) {
                filtered = allComments.slice(-last_n);
            } else {
                // No selector — return full conversation shape unchanged (backward compat).
                return pullRequest;
            }

            // Filtered paths preserve PR title/body/author; only comments are narrowed.
            // Caller can detect filtering via comments.length vs unfiltered fetch.
            return {
                ...pullRequest,
                comments: {
                    ...pullRequest.comments,
                    nodes: filtered
                }
            };
        } catch (error) {
            logger.error(`Error getting conversation for PR #${pr_number} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Gets the diff for a specific pull request.
     * @param {number} prNumber The number of the pull request
     * @returns {Promise<string|object>} A promise that resolves to the diff text or a structured error.
     */
    async getPullRequestDiff(prNumber) {
        try {
            const {stdout} = await execAsync(`gh pr diff ${prNumber}`, {cwd: aiConfig.projectRoot});
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
     * Fetches a list of pull requests from GitHub.
     * @param {object} [options]                                           The options for listing pull requests
     * @param {number} [options.limit=aiConfig.pullRequest.defaults.limit] The maximum number of PRs to return
     * @param {string} [options.state=aiConfig.pullRequest.defaults.state] The state of the pull requests to list (open, closed, merged, all)
     * @returns {Promise<object>} A promise that resolves to the list of pull requests or a structured error.
     */
    async listPullRequests({limit=aiConfig.pullRequest.defaults.limit, state=aiConfig.pullRequest.defaults.state} = {}) {

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
}

export default Neo.setupClass(PullRequestService);
