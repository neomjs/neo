import aiConfig                   from '../../../mcp/server/github-workflow/config.mjs';
import Base                       from '../../../../src/core/Base.mjs';
import crypto                     from 'crypto';
import fs                         from 'fs/promises';
import logger                     from '../../../mcp/server/github-workflow/logger.mjs';
import matter                     from 'gray-matter';
import path                       from 'path';
import GraphqlService             from '../GraphqlService.mjs';
import ReleaseSyncer              from './ReleaseSyncer.mjs';
import {FETCH_PULL_REQUESTS_FOR_SYNC} from '../queries/pullRequestQueries.mjs';
import chunkPath                  from '../shared/chunkPath.mjs';
import archivePath                from '../shared/archivePath.mjs';

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
     * @summary Pre-computes bucket counts and indices for all archived pull requests.
     * @param {Object} metadata The sync metadata.
     * @param {Array} fetchedPullRequests The delta PRs fetched from GitHub.
     * @returns {Map<number, {version: string, itemCount: number, itemIndex: number}>}
     * @private
     */
    #planArchiveBuckets(metadata, fetchedPullRequests = []) {
        const combined = new Map();
        
        for (const [idStr, pr] of Object.entries(metadata.pulls || {})) {
            combined.set(parseInt(idStr, 10), {
                number        : parseInt(idStr, 10),
                state         : pr.state,
                milestone     : pr.milestone ? { title: pr.milestone } : null,
                closedAt      : pr.closedAt,
                mergedAt      : pr.mergedAt,
                archiveVersion: pr.archiveVersion
            });
        }
        
        for (const pr of fetchedPullRequests) {
            const cached = metadata.pulls?.[pr.number];

            combined.set(pr.number, {
                number        : pr.number,
                state         : pr.state,
                milestone     : pr.milestone,
                closedAt      : pr.closedAt,
                mergedAt      : pr.mergedAt,
                archiveVersion: cached?.archiveVersion
            });
        }
        
        const buckets = new Map();
        
        for (const pr of combined.values()) {
            if (pr.state === 'OPEN') continue;
            
            let version = null;
            if (pr.archiveVersion) {
                version = pr.archiveVersion.startsWith(issueSyncConfig.versionDirectoryPrefix)
                    ? pr.archiveVersion
                    : issueSyncConfig.versionDirectoryPrefix + pr.archiveVersion;
            } else if (pr.milestone?.title) {
                version = pr.milestone.title.startsWith(issueSyncConfig.versionDirectoryPrefix)
                    ? pr.milestone.title
                    : issueSyncConfig.versionDirectoryPrefix + pr.milestone.title;
            } else if (pr.mergedAt || pr.closedAt) {
                const closed = new Date(pr.mergedAt || pr.closedAt);
                const release = (ReleaseSyncer.sortedReleases || []).find(r => new Date(r.publishedAt) > closed);
                if (release) {
                    version = release.tagName.startsWith(issueSyncConfig.versionDirectoryPrefix)
                        ? release.tagName
                        : issueSyncConfig.versionDirectoryPrefix + release.tagName;
                }
            }
            
            version = version || issueSyncConfig.defaultArchiveVersion || 'unversioned';
            
            if (!buckets.has(version)) buckets.set(version, []);
            buckets.get(version).push(pr);
        }
        
        const plans = new Map();
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
     * @param {Map<number, object>} archivePlan Precomputed bucket distribution.
     * @returns {string} The absolute file path for the PR's Markdown file.
     * @private
     */
    #getPullRequestPath(pr, archivePlan = new Map()) {
        const filename = `${aiConfig.issueSync.pullFilenamePrefix || 'pr-'}${pr.number}.md`;
        const chunkDir = chunkPath(pr.number);

        if (pr.state === 'OPEN') {
            return path.join(issueSyncConfig.pullsDir, chunkDir, filename);
        }

        // Logic for CLOSED and MERGED pull requests
        const plan = archivePlan.get(pr.number);
        
        // Fallback parameters if pr wasn't part of a pre-pass plan
        let version = plan?.version;
        let itemCount = plan?.itemCount || 1;
        let itemIndex = plan?.itemIndex || 0;

        if (!version) {
            if (pr.archiveVersion) {
                version = pr.archiveVersion.startsWith(issueSyncConfig.versionDirectoryPrefix)
                    ? pr.archiveVersion
                    : issueSyncConfig.versionDirectoryPrefix + pr.archiveVersion;
            } else if (pr.milestone?.title) {
                version = pr.milestone.title.startsWith(issueSyncConfig.versionDirectoryPrefix)
                    ? pr.milestone.title
                    : issueSyncConfig.versionDirectoryPrefix + pr.milestone.title;
            } else if (pr.mergedAt || pr.closedAt) {
                const closed = new Date(pr.mergedAt || pr.closedAt);
                const release = (ReleaseSyncer.sortedReleases || []).find(r => new Date(r.publishedAt) > closed);
                if (release) {
                    version = release.tagName.startsWith(issueSyncConfig.versionDirectoryPrefix)
                        ? release.tagName
                        : issueSyncConfig.versionDirectoryPrefix + release.tagName;
                }
            }
            version = version || issueSyncConfig.defaultArchiveVersion || 'unversioned';
        }

        return archivePath({
            archiveRoot: issueSyncConfig.archiveRoot,
            type: 'pulls',
            version: version,
            filename: filename,
            itemCount: itemCount,
            itemIndex: itemIndex
        });
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

            hasNextPage = pullRequests.pageInfo.hasNextPage;
            cursor      = pullRequests.pageInfo.endCursor;
            
            // To prevent massive queries, limit to say a max amount for safety.
            if (allPullRequests.length >= 200) {
                break;
            }
        }

        const stats = {
            count : 0,
            synced: []
        };

        const cachedPulls = metadata.pulls || {};
        const archivePlan = this.#planArchiveBuckets(metadata, allPullRequests);

        for (const pr of allPullRequests) {
            try {
                const targetPath = this.#getPullRequestPath(pr, archivePlan);

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
                        logger.info(`📦 Moved PR #${pr.number}: ${oldAbsolutePath} → ${targetPath}`);
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
        allPullRequests.forEach(p => {
            const plan = archivePlan.get(p.number);

            metadata.pulls[p.number] = {
                number        : p.number,
                contentHash   : p.contentHash,
                state         : p.state,
                updatedAt     : p.updatedAt,
                closedAt      : p.closedAt || null,
                mergedAt      : p.mergedAt || null,
                milestone     : p.milestone?.title || null,
                archiveVersion: p.state === 'OPEN' ? null : plan?.version || null,
                path          : p.relativeOutputPath
            };
        });

        if (stats.count > 0) {
            logger.info(`✨ Synced ${stats.count} modified pull requests to disk.`);
        } else {
            logger.info(`✅ Synced 0 pull requests (all up to date).`);
        }

        return stats;
    }
}

export default Neo.setupClass(PullRequestSyncer);
