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
        IssueIngestor = (await import('../../../../../../ai/daemons/services/IssueIngestor.mjs')).default;
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
});
