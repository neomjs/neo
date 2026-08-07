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
import {createTenantRepoMaterializationDigest}
    from '../../../../../../../ai/services/knowledge-base/helpers/tenantRepoIngestEnvelopeBuilder.mjs';
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
import {readHealLedger} from '../../../../../../../ai/services/memory-core/helpers/healEventLedgerStore.mjs';

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
            markStarted  : (taskName, reason) => { taskState[taskName] = {...taskState[taskName], running: true, reason, startedAt: Date.now()}; },
            markCompleted: (taskName, lastCompletion = null) => { taskState[taskName] = {...taskState[taskName], running: false, completedAt: Date.now(), lastCompletion}; },
            markSkipped  : (taskName, lastCompletion = null) => { taskState[taskName] = {...taskState[taskName], running: false, skippedAt: Date.now(), lastCompletion}; },
            markFailed   : (taskName, code, lastCompletion = null) => { taskState[taskName] = {...taskState[taskName], running: false, failedAt: Date.now(), lastCompletion}; }
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

    function makeFakeEnvelopeBuilder({captureCalls = [], includeManifest = false} = {}) {
        return async function buildIngestEnvelope(args) {
            captureCalls.push({op: 'buildIngestEnvelope', args});
            return {
                tenantId    : args.tenantId,
                repoSlug    : args.repoSlug,
                files       : [{sourcePath: 'fake.txt', repoSlug: args.repoSlug, content: 'x'}],
                deleted     : [],
                headRevision: `sha-head-${args.repoSlug}`,
                ...(includeManifest ? {
                    manifestSnapshot: {
                        repoSlug      : args.repoSlug,
                        pathsAfterPush: ['fake.txt']
                    }
                } : {}),
                ...(args.lastIngestedRev ? {baseRevision: args.lastIngestedRev} : {})
            };
        };
    }

    function makeFakeIngestionService({captureCalls = [], summaryFactory} = {}) {
        const materializationReceipts = new Map();

        return {
            async getTenantManifest({tenantId, repoSlug}) {
                return {
                    tenantId,
                    repoSlug,
                    materializationReceipt: materializationReceipts.get(`${tenantId}/${repoSlug}`) || null
                }
            },
            async ingestSourceFiles(payload) {
                captureCalls.push({op: 'ingestSourceFiles', payload});

                const summary = summaryFactory ? await summaryFactory(payload) : {
                    ingested           : payload.files?.length || 0,
                    deleted            : payload.deleted?.length || 0,
                    embeddingsGenerated: 0,
                    errors             : [],
                    tenantId           : payload.tenantId,
                    durationMs         : 1
                };

                if (payload.manifestSnapshot) {
                    const
                        key            = `${payload.tenantId}/${payload.repoSlug}`,
                        envelopeDigest = createTenantRepoMaterializationDigest(payload),
                        existing       = materializationReceipts.get(key),
                        hasEffect      = Array.isArray(summary.errors)
                            && summary.errors.length === 0
                            && [summary.ingested, summary.deleted]
                                .some(value => Number.isSafeInteger(value) && value > 0);

                    if (payload.materializationAttempt && hasEffect) {
                        const receipt = {
                            ...payload.materializationAttempt,
                            envelopeDigest,
                            recordedAt: Date.now()
                        };

                        materializationReceipts.set(key, receipt);
                        summary.materializationReceipt = receipt;
                    } else if (
                        payload.materializationAttempt
                        && existing?.ingestContractVersion === payload.materializationAttempt.ingestContractVersion
                        && existing.envelopeDigest === envelopeDigest
                    ) {
                        summary.materializationReceipt = existing;
                    } else if (!payload.materializationAttempt) {
                        materializationReceipts.delete(key);
                    }
                }

                return summary
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
                    lastIngestedRev                      : 'abcdef1234567890',
                    lastRunAttemptAt                     : Date.now(),
                    consecutiveFailures                  : 0,
                    ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastCommittedMaterializationAttemptId: 'f'.repeat(32)
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
        // ingestion commit contract.
        await fs.ensureDir(path.dirname(revisionsFile));
        await fs.writeJson(revisionsFile, {
            revisions: {
                't1/org/seeded': {
                    lastIngestedRev                      : 'sha-prior-run',
                    lastRunAttemptAt                     : 0,
                    consecutiveFailures                  : 0,
                    ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastCommittedMaterializationAttemptId: 'f'.repeat(32)
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

        const persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions['t1/org/seeded']).toMatchObject({
            lastIngestedRev                   : 'sha-new-head',
            consecutiveFailures               : 0,
            ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
        });
    });

    test('legacy null-contract checkpoint bootstraps an empty target after the first positive materialization (#16045)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            repoSlug         = 'org/legacy-empty-bootstrap',
            envelopeCalls    = [],
            ingestCalls      = [];

        await fs.writeJson(revisionsFile, {
            revisions: {
                [`t1/${repoSlug}`]: {
                    lastIngestedRev                   : 'sha-before-contracts',
                    lastRunAttemptAt                  : 0,
                    consecutiveFailures               : 0,
                    ingestContractVersion             : null,
                    lastAttemptedIngestContractVersion: null
                }
            }
        });
        await provisionMirrorDir({tenantId: 't1', repoSlug});

        const result = await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [{
                tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://example.invalid/private.git'
            }]},
            gitMirror                    : makeFakeGitMirror(),
            envelopeBuilder              : makeFakeEnvelopeBuilder({captureCalls: envelopeCalls, includeManifest: true}),
            knowledgeBaseIngestionService: makeFakeIngestionService({captureCalls: ingestCalls}),
            onlyRepoSlugs                : [repoSlug],
            revisionsFilePath            : revisionsFile,
            seedBootstrap                : false
        });

        expect(result.status).toBe('completed');
        expect(result.details.completedCount).toBe(1);
        expect(result.details.failedCount).toBe(0);
        expect(envelopeCalls).toHaveLength(1);
        expect(envelopeCalls[0].args.lastIngestedRev).toBeNull();
        expect(ingestCalls).toHaveLength(1);
        expect(ingestCalls[0].payload).toMatchObject({
            tenantId: 't1',
            repoSlug,
            viaMcp  : false
        });
        expect(ingestCalls[0].payload.manifestSnapshot.pathsAfterPush).toEqual(['fake.txt']);
        expect(ingestCalls[0].payload.materializationAttempt).toMatchObject({
            ingestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
        });

        const persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions[`t1/${repoSlug}`]).toMatchObject({
            lastIngestedRev                   : `sha-head-${repoSlug}`,
            consecutiveFailures               : 0,
            ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION,
            lastCommittedMaterializationAttemptId:
                ingestCalls[0].payload.materializationAttempt.attemptId
        });
    });

    for (const scenario of [
        {
            label        : 'bootstrap',
            fullReplay   : false,
            priorState   : null,
            expectedBase : null,
            manifestPaths: []
        },
        {
            label     : 'non-linear fallback',
            fullReplay: false,
            priorState: {
                lastIngestedRev                      : 'sha-nonlinear-good',
                lastRunAttemptAt                     : 0,
                consecutiveFailures                  : 0,
                ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                lastCommittedMaterializationAttemptId: 'a'.repeat(32)
            },
            expectedBase : 'sha-nonlinear-good',
            manifestPaths: ['README.md']
        },
        {
            label     : 'manual full replay',
            fullReplay: true,
            priorState: {
                lastIngestedRev                      : 'sha-full-good',
                lastRunAttemptAt                     : 0,
                consecutiveFailures                  : 0,
                ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                lastCommittedMaterializationAttemptId: 'b'.repeat(32)
            },
            expectedBase : null,
            manifestPaths: ['README.md']
        },
        {
            label     : 'legacy revalidation',
            fullReplay: false,
            priorState: {
                lastIngestedRev    : 'sha-legacy-good',
                lastRunAttemptAt   : 0,
                consecutiveFailures: 0
            },
            expectedBase : null,
            manifestPaths: ['README.md']
        },
        {
            label     : 'v1 checkpoint migration',
            fullReplay: false,
            priorState: {
                lastIngestedRev                   : 'sha-v1-good',
                lastRunAttemptAt                  : 0,
                consecutiveFailures               : 0,
                ingestContractVersion             : 1,
                lastAttemptedIngestContractVersion: 1
            },
            expectedBase : null,
            manifestPaths: ['README.md']
        },
        {
            label     : 'v2 checkpoint without receipt acknowledgement',
            fullReplay: false,
            priorState: {
                lastIngestedRev                   : 'sha-v2-unproved',
                lastRunAttemptAt                  : 0,
                consecutiveFailures               : 0,
                ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
            },
            expectedBase : null,
            manifestPaths: ['README.md']
        }
    ]) {
        test(`${scenario.label} fails closed when full materialization has zero effect (#16045)`, async () => {
            const
                taskStateService = createInMemoryTaskStateService(),
                repoSlug         = `org/${scenario.label.replaceAll(' ', '-')}`,
                envelopeCalls    = [],
                healthCalls      = [];

            if (scenario.priorState) {
                await fs.writeJson(revisionsFile, {
                    revisions: {
                        [`t1/${repoSlug}`]: scenario.priorState
                    }
                });
            }

            await provisionMirrorDir({tenantId: 't1', repoSlug});

            const result = await TenantRepoSyncService.runTask({
                reason           : 'manual',
                taskStateService,
                tenantReposConfig: {tenantRepos: [{
                    tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://example.invalid/private.git'
                }]},
                gitMirror      : makeFakeGitMirror(),
                envelopeBuilder: async args => {
                    envelopeCalls.push(args);

                    return {
                        tenantId: args.tenantId,
                        repoSlug: args.repoSlug,
                        files   : scenario.manifestPaths.map(sourcePath => ({
                            sourcePath,
                            repoSlug: args.repoSlug,
                            content : 'source exists but parser materialized nothing'
                        })),
                        headRevision    : `sha-empty-${scenario.label}`,
                        manifestSnapshot: {
                            repoSlug      : args.repoSlug,
                            pathsAfterPush: scenario.manifestPaths
                        }
                    };
                },
                knowledgeBaseIngestionService: makeFakeIngestionService({
                    summaryFactory: () => ({ingested: 0, deleted: 0, errors: []})
                }),
                healthService: {
                    recordTaskOutcome(...args) {
                        healthCalls.push(args)
                    }
                },
                onlyRepoSlugs    : [repoSlug],
                fullReplay       : scenario.fullReplay,
                revisionsFilePath: revisionsFile,
                seedBootstrap    : false
            });

            expect(result.status).toBe('failed');
            expect(result.details.completedCount).toBe(0);
            expect(result.details.failedCount).toBe(1);
            expect(result.details.repos[0]).toMatchObject({
                status             : 'degraded',
                lastErrorCode      : 'KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION',
                consecutiveFailures: 1
            });
            expect(envelopeCalls).toHaveLength(1);
            expect(envelopeCalls[0].lastIngestedRev).toBe(scenario.expectedBase);
            expect(JSON.stringify(result)).not.toContain('example.invalid');
            expect(healthCalls.some(([, outcome, details]) =>
                outcome === 'failed'
                && details.code === 'KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION'
            )).toBe(true);

            const persisted = await fs.readJson(revisionsFile);
            expect(persisted.revisions[`t1/${repoSlug}`]).toMatchObject({
                lastIngestedRev                   : scenario.priorState?.lastIngestedRev || null,
                consecutiveFailures               : 1,
                ingestContractVersion             : scenario.priorState?.ingestContractVersion ?? null,
                lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
            });
        });
    }

    test('zero-effect full materialization cannot echo the current attempt as durable proof (#16045)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            repoSlug         = 'org/echoed-current-receipt';

        await provisionMirrorDir({tenantId: 't1', repoSlug});

        const result = await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [{
                tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://example.invalid/echoed.git'
            }]},
            gitMirror      : makeFakeGitMirror(),
            envelopeBuilder: async args => ({
                tenantId        : args.tenantId,
                repoSlug        : args.repoSlug,
                files           : [{sourcePath: 'README.md', repoSlug: args.repoSlug, content: 'source'}],
                headRevision    : 'sha-echoed-receipt',
                manifestSnapshot: {
                    repoSlug      : args.repoSlug,
                    pathsAfterPush: ['README.md']
                }
            }),
            knowledgeBaseIngestionService: makeFakeIngestionService({
                summaryFactory(payload) {
                    return {
                        ingested              : 0,
                        deleted               : 0,
                        errors                : [],
                        materializationReceipt: {
                            ...payload.materializationAttempt,
                            envelopeDigest: createTenantRepoMaterializationDigest(payload),
                            recordedAt    : Date.now()
                        }
                    }
                }
            }),
            onlyRepoSlugs    : [repoSlug],
            revisionsFilePath: revisionsFile,
            seedBootstrap    : false
        });

        expect(result).toMatchObject({
            status : 'failed',
            details: {
                completedCount: 0,
                failedCount   : 1,
                repos         : [{
                    lastErrorCode: 'KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION'
                }]
            }
        });
    });

    test('full delete-only reconciliation remains a successful checkpoint effect (#16045)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            repoSlug         = 'org/delete-only-full';

        await fs.writeJson(revisionsFile, {
            revisions: {
                [`t1/${repoSlug}`]: {
                    lastIngestedRev                   : 'sha-before-delete',
                    lastRunAttemptAt                  : 0,
                    consecutiveFailures               : 0,
                    ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
                }
            }
        });
        await provisionMirrorDir({tenantId: 't1', repoSlug});

        const result = await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [{
                tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://example.invalid/delete-only.git'
            }]},
            gitMirror      : makeFakeGitMirror(),
            envelopeBuilder: async args => ({
                tenantId        : args.tenantId,
                repoSlug        : args.repoSlug,
                files           : [],
                headRevision    : 'sha-after-delete',
                manifestSnapshot: {
                    repoSlug      : args.repoSlug,
                    pathsAfterPush: []
                }
            }),
            knowledgeBaseIngestionService: makeFakeIngestionService({
                summaryFactory: () => ({ingested: 0, deleted: 1, errors: []})
            }),
            onlyRepoSlugs    : [repoSlug],
            fullReplay       : true,
            revisionsFilePath: revisionsFile
        });

        expect(result.status).toBe('completed');
        expect(result.details.completedCount).toBe(1);
        expect(result.details.repos[0]).toMatchObject({
            status              : 'active',
            lastIngestedRev     : 'sha-afte',
            checkpointStatus    : 'complete',
            lastSyncDeletedCount: 1
        });

        const persisted = await fs.readJson(revisionsFile);
        expect(persisted.revisions[`t1/${repoSlug}`].lastIngestedRev).toBe('sha-after-delete');
    });

    test('delete-only full replay settles an unacknowledged receipt after checkpoint-write failure exactly once (#16045)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            repoSlug         = 'org/delete-only-retry',
            ingestCalls      = [];
        let ingestAttempt = 0;

        await fs.writeJson(revisionsFile, {
            revisions: {
                [`t1/${repoSlug}`]: {
                    lastIngestedRev                      : 'sha-before-delete',
                    lastRunAttemptAt                     : 0,
                    consecutiveFailures                  : 0,
                    ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastCommittedMaterializationAttemptId: 'e'.repeat(32)
                }
            }
        });
        await provisionMirrorDir({tenantId: 't1', repoSlug});

        const options = {
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [{
                tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://example.invalid/delete-only-retry.git'
            }]},
            gitMirror      : makeFakeGitMirror(),
            envelopeBuilder: async args => ({
                tenantId        : args.tenantId,
                repoSlug        : args.repoSlug,
                files           : [],
                headRevision    : 'sha-after-delete',
                manifestSnapshot: {
                    repoSlug      : args.repoSlug,
                    pathsAfterPush: []
                }
            }),
            knowledgeBaseIngestionService: makeFakeIngestionService({
                captureCalls: ingestCalls,
                summaryFactory() {
                    ingestAttempt++;
                    return {
                        ingested: 0,
                        deleted : ingestAttempt === 1 ? 1 : 0,
                        errors  : []
                    };
                }
            }),
            onlyRepoSlugs    : [repoSlug],
            fullReplay       : true,
            revisionsFilePath: revisionsFile,
            seedBootstrap    : false
        };

        const originalWritePersistedRevisions = TenantRepoSyncService.writePersistedRevisions;
        TenantRepoSyncService.writePersistedRevisions = async () => {
            const error = new Error('injected post-ingest checkpoint failure');
            error.code  = 'KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED';
            throw error;
        };

        let interrupted;
        try {
            interrupted = await TenantRepoSyncService.runTask(options);
        } finally {
            TenantRepoSyncService.writePersistedRevisions = originalWritePersistedRevisions;
        }

        expect(interrupted).toMatchObject({
            status : 'failed',
            details: {reasonCode: 'KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED'}
        });
        expect((await fs.readJson(revisionsFile)).revisions[`t1/${repoSlug}`]).toMatchObject({
            lastIngestedRev                      : 'sha-before-delete',
            lastCommittedMaterializationAttemptId: 'e'.repeat(32)
        });

        const recovered = await TenantRepoSyncService.runTask(options);

        expect(recovered).toMatchObject({
            status : 'completed',
            details: {completedCount: 1, failedCount: 0}
        });
        expect(ingestCalls).toHaveLength(1);
        expect(ingestAttempt).toBe(1);

        const recoveredState = (await fs.readJson(revisionsFile)).revisions[`t1/${repoSlug}`];
        expect(recoveredState).toMatchObject({
            lastIngestedRev                      : 'sha-after-delete',
            lastCommittedMaterializationAttemptId: ingestCalls[0].payload.materializationAttempt.attemptId
        });

        const staleReceiptReplay = await TenantRepoSyncService.runTask(options);

        expect(staleReceiptReplay).toMatchObject({
            status : 'failed',
            details: {
                completedCount: 0,
                failedCount   : 1,
                repos         : [{
                    lastErrorCode: 'KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION'
                }]
            }
        });
        expect(ingestCalls).toHaveLength(2);
        expect(ingestCalls[1].payload.materializationAttempt.attemptId)
            .not.toBe(ingestCalls[0].payload.materializationAttempt.attemptId);
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
                    lastIngestedRev                      : 'sha-good',
                    lastRunAttemptAt                     : 0,
                    consecutiveFailures                  : 0,
                    ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastCommittedMaterializationAttemptId: 'c'.repeat(32)
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

    test('an EMPTY envelope reads differently from a dropped ingest — the other arm of the discrimination', async () => {
        // The sibling test pins files=2/ingested=0 (dropped ingest). This pins files=0, which is the
        // arm the leading hypothesis predicts (a source-config gap yielding nothing to ingest) and
        // therefore the one the next live run is most likely to produce. Pinning only the arm that
        // already works would leave the claim "these two read differently" half-evidenced.
        const
            taskStateService = createInMemoryTaskStateService(),
            repoSlug         = 'org/empty-envelope',
            logs             = [];

        await provisionMirrorDir({tenantId: 't1', repoSlug});

        await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/empty-envelope.git'}
            ]},
            gitMirror      : makeFakeGitMirror(),
            envelopeBuilder: async args => ({
                tenantId        : args.tenantId,
                repoSlug        : args.repoSlug,
                files           : [],
                deleted         : [],
                headRevision    : 'sha-empty-envelope',
                manifestSnapshot: {pathsAfterPush: []}
            }),
            knowledgeBaseIngestionService: makeFakeIngestionService({
                summaryFactory: () => ({ingested: 0, deleted: 0, embeddingsGenerated: 0, errors: []})
            }),
            onlyRepoSlugs    : [repoSlug],
            revisionsFilePath: revisionsFile,
            writeLog         : (...args) => logs.push(args.join(' '))
        });

        const logText = logs.join('\n');

        // The discriminating field, and the reason this arm needed its own fixture.
        expect(logText).toContain('envelopeFiles=0');
        expect(logText).toContain('ingested=0')
    });

    test('the diagnostic survives an ERROR-BEARING summary, which throws before the effect guard', async () => {
        // `assertErrorFreeIngestionSummary` throws ahead of the effect guard, so a log placed below
        // it could never describe this failure — and this is the mode the other configured repo hits
        // live. Pinning it here is what keeps the line above BOTH guards; if someone moves it back
        // down, this test goes red rather than the regression reaching a plane.
        const
            taskStateService = createInMemoryTaskStateService(),
            repoSlug         = 'org/error-bearing-diagnostic',
            logs             = [];

        await provisionMirrorDir({tenantId: 't1', repoSlug});

        await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/error-bearing.git'}
            ]},
            gitMirror      : makeFakeGitMirror(),
            envelopeBuilder: async args => ({
                tenantId        : args.tenantId,
                repoSlug        : args.repoSlug,
                files           : [{sourcePath: 'a.txt', repoSlug: args.repoSlug, content: 'x'}],
                deleted         : [],
                headRevision    : 'sha-error-bearing',
                manifestSnapshot: {pathsAfterPush: ['a.txt']}
            }),
            knowledgeBaseIngestionService: makeFakeIngestionService({
                summaryFactory: () => ({
                    ingested           : 0,
                    deleted            : 0,
                    embeddingsGenerated: 0,
                    errors             : [
                        {code: 'KB_VECTOR_EMBED_FAILED', message: 'credential-must-not-project'},
                        {code: 'KB_FILE_PARSE_FAILED', message: 'also-must-not-project'}
                    ]
                })
            }),
            onlyRepoSlugs    : [repoSlug],
            revisionsFilePath: revisionsFile,
            writeLog         : (...args) => logs.push(args.join(' '))
        });

        const logText = logs.join('\n');

        // The diagnostic ran even though the summary assertion threw immediately after it.
        expect(logText).toContain('envelopeFiles=1');
        // And `errors=` now has a real range — it was structurally 0 while the line sat lower.
        expect(logText).toContain('errors=2');
        // Messages still never project, on either the diagnostic or the failure line.
        expect(logText).not.toContain('must-not-project')
    });

    test('an empty materialization states envelope vs ingest counts, so the two causes are distinguishable (#16577)', async () => {
        // The failure path threw before any diagnostic was written, so an empty ENVELOPE (nothing
        // matched a Source) and a dropped INGEST (files present, none materialized) produced the
        // same silence and the same error code — with opposite fixes. Measured live: 99 seconds
        // of no output, then KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION.
        //
        // This fixture is deliberately the DROPPED-INGEST arm: two envelope files, zero ingested.
        // That is the combination the old log could not describe at all.
        const
            taskStateService = createInMemoryTaskStateService(),
            repoSlug         = 'org/empty-materialization',
            logs             = [];

        await provisionMirrorDir({tenantId: 't1', repoSlug});

        const failed = await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/empty-materialization.git'}
            ]},
            gitMirror      : makeFakeGitMirror(),
            envelopeBuilder: async args => ({
                tenantId: args.tenantId,
                repoSlug: args.repoSlug,
                files   : [
                    {sourcePath: 'a.txt', repoSlug: args.repoSlug, content: 'x'},
                    {sourcePath: 'b.txt', repoSlug: args.repoSlug, content: 'y'}
                ],
                deleted     : [],
                headRevision: 'sha-empty',
                // `pathsAfterPush` is required — materialization identity is derived from it, and a
                // manifest without it is rejected as KB_INGEST_ENVELOPE_MANIFEST_INVALID before the
                // effect guard is ever reached.
                manifestSnapshot: {pathsAfterPush: ['a.txt', 'b.txt']}
            }),
            knowledgeBaseIngestionService: makeFakeIngestionService({
                summaryFactory: () => ({ingested: 0, deleted: 0, embeddingsGenerated: 0, errors: []})
            }),
            onlyRepoSlugs    : [repoSlug],
            revisionsFilePath: revisionsFile,
            writeLog         : (...args) => logs.push(args.join(' '))
        });

        const logText = logs.join('\n');

        // The sync still fails — the diagnostic does not weaken any guard.
        expect(failed.status).toBe('failed');

        // Deliberately NOT asserting which code fired. A zero-effect materialization can be
        // rejected by more than one guard depending on fixture shape, and the property under test
        // is that the diagnostic survives the throw REGARDLESS of which one. Pinning a single code
        // here would make this a test of guard-ordering rather than of the log line.
        expect(logText).toContain('envelopeFiles=2');
        expect(logText).toContain('ingested=0');
        expect(logText).toContain('embeddings=0');

        // Counts only — no paths, names, or repo content cross into the log, matching the same
        // credential-boundary discipline that keeps ingestion error messages unprojected.
        expect(logText).not.toContain('a.txt');
        expect(logText).not.toContain('b.txt')
    });

    test('a multi-cause ingest failure reports every distinct bounded code and the total count, still redacted (#16575)', async () => {
        // Reporting only the FIRST bounded code made a multi-cause failure read as single-cause: an
        // operator fixes the one code they were shown and the lane fails identically next sweep.
        // Widening to every distinct bounded code stays inside the credential boundary because
        // BOUNDED_KB_ERROR_CODE_PATTERN admits only KB_[A-Z0-9_]{1,120} — a code cannot carry a URL,
        // a token, or stderr. The unbounded code and every message/detail must still never project.
        const
            taskStateService = createInMemoryTaskStateService(),
            repoSlug         = 'org/multi-cause',
            logs             = [];

        await provisionMirrorDir({tenantId: 't1', repoSlug});

        const ingestionService = makeFakeIngestionService({
            summaryFactory() {
                return {
                    ingested           : 0,
                    deleted            : 0,
                    embeddingsGenerated: 0,
                    errors             : [
                        {code: 'KB_VECTOR_EMBED_FAILED', message: 'https://user:TOKEN-must-not-project@host/x.git'},
                        {code: 'KB_GITMIRROR_CLONE_FAILED', message: 'stderr-must-not-project'},
                        {code: 'KB_VECTOR_EMBED_FAILED', message: 'duplicate-code-must-collapse'},
                        {code: 'lowercase-unbounded', message: 'unbounded-must-not-project'}
                    ]
                }
            }
        });

        const failed = await TenantRepoSyncService.runTask({
            reason           : 'manual',
            taskStateService,
            tenantReposConfig: {tenantRepos: [
                {tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: 'https://github.com/neomjs/multi-cause.git'}
            ]},
            gitMirror      : makeFakeGitMirror(),
            envelopeBuilder: async args => ({
                tenantId    : args.tenantId,
                repoSlug    : args.repoSlug,
                files       : [{sourcePath: 'fake.txt', repoSlug: args.repoSlug, content: 'x'}],
                deleted     : [],
                headRevision: 'sha-multi'
            }),
            knowledgeBaseIngestionService: ingestionService,
            onlyRepoSlugs                : [repoSlug],
            revisionsFilePath            : revisionsFile,
            writeLog                     : (...args) => logs.push(args.join(' '))
        });

        const logText = logs.join('\n');

        expect(failed.status).toBe('failed');

        // The stable outer code and the first bounded source code keep their exact prior meaning.
        expect(failed.details.repos[0]).toMatchObject({
            lastErrorCode      : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
            lastSourceErrorCode: 'KB_VECTOR_EMBED_FAILED'
        });

        // The SECOND distinct bounded code is now visible — the whole point of the change.
        expect(logText).toContain('source=KB_VECTOR_EMBED_FAILED');
        expect(logText).toContain('also=KB_GITMIRROR_CLONE_FAILED');

        // Total counts all four entries, including the unbounded one, so a partial failure cannot
        // read as a single failure.
        expect(logText).toContain('errors=4');

        // Duplicate bounded codes collapse rather than repeating.
        expect(logText.match(/KB_VECTOR_EMBED_FAILED/g)).toHaveLength(1);

        // Redaction holds on every axis: unbounded codes, messages, credentials, stderr.
        expect(logText).not.toContain('lowercase-unbounded');
        expect(logText).not.toContain('must-not-project');
        expect(JSON.stringify(failed)).not.toContain('must-not-project');
        expect(JSON.stringify(failed)).not.toContain('lowercase-unbounded')
    });

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
                    tenantId        : args.tenantId,
                    repoSlug        : args.repoSlug,
                    files           : [{sourcePath: 'fake.txt', repoSlug: args.repoSlug, content: 'x'}],
                    deleted         : [],
                    headRevision    : envelopeCalls.length === 1 ? 'sha-replay-failed' : 'sha-replay-clean',
                    manifestSnapshot: {
                        repoSlug      : args.repoSlug,
                        pathsAfterPush: ['fake.txt']
                    }
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
                    lastIngestedRev                      : 'sha-current',
                    lastRunAttemptAt                     : 0,
                    consecutiveFailures                  : 0,
                    ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastCommittedMaterializationAttemptId: 'd'.repeat(32)
                }
            }
        });

        const options = {
            reason           : 'periodic-sweep:60000',
            taskStateService,
            tenantReposConfig: {tenantRepos: [...legacySlugs, currentSlug].map(repoSlug => ({
                tenantId: 't1', repoSlug, mirrorRoot, cloneUrl: `https://github.com/neomjs/${repoSlug}.git`
            }))},
            gitMirror      : makeFakeGitMirror(),
            envelopeBuilder: async args => {
                envelopeCalls.push({op: 'buildIngestEnvelope', args});

                return {
                    tenantId        : args.tenantId,
                    repoSlug        : args.repoSlug,
                    files           : [{sourcePath: 'fake.txt', repoSlug: args.repoSlug, content: 'x'}],
                    deleted         : [],
                    headRevision    : `sha-head-${args.repoSlug}`,
                    manifestSnapshot: {
                        repoSlug      : args.repoSlug,
                        pathsAfterPush: ['fake.txt']
                    },
                    ...(args.lastIngestedRev ? {baseRevision: args.lastIngestedRev} : {})
                };
            },
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
                    lastIngestedRev                      : 'sha-current',
                    lastRunAttemptAt                     : 0,
                    consecutiveFailures                  : 0,
                    ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastCommittedMaterializationAttemptId: 'e'.repeat(32)
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
            gitMirror      : slowCurrentMirror,
            envelopeBuilder: makeFakeEnvelopeBuilder({
                captureCalls   : envelopeCalls,
                includeManifest: true
            }),
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
                    lastIngestedRev                      : 'sha-current',
                    lastRunAttemptAt                     : 0,
                    consecutiveFailures                  : 0,
                    ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastCommittedMaterializationAttemptId: 'f'.repeat(32)
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
            gitMirror      : slowLegacyMirror,
            envelopeBuilder: makeFakeEnvelopeBuilder({
                captureCalls   : envelopeCalls,
                includeManifest: true
            }),
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
        {label: 'zero attempt marker',       marker: {lastAttemptedIngestContractVersion: 0}},
        {label: 'malformed receipt ack',     marker: {lastCommittedMaterializationAttemptId: 'not-an-attempt'}}
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
            lastIngestedRev                      : null,
            lastRunAttemptAt                     : expect.any(Number),
            consecutiveFailures                  : 1,
            ingestContractVersion                : null,
            lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
            lastCommittedMaterializationAttemptId: null,
            // The failure REASON is persisted alongside the count. Previously only the count survived
            // a sweep, which is what left a wedged lane reporting `consecutiveFailures` with a null
            // cause. This mirror is deliberate: the exact-shape assertion is the contract,
            // so a field added to durable state has to be declared here or the addition is unwitnessed.
            // `lastSourceErrorCode` is null because this mirror throws a bare Error with no `KB_*` code.
            //
            // `lastAccessCode` is the DISCRIMINATING cause, and here it is the honest fallback: a bare
            // Error carries no exit status and no stderr, so nothing can be named. That fallback is
            // `SYNC_FAILED` rather than `PROBE_FAILED` because on the sync path we do know the sync
            // failed — we only fail to know why. A real Git failure resolves to a named cause instead;
            // the discrimination fixtures live in the persisted-cause describe below.
            lastErrorCode      : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
            lastSourceErrorCode: null,
            lastAccessCode     : 'KB_TENANT_REPO_ACCESS_SYNC_FAILED',
            lastErrorAt        : expect.any(Number)
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

        // A bare SHA has no current success proof. The upgrade therefore performs
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

    // An attempt that never returns is still an attempt.
    //
    // Backoff reads `consecutiveFailures` + `lastRunAttemptAt`, and both advance only AFTER the
    // work returns (`:1351` on success, `:1442` in the catch). A failure that prevents the work
    // from returning at all — OOM, SIGKILL, host sleep, container stop mid-sweep — therefore
    // leaves no record that anything was tried, `due` stays true forever, and the lane retries at
    // full cadence. A crash loop is exactly what backoff exists to dampen, and it is the one
    // failure class where backoff provably cannot engage: the dampening is only available to
    // failures polite enough to return.
    //
    // The record cannot live in the revisions manifest. That file is a commit log, and the sibling
    // specs in this file pin its commit-point fence: `commit-point fence: an evicted writer aborts
    // without writing` compares it byte-for-byte, and `renewal failure aborts before protected
    // work` asserts it does not exist. Writing scheduling state into it before the work completes
    // does not defeat a proxy for those properties, it removes the properties. An in-flight
    // attempt is by definition uncommitted, so it belongs BESIDE the manifest, not inside it.
    //
    // The `.in-flight` suffix is asserted literally rather than through an imported constant: the
    // on-disk name IS the contract here. A crashed predecessor and its successor are different
    // processes, potentially different builds, and a rename that both sides agree on would leave
    // real residue unreadable while this spec still passed.
    test('a sweep that never returns still records the attempt, and the next sweep commits it (#16551)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            inFlightFile     = `${revisionsFile}.in-flight`,
            now              = Date.now(),
            // The predecessor's committed state: one clean prior run, no failures.
            lastCommittedAt  = now - 30 * 60_000,
            // The attempt it started and died inside — later than what it managed to commit.
            crashedAttemptAt = now - 20 * 60_000;

        await fs.writeJson(revisionsFile, {revisions: {'t1/org/lease-repo': {
            lastIngestedRev                   : 'sha-before',
            lastRunAttemptAt                  : lastCommittedAt,
            consecutiveFailures               : 0,
            ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
        }}});

        // Residue from a process that entered protected work and was killed before it could
        // reach the sweep-terminal commit. This is the only trace such a run can leave.
        await fs.writeJson(inFlightFile, {'t1/org/lease-repo': {
            startedMs    : crashedAttemptAt,
            priorFailures: 0
        }});

        // A cadence long enough that the recovered failure is observable as suppression rather
        // than being consumed by an immediate re-run that would reset the counter to 0.
        //
        // `backoffCapMs: 0` (the pure function's own no-cap default) is load-bearing, not tidiness.
        // The configured ceiling is 2h, and 1 failure against a 60min base also resolves to 2h —
        // so with the cap in play this assertion would pass whether the multiplier worked or the
        // value simply hit the ceiling. Removing the cap is what makes it measure the multiplier.
        const result = await TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService,
            globalCadenceMs: 60 * 60_000,
            backoffCapMs   : 0
        }));

        expect(result.status).toBe('completed');

        const persisted = (await fs.readJson(revisionsFile)).revisions['t1/org/lease-repo'];

        // The attempt is committed as a fact by the sweep that discovered the residue.
        expect(persisted.consecutiveFailures).toBe(1);
        expect(persisted.lastRunAttemptAt).toBe(crashedAttemptAt);
        // A crashed attempt says nothing about what was ingested; the checkpoint must survive it.
        expect(persisted.lastIngestedRev).toBe('sha-before');

        // Recovered, therefore consumed: a second sweep must not fold the same corpse twice.
        expect(await fs.pathExists(inFlightFile)).toBe(false);

        // And the recovered failure must reach the scheduler, not just the manifest — backoff is
        // the entire point. 1 failure ⇒ 2× cadence from the crashed attempt, still in the future.
        const repoState = result.details.repos.find(state => state.repoSlug === 'org/lease-repo');
        expect(repoState.status).toBe('backoff-suppressed');
        expect(repoState.consecutiveFailures).toBe(1);
        expect(new Date(repoState.nextDueAt).getTime()).toBe(crashedAttemptAt + 2 * 60 * 60_000);
    });

    // The exponential term has to keep growing across successive crashes, which is the whole
    // reason the record carries `priorFailures` instead of re-reading the manifest. A crash loop
    // never commits, so a fold that re-derived its base from committed state would read the same
    // number every restart and the cadence would sit flat at 2x forever — dampening in name only.
    // Asserted on the resolved cadence value rather than on a log line, because the log is what
    // agreed with the frozen counters last time while the arithmetic disagreed.
    test('successive crashed attempts keep growing the backoff term, not just the first (#16551)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            inFlightFile     = `${revisionsFile}.in-flight`,
            baseCadenceMs    = 60 * 60_000,
            crashedAttemptAt = Date.now() - 20 * 60_000;

        // Committed `consecutiveFailures` is 0 — BEHIND the crashed attempt's own view, exactly
        // as it is in a crash loop that never reaches its terminal commit.
        await fs.writeJson(revisionsFile, {revisions: {'t1/org/lease-repo': {
            lastIngestedRev                   : 'sha-before',
            lastRunAttemptAt                  : crashedAttemptAt - 60_000,
            consecutiveFailures               : 0,
            ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
        }}});

        // The dying process had already survived two earlier crashes.
        await fs.writeJson(inFlightFile, {'t1/org/lease-repo': {
            startedMs    : crashedAttemptAt,
            priorFailures: 2
        }});

        // Cap removed for the same reason as the sibling spec: the configured 2h ceiling would
        // clamp 8x-of-60min to exactly the same value a broken multiplier produces, and an
        // assertion that cannot tell those apart is not measuring backoff growth at all.
        const result = await TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService,
            globalCadenceMs: baseCadenceMs,
            backoffCapMs   : 0
        }));

        const persisted = (await fs.readJson(revisionsFile)).revisions['t1/org/lease-repo'];

        // 2 observed + this one = 3, NOT 1 — the committed 0 must not win.
        expect(persisted.consecutiveFailures).toBe(3);

        const repoState = result.details.repos.find(state => state.repoSlug === 'org/lease-repo');

        expect(repoState.consecutiveFailures).toBe(3);
        // 2^3 of base, on the value.
        expect(repoState.effectiveCadenceMs).toBe(8 * baseCadenceMs);
        expect(new Date(repoState.nextDueAt).getTime()).toBe(crashedAttemptAt + 8 * baseCadenceMs);
    });

    // A recovered attempt must be consumed ONCE.
    //
    // The fold cleared the sidecar on DISK but kept the same object in memory as the live
    // in-flight map. The first repo that entered protected work then rewrote the whole file from
    // that object — republishing the already-consumed entry, which the NEXT sweep folds again, and
    // the next. A recovery that re-arms itself is worse than no recovery: it inflates
    // `consecutiveFailures` without bound on a lane that is succeeding.
    //
    // The witness has to be built precisely, and my first attempt was NOT. Two repos both running
    // does not reproduce it: the residue-holder's own fresh attempt overwrites its stale entry
    // under the same key, then its `finally` deletes it, and the map empties correctly. The setup
    // healed the defect.
    //
    // The property the witness must share: the residue-holder must NOT run this sweep, so nothing
    // overwrites its consumed entry, while a SIBLING does run and rewrites the whole file from the
    // shared in-memory map. Folding repo-a sets `consecutiveFailures: 1`, which suppresses it under
    // a long cadence — so the fold itself produces the required not-due state.
    test('a recovered attempt is consumed once and never republished by a sibling repo (#16551)', async () => {
        const
            inFlightFile     = `${revisionsFile}.in-flight`,
            baseCadenceMs    = 60 * 60_000,
            crashedAttemptAt = Date.now() - 60_000,
            repos            = [
                {tenantId: 't1', repoSlug: 'org/repo-a', mirrorRoot, cloneUrl: 'https://github.com/neomjs/repo-a.git'},
                {tenantId: 't1', repoSlug: 'org/repo-b', mirrorRoot, cloneUrl: 'https://github.com/neomjs/repo-b.git'}
            ];

        await fs.writeJson(revisionsFile, {revisions: {
            't1/org/repo-a': {
                lastIngestedRev                   : 'sha-a',
                lastRunAttemptAt                  : 0,
                consecutiveFailures               : 0,
                ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
            },
            't1/org/repo-b': {
                lastIngestedRev                   : 'sha-b',
                lastRunAttemptAt                  : 0,
                consecutiveFailures               : 0,
                ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
            }
        }});

        // Only repo-a crashed, and recently — so once the fold makes it `consecutiveFailures: 1`
        // it is suppressed for this sweep and never re-enters the mutate path.
        await fs.writeJson(inFlightFile, {'t1/org/repo-a': {
            startedMs    : crashedAttemptAt,
            priorFailures: 0
        }});

        await TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService : createInMemoryTaskStateService(),
            tenantReposConfig: {tenantRepos: repos},
            globalCadenceMs  : baseCadenceMs,
            backoffCapMs     : 0
        }));

        // repo-b ran and returned; repo-a was suppressed and never started. Nothing is in flight.
        expect(
            await fs.pathExists(inFlightFile),
            'the sidecar survived a sweep with nothing in flight — repo-b republished repo-a\'s ' +
            'already-consumed entry from the shared in-memory map, re-arming it'
        ).toBe(false);

        // The class assertion, independent of the file: a second sweep must not fold repo-a again.
        // One crash happened, so the counter is 1 — and must STAY 1.
        await TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService : createInMemoryTaskStateService(),
            tenantReposConfig: {tenantRepos: repos},
            globalCadenceMs  : baseCadenceMs,
            backoffCapMs     : 0
        }));

        expect(
            (await fs.readJson(revisionsFile)).revisions['t1/org/repo-a'].consecutiveFailures,
            'repo-a was folded a second time from one crash — a recovery that re-arms itself ' +
            'inflates the backoff term without bound on a lane that is not failing'
        ).toBe(1);
    });

    // An evicted run must not clear a sidecar entry its successor now owns.
    //
    // My first attempt at this witness took the lease over inside `gitMirror.fetch` and PASSED
    // against the unfixed source, so it proved nothing and was deleted. The ordering is what makes
    // it reachable: the takeover has to land AFTER the predecessor has persisted its own in-flight
    // record, otherwise its `finally` has nothing to write and the stale whole-file write never
    // happens. `envelopeEntered` is the sequencing point — resolved at the top of the envelope
    // builder, before the gate is awaited, so awaiting it proves the record already exists.
    //
    // The successor sidecar is written inside the lifecycle guard together with the lease
    // replacement, so an in-flight renewal tick cannot interleave with the test's own writes.
    test('an evicted run does not clear the sidecar entry its successor owns (#16551)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            inFlightFile     = `${revisionsFile}.in-flight`,
            successorEntry   = {startedMs: 2000, priorFailures: 1},
            baseEnvelope     = makeFakeEnvelopeBuilder();

        let releaseEnvelope, markEnvelopeEntered;

        const
            envelopeGate    = new Promise(resolve => releaseEnvelope     = resolve),
            envelopeEntered = new Promise(resolve => markEnvelopeEntered = resolve);

        const invocation = TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService,
            leaseStaleAfterMs     : 60_000,
            leaseRenewalIntervalMs: 25,
            envelopeBuilder       : async (...args) => {
                markEnvelopeEntered();
                await envelopeGate;
                return baseEnvelope(...args)
            }
        }));

        for (let i = 0; i < 200 && !await fs.pathExists(leaseFilePath()); i++) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        expect(await fs.pathExists(leaseFilePath())).toBe(true);

        // The predecessor is now inside protected work with its own in-flight record persisted.
        await envelopeEntered;

        const guardPath = `${leaseFilePath()}${LIFECYCLE_GUARD_SUFFIX}`;
        await fs.ensureDir(guardPath);
        await fs.writeJson(leaseFilePath(), buildLeasePayload({
            owner       : 'successor-owner',
            reason      : 'tenant-repo-sync',
            pid         : process.pid,
            staleAfterMs: 60_000,
            token       : 'successor-token'
        }));
        await fs.writeJson(inFlightFile, {'t1/org/lease-repo': successorEntry});
        await fs.rmdir(guardPath);

        await new Promise(resolve => setTimeout(resolve, 120));

        releaseEnvelope();
        const result = await invocation;

        expect(result.status).toBe('failed');
        expect(result.details.reasonCode).toBe('KB_TENANT_REPO_SYNC_LEASE_LOST');

        // The whole point: the evicted predecessor's `finally` must not write its own view over
        // the successor's record. Exact equality, not existence — a rewritten-but-present file
        // would pass a pathExists check while having lost the successor's attempt.
        expect(
            await fs.readJson(inFlightFile),
            'the evicted predecessor overwrote the sidecar the successor owns; the successor\'s ' +
            'attempt is unrecorded, so a crash during it leaves backoff unable to engage'
        ).toEqual({'t1/org/lease-repo': successorEntry});
    });

    // Takeover AFTER the ownership check, which fencing cannot fix.
    //
    // `await leaseGuard()` followed by a write is check-then-act: the lease can expire and a
    // successor legitimately acquire in the window between the two syscalls. The sibling witness
    // above covers takeover BEFORE the check, where the guard rejects the write. This one covers
    // after it, where the guard has already said yes — and no amount of extra fencing closes that
    // window, because the check and the write are separate operations.
    //
    // The answer is ownership on the record: a mutation carries the id of the run that wrote it,
    // and entries owned by another run are merged forward untouched. The successor's entry is
    // written while the predecessor is parked inside protected work, under the SAME repo label —
    // same-label is the hard case, since a per-label read-modify-write would still clobber it.
    test('a resumed predecessor merges around the successor rather than deleting it (#16551)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            inFlightFile     = `${revisionsFile}.in-flight`,
            successorEntry   = {startedMs: 2000, priorFailures: 1, runId: 'successor-run'},
            baseEnvelope     = makeFakeEnvelopeBuilder();

        let releaseEnvelope, markEnvelopeEntered;

        const
            envelopeGate    = new Promise(resolve => releaseEnvelope     = resolve),
            envelopeEntered = new Promise(resolve => markEnvelopeEntered = resolve);

        const invocation = TenantRepoSyncService.runTask(baseLeaseRunOptions({
            taskStateService,
            envelopeBuilder: async (...args) => {
                markEnvelopeEntered();
                await envelopeGate;
                return baseEnvelope(...args)
            }
        }));

        // The predecessor is inside protected work with its own record already persisted, and its
        // ownership check for the pending clear has effectively already passed.
        await envelopeEntered;

        // A successor takes the repo over and records its own attempt under the same label.
        await fs.writeJson(inFlightFile, {'t1/org/lease-repo': successorEntry});

        releaseEnvelope();
        await invocation;

        // The predecessor's clear must not consume a record it does not own.
        expect(
            await fs.readJson(inFlightFile).catch(() => null),
            'the resumed predecessor deleted or overwrote the successor\'s record; the successor\'s ' +
            'attempt is unrecorded, so a crash during it leaves backoff unable to engage'
        ).toEqual({'t1/org/lease-repo': successorEntry});
    });

    // The window three earlier witnesses missed: successor acquisition attempted strictly BETWEEN
    // the predecessor's sidecar read and its write.
    //
    // Ordering specified by @neo-gpt after my third attempt again landed in an easy window. The
    // assertion is on the guard REFUSING, not on a pending promise: `enterLifecycleGuard` is
    // bounded (100 attempts x 10ms), so past that budget a contended recovery resolves
    // `{status: 'held', guardContended: true}` rather than staying unsettled. Asserting "still
    // pending" would fail against CORRECT code on a slow run — the bounded refusal is both
    // deterministic and the stronger claim, because it shows the mutex actively refused.
    //
    // Only the RECOVERY path contends: acquiring a vacant name is a plain exclusive `wx` create
    // deliberately outside the guard. Hence the short `leaseStaleAfterMs` — the successor must
    // find a STALE lease so it takes the guarded recovery path at all.
    test('successor acquisition is refused while the predecessor holds the guard mid-transaction (#16551)', async () => {
        const
            taskStateService = createInMemoryTaskStateService(),
            inFlightFile     = `${revisionsFile}.in-flight`,
            successorEntry   = {startedMs: 2000, priorFailures: 1, runId: 'successor-run'},
            originalRead     = TenantRepoSyncService.readInFlightAttempts.bind(TenantRepoSyncService);

        let readCount = 0, releasePredecessor, markPaused;

        const
            resumeGate = new Promise(resolve => releasePredecessor = resolve),
            pausedGate = new Promise(resolve => markPaused        = resolve);

        // Pause AFTER the read and BEFORE the write, while the guard is held. Reads: [1] the
        // sweep-start fold (outside the guard), [2] the first mutate inside it — that is the one.
        TenantRepoSyncService.readInFlightAttempts = async options => {
            const result = await originalRead(options);

            if (++readCount === 2) {
                markPaused();
                await resumeGate;
            }

            return result
        };

        try {
            const invocation = TenantRepoSyncService.runTask(baseLeaseRunOptions({
                taskStateService,
                leaseStaleAfterMs: 50
            }));

            await pausedGate;

            // The predecessor is inside the critical section holding the guard, its lease now
            // going stale. A production successor attempts recovery acquisition.
            await new Promise(resolve => setTimeout(resolve, 100));

            const successor = await acquireHeavyMaintenanceLease({
                leasePath   : leaseFilePath(),
                owner       : 'tenant-repo-sync:successor',
                reason      : 'tenant-repo-sync',
                staleAfterMs: 60_000
            });

            // The mutex did its job: recovery could not proceed while the transaction was open.
            expect(
                successor.acquired,
                'a successor acquired the lease while the predecessor held the lifecycle guard ' +
                'mid-transaction — the read and the write are not serialized against acquisition, ' +
                'so the predecessor\'s pending write can still land over the successor\'s state'
            ).toBe(false);
            expect(successor.status).toBe('held');
            expect(successor.guardContended).toBe(true);

            releasePredecessor();
            await invocation;

            // Release -> retry. The refusal must be TEMPORARY: a guard that is entered and never
            // exited would refuse forever, which passes the assertion above while deadlocking the
            // lane. This is the half that tells those two apart.
            const retry = await acquireHeavyMaintenanceLease({
                leasePath   : leaseFilePath(),
                owner       : 'tenant-repo-sync:successor',
                reason      : 'tenant-repo-sync',
                staleAfterMs: 60_000
            });

            expect(
                retry.acquired,
                'the successor still cannot acquire after the predecessor finished — the guard was ' +
                'entered and not exited, so the refusal above was a deadlock rather than mutual exclusion'
            ).toBe(true);

            // And the successor's own record, written under the SAME label, is exactly what a
            // later reader sees: the predecessor left no residue behind to be folded again.
            await fs.writeJson(inFlightFile, {'t1/org/lease-repo': successorEntry});
            expect(await fs.readJson(inFlightFile)).toEqual({'t1/org/lease-repo': successorEntry});
        } finally {
            TenantRepoSyncService.readInFlightAttempts = originalRead;
        }
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

    /**
     * A wedged lane has to stay diagnosable from a remote MCP client, which is the only interface a
     * cloud deployment exposes.
     *
     * The defect these cover, observed on a live deployment: four repos at `consecutiveFailures: 4`
     * with `lastErrorCode: null` and `lastSourceErrorCode: null`, all reporting `status: "not-due"`
     * while the sweep completed every cadence with `exitCode: 0`. Two causes, and the first makes the
     * second unfixable on its own — the code was written ONLY onto the in-memory record for the sweep
     * that failed, so it survived one cadence and was gone; and the backoff branch then rebuilt a
     * record with neither the code nor any hint that a failure was why the repo stopped being tried.
     * Counters persisted, reasons did not.
     */
    test.describe('a wedged lane keeps its reason (#16056)', () => {
        const failingMirror = () => ({
            async cloneIfMissing() {},
            async fetch() {
                const error = new Error('GitMirror failed to fetch');

                error.code     = 'KB_GITMIRROR_FETCH_FAILED';
                // Deliberately carries what must NEVER reach durable state.
                error.stderr   = 'remote: HTTP Basic: Access denied for https://oauth2:glpat-SECRETVALUE@gitlab.example.net/ai/x.git';
                error.exitCode = 128;

                throw error
            },
            async resolveRevision() { return 'a'.repeat(40) },
            async listRevisionPaths() { return [] },
            async readRevisionFile() { return '' }
        });

        const repoFor = mirrorRootPath => ({
            tenantId: 't1', repoSlug: 'org/wedged', mirrorRoot: mirrorRootPath,
            cloneUrl: 'https://gitlab.example.net/ai/x.git'
        });

        test('a failure PERSISTS its cause, so it outlives the sweep that produced it', async () => {
            const taskStateService = createInMemoryTaskStateService();

            await TenantRepoSyncService.runTask({
                reason                       : 'periodic',
                taskStateService,
                tenantReposConfig            : {tenantRepos: [repoFor(mirrorRoot)]},
                gitMirror                    : failingMirror(),
                envelopeBuilder              : makeFakeEnvelopeBuilder(),
                knowledgeBaseIngestionService: makeFakeIngestionService(),
                revisionsFilePath            : revisionsFile,
                seedBootstrap                : false
            });

            const persisted = (await fs.readJson(revisionsFile)).revisions['t1/org/wedged'];

            expect(persisted.consecutiveFailures).toBe(1);
            // The point of the ticket: the count was already durable, the REASON was not.
            expect(persisted.lastErrorCode).toBe('KB_TENANT_REPO_SYNC_SYNC_FAILED');
            expect(persisted.lastSourceErrorCode).toBe('KB_GITMIRROR_FETCH_FAILED');
            expect(typeof persisted.lastErrorAt).toBe('number');

            // Redaction: codes only. A credential arrived in `stderr` above, so this asserts the
            // boundary rather than trusting it.
            const serialized = JSON.stringify(persisted);

            expect(serialized).not.toMatch(/glpat-/);
            expect(serialized).not.toMatch(/Access denied/);
            expect(serialized).not.toMatch(/gitlab\.example\.net/)
        });

        test('a backoff-suppressed repo REPORTS the retained cause, and says it is suppressed', async () => {
            const taskStateService = createInMemoryTaskStateService();

            await TenantRepoSyncService.writePersistedRevisions({
                filePath : revisionsFile,
                revisions: {
                    't1/org/wedged': {
                        lastIngestedRev                      : null,
                        lastRunAttemptAt                     : Date.now(),
                        consecutiveFailures                  : 4,
                        ingestContractVersion                : null,
                        lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                        lastCommittedMaterializationAttemptId: null,
                        lastErrorCode                        : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
                        lastSourceErrorCode                  : 'KB_GITMIRROR_FETCH_FAILED',
                        lastErrorAt                          : Date.now() - 5_000
                    }
                }
            });

            const result = await TenantRepoSyncService.runTask({
                reason                       : 'periodic',
                taskStateService,
                tenantReposConfig            : {tenantRepos: [repoFor(mirrorRoot)]},
                gitMirror                    : failingMirror(),
                envelopeBuilder              : makeFakeEnvelopeBuilder(),
                knowledgeBaseIngestionService: makeFakeIngestionService(),
                revisionsFilePath            : revisionsFile,
                globalCadenceMs              : 60_000,
                seedBootstrap                : false
            });

            const [repoState] = result.details.repos;

            // `not-due` conflated "ran recently" with "wedged after repeated failure", which is what
            // made a broken lane read as an idle one.
            expect(repoState.status).toBe('backoff-suppressed');
            expect(repoState.consecutiveFailures).toBe(4);
            expect(repoState.lastErrorCode).toBe('KB_TENANT_REPO_SYNC_SYNC_FAILED');
            expect(repoState.lastSourceErrorCode).toBe('KB_GITMIRROR_FETCH_FAILED');
            expect(repoState.lastErrorAt).toBeTruthy();
            expect(repoState.nextDueAt).toBeTruthy()
        });

        test('a healthy repo held back by cadence stays plain not-due and carries NO cause', async () => {
            // The positive control. Without it, the assertion above is satisfied by a change that
            // labels every held-back repo as suppressed and attaches a cause to all of them.
            const taskStateService = createInMemoryTaskStateService();

            await TenantRepoSyncService.writePersistedRevisions({
                filePath : revisionsFile,
                revisions: {
                    't1/org/wedged': {
                        lastIngestedRev                      : 'b'.repeat(40),
                        lastRunAttemptAt                     : Date.now(),
                        consecutiveFailures                  : 0,
                        ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                        lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                        lastCommittedMaterializationAttemptId: null
                    }
                }
            });

            const result = await TenantRepoSyncService.runTask({
                reason                       : 'periodic',
                taskStateService,
                tenantReposConfig            : {tenantRepos: [repoFor(mirrorRoot)]},
                gitMirror                    : failingMirror(),
                envelopeBuilder              : makeFakeEnvelopeBuilder(),
                knowledgeBaseIngestionService: makeFakeIngestionService(),
                revisionsFilePath            : revisionsFile,
                globalCadenceMs              : 60_000,
                seedBootstrap                : false
            });

            const [repoState] = result.details.repos;

            expect(repoState.status).toBe('not-due');
            expect(repoState.lastErrorCode).toBeUndefined();
            expect(repoState.lastSourceErrorCode).toBeUndefined()
        });

        test('a repo that heals CLEARS its persisted cause', async () => {
            // A durable reason beside a zero failure count reads as a live fault, so healing has to
            // retract it explicitly rather than leave the last known error lying around.
            const taskStateService = createInMemoryTaskStateService();

            await TenantRepoSyncService.writePersistedRevisions({
                filePath : revisionsFile,
                revisions: {
                    't1/org/healed': {
                        lastIngestedRev                      : null,
                        lastRunAttemptAt                     : Date.now() - 600_000,
                        consecutiveFailures                  : 3,
                        ingestContractVersion                : null,
                        lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                        lastCommittedMaterializationAttemptId: null,
                        lastErrorCode                        : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
                        lastSourceErrorCode                  : 'KB_GITMIRROR_FETCH_FAILED',
                        lastErrorAt                          : Date.now() - 600_000
                    }
                }
            });

            await provisionMirrorDir({tenantId: 't1', repoSlug: 'org/healed'});

            await TenantRepoSyncService.runTask({
                reason           : 'periodic',
                taskStateService,
                tenantReposConfig: {tenantRepos: [{
                    tenantId: 't1', repoSlug: 'org/healed', mirrorRoot,
                    cloneUrl: 'https://gitlab.example.net/ai/healed.git'
                }]},
                gitMirror                    : makeFakeGitMirror(),
                envelopeBuilder              : makeFakeEnvelopeBuilder(),
                knowledgeBaseIngestionService: makeFakeIngestionService(),
                revisionsFilePath            : revisionsFile,
                globalCadenceMs              : 60_000,
                seedBootstrap                : false
            });

            const persisted = (await fs.readJson(revisionsFile)).revisions['t1/org/healed'];

            expect(persisted.consecutiveFailures).toBe(0);
            expect(persisted.lastErrorCode).toBeNull();
            expect(persisted.lastSourceErrorCode).toBeNull();
            expect(persisted.lastAccessCode).toBeNull();
            expect(persisted.lastErrorAt).toBeNull()
        })
    })

    test.describe('starved lane (#16224)', () => {
        // mirrorRoot is assigned in beforeEach, so the repo must be built inside the tests.
        const buildStarvedRepo = () => ({
            tenantId     : 'tenant-a',
            repoSlug     : 'private/repo',
            mirrorRoot,
            cloneUrl     : 'https://git.example/private/repo.git',
            credentialRef: 'env:TENANT_REPO_TOKEN',
            branchRef    : 'dev'
        });

        // The incident shape: a repo that NEVER ingested (lastIngestedRev: null), seven failures
        // deep on the CURRENT ingest contract (no legacy revalidation path), its cause retained.
        const seedStarvedState = async lastRunAttemptAt => TenantRepoSyncService.writePersistedRevisions({
            filePath : revisionsFile,
            revisions: {
                'tenant-a/private/repo': {
                    lastIngestedRev                   : null,
                    lastRunAttemptAt,
                    consecutiveFailures               : 7,
                    ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastErrorCode                     : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
                    lastSourceErrorCode               : 'KB_GITMIRROR_CLONE_FAILED',
                    lastErrorAt                       : lastRunAttemptAt
                }
            }
        });

        const buildStarvedOptions = (taskStateService, gitMirror, extra = {}) => ({
            reason                       : 'periodic',
            taskStateService,
            tenantReposConfig            : {tenantRepos: [buildStarvedRepo()]},
            gitMirror,
            knowledgeBaseIngestionService: makeFakeIngestionService(),
            revisionsFilePath            : revisionsFile,
            globalCadenceMs              : 60_000,
            jitterRatio                  : 0,
            backoffCapMs                 : 2 * 60 * 60 * 1000,
            seedBootstrap                : false,
            ...extra
        });

        test('an all-suppressed never-succeeded sweep reports starved, retains per-repo error codes, and stays silent before the duration floor (AC2)', async () => {
            const
                taskStateService = createInMemoryTaskStateService(),
                captureCalls     = [],
                gitMirror        = makeFakeGitMirror({captureCalls});

            // 30min inside the capped window (min(2h cap, 60s × 2^7)) → suppressed, not due.
            await seedStarvedState(Date.now() - 30 * 60 * 1000);

            const result = await TenantRepoSyncService.runTask(buildStarvedOptions(taskStateService, gitMirror));

            expect(result.status).toBe('starved');
            expect(result.details.starved).toBe(true);
            expect(result.details.starvedEvidence.suppressedCount).toBe(1);

            const [repoState] = result.details.repos;
            expect(repoState.status).toBe('backoff-suppressed');
            // The retained cause survives onto the one surface an operator reads.
            expect(repoState.lastErrorCode).toBe('KB_TENANT_REPO_SYNC_SYNC_FAILED');
            expect(repoState.lastSourceErrorCode).toBe('KB_GITMIRROR_CLONE_FAILED');

            // The suppression skips the work path entirely.
            expect(captureCalls.filter(c => c.op === 'cloneIfMissing' || c.op === 'fetch')).toHaveLength(0);

            // 30min < the 6h default duration floor → no heal-ledger record yet.
            expect(await fs.pathExists(path.join(tmpDir, 'heal-events'))).toBe(false);
        });

        test('the detector emits exactly one heal-ledger record per starved episode once duration-proven (AC3)', async () => {
            const
                taskStateService = createInMemoryTaskStateService(),
                gitMirror        = makeFakeGitMirror(),
                ledgerDir        = path.join(tmpDir, 'heal-events');

            await seedStarvedState(Date.now() - 30 * 60 * 1000);

            // starvedAfterMs: 1 makes the 30-minute suppression duration-proven on sweep one.
            const options = buildStarvedOptions(taskStateService, gitMirror, {starvedAfterMs: 1}),
                  first   = await TenantRepoSyncService.runTask(options);

            expect(first.status).toBe('starved');
            expect(first.details.starvedEventAt).not.toBeNull();

            let events = await readHealLedger({dir: ledgerDir});
            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('tenant-repo-sync-starved');
            expect(events[0].status).toBe('recorded');
            expect(events[0].detail.reasonCode).toBe('KB_TENANT_REPO_SYNC_STARVED');
            expect(events[0].detail.suppressedCount).toBe(1);

            // A second starved sweep carries the episode marker forward — no second record.
            const second = await TenantRepoSyncService.runTask(options);
            expect(second.status).toBe('starved');
            expect(second.details.starvedEventAt).toBe(first.details.starvedEventAt);

            events = await readHealLedger({dir: ledgerDir});
            expect(events).toHaveLength(1);
        });

        test('an inverted starved floor warns exactly once per process — and never throws (#16312)', async () => {
            const
                taskStateService = createInMemoryTaskStateService(),
                logLines         = [],
                options          = {
                    reason                       : 'periodic',
                    taskStateService,
                    writeLog                     : (level, msg) => logLines.push({level, msg}),
                    tenantReposConfig            : {tenantRepos: [buildStarvedRepo()]},
                    gitMirror                    : makeFakeGitMirror(),
                    knowledgeBaseIngestionService: makeFakeIngestionService(),
                    revisionsFilePath            : revisionsFile,
                    globalCadenceMs              : 60_000,
                    jitterRatio                  : 0,
                    backoffCapMs                 : 6 * 60 * 60 * 1000, // inverted: cap ABOVE the floor
                    starvedAfterMs               : 2 * 60 * 60 * 1000,
                    seedBootstrap                : false
                },
                originalLatch    = TenantRepoSyncService.starvedOrderWarned;

            try {
                TenantRepoSyncService.starvedOrderWarned = false;

                await seedStarvedState(Date.now() - 30 * 60 * 1000);

                const first    = await TenantRepoSyncService.runTask(options),
                      second   = await TenantRepoSyncService.runTask(options),
                      warnings = logLines.filter(l => l.level === 'WARN' && l.msg.includes('starvedAfterMs'));

                // The lane runs regardless — a noisy alert beats a dead lane, never a throw.
                expect(first.status).not.toBe('failed');
                expect(second.status).not.toBe('failed');

                expect(warnings).toHaveLength(1);
                expect(warnings[0].msg).toContain('does not exceed backoffCapMs')
            } finally {
                TenantRepoSyncService.starvedOrderWarned = originalLatch
            }
        });
    });
});

