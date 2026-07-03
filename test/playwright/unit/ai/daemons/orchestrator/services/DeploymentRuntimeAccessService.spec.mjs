import {test, expect}                   from '@playwright/test';
import Neo                              from '../../../../../../../src/Neo.mjs';
import * as core                        from '../../../../../../../src/core/_export.mjs';
import {DeploymentRuntimeAccessService} from '../../../../../../../ai/daemons/orchestrator/services/DeploymentRuntimeAccessService.mjs';

const BASE_CONFIG = {
    enabled                     : true,
    mechanism                   : 'docker-socket',
    socketPath                  : '/var/run/docker.sock',
    composeProject              : null,
    allowedServices             : ['chroma', 'kb-server', 'mc-server', 'local-model'],
    readOperations              : ['inspect', 'logs', 'stats'],
    lifecycleOperations         : ['restart'],
    timeoutMs                   : 5000,
    responseMaxBytes            : 1024 * 1024,
    logTail                     : 200,
    defaultRestartTimeoutSeconds: 10,
    auditMode                   : 'metadata'
};

function makeContainer(overrides = {}) {
    return {
        Id    : 'container-abc',
        Names : ['/neo-mc-server-1'],
        Image : 'neo-mc-server:test',
        State : 'running',
        Status: 'Up 10 minutes',
        Labels: {
            'com.docker.compose.service': 'mc-server',
            'com.docker.compose.project': 'neo'
        },
        ...overrides
    };
}

function createService({
    config = {},
    containers = [makeContainer()],
    inspectData = {Name: '/neo-mc-server-1'},
    statsData = {cpu_stats: {}},
    logText = 'ready',
    requestError = null
} = {}) {
    const calls = [];

    const dockerRequestFn = async request => {
        calls.push(request);

        if (requestError) {
            throw requestError;
        }

        if (request.path.startsWith('/containers/json')) {
            return {statusCode: 200, headers: {}, body: JSON.stringify(containers)};
        }

        if (request.path.endsWith('/json')) {
            return {statusCode: 200, headers: {}, body: JSON.stringify(inspectData)};
        }

        if (request.path.includes('/logs?')) {
            return {statusCode: 200, headers: {}, body: logText};
        }

        if (request.path.includes('/stats?')) {
            return {statusCode: 200, headers: {}, body: JSON.stringify(statsData)};
        }

        if (request.path.includes('/restart?')) {
            return {statusCode: 204, headers: {}, body: ''};
        }

        throw new Error(`Unexpected Docker request: ${request.method} ${request.path}`);
    };

    const service = Neo.create(DeploymentRuntimeAccessService, {
        runtimeAccessConfig: {...BASE_CONFIG, ...config},
        dockerRequestFn,
        nowFn              : () => 1710000000000
    });

    return {calls, service};
}

