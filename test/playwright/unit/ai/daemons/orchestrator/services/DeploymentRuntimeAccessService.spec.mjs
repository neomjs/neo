import {readFileSync} from 'node:fs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    DeploymentRuntimeAccessService,
    DEPLOYMENT_RUNTIME_SELF_SERVICE_KEY
} from '../../../../../../../ai/daemons/orchestrator/services/DeploymentRuntimeAccessService.mjs';
import {RECOVERY_KNOBS} from '../../../../../../../ai/services/memory-core/helpers/recoveryKnobRegistry.mjs';

const BASE_CONFIG = {
    enabled                     : true,
    mechanism                   : 'docker-socket',
    socketPath                  : '/var/run/docker.sock',
    composeProject              : 'neo',
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

        if (request.path.endsWith('/update')) {
            return {statusCode: 200, headers: {}, body: '{"Warnings":[]}'};
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
    test('canonical cloud Compose binds project naming and runtime access to one deployment variable', () => {
        const composeText = readFileSync(
            new URL('../../../../../../../ai/deploy/docker-compose.yml', import.meta.url),
            'utf8'
        );

        expect(composeText).toContain('name: "${NEO_DEPLOY_PROJECT_NAME:-neo-agent-os}"');
        expect(composeText).toContain(
            'NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT=${NEO_DEPLOY_PROJECT_NAME:-neo-agent-os}'
        );
    });

    test('readObserve inspect resolves an allowlisted compose service by project and service labels', async () => {
        const {service, calls} = createService();

        const result = await service.readObserve({serviceKey: 'mc-server', operation: 'inspect'});

        expect(service).toBeInstanceOf(core.Base);
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
            label: [
                'com.docker.compose.service=mc-server',
                'com.docker.compose.project=neo'
            ]
        });
        expect(calls[1]).toMatchObject({
            method: 'GET',
            path  : '/containers/container-abc/json'
        });
    });

    test('readObserve includes composeProject in the Docker label filter when configured', async () => {
        const {service, calls} = createService({
            config    : {composeProject: 'prod'},
            containers: [makeContainer({
                Labels: {
                    'com.docker.compose.service': 'mc-server',
                    'com.docker.compose.project': 'prod'
                }
            })]
        });

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

        // No interval requested, so the receipt must say so — `bounded: false` is what keeps a
        // consumer from treating an unbounded slice as attributable to one incarnation.
        expect(logs.data).toEqual({
            appliedSince: null,
            appliedUntil: null,
            bounded     : false,
            containerId : 'container-abc',
            logs        : 'service booted',
            tail        : 25
        });
        expect(logs.proof.auditLabel).toBe('read-observe:logs');
        expect(stats.data).toEqual({memory_stats: {usage: 42}});
        expect(stats.proof.auditLabel).toBe('read-observe:stats');
        expect(calls.some(call => call.path === '/containers/container-abc/logs?stdout=1&stderr=1&tail=25')).toBe(true);
        expect(calls.some(call => call.path === '/containers/container-abc/stats?stream=false')).toBe(true);
    });

    test('a valid incarnation interval reaches the Docker query AND is echoed as applied', async () => {
        const {service, calls} = createService({logText: 'FATAL ERROR'});

        const logs = await service.readObserve({
            serviceKey: 'mc-server',
            operation : 'logs',
            since     : '2026-08-08T20:00:00.000Z',
            tail      : 25,
            until     : '2026-08-08T20:05:00.000Z'
        });

        // The URL carries the interval — the bound is applied by the daemon, not simulated here.
        expect(calls.some(call => call.path.includes('since=') && call.path.includes('until=')))
            .toBe(true);

        // And the receipt proves what was applied, which is the ONLY thing a consumer may trust.
        expect(logs.data).toMatchObject({
            appliedSince: '2026-08-08T20:00:00.000Z',
            appliedUntil: '2026-08-08T20:05:00.000Z',
            bounded     : true,
            containerId : 'container-abc'
        });
    });

    test('sub-second precision survives — a floored upper bound would cut the fatal line', async () => {
        const {service, calls} = createService({logText: 'FATAL ERROR'});

        // V8 writes its fatal line in the final moments before the process dies. Flooring
        // `until` to whole seconds discards up to a second of output at exactly that edge —
        // the evidence being sought — while flooring `since` reaches back into the previous
        // incarnation. Docker accepts RFC3339Nano, so neither rounding is imposed by transport.
        const logs = await service.readObserve({
            serviceKey: 'mc-server',
            operation : 'logs',
            since     : '2026-08-08T20:00:00.900Z',
            until     : '2026-08-08T20:05:00.900Z'
        });

        const path = calls.find(call => call.path.includes('until='))?.path ?? '';

        expect(decodeURIComponent(path), 'the endpoints reach Docker unrounded')
            .toContain('until=2026-08-08T20:05:00.900Z');
        expect(decodeURIComponent(path)).toContain('since=2026-08-08T20:00:00.900Z');

        expect(logs.data.appliedUntil, 'the receipt echoes the precision it actually sent')
            .toBe('2026-08-08T20:05:00.900Z');
    });

    test('an unusable bound stays unbounded rather than half-applied', async () => {
        const {service, calls} = createService({logText: 'x'});

        // Docker reports an unset time as the zero instant, which parses to a valid but meaningless
        // epoch. Passing that through would hand the query a bound that looks real.
        const zeroInstant = await service.readObserve({
            serviceKey: 'mc-server',
            operation : 'logs',
            since     : '0001-01-01T00:00:00Z',
            until     : '0001-01-01T00:00:00Z'
        });

        expect(zeroInstant.data.bounded, 'the zero instant is not a usable bound').toBe(false);

        // A running container has a start but no finish — half an interval is not the incarnation.
        const halfOpen = await service.readObserve({
            serviceKey: 'mc-server',
            operation : 'logs',
            since     : '2026-08-08T20:00:00.000Z',
            until     : null
        });

        expect(halfOpen.data.bounded, 'a missing upper bound cannot exclude a racing restart').toBe(false);
        expect(calls.every(call => !call.path.includes('since=')), 'no partial interval reaches the query').toBe(true);
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

    test('requires a Compose project identity before read or lifecycle Docker access', async () => {
        const {service, calls} = createService({config: {composeProject: null}});

        const readError      = await service.readObserve({serviceKey: 'mc-server', operation: 'inspect'}).catch(e => e);
        const lifecycleError = await service.applyLifecycle({
            serviceKey: 'mc-server',
            operation : 'restart'
        }).catch(e => e);

        expect(readError).toMatchObject({
            reason : 'compose-project-unavailable',
            message: 'Deployment runtime access requires an explicit Compose project identity'
        });
        expect(lifecycleError.reason).toBe('compose-project-unavailable');
        expect(calls).toHaveLength(0);
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

    test('rejects a same-named service returned from a foreign Compose project before read or lifecycle access', async () => {
        const attempts = [
            service => service.readObserve({serviceKey: 'mc-server', operation: 'inspect'}),
            service => service.applyLifecycle({serviceKey: 'mc-server', operation: 'restart'})
        ];

        for (const attempt of attempts) {
            const {service, calls} = createService({
                containers: [makeContainer({
                    Id    : 'foreign-container',
                    Labels: {
                        'com.docker.compose.service': 'mc-server',
                        'com.docker.compose.project': 'foreign'
                    }
                })]
            });
            const error = await attempt(service).catch(e => e);

            expect(error).toMatchObject({
                reason : 'compose-project-mismatch',
                message: 'Docker target did not prove the configured Compose project identity',
                details: {
                    composeProject: 'neo',
                    serviceKey    : 'mc-server',
                    matchCount    : 1
                }
            });
            expect(calls).toHaveLength(1);
            expect(calls[0].path).toContain('/containers/json?');
            expect(calls[0].path).not.toContain('foreign-container');
        }
    });

    test('rejects a Docker response without the exact requested Compose service label', async () => {
        const {service, calls} = createService({
            containers: [makeContainer({
                Labels: {
                    'com.docker.compose.service': 'kb-server',
                    'com.docker.compose.project': 'neo'
                }
            })]
        });

        const error = await service.readObserve({serviceKey: 'mc-server', operation: 'inspect'}).catch(e => e);

        expect(error).toMatchObject({
            reason : 'compose-service-mismatch',
            message: 'Docker target did not prove the requested Compose service identity',
            details: {
                composeProject: 'neo',
                serviceKey    : 'mc-server',
                matchCount    : 1
            }
        });
        expect(calls).toHaveLength(1);
    });

    test('routes null or absent Docker labels through bounded project mismatches', async () => {
        const attempts = [
            service => service.readObserve({serviceKey: 'mc-server', operation: 'inspect'}),
            service => service.applyLifecycle({serviceKey: 'mc-server', operation: 'restart'})
        ];

        for (const labels of [null, undefined]) {
            for (const attempt of attempts) {
                const container = makeContainer();

                if (labels === undefined) {
                    delete container.Labels
                } else {
                    container.Labels = labels
                }

                const {service, calls} = createService({containers: [container]});

                try {
                    const error = await attempt(service).catch(e => e);

                    expect(error).not.toBeInstanceOf(TypeError);
                    expect(error).toMatchObject({
                        reason : 'compose-project-mismatch',
                        message: 'Docker target did not prove the configured Compose project identity',
                        details: {
                            composeProject: 'neo',
                            serviceKey    : 'mc-server',
                            matchCount    : 1
                        }
                    });
                    expect(calls).toHaveLength(1);
                    expect(calls[0].path).toContain('/containers/json?');
                    expect(calls[0].path).not.toContain('container-abc');
                } finally {
                    service.destroy()
                }
            }
        }
    });

    test('fails closed when a service resolves ambiguously inside the configured project', async () => {
        const {service} = createService({
            containers: [
                makeContainer({Id: 'container-a'}),
                makeContainer({Id: 'container-b'})
            ]
        });

        const error = await service.readObserve({serviceKey: 'mc-server', operation: 'inspect'}).catch(e => e);

        expect(error).toMatchObject({
            reason : 'compose-service-ambiguous',
            message: "Compose service 'mc-server' resolved to 2 containers inside the configured Compose project",
            details: {
                serviceKey: 'mc-server',
                matchCount: 2,
                filters   : {
                    label: [
                        'com.docker.compose.service=mc-server',
                        'com.docker.compose.project=neo'
                    ]
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
                    label: [
                        'com.docker.compose.service=mc-server',
                        'com.docker.compose.project=neo'
                    ]
                }
            }
        });
    });
    /**
     * The orchestrator must be READABLE through the bridge it publishes — it is the only process
     * holding the tenant-repo-sync failure text, and excluding it made a wedged deployment
     * undiagnosable from a remote MCP client. It must never be a LIFECYCLE target of that same bridge.
     *
     * One `allowedServices` list gates both envelopes, so allowlisting it for reads necessarily
     * allowlists it for restart. These assert the asymmetry in BOTH directions, because either half
     * alone is satisfied by a wrong implementation: refusing everything would pass the restart test,
     * and allowing everything would pass the read test.
     */
    test('the orchestrator is READABLE through its own bridge', async () => {
        const {service} = createService({
            config    : {allowedServices: [...BASE_CONFIG.allowedServices, DEPLOYMENT_RUNTIME_SELF_SERVICE_KEY]},
            containers: [makeContainer({
                Names : ['/neo-orchestrator-1'],
                Labels: {
                    'com.docker.compose.service': DEPLOYMENT_RUNTIME_SELF_SERVICE_KEY,
                    'com.docker.compose.project': 'neo'
                }
            })],
            inspectData: {Name: '/neo-orchestrator-1'}
        });

        const result = await service.readObserve({
            serviceKey: DEPLOYMENT_RUNTIME_SELF_SERVICE_KEY,
            operation : 'logs',
            tail      : 25
        });

        expect(result).toBeTruthy();
    });

    test('the orchestrator is NOT restartable through its own bridge, even while allowlisted', async () => {
        const {service} = createService({
            config: {allowedServices: [...BASE_CONFIG.allowedServices, DEPLOYMENT_RUNTIME_SELF_SERVICE_KEY]}
        });

        // Refused on the SELF rule, not on the allowlist — the allowlist admits it, which is the whole
        // point: a test that passed because the service was un-allowlisted would prove nothing about
        // the asymmetry.
        await expect(service.applyLifecycle({
            serviceKey: DEPLOYMENT_RUNTIME_SELF_SERVICE_KEY,
            operation : 'restart'
        })).rejects.toThrow(/publishes this bridge/);
    });

    test('a sibling service stays restartable — the refusal is scoped to self, not to lifecycle', async () => {
        // The positive control for the assertion above.
        const {service} = createService({
            config: {allowedServices: [...BASE_CONFIG.allowedServices, DEPLOYMENT_RUNTIME_SELF_SERVICE_KEY]}
        });

        const result = await service.applyLifecycle({serviceKey: 'mc-server', operation: 'restart'});

        expect(result).toBeTruthy();
    });

    test('the self-service constant matches the orchestrator service key in the deploy template', () => {
        // Two expectation sites: the refusal keys off this string, and the template names the service.
        // A rename in either would silently disarm the refusal by making it match nothing, so the
        // coupling is asserted rather than assumed.
        const
            compose  = readFileSync(new URL('../../../../../../../ai/deploy/docker-compose.yml', import.meta.url), 'utf8'),
            services = [...compose.matchAll(/^ {2}([a-z0-9][a-z0-9_.-]*):$/gmu)].map(match => match[1]);

        expect(services, 'the compose parse found no services — the guard is looking at nothing').toContain('chroma');
        expect(services).toContain(DEPLOYMENT_RUNTIME_SELF_SERVICE_KEY);
        // And the shipped allowlist must actually grant it, or the read half is unreachable in production.
        expect(compose).toMatch(new RegExp(`RUNTIME_ACCESS_ALLOWED_SERVICES=[^\\n]*${DEPLOYMENT_RUNTIME_SELF_SERVICE_KEY}`));
    })

    test.describe('update-memory-limit — the live ceiling move, bounded AT the boundary (#16596)', () => {
        const GIB           = 1024 ** 3;
        const UPDATE_CONFIG = {lifecycleOperations: ['restart', 'update-memory-limit']};

        function chromaContainer() {
            return makeContainer({
                Id    : 'chroma-abc',
                Names : ['/neo-chroma-1'],
                Labels: {
                    'com.docker.compose.service': 'chroma',
                    'com.docker.compose.project': 'neo'
                }
            });
        }

        test('is refused when the deployment has not allowlisted it, before any Docker access', async () => {
            // The frozen operation vocabulary says what the CODE can do; the config allowlist says what
            // THIS deployment permits. A deployment shipped before the operation existed keeps exactly
            // the envelope it was reviewed with until its config says otherwise.
            const {service, calls} = createService();

            await expect(service.applyLifecycle({
                serviceKey      : 'chroma',
                operation       : 'update-memory-limit',
                memoryLimitBytes: 8 * GIB
            })).rejects.toThrow(/lifecycle-write operation 'update-memory-limit' is not allowlisted/);

            expect(calls).toHaveLength(0);
        });

        test('moves the cgroup ceiling on the RUNNING container — a typed JSON update, never a restart', async () => {
            const {service, calls} = createService({
                config     : UPDATE_CONFIG,
                containers : [chromaContainer()],
                inspectData: {HostConfig: {Memory: 2 * GIB}}
            });

            const result = await service.applyLifecycle({
                serviceKey      : 'chroma',
                operation       : 'update-memory-limit',
                memoryLimitBytes: 8 * GIB,
                reason          : 'store-ceiling-exhaustion'
            });

            expect(result.ok).toBe(true);
            expect(result.data).toEqual({
                updated         : true,
                memoryLimitBytes: 8 * GIB,
                reason          : 'store-ceiling-exhaustion'
            });
            expect(result.proof).toMatchObject({
                capabilityEnvelope: 'lifecycle-write',
                operation         : 'update-memory-limit',
                auditLabel        : 'lifecycle-write:update-memory-limit',
                reason            : 'store-ceiling-exhaustion'
            });

            // calls[0] proves identity (container list); calls[1] reads the LIVE limit the raise-only
            // bound is evaluated against; calls[2] is the update itself.
            expect(calls).toHaveLength(3);
            expect(calls[1]).toMatchObject({method: 'GET', path: '/containers/chroma-abc/json'});
            expect(calls[2]).toMatchObject({
                method : 'POST',
                path   : '/containers/chroma-abc/update',
                headers: {'Content-Type': 'application/json'}
            });

            // MemorySwap pinned to Memory: swap headroom would let the store balloon past the declared
            // ceiling into thrash instead of re-surfacing saturation to the diagnosis layer.
            expect(JSON.parse(calls[2].body)).toEqual({
                Memory    : 8 * GIB,
                MemorySwap: 8 * GIB
            });

            // The no-restart property at this layer: no restart endpoint is touched.
            expect(calls.some(call => String(call.path).includes('/restart'))).toBe(false);
        });

        test('refuses a non-positive or non-finite ceiling before touching the update endpoint', async () => {
            for (const memoryLimitBytes of [undefined, NaN, 0, -1, '8g']) {
                const {service, calls} = createService({config: UPDATE_CONFIG, containers: [chromaContainer()]});

                const error = await service.applyLifecycle({
                    serviceKey: 'chroma',
                    operation : 'update-memory-limit',
                    memoryLimitBytes
                }).catch(e => e);

                expect(error.reason, JSON.stringify(memoryLimitBytes)).toBe('runtime-memory-limit-invalid');
                // Identity resolution ran; the update endpoint was never reached.
                expect(calls.some(call => String(call.path).endsWith('/update')), JSON.stringify(memoryLimitBytes)).toBe(false);
            }
        });

        test('a service NO ceiling knob declares is refused — the registry closed set IS the target list', async () => {
            // The bypass the review caught: under flat allowlists the raw op could resize a transient
            // service, skipping everything the knob enforces one layer up. The boundary now consults
            // the same closed registry, so mc-server — allowlisted for lifecycle, declared by no
            // ceiling knob — cannot be addressed at all, and no Docker read runs beyond identity.
            const {service, calls} = createService({config: UPDATE_CONFIG});

            const error = await service.applyLifecycle({
                serviceKey      : 'mc-server',
                operation       : 'update-memory-limit',
                memoryLimitBytes: 8 * GIB
            }).catch(e => e);

            expect(error.reason).toBe('runtime-memory-limit-unsanctioned-target');
            expect(calls).toHaveLength(1);
            expect(calls.some(call => String(call.path).endsWith('/update'))).toBe(false);
        });

        test('every container-memory ceiling leaf declares a FINITE band — an unbanded one would delete the cap', () => {
            // Asserted on the DATA rather than on the branch, deliberately. The boundary's unbanded
            // refusal is unreachable while chroma is the only envelope knob, so a branch test would
            // need a synthetic registry and would prove only that the fixture was built correctly.
            // The hazard is a FUTURE leaf, and it is silent: `value < undefined || value > undefined`
            // is NaN-false in both directions, so an unbanded envelope knob does not tighten the cap,
            // it removes it — leaving raise-only as the sole surviving bound and the autonomous
            // ratchet unterminated.
            const envelopeLeaves = Object.values(RECOVERY_KNOBS).flatMap(knob =>
                knob.leaves.filter(leaf => leaf.role === 'ceiling' && leaf.resource === 'container-memory')
            );

            // Guards the guard: if the discriminator were ever dropped from the registry this would
            // silently become a vacuous loop over an empty array.
            expect(envelopeLeaves.length).toBeGreaterThan(0);

            for (const leaf of envelopeLeaves) {
                expect(Number.isFinite(leaf.min), leaf.path).toBe(true);
                expect(Number.isFinite(leaf.max), leaf.path).toBe(true);
            }
        });

        test('a value outside the registry band is refused BEFORE any Docker read — the cap holds at L0 too', async () => {
            // 32 GiB is the doubling policy's next step past the cap. The actuator's registry
            // validation refuses it; this proves a caller skipping the actuator meets the SAME band
            // at the boundary — one band source, and the raw op cannot express what the knob forbids.
            for (const memoryLimitBytes of [32 * GIB, 4 * GIB]) {
                const {service, calls} = createService({config: UPDATE_CONFIG, containers: [chromaContainer()]});

                const error = await service.applyLifecycle({
                    serviceKey: 'chroma',
                    operation : 'update-memory-limit',
                    memoryLimitBytes
                }).catch(e => e);

                expect(error.reason, `${memoryLimitBytes}`).toBe('runtime-memory-limit-out-of-band');
                expect(error.message).toContain(`${8 * GIB}..${16 * GIB}`);
                expect(calls, `${memoryLimitBytes}`).toHaveLength(1);
            }
        });

        test('an in-band LOWERING is refused against the live limit — the case the band alone cannot catch', async () => {
            // Live 12 GiB, proposed 8 GiB: inside the band, still a lowering — an OOM instruction
            // for a store whose corpus does not shrink to fit. The boundary reads the live limit
            // itself rather than trusting the caller to have run the knob's invariant.
            const {service, calls} = createService({
                config     : UPDATE_CONFIG,
                containers : [chromaContainer()],
                inspectData: {HostConfig: {Memory: 12 * GIB}}
            });

            const error = await service.applyLifecycle({
                serviceKey      : 'chroma',
                operation       : 'update-memory-limit',
                memoryLimitBytes: 8 * GIB
            }).catch(e => e);

            expect(error.reason).toBe('runtime-memory-limit-not-a-raise');
            expect(error.message).toContain('at or below the live limit');
            expect(calls.some(call => String(call.path).endsWith('/update'))).toBe(false);
        });

        test('CONCURRENT lowering is unreachable — the check-through-write section is serialized per target', async () => {
            // Cycle-2 falsifier, run red against the sequential-only fix: two callers both inspect
            // 8 GiB, the 16 GiB update lands, and the 12 GiB call — validated against its stale
            // read — lands a lowering each call individually forbids. This mock is STATEFUL (inspect
            // reads what update last wrote) and the inspect carries an interleave-widening tick, so
            // an un-serialized implementation genuinely reproduces the race: removing the exclusion
            // makes both callers read 8 GiB and the final limit land at 12 — this spec is the
            // deterministic witness that it cannot.
            let liveLimitBytes = 8 * GIB;

            const updates         = [],
                  dockerRequestFn = async request => {
                      if (request.path.startsWith('/containers/json')) {
                          return {statusCode: 200, headers: {}, body: JSON.stringify([chromaContainer()])};
                      }

                      if (request.path.endsWith('/json')) {
                          // The stale read is captured at inspect ENTRY — that is when Docker reads
                          // the cgroup — and the tick models the daemon round-trip. An un-serialized
                          // implementation lets both callers enter here before either update lands,
                          // so both capture 8 GiB; a serialized one cannot start the second inspect
                          // until the first section completes.
                          const observedLimitBytes = liveLimitBytes;

                          await new Promise(resolve => setTimeout(resolve, 5));
                          return {statusCode: 200, headers: {}, body: JSON.stringify({HostConfig: {Memory: observedLimitBytes}})};
                      }

                      if (request.path.endsWith('/update')) {
                          liveLimitBytes = JSON.parse(request.body).Memory;
                          updates.push(liveLimitBytes);
                          return {statusCode: 200, headers: {}, body: '{"Warnings":[]}'};
                      }

                      throw new Error(`Unexpected Docker request: ${request.method} ${request.path}`);
                  };

            const service = Neo.create(DeploymentRuntimeAccessService, {
                runtimeAccessConfig: {...BASE_CONFIG, ...UPDATE_CONFIG},
                dockerRequestFn
            });

            const [first, second] = await Promise.allSettled([
                service.applyLifecycle({serviceKey: 'chroma', operation: 'update-memory-limit', memoryLimitBytes: 16 * GIB}),
                service.applyLifecycle({serviceKey: 'chroma', operation: 'update-memory-limit', memoryLimitBytes: 12 * GIB})
            ]);

            expect(first.status).toBe('fulfilled');
            expect(second.status).toBe('rejected');
            expect(second.reason.reason).toBe('runtime-memory-limit-not-a-raise');
            // The second caller's refusal is evaluated against the FIRST caller's applied limit —
            // fresh, not stale.
            expect(second.reason.message).toContain(`${16 * GIB}`);

            // The falsifier's own exact assert, inverted into the guarantee: the final live limit is
            // 16 GiB, one update total — a stale-validated lowering never reaches the endpoint.
            expect(liveLimitBytes).toBe(16 * GIB);
            expect(updates).toEqual([16 * GIB]);
        });

        test('an unlimited or unreadable live ceiling refuses — an unknown bound is a refusal, never an absent one', async () => {
            for (const [inspectData, expectation] of [
                [{HostConfig: {Memory: 0}}, 'unlimited ceiling'],
                [{},                        'unreadable from inspect']
            ]) {
                const {service, calls} = createService({
                    config    : UPDATE_CONFIG,
                    containers: [chromaContainer()],
                    inspectData
                });

                const error = await service.applyLifecycle({
                    serviceKey      : 'chroma',
                    operation       : 'update-memory-limit',
                    memoryLimitBytes: 9 * GIB
                }).catch(e => e);

                expect(error.reason, expectation).toBe('runtime-memory-limit-not-a-raise');
                expect(error.message, expectation).toContain(expectation);
                expect(calls.some(call => String(call.path).endsWith('/update')), expectation).toBe(false);
            }
        });
    });
});

/**
 * The guard lives HERE, so its control belongs here. An earlier attempt tested it from the controller
 * spec by replacing `applyLifecycle` with a wrapper that threw before delegating — which exercised the
 * wrapper, not production. @neo-gpt caught it: deleting the real post-resolution check did not change
 * that test's outcome. This drives the REAL method through its REAL container-resolution round-trip and
 * flips authority inside it, which is the only way the production line is on the path.
 */
test.describe('applyLifecycle — authority is rechecked AFTER target resolution (#16766)', () => {
    test('authority moving DURING container resolution refuses before the mutating request', async () => {
        let held = true;

        // Flipping inside the resolution response is what makes this the real window: the container
        // lookup is an awaited round-trip, so a caller that checked before entering has already yielded.
        const {service, calls} = createService({containers: [makeContainer()]}),
              inner            = service.dockerRequestFn;

        service.dockerRequestFn = async request => {
            const result = await inner(request);

            if (request.path.startsWith('/containers/json')) {
                held = false;
            }

            return result;
        };

        await expect(service.applyLifecycle({
            serviceKey     : 'mc-server',
            operation      : 'restart',
            isAuthorityHeld: () => held
        })).rejects.toThrow(/Authority moved while resolving/);

        // The discriminating assertion: resolution happened, the RESTART did not.
        expect(calls.some(call => call.path.startsWith('/containers/json'))).toBe(true);
        expect(calls.some(call => /\/restart/.test(call.path))).toBe(false);
    });

    test('CONTROL — authority held throughout still restarts, so the guard is not simply refusing', async () => {
        const {service, calls} = createService();

        await service.applyLifecycle({
            serviceKey     : 'mc-server',
            operation      : 'restart',
            isAuthorityHeld: () => true
        });

        expect(calls.some(call => /\/restart/.test(call.path))).toBe(true);
    });

    test('a caller with no oracle is unaffected — byte-identical to before', async () => {
        const {service, calls} = createService();

        await service.applyLifecycle({serviceKey: 'mc-server', operation: 'restart'});

        expect(calls.some(call => /\/restart/.test(call.path))).toBe(true);
    });
});
