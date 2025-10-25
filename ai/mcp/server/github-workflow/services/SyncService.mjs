import aiConfig      from '../config.mjs';
import Base          from '../../../../../src/core/Base.mjs';
import fs            from 'fs/promises';
import logger        from '../logger.mjs';
import path          from 'path';
import IssueSyncer   from './sync/IssueSyncer.mjs';
import ReleaseSyncer from './sync/ReleaseSyncer.mjs';

const issueSyncConfig = aiConfig.issueSync;

/**
 * Orchestrates the bi-directional synchronization of GitHub issues and releases with local Markdown files.
 *
 * This service is the core engine for the GitHub sync workflow. Its primary responsibilities include:
 * - **State Management:** It maintains a persistent state via a `.sync-metadata.json` file to track
 *   the last sync time and the status of each item, enabling efficient delta-based updates.
 * - **Orchestration:** It calls specialized syncer modules (`IssueSyncer`, `ReleaseSyncer`) in the
 *   correct order to ensure data integrity and minimize conflicts (e.g., push-then-pull).
 * - **Metadata Management:** It loads the metadata at the start of a sync and saves the updated
 *   metadata, including new cache objects from the syncers, at the end.
 *
 * The main entry point is the `runFullSync` method, which executes the entire orchestration sequence.
 * @class Neo.ai.mcp.server.github-workflow.SyncService
 * @extends Neo.core.Base
 * @singleton
 */
class SyncService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.SyncService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.SyncService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The main public entry point for the synchronization process.
     *
     * This method orchestrates the entire bi-directional sync workflow in a specific order
     * to ensure data integrity and minimize conflicts:
     * 1.  Loads the persistent metadata from the last sync.
     * 2.  Fetches and caches GitHub release data via `ReleaseSyncer`.
     * 3.  **Pushes** any local issue changes to GitHub via `IssueSyncer`.
     * 4.  **Pulls** the latest issue changes from GitHub via `IssueSyncer`.
     * 5.  Syncs release notes into local Markdown files via `ReleaseSyncer`.
     * 6.  Saves the updated metadata (including new release and issue data) to disk.
     *
     * @returns {Promise<object>} A comprehensive object containing detailed statistics and timing
     * information about all operations performed during the sync.
     */
    async runFullSync() {
        const startTime = new Date();

        const metadata = await this.#loadMetadata();

        // Fetch releases first, as they are needed for issue archiving
        await ReleaseSyncer.fetchReleases(metadata);

        // 1. Push local changes
        const pushStats = await IssueSyncer.pushToGitHub(metadata);

        // 2. Pull remote changes
        const { newMetadata, stats: pullStats } = await IssueSyncer.pullFromGitHub(metadata);

        // 3. Sync release notes
        const releaseStats = await ReleaseSyncer.syncNotes(metadata);

        // 4. Self-heal push failures: If a previously failed issue was successfully pulled, remove it from the failure list
        if (newMetadata.pushFailures?.length > 0) {
            newMetadata.pushFailures = newMetadata.pushFailures.filter(failedId => !newMetadata.issues[failedId]);
        }

        // 5. Cache releases in metadata for next run
        const releaseCache = {};
        ReleaseSyncer.releases.forEach(release => {
            releaseCache[release.tagName] = {
                // Duplicating data to keep it simple, could be optimized
                // to just store the hash if metadata size becomes an issue.
                ...release,
                contentHash: release.contentHash
            };
        });
        newMetadata.releases            = releaseCache;
        newMetadata.releasesLastFetched = new Date().toISOString();

        // 6. Save metadata
        await this.#saveMetadata(newMetadata);

        const endTime    = new Date();
        const durationMs = endTime - startTime;

        const finalStats = {
            pushed  : pushStats,
            pulled  : pullStats.pulled,
            dropped : pullStats.dropped,
            releases: releaseStats
        };

        const timing = {
            startTime: startTime.toISOString(),
            endTime  : endTime.toISOString(),
            durationMs
        };

        logger.info('✨ Sync Complete');
        logger.info(`   Pushed:   ${finalStats.pushed.count} issues`);
        logger.info(`   Pulled:   ${finalStats.pulled.count} issues (${finalStats.pulled.created} new, ${finalStats.pulled.updated} updated, ${finalStats.pulled.moved} moved)`);
        logger.info(`   Dropped:  ${finalStats.dropped.count} issues`);
        logger.info(`   Releases: ${finalStats.releases.count} synced`);
        logger.info(`   Duration: ${Math.round(timing.durationMs / 1000)}s`);

        return {
            success   : true,
            summary   : "Synchronization complete",
            statistics: finalStats,
            timing
        };
    }

    /**
     * Loads the synchronization metadata file from disk. If the file doesn't exist,
     * it returns a default empty metadata object.
     * @returns {Promise<object>} The parsed metadata object.
     * @throws {Error} If reading the file fails for reasons other than not existing.
     * @private
     */
    async #loadMetadata() {
        try {
            const data = await fs.readFile(issueSyncConfig.metadataFile, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {
                    lastSync: null,
                    issues   : {}
                };
            }
            throw error;
        }
    }

    /**
     * Saves the provided metadata object to the configured metadata file on disk,
     * ensuring the directory exists.
     * @param {object} metadata - The metadata object to serialize and save.
     * @returns {Promise<void>}
     * @private
     */
    async #saveMetadata(metadata) {
        const dir = path.dirname(issueSyncConfig.metadataFile);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(issueSyncConfig.metadataFile, JSON.stringify(metadata, null, 2), 'utf-8');
    }
}

export default Neo.setupClass(SyncService);
