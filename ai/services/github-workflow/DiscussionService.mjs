import aiConfig          from '../../mcp/server/github-workflow/config.mjs';
import Base              from '../../../src/core/Base.mjs';
import GraphqlService    from './GraphqlService.mjs';
import RepositoryService from './RepositoryService.mjs';
import logger            from '../../mcp/server/github-workflow/logger.mjs';
import {commentMatches, malformedCommentIdError, omitScopedBody, parseCommentId}
                                 from './shared/commentSelector.mjs';
import {projectConversationTrust}                                                                from './shared/conversationTrust.mjs';
import {GET_DISCUSSION_CONVERSATION, GET_REPO_AND_DISCUSSION_CATEGORIES, GET_DISCUSSION_ID}      from './queries/discussionQueries.mjs';
import {CREATE_DISCUSSION, ADD_DISCUSSION_COMMENT, UPDATE_DISCUSSION, UPDATE_DISCUSSION_COMMENT} from './queries/mutations.mjs';

/**
 * @summary Service for interacting with GitHub Discussions via the GraphQL API.
 *
 * This service provides a high-level abstraction for managing GitHub discussions.
 * Capabilities include:
 * - Creating discussions inside specific categories (default 'Ideas')
 * - Reading discussion conversations
 * - Managing discussion comments
 * - Updating discussion bodies
 *
 * @class Neo.ai.services.github-workflow.DiscussionService
 * @extends Neo.core.Base
 * @singleton
 */
class DiscussionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.DiscussionService'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.DiscussionService',
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
     * @summary Fetches a Discussion conversation with optional comment-selector narrowing.
     *
     * Discussion-side peer of the Issue/PR `get_conversation` selector contract.
     * Selectors are applied to top-level Discussion comments after the bounded GraphQL fetch:
     * `comment_id` > `since_comment_id` > `last_n` > full conversation.
     *
     * @param {Object} options
     * @param {Number} options.discussion_number    The Discussion number (required).
     * @param {String} [options.comment_id]         Return only the matching top-level comment. Accepts a node ID, numeric
     *     database id, `discussioncomment-N` anchor, or full comment URL; an unrecognised shape returns a
     *     `MALFORMED_COMMENT_ID` error, a well-formed but absent id returns empty comments.
     * @param {String} [options.since_comment_id]   Return top-level comments strictly after the matching comment. Same
     *     accepted spellings and same malformed-vs-absent distinction as `comment_id`.
     * @param {Number} [options.last_n]             Return only the last N top-level comments.
     * @returns {Promise<Object>} Discussion conversation data, optionally filtered, or a structured error. A SCOPED
     *          request (any selector) omits the parent body and sets `bodyOmitted: true`; an unscoped request is
     *          unchanged. Scoping asked for part of a thread and used to be charged for all of it.
     *          Payloads are trust-projected: authored nodes (incl. nested replies) carry `authorTrust`,
     *          untrusted-author bodies arrive defanged, and the root carries a `contentTrust` summary
     *          (see `shared/conversationTrust.mjs`).
     */
    async getConversation(options) {
        const {discussion_number, comment_id, since_comment_id, last_n} = options || {};

        if (!discussion_number) {
            return {
                error  : 'Bad Request',
                message: "Missing required argument: 'discussion_number' is required.",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        const variables = {
            owner           : aiConfig.owner,
            repo            : aiConfig.repo,
            discussionNumber: discussion_number,
            maxComments     : aiConfig.pullRequest.maxCommentsPerPullRequest,
            maxReplies      : aiConfig.pullRequest.maxCommentsPerPullRequest
        };

        try {
            const data = await GraphqlService.query(GET_DISCUSSION_CONVERSATION, variables);
            // Trust-project at the read boundary (root body + comments + nested replies gain
            // `authorTrust`; untrusted-author bodies are defanged; root carries `contentTrust`).
            // A null resource passes through the projection untouched, preserving the
            // not-found contract below.
            const discussion = projectConversationTrust(data.repository.discussion);

            if (!discussion) {
                return {
                    error  : 'Not Found',
                    message: `Could not find discussion #${discussion_number}.`,
                    code   : 'NOT_FOUND'
                };
            }

            const allComments = discussion.comments?.nodes || [];

            // Selector precedence mirrors IssueService/PullRequestService.
            let filtered;

            if (comment_id) {
                // The measured case: `discussioncomment-18022679` — the anchor a peer pastes —
                // matched nothing and returned an empty list with no error, so the caller re-read the
                // whole 26KB thread to discover the id was merely spelled differently.
                const selector = parseCommentId(comment_id);

                if (!selector) {
                    return malformedCommentIdError('comment_id', comment_id);
                }

                filtered = allComments.filter(comment => commentMatches(comment, selector));
            } else if (since_comment_id) {
                const selector = parseCommentId(since_comment_id);

                if (!selector) {
                    return malformedCommentIdError('since_comment_id', since_comment_id);
                }

                const anchorIdx = allComments.findIndex(comment => commentMatches(comment, selector));
                filtered = anchorIdx === -1 ? [] : allComments.slice(anchorIdx + 1);
            } else if (typeof last_n === 'number' && last_n > 0) {
                filtered = allComments.slice(-last_n);
            } else {
                return discussion;
            }

            // Discussions are where this costs most — a scoped fetch from a 26KB body paid the same
            // as reading the head, so the cheapest correct usage carried the most expensive payload.
            return omitScopedBody({
                ...discussion,
                comments: {
                    ...discussion.comments,
                    nodes: filtered
                }
            });
        } catch (error) {
            logger.error(`Error getting conversation for discussion #${discussion_number} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
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
                repo : aiConfig.repo
            });

            const repositoryId = repoData.repository.id;
            const categories   = repoData.repository.discussionCategories.nodes;

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
                url             : discussion.url,
                id              : discussion.id
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
     * Creates a comment on a specific discussion.
     * @param {object} options                      The options object
     * @param {number} options.discussion_number    The number of the discussion.
     * @param {string} options.body                 The raw content of the comment.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async createComment({discussion_number, body}) {
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
            const result  = await GraphqlService.query(ADD_DISCUSSION_COMMENT, { discussionId, body });
            const comment = result.addDiscussionComment.comment;

            return {
                message  : `Successfully created comment on discussion #${discussion_number}`,
                commentId: comment.id,
                url      : comment.url,
                createdAt: comment.createdAt
            };

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
     * @param {string} options.action                 The action to perform: 'create' or 'update'.
     * @returns {Promise<object>}
     */
    async manageDiscussionComment({discussion_number, comment_id, body, action}) {
        if (!['create', 'update'].includes(action)) {
            return {
                error  : 'Bad Request',
                message: "Invalid action. Must be 'create' or 'update'.",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        if (action === 'create') {
            if (!discussion_number) {
                return {
                    error  : 'Bad Request',
                    message: "Missing required argument: 'discussion_number' is required for creating comments.",
                    code   : 'MISSING_ARGUMENTS'
                };
            }
            return this.createComment({discussion_number, body});
        } else {
            if (!comment_id) {
                return {
                    error  : 'Bad Request',
                    message: "Missing required argument: 'comment_id' is required for updating comments.",
                    code   : 'MISSING_ARGUMENTS'
                };
            }
            return this.updateComment(comment_id, body);
        }
    }

    /**
     * Manages discussion-level operations. Currently supports updating the discussion body,
     * enabling post-publication corrections without accumulating correction comments.
     * @param {object} options                    The options object
     * @param {string} options.action             The action to perform: 'update_body'.
     * @param {number} options.discussion_number  The number of the discussion to update.
     * @param {string} options.body               The new Markdown body for the discussion.
     * @returns {Promise<object>} A promise that resolves to {discussionId, url, updatedAt} or a structured error.
     */
    async manageDiscussion({action, discussion_number, body}) {
        if (action !== 'update_body') {
            return {
                error  : 'Bad Request',
                message: "Invalid action. Must be 'update_body'.",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        if (!discussion_number || !body) {
            return {
                error  : 'Bad Request',
                message: "Missing required argument: 'discussion_number' and 'body' are required for updating a discussion body.",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        try {
            // Resolve the discussion number to its global node ID
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
            const result       = await GraphqlService.query(UPDATE_DISCUSSION, {discussionId, body});
            const discussion   = result.updateDiscussion.discussion;

            logger.info(`Successfully updated body of GitHub Discussion #${discussion_number}: ${discussion.url}`);

            return {
                discussionId: discussion.id,
                url         : discussion.url,
                updatedAt   : discussion.updatedAt
            };
        } catch (error) {
            logger.error(`Error updating discussion #${discussion_number} body via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }
}

export default Neo.setupClass(DiscussionService);
