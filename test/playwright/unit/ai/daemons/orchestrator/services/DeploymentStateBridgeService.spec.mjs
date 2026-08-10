import {describeCorpusOutstanding} from '../../../../../../../ai/services/knowledge-base/helpers/corpusOutstanding.mjs';
import {readFileSync}              from 'fs';
import {test, expect}              from '@playwright/test';
import fs                          from 'fs';
import os                          from 'os';
import path                        from 'path';
import Neo                         from '../../../../../../../src/Neo.mjs';
import * as core                   from '../../../../../../../src/core/_export.mjs';
import AiConfig                    from '../../../../../../../ai/config.template.mjs';
import {
    classifyDirectProbeOutcome,
    DeploymentStateBridgeService,
    summarizeProbeReliability
} from '../../../../../../../ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs';
import {ContainerHealthDiagnosisService} from '../../../../../../../ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs';
import {appendHealEvent, readHealLedger} from '../../../../../../../ai/services/memory-core/helpers/healEventLedgerStore.mjs';
import {
    TENANT_REPO_INGEST_CONTRACT_VERSION
} from '../../../../../../../ai/daemons/orchestrator/services/tenantRepoCheckpointValidity.mjs';
import {snapshotAiConfig} from '../../../services/memory-core/util.mjs';

const OBSERVED_AT = 1710000000000;

/**
 * Every `orchestrator.deploymentStateBridge` leaf this suite writes, named explicitly.
 *
 * `snapshotAiConfig` captures by RESOLVED value, so each leaf has to be listed — the cost of that is
 * this list, and the benefit is that a leaf nobody names is a leaf nobody silently fails to restore.
 * `snapshotPath` and `maxSnapshotBytes` are here because the edge-trigger spec writes them; before
 * they were listed, that write escaped the suite entirely.
 */
const BRIDGE_CONFIG_PATHS = [
    'orchestrator.deploymentStateBridge.allowedServices',
    'orchestrator.deploymentStateBridge.includeLogs',
    'orchestrator.deploymentStateBridge.logTail',
    'orchestrator.deploymentStateBridge.logMaxBytes',
    'orchestrator.deploymentStateBridge.statsSampleWindow',
    'orchestrator.deploymentStateBridge.providerResidencyServiceKeys',
    'orchestrator.deploymentStateBridge.recoveryRunLimit',
    'orchestrator.deploymentStateBridge.selfHealRecentEventLimit',
    'orchestrator.deploymentStateBridge.snapshotPath',
    'orchestrator.deploymentStateBridge.maxSnapshotBytes'
];

/**
 * Every `orchestrator.deploymentRuntimeAccess` leaf this file writes.
 *
 * The first version of this list held `allowedServices` alone, while the suite also writes
 * `enabled`, `composeProject` and `readOperations`. Three live writes therefore kept leaking after a
 * repair whose whole premise is that an unnamed leaf is an unrestored leaf — the rule was stated in
 * the same change that under-applied it, which is exactly why the control below asserts the
 * restoration rather than trusting the list.
 */
const RUNTIME_ACCESS_CONFIG_PATHS = [
    'orchestrator.deploymentRuntimeAccess.enabled',
    'orchestrator.deploymentRuntimeAccess.composeProject',
    'orchestrator.deploymentRuntimeAccess.allowedServices',
    'orchestrator.deploymentRuntimeAccess.readOperations'
];

let restoreBridgeConfig,
    restoreRuntimeAccessConfig;

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
    directProbeFn = null,
    providerResidencyProbe = async () => null,
    providerActivityProbe = null,
    providerActivityWindowMs = 24 * 60 * 60 * 1000,
    providerActivityLimit = 50,
    recoveryRunStateReader = null,
    healLedgerDir = null,
    healLedgerReader = null,
    taskStateService = null,
    tenantRepoSyncService = null,
    tenantRepoSyncEnabledReader = null,
    nowFn = () => OBSERVED_AT
} = {}) {
    return Neo.create(DeploymentStateBridgeService, {
        runtimeAccessService,
        diagnosisService,
        taskStateService,
        tenantRepoSyncService,
        tenantRepoSyncEnabledReader,
        directProbeFn,
        providerResidencyProbe,
        providerActivityProbe,
        providerActivityWindowMs,
        providerActivityLimit,
        recoveryRunStateReader,
        healLedgerDir,
        healLedgerReader,
        nowFn
    });
}

