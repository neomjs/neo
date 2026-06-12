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
import {verifyDiscussionFrontmatter} from './verifyFrontmatterIntegrity.mjs';

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

            // Closed-post-latest-release: no release-version applies yet. Keep in active because
            // archive folders for vN.M.K are created at release cut by publish.mjs, never pre-staged.
            // `#getDiscussionPath` falls back to the active-flat path when archivePlan returns no entry,
            // matching IssueSyncer and PullRequestSyncer.
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
     * Containment gate: is this discussion on the sync denylist (by number or author)? A denylisted
     * discussion is excluded from emission/indexing and any previously-synced copy is quarantined,
     * so a known-contaminated artifact never reaches `resources/content/**` or downstream KB chunks.
     * The empty default denylist makes this a no-op.
     * @param {Object} discussion
     * @returns {Boolean}
     */
    #isDenylisted(discussion) {
        const denylist = issueSyncConfig.discussionDenylist || {};
        return (denylist.numbers || []).includes(discussion.number) ||
               (denylist.authors || []).includes(discussion.author?.login);
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

        // Delta cutoff. Mirror the PR/issue delta: the query orders UPDATED_AT DESC and we stop
        // paginating once a batch's oldest discussion predates the cached high-water mark. A
        // clean-slate run (lastSync === null) or an empty cache traverses the full history.
        const cachedDiscDates = Object.values(metadata.discussions || {})
            .map(d => Date.parse(d.updatedAt)).filter(t => !isNaN(t));
        const sinceCutoff = (metadata.lastSync == null || cachedDiscDates.length === 0)
            ? 0
            : cachedDiscDates.reduce((max, t) => t > max ? t : max, 0);

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

            // Stop once the oldest discussion in this UPDATED_AT-DESC batch predates the cutoff —
            // everything beyond is already current (re-processed in-window items no-op via content-hash).
            const oldestDisc = discussions.nodes[discussions.nodes.length - 1];
            if (Date.parse(oldestDisc.updatedAt) < sinceCutoff) break;

            hasNextPage = discussions.pageInfo.hasNextPage;
            cursor      = discussions.pageInfo.endCursor;
        }

        const stats = {
            count : 0,
            synced: []
        };

        const cachedDiscussions = metadata.discussions || {};

        // Containment: partition denylisted discussions out before bucket-planning + processing.
        // A denylisted artifact (by number or author) must never enter resources/content/** or
        // downstream KB chunks; any previously-synced copy is quarantined (removed). The empty
        // default denylist makes this loop a no-op.
        const deniedNumbers = new Set();
        for (const discussion of allDiscussions) {
            if (this.#isDenylisted(discussion)) {
                deniedNumbers.add(discussion.number);
                logger.warn(`🛡️ Discussion #${discussion.number} is denylisted (containment); excluding from sync.`);
                const cachedPath = cachedDiscussions[discussion.number]?.path;
                if (cachedPath) {
                    await fs.unlink(this.#resolvePath(cachedPath)).catch(() => {});
                    logger.warn(`🛡️ Quarantined previously-synced copy of denylisted discussion #${discussion.number}.`);
                }
            }
        }
        if (deniedNumbers.size > 0) {
            allDiscussions = allDiscussions.filter(discussion => !deniedNumbers.has(discussion.number));
        }

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
                    updatedAt  : discussion.updatedAt,
                    closed     : discussion.closed,
                    closedAt   : discussion.closedAt
                };

                let body = discussion.body || '';

                // Build comments structure
                if (discussion.comments && discussion.comments.nodes && discussion.comments.nodes.length > 0) {
                    body += '\n\n## Comments\n\n';
                    for (const comment of discussion.comments.nodes) {
                        body += `### \`@${comment.author?.login || 'unknown'}\` commented on ${comment.createdAt}\n\n`;
                        if (comment.isAnswer) {
                            body += '> [!ANSWER]\n\n';
                        }
                        body += `${comment.body}\n\n`;

                        // Parse replies if any
                        if (comment.replies && comment.replies.nodes && comment.replies.nodes.length > 0) {
                            for (const reply of comment.replies.nodes) {
                                body += `#### Reply depth=1 by \`@${reply.author?.login || 'unknown'}\` on ${reply.createdAt}\n\n`;
                                if (reply.isAnswer) {
                                    body += '> [!ANSWER]\n\n';
                                }
                                body += `${reply.body}\n\n`;
                            }
                        }
                        body += '---\n\n';
                    }
                }

                // Gray-matter serialization
                const content = matter.stringify(body, frontmatter);

                // Integrity gate: catches stale daemon code paths that silently drop frontmatter fields.
                // The per-discussion `try { ... } catch (e)` at the loop boundary catches the throw,
                // logs the warning, and skips the write, so broken-frontmatter files are never
                // persisted while the sync run continues with other discussions.
                const integrity = verifyDiscussionFrontmatter(content);
                if (!integrity.ok) {
                    throw new Error(`Discussion #${discussion.number} serialized content missing required frontmatter keys: ${integrity.missing.join(', ')}. ADR 0011 / #11573 contract violation — likely stale MCP daemon code path.`);
                }

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
                        logger.debug(`📦 Moved Discussion #${discussion.number}: ${oldAbsolutePath} → ${targetPath}`);
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
