import aiConfig        from '../../mcp/server/github-workflow/config.mjs';
import Base            from '../../../src/core/Base.mjs';
import logger          from '../../mcp/server/github-workflow/logger.mjs';
import HealthService   from './HealthService.mjs';
import IssueSyncer     from './sync/IssueSyncer.mjs';
import MetadataManager from './sync/MetadataManager.mjs';
import ReleaseNotesSyncer from './sync/ReleaseNotesSyncer.mjs';
import DiscussionSyncer from './sync/DiscussionSyncer.mjs';
import PullRequestSyncer from './sync/PullRequestSyncer.mjs';
import RepositoryService from './RepositoryService.mjs';
import {exec} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);

const generatedSyncPaths = [
    'resources/content/issues/',
    'resources/content/discussions/',
    'resources/content/pulls/',
    'resources/content/release-notes/',
    'resources/content/archive/',
    'resources/content/_index.json',
    'resources/content/.sync-metadata.json'
];

const isGeneratedSyncFile = file => generatedSyncPaths.some(item =>
    item.endsWith('/') ? file.startsWith(item) : file === item
);

/**
 * @summary Orchestrates the bi-directional synchronization of GitHub issues and releases with local Markdown files.
 *
 * This service is the core engine for the GitHub sync workflow. Its primary responsibilities include:
 * - **Orchestration:** It calls specialized syncer modules (`IssueSyncer`, `ReleaseNotesSyncer`, `DiscussionSyncer`) in the
 *   correct order to ensure data integrity and minimize conflicts (e.g., push-then-pull).
 * - **Metadata Management:** It uses the `MetadataManager` to load metadata at the start of a sync
 *   and save the updated metadata at the end.
 *
 * The main entry point is the `runFullSync` method, which executes the entire orchestration sequence.
 *
 * @class Neo.ai.services.github-workflow.SyncService
 * @extends Neo.core.Base
 * @singleton
 */
