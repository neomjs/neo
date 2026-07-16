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
