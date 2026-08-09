import {describeCorpusOutstanding} from '../../../../../../../ai/services/knowledge-base/helpers/corpusOutstanding.mjs';
import {test, expect}              from '@playwright/test';
import fs                          from 'fs';
import os                          from 'os';
import path                        from 'path';
import Neo                         from '../../../../../../../src/Neo.mjs';
import * as core                   from '../../../../../../../src/core/_export.mjs';
import AiConfig                    from '../../../../../../../ai/config.template.mjs';
import {
    DeploymentStateBridgeService,
    summarizeProbeReliability
} from '../../../../../../../ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs';
import {ContainerHealthDiagnosisService} from '../../../../../../../ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs';
import {appendHealEvent, readHealLedger} from '../../../../../../../ai/services/memory-core/helpers/healEventLedgerStore.mjs';
import {
    TENANT_REPO_INGEST_CONTRACT_VERSION
} from '../../../../../../../ai/daemons/orchestrator/services/tenantRepoCheckpointValidity.mjs';

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
        // The handoff is CAPTURED, not just invoked. The heap attribution lives in diagnosis but its
        // evidence is produced here, so a bridge that silently stopped passing the log summary or the
        // Config.Cmd observations would leave the attribution permanently unavailable while every
        // other assertion in this tree stayed green. Destructuring only the old arguments is exactly
        // how that break would hide.
        let diagnoseArgs = null;

        const diagnosisService = {
            diagnose(args) {
                diagnoseArgs = args;

                const {serviceKey, inspect, statsSamples} = args;

                return {serviceKey, status: inspect.State.Health.Status, sampleCount: statsSamples.length};
            }
        };

        const service  = createService({runtimeAccessService, diagnosisService});
        const snapshot = await service.collectSnapshot();

        expect(diagnoseArgs, 'the bridge must hand diagnosis its heap-attribution evidence').toMatchObject({
            declaredHeapCeilingMb: null,
            // The incarnation bound must travel WITH the slice. This fixture's container is running,
            // so it has no FinishedAt and therefore no interval — `false` here is the correct answer
            // and the one that keeps diagnosis from attributing a death that has not happened.
            logs       : {incarnationBounded: false, text: expect.any(String)},
            nodeCommand: false
        });

        // The same summarized receipt reaches diagnosis AND publication — one object, not two
        // derivations that could drift apart.
        expect(snapshot.services[0].logs.incarnationBounded).toBe(false);
        expect(snapshot.services[0].logs.text).toBe(diagnoseArgs.logs.text);

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

    test('a logs read that landed on a DIFFERENT container is never incarnation-bounded', async () => {
        // `readObserve` resolves a target per call, so a compose recreate between inspect and logs
        // lands them on different containers. A legitimately-applied interval on the WRONG container
        // is not this incarnation — and the payloads alone cannot show it, only the proof targets can.
        const runtimeAccessService = {
            async readObserve({operation}) {
                if (operation === 'inspect') {
                    return {
                        data: {
                            Config: {Cmd: ['node', 'server.mjs']},
                            State : {
                                FinishedAt: '2026-08-08T20:05:00.900Z',
                                Health    : {Status: 'unhealthy'},
                                StartedAt : '2026-08-08T20:00:00.900Z',
                                Status    : 'exited'
                            }
                        },
                        proof: {operation: 'inspect', target: {containerId: 'container-A'}}
                    };
                }

                if (operation === 'logs') {
                    return {
                        data: {
                            appliedSince: '2026-08-08T20:00:00.900Z',
                            appliedUntil: '2026-08-08T20:05:00.900Z',
                            bounded     : true,
                            containerId : 'container-B',
                            logs        : 'FATAL ERROR: Reached heap limit - JavaScript heap out of memory',
                            tail        : 25
                        },
                        proof: {operation: 'logs', target: {containerId: 'container-B'}}
                    };
                }

                return {data: null, proof: {operation}};
            }
        };

        let diagnoseArgs = null;

        const service = createService({
            diagnosisService: {
                diagnose(args) {
                    diagnoseArgs = args;
                    return {status: 'diagnosed'}
                }
            },
            runtimeAccessService
        });

        const snapshot = await service.collectSnapshot();

        expect(diagnoseArgs.logs.incarnationBounded,
            'a producer bound on a different container must not read as this incarnation').toBe(false);
        expect(snapshot.services[0].logs.incarnationBounded).toBe(false);
    });

    test('the declared heap ceiling travels Config.Cmd → inspect → diagnostics through the OWNER', async () => {
        // The helper that decides this is unit-tested elsewhere, and that proves only the decision.
        // This drives `collectSnapshot()` itself, so it proves the WIRING: a correct selector that
        // was never reached would pass every helper test and publish nothing. Both halves of the
        // contract are asserted from one snapshot — the per-service `inspect` fields a consumer
        // reads, and the diagnostics record that names who declared nothing.
        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices: ['kb-server', 'mc-server'],
            includeLogs    : false
        });
        Object.assign(AiConfig.orchestrator.deploymentRuntimeAccess, {
            enabled        : true,
            composeProject : null,
            allowedServices: ['kb-server', 'mc-server'],
            readOperations : ['inspect', 'stats']
        });

        // kb-server declares a ceiling; mc-server is Node with none. A third shape is deliberately
        // absent: a NON-Node command is covered by the helper spec, and duplicating it here would
        // add a row without adding a wire.
        const commands = {
            'kb-server': ['sh', '-c', 'node --max-old-space-size=768 /app/server.mjs'],
            'mc-server': ['sh', '-c', 'node /app/server.mjs']
        };

        const runtimeAccessService = {
            async readObserve(request) {
                if (request.operation === 'inspect') {
                    return {
                        data: {
                            Name  : `/${request.serviceKey}`,
                            State : {Status: 'running', Health: {Status: 'healthy'}},
                            Config: {Image: 'neo', Cmd: commands[request.serviceKey]}
                        },
                        proof: {operation: 'inspect'}
                    };
                }

                return {data: statsSample({cpuPercent: 5, memoryPercent: 40}), proof: {operation: 'stats'}};
            }
        };

        const snapshot = await createService({
            runtimeAccessService,
            diagnosisService: {diagnose: () => null}
        }).collectSnapshot();

        const byKey = Object.fromEntries(snapshot.services.map(entry => [entry.serviceKey, entry]));

        expect(byKey['kb-server'].inspect).toMatchObject({declaredHeapCeilingMb: 768, nodeCommand: true});
        expect(byKey['mc-server'].inspect).toMatchObject({declaredHeapCeilingMb: null, nodeCommand: true});

        // The published record, read at the exact path a consumer would read it.
        expect(snapshot.bridgeDiagnostics.serviceResolution.undeclaredHeapCeilingServices)
            .toEqual(['mc-server']);
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
                lifecycleOperations: ['restart', 'update-memory-limit']
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
                    return {
                        tenantRepos      : [],
                        configDiagnostics: {
                            bootstrap: {
                                status      : 'missing',
                                tenantCount : 0,
                                errorCode   : null,
                                messageClass: null
                            }
                        }
                    };
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
                repoCount: 0,
                bootstrap: {
                    status      : 'missing',
                    tenantCount : 0,
                    errorCode   : null,
                    messageClass: null
                }
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

    test('collectTenantRepoSyncSnapshot keeps empty and loaded bootstrap states non-degraded', async () => {
        const cases = [
            {status: 'empty', tenantCount: 0},
            {status: 'loaded', tenantCount: 0},
            {status: 'loaded', tenantCount: 2}
        ];

        for (const bootstrap of cases) {
            const service = createService({
                taskStateService: {
                    getTaskState() {
                        return null;
                    }
                },
                tenantRepoSyncService: {
                    async resolveTenantReposConfig() {
                        return {
                            tenantRepos      : [],
                            configDiagnostics: {
                                bootstrap: {
                                    ...bootstrap,
                                    errorCode   : null,
                                    messageClass: null
                                }
                            }
                        };
                    },
                    defaultRevisionsFilePath() {
                        return '/state/revisions.json';
                    },
                    async readPersistedRevisions() {
                        return {};
                    }
                },
                tenantRepoSyncEnabledReader: () => true
            });

            const tenantRepoSync = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

            expect(tenantRepoSync.status).toBe('no-configured-repos');
            expect(tenantRepoSync.config).toMatchObject({
                status   : 'available',
                repoCount: 0,
                bootstrap
            });
            expect(tenantRepoSync.config.errors).toEqual([]);
            service.destroy();
        }
    });

    test('collectTenantRepoSyncSnapshot marks checkpoint counts unavailable when repo enumeration throws (#15761)', async () => {
        const configError = new Error('repo config unavailable');
        configError.code  = 'KB_TENANT_REPO_CONFIG_UNAVAILABLE';

        const service = createService({
            taskStateService: {
                getTaskState() {
                    return null;
                }
            },
            tenantRepoSyncService: {
                async resolveTenantReposConfig() {
                    throw configError;
                },
                defaultRevisionsFilePath() {
                    return '/state/revisions.json';
                },
                async readPersistedRevisions() {
                    return {};
                }
            },
            tenantRepoSyncEnabledReader: () => true
        });

        const tenantRepoSync = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(tenantRepoSync.status).toBe('degraded');
        expect(tenantRepoSync.config.status).toBe('degraded');
        expect(tenantRepoSync.repos).toEqual([]);
        expect(tenantRepoSync.checkpointRevalidation).toEqual({
            status                      : 'unavailable',
            currentIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION,
            pendingCount                : null,
            failedCount                 : null,
            completeCount               : null,
            uninitializedCount          : null,
            unsupportedCount            : null
        });
    });

    for (const failure of [
        {
            status      : 'read-failed',
            errorCode   : 'KB_CONFIG_BOOTSTRAP_READ_FAILED',
            messageClass: 'filesystem-read'
        },
        {
            status      : 'parse-failed',
            errorCode   : 'KB_CONFIG_BOOTSTRAP_PARSE_FAILED',
            messageClass: 'yaml-parse'
        },
        {
            status      : 'invalid-shape',
            errorCode   : 'KB_CONFIG_BOOTSTRAP_INVALID_SHAPE',
            messageClass: 'document-shape'
        }
    ]) {
        test(`collectTenantRepoSyncSnapshot degrades ${failure.status} while preserving fallback repo counts`, async () => {
            const service = createService({
                taskStateService: {
                    getTaskState() {
                        return null;
                    }
                },
                tenantRepoSyncService: {
                    async resolveTenantReposConfig() {
                        return {
                            tenantRepos: [{
                                tenantId     : 'private-tenant',
                                repoSlug     : 'private/repo',
                                cloneUrl     : 'https://git.example/private/repo.git',
                                credentialRef: 'env:TOKEN',
                                configTier   : 'aiConfig'
                            }],
                            configDiagnostics: {
                                bootstrap: {
                                    status      : failure.status,
                                    tenantCount : 999,
                                    errorCode   : 'token-secret',
                                    messageClass: 'stack-secret',
                                    path        : '/srv/private/kb-config.yaml',
                                    rawYaml     : 'yaml-secret',
                                    document    : {
                                        tenants: {
                                            'private-tenant': {
                                                cloneUrl: 'https://token-secret@git.example/private/repo.git'
                                            }
                                        }
                                    }
                                }
                            }
                        };
                    },
                    defaultRevisionsFilePath() {
                        return '/state/revisions.json';
                    },
                    async readPersistedRevisions() {
                        return {};
                    }
                },
                tenantRepoSyncEnabledReader: () => true
            });

            const tenantRepoSync = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

            expect(tenantRepoSync.status).toBe('degraded');
            expect(tenantRepoSync.config).toMatchObject({
                status   : 'degraded',
                repoCount: 1,
                bootstrap: {
                    status      : failure.status,
                    tenantCount : null,
                    errorCode   : failure.errorCode,
                    messageClass: failure.messageClass
                },
                errors: [{
                    reason      : `kb-config-bootstrap-${failure.status}`,
                    code        : failure.errorCode,
                    messageClass: failure.messageClass
                }]
            });
            expect(tenantRepoSync.repos).toHaveLength(1);
            expect(tenantRepoSync.errors).toEqual([]);

            const serialized = JSON.stringify(tenantRepoSync);
            expect(serialized).not.toContain('private-tenant');
            expect(serialized).not.toContain('private/repo');
            expect(serialized).not.toContain('TOKEN');
            expect(serialized).not.toContain('/srv/private');
            expect(serialized).not.toContain('token-secret');
            expect(serialized).not.toContain('stack-secret');
            expect(serialized).not.toContain('yaml-secret');
            service.destroy();
        });
    }

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
                            lastIngestedRev                      : 'abcdef1234567890',
                            lastRunAttemptAt                     : OBSERVED_AT - 1_000,
                            consecutiveFailures                  : 0,
                            ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                            lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                            lastCommittedMaterializationAttemptId: 'a'.repeat(32)
                        }
                    };
                },
                getTenantRepoAccessReadiness() {
                    return {
                        status          : 'ready',
                        code            : 'KB_TENANT_REPO_ACCESS_READY',
                        checkedAt       : '2024-03-09T15:59:00.000Z',
                        cacheFingerprint: 'must-not-cross-the-bridge'
                    };
                }
            },
            tenantRepoSyncEnabledReader: () => true
        });

        const tenantRepoSync = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(tenantRepoSync.status).toBe('not-due');
        expect(tenantRepoSync.schemaVersion).toBe(3);
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
            consecutiveFailures: 0,
            checkpointStatus   : 'complete',
            accessReadiness    : {
                status   : 'ready',
                code     : 'KB_TENANT_REPO_ACCESS_READY',
                checkedAt: '2024-03-09T15:59:00.000Z'
            }
        });
        expect(tenantRepoSync.accessReadiness).toEqual({
            status       : 'ready',
            requiredCount: 1,
            readyCount   : 1,
            degradedCount: 0,
            unknownCount : 0,
            checkedCount : 1
        });
        expect(JSON.stringify(tenantRepoSync)).not.toContain('tenant-a');
        expect(JSON.stringify(tenantRepoSync)).not.toContain('private/repo');
        expect(JSON.stringify(tenantRepoSync)).not.toContain('TOKEN');
        expect(JSON.stringify(tenantRepoSync)).not.toContain('must-not-cross-the-bridge');
    });

    test('collectTenantRepoSyncSnapshot projects bounded embedding-recovery state without durable ids (#16692)', async () => {
        const
            episodeId     = '0123456789abcdef'.repeat(2),
            generationId  = 'fedcba9876543210'.repeat(2),
            probeSnapshot = {
                status             : 'failed',
                checkedAt          : OBSERVED_AT - 1_000,
                lastDemandCached   : true,
                failureStreak      : 2,
                backoffMs          : 60_000,
                nextAttemptAt      : OBSERVED_AT + 60_000,
                terminal           : false,
                stopReason         : null,
                errorClassification: 'connection-refused',
                errorCode          : 'ECONNREFUSED',
                credential         : 'must-not-cross-the-bridge'
            },
            checkpoint = {
                lastIngestedRev                   : null,
                lastRunAttemptAt                  : OBSERVED_AT - 1_000,
                consecutiveFailures               : 8,
                ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION,
                lastErrorCode                     : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
                lastSourceErrorCode               : 'KB_VECTOR_EMBED_CONNECTION_REFUSED',
                lastAccessCode                    : 'KB_TENANT_REPO_ACCESS_TRANSPORT_FAILED',
                lastErrorAt                       : OBSERVED_AT - 1_000,
                embeddingRecovery                 : {
                    episodeId,
                    causeCode               : 'KB_VECTOR_EMBED_CONNECTION_REFUSED',
                    detectedAt              : OBSERVED_AT - 10_000,
                    generationId            : null,
                    observedAt              : null,
                    bypassConsumedAt        : null,
                    lastConsumedGenerationId: generationId,
                    lastConsumedAt          : OBSERVED_AT - 2_000
                }
            },
            service = createService({
                taskStateService: {
                    getTaskState() {
                        return {running: false, lastCompletion: null};
                    }
                },
                tenantRepoSyncService: {
                    async resolveTenantReposConfig() {
                        return {tenantRepos: [{
                            tenantId  : 'tenant-recovery',
                            repoSlug  : 'private/recovery',
                            cloneUrl  : 'https://git.example/private/recovery.git',
                            cadenceMs : 60_000,
                            configTier: 'yaml'
                        }]};
                    },
                    defaultRevisionsFilePath() {
                        return '/state/revisions.json';
                    },
                    async readPersistedRevisions() {
                        return {'tenant-recovery/private/recovery': checkpoint};
                    },
                    getTenantRepoAccessReadiness() {
                        return null;
                    },
                    getEmbeddingRecoveryProbeSnapshot() {
                        return probeSnapshot;
                    }
                },
                tenantRepoSyncEnabledReader: () => true
            });

        const snapshot = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(snapshot.schemaVersion).toBe(3);
        expect(snapshot.embeddingRecoveryProbe).toEqual({
            status             : 'failed',
            checkedAt          : OBSERVED_AT - 1_000,
            lastDemandCached   : true,
            failureStreak      : 2,
            backoffMs          : 60_000,
            nextAttemptAt      : OBSERVED_AT + 60_000,
            terminal           : false,
            stopReason         : null,
            errorClassification: 'connection-refused',
            errorCode          : 'ECONNREFUSED'
        });
        expect(snapshot.repos[0]).toMatchObject({
            status             : 'not-due',
            stopReasonCode     : 'KB_VECTOR_EMBED_CONNECTION_REFUSED',
            lastErrorCode      : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
            lastSourceErrorCode: 'KB_VECTOR_EMBED_CONNECTION_REFUSED',
            lastAccessCode     : 'KB_TENANT_REPO_ACCESS_TRANSPORT_FAILED',
            recoveryState      : 'recovery-probe-backoff'
        });

        const serialized = JSON.stringify(snapshot);

        expect(serialized).not.toContain(episodeId);
        expect(serialized).not.toContain(generationId);
        expect(serialized).not.toContain('tenant-recovery');
        expect(serialized).not.toContain('private/recovery');
        expect(serialized).not.toContain('must-not-cross-the-bridge');

        checkpoint.embeddingRecovery = {
            ...checkpoint.embeddingRecovery,
            generationId,
            observedAt              : OBSERVED_AT - 500,
            lastConsumedGenerationId: null,
            lastConsumedAt          : null
        };

        const retryPendingSnapshot = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(retryPendingSnapshot.repos[0]).toMatchObject({
            due          : true,
            nextDueAt    : new Date(OBSERVED_AT).toISOString(),
            recoveryState: 'recovery-observed/retry-pending'
        });
        expect(JSON.stringify(retryPendingSnapshot)).not.toContain(generationId);
        service.destroy();
    });

    test('the outstanding-work count reaches the snapshot, and an unmeasured repo does not read as finished', async () => {
        // AC-4: the count must reach the DEPLOYMENT SNAPSHOT, which builds `repos[]` from PERSISTED
        // state through two independent whitelists (the checkpoint normalizer, then this summarizer).
        // A test against `runTask`'s own return would pass while the snapshot silently dropped the
        // field — different projection, same-looking number.
        const
            makeService = checkpoint => createService({
                taskStateService     : {getTaskState: () => ({running: false, lastCompletion: null})},
                tenantRepoSyncService: {
                    async resolveTenantReposConfig() {
                        return {tenantRepos: [{
                            tenantId  : 'tenant-outstanding',
                            repoSlug  : 'private/outstanding',
                            cloneUrl  : 'https://git.example/private/outstanding.git',
                            cadenceMs : 60_000,
                            configTier: 'yaml'
                        }]};
                    },
                    defaultRevisionsFilePath: () => '/state/revisions.json',
                    async readPersistedRevisions() {
                        return {'tenant-outstanding/private/outstanding': checkpoint};
                    },
                    getTenantRepoAccessReadiness     : () => null,
                    getEmbeddingRecoveryProbeSnapshot: () => null
                },
                tenantRepoSyncEnabledReader: () => true
            }),
            baseCheckpoint = {
                lastIngestedRev : null,
                lastRunAttemptAt: OBSERVED_AT - 1_000,
                // Zero, deliberately: a repo deferring against a slow provider holds its streak by
                // design. If this field were gated on `failures > 0` like the cause codes are, the
                // backlog would be invisible in exactly the state it exists to explain.
                consecutiveFailures               : 0,
                ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
            };

        const measured = makeService({
            ...baseCheckpoint,
            corpusOutstanding: {
                state          : 'outstanding',
                observable     : true,
                outstanding    : 40_000,
                lastDecreasedAt: OBSERVED_AT - 5_000,
                observedAt     : OBSERVED_AT - 1_000
            }
        });

        const measuredSnapshot = await measured.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(measuredSnapshot.repos[0].corpusOutstanding).toEqual({
            state          : 'outstanding',
            observable     : true,
            outstanding    : 40_000,
            lastDecreasedAt: OBSERVED_AT - 5_000,
            observedAt     : OBSERVED_AT - 1_000
        });
        expect(measuredSnapshot.repos[0].consecutiveFailures).toBe(0);
        measured.destroy();

        // A repo whose observation was never written must not present as a finished corpus. This is
        // the same empty-is-not-success discrimination, at the outermost surface a client reads.
        const unmeasured         = makeService({...baseCheckpoint}),
              unmeasuredSnapshot = await unmeasured.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(unmeasuredSnapshot.repos[0].corpusOutstanding).toBeNull();
        unmeasured.destroy();

        // A torn record degrades WHOLE rather than being repaired into a number — a half-written or
        // hand-edited observation must never surface as a count.
        const torn = makeService({
                  ...baseCheckpoint,
                  corpusOutstanding: {state: 'outstanding', observable: true, outstanding: 12}
              }),
              tornSnapshot = await torn.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(tornSnapshot.repos[0].corpusOutstanding).toBeNull();
        torn.destroy();

        // RA-1 (@neo-gpt): every field individually well-typed, TOGETHER asserting a finished corpus
        // with 42 chunks left. Presence-validation admits this; only coherence rejects it. Repairing it
        // to a count would invent an observation nobody made, so it degrades WHOLE.
        for (const incoherent of [
            {state: 'complete',     observable: true,  outstanding: 42, observedAt: OBSERVED_AT - 1_000},
            {state: 'outstanding',  observable: true,  outstanding: 0,  observedAt: OBSERVED_AT - 1_000},
            {state: 'unobservable', observable: true,  outstanding: 7,  observedAt: OBSERVED_AT - 1_000},
            {state: 'converging',   observable: true,  outstanding: 7,  observedAt: OBSERVED_AT - 1_000}
        ]) {
            const svc  = makeService({...baseCheckpoint, corpusOutstanding: incoherent}),
                  snap = await svc.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

            expect(snap.repos[0].corpusOutstanding, `must reject ${JSON.stringify(incoherent)}`).toBeNull();
            svc.destroy();
        }

        // @neo-gpt's two named residuals at d632, both from ONE root: the shared
        // `normalizeNonNegativeNumber` collapsed null/undefined to 0, so the coherence check above was
        // reading laundered values and could not see either case.

        // tornCompleteMissingCount — a record claiming `complete` with NO count at all. Laundered to 0,
        // it read as coherent and published a FINISHED corpus asserted from an absent number.
        const tornMissing = makeService({
                  ...baseCheckpoint,
                  corpusOutstanding: {state: 'complete', observable: true, observedAt: OBSERVED_AT - 1_000}
              }),
              tornMissingSnap = await tornMissing.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(tornMissingSnap.repos[0].corpusOutstanding).toBeNull();
        tornMissing.destroy();

        // readerOfProducerBlind — the ROUND TRIP. A valid `unobservable` straight from the producer was
        // rejected, because `outstanding: null` laundered to 0 and `Number.isFinite(0)` is true. The
        // reader was blind to its own writer's output, which no amount of incoherent-input testing finds.
        const producerUnobservable = describeCorpusOutstanding({outstanding: null, observedAt: OBSERVED_AT - 1_000}),
              roundTrip            = makeService({...baseCheckpoint, corpusOutstanding: producerUnobservable}),
              roundTripSnap        = await roundTrip.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(roundTripSnap.repos[0].corpusOutstanding).toMatchObject({
            state      : 'unobservable',
            observable : false,
            outstanding: null
        });
        roundTrip.destroy();

        // …and the positive round trip, so the reader is not merely permissive.
        const producerOutstanding = describeCorpusOutstanding({outstanding: 618, observedAt: OBSERVED_AT - 1_000}),
              positive            = makeService({...baseCheckpoint, corpusOutstanding: producerOutstanding}),
              positiveSnap        = await positive.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(positiveSnap.repos[0].corpusOutstanding).toMatchObject({
            state: 'outstanding', observable: true, outstanding: 618
        });
        positive.destroy();
    });

    test('collectTenantRepoSyncSnapshot projects mixed access readiness through a deep allowlist', async () => {
        const repos = [
            {
                tenantId     : 'tenant-ready',
                repoSlug     : 'private/ready',
                cloneUrl     : 'https://git.example/private/ready.git',
                credentialRef: 'env:READY_TOKEN'
            },
            {
                tenantId     : 'tenant-denied',
                repoSlug     : 'private/denied',
                cloneUrl     : 'https://git.example/private/denied.git',
                credentialRef: 'file:/run/secrets/denied-token'
            },
            {
                tenantId     : 'tenant-unknown',
                repoSlug     : 'private/unknown',
                cloneUrl     : 'ssh://git.example/private/unknown.git',
                credentialRef: 'ssh:/run/secrets/unknown-key'
            },
            {
                tenantId     : 'tenant-disabled',
                repoSlug     : 'private/disabled',
                cloneUrl     : 'https://git.example/private/disabled.git',
                credentialRef: 'env:DISABLED_TOKEN',
                disabled     : true
            }
        ];
        const service = createService({
            taskStateService: {
                getTaskState() {
                    return null;
                }
            },
            tenantRepoSyncService: {
                async resolveTenantReposConfig() {
                    return {tenantRepos: repos};
                },
                defaultRevisionsFilePath() {
                    return '/state/revisions.json';
                },
                async readPersistedRevisions() {
                    return {};
                },
                getTenantRepoAccessReadiness(repo) {
                    if (repo.tenantId === 'tenant-ready') {
                        return {
                            status          : 'ready',
                            code            : 'KB_TENANT_REPO_ACCESS_READY',
                            checkedAt       : '2024-03-09T15:59:00.000Z',
                            cacheFingerprint: 'secret-fingerprint',
                            cloneUrl        : repo.cloneUrl,
                            credentialRef   : repo.credentialRef
                        };
                    }

                    if (repo.tenantId === 'tenant-denied') {
                        return {
                            status   : 'degraded',
                            code     : 'KB_TENANT_REPO_ACCESS_DENIED_OR_NOT_FOUND',
                            checkedAt: '2024-03-09T15:58:00.000Z',
                            stderr   : 'fatal token secret-value',
                            keyPath  : '/host/private/key',
                            username : 'private-user',
                            stack    : 'private-stack'
                        };
                    }

                    return {
                        status   : 'degraded',
                        code     : 'KB_TENANT_REPO_ACCESS_TOKEN_SECRET',
                        checkedAt: '2024-03-09T15:57:00.000Z',
                        token    : 'secret-value'
                    };
                }
            },
            tenantRepoSyncEnabledReader: () => true
        });

        const tenantRepoSync = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(tenantRepoSync.accessReadiness).toEqual({
            status       : 'degraded',
            requiredCount: 3,
            readyCount   : 1,
            degradedCount: 1,
            unknownCount : 1,
            checkedCount : 2
        });
        expect(tenantRepoSync.repos.map(repo => repo.accessReadiness)).toEqual([
            {
                status   : 'ready',
                code     : 'KB_TENANT_REPO_ACCESS_READY',
                checkedAt: '2024-03-09T15:59:00.000Z'
            },
            {
                status   : 'degraded',
                code     : 'KB_TENANT_REPO_ACCESS_DENIED_OR_NOT_FOUND',
                checkedAt: '2024-03-09T15:58:00.000Z'
            },
            {
                status   : 'unknown',
                code     : null,
                checkedAt: null
            },
            {
                status   : 'not-required',
                code     : null,
                checkedAt: null
            }
        ]);

        const serialized = JSON.stringify(tenantRepoSync);

        for (const forbidden of [
            'tenant-ready',
            'private/ready',
            'git.example',
            'READY_TOKEN',
            '/run/secrets',
            'secret-fingerprint',
            'fatal token',
            'secret-value',
            '/host/private',
            'private-user',
            'private-stack',
            'KB_TENANT_REPO_ACCESS_TOKEN_SECRET'
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
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
                            lastIngestedRev                   : 'fedcba9876543210',
                            lastRunAttemptAt                  : OBSERVED_AT - 60_000,
                            consecutiveFailures               : 2,
                            ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION,
                            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
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

    test('collectTenantRepoSyncSnapshot exposes redacted mixed checkpoint-revalidation state (#15761)', async () => {
        const repos = [
            {tenantId: 'tenant-a', repoSlug: 'private/pending',       cloneUrl: 'https://git.example/pending.git',       credentialRef: 'env:PENDING_TOKEN'},
            {tenantId: 'tenant-b', repoSlug: 'private/failed',        cloneUrl: 'https://git.example/failed.git',        credentialRef: 'env:FAILED_TOKEN'},
            {tenantId: 'tenant-c', repoSlug: 'private/complete',      cloneUrl: 'https://git.example/complete.git',      credentialRef: 'env:COMPLETE_TOKEN'},
            {tenantId: 'tenant-d', repoSlug: 'private/uninitialized', cloneUrl: 'https://git.example/uninitialized.git', credentialRef: 'env:FRESH_TOKEN'},
            {tenantId: 'tenant-e', repoSlug: 'private/unsupported',   cloneUrl: 'https://git.example/unsupported.git',   credentialRef: 'env:FUTURE_TOKEN'}
        ];
        const service = createService({
            taskStateService: {
                getTaskState() {
                    return null;
                }
            },
            tenantRepoSyncService: {
                async resolveTenantReposConfig() {
                    return {tenantRepos: repos};
                },
                defaultRevisionsFilePath() {
                    return '/state/revisions.json';
                },
                async readPersistedRevisions() {
                    return {
                        'tenant-a/private/pending': {
                            lastIngestedRev                   : 'aaaaaaaaaaaaaaaa',
                            lastRunAttemptAt                  : OBSERVED_AT - 60_000,
                            consecutiveFailures               : 4,
                            ingestContractVersion             : null,
                            lastAttemptedIngestContractVersion: null
                        },
                        'tenant-b/private/failed': {
                            lastIngestedRev                   : 'bbbbbbbbbbbbbbbb',
                            lastRunAttemptAt                  : OBSERVED_AT - 30_000,
                            consecutiveFailures               : 1,
                            ingestContractVersion             : null,
                            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
                        },
                        'tenant-c/private/complete': {
                            lastIngestedRev                      : 'cccccccccccccccc',
                            lastRunAttemptAt                     : OBSERVED_AT - 10_000,
                            consecutiveFailures                  : 0,
                            ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                            lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                            lastCommittedMaterializationAttemptId: 'c'.repeat(32)
                        },
                        'tenant-e/private/unsupported': {
                            lastIngestedRev                   : 'eeeeeeeeeeeeeeee',
                            lastRunAttemptAt                  : OBSERVED_AT - 5_000,
                            consecutiveFailures               : 0,
                            ingestContractVersion             : TENANT_REPO_INGEST_CONTRACT_VERSION + 1,
                            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION + 1
                        }
                    };
                }
            },
            tenantRepoSyncEnabledReader: () => true
        });

        const tenantRepoSync = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(tenantRepoSync.checkpointRevalidation).toEqual({
            status                      : 'available',
            currentIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION,
            pendingCount                : 1,
            failedCount                 : 1,
            completeCount               : 1,
            uninitializedCount          : 1,
            unsupportedCount            : 1
        });
        expect(tenantRepoSync.repos.map(repo => repo.checkpointStatus)).toEqual([
            'pending',
            'failed',
            'complete',
            'uninitialized',
            'unsupported'
        ]);
        expect(tenantRepoSync.repos[0]).toMatchObject({
            ingestContractVersion             : null,
            lastAttemptedIngestContractVersion: null
        });
        expect(tenantRepoSync.repos[1]).toMatchObject({
            ingestContractVersion             : null,
            lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
        });

        const serialized = JSON.stringify(tenantRepoSync);
        for (const secret of [
            'tenant-a', 'tenant-b', 'tenant-c', 'tenant-d', 'tenant-e',
            'private/pending', 'private/failed', 'private/complete', 'private/uninitialized', 'private/unsupported',
            'PENDING_TOKEN', 'FAILED_TOKEN', 'COMPLETE_TOKEN', 'FRESH_TOKEN', 'FUTURE_TOKEN',
            'https://git.example'
        ]) {
            expect(serialized).not.toContain(secret);
        }
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
        expect(tenantRepoSync.checkpointRevalidation).toEqual({
            status                      : 'unavailable',
            currentIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION,
            pendingCount                : null,
            failedCount                 : null,
            completeCount               : null,
            uninitializedCount          : null,
            unsupportedCount            : null
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

/**
 * The composition, not the pieces.
 *
 * The producer and the call site were each unit-covered while nothing proved they compose — which is
 * the exact shape of the defect that started this work: `deploy-pipeline.sh` was correct for a year
 * and nothing called it. These drive the REAL diagnosis service through the bridge and assert the
 * diagnosis reaches the record an operator reads.
 */
test.describe('restart churn reaches the deployment record', () => {
    let dir;

    const churningRuntime = (Id, RestartCount) => ({
        async readObserve({operation}) {
            if (operation === 'inspect') {
                return {data: {Id, RestartCount, Name: '/orchestrator', State: {Status: 'running', Health: {Status: 'healthy'}}}, proof: {operation}};
            }
            return {data: null, proof: {operation}};
        }
    });

    const bridgeFor = (Id, RestartCount, healLedgerReader = null) => createService({
        diagnosisService    : Neo.create(ContainerHealthDiagnosisService, {}),
        healLedgerDir       : dir,
        healLedgerReader,
        runtimeAccessService: churningRuntime(Id, RestartCount)
    });

    test.beforeEach(() => {dir = fs.mkdtempSync(path.join(os.tmpdir(), 'churn-bridge-'))});
    test.afterEach(() => {fs.rmSync(dir, {recursive: true, force: true})});

    test('a churning container is diagnosed and RECORDED in the service record', async () => {
        // First observation anchors the baseline and must report nothing.
        const first = await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        expect(first.diagnosis?.diagnosis).toBeFalsy();

        // The baseline must be ON DISK — the orchestrator is the process that churns, so an
        // in-memory anchor would reset on the very event being counted.
        const baselineFile = path.join(dir, 'churn-baselines', 'orchestrator.json');

        expect(fs.existsSync(baselineFile)).toBe(true);
        expect(JSON.parse(fs.readFileSync(baselineFile, 'utf8'))).toMatchObject({containerId: 'c1', restartCount: 0});

        // Second observation, same generation, past the threshold.
        const second = await bridgeFor('c1', 5).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        // NOTE: the record's `diagnosis` field carries the DECISION; the diagnosis event is nested.
        expect(second.diagnosis).toBeTruthy();
        expect(second.diagnosis.status).toBe('diagnosed');
        expect(second.diagnosis.actionClass).toBe('record');
        expect(second.diagnosis.actionClass).not.toBe('restart');
        expect(second.diagnosis.diagnosis.recoveryClass).toBe('ambiguous');
        expect(second.diagnosis.diagnosis.details.classificationReason).toBe('restart-churn-recorded');
    });

    test('a recreate re-anchors instead of reporting churn', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        const afterRecreate = await bridgeFor('c2', 40).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(afterRecreate.diagnosis?.diagnosis?.details?.classificationReason).not.toBe('restart-churn-recorded');
        expect(JSON.parse(fs.readFileSync(path.join(dir, 'churn-baselines', 'orchestrator.json'), 'utf8')).containerId).toBe('c2');
    });

    /**
     * The AC that is harder than the recreate case: restarts WE caused must not raise the alarm. The
     * heal-event ledger is the record of what we did, and an alarm that fires on every deploy is
     * disabled within a week — leaving the blind spot plus a dead alarm.
     */
    test('restarts recorded as ours in the heal ledger are subtracted, so a deploy raises nothing', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        // Written through the REAL `appendHealEvent`, not hand-shaped. An earlier revision fabricated
        // ISO-string `at` values; production stamps epoch ms, so the filter dropped every real event
        // and the test passed against a specimen that could not occur. The specimen has to be
        // production-shaped by construction, which means using the production writer.
        // `status: 'attempt'` is what `recordRun` writes. The outcome row that follows carries the
        // same type + collection, so both are appended here — counting them as two restarts would
        // over-subtract and suppress genuine churn.
        for (let i = 0; i < 5; i++) {
            await appendHealEvent(
                {type: 'restart', collection: 'orchestrator', status: 'attempt', detail: {}},
                {dir, now: OBSERVED_AT + 30000}
            );
            await appendHealEvent(
                {type: 'restart', collection: 'orchestrator', status: 'healed', detail: {}},
                {dir, now: OBSERVED_AT + 30001}
            );
        }

        const ourRestarts = await readHealLedger({dir});

        expect(ourRestarts.length).toBe(10);
        expect(typeof ourRestarts[0].at).toBe('number');

        const withLedger = await bridgeFor('c1', 5, () => ourRestarts)
            .collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(withLedger.diagnosis?.diagnosis?.details?.classificationReason).not.toBe('restart-churn-recorded');
    });

    /**
     * The test above proves the alarm stays quiet; it does NOT prove the arithmetic, and cannot.
     * With 5 observed and 5 planned it passes on a correct subtraction AND on the paired-row
     * double-count that `9795dee622` repaired, because `Math.max(0, ...)` clamps 5 - 10 to the same
     * 0. A suppression test is satisfied by over-suppression.
     *
     * This one is positioned so the two answers disagree. 4 observed restarts against ONE
     * attempt/outcome pair leaves exactly the threshold and must FIRE. Count that pair as two
     * restarts and the delta drops to 2, the alarm goes quiet, and this test goes red — which is the
     * property the suppression test cannot have, since quiet is its passing state.
     */
    test('a single attempt/outcome pair subtracts ONE restart, not two — churn still fires at the boundary', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        await appendHealEvent(
            {type: 'restart', collection: 'orchestrator', status: 'attempt', detail: {}},
            {dir, now: OBSERVED_AT + 30000}
        );
        await appendHealEvent(
            {type: 'restart', collection: 'orchestrator', status: 'healed', detail: {}},
            {dir, now: OBSERVED_AT + 30001}
        );

        const onePair = await readHealLedger({dir});

        // The specimen must contain the over-counting hazard, or the test proves nothing about it.
        expect(onePair.length).toBe(2);

        const atBoundary = await bridgeFor('c1', 4, () => onePair)
            .collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(atBoundary.diagnosis.diagnosis.details.classificationReason).toBe('restart-churn-recorded');

        // Read the magnitude off the published evidence fact, not the classification `details`,
        // which carries only the reason. This is the surface a consumer of `inspect_deployment`
        // actually sees, so asserting here pins the number where it is legible rather than where it
        // was convenient.
        const churnFact = atBoundary.diagnosis.diagnosis.evidenceFacts
            .find(fact => fact.type === 'restart-churn');

        expect(churnFact.details.unplannedRestarts).toBe(3);
        expect(churnFact.details.threshold).toBe(3);
    });

    /** Unknown provenance must not raise churn: we cannot prove those restarts were not ours. */
    test('an unreadable ledger suppresses the alarm rather than guessing', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        const unreadable = await bridgeFor('c1', 9, () => {throw new Error('ledger unreadable')})
            .collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(unreadable.diagnosis?.diagnosis?.details?.classificationReason).not.toBe('restart-churn-recorded');
    });

    test('an unjudgeable baseline suppresses churn instead of silently re-anchoring', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        const file = path.join(dir, 'churn-baselines', 'orchestrator.json');

        fs.writeFileSync(file, '{ truncated');

        const after = await bridgeFor('c1', 9).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(after.diagnosis?.diagnosis?.details?.classificationReason).not.toBe('restart-churn-recorded');
        // The damaged file must NOT be replaced by a fresh anchor: a counter that re-anchors when
        // its own state is damaged can never reach a threshold.
        expect(fs.readFileSync(file, 'utf8')).toBe('{ truncated');
    });

    test('internal churn state is not published in the service record', async () => {
        const record = await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        expect(record.diagnosis === null || !Object.hasOwn(record.diagnosis, 'churnBaseline')).toBe(true);
    });

    test('a quiet container produces no churn diagnosis across two observations', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        const quiet = await bridgeFor('c1', 1).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(quiet.diagnosis?.diagnosis?.details?.classificationReason).not.toBe('restart-churn-recorded');
    });
});

test.describe('DeploymentStateBridgeService — the classification projection is load-independent (#16596)', () => {
    let savedBridgeConfig,
        savedRuntimeConfig;

    test.beforeEach(() => {
        savedBridgeConfig  = Neo.clone(AiConfig.orchestrator.deploymentStateBridge, true, true);
        savedRuntimeConfig = Neo.clone(AiConfig.orchestrator.deploymentRuntimeAccess, true, true);

        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices  : ['chroma', 'kb-server'],
            includeLogs      : false,
            statsSampleWindow: 4
        });
    });

    test.afterEach(() => {
        Object.assign(AiConfig.orchestrator.deploymentStateBridge, savedBridgeConfig);
        Object.assign(AiConfig.orchestrator.deploymentRuntimeAccess, savedRuntimeConfig);
    });

    function healthyRuntime() {
        return {
            async readObserve(request) {
                if (request.operation === 'inspect') {
                    return {
                        data : {Id: 'c-healthy', State: {Status: 'running', Health: {Status: 'healthy'}}},
                        proof: {operation: 'inspect'}
                    };
                }

                // FAR below every threshold, deliberately: the projection's whole claim is that it
                // emits when nothing is wrong.
                return {
                    data : statsSample({cpuPercent: 3, memoryPercent: 10}),
                    proof: {operation: 'stats'}
                };
            }
        };
    }

    test('a HEALTHY store exposes its class, threshold, and window state on every snapshot', async () => {
        // The falsifier this projection was created for: before it, these fields lived only inside
        // `if (memoryWindow.sustained)`, so a healthy store at a raised ceiling exposed none of them
        // and three successive post-merge verification formulations were each unobservable.
        const service = Neo.create(DeploymentStateBridgeService, {
            runtimeAccessService: healthyRuntime(),
            diagnosisService    : Neo.create(ContainerHealthDiagnosisService, {}),
            writeLog            : () => {}
        });

        const snapshot     = await service.collectSnapshot({generatedAt: OBSERVED_AT}),
              [chroma, kb] = snapshot.services;

        // Nothing is wrong — and the projection is present anyway, with the store's OWN threshold.
        expect(chroma.serviceKey).toBe('chroma');
        expect(chroma.diagnosis.status).toBe('healthy');
        expect(chroma.classification).toEqual({
            serviceKey            : 'chroma',
            serviceClass          : 'store',
            serviceClassDeclared  : true,
            appliedMemoryThreshold: 80,
            observedWindowMs      : 0,
            requiredWindowMs      : 30000,
            sampleCount           : 1,
            stampCoverage         : 1
        });

        // The transient sibling carries ITS threshold — the projection reports the class-resolved
        // number, never one global default.
        expect(kb.serviceKey).toBe('kb-server');
        expect(kb.classification).toMatchObject({
            serviceClass          : 'transient',
            serviceClassDeclared  : true,
            appliedMemoryThreshold: 90
        });

        // And the window ACCUMULATES load-independently: a second healthy observation later yields a
        // measured span, so a reader can verify the sustained-window machinery is alive without ever
        // saturating the service.
        const later = await service.collectSnapshot({generatedAt: OBSERVED_AT + 45000});

        expect(later.services[0].classification).toMatchObject({
            observedWindowMs: 45000,
            sampleCount     : 2,
            stampCoverage   : 1
        });
    });

    test('a diagnosis seam without the projection degrades to null rather than fabricating one', async () => {
        const service = Neo.create(DeploymentStateBridgeService, {
            runtimeAccessService: healthyRuntime(),
            diagnosisService    : {diagnose: () => null},
            writeLog            : () => {}
        });

        const snapshot = await service.collectSnapshot({generatedAt: OBSERVED_AT});

        expect(snapshot.services[0].classification).toBeNull();
    });
});

