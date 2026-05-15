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
    let ReleaseSyncer;
    let originalArchiveRoot;
    let originalIssuesDir;
    let originalPullsDir;
    let originalQuery;
    let originalSortedReleases;
    let originalVersionDirectoryPrefix;
    let tmpRoot;

    test.beforeAll(async () => {
        aiConfig         = (await import('../../../../../../ai/mcp/server/github-workflow/config.mjs')).default;
        GraphqlService   = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        PullRequestSyncer = (await import('../../../../../../ai/services/github-workflow/sync/PullRequestSyncer.mjs')).default;
        ReleaseSyncer    = (await import('../../../../../../ai/services/github-workflow/sync/ReleaseSyncer.mjs')).default;

        originalArchiveRoot            = aiConfig.issueSync.archiveRoot;
        originalIssuesDir              = aiConfig.issueSync.issuesDir;
        originalPullsDir               = aiConfig.issueSync.pullsDir;
        originalQuery                  = GraphqlService.query.bind(GraphqlService);
        originalSortedReleases         = ReleaseSyncer.sortedReleases;
        originalVersionDirectoryPrefix = aiConfig.issueSync.versionDirectoryPrefix;
    });

    test.beforeEach(async () => {
        tmpRoot = path.resolve(process.cwd(), 'tmp', `pull-request-syncer-test-${process.pid}-${Date.now()}`);
        await fs.ensureDir(tmpRoot);

        aiConfig.issueSync.archiveRoot            = path.join(tmpRoot, 'archive');
        aiConfig.issueSync.issuesDir              = path.join(tmpRoot, 'issues');
        aiConfig.issueSync.pullsDir               = path.join(tmpRoot, 'pulls');
        aiConfig.issueSync.versionDirectoryPrefix = 'v';
        ReleaseSyncer.sortedReleases              = [];
    });

    test.afterEach(async () => {
        GraphqlService.query                       = originalQuery;
        ReleaseSyncer.sortedReleases              = originalSortedReleases;
        aiConfig.issueSync.archiveRoot            = originalArchiveRoot;
        aiConfig.issueSync.issuesDir              = originalIssuesDir;
        aiConfig.issueSync.pullsDir               = originalPullsDir;
        aiConfig.issueSync.versionDirectoryPrefix = originalVersionDirectoryPrefix;

        await fs.remove(tmpRoot).catch(() => {});
    });

    test('preserves cached archiveVersion for migrated closed PR paths', async () => {
        const prNumber = 12345;
        const metadata = {
            pulls: {
                [prNumber]: {
                    state         : 'MERGED',
                    updatedAt     : '2026-05-01T00:00:00Z',
                    closedAt      : '2026-05-01T00:00:00Z',
                    mergedAt      : '2026-05-01T00:00:00Z',
                    archiveVersion: 'v13.0.0',
                    path          : `resources/content/pr-archive/123xx/pr-${prNumber}.md`
                }
            }
        };

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

        const stats = await PullRequestSyncer.syncPullRequests(metadata);
        const targetPath = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-1', `pr-${prNumber}.md`);

        expect(stats.synced).toEqual([prNumber]);
        await expect(fs.pathExists(targetPath)).resolves.toBe(true);
        expect(metadata.pulls[prNumber].archiveVersion).toBe('v13.0.0');
        expect(metadata.pulls[prNumber].path).toBe(path.relative(aiConfig.projectRoot, targetPath));
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
