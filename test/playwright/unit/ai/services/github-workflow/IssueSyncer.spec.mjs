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
import matter          from 'gray-matter';
import path            from 'path';
import crypto          from 'crypto';

/**
 * @summary Regression coverage for IssueSyncer's timeline-based comment accounting.
 *
 * Two axes of coverage:
 *
     * 1. **Timeline pagination.** Builds a mocked GitHub issue whose `timelineItems`
 *    connection has 75 events split across two pages — more than `maxTimelineItemsPerIssue` (50) —
 *    and drives the refetch path to confirm that every comment body and structural event makes
 *    it into the rendered markdown. Before the fix, the second-page tail was silently dropped.
 *
     * 2. **Timeline-derived `commentsTotal`.** Asserts that the `commentsTotal` metadata
 *    field and the frontmatter `commentsCount` are both derived from `timelineItems.nodes`
 *    filtered for `__typename === 'IssueComment'` — the authoritative post-exhaust count — not
 *    from the dropped `issue.comments.totalCount` scalar. Guards against regression back to the
 *    pre-timeline-era dual-source pattern that motivated the deleted sentinel sweep.
 */
test.describe('Neo.ai.services.github-workflow.sync.IssueSyncer', () => {
    let IssueSyncer;
    let ReleaseNotesSyncer;
    let GraphqlService;
    let issueSyncConfig;
    let aiConfig;
    let originalQuery;
    let originalArchiveRoot;
    let originalIssuesDir;
    let originalContentRoot;
    let originalRouteByMilestone;
    let tmpRoot;
    let logger;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/github-workflow/config.mjs')).default;
        issueSyncConfig = aiConfig.issueSync;
        originalArchiveRoot = issueSyncConfig.archiveRoot;
        originalIssuesDir   = issueSyncConfig.issuesDir;
        originalContentRoot = issueSyncConfig.contentRoot;
        originalRouteByMilestone = issueSyncConfig.routeByMilestone;

        tmpRoot = path.resolve(process.cwd(), 'tmp', `issue-syncer-test-${process.pid}-${Date.now()}`);
        await fs.ensureDir(tmpRoot);

        // Redirect local markdown writes to the tmp dir so the test does not pollute
        // the real resources/content/issues tree.
        issueSyncConfig.issuesDir = path.join(tmpRoot, 'issues');
        issueSyncConfig.archiveRoot = path.join(tmpRoot, 'archive');
        issueSyncConfig.contentRoot = tmpRoot;

        GraphqlService = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        IssueSyncer    = (await import('../../../../../../ai/services/github-workflow/sync/IssueSyncer.mjs')).default;
        ReleaseNotesSyncer = (await import('../../../../../../ai/services/github-workflow/sync/ReleaseNotesSyncer.mjs')).default;
        logger         = (await import('../../../../../../ai/mcp/server/github-workflow/logger.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(async () => {
        GraphqlService.query = originalQuery;
        issueSyncConfig.archiveRoot = originalArchiveRoot;
        issueSyncConfig.issuesDir   = originalIssuesDir;
        issueSyncConfig.contentRoot = originalContentRoot;
        issueSyncConfig.routeByMilestone = originalRouteByMilestone;
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
        const written = await fs.readFile(writtenPath, 'utf-8');

        // Every comment body must appear — the bug being fixed is that second-page comments
        // were silently dropped.
        const commentHeaders = written.match(/^### @mockuser\d+ - /gm) || [];
        expect(commentHeaders).toHaveLength(PAGE_SIZE);

        // Every cross-reference event on the second page must appear too.
        const eventLines = written.match(/^- 2026-04-19T[^ ]+ @tobiu cross-referenced by #\d+$/gm) || [];
        expect(eventLines).toHaveLength(TOTAL_EVENTS - PAGE_SIZE);

        // Frontmatter commentsCount is now derived from timelineItems — authoritative
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
        const written = await fs.readFile(writtenPath, 'utf-8');
        expect(written).toContain(`commentsCount: ${COMMENT_COUNT}`);
    });

    test('sync write-boundary defangs untrusted issue bodies and comments before local markdown persistence (#13691)', async () => {
        const externalComment = buildComment(1);
        externalComment.id     = 'IC_external';
        externalComment.author = {login: 'external-reviewer'};
        externalComment.body   = 'Useful critique, then a watering-hole URL: https://comment.example/payload';

        const trustedComment = buildComment(2);
        trustedComment.id     = 'IC_trusted';
        trustedComment.author = {login: 'neo-gpt'};
        trustedComment.body   = 'Trusted maintainer source link stays raw: https://github.com/neomjs/neo';

        const mockIssue = buildMockIssue({
            number       : 42045,
            title        : 'Mock issue — contentTrust sync persistence #13691',
            timelineFirst: [externalComment, trustedComment],
            hasNextPage  : false,
            endCursor    : null
        });

        mockIssue.author = {login: 'external-author'};
        mockIssue.body   = 'External root payload with URL https://root.example/landing';

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

        const writtenPath = path.resolve(aiConfig.projectRoot, metadata.issues[mockIssue.number].path);
        const written     = await fs.readFile(writtenPath, 'utf-8');
        const parsed      = matter(written);

        expect(parsed.data.contentTrust.projected).toBe(true);
        expect(parsed.data.contentTrust.quarantined).toBe(2);

        expect(parsed.content).toContain('[QUARANTINED_URL: root.example]');
        expect(parsed.content).toContain('[QUARANTINED_URL: comment.example]');
        expect(parsed.content).not.toContain('https://root.example');
        expect(parsed.content).not.toContain('https://comment.example');

        expect(parsed.content).toContain('https://github.com/neomjs/neo');
    });

    test('closed-post-latest-release issue lands in active when no archive-version applies (#11360 supersedes #11288 unversioned-target scenario)', async () => {
        // Before the archive fallback cleanup: closed-post-latest-release issues with no matching release
        // would fall through to `'unversioned'` archive bucket. That fallback was the
        // architectural bug fixed by the cleanup — pre-staging items into a not-yet-existing
        // version archive violates sealed-chunk semantics.
        //
        // After the cleanup: such items land in ACTIVE path; archive folders for vN.M.K are
        // created at release-cut by publish.mjs, never pre-staged.
        //
        // The anomaly-hook contract (warn on closedAt-shift across buckets) is
        // preserved for shifts between REAL release buckets (e.g., v11.0.0 → v12.0.0).
        // The "shift to 'unversioned'" / "archive → active" anomaly variant needs to be
        // re-established in a follow-up sub-ticket; deliberately not in scope here.
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

        // Item lands in active: closed-for-next-release stays in active.
        // Assert via configured active root (issuesDir) rather than literal '/issues/' substring —
        // the test rewrites issuesDir to a tmp dir, so the literal substring no longer matches even
        // when behavior is correct.
        const targetPath          = metadata.issues['50001'].path;
        const absoluteTargetPath  = path.resolve(aiConfig.projectRoot, targetPath);
        const relativeToIssuesDir = path.relative(issueSyncConfig.issuesDir, absoluteTargetPath);
        expect(relativeToIssuesDir.startsWith('..')).toBe(false); // path is under issuesDir
        expect(targetPath).not.toContain('/archive/');
        expect(targetPath).not.toContain('unversioned');
    });

    test('non-semver milestone is not a version bucket — falls through to closedAt→release (#12184)', async () => {
        // A descriptive (non-semver) milestone must NOT become a `v<title>` archive folder. Empirical:
        // Real issues carried milestones like "neo.d.ts - Typescript definitions ..." and were archived
        // as garbage version folders. With the semver guard, such a closed issue falls through to the
        // closedAt→release resolution and buckets into the real release that shipped after it closed.
        const mockIssue = buildMockIssue({
            number       : 3286,
            title        : 'Mock non-semver-milestone issue',
            timelineFirst: [],
            hasNextPage  : false,
            endCursor    : null
        });
        mockIssue.state     = 'CLOSED';
        mockIssue.closedAt  = '2024-09-15T00:00:00Z';
        mockIssue.milestone = {title: 'neo.d.ts - Typescript definitions for all neo framework classes'};

        // A real release published AFTER the issue closed → the closedAt→release fallback resolves here.
        const originalSorted = ReleaseNotesSyncer.sortedReleases;
        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v9.0.0', publishedAt: '2024-10-01T00:00:00Z'}];

        GraphqlService.query = async (query) => {
            if (query.includes('FetchSingleIssue')) {
                return {repository: {issue: structuredClone(mockIssue)}};
            }
            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        const metadata = {issues: {}};

        try {
            const stats = await IssueSyncer.refetchIssuesByNumber([mockIssue.number], metadata);
            expect(stats.refetched.count).toBe(1);
            expect(stats.errors).toHaveLength(0);

            const bucketPath = metadata.issues[mockIssue.number].path;
            // Bucketed into the real release, NOT a title-derived garbage folder.
            expect(bucketPath).toContain(path.join('archive', 'issues', 'v9.0.0'));
            expect(bucketPath).not.toContain('neo.d.ts');
        } finally {
            ReleaseNotesSyncer.sortedReleases = originalSorted;
        }
    });

    test('routeByMilestone=false ignores semver milestones and keeps post-latest closed issues active', async () => {
        const mockIssue = buildMockIssue({
            number       : 50004,
            title        : 'Mock post-latest issue with future semver milestone',
            timelineFirst: [],
            hasNextPage  : false,
            endCursor    : null
        });
        mockIssue.state     = 'CLOSED';
        mockIssue.closedAt  = '2026-01-15T00:00:00Z';
        mockIssue.milestone = {title: 'v99.0.0'};

        const originalSorted           = ReleaseNotesSyncer.sortedReleases;
        const originalRouteByMilestone = issueSyncConfig.routeByMilestone;
        ReleaseNotesSyncer.sortedReleases = [];
        issueSyncConfig.routeByMilestone  = false;
        await fs.ensureDir(path.join(issueSyncConfig.archiveRoot, 'issues', 'v99.0.0'));

        GraphqlService.query = async (query) => {
            if (query.includes('FetchSingleIssue')) {
                return {repository: {issue: structuredClone(mockIssue)}};
            }
            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        try {
            const metadata   = {issues: {}};
            const stats      = await IssueSyncer.refetchIssuesByNumber([mockIssue.number], metadata);
            const targetPath = metadata.issues[mockIssue.number].path;

            expect(stats.refetched.count).toBe(1);
            expect(stats.errors).toHaveLength(0);
            expect(targetPath).not.toContain('/archive/');
            expect(path.relative(issueSyncConfig.issuesDir, path.resolve(aiConfig.projectRoot, targetPath)).startsWith('..')).toBe(false);
        } finally {
            ReleaseNotesSyncer.sortedReleases = originalSorted;
            issueSyncConfig.routeByMilestone  = originalRouteByMilestone;
        }
    });

    test('routeByMilestone=true only routes semver milestones into already-cut archive buckets', async () => {
        const missingBucketIssue = buildMockIssue({
            number       : 50005,
            title        : 'Mock issue with uncut milestone',
            timelineFirst: [],
            hasNextPage  : false,
            endCursor    : null
        });
        missingBucketIssue.state     = 'CLOSED';
        missingBucketIssue.closedAt  = '2026-01-15T00:00:00Z';
        missingBucketIssue.milestone = {title: 'v97.0.0'};

        const cutBucketIssue = buildMockIssue({
            number       : 50006,
            title        : 'Mock issue with cut milestone bucket',
            timelineFirst: [],
            hasNextPage  : false,
            endCursor    : null
        });
        cutBucketIssue.state     = 'CLOSED';
        cutBucketIssue.closedAt  = '2026-01-15T00:00:00Z';
        cutBucketIssue.milestone = {title: 'v98.0.0'};

        const originalSorted           = ReleaseNotesSyncer.sortedReleases;
        const originalRouteByMilestone = issueSyncConfig.routeByMilestone;
        ReleaseNotesSyncer.sortedReleases = [];
        issueSyncConfig.routeByMilestone  = true;
        await fs.ensureDir(path.join(issueSyncConfig.archiveRoot, 'issues', 'v98.0.0'));

        GraphqlService.query = async (query, variables) => {
            if (query.includes('FetchSingleIssue')) {
                return {
                    repository: {
                        issue: variables.number === cutBucketIssue.number
                            ? structuredClone(cutBucketIssue)
                            : structuredClone(missingBucketIssue)
                    }
                };
            }
            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        try {
            const metadata = {issues: {}};
            const stats    = await IssueSyncer.refetchIssuesByNumber([missingBucketIssue.number, cutBucketIssue.number], metadata);

            expect(stats.refetched.count).toBe(2);
            expect(stats.errors).toHaveLength(0);
            expect(metadata.issues[missingBucketIssue.number].path).not.toContain('/archive/');
            expect(metadata.issues[cutBucketIssue.number].path).toContain(path.join('archive', 'issues', 'v98.0.0'));
        } finally {
            ReleaseNotesSyncer.sortedReleases = originalSorted;
            issueSyncConfig.routeByMilestone  = originalRouteByMilestone;
        }
    });

    test('reconcileClosedIssueLocations prunes emptied active chunk directories after archiving (#13002)', async () => {
        const originalSorted = ReleaseNotesSyncer.sortedReleases;
        const issueNumber    = 6003;
        const oldAbs         = path.join(issueSyncConfig.issuesDir, 'chunk-77', `issue-${issueNumber}.md`);
        const oldRel = path.relative(aiConfig.projectRoot, oldAbs);

        await fs.ensureDir(path.dirname(oldAbs));
        await fs.writeFile(oldAbs, 'CLOSED ISSUE CONTENT', 'utf8');

        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-05-10T00:00:00Z'}];

        const metadata = {
            issues: {
                [issueNumber]: {
                    state        : 'CLOSED',
                    path         : oldRel,
                    updatedAt    : '2026-05-02T00:00:00Z',
                    closedAt     : '2026-05-01T00:00:00Z',
                    milestone    : null,
                    title        : 'Closed issue ready for archival',
                    contentHash  : 'hash',
                    commentsTotal: 0
                }
            }
        };

        try {
            const stats = await IssueSyncer.reconcileClosedIssueLocations(metadata);
            const targetAbs = path.join(issueSyncConfig.archiveRoot, 'issues', 'v13.0.0', 'chunk-1', `issue-${issueNumber}.md`);

            expect(stats.count).toBe(1);
            expect(metadata.issues[issueNumber].path).toBe(path.relative(aiConfig.projectRoot, targetAbs));
            await expect(fs.pathExists(targetAbs)).resolves.toBe(true);
            await expect(fs.pathExists(oldAbs)).resolves.toBe(false);
            await expect(fs.pathExists(path.dirname(oldAbs))).resolves.toBe(false);
            await expect(fs.pathExists(issueSyncConfig.issuesDir)).resolves.toBe(true);
        } finally {
            ReleaseNotesSyncer.sortedReleases = originalSorted;
        }
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
                    rateLimit : { cost: 1, remaining: 4999, resetAt: '2026-05-13T11:00:00Z' },
                    repository: {
                        issues: {
                            pageInfo: { hasNextPage: false, endCursor: null },
                            nodes   : [structuredClone(mockIssue)]
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
                    state        : 'CLOSED',
                    path         : originalOldPath,
                    updatedAt    : '2026-05-12T10:00:00Z',
                    closedAt     : '2026-05-12T10:00:00Z', // original date
                    milestone    : null, // original milestone
                    title        : mockIssue.title,
                    contentHash  : 'somehash',
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
                    rateLimit : { cost: 1, remaining: 4999, resetAt: '2026-05-13T11:00:00Z' },
                    repository: {
                        issues: {
                            pageInfo: { hasNextPage: false, endCursor: null },
                            nodes   : [structuredClone(mockIssueDropped), structuredClone(mockIssueStored)]
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

    test('formatTimelineEvent null-safety: null assignee / label / subIssue / source produce fallback markers, no crash (#11474)', async () => {
        // Empirical anchor: sync_all crashed at IssueSyncer.mjs:202 on
        // `event.assignee.login` when a GitHub user had been deleted. Same null-deref risk
        // exists across the entire #formatTimelineEvent switch (label, subIssue, parent,
        // blockingIssue, blockedIssue, commit, source). This test exercises four representative
        // null entities and asserts (a) no crash, (b) fallback markers appear in rendered markdown.
        const mockIssue = buildMockIssue({
            number       : 42043,
            title        : 'Mock issue — null-entity timeline regression #11474',
            timelineFirst: [
                {
                    __typename: 'AssignedEvent',
                    createdAt : '2026-05-16T10:00:00Z',
                    actor     : {login: 'tobiu'},
                    assignee  : null // deleted GitHub user
                },
                {
                    __typename: 'LabeledEvent',
                    createdAt : '2026-05-16T10:01:00Z',
                    actor     : {login: 'tobiu'},
                    label     : null // deleted label
                },
                {
                    __typename: 'SubIssueAddedEvent',
                    createdAt : '2026-05-16T10:02:00Z',
                    actor     : {login: 'tobiu'},
                    subIssue  : null // deleted sub-issue
                },
                {
                    __typename: 'CrossReferencedEvent',
                    createdAt : '2026-05-16T10:03:00Z',
                    actor     : {login: 'tobiu'},
                    source    : null // deleted source
                }
            ],
            hasNextPage: false,
            endCursor  : null
        });

        GraphqlService.query = async (query) => {
            if (query.includes('FetchSingleIssue')) {
                return {repository: {issue: structuredClone(mockIssue)}};
            }
            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        const metadata = {issues: {}};
        const stats    = await IssueSyncer.refetchIssuesByNumber([mockIssue.number], metadata);

        // No crash → refetch succeeds for all four null-entity events.
        expect(stats.refetched.count).toBe(1);
        expect(stats.errors).toHaveLength(0);

        const chunkNumber = 1;
        const writtenPath = path.join(issueSyncConfig.issuesDir, `chunk-${chunkNumber}`, `issue-${mockIssue.number}.md`);
        const written = await fs.readFile(writtenPath, 'utf-8');

        // Fallback markers appear in rendered markdown.
        expect(written).toContain('assigned to @Ghost');
        expect(written).toContain('added the `(deleted label)` label');
        expect(written).toContain('added sub-issue #?');
        expect(written).toContain('cross-referenced by (deleted)');

        // Verify no literal `undefined` / `null` artifacts leaked into the output —
        // i.e., the optional-chaining + fallback approach landed everywhere instead
        // of partial coverage that would yield raw `undefined` strings.
        expect(written).not.toMatch(/assigned to @(undefined|null)/);
        expect(written).not.toMatch(/added the `(undefined|null)` label/);
    });

    test('formatIssueMarkdown null-safety: ghost issue (null author + null label/assignee/subIssue nodes) renders without crash (#11481)', async () => {
        // Empirical anchor: sync_all crashed at IssueSyncer.mjs:145 on
        // `issue.author.login` when the GitHub author had been deleted (Ghost user). This is
        // the whack-a-mole companion to the timeline-event fix — same null-deref class
        // in the FRONTMATTER ASSEMBLY method (#formatIssueMarkdown) that the prior sweep missed.
        // This test exercises EVERY nullable frontmatter site simultaneously ("ghost issue")
        // to prevent future whack-a-mole regressions.
        const ghostIssue = {
            number          : 42044,
            title           : null, // null title
            body            : 'Mock body for ghost issue regression #11481.',
            state           : 'CLOSED',
            createdAt       : '2026-05-16T17:00:00Z',
            updatedAt       : '2026-05-16T18:00:00Z',
            closedAt        : '2026-05-16T17:30:00Z',
            url             : 'https://github.com/neomjs/neo/issues/42044',
            author          : null, // deleted GitHub user (Ghost) — the empirical crash
            labels          : {nodes: [null, {name: null}, {name: 'bug'}]}, // null entries + null-name + valid
            assignees       : {nodes: [null, {login: null}, {login: 'tobiu'}]}, // same shape: null entries + null-login + valid
            milestone       : null,
            parent          : null,
            subIssues       : {nodes: [null, {state: 'OPEN', number: 100, title: null}, {state: 'CLOSED', number: 101, title: 'valid sub'}]},
            subIssuesSummary: {total: 2, completed: 1, percentCompleted: 50},
            blockedBy       : {nodes: [null, {state: 'OPEN', number: 200, title: null}]},
            blocking        : {nodes: [{state: 'CLOSED', number: 300, title: 'valid blocker'}]},
            timelineItems   : {
                pageInfo: {hasNextPage: false, endCursor: null},
                nodes   : [] // empty timeline; the format-event path is covered by the prior test
            }
        };

        GraphqlService.query = async (query) => {
            if (query.includes('FetchSingleIssue')) {
                return {repository: {issue: structuredClone(ghostIssue)}};
            }
            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        const metadata = {issues: {}};
        const stats    = await IssueSyncer.refetchIssuesByNumber([ghostIssue.number], metadata);

        // No crash → refetch succeeds despite every nullable frontmatter field being null.
        expect(stats.refetched.count).toBe(1);
        expect(stats.errors).toHaveLength(0);

        // ghost issue is CLOSED post-latest-release (no release applies; sortedReleases empty by default),
        // so it lands in the active issues directory rather than archive — assert the file exists wherever it landed.
        const writtenRelativePath = metadata.issues[ghostIssue.number].path;
        const writtenAbsolutePath = path.resolve(aiConfig.projectRoot, writtenRelativePath);
        const written             = await fs.readFile(writtenAbsolutePath, 'utf-8');

        // Frontmatter fallback markers landed correctly. Use quote-agnostic regex because
        // gray-matter's YAML serializer chooses single/double quoting based on content.
        expect(written).toMatch(/author:\s*['"]?Ghost['"]?/); // null issue.author → 'Ghost' fallback
        expect(written).toMatch(/title:\s*['"]?\(no title\)['"]?/); // null title → '(no title)' fallback
        expect(written).toContain('# (no title)'); // body header uses same fallback

        // List-mapped fields: nulls filtered out; valid entries preserved.
        // labels: [null, {name: null}, {name: 'bug'}] → ['bug']
        expect(written).toMatch(/labels:\s*\n\s*- bug\s*\n/);
        // assignees: [null, {login: null}, {login: 'tobiu'}] → ['tobiu']
        expect(written).toMatch(/assignees:\s*\n\s*- tobiu\s*\n/);

        // subIssues: [null, {title: null}, {title: 'valid sub'}] → 2 entries (the null-title becomes '(no title)' marker; the null node is filtered out)
        expect(written).toMatch(/100[^\n]*\(no title\)/);
        expect(written).toContain('101 valid sub');

        // blockedBy: [null, {title: null}] → 1 entry with '(no title)' marker
        expect(written).toMatch(/200[^\n]*\(no title\)/);

        // No literal undefined/null leaks anywhere in the frontmatter.
        expect(written).not.toMatch(/author:\s*(undefined|null)\s*$/m);
        expect(written).not.toMatch(/^\s*-\s+(undefined|null)\s*$/m);
        expect(written).not.toContain('undefined');
    });

    test('ARCHIVE ANOMALY WARN: only fires when both buckets parse as valid semver tags (#11486)', async () => {
        // Empirical anchor: operator 2026-05-16T19:33Z paste — `npm run ai:sync-github-workflow`
        // sync produced thousands of `[WARN] 🚨 [ARCHIVE ANOMALY]` lines, dominated by
        // migration-shape false positives (oldVersion = title-derived garbage like
        // 'vneo.d.ts - Typescript definitions for all neo framework classes') where sealed-chunk
        // semantics already prevent any actual move. Only genuine vX.Y.Z → vX.Y.Z shifts (e.g.
        // a v11.12.0 → v11.13.0 shift) are actionable anomalies and should retain WARN level.
        //
        // This test exercises two issues simultaneously:
        // - Issue A: cached path bucket is title-derived garbage → semver.valid returns null →
        //   DEBUG emitted, NO WARN
        // - Issue B: cached path bucket is valid semver tag (v11.12.0) shifting to another valid
        //   semver tag (v11.13.0) → WARN emitted exactly once
        const issueAMigrationShape = buildMockIssue({
            number       : 3285,
            title        : 'Mock migration-shape issue (#11486 filter test)',
            timelineFirst: [],
            hasNextPage  : false,
            endCursor    : null
        });
        issueAMigrationShape.state    = 'CLOSED';
        issueAMigrationShape.closedAt = '2026-05-15T10:00:00Z';
        issueAMigrationShape.milestone = {title: 'v8.1.0'}; // new resolution: valid semver

        const issueBSemverShift = buildMockIssue({
            number       : 7910,
            title        : 'Mock valid-semver-shift issue (#11486 filter test)',
            timelineFirst: [],
            hasNextPage  : false,
            endCursor    : null
        });
        issueBSemverShift.state    = 'CLOSED';
        issueBSemverShift.closedAt = '2026-05-15T10:00:00Z';
        issueBSemverShift.milestone = {title: 'v11.13.0'}; // new resolution: valid semver

        GraphqlService.query = async (query) => {
            if (query.includes('FetchIssuesForSync')) {
                return {
                    rateLimit : {cost: 1, remaining: 4999, resetAt: '2026-05-15T11:00:00Z'},
                    repository: {
                        issues: {
                            pageInfo: {hasNextPage: false, endCursor: null},
                            nodes   : [structuredClone(issueAMigrationShape), structuredClone(issueBSemverShift)]
                        }
                    }
                };
            }
            if (query.includes('FetchSingleIssue')) {
                // Refetch path may target either issue
                const num = parseInt(query.match(/number:\s*(\d+)/)?.[1] || '0', 10);
                const src = num === issueBSemverShift.number ? issueBSemverShift : issueAMigrationShape;
                return {repository: {issue: structuredClone(src)}};
            }
            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        // Cached paths: issue A under migration-shape bucket, issue B under valid v11.12.0
        const issueAOldAbsolutePath = path.join(
            issueSyncConfig.archiveRoot, 'issues',
            'vneo.d.ts - typescript definitions for all neo framework classes',
            'chunk-3000', `issue-${issueAMigrationShape.number}.md`
        );
        const issueBOldAbsolutePath = path.join(
            issueSyncConfig.archiveRoot, 'issues',
            'v11.12.0', 'chunk-7900', `issue-${issueBSemverShift.number}.md`
        );
        const issueAOldRelPath = path.relative(aiConfig.projectRoot, issueAOldAbsolutePath);
        const issueBOldRelPath = path.relative(aiConfig.projectRoot, issueBOldAbsolutePath);

        const metadata = {
            issues: {
                [issueAMigrationShape.number]: {
                    state        : 'CLOSED',
                    path         : issueAOldRelPath,
                    updatedAt    : '2026-05-14T10:00:00Z',
                    closedAt     : '2026-05-15T10:00:00Z',
                    milestone    : null,
                    title        : issueAMigrationShape.title,
                    contentHash  : 'hashA',
                    commentsTotal: 0
                },
                [issueBSemverShift.number]: {
                    state        : 'CLOSED',
                    path         : issueBOldRelPath,
                    updatedAt    : '2026-05-14T10:00:00Z',
                    closedAt     : '2026-05-15T10:00:00Z',
                    milestone    : null,
                    title        : issueBSemverShift.title,
                    contentHash  : 'hashB',
                    commentsTotal: 0
                }
            }
        };

        // Pre-create the two cached files so sealed-chunk path-resolution works.
        await fs.ensureDir(path.dirname(issueAOldAbsolutePath));
        await fs.ensureDir(path.dirname(issueBOldAbsolutePath));
        await fs.ensureDir(path.join(issueSyncConfig.archiveRoot, 'issues', 'v8.1.0'));
        await fs.ensureDir(path.join(issueSyncConfig.archiveRoot, 'issues', 'v11.13.0'));
        await fs.writeFile(issueAOldAbsolutePath, 'mock content A', 'utf8');
        await fs.writeFile(issueBOldAbsolutePath, 'mock content B', 'utf8');

        // Spy on logger.warn and logger.debug.
        const warnCalls                = [];
        const debugCalls               = [];
        const originalWarn             = logger.warn;
        const originalDebug            = logger.debug;
        const originalRouteByMilestone = issueSyncConfig.routeByMilestone;
        logger.warn  = (...args) => { warnCalls.push(args[0]); };
        logger.debug = (...args) => { debugCalls.push(args[0]); };
        issueSyncConfig.routeByMilestone = true;

        try {
            await IssueSyncer.pullFromGitHub(metadata);
        } finally {
            logger.warn  = originalWarn;
            logger.debug = originalDebug;
            issueSyncConfig.routeByMilestone = originalRouteByMilestone;
            await fs.unlink(issueAOldAbsolutePath).catch(() => {});
            await fs.unlink(issueBOldAbsolutePath).catch(() => {});
        }

        // Migration-shape issue A: NO WARN with [ARCHIVE ANOMALY], EXACTLY 1 DEBUG with [ARCHIVE MIGRATION]
        const issueAWarns  = warnCalls.filter(s => typeof s === 'string' && s.includes('[ARCHIVE ANOMALY]') && s.includes(`#${issueAMigrationShape.number}`));
        const issueADebugs = debugCalls.filter(s => typeof s === 'string' && s.includes('[ARCHIVE MIGRATION]') && s.includes(`#${issueAMigrationShape.number}`));
        expect(issueAWarns).toHaveLength(0);
        expect(issueADebugs.length).toBeGreaterThanOrEqual(1);

        // Valid-semver-shift issue B: EXACTLY 1 WARN with [ARCHIVE ANOMALY], NO [ARCHIVE MIGRATION] DEBUG
        const issueBWarns  = warnCalls.filter(s => typeof s === 'string' && s.includes('[ARCHIVE ANOMALY]') && s.includes(`#${issueBSemverShift.number}`));
        const issueBDebugs = debugCalls.filter(s => typeof s === 'string' && s.includes('[ARCHIVE MIGRATION]') && s.includes(`#${issueBSemverShift.number}`));
        expect(issueBWarns).toHaveLength(1);
        expect(issueBWarns[0]).toContain("'v11.12.0'");
        expect(issueBWarns[0]).toContain("'v11.13.0'");
        expect(issueBDebugs).toHaveLength(0);
    });

    test('planBuckets oldVersion precedence: unchanged closed issue with no milestone skips closedAt timestamp fallback (#11594 AC4(b))', async () => {
        // Regression coverage for oldVersion precedence:
        // Legacy archived issues seeded from existing serialized metadata may lack milestone data
        // (pre-persistence-fix entries). When such an issue is NOT in the delta fetch (it
        // hasn't been modified since lastSync), `#planBuckets` receives `milestone: null/undefined`
        // and previously fell through to closedAt-based timestamp inference, which could re-emit
        // ARCHIVE ANOMALY WARN for issues already at their canonical on-disk bucket.
        //
        // Cycle 2 fix (3262eb126 in this PR) added oldVersion-precedence between milestone-title
        // and closedAt-fallback. This test exercises that branch: unchanged archived issue with
        // valid-semver oldVersion + no milestone → version = oldVersion → no WARN, no closedAt
        // heuristic invocation.
        //
        // Empirical anchor: a closed issue with milestone v11.12.0 was re-bucketed to
        // v11.13.0 every sync because the persistence-shape bug meant milestone data was missing
        // post-persist (Cycle 1 fix), AND planBuckets had no oldVersion precedence even when the
        // cached path WAS the canonical bucket (this Cycle 2 fix).
        const issueUnchangedAtCanonicalBucket = buildMockIssue({
            number       : 7910,
            title        : 'Mock unchanged-archived issue (#11594 AC4b test)',
            timelineFirst: [],
            hasNextPage  : false,
            endCursor    : null
        });
        issueUnchangedAtCanonicalBucket.state    = 'CLOSED';
        issueUnchangedAtCanonicalBucket.closedAt = '2025-11-29T11:41:17Z';
        issueUnchangedAtCanonicalBucket.milestone = null;

        // Delta query returns EMPTY — simulates the unchanged-since-lastSync case.
        // The issue exists ONLY in pre-seeded metadata.
        GraphqlService.query = async (query) => {
            if (query.includes('FetchIssuesForSync')) {
                return {
                    rateLimit : {cost: 1, remaining: 4999, resetAt: '2026-05-19T01:00:00Z'},
                    repository: {
                        issues: {
                            pageInfo: {hasNextPage: false, endCursor: null},
                            nodes   : []
                        }
                    }
                };
            }
            if (query.includes('FetchSingleIssue')) {
                return {repository: {issue: structuredClone(issueUnchangedAtCanonicalBucket)}};
            }
            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        // Pre-seeded cached path at the canonical v11.12.0 bucket.
        const issueAbsolutePath = path.join(
            issueSyncConfig.archiveRoot, 'issues',
            'v11.12.0', 'chunk-7900', `issue-${issueUnchangedAtCanonicalBucket.number}.md`
        );
        const issueRelPath = path.relative(aiConfig.projectRoot, issueAbsolutePath);

        const metadata = {
            issues: {
                [issueUnchangedAtCanonicalBucket.number]: {
                    state        : 'CLOSED',
                    path         : issueRelPath,
                    updatedAt    : '2025-11-29T11:44:14Z',
                    closedAt     : '2025-11-29T11:41:17Z',
                    milestone    : null, // KEY: legacy entry with no milestone data
                    title        : issueUnchangedAtCanonicalBucket.title,
                    contentHash  : 'hashUnchanged',
                    commentsTotal: 0
                }
            }
        };

        await fs.ensureDir(path.dirname(issueAbsolutePath));
        await fs.writeFile(issueAbsolutePath, 'mock content unchanged', 'utf8');

        const warnCalls     = [];
        const debugCalls    = [];
        const originalWarn  = logger.warn;
        const originalDebug = logger.debug;
        logger.warn  = (...args) => { warnCalls.push(args[0]); };
        logger.debug = (...args) => { debugCalls.push(args[0]); };

        try {
            await IssueSyncer.pullFromGitHub(metadata);
        } finally {
            logger.warn  = originalWarn;
            logger.debug = originalDebug;
            await fs.unlink(issueAbsolutePath).catch(() => {});
        }

        // AC4(b): NO ARCHIVE ANOMALY WARN for unchanged issue at canonical bucket.
        // oldVersion precedence kicks in → version = 'v11.12.0' === oldVersion → no shift detected → no WARN.
        const archiveAnomalyWarns = warnCalls.filter(s =>
            typeof s === 'string' &&
            s.includes('[ARCHIVE ANOMALY]') &&
            s.includes(`#${issueUnchangedAtCanonicalBucket.number}`)
        );
        expect(archiveAnomalyWarns).toHaveLength(0);
    });

    test('needsUpdate compares the persisted updatedAt — an unchanged archived issue is not re-rendered (#12191)', async () => {
        // Pre-fix, needsUpdate compared oldIssue.updated — a field that is never persisted (the metadata
        // field is updatedAt) — so it was always true → every issue re-formatted, re-hashed and re-written
        // every sync. For an ARCHIVED issue, sealed-chunk guarantees targetPath === oldAbsolutePath, so
        // updatedAt is the sole discriminator: an unchanged archived issue must be left on disk untouched.
        const N  = 9100;
        const ts = '2026-05-01T00:00:00Z';

        const cachedAbs = path.join(issueSyncConfig.archiveRoot, 'issues', 'v12.0.0', 'chunk-1', `issue-${N}.md`);
        const cachedRel = path.relative(aiConfig.projectRoot, cachedAbs);
        await fs.ensureDir(path.dirname(cachedAbs));
        await fs.writeFile(cachedAbs, 'SENTINEL — must not be re-rendered', 'utf8');

        const mockIssue = buildMockIssue({number: N, title: 'Unchanged archived issue', timelineFirst: [], hasNextPage: false, endCursor: null});
        mockIssue.state     = 'CLOSED';
        mockIssue.closedAt  = ts;
        mockIssue.updatedAt = ts;
        mockIssue.milestone = {title: 'v12.0.0'};

        GraphqlService.query = async (query) => {
            if (query.includes('FetchIssuesForSync')) {
                return {
                    rateLimit : {cost: 1, remaining: 4999, resetAt: ts},
                    repository: {issues: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: [structuredClone(mockIssue)]}}
                };
            }
            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        const metadata = {
            lastSync: '2026-01-01T00:00:00Z',
            issues  : {
                [N]: {state: 'CLOSED', updatedAt: ts, closedAt: ts, milestone: 'v12.0.0', path: cachedRel, contentHash: 'h', commentsTotal: 0}
            }
        };

        await IssueSyncer.pullFromGitHub(metadata);

        // Unchanged updatedAt + sealed path → needsUpdate false → file left untouched.
        const after = await fs.readFile(cachedAbs, 'utf8');
        expect(after).toBe('SENTINEL — must not be re-rendered');
    });

    test('migrateArchiveBuckets re-buckets a sealed-pinned issue into its true release (#12194)', async () => {
        // The v8.1.0 catch-all: a pre-window closed issue archived under the oldest in-window release
        // (v8.1.0), whose true release (v7.0.0) predates the syncStartDate floor. Sealed-chunk +
        // oldVersion-precedence keep it pinned during a normal sync; the migration ignores both and,
        // with the full release history, recomputes closedAt→release and moves it to v7.0.0.
        const originalSorted = ReleaseNotesSyncer.sortedReleases;
        const N              = 6001;
        const wrongAbs = path.join(issueSyncConfig.archiveRoot, 'issues', 'v8.1.0', 'chunk-1', `issue-${N}.md`);
        const wrongRel = path.relative(aiConfig.projectRoot, wrongAbs);
        await fs.ensureDir(path.dirname(wrongAbs));
        await fs.writeFile(wrongAbs, 'ISSUE 6001 CONTENT', 'utf8');

        GraphqlService.query = async () => ({
            repository: {releases: {
                nodes: [
                    {tagName: 'v8.1.0', publishedAt: '2025-01-15T00:00:00Z'},
                    {tagName: 'v7.0.0', publishedAt: '2024-10-01T00:00:00Z'}
                ],
                pageInfo: {hasNextPage: false, endCursor: null}
            }}
        });

        const metadata = {
            releases: {},
            issues  : {
                [N]: {state: 'CLOSED', closedAt: '2024-09-15T00:00:00Z', updatedAt: '2024-09-15T00:00:00Z', milestone: null, path: wrongRel, contentHash: 'h'}
            }
        };

        try {
            const result = await IssueSyncer.migrateArchiveBuckets(metadata);
            const correctAbs = path.join(issueSyncConfig.archiveRoot, 'issues', 'v7.0.0', 'chunk-1', `issue-${N}.md`);

            expect(result.moved).toBe(1);
            await expect(fs.pathExists(correctAbs)).resolves.toBe(true);
            expect(await fs.readFile(correctAbs, 'utf8')).toBe('ISSUE 6001 CONTENT'); // content preserved
            await expect(fs.pathExists(wrongAbs)).resolves.toBe(false);              // old location gone
            // Emptied source version dir pruned.
            await expect(fs.pathExists(path.join(issueSyncConfig.archiveRoot, 'issues', 'v8.1.0'))).resolves.toBe(false);
            expect(metadata.issues[N].path).toBe(path.relative(aiConfig.projectRoot, correctAbs));

            const idx   = await fs.readJson(path.join(tmpRoot, '_index.json'));
            const entry = idx.find(e => e.type === 'issues' && e.id === N);
            expect(entry.version).toBe('v7.0.0');
            expect(entry.chunkNumber).toBe(1);
        } finally {
            ReleaseNotesSyncer.sortedReleases = originalSorted;
        }
    });

    test('migrateArchiveBuckets dryRun reports the plan without moving any file (#12194)', async () => {
        const originalSorted = ReleaseNotesSyncer.sortedReleases;
        const N              = 6002;
        const wrongAbs = path.join(issueSyncConfig.archiveRoot, 'issues', 'v8.1.0', 'chunk-1', `issue-${N}.md`);
        const wrongRel = path.relative(aiConfig.projectRoot, wrongAbs);
        await fs.ensureDir(path.dirname(wrongAbs));
        await fs.writeFile(wrongAbs, 'DRYRUN CONTENT', 'utf8');

        GraphqlService.query = async () => ({
            repository: {releases: {
                nodes: [
                    {tagName: 'v7.0.0', publishedAt: '2024-10-01T00:00:00Z'},
                    {tagName: 'v8.1.0', publishedAt: '2025-01-15T00:00:00Z'}
                ],
                pageInfo: {hasNextPage: false, endCursor: null}
            }}
        });

        const metadata = {
            releases: {},
            issues  : {[N]: {state: 'CLOSED', closedAt: '2024-09-15T00:00:00Z', updatedAt: '2024-09-15T00:00:00Z', milestone: null, path: wrongRel, contentHash: 'h'}}
        };

        try {
            const result = await IssueSyncer.migrateArchiveBuckets(metadata, {dryRun: true});

            expect(result.dryRun).toBe(true);
            expect(result.moved).toBe(0);
            expect(result.moves).toHaveLength(1);
            expect(result.moves[0].number).toBe(N);
            // File NOT moved; metadata path unchanged.
            await expect(fs.pathExists(wrongAbs)).resolves.toBe(true);
            expect(await fs.readFile(wrongAbs, 'utf8')).toBe('DRYRUN CONTENT');
            expect(metadata.issues[N].path).toBe(wrongRel);
        } finally {
            ReleaseNotesSyncer.sortedReleases = originalSorted;
        }
    });

    test('migrateArchiveBuckets aborts (throws) when no releases are available (#12194)', async () => {
        const originalSorted = ReleaseNotesSyncer.sortedReleases;
        GraphqlService.query = async () => ({
            repository: {releases: {nodes: [], pageInfo: {hasNextPage: false, endCursor: null}}}
        });

        try {
            // No releases → re-bucketing would mis-assign everything; the migration must fail loud.
            await expect(IssueSyncer.migrateArchiveBuckets({releases: {}, issues: {}})).rejects.toThrow(/no releases loaded/);
        } finally {
            ReleaseNotesSyncer.sortedReleases = originalSorted;
        }
    });

    test('pushToGitHub heals generated-only drift without mutating GitHub (#13958)', async () => {
        const issueNumber = 43058;
        const filePath    = path.join(issueSyncConfig.issuesDir, 'chunk-1', `issue-${issueNumber}.md`);
        const markdown = matter.stringify(
            '# Generated-only drift\n\nRemote body already matches.\n\n## Timeline\n\n### @tobiu - 2026-06-24T12:00:00Z\n\nGenerated timeline changed.\n',
            {
                id       : issueNumber,
                title    : 'Generated-only drift',
                state    : 'OPEN',
                updatedAt: '2026-06-24T12:00:00Z',
                githubUrl    : `https://github.com/neomjs/neo/issues/${issueNumber}`,
                author       : 'tobiu',
                commentsCount: 1,
                contentTrust : {projected: true, quarantined: 0, signals: []}
            },
            {lineWidth: -1}
        );
        const currentHash = hashContent(markdown);

        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, markdown, 'utf8');

        const metadata = {
            lastSync: '2026-06-24T11:00:00Z',
            issues  : {
                [issueNumber]: {
                    state        : 'OPEN',
                    path         : path.relative(aiConfig.projectRoot, filePath),
                    updatedAt    : '2026-06-24T12:00:00Z',
                    closedAt     : null,
                    milestone    : null,
                    title        : 'Generated-only drift',
                    contentHash  : 'stale-full-render-hash',
                    commentsTotal: 1
                }
            }
        };

        const queries = [];
        GraphqlService.query = async (query, variables) => {
            queries.push({query, variables});

            if (query.includes('GetIssueForPush')) {
                return {
                    repository: {
                        issue: {
                            id   : 'I_generated_only',
                            title: 'Generated-only drift',
                            body : 'Remote body already matches.'
                        }
                    }
                };
            }

            if (query.includes('UpdateIssue')) {
                throw new Error('generated-only drift must not call UPDATE_ISSUE');
            }

            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        const stats = await IssueSyncer.pushToGitHub(metadata);

        expect(stats.count).toBe(0);
        expect(stats.generatedOnly.count).toBe(1);
        expect(stats.generatedOnly.issues).toEqual([issueNumber]);
        expect(metadata.issues[issueNumber].contentHash).toBe(currentHash);
        expect(queries.filter(item => item.query.includes('UpdateIssue'))).toHaveLength(0);
    });

    test('pushToGitHub still mutates GitHub for real title/body edits (#13958)', async () => {
        const issueNumber = 43059;
        const filePath    = path.join(issueSyncConfig.issuesDir, 'chunk-1', `issue-${issueNumber}.md`);
        const markdown = matter.stringify(
            '# Real body edit\n\nLocal body changed.\n\n## Timeline\n\n### @tobiu - 2026-06-24T12:00:00Z\n\nGenerated timeline.\n',
            {
                id       : issueNumber,
                title    : 'Real body edit',
                state    : 'OPEN',
                updatedAt: '2026-06-24T12:00:00Z',
                githubUrl    : `https://github.com/neomjs/neo/issues/${issueNumber}`,
                author       : 'tobiu',
                commentsCount: 1,
                contentTrust : {projected: true, quarantined: 0, signals: []}
            },
            {lineWidth: -1}
        );
        const currentHash = hashContent(markdown);

        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, markdown, 'utf8');

        const metadata = {
            lastSync: '2026-06-24T11:00:00Z',
            issues  : {
                [issueNumber]: {
                    state        : 'OPEN',
                    path         : path.relative(aiConfig.projectRoot, filePath),
                    updatedAt    : '2026-06-24T12:00:00Z',
                    closedAt     : null,
                    milestone    : null,
                    title        : 'Real body edit',
                    contentHash  : 'stale-full-render-hash',
                    commentsTotal: 1
                }
            }
        };

        const updates = [];
        GraphqlService.query = async (query, variables) => {
            if (query.includes('GetIssueForPush')) {
                return {
                    repository: {
                        issue: {
                            id   : 'I_real_edit',
                            title: 'Real body edit',
                            body : 'Remote body before local edit.'
                        }
                    }
                };
            }

            if (query.includes('UpdateIssue')) {
                updates.push(variables);
                return {
                    updateIssue: {
                        issue: {
                            number   : issueNumber,
                            title    : variables.title,
                            updatedAt: '2026-06-24T12:01:00Z'
                        }
                    }
                };
            }

            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        const stats = await IssueSyncer.pushToGitHub(metadata);

        expect(stats.count).toBe(1);
        expect(stats.issues).toEqual([issueNumber]);
        expect(stats.generatedOnly.count).toBe(0);
        expect(updates).toEqual([{
            issueId: 'I_real_edit',
            title  : 'Real body edit',
            body   : 'Local body changed.'
        }]);
        expect(metadata.issues[issueNumber].contentHash).toBe(currentHash);
        expect(metadata.issues[issueNumber].updatedAt).toBe('2026-06-24T12:01:00Z');
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
        actor : {login: 'tobiu'},
        source: {__typename: 'Issue', number: 10000 + i}
    };
}

/**
 * Builds the minimal GraphQL issue shape that `IssueSyncer.#formatIssueMarkdown` accepts.
     * The `comments` subselect is gone from the query, so the mock omits it too.
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
        author          : {login: 'tobiu'},
        labels          : {nodes: [{name: 'bug'}]},
        assignees       : {nodes: [{login: 'tobiu'}]},
        milestone       : null,
        parent          : null,
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

function hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}
