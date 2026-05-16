import {setup} from '../../../../setup.mjs';

const appName = 'IssueSyncerTest';

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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs              from 'fs-extra';
import path            from 'path';

/**
 * @summary Regression coverage for IssueSyncer's timeline-based comment accounting.
 *
 * Two axes of coverage:
 *
 * 1. **Timeline pagination (#10090).** Builds a mocked GitHub issue whose `timelineItems`
 *    connection has 75 events split across two pages — more than `maxTimelineItemsPerIssue` (50) —
 *    and drives the refetch path to confirm that every comment body and structural event makes
 *    it into the rendered markdown. Before the fix, the second-page tail was silently dropped.
 *
 * 2. **Timeline-derived `commentsTotal` (#10110).** Asserts that the `commentsTotal` metadata
 *    field and the frontmatter `commentsCount` are both derived from `timelineItems.nodes`
 *    filtered for `__typename === 'IssueComment'` — the authoritative post-exhaust count — not
 *    from the dropped `issue.comments.totalCount` scalar. Guards against regression back to the
 *    pre-timeline-era dual-source pattern that motivated the deleted sentinel sweep.
 */
test.describe('Neo.ai.services.github-workflow.sync.IssueSyncer', () => {
    let IssueSyncer;
    let GraphqlService;
    let issueSyncConfig;
    let aiConfig;
    let originalQuery;
    let originalArchiveRoot;
    let originalIssuesDir;
    let originalContentRoot;
    let tmpRoot;
    let logger;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/github-workflow/config.mjs')).default;
        issueSyncConfig = aiConfig.issueSync;
        originalArchiveRoot = issueSyncConfig.archiveRoot;
        originalIssuesDir   = issueSyncConfig.issuesDir;
        originalContentRoot = issueSyncConfig.contentRoot;

        tmpRoot = path.resolve(process.cwd(), 'tmp', `issue-syncer-test-${process.pid}-${Date.now()}`);
        await fs.ensureDir(tmpRoot);

        // Redirect local markdown writes to the tmp dir so the test does not pollute
        // the real resources/content/issues tree.
        issueSyncConfig.issuesDir = path.join(tmpRoot, 'issues');
        issueSyncConfig.archiveRoot = path.join(tmpRoot, 'archive');
        issueSyncConfig.contentRoot = tmpRoot;

        GraphqlService = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        IssueSyncer    = (await import('../../../../../../ai/services/github-workflow/sync/IssueSyncer.mjs')).default;
        logger         = (await import('../../../../../../ai/mcp/server/github-workflow/logger.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(async () => {
        GraphqlService.query = originalQuery;
        issueSyncConfig.archiveRoot = originalArchiveRoot;
        issueSyncConfig.issuesDir   = originalIssuesDir;
        issueSyncConfig.contentRoot = originalContentRoot;
        await fs.remove(tmpRoot).catch(() => {});
    });

    test('refetchIssuesByNumber paginates timeline and renders all events past the page cap', async () => {
        const PAGE_SIZE    = issueSyncConfig.maxTimelineItemsPerIssue; // 50
        const TOTAL_EVENTS = 75;
        const FIRST_PAGE   = Array.from({length: PAGE_SIZE}, (_, i) => buildComment(i));
        const SECOND_PAGE  = Array.from({length: TOTAL_EVENTS - PAGE_SIZE}, (_, i) => buildCrossRef(PAGE_SIZE + i));

        const mockIssue = buildMockIssue({
            number       : 42042,
            title        : 'Mock issue — pagination regression #10090',
            timelineFirst: FIRST_PAGE,
            hasNextPage  : true,
            endCursor    : 'cursor-page-1'
        });

        // Counts how many continuation calls the pagination primitive made.
        let continuationCalls = 0;

        GraphqlService.query = async (query, variables) => {
            // FETCH_SINGLE_ISSUE: return the first-page view of the mock issue.
            if (query.includes('FetchSingleIssue')) {
                return {
                    repository: {
                        issue: structuredClone(mockIssue)
                    }
                };
            }

            // FETCH_ISSUE_TIMELINE_PAGE: serve the continuation page.
            if (query.includes('FetchIssueTimelinePage')) {
                continuationCalls++;
                return {
                    repository: {
                        issue: {
                            timelineItems: {
                                pageInfo: {hasNextPage: false, endCursor: null},
                                nodes   : SECOND_PAGE
                            }
                        }
                    },
                    rateLimit: {cost: 1, remaining: 5000, resetAt: '2026-04-19T13:00:00Z'}
                };
            }

            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        const metadata = {issues: {}};
        const stats    = await IssueSyncer.refetchIssuesByNumber([mockIssue.number], metadata);

        expect(stats.refetched.count).toBe(1);
        expect(stats.refetched.issues).toContain(mockIssue.number);
        expect(stats.errors).toHaveLength(0);
        expect(continuationCalls).toBe(1);

        const chunkNumber = 1;
        const writtenPath = path.join(issueSyncConfig.issuesDir, `chunk-${chunkNumber}`, `issue-${mockIssue.number}.md`);
        const written     = await fs.readFile(writtenPath, 'utf-8');

        // Every comment body must appear — the bug being fixed is that second-page comments
        // were silently dropped.
        const commentHeaders = written.match(/^### @mockuser\d+ - /gm) || [];
        expect(commentHeaders).toHaveLength(PAGE_SIZE);

        // Every cross-reference event on the second page must appear too.
        const eventLines = written.match(/^- 2026-04-19T[^ ]+ @tobiu cross-referenced by #\d+$/gm) || [];
        expect(eventLines).toHaveLength(TOTAL_EVENTS - PAGE_SIZE);

        // Frontmatter commentsCount is now derived from timelineItems (#10110) — authoritative
        // against what the markdown actually renders in its Timeline section.
        expect(written).toContain(`id: ${mockIssue.number}`);
        expect(written).toContain(`commentsCount: ${PAGE_SIZE}`);

        // Metadata sentinel is the same timeline-derived count — single source of truth.
        expect(metadata.issues[mockIssue.number].commentsTotal).toBe(PAGE_SIZE);
    });

    test('commentsTotal is derived from timelineItems.nodes filtered for IssueComment (#10110)', async () => {
        // Sanity-check the derivation primitive in isolation: a mixed timeline with 4 IssueComment
        // nodes and 3 non-comment nodes must yield commentsTotal: 4 in both metadata and frontmatter —
        // independent of any `issue.comments.totalCount` scalar (which is no longer fetched).
        const COMMENT_COUNT = 4;
        const EVENT_COUNT   = 3;
        const MIXED_PAGE    = [
            ...Array.from({length: COMMENT_COUNT}, (_, i) => buildComment(i)),
            ...Array.from({length: EVENT_COUNT},   (_, i) => buildCrossRef(100 + i))
        ];

        const mockIssue = buildMockIssue({
            number       : 42043,
            title        : 'Mock issue — timeline-derived commentsTotal #10110',
            timelineFirst: MIXED_PAGE,
            hasNextPage  : false,
            endCursor    : null
        });

        GraphqlService.query = async (query) => {
            if (query.includes('FetchSingleIssue')) {
                return {repository: {issue: structuredClone(mockIssue)}};
            }
            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        const metadata = {issues: {}};
        const stats    = await IssueSyncer.refetchIssuesByNumber([mockIssue.number], metadata);

        expect(stats.refetched.count).toBe(1);
        expect(stats.errors).toHaveLength(0);

        // Metadata sentinel uses the timeline-derived count.
        expect(metadata.issues[mockIssue.number].commentsTotal).toBe(COMMENT_COUNT);

        // Frontmatter commentsCount uses the same derivation — no dual-source divergence possible.
        const chunkNumber = 1;
        const writtenPath = path.join(issueSyncConfig.issuesDir, `chunk-${chunkNumber}`, `issue-${mockIssue.number}.md`);
        const written     = await fs.readFile(writtenPath, 'utf-8');
        expect(written).toContain(`commentsCount: ${COMMENT_COUNT}`);
    });

    test('closed-post-latest-release issue lands in active when no archive-version applies (#11360 supersedes #11288 unversioned-target scenario)', async () => {
        // PRE-#11360: closed-post-latest-release issues with no matching release
        // would fall through to `'unversioned'` archive bucket. That fallback was the
        // architectural bug fixed by #11360 — pre-staging items into a not-yet-existing
        // version archive violates Epic #11187 sealed-chunk semantics.
        //
        // POST-#11360: such items land in ACTIVE path; archive folders for vN.M.K are
        // created at release-cut by publish.mjs, never pre-staged.
        //
        // The #11288 anomaly-hook contract (warn on closedAt-shift across buckets) is
        // preserved for shifts between REAL release buckets (e.g., v11.0.0 → v12.0.0).
        // The "shift to 'unversioned'" / "archive → active" anomaly variant needs to be
        // re-established in a follow-up sub-ticket; deliberately not in scope for #11360.
        const mockIssue = buildMockIssue({
            number       : 50001,
            title        : 'Mock issue — closed-post-latest-release lands in active #11360',
            timelineFirst: [],
            hasNextPage  : false,
            endCursor    : null
        });
        mockIssue.state    = 'CLOSED';
        mockIssue.closedAt = '2026-05-01T00:00:00Z';

        GraphqlService.query = async (query) => {
            if (query.includes('FetchSingleIssue')) {
                return {repository: {issue: structuredClone(mockIssue)}};
            }
            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        const metadata = {
            issues: {
                '50001': {
                    state: 'CLOSED',
                    // Pretend it was previously archived under 'v12'
                    path: path.relative(
                        aiConfig.projectRoot,
                        path.join(issueSyncConfig.archiveRoot, 'issues', 'v12', 'chunk-1', 'issue-50001.md')
                    )
                }
            }
        };

        const stats = await IssueSyncer.refetchIssuesByNumber([mockIssue.number], metadata);

        expect(stats.refetched.count).toBe(1);
        expect(stats.errors).toHaveLength(0);

        // Item lands in active (per Epic #11187 mental model: closed-for-next-release stays in active).
        // Assert via configured active root (issuesDir) rather than literal '/issues/' substring —
        // the test rewrites issuesDir to a tmp dir, so the literal substring no longer matches even
        // when behavior is correct. Per @neo-gpt PR #11362 Cycle 1 review correction.
        const targetPath           = metadata.issues['50001'].path;
        const absoluteTargetPath   = path.resolve(aiConfig.projectRoot, targetPath);
        const relativeToIssuesDir  = path.relative(issueSyncConfig.issuesDir, absoluteTargetPath);
        expect(relativeToIssuesDir.startsWith('..')).toBe(false); // path is under issuesDir
        expect(targetPath).not.toContain('/archive/');
        expect(targetPath).not.toContain('unversioned');
    });

    test('pullFromGitHub enforces sealed-chunk archive semantics', async () => {
        const mockIssue = buildMockIssue({
            number       : 42044,
            title        : 'Mock issue — sealed chunk enforcement #11288',
            timelineFirst: [],
            hasNextPage  : false,
            endCursor    : null
        });
        
        mockIssue.state = 'CLOSED';
        mockIssue.closedAt = '2026-05-13T10:00:00Z'; // new shifted date
        mockIssue.milestone = { title: 'v1.0.0' }; // new shifted milestone
        
        GraphqlService.query = async (query) => {
            if (query.includes('FetchIssuesForSync')) {
                return {
                    rateLimit: { cost: 1, remaining: 4999, resetAt: '2026-05-13T11:00:00Z' },
                    repository: {
                        issues: {
                            pageInfo: { hasNextPage: false, endCursor: null },
                            nodes: [structuredClone(mockIssue)]
                        }
                    }
                };
            }
            if (query.includes('FetchSingleIssue')) {
                return {repository: {issue: structuredClone(mockIssue)}};
            }
            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        const originalOldAbsolutePath = path.join(
            issueSyncConfig.archiveRoot,
            'issues',
            'v0.0.0',
            'chunk-42000',
            `issue-${mockIssue.number}.md`
        );
        const originalOldPath = path.relative(aiConfig.projectRoot, originalOldAbsolutePath);
        
        const metadata = {
            issues: {
                [mockIssue.number]: {
                    state: 'CLOSED',
                    path: originalOldPath,
                    updatedAt: '2026-05-12T10:00:00Z',
                    closedAt: '2026-05-12T10:00:00Z', // original date
                    milestone: null, // original milestone
                    title: mockIssue.title,
                    contentHash: 'somehash',
                    commentsTotal: 0
                }
            }
        };
        
        // create the mock file to simulate it already exists in the archive
        const absOldPath = path.resolve(aiConfig.projectRoot, originalOldPath);
        await fs.ensureDir(path.dirname(absOldPath));
        await fs.writeFile(absOldPath, 'mock content', 'utf8');

        // Execute pullFromGitHub
        const { stats } = await IssueSyncer.pullFromGitHub(metadata);
        
        // Assert it was pulled
        expect(stats.pulled.issues).toContain(mockIssue.number);
        
        // Assert target path in metadata remained the old path despite closedAt/milestone shifting
        expect(metadata.issues[mockIssue.number].path).toBe(originalOldPath);
        
        // Cleanup
        await fs.unlink(absOldPath).catch(() => {});
    });

    test('dropped-label issues do not consume active ordinals', async () => {
        const mockIssueDropped = buildMockIssue({
            number       : 50002,
            title        : 'Mock dropped issue',
            timelineFirst: [],
            hasNextPage  : false,
            endCursor    : null
        });
        // Add a dropped label as configured in aiConfig.issueSync.droppedLabels
        mockIssueDropped.labels = {nodes: [{name: 'duplicate'}]};

        const mockIssueStored = buildMockIssue({
            number       : 50003,
            title        : 'Mock stored issue',
            timelineFirst: [],
            hasNextPage  : false,
            endCursor    : null
        });
        mockIssueStored.labels = {nodes: [{name: 'bug'}]};

        GraphqlService.query = async (query) => {
            if (query.includes('FetchIssuesForSync')) {
                return {
                    rateLimit: { cost: 1, remaining: 4999, resetAt: '2026-05-13T11:00:00Z' },
                    repository: {
                        issues: {
                            pageInfo: { hasNextPage: false, endCursor: null },
                            nodes: [structuredClone(mockIssueDropped), structuredClone(mockIssueStored)]
                        }
                    }
                };
            }
            if (query.includes('FetchSingleIssue')) {
                if (query.includes('50002')) return {repository: {issue: structuredClone(mockIssueDropped)}};
                if (query.includes('50003')) return {repository: {issue: structuredClone(mockIssueStored)}};
            }
            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        const metadata = { issues: {} };

        const { stats, newMetadata } = await IssueSyncer.pullFromGitHub(metadata);

        expect(stats.dropped.issues).toContain(mockIssueDropped.number);
        expect(stats.pulled.issues).toContain(mockIssueStored.number);

        const targetPath = newMetadata.issues[mockIssueStored.number].path;

        // Since the stored issue is the only active one planned, its index is 0,
        // which maps to chunk-1.
        expect(targetPath).toContain('chunk-1');

        // Assert that dropped issue is nowhere in metadata
        expect(newMetadata.issues[mockIssueDropped.number]).toBeUndefined();
    });
});

function buildComment(i) {
    const minute = String(i).padStart(2, '0');
    return {
        __typename: 'IssueComment',
        createdAt : `2026-04-19T10:${minute}:00Z`,
        author    : {login: `mockuser${i}`},
        body      : `Mock comment body #${i}.`
    };
}

function buildCrossRef(i) {
    const minute = String(i).padStart(2, '0');
    return {
        __typename: 'CrossReferencedEvent',
        createdAt : `2026-04-19T11:${minute}:00Z`,
        actor     : {login: 'tobiu'},
        source    : {__typename: 'Issue', number: 10000 + i}
    };
}

/**
 * Builds the minimal GraphQL issue shape that `IssueSyncer.#formatIssueMarkdown` accepts.
 * Post-#10110 the `comments` subselect is gone from the query, so the mock omits it too.
 */
function buildMockIssue({number, title, timelineFirst, hasNextPage, endCursor}) {
    return {
        number,
        title,
        body     : 'This is the mock issue body.',
        state    : 'OPEN',
        createdAt: '2026-04-19T00:00:00Z',
        updatedAt: '2026-04-19T12:00:00Z',
        closedAt : null,
        url      : `https://github.com/neomjs/neo/issues/${number}`,
        author   : {login: 'tobiu'},
        labels   : {nodes: [{name: 'bug'}]},
        assignees: {nodes: [{login: 'tobiu'}]},
        milestone: null,
        parent   : null,
        subIssues       : {nodes: []},
        subIssuesSummary: {total: 0, completed: 0, percentCompleted: 0},
        blockedBy       : {nodes: []},
        blocking        : {nodes: []},
        timelineItems   : {
            pageInfo: {hasNextPage, endCursor},
            nodes   : timelineFirst
        }
    };
}
