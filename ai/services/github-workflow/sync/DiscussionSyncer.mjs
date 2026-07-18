import aiConfig                                                       from '../../../mcp/server/github-workflow/config.mjs';
import Base                                                           from '../../../../src/core/Base.mjs';
import crypto                                                         from 'crypto';
import fs                                                             from 'fs/promises';
import logger                                                         from '../../../mcp/server/github-workflow/logger.mjs';
import matter                                                         from 'gray-matter';
import path                                                           from 'path';
import GraphqlService                                                 from '../GraphqlService.mjs';
import ReleaseNotesSyncer                                             from './ReleaseNotesSyncer.mjs';
import {FETCH_DISCUSSIONS_FOR_SYNC, FETCH_SINGLE_DISCUSSION_FOR_SYNC} from '../queries/discussionQueries.mjs';
import contentPath                                                    from '../shared/contentPath.mjs';
import {buildContentInventory}                                        from '../shared/contentInventory.mjs';
import {
    createContentIndexEntry,
    updateContentIndex
} from '../shared/contentIndex.mjs';
import {createContentTrustSummary, projectAuthoredNodeTrust} from '../shared/conversationTrust.mjs';
import {classifyDiscussionRoutingDisposition}                from '../shared/discussionRoutingDisposition.mjs';
import pruneEmptyDirs                                        from '../shared/pruneEmptyDirs.mjs';
import {verifyDiscussionFrontmatter}                         from './verifyFrontmatterIntegrity.mjs';

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
     * @summary Projects one GitHub-authored discussion sync node through content trust policy.
     * @param {Object} node GitHub authored node carrying optional `author.login` and `body`.
     * @param {Object} summary Machine-readable content-trust summary accumulator.
     * @param {String} signalPath Stable path label for sanitizer signal metadata.
     * @returns {Object} Projected node with sanitized body for untrusted authors.
     * @private
     */
    #projectAuthoredNode(node, summary, signalPath) {
        return projectAuthoredNodeTrust(node, {
            summary,
            path               : signalPath,
            productNameDenylist: issueSyncConfig.productNameDenylist || []
        }).node;
    }

    /**
     * @summary Pre-computes bucket counts and indices for all discussions based on historical releases.
     * @param {Object} metadata The sync metadata.
     * @param {Array} fetchedDiscussions The delta discussions fetched from GitHub.
     * @returns {Map<number, {version: string|null, itemCount: number, itemIndex: number}>}
     * @private
     */
    #planBuckets(metadata, fetchedDiscussions = [], inventory = null) {
        const combined = new Map();

        for (const [idStr, discussion] of Object.entries(metadata.discussions || {})) {
            combined.set(parseInt(idStr, 10), {
                number  : parseInt(idStr, 10),
                closed  : discussion.closed,
                closedAt: discussion.closedAt
            });
        }

        for (const discussion of fetchedDiscussions) {
            combined.set(discussion.number, {
                number  : discussion.number,
                closed  : discussion.closed,
                closedAt: discussion.closedAt
            });
        }

        const buckets     = new Map();
        const activeItems = [];

        for (const discussion of combined.values()) {
            let version = null;
            if (discussion.closedAt) {
                const closed  = new Date(discussion.closedAt);
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

        // Seed marooned on-disk ids AFTER classification — membership is inherited from the corpus only
        // for ids this run has no live opinion about (the whole marooned backlog), so `itemIndex` is
        // computed over COMPLETE membership, not the metadata+delta fraction that misplaces them. BOTH
        // tiers: an active file is a member of the active collection exactly as an archived file is a
        // member of its bucket; both ordinals are defined over complete membership.
        if (inventory) {
            const classified = new Set(activeItems);

            for (const items of buckets.values()) {
                for (const id of items) classified.add(id);
            }

            for (const [id, copies] of inventory) {
                if (classified.has(id)) continue;

                const archived = copies.find(copy => copy.version);

                if (archived) {
                    if (!buckets.has(archived.version)) buckets.set(archived.version, []);
                    buckets.get(archived.version).push(id);
                } else {
                    activeItems.push(id)
                }
            }
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
        const filename    = `${issueSyncConfig.discussionFilenamePrefix}${discussion.number}.md`;
        const contentRoot = issueSyncConfig.contentRoot;
        const plan        = planBuckets.get(discussion.number);

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
     * Containment gate: is this fetched discussion on the sync denylist (by number or author)?
     * Denylisted fetched discussions are excluded from emission/indexing. Quarantine of an
     * already-synced copy is driven separately in `syncDiscussions`: by `number` it removes cached
     * copies (file + content-index entry) even when GitHub no longer lists them (the hidden /
     * spam-hammered case); `author` matching is fetch-time only, since `metadata.discussions`
     * persists `number` but not author login. The empty default denylist makes this a no-op.
     * @param {Object} discussion
     * @returns {Boolean}
     */
    #isDenylisted(discussion) {
        const denylist = issueSyncConfig.discussionDenylist || {};
        return (denylist.numbers || []).includes(discussion.number) ||
               (denylist.authors || []).includes(discussion.author?.login);
    }

    /**
     * @summary Renders a fetched discussion node to its synced Markdown (frontmatter + body + comments +
     * nested replies), applying the content-trust sanitizer + the frontmatter integrity gate.
     * Extracted from {@link #syncDiscussions} so the single-discussion force-refetch path renders
     * identically (no bulk-sync-vs-refetch drift).
     * @param {Object} discussion The discussion node (with `comments.nodes[].replies.nodes`).
     * @returns {String} The gray-matter-serialized Markdown content.
     * @throws {Error} When the serialized content is missing required frontmatter keys (a frontmatter-contract violation — likely a stale daemon code path).
     */
    #renderDiscussionMarkdown(discussion) {
        const contentTrust        = createContentTrustSummary();
        const projectedDiscussion = this.#projectAuthoredNode(discussion, contentTrust, 'body');
        const routingDisposition  = classifyDiscussionRoutingDisposition({
            author     : discussion.author?.login,
            authorTrust: projectedDiscussion.authorTrust,
            body       : projectedDiscussion.body,
            closed     : discussion.closed
        });

        const frontmatter = {
            number                         : discussion.number,
            title                          : discussion.title,
            author                         : discussion.author?.login || 'unknown',
            category                       : discussion.category?.name || 'Uncategorized',
            createdAt                      : discussion.createdAt,
            updatedAt                      : discussion.updatedAt,
            closed                         : discussion.closed,
            closedAt                       : discussion.closedAt,
            routingDispositionSchemaVersion: routingDisposition.schemaVersion,
            routingDisposition             : routingDisposition.disposition,
            routingDispositionReason       : routingDisposition.reasonCode,
            routingDispositionEvidence     : routingDisposition.evidence,
            contentTrust
        };

        let body = projectedDiscussion.body || '';

        // Build comments structure
        if (discussion.comments && discussion.comments.nodes && discussion.comments.nodes.length > 0) {
            body += '\n\n## Comments\n\n';
            for (const comment of discussion.comments.nodes) {
                const projectedComment = this.#projectAuthoredNode(
                    comment,
                    contentTrust,
                    `comment:${comment.id || comment.createdAt || 'unknown'}`
                );

                body += `### \`@${comment.author?.login || 'unknown'}\` commented on ${comment.createdAt}\n\n`;
                if (comment.isAnswer) {
                    body += '> [!ANSWER]\n\n';
                }
                body += `${projectedComment.body}\n\n`;

                // Parse replies if any
                if (comment.replies && comment.replies.nodes && comment.replies.nodes.length > 0) {
                    for (const reply of comment.replies.nodes) {
                        const projectedReply = this.#projectAuthoredNode(
                            reply,
                            contentTrust,
                            `comment:${comment.id || comment.createdAt || 'unknown'}/reply:${reply.id || reply.createdAt || 'unknown'}`
                        );

                        body += `#### Reply depth=1 by \`@${reply.author?.login || 'unknown'}\` on ${reply.createdAt}\n\n`;
                        if (reply.isAnswer) {
                            body += '> [!ANSWER]\n\n';
                        }
                        body += `${projectedReply.body}\n\n`;
                    }
                }
                body += '---\n\n';
            }
        }

        // Gray-matter serialization
        const content = matter.stringify(body, frontmatter);

        // Integrity gate: catches stale daemon code paths that silently drop frontmatter fields.
        const integrity = verifyDiscussionFrontmatter(content);
        if (!integrity.ok) {
            throw new Error(`Discussion #${discussion.number} serialized content missing required frontmatter keys: ${integrity.missing.join(', ')}. Frontmatter contract violation — likely stale MCP daemon code path.`);
        }

        return content;
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
                owner      : aiConfig.owner,
                repo       : aiConfig.repo,
                limit      : 50,
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
        const denylistNumbers   = new Set((issueSyncConfig.discussionDenylist?.numbers) || []);

        // Containment: quarantine denylisted discussions — removing both the file AND the
        // content-index entry — for the current fetch AND for cached copies GitHub no longer lists
        // (a hidden / spam-hammered artifact drops out of the list query while a prior local copy
        // persists). Number-denylist is the guaranteed cached-quarantine lever: `metadata.discussions`
        // persists `number` but not author, so author-denylist is fetch-time exclusion only. The
        // empty default denylist makes this a no-op. `quarantineRemovals` is consumed by the
        // post-loop `updateContentIndex` call so stale `discussions/<id>` lookups cannot survive.
        const deniedFetchedNumbers = new Set(
            allDiscussions.filter(discussion => this.#isDenylisted(discussion)).map(discussion => discussion.number)
        );
        const cachedDeniedNumbers = Object.keys(cachedDiscussions)
            .map(Number).filter(number => denylistNumbers.has(number));
        const quarantineRemovals = [];
        for (const number of new Set([...cachedDeniedNumbers, ...deniedFetchedNumbers])) {
            const cachedPath = cachedDiscussions[number]?.path;
            if (cachedPath) {
                await fs.unlink(this.#resolvePath(cachedPath)).catch(() => {});
            }
            quarantineRemovals.push({type: 'discussions', id: number});
            logger.warn(`🛡️ Discussion #${number} is denylisted (containment); quarantined + excluded from sync.`);
        }

        if (deniedFetchedNumbers.size > 0) {
            allDiscussions = allDiscussions.filter(discussion => !deniedFetchedNumbers.has(discussion.number));
        }

        const inventory            = await buildContentInventory(issueSyncConfig, {type: 'discussions', filePrefix: issueSyncConfig.discussionFilenamePrefix});
        const planBuckets          = this.#planBuckets(metadata, allDiscussions, inventory);
        let   shouldPruneEmptyDirs = false;

        for (const discussion of allDiscussions) {
            try {
                const targetPath = this.#getDiscussionPath(discussion, planBuckets);
                if (!targetPath) continue;

                const content     = this.#renderDiscussionMarkdown(discussion);
                const currentHash = this.#calculateContentHash(content);

                const cachedDiscussion = cachedDiscussions[discussion.number];
                const oldPathRelative  = cachedDiscussion?.path;
                const oldAbsolutePath  = oldPathRelative ? this.#resolvePath(oldPathRelative) : null;

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
                        shouldPruneEmptyDirs = true;
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

        await pruneEmptyDirs(issueSyncConfig.discussionsDir);
        if (shouldPruneEmptyDirs) {
            await pruneEmptyDirs(path.join(issueSyncConfig.archiveRoot, 'discussions'));
        }

        // Cache for the main orchestrator to merge
        metadata.discussions = {};
        const indexEntries = [];

        allDiscussions.forEach(d => {
            metadata.discussions[d.number] = {
                number     : d.number,
                closed     : d.closed,
                closedAt   : d.closedAt,
                contentHash: d.contentHash,
                path       : d.relativeOutputPath
            };

            const plan = planBuckets.get(d.number);

            indexEntries.push(createContentIndexEntry({
                issueSyncConfig,
                type     : 'discussions',
                id       : d.number,
                filePath : path.resolve(aiConfig.projectRoot, d.relativeOutputPath),
                itemIndex: plan ? plan.itemIndex : 0,
                version  : plan?.version || null,
                bucket   : null
            }));
        });

        try {
            await updateContentIndex(issueSyncConfig, {upsert: indexEntries, remove: quarantineRemovals});
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

    /**
     * @summary Force-refetches specific discussions from GitHub, bypassing the delta-by-`updatedAt`
     * gate, and re-renders their local Markdown mirrors from current GitHub state.
     *
     * The bulk {@link #syncDiscussions} path is delta-gated and discussion mirrors are pull-only, so a
     * mirror that drifted for a reason that does NOT bump `updatedAt` is never re-pulled. This is the
     * single recovery primitive: it fetches each discussion via {@link FETCH_SINGLE_DISCUSSION_FOR_SYNC},
     * re-renders via {@link #renderDiscussionMarkdown}, writes the file, and mutates the passed
     * `metadata` in place. The caller persists metadata afterwards. Mirrors
     * `PullRequestSyncer#refetchPullsByNumber` / `IssueSyncer#refetchIssuesByNumber`.
     *
     * @param {Array<Number>|Set<Number>} numbers The discussion numbers to refetch.
     * @param {Object} metadata The sync metadata object (mutated in place).
     * @param {Object} [indexMutations=null] Optional accumulator for `_index.json` updates.
     * @returns {Promise<{refetched: {count: Number, discussions: Number[]}, errors: Array<{discussionNumber: Number, error: String}>}>}
     */
    async refetchDiscussionsByNumber(numbers, metadata, indexMutations = null) {
        const stats = {refetched: {count: 0, discussions: []}, errors: []};
        const list  = [...numbers];

        // Build the complete-membership inventory ONCE for the whole refetch batch — a full corpus scan
        // per discussion would be pathological; every planned ordinal reads the same complete membership.
        const inventory = await buildContentInventory(issueSyncConfig, {type: 'discussions', filePrefix: issueSyncConfig.discussionFilenamePrefix});

        for (const discussionNumber of list) {
            try {
                const data = await GraphqlService.query(
                    FETCH_SINGLE_DISCUSSION_FOR_SYNC,
                    {
                        owner      : aiConfig.owner,
                        repo       : aiConfig.repo,
                        number     : discussionNumber,
                        maxComments: 50,
                        maxReplies : 20
                    },
                    true
                );

                const discussion = data.repository.discussion;
                if (!discussion) {
                    logger.warn(`Discussion #${discussionNumber} not found on GitHub, skipping refetch`);
                    continue;
                }

                const planBuckets = this.#planBuckets(metadata, [discussion], inventory);
                const targetPath  = this.#getDiscussionPath(discussion, planBuckets);
                if (!targetPath) {
                    if (indexMutations) {
                        indexMutations.remove.push({type: 'discussions', id: discussionNumber});
                    }
                    continue;
                }

                const content     = this.#renderDiscussionMarkdown(discussion);
                const contentHash = this.#calculateContentHash(content);

                await fs.mkdir(path.dirname(targetPath), {recursive: true});
                await fs.writeFile(targetPath, content, 'utf-8');

                stats.refetched.count++;
                stats.refetched.discussions.push(discussionNumber);
                logger.debug(`✅ Refetched discussion #${discussionNumber}`);

                metadata.discussions[discussionNumber] = {
                    number  : discussion.number,
                    closed  : discussion.closed,
                    closedAt: discussion.closedAt,
                    contentHash,
                    path    : this.#relativePath(targetPath)
                };

                if (indexMutations) {
                    const plan = planBuckets.get(discussionNumber);
                    indexMutations.upsert.push(createContentIndexEntry({
                        issueSyncConfig,
                        type     : 'discussions',
                        id       : discussionNumber,
                        filePath : this.#resolvePath(this.#relativePath(targetPath)),
                        itemIndex: plan ? plan.itemIndex : 0,
                        version  : plan?.version || null,
                        bucket   : null
                    }));
                }
            } catch (e) {
                logger.error(`Failed to refetch discussion #${discussionNumber}: ${e.message}`);
                stats.errors.push({discussionNumber, error: e.message});
            }
        }

        return stats;
    }
}

export default Neo.setupClass(DiscussionSyncer);
