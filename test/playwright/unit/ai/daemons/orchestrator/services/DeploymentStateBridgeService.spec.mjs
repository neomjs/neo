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
    deriveEmbeddingProbeSweepDisagreementInterval,
    summarizeProbeReliability
} from '../../../../../../../ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs';
import {ContainerHealthDiagnosisService} from '../../../../../../../ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs';
import {DeploymentRuntimeAccessService}  from '../../../../../../../ai/daemons/orchestrator/services/DeploymentRuntimeAccessService.mjs';
import {
    createRecoveryDiagnosisEvent,
    createRecoveryRunStateEntry
} from '../../../../../../../ai/services/memory-core/helpers/recoveryRunStateStore.mjs';
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
    'orchestrator.deploymentStateBridge.providerLaneShapeServiceKeys',
    'orchestrator.deploymentStateBridge.providerModelIdentityServiceKeys',
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
    providerLaneShapeProbe = null,
    providerModelIdentityProbe = null,
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
        providerLaneShapeProbe,
        providerModelIdentityProbe,
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
            providerLaneShapeServiceKeys: ['local-model', 'embedding-model'],
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

    test('collectSelfHealSnapshot publishes each freeze with its escalation, evidence and thaw condition', async () => {
        // `currentlyFrozen` is a bare target list, so a frozen target published no reason and no way out.
        const events = [
            {type: 'freeze', collection: 'embedding-model', status: 'contained', at: 5, detail: {
                escalation: 'no-admitted-remedy',
                verdict   : {rung: 'rung-2', reasonCode: 'throttle-shed-has-no-admitted-action', recoveryClass: 'exhaustion'}
            }}
        ];
        const service  = createService({healLedgerDir: '/heal', healLedgerReader: async () => events}),
              selfHeal = await service.collectSelfHealSnapshot();

        expect(selfHeal.summary.currentlyFrozen).toEqual(['embedding-model']);
        expect(selfHeal.freezeState.frozen).toHaveLength(1);
        expect(selfHeal.freezeState.frozen[0]).toMatchObject({
            target    : 'embedding-model',
            tier      : 1,
            escalation: 'no-admitted-remedy'
        });
        expect(selfHeal.freezeState.frozen[0].evidence.reasonCode).toBe('throttle-shed-has-no-admitted-action');
        expect(selfHeal.freezeState.frozen[0].requiredQuietMs, 'a thaw condition must be published, not implied').toBeGreaterThan(0);
    });

    test('every selfHeal envelope carries freezeState, so a consumer never branches on its absence', async () => {
        const disabled = await createService({}).collectSelfHealSnapshot(),
              degraded = await createService({healLedgerDir: '/heal', healLedgerReader: async () => { throw new Error('disk gone'); }}).collectSelfHealSnapshot();

        expect(disabled.status).toBe('disabled');
        expect(degraded.status).toBe('degraded');
        for (const envelope of [disabled, degraded]) {
            expect('freezeState' in envelope, `${envelope.status} envelope must declare freezeState`).toBe(true);
            expect(envelope.freezeState).toBeNull();
        }
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
            errorCode          : 'ECONNREFUSED',
            // A probe snapshot naming no size projects its coverage fields as ABSENT rather than
            // omitting them: a consumer must be able to read "this verdict does not say what size it
            // was reached at" from the payload, never from the payload's silence.
            probeEstimateTokens: null,
            probeBandFraction  : null,
            probeSized         : false
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

    test('healthy probe names a same-window repo failure without changing its verdict (#17501)', async () => {
        const makeService = (lastErrorAt, cadenceMs = 120_000) => createService({
            taskStateService: {
                getTaskState() {
                    return {running: false, lastCompletion: null}
                }
            },
            tenantRepoSyncService: {
                async resolveTenantReposConfig() {
                    return {tenantRepos: [{
                        tenantId  : 'tenant-observer',
                        repoSlug  : 'private/observer',
                        cloneUrl  : 'https://git.example/private/observer.git',
                        cadenceMs,
                        configTier: 'yaml'
                    }]}
                },
                defaultRevisionsFilePath() {
                    return '/state/revisions.json'
                },
                async readPersistedRevisions() {
                    return {'tenant-observer/private/observer': {
                        lastIngestedRev    : null,
                        lastRunAttemptAt   : OBSERVED_AT - 2_000,
                        consecutiveFailures: 1,
                        lastErrorCode      : 'KB_TENANT_REPO_SYNC_SYNC_FAILED',
                        lastErrorAt
                    }}
                },
                getEmbeddingRecoveryProbeSnapshot() {
                    return {
                        status             : 'healthy',
                        checkedAt          : OBSERVED_AT,
                        lastDemandCached   : false,
                        failureStreak      : 0,
                        backoffMs          : 0,
                        nextAttemptAt      : null,
                        terminal           : false,
                        stopReason         : null,
                        errorClassification: null,
                        errorCode          : null
                    }
                }
            },
            tenantRepoSyncEnabledReader: () => true
        });

        // Exact recorded red-proof: the two-second disagreement was previously projected as plain healthy.
        const disagreementService  = makeService(OBSERVED_AT - 2_000),
              disagreementSnapshot = await disagreementService.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(disagreementSnapshot.embeddingRecoveryProbe).toMatchObject({
            status             : 'healthy',
            failureStreak      : 0,
            errorClassification: 'probe-sweep-disagreement'
        });

        // The predicate is symmetric: a repo failure moments AFTER the probe means its healthy
        // evidence was overtaken before this joined snapshot could publish it unqualified.
        const laterErrorService  = makeService(OBSERVED_AT + 2_000),
              laterErrorSnapshot = await laterErrorService.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(laterErrorSnapshot.embeddingRecoveryProbe.errorClassification)
            .toBe('probe-sweep-disagreement');

        // The window is inclusive. Make the repo floor deliberately wider so the probe cadence is
        // the exact minimum, then place the later error on that boundary.
        const probeCadenceMs   = AiConfig.orchestrator.tenantRepoSync.sweepCadenceMs,
              boundaryService  = makeService(OBSERVED_AT + probeCadenceMs, probeCadenceMs * 4),
              boundarySnapshot = await boundaryService.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(boundarySnapshot.embeddingRecoveryProbe.errorClassification)
            .toBe('probe-sweep-disagreement');

        // CONTROL: a genuine recovery outside the ZERO-STREAK floor stays plain healthy. With one
        // persisted failure the current backoff is 40s+; using that wider value would wrongly flag
        // this 30s-old error, while the actual 20s zero-streak floor does not.
        const recoveryService  = makeService(OBSERVED_AT - 30_000, 20_000),
              recoverySnapshot = await recoveryService.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(recoverySnapshot.embeddingRecoveryProbe).toMatchObject({
            status             : 'healthy',
            errorClassification: null
        });

        disagreementService.destroy();
        laterErrorService.destroy();
        boundaryService.destroy();
        recoveryService.destroy()
    });

    test('the disagreement interval changes with either existing authority and needs both (#17501)', () => {
        expect(deriveEmbeddingProbeSweepDisagreementInterval({
            probeCadenceMs     : 60_000,
            sweepBackoffFloorMs: 120_000
        })).toBe(60_000);
        expect(deriveEmbeddingProbeSweepDisagreementInterval({
            probeCadenceMs     : 30_000,
            sweepBackoffFloorMs: 120_000
        })).toBe(30_000);
        expect(deriveEmbeddingProbeSweepDisagreementInterval({
            probeCadenceMs     : 60_000,
            sweepBackoffFloorMs: 20_000
        })).toBe(20_000);
        expect(deriveEmbeddingProbeSweepDisagreementInterval({
            probeCadenceMs     : null,
            sweepBackoffFloorMs: 20_000
        })).toBeNull();
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
                settled        : 10_000,
                remaining      : 40_000,
                outstanding    : 40_000,
                lastDecreasedAt: OBSERVED_AT - 5_000,
                observedAt     : OBSERVED_AT - 1_000
            }
        });

        const measuredSnapshot = await measured.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(measuredSnapshot.repos[0].corpusOutstanding).toEqual({
            state          : 'outstanding',
            observable     : true,
            settled        : 10_000,
            remaining      : 40_000,
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
            {state: 'complete',     observable: true, settled: 8, remaining: 42, outstanding: 42, observedAt: OBSERVED_AT - 1_000},
            {state: 'outstanding',  observable: true, settled: 8, remaining: 0,  outstanding: 0,  observedAt: OBSERVED_AT - 1_000},
            {state: 'outstanding',  observable: true, settled: 8, remaining: 7,  outstanding: 6,  observedAt: OBSERVED_AT - 1_000},
            {state: 'outstanding',  observable: true, settled: 1.5, remaining: 7, outstanding: 7,  observedAt: OBSERVED_AT - 1_000},
            {state: 'outstanding',  observable: true, settled: 8, remaining: -1, outstanding: -1, observedAt: OBSERVED_AT - 1_000},
            {state: 'unobservable', observable: true, settled: 8, remaining: 7,  outstanding: 7,  observedAt: OBSERVED_AT - 1_000},
            {state: 'converging',   observable: true, settled: 8, remaining: 7,  outstanding: 7,  observedAt: OBSERVED_AT - 1_000}
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
        const producerUnobservable = describeCorpusOutstanding({settled: null, remaining: null, observedAt: OBSERVED_AT - 1_000}),
              roundTrip            = makeService({...baseCheckpoint, corpusOutstanding: producerUnobservable}),
              roundTripSnap        = await roundTrip.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(roundTripSnap.repos[0].corpusOutstanding).toMatchObject({
            state      : 'unobservable',
            observable : false,
            settled    : null,
            remaining  : null,
            outstanding: null
        });
        roundTrip.destroy();

        // …and the positive round trip, so the reader is not merely permissive.
        const producerOutstanding = describeCorpusOutstanding({settled: 250, remaining: 618, observedAt: OBSERVED_AT - 1_000}),
              positive            = makeService({...baseCheckpoint, corpusOutstanding: producerOutstanding}),
              positiveSnap        = await positive.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(positiveSnap.repos[0].corpusOutstanding).toMatchObject({
            state: 'outstanding', observable: true, settled: 250, remaining: 618, outstanding: 618
        });
        positive.destroy();

        // The undeliverable census rides the SAME persisted-state → normalizer → summarizer chain,
        // and it matters MORE here than for the backlog count — a fence-only run COMPLETES (streak
        // zero, checkpoint advanced), so this projection is the only snapshot evidence that N
        // documents are deferred pending a geometry change. Published unconditionally, exactly like
        // the backlog beside it.
        const
            monsterId = 'd'.repeat(64),
            fenced    = makeService({
                ...baseCheckpoint,
                undeliverableChunks: {count: 3, ids: [monsterId]}
            }),
            fencedSnap = await fenced.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(fencedSnap.repos[0].undeliverableChunks).toEqual({count: 3, ids: [monsterId]});
        expect(fencedSnap.repos[0].consecutiveFailures).toBe(0);
        fenced.destroy();

        // Unobserved is null — never a zero census…
        const noCensus     = makeService({...baseCheckpoint}),
              noCensusSnap = await noCensus.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(noCensusSnap.repos[0].undeliverableChunks).toBeNull();
        noCensus.destroy();

        // …and a torn census degrades WHOLE at the reader, so a hand-edited or half-written record
        // cannot enumerate ids it never proved.
        const tornCensus = makeService({
                  ...baseCheckpoint,
                  undeliverableChunks: {count: 1, ids: [monsterId, 'f'.repeat(64)]}
              }),
              tornCensusSnap = await tornCensus.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(tornCensusSnap.repos[0].undeliverableChunks).toBeNull();
        tornCensus.destroy();

        // The content-poison census is a SECOND field on the same chain, and it must be asserted on
        // this surface rather than inferred from the sibling above: the two are separate projection
        // lines, so a missing one fails here and nowhere else. Two fields rather than one total
        // because they prescribe OPPOSITE operator actions — raise the plane's ceiling for an
        // undeliverable chunk, fix the file for a proven poison — and a merged count sends the
        // operator at the wrong one.
        const
            poisonId   = 'a'.repeat(64),
            bothFenced = makeService({
                ...baseCheckpoint,
                undeliverableChunks: {count: 3, ids: [monsterId]},
                contentPoisonChunks: {count: 2, ids: [poisonId]}
            }),
            bothSnap    = await bothFenced.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        // Both project, and each keeps its OWN ids — a swap or a merge fails here.
        expect(bothSnap.repos[0].undeliverableChunks).toEqual({count: 3, ids: [monsterId]});
        expect(bothSnap.repos[0].contentPoisonChunks).toEqual({count: 2, ids: [poisonId]});
        bothFenced.destroy();

        // A record written before the content-poison census existed reads as UNOBSERVED, never as a
        // zero census — the shape of every record persisted before that field existed, which today
        // is all of them.
        const legacyRecord = makeService({...baseCheckpoint, undeliverableChunks: {count: 1, ids: [monsterId]}}),
              legacySnap   = await legacyRecord.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(legacySnap.repos[0].contentPoisonChunks).toBeNull();
        expect(legacySnap.repos[0].undeliverableChunks).toEqual({count: 1, ids: [monsterId]});
        legacyRecord.destroy();

        // …and the torn-record discipline is per FIELD: one census degrading whole must not erase the
        // other's observation, or a half-written row would take a valid census down with it.
        const tornPoison = makeService({
                  ...baseCheckpoint,
                  undeliverableChunks: {count: 2, ids: [monsterId]},
                  contentPoisonChunks: {count: 1, ids: ['not-a-hash']}
              }),
              tornPoisonSnap = await tornPoison.collectTenantRepoSyncSnapshot({observedAt: OBSERVED_AT});

        expect(tornPoisonSnap.repos[0].contentPoisonChunks).toBeNull();
        expect(tornPoisonSnap.repos[0].undeliverableChunks).toEqual({count: 2, ids: [monsterId]});
        tornPoison.destroy();
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

    const bridgeFor = (Id, RestartCount, recoveryRunStateReader = null) => createService({
        diagnosisService    : Neo.create(ContainerHealthDiagnosisService, {}),
        healLedgerDir       : dir,
        recoveryRunStateReader,
        runtimeAccessService: churningRuntime(Id, RestartCount)
    });

    /**
     * The real runtime-access service, stamped at a chosen instant. Only `nowFn` and the Docker seam
     * are substituted, so the proof it emits is the production one.
     */
    const runtimeAccessAt = at => Neo.create(DeploymentRuntimeAccessService, {
        runtimeAccessConfig: {
            enabled                     : true,
            mechanism                   : 'docker-socket',
            socketPath                  : '/var/run/docker.sock',
            composeProject              : 'neo',
            allowedServices             : ['orchestrator', 'chroma'],
            readOperations              : ['inspect'],
            lifecycleOperations         : ['restart'],
            timeoutMs                   : 5000,
            responseMaxBytes            : 1024,
            logTail                     : 10,
            defaultRestartTimeoutSeconds: 10,
            auditMode                   : 'metadata'
        },
        dockerRequestFn: async ({method}) => method === 'GET'
            ? {
                  statusCode: 200,
                  headers   : {},
                  body      : JSON.stringify({
                      Id   : 'c1',
                      State: {StartedAt: new Date(at - 1000).toISOString()}
                  })
              }
            : {statusCode: 204, headers: {}, body: ''},
        nowFn          : () => at
    });

    const targetFor = serviceKey => ({
        serviceKey,
        containerId   : 'c1',
        names         : [`/neo-${serviceKey}-1`],
        image         : 'neo:test',
        state         : 'running',
        status        : 'Up',
        composeProject: 'neo',
        labels        : {}
    });

    /**
     * Drives the REAL restart path end-to-end, so the specimen proves the lifecycle write actually
     * stamps `operation: 'restart'`. Building the proof directly would still be production-shaped but
     * could not notice the restart path changing the operation it declares.
     */
    const restartProof = async (serviceKey, at) =>
        (await runtimeAccessAt(at).restartTarget(targetFor(serviceKey), {reason: 'test'})).proof;

    /** The same production proof builder, for the operations that have no cheap end-to-end driver. */
    const lifecycleProof = (operation, serviceKey, at) => runtimeAccessAt(at).createProofMetadata({
        envelope: 'lifecycle-write',
        operation,
        target  : targetFor(serviceKey)
    });

    /**
     * Wraps a proof in a recovery-run entry through the production constructor, which validates every
     * field. The previous fixture hand-appended `{type: 'restart'}` heal-event rows — a shape NO
     * production writer emits — so the suite agreed with itself while disagreeing with the plane.
     */
    const runEntry = (proof, at) => createRecoveryRunStateEntry({
        recoveryRunId : `recovery-actuator:${proof.serviceKey}:${proof.operation}:${new Date(at).toISOString()}`,
        diagnosisEvent: createRecoveryDiagnosisEvent({
            diagnosisId   : `d-${proof.serviceKey}-${at}`,
            recoveryClass : 'crash',
            confidence    : 1,
            targetIdentity: {kind: 'compose-service', id: proof.serviceKey},
            observedAt    : at
        }),
        rung       : 'rung-2',
        attempt    : 1,
        status     : 'reobserve-requested',
        startedAt  : at,
        updatedAt  : at,
        completedAt: at,
        details    : {runtimeAccess: proof}
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
     * The AC that is harder than the recreate case: restarts WE caused must not raise the alarm. An
     * alarm that fires on every deploy is disabled within a week — leaving the blind spot plus a dead
     * alarm.
     *
     * This is also the regression guard for the source itself. The count now reads the recovery-run
     * ledger, which is what the lifecycle actuator writes; the heal-event ledger it read before serves
     * the DATA-recovery actuator and has no restart member in its action vocabulary at all. Reverting
     * the source turns this test red, because nothing here writes a heal event.
     */
    test('restarts the lifecycle actuator recorded are subtracted, so a deploy raises nothing', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        const ourRestarts = [];

        for (let i = 0; i < 5; i++) {
            ourRestarts.push(runEntry(await restartProof('orchestrator', OBSERVED_AT + 30000 + i), OBSERVED_AT + 30000 + i));
        }

        // The specimen must carry the production marker, or this proves nothing about the predicate.
        expect(ourRestarts[0].details.runtimeAccess.capabilityEnvelope).toBe('lifecycle-write');
        expect(ourRestarts[0].details.runtimeAccess.operation).toBe('restart');

        const withLedger = await bridgeFor('c1', 5, async () => ourRestarts)
            .collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(withLedger.diagnosis?.diagnosis?.details?.classificationReason).not.toBe('restart-churn-recorded');
        expect(withLedger.restartChurn.plannedRestarts.status).toBe('available');
    });

    /**
     * The test above proves the alarm stays quiet; it does NOT prove the arithmetic, and cannot — a
     * suppression test is satisfied by over-suppression, so it passes on a correct subtraction AND on
     * one that subtracts too much.
     *
     * This one is positioned where the two answers disagree: 4 observed restarts against exactly ONE
     * planned restart leaves the threshold and must FIRE. Subtract one too many and the alarm goes
     * quiet and this goes red — the property the suppression test cannot have, since quiet is its
     * passing state.
     */
    test('the subtraction is exact, not merely suppressive — churn still fires at the boundary', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        const one = [runEntry(await restartProof('orchestrator', OBSERVED_AT + 30000), OBSERVED_AT + 30000)];

        const atBoundary = await bridgeFor('c1', 4, async () => one)
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

    /**
     * The cell where the action name and the lifecycle proof DISAGREE, which is the whole reason the
     * predicate reads the proof.
     *
     * `reconfigure` restarts the container as part of the action — the knob overlay is read at boot,
     * so writing it without a restart is a no-op. Its run is therefore a planned restart even though
     * its action is not named `restart`. An implementation keyed on the action name misses it, fails
     * to subtract, and raises churn for a restart we performed: this test goes red.
     */
    test('a reconfigure run counts as a planned restart — the proof decides, not the action name', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        const at    = OBSERVED_AT + 30000,
              proof = await restartProof('orchestrator', at),
              // Exactly what `reconfigureComposeService` persists: it spreads the restart result, so
              // the lifecycle proof rides along under a run whose id names the reconfigure action.
              reconfigure = {
                  ...runEntry(proof, at),
                  recoveryRunId: `recovery-actuator:orchestrator:reconfigure:${new Date(at).toISOString()}`
              };

        const afterReconfigure = await bridgeFor('c1', 3, async () => [reconfigure])
            .collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(afterReconfigure.diagnosis?.diagnosis?.details?.classificationReason).not.toBe('restart-churn-recorded');
    });

    /**
     * The same predicate from the other side, so it cannot be satisfied by "any lifecycle write".
     * `raise-ceiling` moves the cgroup limit on the RUNNING container and deliberately does not
     * restart it — its proof carries `update-memory-limit`. Subtracting it would hide real churn.
     */
    test('a raise-ceiling run is NOT a planned restart — churn still fires', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        const at      = OBSERVED_AT + 30000,
              ceiling = runEntry(lifecycleProof('update-memory-limit', 'orchestrator', at), at);

        const afterRaise = await bridgeFor('c1', 3, async () => [ceiling])
            .collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(afterRaise.diagnosis.diagnosis.details.classificationReason).toBe('restart-churn-recorded');
    });

    /** One shared store serves every service, so the count has to be owned by its own service key. */
    test("another service's restart is not subtracted from this one", async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        const at       = OBSERVED_AT + 30000,
              otherKey = runEntry(await restartProof('chroma', at), at);

        const record = await bridgeFor('c1', 3, async () => [otherKey])
            .collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(record.diagnosis.diagnosis.details.classificationReason).toBe('restart-churn-recorded');
    });

    /** Unknown provenance must not raise churn: we cannot prove those restarts were not ours. */
    test('an unreadable ledger suppresses the alarm AND publishes that it could not count', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        const unreadable = await bridgeFor('c1', 9, async () => {throw new Error('ledger unreadable')})
            .collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(unreadable.diagnosis?.diagnosis?.details?.classificationReason).not.toBe('restart-churn-recorded');

        // Suppression alone is what made a broken detector look like a quiet plane. The suppression
        // has to come with a statement that it happened.
        expect(unreadable.restartChurn.plannedRestarts.status).toBe('degraded');
        expect(unreadable.restartChurn.plannedRestarts.reason).toBe('recovery-run-read-failed');
        expect(unreadable.restartChurn.detecting).toBe(false);
    });

    /**
     * Retention prunes the far end of the store, so a read that comes back full cannot prove it
     * reached the baseline. Reporting the truncated count would UNDER-subtract and raise churn for
     * restarts we performed — the precise false positive that gets an alarm switched off.
     */
    test('a read that fills the retention window degrades instead of reporting a truncated count', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        const limit = AiConfig.orchestrator.recoveryActuator.recoveryRunRetentionLimit,
              at    = OBSERVED_AT + 30000,
              proof = await restartProof('orchestrator', at),
              // Every entry sits INSIDE the window, so nothing here reaches back past the baseline.
              filled = Array.from({length: limit}, () => runEntry(proof, at));

        const truncated = await bridgeFor('c1', 9, async () => filled)
            .collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(truncated.restartChurn.plannedRestarts.status).toBe('degraded');
        expect(truncated.restartChurn.plannedRestarts.reason).toBe('recovery-run-window-truncated');
        expect(truncated.diagnosis?.diagnosis?.details?.classificationReason).not.toBe('restart-churn-recorded');

        // A read of the same size that DOES reach past the baseline is complete, not truncated —
        // otherwise "degraded" would just mean "busy", and the marker would carry no information.
        const reaching = [...filled.slice(0, limit - 1), runEntry(proof, OBSERVED_AT - 60000)];
        const complete = await bridgeFor('c1', 9, async () => reaching)
            .collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        expect(complete.restartChurn.plannedRestarts.status).toBe('available');
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

    /**
     * The residual this section exists for, asserted as a DISAGREEMENT rather than as two separate
     * readings. `collectRestartChurnFacts` emits nothing when there is no churn and nothing when it
     * cannot tell, so both planes previously published byte-identical churn evidence: absence. A
     * reader could not distinguish "quiet" from "the detector is dead", which is the state a corrupt
     * baseline leaves a service in permanently — an unjudgeable baseline is deliberately never
     * overwritten, so nothing recovers it until a human removes the file.
     *
     * Asserting the two records DIFFER is what makes this fail if the marker is ever reduced to a
     * constant; two independent assertions could both pass against a field hardcoded either way.
     */
    test('a dead churn detector is distinguishable from a quiet plane', async () => {
        await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        const quiet = await bridgeFor('c1', 1).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 60000});

        fs.writeFileSync(path.join(dir, 'churn-baselines', 'orchestrator.json'), '{ truncated');

        const dead = await bridgeFor('c1', 1).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT + 120000});

        // Neither plane reports churn — that is precisely why the verdict cannot carry this fact.
        expect(quiet.diagnosis?.diagnosis?.details?.classificationReason).not.toBe('restart-churn-recorded');
        expect(dead.diagnosis?.diagnosis?.details?.classificationReason).not.toBe('restart-churn-recorded');

        expect(dead.restartChurn.detecting).not.toBe(quiet.restartChurn.detecting);
        expect(quiet.restartChurn).toMatchObject({baseline: 'available',  detecting: true});
        expect(dead.restartChurn).toMatchObject({baseline: 'unreadable', detecting: false});
    });

    /**
     * A baseline that cannot be PERSISTED is the same failure one step later: the anchor never
     * advances, so the counter cannot accumulate toward a threshold and the signal is dead. It was
     * reported only to an ERROR log, which the published record does not read.
     */
    /**
     * Split deliberately from the publication test below. The reader and the writer share one path, so
     * any filesystem obstruction that breaks the write breaks the read FIRST and the service reports
     * `unreadable` — a different residual. Driving the writer directly is what isolates this one.
     */
    test('writeChurnBaseline reports a real write failure instead of only logging it', () => {
        const logs   = [],
              bridge = bridgeFor('c1', 0);

        bridge.writeLog = (level, message) => logs.push({level, message});

        // A DIRECTORY where the baseline file belongs: the atomic rename onto it fails with a genuine
        // filesystem error, so this cannot pass against a writer that never touches disk.
        fs.mkdirSync(path.join(dir, 'churn-baselines'), {recursive: true});
        fs.mkdirSync(bridge.churnBaselinePath('orchestrator'));

        expect(bridge.writeChurnBaseline('orchestrator', {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0})).toBe(false);
        expect(logs.some(entry => entry.level === 'ERROR' && entry.message.includes('churn baseline write FAILED'))).toBe(true);

        // The positive control: the SAME call against an unobstructed path must return true, or
        // `false` would just be this method's constant and the assertion above would prove nothing.
        fs.rmdirSync(bridge.churnBaselinePath('orchestrator'));

        expect(bridge.writeChurnBaseline('orchestrator', {containerId: 'c1', observedAt: OBSERVED_AT, restartCount: 0})).toBe(true);
    });

    test('a baseline that cannot be written degrades the published record, not just the log', async () => {
        const bridge = bridgeFor('c1', 0);

        // The write outcome is what this asserts on — the failure MODE is the test above. Stubbing the
        // one seam keeps this from depending on a filesystem obstruction that would trip the reader.
        bridge.writeChurnBaseline = () => false;

        const record = await bridge.collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        expect(record.restartChurn.baselineWrite).toBe('failed');
        expect(record.restartChurn.detecting).toBe(false);

        // A plane whose baseline DOES persist publishes the other value, so `detecting` is reporting
        // this outcome rather than being pinned false by something else on a first observation.
        const healthy = await bridgeFor('c1', 0).collectServiceSnapshot({serviceKey: 'orchestrator', observedAt: OBSERVED_AT});

        expect(healthy.restartChurn.baselineWrite).toBe('written');
        expect(healthy.restartChurn.detecting).toBe(true);
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
            stampCoverage         : 1,
            // Memory's own clock, and `container` here rather than `unavailable` because the
            // BRIDGE now forwards `nodeCommand` into the projection — evidence the wiring is live,
            // not merely that the fields exist.
            memoryScope           : 'container',
            memoryObservedWindowMs: 0,
            memoryStampCoverage   : 1
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
              // `timeout\s*:` — the block-alignment gate pads compose keys to the house style
              // (`timeout     : 5s`), so any compose-touching commit re-aligns these blocks; the
              // extraction must accept both the padded and unpadded forms.
              seconds = [...compose.matchAll(/mcpHealthcheck\.mjs[\s\S]{0,400}?timeout\s*:\s*(\d+)s/g)].map(match => Number(match[1]));

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

/**
 * Residency observability: `null` must say WHICH null it is.
 */
test.describe('DeploymentStateBridgeService — a residency key the bridge never enumerates (#16949)', () => {
    // Its OWN snapshot/restore. This block sits outside the describe whose `beforeEach` restores the
    // bridge config, and both tests below write `allowedServices` and `providerResidencyServiceKeys`
    // on the shared `AiConfig` singleton — without this pair they would leak those writes into every
    // later spec in the worker, which is the order-dependent pollution class this repo has been
    // burned by: a test that mutates the shared config singleton and does not put it back.
    let restoreResidencyConfig;

    test.beforeEach(() => {
        restoreResidencyConfig = snapshotAiConfig(AiConfig, BRIDGE_CONFIG_PATHS);
    });

    test.afterEach(() => {
        restoreResidencyConfig?.();
    });

    // ---- Residency observability: `null` must say WHICH null it is. --------------------------------
    // `isProviderResidencyServiceKey()` is only ever evaluated against a serviceKey the bridge already
    // ENUMERATES, so a residency key outside `allowedServices` is unreachable by construction — the
    // predicate cannot return true FOR THAT KEY. The effect is per key: an enumerated peer keeps
    // observing normally, which the partial-overlap case below proves. Only a ZERO intersection
    // leaves `providerResidency` and `providerActivity` (same gate) `null` across every service for
    // the life of the deployment. Nothing throws in either case. The pair simply reports the value a
    // correctly-configured non-provider container reports, and a reader outside the process cannot
    // tell a disabled instrument from a working one.
    //
    // Measured live before this fix: `allowedServices` was aliased to the orchestrator's
    // runtime-access list, which has no reason to name the model container, while the residency
    // default named exactly that container. Intersection empty; three maintainers spent a morning
    // attributing a configured absence to a sick provider.

    test('a residency key the bridge never enumerates is NAMED, not silently inert', async () => {
        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices             : ['chroma', 'kb-server'],
            providerResidencyServiceKeys: ['local-model', 'model']
        });

        const snapshot = await createService().collectSnapshot();

        // The misconfiguration is now a published fact rather than something a reader must derive by
        // intersecting two lists themselves — which is exactly the derivation nobody performed.
        expect(snapshot.bridgeDiagnostics.bridgeConfig.unobservableResidencyKeys)
            .toEqual(['local-model', 'model']);

        for (const service of snapshot.services) {
            expect(service.providerResidencyEligible, service.serviceKey).toBe(false);
            expect(service.providerResidency, service.serviceKey).toBeNull();
        }
    });

    test('an ENUMERATED residency key is eligible, and eligibility separates the two nulls', async () => {
        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices             : ['chroma', 'local-model'],
            providerResidencyServiceKeys: ['local-model']
        });

        const snapshot = await createService({
            providerResidencyProbe: async () => ({ready: true, provider: 'ollama'})
        }).collectSnapshot();

        expect(snapshot.bridgeDiagnostics.bridgeConfig.unobservableResidencyKeys).toEqual([]);

        const model  = snapshot.services.find(service => service.serviceKey === 'local-model'),
              chroma = snapshot.services.find(service => service.serviceKey === 'chroma');

        expect(model.providerResidencyEligible).toBe(true);
        expect(model.providerResidency).not.toBeNull();

        // The discriminator earning its place: chroma reports the SAME `null` as the broken case
        // above, and `eligible: false` is the only thing distinguishing "never asked, by design"
        // from "asked and got nothing". Without this field both read identically from the artifact.
        expect(chroma.providerResidencyEligible).toBe(false);
        expect(chroma.providerResidency).toBeNull();

        // `providerActivity` rides the SAME predicate (`isProviderResidencyServiceKey`), and its own
        // JSDoc promises the two halves of the residual-load evidence pair travel together. Asserted
        // relationally rather than as a fixed value: what must hold is that the eligible service can
        // carry activity while an ineligible one never does, whatever the ledger happens to contain.
        expect(chroma.providerActivity, 'an ineligible service never receives the other half either').toBeNull();
    });

    test('PARTIAL overlap is reported as partial — neither all-null nor all-populated', async () => {
        // The mixed case, which is the one a reader actually meets: some configured residency keys
        // are enumerated and some are not. A diagnostic that only distinguished "all fine" from
        // "all broken" would leave this reading as one or the other, and the half that is silently
        // unobservable is exactly the half nobody goes looking for.
        Object.assign(AiConfig.orchestrator.deploymentStateBridge, {
            allowedServices             : ['chroma', 'local-model'],
            providerResidencyServiceKeys: ['local-model', 'model']
        });

        const snapshot = await createService({
            providerResidencyProbe: async () => ({ready: true, provider: 'ollama'})
        }).collectSnapshot();

        // `model` is configured but never enumerated; `local-model` is both.
        expect(snapshot.bridgeDiagnostics.bridgeConfig.unobservableResidencyKeys).toEqual(['model']);

        const model = snapshot.services.find(service => service.serviceKey === 'local-model');

        expect(model.providerResidencyEligible, 'the enumerated key still observes normally').toBe(true);
        expect(model.providerResidency, 'and a partial misconfiguration does not suppress it').not.toBeNull();
    });
});

