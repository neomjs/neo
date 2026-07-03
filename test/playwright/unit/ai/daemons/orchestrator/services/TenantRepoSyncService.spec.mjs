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
import {fileURLToPath} from 'url';

import TenantRepoSyncService        from '../../../../../../../ai/daemons/orchestrator/services/TenantRepoSyncService.mjs';
import {deriveTenantRepoMirrorPath} from '../../../../../../../ai/services/knowledge-base/helpers/tenantRepoAccessContract.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

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
                    ingested           : payload.files?.length || 0,
                    deleted            : payload.deleted?.length || 0,
                    embeddingsGenerated: 0,
                    errors             : [],
                    tenantId           : payload.tenantId,
                    durationMs         : 1
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
        // Restore the singleton's reactive config to default values so
        // concurrency tests cannot leak short timeouts / serial-limit to siblings.
        TenantRepoSyncService.concurrencyLimit         = 2;
        TenantRepoSyncService.concurrencyGateTimeoutMs = 30000;
    });

    test('skipped when no tenantRepos configured', async () => {
        const taskStateService = createInMemoryTaskStateService();

        const result = await TenantRepoSyncService.runTask({
            reason           : 'manual-test',
            taskStateService,
            tenantReposConfig: {tenantRepos: []},
            revisionsFilePath: revisionsFile
        });

        expect(result.status).toBe('skipped');
        expect(result.details.reason).toBe('no-tenant-repos-configured');
        expect(result.details.repoCount).toBe(0);
        expect(taskStateService.taskState['tenant-repo-sync'].skippedAt).toBeTruthy();
    });

    test('skipped when already running (re-entrancy guard)', async () => {
        const taskStateService = createInMemoryTaskStateService();
        taskStateService.taskState['tenant-repo-sync'] = {running: true, pid: 12345};

        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic',
            taskStateService,
            tenantReposConfig: {tenantRepos: [{tenantId: 't1', repoSlug: 'org/repo', mirrorRoot: '/tmp/mirror', cloneUrl: 'https://github.com/neomjs/repo.git'}]},
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
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/repo-a', mirrorRoot, cloneUrl: 'https://github.com/neomjs/a.git'},
                {tenantId: 't1', repoSlug: 'org/repo-b', mirrorRoot, cloneUrl: 'https://github.com/neomjs/b.git'}
            ]},
            gitMirror                    : makeFakeGitMirror({captureCalls: mirrorCalls}),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService({captureCalls: ingestCalls}),
            revisionsFilePath            : revisionsFile,
            // Bootstrap seeding defers fresh repos to a later sweep
            // within the jitter window; this test simulates the in-loop iteration path
            // and opts out so it can assert "first call processes all repos".
            seedBootstrap                : false
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
            reason           : 'periodic',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/good',   mirrorRoot, cloneUrl: 'https://github.com/neomjs/good.git'},
                {tenantId: 't1', repoSlug: 'org/broken', mirrorRoot, cloneUrl: 'https://github.com/neomjs/broken.git'},
                {tenantId: 't1', repoSlug: 'org/good2',  mirrorRoot, cloneUrl: 'https://github.com/neomjs/good2.git'}
            ]},
            gitMirror                    : failingGitMirror,
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            seedBootstrap                : false
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
        // Service wraps sibling-subsystem errors as the stable KB_TENANT_REPO_SYNC_SYNC_FAILED code
        // and preserves the source code in a bounded non-secret field for diagnostics.
        expect(failed.lastErrorCode).toBe('KB_TENANT_REPO_SYNC_SYNC_FAILED');
        expect(failed.lastSourceErrorCode).toBe('KB_GITMIRROR_FETCH_FAILED');
    });

    test('onlyRepoSlugs scoping: subset filtering for manual CLI path', async () => {
        const taskStateService = createInMemoryTaskStateService();
        const ingestCalls      = [];

        // Only need to provision the subset that will actually run
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/a'});
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/c'});

        const result = await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/a', mirrorRoot, cloneUrl: 'https://github.com/neomjs/a.git'},
                {tenantId: 't1', repoSlug: 'org/b', mirrorRoot, cloneUrl: 'https://github.com/neomjs/b.git'},
                {tenantId: 't1', repoSlug: 'org/c', mirrorRoot, cloneUrl: 'https://github.com/neomjs/c.git'}
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

        let   capturedLastIngestedRev   = null;
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
            reason           : 'periodic',
            taskStateService,
            tenantReposConfig: {tenantRepos: [{tenantId: 't1', repoSlug: 'org/seeded', mirrorRoot, cloneUrl: 'https://github.com/neomjs/seeded.git'}]},
            gitMirror        : envelopeWatchingGitMirror,
            // For the persistence test, use a real-shape envelope-builder fake that
            // calls gitMirror.resolveHead twice — once for HEAD, once for prior sha —
            // so the test can verify lastIngestedRev flows through.
            envelopeBuilder              : async (args) => {
                await args.gitMirror.resolveHead({...args, ref: args.newHead || 'HEAD'});
                if (args.lastIngestedRev) await args.gitMirror.resolveHead({...args, ref: args.lastIngestedRev});
                return {
                    tenantId    : args.tenantId,
                    repoSlug    : args.repoSlug,
                    files       : [], deleted: [],
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
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/repo-a', mirrorRoot, cloneUrl: 'https://github.com/neomjs/a.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            seedBootstrap                : false
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
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/broken', mirrorRoot, cloneUrl: 'https://github.com/neomjs/broken.git'}
            ]},
            gitMirror                    : failingMirror,
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            seedBootstrap                : false
        });

        expect(result.status).toBe('failed');

        const repoState = result.details.repos[0];
        expect(repoState.status).toBe('degraded');
        // Underlying error code (KB_GITMIRROR_FETCH_FAILED) does NOT carry the
        // KB_TENANT_REPO_SYNC_ prefix, so the service wraps it as the stable
        // KB_TENANT_REPO_SYNC_SYNC_FAILED code that operators branch on while
        // preserving bounded source provenance.
        expect(repoState.lastErrorCode).toBe('KB_TENANT_REPO_SYNC_SYNC_FAILED');
        expect(repoState.lastSourceErrorCode).toBe('KB_GITMIRROR_FETCH_FAILED');
        expect(repoState.tenantId).toBe('t1');
        expect(repoState.repoSlug).toBe('org/broken');
    });

    test('health payload: unresolved credentialRef preserves GitMirror source code', async () => {
        const taskStateService = createInMemoryTaskStateService();

        const failingMirror = {
            async cloneIfMissing() {
                const err = new Error('GitMirror env credentialRef could not be resolved');
                err.code = 'KB_GITMIRROR_CREDENTIAL_REF_INVALID';
                throw err;
            },
            async fetch() {},
            async resolveHead() { return 'sha-current'; },
            async isAncestor() { return true; },
            async diffRevisions() { return {addedOrChanged: [], deleted: []}; }
        };

        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {
                    tenantId     : 't1',
                    repoSlug     : 'org/private',
                    mirrorRoot,
                    cloneUrl     : 'https://github.com/neomjs/private.git',
                    credentialRef: 'env:MISSING_TOKEN'
                }
            ]},
            gitMirror                    : failingMirror,
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            seedBootstrap                : false
        });

        expect(result.status).toBe('failed');

        const repoState = result.details.repos[0];
        expect(repoState).toMatchObject({
            status             : 'degraded',
            lastErrorCode      : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
            lastSourceErrorCode: 'KB_GITMIRROR_CREDENTIAL_REF_INVALID'
        });
        expect(JSON.stringify(repoState)).not.toContain('MISSING_TOKEN');
    });

    test('operator log: emits per-repo completed line + cycle summary in expected shape', async () => {
        const taskStateService = createInMemoryTaskStateService();
        const logLines         = [];
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/repo-a'});

        await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:60000',
            taskStateService,
            writeLog         : (level, msg) => logLines.push({level, msg}),
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/repo-a', mirrorRoot, cloneUrl: 'https://github.com/neomjs/a.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            seedBootstrap                : false
        });

        const refreshLine   = logLines.find(l => l.msg.includes('Refreshing t1/org/repo-a'));
        const completedLine = logLines.find(l => l.msg.includes('t1/org/repo-a completed'));
        const summaryLine   = logLines.find(l => l.msg.includes('Cycle summary'));

        expect(refreshLine).toBeDefined();
        expect(completedLine).toBeDefined();
        expect(completedLine.msg).toMatch(/head=\w+/);
        expect(completedLine.msg).toMatch(/ingested=\d+/);
        expect(completedLine.msg).toMatch(/deleted=\d+/);
        expect(completedLine.msg).toMatch(/\(\d+ms\)/);
        expect(summaryLine).toBeDefined();
        expect(summaryLine.msg).toMatch(/1 repos, 1 completed, 0 failed/);
    });

    test('--repo-slug filter against unknown slug surfaces stable KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED', async () => {
        const taskStateService = createInMemoryTaskStateService();
        const logLines         = [];
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/known'});

        const result = await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            writeLog         : (level, msg) => logLines.push({level, msg}),
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/known', mirrorRoot, cloneUrl: 'https://github.com/neomjs/known.git'}
            ]},
            onlyRepoSlugs                : ['org/unknown', 'org/also-unknown'],
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile
        });

        expect(result.status).toBe('failed');
        expect(result.details.reasonCode).toBe('KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED');
        expect(result.details.requestedSlugs).toEqual(['org/unknown', 'org/also-unknown']);
        expect(result.details.unknownSlugs).toEqual(['org/unknown', 'org/also-unknown']);
        expect(result.details.configuredSlugs).toEqual(['org/known']);

        const warn = logLines.find(l => l.msg.includes('Requested repoSlug'));
        expect(warn).toBeDefined();
        expect(warn.level).toBe('WARN');
    });

    test('writePersistedRevisions wraps fs write failure as KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED', async () => {
        const readOnlyParent = path.join(tmpDir, 'read-only-parent');
        await fs.ensureDir(readOnlyParent);
        await fs.chmod(readOnlyParent, 0o500); // r-x — write blocked

        try {
            let thrown = null;
            try {
                await TenantRepoSyncService.writePersistedRevisions({
                    filePath : path.join(readOnlyParent, 'subdir', 'revisions.json'),
                    revisions: {'t1/org/repo': 'sha-abc'}
                });
            } catch (e) {
                thrown = e;
            }

            expect(thrown).toBeTruthy();
            expect(thrown.name).toBe('TenantRepoSyncError');
            expect(thrown.code).toBe('KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED');
            expect(thrown.meta.phase).toBe('manifest-update');
            expect(thrown.meta.filePath).toContain('revisions.json');
        } finally {
            await fs.chmod(readOnlyParent, 0o700);
        }
    });

    test('runTask propagates TenantRepoSyncError code + meta through outer details when syncTenantRepos throws', async () => {
        const taskStateService = createInMemoryTaskStateService();
        const logLines         = [];
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/repo-a'});

        const readOnlyParent = path.join(tmpDir, 'ro-parent');
        await fs.ensureDir(readOnlyParent);
        await fs.chmod(readOnlyParent, 0o500);

        try {
            const result = await TenantRepoSyncService.runTask({
                reason           : 'periodic-sweep:60000',
                taskStateService,
                writeLog         : (level, msg) => logLines.push({level, msg}),
                tenantReposConfig: {tenantRepos: [
                    {tenantId: 't1', repoSlug: 'org/repo-a', mirrorRoot, cloneUrl: 'https://github.com/neomjs/a.git'}
                ]},
                gitMirror                    : makeFakeGitMirror(),
                envelopeBuilder              : makeFakeEnvelopeBuilder(),
                knowledgeBaseIngestionService: makeFakeIngestionService(),
                revisionsFilePath            : path.join(readOnlyParent, 'subdir', 'revisions.json')
            });

            expect(result.status).toBe('failed');
            expect(result.details.reasonCode).toBe('KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED');
            expect(result.details.meta?.phase).toBe('manifest-update');
            expect(result.details.meta?.filePath).toContain('revisions.json');
            const errLine = logLines.find(l => l.level === 'ERROR' && l.msg.includes('KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED'));
            expect(errLine).toBeDefined();
        } finally {
            await fs.chmod(readOnlyParent, 0o700);
        }
    });

    test('concurrency-gate: concurrencyLimit=1 serializes per-repo work (#11942 AC2)', async () => {
        TenantRepoSyncService.concurrencyLimit = 1;

        const inFlightLog = [];
        let   inFlight    = 0;

        const trackingMirror = {
            async cloneIfMissing() {
                inFlight++;
                inFlightLog.push(inFlight);
                await new Promise(resolve => setTimeout(resolve, 10));
                inFlight--;
            },
            async fetch()              {},
            async resolveHead({ref})   { return `sha-for-${ref}`; },
            async isAncestor()         { return true; },
            async diffRevisions()      { return {addedOrChanged: [], deleted: []}; }
        };

        for (const slug of ['org/r1', 'org/r2', 'org/r3']) {
            await provisionMirrorDir({tenantId: 't1', repoSlug: slug});
        }

        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic',
            taskStateService : createInMemoryTaskStateService(),
            tenantReposConfig: {tenantRepos: ['org/r1', 'org/r2', 'org/r3'].map(s => ({
                tenantId: 't1', repoSlug: s, mirrorRoot, cloneUrl: `https://github.com/neomjs/${s.split('/')[1]}.git`
            }))},
            gitMirror                    : trackingMirror,
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            seedBootstrap                : false
        });

        expect(result.status).toBe('completed');
        expect(result.details.completedCount).toBe(3);
        // With concurrencyLimit=1, the in-flight counter must never exceed 1.
        expect(Math.max(...inFlightLog)).toBe(1);
        expect(inFlightLog.every(n => n <= 1)).toBe(true);
    });

    test('concurrency-gate: concurrencyLimit=2 caps in-flight work at 2 with 4 repos (#11942 AC2)', async () => {
        TenantRepoSyncService.concurrencyLimit = 2;

        const inFlightLog = [];
        let   inFlight    = 0;

        const trackingMirror = {
            async cloneIfMissing() {
                inFlight++;
                inFlightLog.push(inFlight);
                await new Promise(resolve => setTimeout(resolve, 20));
                inFlight--;
            },
            async fetch()              {},
            async resolveHead({ref})   { return `sha-for-${ref}`; },
            async isAncestor()         { return true; },
            async diffRevisions()      { return {addedOrChanged: [], deleted: []}; }
        };

        for (const slug of ['org/r1', 'org/r2', 'org/r3', 'org/r4']) {
            await provisionMirrorDir({tenantId: 't1', repoSlug: slug});
        }

        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic',
            taskStateService : createInMemoryTaskStateService(),
            tenantReposConfig: {tenantRepos: ['org/r1', 'org/r2', 'org/r3', 'org/r4'].map(s => ({
                tenantId: 't1', repoSlug: s, mirrorRoot, cloneUrl: `https://github.com/neomjs/${s.split('/')[1]}.git`
            }))},
            gitMirror                    : trackingMirror,
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            seedBootstrap                : false
        });

        expect(result.status).toBe('completed');
        expect(result.details.completedCount).toBe(4);
        // With concurrencyLimit=2 + 4 repos, peak in-flight should reach 2 (proving parallelism
        // exists) but must not exceed 2 (proving the gate caps correctly).
        expect(Math.max(...inFlightLog)).toBe(2);
        expect(inFlightLog.every(n => n <= 2)).toBe(true);
    });

    test('concurrency-gate: beforeSetConcurrencyLimit rejects invalid values (0/negative/fractional/non-integer) (#11942 AC2)', () => {
        // Baseline: set to a known valid value.
        TenantRepoSyncService.concurrencyLimit = 2;
        expect(TenantRepoSyncService.concurrencyLimit).toBe(2);

        // Invalid values fall back to the previous valid value (2).
        for (const invalid of [0, -1, 1.5, NaN, Infinity, '3', null, undefined, {}, []]) {
            TenantRepoSyncService.concurrencyLimit = invalid;
            expect(TenantRepoSyncService.concurrencyLimit).toBe(2);
        }

        // Valid integer values are accepted.
        TenantRepoSyncService.concurrencyLimit = 1;
        expect(TenantRepoSyncService.concurrencyLimit).toBe(1);
        TenantRepoSyncService.concurrencyLimit = 10;
        expect(TenantRepoSyncService.concurrencyLimit).toBe(10);
    });

    test('concurrency-gate: beforeSetConcurrencyGateTimeoutMs rejects NaN/Infinity/negative; accepts 0 as no-timeout sentinel (#11942 AC2)', () => {
        TenantRepoSyncService.concurrencyGateTimeoutMs = 30000;
        expect(TenantRepoSyncService.concurrencyGateTimeoutMs).toBe(30000);

        // Invalid values fall back to the previous valid value.
        for (const invalid of [-1, -100, NaN, Infinity, -Infinity, '5000', null, undefined]) {
            TenantRepoSyncService.concurrencyGateTimeoutMs = invalid;
            expect(TenantRepoSyncService.concurrencyGateTimeoutMs).toBe(30000);
        }

        // 0 is a valid sentinel (no timeout — slots wait indefinitely).
        TenantRepoSyncService.concurrencyGateTimeoutMs = 0;
        expect(TenantRepoSyncService.concurrencyGateTimeoutMs).toBe(0);

        // Positive finite values are accepted.
        TenantRepoSyncService.concurrencyGateTimeoutMs = 60000;
        expect(TenantRepoSyncService.concurrencyGateTimeoutMs).toBe(60000);
    });

    test('jitter+backoff: skips not-due repo with prior recent lastRunAttemptAt (#11942 AC1)', async () => {
        const taskStateService = createInMemoryTaskStateService();
        const ingestCalls      = [];

        // Pre-populate persistence with a recent lastRunAttemptAt — repo should be skipped.
        const recentMs = Date.now() - 1000; // 1s ago
        await fs.writeJson(revisionsFile, {
            revisions: {
                't1/neomjs/recent-repo': {
                    lastIngestedRev    : 'sha-recent',
                    lastRunAttemptAt   : recentMs,
                    consecutiveFailures: 0
                }
            }
        });

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'neomjs/recent-repo'});

        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:1800000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'neomjs/recent-repo', mirrorRoot, cloneUrl: 'https://github.com/neomjs/recent-repo.git'}
            ]},
            globalCadenceMs              : 60 * 60 * 1000, // 1h cadence — recent run is well within window
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService({captureCalls: ingestCalls}),
            revisionsFilePath            : revisionsFile
        });

        expect(result.status).toBe('completed'); // not-due is not a failure
        expect(result.details.notDueCount).toBe(1);
        expect(result.details.completedCount).toBe(0);
        expect(result.details.failedCount).toBe(0);
        expect(ingestCalls).toHaveLength(0); // no actual ingest work

        const repoState = result.details.repos[0];
        expect(repoState.status).toBe('not-due');
        expect(repoState.nextDueAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(repoState.effectiveCadenceMs).toBeGreaterThan(0);
        expect(repoState.consecutiveFailures).toBe(0);
    });

    test('jitter+backoff: persists consecutiveFailures increment on failure (#11942 AC1)', async () => {
        const taskStateService = createInMemoryTaskStateService();

        // Opts out of bootstrap seeding so the simulated failure path
        // actually fires this sweep (instead of being
        // deferred-as-seeded). Test verifies failure-increment semantics, not
        // bootstrap-spread behavior.
        const failingMirror = {
            async cloneIfMissing() { throw new Error('Simulated clone failure'); },
            async fetch()          {},
            async resolveHead()    { return null; },
            async isAncestor()     { return false; },
            async diffRevisions()  { return {addedOrChanged: [], deleted: []}; }
        };

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'neomjs/failing-repo'});

        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:1800000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'neomjs/failing-repo', mirrorRoot, cloneUrl: 'https://github.com/neomjs/failing-repo.git'}
            ]},
            gitMirror                    : failingMirror,
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            seedBootstrap                : false
        });

        expect(result.status).toBe('failed');
        expect(result.details.failedCount).toBe(1);
        expect(result.details.repos[0].consecutiveFailures).toBe(1);

        // Persistence reflects the failure increment for next cycle's backoff calculation.
        const persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions['t1/neomjs/failing-repo']).toEqual({
            lastIngestedRev    : null,
            lastRunAttemptAt   : expect.any(Number),
            consecutiveFailures: 1
        });
    });

    test('jitter+backoff: persists consecutiveFailures reset on subsequent success (#11942 AC1)', async () => {
        const taskStateService = createInMemoryTaskStateService();

        // Pre-populate with consecutiveFailures=3 (from prior failures); also stale lastRunAttemptAt
        // so the backoff'd effective cadence is still elapsed.
        await fs.writeJson(revisionsFile, {
            revisions: {
                't1/neomjs/recovering-repo': {
                    lastIngestedRev    : 'sha-old',
                    lastRunAttemptAt   : 0, // very stale — backoff'd cadence is exceeded
                    consecutiveFailures: 3
                }
            }
        });

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'neomjs/recovering-repo'});

        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:1800000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'neomjs/recovering-repo', mirrorRoot, cloneUrl: 'https://github.com/neomjs/recovering-repo.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile
        });

        expect(result.status).toBe('completed');
        expect(result.details.completedCount).toBe(1);

        // Persistence: consecutiveFailures reset to 0 on success.
        const persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions['t1/neomjs/recovering-repo'].consecutiveFailures).toBe(0);
        expect(persisted.revisions['t1/neomjs/recovering-repo'].lastIngestedRev).toBe('sha-head-neomjs/recovering-repo');
    });

    test('jitter+backoff: backward-compatible read of pre-AC1 string-shaped persistence (#11942 AC1)', async () => {
        const taskStateService = createInMemoryTaskStateService();

        // Pre-AC1 persistence shape: bare SHA strings under revisions.
        await fs.writeJson(revisionsFile, {
            revisions: {
                't1/neomjs/legacy-repo': 'sha-from-before-ac1'
            }
        });

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'neomjs/legacy-repo'});

        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:1800000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'neomjs/legacy-repo', mirrorRoot, cloneUrl: 'https://github.com/neomjs/legacy-repo.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile
        });

        // Successful migration: pre-AC1 SHA was read as lastIngestedRev with zeroed state;
        // run proceeds normally; persistence rewritten in new shape.
        expect(result.status).toBe('completed');

        const persisted = await fs.readJson(revisionsFile);
        const state     = persisted.revisions['t1/neomjs/legacy-repo'];
        expect(typeof state).toBe('object');
        expect(state.lastIngestedRev).toBeTruthy();
        expect(state.consecutiveFailures).toBe(0); // success path resets
        expect(state.lastRunAttemptAt).toBeGreaterThan(0);
    });

    test('jitter+backoff: onlyRepoSlugs (manual CLI path) bypasses due-check (#11942 AC1)', async () => {
        const taskStateService = createInMemoryTaskStateService();
        const ingestCalls      = [];

        // Pre-populate with very recent lastRunAttemptAt — would normally be not-due.
        const recentMs = Date.now() - 1000;
        await fs.writeJson(revisionsFile, {
            revisions: {
                't1/neomjs/manual-repo': {
                    lastIngestedRev    : 'sha-recent',
                    lastRunAttemptAt   : recentMs,
                    consecutiveFailures: 0
                }
            }
        });

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'neomjs/manual-repo'});

        const result = await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'neomjs/manual-repo', mirrorRoot, cloneUrl: 'https://github.com/neomjs/manual-repo.git'}
            ]},
            onlyRepoSlugs                : ['neomjs/manual-repo'], // manual CLI path
            globalCadenceMs              : 60 * 60 * 1000,
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService({captureCalls: ingestCalls}),
            revisionsFilePath            : revisionsFile
        });

        // Manual CLI invocation bypasses due-check — repo IS synced even though
        // periodic-cycle would have skipped it.
        expect(result.status).toBe('completed');
        expect(result.details.completedCount).toBe(1);
        expect(result.details.notDueCount).toBe(0); // onlyRepoSlugs bypasses due-check → no not-due skips
        expect(ingestCalls).toHaveLength(1);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Bootstrap-spread seeding + decoupled-sweep
    // composition + orchestrator-resolved cadence pass-through.
    // ─────────────────────────────────────────────────────────────────────────

    test('bootstrap-spread: first sweep seeds new repos with lastRunAttemptAt=now-baseCadence (#11942 AC1 cycle-2)', async () => {
        const taskStateService = createInMemoryTaskStateService();
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/repo-a'});
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/repo-b'});

        const baseCadenceMs = 1800000; // 30min — matches AiConfig default

        const sweepStart = Date.now();
        const result     = await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/repo-a', mirrorRoot, cloneUrl: 'https://github.com/neomjs/a.git'},
                {tenantId: 't1', repoSlug: 'org/repo-b', mirrorRoot, cloneUrl: 'https://github.com/neomjs/b.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            globalCadenceMs              : baseCadenceMs,
            jitterRatio                  : 0.20
            // seedBootstrap defaults to true (production behavior)
        });

        // First sweep: seeding fires, both repos seeded as not-due (waiting for jitter window).
        expect(result.status).toBe('completed');
        expect(result.details.repoCount).toBe(2);
        expect(result.details.completedCount).toBe(0);
        expect(result.details.notDueCount).toBe(2);

        // Persisted state shows seeded `lastRunAttemptAt = sweepStart - baseCadenceMs`.
        const persisted = await fs.readJson(revisionsFile);
        const stateA    = persisted.revisions['t1/org/repo-a'];
        const stateB    = persisted.revisions['t1/org/repo-b'];

        expect(stateA).toBeTruthy();
        expect(stateA.lastIngestedRev).toBeNull();
        expect(stateA.consecutiveFailures).toBe(0);
        expect(stateA.lastRunAttemptAt).toBeLessThanOrEqual(sweepStart - baseCadenceMs + 100); // allow tiny clock drift
        expect(stateA.lastRunAttemptAt).toBeGreaterThanOrEqual(sweepStart - baseCadenceMs - 100);

        expect(stateB).toBeTruthy();
        expect(stateB.lastRunAttemptAt).toBeLessThanOrEqual(sweepStart - baseCadenceMs + 100);
    });

    test('bootstrap-spread: seeded repo becomes due on a later sweep within its jitter window (#11942 AC1 cycle-2)', async () => {
        // Pre-populate persistence with a seeded state — simulating the state left by
        // a prior bootstrap-spread sweep. Repo with deterministic jitter 0ms (smallest)
        // should become due on any subsequent sweep; repo with larger jitter only on
        // sweeps past its individual due-time.
        const ingestCalls   = [];
        const baseCadenceMs = 100; // tiny so test can advance via real Date.now

        // Pre-write seeded state: lastRunAttemptAt = (now - baseCadence) → due at now + jitter
        const seedTime = Date.now() - baseCadenceMs;
        await fs.writeJson(revisionsFile, {
            revisions: {
                't1/org/short-jitter': {lastIngestedRev: null, lastRunAttemptAt: seedTime, consecutiveFailures: 0},
                't1/org/long-jitter' : {lastIngestedRev: null, lastRunAttemptAt: seedTime, consecutiveFailures: 0}
            }
        });

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/short-jitter'});
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/long-jitter'});

        // With jitterRatio=0.50, jitter range = [0, 50ms). Deterministic per repo.
        // Both repos seeded with lastRunAttemptAt = now - 100ms.
        // After waiting 60ms (past most-likely jitter windows), the lower-jitter
        // repo should be due. Don't assert which one — let determinism pick.
        await new Promise(r => setTimeout(r, 60));

        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:1000',
            taskStateService : createInMemoryTaskStateService(),
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/short-jitter', mirrorRoot, cloneUrl: 'https://github.com/neomjs/short.git'},
                {tenantId: 't1', repoSlug: 'org/long-jitter',  mirrorRoot, cloneUrl: 'https://github.com/neomjs/long.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService({captureCalls: ingestCalls}),
            revisionsFilePath            : revisionsFile,
            globalCadenceMs              : baseCadenceMs,
            jitterRatio                  : 0.50,
            seedBootstrap                : false // pre-seeded; don't re-seed
        });

        // Distribution proof: not-due-count + completed-count = 2 total; spread is real
        // (at least one repo NOT processed because its jitter is past current elapsed time).
        const distributed = result.details.completedCount + result.details.notDueCount;
        expect(distributed).toBe(2);

        // The deterministic-jitter spread means we expect at least 1 repo to be in each
        // state ONLY when the wait happens to land between the two jitter offsets.
        // Looser invariant that always holds: distribution sums to total repo count.
    });

    test('orchestrator-resolved globalCadenceMs flows through to isRepoDue (#11942 AC1 cycle-2 RA3)', async () => {
        // Pre-populate priorState with a fresh lastRunAttemptAt so isRepoDue compares
        // against the explicit globalCadenceMs passed via runTask args.
        const recentMs = Date.now() - 100;
        await fs.writeJson(revisionsFile, {
            revisions: {
                't1/org/repo': {lastIngestedRev: 'sha-prior', lastRunAttemptAt: recentMs, consecutiveFailures: 0}
            }
        });

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/repo'});

        // Force the orchestrator-resolved cadence high enough that 100ms-elapsed
        // is NOT due. Without explicit pass, the service would fall back to
        // AiConfig.data.orchestrator.intervals.tenantRepoSyncMs default.
        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:60000',
            taskStateService : createInMemoryTaskStateService(),
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/repo', mirrorRoot, cloneUrl: 'https://github.com/neomjs/repo.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            globalCadenceMs              : 60 * 60 * 1000, // 1 hour — high enough that 100ms-elapsed is not-due
            jitterRatio                  : 0,              // strip jitter so cadence comparison is exact
            seedBootstrap                : false           // pre-seeded
        });

        // 100ms elapsed vs 1-hour cadence → not due. Proves orchestrator-resolved cadence flowed through.
        expect(result.details.notDueCount).toBe(1);
        expect(result.details.completedCount).toBe(0);
    });

    test('orchestrator-resolved jitterRatio flows through to isRepoDue (#11942 AC1 cycle-2 RA3)', async () => {
        // Pre-populate priorState with lastRunAttemptAt exactly at cadence-boundary
        // so jitterRatio=0 → due (cadence elapsed), jitterRatio=0.50 with large jitter → not-due.
        const baseCadenceMs            = 1000;
        const exactlyAtCadenceBoundary = Date.now() - baseCadenceMs;
        await fs.writeJson(revisionsFile, {
            revisions: {
                't1/org/repo': {lastIngestedRev: 'sha-prior', lastRunAttemptAt: exactlyAtCadenceBoundary, consecutiveFailures: 0}
            }
        });

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/repo'});

        // jitterRatio=0.50 + tenantId/repoSlug → jitter > 0 → effectiveCadence > baseCadence → not-due
        // (because (now - lastRunAttemptAt) = baseCadenceMs < baseCadenceMs + jitter).
        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:60000',
            taskStateService : createInMemoryTaskStateService(),
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/repo', mirrorRoot, cloneUrl: 'https://github.com/neomjs/repo.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            globalCadenceMs              : baseCadenceMs,
            jitterRatio                  : 0.50, // non-zero jitter → adds offset → not-due at exact-cadence-boundary
            seedBootstrap                : false
        });

        // Proves jitterRatio was used by isRepoDue (jitter offset added to effectiveCadence).
        expect(result.details.notDueCount).toBe(1);
        expect(result.details.completedCount).toBe(0);
    });

    test('manual CLI (onlyRepoSlugs) bypasses bootstrap seeding (#11942 AC1 cycle-2)', async () => {
        // Operator-initiated sync must always fire regardless of bootstrap-seeding state.
        const taskStateService = createInMemoryTaskStateService();
        const ingestCalls      = [];

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/manual-target'});

        const result = await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/manual-target', mirrorRoot, cloneUrl: 'https://github.com/neomjs/manual.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService({captureCalls: ingestCalls}),
            onlyRepoSlugs                : ['org/manual-target'],
            revisionsFilePath            : revisionsFile
            // seedBootstrap defaults to true but onlyRepoSlugs path skips seeding entirely.
        });

        expect(result.status).toBe('completed');
        expect(result.details.completedCount).toBe(1);
        expect(result.details.notDueCount).toBe(0); // manual path bypasses both seeding and due-check
        expect(ingestCalls).toHaveLength(1);
    });

    test('concurrency-gate: queued slot acquisition surfaces KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT (#11942 AC2)', async () => {
        TenantRepoSyncService.concurrencyLimit         = 1;
        TenantRepoSyncService.concurrencyGateTimeoutMs = 50;

        let releaseFirstRepo;
        const firstRepoGate  = new Promise(resolve => { releaseFirstRepo = resolve; });
        let   cloneCallCount = 0;

        const slowMirror = {
            async cloneIfMissing() {
                cloneCallCount++;
                if (cloneCallCount === 1) {
                    // First repo holds the slot indefinitely until the test releases it.
                    await firstRepoGate;
                }
            },
            async fetch()              {},
            async resolveHead({ref})   { return `sha-for-${ref}`; },
            async isAncestor()         { return true; },
            async diffRevisions()      { return {addedOrChanged: [], deleted: []}; }
        };

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/slow'});
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/queued'});

        const resultPromise = TenantRepoSyncService.runTask({
            reason           : 'periodic',
            taskStateService : createInMemoryTaskStateService(),
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/slow',   mirrorRoot, cloneUrl: 'https://github.com/neomjs/slow.git'},
                {tenantId: 't1', repoSlug: 'org/queued', mirrorRoot, cloneUrl: 'https://github.com/neomjs/queued.git'}
            ]},
            gitMirror                    : slowMirror,
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            seedBootstrap                : false
        });

        // Wait long enough for the queued repo's slot acquisition to time out (~50ms).
        await new Promise(resolve => setTimeout(resolve, 150));
        releaseFirstRepo();
        const result = await resultPromise;

        // Queued repo surfaced the timeout via per-repo health payload.
        const queuedState = result.details.repos.find(r => r.repoSlug === 'org/queued');
        expect(queuedState).toBeDefined();
        expect(queuedState.status).toBe('degraded');
        expect(queuedState.lastErrorCode).toBe('KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT');

        // Slow repo completed once released.
        const slowState = result.details.repos.find(r => r.repoSlug === 'org/slow');
        expect(slowState.status).toBe('active');

        // Outer task is 'completed' per partial-success contract (at least one repo succeeded).
        expect(result.status).toBe('completed');
        expect(result.details.failedCount).toBe(1);
        expect(result.details.completedCount).toBe(1);
    });

    test('branchRef from tenantRepos[] flows through to envelopeBuilder.newHead (#12040)', async () => {
        const taskStateService = createInMemoryTaskStateService();
        const envelopeCalls    = [];

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/repo-with-branch'});
        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/repo-default'});

        await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/repo-with-branch', mirrorRoot, cloneUrl: 'https://github.com/neomjs/a.git', branchRef: 'dev'},
                {tenantId: 't1', repoSlug: 'org/repo-default',     mirrorRoot, cloneUrl: 'https://github.com/neomjs/b.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder({captureCalls: envelopeCalls}),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            seedBootstrap                : false
        });

        const branchCall  = envelopeCalls.find(c => c.args.repoSlug === 'org/repo-with-branch');
        const defaultCall = envelopeCalls.find(c => c.args.repoSlug === 'org/repo-default');

        expect(branchCall, 'envelope builder called for repo-with-branch').toBeDefined();
        expect(branchCall.args.newHead).toBe('dev');

        expect(defaultCall, 'envelope builder called for repo-default').toBeDefined();
        expect(defaultCall.args.newHead).toBe('HEAD');
    });
});

