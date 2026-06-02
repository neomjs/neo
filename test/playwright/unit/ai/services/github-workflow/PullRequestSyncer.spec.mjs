import {setup} from '../../../../setup.mjs';

const appName = 'PullRequestSyncerTest';

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
import fs             from 'fs-extra';
import path           from 'path';

test.describe('Neo.ai.services.github-workflow.sync.PullRequestSyncer', () => {
    let aiConfig;
    let GraphqlService;
    let PullRequestSyncer;
    let ReleaseNotesSyncer;
    let originalArchiveRoot;
    let originalPullsDir;
    let originalContentRoot;
    let originalQuery;
    let originalSortedReleases;
    let originalVersionDirectoryPrefix;
    let originalRouteByMilestone;
    let tmpRoot;

    test.beforeAll(async () => {
        aiConfig          = (await import('../../../../../../ai/mcp/server/github-workflow/config.mjs')).default;
        GraphqlService    = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        PullRequestSyncer = (await import('../../../../../../ai/services/github-workflow/sync/PullRequestSyncer.mjs')).default;
        ReleaseNotesSyncer = (await import('../../../../../../ai/services/github-workflow/sync/ReleaseNotesSyncer.mjs')).default;

        originalArchiveRoot            = aiConfig.issueSync.archiveRoot;
        originalPullsDir               = aiConfig.issueSync.pullsDir;
        originalContentRoot            = aiConfig.issueSync.contentRoot;
        originalQuery                  = GraphqlService.query.bind(GraphqlService);
        originalSortedReleases         = ReleaseNotesSyncer.sortedReleases;
        originalVersionDirectoryPrefix = aiConfig.issueSync.versionDirectoryPrefix;
        originalRouteByMilestone       = aiConfig.issueSync.routeByMilestone;
    });

    test.beforeEach(async () => {
        tmpRoot = path.resolve(process.cwd(), 'tmp', `pull-request-syncer-test-${process.pid}-${Date.now()}`);
        await fs.ensureDir(tmpRoot);

        aiConfig.issueSync.archiveRoot            = path.join(tmpRoot, 'archive');
        aiConfig.issueSync.pullsDir               = path.join(tmpRoot, 'pulls');
        aiConfig.issueSync.contentRoot            = tmpRoot;
        aiConfig.issueSync.versionDirectoryPrefix = 'v';
        aiConfig.issueSync.routeByMilestone       = false;
        ReleaseNotesSyncer.sortedReleases              = [];
    });

    test.afterEach(async () => {
        GraphqlService.query                       = originalQuery;
        ReleaseNotesSyncer.sortedReleases              = originalSortedReleases;
        aiConfig.issueSync.archiveRoot            = originalArchiveRoot;
        aiConfig.issueSync.pullsDir               = originalPullsDir;
        aiConfig.issueSync.contentRoot            = originalContentRoot;
        aiConfig.issueSync.versionDirectoryPrefix = originalVersionDirectoryPrefix;
        aiConfig.issueSync.routeByMilestone       = originalRouteByMilestone;

        await fs.remove(tmpRoot).catch(() => {});
    });

    test('stale cached archiveVersion does not force a closed-post-latest-release PR into archive/pulls/v13.0.0 (#11364)', async () => {
        const prNumber = 12345;

        // Legacy metadata pinned this PR to a v13.0.0 archive bucket via the
        // `archiveVersion` carry-forward. With the carry-forward retired, archive placement
        // is derived fresh from real milestone/release logic — and a PR merged after the
        // latest release with no milestone must land ACTIVE, not in the stale v13.0.0 bucket.
        const metadata = {
            pulls: {
                [prNumber]: {
                    state         : 'MERGED',
                    updatedAt     : '2026-05-01T00:00:00Z',
                    closedAt      : '2026-05-01T00:00:00Z',
                    mergedAt      : '2026-05-01T00:00:00Z',
                    archiveVersion: 'v13.0.0',
                    path          : `resources/content/archive/pulls/v13.0.0/chunk-1/pr-${prNumber}.md`
                }
            }
        };

        // Latest release predates the PR's merge → no real release applies.
        ReleaseNotesSyncer.sortedReleases = [
            {tagName: 'v12.9.0', publishedAt: '2026-04-01T00:00:00Z'}
        ];

        GraphqlService.query = async () => ({
            repository: {
                pullRequests: {
                    nodes: [buildPullRequest(prNumber)],
                    pageInfo: {
                        hasNextPage: false,
                        endCursor  : null
                    }
                }
            }
        });

        const stats      = await PullRequestSyncer.syncPullRequests(metadata);
        const activePath = path.join(aiConfig.issueSync.contentRoot, 'pulls', 'chunk-1', `pr-${prNumber}.md`);
        const stalePath  = path.join(aiConfig.issueSync.contentRoot, 'archive', 'pulls', 'v13.0.0', 'chunk-1', `pr-${prNumber}.md`);

        expect(stats.synced).toEqual([prNumber]);
        await expect(fs.pathExists(activePath)).resolves.toBe(true);
        await expect(fs.pathExists(stalePath)).resolves.toBe(false);
        expect(metadata.pulls[prNumber].path).toBe(path.relative(aiConfig.projectRoot, activePath));
        // `archiveVersion` is fully retired — it is no longer written to metadata.
        expect(metadata.pulls[prNumber].archiveVersion).toBeUndefined();
    });

    test('non-semver milestone is not a version bucket — PR falls through to closedAt→release (#12184)', async () => {
        const prNumber = 3287;

        // A descriptive (non-semver) milestone must NOT become a `v<title>` archive folder (mirror of
        // the IssueSyncer guard). The merged PR falls through to the closedAt→release resolution and
        // buckets into the real release that shipped after it merged.
        const pr = buildPullRequest(prNumber);
        pr.milestone = {title: 'Neo-Material Component Library v0.1'};
        pr.mergedAt  = '2024-09-15T00:00:00Z';
        pr.closedAt  = '2024-09-15T00:00:00Z';

        // A real release published AFTER the PR merged → the closedAt→release fallback resolves here.
        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v9.0.0', publishedAt: '2024-10-01T00:00:00Z'}];

        GraphqlService.query = async () => ({
            repository: {
                pullRequests: {
                    nodes   : [pr],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        const stats       = await PullRequestSyncer.syncPullRequests({pulls: {}});
        const releasePath = path.join(aiConfig.issueSync.contentRoot, 'archive', 'pulls', 'v9.0.0', 'chunk-1', `pr-${prNumber}.md`);
        const garbagePath = path.join(aiConfig.issueSync.contentRoot, 'archive', 'pulls', 'vNeo-Material Component Library v0.1', 'chunk-1', `pr-${prNumber}.md`);

        expect(stats.synced).toEqual([prNumber]);
        // Bucketed into the real release, NOT a title-derived garbage folder.
        await expect(fs.pathExists(releasePath)).resolves.toBe(true);
        await expect(fs.pathExists(garbagePath)).resolves.toBe(false);
    });

    test('routeByMilestone=false ignores semver milestones and keeps post-latest merged PRs active', async () => {
        const prNumber = 3288;
        const pr = buildPullRequest(prNumber);
        pr.milestone = {title: 'v99.0.0'};
        await fs.ensureDir(path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v99.0.0'));

        GraphqlService.query = async () => ({
            repository: {
                pullRequests: {
                    nodes   : [pr],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        const stats       = await PullRequestSyncer.syncPullRequests({pulls: {}});
        const activePath  = path.join(aiConfig.issueSync.contentRoot, 'pulls', 'chunk-1', `pr-${prNumber}.md`);
        const archivePath = path.join(aiConfig.issueSync.contentRoot, 'archive', 'pulls', 'v99.0.0', 'chunk-1', `pr-${prNumber}.md`);

        expect(stats.synced).toEqual([prNumber]);
        await expect(fs.pathExists(activePath)).resolves.toBe(true);
        await expect(fs.pathExists(archivePath)).resolves.toBe(false);
    });

    test('routeByMilestone=true only routes semver milestones into already-cut archive buckets', async () => {
        const missingBucketPr = buildPullRequest(3289);
        missingBucketPr.milestone = {title: 'v99.0.0'};

        const cutBucketPr = buildPullRequest(3290);
        cutBucketPr.milestone = {title: 'v98.0.0'};

        aiConfig.issueSync.routeByMilestone = true;
        await fs.ensureDir(path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v98.0.0'));

        GraphqlService.query = async () => ({
            repository: {
                pullRequests: {
                    nodes   : [missingBucketPr, cutBucketPr],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        const stats             = await PullRequestSyncer.syncPullRequests({pulls: {}});
        const missingActivePath = path.join(aiConfig.issueSync.contentRoot, 'pulls', 'chunk-1', `pr-${missingBucketPr.number}.md`);
        const cutArchivePath    = path.join(aiConfig.issueSync.contentRoot, 'archive', 'pulls', 'v98.0.0', 'chunk-1', `pr-${cutBucketPr.number}.md`);

        expect(stats.synced).toEqual([missingBucketPr.number, cutBucketPr.number]);
        await expect(fs.pathExists(missingActivePath)).resolves.toBe(true);
        await expect(fs.pathExists(cutArchivePath)).resolves.toBe(true);
    });

    test('delta cutoff stops PR pagination once a batch predates the cached high-water mark (#12190)', async () => {
        // The `pullRequests` connection has no server-side `since`, so the syncer orders UPDATED_AT
        // DESC and stops paginating at the cached high-water mark. Pre-fix it scanned the full corpus.
        const metadata = {
            lastSync: '2026-05-01T00:00:00Z',
            pulls: {
                9001: {state: 'MERGED', updatedAt: '2026-05-01T00:00:00Z', path: 'resources/content/archive/pulls/v12.0.0/chunk-1/pr-9001.md'}
            }
        };

        const prNew    = buildPullRequest(8001); prNew.updatedAt    = '2026-05-03T00:00:00Z'; // after hwm → fetched
        const prOld    = buildPullRequest(7001); prOld.updatedAt    = '2026-04-29T00:00:00Z'; // before hwm → trips cutoff
        const prTooOld = buildPullRequest(6001); prTooOld.updatedAt = '2026-04-28T00:00:00Z'; // must never be fetched

        let queryCalls = 0;
        GraphqlService.query = async () => {
            queryCalls++;
            if (queryCalls === 1) return {repository: {pullRequests: {nodes: [prNew],    pageInfo: {hasNextPage: true,  endCursor: 'c1'}}}};
            if (queryCalls === 2) return {repository: {pullRequests: {nodes: [prOld],    pageInfo: {hasNextPage: true,  endCursor: 'c2'}}}};
            return                       {repository: {pullRequests: {nodes: [prTooOld], pageInfo: {hasNextPage: false, endCursor: null}}}};
        };

        await PullRequestSyncer.syncPullRequests(metadata);

        // Stopped at page 2 (its oldest PR predates the high-water mark); page 3 never requested.
        // Pre-fix (full-corpus scan) this would be 3.
        expect(queryCalls).toBe(2);
    });
});

function buildPullRequest(number) {
    return {
        number,
        title      : 'Preserve migrated archive version',
        author     : {login: 'neo-test'},
        state      : 'MERGED',
        createdAt  : '2026-05-01T00:00:00Z',
        updatedAt  : '2026-05-02T00:00:00Z',
        closedAt   : '2026-05-01T00:00:00Z',
        mergedAt   : '2026-05-01T00:00:00Z',
        headRefName: 'feature',
        baseRefName: 'dev',
        url        : `https://github.com/neomjs/neo/pull/${number}`,
        body       : 'Merged body',
        milestone  : null,
        comments   : {nodes: []},
        reviews    : {nodes: []}
    }
}
