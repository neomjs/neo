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
    let originalSyncDiscussions;
    let originalSyncPullRequests;
    let originalGetViewerPermission;
    let originalRebuildContentIndexesAndSeo;
    let originalExecGit;

    let originalIngestIssueStates;
    let originalIngestDiscussionStates;
    let originalIngestPullRequestFeedback;
    let originalLoadMetadata;
    let originalSaveMetadata;

    let stage2Calls = {
        issueStates: 0,
        discussionStates: 0,
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
        originalSyncDiscussions = DiscussionSyncer.syncDiscussions;
        originalSyncPullRequests = PullRequestSyncer.syncPullRequests;
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
        DiscussionSyncer.syncDiscussions = originalSyncDiscussions;
        PullRequestSyncer.syncPullRequests = originalSyncPullRequests;
        RepositoryService.getViewerPermission = originalGetViewerPermission;
        SyncService.rebuildContentIndexesAndSeo = originalRebuildContentIndexesAndSeo;
        SyncService.execGit = originalExecGit;
        MetadataManager.load = originalLoadMetadata;
        MetadataManager.save = originalSaveMetadata;

        IssueIngestor.ingestIssueStates = originalIngestIssueStates;
        IssueIngestor.ingestDiscussionStates = originalIngestDiscussionStates;
        IssueIngestor.ingestPullRequestFeedback = originalIngestPullRequestFeedback;
    });

    test('runFullSync executes Stage 2 ingestion by dynamically invoking IssueIngestor', async () => {
        const result = await SyncService.runFullSync();

        expect(result.success).toBe(true);
        expect(stage2Calls.issueStates).toBe(1);
        expect(stage2Calls.discussionStates).toBe(1);
        expect(stage2Calls.pullRequestFeedback).toBe(1);
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
        expect(order).toEqual(['metadata-save', 'derive', 'permission-check']);
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
        const commands = [];
        let pullRuns = 0;
        let saves = 0;
        let derives = 0;
        let rebaseAttempts = 0;

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
        expect(saves).toBe(2);
        expect(derives).toBe(2);
        expect(stage2Calls).toEqual({
            issueStates        : 1,
            discussionStates   : 1,
            pullRequestFeedback: 1
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
        let pullRuns = 0;
        let saves = 0;
        let derives = 0;

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
        expect(saves).toBe(2);
        expect(derives).toBe(2);
        expect(stage2Calls).toEqual({
            issueStates        : 1,
            discussionStates   : 1,
            pullRequestFeedback: 1
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
            stats: {pulled: {count: 0, created: 0, updated: 0, moved: 0}, dropped: {count: 0}}
        });

        // Syncers don't mutate metadata at all (early-exit path).
        DiscussionSyncer.syncDiscussions = async () => ({count: 0});
        PullRequestSyncer.syncPullRequests = async () => ({count: 0});

        MetadataManager.save = async (md) => { savedMetadata = md; };

        await SyncService.runFullSync();

        expect(savedMetadata.discussions).toEqual({});
        expect(savedMetadata.pulls).toEqual({});
    });
});
