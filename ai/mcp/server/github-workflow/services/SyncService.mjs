import aiConfig        from '../config.mjs';
import Base            from '../../../../../src/core/Base.mjs';
import logger          from '../logger.mjs';
import IssueSyncer     from './sync/IssueSyncer.mjs';
import MetadataManager from './sync/MetadataManager.mjs';
import ReleaseSyncer   from './sync/ReleaseSyncer.mjs';

/**
 * Orchestrates the bi-directional synchronization of GitHub issues and releases with local Markdown files.
 *
 * This service is the core engine for the GitHub sync workflow. Its primary responsibilities include:
 * - **Orchestration:** It calls specialized syncer modules (`IssueSyncer`, `ReleaseSyncer`) in the
 *   correct order to ensure data integrity and minimize conflicts (e.g., push-then-pull).
 * - **Metadata Management:** It uses the `MetadataManager` to load metadata at the start of a sync
 *   and save the updated metadata at the end.
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
     * 1.  Loads the persistent metadata from the last sync via `MetadataManager`.
     * 2.  Fetches and caches GitHub release data via `ReleaseSyncer`.
     * 3.  **Pushes** any local issue changes to GitHub via `IssueSyncer`.
     * 4.  **Pulls** the latest issue changes from GitHub via `IssueSyncer`.
     * 5.  Syncs release notes into local Markdown files via `ReleaseSyncer`.
     * 6.  Saves the updated, pruned metadata to disk via `MetadataManager`.
     *
     * @returns {Promise<object>} A comprehensive object containing detailed statistics and timing
     * information about all operations performed during the sync.
     */
    async runFullSync() {
        const startTime = new Date();

        const metadata = await MetadataManager.load();

        // Fetch releases first, as they are needed for issue archiving
        await ReleaseSyncer.fetchAndCacheReleases(metadata);

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
        await MetadataManager.save(newMetadata);

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
}

export default Neo.setupClass(SyncService);
