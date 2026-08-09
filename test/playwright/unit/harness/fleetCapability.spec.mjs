import {expect, test} from '@playwright/test';
import {
    createFleetCapability,
    projectPublicAgentIntent,
    projectPublicCredentialIntent
} from '../../../../harness/fleetCapability.mjs';
import {
    createFleetWireOffer,
    createFleetWireRequest,
    createFleetWireResponse,
    FLEET_CREDENTIAL_METHODS,
    FLEET_WIRE_METHODS,
    FLEET_WIRE_RESPONSE_STATES,
    inspectFleetWireResponse
} from '../../../../ai/services/fleet/fleetWireMethods.mjs';

const bearerToken = 'B'.repeat(43);

const createCapability = options => createFleetCapability({
    bearerToken,
    createWireOffer    : createFleetWireOffer,
    createWireRequest  : createFleetWireRequest,
    createWireResponse : createFleetWireResponse,
    credentialMethods  : FLEET_CREDENTIAL_METHODS,
    inspectWireResponse: inspectFleetWireResponse,
    responseStates     : FLEET_WIRE_RESPONSE_STATES,
    wireMethods        : FLEET_WIRE_METHODS,
    ...options
});

test.describe('harness Fleet capability', () => {
    test('requires credential methods inside the wire allowlist and snapshots both inputs', async () => {
        expect(() => createCapability({
            credentialMethods: ['defineAgent', 'ghostCredentialVerb'],
            getBrain         : async () => ({fleetPort: 8083, up: true}),
            isTrustedSender  : () => true,
            wireMethods      : ['defineAgent']
        })).toThrow(/canonical wire contract/);

        const
            credentialMethods = [],
            wireMethods       = ['listAgents'],
            capability        = createCapability({
                credentialMethods,
                fetchImpl      : async () => ({
                    json: async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: []})
                }),
                getBrain       : async () => ({fleetPort: 8083, up: true}),
                isTrustedSender: () => true,
                wireMethods
            });

        credentialMethods.push('listAgents');
        wireMethods.length = 0;

        await expect(capability.request({}, {method: 'listAgents', params: {}})).resolves.toMatchObject({
            ok    : true,
            result: [],
            state : FLEET_WIRE_RESPONSE_STATES.ok
        })
    });

    test('checks sender trust before inspecting the request or touching credential, readiness, and network seams', async () => {
        const
            calls   = {brain: 0, credential: 0, fetch: 0},
            request = new Proxy({}, {
                get() {
                    throw new Error('request inspected before sender trust')
                },
                ownKeys() {
                    throw new Error('request enumerated before sender trust')
                }
            }),
            capability = createCapability({
                bearerToken,
                credentialProvider: async () => { calls.credential++; return 'never' },
                fetchImpl         : async () => { calls.fetch++; throw new Error('network must stay dark') },
                getBrain          : async () => { calls.brain++; return {fleetPort: 8083, up: true} },
                isTrustedSender   : () => false
            });

        await expect(capability.request({sender: 'untrusted'}, request)).resolves.toMatchObject({
            error: 'fleet: untrusted shell sender',
            ok   : false,
            state: FLEET_WIRE_RESPONSE_STATES.refused
        });
        expect(calls).toEqual({brain: 0, credential: 0, fetch: 0})
    });

    test('rejects malformed, over-wide, and non-allowlisted requests before credential, readiness, or network access', async () => {
        const
            calls      = {brain: 0, credential: 0, fetch: 0},
            capability = createCapability({
                bearerToken,
                credentialProvider: async () => { calls.credential++; return 'never' },
                fetchImpl         : async () => { calls.fetch++; throw new Error('network must stay dark') },
                getBrain          : async () => { calls.brain++; return {fleetPort: 8083, up: true} },
                isTrustedSender   : () => true
            }),
            invalidRequests = [
                null,
                [],
                {method: 42},
                {method: 'getManager'},
                {extra: true, method: 'listAgents'},
                {method: 'listAgents', protocol: createFleetWireOffer()},
                {method: 'defineAgent', params: {githubUsername: '', harnessType: 'codex'}},
                {method: 'connectTenant', params: {tenantUrl: ''}}
            ];

        for (const request of invalidRequests) {
            const result = await capability.request({sender: 'trusted'}, request);

            expect(result.ok, JSON.stringify(request)).toBe(false)
        }

        expect(calls).toEqual({brain: 0, credential: 0, fetch: 0})
    });

    test('rejects credential verbs locally when the shell has no credential provider', async () => {
        const
            calls      = {brain: 0, fetch: 0},
            capability = createCapability({
                bearerToken,
                fetchImpl      : async () => { calls.fetch++; throw new Error('network must stay dark') },
                getBrain       : async () => { calls.brain++; return {fleetPort: 8083, up: true} },
                isTrustedSender: () => true
            });

        await expect(capability.request({}, {
            method: 'defineAgent',
            params: {githubUsername: 'alice', harnessType: 'codex'}
        })).resolves.toMatchObject({
            error: "fleet: shell credential ingress unavailable for 'defineAgent'",
            ok   : false,
            state: FLEET_WIRE_RESPONSE_STATES.refused
        });
        await expect(capability.request({}, {
            method: 'connectTenant',
            params: {tenantUrl: 'https://tenant.example.com'}
        })).resolves.toMatchObject({
            error: "fleet: shell credential ingress unavailable for 'connectTenant'",
            ok   : false,
            state: FLEET_WIRE_RESPONSE_STATES.refused
        });

        expect(calls).toEqual({brain: 0, fetch: 0})
    });

    test('projects defineAgent onto public intent before obtaining and attaching the main-owned credential', async () => {
        const
            event              = {sender: 'trusted'},
            mainCredential     = 'github_pat_main_owned',
            rendererCredential = 'github_pat_renderer_smuggled',
            calls              = {credential: [], fetch: []},
            capability         = createCapability({
                bearerToken,
                credentialProvider: async input => { calls.credential.push(input); return mainCredential },
                fetchImpl         : async (url, init) => {
                    calls.fetch.push({init, url});
                    return {
                        json: async () => createFleetWireResponse(
                            FLEET_WIRE_RESPONSE_STATES.ok,
                            {result: {id: 'agent-alice'}}
                        )
                    }
                },
                getBrain       : async () => ({fleetPort: 9191, up: true}),
                isTrustedSender: candidate => candidate === event
            }),
            result = await capability.request(event, {
                method: 'defineAgent',
                params: {
                    args          : ['--unsafe'],
                    command       : '/tmp/renderer-command',
                    credential    : rendererCredential,
                    env           : {TOKEN: rendererCredential},
                    executablePath: '/tmp/renderer-binary',
                    githubUsername: ' alice ',
                    harnessType   : ' codex ',
                    id            : ' agent-alice ',
                    viewerIdentity: '@forged'
                }
            });

        expect(result).toMatchObject({
            ok    : true,
            result: {id: 'agent-alice'},
            state : FLEET_WIRE_RESPONSE_STATES.ok
        });
        expect(calls.credential).toEqual([{
            event,
            intent: {
                githubUsername: 'alice',
                harnessType   : 'codex',
                id            : 'agent-alice'
            },
            method: 'defineAgent'
        }]);
        expect(calls.fetch).toHaveLength(1);
        expect(calls.fetch[0].url).toBe('http://127.0.0.1:9191/fleet');
        expect(calls.fetch[0].init.headers.Authorization).toBe(`Bearer ${bearerToken}`);

        const outbound = JSON.parse(calls.fetch[0].init.body);

        expect(outbound).toEqual({
            method: 'defineAgent',
            params: {
                credential    : mainCredential,
                githubUsername: 'alice',
                harnessType   : 'codex',
                id            : 'agent-alice'
            },
            protocol: createFleetWireOffer()
        });
        expect(JSON.stringify(outbound)).not.toContain(rendererCredential);
        expect(JSON.stringify(outbound)).not.toContain('renderer-command');
        expect(projectPublicAgentIntent({
            githubUsername: ' alice ',
            harnessType   : ' codex ',
            id            : ' agent-alice '
        })).toEqual({
            githubUsername: 'alice',
            harnessType   : 'codex',
            id            : 'agent-alice'
        })
    });

    test('projects connectTenant onto tenantUrl only before attaching the provider credential', async () => {
        const
            event          = {sender: 'trusted'},
            mainCredential = 'tenant_pat_main_owned',
            calls          = {credential: [], fetch: []},
            capability     = createCapability({
                bearerToken,
                credentialProvider: async input => { calls.credential.push(input); return mainCredential },
                fetchImpl         : async (url, init) => {
                    calls.fetch.push({init, url});
                    return {
                        json: async () => createFleetWireResponse(
                            FLEET_WIRE_RESPONSE_STATES.ok,
                            {result: {status: 'connected'}}
                        )
                    }
                },
                getBrain       : async () => ({fleetPort: 8083, up: true}),
                isTrustedSender: candidate => candidate === event
            }),
            result = await capability.request(event, {
                method: 'connectTenant',
                params: {
                    credential    : 'tenant_pat_renderer_smuggled',
                    tenantUrl     : ' https://tenant.example.com/agentos/ ',
                    viewerIdentity: '@forged'
                }
            });

        expect(result).toMatchObject({
            ok    : true,
            result: {status: 'connected'},
            state : FLEET_WIRE_RESPONSE_STATES.ok
        });
        expect(calls.credential).toEqual([{
            event,
            intent: {tenantUrl: 'https://tenant.example.com/agentos/'},
            method: 'connectTenant'
        }]);
        expect(calls.fetch).toHaveLength(1);
        expect(JSON.parse(calls.fetch[0].init.body)).toEqual({
            method: 'connectTenant',
            params: {
                credential: mainCredential,
                tenantUrl : 'https://tenant.example.com/agentos/'
            },
            protocol: createFleetWireOffer()
        });
        expect(projectPublicCredentialIntent('connectTenant', {
            credential: 'discard-me',
            tenantUrl : ' https://tenant.example.com/agentos/ '
        })).toEqual({tenantUrl: 'https://tenant.example.com/agentos/'})
    });

    test('rejects a canceled credential before Brain readiness and network access', async () => {
        const
            calls      = {brain: 0, fetch: 0},
            capability = createCapability({
                bearerToken,
                credentialProvider: async () => null,
                fetchImpl         : async () => { calls.fetch++; throw new Error('network must stay dark') },
                getBrain          : async () => { calls.brain++; return {fleetPort: 8083, up: true} },
                isTrustedSender   : () => true
            });

        await expect(capability.request({}, {
            method: 'defineAgent',
            params: {githubUsername: 'alice', harnessType: 'codex'}
        })).resolves.toMatchObject({
            error: "fleet: shell credential ingress canceled for 'defineAgent'",
            ok   : false,
            state: FLEET_WIRE_RESPONSE_STATES.refused
        });
        expect(calls).toEqual({brain: 0, fetch: 0})
    });

    test('censuses both the Fleet bearer and provider credential out of response envelopes', async () => {
        const mainCredential = 'github_pat_main_owned';

        for (const reflectedSecret of [bearerToken, mainCredential]) {
            const capability = createCapability({
                    bearerToken,
                    credentialProvider: async () => mainCredential,
                    fetchImpl         : async () => ({
                        json: async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.operationFailed, {
                            error: `upstream reflected ${reflectedSecret}`
                        })
                    }),
                    getBrain       : async () => ({fleetPort: 8083, up: true}),
                    isTrustedSender: () => true
                }),
                result = await capability.request({}, {
                    method: 'defineAgent',
                    params: {githubUsername: 'alice', harnessType: 'codex'}
                });

            expect(result).toMatchObject({
                error: 'fleet: secret-bearing response rejected',
                ok   : false,
                state: FLEET_WIRE_RESPONSE_STATES.refused
            });
            expect(JSON.stringify(result)).not.toContain(reflectedSecret)
        }
    });

    test('censuses escaped provider credentials from failure text and nested success data', async () => {
        const credentials = [
            'github_pat_quote_"_value',
            'github_pat_backslash_\\_value',
            'github_pat_newline_\n_value',
            '  github_pat_trimmed_value  '
        ];

        for (const credential of credentials) {
            for (const reflection of new Set([credential, credential.trim()])) {
                for (const envelope of [
                    createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.operationFailed, {
                        error: `upstream reflected ${reflection}`
                    }),
                    createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {
                        result: {nested: {credential: reflection}}
                    }),
                    createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {
                        result: {nested: {[reflection]: 'reflected key'}}
                    })
                ]) {
                    const capability = createCapability({
                            bearerToken,
                            credentialProvider: async () => credential,
                            fetchImpl         : async () => ({json: async () => envelope}),
                            getBrain          : async () => ({fleetPort: 8083, up: true}),
                            isTrustedSender   : () => true
                        }),
                        result = await capability.request({}, {
                            method: 'defineAgent',
                            params: {githubUsername: 'alice', harnessType: 'codex'}
                        });

                    expect(result).toEqual(createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
                        error: 'fleet: secret-bearing response rejected'
                    }))
                }
            }
        }
    });

    test('a skewed or malformed server reply is returned only as a closed local refusal', async () => {
        const replies = [
            {ok: true, result: []},
            {ok: true, state: FLEET_WIRE_RESPONSE_STATES.ok, protocol: createFleetWireResponse(
                FLEET_WIRE_RESPONSE_STATES.ok,
                {result: []}
            ).protocol},
            createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {
                protocol: {version: 2, capabilities: createFleetWireOffer().capabilities},
                result  : []
            }),
            {
                ...createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: []}),
                protocol: {
                    ...createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: []}).protocol,
                    bearer: 'must-never-cross'
                }
            }
        ];

        for (const reply of replies) {
            const capability = createCapability({
                fetchImpl      : async () => ({json: async () => reply}),
                getBrain       : async () => ({fleetPort: 8083, up: true}),
                isTrustedSender: () => true
            });
            const result = await capability.request({}, {method: 'listAgents'});

            expect(result).toMatchObject({ok: false, state: FLEET_WIRE_RESPONSE_STATES.refused});
            expect(result.error).toMatch(/malformed|unoffered/)
        }
    })
});