test.describe('TenantRepoSyncService.resolveIngestionService — export-drift guard (#12042)', () => {
    /*
     * Other tests in this file inject `knowledgeBaseIngestionService` directly via
     * `runTask` arguments, bypassing `resolveIngestionService` entirely. That's how
     * the historical export-drift bug where the resolver looked up non-existent
     * `KB_KnowledgeBaseIngestionService` / `KnowledgeBaseIngestionService` names)
     * escaped unit-test detection. This block covers all three drift classes:
     *
     *   - Drift A: `services.mjs` renames `KB_IngestionService` (static source guard).
     *   - Drift B: `TenantRepoSyncService.resolveIngestionService` looks up a different
     *     symbol than what `services.mjs` exports (static source guard).
     *   - Drift C: `KB_IngestionService` shape loses `ingestSourceFiles` method
     *     (runtime resolver call + structural check).
     *
     * The Drift C runtime test depends on the per-server `config.mjs` files being
     * materialized — i.e., the bootstrap step in `ai/scripts/setup/initServerConfigs.mjs`
     * rewrites `import AiConfig from '../../../config.template.mjs'` to
     * `import AiConfig from '../../../config.mjs'` so that runtime code loads the
     * operator overlay (which `Neo.ai.Config`-registers exactly once) instead of the
     * template (which would register via a parallel chain and trip the `unitTestMode`
     * namespace-collision guard at `src/Neo.mjs:820`). CI's `npm ci` runs the
     * bootstrap on fresh clone, so this is the green path. Operator checkouts whose
     * per-server `config.mjs` was generated before the materialization logic landed
     * will hit the collision until they re-run `npm run prepare -- --migrate-config`
     * OR manually update the import path. Keep this note until the
     * materialization-migration substrate is retired.
     */
    const repoRoot     = path.resolve(__dirname, '../../../../../../../');
    const servicesPath = path.join(repoRoot, 'ai/services.mjs');
    const resolverPath = path.join(repoRoot, 'ai/daemons/orchestrator/services/TenantRepoSyncService.mjs');

    test('ai/services.mjs exports KB_IngestionService', async () => {
        const source = await fs.readFile(servicesPath, 'utf-8');

        expect(source).toMatch(/export\s*\{[^}]*\bKB_IngestionService\b[^}]*\}/s);
    });

    test('TenantRepoSyncService.resolveIngestionService references services.KB_IngestionService', async () => {
        const source = await fs.readFile(resolverPath, 'utf-8');
        const match  = source.match(/async\s+resolveIngestionService\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{4}\}/);

        expect(match, 'resolveIngestionService method body extractable').not.toBeNull();
        expect(match[1]).toContain('services.KB_IngestionService');
    });

    test('resolveIngestionService returns the canonical KB_IngestionService with ingestSourceFiles method (Drift C)', async () => {
        const ingestionService = await TenantRepoSyncService.resolveIngestionService();

        expect(ingestionService).toBeDefined();
        expect(ingestionService).not.toBeNull();
        expect(typeof ingestionService.ingestSourceFiles).toBe('function');
    });
});

