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
import matter         from 'gray-matter';
import path           from 'path';
import {
    FETCH_DISCUSSION_COMMENTS_PAGE,
    FETCH_DISCUSSION_REPLIES_PAGE,
    FETCH_DISCUSSIONS_FOR_SYNC,
    FETCH_SINGLE_DISCUSSION_FOR_SYNC
} from '../../../../../../ai/services/github-workflow/queries/discussionQueries.mjs';

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
    let originalDiscussionOuterPageSize;
    let tmpRoot;

    test.beforeAll(async () => {
        aiConfig         = (await import('../../../../../../ai/mcp/server/github-workflow/config.template.mjs')).default;
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
        originalDiscussionOuterPageSize = aiConfig.issueSync.discussionOuterPageSize;
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
        aiConfig.issueSync.discussionOuterPageSize = originalDiscussionOuterPageSize;

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

        const metadata   = {discussions: {}};
        const stats      = await DiscussionSyncer.syncDiscussions(metadata);
        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-24001.md');
        const index      = await fs.readJson(path.join(tmpRoot, '_index.json'));

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
        expect(content).toMatch(/^routingDispositionSchemaVersion: discussion-routing-disposition\.v1$/m);
        expect(content).toMatch(/^routingDisposition: undetermined$/m);
        expect(content).toMatch(/^routingDispositionReason: untrusted-or-unclassified-root-author$/m);
        expect(content).toMatch(/^conversationComplete: true$/m);
    });

    test('a delta run MERGES into the cache and persists `updatedAt` — the matched pair (#16001)', async () => {
        // Two defects that only make sense fixed together.
        //
        // `updatedAt` was never written into the cache entry, so the delta cutoff — computed as
        // `Date.parse(d.updatedAt)` over cached entries — saw NaN for every one, produced an empty date
        // list and resolved to 0. The `UPDATED_AT`-descending early break could therefore never fire and
        // every run re-paged the entire discussion history at full GraphQL cost.
        //
        // The repopulation also REPLACED `metadata.discussions` wholesale, which was harmless only
        // BECAUSE that zero cutoff made the fetch the whole corpus. Persisting `updatedAt` without
        // converting the replace to a merge would start dropping every entry the delta skipped: each
        // would lose its `path` and `contentHash`, miss the unchanged-content shortcut, and be rewritten
        // on every subsequent run — a permanently non-empty diff in a tracked generated corpus, which is
        // worse than the loud failure it replaced.
        const fetched   = buildDiscussion(24101, {closed: false}),
              untouched = {
                  number     : 24100,
                  path       : 'resources/content/discussions/chunk-1/discussion-24100.md',
                  closed     : false,
                  closedAt   : null,
                  contentHash: 'UNTOUCHED-HASH',
                  updatedAt  : '2026-04-01T00:00:00Z'
              };

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [fetched],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        // `24100` is deliberately absent from the fetch — it is what a working delta legitimately skips.
        const metadata = {discussions: {24100: {...untouched}}, lastSync: '2026-05-01T00:00:00Z'};

        await DiscussionSyncer.syncDiscussions(metadata);

        // MERGE: the skipped entry survives field-for-field. A wholesale replace drops it entirely.
        expect(metadata.discussions[24100]).toEqual(untouched);

        // And the fetched entry carries the field the cutoff is computed from, so the NEXT run can
        // actually break early instead of paging everything again.
        expect(metadata.discussions[24101].updatedAt).toBe('2026-05-02T00:00:00Z');
    });

    test('COMPLETE-membership red-proof: a new discussion ranks PAST the marooned on-disk backlog into chunk-2 (#15452)', async () => {
        // The discriminating witness for the complete-membership fix. Two discussions already on disk are NOT in metadata (the
        // marooned backlog). With a chunk size of 2, a NEW discussion's ordinal MUST count them — landing it
        // in chunk-2 — instead of ranking against the delta alone (index 0 → chunk-1, the pre-fix defect).
        const originalThreshold = aiConfig.issueSync.archiveChunkThreshold;

        aiConfig.issueSync.archiveChunkThreshold = 2;

        try {
            const chunk1 = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1');

            await fs.ensureDir(chunk1);
            await fs.writeFile(path.join(chunk1, 'discussion-24010.md'), '# marooned 24010\n');
            await fs.writeFile(path.join(chunk1, 'discussion-24011.md'), '# marooned 24011\n');

            const discussion = buildDiscussion(24012, {closed: false});

            GraphqlService.query = async () => ({
                repository: {discussions: {nodes: [discussion], pageInfo: {hasNextPage: false, endCursor: null}}}
            });

            await DiscussionSyncer.syncDiscussions({discussions: {}});

            // complete membership (24010 + 24011 on disk, then 24012) → itemIndex 2 → chunk-2; the partial
            // ordinal (24012 alone) would be index 0 → chunk-1.
            const correct = path.join(aiConfig.issueSync.discussionsDir, 'chunk-2', 'discussion-24012.md'),
                  wrong   = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-24012.md');

            await expect(fs.pathExists(correct)).resolves.toBe(true);
            await expect(fs.pathExists(wrong)).resolves.toBe(false)
        } finally {
            aiConfig.issueSync.archiveChunkThreshold = originalThreshold
        }
    });

    test('projects trusted lifecycle markers into typed source-owned routing frontmatter', async () => {
        const discussion = buildDiscussion(24007, {category: 'Ideas'});
        discussion.author = {login: 'neo-gpt'};
        discussion.body   = 'OQ1 [RESOLVED_TO_AC]\nOQ2 [OQ_RESOLUTION_PENDING]';

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [discussion],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        await DiscussionSyncer.syncDiscussions({discussions: {}});

        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-24007.md');
        const parsed     = matter(await fs.readFile(targetPath, 'utf8'));

        expect(parsed.data).toMatchObject({
            routingDispositionSchemaVersion: 'discussion-routing-disposition.v1',
            routingDisposition             : 'active',
            routingDispositionReason       : 'explicit-active-marker',
            routingDispositionEvidence     : ['marker:OQ_RESOLUTION_PENDING']
        })
    });

    test('keeps comments outside the root-body lifecycle authority', async () => {
        const discussion = buildDiscussion(24008, {
            category: 'Ideas',
            comments: {
                nodes: [{
                    author   : {login: 'external-commenter'},
                    body     : '[GRADUATED_TO_TICKET: #99999]',
                    createdAt: '2026-05-02T01:00:00Z',
                    replies  : {nodes: []}
                }, {
                    author   : {login: 'neo-gpt'},
                    body     : '[OQ_RESOLUTION_PENDING] trusted comment only',
                    createdAt: '2026-05-02T02:00:00Z',
                    replies  : {nodes: []}
                }],
                pageInfo: {hasNextPage: false, endCursor: null}
            }
        });
        discussion.author = {login: 'neo-gpt'};
        discussion.body   = 'Marker-free authoritative root body.';

        GraphqlService.query = async () => ({
            repository: {
                discussions: {
                    nodes   : [discussion],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        await DiscussionSyncer.syncDiscussions({discussions: {}});

        const targetPath = path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-24008.md');
        const parsed     = matter(await fs.readFile(targetPath, 'utf8'));

        expect(parsed.content).toContain('[GRADUATED_TO_TICKET: #99999]');
        expect(parsed.content).toContain('[OQ_RESOLUTION_PENDING] trusted comment only');
        expect(parsed.data).toMatchObject({
            routingDisposition        : 'undetermined',
            routingDispositionReason  : 'no-authoritative-lifecycle-marker',
            routingDispositionEvidence: []
        })
    });

    test('fetches accepted-answer flags for comments and replies', () => {
        const answerFlagMatches = FETCH_DISCUSSIONS_FOR_SYNC.match(/\bisAnswer\b/g) || [];

        expect(answerFlagMatches).toHaveLength(2);
    });

    test('bulk and force-refetch queries carry the same nested exhaustion evidence', () => {
        for (const query of [FETCH_DISCUSSIONS_FOR_SYNC, FETCH_SINGLE_DISCUSSION_FOR_SYNC]) {
            expect(query.match(/\btotalCount\b/g)).toHaveLength(2);
            expect(query.match(/\bendCursor\b/g)).toHaveLength(query === FETCH_DISCUSSIONS_FOR_SYNC ? 3 : 2);
            expect(query.match(/\bhasNextPage\b/g)).toHaveLength(query === FETCH_DISCUSSIONS_FOR_SYNC ? 3 : 2);
            expect(query).toContain('paginationId: id')
        }

        expect(FETCH_DISCUSSION_COMMENTS_PAGE).toContain('comments(first: $maxComments, after: $cursor)');
        expect(FETCH_DISCUSSION_COMMENTS_PAGE).toContain('replies(first: $maxReplies)');
        expect(FETCH_DISCUSSION_REPLIES_PAGE).toContain('node(id: $commentId)');
        expect(FETCH_DISCUSSION_REPLIES_PAGE).toContain('replies(first: $maxReplies, after: $cursor)')
    });

    test('exhausts top-level comment pages before rendering the discussion', async () => {
        const discussion = buildDiscussion(24009, {
            comments: {
                nodes     : Array.from({length: 50}, (_, index) => buildComment(index)),
                totalCount: 51,
                pageInfo  : {hasNextPage: true, endCursor: 'comment-50'}
            }
        });
        const calls = [];

        GraphqlService.query = async (query, variables) => {
            calls.push({query, variables});

            if (query.includes('FetchDiscussionCommentsPage')) {
                return {
                    repository: {
                        discussion: {
                            comments: {
                                nodes     : [buildComment(50)],
                                totalCount: 51,
                                pageInfo  : {hasNextPage: false, endCursor: null}
                            }
                        }
                    }
                }
            }

            return {
                repository: {discussions: {nodes: [discussion], pageInfo: {hasNextPage: false, endCursor: null}}}
            }
        };

        const stats = await DiscussionSyncer.syncDiscussions({discussions: {}});

        const parsed = matter(await fs.readFile(
            path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-24009.md'),
            'utf8'
        ));

        expect(stats.synced).toEqual([24009]);
        expect(calls.filter(({query}) => query.includes('FetchDiscussionCommentsPage'))).toHaveLength(1);
        expect(calls.at(-1).variables).toMatchObject({
            number: 24009,
            cursor: 'comment-50'
        });
        expect(parsed.data).toMatchObject({
            conversationComplete            : true,
            conversationCommentCountObserved: 51,
            conversationCommentCountTotal   : 51,
            conversationReplyCountObserved  : 0,
            conversationReplyCountTotal     : 0
        });
        expect(parsed.content).toContain('Comment 50')
    });

    test('exhausts nested reply pages before rendering the discussion', async () => {
        const discussion = buildDiscussion(24010, {
            comments: {
                nodes: [buildComment(0, {
                    replies      : Array.from({length: 20}, (_, index) => buildReply(index)),
                    replyTotal   : 21,
                    replyPageInfo: {hasNextPage: true, endCursor: 'reply-20'}
                })]
            }
        });
        const calls = [];

        GraphqlService.query = async (query, variables) => {
            calls.push({query, variables});

            if (query.includes('FetchDiscussionRepliesPage')) {
                return {
                    node: {
                        replies: {
                            nodes     : [buildReply(20)],
                            totalCount: 21,
                            pageInfo  : {hasNextPage: false, endCursor: null}
                        }
                    }
                }
            }

            return {
                repository: {discussions: {nodes: [discussion], pageInfo: {hasNextPage: false, endCursor: null}}}
            }
        };

        const stats = await DiscussionSyncer.syncDiscussions({discussions: {}});

        const parsed = matter(await fs.readFile(
            path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', 'discussion-24010.md'),
            'utf8'
        ));

        expect(stats.synced).toEqual([24010]);
        expect(calls.filter(({query}) => query.includes('FetchDiscussionRepliesPage'))).toHaveLength(1);
        expect(calls.at(-1).variables).toMatchObject({
            commentId: 'DC_0',
            cursor   : 'reply-20'
        });
        expect(parsed.data).toMatchObject({
            conversationComplete            : true,
            conversationCommentCountObserved: 1,
            conversationCommentCountTotal   : 1,
            conversationReplyCountObserved  : 21,
            conversationReplyCountTotal     : 21
        });
        expect(parsed.content).toContain('Reply 20')
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
        const content    = await fs.readFile(targetPath, 'utf8');

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
        const content    = await fs.readFile(targetPath, 'utf8');

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
        const discussion       = buildDiscussion(discussionNumber, {
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
        const content    = await fs.readFile(targetPath, 'utf8');

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

        const metadata   = {discussions: {}};
        const stats      = await DiscussionSyncer.syncDiscussions(metadata);
        const targetPath = path.join(aiConfig.issueSync.archiveRoot, 'discussions', 'v13.0.0', 'chunk-1', 'discussion-24002.md');
        const index      = await fs.readJson(path.join(tmpRoot, '_index.json'));

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

    test('clean-slate bootstrap uses the bounded outer page size and follows every cursor (#15977)', async () => {
        const
            first  = buildDiscussion(26001),
            second = buildDiscussion(26002),
            calls  = [];

        GraphqlService.query = async (query, variables) => {
            calls.push({...variables});

            return {
                repository: {
                    discussions: variables.cursor === null
                        ? {nodes: [first], pageInfo: {hasNextPage: true, endCursor: 'page-2'}}
                        : {nodes: [second], pageInfo: {hasNextPage: false, endCursor: null}}
                }
            }
        };

        const stats = await DiscussionSyncer.syncDiscussions({discussions: {}, lastSync: null});

        expect(calls).toHaveLength(2);
        expect(calls.map(({limit}) => limit)).toEqual([30, 30]);
        expect(calls.map(({cursor}) => cursor)).toEqual([null, 'page-2']);
        expect(stats.synced).toEqual([26001, 26002])
    });

    test('rejects an outer page size above the production-proven ceiling (#15977)', async () => {
        aiConfig.issueSync.discussionOuterPageSize = 31;

        await expect(DiscussionSyncer.syncDiscussions({discussions: {}, lastSync: null}))
            .rejects.toThrow('issueSync.discussionOuterPageSize must be an integer between 1 and 30.');
    });

    test('resource-limit recovery halves the page size and retries the same cursor (#15977)', async () => {
        const
            first  = buildDiscussion(26003),
            second = buildDiscussion(26004),
            calls  = [];

        GraphqlService.query = async (query, variables) => {
            calls.push({...variables});

            if (calls.length === 1) {
                const error = new Error('GitHub API error: Resource limits for this query exceeded');
                error.graphqlErrors = [{type: 'RESOURCE_LIMITS_EXCEEDED'}];
                throw error;
            }

            return {
                repository: {
                    discussions: variables.cursor === null
                        ? {nodes: [first], pageInfo: {hasNextPage: true, endCursor: 'page-2'}}
                        : {nodes: [second], pageInfo: {hasNextPage: false, endCursor: null}}
                }
            }
        };

        const stats = await DiscussionSyncer.syncDiscussions({discussions: {}, lastSync: null});

        expect(calls.map(({limit}) => limit)).toEqual([30, 15, 15]);
        expect(calls.map(({cursor}) => cursor)).toEqual([null, null, 'page-2']);
        expect(stats.synced).toEqual([26003, 26004]);
    });

    test('resource-limit recovery fails loud when one discussion still exceeds the budget (#15977)', async () => {
        const calls = [];

        GraphqlService.query = async (query, variables) => {
            calls.push({...variables});

            const error = new Error('GitHub API error: Resource limits for this query exceeded');
            error.graphqlErrors = [{type: 'RESOURCE_LIMITS_EXCEEDED'}];
            throw error;
        };

        await expect(DiscussionSyncer.syncDiscussions({discussions: {}, lastSync: null}))
            .rejects.toThrow('GitHub API error: Resource limits for this query exceeded');

        expect(calls.map(({limit}) => limit)).toEqual([30, 15, 7, 3, 1]);
        expect(calls.map(({cursor}) => cursor)).toEqual([null, null, null, null, null]);
    });

    test('non-resource GraphQL failures do not enter the page-size recovery path (#15977)', async () => {
        const calls = [];

        GraphqlService.query = async (query, variables) => {
            calls.push({...variables});

            const error = new Error('GitHub API error: Repository access denied');
            error.graphqlErrors = [{type: 'FORBIDDEN'}];
            throw error;
        };

        await expect(DiscussionSyncer.syncDiscussions({discussions: {}, lastSync: null}))
            .rejects.toThrow('GitHub API error: Repository access denied');

        expect(calls.map(({limit}) => limit)).toEqual([30]);
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
        const stats    = await DiscussionSyncer.syncDiscussions(metadata);

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

        const stats      = await DiscussionSyncer.syncDiscussions({discussions: {}});
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

        const stats      = await DiscussionSyncer.syncDiscussions({discussions: {}});
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
                    path       : `resources/content/discussions/chunk-1/discussion-${discussionNumber}.md`,
                    updatedAt  : '2026-03-01T00:00:00Z'
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
        expect(parsed.data).toMatchObject({
            number              : discussionNumber,
            conversationComplete: true
        });

        // Metadata refreshed with the live hash (no longer the stale one) + the resolved path.
        expect(metadata.discussions[discussionNumber].contentHash).not.toBe('STALE-HASH');
        expect(metadata.discussions[discussionNumber].path).toBe(path.relative(aiConfig.projectRoot, targetPath));

        // This write OVERWRITES the row, so the high-water field has to be re-emitted or recovery
        // strips it. The delta cutoff is computed from `updatedAt` across cached entries: a repair pass
        // that dropped it would lower the cutoff, and once enough rows lost it the cutoff falls to zero
        // and the whole discussion history is re-paged again. A recovery path must not reintroduce the
        // defect it recovered from, so this asserts the LIVE value replaced the stale cached one rather
        // than merely being present.
        expect(metadata.discussions[discussionNumber].updatedAt).toBe('2026-05-02T00:00:00Z');
    });

    test('refetchDiscussionsByNumber skips a discussion that no longer exists on GitHub (#13794)', async () => {
        const discussionNumber = 24051;
        const metadata         = {discussions: {}};

        GraphqlService.query = async () => ({repository: {discussion: null}});

        const stats = await DiscussionSyncer.refetchDiscussionsByNumber([discussionNumber], metadata);

        expect(stats.refetched).toEqual({count: 0, discussions: []});
        expect(metadata.discussions[discussionNumber]).toBeUndefined();
    });

    test('refetchDiscussionsByNumber exhausts comment and reply pages before writing', async () => {
        const
            discussionNumber = 24052,
            comments         = Array.from({length: 50}, (_, index) => buildComment(index)),
            metadata         = {discussions: {}},
            calls            = [];

        comments[0] = buildComment(0, {
            replies      : Array.from({length: 20}, (_, index) => buildReply(index)),
            replyTotal   : 21,
            replyPageInfo: {hasNextPage: true, endCursor: 'reply-20'}
        });

        const discussion = buildDiscussion(discussionNumber, {
            comments: {
                nodes     : comments,
                totalCount: 51,
                pageInfo  : {hasNextPage: true, endCursor: 'comment-50'}
            }
        });

        GraphqlService.query = async (query, variables) => {
            calls.push({query, variables});

            if (query.includes('FetchDiscussionCommentsPage')) {
                return {
                    repository: {
                        discussion: {
                            comments: {
                                nodes     : [buildComment(50)],
                                totalCount: 51,
                                pageInfo  : {hasNextPage: false, endCursor: null}
                            }
                        }
                    }
                }
            }

            if (query.includes('FetchDiscussionRepliesPage')) {
                return {
                    node: {
                        replies: {
                            nodes     : [buildReply(20)],
                            totalCount: 21,
                            pageInfo  : {hasNextPage: false, endCursor: null}
                        }
                    }
                }
            }

            return {repository: {discussion}}
        };

        const stats  = await DiscussionSyncer.refetchDiscussionsByNumber([discussionNumber], metadata);
        const parsed = matter(await fs.readFile(
            path.join(aiConfig.issueSync.discussionsDir, 'chunk-1', `discussion-${discussionNumber}.md`),
            'utf8'
        ));

        expect(stats).toEqual({
            refetched: {count: 1, discussions: [discussionNumber]},
            errors   : []
        });
        expect(calls.map(({query}) => query.match(/\bquery\s+(\w+)/)?.[1])).toEqual([
            'FetchSingleDiscussionForSync',
            'FetchDiscussionCommentsPage',
            'FetchDiscussionRepliesPage'
        ]);
        expect(parsed.data).toMatchObject({
            conversationComplete            : true,
            conversationCommentCountObserved: 51,
            conversationCommentCountTotal   : 51,
            conversationReplyCountObserved  : 21,
            conversationReplyCountTotal     : 21
        });
        expect(parsed.content).toContain('Comment 50');
        expect(parsed.content).toContain('Reply 20')
    });
});

function buildDiscussion(number, config = {}) {
    const {
        category = 'General',
        closed = false,
        closedAt = null,
        comments = {nodes: []}
    } = config;

    const normalizedComments = {
        ...comments,
        nodes     : (comments.nodes || []).map(comment => ({
            ...comment,
            replies: {
                ...(comment.replies || {}),
                nodes     : comment.replies?.nodes || [],
                totalCount: comment.replies?.totalCount ?? comment.replies?.nodes?.length ?? 0,
                pageInfo  : comment.replies?.pageInfo || {hasNextPage: false, endCursor: null}
            }
        })),
        totalCount: comments.totalCount ?? comments.nodes?.length ?? 0,
        pageInfo  : comments.pageInfo || {hasNextPage: false, endCursor: null}
    };

    return {
        number,
        title    : `Discussion ${number}`,
        body     : 'Discussion body',
        closed,
        closedAt,
        author   : {login: 'neo-test'},
        category : {name: category},
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-02T00:00:00Z',
        comments : normalizedComments
    };
}

/**
 * @summary Creates one Discussion comment fixture with explicit reply-connection exhaustion facts.
 * @param {Number} index Stable fixture ordinal.
 * @param {Object} config Optional reply connection overrides.
 * @returns {Object}
 */
function buildComment(index, config = {}) {
    const replies = config.replies || [];

    return {
        paginationId: `DC_${index}`,
        author      : {login: 'neo-test'},
        body        : config.body || `Comment ${index}`,
        createdAt   : `2026-05-02T01:${String(index).padStart(2, '0')}:00Z`,
        replies     : {
            nodes     : replies,
            totalCount: config.replyTotal ?? replies.length,
            pageInfo  : config.replyPageInfo || {hasNextPage: false, endCursor: null}
        }
    }
}

/**
 * @summary Creates one Discussion reply fixture for continuation-page witnesses.
 * @param {Number} index Stable fixture ordinal.
 * @returns {Object}
 */
function buildReply(index) {
    return {
        author   : {login: 'neo-test'},
        body     : `Reply ${index}`,
        createdAt: `2026-05-02T02:${String(index).padStart(2, '0')}:00Z`,
        isAnswer : false
    }
}