test.describe('#17049 — heavy-maintenance starvation projection (the consumed surface)', () => {
    const collect = DeploymentStateBridgeService.prototype.collectHeavyMaintenanceStarvationSnapshot;

    test('omits the block before the first verdict and projects a persisted verdict verbatim', () => {
        expect(collect.call({}, {watchdogTaskState: null})).toBeNull();
        expect(collect.call({}, {watchdogTaskState: {}})).toBeNull();
        expect(collect.call({}, {})).toBeNull();

        const verdict = {
            posture        : 'degraded',
            checkedAt      : '2026-08-14T09:00:00.000Z',
            degradeAfterMs : 3600000,
            waiterCount    : 1,
            unreadableCount: 0,
            leaseHolder    : 'dream',
            breaches       : [{taskName: 'backup', priorityZero: true, bootstrapCritical: false, deferredSince: '2026-08-14T06:00:00.000Z', starvedForMs: 10800000, leaseHolder: 'dream'}]
        };

        expect(collect.call({}, {watchdogTaskState: {starvation: verdict}})).toEqual({
            taskName: 'heavy-maintenance-starvation-watchdog',
            ...verdict
        });
    });

    test('the projection carries the healthy → degraded → healthy transition with no latch, and unknown is not a degradation', () => {
        const healthy  = {posture: 'healthy', breaches: [], waiterCount: 0, unreadableCount: 0, leaseHolder: null, checkedAt: 'T1', degradeAfterMs: 3600000};
        const degraded = {posture: 'degraded', breaches: [{taskName: 'backup'}], waiterCount: 1, unreadableCount: 0, leaseHolder: 'dream', checkedAt: 'T2', degradeAfterMs: 3600000};
        const unknown  = {posture: 'unknown', breaches: [], waiterCount: 0, unreadableCount: 2, leaseHolder: null, checkedAt: 'T3', degradeAfterMs: 3600000};

        expect(collect.call({}, {watchdogTaskState: {starvation: healthy}}).posture).toBe('healthy');
        expect(collect.call({}, {watchdogTaskState: {starvation: degraded}}).posture).toBe('degraded');
        expect(collect.call({}, {watchdogTaskState: {starvation: healthy}}).posture).toBe('healthy');

        const projectedUnknown = collect.call({}, {watchdogTaskState: {starvation: unknown}});
        expect(projectedUnknown.posture).toBe('unknown');
        expect(projectedUnknown.breaches).toEqual([]);
    });
});

