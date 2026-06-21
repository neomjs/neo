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
    'resources/content/.sync-metadata.json',
    'apps/portal/resources/data/',
    'apps/portal/sitemap.xml',
    'apps/portal/llms.txt'
];

const isGeneratedSyncFile = file => generatedSyncPaths.some(item =>
    item.endsWith('/') ? file.startsWith(item) : file === item
);

const generatedSyncStatusPaths = generatedSyncPaths.join(' ');

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
     * @summary Rebuilds Portal indexes and SEO artifacts after GitHub Workflow content emission.
     * @returns {Promise<Object>} Generated artifact paths.
     */
    async rebuildContentIndexesAndSeo() {
        const {rebuildContentIndexesAndSeo} = await import('../../../buildScripts/docs/rebuildContentIndexesAndSeo.mjs');

        return rebuildContentIndexesAndSeo({root: aiConfig.projectRoot});
    }

    /**
     * @summary Executes a git command inside the sync checkout.
     * @param {String} command Git command to run.
     * @param {String} cwd Working directory for the command.
     * @returns {Promise<{stdout: String, stderr: String}>}
     */
    async execGit(command, cwd) {
        return execAsync(command, {cwd});
    }

    /**
     * @summary Emits the generated GitHub Workflow content and derived Portal artifacts.
     *
     * This method orchestrates the generated-content half of the full sync in a specific order
     * to ensure data integrity and minimize conflicts. It is intentionally separated from the
     * git delivery step so a failed rebase can reset the checkout, re-emit the generated files,
     * and retry without leaving the repository mid-rebase.
     *
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
     * 12. Rebuilds Portal content indexes and SEO artifacts from the emitted content.
     * @returns {Promise<object>} Statistics for the emitted generated content.
     */
    async emitGeneratedContentAndDerive() {
        const metadata = await MetadataManager.load();

        // 1. Fetch releases first, as they are needed for issue archiving
        await ReleaseNotesSyncer.fetchAndCacheReleases(metadata);

        // 2. Reconcile closed issue locations - archive stale closed issues before pull
        const reconcileStats = await IssueSyncer.reconcileClosedIssueLocations(metadata);

        // 2b. Reconcile closed PULL locations — the sibling reconcile that was missing. The
        //     delta-only pull sync skips PRs untouched since the last cutoff, so old merged PRs marooned
        //     in active pulls/ are never re-bucketed; this per-sync reconcile (mirroring the issue one)
        //     archives them and keeps pulls archived going forward.
        const pullReconcileStats = await PullRequestSyncer.reconcileClosedPullRequestLocations(metadata);

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

        await this.rebuildContentIndexesAndSeo();

        return {
            reconcileStats,
            pullReconcileStats,
            pushStats,
            pullStats,
            releaseStats,
            discussionStats,
            pullStats2
        };
    }

    /**
     * @summary Commits, rebases, and pushes generated GitHub Workflow content changes.
     * @param {String} cwd Git checkout root.
     * @returns {Promise<Boolean>} `true` when a generated-data commit was pushed.
     */
    async commitRebaseAndPushGeneratedContent(cwd) {
        const {stdout} = await this.execGit(`git status --porcelain ${generatedSyncStatusPaths}`, cwd);
        const lines    = stdout.trim().split('\n').filter(Boolean);

        if (lines.length === 0) {
            return false;
        }

        const onlyMetaChanged = lines.every(line => line.endsWith('.sync-metadata.json'));

        if (onlyMetaChanged) {
            logger.info('[SyncService] Only metadata changed. Rolling back metadata.');
            await this.execGit('git restore resources/content/.sync-metadata.json', cwd);
            return false;
        }

        logger.info('[SyncService] Detected real content changes. Committing and pushing.');
        await this.execGit(`git add ${generatedSyncStatusPaths}`, cwd);
        const {stdout: stagedStdout} = await this.execGit('git diff --cached --name-only', cwd);
        const nonSyncFiles = stagedStdout.trim().split('\n').filter(Boolean).filter(file =>
            !isGeneratedSyncFile(file)
        );

        if (nonSyncFiles.length > 0) {
            throw new Error(`Automated sync commit rejected: non-sync files are staged: ${nonSyncFiles.join(', ')}`);
        }

        // Automated generated-data commits bypass Husky; hooks are human-lane guards.
        await this.execGit('git commit --no-verify -m "chore: ticket sync [skip ci]"', cwd);

        try {
            await this.execGit('git pull --rebase --autostash', cwd);
            await this.execGit('git push', cwd);
        } catch (error) {
            error.generatedSyncDeliveryFailure = true;
            throw error;
        }

        logger.info('[SyncService] Successfully pushed changes to GitHub.');

        return true;
    }

    /**
     * @summary Restores the generated-data checkout to the latest remote `dev` after delivery failure.
     * @param {String} cwd Git checkout root.
     * @returns {Promise<void>}
     */
    async recoverGeneratedContentCheckout(cwd) {
        try {
            await this.execGit('git rebase --abort', cwd);
        } catch (error) {
            logger.warn(`[SyncService] git rebase --abort did not complete: ${error.message}`);
        }

        await this.execGit('git fetch origin dev:refs/remotes/origin/dev', cwd);
        await this.execGit('git reset --hard origin/dev', cwd);
    }

    /**
     * @summary Delivers generated GitHub Workflow content to git with bounded rebase recovery.
     * @param {Function} rerunEmission Re-emits generated content after a reset.
     * @param {Number}   [maxAttempts=2] Maximum commit/rebase/push attempts.
     * @returns {Promise<void>}
     */
    async autoPushGeneratedContent({rerunEmission, maxAttempts = 2}) {
        if (aiConfig.pushToRepoAfterSync) {
            const {permission} = await RepositoryService.getViewerPermission();
            const writePermissions = ['ADMIN', 'MAINTAIN', 'WRITE'];

            if (writePermissions.includes(permission)) {
                const cwd = aiConfig.projectRoot;

                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    try {
                        await this.commitRebaseAndPushGeneratedContent(cwd);
                        return;
                    } catch (error) {
                        if (!error.generatedSyncDeliveryFailure) {
                            logger.error('[SyncService] Auto-commit and push failed:', error.message);
                            return;
                        }

                        if (attempt >= maxAttempts) {
                            logger.error(`[SyncService] Auto-push exhausted ${maxAttempts} attempts; recovering checkout before giving up: ${error.message}`);
                            await this.recoverGeneratedContentCheckout(cwd);
                            return;
                        }

                        logger.warn(`[SyncService] Auto-push attempt ${attempt} failed; aborting rebase, resetting to origin/dev, and re-emitting generated content before retry: ${error.message}`);
                        await this.recoverGeneratedContentCheckout(cwd);
                        await rerunEmission();
                    }
                }
            } else {
                logger.info(`[SyncService] Skipping auto-push. Viewer permission '${permission}' lacks write access.`);
            }
        }
    }

    /**
     * The main public entry point for the synchronization process.
     *
     * @returns {Promise<object>} A comprehensive object containing detailed statistics and timing
     * information about all operations performed during the sync.
     */
    async runFullSync() {
        const startTime = new Date();
        let syncStats   = await this.emitGeneratedContentAndDerive();

        await this.autoPushGeneratedContent({
            rerunEmission: async () => {
                syncStats = await this.emitGeneratedContentAndDerive();
            }
        });

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
            reconciled     : syncStats.reconcileStats,
            reconciledPulls: syncStats.pullReconcileStats,
            pushed         : syncStats.pushStats,
            pulled         : syncStats.pullStats.pulled,
            dropped        : syncStats.pullStats.dropped,
            releases       : syncStats.releaseStats,
            discussions    : syncStats.discussionStats,
            pulls          : syncStats.pullStats2
        };

        const timing = {
            startTime: startTime.toISOString(),
            endTime  : endTime.toISOString(),
            durationMs
        };

        logger.info('✨ Sync Complete');
        logger.info(`   Reconciled:  ${finalStats.reconciled.count} issues archived`);
        logger.info(`   Reconciled:  ${finalStats.reconciledPulls.count} pull requests archived`);
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
     * @summary Facade for the standalone pull-request force-refetch (archive-mirror drift healing).
     *
     * Loads metadata, delegates to `PullRequestSyncer.refetchPullsByNumber`, persists the updated
     * metadata. Bypasses the bulk delta-by-`updatedAt` gate so known-stale closed/merged PR mirrors
     * — which the pull-only bulk sync never re-pulls once their `updatedAt` is past the high-water
     * mark — can be re-rendered from current GitHub state. Invoked out-of-band by
     * `ai/scripts/migrations/refetchStalePulls.mjs` — never the regular `runFullSync` loop.
     *
     * @param {object}   params
     * @param {number[]} params.numbers Pull-request numbers to force-refetch.
     * @returns {Promise<{refetched: {count: number, pulls: number[]}, errors: Array<{prNumber: number, error: string}>}>}
     */
    async refetchPullsByNumber({numbers}) {
        if (!Array.isArray(numbers) || numbers.length === 0) {
            return {refetched: {count: 0, pulls: []}, errors: []};
        }

        const metadata = await MetadataManager.load();
        const stats    = await PullRequestSyncer.refetchPullsByNumber(numbers, metadata);
        await MetadataManager.save(metadata);

        logger.info(`✨ Force-refetch complete: ${stats.refetched.count}/${numbers.length} pull requests refetched`);

        return stats;
    }

    /**
     * @summary Facade for the standalone discussion force-refetch (archive-mirror drift healing).
     *
     * Loads metadata, delegates to `DiscussionSyncer.refetchDiscussionsByNumber`, persists the updated
     * metadata. Bypasses the bulk delta-by-`updatedAt` gate so known-stale discussion mirrors — which
     * the pull-only bulk sync never re-pulls once their `updatedAt` is past the high-water mark — can be
     * re-rendered from current GitHub state. Invoked out-of-band by
     * `ai/scripts/migrations/refetchStaleDiscussions.mjs` — never the regular `runFullSync` loop.
     *
     * @param {object}   params
     * @param {number[]} params.numbers Discussion numbers to force-refetch.
     * @returns {Promise<{refetched: {count: number, discussions: number[]}, errors: Array<{discussionNumber: number, error: string}>}>}
     */
    async refetchDiscussionsByNumber({numbers}) {
        if (!Array.isArray(numbers) || numbers.length === 0) {
            return {refetched: {count: 0, discussions: []}, errors: []};
        }

        const metadata = await MetadataManager.load();
        const stats    = await DiscussionSyncer.refetchDiscussionsByNumber(numbers, metadata);
        await MetadataManager.save(metadata);

        logger.info(`✨ Force-refetch complete: ${stats.refetched.count}/${numbers.length} discussions refetched`);

        return stats;
    }

    /**
     * Facade for the one-time archive re-bucket migration. Loads metadata, delegates to
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
