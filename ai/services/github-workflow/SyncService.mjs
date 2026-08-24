import aiConfig                from '../../mcp/server/github-workflow/config.mjs';
import Base                    from '../../../src/core/Base.mjs';
import logger                  from '../../mcp/server/github-workflow/logger.mjs';
import IssueSyncer             from './sync/IssueSyncer.mjs';
import MetadataManager         from './sync/MetadataManager.mjs';
import ReleaseNotesSyncer      from './sync/ReleaseNotesSyncer.mjs';
import DiscussionSyncer        from './sync/DiscussionSyncer.mjs';
import PullRequestSyncer       from './sync/PullRequestSyncer.mjs';
import reconcileActiveChunks   from './shared/reconcileActiveChunks.mjs';
import RepositoryService       from './RepositoryService.mjs';
import {formatIntegrityReport} from './shared/contentInventory.mjs';
import {exec}                  from 'child_process';
import path                    from 'path';
import {promisify}             from 'util';
// Pure predicate shared with the `lint-staged` guard, so the invariant has ONE definition and the two
// enforcement points cannot drift. Same direction as the `buildScripts/util/sanitizer.mjs` import in
// every `ai/mcp/server/*/mcp-server.mjs`.
import {findLogicalIdentityCollisions} from '../../../buildScripts/util/check-content-logical-identity.mjs';

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
     * **The facets are ISOLATED and persist independently.** Each runs through `#runFacet`, which saves
     * metadata the moment that facet completes and rolls back only that facet's own slices when it does
     * not. So one facet's failure neither discards the facets before it nor skips the facets after it.
     *
     * Scope note: that is BETWEEN-facet independence only. Within-facet page-level resume — a single
     * facet too large for one pass converging across runs — is deliberately not implemented here.
     *
     * **Isolation is sound only over the dependency graph.** Release history is a PREREQUISITE, not an
     * independent facet: `sortedReleases` is the bucketing reference every closed-artifact planner reads,
     * and an absent reference does not fail — it silently places closed artifacts in the active bucket.
     * The dependent facets are therefore gated, because catching a prerequisite failure and continuing is
     * how a caught error gets mistaken for an independent one.
     *
     * 1. Loads the persistent metadata via `MetadataManager` — one accumulator every facet mutates.
     * 2. Prerequisite `releases`: fetches release data and caches it (`ReleaseNotesSyncer`). Dependent
     *    facets run only if this advanced or a non-empty cached bucketing reference survived.
     * 3. Facet `issues`: reconciles closed issue locations, optionally **pushes** local changes, then
     *    **pulls** remote changes, merging the returned metadata into the accumulator (`IssueSyncer`).
     *    Scheduled CI emission disables the push half explicitly; the manual full-sync keeps it.
     * 4. Facet `releaseNotes`: syncs release notes into local Markdown (`ReleaseNotesSyncer`).
     * 5. Facet `discussions`: syncs discussions into local Markdown (`DiscussionSyncer`).
     * 6. Facet `pulls`: reconciles closed pull locations, syncs pulls, repairs duplicates, realigns
     *    `_index.json`, and takes the integrity verdict that decides whether the facet advances at all
     *    (`PullRequestSyncer`).
     * 7. Rebuilds Portal content indexes and SEO artifacts from whatever advanced.
     * 8. Throws one aggregate verdict naming every facet that did not advance — partial progress must
     *    never report as a clean run.
     * @param {Object} [options]
     * @param {Boolean} [options.pushLocalChanges=true] Whether locally-authored issue changes may
     * be pushed to GitHub before the pull. Scheduled CI emission passes `false` and remains read-only.
     * @returns {Promise<object>} Statistics for the emitted generated content, plus `facetOutcomes`.
     */
    async emitGeneratedContentAndDerive({pushLocalChanges = true} = {}) {
        const
            metadata = await MetadataManager.load(),
            outcomes = [],
            facet    = (name, owns, run) => this.#runFacet({metadata, name, outcomes, owns, run}),
            advanced = name => outcomes.some(outcome => outcome.name === name && outcome.advanced),
            // A facet that never RAN is still a facet that did not advance, and it has to appear in the
            // aggregate verdict — otherwise skipping a dependent silently shrinks the denominator and a
            // run that did four of six things reports as clean.
            skip     = (name, reason) => {
                outcomes.push({advanced: false, name, reason});
                logger.error(`[SyncService] facet "${name}" was SKIPPED: ${reason}`)
            };

        // Normalized ONCE, here, instead of coerced with `|| {}` at the save site. `load()` supplies all
        // four on both its paths, but a hand-written metadata file or a stub may not — and then every
        // facet downstream has to defend against `undefined`, which is how the empty-object guarantee
        // gets lost: one site forgets the coercion and a consumer reads `undefined` where the contract
        // promises `{}`. One normalization makes the accumulator's shape an invariant rather than a
        // habit, and it is also what lets `MetadataManager.save` read `metadata.issues` unguarded.
        metadata.discussions ??= {};
        metadata.issues      ??= {};
        metadata.pulls       ??= {};
        metadata.releases    ??= {};

        // 1. Release history is a PREREQUISITE, not an independent facet.
        //
        //    `ReleaseNotesSyncer.sortedReleases` is the bucketing reference for closed issues, pulls and
        //    discussions — its own JSDoc says so. Every one of those planners resolves `closedAt` against
        //    it, and an ABSENT reference does not fail: it resolves to "no release version applies", which
        //    places closed artifacts in the ACTIVE bucket. So a failed release fetch does not merely skip
        //    release notes, it silently mis-buckets the entire corpus — and per-facet persistence would
        //    then write that placement to disk and to metadata.
        //
        //    The old sequential chain was accidentally safe here: a release throw aborted everything
        //    downstream. Isolating the facets REMOVED that implicit guard, which is the trap in treating a
        //    caught failure as an independent one. Caught and independent are different properties, and
        //    isolation is only sound over the dependency graph.
        await facet('releases', ['releases', 'releasesLastFetched'], async () => {
            await ReleaseNotesSyncer.fetchAndCacheReleases(metadata);

            // Cached HERE rather than at the end of the chain. These two assignments used to live after
            // every facet had run, so any later throw discarded a fetch that had already succeeded and
            // the next run paid for it again.
            metadata.releases            = ReleaseNotesSyncer.releases;
            metadata.releasesLastFetched = new Date().toISOString()
        });

        // Satisfiable two ways, because a fetch failure is not the same as an absent reference:
        // the facet advanced, OR a non-empty reference survived from the cached fast-path that runs
        // before the network call. An EMPTY array after a SUCCESSFUL fetch is legitimate — a repo with no
        // releases genuinely has nothing to bucket into — which is why this checks the failure case
        // against the reference rather than against emptiness alone.
        const bucketingReady = advanced('releases') ||
            (Array.isArray(ReleaseNotesSyncer.sortedReleases) && ReleaseNotesSyncer.sortedReleases.length > 0);

        // Every facet below places closed artifacts by release, so none of them may run — or persist as
        // advanced — without the reference. Skipping is the safe direction: a facet that did not run leaves
        // its previous high-water mark intact and retries next run, whereas one that ran without the
        // reference writes wrong placements that look like progress.
        const dependentFacet = (name, owns, run) => bucketingReady
            ? facet(name, owns, run)
            : Promise.resolve(skip(name, 'release history unavailable and no cached bucketing reference — ' +
                'closed artifacts would be placed in the active bucket'));

        // 2 + 3 + 4. Reconcile closed issue locations (archiving stale closed issues BEFORE the pull),
        //     push local changes, then pull remote changes. One facet, because the ordering between them
        //     is load-bearing: splitting them would let a run persist a pull whose reconcile never ran.
        let reconcileStats = null,
            pushStats      = null,
            pullStats      = null;

        await dependentFacet('issues', ['issues', 'pushFailures', 'lastSync'], async () => {
            reconcileStats = await IssueSyncer.reconcileClosedIssueLocations(metadata);
            if (pushLocalChanges) {
                pushStats = await IssueSyncer.pushToGitHub(metadata)
            } else {
                pushStats = {skipped: true, reason: 'pull-only generated-content emission'};
                logger.info('[SyncService] Pull-only emission: skipping local-to-GitHub issue push.')
            }

            const {newMetadata, stats} = await IssueSyncer.pullFromGitHub(metadata);

            pullStats = stats;

            // MERGED into the accumulator rather than replacing it. `pullFromGitHub` returns a fresh
            // object carrying only `{issues, pushFailures, lastSync}`, and the old chain saved THAT
            // object at the very end — so discussion and pull populations had to be hand-copied back
            // onto it or they were silently dropped. Merging makes the carry-over structural: a syncer
            // that populates a new slice cannot lose it to a save that does not know the slice exists.
            Object.assign(metadata, newMetadata);

            // Self-heal push failures: a previously failed issue that pulled successfully is not failing.
            if (metadata.pushFailures?.length > 0) {
                metadata.pushFailures = metadata.pushFailures.filter(failedId => !metadata.issues[failedId])
            }
        });

        // 5. Sync release notes
        const releaseStats = await dependentFacet('releaseNotes', ['releases'], () => ReleaseNotesSyncer.syncNotes(metadata));

        // 6. Sync discussions
        const discussionStats = await dependentFacet('discussions', ['discussions'], () => DiscussionSyncer.syncDiscussions(metadata));

        // 7. The pull facet: reconcile, sync, repair, project, and the integrity verdict that decides
        //    whether any of it counts. All one facet because 7c's abort must revert THIS facet and only
        //    this facet — the whole point of the verdict is that a pull corpus measured broken does not
        //    advance, and the whole point of the isolation is that it no longer takes the other facets
        //    down with it.
        let pullReconcileStats = null,
            pullDuplicateStats = null,
            pullIndexStats     = null,
            pullIntegrity      = null;

        const pullStats2 = await dependentFacet('pulls', ['pulls'], async () => {
            // 7-a. Reconcile closed PULL locations — the sibling reconcile that was missing. The
            //      delta-only pull sync skips PRs untouched since the last cutoff, so old merged PRs
            //      marooned in active pulls/ are never re-bucketed; this per-sync reconcile (mirroring
            //      the issue one) archives them and keeps pulls archived going forward. It ran before
            //      the ISSUE push/pull previously; it belongs with the pull corpus it reconciles, and
            //      what its own rationale requires is only that it precede `syncPullRequests`.
            pullReconcileStats = await PullRequestSyncer.reconcileClosedPullRequestLocations(metadata);

            const stats = await PullRequestSyncer.syncPullRequests(metadata);

            // 7-b. Restore any pull request owning more than one artifact from canonical GitHub state.
            //      A divergent pair cannot be resolved locally — both files are real renderings and
            //      nothing on disk says which is current — so neither is trusted and the artifact is
            //      re-derived from the source of truth. Runs BEFORE the index realign so the restored
            //      placement is what gets indexed, and is a no-op on a corpus with no duplicates.
            pullDuplicateStats = await PullRequestSyncer.repairDuplicateArtifacts(metadata);

            // 7-c. Realign `_index.json` with the pull corpus now that placement is final for this run.
            //      Preventing new drift does not remove old drift: entries that went stale when a move
            //      did not carry its upsert name files that are ALREADY archived, so the relocate pass
            //      never revisits them and the delta sync never fetches them — no existing mechanism
            //      could ever have healed them. The index is a projection of the corpus, so this
            //      recomputes it from disk. Idempotent and silent on a healthy corpus (it upserts only
            //      entries that disagree), so the generated-content diff stays empty when nothing drifted.
            pullIndexStats = await PullRequestSyncer.reconcilePullRequestIndex();

            // 7-d. One terminal integrity verdict, CONSUMED. Every pass above reports its own outcome and
            //      degrades softly on its own terms, which is exactly how a corpus reaches the commit with
            //      each step reporting success and the whole known-broken: a repair that fails logs and
            //      returns, an unrepaired duplicate stays unindexed, and nothing downstream asks. So the
            //      verdict is taken AFTER placement, restoration and projection are final, and it aborts —
            //      before this facet's metadata save, before the derive, before the auto-push. Committing
            //      a corpus we have already measured as broken is worse than failing the run: the run can
            //      be retried, but a generated commit is what every consumer then reads as truth.
            //
            //      What ISOLATION changed and did not change: the abort no longer discards the issue,
            //      release and discussion facets that already succeeded. It still prevents this facet
            //      from advancing, so the next run re-fetches exactly these pulls. The `_index.json`
            //      realign above has already touched disk by this point and is not rolled back — that is
            //      acceptable only because it is idempotent by construction (its own note above), and it
            //      is the reason the verdict must stay inside this facet rather than becoming advisory.
            pullIntegrity = await PullRequestSyncer.verifyCorpusIntegrity();

            if (pullDuplicateStats.failed.length > 0 || !pullIntegrity.ok) {
                logger.error(formatIntegrityReport(pullIntegrity));

                throw new Error(
                    'Pull corpus integrity is not clean after repair — refusing to commit generated content. ' +
                    `stale=${pullIntegrity.staleIndexEntries.length} ` +
                    `inconsistent=${pullIntegrity.inconsistentIndexEntries.length} ` +
                    `duplicateIndexRows=${pullIntegrity.duplicateIndexEntryIds.length} ` +
                    `unindexed=${pullIntegrity.unindexedIds.length} ` +
                    `divergentDuplicates=${pullIntegrity.divergentDuplicateIds.length} ` +
                    `failedRepairs=${pullDuplicateStats.failed.length}`
                );
            }

            return stats
        });

        // 7.5 Ordinal-100 enforcement: re-rank the full active corpus so the projection below reads
        //     exact-100 folders. Position-dependent chunking drifts whenever the delta sync re-places
        //     only the items it touched; this idempotent pass belongs HERE, with the corpus writer —
        //     the emitter leaves the corpus canonical, so no reader (the portal index rebuild, release
        //     prepare, the data-sync pipeline's CLI stage) has to reach across the engine↔Brain
        //     boundary to repair layout it never wrote. The `issueSync` block is read at the use site;
        //     only its `contentRoot` leaf is consumed.
        await reconcileActiveChunks(aiConfig.issueSync, {type: 'pulls',       filePrefix: 'pr-'});
        await reconcileActiveChunks(aiConfig.issueSync, {type: 'issues',      filePrefix: 'issue-'});
        await reconcileActiveChunks(aiConfig.issueSync, {type: 'discussions', filePrefix: 'discussion-'});

        // 8. Derive the portal projection from whatever DID advance. The indexes are a projection of the
        //    corpus on disk, so a partially-advanced corpus derives a correspondingly partial projection
        //    rather than a wrong one — and running it before the verdict below means a facet failure does
        //    not also strand the facets that succeeded without their indexes.
        await this.rebuildContentIndexesAndSeo();

        const failedFacets = outcomes.filter(outcome => !outcome.advanced);

        // 9. One aggregate verdict, AFTER every facet has had its turn.
        //
        //    Partial progress is the point — a corpus too large for one pass must converge across runs
        //    rather than failing whole — but a partial run must never REPORT as a clean one. Exiting 0
        //    here would trade total loss for silent loss: the corpus would look synced while a facet sat
        //    stale, and no consumer could tell. So the progress is partial and the verdict is not.
        if (failedFacets.length > 0) {
            throw new Error(
                `[SyncService] ${failedFacets.length} of ${outcomes.length} sync facets did not advance: ` +
                failedFacets.map(({name, reason}) => `${name} (${reason})`).join('; ') + '. ' +
                'Facets that advanced were persisted as they completed; the failed facets kept their ' +
                'previous high-water marks, so the next run retries exactly those and nothing else.'
            );
        }

        return {
            reconcileStats,
            pullReconcileStats,
            pushStats,
            pullStats,
            releaseStats,
            discussionStats,
            pullStats2,
            pullDuplicateStats,
            pullIndexStats,
            pullIntegrity,
            facetOutcomes: outcomes
        };
    }

    /**
     * @summary Runs one sync facet in isolation — persisting its progress the moment it completes, and
     * rolling back only ITS OWN metadata slices when it fails.
     *
     * The chain this replaces was a bare sequential `await` list with a single `MetadataManager.save`
     * at the very end. One facet throwing therefore discarded every facet that had already succeeded
     * AND skipped every facet after it: a deterministic failure in discussions meant pull requests were
     * never fetched at all and the run wrote nothing, so consecutive runs made no progress rather than
     * partial progress. With a deterministic trigger that is not "slowly falling behind" — it is a
     * corpus frozen indefinitely while every individual facet's own code works correctly.
     *
     * Rollback is per-SLICE, not whole-object, because facets mutate the shared accumulator in place.
     * Without restoring its slices, a facet that failed its integrity verdict would still have its
     * partial mutations persisted by the NEXT facet's save — which would make "this facet advanced" and
     * "this facet did not" inseparable claims, and publish exactly the broken corpus the verdict exists
     * to withhold.
     *
     * @param {Object}   args
     * @param {Object}   args.metadata The shared accumulator, mutated in place by the facet.
     * @param {String}   args.name Facet name, used in the log line and the aggregate failure.
     * @param {Object[]} args.outcomes Accumulator for per-facet results.
     * @param {String[]} args.owns The metadata keys this facet may advance; restored verbatim on failure.
     * @param {Function} args.run The facet body.
     * @returns {Promise<*>} The facet's return value, or `null` when it did not advance.
     * @private
     */
    async #runFacet({metadata, name, outcomes, owns, run}) {
        // A Map rather than an object literal so an ABSENT key snapshots as absent instead of being
        // fabricated into `null` — `MetadataManager.save` reads `metadata.issues` unguarded, and a
        // restore that invented a value would be a different bug than the one being prevented.
        const snapshot = new Map(owns.map(key => [key, structuredClone(metadata[key])]));

        try {
            const value = await run();

            await MetadataManager.save(metadata);
            outcomes.push({advanced: true, name});

            return value
        } catch (error) {
            owns.forEach(key => {
                metadata[key] = snapshot.get(key)
            });

            outcomes.push({advanced: false, name, reason: error.message});
            logger.error(`[SyncService] facet "${name}" did not advance; its previous state is kept: ${error.message}`);

            return null
        }
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

        // A metadata-only diff is SEMANTIC state, not churn, so it is delivered like any other change.
        //
        // Telemetry suppression has exactly one owner: `MetadataManager.save()` returns without writing
        // when the only difference is root-level `lastSync` / `releasesLastFetched`. So a dirty
        // `.sync-metadata.json` differs in something beyond telemetry BY CONSTRUCTION — a facet
        // high-water mark, a rebucketed path, a content hash. A second guard here that rolled the file
        // back could only ever discard that, and it did: the rollback predates the `save()` suppression
        // and was never retired once the suppression subsumed its purpose.
        //
        // The case it stranded is not an edge case, it is the FIRST run of any new high-water field. The
        // corpus is already current, so no Markdown moves and the metadata carries the whole advance
        // alone — a metadata-only diff. Rolling it back means the next run recomputes the cutoff from
        // nothing and re-pages the entire history, forever, because every run reproduces that state.
        logger.info(`[SyncService] Detected ${lines.length} generated-content change(s). Committing and pushing.`);
        await this.execGit(`git add ${generatedSyncStatusPaths}`, cwd);
        const {stdout: stagedStdout} = await this.execGit('git diff --cached --name-only', cwd);
        const nonSyncFiles           = stagedStdout.trim().split('\n').filter(Boolean).filter(file =>
            !isGeneratedSyncFile(file)
        );

        if (nonSyncFiles.length > 0) {
            throw new Error(`Automated sync commit rejected: non-sync files are staged: ${nonSyncFiles.join(', ')}`);
        }

        // The logical-identity invariant has to be asserted HERE, and this is the only place it can be.
        // The `lint-staged` guard cannot see this commit: the `--no-verify` below is load-bearing and
        // correct — generated content legitimately carries trailing whitespace that the whitespace hook
        // rejects — so it disables every git hook, this one included. A corpus invariant enforced only
        // by a hook the sole automated committer bypasses is not enforced at all.
        //
        // Scoped to the STAGED set, not the whole corpus: a collision this run did not touch is not this
        // commit's to fix, and a full-corpus assertion would refuse every sync until an unrelated repair
        // lands — turning a guard against new damage into a block on all progress.
        const collisions = findLogicalIdentityCollisions({
            archiveRoot: path.join(cwd, 'resources/content/archive'),
            targets    : stagedStdout.trim().split('\n').filter(Boolean).map(file => path.join(cwd, file))
        });

        if (collisions.length > 0) {
            throw new Error(
                'Automated sync commit rejected: this run would commit two artifacts claiming one logical ' +
                `name — ${collisions.map(item => `${item.key} (${item.paths.length} copies)`).join('; ')}. ` +
                'Embedding refuses this state, so committing it stalls Knowledge Base ingestion for the ' +
                'whole corpus. Repair via PullRequestSyncer.repairDuplicateArtifacts before retrying.'
            );
        }

        // Automated generated-data commits (neo repo): --no-verify because generated content fails whitespace
        // hooks. NEO_SKIP_TICKET_ARCHAEOLOGY=1 is the explicit archaeology-gate exemption for this generated-data
        // class — declares intent + future-proofs (co-exists with --no-verify, still required for whitespace).
        await this.execGit('NEO_SKIP_TICKET_ARCHAEOLOGY=1 git commit --no-verify -m "chore: ticket sync [skip ci]"', cwd);

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
            const {permission}     = await RepositoryService.getViewerPermission();
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
        let   syncStats = await this.emitGeneratedContentAndDerive();

        await this.autoPushGeneratedContent({
            rerunEmission: async () => {
                syncStats = await this.emitGeneratedContentAndDerive();
            }
        });

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