test.describe('Neo.ai.daemons.services.DeploymentStateBridgeService — provider-lane boot shape (#17069)', () => {
    const HEALTHY_SLOTS = [{n_ctx: 32768}, {n_ctx: 32768}, {n_ctx: 32768}, {n_ctx: 32768}],
          THIN_SLOTS    = [{n_ctx: 8192}, {n_ctx: 8192}];

    test.beforeEach(() => {
        restoreBridgeConfig = snapshotAiConfig(AiConfig, BRIDGE_CONFIG_PATHS);
    });

    test.afterEach(() => {
        restoreBridgeConfig?.();
    });

    test('the probe runs ONCE and the receipt is republished — never a recurring /slots caller', async () => {
        // The hard constraint of this feature. Per-request `/slots` probing was deliberately deleted
        // because the endpoint starves under grind, and a recurring probe is forbidden outright. The
        // bridge writes snapshots on a cadence, so without memoization this collector WOULD become
        // that recurring caller — this test is the thing preventing it.
        let calls = 0;

        const bridge = createService({
            providerLaneShapeProbe: async () => { calls++; return HEALTHY_SLOTS }
        });

        const first  = await bridge.collectProviderLaneShape({observedAt: 1}),
              second = await bridge.collectProviderLaneShape({observedAt: 2}),
              third  = await bridge.collectProviderLaneShape({observedAt: 3});

        expect(calls, 'one reading, three publications').toBe(1);
        expect(second).toBe(first);
        expect(third).toBe(first);
        // The timestamp stays at the READING, so a reader cannot mistake a republished receipt for a
        // fresh measurement.
        expect(first.observedAt).toBe(1);
    });

    test('a lane below the safe band degrades even with nothing declared, naming both numbers', async () => {
        const bridge  = createService({providerLaneShapeProbe: async () => THIN_SLOTS}),
              receipt = await bridge.collectProviderLaneShape({observedAt: 1});

        expect(receipt.degraded).toBe(true);
        expect(receipt.reasons).toContain('lane-context-below-safe-band');
        expect(receipt.declaration).toBe('not-declared');
        expect(receipt.observed.contextTokensPerSlot).toBe(8192);
        expect(receipt.safeProcessingLimitTokens).toBe(28672);
    });

    test('an undeclared correctly-sized lane is clean — the false-degrade this design exists to avoid', async () => {
        const bridge  = createService({providerLaneShapeProbe: async () => HEALTHY_SLOTS}),
              receipt = await bridge.collectProviderLaneShape({observedAt: 1});

        expect(receipt.degraded).toBe(false);
        expect(receipt.declaration).toBe('not-declared');
        expect(receipt.observed).toEqual({parallelism: 4, contextTokensPerSlot: 32768});
    });

    test('an unreachable engine is explicitly unobservable, not degraded and not thrown', async () => {
        // `fetchEmbeddingLaneSlots` returns null on any transport failure; an exception at boot is a
        // restart lever. Silence and divergence must stay distinguishable in the artifact.
        const bridge  = createService({providerLaneShapeProbe: async () => null}),
              receipt = await bridge.collectProviderLaneShape({observedAt: 1});

        expect(receipt.observable).toBe(false);
        expect(receipt.degraded).toBe(false);
        expect(receipt.unobservable).toBe('slots-payload-not-an-array');
    });

    test('the diagnosis service raises a fact only on divergence, never on unobservable or clean', () => {
        const diagnosis = Neo.create(ContainerHealthDiagnosisService, {}),
              factsFor  = providerLaneShape => diagnosis.collectProviderLaneShapeFacts({
                  serviceKey: 'local-model', providerLaneShape, observedAt: OBSERVED_AT
              });

        expect(factsFor(null), 'no receipt').toEqual([]);
        expect(factsFor({observable: false, degraded: false}), 'unobservable is not a divergence').toEqual([]);
        expect(factsFor({observable: true, degraded: false}), 'clean lane').toEqual([]);

        const [fact] = factsFor({
            observable               : true,
            degraded                 : true,
            declaration              : 'declared',
            reasons                  : ['lane-context-differs-from-declared'],
            observed                 : {parallelism: 4, contextTokensPerSlot: 8192},
            declared                 : {parallelSlots: 4, contextTokensPerSlot: 32768},
            safeProcessingLimitTokens: 28672,
            host                     : 'http://embedding-model:8080'
        });

        expect(fact.type).toBe('provider-lane-shape-diverged');
        expect(fact.authoritative, 'a boot reading must not drive an actuator').toBe(false);
        expect(fact.details.observedContextTokensPerSlot).toBe(8192);
        expect(fact.details.declaredContextTokensPerSlot).toBe(32768);
    });
});

