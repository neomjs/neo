import { setup } from '../../../../setup.mjs';

const appName = 'SyncServiceStage2Test';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import fs             from 'fs/promises';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe('SyncService — Stage 2 Ingestion', () => {
    test.describe.configure({mode: 'serial'});

    let SyncService;
    let IssueSyncer;
    let ReleaseNotesSyncer;
    let DiscussionSyncer;
    let PullRequestSyncer;
    let GraphqlService;
    let MetadataManager;
    let IssueIngestor;
    let RepositoryService;

    let originalReconcileArchived;
    let originalPush;
    let originalPull;
    let originalFetchReleases;
    let originalSyncNotes;
    // Captured because the prerequisite witnesses MUTATE it, and it lives on a singleton — an
    // unrestored `sortedReleases` leaks into every later test in this serial file and into any other
    // spec sharing the worker.
    let originalSortedReleases;
    let originalSyncDiscussions;
    let originalSyncPullRequests;
    let originalReconcileClosedPulls;
    let originalRepairPullDuplicates;
    let originalReconcilePullIndex;
    let originalVerifyPullIntegrity;
    let originalGetViewerPermission;
    let originalRebuildContentIndexesAndSeo;
    let originalExecGit;

    let originalIngestIssueStates;
    let originalIngestDiscussionStates;
    let originalIngestPullRequestFeedback;
    let originalLoadMetadata;
    let originalSaveMetadata;

    let stage2Calls = {
        issueStates        : 0,
        discussionStates   : 0,
        pullRequestFeedback: 0
    };

    test.beforeAll(async () => {
        // Pre-load the unified services bundle to ensure correct initialization order
        // and avoid ReferenceErrors from circular dependencies in dynamic imports.
        await import('../../../../../../ai/services.mjs');

        SyncService = (await import('../../../../../../ai/services/github-workflow/SyncService.mjs')).default;
        IssueSyncer = (await import('../../../../../../ai/services/github-workflow/sync/IssueSyncer.mjs')).default;
        ReleaseNotesSyncer = (await import('../../../../../../ai/services/github-workflow/sync/ReleaseNotesSyncer.mjs')).default;
        DiscussionSyncer = (await import('../../../../../../ai/services/github-workflow/sync/DiscussionSyncer.mjs')).default;
        PullRequestSyncer = (await import('../../../../../../ai/services/github-workflow/sync/PullRequestSyncer.mjs')).default;
        GraphqlService = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        MetadataManager = (await import('../../../../../../ai/services/github-workflow/sync/MetadataManager.mjs')).default;
        IssueIngestor = (await import('../../../../../../ai/services/ingestion/IssueIngestor.mjs')).default;
        RepositoryService = (await import('../../../../../../ai/services/github-workflow/RepositoryService.mjs')).default;
    });

    test.beforeEach(() => {
        stage2Calls = { issueStates: 0, discussionStates: 0, pullRequestFeedback: 0 };

        originalReconcileArchived = IssueSyncer.reconcileClosedIssueLocations;
        originalPush = IssueSyncer.pushToGitHub;
        originalPull = IssueSyncer.pullFromGitHub;
        originalFetchReleases = ReleaseNotesSyncer.fetchAndCacheReleases;
        originalSyncNotes = ReleaseNotesSyncer.syncNotes;
        originalSortedReleases = ReleaseNotesSyncer.sortedReleases;
        originalSyncDiscussions = DiscussionSyncer.syncDiscussions;
        originalSyncPullRequests = PullRequestSyncer.syncPullRequests;
        originalReconcileClosedPulls = PullRequestSyncer.reconcileClosedPullRequestLocations;
        originalRepairPullDuplicates = PullRequestSyncer.repairDuplicateArtifacts;
        originalReconcilePullIndex = PullRequestSyncer.reconcilePullRequestIndex;
        originalVerifyPullIntegrity = PullRequestSyncer.verifyCorpusIntegrity;
        originalGetViewerPermission = RepositoryService.getViewerPermission;
        originalRebuildContentIndexesAndSeo = SyncService.rebuildContentIndexesAndSeo;
        originalExecGit = SyncService.execGit;
        originalLoadMetadata = MetadataManager.load;
        originalSaveMetadata = MetadataManager.save;

        IssueSyncer.reconcileClosedIssueLocations = async () => ({ count: 0 });
        IssueSyncer.pushToGitHub = async () => ({ count: 0 });
        IssueSyncer.pullFromGitHub = async (md) => ({ newMetadata: md || { issues: {}, releases: {}, discussions: {}, pullRequests: {} }, stats: { pulled: { count: 0, created: 0, updated: 0, moved: 0 }, dropped: { count: 0 } } });
        ReleaseNotesSyncer.fetchAndCacheReleases = async () => {};
        ReleaseNotesSyncer.syncNotes = async () => ({ count: 0 });
        DiscussionSyncer.syncDiscussions = async () => ({ count: 0 });
        PullRequestSyncer.syncPullRequests = async () => ({ count: 0 });
        // These specs exercise Stage-2 SEQUENCING, so every orchestration step is stubbed — otherwise
        // `runFullSync` runs the real pass against the real `resources/content`, which is a tracked
        // generated corpus. Both pull passes below were previously unstubbed and merely appeared
        // harmless: the relocate pass bails early because `fetchAndCacheReleases` is stubbed to a
        // no-op and it refuses to bucket without releases. That is luck, not isolation — the index
        // reconcile needs no network and would rewrite thousands of live entries from a unit run.
        PullRequestSyncer.reconcileClosedPullRequestLocations = async () => ({ count: 0, pullRequests: [], indexed: 0 });
        PullRequestSyncer.repairDuplicateArtifacts = async () => ({ repaired: [], removed: 0, failed: [] });
        PullRequestSyncer.reconcilePullRequestIndex = async () => ({ reindexed: 0, unchanged: 0, removed: 0, skippedAmbiguous: [] });
        PullRequestSyncer.verifyCorpusIntegrity = async () => ({ ok: true, staleIndexEntries: [], inconsistentIndexEntries: [], duplicateIndexEntryIds: [], unindexedIds: [], identicalDuplicateIds: [], divergentDuplicateIds: [] });
        RepositoryService.getViewerPermission = async () => ({ permission: 'READ' }); // Skip git commands
        SyncService.rebuildContentIndexesAndSeo = async () => ({});
        MetadataManager.load = async () => ({ issues: {}, releases: {}, discussions: {}, pullRequests: {} });
        MetadataManager.save = async () => {};

        originalIngestIssueStates = IssueIngestor.ingestIssueStates;
        originalIngestDiscussionStates = IssueIngestor.ingestDiscussionStates;
        originalIngestPullRequestFeedback = IssueIngestor.ingestPullRequestFeedback;

        IssueIngestor.ingestIssueStates = async () => { stage2Calls.issueStates++; };
        IssueIngestor.ingestDiscussionStates = async () => { stage2Calls.discussionStates++; };
        IssueIngestor.ingestPullRequestFeedback = async () => { stage2Calls.pullRequestFeedback++; };
    });

    test.afterEach(() => {
        IssueSyncer.reconcileClosedIssueLocations = originalReconcileArchived;
        IssueSyncer.pushToGitHub = originalPush;
        IssueSyncer.pullFromGitHub = originalPull;
        ReleaseNotesSyncer.fetchAndCacheReleases = originalFetchReleases;
        ReleaseNotesSyncer.syncNotes = originalSyncNotes;
        ReleaseNotesSyncer.sortedReleases = originalSortedReleases;
        DiscussionSyncer.syncDiscussions = originalSyncDiscussions;
        PullRequestSyncer.syncPullRequests = originalSyncPullRequests;
        PullRequestSyncer.reconcileClosedPullRequestLocations = originalReconcileClosedPulls;
        PullRequestSyncer.repairDuplicateArtifacts = originalRepairPullDuplicates;
        PullRequestSyncer.reconcilePullRequestIndex = originalReconcilePullIndex;
        PullRequestSyncer.verifyCorpusIntegrity = originalVerifyPullIntegrity;
        RepositoryService.getViewerPermission = originalGetViewerPermission;
        SyncService.rebuildContentIndexesAndSeo = originalRebuildContentIndexesAndSeo;
        SyncService.execGit = originalExecGit;
        MetadataManager.load = originalLoadMetadata;
        MetadataManager.save = originalSaveMetadata;

        IssueIngestor.ingestIssueStates = originalIngestIssueStates;
        IssueIngestor.ingestDiscussionStates = originalIngestDiscussionStates;
        IssueIngestor.ingestPullRequestFeedback = originalIngestPullRequestFeedback;
    });

    test('an unclean pull-corpus verdict NEVER reaches the auto-push, and the pull facet does not advance', async () => {
        // Every pass reports its own outcome and degrades softly on its own terms, which is exactly
        // how a corpus reaches the commit with each step reporting success and the whole known-broken.
        // The verdict is only worth taking if something consumes it: a generated commit is what every
        // consumer then reads as truth, and unlike a failed run it cannot be retried away.
        //
        // This test previously asserted `order === []` — that NOTHING ran, including the metadata save
        // and the derive. That was the whole-run abort, and it is deliberately narrowed: a failure in one
        // facet must no longer discard the facets that already succeeded, or a deterministic failure
        // anywhere freezes the entire corpus indefinitely.
        //
        // So the assertion moves to the property that actually protects consumers, and it is STRONGER
        // for being explicit: **no auto-push**, and **the pull slice does not advance**. A generated
        // commit still requires every facet clean, because the aggregate verdict throws before delivery.
        const
            order      = [],
            savedPulls = [];

        MetadataManager.save = async metadata => {
            order.push('metadata-save');
            savedPulls.push(structuredClone(metadata.pulls ?? null))
        };
        SyncService.rebuildContentIndexesAndSeo = async () => { order.push('derive') };
        RepositoryService.getViewerPermission = async () => { order.push('permission-check'); return {permission: 'READ'} };

        PullRequestSyncer.verifyCorpusIntegrity = async () => ({
            ok                      : false,
            staleIndexEntries       : [{id: 9537}],
            inconsistentIndexEntries: [],
            duplicateIndexEntryIds  : [],
            unindexedIds            : [],
            identicalDuplicateIds   : [],
            divergentDuplicateIds   : [10124]
        });

        await expect(SyncService.runFullSync()).rejects.toThrow(/integrity is not clean/);

        // THE invariant: delivery is never reached, so a corpus measured broken is never committed.
        expect(order).not.toContain('permission-check');

        // The pull facet is the one that failed, so it contributed no save of its own. Any save that did
        // happen came from an earlier facet — which is the point — and none of them may carry pull
        // mutations made after the last good state.
        expect(savedPulls.every(pulls => !pulls || !Object.keys(pulls).length)).toBe(true);
    });

    test('a FAILED duplicate repair aborts too, even when the verdict is otherwise clean', async () => {
        // The repair reports its failures rather than throwing, so a soft-failed restoration would
        // otherwise sail past a verdict that cannot see it.
        //
        // Narrowed with its sibling above: the abort is now facet-local, so the assertion is that
        // DELIVERY is never reached, not that no facet before it persisted.
        const order = [];

        MetadataManager.save = async () => { order.push('metadata-save') };
        RepositoryService.getViewerPermission = async () => { order.push('permission-check'); return {permission: 'READ'} };
        PullRequestSyncer.repairDuplicateArtifacts = async () => ({
            repaired: [], removed: 0, failed: [{id: 10124, reason: 'network down'}]
        });

        await expect(SyncService.runFullSync()).rejects.toThrow(/integrity is not clean/);
        expect(order).not.toContain('permission-check');
    });

    test('a clean verdict lets the run proceed — the gate can PASS', async () => {
        // Otherwise the two aborts above prove only that runFullSync can throw.
        const result = await SyncService.runFullSync();

        expect(result.success).toBe(true);
        expect(result.syncStats ?? result).toBeTruthy();
    });

    test('pull-only emission skips local-to-GitHub issue mutation but still pulls (#15977)', async () => {
        let pushCalls = 0,
            pullCalls = 0;

        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-05-10T00:00:00Z'}];
        IssueSyncer.pushToGitHub = async () => { pushCalls++; return {count: 0} };
        IssueSyncer.pullFromGitHub = async metadata => {
            pullCalls++;
            return {
                newMetadata: metadata,
                stats      : {pulled: {count: 0, created: 0, updated: 0, moved: 0}, dropped: {count: 0}}
            }
        };

        const result = await SyncService.emitGeneratedContentAndDerive({pushLocalChanges: false});

        expect(pushCalls).toBe(0);
        expect(pullCalls).toBe(1);
        expect(result.pushStats).toEqual({
            skipped: true,
            reason : 'pull-only generated-content emission'
        })
    });

    test('runFullSync never invokes Native Graph projection — the container-plane owner is exclusive (#17627)', async () => {
        const result = await SyncService.runFullSync();

        expect(result.success).toBe(true);
        expect(stage2Calls.issueStates).toBe(0);
        expect(stage2Calls.discussionStates).toBe(0);
        expect(stage2Calls.pullRequestFeedback).toBe(0);
    });

    test('runFullSync rebuilds content indexes and SEO before the auto-push status check (#13260)', async () => {
        const order = [];

        MetadataManager.save = async () => { order.push('metadata-save'); };
        SyncService.rebuildContentIndexesAndSeo = async () => { order.push('derive'); };
        RepositoryService.getViewerPermission = async () => {
            order.push('permission-check');
            return {permission: 'READ'};
        };

        const result = await SyncService.runFullSync();

        expect(result.success).toBe(true);

        // The claim under test is an ORDERING — persist, then derive, then check push permission — and it
        // is asserted as one here rather than as an exact three-element sequence. The save count is no
        // longer one: each facet persists as it completes, so a corpus too large for a single pass
        // converges across runs instead of failing whole. Pinning the count would make this test fail on
        // every future facet while saying nothing about the order it exists to protect.
        const
            lastSave    = order.lastIndexOf('metadata-save'),
            firstDerive = order.indexOf('derive'),
            pushCheck   = order.indexOf('permission-check');

        expect(lastSave).toBeGreaterThanOrEqual(0);
        expect(lastSave).toBeLessThan(firstDerive);
        expect(firstDerive).toBeLessThan(pushCheck);
        expect(order.filter(step => step === 'derive')).toHaveLength(1);
        expect(order.filter(step => step === 'permission-check')).toHaveLength(1);
    });

    test('runFullSync rejects before auto-push and Stage 2 when the post-sync derive fails (#13260)', async () => {
        let permissionChecks = 0;

        SyncService.rebuildContentIndexesAndSeo = async () => {
            throw new Error('derive failed');
        };
        RepositoryService.getViewerPermission = async () => {
            permissionChecks++;
            return {permission: 'WRITE'};
        };

        await expect(SyncService.runFullSync()).rejects.toThrow('derive failed');

        expect(permissionChecks).toBe(0);
        expect(stage2Calls).toEqual({
            issueStates        : 0,
            discussionStates   : 0,
            pullRequestFeedback: 0
        });
    });

    test('auto-commit allowlist includes content-derived Portal index and SEO artifacts (#13260)', async () => {
        const source = await fs.readFile(path.resolve(process.cwd(), 'ai/services/github-workflow/SyncService.mjs'), 'utf8');

        expect(source).toContain("'apps/portal/resources/data/'");
        expect(source).toContain("'apps/portal/sitemap.xml'");
        expect(source).toContain("'apps/portal/llms.txt'");
        expect(source).toContain('git status --porcelain ${generatedSyncStatusPaths}');
        expect(source).toContain('git add ${generatedSyncStatusPaths}');
    });

    test('auto-push aborts failed rebase, resets, re-emits, and retries once (#13798)', async () => {
        const commands       = [];
        let   pullRuns       = 0;
        let   saves          = 0;
        let   derives        = 0;
        let   rebaseAttempts = 0;

        RepositoryService.getViewerPermission = async () => ({permission: 'WRITE'});

        IssueSyncer.pullFromGitHub = async (md) => {
            pullRuns++;

            return {
                newMetadata: {
                    ...(md || {}),
                    issues      : {},
                    pushFailures: [],
                    lastSync    : `run-${pullRuns}`
                },
                stats: {
                    pulled : {count: pullRuns, created: 0, updated: 0, moved: 0},
                    dropped: {count: 0}
                }
            };
        };

        MetadataManager.save = async () => {
            saves++;
        };

        SyncService.rebuildContentIndexesAndSeo = async () => {
            derives++;
        };

        SyncService.execGit = async (command) => {
            commands.push(command);

            if (command.startsWith('git status --porcelain ')) {
                return {stdout: ' M resources/content/issues/active/issue-13798.md\n', stderr: ''};
            }

            if (command === 'git diff --cached --name-only') {
                return {stdout: 'resources/content/issues/active/issue-13798.md\n', stderr: ''};
            }

            if (command === 'git pull --rebase --autostash') {
                rebaseAttempts++;

                if (rebaseAttempts === 1) {
                    throw new Error('simulated rebase conflict');
                }
            }

            return {stdout: '', stderr: ''};
        };

        const result = await SyncService.runFullSync();

        expect(result.success).toBe(true);
        expect(result.statistics.pulled.count).toBe(2);
        expect(pullRuns).toBe(2);
        // NOT pinned to the pass count: each facet persists as it completes, so a pass makes several
        // saves. `derives` is the pass counter, so `saves > derives` asserts per-facet persistence is in
        // force without hardcoding how many facets exist.
        expect(saves).toBeGreaterThan(derives);
        expect(derives).toBe(2);
        expect(stage2Calls).toEqual({
            issueStates        : 0,
            discussionStates   : 0,
            pullRequestFeedback: 0
        });
        expect(commands.filter(command => command.startsWith('git status --porcelain '))).toHaveLength(2);
        expect(commands.filter(command => command === 'NEO_SKIP_TICKET_ARCHAEOLOGY=1 git commit --no-verify -m "chore: ticket sync [skip ci]"')).toHaveLength(2);
        expect(commands.filter(command => command === 'git pull --rebase --autostash')).toHaveLength(2);
        expect(commands.filter(command => command === 'git push')).toHaveLength(1);
        expect(commands).toContain('git rebase --abort');
        expect(commands).toContain('git fetch origin dev:refs/remotes/origin/dev');
        expect(commands).toContain('git reset --hard origin/dev');
    });

    test('auto-push recovers the checkout when delivery retries are exhausted (#13798)', async () => {
        const commands = [];
        let   pullRuns = 0;
        let   saves    = 0;
        let   derives  = 0;

        RepositoryService.getViewerPermission = async () => ({permission: 'WRITE'});

        IssueSyncer.pullFromGitHub = async (md) => {
            pullRuns++;

            return {
                newMetadata: {
                    ...(md || {}),
                    issues      : {},
                    pushFailures: [],
                    lastSync    : `run-${pullRuns}`
                },
                stats: {
                    pulled : {count: pullRuns, created: 0, updated: 0, moved: 0},
                    dropped: {count: 0}
                }
            };
        };

        MetadataManager.save = async () => {
            saves++;
        };

        SyncService.rebuildContentIndexesAndSeo = async () => {
            derives++;
        };

        SyncService.execGit = async (command) => {
            commands.push(command);

            if (command.startsWith('git status --porcelain ')) {
                return {stdout: ' M resources/content/issues/active/issue-13798.md\n', stderr: ''};
            }

            if (command === 'git diff --cached --name-only') {
                return {stdout: 'resources/content/issues/active/issue-13798.md\n', stderr: ''};
            }

            if (command === 'git pull --rebase --autostash') {
                throw new Error('persistent rebase conflict');
            }

            return {stdout: '', stderr: ''};
        };

        const result = await SyncService.runFullSync();

        expect(result.success).toBe(true);
        expect(result.statistics.pulled.count).toBe(2);
        expect(pullRuns).toBe(2);
        // NOT pinned to the pass count: each facet persists as it completes, so a pass makes several
        // saves. `derives` is the pass counter, so `saves > derives` asserts per-facet persistence is in
        // force without hardcoding how many facets exist.
        expect(saves).toBeGreaterThan(derives);
        expect(derives).toBe(2);
        expect(stage2Calls).toEqual({
            issueStates        : 0,
            discussionStates   : 0,
            pullRequestFeedback: 0
        });
        expect(commands.filter(command => command.startsWith('git status --porcelain '))).toHaveLength(2);
        expect(commands.filter(command => command === 'NEO_SKIP_TICKET_ARCHAEOLOGY=1 git commit --no-verify -m "chore: ticket sync [skip ci]"')).toHaveLength(2);
        expect(commands.filter(command => command === 'git pull --rebase --autostash')).toHaveLength(2);
        expect(commands).not.toContain('git push');
        expect(commands.filter(command => command === 'git rebase --abort')).toHaveLength(2);
        expect(commands.filter(command => command === 'git fetch origin dev:refs/remotes/origin/dev')).toHaveLength(2);
        expect(commands.filter(command => command === 'git reset --hard origin/dev')).toHaveLength(2);
    });

    test('auto-push does not hard-reset the checkout for allowlist guard failures (#13798)', async () => {
        const commands = [];

        RepositoryService.getViewerPermission = async () => ({permission: 'WRITE'});

        SyncService.execGit = async (command) => {
            commands.push(command);

            if (command.startsWith('git status --porcelain ')) {
                return {stdout: ' M resources/content/issues/active/issue-13798.md\n', stderr: ''};
            }

            if (command === 'git diff --cached --name-only') {
                return {stdout: 'resources/content/issues/active/issue-13798.md\nsrc/unrelated/ManualEdit.mjs\n', stderr: ''};
            }

            return {stdout: '', stderr: ''};
        };

        const result = await SyncService.runFullSync();

        expect(result.success).toBe(true);
        expect(commands).not.toContain('git rebase --abort');
        expect(commands).not.toContain('git fetch origin dev:refs/remotes/origin/dev');
        expect(commands).not.toContain('git reset --hard origin/dev');
        expect(commands).not.toContain('git pull --rebase --autostash');
        expect(commands).not.toContain('git push');
    });

    /**
     * Regression coverage for metadata persistence carry-over.
     *
     * Empirical bug: `IssueSyncer.pullFromGitHub` returns a FRESH `newMetadata` object
     * carrying only `{issues, pushFailures, lastSync}`. Subsequent calls to
     * `DiscussionSyncer.syncDiscussions(metadata)` and `PullRequestSyncer.syncPullRequests(metadata)`
     * mutate the OLD `metadata` argument's `.discussions` and `.pulls` fields. Without explicit
     * carry-over in `SyncService.runFullSync`, those mutations were dropped at `save(newMetadata)`,
     * leaving `metadata.discussions = {}` and `metadata.pulls = {}` on disk after every sync.
     *
     * This test mocks the production behavior exactly:
     * - `pullFromGitHub` returns a NEW object (not the same reference as input).
     * - `syncDiscussions` mutates `metadata.discussions[id] = {...}` on its argument.
     * - `syncPullRequests` mutates `metadata.pulls[id] = {...}` on its argument.
     *
     * Asserts that the metadata captured at `save()` retains both syncers' mutations.
     */
    test('runFullSync carries metadata.discussions + metadata.pulls from per-syncer mutations onto newMetadata before save (#11573)', async () => {
        let savedMetadata = null;

        // Mock pullFromGitHub returns a FRESH newMetadata, mirroring IssueSyncer.mjs:570-574.
        IssueSyncer.pullFromGitHub = async () => ({
            newMetadata: {
                issues      : {42: {state: 'OPEN'}},
                pushFailures: [],
                lastSync    : '2026-05-18T04:42:00Z'
            },
            stats: {pulled: {count: 0, created: 0, updated: 0, moved: 0}, dropped: {count: 0}}
        });

        // DiscussionSyncer mutates the input `metadata` (matches DiscussionSyncer.mjs:317-340).
        DiscussionSyncer.syncDiscussions = async (md) => {
            md.discussions = md.discussions || {};
            md.discussions[11089] = {
                number     : 11089,
                closed     : false,
                closedAt   : null,
                contentHash: 'hash-11089',
                path       : 'resources/content/discussions/chunk-1/discussion-11089.md'
            };
            md.discussions[5408] = {
                number     : 5408,
                closed     : true,
                closedAt   : '2024-08-03T00:00:00Z',
                contentHash: 'hash-5408',
                path       : 'resources/content/archive/discussions/v8.30.0/chunk-1/discussion-5408.md'
            };
            return {count: 2};
        };

        // PullRequestSyncer mutates the input `metadata` (matches PullRequestSyncer.mjs:333-339).
        PullRequestSyncer.syncPullRequests = async (md) => {
            md.pulls = md.pulls || {};
            md.pulls[10001] = {state: 'OPEN', contentHash: 'hash-pr-10001'};
            return {count: 1};
        };

        // Capture the metadata that lands in save().
        MetadataManager.save = async (md) => {
            savedMetadata = md;
        };

        await SyncService.runFullSync();

        // Metadata persistence carry-over: both syncers' mutations survived.
        expect(savedMetadata, 'MetadataManager.save received an argument').not.toBeNull();
        expect(savedMetadata.discussions[11089]).toMatchObject({
            number  : 11089,
            closed  : false,
            closedAt: null
        });
        expect(savedMetadata.discussions[5408]).toMatchObject({
            number  : 5408,
            closed  : true,
            closedAt: '2024-08-03T00:00:00Z'
        });
        expect(savedMetadata.pulls[10001]).toMatchObject({state: 'OPEN'});
    });

    /**
     * Regression coverage for explicit empty-input safety.
     *
     * Verifies that when DiscussionSyncer / PullRequestSyncer leave metadata.discussions
     * or metadata.pulls undefined (e.g., early-exit path), the carry-over still produces
     * `{}` rather than `undefined` on `newMetadata`. MetadataManager.save then renders
     * an empty object in the JSON file rather than a missing key.
     */
    test('runFullSync produces metadata.discussions = {} when syncers leave fields undefined (#11573)', async () => {
        let savedMetadata = null;

        IssueSyncer.pullFromGitHub = async () => ({
            newMetadata: {issues: {}, pushFailures: [], lastSync: '2026-05-18T04:42:00Z'},
            stats      : {pulled: {count: 0, created: 0, updated: 0, moved: 0}, dropped: {count: 0}}
        });

        // Syncers don't mutate metadata at all (early-exit path).
        DiscussionSyncer.syncDiscussions = async () => ({count: 0});
        PullRequestSyncer.syncPullRequests = async () => ({count: 0});

        MetadataManager.save = async (md) => { savedMetadata = md; };

        await SyncService.runFullSync();

        expect(savedMetadata.discussions).toEqual({});
        expect(savedMetadata.pulls).toEqual({});
    });

    /**
     * Facet isolation. The chain was a bare sequential `await` list with one save at the end, so one
     * facet throwing discarded every facet that had already succeeded AND skipped every facet after it.
     * With a deterministic trigger that is not "slowly falling behind" — it is a corpus frozen while
     * each facet's own code works correctly, and it is why two content facets were starved by one fault.
     */
    test('a failing facet does not skip the facets AFTER it', async () => {
        let pullSyncCalled = 0;

        DiscussionSyncer.syncDiscussions = async () => { throw new Error('discussion page cost ceiling') };
        PullRequestSyncer.syncPullRequests = async () => { pullSyncCalled++; return {count: 0} };

        await expect(SyncService.runFullSync()).rejects.toThrow(/did not advance/);

        // The whole point: pull requests are fetched even though discussions threw first. Before
        // isolation this was 0, and that single fact is why `pulls/` went stale from a discussions bug.
        expect(pullSyncCalled).toBe(1);
    });

    test('a failing facet advances NOTHING while the facets that succeeded are persisted', async () => {
        const saved = [];

        MetadataManager.load = async () => ({
            issues     : {},
            releases   : {},
            discussions: {1: {number: 1, path: 'd-1.md', contentHash: 'PRE-EXISTING'}},
            pulls      : {}
        });
        MetadataManager.save = async md => saved.push(structuredClone(md));

        // The facet mutates the shared accumulator and THEN throws — the ordering that makes per-slice
        // rollback load-bearing. Without it, this half-write is persisted by the next facet's save.
        DiscussionSyncer.syncDiscussions = async md => {
            md.discussions[2] = {number: 2, path: 'd-2.md', contentHash: 'HALF-WRITTEN'};
            throw new Error('failed after mutating')
        };

        await expect(SyncService.runFullSync()).rejects.toThrow(/did not advance/);

        expect(saved.length).toBeGreaterThan(0);

        // No save anywhere may carry the failed facet's partial mutation, and the pre-existing entry
        // must survive: the failed facet keeps its previous high-water mark rather than losing it.
        saved.forEach((md, index) => {
            expect(Object.keys(md.discussions), `save #${index}`).toEqual(['1']);
            expect(md.discussions[1].contentHash, `save #${index}`).toBe('PRE-EXISTING')
        });
    });

    test('the aggregate verdict NAMES every facet that did not advance', async () => {
        // Partial progress is the point, but a partial run must never report as a clean one — exiting 0
        // would trade total loss for silent loss, where the corpus looks synced while a facet sits stale.
        DiscussionSyncer.syncDiscussions = async () => { throw new Error('cost ceiling') };
        ReleaseNotesSyncer.syncNotes = async () => { throw new Error('release notes boom') };

        const error = await SyncService.runFullSync().then(() => null, e => e);

        expect(error).toBeTruthy();
        expect(error.message).toMatch(/discussions/);
        expect(error.message).toMatch(/releaseNotes/);
        expect(error.message).toMatch(/cost ceiling/);
        expect(error.message).toMatch(/2 of \d+ sync facets/);
    });

    test('a failed release PREREQUISITE skips the dependent facets instead of mis-bucketing (#16010)', async () => {
        // Release history is not an independent facet. `ReleaseNotesSyncer.sortedReleases` is the bucketing
        // reference every closed-artifact planner reads, and an ABSENT reference does not throw — it
        // resolves to "no release version applies", which places closed artifacts in the ACTIVE bucket. So
        // catching a release failure and continuing does not isolate one facet; it silently mis-buckets the
        // corpus, and per-facet persistence then writes that placement to disk.
        //
        // The old sequential chain was accidentally safe here: a release throw aborted everything after it.
        // Isolation REMOVED that implicit guard, which is the trap this asserts against — caught and
        // independent are different properties.
        const ran = [];

        ReleaseNotesSyncer.fetchAndCacheReleases = async () => { throw new Error('releases endpoint down') };
        ReleaseNotesSyncer.sortedReleases        = null;

        IssueSyncer.pullFromGitHub         = async md => { ran.push('issues');      return {newMetadata: md, stats: {pulled: {count: 0, created: 0, updated: 0, moved: 0}, dropped: {count: 0}}} };
        ReleaseNotesSyncer.syncNotes       = async () => { ran.push('releaseNotes'); return {count: 0} };
        DiscussionSyncer.syncDiscussions   = async () => { ran.push('discussions');  return {count: 0} };
        PullRequestSyncer.syncPullRequests = async () => { ran.push('pulls');        return {count: 0} };

        const error = await SyncService.runFullSync().then(() => null, e => e);

        // NONE of the dependents may execute without the bucketing reference.
        expect(ran).toEqual([]);

        // And they must be REPORTED, not silently dropped — otherwise skipping shrinks the denominator
        // and a run that did one of six things could read as clean.
        expect(error).toBeTruthy();
        expect(error.message).toMatch(/5 of \d+ sync facets did not advance/);
        for (const name of ['releases', 'issues', 'releaseNotes', 'discussions', 'pulls']) {
            expect(error.message, `${name} must appear in the verdict`).toMatch(new RegExp(name));
        }
    });

    test('a CACHED bucketing reference lets the dependents run even when the fetch fails (#16010)', async () => {
        // The prerequisite is satisfiable two ways, because a fetch failure is not the same as an absent
        // reference: `fetchAndCacheReleases` populates `sortedReleases` from a cached fast-path BEFORE its
        // network call. If that survived, placement is still resolvable and gating the dependents would be
        // a false negative that strands the corpus on a transient outage.
        const ran = [];

        ReleaseNotesSyncer.fetchAndCacheReleases = async () => { throw new Error('releases endpoint down') };
        ReleaseNotesSyncer.sortedReleases        = [{tagName: 'v13.0.0', publishedAt: '2026-05-10T00:00:00Z'}];

        DiscussionSyncer.syncDiscussions   = async () => { ran.push('discussions'); return {count: 0} };
        PullRequestSyncer.syncPullRequests = async () => { ran.push('pulls');       return {count: 0} };

        await expect(SyncService.runFullSync()).rejects.toThrow(/did not advance/);

        expect(ran).toContain('discussions');
        expect(ran).toContain('pulls');
    });

    test('an integrity abort withholds the PULL facet only — sibling facets still advance', async () => {
        // The narrowed guarantee. A pull corpus measured broken must not advance, and that must no
        // longer take the discussion facet down with it.
        const saved = [];

        MetadataManager.save = async md => saved.push(structuredClone(md));

        DiscussionSyncer.syncDiscussions = async md => {
            md.discussions[7] = {number: 7, path: 'd-7.md', contentHash: 'ADVANCED'};
            return {count: 1}
        };
        PullRequestSyncer.syncPullRequests = async md => {
            md.pulls[9] = {state: 'MERGED', path: 'p-9.md', contentHash: 'SHOULD-NOT-PERSIST'};
            return {count: 1}
        };
        PullRequestSyncer.verifyCorpusIntegrity = async () => ({
            ok                      : false,
            staleIndexEntries       : [{id: 9}],
            inconsistentIndexEntries: [],
            duplicateIndexEntryIds  : [],
            unindexedIds            : [],
            identicalDuplicateIds   : [],
            divergentDuplicateIds   : []
        });

        const error = await SyncService.runFullSync().then(() => null, e => e),
              last  = saved.at(-1);

        expect(error).toBeTruthy();
        expect(last.discussions[7]?.contentHash).toBe('ADVANCED');
        expect(last.pulls).toEqual({});

        // The rollback assertions above hold even under a whole-run abort, so on their own they witness
        // ROLLBACK rather than ISOLATION. This is the part that separates the two: the failure must be
        // reported through the per-facet accounting, naming `pulls` as the ONLY facet withheld. A
        // re-throwing chain surfaces the bare integrity message with no accounting and fails here.
        expect(error.message).toMatch(/1 of \d+ sync facets did not advance/);
        expect(error.message).toMatch(/pulls \(/);
        expect(error.message).not.toMatch(/discussions \(/);
        expect(error.message).toMatch(/integrity is not clean/);
    });

    test('a metadata-only diff is DELIVERED, never rolled back — the first-run high-water case', async () => {
        const commands = [];

        SyncService.execGit = async (command) => {
            commands.push(command);

            // The whole point of this fixture: the corpus is already current, so the metadata file is the
            // ONLY dirty path. That is not a contrived edge case — it is the first run of any new
            // high-water field, when the advance lives entirely in metadata.
            if (command.startsWith('git status --porcelain ')) {
                return {stdout: ' M resources/content/.sync-metadata.json\n', stderr: ''};
            }

            if (command === 'git diff --cached --name-only') {
                return {stdout: 'resources/content/.sync-metadata.json\n', stderr: ''};
            }

            return {stdout: '', stderr: ''};
        };

        const pushed = await SyncService.commitRebaseAndPushGeneratedContent('/tmp/does-not-matter');

        // Discriminates on TWO independent axes, because the rollback failed on both: it discarded the
        // file AND reported "nothing delivered". Reinstating `git restore` + `return false` fails here
        // twice over, and no weaker fixture (one with Markdown churn) can fail at all — content changes
        // took the delivery path even before this fix.
        expect(commands.some(command => command.includes('git restore'))).toBe(false);
        expect(pushed).toBe(true);

        // And it must be delivered as a real commit, not merely "not restored" — a path that staged the
        // file and then silently skipped the commit would satisfy both assertions above.
        // `includes` rather than `startsWith` for the commit: the real invocation carries an env prefix
        // (`NEO_SKIP_TICKET_ARCHAEOLOGY=1 git commit --no-verify …`), so a prefix matcher silently misses
        // it and the assertion would fail against correct code.
        expect(commands.some(command => command.startsWith('git add '))).toBe(true);
        expect(commands.some(command => command.includes('git commit'))).toBe(true);
        expect(commands.some(command => command.includes('git push'))).toBe(true);
    });

    /**
     * The corpus logical-identity invariant, asserted at the ONLY point that can enforce it.
     *
     * `commitRebaseAndPushGeneratedContent` commits with `--no-verify`, deliberately and correctly —
     * generated content carries trailing whitespace the whitespace hook rejects. That bypass disables
     * every git hook, so the `lint-staged` copy of this guard is structurally unable to see the one
     * automated commit that writes the corpus. Hence the in-process assertion.
     *
     * Both tests drive a TEMP corpus rather than `resources/content`, because a test that pointed at a
     * real duplicate would assert today's damage and start failing the moment the repair lands.
     */
    test.describe('the corpus-commit path enforces one artifact per logical name (#16057)', () => {
        let tempRoot;

        const stageOnly = (commands, staged) => async command => {
            commands.push(command);

            if (command.startsWith('git status --porcelain ')) {
                return {stdout: ` M ${staged}\n`, stderr: ''}
            }

            if (command === 'git diff --cached --name-only') {
                return {stdout: `${staged}\n`, stderr: ''}
            }

            return {stdout: '', stderr: ''}
        };

        const writeArtifact = async (relative) => {
            const absolute = path.join(tempRoot, relative);

            await fs.mkdir(path.dirname(absolute), {recursive: true});
            await fs.writeFile(absolute, '# artifact\n', 'utf8')
        };

        test.beforeEach(async () => {
            tempRoot = await fs.mkdtemp(path.join(await fs.realpath('/tmp'), 'neo-sync-corpus-'))
        });

        test.afterEach(async () => {
            await fs.rm(tempRoot, {force: true, recursive: true})
        });

        test('a staged collision is REFUSED and never reaches the commit', async () => {
            const
                commands = [],
                staged   = 'resources/content/archive/pulls/v13.0.0/chunk-2/pr-1.md';

            await writeArtifact('resources/content/archive/pulls/v13.0.0/chunk-1/pr-1.md');
            await writeArtifact(staged);

            SyncService.execGit = stageOnly(commands, staged);

            await expect(SyncService.commitRebaseAndPushGeneratedContent(tempRoot))
                .rejects.toThrow(/two artifacts claiming one logical name/);

            // The load-bearing half: refusing AFTER committing would leave the corpus broken on `dev`
            // and the error would be an epilogue. Nothing may be committed or pushed.
            expect(commands.some(command => command.includes('git commit'))).toBe(false);
            expect(commands.some(command => command.includes('git push'))).toBe(false)
        });

        test('a staged artifact with no collision proceeds — the gate can PASS', async () => {
            // The positive control. Without it the refusal above is satisfied by a guard that rejects
            // everything, and "commit never happened" would prove only that the method is broken.
            const
                commands = [],
                staged   = 'resources/content/archive/pulls/v13.0.0/chunk-1/pr-2.md';

            await writeArtifact('resources/content/archive/pulls/v13.0.0/chunk-1/pr-1.md');
            await writeArtifact(staged);

            SyncService.execGit = stageOnly(commands, staged);

            await expect(SyncService.commitRebaseAndPushGeneratedContent(tempRoot)).resolves.toBe(true);

            expect(commands.some(command => command.includes('git commit'))).toBe(true);
            expect(commands.some(command => command.includes('git push'))).toBe(true)
        })
    })
});