/**
 * @summary The self-reported heap observation is bounded before publication.
 *
 * Every other per-service field is observed from outside over the Docker socket; this one is the
 * process describing itself, and it fails in the opposite direction — a process dying of heap
 * exhaustion stops reporting exactly when the number is wanted. So the arms that matter are the ones
 * proving absence never reads as health and the previous value is never served as the current one.
 *
 * A real temporary directory rather than a mocked `fs`: the contract includes reading a file another
 * process wrote, and `AiConfig` is never mutated to redirect it.
 */
test.describe('Neo.ai.daemons.services.DeploymentStateBridgeService — heap observation bounds', () => {
    const
        OBSERVED = 1_786_234_678_257,
        cfg      = dir => ({dir, enabled: true, maxSkewMs: 15_000, staleAfterMs: 60_000, writeIntervalMs: 10_000}),
        makeDir  = () => fs.mkdtempSync(path.join(os.tmpdir(), 'neo-heap-read-')),
        write    = (dir, serviceKey, observedAt, extra = {}) => {
            fs.writeFileSync(path.join(dir, `${serviceKey}.json`), JSON.stringify({
                schemaVersion: 1,
                recordType   : 'process-heap-observation',
                serviceKey,
                provenance   : 'self-reported',
                pid          : 42,
                observation  : {observedAt, state: 'observed', oldGenerationUsedBytes: 9_000_000},
                ...extra
            }));

            return dir
        },
        read = (dir, overrides = {}) => createService({}).readHeapObservation({
            serviceKey : 'mc-server',
            nodeCommand: true,
            observedAt : OBSERVED,
            config     : cfg(dir),
            ...overrides
        });

    test('a fresh observation is available AND pairable with the container reading', () => {
        const result = read(write(makeDir(), 'mc-server', OBSERVED - 2_000));

        expect(result.status).toBe('available');
        expect(result.pairable).toBe(true);
        expect(result.ageMs).toBe(2_000);
        expect(result.provenance).toBe('self-reported');
        expect(result.observation.oldGenerationUsedBytes).toBe(9_000_000);
    });

    test('past the skew bound it stays available but is NOT pairable', () => {
        // Container memory here moves ~93 MiB in 45 s, so a 30 s-old heap reading still describes the
        // service while being useless in a ratio against a container number taken now. Two thresholds
        // on one measurement, reported separately rather than collapsed into a stricter status.
        const result = read(write(makeDir(), 'mc-server', OBSERVED - 30_000));

        expect(result.status).toBe('available');
        expect(result.pairable).toBe(false);
        expect(result.ageMs).toBe(30_000);
    });

    test('a STALE observation is unavailable — the last-known value is never served as current', () => {
        // The branch that matters: the failure this channel exists to observe is also the failure
        // that silences it.
        const result = read(write(makeDir(), 'mc-server', OBSERVED - 61_000));

        expect(result.status).toBe('unavailable');
        expect(result.unavailableReason).toBe('stale');
        expect(result.observation).toBeNull();
    });

    test('a non-Node service never attributes, even with a file sitting at its path', () => {
        // Red control for the scoping guard: the file is present and well-formed, so only the
        // `nodeCommand` requirement can reject it. Drop that requirement and this test goes green
        // against a service that has no heap to report.
        const result = read(write(makeDir(), 'mc-server', OBSERVED - 1_000), {nodeCommand: false});

        expect(result.status).toBe('unavailable');
        expect(result.unavailableReason).toBe('not-node');
        expect(result.observation).toBeNull();
    });

    test('an UNKNOWN identity refuses too, but does NOT claim to be non-Node', () => {
        // Both refuse — the gate is `nodeCommand !== true` and that is correct. But the REASON must
        // not collapse them: `not-node` is a positive claim that the service has no heap, while a
        // null `nodeCommand` only means the inspect could not be read. A consumer that reads the
        // refusal as a classification lets an unknown service inherit non-Node authority, which is
        // exactly how an unreadable inspect produced an authoritative container-scoped
        // memory-saturation downstream.
        const result = read(write(makeDir(), 'mc-server', OBSERVED - 1_000), {nodeCommand: null});

        expect(result.status).toBe('unavailable');
        expect(result.unavailableReason).toBe('identity-unknown');
        expect(result.unavailableReason).not.toBe('not-node');
        expect(result.observation).toBeNull();
    });

    test('a record written by a DIFFERENT service is refused, not attributed', () => {
        const dir = makeDir();

        fs.writeFileSync(path.join(dir, 'mc-server.json'), JSON.stringify({
            recordType : 'process-heap-observation',
            serviceKey : 'kb-server',
            observation: {observedAt: OBSERVED - 1_000, state: 'observed'}
        }));

        expect(read(dir).unavailableReason).toBe('identity-mismatch');
    });

    test('an observation from the FUTURE is clock-skew, not freshness', () => {
        expect(read(write(makeDir(), 'mc-server', OBSERVED + 40_000)).unavailableReason).toBe('clock-skew');
    });

    test('absent, malformed and disabled each carry their own reason and no observation', () => {
        const empty = makeDir();

        expect(read(empty).unavailableReason).toBe('absent');

        fs.writeFileSync(path.join(empty, 'mc-server.json'), JSON.stringify({recordType: 'something-else'}));
        expect(read(empty).unavailableReason).toBe('malformed');

        const live = write(makeDir(), 'mc-server', OBSERVED - 1_000);

        expect(read(live, {config: {...cfg(live), enabled: false}}).unavailableReason).toBe('channel-disabled');
    });

    test('the published field NEVER reaches diagnose() — the fact cannot move with it', async () => {
        // AC-8's control. Two collections differing only in the heap-observation outcome, with a
        // REAL fact produced in both. If the envelope varies and the diagnosis does not, the field
        // provably does not feed the decision — and the handoff witness proves the stronger claim
        // that `diagnose()` is never even offered it.
        const previous = Neo.clone(AiConfig.orchestrator.deploymentStateBridge, true, true);

        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices  : ['mc-server'],
            includeLogs      : false,
            statsSampleWindow: 2
        });

        const collect = async cmd => {
            const diagnoseArgs = [];

            const runtimeAccessService = {
                async readObserve(request) {
                    if (request.operation === 'inspect') {
                        return {
                            data : {Name: '/mc-server', State: {Status: 'running'}, Config: {Cmd: cmd, Image: 'neo'}},
                            proof: {operation: 'inspect'}
                        }
                    }

                    if (request.operation === 'stats') {
                        return {data: statsSample({cpuPercent: 5, memoryPercent: 95}), proof: {operation: 'stats'}}
                    }

                    return {data: {logs: ''}, proof: {operation: 'logs'}}
                }
            };

            const diagnosisService = {
                diagnose(args) {
                    diagnoseArgs.push(args);

                    return {status: 'advisory', facts: [{type: 'memory-saturation', severity: 'critical'}]}
                }
            };

            // `collectServiceSnapshot`, NOT `collectSnapshot`: the latter PERSISTS the
            // deployment-state snapshot to the configured path, and `McpServerListToolsSmoke`
            // reads that same worker-local artifact and asserts its boundary segment. A control
            // for a non-effect has no business writing a file the rest of the suite reads — the
            // per-service method returns the identical record without the side effect.
            const service = await createService({runtimeAccessService, diagnosisService})
                .collectServiceSnapshot({serviceKey: 'mc-server', observedAt: OBSERVED_AT});

            return {diagnoseArgs, service}
        };

        let asNode, asNonNode;

        // `finally`, not a trailing statement: an assertion or collection throwing before the
        // restore would leave the shared singleton mutated for every spec that runs after this
        // one, and the symptom surfaces as an unrelated failure in another file.
        try {
            asNode    = await collect(['node', '--max-old-space-size=768', 'server.mjs']);
            asNonNode = await collect(['python3', 'server.py'])
        } finally {
            Object.assign(AiConfig.orchestrator.deploymentStateBridge, previous)
        }

        // Non-vacuity: the two runs genuinely differ on the field under test, so equality below is
        // a result rather than an artifact of nothing having changed.
        expect(asNode.service.heapObservation.unavailableReason).toBe('absent');
        expect(asNonNode.service.heapObservation.unavailableReason).toBe('not-node');

        // ...and a real fact exists in both, so this is not two empty diagnoses agreeing.
        expect(asNode.service.diagnosis.facts).toHaveLength(1);
        expect(asNode.service.diagnosis.facts[0].type).toBe('memory-saturation');

        expect(asNonNode.service.diagnosis).toEqual(asNode.service.diagnosis);

        // The strongest form: diagnose() is never offered the field at all.
        expect(asNode.diagnoseArgs).toHaveLength(1);
        expect(Object.hasOwn(asNode.diagnoseArgs[0], 'heapObservation')).toBe(false);
    });

    test('no unavailable arm ever reports a number — absence is never zero', () => {
        const dir = write(makeDir(), 'mc-server', OBSERVED - 61_000);

        for (const overrides of [{}, {nodeCommand: false}, {nodeCommand: null}]) {
            const result = read(dir, overrides);

            expect(result.observation, `${JSON.stringify(overrides)}: observation must be null`).toBeNull();
            expect(result.pairable).toBe(false);
            expect(result.unavailableReason).toBeTruthy();
        }
    });
});