test.describe('provider-lane shape routing — the embedding receipt must not ride the chat lane', () => {
    // The split-lane profile sets residency to `chat-model` while the shape reading is taken against
    // the EMBEDDING host and compared to the embedding declaration. Sharing residency's predicate
    // published embedding facts on the chat record and left `embedding-model` — the service the data
    // actually describes, and one the bridge does enumerate — carrying nothing, so a divergence
    // degraded the wrong container. Widening residency instead would misroute residency and
    // provider-activity the other way; the two sets are separate on purpose.
    test.beforeEach(() => {
        restoreBridgeConfig = snapshotAiConfig(AiConfig, BRIDGE_CONFIG_PATHS);
    });

    test.afterEach(() => {
        restoreBridgeConfig?.();
    });

    test('the two predicates disagree under the split-lane profile, and each names its own lane', () => {
        AiConfig.orchestrator.deploymentStateBridge.providerResidencyServiceKeys = ['chat-model'];
        AiConfig.orchestrator.deploymentStateBridge.providerLaneShapeServiceKeys = ['embedding-model'];

        const bridge = createService();

        expect(bridge.isProviderResidencyServiceKey('chat-model')).toBe(true);
        expect(bridge.isProviderLaneShapeServiceKey('chat-model'), 'the chat record must NOT carry the embedding shape').toBe(false);

        expect(bridge.isProviderLaneShapeServiceKey('embedding-model')).toBe(true);
        expect(bridge.isProviderResidencyServiceKey('embedding-model'), 'and residency must NOT follow the shape onto the embedding lane').toBe(false);

        bridge.destroy()
    });

    test('the shipped default covers both topologies without a compose entry', () => {
        const bridge = createService();

        // Split-lane: the embedding service. Single-service plane: the one holding both roles.
        expect(bridge.isProviderLaneShapeServiceKey('embedding-model')).toBe(true);
        expect(bridge.isProviderLaneShapeServiceKey('local-model')).toBe(true);
        expect(bridge.isProviderLaneShapeServiceKey('chat-model')).toBe(false);

        bridge.destroy()
    });
});

