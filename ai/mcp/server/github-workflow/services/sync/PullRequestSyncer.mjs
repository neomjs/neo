import aiConfig                   from '../../config.mjs';
import Base                       from '../../../../../../src/core/Base.mjs';
import crypto                     from 'crypto';
import fs                         from 'fs/promises';
import logger                     from '../../logger.mjs';
import matter                     from 'gray-matter';
import path                       from 'path';
import GraphqlService             from '../GraphqlService.mjs';
import {FETCH_PULL_REQUESTS_FOR_SYNC} from '../queries/pullRequestQueries.mjs';

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
 * @class Neo.ai.mcp.server.github-workflow.services.sync.PullRequestSyncer
 * @extends Neo.core.Base
 * @singleton
 */
class PullRequestSyncer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.sync.PullRequestSyncer'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.sync.PullRequestSyncer',
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

        for (const pr of allPullRequests) {
            try {
                const filename    = `${aiConfig.issueSync.pullFilenamePrefix || 'pr-'}${pr.number}.md`;
                const filePath    = path.join(issueSyncConfig.pullsDir, filename);

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

                // Diff cache
                if (cachedPull && cachedPull.contentHash === currentHash) {
                    logger.debug(`Skipping pull request #${pr.number}, content unchanged.`);
                    
                    // We must still transfer the hash to the new run's metadata to persist it
                    pr.contentHash = currentHash;
                    continue;
                }

                await fs.writeFile(filePath, content, 'utf-8');
                logger.debug(`✅ Synced pull request #${pr.number}`);
                
                pr.contentHash = currentHash;

                stats.count++;
                stats.synced.push(pr.number);
            } catch (e) {
                logger.warn(`⚠️ Could not sync pull request #${pr.number}: ${e.message}`);
            }
        }
        
        // Cache for the main orchestrator to merge
        metadata.pulls = {};
        allPullRequests.forEach(p => {
            metadata.pulls[p.number] = {
                number: p.number,
                contentHash: p.contentHash,
                state: p.state,
                updatedAt: p.updatedAt,
                path: path.join('pulls', `${aiConfig.issueSync.pullFilenamePrefix || 'pr-'}${p.number}.md`)
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
