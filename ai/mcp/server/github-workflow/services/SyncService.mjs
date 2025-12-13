import aiConfig        from '../config.mjs';
import Base            from '../../../../../src/core/Base.mjs';
import logger          from '../logger.mjs';
import HealthService   from './HealthService.mjs';
import IssueSyncer     from './sync/IssueSyncer.mjs';
import MetadataManager from './sync/MetadataManager.mjs';
import ReleaseSyncer   from './sync/ReleaseSyncer.mjs';

/**
 * @summary Orchestrates the bi-directional synchronization of GitHub issues and releases with local Markdown files.
 *
 * This service is the core engine for the GitHub sync workflow. Its primary responsibilities include:
 * - **Orchestration:** It calls specialized syncer modules (`IssueSyncer`, `ReleaseSyncer`) in the
 *   correct order to ensure data integrity and minimize conflicts (e.g., push-then-pull).
 * - **Metadata Management:** It uses the `MetadataManager` to load metadata at the start of a sync
 *   and save the updated metadata at the end.
 *
 * The main entry point is the `runFullSync` method, which executes the entire orchestration sequence.
 *
 * @class Neo.ai.mcp.server.github-workflow.services.SyncService
 * @extends Neo.core.Base
 * @singleton
 */
class SyncService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.SyncService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.SyncService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        if (aiConfig.syncOnStartup) {
            try {
                // Ensure the system is healthy before attempting a sync.
                // This call is cached/deduplicated by HealthService, so it's cheap if the server
                // has already checked it.
                const health = await HealthService.healthcheck();

                if (health.status === 'healthy') {
                    logger.info('[SyncService] Starting automatic startup sync...');
                    await this.runFullSync();
                } else {
                    logger.warn('[SyncService] Skipping startup sync: GitHub CLI is unhealthy.');
                }
            } catch (error) {
                // We strictly catch errors here to ensure that a sync failure (network, API, etc.)
                // does not crash the entire service or prevent the server from starting.
                logger.error('[SyncService] Startup sync failed:', error.message);
            }
        }
    }

    /**
     * The main public entry point for the synchronization process.
     *
     * This method orchestrates the entire bi-directional sync workflow in a specific order
     * to ensure data integrity and minimize conflicts:
     * 1.  Loads the persistent metadata from the last sync via `MetadataManager`.
     * 2.  Fetches and caches GitHub release data via `ReleaseSyncer`.
     * 3.  Reconciles closed issue locations (archives stale issues) via `IssueSyncer`.
     * 4.  **Pushes** any local issue changes to GitHub via `IssueSyncer`.
     * 5.  **Pulls** the latest issue changes from GitHub via `IssueSyncer`.
     * 6.  Syncs release notes into local Markdown files via `ReleaseSyncer`.
     * 7.  Saves the updated, pruned metadata to disk via `MetadataManager`.
     * @returns {Promise<object>} A comprehensive object containing detailed statistics and timing
     * information about all operations performed during the sync.
     */
    async runFullSync() {
        const startTime = new Date();

        const metadata = await MetadataManager.load();

        // 1. Fetch releases first, as they are needed for issue archiving
        await ReleaseSyncer.fetchAndCacheReleases(metadata);

        // 2. Reconcile closed issue locations - archive stale closed issues before pull
        const reconcileStats = await IssueSyncer.reconcileClosedIssueLocations(metadata);

        // 3. Push local changes
        const pushStats = await IssueSyncer.pushToGitHub(metadata);

        // 4. Pull remote changes
        const { newMetadata, stats: pullStats } = await IssueSyncer.pullFromGitHub(metadata);

        // 5. Sync release notes
        const releaseStats = await ReleaseSyncer.syncNotes(metadata);

        // 6. Self-heal push failures: If a previously failed issue was successfully pulled, remove it from the failure list
        if (newMetadata.pushFailures?.length > 0) {
            newMetadata.pushFailures = newMetadata.pushFailures.filter(failedId => !newMetadata.issues[failedId]);
        }

        // 7. Cache releases in metadata for next run
        newMetadata.releases            = ReleaseSyncer.releases;
        newMetadata.releasesLastFetched = new Date().toISOString();

        // 8. Save metadata
        await MetadataManager.save(newMetadata);

        const endTime    = new Date();
        const durationMs = endTime - startTime;

        const finalStats = {
            reconciled: reconcileStats,
            pushed    : pushStats,
            pulled    : pullStats.pulled,
            dropped   : pullStats.dropped,
            releases  : releaseStats
        };

        const timing = {
            startTime: startTime.toISOString(),
            endTime  : endTime.toISOString(),
            durationMs
        };

        logger.info('✨ Sync Complete');
        logger.info(`   Reconciled: ${finalStats.reconciled.count} issues archived`);
        logger.info(`   Pushed:     ${finalStats.pushed.count} issues`);
        logger.info(`   Pulled:     ${finalStats.pulled.count} issues (${finalStats.pulled.created} new, ${finalStats.pulled.updated} updated, ${finalStats.pulled.moved} moved)`);
        logger.info(`   Dropped:    ${finalStats.dropped.count} issues`);
        logger.info(`   Releases:   ${finalStats.releases.count} synced`);
        logger.info(`   Duration:   ${Math.round(timing.durationMs / 1000)}s`);

        return {
            success   : true,
            summary   : "Synchronization complete",
            statistics: finalStats,
            timing
        };
    }
}

export default Neo.setupClass(SyncService);