test.describe('Neo.ai.daemons.services.DeploymentStateBridgeService — embedding-lane model identity', () => {
    const IDENTITY_CONFIG_PATHS = [
        'orchestrator.deploymentStateBridge.providerModelIdentityServiceKeys',
        'orchestrator.deploymentStateBridge.providerLaneShapeServiceKeys',
        'orchestrator.deploymentStateBridge.providerResidencyServiceKeys',
        'openAiCompatible.host',
        'openAiCompatible.embeddingModel'
    ];

    let restoreIdentityConfig;

    test.beforeEach(() => {
        restoreIdentityConfig = snapshotAiConfig(AiConfig, IDENTITY_CONFIG_PATHS);

        AiConfig.openAiCompatible.host           = 'http://127.0.0.1:8090';
        AiConfig.openAiCompatible.embeddingModel = 'qwen3-embedding-0.6b'
    });

    test.afterEach(() => {
        restoreIdentityConfig?.()
    });

    test('the served list naming the configured model reads MATCH, and publishes on a healthy plane too', async () => {
        const bridge = createService({
            providerModelIdentityProbe: async () => ['qwen3-embedding-0.6b', 'some-other-model']
        });

        const identity = await bridge.collectProviderModelIdentity({observedAt: 7});

        expect(identity.state).toBe('match');
        expect(identity.configuredModel).toBe('qwen3-embedding-0.6b');
        expect(identity.reason).toBeNull();
        // Published on a MATCH as well: proving a lane is serving the right model previously took a
        // shell on the host, so the answer belongs in the artifact either way.
        expect(identity.observedAt).toBe(7);

        bridge.destroy()
    });

    test('the real incident reproduces: configured 0.6b, served 8B, and the SERVED id is named', async () => {
        // A production plane ran Qwen3-Embedding-8B against a 0.6b configuration across two deploys.
        // The only symptom was slow embeddings, read as a performance problem rather than a
        // configuration one — this is the surface that makes it legible without a shell.
        const bridge = createService({
            providerModelIdentityProbe: async () => ['Qwen3-Embedding-8B-Q4_K_M']
        });

        const identity = await bridge.collectProviderModelIdentity({observedAt: 8});

        expect(identity.state).toBe('mismatch');
        expect(identity.reason).toContain('qwen3-embedding-0.6b');
        expect(identity.reason).toContain('Qwen3-Embedding-8B-Q4_K_M');
        expect(identity.servedModelIds).toEqual(['Qwen3-Embedding-8B-Q4_K_M']);

        // The remediation speaks THIS lane's language. Borrowing the residency verdict's vendor-coupled
        // advice would tell a llama.cpp container to run an `ollama` command that cannot work — on the
        // very surface an operator reads without shell access.
        expect(identity.reason).not.toContain('ollama');

        bridge.destroy()
    });

    test('an UNTAGGED configured model matches Ollama\'s implicit :latest — the shipped default host', async () => {
        // The fixtures around this one are tagged on BOTH sides, so they match by exact compare and
        // pass whichever rule is in force — they conceal this case rather than covering it. Here the
        // tag exists on ONE side only, which is production's actual shape: `openAiCompatible.host`
        // defaults to `http://127.0.0.1:11434` (byte-identical to `ollama.host`), Ollama reports an
        // untagged pull as `name:latest`, and `/v1/models` returns ids verbatim. Under an exact
        // compare this published `mismatch` and told the operator to re-point a lane that was
        // already correct — the same mechanism previously measured on the ollama lane, arriving here.
        AiConfig.openAiCompatible.embeddingModel = 'qwen3-embedding';

        const bridge = createService({
                  providerModelIdentityProbe: async () => ['qwen3-embedding:latest']
              }),
              identity = await bridge.collectProviderModelIdentity({observedAt: 11});

        expect(identity.state).toBe('match');
        expect(identity.reason).toBeNull();
        // the SERVED id is still reported verbatim — tolerating the tag must not launder what the
        // endpoint actually answered
        expect(identity.servedModelIds).toEqual(['qwen3-embedding:latest']);

        bridge.destroy()
    });

    test('the tolerance is DIRECTIONAL: a configured tag is not satisfied by an untagged served id', async () => {
        // The fence, and it is the half that stops this fix widening into a false negative. An
        // operator who pinned `:latest` asked for that exact id; answering with the bare name is a
        // different model as far as the requirement is concerned, and must still read as a mismatch.
        // Without this, "tolerant" would quietly mean "equal", and the previous test would pass for
        // the wrong reason.
        AiConfig.openAiCompatible.embeddingModel = 'qwen3-embedding:latest';

        const bridge = createService({
                  providerModelIdentityProbe: async () => ['qwen3-embedding']
              }),
              identity = await bridge.collectProviderModelIdentity({observedAt: 12});

        expect(identity.state).toBe('mismatch');
        expect(identity.reason).toContain('qwen3-embedding:latest');

        bridge.destroy()
    });

    test('an endpoint that will not answer is UNOBSERVABLE, never a mismatch', async () => {
        const bridge = createService({
            providerModelIdentityProbe: async () => { throw new Error('ECONNREFUSED') }
        });

        const identity = await bridge.collectProviderModelIdentity({observedAt: 9});

        // An identity check that cannot run is an unanswered question, never a confirmed match — and
        // never a reported mismatch either, which would send an operator to fix a model that is fine.
        expect(identity.state).toBe('unobservable');
        expect(identity.reason).toContain('ECONNREFUSED');
        expect(identity.servedModelIds).toBeNull();

        bridge.destroy()
    });

    test('an answered-but-empty list is UNOBSERVABLE too — /v1/models is conventional, not guaranteed', async () => {
        const bridge = createService({providerModelIdentityProbe: async () => []});

        const identity = await bridge.collectProviderModelIdentity({observedAt: 10});

        // Zero rows cannot separate "serves no models" from "does not answer this question", so a
        // proxy or minimal runtime answering 200 with nothing enumerable must not read as a mismatch.
        expect(identity.state).toBe('unobservable');

        bridge.destroy()
    });

    test('no configured model is UNCONFIGURED — the question was never asked', async () => {
        AiConfig.openAiCompatible.embeddingModel = '';

        let probeCalls = 0;

        const bridge = createService({
            providerModelIdentityProbe: async () => { probeCalls++; return ['anything'] }
        });

        const identity = await bridge.collectProviderModelIdentity({observedAt: 11});

        expect(identity.state).toBe('unconfigured');
        expect(probeCalls, 'nothing to compare against, so the endpoint is not disturbed').toBe(0);

        bridge.destroy()
    });

    test('the identity predicate is its OWN key — never residency, never lane-shape', async () => {
        AiConfig.orchestrator.deploymentStateBridge.providerModelIdentityServiceKeys = ['embedding-model'];
        AiConfig.orchestrator.deploymentStateBridge.providerLaneShapeServiceKeys     = ['local-model'];
        AiConfig.orchestrator.deploymentStateBridge.providerResidencyServiceKeys     = ['chat-model'];

        const bridge = createService();

        // Three sets, three lanes. Collapsing any pair publishes one lane's facts on another's record
        // — and for residency specifically it would attach `ollama pull` remediation to a llama.cpp
        // endpoint, which is the reason this is a third key rather than a reuse.
        expect(bridge.isProviderModelIdentityServiceKey('embedding-model')).toBe(true);
        expect(bridge.isProviderModelIdentityServiceKey('local-model')).toBe(false);
        expect(bridge.isProviderModelIdentityServiceKey('chat-model')).toBe(false);

        bridge.destroy()
    });

    test('a served model that changes under a running endpoint is re-read, never memoized', async () => {
        // Deliberately unlike the lane-shape receipt, which is a one-shot boot reading. Slot geometry
        // cannot change without a restart; the model a running endpoint serves CAN, so a cached match
        // would outlive the fact it reported — a health surface asserting yesterday's truth.
        let served = ['qwen3-embedding-0.6b'];

        const bridge = createService({providerModelIdentityProbe: async () => served});

        expect((await bridge.collectProviderModelIdentity({observedAt: 1})).state).toBe('match');

        served = ['Qwen3-Embedding-8B-Q4_K_M'];

        expect((await bridge.collectProviderModelIdentity({observedAt: 2})).state).toBe('mismatch');

        bridge.destroy()
    });
});