test.describe('Neo.ai.daemons.services.DeploymentRuntimeAccessService', () => {
    test('readObserve inspect resolves an allowlisted compose service by Docker labels', async () => {
        const {service, calls} = createService();

        const result = await service.readObserve({serviceKey: 'mc-server', operation: 'inspect'});

        expect(result.ok).toBe(true);
        expect(result.data).toEqual({Name: '/neo-mc-server-1'});
        expect(result.proof).toMatchObject({
            recordType        : 'deployment-runtime-access',
            runtimeMechanism  : 'docker-socket',
            capabilityEnvelope: 'read-observe',
            operation         : 'inspect',
            auditLabel        : 'read-observe:inspect',
            serviceKey        : 'mc-server',
            targetIdentity    : {kind: 'compose-service', id: 'mc-server'},
            observedAt        : 1710000000000
        });

        expect(calls[0]).toMatchObject({method: 'GET'});
        const filters = JSON.parse(decodeURIComponent(calls[0].path.split('filters=')[1]));
        expect(filters).toEqual({
            label: ['com.docker.compose.service=mc-server']
        });
        expect(calls[1]).toMatchObject({
            method: 'GET',
            path  : '/containers/container-abc/json'
        });
    });

    test('readObserve includes composeProject in the Docker label filter when configured', async () => {
        const {service, calls} = createService({config: {composeProject: 'prod'}});

        await service.readObserve({serviceKey: 'mc-server', operation: 'inspect'});

        const filters = JSON.parse(decodeURIComponent(calls[0].path.split('filters=')[1]));
        expect(filters).toEqual({
            label: [
                'com.docker.compose.service=mc-server',
                'com.docker.compose.project=prod'
            ]
        });
    });

    test('readObserve logs and stats stay on the read-observe envelope', async () => {
        const {service, calls} = createService({
            statsData: {memory_stats: {usage: 42}},
            logText  : 'service booted'
        });

        const logs  = await service.readObserve({serviceKey: 'mc-server', operation: 'logs', tail: 25});
        const stats = await service.readObserve({serviceKey: 'mc-server', operation: 'stats'});

        expect(logs.data).toEqual({logs: 'service booted', tail: 25});
        expect(logs.proof.auditLabel).toBe('read-observe:logs');
        expect(stats.data).toEqual({memory_stats: {usage: 42}});
        expect(stats.proof.auditLabel).toBe('read-observe:stats');
        expect(calls.some(call => call.path === '/containers/container-abc/logs?stdout=1&stderr=1&tail=25')).toBe(true);
        expect(calls.some(call => call.path === '/containers/container-abc/stats?stream=false')).toBe(true);
    });

    test('applyLifecycle restart uses the lifecycle-write envelope and POSTs to Docker restart', async () => {
        const {service, calls} = createService();

        const result = await service.applyLifecycle({
            serviceKey           : 'mc-server',
            operation            : 'restart',
            reason               : 'diagnosis:crash',
            restartTimeoutSeconds: 4
        });

        expect(result.ok).toBe(true);
        expect(result.statusCode).toBe(204);
        expect(result.data).toEqual({
            restarted            : true,
            reason               : 'diagnosis:crash',
            restartTimeoutSeconds: 4
        });
        expect(result.proof).toMatchObject({
            capabilityEnvelope: 'lifecycle-write',
            operation         : 'restart',
            auditLabel        : 'lifecycle-write:restart',
            reason            : 'diagnosis:crash'
        });
        expect(calls[1]).toMatchObject({
            method: 'POST',
            path  : '/containers/container-abc/restart?t=4'
        });
    });

    test('denies cross-envelope and non-allowlisted operations before Docker access', async () => {
        const {service, calls} = createService();

        await expect(service.readObserve({serviceKey: 'mc-server', operation: 'restart'}))
            .rejects.toThrow(/read-observe operation 'restart' is not allowlisted/);
        await expect(service.applyLifecycle({serviceKey: 'mc-server', operation: 'inspect'}))
            .rejects.toThrow(/lifecycle-write operation 'inspect' is not allowlisted/);

        expect(calls).toHaveLength(0);
    });

    test('denies arbitrary service keys before Docker access', async () => {
        const {service, calls} = createService();

        await expect(service.readObserve({serviceKey: 'arbitrary-container', operation: 'inspect'}))
            .rejects.toThrow(/service 'arbitrary-container' is not allowlisted/);

        expect(calls).toHaveLength(0);
    });

    test('fails closed when runtime access is disabled or sidecar fallback is selected', async () => {
        const disabled = createService({config: {enabled: false}});
        const sidecar  = createService({config: {mechanism: 'sidecar'}});

        await expect(disabled.service.readObserve({serviceKey: 'mc-server', operation: 'inspect'}))
            .rejects.toThrow(/disabled/);
        await expect(sidecar.service.readObserve({serviceKey: 'mc-server', operation: 'inspect'}))
            .rejects.toThrow(/sidecar mechanism is documented fallback only/);

        expect(disabled.calls).toHaveLength(0);
        expect(sidecar.calls).toHaveLength(0);
    });

    test('adds structured config and filter details when a compose service has no match', async () => {
        const {service} = createService({
            config    : {composeProject: 'prod'},
            containers: []
        });

        const error = await service.readObserve({serviceKey: 'mc-server', operation: 'inspect'}).catch(e => e);

        expect(error).toMatchObject({
            reason : 'compose-service-no-match',
            message: "No Docker container found for compose service 'mc-server'",
            details: {
                enabled             : true,
                mechanism           : 'docker-socket',
                composeProject      : 'prod',
                allowedServices     : ['chroma', 'kb-server', 'mc-server', 'local-model'],
                readOperations      : ['inspect', 'logs', 'stats'],
                lifecycleOperations : ['restart'],
                auditMode           : 'metadata',
                socketPathConfigured: true,
                serviceKey          : 'mc-server',
                filters             : {
                    label: [
                        'com.docker.compose.service=mc-server',
                        'com.docker.compose.project=prod'
                    ]
                },
                matchCount: 0
            }
        });
        expect(error.details.hints).toContain('Align NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES with Docker com.docker.compose.service labels.');
    });

    test('requires composeProject when a service label resolves ambiguously', async () => {
        const {service} = createService({
            containers: [
                makeContainer({Id: 'container-a'}),
                makeContainer({Id: 'container-b'})
            ]
        });

        const error = await service.readObserve({serviceKey: 'mc-server', operation: 'inspect'}).catch(e => e);

        expect(error).toMatchObject({
            reason : 'compose-service-ambiguous',
            message: "Compose service 'mc-server' resolved to 2 containers; configure composeProject to disambiguate",
            details: {
                serviceKey: 'mc-server',
                matchCount: 2,
                filters   : {
                    label: ['com.docker.compose.service=mc-server']
                }
            }
        });
    });

    test('classifies socket transport failures during compose lookup', async () => {
        const requestError = Object.assign(new Error('connect ENOENT /var/run/docker.sock'), {code: 'ENOENT'});
        const {service}    = createService({requestError});

        const error = await service.readObserve({serviceKey: 'mc-server', operation: 'inspect'}).catch(e => e);

        expect(error).toMatchObject({
            reason : 'docker-socket-unavailable',
            code   : 'ENOENT',
            message: 'Docker socket is unavailable',
            details: {
                serviceKey: 'mc-server',
                filters   : {
                    label: ['com.docker.compose.service=mc-server']
                }
            }
        });
    });
});
