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

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../../src/Neo.mjs';
import * as core          from '../../../../../../src/core/_export.mjs';
import fs                 from 'fs-extra';
import fsPromises         from 'fs/promises';
import matter             from 'gray-matter';
import path               from 'path';
import {readContentIndex} from '../../../../../../ai/services/github-workflow/shared/contentIndex.mjs';

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
        aiConfig          = (await import('../../../../../../ai/mcp/server/github-workflow/config.template.mjs')).default;
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
                    nodes   : [buildPullRequest(prNumber)],
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
        const pr       = buildPullRequest(prNumber);
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

    test('sync write-boundary defangs untrusted PR bodies, comments, and reviews before local markdown persistence (#13691)', async () => {
        const prNumber = 3292;
        const pr       = buildPullRequest(prNumber);

        pr.author = {login: 'external-pr-author'};
        pr.body   = 'External PR root body https://pr-root.example/landing';
        pr.comments = {nodes: [{
            id       : 'PC_external',
            author   : {login: 'external-commenter'},
            body     : 'External PR comment https://pr-comment.example/payload',
            createdAt: '2026-05-02T01:00:00Z'
        }, {
            id       : 'PC_trusted',
            author   : {login: 'neo-gpt'},
            body     : 'Trusted maintainer link remains raw https://github.com/neomjs/neo',
            createdAt: '2026-05-02T02:00:00Z'
        }]};
        pr.reviews = {nodes: [{
            id       : 'PRR_external',
            author   : {login: 'external-reviewer'},
            body     : 'External review body https://pr-review.example/payload',
            state    : 'COMMENTED',
            createdAt: '2026-05-02T03:00:00Z'
        }]};

        GraphqlService.query = async () => ({
            repository: {
                pullRequests: {
                    nodes   : [pr],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        const stats      = await PullRequestSyncer.syncPullRequests({pulls: {}});
        const targetPath = path.join(aiConfig.issueSync.pullsDir, 'chunk-1', `pr-${prNumber}.md`);
        const parsed     = matter(await fs.readFile(targetPath, 'utf8'));

        expect(stats.synced).toEqual([prNumber]);
        expect(parsed.data.contentTrust.projected).toBe(true);
        expect(parsed.data.contentTrust.quarantined).toBe(3);
        expect(parsed.content).toContain('[QUARANTINED_URL: pr-root.example]');
        expect(parsed.content).toContain('[QUARANTINED_URL: pr-comment.example]');
        expect(parsed.content).toContain('[QUARANTINED_URL: pr-review.example]');
        expect(parsed.content).not.toContain('https://pr-root.example');
        expect(parsed.content).not.toContain('https://pr-comment.example');
        expect(parsed.content).not.toContain('https://pr-review.example');
        expect(parsed.content).toContain('https://github.com/neomjs/neo');
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

    test('syncPullRequests prunes emptied active chunk directories after archive moves (#13002)', async () => {
        const prNumber = 3291;
        const pr       = buildPullRequest(prNumber);
        const oldPath  = path.join(aiConfig.issueSync.pullsDir, 'chunk-77', `pr-${prNumber}.md`);
        const oldRel   = path.relative(aiConfig.projectRoot, oldPath);

        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-05-10T00:00:00Z'}];

        await fs.ensureDir(path.dirname(oldPath));
        await fs.writeFile(oldPath, 'OLD PR CONTENT', 'utf8');

        GraphqlService.query = async () => ({
            repository: {
                pullRequests: {
                    nodes   : [pr],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        const metadata = {
            pulls: {
                [prNumber]: {
                    state    : 'OPEN',
                    updatedAt: '2026-05-01T00:00:00Z',
                    path     : oldRel
                }
            }
        };

        const stats      = await PullRequestSyncer.syncPullRequests(metadata);
        const targetPath = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-1', `pr-${prNumber}.md`);

        expect(stats.synced).toEqual([prNumber]);
        await expect(fs.pathExists(targetPath)).resolves.toBe(true);
        await expect(fs.pathExists(oldPath)).resolves.toBe(false);
        await expect(fs.pathExists(path.dirname(oldPath))).resolves.toBe(false);
        await expect(fs.pathExists(aiConfig.issueSync.pullsDir)).resolves.toBe(true);
        expect(metadata.pulls[prNumber].path).toBe(path.relative(aiConfig.projectRoot, targetPath));
    });

    test('delta cutoff stops PR pagination once a batch predates the cached high-water mark (#12190)', async () => {
        // The `pullRequests` connection has no server-side `since`, so the syncer orders UPDATED_AT
        // DESC and stops paginating at the cached high-water mark. Pre-fix it scanned the full corpus.
        const metadata = {
            lastSync: '2026-05-01T00:00:00Z',
            pulls   : {
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

    // --- the missing pull reconcile (IssueSyncer had reconcileClosedIssueLocations; pulls had none,
    //     so the delta-only sync left merged PRs marooned in active pulls/). ---

    test('archives a marooned merged PR FILE with NO metadata entry — the production corpus case (#13001)', async () => {
        const prNumber   = 11530,
              activePath = path.join(aiConfig.issueSync.pullsDir, 'chunk-1', `pr-${prNumber}.md`);
        await fs.ensureDir(path.dirname(activePath));
        // The reconcile reads the FILE's frontmatter (number/state/closedAt), not metadata.
        await fs.writeFile(activePath, `---\nnumber: ${prNumber}\nstate: MERGED\nclosedAt: '2026-05-01T00:00:00Z'\n---\nbody`, 'utf-8');

        // NO metadata entry for this PR — exactly the marooned corpus the delta-only cache misses.
        const metadata = {pulls: {}};
        // A release published AFTER the merge → the closedAt→release resolution buckets it to v13.0.0.
        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];

        const stats       = await PullRequestSyncer.reconcileClosedPullRequestLocations(metadata),
              archivePath = path.join(aiConfig.issueSync.contentRoot, 'archive', 'pulls', 'v13.0.0', 'chunk-1', `pr-${prNumber}.md`);

        expect(stats.count).toBe(1);
        expect(stats.pullRequests).toEqual([prNumber]);
        await expect(fs.pathExists(activePath)).resolves.toBe(false);   // moved out of active
        await expect(fs.pathExists(archivePath)).resolves.toBe(true);   // archived under v13.0.0
    });

    test('also updates metadata.path when the moved PR IS tracked in the delta cache', async () => {
        const prNumber   = 12000,
              activePath = path.join(aiConfig.issueSync.pullsDir, 'chunk-1', `pr-${prNumber}.md`);
        await fs.ensureDir(path.dirname(activePath));
        await fs.writeFile(activePath, `---\nnumber: ${prNumber}\nstate: MERGED\nclosedAt: '2026-05-01T00:00:00Z'\n---\n`, 'utf-8');

        const metadata = {pulls: {[prNumber]: {number: prNumber, state: 'MERGED', closedAt: '2026-05-01T00:00:00Z', path: path.relative(aiConfig.projectRoot, activePath)}}};
        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];

        const stats       = await PullRequestSyncer.reconcileClosedPullRequestLocations(metadata),
              archivePath = path.join(aiConfig.issueSync.contentRoot, 'archive', 'pulls', 'v13.0.0', 'chunk-1', `pr-${prNumber}.md`);

        expect(stats.count).toBe(1);
        await expect(fs.pathExists(archivePath)).resolves.toBe(true);
        expect(metadata.pulls[prNumber].path).toBe(path.relative(aiConfig.projectRoot, archivePath));
    });

    test('leaves an OPEN PR file in active (never archives a non-terminal PR)', async () => {
        const prNumber   = 22222,
              activePath = path.join(aiConfig.issueSync.pullsDir, 'chunk-1', `pr-${prNumber}.md`);
        await fs.ensureDir(path.dirname(activePath));
        await fs.writeFile(activePath, `---\nnumber: ${prNumber}\nstate: OPEN\n---\n`, 'utf-8');
        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];

        const stats = await PullRequestSyncer.reconcileClosedPullRequestLocations({pulls: {}});

        expect(stats.count).toBe(0);
        await expect(fs.pathExists(activePath)).resolves.toBe(true);    // untouched
    });

    // --- the divergent-duplicate mechanism: an ordinal recomputed from a delta-sized view of a
    //     sealed bucket is not a smaller truth, it is a different number — so the write lands BESIDE
    //     the existing copy instead of on it, and the two renderings diverge from there. ---

    test('refreshing an already-archived PR overwrites its artifact instead of creating a rival copy', async () => {
        // The production shape, reproduced: PR 10124 lives at chunk-2 of a sealed bucket. The delta
        // sync fetches it with NO cache entry — so the planner ranks it against the one PR it can
        // see, computes ordinal 0, and resolves chunk-1. Pre-fix that wrote a SECOND artifact and
        // left the first in place, because the unlink is gated on `cachedPull?.path`, which a cache
        // miss makes null.
        const prNumber    = 10124,
              existingDir = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-2');

        await fs.ensureDir(existingDir);
        await fs.writeFile(path.join(existingDir, `pr-${prNumber}.md`), 'stale rendering, fewer comments', 'utf8');

        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];

        GraphqlService.query = async () => ({
            repository: {
                pullRequests: {
                    nodes   : [buildPullRequest(prNumber)],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        // Empty cache — the marooned case the delta never names.
        await PullRequestSyncer.syncPullRequests({pulls: {}});

        const rival    = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-1', `pr-${prNumber}.md`),
              occupied = path.join(existingDir, `pr-${prNumber}.md`);

        // Exactly one artifact, at the location the PR already owned.
        await expect(fs.pathExists(rival)).resolves.toBe(false);
        await expect(fs.pathExists(occupied)).resolves.toBe(true);

        // And it was REFRESHED in place, not merely left alone — the stale rendering is gone.
        expect(await fs.readFile(occupied, 'utf8')).not.toBe('stale rendering, fewer comments');
        expect(matter(await fs.readFile(occupied, 'utf8')).data.number).toBe(prNumber);
    });

    test('an OPEN PR is ranked against the ACTIVE corpus on disk, not against the delta — RA-1 planner witness', async () => {
        // @neo-gpt-emmy is right that the scanner coverage never proved this: `contentInventory`
        // specs show the SCANNER finds active files, not that the PLANNER ranks against them. This
        // asserts the rank itself, which is the thing RA-1 actually claimed.
        //
        // Three OPEN PRs already on disk in active, none in metadata (the partial-metadata case), and
        // a fourth arriving. With a threshold of 2, complete active membership [100,200,300,400] puts
        // 400 at ordinal 3 → chunk-2. A planner ranking against the delta alone sees only 400,
        // ordinal 0 → chunk-1: confidently wrong, and silent.
        const originalThreshold = aiConfig.issueSync.archiveChunkThreshold;

        aiConfig.issueSync.archiveChunkThreshold = 2;

        try {
            const activeDir = path.join(aiConfig.issueSync.pullsDir, 'chunk-1');

            await fs.ensureDir(activeDir);
            for (const id of [100, 200, 300]) {
                await fs.writeFile(path.join(activeDir, `pr-${id}.md`), `---\nnumber: ${id}\nstate: OPEN\n---\n`, 'utf-8');
            }

            // No releases → nothing archives; every PR resolves to the active tier.
            ReleaseNotesSyncer.sortedReleases = [];

            const arriving = buildPullRequest(400);

            arriving.state    = 'OPEN';
            arriving.mergedAt = null;
            arriving.closedAt = null;

            GraphqlService.query = async () => ({
                repository: {pullRequests: {nodes: [arriving], pageInfo: {hasNextPage: false, endCursor: null}}}
            });

            await PullRequestSyncer.syncPullRequests({pulls: {}});

            // Ordinal 3 of [100,200,300,400] at threshold 2 → chunk-2.
            await expect(fs.pathExists(path.join(aiConfig.issueSync.pullsDir, 'chunk-2', 'pr-400.md'))).resolves.toBe(true);
            // Not chunk-1, which is what ranking against the delta alone would have chosen.
            await expect(fs.pathExists(path.join(activeDir, 'pr-400.md'))).resolves.toBe(false);
        } finally {
            aiConfig.issueSync.archiveChunkThreshold = originalThreshold;
        }
    });

    test('a new archive arrival is ranked against the bucket ON DISK, not against the delta', async () => {
        // The ordinal is defined over complete bucket membership. With a threshold of 2 and two PRs
        // already sealed in v13.0.0, a third belongs in chunk-2. A planner that sees only the delta
        // ranks it 0 and resolves chunk-1 — confidently wrong, and it would land on top of an
        // existing chunk that the full ordering says is full.
        const originalThreshold = aiConfig.issueSync.archiveChunkThreshold;

        aiConfig.issueSync.archiveChunkThreshold = 2;

        try {
            const sealedDir = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-1');

            await fs.ensureDir(sealedDir);
            await fs.writeFile(path.join(sealedDir, 'pr-100.md'), 'sealed', 'utf8');
            await fs.writeFile(path.join(sealedDir, 'pr-200.md'), 'sealed', 'utf8');

            ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];

            GraphqlService.query = async () => ({
                repository: {
                    pullRequests: {
                        nodes   : [buildPullRequest(300)],
                        pageInfo: {hasNextPage: false, endCursor: null}
                    }
                }
            });

            await PullRequestSyncer.syncPullRequests({pulls: {}});

            // Complete membership [100, 200, 300] → 300 is ordinal 2 → chunk-2 at a threshold of 2.
            await expect(fs.pathExists(path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-2', 'pr-300.md'))).resolves.toBe(true);
            await expect(fs.pathExists(path.join(sealedDir, 'pr-300.md'))).resolves.toBe(false);
        } finally {
            aiConfig.issueSync.archiveChunkThreshold = originalThreshold;
        }
    });

    test('a PR owning two archived artifacts is REFUSED, not guessed at — and the sync survives it', async () => {
        // Nothing on disk says which copy is current, so writing to either canonicalises a guess and
        // destroys the evidence. The PR is skipped; the run continues; the integrity pass reports it.
        const prNumber = 10124;

        for (const chunk of ['chunk-1', 'chunk-2']) {
            const dir = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', chunk);

            await fs.ensureDir(dir);
            await fs.writeFile(path.join(dir, `pr-${prNumber}.md`), `divergent ${chunk}`, 'utf8');
        }

        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];

        // A healthy PR alongside the corrupt one: one bad id must not wedge the whole run.
        GraphqlService.query = async () => ({
            repository: {
                pullRequests: {
                    nodes   : [buildPullRequest(prNumber), buildPullRequest(777)],
                    pageInfo: {hasNextPage: false, endCursor: null}
                }
            }
        });

        const stats = await PullRequestSyncer.syncPullRequests({pulls: {}});

        // The corrupt id is not synced; the healthy one is.
        expect(stats.synced).toEqual([777]);

        // Neither copy was overwritten and no third appeared — the divergence is preserved as evidence.
        expect(await fs.readFile(path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-1', `pr-${prNumber}.md`), 'utf8')).toBe('divergent chunk-1');
        expect(await fs.readFile(path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-2', `pr-${prNumber}.md`), 'utf8')).toBe('divergent chunk-2');
    });

    // --- the move/index mutation set: a rename that does not carry its `_index.json` entry does not
    //     relocate a file, it hides it. This is the mechanism behind the stale-lookup backlog. ---

    test('an archive move carries its _index.json upsert — the entry names the file it actually moved to', async () => {
        const prNumber   = 13001,
              activePath = path.join(aiConfig.issueSync.pullsDir, 'chunk-1', `pr-${prNumber}.md`);

        await fs.ensureDir(path.dirname(activePath));
        await fs.writeFile(activePath, `---\nnumber: ${prNumber}\nstate: MERGED\nclosedAt: '2026-05-01T00:00:00Z'\n---\nbody`, 'utf-8');

        // The index names the file's CURRENT (active) location, as it would before the move.
        await fs.writeJson(path.join(aiConfig.issueSync.contentRoot, '_index.json'), [
            {type: 'pulls', id: prNumber, version: null, chunkNumber: 1, path: `pulls/chunk-1/pr-${prNumber}.md`}
        ]);

        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];

        const stats = await PullRequestSyncer.reconcileClosedPullRequestLocations({pulls: {}});
        const entry = (await readContentIndex(aiConfig.issueSync)).find(e => e.type === 'pulls' && e.id === prNumber);

        // The lookup is asserted BEFORE any counter this fix introduced. A counter is bookkeeping the
        // change itself added, so a spec that trips on it first proves only that the new field exists
        // — the defect (a lookup naming a file that moved) would never be evaluated. Pre-fix this
        // reads `pulls/chunk-1/...`: the file is in the archive and the index still points at active.
        expect(entry.path).toBe(`archive/pulls/v13.0.0/chunk-1/pr-${prNumber}.md`);
        expect(entry.version).toBe('v13.0.0');
        expect(entry.chunkNumber).toBe(1);

        // The entry resolves to a file that exists: the property the stale-lookup backlog violates.
        await expect(fs.pathExists(path.join(aiConfig.issueSync.contentRoot, entry.path))).resolves.toBe(true);

        expect(stats.count).toBe(1);
        expect(stats.indexed).toBe(1);
    });

    test('a marooned move with NO metadata entry is still indexed — the delta cache is not the index', async () => {
        // The production shape. "The next sync rebuilds `_index.json`" is false for exactly this set:
        // the rebuild only covers PRs in its own delta fetch, and a marooned backlog is the set the
        // delta never names. If the move does not carry the entry, nothing ever writes it.
        const prNumber   = 11530,
              activePath = path.join(aiConfig.issueSync.pullsDir, 'chunk-1', `pr-${prNumber}.md`);

        await fs.ensureDir(path.dirname(activePath));
        await fs.writeFile(activePath, `---\nnumber: ${prNumber}\nstate: MERGED\nclosedAt: '2026-05-01T00:00:00Z'\n---\nbody`, 'utf-8');

        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];

        const stats = await PullRequestSyncer.reconcileClosedPullRequestLocations({pulls: {}});
        const entry = (await readContentIndex(aiConfig.issueSync)).find(e => e.id === prNumber);

        // Asserted before the counter: pre-fix there is no entry at all for this PR, and nothing
        // downstream would ever create one.
        expect(entry, 'a marooned move must still produce an index entry').toBeDefined();
        expect(entry.path).toBe(`archive/pulls/v13.0.0/chunk-1/pr-${prNumber}.md`);
        expect(stats.indexed).toBe(1);
    });

    test('every PR moved in one pass is indexed — not just the last one', async () => {
        // A single batched index write must not collapse to one entry: the pass that produced the
        // backlog moved 1,325 files at once.
        const numbers = [12001, 12002, 12003];

        for (const n of numbers) {
            const p = path.join(aiConfig.issueSync.pullsDir, 'chunk-1', `pr-${n}.md`);
            await fs.ensureDir(path.dirname(p));
            await fs.writeFile(p, `---\nnumber: ${n}\nstate: MERGED\nclosedAt: '2026-05-01T00:00:00Z'\n---\n`, 'utf-8');
        }

        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];

        const stats = await PullRequestSyncer.reconcileClosedPullRequestLocations({pulls: {}});
        const index = await readContentIndex(aiConfig.issueSync);

        for (const n of numbers) {
            const entry = index.find(e => e.id === n);

            expect(entry, `PR ${n} must be indexed`).toBeDefined();
            await expect(fs.pathExists(path.join(aiConfig.issueSync.contentRoot, entry.path))).resolves.toBe(true);
        }

        expect(stats.count).toBe(3);
        expect(stats.indexed).toBe(3);
    });

    test('a pass that moves nothing writes no index entries', async () => {
        const prNumber   = 22223,
              activePath = path.join(aiConfig.issueSync.pullsDir, 'chunk-1', `pr-${prNumber}.md`);

        await fs.ensureDir(path.dirname(activePath));
        await fs.writeFile(activePath, `---\nnumber: ${prNumber}\nstate: OPEN\n---\n`, 'utf-8');
        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];

        const stats = await PullRequestSyncer.reconcileClosedPullRequestLocations({pulls: {}});

        expect(stats.count).toBe(0);
        expect(stats.indexed).toBe(0);
    });

    // --- restoring divergent duplicates: both copies are real renderings of one PR and nothing on
    //     disk says which is current, so neither is trusted and GitHub decides. ---

    const seedDivergentPair = async (prNumber, version = 'v13.0.0') => {
        for (const chunk of ['chunk-1', 'chunk-2']) {
            const dir = path.join(aiConfig.issueSync.archiveRoot, 'pulls', version, chunk);

            await fs.ensureDir(dir);
            await fs.writeFile(path.join(dir, `pr-${prNumber}.md`), `divergent ${chunk}`, 'utf8');
        }
    };

    test('restores a divergent pair from GitHub — one artifact survives, neither local copy decides', async () => {
        const prNumber = 10124;

        await seedDivergentPair(prNumber);
        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];
        GraphqlService.query = async () => ({repository: {pullRequest: buildPullRequest(prNumber)}});

        const metadata = {pulls: {}},
              stats    = await PullRequestSyncer.repairDuplicateArtifacts(metadata);

        expect(stats.repaired).toEqual([prNumber]);
        // 1, not 2: `removed` counts STALE copies. The canonical write lands at the ordinal the
        // complete ordering chooses, which here is one of the copies' own addresses — that copy is
        // replaced in place by the atomic rename rather than deleted, so only the rival is removed.
        // Deleting it would delete the artifact just written.
        expect(stats.removed).toBe(1);

        // Exactly one artifact remains, and it is the canonical rendering — not either local copy.
        const survivors = [];
        for (const chunk of ['chunk-1', 'chunk-2', 'chunk-3']) {
            const p = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', chunk, `pr-${prNumber}.md`);
            if (await fs.pathExists(p)) survivors.push(await fs.readFile(p, 'utf8'));
        }

        expect(survivors).toHaveLength(1);
        expect(survivors[0]).not.toContain('divergent');
        expect(matter(survivors[0]).data.number).toBe(prNumber);
        expect(metadata.pulls[prNumber].path).toContain(`pr-${prNumber}.md`);
    });

    test('a failed fetch leaves BOTH copies intact — a repair that can lose data is not a repair', async () => {
        // Fetch before unlink. The copies are the only local record, so deleting first would turn a
        // network blip into a corpus simply missing the PR.
        const prNumber = 10125;

        await seedDivergentPair(prNumber);
        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];
        GraphqlService.query = async () => { throw new Error('network down') };

        const stats = await PullRequestSyncer.repairDuplicateArtifacts({pulls: {}});

        expect(stats.repaired).toEqual([]);
        expect(stats.removed).toBe(0);
        expect(stats.failed[0].id).toBe(prNumber);

        for (const chunk of ['chunk-1', 'chunk-2']) {
            const p = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', chunk, `pr-${prNumber}.md`);

            expect(await fs.readFile(p, 'utf8')).toBe(`divergent ${chunk}`);
        }
    });

    test('a failed WRITE leaves both copies intact — "fetched" is not "durable"', async () => {
        // The gap the fetch-before-unlink test does not reach. Holding the rendering in memory
        // protects against a network failure and nothing else: every step between an unlink and the
        // write can throw, and a crash needs no exception at all. Only a file on disk is durable, so
        // the canonical artifact is written and renamed into place BEFORE anything is removed.
        const prNumber = 10127;

        await seedDivergentPair(prNumber);
        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];
        GraphqlService.query = async () => ({repository: {pullRequest: buildPullRequest(prNumber)}});

        // Fail the write itself — the fetch succeeds, so the old shape would already have unlinked.
        const originalWriteFile = fsPromises.writeFile;

        fsPromises.writeFile = async () => { throw new Error('ENOSPC: no space left on device') };

        let stats;
        try {
            stats = await PullRequestSyncer.repairDuplicateArtifacts({pulls: {}});
        } finally {
            fsPromises.writeFile = originalWriteFile;
        }

        expect(stats.repaired).toEqual([]);
        expect(stats.removed).toBe(0);
        expect(stats.failed[0].id).toBe(prNumber);

        // Both copies survive: the corpus still holds the PR, divergent but present.
        for (const chunk of ['chunk-1', 'chunk-2']) {
            const p = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', chunk, `pr-${prNumber}.md`);

            expect(await fs.readFile(p, 'utf8'), `${chunk} must survive a failed write`).toBe(`divergent ${chunk}`);
        }
    });

    test('the relocate pass REFUSES to rename over an existing same-id artifact — it would destroy the evidence', async () => {
        // `fs.rename` silently replaces its destination. This pass runs BEFORE the duplicate repair,
        // so an unguarded rename resolves a duplicate by deletion — the one resolution this lane
        // refuses — and the copy it destroys is the archived one the repair arbitrates from.
        const prNumber = 10128,
              active   = path.join(aiConfig.issueSync.pullsDir, 'chunk-1', `pr-${prNumber}.md`),
              archived = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-1', `pr-${prNumber}.md`);

        await fs.ensureDir(path.dirname(active));
        await fs.writeFile(active, `---\nnumber: ${prNumber}\nstate: MERGED\nclosedAt: '2026-05-01T00:00:00Z'\n---\nactive copy`, 'utf-8');
        await fs.ensureDir(path.dirname(archived));
        await fs.writeFile(archived, 'archived copy — the evidence', 'utf8');

        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];

        const stats = await PullRequestSyncer.reconcileClosedPullRequestLocations({pulls: {}});

        expect(stats.collisions).toEqual([prNumber]);
        expect(stats.count).toBe(0);

        // BOTH survive — the duplicate is routed to the repair, not silently resolved here.
        expect(await fs.readFile(archived, 'utf8')).toBe('archived copy — the evidence');
        await expect(fs.pathExists(active)).resolves.toBe(true);
    });

    test('a failed repair does not poison the SHARED inventory — the next id keeps its complete-corpus ordinal', async () => {
        // The single-duplicate witness proves the files survive a failed write. It structurally
        // cannot prove this: with one duplicate there is no "later repair" to be harmed. Planning on
        // the shared map deletes the failed id from it, so every subsequent id in the pass ranks
        // against a corpus short one PR — files intact, membership lying.
        //
        // The fixture has to make that lie CHANGE AN OUTCOME, or the witness proves nothing. My first
        // draft used the default threshold and passed against the unfixed code: the missing member
        // shifted no chunk, so the poisoning was real and invisible — a test that cannot fail for its
        // stated reason, which is precisely the defect it was written to close.
        //
        // At threshold 2, one sealed member (100) plus two duplicates (200 failing, 300 following):
        //   membership [100, 200, 300] → 300 is ordinal 2 → chunk-2   (shared map intact)
        //   membership [100, 300]      → 300 is ordinal 1 → chunk-1   (poisoned: 200 deleted)
        // The chunk is the discriminator.
        const originalThreshold = aiConfig.issueSync.archiveChunkThreshold;

        aiConfig.issueSync.archiveChunkThreshold = 2;

        try {
            const sealed = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-1');

            await fs.ensureDir(sealed);
            await fs.writeFile(path.join(sealed, 'pr-100.md'), 'sealed single', 'utf8');

            await seedDivergentPair(200);
            await seedDivergentPair(300);

            ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];
            GraphqlService.query = async (_q, vars) => ({repository: {pullRequest: buildPullRequest(vars.prNumber)}});

            const originalWriteFile = fsPromises.writeFile;

            // Fail ONLY 200's write. 300 must still rank against a corpus that contains 200.
            fsPromises.writeFile = async (p, ...rest) => {
                if (String(p).includes('pr-200.md')) throw new Error('ENOSPC: no space left on device');
                return originalWriteFile(p, ...rest)
            };

            let stats;
            try {
                stats = await PullRequestSyncer.repairDuplicateArtifacts({pulls: {}});
            } finally {
                fsPromises.writeFile = originalWriteFile;
            }

            expect(stats.failed.map(f => f.id)).toEqual([200]);
            expect(stats.repaired).toEqual([300]);

            // THE DISCRIMINATOR: 300 lands at the ordinal complete membership chooses. A poisoned map
            // would have ranked it one place earlier and written chunk-1.
            await expect(fs.pathExists(path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-2', 'pr-300.md'))).resolves.toBe(true);
            await expect(fs.pathExists(path.join(sealed, 'pr-300.md'))).resolves.toBe(false);

            // And 200's copies both survive — the single-duplicate contract, unchanged.
            for (const chunk of ['chunk-1', 'chunk-2']) {
                const p = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', chunk, 'pr-200.md');

                expect(await fs.readFile(p, 'utf8')).toBe(`divergent ${chunk}`);
            }
        } finally {
            aiConfig.issueSync.archiveChunkThreshold = originalThreshold;
        }
    });

    test('a PR absent from GitHub is refused, not cleaned up — the copies are the only record left', async () => {
        const prNumber = 10126;

        await seedDivergentPair(prNumber);
        ReleaseNotesSyncer.sortedReleases = [{tagName: 'v13.0.0', publishedAt: '2026-06-01T00:00:00Z'}];
        GraphqlService.query = async () => ({repository: {pullRequest: null}});

        const stats = await PullRequestSyncer.repairDuplicateArtifacts({pulls: {}});

        expect(stats.removed).toBe(0);
        expect(stats.failed[0].reason).toContain('not found on GitHub');
        await expect(fs.pathExists(path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-1', `pr-${prNumber}.md`))).resolves.toBe(true);
    });

    test('is a no-op on a corpus with no duplicates — and makes no network call', async () => {
        const single = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-1', 'pr-500.md');

        await fs.ensureDir(path.dirname(single));
        await fs.writeFile(single, 'fine', 'utf8');

        let queried = false;
        GraphqlService.query = async () => { queried = true; return {repository: {pullRequest: null}} };

        const stats = await PullRequestSyncer.repairDuplicateArtifacts({pulls: {}});

        expect(stats).toEqual({repaired: [], removed: 0, failed: []});
        expect(queried).toBe(false);
        expect(await fs.readFile(single, 'utf8')).toBe('fine');
    });

    // --- the repair: preventing new drift does not remove old drift. Entries stranded by moves that
    //     predate the upsert name files ALREADY archived, so no relocate pass revisits them and no
    //     delta fetch names them — they are unreachable by every mechanism expected to heal them. ---

    test('realigns a stranded index entry with the artifact on disk — the drift nothing else could heal', async () => {
        const prNumber = 9537,
              archived = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-3', `pr-${prNumber}.md`);

        await fs.ensureDir(path.dirname(archived));
        await fs.writeFile(archived, 'archived long ago', 'utf8');

        // The entry the historical move left behind: names the pre-move active path.
        await fs.writeJson(path.join(aiConfig.issueSync.contentRoot, '_index.json'), [
            {type: 'pulls', id: prNumber, version: null, chunkNumber: 1, path: `pulls/chunk-1/pr-${prNumber}.md`}
        ]);

        const stats = await PullRequestSyncer.reconcilePullRequestIndex();
        const entry = (await readContentIndex(aiConfig.issueSync)).find(e => e.id === prNumber);

        expect(entry.path).toBe(`archive/pulls/v13.0.0/chunk-3/pr-${prNumber}.md`);
        expect(entry.version).toBe('v13.0.0');
        expect(entry.chunkNumber).toBe(3);
        expect(stats.reindexed).toBe(1);
    });

    test('is idempotent and writes nothing when the index already agrees — no churn in generated content', async () => {
        const prNumber = 4242,
              archived = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-1', `pr-${prNumber}.md`);

        await fs.ensureDir(path.dirname(archived));
        await fs.writeFile(archived, 'x', 'utf8');
        await fs.writeJson(path.join(aiConfig.issueSync.contentRoot, '_index.json'), [
            {type: 'pulls', id: prNumber, version: 'v13.0.0', chunkNumber: 1, path: `archive/pulls/v13.0.0/chunk-1/pr-${prNumber}.md`}
        ]);

        const first = await PullRequestSyncer.reconcilePullRequestIndex();

        expect(first.reindexed).toBe(0);
        expect(first.unchanged).toBe(1);

        // A healthy corpus must not rewrite the file — this runs every sync and the output is committed.
        const before = await fs.readFile(path.join(aiConfig.issueSync.contentRoot, '_index.json'), 'utf8');
        await PullRequestSyncer.reconcilePullRequestIndex();
        expect(await fs.readFile(path.join(aiConfig.issueSync.contentRoot, '_index.json'), 'utf8')).toBe(before);
    });

    test('repairs a stale entry whose file exists but whose chunkNumber contradicts its path', async () => {
        const prNumber = 777,
              archived = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', 'chunk-2', `pr-${prNumber}.md`);

        await fs.ensureDir(path.dirname(archived));
        await fs.writeFile(archived, 'x', 'utf8');
        // Path is right, coordinates are not — invisible to any check that only resolves the path.
        await fs.writeJson(path.join(aiConfig.issueSync.contentRoot, '_index.json'), [
            {type: 'pulls', id: prNumber, version: 'v13.0.0', chunkNumber: 1, path: `archive/pulls/v13.0.0/chunk-2/pr-${prNumber}.md`}
        ]);

        const stats = await PullRequestSyncer.reconcilePullRequestIndex();

        expect(stats.reindexed).toBe(1);
        expect((await readContentIndex(aiConfig.issueSync)).find(e => e.id === prNumber).chunkNumber).toBe(2);
    });

    test('REMOVES an existing row for an ambiguous id — un-indexing is not enough', async () => {
        // Skipping the id leaves any prior row in place, and that row names one of two divergent
        // artifacts — an assertion that the id resolves there, which is the canonical-by-implication
        // choice this lane refuses. Silently, too: the path is real, so every existence check passes.
        const prNumber = 10124;

        for (const chunk of ['chunk-1', 'chunk-2']) {
            const dir = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', chunk);

            await fs.ensureDir(dir);
            await fs.writeFile(path.join(dir, `pr-${prNumber}.md`), `divergent ${chunk}`, 'utf8');
        }

        // A pre-existing row blessing chunk-1.
        await fs.writeJson(path.join(aiConfig.issueSync.contentRoot, '_index.json'), [
            {type: 'pulls', id: prNumber, version: 'v13.0.0', chunkNumber: 1, path: `archive/pulls/v13.0.0/chunk-1/pr-${prNumber}.md`}
        ]);

        const stats = await PullRequestSyncer.reconcilePullRequestIndex();

        expect(stats.skippedAmbiguous).toEqual([prNumber]);
        expect(stats.removed).toBe(1);
        expect((await readContentIndex(aiConfig.issueSync)).find(e => e.id === prNumber)).toBeUndefined();
    });

    test('REMOVES a row whose id owns no artifact at all — a lookup into nothing', async () => {
        await fs.writeJson(path.join(aiConfig.issueSync.contentRoot, '_index.json'), [
            {type: 'pulls', id: 4040, version: null, chunkNumber: 1, path: 'pulls/chunk-1/pr-4040.md'}
        ]);

        const stats = await PullRequestSyncer.reconcilePullRequestIndex();

        expect(stats.removed).toBe(1);
        expect((await readContentIndex(aiConfig.issueSync)).find(e => e.id === 4040)).toBeUndefined();
    });

    test('leaves an ambiguous id UNINDEXED rather than blessing a copy as canonical', async () => {
        const prNumber = 10124;

        for (const chunk of ['chunk-1', 'chunk-2']) {
            const dir = path.join(aiConfig.issueSync.archiveRoot, 'pulls', 'v13.0.0', chunk);

            await fs.ensureDir(dir);
            await fs.writeFile(path.join(dir, `pr-${prNumber}.md`), `divergent ${chunk}`, 'utf8');
        }

        await fs.writeJson(path.join(aiConfig.issueSync.contentRoot, '_index.json'), []);

        const stats = await PullRequestSyncer.reconcilePullRequestIndex();

        expect(stats.skippedAmbiguous).toEqual([prNumber]);
        expect(stats.reindexed).toBe(0);
        // No entry: an index entry naming one of two divergent copies would make it canonical by
        // implication, which is the arbitrary choice this lane refuses on the corpus's behalf.
        expect((await readContentIndex(aiConfig.issueSync)).find(e => e.id === prNumber)).toBeUndefined();
    });

    test('is a no-op when no releases are loaded (fail-safe)', async () => {
        const prNumber   = 44444,
              activePath = path.join(aiConfig.issueSync.pullsDir, 'chunk-1', `pr-${prNumber}.md`);
        await fs.ensureDir(path.dirname(activePath));
        await fs.writeFile(activePath, `---\nnumber: ${prNumber}\nstate: MERGED\nclosedAt: '2026-05-01T00:00:00Z'\n---\n`, 'utf-8');
        ReleaseNotesSyncer.sortedReleases = [];                          // no releases → cannot resolve buckets

        const stats = await PullRequestSyncer.reconcileClosedPullRequestLocations({pulls: {}});

        expect(stats.count).toBe(0);
        await expect(fs.pathExists(activePath)).resolves.toBe(true);    // untouched (fail-safe skip)
    });
    test('refetchPullsByNumber force-re-renders a stale PR mirror, bypassing the delta/hash gate (#13794)', async () => {
        const prNumber = 9876;

        // The mirror is cached as current (matching updatedAt) with a STALE contentHash — the bulk
        // delta-sync would skip it (updatedAt unchanged AND hash compare). refetchPullsByNumber must
        // force a re-render from live GitHub state regardless.
        const metadata = {
            pulls: {
                [prNumber]: {
                    state      : 'MERGED',
                    updatedAt  : '2026-05-02T00:00:00Z',
                    contentHash: 'STALE-HASH',
                    path       : `resources/content/pulls/chunk-1/pr-${prNumber}.md`
                }
            }
        };

        // No release published after the merge → the PR resolves to the ACTIVE bucket.
        ReleaseNotesSyncer.sortedReleases = [];

        let capturedQuery = null;
        let capturedVars  = null;
        GraphqlService.query = async (query, vars) => {
            capturedQuery = query;
            capturedVars  = vars;

            return {repository: {pullRequest: buildPullRequest(prNumber)}};
        };

        const stats = await PullRequestSyncer.refetchPullsByNumber([prNumber], metadata);

        // Used the single-PR query with the right number — not the bulk pagination query.
        expect(capturedQuery).toContain('FetchSinglePullForSync');
        expect(capturedVars.prNumber).toBe(prNumber);

        // Re-rendered + written to the active bucket.
        expect(stats.refetched).toEqual({count: 1, pulls: [prNumber]});
        const targetPath = path.join(aiConfig.issueSync.pullsDir, 'chunk-1', `pr-${prNumber}.md`);
        await expect(fs.pathExists(targetPath)).resolves.toBe(true);

        const parsed = matter(await fs.readFile(targetPath, 'utf8'));
        expect(parsed.data.number).toBe(prNumber);

        // Metadata refreshed with the live hash (no longer the stale one) + the resolved path.
        expect(metadata.pulls[prNumber].contentHash).not.toBe('STALE-HASH');
        expect(metadata.pulls[prNumber].state).toBe('MERGED');
        expect(metadata.pulls[prNumber].path).toBe(path.relative(aiConfig.projectRoot, targetPath));
    });

    test('refetchPullsByNumber skips a PR that no longer exists on GitHub (#13794)', async () => {
        const prNumber = 4242;
        const metadata = {pulls: {}};

        GraphqlService.query = async () => ({repository: {pullRequest: null}});

        const stats = await PullRequestSyncer.refetchPullsByNumber([prNumber], metadata);

        expect(stats.refetched).toEqual({count: 0, pulls: []});
        expect(metadata.pulls[prNumber]).toBeUndefined();
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
