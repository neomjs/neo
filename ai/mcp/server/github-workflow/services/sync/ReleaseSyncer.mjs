import aiConfig                               from '../../config.mjs';
import Base                                   from '../../../../../../src/core/Base.mjs';
import crypto                                 from 'crypto';
import fs                                     from 'fs/promises';
import logger                                 from '../../logger.mjs';
import matter                                 from 'gray-matter';
import path                                   from 'path';
import GraphqlService                         from '../GraphqlService.mjs';
import {FETCH_RELEASES, FETCH_LATEST_RELEASE} from '../queries/releaseQueries.mjs';

const issueSyncConfig = aiConfig.issueSync;

/**
 * Handles the fetching and local synchronization of GitHub Release notes.
 * @class Neo.ai.mcp.server.github-workflow.services.sync.ReleaseSyncer
 * @extends Neo.core.Base
 * @singleton
 */
class ReleaseSyncer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.sync.ReleaseSyncer'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.sync.ReleaseSyncer',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Object} releases=null
     */
    releases = null;
    /**
     * @member {Array} sortedReleases=null
     */
    sortedReleases = null;

    /**
     * Calculates a SHA-256 hash of the given content for change detection.
     * @param {string} content - The content to hash.
     * @returns {string} The hex-encoded hash.
     * @private
     */
    #calculateContentHash(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Fetches releases from GitHub using an optimized two-phase approach.
     *
     * This optimization is necessary because the GitHub GraphQL `releases` endpoint does not
     * support a `since` parameter, making simple delta-based fetching impossible.
     *
     * First, it performs a quick check to see if the latest release is already cached.
     * If not, it performs a full, paginated fetch with an early-exit optimization that
     * stops querying when it reaches releases older than the `syncStartDate`.
     *
     * @param {object} metadata The sync metadata containing the cached releases.
     * @returns {Promise<void>}
     */
    async fetchAndCacheReleases(metadata) {
        logger.info('Checking for new releases...');

        const cachedReleases     = metadata.releases || {};
        const cachedReleaseArray = Object.values(cachedReleases);

        // Phase 1: Quick check against the cached latest release
        if (cachedReleaseArray.length > 0) {
            try {
                const latestData = await GraphqlService.query(FETCH_LATEST_RELEASE, {
                    owner: aiConfig.owner,
                    repo : aiConfig.repo
                });

                const latestRelease = latestData.repository.latestRelease;
                // Sort by date to find the latest
                cachedReleaseArray.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
                const cachedLatest  = cachedReleaseArray[cachedReleaseArray.length - 1];

                if (latestRelease && cachedLatest &&
                    latestRelease.tagName === cachedLatest.tagName &&
                    latestRelease.publishedAt === cachedLatest.publishedAt) {
                    logger.info(`✅ Releases are up-to-date (latest: ${latestRelease.tagName})`);
                    this.releases = cachedReleases;
                    return;
                }

                logger.info(`New release detected: ${latestRelease.tagName} (cached was: ${cachedLatest?.tagName})`);
            } catch (e) {
                logger.warn(`Could not check latest release, falling back to full fetch: ${e.message}`);
            }
        }

        // Phase 2: Full fetch with early exit
        logger.info('Fetching releases from GitHub via GraphQL...');

        let allReleases   = [];
        let hasNextPage   = true;
        let cursor        = null;
        const maxReleases = issueSyncConfig.maxReleases;
        const startDate   = new Date(issueSyncConfig.syncStartDate);

        while (hasNextPage && allReleases.length < maxReleases) {
            const data = await GraphqlService.query(FETCH_RELEASES, {
                owner: aiConfig.owner,
                repo : aiConfig.repo,
                limit: issueSyncConfig.releaseQueryLimit,
                cursor
            });

            const releases = data.repository.releases;

            if (releases.nodes.length === 0) {
                logger.debug('No more releases found in pagination.');
                break;
            }

            // Check if oldest release in this batch is before our cutoff
            const oldestInBatch = releases.nodes[releases.nodes.length - 1];
            const oldestDate    = new Date(oldestInBatch.publishedAt);

            // Add all releases from the batch for now; we will filter after the loop
            allReleases.push(...releases.nodes);

            logger.debug(`Fetched ${releases.nodes.length} releases (total raw: ${allReleases.length})`);

            // Early exit if oldest release in batch is before our cutoff
            if (oldestDate < startDate) {
                logger.info(`Reached releases published before ${issueSyncConfig.syncStartDate}, stopping pagination.`);
                break;
            }

            hasNextPage = releases.pageInfo.hasNextPage;
            cursor      = releases.pageInfo.endCursor;
        }

        // Now, filter and sort the collected releases
        const filteredAndSortedReleases = allReleases
            .filter(release => new Date(release.publishedAt) >= startDate)
            .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

        this.releases       = {};
        this.sortedReleases = [];

        filteredAndSortedReleases.forEach(release => {
            this.releases[release.tagName] = release;
            this.sortedReleases.push({
                tagName    : release.tagName,
                publishedAt: release.publishedAt
            });
        });

        if (Object.keys(this.releases).length === 0) {
            logger.warn(`⚠️ No releases found since syncStartDate (${issueSyncConfig.syncStartDate}). Archiving may fall back to default.`);
        } else {
            logger.info(`Found and cached ${Object.keys(this.releases).length} releases since ${issueSyncConfig.syncStartDate}.`);
        }
    }

    /**
     * Saves release notes from GitHub as local Markdown files, using content hashing to avoid
     * unnecessary writes.
     * @param {object} metadata The sync metadata containing cached release hashes.
     * @returns {Promise<object>} Statistics about the operation ({count: number, synced: string[]}).
     */
    async syncNotes(metadata) {
        logger.info('📄 Syncing release notes...');
        const releaseDir = issueSyncConfig.releaseNotesDir;
        await fs.mkdir(releaseDir, { recursive: true });

        const stats = {
            count : 0,
            synced: []
        };

        const cachedReleases = metadata.releases || {};

        for (const release of Object.values(this.releases)) {
            try {
                const filePath = path.join(releaseDir, `${issueSyncConfig.releaseFilenamePrefix}${release.tagName}.md`);

                const frontmatter = {
                    tagName     : release.tagName,
                    name        : release.name,
                    publishedAt : release.publishedAt,
                    isPrerelease: release.isPrerelease || false,
                    isDraft     : release.isDraft || false
                };

                // GraphQL returns 'description' not 'body'
                const body        = `# ${release.name}\n\n${release.description || ''}`;
                const content     = matter.stringify(body, frontmatter);
                const currentHash = this.#calculateContentHash(content);

                // Store the hash on the release object for the main loop to cache later
                release.contentHash = currentHash;

                const cachedRelease = cachedReleases[release.tagName];

                if (cachedRelease && cachedRelease.contentHash === currentHash) {
                    logger.debug(`Skipping release notes for ${release.tagName}, content unchanged.`);
                    continue;
                }

                await fs.writeFile(filePath, content, 'utf-8');
                logger.info(`✅ Synced release notes for ${release.tagName}`);
                stats.count++;
                stats.synced.push(release.tagName);
            } catch (e) {
                logger.warn(`⚠️ Could not sync release notes for ${release.tagName}: ${e.message}`);
            }
        }
        return stats;
    }
}

export default Neo.setupClass(ReleaseSyncer);
