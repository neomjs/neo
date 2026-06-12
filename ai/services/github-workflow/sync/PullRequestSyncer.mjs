import aiConfig                   from '../../../mcp/server/github-workflow/config.mjs';
import Base                       from '../../../../src/core/Base.mjs';
import crypto                     from 'crypto';
import {existsSync}               from 'fs';
import fs                         from 'fs/promises';
import logger                     from '../../../mcp/server/github-workflow/logger.mjs';
import matter                     from 'gray-matter';
import path                       from 'path';
import semver                     from 'semver';
import GraphqlService             from '../GraphqlService.mjs';
import ReleaseNotesSyncer         from './ReleaseNotesSyncer.mjs';
import {FETCH_PULL_REQUESTS_FOR_SYNC} from '../queries/pullRequestQueries.mjs';
import contentPath                from '../shared/contentPath.mjs';
import {createContentIndexEntry, updateContentIndex} from '../shared/contentIndex.mjs';

const issueSyncConfig = aiConfig.issueSync;
const pullRequestConfig = aiConfig.pullRequest;

/**
 * @summary Handles the fetching and local synchronization of GitHub Pull Requests.
 *
 * This service is responsible for:
 * - Fetching pull requests from GitHub via GraphQL.
 * - Generating and updating local Markdown files for each pull request.
 * - Supporting offline context mapping.
 *
 * @class Neo.ai.services.github-workflow.sync.PullRequestSyncer
 * @extends Neo.core.Base
 * @singleton
 */