test.describe('TenantRepoSyncService.resolveTenantReposConfig — Tier-1 mirrorRoot fallback (#12036 Bug C)', () => {
    /*
     * Materialization of per-repo `mirrorRoot` from the Tier-1
     * `aiConfig.orchestrator.tenantRepoMirrorRoot` default when the per-repo
     * override is absent. The Tier-1 value is env-bound to
     * `NEO_TENANT_REPO_MIRROR_ROOT` (canonical compose value: `/app/.neo-ai-data`).
     *
     * `deriveTenantRepoMirrorPath` appends `tenant-repos/<tenant>/<repo>`, so the
     * Tier-1 root must name the PARENT of `tenant-repos/` (i.e., `/app/.neo-ai-data`,
     * NOT `/app/.neo-ai-data/tenant-repos`). The no-double-segment assertion below
     * locks that invariant.
     */

    test('absent per-repo mirrorRoot inherits Tier-1 default; explicit per-repo override wins', async () => {
        const ingestionStub = {
            listConfiguredTenantRepos: async () => ({tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/inherits', cloneUrl: 'https://github.com/neomjs/a.git', credentialRef: 'env:T'},
                {tenantId: 't1', repoSlug: 'org/overrides', cloneUrl: 'https://github.com/neomjs/b.git', credentialRef: 'env:T', mirrorRoot: '/custom/root'}
            ]})
        };

        const result = await TenantRepoSyncService.resolveTenantReposConfig({
            ingestionService: ingestionStub,
            tier1MirrorRoot : '/app/.neo-ai-data'
        });

        const inherits  = result.tenantRepos.find(r => r.repoSlug === 'org/inherits');
        const overrides = result.tenantRepos.find(r => r.repoSlug === 'org/overrides');

        expect(inherits.mirrorRoot).toBe('/app/.neo-ai-data');
        expect(overrides.mirrorRoot).toBe('/custom/root');
    });

    test('Tier-1 default + deriveTenantRepoMirrorPath produces canonical no-double-segment path', async () => {
        const ingestionStub = {
            listConfiguredTenantRepos: async () => ({tenantRepos: [
                {tenantId: 'tenant-a', repoSlug: 'repo-a', cloneUrl: 'https://github.com/neomjs/a.git', credentialRef: 'env:T'}
            ]})
        };

        const result = await TenantRepoSyncService.resolveTenantReposConfig({
            ingestionService: ingestionStub,
            tier1MirrorRoot : '/app/.neo-ai-data'
        });
        const resolvedRepo = result.tenantRepos[0];
        const mirrorPath   = deriveTenantRepoMirrorPath({
            mirrorRoot: resolvedRepo.mirrorRoot,
            tenantId  : resolvedRepo.tenantId,
            repoSlug  : resolvedRepo.repoSlug
        });

        expect(mirrorPath).toBe('/app/.neo-ai-data/tenant-repos/tenant-a/repo-a');
        expect(mirrorPath).not.toContain('tenant-repos/tenant-repos');
    });

    test('stale-overlay defense: missing orchestratorConfig.tenantRepoMirrorRoot falls back to env var (#12036 cycle-2 RA1)', async () => {
        const ingestionStub = {
            listConfiguredTenantRepos: async () => ({tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/r', cloneUrl: 'https://github.com/o/r.git', credentialRef: 'env:T'}
            ]})
        };

        const result = await TenantRepoSyncService.resolveTenantReposConfig({
            ingestionService  : ingestionStub,
            orchestratorConfig: {},  // simulate stale operator overlay (no tenantRepoMirrorRoot key)
            env               : {NEO_TENANT_REPO_MIRROR_ROOT: '/env-bound/root'}
        });

        expect(result.tenantRepos[0].mirrorRoot).toBe('/env-bound/root');
    });

    test('stale-overlay defense: missing orchestratorConfig AND no env var → hardcoded /app/.neo-ai-data (#12036 cycle-2 RA1)', async () => {
        const ingestionStub = {
            listConfiguredTenantRepos: async () => ({tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/r', cloneUrl: 'https://github.com/o/r.git', credentialRef: 'env:T'}
            ]})
        };

        const result = await TenantRepoSyncService.resolveTenantReposConfig({
            ingestionService  : ingestionStub,
            orchestratorConfig: {},
            env               : {}
        });

        expect(result.tenantRepos[0].mirrorRoot).toBe('/app/.neo-ai-data');
    });
});