test.describe('Neo.ai.daemons.services.DeploymentStateBridgeService — identity gating at the CALL SITE', () => {
    const IDENTITY_WIRING_PATHS = [
        'orchestrator.deploymentStateBridge.providerModelIdentityServiceKeys',
        'orchestrator.deploymentStateBridge.providerResidencyServiceKeys',
        'orchestrator.deploymentStateBridge.providerLaneShapeServiceKeys',
        'openAiCompatible.host',
        'openAiCompatible.embeddingModel'
    ];

    let restoreWiringConfig;

    /** Minimal runtime seam — this suite asserts gating, not container facts. */
    function runtimeStub() {
        return {
            async readObserve(request) {
                return request.operation === 'inspect'
                    ? {data: {Id: 'c-x', State: {Status: 'running'}}, proof: {operation: 'inspect'}}
                    : {data: null, proof: {operation: request.operation}}
            }
        }
    }

    test.beforeEach(() => {
        restoreWiringConfig = snapshotAiConfig(AiConfig, IDENTITY_WIRING_PATHS);

        AiConfig.openAiCompatible.host           = 'http://127.0.0.1:8090';
        AiConfig.openAiCompatible.embeddingModel = 'qwen3-embedding-0.6b';
        // The three sets are made DISJOINT so a collapsed gate cannot accidentally still fire.
        AiConfig.orchestrator.deploymentStateBridge.providerModelIdentityServiceKeys = ['embedding-model'];
        AiConfig.orchestrator.deploymentStateBridge.providerResidencyServiceKeys     = ['chat-model'];
        AiConfig.orchestrator.deploymentStateBridge.providerLaneShapeServiceKeys     = ['local-model']
    });

    test.afterEach(() => {
        restoreWiringConfig?.()
    });

    test('the snapshot publishes identity for a participant and withholds it for a non-participant', async () => {
        // This is the assertion the predicate test could NOT make. Testing `isProviderModelIdentity-
        // ServiceKey` in isolation proves the function; it says nothing about which predicate the
        // collection path actually calls. A mutation swapping the call site onto the residency
        // predicate left the isolated predicate test green — a pure-function corpus cannot catch an
        // unreachable or mis-wired call site, so the gate has to be exercised through the snapshot.
        const bridge = Neo.create(DeploymentStateBridgeService, {
            runtimeAccessService      : runtimeStub(),
            diagnosisService          : Neo.create(ContainerHealthDiagnosisService, {}),
            providerResidencyProbe    : async () => null,
            providerModelIdentityProbe: async () => ['qwen3-embedding-0.6b'],
            writeLog                  : () => {},
            nowFn                     : () => OBSERVED_AT
        });

        const participant = await bridge.collectServiceSnapshot({serviceKey: 'embedding-model', observedAt: OBSERVED_AT});

        expect(participant.providerModelIdentity).not.toBeNull();
        expect(participant.providerModelIdentity.state).toBe('match');

        // `chat-model` is the RESIDENCY key here. If the call site were gated on residency this would
        // carry an identity receipt — which is exactly the mutation this test exists to kill.
        const residencyOnly = await bridge.collectServiceSnapshot({serviceKey: 'chat-model', observedAt: OBSERVED_AT});

        expect(residencyOnly.providerModelIdentity).toBeNull();

        // …and `local-model` is the LANE-SHAPE key, so the other possible collapse is covered too.
        const shapeOnly = await bridge.collectServiceSnapshot({serviceKey: 'local-model', observedAt: OBSERVED_AT});

        expect(shapeOnly.providerModelIdentity).toBeNull();

        bridge.destroy()
    });
});

/**
 * @summary The startup-log head is bounded, incarnation-keyed, and never publishes an empty string.
 *
 * Startup output is emitted once, in the first seconds, and is where a process reports what it
 * decided. The published tail cannot reach it on a long-running container — the banner's distance
 * from the tail grows with uptime — so the arms that matter here are the ones proving the WINDOW is
 * asked for server-side, that the cache invalidates on a restart rather than on a clock, and that an
 * unreachable head reports a reason rather than an empty string.
 */
