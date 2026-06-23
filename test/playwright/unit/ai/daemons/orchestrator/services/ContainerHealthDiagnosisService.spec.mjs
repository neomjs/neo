import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    CONTAINER_HEALTH_ACTION_CLASSES,
    CONTAINER_HEALTH_FACT_TYPES,
    ContainerHealthDiagnosisService,
    calculateDockerCpuPercent,
    calculateDockerMemoryPercent
} from '../../../../../../../ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs';

const OBSERVED_AT = 1710000000000;

function createService(config = {}) {
    return Neo.create(ContainerHealthDiagnosisService, {
        diagnosisConfig: config,
        nowFn          : () => OBSERVED_AT
    });
}

function runningInspect(overrides = {}) {
    return {
        State: {
            Status: 'running',
            Health: {Status: 'healthy'},
            ...overrides
        }
    };
}

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

test.describe('Neo.ai.daemons.services.ContainerHealthDiagnosisService', () => {
    test('normalizes Docker CPU and memory samples', () => {
        const stats = statsSample({cpuPercent: 280, memoryPercent: 75});

        expect(calculateDockerCpuPercent(stats)).toBe(280);
        expect(calculateDockerMemoryPercent(stats)).toBe(75);
    });

    test('keeps probe-only failures advisory', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey   : 'memory',
            endpointProbe: {ok: false, name: 'mcp-healthcheck', message: 'timeout'}
        });

        expect(decision.status).toBe('advisory');
        expect(decision.diagnosis).toBeNull();
        expect(decision.facts).toHaveLength(1);
        expect(decision.facts[0]).toMatchObject({
            type         : CONTAINER_HEALTH_FACT_TYPES.endpointProbeFailed,
            authoritative: false
        });
    });

    test('emits a restart diagnosis for down containers', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey: 'memory',
            inspect   : runningInspect({Status: 'exited', ExitCode: 137})
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.restart);
        expect(decision.diagnosis).toMatchObject({
            type          : 'recovery-diagnosis',
            recoveryClass : 'crash',
            targetIdentity: {
                kind: 'compose-service',
                id  : 'memory'
            },
            source : 'container-health-diagnostics',
            details: {
                actionClass         : CONTAINER_HEALTH_ACTION_CLASSES.restart,
                classificationReason: 'lifecycle-crash'
            }
        });
        expect(decision.diagnosis.evidenceFacts.map(fact => fact.type))
            .toContain(CONTAINER_HEALTH_FACT_TYPES.containerDown);
    });

    test('requires multi-fact evidence before diagnosing unhealthy probe-like states', () => {
        const service = createService();

        const advisory = service.diagnose({
            serviceKey: 'knowledge',
            inspect   : runningInspect({Health: {Status: 'starting'}})
        });

        expect(advisory.status).toBe('advisory');
        expect(advisory.diagnosis).toBeNull();

        const diagnosed = service.diagnose({
            serviceKey   : 'knowledge',
            inspect      : runningInspect({Health: {Status: 'unhealthy'}}),
            endpointProbe: {ok: false, name: 'healthcheck'}
        });

        expect(diagnosed.status).toBe('diagnosed');
        expect(diagnosed.diagnosis.recoveryClass).toBe('crash');
        expect(diagnosed.diagnosis.evidenceFacts.map(fact => fact.type)).toEqual([
            CONTAINER_HEALTH_FACT_TYPES.containerUnhealthy,
            CONTAINER_HEALTH_FACT_TYPES.endpointProbeFailed
        ]);
    });

    test('keeps single-sample resource spikes advisory', () => {
        const service = createService({cpuSaturationPercent: 90, memorySaturationPercent: 80});

        const decision = service.diagnose({
            serviceKey: 'model',
            stats     : statsSample({cpuPercent: 380, memoryPercent: 85})
        });

        expect(decision.status).toBe('healthy');
        expect(decision.diagnosis).toBeNull();
        expect(decision.facts).toHaveLength(0);
    });

    test('classifies sustained resource saturation as throttle-shed exhaustion with bounded evidence', () => {
        const service = createService({cpuSaturationPercent: 90, memorySaturationPercent: 80});

        const decision = service.diagnose({
            serviceKey  : 'model',
            statsSamples: [
                statsSample({cpuPercent: 380, memoryPercent: 85}),
                statsSample({cpuPercent: 360, memoryPercent: 82})
            ]
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.throttleShed);
        expect(decision.diagnosis).toMatchObject({
            recoveryClass: 'exhaustion',
            details      : {
                actionClass         : CONTAINER_HEALTH_ACTION_CLASSES.throttleShed,
                classificationReason: 'resource-exhaustion',
                sampleWindowMs      : 30000
            }
        });
        expect(decision.diagnosis.evidenceFacts[0].details).toMatchObject({
            sampleCount: 2,
            minPercent : 360,
            maxPercent : 380
        });
        expect(decision.diagnosis.evidenceFacts.map(fact => fact.type)).toEqual([
            CONTAINER_HEALTH_FACT_TYPES.resourceSaturation,
            CONTAINER_HEALTH_FACT_TYPES.memorySaturation
        ]);
    });

    test('classifies Ollama eval contention only with runtime evidence', () => {
        const service = createService();

        const evalAttribution = {
            primaryRole: {role: 'chat'},
            primaryLoad: {model: 'gemma4:31b'},
            stuckModels: [{
                model          : 'qwen3-embedding',
                role           : 'embedding',
                tokensPerSecond: 0
            }]
        };

        const advisory = service.diagnose({
            serviceKey           : 'model',
            ollamaEvalAttribution: evalAttribution
        });

        expect(advisory.status).toBe('advisory');
        expect(advisory.diagnosis).toBeNull();

        const diagnosed = service.diagnose({
            serviceKey  : 'model',
            statsSamples: [
                statsSample({cpuPercent: 390}),
                statsSample({cpuPercent: 390})
            ],
            ollamaEvalAttribution: evalAttribution
        });

        expect(diagnosed.status).toBe('diagnosed');
        expect(diagnosed.diagnosis).toMatchObject({
            recoveryClass: 'contention',
            details      : {
                actionClass         : CONTAINER_HEALTH_ACTION_CLASSES.throttleShed,
                classificationReason: 'contention-with-runtime-evidence'
            }
        });
        expect(diagnosed.diagnosis.evidenceFacts.map(fact => fact.type)).toEqual([
            CONTAINER_HEALTH_FACT_TYPES.evalContention,
            CONTAINER_HEALTH_FACT_TYPES.resourceSaturation
        ]);
    });

    test('escalates config drift without selecting a lifecycle action', () => {
        const service = createService();

        const decision = service.diagnose({
            serviceKey : 'orchestrator',
            configCheck: {
                ok      : false,
                key     : 'NEO_MODEL_CONTEXT',
                expected: '131072',
                actual  : '4096',
                message : 'configured override did not land'
            }
        });

        expect(decision.status).toBe('diagnosed');
        expect(decision.actionClass).toBe(CONTAINER_HEALTH_ACTION_CLASSES.escalate);
        expect(decision.diagnosis).toMatchObject({
            recoveryClass: 'config-drift',
            details      : {
                actionClass         : CONTAINER_HEALTH_ACTION_CLASSES.escalate,
                classificationReason: 'config-drift-escalate'
            }
        });
    });

    test('collectAndDiagnose uses runtime read-observe and keeps read failures advisory', async () => {
        const service = createService();
        const calls   = [];

        const runtimeAccessService = {
            async readObserve(request) {
                calls.push(request);

                if (request.operation === 'inspect') {
                    return {data: runningInspect({Status: 'exited', ExitCode: 1})};
                }

                return {data: statsSample({cpuPercent: 5})};
            }
        };

        const decision = await service.collectAndDiagnose({
            serviceKey: 'memory',
            runtimeAccessService
        });

        expect(calls.map(call => call.operation)).toEqual(['inspect', 'stats']);
        expect(decision.diagnosis.recoveryClass).toBe('crash');

        const failed = await service.collectAndDiagnose({
            serviceKey          : 'memory',
            runtimeAccessService: {
                async readObserve() {
                    throw new Error('socket unavailable');
                }
            }
        });

        expect(failed.status).toBe('advisory');
        expect(failed.diagnosis).toBeNull();
        expect(failed.facts[0]).toMatchObject({
            type: CONTAINER_HEALTH_FACT_TYPES.runtimeReadFailed
        });
    });
});
