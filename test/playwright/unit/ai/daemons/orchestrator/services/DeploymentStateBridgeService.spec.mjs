import {test, expect}                 from '@playwright/test';
import fs                             from 'fs';
import os                             from 'os';
import path                           from 'path';
import Neo                            from '../../../../../../../src/Neo.mjs';
import * as core                      from '../../../../../../../src/core/_export.mjs';
import AiConfig                       from '../../../../../../../ai/config.mjs';
import {DeploymentStateBridgeService} from '../../../../../../../ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs';

const OBSERVED_AT = 1710000000000;
let originalDeploymentStateBridgeConfig,
    originalRuntimeAccessConfig;

function statsSample({cpuPercent = 0, memoryPercent = 0} = {}) {
    const systemDelta = 1_000_000_000,
          cpuDelta    = (cpuPercent / 100) * systemDelta / 4,
          memoryLimit = 1000;

    return {
        cpu_stats: {
            online_cpus     : 4,
            system_cpu_usage: systemDelta,
            cpu_usage       : {
                total_usage : cpuDelta,
                percpu_usage: [cpuDelta / 4, cpuDelta / 4, cpuDelta / 4, cpuDelta / 4]
            }
        },
        precpu_stats: {
            system_cpu_usage: 0,
            cpu_usage       : {total_usage: 0}
        },
        memory_stats: {
            usage: memoryLimit * memoryPercent / 100,
            limit: memoryLimit
        }
    };
}

function createService({
    runtimeAccessService,
    diagnosisService,
    providerResidencyProbe = async () => null,
    recoveryRunStateReader = null,
    healLedgerDir = null,
    healLedgerReader = null,
    taskStateService = null,
    tenantRepoSyncService = null,
    tenantRepoSyncEnabledReader = null
} = {}) {
    return Neo.create(DeploymentStateBridgeService, {
        runtimeAccessService,
        diagnosisService,
        taskStateService,
        tenantRepoSyncService,
        tenantRepoSyncEnabledReader,
        providerResidencyProbe,
        recoveryRunStateReader,
        healLedgerDir,
        healLedgerReader,
        nowFn: () => OBSERVED_AT
    });
}

