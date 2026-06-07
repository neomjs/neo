import aiConfig                               from '../../../mcp/server/github-workflow/config.mjs';
import Base                                   from '../../../../src/core/Base.mjs';
import crypto                                 from 'crypto';
import fs                                     from 'fs/promises';
import logger                                 from '../../../mcp/server/github-workflow/logger.mjs';
import matter                                 from 'gray-matter';
import path                                   from 'path';
import GraphqlService                         from '../GraphqlService.mjs';
import {FETCH_RELEASES, FETCH_LATEST_RELEASE} from '../queries/releaseQueries.mjs';
import contentPath, {contentBucketDir, chunkNumberFor} from '../shared/contentPath.mjs';

const issueSyncConfig = aiConfig.issueSync;

/**
 * @summary Handles the fetching and local synchronization of GitHub Release notes.
 *
 * This service is responsible for:
 * - Fetching release data from GitHub, optimized with an "early exit" strategy to avoid fetching old history
 * - Detecting new releases by comparing against cached data
 * - Generating and updating local Markdown files for each release
 * - Sorting releases chronologically to support issue archiving logic
 *
 * @class Neo.ai.services.github-workflow.sync.ReleaseNotesSyncer
 * @extends Neo.core.Base
 * @singleton
 */
class ReleaseNotesSyncer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.sync.ReleaseNotesSyncer'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.sync.ReleaseNotesSyncer',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object} releases=null
         * @protected
         */
        releases: null,
        /**
         * @member {Array} sortedReleases=null
         * @protected
         */
        sortedReleases: null
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
     * Fetches the full release history from GitHub using a two-phase approach.
     *
     * The two phases are necessary because the GitHub GraphQL `releases` endpoint does not
     * support a `since` parameter, making simple delta-based fetching impossible.
     *
     * First, a quick check sees whether the latest release is already cached (fast-path no-op).
     * If not, it performs a full paginated fetch of the COMPLETE release history (bounded only by
     * the `maxReleases` safety cap). The full set populates `sortedReleases`, the bucketing
     * reference for closed Issues/PRs/Discussions; release-NOTES are floored to `syncStartDate`
     * downstream in `syncNotes`.
     *
     * @param {object} metadata The sync metadata containing the cached releases.
     * @returns {Promise<void>}
     */
    async fetchAndCacheReleases(metadata) {
        logger.info('Checking for new releases...');

        const cachedReleases     = metadata.releases || {};
        // Persisted metadata keeps release tags as object keys and prunes body fields.
        const cachedReleaseArray = Object.entries(cachedReleases).map(([tagName, release]) => ({
            ...release,
            tagName,
            metadataOnly: !Object.hasOwn(release, 'name') && !Object.hasOwn(release, 'description')
        }));

        // Fast-path check against the cached latest release.
        if (cachedReleaseArray.length > 0) {
            try {
                const latestData = await GraphqlService.query(FETCH_LATEST_RELEASE, {
                    owner: aiConfig.owner,
                    repo : aiConfig.repo
                });

                const latestRelease = latestData.repository.latestRelease;
                // Sort by date to find the latest cached release.
                cachedReleaseArray.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
                const cachedLatest  = cachedReleaseArray[cachedReleaseArray.length - 1];

                if (latestRelease && cachedLatest &&
                    latestRelease.tagName === cachedLatest.tagName &&
                    latestRelease.publishedAt === cachedLatest.publishedAt) {
                    logger.info(`✅ Releases are up-to-date (latest: ${latestRelease.tagName})`);
                    this.releases = Object.fromEntries(cachedReleaseArray.map(release => [release.tagName, release]));
                    this.sortedReleases = cachedReleaseArray.map(r => ({
                        tagName    : r.tagName,
                        publishedAt: r.publishedAt
                    }));
                    return;
                }

                logger.info(`New release detected: ${latestRelease.tagName} (cached was: ${cachedLatest?.tagName})`);
            } catch (e) {
                logger.warn(`Could not check latest release, falling back to full fetch: ${e.message}`);
            }
        }

        // Full paginated fetch of the COMPLETE release history. The bucketing reference
        // (`sortedReleases`, consumed by Issue/PR/Discussion closedAt→release resolution) must span
        // every release; otherwise closed items predating the oldest fetched release all collapse
        // into it (a catch-all bucket). Release-NOTES are floored separately in syncNotes.
        logger.info('Fetching the full release history from GitHub via GraphQL...');

        let allReleases   = [];
        let hasNextPage   = true;
        let cursor        = null;
        const maxReleases = issueSyncConfig.maxReleases;

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

            allReleases.push(...releases.nodes);

            logger.debug(`Fetched ${releases.nodes.length} releases (total: ${allReleases.length})`);

            hasNextPage = releases.pageInfo.hasNextPage;
            cursor      = releases.pageInfo.endCursor;
        }

        // No silent truncation: warn if the safety cap was hit before history was exhausted.
        if (hasNextPage && allReleases.length >= maxReleases) {
            logger.warn(`⚠️ Hit maxReleases cap (${maxReleases}) before exhausting the release history; the oldest releases are missing from the bucketing reference. Raise issueSyncConfig.maxReleases.`);
        }

        // Sort the COMPLETE set ascending. Both the release map and the bucketing reference span the
        // full history; release-NOTES are floored by syncStartDate in syncNotes, so this wide set
        // never reaches disk as extra notes or SSR routes.
        const allSorted = allReleases
            .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

        this.releases       = {};
        this.sortedReleases = [];

        allSorted.forEach(release => {
            this.releases[release.tagName] = release;
            this.sortedReleases.push({
                tagName    : release.tagName,
                publishedAt: release.publishedAt
            });
        });

        if (Object.keys(this.releases).length === 0) {
            logger.warn('⚠️ No releases found. Archiving will fall back to active/Backlog.');
        } else {
            logger.info(`Found and cached ${Object.keys(this.releases).length} releases (full history).`);
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
        const baseDir = issueSyncConfig.contentRoot;
        const releaseDir = contentBucketDir({
            contentRoot: baseDir,
            type: 'release-notes'
        });

        await fs.mkdir(releaseDir, { recursive: true });

        const indexMap = {
            metadata: {
                shardType: 'release-notes',
                chunkThreshold: 100,
                updatedAt: new Date().toISOString()
            },
            items: {}
        };

        const stats = {
            count : 0,
            synced: []
        };

        const cachedReleases = metadata.releases || {};
        const startDate      = new Date(issueSyncConfig.syncStartDate);

        // Release-notes content is floored to syncStartDate even though the bucketing reference
        // (`sortedReleases`) now spans the full history: we only write notes for in-window releases,
        // keeping the on-disk notes set and its chunk layout stable. Index within the floored set so
        // chunk numbers match the notes actually written.
        const notesReleases = this.sortedReleases.filter(r => new Date(r.publishedAt) >= startDate);

        for (const release of Object.values(this.releases)) {
            if (new Date(release.publishedAt) < startDate) continue;
            try {
                const itemIndex = notesReleases.findIndex(r => r.tagName === release.tagName);
                const chunkNumber = chunkNumberFor(itemIndex);

                const filename = release.tagName.startsWith(issueSyncConfig.releaseFilenamePrefix)
                    ? release.tagName
                    : issueSyncConfig.releaseFilenamePrefix + release.tagName;

                const filePath = contentPath({
                    contentRoot: baseDir,
                    type: 'release-notes',
                    filename: `${filename}.md`,
                    itemIndex
                });

                indexMap.items[release.tagName] = {
                    itemIndex,
                    chunk: chunkNumber,
                    chunkDir: `chunk-${chunkNumber}`
                };

                const cachedRelease = cachedReleases[release.tagName];

                if (release.metadataOnly) {
                    if (cachedRelease?.contentHash) {
                        logger.debug(`Skipping release notes for ${release.tagName}, cached metadata has no body fields.`);
                        release.contentHash = cachedRelease.contentHash;
                    } else {
                        logger.warn(`⚠️ Cannot sync release notes for ${release.tagName}: cached metadata has no body fields or contentHash.`);
                    }
                    continue;
                }

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

                if (cachedRelease && cachedRelease.contentHash === currentHash) {
                    logger.debug(`Skipping release notes for ${release.tagName}, content unchanged.`);
                    continue;
                }

                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, content, 'utf-8');
                logger.debug(`✅ Synced release notes for ${release.tagName}`);
                stats.count++;
                stats.synced.push(release.tagName);
            } catch (e) {
                logger.warn(`⚠️ Could not sync release notes for ${release.tagName}: ${e.message}`);
            }
        }

        try {
            const indexFilePath = path.join(releaseDir, '_index.json');
            await fs.writeFile(indexFilePath, JSON.stringify(indexMap, null, 2), 'utf-8');
            logger.info('✅ Synced _index.json for release-notes');
        } catch (e) {
            logger.warn(`⚠️ Could not sync _index.json for release notes: ${e.message}`);
        }

        return stats;
    }
}

export default Neo.setupClass(ReleaseNotesSyncer);