test.describe('Neo.ai.daemons.services.DeploymentStateBridgeService — startup log head', () => {
    const
        STARTED   = '2026-08-18T10:00:00.000Z',
        WINDOW    = 60_000,
        MAX_LINES = 10_000,
        cfg       = overrides => ({
            includeLogs       : true, logMaxBytes: 32 * 1024, logTail: 120, startupLogWindowMs: WINDOW,
            startupLogMaxLines: MAX_LINES, ...overrides
        }),
        // Records every readObserve call so the WINDOW itself can be asserted, not just its output.
        //
        // The stub returns the REAL `{data, proof}` envelope rather than a bare payload. An earlier
        // version of this fixture returned `{logs}` directly, which happened to match a bug in the
        // reader — it consumed the response without unwrapping `.data`. Every isolated test passed and
        // only the published-record test caught it. A fixture shaped like the mistake cannot fail on it.
        bridgeWith = (logsText, {calls = []} = {}) => {
            const service = createService({});

            // The block's default clock: the startup window has CLOSED. That is the steady state a
            // long-running deployment sits in, and it is what the caching assertions here are about.
            //
            // Set explicitly because the harness-wide `OBSERVED_AT` is 2024 while this block's
            // `STARTED` is 2026 — two constants that never had to agree until the cache gained a
            // window-closed gate. An injected clock BEFORE the incarnation it observes is not a
            // scenario; it is a fixture that was free to be arbitrary while nothing read it.
            service.nowFn = () => Date.parse(STARTED) + WINDOW + 1;

            service.runtimeAccessService = {
                async readObserve(request) {
                    calls.push(request);

                    if (typeof logsText === 'function') return logsText(request);

                    return {data: {logs: logsText}, proof: {operation: request.operation}}
                }
            };

            return service
        },
        read = (service, overrides = {}) => service.readStartupLogHead({
            serviceKey          : 'embedding-model',
            incarnationStartedAt: STARTED,
            config              : cfg(),
            ...overrides
        });

    test('the head is requested as a server-side WINDOW, not a line count', async () => {
        // The mechanism claim: `since`/`until` bound the read at Docker rather than trimming a tail
        // client-side. Without both, `readTargetLogs` drops the interval entirely and returns a tail.
        const calls  = [],
              result = await read(bridgeWith('llama_kv_cache: size = 7168 MiB\nlistening\n', {calls}));

        expect(result.status).toBe('available');
        expect(calls).toHaveLength(1);
        expect(calls[0].operation).toBe('logs');
        expect(calls[0].since).toBe(STARTED);
        expect(calls[0].until).toBe(new Date(Date.parse(STARTED) + WINDOW).toISOString());
        expect(result.windowMs).toBe(WINDOW);
        expect(result.text).toContain('llama_kv_cache');
    });

    test('`lines` counts the string that is PUBLISHED, not a different one (#17371)', async () => {
        // The fixture ends in a blank line ON PURPOSE. That is the ordinary shape for container logs
        // and it is the only shape that separates the two implementations: with no trailing newline,
        // trimmed and untrimmed have the same line count and a wrong `lines` passes unnoticed.
        const result = await read(bridgeWith('boot\nready\n\n'));

        expect(result.status).toBe('available');

        // The property, stated as a consumer would compute it. NOT `text.split('\n').length` — that
        // proxy counts the empty segment after the final terminator, and satisfying it would have
        // meant publishing the TRIMMED text, which destroys the line-boundary guarantee the byte
        // bound exists for. The ticket's AC named the proxy; the proxy was wrong, and the AC moved.
        const consumerCount = result.text.replace(/\n$/, '').split('\n').length;

        expect(result.lines).toBe(consumerCount);

        // Pinned independently, so a change making BOTH sides wrong in the same direction still
        // fails. An identity alone is satisfiable by publishing nonsense twice.
        // 'boot', 'ready', and the blank line — three. The payload keeps its terminator untouched.
        expect(result.lines).toBe(3);
        expect(result.text).toBe('boot\nready\n\n');
    });

    test('the line ceiling is the CONFIGURED leaf, and an absent one refuses rather than falling back', async () => {
        // `readTargetLogs` resolves `tail ?? logTail ?? 200`. The fallback exists and taking it is the
        // failure: `logTail` is sized for recent activity, so the head read would return the last
        // ~120 lines OF the startup window — a tail of the head. Refusing beats a wrong-looking answer.
        const calls = [];

        await read(bridgeWith('boot\n', {calls}));
        expect(calls[0].tail).toBe(MAX_LINES);
        expect(calls[0].tail).not.toBe(cfg().logTail);

        for (const absent of [undefined, 0, -1, Number.NaN]) {
            const missed = [],
                  result = await read(bridgeWith('boot\n', {calls: missed}),
                      {config: cfg({startupLogMaxLines: absent})});

            expect(result.status).toBe('unavailable');
            expect(result.unavailableReason).toBe('line-ceiling-not-configured');
            expect(result.text).toBeNull();
            // Refused BEFORE the Docker call, so a misconfiguration cannot spend a request to
            // discover it had the tail's budget all along.
            expect(missed).toHaveLength(0)
        }
    });

    test('a rotated-away window is cached ONLY once the window has closed', async () => {
        // `window-empty-or-rotated` is one reason over two situations and they cache oppositely.
        // ROTATED is terminal. NOT-YET-WRITTEN is transient — and caching it loses the banner for the
        // life of the incarnation, which is the unreadable-startup-facts failure this read exists to
        // prevent, arriving through its own optimisation. The `or` in the reason name is the tell.
        const closed = Date.parse(STARTED) + WINDOW + 1,
              inside = Date.parse(STARTED) + 5_000;

        // Window CLOSED: empty can only mean rotated, so it is terminal and cached.
        const calls   = [],
              service = bridgeWith('   \n  \n', {calls});   // inherits the closed-window clock

        const first  = await read(service),
              second = await read(service);

        expect(first.unavailableReason).toBe('window-empty-or-rotated');
        expect(second).toEqual(first);
        expect(calls).toHaveLength(1);

        // ...and still invalidates on a restart.
        await read(service, {incarnationStartedAt: '2026-08-18T12:00:00.000Z'});
        expect(calls).toHaveLength(2);

        // Window still OPEN: the banner may not have flushed yet, so nothing is cached and a later
        // sweep genuinely re-reads. Without this the 60s model-load case — the one the window is
        // SIZED for — loses its geometry permanently.
        const booting     = [],
              bootService = bridgeWith('   \n', {calls: booting});

        bootService.nowFn = () => inside;

        await read(bootService);
        await read(bootService);
        await read(bootService);

        expect(booting).toHaveLength(3)
    });

    test('a head read INSIDE the window is not frozen as the final answer', async () => {
        // The sibling of the arm above, and the same defect one door down. A read at t+5s holds only
        // what flushed by t+5s; caching it freezes a PARTIAL banner and loses precisely the resolved
        // geometry line the head is read for.
        const calls   = [],
              service = bridgeWith(
                  () => ({data: {logs: emitted}, proof: {operation: 'logs'}}),
                  {calls}
              );

        let emitted = 'starting...\n';

        service.nowFn = () => Date.parse(STARTED) + 5_000;

        const partial = await read(service);

        expect(partial.text).toBe('starting...\n');
        expect(partial.text).not.toContain('llama_kv_cache');

        // The rest of the banner lands, still inside the window.
        emitted = 'starting...\nllama_kv_cache: size = 7168 MiB\n';

        const complete = await read(service);

        expect(calls).toHaveLength(2);
        expect(complete.text).toContain('llama_kv_cache');

        // Once the window closes, the answer is final and the cache engages as designed.
        service.nowFn = () => Date.parse(STARTED) + WINDOW + 1;

        const settled = await read(service);

        expect(settled.text).toContain('llama_kv_cache');
        expect(calls).toHaveLength(3);

        await read(service);
        expect(calls).toHaveLength(3)
    });

    test('the cache is keyed on the INCARNATION, so a restart invalidates and a re-read does not', async () => {
        const calls   = [],
              service = bridgeWith(
                  request => ({data: {logs: `boot at ${request.since}\n`}, proof: {operation: request.operation}}),
                  {calls}
              );

        const first  = await read(service),
              second = await read(service);

        // Same incarnation: one Docker call, identical record. This is the whole reason for the cache —
        // the head is invariant for a container's life, so re-reading buys nothing.
        expect(calls).toHaveLength(1);
        expect(second).toEqual(first);

        // A restart changes StartedAt. Invalidation is structural, not temporal — nothing expires.
        const restarted = '2026-08-18T12:00:00.000Z',
              third     = await read(service, {incarnationStartedAt: restarted});

        expect(calls).toHaveLength(2);
        expect(third.incarnationStartedAt).toBe(restarted);
        expect(third.text).toContain(restarted);

        // REPLACES rather than appends, and this is the half that carries the property. Asserting the
        // new incarnation's content is present cannot distinguish a replacement from an accumulation —
        // both contain it. The old incarnation being ABSENT is what rules out two boots reading as one,
        // where the earlier values would still look current to anyone reading the head.
        expect(third.text,
            "a restart's head must not carry the previous incarnation's output").not.toContain(STARTED);
    });

    test('HONESTY: every unavailable arm names a reason and nulls `text` — never an empty string', async () => {
        // `text: ''` would read as "this service printed nothing at startup", which is a confident
        // claim about a process nobody watched boot. That is the failure this method exists to prevent.
        const arms = [
            ['channel-disabled',         () => read(bridgeWith('x\n'), {config: cfg({includeLogs: false})})],
            ['incarnation-start-unknown', () => read(bridgeWith('x\n'), {incarnationStartedAt: null})],
            ['incarnation-start-unknown', () => read(bridgeWith('x\n'), {incarnationStartedAt: 'not-a-date'})],
            ['window-not-configured',    () => read(bridgeWith('x\n'), {config: cfg({startupLogWindowMs: 0})})],
            ['window-empty-or-rotated',  () => read(bridgeWith('   \n  \n'))],
            ['window-empty-or-rotated',  () => read(bridgeWith(null))],
            ['unreadable',               () => read(bridgeWith(() => { throw new Error('docker said no') }))]
        ];

        for (const [expectedReason, run] of arms) {
            const result = await run();

            expect(result.status, expectedReason).toBe('unavailable');
            expect(result.unavailableReason, expectedReason).toBe(expectedReason);
            expect(result.text, `${expectedReason}: text must be null, not ''`).toBeNull();
            expect(result.lines, `${expectedReason}: lines must be null`).toBeNull();
        }
    });

    test('an empty window is distinguished from a failed read — rotation is not an error', async () => {
        // Both produce no head, and conflating them would make a rotated-away banner look like a
        // broken instrument. The remedies differ: one is expected on a long-lived container, the other
        // is a Docker problem.
        const rotated = await read(bridgeWith('')),
              broken  = await read(bridgeWith(() => { throw new Error('boom') }));

        expect(rotated.unavailableReason).toBe('window-empty-or-rotated');
        expect(broken.unavailableReason).toBe('unreadable');
    });

    test('the head is byte-bounded from the correct END, cut on a line boundary', async () => {
        // A tail bound would keep the LAST bytes, discarding exactly the banner this read exists for.
        const lines  = Array.from({length: 500}, (_, i) => `line ${i} ${'x'.repeat(80)}`).join('\n') + '\n',
              result = await read(bridgeWith(lines), {config: cfg({logMaxBytes: 2_000})});

        expect(result.status).toBe('available');
        expect(result.truncated).toBe(true);
        expect(result.text.startsWith('line 0 '), 'the HEAD must survive, not the tail').toBe(true);
        expect(result.text).not.toContain('line 499');

        // Cut on a line boundary: no dangling half-line for a human reading forward for a value.
        expect(result.text.endsWith('\n')).toBe(true);
        expect(Buffer.byteLength(result.text, 'utf8')).toBeLessThanOrEqual(2_000);
    });

    test('the field reaches the PUBLISHED record under `logs`', async () => {
        // An isolated reader corpus cannot catch an unreachable call site. The head answers a question
        // about the same stream as the tail, so it is published inside `logs` where a reader chasing
        // one will find the other.
        const bridge = Neo.create(DeploymentStateBridgeService, {
            runtimeAccessService  : {
                async readObserve(request) {
                    if (request.operation === 'inspect') {
                        return {
                            data : {
                                Id    : 'c-x',
                                State : {Status: 'running', StartedAt: STARTED},
                                Config: {Cmd: ['node', 'server.mjs']}
                            },
                            proof: {operation: 'inspect'}
                        }
                    }

                    if (request.operation === 'logs') {
                        return {data: {logs: 'llama_kv_cache: size = 7168 MiB\n', bounded: true}, proof: {operation: 'logs'}}
                    }

                    return {data: null, proof: {operation: request.operation}}
                }
            },
            diagnosisService      : Neo.create(ContainerHealthDiagnosisService, {}),
            providerResidencyProbe: async () => null,
            writeLog              : () => {},
            nowFn                 : () => OBSERVED_AT
        });

        const record = await bridge.collectServiceSnapshot({serviceKey: 'embedding-model', observedAt: OBSERVED_AT});

        expect(record.logs?.startup, 'the head must reach the record, not just the reader').toBeTruthy();
        expect(record.logs.startup.recordType).toBe('deployment-startup-log-head');
        expect(record.logs.startup.serviceKey).toBe('embedding-model');

        bridge.destroy()
    });

    test('a failed TAIL read does not suppress a captured head — they fail independently', async () => {
        // Two reads of the same operation, two failure modes. Collapsing them would hide a head that
        // WAS captured behind an unrelated tail failure — the shape that kept this gap invisible.
        //
        // The stub separates them the way the code does: the tail read carries a null `until` (a
        // running container has no FinishedAt), the head read carries a real one. No private function
        // is exported to test this; the property is asserted through the published record.
        const bridge = Neo.create(DeploymentStateBridgeService, {
            runtimeAccessService  : {
                async readObserve(request) {
                    if (request.operation === 'inspect') {
                        return {
                            data : {
                                Id    : 'c-x',
                                State : {Status: 'running', StartedAt: STARTED},
                                Config: {Cmd: ['node', 'server.mjs']}
                            },
                            proof: {operation: 'inspect'}
                        }
                    }

                    if (request.operation === 'logs') {
                        // The HEAD read (has `until`) succeeds; the TAIL read (no `until`) fails.
                        if (request.until) {
                            return {data: {logs: 'llama_kv_cache: size = 7168 MiB\n'}, proof: {operation: 'logs'}}
                        }

                        throw new Error('tail read failed')
                    }

                    return {data: null, proof: {operation: request.operation}}
                }
            },
            diagnosisService      : Neo.create(ContainerHealthDiagnosisService, {}),
            providerResidencyProbe: async () => null,
            writeLog              : () => {},
            nowFn                 : () => OBSERVED_AT
        });

        const record = await bridge.collectServiceSnapshot({serviceKey: 'embedding-model', observedAt: OBSERVED_AT});

        expect(record.logs?.startup?.status, 'a tail failure must not take the head with it').toBe('available');
        expect(record.logs.startup.text).toContain('llama_kv_cache');

        bridge.destroy()
    });
});