test.describe('Neo.ai.daemons.services.DeploymentStateBridgeService', () => {
    test.beforeEach(() => {
        originalDeploymentStateBridgeConfig = Neo.clone(AiConfig.orchestrator.deploymentStateBridge, true, true);
        originalRuntimeAccessConfig         = Neo.clone(AiConfig.orchestrator.deploymentRuntimeAccess, true, true);

        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices             : [],
            includeLogs                 : true,
            logTail                     : 120,
            logMaxBytes                 : 32 * 1024,
            statsSampleWindow           : 2,
            providerResidencyServiceKeys: ['local-model', 'model'],
            recoveryRunLimit            : 10,
            selfHealRecentEventLimit    : 10
        });
        Object.assign(AiConfig.orchestrator.deploymentRuntimeAccess, {
            allowedServices: ['model']
        });
    });

    test.afterEach(() => {
        Object.assign(AiConfig.orchestrator.deploymentStateBridge, originalDeploymentStateBridgeConfig);
        Object.assign(AiConfig.orchestrator.deploymentRuntimeAccess, originalRuntimeAccessConfig);
    });

    test('collects bounded read-observe state and diagnosis for allowlisted services', async () => {
        const calls                = [];
        const runtimeAccessService = {
            async readObserve(request) {
                calls.push(request);

                if (request.operation === 'inspect') {
                    return {
                        data : {Name: '/model', State: {Status: 'running', Health: {Status: 'unhealthy'}}, Config: {Image: 'ollama'}},
                        proof: {operation: 'inspect'}
                    };
                }

                if (request.operation === 'stats') {
                    return {
                        data : statsSample({cpuPercent: 390, memoryPercent: 75}),
                        proof: {operation: 'stats'}
                    };
                }

                return {
                    data : {logs: '0123456789abcdef', tail: request.tail},
                    proof: {operation: 'logs'}
                };
            }
        };
        const diagnosisService = {
            diagnose({serviceKey, inspect, statsSamples}) {
                return {serviceKey, status: inspect.State.Health.Status, sampleCount: statsSamples.length};
            }
        };

        const service  = createService({runtimeAccessService, diagnosisService});
        const snapshot = await service.collectSnapshot();

        expect(calls.map(call => call.operation)).toEqual(['inspect', 'stats', 'logs']);
        expect(snapshot.services).toHaveLength(1);
        expect(snapshot.services[0]).toMatchObject({
            serviceKey: 'model',
            status    : 'available',
            inspect   : {
                image: 'ollama',
                state: {status: 'running', health: 'unhealthy'}
            },
            stats: {
                cpuPercent   : 390,
                memoryPercent: 75
            },
            logs: {
                text     : '0123456789abcdef',
                truncated: false,
                tail     : 120
            },
            diagnosis: {
                serviceKey : 'model',
                status     : 'unhealthy',
                sampleCount: 1
            },
            proofs: [{operation: 'inspect'}, {operation: 'stats'}, {operation: 'logs'}]
        });
        expect(snapshot.recoveryRuns).toMatchObject({
            status : 'available',
            source : 'orchestrator-recovery-run-ledger',
            limit  : 10,
            entries: []
        });
        expect(snapshot.bridgeDiagnostics).toMatchObject({
            status       : 'available',
            reason       : null,
            runtimeAccess: {
                enabled        : false,
                mechanism      : 'docker-socket',
                composeProject : null,
                allowedServices: ['model']
            },
            bridgeConfig: {
                effectiveServiceKeys: ['model'],
                includeLogs         : true
            },
            serviceResolution: {
                serviceCount        : 1,
                degradedServiceCount: 0,
                broadLookupFailure  : false
            }
        });
    });

    test('adds bridge-level diagnosis when every service lookup fails', async () => {
        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices: ['kb-server', 'mc-server'],
            includeLogs    : false
        });
        Object.assign(AiConfig.orchestrator.deploymentRuntimeAccess, {
            enabled        : true,
            composeProject : null,
            allowedServices: ['kb-server', 'mc-server'],
            readOperations : ['inspect', 'stats', 'logs']
        });

        const runtimeAccessService = {
            async readObserve({serviceKey}) {
                const error = new Error(`No Docker container found for compose service '${serviceKey}'`);

                error.reason  = 'compose-service-no-match';
                error.details = {
                    enabled             : true,
                    mechanism           : 'docker-socket',
                    composeProject      : null,
                    allowedServices     : ['kb-server', 'mc-server'],
                    readOperations      : ['inspect', 'stats', 'logs'],
                    lifecycleOperations : ['restart'],
                    auditMode           : 'metadata',
                    socketPathConfigured: true,
                    serviceKey,
                    filters             : {
                        label: [`com.docker.compose.service=${serviceKey}`]
                    },
                    matchCount: 0,
                    hints     : ['Align NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES with Docker com.docker.compose.service labels.']
                };

                throw error;
            }
        };

        const snapshot = await createService({runtimeAccessService}).collectSnapshot();

        expect(snapshot.services).toHaveLength(2);
        expect(snapshot.services[0].errors[0]).toMatchObject({
            operation: 'inspect',
            reason   : 'compose-service-no-match',
            details  : {
                socketPathConfigured: true,
                filters             : {
                    label: ['com.docker.compose.service=kb-server']
                }
            }
        });
        expect(JSON.stringify(snapshot.bridgeDiagnostics)).not.toContain('/var/run/docker.sock');
        expect(snapshot.bridgeDiagnostics).toMatchObject({
            status       : 'degraded',
            reason       : 'broad-service-lookup-failure',
            runtimeAccess: {
                enabled            : true,
                mechanism          : 'docker-socket',
                composeProject     : null,
                allowedServices    : ['kb-server', 'mc-server'],
                readOperations     : ['inspect', 'stats', 'logs'],
                lifecycleOperations: ['restart']
            },
            bridgeConfig: {
                allowedServices     : ['kb-server', 'mc-server'],
                effectiveServiceKeys: ['kb-server', 'mc-server'],
                includeLogs         : false
            },
            serviceResolution: {
                serviceCount          : 2,
                degradedServiceCount  : 2,
                allServicesDegraded   : true,
                broadLookupFailure    : true,
                lookupFailureCount    : 2,
                failureReasonCounts   : {'compose-service-no-match': 4},
                operationFailureCounts: {
                    inspect: 2,
                    stats  : 2
                }
            }
        });
        expect(snapshot.bridgeDiagnostics.hints).toContain('All observed services failed runtime lookup; verify the orchestrator Docker socket mount and Compose project/service labels before investigating individual services.');
    });

    test('collectSelfHealSnapshot folds the heal-ledger into an operator-facing immune-status (#14163 AC2)', async () => {
        const events = [
            {type: 'freeze',           collection: 'c2', status: 'contained', at: 5},
            {type: 're-embed-missing', collection: 'c1', status: 'healed',    at: 9}
        ];
        const service = createService({
            healLedgerDir   : '/heal',
            healLedgerReader: async ({dir}) => { expect(dir).toBe('/heal'); return events; }
        });

        const selfHeal = await service.collectSelfHealSnapshot();
        expect(selfHeal.status).toBe('available');
        expect(selfHeal.source).toBe('orchestrator-heal-event-ledger');
        expect(selfHeal.summary).toMatchObject({total: 2, currentlyFrozen: ['c2'], byStatus: {contained: 1, healed: 1}});
        expect(selfHeal.recentEvents.map(e => e.at)).toEqual([9, 5]); // newest-first, bounded by selfHealRecentEventLimit
        expect(selfHeal.limit).toBe(10);                              // the snapshot reports its OWN recent-event cap
    });

    test('collectSelfHealSnapshot is disabled (graceful) when no heal-ledger dir is wired', async () => {
        const selfHeal = await createService({}).collectSelfHealSnapshot();
        expect(selfHeal).toMatchObject({status: 'disabled', summary: null, recentEvents: []});
    });

    test('collectSelfHealSnapshot degrades, never throws, when the ledger read fails (observe must not perturb)', async () => {
        const service  = createService({healLedgerDir: '/heal', healLedgerReader: async () => { throw new Error('disk gone'); }}),
              selfHeal = await service.collectSelfHealSnapshot();
        expect(selfHeal.status).toBe('degraded');
        expect(selfHeal.errors[0].reason).toBe('heal-ledger-read-failed');
    });

    test('collectSelfHealSnapshot degrades on an UNREADABLE ledger file via the REAL reader (production path, not an injected throw)', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-heal-'));
        // A directory where the JSONL file should be → the real readFile throws EISDIR (NOT ENOENT) → readHealLedger
        // throws → the snapshot degrades visibly. The prior test only covered an INJECTED throwing reader.
        fs.mkdirSync(path.join(dir, 'heal-events.jsonl'));
        try {
            const selfHeal = await createService({healLedgerDir: dir}).collectSelfHealSnapshot(); // NO injected reader
            expect(selfHeal.status).toBe('degraded');
            expect(selfHeal.errors[0]).toMatchObject({reason: 'heal-ledger-read-failed', code: 'EISDIR'});
            expect(selfHeal.summary).toBeNull();
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });

    test('collectSelfHealSnapshot stays AVAILABLE (empty) on a MISSING ledger via the REAL reader — ENOENT is not a degradation', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-heal-'));
        try {
            const selfHeal = await createService({healLedgerDir: dir}).collectSelfHealSnapshot(); // no ledger file yet
            expect(selfHeal.status).toBe('available');
            expect(selfHeal.summary.total).toBe(0);
            expect(selfHeal.recentEvents).toEqual([]);
        } finally {
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });

    test('collectSelfHealSnapshot throws on a NEGATIVE selfHealRecentEventLimit — a negative cap must NOT expand the snapshot to every retained event', async () => {
        AiConfig.orchestrator.deploymentStateBridge.selfHealRecentEventLimit = -1; // restored by afterEach
        const service = createService({healLedgerDir: '/heal', healLedgerReader: async () => []});
        await expect(service.collectSelfHealSnapshot()).rejects.toThrow(/selfHealRecentEventLimit must be >= 0/);
    });

    test('collectSelfHealSnapshot throws on a non-finite selfHealRecentEventLimit', async () => {
        AiConfig.orchestrator.deploymentStateBridge.selfHealRecentEventLimit = NaN; // restored by afterEach
        const service = createService({healLedgerDir: '/heal', healLedgerReader: async () => []});
        await expect(service.collectSelfHealSnapshot()).rejects.toThrow(/selfHealRecentEventLimit must be a finite number/);
    });

    test('includes bounded recent recovery-run ledger entries in the bridge snapshot', async () => {
        const
            readerCalls            = [],
            recoveryRunStateReader = async request => {
                readerCalls.push(request);

                return [{
                    recoveryRunId : 'recovery-newer',
                    diagnosisId   : 'diagnosis-1',
                    recoveryClass : 'crash',
                    targetIdentity: {kind: 'compose-service', id: 'memory'},
                    status        : 'reobserve-requested'
                }];
            },
            snapshot = await createService({recoveryRunStateReader}).collectSnapshot();

        expect(readerCalls).toEqual([{
            dir  : AiConfig.orchestrator.recoveryActuator.recoveryRunStateDir,
            limit: AiConfig.orchestrator.deploymentStateBridge.recoveryRunLimit
        }]);
        expect(snapshot.recoveryRuns).toMatchObject({
            status : 'available',
            source : 'orchestrator-recovery-run-ledger',
            limit  : AiConfig.orchestrator.deploymentStateBridge.recoveryRunLimit,
            entries: [
                {
                    recoveryRunId : 'recovery-newer',
                    diagnosisId   : 'diagnosis-1',
                    recoveryClass : 'crash',
                    targetIdentity: {kind: 'compose-service', id: 'memory'},
                    status        : 'reobserve-requested'
                }
            ],
            errors: []
        });
    });

    test('falls back to runtime allowed services and records read errors as degraded state', async () => {
        AiConfig.orchestrator.deploymentRuntimeAccess.allowedServices = ['memory'];

        const runtimeAccessService = {
            async readObserve() {
                throw new Error('runtime unavailable');
            }
        };

        const service  = createService({runtimeAccessService, diagnosisService: null});
        const snapshot = await service.collectSnapshot();

        expect(snapshot.services).toHaveLength(1);
        expect(snapshot.services[0]).toMatchObject({
            serviceKey: 'memory',
            status    : 'degraded',
            errors    : [
                {operation: 'inspect', message: 'runtime unavailable'},
                {operation: 'stats', message: 'runtime unavailable'},
                {operation: 'logs', message: 'runtime unavailable'}
            ]
        });
    });

    test('passes active-provider residency into the diagnosis snapshot for model services', async () => {
        const runtimeAccessService = {
            async readObserve(request) {
                if (request.operation === 'inspect') {
                    return {
                        data : {Name: '/model', State: {Status: 'running', Health: {Status: 'healthy'}}, Config: {Image: 'ollama'}},
                        proof: {operation: 'inspect'}
                    };
                }

                if (request.operation === 'stats') {
                    return {
                        data : statsSample({cpuPercent: 10, memoryPercent: 20}),
                        proof: {operation: 'stats'}
                    };
                }

                return {
                    data : {logs: '', tail: request.tail},
                    proof: {operation: 'logs'}
                };
            }
        };
        const providerResidencyProbe = async ({serviceKey, observedAt}) => ({
            ready          : false,
            provider       : 'ollama',
            host           : 'http://model:11434',
            requiredModels : ['gemma4:26b'],
            availableModels: [],
            missingModels  : ['gemma4:26b'],
            serviceKey,
            observedAt
        });
        const diagnosisService = {
            diagnose({providerResidency}) {
                return {
                    provider     : providerResidency.provider,
                    missingModels: providerResidency.missingModels,
                    target       : providerResidency.targetIdentity
                };
            }
        };

        const service  = createService({runtimeAccessService, diagnosisService, providerResidencyProbe});
        const snapshot = await service.collectSnapshot();

        expect(snapshot.services[0]).toMatchObject({
            serviceKey       : 'model',
            providerResidency: {
                provider      : 'ollama',
                missingModels : ['gemma4:26b'],
                targetIdentity: {kind: 'compose-service', id: 'model'}
            },
            diagnosis: {
                provider     : 'ollama',
                missingModels: ['gemma4:26b'],
                target       : {kind: 'compose-service', id: 'model'}
            }
        });
    });

    test('collectTenantRepoSyncSnapshot distinguishes no configured repos from a missing KB ingest', async () => {
        const service = createService({
            taskStateService: {
                getTaskState(taskName) {
                    expect(taskName).toBe('tenant-repo-sync');

                    return {
                        running       : false,
                        pid           : null,
                        lastRunAt     : OBSERVED_AT - 10_000,
                        lastSuccessAt : null,
                        lastErrorAt   : null,
                        lastExitCode  : null,
                        lastReason    : 'periodic-sweep:60000',
                        lastCompletion: {
                            status   : 'skipped',
                            reason   : 'periodic-sweep:60000',
                            repoCount: 0
                        }
                    };
                }
            },
            tenantRepoSyncService: {
                async resolveTenantReposConfig() {
                    return {tenantRepos: []};
                },
                defaultRevisionsFilePath() {
                    return '/state/tenant-repo-sync-revisions.json';
                },
                async readPersistedRevisions({filePath, strict}) {
                    expect(filePath).toBe('/state/tenant-repo-sync-revisions.json');
                    expect(strict).toBe(true);

                    return {};
                }
            },
            tenantRepoSyncEnabledReader: () => true
        });

        const tenantRepoSync = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(tenantRepoSync).toMatchObject({
            status : 'no-configured-repos',
            enabled: true,
            config : {
                status   : 'available',
                repoCount: 0
            },
            task: {
                lastCompletion: {
                    status   : 'skipped',
                    repoCount: 0
                }
            },
            repos : [],
            errors: []
        });
    });

    test('collectTenantRepoSyncSnapshot reports not-due repos with hashed identities only', async () => {
        const service = createService({
            taskStateService: {
                getTaskState() {
                    return {
                        running       : false,
                        pid           : null,
                        lastRunAt     : OBSERVED_AT - 1,
                        lastSuccessAt : '2024-03-09T16:00:00.000Z',
                        lastErrorAt   : null,
                        lastExitCode  : 0,
                        lastReason    : 'periodic-sweep:60000',
                        lastCompletion: null
                    };
                }
            },
            tenantRepoSyncService: {
                async resolveTenantReposConfig() {
                    return {
                        tenantRepos: [{
                            tenantId     : 'tenant-a',
                            repoSlug     : 'private/repo',
                            cloneUrl     : 'https://git.example/private/repo.git',
                            credentialRef: 'env:TOKEN',
                            cadenceMs    : 60_000,
                            configTier   : 'yaml'
                        }]
                    };
                },
                defaultRevisionsFilePath() {
                    return '/state/revisions.json';
                },
                async readPersistedRevisions() {
                    return {
                        'tenant-a/private/repo': {
                            lastIngestedRev    : 'abcdef1234567890',
                            lastRunAttemptAt   : OBSERVED_AT - 1_000,
                            consecutiveFailures: 0
                        }
                    };
                }
            },
            tenantRepoSyncEnabledReader: () => true
        });

        const tenantRepoSync = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(tenantRepoSync.status).toBe('not-due');
        expect(tenantRepoSync.config).toMatchObject({
            repoCount : 1,
            tierCounts: {yaml: 1}
        });
        expect(tenantRepoSync.repos[0]).toMatchObject({
            configTier         : 'yaml',
            disabled           : false,
            status             : 'not-due',
            due                : false,
            lastIngestedRev    : 'abcdef123456',
            consecutiveFailures: 0
        });
        expect(JSON.stringify(tenantRepoSync)).not.toContain('tenant-a');
        expect(JSON.stringify(tenantRepoSync)).not.toContain('private/repo');
        expect(JSON.stringify(tenantRepoSync)).not.toContain('TOKEN');
    });

    test('collectTenantRepoSyncSnapshot surfaces bounded failure outcome codes', async () => {
        const service = createService({
            taskStateService: {
                getTaskState() {
                    return {
                        running       : false,
                        pid           : null,
                        lastRunAt     : OBSERVED_AT - 60_000,
                        lastSuccessAt : '2024-03-09T14:00:00.000Z',
                        lastErrorAt   : '2024-03-09T15:00:00.000Z',
                        lastExitCode  : null,
                        lastReason    : 'periodic-sweep:60000',
                        lastCompletion: {
                            status     : 'failed',
                            reason     : 'periodic-sweep:60000',
                            repoCount  : 1,
                            failedCount: 1,
                            repos      : [{
                                tenantId           : 'tenant-a',
                                repoSlug           : 'private/repo',
                                status             : 'degraded',
                                lastErrorCode      : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
                                lastSourceErrorCode: 'KB_GITMIRROR_FETCH_FAILED',
                                consecutiveFailures: 2
                            }]
                        }
                    };
                }
            },
            tenantRepoSyncService: {
                async resolveTenantReposConfig() {
                    return {
                        tenantRepos: [{
                            tenantId     : 'tenant-a',
                            repoSlug     : 'private/repo',
                            cloneUrl     : 'https://git.example/private/repo.git',
                            credentialRef: 'env:TOKEN',
                            configTier   : 'graph'
                        }]
                    };
                },
                defaultRevisionsFilePath() {
                    return '/state/revisions.json';
                },
                async readPersistedRevisions() {
                    return {
                        'tenant-a/private/repo': {
                            lastIngestedRev    : 'fedcba9876543210',
                            lastRunAttemptAt   : OBSERVED_AT - 60_000,
                            consecutiveFailures: 2
                        }
                    };
                }
            },
            tenantRepoSyncEnabledReader: () => true
        });

        const tenantRepoSync = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(tenantRepoSync.status).toBe('failed');
        expect(tenantRepoSync.task.lastCompletion).toMatchObject({
            status     : 'failed',
            repoCount  : 1,
            failedCount: 1
        });
        expect(tenantRepoSync.repos[0]).toMatchObject({
            configTier         : 'graph',
            status             : 'degraded',
            consecutiveFailures: 2,
            lastOutcome        : {
                status             : 'degraded',
                lastErrorCode      : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
                lastSourceErrorCode: 'KB_GITMIRROR_FETCH_FAILED'
            }
        });
        expect(JSON.stringify(tenantRepoSync)).not.toContain('env:TOKEN');
    });

    test('collectTenantRepoSyncSnapshot degrades when revision state is unreadable', async () => {
        const error = new Error('bad json');
        error.code = 'KB_TENANT_REPO_SYNC_REVISIONS_READ_FAILED';

        const service = createService({
            taskStateService: {
                getTaskState() {
                    return {
                        running       : false,
                        pid           : null,
                        lastRunAt     : OBSERVED_AT - 60_000,
                        lastSuccessAt : null,
                        lastErrorAt   : null,
                        lastExitCode  : null,
                        lastReason    : null,
                        lastCompletion: null
                    };
                }
            },
            tenantRepoSyncService: {
                async resolveTenantReposConfig() {
                    return {
                        tenantRepos: [{
                            tenantId     : 'tenant-a',
                            repoSlug     : 'private/repo',
                            cloneUrl     : 'https://git.example/private/repo.git',
                            credentialRef: 'env:TOKEN',
                            configTier   : 'aiConfig'
                        }]
                    };
                },
                defaultRevisionsFilePath() {
                    return '/state/revisions.json';
                },
                async readPersistedRevisions() {
                    throw error;
                }
            },
            tenantRepoSyncEnabledReader: () => true
        });

        const tenantRepoSync = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(tenantRepoSync.status).toBe('degraded');
        expect(tenantRepoSync.errors[0]).toMatchObject({
            reason: 'tenant-repo-revision-state-read-failed',
            code  : 'KB_TENANT_REPO_SYNC_REVISIONS_READ_FAILED'
        });
    });

    test('edge-triggers the success log: silent on unchanged state, re-logs on a service-state transition', async () => {
        const snapshotPath = path.join(os.tmpdir(), 'neo-deployment-bridge-edge-trigger.spec.json');

        AiConfig.orchestrator.deploymentStateBridge.snapshotPath     = snapshotPath;
        AiConfig.orchestrator.deploymentStateBridge.maxSnapshotBytes = 256 * 1024;

        const
            logs    = [],
            service = createService({});

        service.writeLog = (level, message) => logs.push({level, message});

        let services = [{serviceKey: 'model', status: 'available'}, {serviceKey: 'memory', status: 'available'}];

        // Override the gatherer so the test controls the per-service status that drives the signature.
        service.collectSnapshot = async () => ({generatedAt: OBSERVED_AT, services, recoveryRuns: {entries: []}});

        const first     = await service.writeSnapshotIfDue({force: true}); // first write → logs
        const unchanged = await service.writeSnapshotIfDue({force: true}); // identical state → silent

        services = [{serviceKey: 'model', status: 'available'}, {serviceKey: 'memory', status: 'degraded'}];

        const transitioned = await service.writeSnapshotIfDue({force: true}); // status flip → logs again

        expect(first.logged).toBe(true);
        expect(unchanged.logged).toBe(false);
        expect(transitioned.logged).toBe(true);

        const infoLines = logs.filter(entry => entry.level === 'INFO' && entry.message.includes('service snapshots'));

        expect(infoLines).toHaveLength(2);
        expect(infoLines[0].message).toContain('first write');
        expect(infoLines[1].message).toContain('service-state changed');

        try { fs.unlinkSync(snapshotPath); } catch {}
    });
});