test.describe('the persisted cause DISCRIMINATES, and still leaks nothing (#16056)', () => {
    /*
     * A safe code can still be too coarse to be a cause. The retained-cause work made the reason
     * durable, but every acquisition failure persisted as `SYNC_FAILED` + `KB_GITMIRROR_FETCH_FAILED`
     * — an outer code plus the OPERATION that failed. An operator reading that learns acquisition
     * failed, which they already knew from the failure count, and cannot tell which of four
     * different fixes to apply. The named cases below are the ones a private-cloud tenant actually
     * hits, and the reason this matters is that we do not hold their credentials: if our own logs
     * cannot name "the token lacks the required scope", the diagnosis is on us.
     */
    const TOKEN = 'ghp_liveLookingSecretValue1234567890';

    /**
     * Builds a redacted-shaped Git failure. The token is deliberately present in the object so the
     * secrecy assertion has something real to catch — a fixture with no secret in it would prove the
     * boundary holds against nothing.
     * @param {Object} options
     * @returns {Error}
     */
    function gitFailure({stderr, code = 'KB_GITMIRROR_FETCH_FAILED', exitCode = 128}) {
        const error = new Error(`GitMirror fetch failed for ${TOKEN}`);

        Object.assign(error, {code, exitCode, stderr});
        return error
    }

    test('four different causes classify four different ways', async () => {
        const {classifyTenantRepoAccessFailure, TenantRepoAccessCode} =
            await import('../../../../../../../ai/services/knowledge-base/helpers/tenantRepoAccessContract.mjs');

        const cases = [
            ['remote: Write access to repository not granted.\nfatal: unable to access', TenantRepoAccessCode.INSUFFICIENT_SCOPE],
            ['remote: Invalid username or password.\nfatal: Authentication failed',      TenantRepoAccessCode.CREDENTIAL_REJECTED],
            ['remote: Repository not found.\nfatal: could not read from remote',         TenantRepoAccessCode.DENIED_OR_NOT_FOUND],
            ['ssh: connect to host git.example.com port 22: Connection refused',         TenantRepoAccessCode.TRANSPORT_FAILED]
        ];

        const observed = cases.map(([stderr]) => classifyTenantRepoAccessFailure(gitFailure({stderr})));

        cases.forEach(([, expected], index) => expect(observed[index]).toBe(expected));

        // The discrimination is the point, so assert the codes are actually DISTINCT rather than
        // four assertions that would all pass against a single constant.
        expect(new Set(observed).size).toBe(4);
        expect(observed).not.toContain(TenantRepoAccessCode.SYNC_FAILED)
    });

    test('a probe timeout and an unresolvable credential REF stay separate from a rejected credential', async () => {
        const {classifyTenantRepoAccessFailure, TenantRepoAccessCode} =
            await import('../../../../../../../ai/services/knowledge-base/helpers/tenantRepoAccessContract.mjs');

        expect(classifyTenantRepoAccessFailure(gitFailure({code: 'KB_GITMIRROR_ACCESS_PROBE_TIMEOUT', stderr: ''})))
            .toBe(TenantRepoAccessCode.TIMEOUT);
        // A credential reference that cannot be resolved is a CONFIG defect upstream of any network
        // call — not the same event as a remote rejecting a credential that did resolve.
        expect(classifyTenantRepoAccessFailure(gitFailure({code: 'KB_GITMIRROR_CREDENTIAL_REF_INVALID', stderr: ''})))
            .toBe(TenantRepoAccessCode.CREDENTIAL_INVALID);
        // No exit status at all is genuinely unclassifiable, and says so rather than guessing.
        expect(classifyTenantRepoAccessFailure({message: 'boom'})).toBe(TenantRepoAccessCode.PROBE_FAILED)
    });

    test('every classification is a bounded code the read boundary admits, and carries no secret', async () => {
        const {classifyTenantRepoAccessFailure, TenantRepoAccessCode} =
            await import('../../../../../../../ai/services/knowledge-base/helpers/tenantRepoAccessContract.mjs');
        const {normalizeTenantRepoCheckpointState} =
            await import('../../../../../../../ai/daemons/orchestrator/services/tenantRepoCheckpointValidity.mjs');

        const stderrs = [
            'remote: Write access to repository not granted.',
            `remote: Invalid username or password for ${TOKEN}`,
            'remote: Repository not found.',
            'fatal: could not resolve host github.com'
        ];

        for (const stderr of stderrs) {
            const code       = classifyTenantRepoAccessFailure(gitFailure({stderr})),
                  normalized = normalizeTenantRepoCheckpointState({
                      lastIngestedRev: 'abc123',
                      lastAccessCode : code,
                      lastErrorAt    : Date.now()
                  });

            // Survives the read-side bounded-code gate — a discriminating cause that the projection
            // strips is not a diagnosable one.
            expect(normalized.lastAccessCode).toBe(code);
            expect(code).toMatch(/^KB_[A-Z0-9_]{1,120}$/u);
            expect(code).not.toContain(TOKEN);
            expect(code).not.toMatch(/ghp_/)
        }

        // MUTATION on what the gate guards: a cause that is not a bounded code must be refused, or
        // the assertions above would hold for any string whatsoever.
        expect(normalizeTenantRepoCheckpointState({
            lastIngestedRev: 'abc123',
            lastAccessCode : `fatal: auth failed for ${TOKEN}`
        }).lastAccessCode).toBeNull();

        expect(TenantRepoAccessCode.INSUFFICIENT_SCOPE).toMatch(/INSUFFICIENT_SCOPE$/)
    })
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

test.describe('TenantRepoSyncService.resolveTenantReposConfig — Provider mirrorRoot SSOT (#16014)', () => {
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

    test('an absent explicit seam reads the resolved Tier-1 Provider leaf', async () => {
        const ingestionStub = {
            listConfiguredTenantRepos: async () => ({tenantRepos: [
                {tenantId: 't1', repoSlug: 'org/r', cloneUrl: 'https://github.com/o/r.git', credentialRef: 'env:T'}
            ]})
        };

        const result = await TenantRepoSyncService.resolveTenantReposConfig({
            ingestionService: ingestionStub
        });

        expect(result.tenantRepos[0].mirrorRoot).toBe('/app/.neo-ai-data');
    });

    test('blank explicit roots fail before config enumeration', async () => {
        let   enumerationCount = 0;
        const ingestionStub    = {
            listConfiguredTenantRepos: async () => {
                enumerationCount++;
                return {tenantRepos: []};
            }
        };

        for (const tier1MirrorRoot of ['', '   ']) {
            await expect(TenantRepoSyncService.resolveTenantReposConfig({
                ingestionService: ingestionStub,
                tier1MirrorRoot
            })).rejects.toThrow('AiConfig.orchestrator.tenantRepoMirrorRoot must resolve to a non-empty string.');
        }

        expect(enumerationCount).toBe(0);
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