/**
 * @summary The relayed resolved config is bounded, and the reader never resolves a value itself.
 *
 * The arms that matter are the ones proving this reader cannot manufacture an answer. A bridge-side
 * resolution would publish the orchestrator's own config under another service's name, which on a
 * deployment with a per-service override is a confidently wrong number — worse than the absence it
 * replaces, because an absent field gets checked and an answered one does not.
 *
 * Validity is bounded by INCARNATION rather than by elapsed time: config is fixed at boot, so an old
 * record is not degraded, while a record predating the current container start describes env that no
 * longer applies.
 *
 * A real temporary directory rather than a mocked `fs`, and `AiConfig` is never mutated to redirect it.
 */
test.describe('Neo.ai.daemons.services.DeploymentStateBridgeService — resolved config relay', () => {
    const
        BOOT    = 1_786_234_600_000,
        SECRET  = 'glpat-SECRET-must-never-appear',
        cfg     = dir => ({dir, enabled: true, maxSkewMs: 15_000, staleAfterMs: 60_000, writeIntervalMs: 10_000}),
        makeDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'neo-resolved-config-read-')),
        write   = (dir, serviceKey, observedAt, extra = {}) => {
            fs.writeFileSync(path.join(dir, `${serviceKey}.resolved-config.json`), JSON.stringify({
                schemaVersion: 1,
                recordType   : 'deployment-resolved-config',
                serviceKey,
                provenance   : 'self-reported',
                observedAt,
                disclosed    : {'embedding.batchSize': {value: 1, kind: 'number'}},
                omitted      : [{path: 'transport', kind: 'enum', reason: 'path-absent'}],
                ...extra
            }));

            return dir
        },
        read = (dir, overrides = {}) => createService({}).readResolvedConfig({
            serviceKey          : 'kb-server',
            nodeCommand         : true,
            incarnationStartedAt: new Date(BOOT).toISOString(),
            config              : cfg(dir),
            ...overrides
        });

    test('a record from the current incarnation is relayed verbatim', () => {
        const result = read(write(makeDir(), 'kb-server', BOOT + 2_000));

        expect(result.status).toBe('available');
        expect(result.provenance).toBe('self-reported');
        // The incident value, relayed — NOT the shipped default of 50.
        expect(result.disclosed['embedding.batchSize']).toEqual({value: 1, kind: 'number'});
        expect(result.omitted).toEqual([{path: 'transport', kind: 'enum', reason: 'path-absent'}]);
        expect(result.unavailableReason).toBeNull();
    });

    test('an OLD record from this incarnation is still relayed — age is not a validity signal', () => {
        // The deliberate divergence from the heap reader. Config does not drift, so refusing on age
        // would discard a correct answer; `staleAfterMs` is in the config object and must be ignored.
        const result = read(write(makeDir(), 'kb-server', BOOT + 1));

        expect(result.status).toBe('available');
        expect(result.disclosed['embedding.batchSize'].value).toBe(1);
    });

    test('the field reaches the PUBLISHED record — the reader being correct is not the same as wired', () => {
        // Everything above tests the reader in isolation, and an isolated corpus cannot catch an
        // unreachable or mis-wired call site: a reader that works perfectly and is never called leaves
        // every assertion above green while the snapshot carries nothing. So the field is exercised
        // through `collectServiceSnapshot`, the way the identity gate above had to be.
        const bridge = Neo.create(DeploymentStateBridgeService, {
            runtimeAccessService  : {
                async readObserve(request) {
                    // A Node `Cmd` on purpose: it carries the reader PAST the identity gate to the
                    // file read, so the arm this test lands on proves the whole path ran rather than
                    // that it refused early. An inspect without `Config.Cmd` would stop at the gate
                    // and prove much less.
                    return request.operation === 'inspect'
                        ? {
                            data : {Id: 'c-x', State: {Status: 'running'}, Config: {Cmd: ['node', 'server.mjs']}},
                            proof: {operation: 'inspect'}
                        }
                        : {data: null, proof: {operation: request.operation}}
                }
            },
            diagnosisService      : Neo.create(ContainerHealthDiagnosisService, {}),
            providerResidencyProbe: async () => null,
            writeLog              : () => {},
            nowFn                 : () => OBSERVED_AT
        });

        return bridge.collectServiceSnapshot({serviceKey: 'kb-server', observedAt: OBSERVED_AT}).then(record => {
            // Present as an ENVELOPE, not merely defined. `undefined` is what a mis-wired call site
            // produces, and `toBeDefined()` alone would also pass for a stray literal.
            expect(record.resolvedConfig).toBeTruthy();
            expect(record.resolvedConfig.recordType).toBe('deployment-resolved-config');
            expect(record.resolvedConfig.serviceKey).toBe('kb-server');
            expect(record.resolvedConfig.provenance).toBe('self-reported');

            // `absent` rather than an identity refusal: this service never published a report, so the
            // reader passed the identity gate, resolved the path and found nothing. That is the arm
            // proving the whole path executed, and it carries a REASON rather than a silent absence.
            expect(record.resolvedConfig.status).toBe('unavailable');
            expect(record.resolvedConfig.unavailableReason).toBe('absent');
            expect(record.resolvedConfig.disclosed).toBeNull();

            bridge.destroy()
        })
    });

    test('a record predating the current container start is refused as stale-incarnation', () => {
        // The restart case: same file, new env, values that no longer apply.
        const result = read(write(makeDir(), 'kb-server', BOOT - 1));

        expect(result.status).toBe('unavailable');
        expect(result.unavailableReason).toBe('stale-incarnation');
        expect(result.disclosed).toBeNull();
    });

    test('an UNPARSEABLE incarnation start does not discard an otherwise-current record', () => {
        // An instrument gap must not become a claim about the configuration. Refusing here would
        // convert "cannot tell which incarnation" into "configuration unknown".
        for (const incarnationStartedAt of [null, undefined, '', 'not-a-date']) {
            const result = read(write(makeDir(), 'kb-server', BOOT + 5_000), {incarnationStartedAt});

            expect(result.status, `incarnationStartedAt=${JSON.stringify(incarnationStartedAt)}`).toBe('available');
        }
    });

    test('HONESTY: every unavailable arm nulls `disclosed`, never publishing an empty object', () => {
        // `{}` reads as "reported and disclosed nothing", which is a different claim from "did not
        // report". Collapsing them is how a reader believes a configuration was checked when it was not.
        const arms = [
            ['channel-disabled', () => read(makeDir(), {config: {...cfg(makeDir()), enabled: false}})],
            ['not-node',         () => read(makeDir(), {nodeCommand: false})],
            ['identity-unknown', () => read(makeDir(), {nodeCommand: null})],
            ['absent',           () => read(makeDir())]
        ];

        for (const [expectedReason, run] of arms) {
            const result = run();

            expect(result.status, expectedReason).toBe('unavailable');
            expect(result.unavailableReason, expectedReason).toBe(expectedReason);
            expect(result.disclosed, `${expectedReason}: disclosed must be null, not {}`).toBeNull();
            expect(result.omitted, `${expectedReason}: omitted must be null, not []`).toBeNull();
        }
    });

    test('a report stamped for another service is refused rather than mis-attributed', () => {
        // A copied file or a mixed-up mount would otherwise attribute one service's configuration to
        // another — the wrong-process answer this design exists to prevent, arriving by another route.
        const result = read(write(makeDir(), 'kb-server', BOOT + 1_000, {serviceKey: 'mc-server'}));

        expect(result.status).toBe('unavailable');
        expect(result.unavailableReason).toBe('identity-mismatch');
    });

    test('a malformed record is refused, and a wrong recordType is not silently accepted', () => {
        const wrongType = read(write(makeDir(), 'kb-server', BOOT + 1_000, {recordType: 'process-heap-observation'}));

        expect(wrongType.unavailableReason).toBe('malformed');

        // `disclosed` must be a plain object: an array would pass a naive truthiness check and then
        // serialise as a list nobody can read by path.
        const arrayDisclosed = read(write(makeDir(), 'kb-server', BOOT + 1_000, {disclosed: []}));

        expect(arrayDisclosed.unavailableReason).toBe('malformed');

        const noStamp = read(write(makeDir(), 'kb-server', BOOT + 1_000, {observedAt: 'yesterday'}));

        expect(noStamp.unavailableReason).toBe('malformed');
    });

    test('an unreadable file is distinguished from an absent one', () => {
        const dir = makeDir();

        fs.writeFileSync(path.join(dir, 'kb-server.resolved-config.json'), '{ not json');

        expect(read(dir).unavailableReason).toBe('unreadable');
        expect(read(makeDir()).unavailableReason).toBe('absent');
    });

    test('SECURITY: the reader adds no resolution of its own, so it cannot supply a missing value', () => {
        // The defect the ticket was corrected for: a bridge-side read would answer from the
        // orchestrator's tree. Proven by absence of an answer rather than by inspection — with no file
        // present the envelope must carry a reason and no value, even though this process could
        // trivially resolve a `batchSize` of its own.
        const result = read(makeDir());

        expect(result.disclosed).toBeNull();
        expect(JSON.stringify(result)).not.toContain('batchSize');

        // And a secret sitting in a hand-placed file is not laundered into the envelope by the relay:
        // the writer's allowlist is upstream, so anything unallowlisted never arrives — but if it did,
        // the relay must not be the place that publishes it under `disclosed`.
        const withSecret = read(write(makeDir(), 'kb-server', BOOT + 1_000, {
            disclosed: {'embedding.batchSize': {value: 1, kind: 'number'}}
        }));

        expect(JSON.stringify(withSecret)).not.toContain(SECRET);
    });
});
