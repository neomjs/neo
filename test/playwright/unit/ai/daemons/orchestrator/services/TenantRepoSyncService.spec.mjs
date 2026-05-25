import {setup} from '../../../../../setup.mjs';

const appName = 'TenantRepoSyncServiceTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../src/manager/Instance.mjs';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';

import TenantRepoSyncService from '../../../../../../../ai/daemons/orchestrator/services/TenantRepoSyncService.mjs';
import {TENANT_REPO_SYNC_TASK_NAME} from '../../../../../../../ai/daemons/orchestrator/TaskDefinitions.mjs';
import {deriveTenantRepoMirrorPath} from '../../../../../../../ai/services/knowledge-base/helpers/TenantRepoAccessContract.mjs';

// Serial mode: TenantRepoSyncService is a singleton.
test.describe.configure({mode: 'serial'});

test.describe('TenantRepoSyncService (#11790)', () => {
    let tmpDir;
    let revisionsFile;

    function createInMemoryTaskStateService() {
        const taskState = {};
        return {
            taskState,
            getTaskState : taskName => taskState[taskName],
            markStarted  : (taskName, reason) => { taskState[taskName] = {running: true, reason, startedAt: Date.now()}; },
            markCompleted: taskName => { taskState[taskName] = {...taskState[taskName], running: false, completedAt: Date.now()}; },
            markSkipped  : taskName => { taskState[taskName] = {...taskState[taskName], running: false, skippedAt: Date.now()}; },
            markFailed   : taskName => { taskState[taskName] = {...taskState[taskName], running: false, failedAt: Date.now()}; }
        };
    }

    function makeFakeGitMirror({captureCalls = []} = {}) {
        return {
            async cloneIfMissing(args) { captureCalls.push({op: 'cloneIfMissing', args}); },
            async fetch(args)          { captureCalls.push({op: 'fetch',         args}); },
            async resolveHead({ref})   { return `sha-for-${ref}`; },
            async isAncestor()         { return true; },
            async diffRevisions()      { return {addedOrChanged: [], deleted: []}; }
        };
    }

    function makeFakeEnvelopeBuilder({captureCalls = []} = {}) {
        return async function buildIngestEnvelope(args) {
            captureCalls.push({op: 'buildIngestEnvelope', args});
            return {
                tenantId    : args.tenantId,
                repoSlug    : args.repoSlug,
                files       : [{sourcePath: 'fake.txt', repoSlug: args.repoSlug, content: 'x'}],
                deleted     : [],
                headRevision: `sha-head-${args.repoSlug}`,
                ...(args.lastIngestedRev ? {baseRevision: args.lastIngestedRev} : {})
            };
        };
    }

    function makeFakeIngestionService({captureCalls = []} = {}) {
        return {
            async ingestSourceFiles(payload) {
                captureCalls.push({op: 'ingestSourceFiles', payload});
                return {
                    ingested: payload.files?.length || 0,
                    deleted : payload.deleted?.length || 0,
                    embeddingsGenerated: 0,
                    errors  : [],
                    tenantId: payload.tenantId,
                    durationMs: 1
                };
            }
        };
    }

    let mirrorRoot;

    /**
     * Creates a fake mirror directory at the canonical derived path so
     * `buildIngestEnvelope`'s `fs.pathExists` precheck passes. Tests that exercise
     * specific tenant/repo identities should call this for each (tenantId, repoSlug).
     */
    async function provisionMirrorDir({tenantId, repoSlug}) {
        const mirrorPath = deriveTenantRepoMirrorPath({mirrorRoot, tenantId, repoSlug});
        await fs.ensureDir(mirrorPath);
        return mirrorPath;
    }

    test.beforeEach(async () => {
        tmpDir        = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-tenant-repo-sync-svc-'));
        mirrorRoot    = path.join(tmpDir, 'mirror');
        revisionsFile = path.join(tmpDir, 'revisions.json');
        await fs.ensureDir(mirrorRoot);
    });

    test.afterEach(async () => {
        await fs.remove(tmpDir);
    });

    test('skipped when no tenantRepos configured', async () => {
        const taskStateService = createInMemoryTaskStateService();

        const result = await TenantRepoSyncService.runTask({
            reason          : 'manual-test',
            taskStateService,
            tenantReposConfig: {tenantRepos: []},
            revisionsFilePath: revisionsFile
        });

        expect(result.status).toBe('skipped');
        expect(result.details.reason).toBe('no-tenant-repos-configured');
        expect(result.details.repoCount).toBe(0);
        expect(taskStateService.taskState[TENANT_REPO_SYNC_TASK_NAME].skippedAt).toBeTruthy();
    });

    test('skipped when already running (re-entrancy guard)', async () => {
        const taskStateService = createInMemoryTaskStateService();
        taskStateService.taskState[TENANT_REPO_SYNC_TASK_NAME] = {running: true, pid: 12345};

        const result = await TenantRepoSyncService.runTask({
            reason          : 'periodic',
            taskStateService,
            tenantReposConfig: {tenantRepos: [{tenantId: 't1', repoSlug: 'org/repo', mirrorRoot: '/tmp/mirror', cloneUrl: 'https://example.com/repo.git'}]},
            revisionsFilePath: revisionsFile
        });

        expect(result.status).toBe('skipped');
        expect(result.details.reasonCode).toBe('already-running');
        expect(result.details.pid).toBe(12345);
    });

    test('completed: iterates configured repos and calls ingestion service', async () => {
        const taskStateService = createInMemoryTaskStateService();
        const mirrorCalls      = [];
        const ingestCalls      = [];

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/repo-a'});
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/repo-b'});

        const result = await TenantRepoSyncService.runTask({
            reason          : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/repo-a', mirrorRoot, cloneUrl: 'https://example.com/a.git'},
                {tenantId: 't1', repoSlug: 'org/repo-b', mirrorRoot, cloneUrl: 'https://example.com/b.git'}
            ]},
            gitMirror                    : makeFakeGitMirror({captureCalls: mirrorCalls}),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService({captureCalls: ingestCalls}),
            revisionsFilePath            : revisionsFile
        });

        expect(result.status).toBe('completed');
        expect(result.details.repoCount).toBe(2);
        expect(result.details.completedCount).toBe(2);
        expect(result.details.failedCount).toBe(0);

        // Each repo cloned + fetched
        expect(mirrorCalls.filter(c => c.op === 'cloneIfMissing')).toHaveLength(2);
        expect(mirrorCalls.filter(c => c.op === 'fetch')).toHaveLength(2);

        // Each repo ingested with viaMcp: false (operator-bulk path)
        expect(ingestCalls).toHaveLength(2);
        ingestCalls.forEach(call => {
            expect(call.payload.viaMcp).toBe(false);
            expect(call.payload.tenantId).toBe('t1');
        });

        // Revisions persisted
        const persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions['t1/org/repo-a']).toBeTruthy();
        expect(persisted.revisions['t1/org/repo-b']).toBeTruthy();
    });

    test('per-repo failure isolation: one failed repo does not halt remaining', async () => {
        const taskStateService = createInMemoryTaskStateService();
        let   fetchCount       = 0;

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/good'});
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/broken'});
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/good2'});

        const failingGitMirror = {
            async cloneIfMissing() {},
            async fetch(args) {
                fetchCount++;
                if (args.repoSlug === 'org/broken') {
                    throw Object.assign(new Error('fetch failed for org/broken'), {code: 'KB_GITMIRROR_FETCH_FAILED'});
                }
            },
            async resolveHead({ref})   { return `sha-${ref}`; },
            async isAncestor()         { return true; },
            async diffRevisions()      { return {addedOrChanged: [], deleted: []}; }
        };

        const result = await TenantRepoSyncService.runTask({
            reason          : 'periodic',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/good',   mirrorRoot, cloneUrl: 'https://example.com/good.git'},
                {tenantId: 't1', repoSlug: 'org/broken', mirrorRoot, cloneUrl: 'https://example.com/broken.git'},
                {tenantId: 't1', repoSlug: 'org/good2',  mirrorRoot, cloneUrl: 'https://example.com/good2.git'}
            ]},
            gitMirror                    : failingGitMirror,
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile
        });

        // Failures do NOT short-circuit — all 3 repos visited.
        expect(fetchCount).toBe(3);

        // Status: partial completion still reports `completed` per service contract
        // (any completedCount > 0 + any failedCount > 0 = `completed` per service shape).
        expect(result.status).toBe('completed');
        expect(result.details.repoCount).toBe(3);
        expect(result.details.completedCount).toBe(2);
        expect(result.details.failedCount).toBe(1);

        const failed = result.details.repos.find(r => r.status === 'degraded');
        expect(failed.tenantId).toBe('t1');
        expect(failed.repoSlug).toBe('org/broken');
        // Service wraps non-prefixed errors as the stable KB_TENANT_REPO_SYNC_SYNC_FAILED code
        // so test assertion uses the lastErrorCode the operator would actually see.
        expect(failed.lastErrorCode).toBe('KB_TENANT_REPO_SYNC_SYNC_FAILED');
    });

    test('onlyRepoSlugs scoping: subset filtering for manual CLI path', async () => {
        const taskStateService = createInMemoryTaskStateService();
        const ingestCalls      = [];

        // Only need to provision the subset that will actually run
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/a'});
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/c'});

        const result = await TenantRepoSyncService.runTask({
            reason          : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/a', mirrorRoot, cloneUrl: 'https://example.com/a.git'},
                {tenantId: 't1', repoSlug: 'org/b', mirrorRoot, cloneUrl: 'https://example.com/b.git'},
                {tenantId: 't1', repoSlug: 'org/c', mirrorRoot, cloneUrl: 'https://example.com/c.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService({captureCalls: ingestCalls}),
            onlyRepoSlugs                : ['org/a', 'org/c'],
            revisionsFilePath            : revisionsFile
        });

        expect(result.status).toBe('completed');
        expect(result.details.repoCount).toBe(2);
        const ingestedSlugs = ingestCalls.map(c => c.payload.repoSlug).sort();
        expect(ingestedSlugs).toEqual(['org/a', 'org/c']);
    });

    test('persisted revisions are read on subsequent run and passed as lastIngestedRev', async () => {
        const taskStateService = createInMemoryTaskStateService();

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/seeded'});

        // Seed the revisions file with a prior run
        await fs.ensureDir(path.dirname(revisionsFile));
        await fs.writeJson(revisionsFile, {revisions: {'t1/org/seeded': 'sha-prior-run'}});

        let capturedLastIngestedRev = null;
        const envelopeWatchingGitMirror = {
            async cloneIfMissing() {},
            async fetch() {},
            async resolveHead({ref}) {
                // resolveRevision passes the raw ref ('HEAD' or the prior sha) through.
                // We capture the call to verify the prior-run sha flows into the envelope.
                if (ref === 'sha-prior-run') {
                    capturedLastIngestedRev = ref;
                    return 'sha-prior-run';
                }
                return 'sha-new-head';
            },
            async isAncestor() { return true; },
            async diffRevisions() { return {addedOrChanged: [], deleted: []}; }
        };

        const result = await TenantRepoSyncService.runTask({
            reason          : 'periodic',
            taskStateService,
            tenantReposConfig: {tenantRepos: [{tenantId: 't1', repoSlug: 'org/seeded', mirrorRoot, cloneUrl: 'https://example.com/seeded.git'}]},
            gitMirror                    : envelopeWatchingGitMirror,
            // For the persistence test, use a real-shape envelope-builder fake that
            // calls gitMirror.resolveHead twice — once for HEAD, once for prior sha —
            // so the test can verify lastIngestedRev flows through.
            envelopeBuilder              : async (args) => {
                await args.gitMirror.resolveHead({...args, ref: args.newHead || 'HEAD'});
                if (args.lastIngestedRev) await args.gitMirror.resolveHead({...args, ref: args.lastIngestedRev});
                return {
                    tenantId: args.tenantId,
                    repoSlug: args.repoSlug,
                    files: [], deleted: [],
                    headRevision: 'sha-new-head'
                };
            },
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile
        });

        expect(result.status).toBe('completed');
        expect(capturedLastIngestedRev).toBe('sha-prior-run');
    });

    test('health payload: per-repo details.repos[] carries operator-visible freshness fields on success', async () => {
        const taskStateService = createInMemoryTaskStateService();
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/repo-a'});

        const result = await TenantRepoSyncService.runTask({
            reason          : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/repo-a', mirrorRoot, cloneUrl: 'https://example.com/a.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile
        });

        expect(result.details.repos).toBeDefined();
        expect(result.details.repos).toHaveLength(1);

        const repoState = result.details.repos[0];
        expect(repoState.tenantId).toBe('t1');
        expect(repoState.repoSlug).toBe('org/repo-a');
        expect(repoState.status).toBe('active');
        expect(repoState.lastIngestedRev).toBeTruthy();
        expect(repoState.lastSyncAt).toBeTruthy();
        expect(new Date(repoState.lastSyncAt).getTime()).not.toBeNaN();
        expect(typeof repoState.lastSyncDeletedCount).toBe('number');
        expect(repoState.lastErrorCode).toBeUndefined(); // only set on degraded/quarantined
    });

    test('health payload: failed repo surfaces status=degraded + stable KB_TENANT_REPO_SYNC_* error code', async () => {
        const taskStateService = createInMemoryTaskStateService();
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/broken'});

        const failingMirror = {
            async cloneIfMissing() {},
            async fetch() {
                const err = new Error('git fetch failed: connection refused');
                err.code = 'KB_GITMIRROR_FETCH_FAILED';
                throw err;
            },
            async resolveHead() { return 'sha-current'; },
            async isAncestor() { return true; },
            async diffRevisions() { return {addedOrChanged: [], deleted: []}; }
        };

        const result = await TenantRepoSyncService.runTask({
            reason          : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/broken', mirrorRoot, cloneUrl: 'https://example.com/broken.git'}
            ]},
            gitMirror                    : failingMirror,
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile
        });

        expect(result.status).toBe('failed');

        const repoState = result.details.repos[0];
        expect(repoState.status).toBe('degraded');
        // Underlying error code (KB_GITMIRROR_FETCH_FAILED) does NOT carry the
        // KB_TENANT_REPO_SYNC_ prefix, so the service wraps it as the stable
        // KB_TENANT_REPO_SYNC_SYNC_FAILED code that operators branch on.
        expect(repoState.lastErrorCode).toBe('KB_TENANT_REPO_SYNC_SYNC_FAILED');
        expect(repoState.tenantId).toBe('t1');
        expect(repoState.repoSlug).toBe('org/broken');
    });

    test('operator log: emits per-repo completed line + cycle summary in expected shape', async () => {
        const taskStateService = createInMemoryTaskStateService();
        const logLines         = [];
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/repo-a'});

        await TenantRepoSyncService.runTask({
            reason          : 'periodic-sweep:60000',
            taskStateService,
            writeLog        : (level, msg) => logLines.push({level, msg}),
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/repo-a', mirrorRoot, cloneUrl: 'https://example.com/a.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile
        });

        const refreshLine = logLines.find(l => l.msg.includes('Refreshing t1/org/repo-a'));
        const completedLine = logLines.find(l => l.msg.includes('t1/org/repo-a completed'));
        const summaryLine = logLines.find(l => l.msg.includes('Cycle summary'));

        expect(refreshLine).toBeDefined();
        expect(completedLine).toBeDefined();
        expect(completedLine.msg).toMatch(/head=\w+/);
        expect(completedLine.msg).toMatch(/ingested=\d+/);
        expect(completedLine.msg).toMatch(/deleted=\d+/);
        expect(completedLine.msg).toMatch(/\(\d+ms\)/);
        expect(summaryLine).toBeDefined();
        expect(summaryLine.msg).toMatch(/1 repos, 1 completed, 0 failed/);
    });
});
