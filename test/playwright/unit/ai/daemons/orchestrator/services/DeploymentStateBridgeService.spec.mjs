import {test, expect}                 from '@playwright/test';
import Neo                            from '../../../../../../../src/Neo.mjs';
import * as core                      from '../../../../../../../src/core/_export.mjs';
import {DeploymentStateBridgeService} from '../../../../../../../ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs';

const OBSERVED_AT = 1710000000000;

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

const BRIDGE_OPTIONS = Object.freeze({
    enabled          : true,
    snapshotPath     : '/tmp/unused-snapshot.json',
    writeIntervalMs  : 30000,
    staleAfterMs     : 120000,
    maxSnapshotBytes : 256 * 1024,
    allowedServices  : ['model'],
    includeLogs      : true,
    logTail          : 2,
    logMaxBytes      : 8,
    statsSampleWindow: 2
});

function createService({runtimeAccessService, diagnosisService} = {}) {
    return Neo.create(DeploymentStateBridgeService, {
        runtimeAccessService,
        diagnosisService,
        nowFn: () => OBSERVED_AT
    });
}

test.describe('Neo.ai.daemons.services.DeploymentStateBridgeService', () => {
    test('collects bounded read-observe state and diagnosis for allowlisted services', async () => {
        const calls                = [];
        const runtimeAccessService = {
            configValues: {allowedServices: ['model']},
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
        const snapshot = await service.collectSnapshot({bridgeOptions: BRIDGE_OPTIONS});

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
                text     : '89abcdef',
                truncated: true,
                tail     : 2
            },
            diagnosis: {
                serviceKey : 'model',
                status     : 'unhealthy',
                sampleCount: 1
            },
            proofs: [{operation: 'inspect'}, {operation: 'stats'}, {operation: 'logs'}]
        });
    });

    test('falls back to runtime allowed services and records read errors as degraded state', async () => {
        const runtimeAccessService = {
            configValues: {allowedServices: ['memory']},
            async readObserve() {
                throw new Error('runtime unavailable');
            }
        };

        const service  = createService({runtimeAccessService, diagnosisService: null});
        const snapshot = await service.collectSnapshot({bridgeOptions: {...BRIDGE_OPTIONS, allowedServices: []}});

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
});
