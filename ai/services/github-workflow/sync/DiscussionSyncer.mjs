import aiConfig                   from '../../../mcp/server/github-workflow/config.mjs';
import Base                       from '../../../../src/core/Base.mjs';
import crypto                     from 'crypto';
import fs                         from 'fs/promises';
import logger                     from '../../../mcp/server/github-workflow/logger.mjs';
import matter                     from 'gray-matter';
import path                       from 'path';
import GraphqlService             from '../GraphqlService.mjs';
import ReleaseNotesSyncer         from './ReleaseNotesSyncer.mjs';
import {FETCH_DISCUSSIONS_FOR_SYNC} from '../queries/discussionQueries.mjs';
import contentPath                  from '../shared/contentPath.mjs';
import {
    createContentIndexEntry,
    updateContentIndex
} from '../shared/contentIndex.mjs';

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
     * @summary Pre-computes bucket counts and indices for all discussions based on historical releases.
     * @param {Object} metadata The sync metadata.
     * @param {Array} fetchedDiscussions The delta discussions fetched from GitHub.
     * @returns {Map<number, {version: string|null, itemCount: number, itemIndex: number}>}
     * @private
     */
    #planBuckets(metadata, fetchedDiscussions = []) {
        const combined = new Map();

        for (const [idStr, discussion] of Object.entries(metadata.discussions || {})) {
            combined.set(parseInt(idStr, 10), {
                number: parseInt(idStr, 10),
                closed: discussion.closed,
                closedAt: discussion.closedAt
            });
        }

        for (const discussion of fetchedDiscussions) {
            combined.set(discussion.number, {
                number: discussion.number,
                closed: discussion.closed,
                closedAt: discussion.closedAt
            });
        }

        const buckets = new Map();
        const activeItems = [];

        for (const discussion of combined.values()) {
            let version = null;
            if (discussion.closedAt) {
                const closed = new Date(discussion.closedAt);
                const release = (ReleaseNotesSyncer.sortedReleases || []).find(r => new Date(r.publishedAt) > closed);
                if (release) {
                    version = release.tagName.startsWith(issueSyncConfig.versionDirectoryPrefix)
                        ? release.tagName
                        : issueSyncConfig.versionDirectoryPrefix + release.tagName;
                }
            }

            // Closed-post-latest-release: no release-version applies. Keep in active per Epic
            // #11187 Phase 6 mental model — archive folders for vN.M.K are created at release-cut
            // by publish.mjs, never pre-staged. The previous `'legacy'` fallback created the
            // architectural bug fixed by #11360. #getDiscussionPath falls back to active-flat path
            // when archivePlan returns no entry (was previously returning null; now consistent
            // with IssueSyncer/PullRequestSyncer).
            if (!discussion.closed || !version) {
                activeItems.push(discussion.number);
                continue;
            }

            if (!buckets.has(version)) {
                buckets.set(version, []);
            }
            buckets.get(version).push(discussion.number);
        }

        const plans = new Map();

        activeItems.sort((a, b) => a - b);
        const activeItemCount = activeItems.length;
        activeItems.forEach((id, index) => {
            plans.set(id, {
                version  : null,
                itemCount: activeItemCount,
                itemIndex: index
            });
        });

        for (const [bucketName, items] of buckets.entries()) {
            items.sort((a, b) => a - b);

            items.forEach((id, index) => {
                plans.set(id, {
                    version  : bucketName,
                    itemCount: items.length,
                    itemIndex: index
                });
            });
        }

        return plans;
    }

    /**
     * Determines the correct local file path for a given discussion.
     * @param {object} discussion The GitHub discussion object.
     * @param {Map} planBuckets The precomputed bucket plan.
     * @returns {string} The absolute file path for the discussion's Markdown file.
     * @private
     */
    #getDiscussionPath(discussion, planBuckets) {
        const filename = `${issueSyncConfig.discussionFilenamePrefix}${discussion.number}.md`;
        const contentRoot = issueSyncConfig.contentRoot;
        const plan = planBuckets.get(discussion.number);

        const config = {
            contentRoot,
            type         : 'discussions',
            filename,
            itemIndex    : plan?.itemIndex || 0,
            itemsPerChunk: issueSyncConfig.archiveChunkThreshold,
            chunkPrefix  : issueSyncConfig.archiveChunkPrefix
        };

        if (plan?.version) {
            config.version = plan.version;
        }

        return contentPath(config);
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
        }

        const stats = {
            count : 0,
            synced: []
        };

        const cachedDiscussions = metadata.discussions || {};
        const planBuckets = this.#planBuckets(metadata, allDiscussions);

        for (const discussion of allDiscussions) {
            try {
                const targetPath  = this.#getDiscussionPath(discussion, planBuckets);
                if (!targetPath) continue;

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
        const indexEntries = [];

        allDiscussions.forEach(d => {
            metadata.discussions[d.number] = {
                number: d.number,
                closed: d.closed,
                closedAt: d.closedAt,
                contentHash: d.contentHash,
                path: d.relativeOutputPath
            };

            const plan = planBuckets.get(d.number);

            indexEntries.push(createContentIndexEntry({
                issueSyncConfig,
                type: 'discussions',
                id: d.number,
                filePath: path.resolve(aiConfig.projectRoot, d.relativeOutputPath),
                itemIndex: plan ? plan.itemIndex : 0,
                version: plan?.version || null,
                bucket: null
            }));
        });

        try {
            await updateContentIndex(issueSyncConfig, {upsert: indexEntries});
        } catch (e) {
            logger.warn(`⚠️ Could not update _index.json for discussions: ${e.message}`);
        }

        if (stats.count > 0) {
            logger.info(`✨ Interacted and synced ${stats.count} modified discussions to disk.`);
        } else {
            logger.info(`✅ Synced 0 discussions (all up to date).`);
        }

        return stats;
    }
}

export default Neo.setupClass(DiscussionSyncer);
