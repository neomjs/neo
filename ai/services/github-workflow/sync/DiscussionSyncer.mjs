import aiConfig                   from '../../../mcp/server/github-workflow/config.mjs';
import Base                       from '../../../../src/core/Base.mjs';
import crypto                     from 'crypto';
import fs                         from 'fs/promises';
import logger                     from '../../../mcp/server/github-workflow/logger.mjs';
import matter                     from 'gray-matter';
import path                       from 'path';
import GraphqlService             from '../GraphqlService.mjs';
import {FETCH_DISCUSSIONS_FOR_SYNC} from '../queries/discussionQueries.mjs';

const issueSyncConfig = aiConfig.issueSync;

/**
 * @summary Handles the fetching and local synchronization of GitHub Discussions.
 *
 * This service is responsible for:
 * - Fetching discussions from GitHub via GraphQL.
 * - Generating and updating local Markdown files for each discussion.
 * - Supporting offline context mapping.
 *
 * @class Neo.ai.services.github-workflow.sync.DiscussionSyncer
 * @extends Neo.core.Base
 * @singleton
 */
class DiscussionSyncer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.sync.DiscussionSyncer'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.sync.DiscussionSyncer',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Calculates a SHA-256 hash of the given content for change detection.
     * @param {string} content The content to hash.
     * @returns {string} The hex-encoded hash.
     * @private
     */
    #calculateContentHash(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Resolves a path to an absolute path against the project root.
     * @param {string} p The path to resolve.
     * @returns {string|null} The absolute path.
     * @private
     */
    #resolvePath(p) {
        if (!p) return null;
        if (path.isAbsolute(p)) return p;
        return path.resolve(aiConfig.projectRoot, p);
    }

    /**
     * Converts an absolute path to a path relative to the project root.
     * @param {string} p The absolute path.
     * @returns {string|null} The relative path.
     * @private
     */
    #relativePath(p) {
        if (!p) return null;
        return path.relative(aiConfig.projectRoot, p);
    }

    /**
     * Determines the correct local file path for a given discussion.
     * @param {object} discussion The GitHub discussion object.
     * @returns {string} The absolute file path for the discussion's Markdown file.
     * @private
     */
    #getDiscussionPath(discussion) {
        const filename = `${issueSyncConfig.discussionFilenamePrefix}${discussion.number}.md`;
        const chunkDir = Math.floor(discussion.number / 100) + 'xx';

        return path.join(issueSyncConfig.discussionsDir, chunkDir, filename);
    }

    /**
     * Fetches discussions from GitHub and syncs them to local markdown.
     * @param {object} metadata The sync metadata containing cached records.
     * @returns {Promise<object>} Statistics about the operation.
     */
    async syncDiscussions(metadata) {
        logger.info('💭 Fetching discussions from GitHub via GraphQL...');

        let allDiscussions = [];
        let hasNextPage    = true;
        let cursor         = null;

        // Ensure directory exists
        await fs.mkdir(issueSyncConfig.discussionsDir, { recursive: true });

        while (hasNextPage) {
            const data = await GraphqlService.query(FETCH_DISCUSSIONS_FOR_SYNC, {
                owner: aiConfig.owner,
                repo : aiConfig.repo,
                limit: 50,
                cursor,
                maxComments: 50,
                maxReplies : 20
            });

            const discussions = data.repository.discussions;

            if (discussions.nodes.length === 0) {
                break;
            }

            allDiscussions.push(...discussions.nodes);

            hasNextPage = discussions.pageInfo.hasNextPage;
            cursor      = discussions.pageInfo.endCursor;
            
            // To prevent massive queries, limit to say a max amount for safety.
            if (allDiscussions.length >= 200) {
                break;
            }
        }

        const stats = {
            count : 0,
            synced: []
        };

        const cachedDiscussions = metadata.discussions || {};

        for (const discussion of allDiscussions) {
            try {
                const targetPath  = this.#getDiscussionPath(discussion);

                const frontmatter = {
                    number     : discussion.number,
                    title      : discussion.title,
                    author     : discussion.author?.login || 'unknown',
                    category   : discussion.category?.name || 'Uncategorized',
                    createdAt  : discussion.createdAt,
                    updatedAt  : discussion.updatedAt
                };

                let body = discussion.body || '';

                // Build comments structure
                if (discussion.comments && discussion.comments.nodes && discussion.comments.nodes.length > 0) {
                    body += '\n\n## Comments\n\n';
                    for (const comment of discussion.comments.nodes) {
                        body += `### \`@${comment.author?.login || 'unknown'}\` commented on ${comment.createdAt}\n\n${comment.body}\n\n`;
                        
                        // Parse replies if any
                        if (comment.replies && comment.replies.nodes && comment.replies.nodes.length > 0) {
                            for (const reply of comment.replies.nodes) {
                                body += `> **Reply by \`@${reply.author?.login || 'unknown'}\`** on ${reply.createdAt}\n>\n`;
                                const blockquotedReply = reply.body.split('\n').map(l => `> ${l}`).join('\n');
                                body += `${blockquotedReply}\n\n`;
                            }
                        }
                        body += '---\n\n';
                    }
                }

                // Gray-matter serialization
                const content = matter.stringify(body, frontmatter);
                const currentHash = this.#calculateContentHash(content);

                const cachedDiscussion = cachedDiscussions[discussion.number];
                const oldPathRelative = cachedDiscussion?.path;
                const oldAbsolutePath = oldPathRelative ? this.#resolvePath(oldPathRelative) : null;

                const needsUpdate = !cachedDiscussion ||
                    oldAbsolutePath !== targetPath;

                // Diff cache
                if (!needsUpdate && cachedDiscussion && cachedDiscussion.contentHash === currentHash) {
                    logger.debug(`Skipping discussion #${discussion.number}, content unchanged.`);
                    
                    // We must still transfer the hash and path to the new run's metadata to persist it
                    discussion.contentHash = currentHash;
                    discussion.relativeOutputPath = oldPathRelative;
                    continue;
                }

                await fs.mkdir(path.dirname(targetPath), { recursive: true });
                await fs.writeFile(targetPath, content, 'utf-8');
                
                if (oldAbsolutePath && oldAbsolutePath !== targetPath) {
                    try {
                        await fs.unlink(oldAbsolutePath);
                        logger.info(`📦 Moved Discussion #${discussion.number}: ${oldAbsolutePath} → ${targetPath}`);
                    } catch (e) {
                        // File might not exist
                    }
                }

                logger.debug(`✅ Synced discussion #${discussion.number}`);
                
                discussion.contentHash = currentHash;
                discussion.relativeOutputPath = this.#relativePath(targetPath);

                stats.count++;
                stats.synced.push(discussion.number);
            } catch (e) {
                logger.warn(`⚠️ Could not sync discussion #${discussion.number}: ${e.message}`);
            }
        }
        
        // Cache for the main orchestrator to merge
        metadata.discussions = {};
        allDiscussions.forEach(d => {
            metadata.discussions[d.number] = {
                number: d.number,
                contentHash: d.contentHash,
                path: d.relativeOutputPath
            };
        });

        if (stats.count > 0) {
            logger.info(`✨ Interacted and synced ${stats.count} modified discussions to disk.`);
        } else {
            logger.info(`✅ Synced 0 discussions (all up to date).`);
        }

        return stats;
    }
}

export default Neo.setupClass(DiscussionSyncer);