/**
 * Degraded-but-serving: the state a binary derived from consecutiveness cannot express.
 */
test.describe('summarizeProbeReliability — a rate the healthy/unhealthy binary cannot say', () => {
    const probe = exitCode => ({Start: '2026-08-09T14:36:23Z', End: '2026-08-09T14:36:31Z', ExitCode: exitCode});

    test('the EXACT observed shape: four failures, one pass, and the runtime still says healthy', () => {
        // Measured on the canonical plane. Every surface reported `healthy` while two maintainer
        // seats lost Memory Core writes for hours. `FailingStreak` had already reset to 0 on the
        // pass, so both published numbers were true and neither was reportable as degradation.
        const summary = summarizeProbeReliability({
            Status       : 'healthy',
            FailingStreak: 0,
            Log          : [probe(1), probe(1), probe(1), probe(-1), probe(0)]
        });

        expect(summary).toEqual({
            sampleCount  : 5,
            failureCount : 4,
            failureRate  : 0.8,
            failingStreak: 0,
            disposition  : 'degraded-but-serving'
        });
    });

    test('a health-check TIMEOUT (-1) counts as a failure — the case the surface most needs', () => {
        // A runtime reports "the check exceeded its own timeout" as -1. Counting only positive exit
        // codes would discard precisely the probes that were too slow to answer, which is the
        // failure mode a contended plane actually exhibits.
        expect(summarizeProbeReliability({FailingStreak: 1, Log: [probe(-1), probe(0)]})).toMatchObject({
            failureCount: 1,
            failureRate : 0.5,
            disposition : 'degraded-but-serving'
        });
    });

    test('nominal and failing stay distinguishable at the ends', () => {
        expect(summarizeProbeReliability({FailingStreak: 0, Log: [probe(0), probe(0)]})).toMatchObject({
            failureRate: 0,
            disposition: 'nominal'
        });
        expect(summarizeProbeReliability({FailingStreak: 2, Log: [probe(1), probe(1)]})).toMatchObject({
            failureRate: 1,
            disposition: 'failing'
        });
    });

    test('a container with no healthcheck reports null, never a fabricated clean rate', () => {
        // `failureRate: 0` on a service nobody probes would read as evidence of health.
        expect(summarizeProbeReliability(undefined)).toBeNull();
        expect(summarizeProbeReliability({})).toBeNull();
        expect(summarizeProbeReliability({Log: []})).toBeNull();
    });

    test('the streak alone cannot discriminate — which is why the rate is published beside it', () => {
        // POSITIVE CONTROL for the ticket's premise. Both of these carry `FailingStreak: 0`, the
        // value an oscillating service shows every time it is observed just after a pass. Any
        // consumer keying on the streak sees one number; the rate separates them.
        const oscillating = summarizeProbeReliability({FailingStreak: 0, Log: [probe(1), probe(1), probe(1), probe(0)]}),
              healthy     = summarizeProbeReliability({FailingStreak: 0, Log: [probe(0), probe(0), probe(0), probe(0)]});

        expect(oscillating.failingStreak).toBe(healthy.failingStreak);
        expect(oscillating.disposition).not.toBe(healthy.disposition);
    });
});
