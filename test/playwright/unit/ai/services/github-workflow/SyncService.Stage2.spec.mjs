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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe('SyncService — Stage 2 Ingestion', () => {
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

    /**
     * #11573 regression coverage — metadata persistence carry-over.
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
     * #11573 regression coverage — explicit empty-input safety.
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
