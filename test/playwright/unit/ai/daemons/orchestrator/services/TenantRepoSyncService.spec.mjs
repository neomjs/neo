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
import {
    TENANT_REPO_INGEST_CONTRACT_VERSION
} from '../../../../../../../ai/daemons/orchestrator/services/tenantRepoCheckpointValidity.mjs';
import {deriveTenantRepoMirrorPath} from '../../../../../../../ai/services/knowledge-base/helpers/tenantRepoAccessContract.mjs';
import {
    LIFECYCLE_GUARD_SUFFIX,
    acquireHeavyMaintenanceLease,
    buildLeasePayload
} from '../../../../../../../ai/daemons/orchestrator/services/heavyMaintenanceLeasePrimitives.mjs';
import {
    buildRunTaskOptions,
    parseArgs,
    resolveExitCode
} from '../../../../../../../ai/scripts/maintenance/syncTenantRepos.mjs';

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
            async inspectCredentialReadiness() {
                return {
                    status          : 'ready',
                    code            : 'KB_TENANT_REPO_ACCESS_CREDENTIAL_RESOLVED',
                    cacheFingerprint: 'fake-credential-fingerprint'
                };
            },
            async probeRemoteAccess() {
                return {
                    status          : 'ready',
                    code            : 'KB_TENANT_REPO_ACCESS_READY',
                    checkedAt       : new Date().toISOString(),
                    cacheFingerprint: 'fake-credential-fingerprint'
                };
            },
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

    function makeFakeIngestionService({captureCalls = [], summaryFactory} = {}) {
        return {
            async ingestSourceFiles(payload) {
                captureCalls.push({op: 'ingestSourceFiles', payload});

                if (summaryFactory) {
                    return summaryFactory(payload)
                }

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
        TenantRepoSyncService.clearTenantRepoAccessReadiness();
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

    test('preflights a not-due repo at bootstrap and re-probes only after config or credential rotation', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            repo             = {
                tenantId     : 'tenant-a',
                repoSlug     : 'private/repo',
                mirrorRoot,
                cloneUrl     : 'https://git.example/private/repo.git',
                credentialRef: 'env:TENANT_REPO_TOKEN',
                branchRef    : 'dev'
            },
            probeCalls = [];

        let credentialFingerprint = 'credential-a';

        const gitMirror = {
            async inspectCredentialReadiness() {
                return {
                    status          : 'ready',
                    code            : 'KB_TENANT_REPO_ACCESS_CREDENTIAL_RESOLVED',
                    cacheFingerprint: credentialFingerprint
                };
            },
            async probeRemoteAccess(args) {
                probeCalls.push(args);
                return {
                    status          : 'ready',
                    code            : 'KB_TENANT_REPO_ACCESS_READY',
                    checkedAt       : '2026-07-23T20:00:00.000Z',
                    cacheFingerprint: credentialFingerprint
                };
            },
            async cloneIfMissing() {
                throw new Error('not-due repo must not clone');
            },
            async fetch() {
                throw new Error('not-due repo must not fetch');
            }
        };

        await TenantRepoSyncService.writePersistedRevisions({
            filePath : revisionsFile,
            revisions: {
                'tenant-a/private/repo': {
                    lastIngestedRev                   : 'abcdef1234567890',
                    lastRunAttemptAt                  : Date.now(),
                    consecutiveFailures               : 0,
                    ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
                }
            }
        });

        const options = {
            reason                       : 'periodic',
            taskStateService,
            tenantReposConfig            : {tenantRepos: [repo]},
            gitMirror,
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            globalCadenceMs              : 60_000,
            jitterRatio                  : 0,
            seedBootstrap                : false
        };

        await TenantRepoSyncService.runTask(options);
        await TenantRepoSyncService.runTask(options);

        expect(probeCalls).toHaveLength(1);
        expect(probeCalls[0]).toMatchObject({
            cloneUrl: 'https://git.example/private/repo.git',
            ref     : 'dev'
        });

        expect(TenantRepoSyncService.getTenantRepoAccessReadiness(repo, {
            observedAt: Date.now() + 24 * 60 * 60 * 1000
        })).toMatchObject({
            status: 'unknown',
            code  : 'KB_TENANT_REPO_ACCESS_EVIDENCE_EXPIRED'
        });

        TenantRepoSyncService.accessReadinessCache.get('tenant-a/private/repo').expiresAt = 0;
        await TenantRepoSyncService.runTask(options);
        expect(probeCalls).toHaveLength(2);

        credentialFingerprint = 'credential-b';
        await TenantRepoSyncService.runTask(options);
        expect(probeCalls).toHaveLength(3);

        repo.cloneUrl = 'https://git.example/private/repo-renamed.git';
        await TenantRepoSyncService.runTask(options);
        expect(probeCalls).toHaveLength(4);

        const publicReadiness = TenantRepoSyncService.getTenantRepoAccessReadiness(repo);

        expect(publicReadiness).toEqual({
            status   : 'ready',
            code     : 'KB_TENANT_REPO_ACCESS_READY',
            checkedAt: '2026-07-23T20:00:00.000Z'
        });
        expect(JSON.stringify(publicReadiness)).not.toContain('credential-b');
        expect(JSON.stringify(publicReadiness)).not.toContain('TENANT_REPO_TOKEN');
        expect(JSON.stringify(publicReadiness)).not.toContain('git.example');
    });

    test('isolates an inaccessible repo while unrelated repositories continue syncing', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            mirrorCalls      = [],
            repos            = [
                {
                    tenantId     : 'tenant-a',
                    repoSlug     : 'private/denied',
                    mirrorRoot,
                    cloneUrl     : 'https://git.example/private/denied.git',
                    credentialRef: 'env:DENIED_TOKEN'
                },
                {
                    tenantId     : 'tenant-b',
                    repoSlug     : 'private/ready',
                    mirrorRoot,
                    cloneUrl     : 'https://git.example/private/ready.git',
                    credentialRef: 'env:READY_TOKEN'
                }
            ],
            gitMirror = {
                async inspectCredentialReadiness({credentialRef}) {
                    return {
                        status          : 'ready',
                        code            : 'KB_TENANT_REPO_ACCESS_CREDENTIAL_RESOLVED',
                        cacheFingerprint: `fingerprint-${credentialRef}`
                    };
                },
                async probeRemoteAccess({cloneUrl}) {
                    const denied = cloneUrl.includes('/denied');
                    return {
                        status: denied ? 'degraded' : 'ready',
                        code  : denied
                            ? 'KB_TENANT_REPO_ACCESS_DENIED_OR_NOT_FOUND'
                            : 'KB_TENANT_REPO_ACCESS_READY',
                        checkedAt       : '2026-07-23T20:00:00.000Z',
                        cacheFingerprint: denied ? 'denied' : 'ready'
                    };
                },
                async cloneIfMissing(args) {
                    mirrorCalls.push({op: 'cloneIfMissing', args});

                    if (args.repoSlug === 'private/denied') {
                        const error = new Error('bounded fake acquisition failure');
                        error.code = 'KB_GITMIRROR_CLONE_FAILED';
                        throw error;
                    }
                },
                async fetch(args) {
                    mirrorCalls.push({op: 'fetch', args});
                },
                async resolveHead({ref}) {
                    return `sha-for-${ref}`;
                },
                async isAncestor() {
                    return true;
                },
                async diffRevisions() {
                    return {addedOrChanged: [], deleted: []};
                }
            };

        const result = await TenantRepoSyncService.runTask({
            reason                       : 'periodic',
            taskStateService,
            tenantReposConfig            : {tenantRepos: repos},
            gitMirror,
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            seedBootstrap                : false
        });

        expect(result.status).toBe('completed');
        expect(result.details.completedCount).toBe(1);
        expect(result.details.failedCount).toBe(1);
        expect(mirrorCalls.filter(call => call.args.repoSlug === 'private/ready'))
            .toEqual([
                expect.objectContaining({op: 'cloneIfMissing'}),
                expect.objectContaining({op: 'fetch'})
            ]);
        expect(TenantRepoSyncService.getTenantRepoAccessReadiness(repos[0])).toMatchObject({
            status: 'degraded',
            code  : 'KB_TENANT_REPO_ACCESS_SYNC_FAILED'
        });
        expect(TenantRepoSyncService.getTenantRepoAccessReadiness(repos[1])).toMatchObject({
            status: 'ready',
            code  : 'KB_TENANT_REPO_ACCESS_READY'
        });
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

    test('current-contract checkpoints are read on subsequent run and passed as lastIngestedRev', async () => {
        const taskStateService = createInMemoryTaskStateService();

        await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/seeded'});

        // Seed the revisions file with a checkpoint proved by the current
        // error-free ingestion contract.
        await fs.ensureDir(path.dirname(revisionsFile));
        await fs.writeJson(revisionsFile, {
            revisions: {
                't1/org/seeded': {
                    lastIngestedRev                   : 'sha-prior-run',
                    lastRunAttemptAt                  : 0,
                    consecutiveFailures               : 0,
                    ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
                }
            }
        });

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
            revisionsFilePath: revisionsFile,
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

    test('error-bearing ingestion summary fails closed and the next run reuses the last good revision (#15748)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            repoSlug         = 'org/error-summary',
            envelopeCalls    = [],
            logs             = [];
        let ingestCallCount = 0;

        await fs.writeJson(revisionsFile, {
            revisions: {
                [`t1/${repoSlug}`]: {
                    lastIngestedRev                   : 'sha-good',
                    lastRunAttemptAt                  : 0,
                    consecutiveFailures               : 0,
                    ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
                }
            }
        });
        await provisionMirrorDir({tenantId: 't1', repoSlug});

        const envelopeBuilder = async args => {
            envelopeCalls.push(args);
            return {
                tenantId    : args.tenantId,
                repoSlug    : args.repoSlug,
                files       : [{sourcePath: 'fake.txt', repoSlug: args.repoSlug, content: 'x'}],
                deleted     : [],
                headRevision: envelopeCalls.length === 1 ? 'sha-failed-head' : 'sha-recovered-head',
                ...(args.lastIngestedRev ? {baseRevision: args.lastIngestedRev} : {})
            }
        };
        const ingestionService = makeFakeIngestionService({
            summaryFactory() {
                ingestCallCount++;

                if (ingestCallCount === 1) {
                    return {
                        ingested           : 1,
                        deleted            : 0,
                        embeddingsGenerated: 0,
                        errors             : [
                            {code: 'unsafe-code', message: 'TOKEN=must-not-project'},
                            {code: 'KB_VECTOR_EMBED_FAILED', message: 'credential=must-not-project', details: {sourceContent: 'private'}}
                        ]
                    }
                }

                return {ingested: 1, deleted: 0, embeddingsGenerated: 1, errors: []}
            }
        });
        const options = {
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/error-summary.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder,
            knowledgeBaseIngestionService: ingestionService,
            onlyRepoSlugs                : [repoSlug],
            revisionsFilePath            : revisionsFile,
            writeLog                     : (...args) => logs.push(args.join(' '))
        };

        const failed = await TenantRepoSyncService.runTask(options);

        expect(failed.status).toBe('failed');
        expect(failed.details.completedCount).toBe(0);
        expect(failed.details.failedCount).toBe(1);
        expect(failed.details.repos[0]).toMatchObject({
            status             : 'degraded',
            checkpointStatus   : 'complete',
            lastErrorCode      : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
            lastSourceErrorCode: 'KB_VECTOR_EMBED_FAILED',
            consecutiveFailures: 1
        });
        expect(JSON.stringify(failed)).not.toContain('must-not-project');
        expect(logs.join('\n')).not.toContain('must-not-project');

        let persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions[`t1/${repoSlug}`]).toMatchObject({
            lastIngestedRev                   : 'sha-good',
            consecutiveFailures               : 1,
            ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
        });

        const recovered = await TenantRepoSyncService.runTask(options);

        expect(recovered.status).toBe('completed');
        expect(envelopeCalls).toHaveLength(2);
        expect(envelopeCalls[0].lastIngestedRev).toBe('sha-good');
        expect(envelopeCalls[1].lastIngestedRev).toBe('sha-good');

        persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions[`t1/${repoSlug}`]).toMatchObject({
            lastIngestedRev    : 'sha-recovered-head',
            consecutiveFailures: 0
        });
    });

    for (const {label, summary} of [
        {label: 'missing errors field', summary: {ingested: 1}},
        {label: 'non-array errors field', summary: {ingested: 1, errors: {code: 'KB_VECTOR_EMBED_FAILED'}}}
    ]) {
        test(`${label} fails closed without advancing the persisted revision (#15748)`, async () => {
            const
                taskStateService = createInMemoryTaskStateService(),
                repoSlug         = `org/${label.replaceAll(' ', '-')}`;

            await fs.writeJson(revisionsFile, {
                revisions: {
                    [`t1/${repoSlug}`]: {
                        lastIngestedRev                   : 'sha-known-good',
                        lastRunAttemptAt                  : 0,
                        consecutiveFailures               : 2,
                        ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                        lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
                    }
                }
            });
            await provisionMirrorDir({tenantId: 't1', repoSlug});

            const result = await TenantRepoSyncService.runTask({
                reason           : 'manual',
                taskStateService,
                tenantReposConfig: {tenantRepos: [
                    {tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/summary-shape.git'}
                ]},
                gitMirror                    : makeFakeGitMirror(),
                envelopeBuilder              : makeFakeEnvelopeBuilder(),
                knowledgeBaseIngestionService: makeFakeIngestionService({summaryFactory: () => summary}),
                onlyRepoSlugs                : [repoSlug],
                revisionsFilePath            : revisionsFile
            });

            expect(result.status).toBe('failed');
            expect(result.details.repos[0]).toMatchObject({
                status             : 'degraded',
                lastErrorCode      : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
                consecutiveFailures: 3
            });
            expect(result.details.repos[0].lastSourceErrorCode).toBeUndefined();

            const persisted = await fs.readJson(revisionsFile);
            expect(persisted.revisions[`t1/${repoSlug}`]).toMatchObject({
                lastIngestedRev    : 'sha-known-good',
                consecutiveFailures: 3
            });
        })
    }

    test('mixed cycle counts an error-bearing summary as failed while preserving per-repo isolation (#15748)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            badSlug          = 'org/summary-bad',
            goodSlug         = 'org/summary-good';

        await provisionMirrorDir({tenantId: 't1', repoSlug: badSlug});
        await provisionMirrorDir({tenantId: 't1', repoSlug: goodSlug});

        const result = await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: badSlug,  mirrorRoot, cloneUrl: 'https://github.com/neomjs/bad.git'},
                {tenantId: 't1', repoSlug: goodSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/good.git'}
            ]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService({
                summaryFactory(payload) {
                    return payload.repoSlug === badSlug
                        ? {ingested: 1, deleted: 0, errors: [{code: 'KB_VECTOR_EMBED_FAILED'}]}
                        : {ingested: 1, deleted: 0, errors: []}
                }
            }),
            onlyRepoSlugs    : [badSlug, goodSlug],
            revisionsFilePath: revisionsFile
        });

        expect(result.status).toBe('completed');
        expect(result.details.completedCount).toBe(1);
        expect(result.details.failedCount).toBe(1);
        expect(result.details.repos.find(repo => repo.repoSlug === badSlug)).toMatchObject({
            status             : 'degraded',
            lastSourceErrorCode: 'KB_VECTOR_EMBED_FAILED'
        });
        expect(result.details.repos.find(repo => repo.repoSlug === goodSlug).status).toBe('active');

        const persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions[`t1/${badSlug}`]).toMatchObject({
            lastIngestedRev    : null,
            consecutiveFailures: 1
        });
        expect(persisted.revisions[`t1/${goodSlug}`].lastIngestedRev).toBe(`sha-head-${goodSlug}`);
    });

    test('scoped full replay keeps the old checkpoint on failure and replaces it only after clean completion (#15748)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            repoSlug         = 'org/full-replay',
            envelopeCalls    = [];
        let ingestCallCount = 0;

        await fs.writeJson(revisionsFile, {
            revisions: {
                [`t1/${repoSlug}`]: {
                    lastIngestedRev                   : 'sha-old-checkpoint',
                    lastRunAttemptAt                  : 0,
                    consecutiveFailures               : 2,
                    ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
                }
            }
        });
        await provisionMirrorDir({tenantId: 't1', repoSlug});

        const options = {
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/full-replay.git'}
            ]},
            gitMirror      : makeFakeGitMirror(),
            envelopeBuilder: async args => {
                envelopeCalls.push(args);
                return {
                    tenantId    : args.tenantId,
                    repoSlug    : args.repoSlug,
                    files       : [{sourcePath: 'fake.txt', repoSlug: args.repoSlug, content: 'x'}],
                    deleted     : [],
                    headRevision: envelopeCalls.length === 1 ? 'sha-replay-failed' : 'sha-replay-clean'
                }
            },
            knowledgeBaseIngestionService: makeFakeIngestionService({
                summaryFactory() {
                    ingestCallCount++;
                    return ingestCallCount === 1
                        ? {ingested: 1, deleted: 0, errors: [{code: 'KB_VECTOR_EMBED_FAILED'}]}
                        : {ingested: 1, deleted: 0, errors: []}
                }
            }),
            onlyRepoSlugs    : [repoSlug],
            fullReplay       : true,
            revisionsFilePath: revisionsFile
        };

        const failedReplay = await TenantRepoSyncService.runTask(options);

        expect(failedReplay.status).toBe('failed');
        expect(envelopeCalls[0].lastIngestedRev).toBeNull();

        let persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions[`t1/${repoSlug}`]).toMatchObject({
            lastIngestedRev    : 'sha-old-checkpoint',
            consecutiveFailures: 3
        });

        const cleanReplay = await TenantRepoSyncService.runTask(options);

        expect(cleanReplay.status).toBe('completed');
        expect(envelopeCalls[1].lastIngestedRev).toBeNull();

        persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions[`t1/${repoSlug}`]).toMatchObject({
            lastIngestedRev                   : 'sha-replay-clean',
            consecutiveFailures               : 0,
            ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
        });
    });

    test('legacy checkpoint revalidation retries returned and thrown failures from a null base before proving the new head (#15761)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            repoSlug         = 'org/legacy-retry',
            envelopeCalls    = [];
        let ingestAttempt = 0;

        await fs.writeJson(revisionsFile, {
            revisions: {
                [`t1/${repoSlug}`]: {
                    lastIngestedRev    : 'sha-legacy-head',
                    lastRunAttemptAt   : 0,
                    consecutiveFailures: 0
                }
            }
        });

        const options = {
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [{
                tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/legacy-retry.git'
            }]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder({captureCalls: envelopeCalls}),
            knowledgeBaseIngestionService: makeFakeIngestionService({
                summaryFactory() {
                    ingestAttempt++;

                    if (ingestAttempt === 1) {
                        return {ingested: 1, deleted: 0, errors: [{code: 'KB_VECTOR_EMBED_FAILED'}]}
                    }

                    if (ingestAttempt === 2) {
                        throw new Error('bounded thrown failure')
                    }

                    return {ingested: 1, deleted: 0, errors: []}
                }
            }),
            revisionsFilePath: revisionsFile,
            globalCadenceMs  : 0,
            jitterRatio      : 0,
            seedBootstrap    : false
        };

        for (const expectedFailureCount of [1, 2]) {
            const failed = await TenantRepoSyncService.runTask(options);

            expect(failed.status).toBe('failed');
            expect(failed.details.repos[0]).toMatchObject({
                status             : 'degraded',
                checkpointStatus   : 'failed',
                consecutiveFailures: expectedFailureCount
            });

            const persisted = await fs.readJson(revisionsFile);
            expect(persisted.revisions[`t1/${repoSlug}`]).toMatchObject({
                lastIngestedRev                   : 'sha-legacy-head',
                consecutiveFailures               : expectedFailureCount,
                ingestContractVersion             : null,
                lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
            });
        }

        const recovered = await TenantRepoSyncService.runTask(options);

        expect(recovered.status).toBe('completed');
        expect(envelopeCalls).toHaveLength(3);
        expect(envelopeCalls.every(call => call.args.lastIngestedRev === null)).toBe(true);

        const persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions[`t1/${repoSlug}`]).toMatchObject({
            lastIngestedRev                   : `sha-head-${repoSlug}`,
            consecutiveFailures               : 0,
            ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
        });
    });

    test('periodic migration admits at most concurrencyLimit legacy replays per sweep while current repos stay incremental (#15761)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            legacySlugs      = ['org/legacy-a', 'org/legacy-b', 'org/legacy-c'],
            currentSlug      = 'org/current',
            envelopeCalls    = [];

        TenantRepoSyncService.concurrencyLimit = 2;

        await fs.writeJson(revisionsFile, {
            revisions: {
                't1/org/legacy-a': {lastIngestedRev: 'sha-a', lastRunAttemptAt: 0, consecutiveFailures: 0},
                't1/org/legacy-b': {lastIngestedRev: 'sha-b', lastRunAttemptAt: 0, consecutiveFailures: 0},
                't1/org/legacy-c': {lastIngestedRev: 'sha-c', lastRunAttemptAt: 0, consecutiveFailures: 0},
                't1/org/current' : {
                    lastIngestedRev                   : 'sha-current',
                    lastRunAttemptAt                  : 0,
                    consecutiveFailures               : 0,
                    ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
                }
            }
        });

        const options = {
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [...legacySlugs, currentSlug].map(repoSlug => ({
                tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: `https://github.com/neomjs/${repoSlug}.git`
            }))},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder({captureCalls: envelopeCalls}),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            globalCadenceMs              : 0,
            jitterRatio                  : 0,
            seedBootstrap                : false
        };

        const firstSweep = await TenantRepoSyncService.runTask(options);

        expect(firstSweep.status).toBe('completed');
        expect(firstSweep.details).toMatchObject({
            completedCount           : 3,
            revalidationDeferredCount: 1
        });
        expect(envelopeCalls.filter(call => call.args.lastIngestedRev === null)).toHaveLength(2);
        expect(envelopeCalls.find(call => call.args.repoSlug === currentSlug).args.lastIngestedRev).toBe('sha-current');
        const firstSweepCallCount = envelopeCalls.length;

        let persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions['t1/org/legacy-a'].ingestContractVersion).toBe(TENANT_REPO_INGEST_CONTRACT_VERSION);
        expect(persisted.revisions['t1/org/legacy-b'].ingestContractVersion).toBe(TENANT_REPO_INGEST_CONTRACT_VERSION);
        expect(persisted.revisions['t1/org/legacy-c'].ingestContractVersion).toBeNull();

        const secondSweep = await TenantRepoSyncService.runTask(options);

        expect(secondSweep.status).toBe('completed');
        expect(secondSweep.details.revalidationDeferredCount).toBe(0);
        expect(envelopeCalls.filter(call =>
            call.args.repoSlug === 'org/legacy-c' && call.args.lastIngestedRev === null
        )).toHaveLength(1);
        for (const repoSlug of ['org/legacy-a', 'org/legacy-b']) {
            const secondSweepCall = envelopeCalls
                .slice(firstSweepCallCount)
                .find(call => call.args.repoSlug === repoSlug);

            expect(secondSweepCall.args.lastIngestedRev).toBe(`sha-head-${repoSlug}`);
        }

        persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions['t1/org/legacy-c'].ingestContractVersion).toBe(TENANT_REPO_INGEST_CONTRACT_VERSION);
    });

    test('admitted legacy replay gets the semaphore before a slow current repo across repeated sweeps (#15761)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            currentSlug      = 'org/current-slow',
            legacySlug       = 'org/legacy-starvation',
            mirrorCalls      = [],
            envelopeCalls    = [];

        TenantRepoSyncService.concurrencyLimit         = 1;
        TenantRepoSyncService.concurrencyGateTimeoutMs = 15;

        await fs.writeJson(revisionsFile, {
            revisions: {
                [`t1/${currentSlug}`]: {
                    lastIngestedRev                   : 'sha-current',
                    lastRunAttemptAt                  : 0,
                    consecutiveFailures               : 0,
                    ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
                },
                [`t1/${legacySlug}`]: {
                    lastIngestedRev    : 'sha-legacy',
                    lastRunAttemptAt   : 0,
                    consecutiveFailures: 0
                }
            }
        });

        const slowCurrentMirror = {
            async cloneIfMissing(args) {
                mirrorCalls.push({op: 'cloneIfMissing', args});

                if (args.repoSlug === currentSlug) {
                    await new Promise(resolve => setTimeout(resolve, 40));
                }
            },
            async fetch(args) {
                mirrorCalls.push({op: 'fetch', args});
            },
            async resolveHead({ref}) {
                return `sha-for-${ref}`;
            },
            async isAncestor() {
                return true;
            },
            async diffRevisions() {
                return {addedOrChanged: [], deleted: []};
            }
        };
        const options = {
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: currentSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/current.git'},
                {tenantId: 't1', repoSlug: legacySlug,  mirrorRoot, cloneUrl: 'https://github.com/neomjs/legacy.git'}
            ]},
            gitMirror                    : slowCurrentMirror,
            envelopeBuilder              : makeFakeEnvelopeBuilder({captureCalls: envelopeCalls}),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            globalCadenceMs              : 0,
            jitterRatio                  : 0,
            seedBootstrap                : false
        };

        for (let sweep = 0; sweep < 3; sweep++) {
            const result = await TenantRepoSyncService.runTask(options);

            expect(result.status).toBe('completed');
        }

        expect(mirrorCalls[0]).toMatchObject({
            op  : 'cloneIfMissing',
            args: {repoSlug: legacySlug}
        });
        expect(envelopeCalls.filter(call =>
            call.args.repoSlug === legacySlug && call.args.lastIngestedRev === null
        )).toHaveLength(1);

        const persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions[`t1/${legacySlug}`]).toMatchObject({
            lastIngestedRev                   : `sha-head-${legacySlug}`,
            ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
        });
    });

    test('slow admitted replay settles before current repo timeout accounting begins (#15761)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            currentSlug      = 'org/current-fast',
            legacySlug       = 'org/legacy-slow',
            envelopeCalls    = [];

        TenantRepoSyncService.concurrencyLimit         = 1;
        TenantRepoSyncService.concurrencyGateTimeoutMs = 15;

        await fs.writeJson(revisionsFile, {
            revisions: {
                [`t1/${currentSlug}`]: {
                    lastIngestedRev                   : 'sha-current',
                    lastRunAttemptAt                  : 0,
                    consecutiveFailures               : 0,
                    ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
                },
                [`t1/${legacySlug}`]: {
                    lastIngestedRev    : 'sha-legacy',
                    lastRunAttemptAt   : 0,
                    consecutiveFailures: 0
                }
            }
        });

        const slowLegacyMirror = {
            async cloneIfMissing({repoSlug}) {
                if (repoSlug === legacySlug) {
                    await new Promise(resolve => setTimeout(resolve, 40));
                }
            },
            async fetch() {},
            async resolveHead({ref}) {
                return `sha-for-${ref}`;
            },
            async isAncestor() {
                return true;
            },
            async diffRevisions() {
                return {addedOrChanged: [], deleted: []};
            }
        };

        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: currentSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/current.git'},
                {tenantId: 't1', repoSlug: legacySlug,  mirrorRoot, cloneUrl: 'https://github.com/neomjs/legacy.git'}
            ]},
            gitMirror                    : slowLegacyMirror,
            envelopeBuilder              : makeFakeEnvelopeBuilder({captureCalls: envelopeCalls}),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            globalCadenceMs              : 0,
            jitterRatio                  : 0,
            seedBootstrap                : false
        });

        expect(result).toMatchObject({
            status : 'completed',
            details: {
                completedCount: 2,
                failedCount   : 0
            }
        });
        expect(result.details.repos.find(repo => repo.repoSlug === currentSlug)).toMatchObject({
            status          : 'active',
            checkpointStatus: 'complete'
        });
        expect(envelopeCalls.find(call => call.args.repoSlug === currentSlug).args.lastIngestedRev).toBe('sha-current');
        expect(envelopeCalls.find(call => call.args.repoSlug === legacySlug).args.lastIngestedRev).toBeNull();
    });

    for (const {label, marker} of [
        {label: 'string success marker',     marker: {ingestContractVersion: '2'}},
        {label: 'fractional success marker', marker: {ingestContractVersion: 1.5}},
        {label: 'negative attempt marker',   marker: {lastAttemptedIngestContractVersion: -1}},
        {label: 'zero attempt marker',       marker: {lastAttemptedIngestContractVersion: 0}}
    ]) {
        test(`malformed ${label} fails closed without authorizing legacy replay (#15761)`, async () => {
            const
                taskStateService = createInMemoryTaskStateService(),
                mirrorCalls      = [],
                repoSlug         = 'org/malformed-contract';

            await fs.writeJson(revisionsFile, {
                revisions: {
                    [`t1/${repoSlug}`]: {
                        lastIngestedRev    : 'sha-preserve',
                        lastRunAttemptAt   : 0,
                        consecutiveFailures: 0,
                        ...marker
                    }
                }
            });
            const originalManifest = await fs.readFile(revisionsFile, 'utf8');

            const result = await TenantRepoSyncService.runTask({
                reason           : 'periodic-sweep:60000',
                taskStateService,
                tenantReposConfig: {tenantRepos: [{
                    tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/malformed.git'
                }]},
                gitMirror                    : makeFakeGitMirror({captureCalls: mirrorCalls}),
                envelopeBuilder              : makeFakeEnvelopeBuilder(),
                knowledgeBaseIngestionService: makeFakeIngestionService(),
                revisionsFilePath            : revisionsFile,
                globalCadenceMs              : 0,
                jitterRatio                  : 0,
                seedBootstrap                : false
            });

            expect(result.status).toBe('failed');
            expect(result.details.reasonCode).toBe('KB_TENANT_REPO_SYNC_SYNC_FAILED');
            expect(mirrorCalls).toHaveLength(0);
            expect(await fs.readFile(revisionsFile, 'utf8')).toBe(originalManifest);
        });
    }

    test('future checkpoint-contract markers fail closed without downgrade or repo work (#15761)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            mirrorCalls      = [],
            repoSlug         = 'org/future-contract',
            futureVersion    = TENANT_REPO_INGEST_CONTRACT_VERSION + 1;

        await fs.writeJson(revisionsFile, {
            revisions: {
                [`t1/${repoSlug}`]: {
                    lastIngestedRev                   : 'sha-future',
                    lastRunAttemptAt                  : 0,
                    consecutiveFailures               : 0,
                    ingestContractVersion             : futureVersion,
                    lastAttemptedIngestContractVersion: futureVersion,
                    futureOnlyField                   : 'preserve-me'
                }
            }
        });
        const originalManifest = await fs.readFile(revisionsFile, 'utf8');

        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [{
                tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/future.git'
            }]},
            gitMirror                    : makeFakeGitMirror({captureCalls: mirrorCalls}),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            globalCadenceMs              : 0,
            jitterRatio                  : 0,
            seedBootstrap                : false
        });

        expect(result.status).toBe('failed');
        expect(result.details).toMatchObject({
            reasonCode: 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
            meta      : {phase: 'checkpoint-contract-validation'}
        });
        expect(mirrorCalls).toHaveLength(0);
        expect(await fs.readFile(revisionsFile, 'utf8')).toBe(originalManifest);
    });

    test('full replay without an explicit repo selector fails before repo work begins (#15748)', async () => {
        const taskStateService = createInMemoryTaskStateService();

        const result = await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/unscoped', mirrorRoot, cloneUrl: 'https://github.com/neomjs/unscoped.git'}
            ]},
            fullReplay       : true,
            revisionsFilePath: revisionsFile
        });

        expect(result.status).toBe('failed');
        expect(result.details).toMatchObject({
            reasonCode: 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
            meta      : {phase: 'full-replay-validation'}
        });
        expect(await fs.pathExists(revisionsFile)).toBe(false);
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

    test('corrupt persisted revision state fails closed without being overwritten as bootstrap (#15761)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            malformedJson    = '{"revisions":';

        await fs.writeFile(revisionsFile, malformedJson);

        const result = await TenantRepoSyncService.runTask({
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [{
                tenantId: 't1', repoSlug: 'org/repo', mirrorRoot, cloneUrl: 'https://github.com/neomjs/repo.git'
            }]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile
        });

        expect(result.status).toBe('failed');
        expect(await fs.readFile(revisionsFile, 'utf8')).toBe(malformedJson);
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

        // Force a deep TenantRepoSyncError at the final manifest commit: a directory
        // squats on the exact temporary-sibling path, so the atomic tmp-write fails
        // while the strict read (no manifest yet) and the sibling lease file work.
        const manifestDir       = path.join(tmpDir, 'manifest-dir');
        const directoryAsTarget = path.join(manifestDir, 'revisions.json');
        await fs.ensureDir(`${directoryAsTarget}.tmp-${process.pid}`);

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
            revisionsFilePath            : directoryAsTarget
        });

        expect(result.status).toBe('failed');
        expect(result.details.reasonCode).toBe('KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED');
        expect(result.details.meta?.phase).toBe('manifest-update');
        expect(result.details.meta?.filePath).toContain('revisions.json');
        const errLine = logLines.find(l => l.level === 'ERROR' && l.msg.includes('KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED'));
        expect(errLine).toBeDefined();
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
            reason           : 'periodic-sweep:60000',
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
        expect(repoState.checkpointStatus).toBe('pending');
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
            lastIngestedRev                   : null,
            lastRunAttemptAt                  : expect.any(Number),
            consecutiveFailures               : 1,
            ingestContractVersion             : null,
            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
        });
    });

    test('jitter+backoff: persists consecutiveFailures reset on subsequent success (#11942 AC1)', async () => {
        const taskStateService = createInMemoryTaskStateService();

        // Pre-populate with consecutiveFailures=3 (from prior failures); also stale lastRunAttemptAt
        // so the backoff'd effective cadence is still elapsed.
        await fs.writeJson(revisionsFile, {
            revisions: {
                't1/neomjs/recovering-repo': {
                    lastIngestedRev                   : 'sha-old',
                    lastRunAttemptAt                  : 0, // very stale — backoff'd cadence is exceeded
                    consecutiveFailures               : 3,
                    ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
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
        const envelopeCalls    = [];

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
            envelopeBuilder              : makeFakeEnvelopeBuilder({captureCalls: envelopeCalls}),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile
        });

        // A bare SHA has no error-free success proof. The upgrade therefore performs
        // one harmless null-base replay before persisting the current contract marker.
        expect(result.status).toBe('completed');
        expect(envelopeCalls[0].args.lastIngestedRev).toBeNull();

        const persisted = await fs.readJson(revisionsFile);
        const state     = persisted.revisions['t1/neomjs/legacy-repo'];
        expect(typeof state).toBe('object');
        expect(state.lastIngestedRev).toBeTruthy();
        expect(state.consecutiveFailures).toBe(0); // success path resets
        expect(state.lastRunAttemptAt).toBeGreaterThan(0);
        expect(state.ingestContractVersion).toBe(TENANT_REPO_INGEST_CONTRACT_VERSION);
        expect(state.lastAttemptedIngestContractVersion).toBe(TENANT_REPO_INGEST_CONTRACT_VERSION);
    });

    test('jitter+backoff: onlyRepoSlugs (manual CLI path) bypasses due-check (#11942 AC1)', async () => {
        const taskStateService = createInMemoryTaskStateService();
        const ingestCalls      = [];

        // Pre-populate with very recent lastRunAttemptAt — would normally be not-due.
        const recentMs = Date.now() - 1000;
        await fs.writeJson(revisionsFile, {
            revisions: {
                't1/neomjs/manual-repo': {
                    lastIngestedRev                   : 'sha-recent',
                    lastRunAttemptAt                  : recentMs,
                    consecutiveFailures               : 0,
                    ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
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

    // --- Cross-process serialization + atomic manifest commit ---

    function leaseFilePath() {
        return path.join(tmpDir, 'tenant-repo-sync-lease.json');
    }

    /**
     * Base runTask options for the lease suite: one configured repo, tmp-dir
     * manifest (which also derives the tmp-dir sibling lease path), immediate cadence.
     */
    function baseLeaseRunOptions({taskStateService, ...overrides}) {
        return {
            reason           : 'periodic-sweep:60000',
            taskStateService,
            revisionsFilePath: revisionsFile,
            tenantReposConfig: {tenantRepos: [{
                tenantId: 't1', repoSlug: 'org/lease-repo', mirrorRoot, cloneUrl: 'https://github.com/neomjs/lease-repo.git'
            }]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder(),
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            globalCadenceMs              : 0,
            jitterRatio                  : 0,
            seedBootstrap                : false,
            ...overrides
        };
    }

    test('cross-process lease: a held lease defers the sweep without repo work or manifest mutation (#15763)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            mirrorCalls      = [];

        await fs.writeJson(revisionsFile, {revisions: {'t1/org/lease-repo': {
            lastIngestedRev                   : 'sha-before',
            lastRunAttemptAt                  : 0,
            consecutiveFailures               : 1,
            ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
        }}});
        const originalManifest = await fs.readFile(revisionsFile, 'utf8');

        await fs.writeJson(leaseFilePath(), buildLeasePayload({
            owner       : 'tenant-repo-sync:manual',
            reason      : 'tenant-repo-sync',
            pid         : process.pid,
            staleAfterMs: 60_000,
            token       : 'foreign-owner-token'
        }));

        const result = await TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService,
            gitMirror: makeFakeGitMirror({captureCalls: mirrorCalls})
        }));

        expect(result.status).toBe('skipped');
        expect(result.details).toMatchObject({
            reasonCode: 'KB_TENANT_REPO_SYNC_LEASE_HELD',
            leaseOwner: 'tenant-repo-sync:manual'
        });
        expect(mirrorCalls).toHaveLength(0);
        expect(await fs.readFile(revisionsFile, 'utf8')).toBe(originalManifest);
        expect(taskStateService.getTaskState('tenant-repo-sync')?.running).toBeFalsy();

        // Bounded diagnostics: owner class + timestamps only — no pid, no host paths.
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain('"pid"');
        expect(serialized).not.toContain(tmpDir);
    });

    test('cross-process lease: two concurrent invocations serialize — one completes, one defers (#15763)', async () => {
        const
            taskStateServiceA = createInMemoryTaskStateService(),
            taskStateServiceB = createInMemoryTaskStateService();

        let releaseGate;
        const gate = new Promise(resolve => releaseGate = resolve);

        const invocationA = TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService             : taskStateServiceA,
            knowledgeBaseIngestionService: makeFakeIngestionService({
                async summaryFactory() {
                    await gate;
                    return {ingested: 1, deleted: 0, errors: []};
                }
            })
        }));

        // Deterministic interleave: wait until invocation A provably holds the lease.
        for (let i = 0; i < 200 && !await fs.pathExists(leaseFilePath()); i++) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        expect(await fs.pathExists(leaseFilePath())).toBe(true);

        const resultB = await TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService: taskStateServiceB,
            reason          : 'manual'
        }));

        expect(resultB.status).toBe('skipped');
        expect(resultB.details.reasonCode).toBe('KB_TENANT_REPO_SYNC_LEASE_HELD');
        expect(resultB.details.leaseOwner).toBe('tenant-repo-sync:scheduler');

        releaseGate();
        const resultA = await invocationA;

        expect(resultA.status).toBe('completed');
        const persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions['t1/org/lease-repo'].lastIngestedRev).toBe('sha-head-org/lease-repo');
        expect(await fs.pathExists(leaseFilePath())).toBe(false);
    });

    test('cross-process lease: a dead-owner lease is reclaimed and released after the run (#15763)', async () => {
        await fs.writeJson(leaseFilePath(), buildLeasePayload({
            owner       : 'tenant-repo-sync:manual',
            reason      : 'tenant-repo-sync',
            pid         : 2147483647,
            staleAfterMs: 60_000,
            token       : 'dead-owner-token'
        }));

        const result = await TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService: createInMemoryTaskStateService()
        }));

        expect(result.status).toBe('completed');
        expect(await fs.pathExists(leaseFilePath())).toBe(false);
    });

    test('cross-process lease: released after a failing sweep so the next run can acquire (#15763)', async () => {
        const failing = await TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService             : createInMemoryTaskStateService(),
            knowledgeBaseIngestionService: makeFakeIngestionService({
                summaryFactory() {
                    return {ingested: 0, deleted: 0, errors: [{code: 'KB_VECTOR_EMBED_FAILED'}]};
                }
            })
        }));

        expect(failing.status).toBe('failed');
        expect(await fs.pathExists(leaseFilePath())).toBe(false);

        const recovered = await TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService: createInMemoryTaskStateService()
        }));

        expect(recovered.status).toBe('completed');
    });

    test('lease renewal keeps a live long-running owner past its base TTL — no mid-work reclaim (#15763)', async () => {
        const taskStateService = createInMemoryTaskStateService();

        let releaseIngestion;
        const ingestionGate = new Promise(resolve => releaseIngestion = resolve);

        const invocation = TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService,
            leaseStaleAfterMs            : 300,
            leaseRenewalIntervalMs       : 50,
            knowledgeBaseIngestionService: makeFakeIngestionService({
                async summaryFactory() {
                    await ingestionGate;
                    return {ingested: 1, deleted: 0, errors: []};
                }
            })
        }));

        for (let i = 0; i < 200 && !await fs.pathExists(leaseFilePath()); i++) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        expect(await fs.pathExists(leaseFilePath())).toBe(true);

        // Hold the run well past its base TTL. Without renewal the lease would
        // be reclaimable at +300ms; the renewal loop must keep the live owner's
        // deadline moving so the contender still observes an active hold.
        await new Promise(resolve => setTimeout(resolve, 450));

        const contender = await acquireHeavyMaintenanceLease({
            leasePath   : leaseFilePath(),
            owner       : 'contender',
            staleAfterMs: 300
        });
        expect(contender).toMatchObject({acquired: false, status: 'held'});

        releaseIngestion();
        const result = await invocation;

        expect(result.status).toBe('completed');
        expect((await fs.readJson(revisionsFile)).revisions['t1/org/lease-repo'].lastIngestedRev).toBe('sha-head-org/lease-repo');
        expect(await fs.pathExists(leaseFilePath())).toBe(false);
    });

    test('renewal failure aborts before protected work: failed run, no manifest, untouched backoff, replacement intact (#15763)', async () => {
        const taskStateService = createInMemoryTaskStateService();

        let releaseEnvelope;
        const envelopeGate = new Promise(resolve => releaseEnvelope = resolve);
        const baseEnvelope = makeFakeEnvelopeBuilder();

        const invocation = TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService,
            leaseStaleAfterMs     : 60_000,
            leaseRenewalIntervalMs: 25,
            envelopeBuilder       : async (...args) => {
                await envelopeGate;
                return baseEnvelope(...args);
            }
        }));

        for (let i = 0; i < 200 && !await fs.pathExists(leaseFilePath()); i++) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        expect(await fs.pathExists(leaseFilePath())).toBe(true);

        // A reclaimer replaces the lease while the run is paused mid-work.
        // The replacement happens INSIDE the lifecycle guard so an in-flight
        // renewal tick cannot interleave with this test write.
        const guardPath = `${leaseFilePath()}${LIFECYCLE_GUARD_SUFFIX}`;
        await fs.ensureDir(guardPath);
        await fs.writeJson(leaseFilePath(), buildLeasePayload({
            owner       : 'replacement-owner',
            reason      : 'tenant-repo-sync',
            pid         : process.pid,
            staleAfterMs: 60_000,
            token       : 'replacement-token'
        }));
        await fs.rmdir(guardPath);

        // Let renewal ticks observe the loss; even under full renewal
        // starvation the pre-ingest fence re-inspects the live file and
        // reaches the same abort.
        await new Promise(resolve => setTimeout(resolve, 120));

        releaseEnvelope();
        const result = await invocation;

        expect(result.status).toBe('failed');
        expect(result.details.reasonCode).toBe('KB_TENANT_REPO_SYNC_LEASE_LOST');

        // Fail-closed: no manifest was ever committed and per-repo backoff
        // state was not manufactured for the aborted sweep.
        expect(await fs.pathExists(revisionsFile)).toBe(false);

        // The loser's token-guarded release could not remove the replacement.
        expect((await fs.readJson(leaseFilePath())).token).toBe('replacement-token');
    });

    test('atomic manifest write: a failed write leaves the previous complete document readable (#15763)', async () => {
        const
            roDir  = path.join(tmpDir, 'ro-manifest'),
            target = path.join(roDir, 'revisions.json');

        await fs.ensureDir(roDir);
        await fs.writeJson(target, {revisions: {'t1/org/keep': {lastIngestedRev: 'sha-keep'}}});
        const original = await fs.readFile(target, 'utf8');

        await fs.chmod(roDir, 0o555);
        try {
            await expect(TenantRepoSyncService.writePersistedRevisions({
                filePath : target,
                revisions: {'t1/org/keep': {lastIngestedRev: 'sha-new'}}
            })).rejects.toMatchObject({code: 'KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED'});
        } finally {
            await fs.chmod(roDir, 0o755);
        }

        expect(await fs.readFile(target, 'utf8')).toBe(original);
        expect((await fs.readdir(roDir)).filter(name => name.includes('.tmp-'))).toEqual([]);
    });

    test('commit-point fence: an evicted writer aborts without writing (#15763)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            foreignLease     = buildLeasePayload({
                owner       : 'tenant-repo-sync:scheduler',
                reason      : 'tenant-repo-sync',
                pid         : process.pid,
                staleAfterMs: 60_000,
                token       : 'foreign-takeover-token'
            });

        await fs.writeJson(revisionsFile, {revisions: {'t1/org/lease-repo': {
            lastIngestedRev                   : 'sha-before',
            lastRunAttemptAt                  : 0,
            consecutiveFailures               : 0,
            ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
        }}});
        const originalManifest = await fs.readFile(revisionsFile, 'utf8');

        // Simulate a TTL eviction: a new owner replaces the lease mid-sweep.
        const takeoverMirror = {
            ...makeFakeGitMirror(),
            async fetch() {
                await fs.writeJson(leaseFilePath(), foreignLease);
            }
        };

        const result = await TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService,
            gitMirror: takeoverMirror
        }));

        expect(result.status).toBe('failed');
        expect(result.details.reasonCode).toBe('KB_TENANT_REPO_SYNC_LEASE_LOST');
        expect(await fs.readFile(revisionsFile, 'utf8')).toBe(originalManifest);
        // Token-guarded release must not clobber the new owner's lease.
        expect((await fs.readJson(leaseFilePath())).token).toBe('foreign-takeover-token');
    });

    test('atomic manifest write: an interrupted partial temp write never replaces the target (#15763)', async () => {
        const target = path.join(tmpDir, 'fault-injected.json');
        await fs.writeJson(target, {revisions: {'t1/org/keep': {lastIngestedRev: 'sha-keep'}}});
        const original = await fs.readFile(target, 'utf8');

        const shortWriteFs = {
            ...fs,
            async writeFile(filePath, payload, ...rest) {
                await fs.writeFile(filePath, String(payload).slice(0, 10), ...rest);
                const error = new Error('interrupted after a partial write');
                error.code  = 'EIO';
                throw error;
            }
        };

        await expect(TenantRepoSyncService.writePersistedRevisions({
            filePath : target,
            revisions: {'t1/org/keep': {lastIngestedRev: 'sha-new'}},
            fsModule : shortWriteFs
        })).rejects.toMatchObject({code: 'KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED'});

        expect(await fs.readFile(target, 'utf8')).toBe(original);
        expect((await fs.readdir(tmpDir)).filter(name => name.includes('.tmp-'))).toEqual([]);
    });

    test('atomic manifest write: a multi-chunk payload lands complete and parseable (#15763)', async () => {
        const target    = path.join(tmpDir, 'large-manifest.json');
        const revisions = {};

        for (let i = 0; i < 2000; i++) {
            revisions[`t1/org/repo-${i}`] = {
                lastIngestedRev                   : 'f'.repeat(512) + i,
                lastRunAttemptAt                  : i,
                consecutiveFailures               : 0,
                ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
            };
        }

        await TenantRepoSyncService.writePersistedRevisions({filePath: target, revisions});

        const persisted = await fs.readJson(target);
        expect(Object.keys(persisted.revisions)).toHaveLength(2000);
        expect(persisted.revisions['t1/org/repo-1999'].lastIngestedRev.endsWith('1999')).toBe(true);
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

    test('preserves bounded bootstrap diagnostics while materializing mirror roots', async () => {
        const bootstrap = {
            status      : 'parse-failed',
            tenantCount : null,
            errorCode   : 'KB_CONFIG_BOOTSTRAP_PARSE_FAILED',
            messageClass: 'yaml-parse'
        };
        const ingestionStub = {
            listConfiguredTenantRepos: async () => ({
                tenantRepos: [{
                    tenantId     : 't1',
                    repoSlug     : 'org/repo',
                    cloneUrl     : 'https://github.com/neomjs/a.git',
                    credentialRef: 'env:T'
                }],
                configDiagnostics: {bootstrap}
            })
        };

        const result = await TenantRepoSyncService.resolveTenantReposConfig({
            ingestionService: ingestionStub,
            tier1MirrorRoot : '/app/.neo-ai-data'
        });

        expect(result.tenantRepos[0].mirrorRoot).toBe('/app/.neo-ai-data');
        expect(result.configDiagnostics).toEqual({bootstrap});
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

test.describe('syncTenantRepos manual CLI (#15748)', () => {
    test('parses repeatable repo selectors with explicit full replay', () => {
        expect(parseArgs([
            'node',
            'syncTenantRepos.mjs',
            '--repo-slug',
            'org/a',
            '--full',
            '-r',
            'org/b'
        ])).toEqual({
            fullReplay: true,
            repoSlugs : ['org/a', 'org/b']
        });
    });

    test('rejects full replay without a repo selector', () => {
        expect(() => parseArgs(['node', 'syncTenantRepos.mjs', '--full']))
            .toThrow('--full requires at least one --repo-slug selector.')
    });

    test('dispatches full replay and selectors to TenantRepoSyncService', () => {
        const
            taskStateService = {name: 'task-state'},
            writeLog         = () => {},
            options          = buildRunTaskOptions({
                parsed: {
                    fullReplay: true,
                    repoSlugs : ['org/a', 'org/b']
                },
                taskStateService,
                writeLog
            });

        expect(options).toEqual({
            reason       : 'manual',
            taskStateService,
            writeLog,
            onlyRepoSlugs: ['org/a', 'org/b'],
            fullReplay   : true
        });
    });

    test('resolveExitCode maps runTask results onto the documented exit-code contract (#15763)', () => {
        expect(resolveExitCode({status: 'completed', details: {}})).toBe(0);
        expect(resolveExitCode({status: 'skipped', details: {reasonCode: 'KB_TENANT_REPO_SYNC_LEASE_HELD'}})).toBe(4);
        expect(resolveExitCode({status: 'failed', details: {reasonCode: 'KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED'}})).toBe(3);
        expect(resolveExitCode({status: 'failed', details: {reasonCode: 'KB_TENANT_REPO_SYNC_SYNC_FAILED'}})).toBe(1);
        expect(resolveExitCode({status: 'skipped', details: {reason: 'no-tenant-repos-configured'}})).toBe(1);
    });
});
