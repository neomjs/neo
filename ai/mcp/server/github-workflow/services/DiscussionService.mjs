import aiConfig          from '../config.mjs';
import Base              from '../../../../../src/core/Base.mjs';
import GraphqlService    from './GraphqlService.mjs';
import RepositoryService from './RepositoryService.mjs';
import logger            from '../logger.mjs';
import {GET_REPO_AND_DISCUSSION_CATEGORIES, GET_DISCUSSION_ID} from './queries/discussionQueries.mjs';
import {CREATE_DISCUSSION, ADD_DISCUSSION_COMMENT, UPDATE_DISCUSSION_COMMENT} from './queries/mutations.mjs';

const AGENT_ICONS = {
    gemini : '✦',
    claude : '❋',
    gpt    : '●',
    default: '◆'
};

/**
 * @summary Service for interacting with GitHub Discussions via the GraphQL API.
 *
 * This service provides a high-level abstraction for managing GitHub discussions.
 * Capabilities include:
 * - Creating discussions inside specific categories (default 'Ideas')
 * - Managing discussion comments
 *
 * @class Neo.ai.mcp.server.github-workflow.services.DiscussionService
 * @extends Neo.core.Base
 * @singleton
 */
class DiscussionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.DiscussionService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.DiscussionService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String[]} writePermissions=['ADMIN', 'MAINTAIN', 'WRITE', 'READ']
         * @protected
         */
        writePermissions: ['ADMIN', 'MAINTAIN', 'WRITE', 'READ'] // Discussions are typically accessible across more roles, but keeping standard
    }

    /**
     * Creates a new GitHub Discussion.
     * @param {object} options          The options for creating the discussion.
     * @param {string} options.title    The title of the discussion.
     * @param {string} options.body     The Markdown body of the discussion.
     * @param {string} options.category The name of the category (e.g., 'Ideas', 'Q&A'). Defaults to 'Ideas'.
     * @returns {Promise<object>} A promise that resolves to the new discussion data.
     */
    async createDiscussion({title, body, category = 'Ideas'}) {
        logger.info(`Attempting to create GitHub Discussion: "${title}" in category "${category}"`);

        try {
            // First, get the repository ID and discussion categories
            const repoData = await GraphqlService.query(GET_REPO_AND_DISCUSSION_CATEGORIES, {
                owner: aiConfig.owner,
                repo: aiConfig.repo
            });

            const repositoryId = repoData.repository.id;
            const categories = repoData.repository.discussionCategories.nodes;

            // Find the ID for the requested category name
            const categoryNode = categories.find(cat => cat.name.toLowerCase() === category.toLowerCase());

            if (!categoryNode) {
                const available = categories.map(cat => cat.name).join(', ');
                return {
                    error  : 'Category Not Found',
                    message: `Discussion category '${category}' does not exist. Available categories: ${available}`,
                    code   : 'INVALID_CATEGORY'
                };
            }

            const categoryId = categoryNode.id;

            // Create the discussion
            const result = await GraphqlService.query(CREATE_DISCUSSION, {
                repositoryId,
                categoryId,
                title,
                body
            });

            const discussion = result.createDiscussion.discussion;

            logger.info(`Successfully created GitHub Discussion #${discussion.number}: ${discussion.url}`);
            
            return {
                discussionNumber: discussion.number,
                url: discussion.url,
                id: discussion.id
            };

        } catch (error) {
            logger.error('Error creating GitHub Discussion:', error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Extracts the agent type from the agent string for icon selection.
     * @param {string} agent The full agent identifier
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
     * Creates a comment on a specific discussion.
     * @param {object} options                      The options object
     * @param {number} options.discussion_number    The number of the discussion.
     * @param {string} options.body                 The raw content of the comment.
     * @param {string} options.agent                The identity of the calling agent.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async createComment({discussion_number, body, agent}) {
        // Agent Header Formatting
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
            // Get Discussion subjectId
            const idData = await GraphqlService.query(GET_DISCUSSION_ID, {
                owner : aiConfig.owner,
                repo  : aiConfig.repo,
                number: discussion_number
            });

            if (!idData.repository.discussion) {
                 return {
                    error  : 'Not Found',
                    message: `Could not find discussion #${discussion_number}.`,
                    code   : 'NOT_FOUND'
                };
            }

            const discussionId = idData.repository.discussion.id;

            // Use ADD_DISCUSSION_COMMENT mutation
            await GraphqlService.query(ADD_DISCUSSION_COMMENT, { discussionId, body: finalBody });
            return { message: `Successfully created comment on discussion #${discussion_number}` };

        } catch (error) {
            logger.error(`Error creating comment on discussion #${discussion_number} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Updates an existing comment on a discussion.
     * @param {string} comment_id The global node ID of the comment to update
     * @param {string} body       The new body content for the comment
     * @returns {Promise<object>} A promise that resolves to a success message or a structured error.
     */
    async updateComment(comment_id, body) {
        try {
            const result = await GraphqlService.query(UPDATE_DISCUSSION_COMMENT, {
                commentId: comment_id,
                body
            });

            return {
                message  : `Successfully updated discussion comment ${comment_id}`,
                commentId: result.updateDiscussionComment.comment.id,
                url      : result.updateDiscussionComment.comment.url,
                updatedAt: result.updateDiscussionComment.comment.updatedAt
            };
        } catch (error) {
            logger.error(`Error updating discussion comment ${comment_id} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Consolidates comment management into a single method.
     * @param {object} options                        The options object
     * @param {number} [options.discussion_number]    The number of the discussion (required for create).
     * @param {string} [options.comment_id]           The global node ID of the comment (required for update).
     * @param {string} options.body                   The content of the comment.
     * @param {string} [options.agent]                The identity of the calling agent (required for create).
     * @param {string} options.action                 The action to perform: 'create' or 'update'.
     * @returns {Promise<object>}
     */
    async manageDiscussionComment({discussion_number, comment_id, body, agent, action}) {
        if (!['create', 'update'].includes(action)) {
            return {
                error: 'Bad Request',
                message: "Invalid action. Must be 'create' or 'update'.",
                code: 'INVALID_ARGUMENTS'
            };
        }

        if (action === 'create') {
            if (!agent || !discussion_number) {
                return {
                    error: 'Bad Request',
                    message: "Missing required argument: 'agent' and 'discussion_number' are required for creating comments.",
                    code: 'MISSING_ARGUMENTS'
                };
            }
            return this.createComment({discussion_number, body, agent});
        } else {
            if (!comment_id) {
                return {
                    error: 'Bad Request',
                    message: "Missing required argument: 'comment_id' is required for updating comments.",
                    code: 'MISSING_ARGUMENTS'
                };
            }
            return this.updateComment(comment_id, body);
        }
    }
}

export default Neo.setupClass(DiscussionService);
