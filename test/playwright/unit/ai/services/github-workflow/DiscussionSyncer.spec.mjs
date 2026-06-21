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

import {test, expect}               from '@playwright/test';
import Neo                          from '../../../../../../src/Neo.mjs';
import * as core                    from '../../../../../../src/core/_export.mjs';
import fs                           from 'fs-extra';
import matter                       from 'gray-matter';
import path                         from 'path';
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
    let originalDiscussionDenylist;
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
        originalDiscussionDenylist = aiConfig.issueSync.discussionDenylist;
    });

    test.beforeEach(async () => {
        tmpRoot = path.resolve(process.cwd(), 'tmp', `discussion-syncer-test-${process.pid}-${Date.now()}`);
        await fs.ensureDir(tmpRoot);

        aiConfig.issueSync.archiveRoot    = path.join(tmpRoot, 'archive');
        aiConfig.issueSync.discussionsDir = path.join(tmpRoot, 'discussions');
        aiConfig.issueSync.issuesDir      = path.join(tmpRoot, 'issues');
        aiConfig.issueSync.contentRoot    = tmpRoot;
        ReleaseNotesSyncer.sortedReleases      = [{tagName: 'v13.0.0', publishedAt: '2026-05-10T00:00:00Z'}];
        aiConfig.issueSync.discussionDenylist  = {numbers: [], authors: []};
    });

    test.afterEach(async () => {
        GraphqlService.query               = originalQuery;
        ReleaseNotesSyncer.sortedReleases       = originalSortedReleases;
        aiConfig.issueSync.archiveRoot     = originalArchiveRoot;
        aiConfig.issueSync.discussionsDir  = originalDiscussionsDir;
        aiConfig.issueSync.issuesDir       = originalIssuesDir;
        aiConfig.issueSync.contentRoot     = originalContentRoot;
        aiConfig.issueSync.discussionDenylist = originalDiscussionDenylist;

        await fs.remove(tmpRoot).catch(() => {});
    });

    test('writes active discussions through contentPath and maintains _index.json', async () => {
        const discussion = buildDiscussion(24001, {closed: false});

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [discussion],
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
            type       : 'discussions',
            id         : 24001,
            version    : null,
            chunkNumber: 1,
            path       : path.join('discussions', 'chunk-1', 'discussion-24001.md')
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
                author   : {login: 'neo-answer'},
                body     : 'Accepted answer body.',
                createdAt: '2026-05-02T01:00:00Z',
                isAnswer : true,
                replies  : {nodes: []}
            }, {
                author   : {login: 'neo-thread'},
                body     : 'Regular follow-up.',
                createdAt: '2026-05-02T02:00:00Z',
                isAnswer : false,
                replies  : {nodes: [{
                    author   : {login: 'neo-reply-answer'},
                    body     : 'Nested accepted answer.',
                    createdAt: '2026-05-02T03:00:00Z',
                    isAnswer : true
                }]}
            }]}
        });

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [discussion],
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
                author   : {login: 'neo-parent'},
                body     : 'Parent comment body.',
                createdAt: '2026-05-02T01:00:00Z',
                replies  : {nodes: [{
                    author: {login: 'neo-child'},
                    body  : [
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
                    nodes   : [discussion],
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

    test('sync write-boundary defangs untrusted discussion bodies, comments, and replies before local markdown persistence (#13691)', async () => {
        const discussionNumber = 24006;
        const discussion = buildDiscussion(discussionNumber, {
            comments: {nodes: [{
                id       : 'DC_external',
                author   : {login: 'external-commenter'},
                body     : 'External discussion comment https://discussion-comment.example/payload',
                createdAt: '2026-05-02T01:00:00Z',
                replies  : {nodes: [{
                    id       : 'DCR_external',
                    author   : {login: 'external-replier'},
                    body     : 'External discussion reply https://discussion-reply.example/payload',
                    createdAt: '2026-05-02T02:00:00Z'
                }]}
            }, {
                id       : 'DC_trusted',
                author   : {login: 'neo-gpt'},
                body     : 'Trusted discussion link remains raw https://github.com/neomjs/neo',
                createdAt: '2026-05-02T03:00:00Z',
                replies  : {nodes: []}
            }]}
        });

        discussion.author = {login: 'external-discussion-author'};
        discussion.body   = 'External discussion root https://discussion-root.example/landing';

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [discussion],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        const stats      = await DiscussionSyncer.syncDiscussions({discussions: {}});
        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', `discussion-${discussionNumber}.md`);
        const parsed     = matter(await fs.readFile(targetPath, 'utf8'));

        expect(stats.synced).toEqual([discussionNumber]);
        expect(parsed.data.contentTrust.projected).toBe(true);
        expect(parsed.data.contentTrust.quarantined).toBe(3);
        expect(parsed.content).toContain('[QUARANTINED_URL: discussion-root.example]');
        expect(parsed.content).toContain('[QUARANTINED_URL: discussion-comment.example]');
        expect(parsed.content).toContain('[QUARANTINED_URL: discussion-reply.example]');
        expect(parsed.content).not.toContain('https://discussion-root.example');
        expect(parsed.content).not.toContain('https://discussion-comment.example');
        expect(parsed.content).not.toContain('https://discussion-reply.example');
        expect(parsed.content).toContain('https://github.com/neomjs/neo');
    });

    test('does not add answer markers for regular non-Q&A comments', async () => {
        const discussion = buildDiscussion(24004, {
            category: 'General',
            comments: {nodes: [{
                author   : {login: 'neo-comment'},
                body     : 'Regular discussion comment.',
                createdAt: '2026-05-02T01:00:00Z',
                replies  : {nodes: []}
            }]}
        });

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [discussion],
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
            closed  : true,
            closedAt: '2026-05-01T00:00:00Z'
        });

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [discussion],
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
            type       : 'discussions',
            id         : 24002,
            version    : 'v13.0.0',
            chunkNumber: 1,
            path       : path.join('archive', 'discussions', 'v13.0.0', 'chunk-1', 'discussion-24002.md')
        });

        const content = await fs.readFile(targetPath, 'utf8');
        expect(content).toMatch(/^closed: true$/m);
        expect(content).toMatch(/^closedAt: '2026-05-01T00:00:00Z'$/m);
    });

    test('syncDiscussions prunes emptied active chunk directories after archive moves (#13002)', async () => {
        const discussion = buildDiscussion(24006, {
            closed  : true,
            closedAt: '2026-05-01T00:00:00Z'
        });
        const oldPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-77', 'discussion-24006.md');
        const oldRel  = path.relative(aiConfig.projectRoot, oldPath);

        await fs.ensureDir(path.dirname(oldPath));
        await fs.writeFile(oldPath, 'OLD DISCUSSION CONTENT', 'utf8');

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [discussion],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        const metadata = {
            discussions: {
                24006: {
                    closed     : false,
                    closedAt   : null,
                    contentHash: 'old-hash',
                    path       : oldRel
                }
            }
        };

        const stats      = await DiscussionSyncer.syncDiscussions(metadata);
        const targetPath = path.join(aiConfig.issueSync.archiveRoot, 'discussions', 'v13.0.0', 'chunk-1', 'discussion-24006.md');

        expect(stats.synced).toEqual([24006]);
        await expect(fs.pathExists(targetPath)).resolves.toBe(true);
        await expect(fs.pathExists(oldPath)).resolves.toBe(false);
        await expect(fs.pathExists(path.dirname(oldPath))).resolves.toBe(false);
        await expect(fs.pathExists(aiConfig.issueSync.discussionsDir)).resolves.toBe(true);
        expect(metadata.discussions[24006].path).toBe(path.relative(aiConfig.projectRoot, targetPath));
    });

    test('delta cutoff stops discussion pagination once a batch predates the cached high-water mark (#12190)', async () => {
        // Mirror of the PR/issue delta: order UPDATED_AT DESC + stop at the cached high-water mark.
        const metadata = {
            lastSync   : '2026-05-01T00:00:00Z',
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

    test('containment: skips and excludes a denylisted discussion (by number)', async () => {
        const allowed = buildDiscussion(25001, {closed: false});
        const denied  = buildDiscussion(25002, {closed: false});

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [allowed, denied],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        aiConfig.issueSync.discussionDenylist = {numbers: [25002], authors: []};

        const metadata = {discussions: {}};
        const stats = await DiscussionSyncer.syncDiscussions(metadata);

        const allowedPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-25001.md');
        const deniedPath  = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-25002.md');

        expect(stats.synced).toEqual([25001]);                      // allowed synced, denied excluded
        await expect(fs.pathExists(allowedPath)).resolves.toBe(true);
        await expect(fs.pathExists(deniedPath)).resolves.toBe(false);
        expect(metadata.discussions[25002]).toBeUndefined();        // never enters cache/index
        const index = await fs.readJson(path.join(tmpRoot, '_index.json'));
        expect(index.some(e => e.type === 'discussions' && e.id === 25001)).toBe(true);
        expect(index.some(e => e.type === 'discussions' && e.id === 25002)).toBe(false);
    });

    test('containment: skips a denylisted discussion (by author)', async () => {
        const denied = buildDiscussion(25003, {closed: false});
        denied.author = {login: 'astroturf-account'};

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [denied],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        aiConfig.issueSync.discussionDenylist = {numbers: [], authors: ['astroturf-account']};

        const stats = await DiscussionSyncer.syncDiscussions({discussions: {}});
        const deniedPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-25003.md');

        expect(stats.synced).toEqual([]);
        await expect(fs.pathExists(deniedPath)).resolves.toBe(false);
    });

    test('containment: quarantines a fetched denylisted previously-synced copy (file + metadata + index)', async () => {
        const discussion = buildDiscussion(25004, {closed: false});

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [discussion],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        // First run: normal sync writes the file, metadata, and index entry.
        const metadata = {discussions: {}};
        await DiscussionSyncer.syncDiscussions(metadata);
        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-25004.md');
        const indexPath  = path.join(tmpRoot, '_index.json');
        await expect(fs.pathExists(targetPath)).resolves.toBe(true);
        expect((await fs.readJson(indexPath)).some(e => e.type === 'discussions' && e.id === 25004)).toBe(true);

        // Second run: now denylisted → file, metadata, AND index entry are quarantined/removed.
        aiConfig.issueSync.discussionDenylist = {numbers: [25004], authors: []};
        const stats = await DiscussionSyncer.syncDiscussions(metadata);

        expect(stats.synced).toEqual([]);
        await expect(fs.pathExists(targetPath)).resolves.toBe(false);
        expect(metadata.discussions[25004]).toBeUndefined();
        expect((await fs.readJson(indexPath)).some(e => e.type === 'discussions' && e.id === 25004)).toBe(false);
    });

    test('containment: quarantines a cached denylisted number absent from the current GitHub list (hidden/spam-hammered)', async () => {
        // Run 1: 25006 syncs normally (file + metadata + index entry).
        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [buildDiscussion(25006, {closed: false})],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });
        const metadata = {discussions: {}};
        await DiscussionSyncer.syncDiscussions(metadata);
        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-25006.md');
        const indexPath  = path.join(tmpRoot, '_index.json');
        await expect(fs.pathExists(targetPath)).resolves.toBe(true);
        expect((await fs.readJson(indexPath)).some(e => e.type === 'discussions' && e.id === 25006)).toBe(true);

        // Run 2: 25006 is now denylisted AND GitHub no longer returns it in the list query.
        // The cached copy must still be quarantined by number — file + metadata + index entry.
        aiConfig.issueSync.discussionDenylist = {numbers: [25006], authors: []};
        GraphqlService.query = async () => ({
            repository: {discussions: {nodes: [], pageInfo: {hasNextPage: false, endCursor: null}}}
        });
        await DiscussionSyncer.syncDiscussions(metadata);

        await expect(fs.pathExists(targetPath)).resolves.toBe(false);
        expect(metadata.discussions[25006]).toBeUndefined();
        expect((await fs.readJson(indexPath)).some(e => e.type === 'discussions' && e.id === 25006)).toBe(false);
    });

    test('containment: empty denylist preserves normal sync (no-op)', async () => {
        const discussion = buildDiscussion(25005, {closed: false});

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [discussion],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        aiConfig.issueSync.discussionDenylist = {numbers: [], authors: []};

        const stats = await DiscussionSyncer.syncDiscussions({discussions: {}});
        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-25005.md');

        expect(stats.synced).toEqual([25005]);
        await expect(fs.pathExists(targetPath)).resolves.toBe(true);
    });
    test('refetchDiscussionsByNumber force-re-renders a stale discussion mirror, bypassing the delta/hash gate (#13794)', async () => {
        const discussionNumber = 24050;

        // Cached as current with a STALE contentHash — the bulk delta-sync would skip it.
        // refetchDiscussionsByNumber must force a re-render from live GitHub state regardless.
        const metadata = {
            discussions: {
                [discussionNumber]: {
                    number     : discussionNumber,
                    closed     : false,
                    closedAt   : null,
                    contentHash: 'STALE-HASH',
                    path       : `resources/content/discussions/chunk-1/discussion-${discussionNumber}.md`
                }
            }
        };

        let capturedQuery = null;
        let capturedVars  = null;
        GraphqlService.query = async (query, vars) => {
            capturedQuery = query;
            capturedVars  = vars;

            return {repository: {discussion: buildDiscussion(discussionNumber, {closed: false})}};
        };

        const stats = await DiscussionSyncer.refetchDiscussionsByNumber([discussionNumber], metadata);

        // Used the single-discussion query with the right number — not the bulk pagination query.
        expect(capturedQuery).toContain('FetchSingleDiscussionForSync');
        expect(capturedVars.number).toBe(discussionNumber);

        // Re-rendered + written to the active bucket.
        expect(stats.refetched).toEqual({count: 1, discussions: [discussionNumber]});
        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', `discussion-${discussionNumber}.md`);
        await expect(fs.pathExists(targetPath)).resolves.toBe(true);

        const parsed = matter(await fs.readFile(targetPath, 'utf8'));
        expect(parsed.data.number).toBe(discussionNumber);

        // Metadata refreshed with the live hash (no longer the stale one) + the resolved path.
        expect(metadata.discussions[discussionNumber].contentHash).not.toBe('STALE-HASH');
        expect(metadata.discussions[discussionNumber].path).toBe(path.relative(aiConfig.projectRoot, targetPath));
    });

    test('refetchDiscussionsByNumber skips a discussion that no longer exists on GitHub (#13794)', async () => {
        const discussionNumber = 24051;
        const metadata = {discussions: {}};

        GraphqlService.query = async () => ({repository: {discussion: null}});

        const stats = await DiscussionSyncer.refetchDiscussionsByNumber([discussionNumber], metadata);

        expect(stats.refetched).toEqual({count: 0, discussions: []});
        expect(metadata.discussions[discussionNumber]).toBeUndefined();
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
        body     : 'Discussion body',
        closed,
        closedAt,
        author   : {login: 'neo-test'},
        category : {name: category},
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-02T00:00:00Z',
        comments
    };
}
