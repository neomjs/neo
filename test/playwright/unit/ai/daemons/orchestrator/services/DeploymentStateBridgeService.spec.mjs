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
    healLedgerReader = null
} = {}) {
    return Neo.create(DeploymentStateBridgeService, {
        runtimeAccessService,
        diagnosisService,
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
            recoveryRunLimit            : 10
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
        expect(selfHeal.recentEvents.map(e => e.at)).toEqual([9, 5]); // newest-first, bounded by recoveryRunLimit
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