test.describe('Neo.ai.daemons.services.DeploymentStateBridgeService', () => {
    // `Neo.clone` of an AiConfig node captures NOTHING: the Provider resolves leaves through its
    // `get` trap while `Object.keys` lists none of them, so the clone is an empty object and the
    // paired `Object.assign(node, original)` restores nothing at all. The hand-rolled pair here read
    // as careful hygiene and was a no-op — every key set below leaked into every later spec sharing
    // the worker, which is how a snapshot path set by one test reached an unrelated MCP smoke
    // assertion. Captured by resolved value instead, naming each leaf explicitly.
    test.beforeEach(() => {
        restoreBridgeConfig        = snapshotAiConfig(AiConfig, BRIDGE_CONFIG_PATHS);
        restoreRuntimeAccessConfig = snapshotAiConfig(AiConfig, RUNTIME_ACCESS_CONFIG_PATHS);

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
        restoreBridgeConfig?.();
        restoreRuntimeAccessConfig?.();
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

    test('composes one passive provider-work projection into each configured model-service diagnosis', async () => {
        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices: ['model'],
            includeLogs    : false
        });

        const
            activityCalls        = [],
            residencyCalls       = [],
            diagnoses            = [],
            runtimeAccessService = {
                async readObserve({operation}) {
                    if (operation === 'inspect') {
                        return {
                            data : {State: {Status: 'running', StartedAt: new Date(OBSERVED_AT - 120_000).toISOString()}},
                            proof: {operation}
                        };
                    }

                    return {
                        data : statsSample({cpuPercent: 399}),
                        proof: {operation}
                    };
                }
            },
            providerResidencyProbe = async options => {
                residencyCalls.push(options);

                return {
                    provider       : 'ollama',
                    ready          : true,
                    model          : 'gemma4:26b',
                    embeddingModel : 'qwen3-embedding:latest',
                    requiredModels : ['gemma4:26b', 'qwen3-embedding:latest'],
                    availableModels: ['gemma4:26b', 'qwen3-embedding:latest']
                };
            },
            providerActivityProbe = async options => {
                activityCalls.push(options);

                return {
                    status                    : 'ok',
                    totalActivities           : 0,
                    totalInFlight             : 0,
                    totalRecentCompletions    : 0,
                    inFlightTruncated         : false,
                    recentCompletionsTruncated: false,
                    aggregates                : [],
                    inFlight                  : [],
                    recentCompletions         : []
                };
            },
            diagnosisService = {
                diagnose(options) {
                    diagnoses.push(options);
                    return {status: 'healthy'};
                }
            },
            service = createService({
                runtimeAccessService,
                diagnosisService,
                providerResidencyProbe,
                providerActivityProbe
            }),
            snapshot = await service.collectSnapshot();

        expect(activityCalls).toEqual([{
            sinceTs   : OBSERVED_AT - 24 * 60 * 60 * 1000,
            limit     : 50,
            observedAt: OBSERVED_AT
        }]);
        expect(residencyCalls).toEqual([expect.objectContaining({serviceKey: 'model', observedAt: OBSERVED_AT})]);
        expect(diagnoses).toHaveLength(1);
        expect(diagnoses[0]).toMatchObject({
            serviceKey      : 'model',
            providerActivity: {
                recordType   : 'deployment-provider-activity',
                source       : 'provider-activity-ledger',
                status       : 'ok',
                observedAt   : OBSERVED_AT,
                sinceMs      : 24 * 60 * 60 * 1000,
                totalInFlight: 0
            },
            providerResidency: {
                provider      : 'ollama',
                targetIdentity: {kind: 'compose-service', id: 'model'}
            }
        });
        expect(snapshot.services[0].providerActivity).toEqual(diagnoses[0].providerActivity);
    });

    test('routes a sustained passive local-model residual through the real bridge and diagnosis', async () => {
        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices: ['local-model'],
            includeLogs    : false
        });

        const
            runtimeCalls         = [],
            providerCalls        = [],
            runtimeAccessService = {
                async readObserve({operation}) {
                    runtimeCalls.push(operation);

                    if (operation === 'inspect') {
                        return {
                            data: {
                                State: {
                                    Status   : 'running',
                                    StartedAt: new Date(OBSERVED_AT - 120_000).toISOString()
                                }
                            },
                            proof: {operation, target: {containerId: 'local-model-A'}}
                        };
                    }

                    return {
                        data : statsSample({cpuPercent: 399}),
                        proof: {operation, target: {containerId: 'local-model-A'}}
                    };
                }
            },
            providerResidencyProbe = async () => ({
                provider       : 'ollama',
                host           : 'http://local-model:11434',
                ready          : true,
                model          : 'gemma4:26b',
                embeddingModel : 'qwen3-embedding:latest',
                availableModels: ['gemma4:26b', 'qwen3-embedding:latest']
            }),
            providerActivityProbe = async options => {
                providerCalls.push(options);

                return {
                    status                    : 'ok',
                    totalActivities           : 0,
                    totalInFlight             : 0,
                    totalRecentCompletions    : 0,
                    inFlightTruncated         : false,
                    recentCompletionsTruncated: false,
                    aggregates                : [],
                    inFlight                  : [],
                    recentCompletions         : []
                };
            },
            diagnosisService = Neo.create(ContainerHealthDiagnosisService, {
                nowFn           : () => OBSERVED_AT,
                ollamaHostReader: () => 'http://local-model:11434'
            }),
            clock = {now: OBSERVED_AT - 30_000},
            service = createService({
                runtimeAccessService,
                diagnosisService,
                providerResidencyProbe,
                providerActivityProbe,
                nowFn: () => clock.now
            }),
            first = await service.collectSnapshot({generatedAt: OBSERVED_AT - 30_000});

        clock.now = OBSERVED_AT;

        const second = await service.collectSnapshot({generatedAt: OBSERVED_AT});

        expect(first.services[0].diagnosis.actionClass).toBeNull();
        expect(second.services[0]).toMatchObject({
            serviceKey: 'local-model',
            diagnosis : {
                status        : 'diagnosed',
                actionClass   : 'restart',
                targetIdentity: {kind: 'compose-service', id: 'local-model'},
                diagnosis     : {
                    recoveryClass: 'exhaustion',
                    details      : {classificationReason: 'ollama-residual-load-restart'}
                }
            }
        });
        expect(second.services[0].diagnosis.diagnosis.evidenceFacts.map(fact => fact.type)).toEqual([
            'ollama-residual-load',
            'resource-saturation'
        ]);
        expect(providerCalls).toHaveLength(2);
        expect(runtimeCalls).toEqual(['inspect', 'stats', 'inspect', 'stats']);
    });

    test('reads provider demand after earlier service awaits and immediately before local-model diagnosis', async () => {
        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices: ['orchestrator', 'local-model'],
            includeLogs    : false
        });

        let activityStarted = false;

        const
            probeSawStarted      = [],
            runtimeAccessService = {
                async readObserve({serviceKey, operation}) {
                    if (serviceKey === 'orchestrator') activityStarted = true;

                    const containerId = `${serviceKey}-A`;

                    if (operation === 'inspect') {
                        return {
                            data: {
                                State: {
                                    Status   : 'running',
                                    StartedAt: new Date(OBSERVED_AT - 120_000).toISOString()
                                }
                            },
                            proof: {operation, target: {containerId}}
                        };
                    }

                    return {
                        data : statsSample({cpuPercent: serviceKey === 'local-model' ? 399 : 0}),
                        proof: {operation, target: {containerId}}
                    };
                }
            },
            providerResidencyProbe = async () => ({
                provider       : 'ollama',
                host           : 'http://local-model:11434',
                ready          : true,
                model          : 'gemma4:26b',
                embeddingModel : 'qwen3-embedding:latest',
                availableModels: ['gemma4:26b', 'qwen3-embedding:latest']
            }),
            providerActivityProbe = async () => {
                probeSawStarted.push(activityStarted);

                const inFlight = activityStarted ? [{
                    activityId    : 'activity-after-snapshot-start',
                    provider      : 'ollama',
                    service       : 'knowledge-base',
                    operationStage: 'embedding',
                    role          : 'embedding',
                    model         : 'qwen3-embedding:latest',
                    elapsedMs     : 1
                }] : [];

                return {
                    status                    : 'ok',
                    totalActivities           : inFlight.length,
                    totalInFlight             : inFlight.length,
                    totalRecentCompletions    : 0,
                    inFlightTruncated         : false,
                    recentCompletionsTruncated: false,
                    aggregates                : [],
                    inFlight,
                    recentCompletions         : []
                };
            },
            diagnosisService = Neo.create(ContainerHealthDiagnosisService, {
                nowFn           : () => OBSERVED_AT,
                ollamaHostReader: () => 'http://local-model:11434'
            }),
            service = createService({
                runtimeAccessService,
                diagnosisService,
                providerResidencyProbe,
                providerActivityProbe,
                nowFn: () => OBSERVED_AT
            });

        service.rememberStatsSample(
            'local-model',
            statsSample({cpuPercent: 399}),
            OBSERVED_AT - 30_000,
            null,
            'local-model-A'
        );

        const snapshot   = await service.collectSnapshot({generatedAt: OBSERVED_AT});
        const localModel = snapshot.services.find(entry => entry.serviceKey === 'local-model');

        expect(probeSawStarted).toEqual([true]);
        expect(localModel.providerActivity.totalInFlight).toBe(1);
        expect(localModel.diagnosis.actionClass).toBeNull();
        expect(localModel.diagnosis.facts).toContainEqual(expect.objectContaining({
            type   : 'ollama-residual-load',
            details: expect.objectContaining({reasonCode: 'provider-demand-in-flight'})
        }));
    });

    test('clears the sustained stats window when the runtime container incarnation changes', () => {
        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {statsSampleWindow: 2});

        const service = createService();

        service.rememberStatsSample('local-model', statsSample({cpuPercent: 399}), OBSERVED_AT - 30_000, null, 'container-A');
        service.rememberStatsSample('local-model', statsSample({cpuPercent: 399}), OBSERVED_AT, null, 'container-B');

        expect(service.getStatsSamples('local-model')).toEqual([
            expect.objectContaining({containerId: 'container-B', observedAtMs: OBSERVED_AT})
        ]);
    });

    test('publishes an unavailable provider-work envelope instead of manufacturing idle', async () => {
        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices: ['local-model'],
            includeLogs    : false
        });

        const runtimeAccessService = {
                  async readObserve({operation}) {
                      return {
                          data : operation === 'inspect' ? {State: {Status: 'running'}} : statsSample(),
                          proof: {operation}
                      };
                  }
              },
              service  = createService({runtimeAccessService}),
              snapshot = await service.collectSnapshot();

        expect(snapshot.services[0].providerActivity).toMatchObject({
            recordType       : 'deployment-provider-activity',
            status           : 'unavailable',
            unavailableReason: 'probe-unconfigured',
            totalInFlight    : null,
            inFlight         : null
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

    test('collectTenantRepoSyncSnapshot says whether a cadence is CAPPED, across all three states', async () => {
        // The operator-facing row is where the ambiguity lives: `effectiveCadenceMs: 7200000` is either a
        // 2h configuration or a streak that ran so far past the cap that the cap is all that remains.
        // `backoffMultiplier` beside it hints, but only the flag settles it. Three repos in one
        // projection so the discriminator is asserted against its own negative and its own no-answer.
        const service = createService({
            taskStateService: {
                getTaskState() {
                    return {
                        running       : false,
                        pid           : null,
                        lastRunAt     : OBSERVED_AT - 1,
                        lastSuccessAt : null,
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
                        tenantRepos: [
                            {tenantId: 'tenant-a', repoSlug: 'org/capped',   cloneUrl: 'https://git.example/a.git', cadenceMs: 60_000, configTier: 'yaml'},
                            {tenantId: 'tenant-a', repoSlug: 'org/healthy',  cloneUrl: 'https://git.example/b.git', cadenceMs: 60_000, configTier: 'yaml'},
                            {tenantId: 'tenant-a', repoSlug: 'org/disabled', cloneUrl: 'https://git.example/c.git', cadenceMs: 60_000, configTier: 'yaml', disabled: true}
                        ]
                    };
                },
                defaultRevisionsFilePath() {
                    return '/state/revisions.json';
                },
                async readPersistedRevisions() {
                    // 2^12 = 4096 against a 60s base is ~68 hours, far past the 2h configured cap.
                    return {
                        'tenant-a/org/capped': {
                            lastIngestedRev    : null,
                            lastRunAttemptAt   : OBSERVED_AT - 1_000,
                            consecutiveFailures: 12,
                            lastErrorCode      : 'KB_TENANT_REPO_SYNC_SYNC_FAILED'
                        },
                        'tenant-a/org/healthy': {
                            lastIngestedRev    : 'abcdef1234567890',
                            lastRunAttemptAt   : OBSERVED_AT - 1_000,
                            consecutiveFailures: 0
                        },
                        'tenant-a/org/disabled': {
                            lastIngestedRev    : 'fedcba0987654321',
                            lastRunAttemptAt   : OBSERVED_AT - 1_000,
                            consecutiveFailures: 0
                        }
                    };
                }
            },
            tenantRepoSyncEnabledReader: () => true
        });

        const
            tenantRepoSync = await service.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT}),
            byMultiplier   = value => tenantRepoSync.repos.find(row => row.backoffMultiplier === value),
            capped         = byMultiplier(4096),
            healthy        = byMultiplier(1),
            disabledRow    = tenantRepoSync.repos.find(row => row.disabled);

        // Capped: the cadence IS the cap, and the row says so rather than leaving it to be inferred.
        expect(capped.backoffCapped).toBe(true);
        expect(capped.effectiveCadenceMs).toBe(2 * 60 * 60 * 1000);

        // NEGATIVE CONTROL — without it, hard-coding `true` passes. A healthy repo's cadence is derived,
        // and it must be reported below the cap rather than at it.
        expect(healthy.backoffCapped).toBe(false);
        expect(healthy.effectiveCadenceMs).toBeLessThan(2 * 60 * 60 * 1000);

        // NO-ANSWER CONTROL — a disabled repo has no cadence, so "is the cap binding?" has no answer.
        // `false` here would read as an observation that it is not.
        expect(disabledRow.backoffCapped).toBeNull();
        expect(disabledRow.effectiveCadenceMs).toBeNull();
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

    /**
     * @summary The census control — it reads THIS FILE and refuses a leaf the snapshot lists miss.
     *
     * Asserting that the listed leaves restore would be circular: the baseline would be built from
     * the same list it is meant to validate, so a leaf nobody named is a leaf nobody checks. That is
     * how the first version of this repair shipped with three live runtime-access writes still
     * leaking while every assertion stayed green.
     *
     * So the source is the population. Both write-shapes this suite uses are extracted mechanically
     * — the direct `node.leaf =` assignment and the keys of an `Object.assign(node, {...})` block —
     * and the snapshot lists must cover the result. Adding a mutated leaf without listing it reddens
     * here rather than surfacing three suites later in an unrelated worker.
     */
    test('CONTROL: the snapshot lists cover every config leaf this file writes', () => {
        const
            source = readFileSync(new URL(import.meta.url), 'utf8'),
            listed = new Set([...BRIDGE_CONFIG_PATHS, ...RUNTIME_ACCESS_CONFIG_PATHS]),
            found  = new Set();

        for (const node of ['deploymentStateBridge', 'deploymentRuntimeAccess']) {
            const prefix = `orchestrator.${node}`;

            for (const [, leaf] of source.matchAll(new RegExp(`AiConfig\\.orchestrator\\.${node}\\.([a-zA-Z][a-zA-Z0-9]*)\\s*=(?![=>])`, 'g'))) {
                found.add(`${prefix}.${leaf}`);
            }

            for (const [, block] of source.matchAll(new RegExp(`Object\\.assign\\(AiConfig\\.orchestrator\\.${node},\\s*\\{([^}]*)\\}`, 'g'))) {
                for (const [, leaf] of block.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)) {
                    found.add(`${prefix}.${leaf}`);
                }
            }
        }

        // Non-vacuity: a regex that matched nothing would pass this test silently, which is the
        // exact defect class it exists to catch.
        expect(found.size, 'the extractor must actually find the suite\'s writes').toBeGreaterThan(5);

        expect([...found].filter(leaf => !listed.has(leaf)), 'mutated but not snapshotted — it will leak into the next spec in this worker')
            .toEqual([]);
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
    let restoreSavedBridgeConfig,
        restoreSavedRuntimeConfig;

    // Same decorative-restore defect as the suite above: a `Neo.clone` of an AiConfig node yields an
    // empty object, so the paired `Object.assign` restored nothing.
    test.beforeEach(() => {
        restoreSavedBridgeConfig  = snapshotAiConfig(AiConfig, BRIDGE_CONFIG_PATHS);
        restoreSavedRuntimeConfig = snapshotAiConfig(AiConfig, RUNTIME_ACCESS_CONFIG_PATHS);

        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices  : ['chroma', 'kb-server'],
            includeLogs      : false,
            statsSampleWindow: 4
        });
    });

    test.afterEach(() => {
        restoreSavedBridgeConfig?.();
        restoreSavedRuntimeConfig?.();
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
        const clock   = {now: OBSERVED_AT},
              service = Neo.create(DeploymentStateBridgeService, {
            runtimeAccessService: healthyRuntime(),
            diagnosisService    : Neo.create(ContainerHealthDiagnosisService, {}),
            writeLog            : () => {},
            nowFn               : () => clock.now
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
        clock.now = OBSERVED_AT + 45000;

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
        const restorePrevious = snapshotAiConfig(AiConfig, BRIDGE_CONFIG_PATHS);

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
            restorePrevious()
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
 * The rate a healthy/unhealthy binary cannot express — as RAW FACTS, not as a verdict.
 */
test.describe('summarizeProbeReliability — bounded facts, and no unlicensed verdict', () => {
    const probe = exitCode => ({Start: '2026-08-09T14:36:23Z', End: '2026-08-09T14:36:31Z', ExitCode: exitCode});

    test('the EXACT observed shape: four failures, one pass, and the runtime still says healthy', () => {
        // Measured on the canonical plane. Every surface reported `healthy` while two maintainer
        // seats lost Memory Core writes for hours; `FailingStreak` had already reset to 0 on the
        // pass, so both published numbers were true and neither was reportable as degradation.
        expect(summarizeProbeReliability({
            Status       : 'healthy',
            FailingStreak: 0,
            Log          : [probe(1), probe(1), probe(1), probe(-1), probe(0)]
        })).toEqual({
            status       : 'available',
            sampleCount  : 5,
            failureCount : 4,
            failureRate  : 0.8,
            failingStreak: 0
        });
    });

    test('NO VERDICT is published — the observation does not decide whether the service is serving', () => {
        // @neo-gpt's Required Action 1. An earlier revision named the service
        // `degraded-but-serving`, which a bounded probe observation cannot license: an ALREADY
        // UNHEALTHY container with one pass and one failure got that label, and one old failure
        // followed by four passes got it too, because a flat ring carries no recency.
        const unhealthyMixed = summarizeProbeReliability({Status: 'unhealthy', FailingStreak: 1, Log: [probe(1), probe(0)]}),
              oldFailure     = summarizeProbeReliability({Status: 'healthy', FailingStreak: 0, Log: [probe(1), probe(0), probe(0), probe(0), probe(0)]});

        for (const summary of [unhealthyMixed, oldFailure]) {
            expect(summary).not.toHaveProperty('disposition');
            expect(JSON.stringify(summary)).not.toContain('serving');
        }

        // The facts still discriminate — dropping the verdict did not drop the signal.
        expect(unhealthyMixed.failureRate).toBe(0.5);
        expect(oldFailure.failureRate).toBe(0.2);
    });

    test('a health-check TIMEOUT (-1) counts as a failure — the case the surface most needs', () => {
        // A runtime reports "the check exceeded its own timeout" as -1. Counting only positive exit
        // codes would discard precisely the probes that were too slow to answer.
        expect(summarizeProbeReliability({FailingStreak: 1, Log: [probe(-1), probe(0)]})).toMatchObject({
            failureCount: 1,
            failureRate : 0.5
        });
    });

    test('NOT-APPLICABLE and UNAVAILABLE stay distinct — no healthcheck is not an unsampled one', () => {
        // Collapsing both to null makes a declared-but-unsampled service indistinguishable from an unprobeable
        // one, so "no data" reads as "no concern".
        expect(summarizeProbeReliability(undefined)).toMatchObject({status: 'not-applicable'});
        expect(summarizeProbeReliability({Status: 'starting', Log: []})).toMatchObject({status: 'unavailable'});
        expect(summarizeProbeReliability(undefined).status)
            .not.toBe(summarizeProbeReliability({Log: []}).status);
    });

    test('a never-probed service reports NO rate — absence is never a clean zero', () => {
        // `failureRate: 0` on a service nobody probed would read as evidence of health.
        expect(summarizeProbeReliability({Log: []})).not.toHaveProperty('failureRate');
    });

    test('the streak alone cannot discriminate — which is why the rate travels beside it', () => {
        // POSITIVE CONTROL for the ticket's premise. Both carry `FailingStreak: 0`, the value an
        // oscillating service shows whenever it is observed just after a pass.
        const oscillating = summarizeProbeReliability({FailingStreak: 0, Log: [probe(1), probe(1), probe(1), probe(0)]}),
              healthy     = summarizeProbeReliability({FailingStreak: 0, Log: [probe(0), probe(0), probe(0), probe(0)]});

        expect(oscillating.failingStreak).toBe(healthy.failingStreak);
        expect(oscillating.failureRate).not.toBe(healthy.failureRate);
    });
});

/**
 * The WRITER seam, not the helper.
 *
 * @neo-gpt's falsifier: every test above stays green if the production assignment in
 * `summarizeInspect` is deleted, because they exercise the pure function and never witness the field
 * reaching the record an operator reads. Helper coverage is not a writer witness.
 */
test.describe('probeReliability reaches the service record', () => {
    let dir;

    const runtimeWithHealth = Health => ({
        async readObserve({operation}) {
            if (operation === 'inspect') {
                return {
                    data : {Id: 'c1', RestartCount: 0, Name: '/mc-server', State: {Status: 'running', Health}},
                    proof: {operation}
                };
            }
            return {data: null, proof: {operation}};
        }
    });

    const bridgeFor = Health => createService({
        diagnosisService    : Neo.create(ContainerHealthDiagnosisService, {}),
        healLedgerDir       : dir,
        runtimeAccessService: runtimeWithHealth(Health)
    });

    test.beforeEach(() => {dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-writer-'))});
    test.afterEach(() => {fs.rmSync(dir, {recursive: true, force: true})});

    test('an oscillating container publishes its RATE in the record, beside the runtime verdict', async () => {
        const snapshot = await bridgeFor({
            Status       : 'healthy',
            FailingStreak: 0,
            Log          : [{ExitCode: 1}, {ExitCode: 1}, {ExitCode: 1}, {ExitCode: -1}, {ExitCode: 0}]
        }).collectServiceSnapshot({serviceKey: 'mc-server', observedAt: OBSERVED_AT});

        // Deleting the production assignment turns THIS red; the helper tests would not notice.
        expect(snapshot.inspect.state.probeReliability).toMatchObject({
            status      : 'available',
            sampleCount : 5,
            failureCount: 4,
            failureRate : 0.8
        });

        // Published BESIDE the runtime's own verdict, never folded into it — the recovery lane and
        // the two-channel evidence pairing both depend on `health` keeping its exact prior meaning.
        expect(snapshot.inspect.state.health).toBe('healthy');
    });

    test('a container with no declared healthcheck records not-applicable, not silence', async () => {
        const snapshot = await bridgeFor(undefined)
            .collectServiceSnapshot({serviceKey: 'mc-server', observedAt: OBSERVED_AT});

        expect(snapshot.inspect.state.probeReliability).toMatchObject({status: 'not-applicable'});
        expect(snapshot.inspect.state.health).toBeNull();
    });
});

/**
 * The single decision separating "a wedged container gets restarted" from "a healthy container gets
 * restarted every sweep". Tested against the PURE classifier rather than through the config lookup,
 * so every failure shape is reachable without a live server and without mutating the AiConfig
 * singleton (ADR-0019 B4). Each arm below is a distinct way to get this wrong. // ticket-ref-ok: the ADR clause is why these tests avoid the singleton, not background reading
 */
test.describe('classifyDirectProbeOutcome — a probe fault is not a service fault (#16766)', () => {
    function timeoutError(verdict) {
        const error = new Error('tool call timed out after 8000ms');

        error.probeTiming = {verdict};

        return error;
    }

    test('an ANSWERED status outside the accepted set is service evidence', () => {
        expect(classifyDirectProbeOutcome(new Error("Expected healthcheck status 'healthy' or 'degraded', got 'unhealthy'.")))
            .toMatchObject({ok: false, message: 'status-not-accepted'});
    });

    test('a service-unresponsive TIMEOUT is service evidence', () => {
        expect(classifyDirectProbeOutcome(timeoutError('service-unresponsive')))
            .toMatchObject({ok: false, message: 'service-unresponsive'});
    });

    test('SAFETY — a PROBE-STARVED timeout is evidence about the BOX and yields NO fact', () => {
        // `classifyProbeFailure` already separates these two verdicts. Counting a starved probe as a
        // failed service would turn our own scheduling latency into a restart loop on exactly the
        // saturated plane least able to absorb one.
        expect(classifyDirectProbeOutcome(timeoutError('probe-starved'))).toBeNull();
    });

    test('SAFETY — unreachable, malformed and auth failures yield NO fact', () => {
        for (const error of [
            Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:3001'), {code: 'ECONNREFUSED'}),
            Object.assign(new Error('getaddrinfo ENOTFOUND mc-server'), {code: 'ENOTFOUND'}),
            new Error('Invalid URL'),
            new Error('HTTP 401 Unauthorized')
        ]) {
            expect(classifyDirectProbeOutcome(error)).toBeNull();
        }
    });

    test('a non-Error rejection yields NO fact rather than throwing inside the classifier', () => {
        expect(classifyDirectProbeOutcome(null)).toBeNull();
        expect(classifyDirectProbeOutcome(undefined)).toBeNull();
        expect(classifyDirectProbeOutcome('boom')).toBeNull();
    });

    test('the direct probe outlives the container healthcheck it second-guesses (cross-artifact)', () => {
        // A second opinion with a TIGHTER deadline than the opinion it checks does not corroborate it;
        // it fails more often and manufactures the failed-probe half of the evidence pair. The first
        // value shipped here was 8000 against a 10s container probe — measured on the canonical plane
        // the same day, Memory Core held a FailingStreak of 4 against that 10s probe while the same
        // probe given 20s returned healthy with startupMs 400. An 8s independent probe would have
        // agreed with the failing one and called a serving container wedged.
        //
        // Asserted ACROSS the two artifacts rather than as a magic number, so moving either one without
        // the other fails here instead of on a live plane.
        const compose = readFileSync(new URL('../../../../../../../ai/deploy/docker-compose.yml', import.meta.url), 'utf8'),
              seconds = [...compose.matchAll(/mcpHealthcheck\.mjs[\s\S]{0,400}?timeout:\s*(\d+)s/g)].map(match => Number(match[1]));

        expect(seconds.length).toBeGreaterThan(0);   // the probe blocks were actually found

        const worstHealthcheckMs = Math.max(...seconds) * 1000;

        expect(AiConfig.orchestrator.deploymentStateBridge.directProbeTimeoutMs).toBeGreaterThan(worstHealthcheckMs);
    });

    test('the shipped defaults are opt-in, and accept degraded', () => {
        // Read-only assertions on the canonical template — never a mutation of the singleton.
        // Empty urls: a probe pointed at a host that does not resolve must not be able to restart-loop
        // a plane. `degraded` accepted: a Memory Core answering with a failing provider canary reports
        // exactly that, and rejecting it would manufacture the failed-probe half of the pair against a
        // service that is working.
        expect(AiConfig.orchestrator.deploymentStateBridge.directProbeUrls).toEqual([]);
        expect(AiConfig.orchestrator.deploymentStateBridge.directProbeExpectedStatus).toBe('healthy,degraded');
    });
});
