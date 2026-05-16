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
    });

    test.beforeEach(async () => {
        tmpRoot = path.resolve(process.cwd(), 'tmp', `pull-request-syncer-test-${process.pid}-${Date.now()}`);
        await fs.ensureDir(tmpRoot);

        aiConfig.issueSync.archiveRoot            = path.join(tmpRoot, 'archive');
        aiConfig.issueSync.pullsDir               = path.join(tmpRoot, 'pulls');
        aiConfig.issueSync.contentRoot            = tmpRoot;
        aiConfig.issueSync.versionDirectoryPrefix = 'v';
        ReleaseNotesSyncer.sortedReleases              = [];
    });

    test.afterEach(async () => {
        GraphqlService.query                       = originalQuery;
        ReleaseNotesSyncer.sortedReleases              = originalSortedReleases;
        aiConfig.issueSync.archiveRoot            = originalArchiveRoot;
        aiConfig.issueSync.pullsDir               = originalPullsDir;
        aiConfig.issueSync.contentRoot            = originalContentRoot;
        aiConfig.issueSync.versionDirectoryPrefix = originalVersionDirectoryPrefix;

        await fs.remove(tmpRoot).catch(() => {});
    });

    test('drops archiveVersion carry-forward: stale cached value cannot force placement, field is no longer serialized', async () => {
        const prNumber = 12345;
        // Stale cached metadata claims v13.0.0. Under post-#11360 contract this must NOT
        // drive routing: the PR has no milestone and no subsequent release in
        // ReleaseNotesSyncer.sortedReleases (empty per beforeEach), so the syncer must
        // route to the active path and the serialized metadata must omit archiveVersion.
        const metadata = {
            pulls: {
                [prNumber]: {
                    state         : 'MERGED',
                    updatedAt     : '2026-05-01T00:00:00Z',
                    closedAt      : '2026-05-01T00:00:00Z',
                    mergedAt      : '2026-05-01T00:00:00Z',
                    archiveVersion: 'v13.0.0',
                    path          : `resources/content/pr-archive/v13.0.0/chunk-1/pr-${prNumber}.md`
                }
            }
        };

        GraphqlService.query = async () => ({
            repository: {
                pullRequests: {
                    nodes   : [buildPullRequest(prNumber)],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        const stats = await PullRequestSyncer.syncPullRequests(metadata);

        expect(stats.synced).toEqual([prNumber]);
        expect(metadata.pulls[prNumber]).not.toHaveProperty('archiveVersion');
        expect(metadata.pulls[prNumber].path).not.toContain('v13.0.0');
    });

    test('derives archive bucket from milestone independent of cached archiveVersion', async () => {
        const prNumber = 12346;
        // Stale cached archiveVersion would have routed this PR into v13.0.0/, but the
        // fresh GraphQL milestone 'v12.1.0' is now the authoritative bucket source.
        const metadata = {
            pulls: {
                [prNumber]: {
                    state         : 'MERGED',
                    updatedAt     : '2026-04-01T00:00:00Z',
                    closedAt      : '2026-04-01T00:00:00Z',
                    mergedAt      : '2026-04-01T00:00:00Z',
                    archiveVersion: 'v13.0.0',
                    path          : `resources/content/pr-archive/v13.0.0/chunk-1/pr-${prNumber}.md`
                }
            }
        };

        GraphqlService.query = async () => ({
            repository: {
                pullRequests: {
                    nodes   : [buildPullRequest(prNumber, {milestone: {title: 'v12.1.0'}})],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        const stats = await PullRequestSyncer.syncPullRequests(metadata);

        expect(stats.synced).toEqual([prNumber]);
        expect(metadata.pulls[prNumber]).not.toHaveProperty('archiveVersion');
        expect(metadata.pulls[prNumber].milestone).toBe('v12.1.0');
        expect(metadata.pulls[prNumber].path).toContain('v12.1.0');
        expect(metadata.pulls[prNumber].path).not.toContain('v13.0.0');
    });
});

function buildPullRequest(number, overrides = {}) {
    return {
        number,
        title      : 'Post-#11360 contract test PR',
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
        reviews    : {nodes: []},
        ...overrides
    }
}