class PullRequestSyncer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.sync.PullRequestSyncer'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.sync.PullRequestSyncer',
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
     * @summary Resolves a closed or merged pull request's release-date bucket.
     * @param {Object} pr GitHub pull request node or cached pull entry.
     * @returns {String|null} Version bucket, or null when no cut release follows the close/merge date.
     * @private
     */
    #deriveClosedAtVersion(pr) {
        if (!pr.mergedAt && !pr.closedAt) return null;

        const closed  = new Date(pr.mergedAt || pr.closedAt);
        const release = (ReleaseNotesSyncer.sortedReleases || []).find(r => new Date(r.publishedAt) > closed);

        if (!release) return null;

        return release.tagName.startsWith(issueSyncConfig.versionDirectoryPrefix)
            ? release.tagName
            : issueSyncConfig.versionDirectoryPrefix + release.tagName;
    }

    /**
     * @summary Resolves an opt-in milestone archive bucket without pre-staging future releases.
     * @param {Object} pr GitHub pull request node or cached pull entry.
     * @returns {String|null} Existing milestone bucket, or null when disabled, invalid, or uncut.
     * @private
     */
    #deriveMilestoneVersion(pr) {
        const title = pr.milestone?.title;

        if (!issueSyncConfig.routeByMilestone || !title || !semver.valid(semver.clean(title))) {
            return null;
        }

        const candidate = title.startsWith(issueSyncConfig.versionDirectoryPrefix)
            ? title
            : issueSyncConfig.versionDirectoryPrefix + title;
        const archiveDir = path.join(issueSyncConfig.archiveRoot, 'pulls', candidate);

        return existsSync(archiveDir) ? candidate : null;
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
     * @summary Pre-computes bucket distribution for all pull requests based on historical milestones/releases.
     * @param {object} metadata Current sync metadata
     * @param {Array<object>} fetchedPullRequests PRs fetched in the current sync run
     * @returns {Map<number, {version: string|null, itemCount: number, itemIndex: number}>}
     * @private
     */
    #planBuckets(metadata, fetchedPullRequests = []) {
        const combined = new Map();

        for (const [idStr, pr] of Object.entries(metadata.pulls || {})) {
            combined.set(parseInt(idStr, 10), {
                number   : parseInt(idStr, 10),
                state    : pr.state,
                milestone: pr.milestone ? { title: pr.milestone } : null,
                closedAt : pr.closedAt,
                mergedAt : pr.mergedAt
            });
        }

        for (const pr of fetchedPullRequests) {
            combined.set(pr.number, {
                number   : pr.number,
                state    : pr.state,
                milestone: pr.milestone,
                closedAt : pr.closedAt,
                mergedAt : pr.mergedAt
            });
        }

        const buckets = new Map();
        const activeItems = [];

        for (const pr of combined.values()) {
            let version = null;
            if (pr.mergedAt || pr.closedAt) {
                version = this.#deriveClosedAtVersion(pr);
            }

            if (!version) {
                version = this.#deriveMilestoneVersion(pr);
            }

            if (pr.state !== 'CLOSED' && pr.state !== 'MERGED' || !version) {
                activeItems.push(pr);
                continue;
            }

            if (!buckets.has(version)) buckets.set(version, []);
            buckets.get(version).push(pr);
        }

        const plans = new Map();

        activeItems.sort((a, b) => a.number - b.number);
        const activeItemCount = activeItems.length;
        activeItems.forEach((pr, index) => {
            plans.set(pr.number, {
                version: null,
                itemCount: activeItemCount,
                itemIndex: index
            });
        });

        for (const [version, prs] of buckets.entries()) {
            prs.sort((a, b) => a.number - b.number);
            const itemCount = prs.length;
            prs.forEach((pr, index) => {
                plans.set(pr.number, {
                    version,
                    itemCount,
                    itemIndex: index
                });
            });
        }

        return plans;
    }

    /**
     * Determines the correct local file path for a given pull request based on its state.
     * @param {object} pr The GitHub pull request object.
     * @param {Map<number, object>} planBuckets Precomputed bucket distribution.
     * @returns {string} The absolute file path for the PR's Markdown file.
     * @private
     */
    #getPullRequestPath(pr, planBuckets = new Map()) {
        const filename = `${aiConfig.issueSync.pullFilenamePrefix || 'pr-'}${pr.number}.md`;

        const plan = planBuckets.get(pr.number);

        const config = {
            contentRoot: issueSyncConfig.contentRoot,
            type: 'pulls',
            filename,
            itemIndex: plan?.itemIndex || 0,
            itemsPerChunk: issueSyncConfig.archiveChunkThreshold,
            chunkPrefix: issueSyncConfig.archiveChunkPrefix
        };

        if (plan?.version) {
            config.version = plan.version;
        }

        return contentPath(config);
    }

    /**
     * Fetches pull requests from GitHub and syncs them to local markdown.
     * @param {object} metadata The sync metadata containing cached records.
     * @returns {Promise<object>} Statistics about the operation.
     */
    async syncPullRequests(metadata) {
        logger.info('🔄 Fetching pull requests from GitHub via GraphQL...');

        let allPullRequests = [];
        let hasNextPage     = true;
        let cursor          = null;

        // Delta cutoff. The `pullRequests` connection (unlike `issues`) has no server-side `since`
        // filter, so the query orders UPDATED_AT DESC and we stop paginating once a batch's oldest PR
        // predates the cached high-water mark. A clean-slate run (lastSync === null) or an empty cache
        // traverses the full history. Mirrors the issue delta semantics — the dominant rate-limit win.
        const cachedPrDates = Object.values(metadata.pulls || {})
            .map(p => Date.parse(p.updatedAt)).filter(t => !isNaN(t));
        const sinceCutoff = (metadata.lastSync == null || cachedPrDates.length === 0)
            ? 0
            : cachedPrDates.reduce((max, t) => t > max ? t : max, 0);

        // Ensure directory exists
        await fs.mkdir(issueSyncConfig.pullsDir, { recursive: true });

        while (hasNextPage) {
            const data = await GraphqlService.query(FETCH_PULL_REQUESTS_FOR_SYNC, {
                owner: aiConfig.owner,
                repo : aiConfig.repo,
                limit: pullRequestConfig.defaults.limit || 30,
                cursor,
                states: ['OPEN', 'CLOSED', 'MERGED'],
                maxComments: pullRequestConfig.maxCommentsPerPullRequest || 50,
                maxReviews: 20
            });

            const pullRequests = data.repository.pullRequests;

            if (pullRequests.nodes.length === 0) {
                break;
            }

            allPullRequests.push(...pullRequests.nodes);

            // Stop once the oldest PR in this UPDATED_AT-DESC batch predates the cutoff — everything
            // beyond is already current (re-processed in-window items no-op via the content-hash skip).
            const oldestPr = pullRequests.nodes[pullRequests.nodes.length - 1];
            if (Date.parse(oldestPr.updatedAt) < sinceCutoff) break;

            hasNextPage = pullRequests.pageInfo.hasNextPage;
            cursor      = pullRequests.pageInfo.endCursor;
        }

        const stats = {
            count : 0,
            synced: []
        };

        const cachedPulls = metadata.pulls || {};
        const planBuckets = this.#planBuckets(metadata, allPullRequests);

        for (const pr of allPullRequests) {
            try {
                const targetPath = this.#getPullRequestPath(pr, planBuckets);

                const frontmatter = {
                    number     : pr.number,
                    title      : pr.title,
                    author     : pr.author?.login || 'unknown',
                    state      : pr.state,
                    createdAt  : pr.createdAt,
                    updatedAt  : pr.updatedAt,
                    closedAt   : pr.closedAt,
                    mergedAt   : pr.mergedAt,
                    head       : pr.headRefName,
                    base       : pr.baseRefName,
                    url        : pr.url
                };

                let body = pr.body || '';

                // Build comments structure
                if (pr.comments && pr.comments.nodes && pr.comments.nodes.length > 0) {
                    body += '\n\n## Comments\n\n';
                    for (const comment of pr.comments.nodes) {
                        body += `### \`@${comment.author?.login || 'unknown'}\` commented on ${comment.createdAt}\n\n${comment.body}\n\n---\n\n`;
                    }
                }

                // Build reviews structure
                if (pr.reviews && pr.reviews.nodes && pr.reviews.nodes.length > 0) {
                    body += '\n\n## Reviews\n\n';
                    for (const review of pr.reviews.nodes) {
                        const reviewState = review.state ? ` (${review.state})` : '';
                        body += `### \`@${review.author?.login || 'unknown'}\`${reviewState} reviewed on ${review.createdAt}\n\n`;
                        if (review.body && review.body.trim().length > 0) {
                            body += `${review.body}\n\n`;
                        } else {
                            body += `*No review body provided.*\n\n`;
                        }
                        body += `---\n\n`;
                    }
                }

                // Gray-matter serialization
                const content = matter.stringify(body, frontmatter);
                const currentHash = this.#calculateContentHash(content);

                const cachedPull = cachedPulls[pr.number];
                const oldPathRelative = cachedPull?.path;
                const oldAbsolutePath = oldPathRelative ? this.#resolvePath(oldPathRelative) : null;

                const needsUpdate = !cachedPull ||
                    cachedPull.updatedAt !== pr.updatedAt ||
                    oldAbsolutePath !== targetPath;

                // Diff cache
                if (!needsUpdate && cachedPull && cachedPull.contentHash === currentHash) {
                    logger.debug(`Skipping pull request #${pr.number}, content unchanged.`);

                    // We must still transfer the hash and path to the new run's metadata to persist it
                    pr.contentHash = currentHash;
                    pr.relativeOutputPath = oldPathRelative;
                    continue;
                }

                await fs.mkdir(path.dirname(targetPath), { recursive: true });
                await fs.writeFile(targetPath, content, 'utf-8');

                if (oldAbsolutePath && oldAbsolutePath !== targetPath) {
                    try {
                        await fs.unlink(oldAbsolutePath);
                        logger.debug(`📦 Moved PR #${pr.number}: ${oldAbsolutePath} → ${targetPath}`);
                    } catch (e) {
                        // File might not exist
                    }
                }

                logger.debug(`✅ Synced pull request #${pr.number}`);

                pr.contentHash = currentHash;
                pr.relativeOutputPath = this.#relativePath(targetPath);

                stats.count++;
                stats.synced.push(pr.number);
            } catch (e) {
                logger.warn(`⚠️ Could not sync pull request #${pr.number}: ${e.message}`);
            }
        }

        // Cache for the main orchestrator to merge
        metadata.pulls = {};
        const indexEntries = [];

        allPullRequests.forEach(p => {
            const plan = planBuckets.get(p.number);

            metadata.pulls[p.number] = {
                number     : p.number,
                contentHash: p.contentHash,
                state      : p.state,
                updatedAt  : p.updatedAt,
                closedAt   : p.closedAt || null,
                mergedAt   : p.mergedAt || null,
                milestone  : p.milestone?.title || null,
                path       : p.relativeOutputPath
            };

            indexEntries.push(createContentIndexEntry({
                issueSyncConfig,
                type: 'pulls',
                id: p.number,
                filePath: path.resolve(aiConfig.projectRoot, p.relativeOutputPath),
                itemIndex: plan ? plan.itemIndex : 0,
                version: p.state === 'OPEN' ? null : plan?.version || null,
                bucket: null
            }));
        });

        try {
            await updateContentIndex(issueSyncConfig, {upsert: indexEntries});
        } catch (e) {
            logger.warn(`⚠️ Could not update _index.json for pull requests: ${e.message}`);
        }

        if (stats.count > 0) {
            logger.info(`✨ Synced ${stats.count} modified pull requests to disk.`);
        } else {
            logger.info(`✅ Synced 0 pull requests (all up to date).`);
        }

        return stats;
    }
}

export default Neo.setupClass(PullRequestSyncer);
