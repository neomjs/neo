import {setup} from '../../../../setup.mjs';

const appName = 'DiscussionSyncerTest';

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

test.describe('Neo.ai.services.github-workflow.sync.DiscussionSyncer', () => {
    let aiConfig;
    let DiscussionSyncer;
    let GraphqlService;
    let ReleaseNotesSyncer;
    let originalArchiveRoot;
    let originalDiscussionsDir;
    let originalIssuesDir;
    let originalContentRoot;
    let originalQuery;
    let originalSortedReleases;
    let tmpRoot;

    test.beforeAll(async () => {
        aiConfig         = (await import('../../../../../../ai/mcp/server/github-workflow/config.mjs')).default;
        DiscussionSyncer = (await import('../../../../../../ai/services/github-workflow/sync/DiscussionSyncer.mjs')).default;
        GraphqlService   = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        ReleaseNotesSyncer    = (await import('../../../../../../ai/services/github-workflow/sync/ReleaseNotesSyncer.mjs')).default;

        originalArchiveRoot    = aiConfig.issueSync.archiveRoot;
        originalDiscussionsDir = aiConfig.issueSync.discussionsDir;
        originalIssuesDir      = aiConfig.issueSync.issuesDir;
        originalContentRoot    = aiConfig.issueSync.contentRoot;
        originalQuery          = GraphqlService.query.bind(GraphqlService);
        originalSortedReleases = ReleaseNotesSyncer.sortedReleases;
    });

    test.beforeEach(async () => {
        tmpRoot = path.resolve(process.cwd(), 'tmp', `discussion-syncer-test-${process.pid}-${Date.now()}`);
        await fs.ensureDir(tmpRoot);

        aiConfig.issueSync.archiveRoot    = path.join(tmpRoot, 'archive');
        aiConfig.issueSync.discussionsDir = path.join(tmpRoot, 'discussions');
        aiConfig.issueSync.issuesDir      = path.join(tmpRoot, 'issues');
        aiConfig.issueSync.contentRoot    = tmpRoot;
        ReleaseNotesSyncer.sortedReleases      = [{tagName: 'v13.0.0', publishedAt: '2026-05-10T00:00:00Z'}];
    });

    test.afterEach(async () => {
        GraphqlService.query               = originalQuery;
        ReleaseNotesSyncer.sortedReleases       = originalSortedReleases;
        aiConfig.issueSync.archiveRoot     = originalArchiveRoot;
        aiConfig.issueSync.discussionsDir  = originalDiscussionsDir;
        aiConfig.issueSync.issuesDir       = originalIssuesDir;
        aiConfig.issueSync.contentRoot     = originalContentRoot;

        await fs.remove(tmpRoot).catch(() => {});
    });

    test('writes active discussions through contentPath and maintains _index.json', async () => {
        const discussion = buildDiscussion(24001, {closed: false});

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes: [discussion],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        const metadata = {discussions: {}};
        const stats = await DiscussionSyncer.syncDiscussions(metadata);
        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-241', 'discussion-24001.md');
        const index = await fs.readJson(path.join(tmpRoot, '_index.json'));

        expect(stats.synced).toEqual([24001]);
        await expect(fs.pathExists(targetPath)).resolves.toBe(true);
        expect(metadata.discussions[24001].path).toBe(path.relative(aiConfig.projectRoot, targetPath));
        expect(index).toContainEqual({
            type: 'discussions',
            id: 24001,
            version: null,
            chunkNumber: 241,
            path: path.join('discussions', 'chunk-241', 'discussion-24001.md')
        });
    });

    test('writes archived discussions through contentPath and maintains _index.json', async () => {
        const discussion = buildDiscussion(24002, {
            closed: true,
            closedAt: '2026-05-01T00:00:00Z'
        });

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes: [discussion],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        const metadata = {discussions: {}};
        const stats = await DiscussionSyncer.syncDiscussions(metadata);
        const targetPath = path.join(aiConfig.issueSync.archiveRoot, 'discussions', 'v13.0.0', 'chunk-1', 'discussion-24002.md');
        const index = await fs.readJson(path.join(tmpRoot, '_index.json'));

        expect(stats.synced).toEqual([24002]);
        await expect(fs.pathExists(targetPath)).resolves.toBe(true);
        expect(metadata.discussions[24002].path).toBe(path.relative(aiConfig.projectRoot, targetPath));
        expect(index).toContainEqual({
            type: 'discussions',
            id: 24002,
            version: 'v13.0.0',
            chunkNumber: 1,
            path: path.join('archive', 'discussions', 'v13.0.0', 'chunk-1', 'discussion-24002.md')
        });
    });
});

function buildDiscussion(number, config = {}) {
    const {closed = false, closedAt = null} = config;

    return {
        number,
        title: `Discussion ${number}`,
        body : 'Discussion body',
        closed,
        closedAt,
        author: {login: 'neo-test'},
        category: {name: 'General'},
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-02T00:00:00Z',
        comments: {nodes: []}
    };
}
