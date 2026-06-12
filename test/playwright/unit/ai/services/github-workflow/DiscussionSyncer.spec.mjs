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
import {FETCH_DISCUSSIONS_FOR_SYNC} from '../../../../../../ai/services/github-workflow/queries/discussionQueries.mjs';

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
        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-24001.md');
        const index = await fs.readJson(path.join(tmpRoot, '_index.json'));

        expect(stats.synced).toEqual([24001]);
        await expect(fs.pathExists(targetPath)).resolves.toBe(true);
        expect(metadata.discussions[24001].path).toBe(path.relative(aiConfig.projectRoot, targetPath));
        expect(index).toContainEqual({
            type: 'discussions',
            id: 24001,
            version: null,
            chunkNumber: 1,
            path: path.join('discussions', 'chunk-1', 'discussion-24001.md')
        });

        const content = await fs.readFile(targetPath, 'utf8');
        expect(content).toMatch(/^closed: false$/m);
        expect(content).toMatch(/^closedAt: null$/m);
    });

    test('fetches accepted-answer flags for comments and replies', () => {
        const answerFlagMatches = FETCH_DISCUSSIONS_FOR_SYNC.match(/\bisAnswer\b/g) || [];

        expect(answerFlagMatches).toHaveLength(2);
    });

    test('marks accepted Q&A comments with a parseable answer callout', async () => {
        const discussion = buildDiscussion(24003, {
            category: 'Q&A',
            comments: {nodes: [{
                author: {login: 'neo-answer'},
                body: 'Accepted answer body.',
                createdAt: '2026-05-02T01:00:00Z',
                isAnswer: true,
                replies: {nodes: []}
            }, {
                author: {login: 'neo-thread'},
                body: 'Regular follow-up.',
                createdAt: '2026-05-02T02:00:00Z',
                isAnswer: false,
                replies: {nodes: [{
                    author: {login: 'neo-reply-answer'},
                    body: 'Nested accepted answer.',
                    createdAt: '2026-05-02T03:00:00Z',
                    isAnswer: true
                }]}
            }]}
        });

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes: [discussion],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        await DiscussionSyncer.syncDiscussions({discussions: {}});

        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-24003.md');
        const content = await fs.readFile(targetPath, 'utf8');

        expect(content).toContain([
            '### `@neo-answer` commented on 2026-05-02T01:00:00Z',
            '',
            '> [!ANSWER]',
            '',
            'Accepted answer body.'
        ].join('\n'));
        expect(content).toContain([
            '#### Reply depth=1 by `@neo-reply-answer` on 2026-05-02T03:00:00Z',
            '',
            '> [!ANSWER]',
            '',
            'Nested accepted answer.'
        ].join('\n'));
    });

    test('emits structured reply markers that preserve parent comment identity', async () => {
        const discussion = buildDiscussion(24005, {
            comments: {nodes: [{
                author: {login: 'neo-parent'},
                body: 'Parent comment body.',
                createdAt: '2026-05-02T01:00:00Z',
                replies: {nodes: [{
                    author: {login: 'neo-child'},
                    body: [
                        'Reply body.',
                        '',
                        '### Inner heading remains reply markdown.'
                    ].join('\n'),
                    createdAt: '2026-05-02T02:00:00Z'
                }]}
            }]}
        });

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes: [discussion],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        await DiscussionSyncer.syncDiscussions({discussions: {}});

        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-24005.md');
        const content = await fs.readFile(targetPath, 'utf8');

        expect(content).toContain([
            '### `@neo-parent` commented on 2026-05-02T01:00:00Z',
            '',
            'Parent comment body.',
            '',
            '#### Reply depth=1 by `@neo-child` on 2026-05-02T02:00:00Z',
            '',
            'Reply body.',
            '',
            '### Inner heading remains reply markdown.'
        ].join('\n'));
    });

    test('does not add answer markers for regular non-Q&A comments', async () => {
        const discussion = buildDiscussion(24004, {
            category: 'General',
            comments: {nodes: [{
                author: {login: 'neo-comment'},
                body: 'Regular discussion comment.',
                createdAt: '2026-05-02T01:00:00Z',
                replies: {nodes: []}
            }]}
        });

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes: [discussion],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        await DiscussionSyncer.syncDiscussions({discussions: {}});

        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-24004.md');
        const content = await fs.readFile(targetPath, 'utf8');

        expect(content).toContain('Regular discussion comment.');
        expect(content).not.toContain('> [!ANSWER]');
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

        const content = await fs.readFile(targetPath, 'utf8');
        expect(content).toMatch(/^closed: true$/m);
        expect(content).toMatch(/^closedAt: '2026-05-01T00:00:00Z'$/m);
    });

    test('delta cutoff stops discussion pagination once a batch predates the cached high-water mark (#12190)', async () => {
        // Mirror of the PR/issue delta: order UPDATED_AT DESC + stop at the cached high-water mark.
        const metadata = {
            lastSync: '2026-05-01T00:00:00Z',
            discussions: {
                9001: {updatedAt: '2026-05-01T00:00:00Z', path: 'resources/content/discussions/chunk-1/discussion-9001.md'}
            }
        };

        const discNew    = buildDiscussion(8001); discNew.updatedAt    = '2026-05-03T00:00:00Z'; // after hwm → fetched
        const discOld    = buildDiscussion(7001); discOld.updatedAt    = '2026-04-29T00:00:00Z'; // before hwm → trips cutoff
        const discTooOld = buildDiscussion(6001); discTooOld.updatedAt = '2026-04-28T00:00:00Z'; // must never be fetched

        let queryCalls = 0;
        GraphqlService.query = async () => {
            queryCalls++;
            if (queryCalls === 1) return {repository: {discussions: {nodes: [discNew],    pageInfo: {hasNextPage: true,  endCursor: 'c1'}}}};
            if (queryCalls === 2) return {repository: {discussions: {nodes: [discOld],    pageInfo: {hasNextPage: true,  endCursor: 'c2'}}}};
            return                       {repository: {discussions: {nodes: [discTooOld], pageInfo: {hasNextPage: false, endCursor: null}}}};
        };

        await DiscussionSyncer.syncDiscussions(metadata);

        // Stopped at page 2 (its oldest discussion predates the high-water mark); page 3 never requested.
        expect(queryCalls).toBe(2);
    });
});

function buildDiscussion(number, config = {}) {
    const {
        category = 'General',
        closed = false,
        closedAt = null,
        comments = {nodes: []}
    } = config;

    return {
        number,
        title: `Discussion ${number}`,
        body : 'Discussion body',
        closed,
        closedAt,
        author: {login: 'neo-test'},
        category: {name: category},
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-02T00:00:00Z',
        comments
    };
}