class SyncService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.SyncService'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.SyncService',
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
     * 2.  Fetches and caches GitHub release data via `ReleaseNotesSyncer`.
     * 3.  Reconciles closed issue locations (archives stale issues) via `IssueSyncer`.
     * 4.  **Pushes** any local issue changes to GitHub via `IssueSyncer`.
     * 5.  **Pulls** the latest issue changes from GitHub via `IssueSyncer`.
     * 6.  Syncs release notes into local Markdown files via `ReleaseNotesSyncer`.
     * 7.  Syncs discussions into local Markdown files via `DiscussionSyncer`.
     * 8.  Syncs pull requests into local Markdown files via `PullRequestSyncer`.
     * 9.  Carries `metadata.discussions` + `metadata.pulls` onto `newMetadata` so the
     *     per-syncer cache populations survive `MetadataManager.save`.
     * 10. Caches releases in `newMetadata` for next run.
     * 11. Saves the updated, pruned metadata to disk via `MetadataManager`.
     * @returns {Promise<object>} A comprehensive object containing detailed statistics and timing
     * information about all operations performed during the sync.
     */
    async runFullSync() {
        const startTime = new Date();

        const metadata = await MetadataManager.load();

        // 1. Fetch releases first, as they are needed for issue archiving
        await ReleaseNotesSyncer.fetchAndCacheReleases(metadata);

        // 2. Reconcile closed issue locations - archive stale closed issues before pull
        const reconcileStats = await IssueSyncer.reconcileClosedIssueLocations(metadata);

        // 3. Push local changes
        const pushStats = await IssueSyncer.pushToGitHub(metadata);

        // 4. Pull remote changes
        const { newMetadata, stats: pullStats } = await IssueSyncer.pullFromGitHub(metadata);

        // 5. Sync release notes
        const releaseStats = await ReleaseNotesSyncer.syncNotes(metadata);

        // 6. Sync discussions
        const discussionStats = await DiscussionSyncer.syncDiscussions(metadata);

        // 7. Sync pull requests
        const pullStats2 = await PullRequestSyncer.syncPullRequests(metadata);

        // 8. Self-heal push failures: If a previously failed issue was successfully pulled, remove it from the failure list
        if (newMetadata.pushFailures?.length > 0) {
            newMetadata.pushFailures = newMetadata.pushFailures.filter(failedId => !newMetadata.issues[failedId]);
        }

        // 9. Carry over per-syncer metadata mutations.
        //
        // `newMetadata` is a fresh object constructed by `IssueSyncer.pullFromGitHub` carrying
        // only `{issues, pushFailures, lastSync}`. `DiscussionSyncer.syncDiscussions(metadata)`
        // and `PullRequestSyncer.syncPullRequests(metadata)` mutate the OLD `metadata` argument
        // (their `metadata.discussions` / `metadata.pulls` populations). Without explicit
        // carry-over, those mutations are dropped at `save(newMetadata)` and the on-disk diff
        // cache stays empty after every sync.
        //
        // This prevents a fresh metadata object from dropping discussion and PR cache populations
        // created by their dedicated syncers, which would otherwise leave the on-disk diff cache
        // empty after every sync.
        newMetadata.discussions = metadata.discussions || {};
        newMetadata.pulls       = metadata.pulls       || {};

        // 10. Cache releases in metadata for next run.
        newMetadata.releases            = ReleaseNotesSyncer.releases;
        newMetadata.releasesLastFetched = new Date().toISOString();

        // 11. Save metadata.
        await MetadataManager.save(newMetadata);

        if (aiConfig.pushToRepoAfterSync) {
            const {permission} = await RepositoryService.getViewerPermission();
            const writePermissions = ['ADMIN', 'MAINTAIN', 'WRITE'];

            if (writePermissions.includes(permission)) {
                try {
                    const cwd = aiConfig.projectRoot;
                    const {stdout} = await execAsync('git status --porcelain resources/content', {cwd});
                    const lines = stdout.trim().split('\n').filter(Boolean);

                    if (lines.length > 0) {
                        const onlyMetaChanged = lines.every(line => line.endsWith('.sync-metadata.json'));

                        if (onlyMetaChanged) {
                            logger.info('[SyncService] Only metadata changed. Rolling back metadata.');
                            await execAsync('git restore resources/content/.sync-metadata.json', {cwd});
                        } else {
                            logger.info('[SyncService] Detected real content changes. Committing and pushing.');
                            await execAsync('git add resources/content', {cwd});
                            const {stdout: stagedStdout} = await execAsync('git diff --cached --name-only', {cwd});
                            const nonSyncFiles = stagedStdout.trim().split('\n').filter(Boolean).filter(file =>
                                !isGeneratedSyncFile(file)
                            );

                            if (nonSyncFiles.length > 0) {
                                throw new Error(`Automated sync commit rejected: non-sync files are staged: ${nonSyncFiles.join(', ')}`);
                            }

                            // Automated generated-data commits bypass Husky; hooks are human-lane guards.
                            await execAsync('git commit --no-verify -m "chore: ticket sync [skip ci]"', {cwd});
                            await execAsync('git pull --rebase --autostash', {cwd});
                            await execAsync('git push', {cwd});
                            logger.info('[SyncService] Successfully pushed changes to GitHub.');
                        }
                    }
                } catch (error) {
                    logger.error('[SyncService] Auto-commit and push failed:', error.message);
                }
            } else {
                logger.info(`[SyncService] Skipping auto-push. Viewer permission '${permission}' lacks write access.`);
            }
        }

        // Stage 2: Ingest into Native Graph Database
        try {
            logger.info('[SyncService] Stage 2: Triggering Native Graph Issue Ingestion...');
            // Dynamic import rationale: `IssueIngestor` depends on `GraphService` and `StorageRouter` (SQLite/ChromaDB).
            // Dynamically importing it here prevents the `github-workflow` MCP server from loading heavy database
            // dependencies or crashing on boot if the `memory-core` DB is locked, maintaining strict process boundary isolation.
            const IssueIngestor = (await import('../../services/ingestion/IssueIngestor.mjs')).default;
            await IssueIngestor.ingestIssueStates();
            await IssueIngestor.ingestDiscussionStates();
            await IssueIngestor.ingestPullRequestFeedback();
            logger.info('[SyncService] Stage 2: Native Graph Issue Ingestion complete.');
        } catch (error) {
            logger.error(`[SyncService] Stage 2 Ingestion failed: ${error.message}`);
        }

        const endTime    = new Date();
        const durationMs = endTime - startTime;

        const finalStats = {
            reconciled  : reconcileStats,
            pushed      : pushStats,
            pulled      : pullStats.pulled,
            dropped     : pullStats.dropped,
            releases    : releaseStats,
            discussions : discussionStats,
            pulls       : pullStats2
        };

        const timing = {
            startTime: startTime.toISOString(),
            endTime  : endTime.toISOString(),
            durationMs
        };

        logger.info('✨ Sync Complete');
        logger.info(`   Reconciled:  ${finalStats.reconciled.count} issues archived`);
        logger.info(`   Pushed:      ${finalStats.pushed.count} issues`);
        logger.info(`   Pulled:      ${finalStats.pulled.count} issues (${finalStats.pulled.created} new, ${finalStats.pulled.updated} updated, ${finalStats.pulled.moved} moved)`);
        logger.info(`   Dropped:     ${finalStats.dropped.count} issues`);
        logger.info(`   Releases:    ${finalStats.releases.count} synced`);
        logger.info(`   Discussions: ${finalStats.discussions.count} synced`);
        logger.info(`   Pulls:       ${finalStats.pulls.count} synced`);
        logger.info(`   Duration:    ${Math.round(timing.durationMs / 1000)}s`);

        return {
            success   : true,
            summary   : "Synchronization complete",
            statistics: finalStats,
            timing
        };
    }

    /**
     * @summary Force-refetches the given issues from GitHub, bypassing delta-sync `updatedAt` gating.
     *
     * The sync engine normally relies on `issue.updatedAt` to decide which issues need a fresh
     * pull. That gate is blind to several classes of drift: `timelineItems` truncation past the
     * page cap, comment deletions (GitHub does not bump `updatedAt` on delete), and
     * relationship events where both sides fall outside the delta window. This endpoint is the
     * surgical recovery primitive — it force-refetches the listed issues, exhausts their full
     * timelineItems connection, rewrites the local markdown, and persists updated metadata.
     *
     * Intended callers: diagnostic scripts such as `ai/scripts/diagnostics/detectTruncatedTimelines.mjs` —
     * not the normal `runFullSync` flow. Keeps the delta-sync cost model intact for routine
     * syncs while giving admin tooling a narrow, auditable healing path.
     *
     * @param {object}   params
     * @param {number[]} params.numbers Issue numbers to force-refetch.
     * @returns {Promise<{refetched: {count: number, issues: number[]}, errors: Array<{issueNumber: number, error: string}>}>}
     */
    async refetchIssuesByNumber({numbers}) {
        if (!Array.isArray(numbers) || numbers.length === 0) {
            return {refetched: {count: 0, issues: []}, errors: []};
        }

        const metadata = await MetadataManager.load();
        const stats    = await IssueSyncer.refetchIssuesByNumber(numbers, metadata);
        await MetadataManager.save(metadata);

        logger.info(`✨ Force-refetch complete: ${stats.refetched.count}/${numbers.length} issues refetched`);

        return stats;
    }

    /**
     * Facade for the one-time archive re-bucket migration (#12194). Loads metadata, delegates to
     * `IssueSyncer.migrateArchiveBuckets`, then persists the updated metadata (unless `dryRun`).
     * Invoked out-of-band by `ai/scripts/migrations/rebucketArchive.mjs` — never the regular sync loop.
     * @param {object} [opts]
     * @param {boolean} [opts.dryRun=false] Preview the redistribution without moving files.
     * @returns {Promise<object>} The migration summary from `IssueSyncer.migrateArchiveBuckets`.
     */
    async migrateArchiveBuckets({dryRun = false} = {}) {
        const metadata = await MetadataManager.load();
        const result   = await IssueSyncer.migrateArchiveBuckets(metadata, {dryRun});
        if (!dryRun) await MetadataManager.save(metadata);
        return result;
    }
}

export default Neo.setupClass(SyncService);
