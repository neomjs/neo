import {expect, test} from '@playwright/test';
import {
    createFleetCapability,
    projectPublicAgentIntent,
    projectPublicCredentialIntent
} from '../../../../harness/fleetCapability.mjs';
import {FLEET_CREDENTIAL_METHODS, FLEET_WIRE_METHODS} from '../../../../ai/services/fleet/fleetWireMethods.mjs';

const bearerToken = 'B'.repeat(43);

const createCapability = options => createFleetCapability({
    bearerToken,
    credentialMethods: FLEET_CREDENTIAL_METHODS,
    wireMethods      : FLEET_WIRE_METHODS,
    ...options
});

test.describe('harness Fleet capability', () => {
    test('requires credential methods inside the wire allowlist and snapshots both inputs', async () => {
        expect(() => createCapability({
            credentialMethods: ['defineAgent', 'ghostCredentialVerb'],
            getBrain         : async () => ({fleetPort: 8083, up: true}),
            isTrustedSender  : () => true,
            wireMethods      : ['defineAgent']
        })).toThrow(/canonical method allowlists/);

        const
            credentialMethods = [],
            wireMethods       = ['listAgents'],
            capability        = createFleetCapability({
                bearerToken,
                credentialMethods,
                fetchImpl      : async () => ({json: async () => ({ok: true, result: []})}),
                getBrain       : async () => ({fleetPort: 8083, up: true}),
                isTrustedSender: () => true,
                wireMethods
            });

        credentialMethods.push('listAgents');
        wireMethods.length = 0;

        await expect(capability.request({}, {method: 'listAgents', params: {}})).resolves.toEqual({ok: true, result: []})
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

        await expect(capability.request({sender: 'untrusted'}, request)).resolves.toEqual({
            error: 'fleet: untrusted shell sender',
            ok   : false
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
        })).resolves.toEqual({
            error: "fleet: shell credential ingress unavailable for 'defineAgent'",
            ok   : false
        });
        await expect(capability.request({}, {
            method: 'connectTenant',
            params: {tenantUrl: 'https://tenant.example.com'}
        })).resolves.toEqual({
            error: "fleet: shell credential ingress unavailable for 'connectTenant'",
            ok   : false
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
                    return {json: async () => ({ok: true, result: {id: 'agent-alice'}})}
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

        expect(result).toEqual({ok: true, result: {id: 'agent-alice'}});
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
            }
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
                    return {json: async () => ({ok: true, result: {status: 'connected'}})}
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

        expect(result).toEqual({ok: true, result: {status: 'connected'}});
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
            }
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
        })).resolves.toEqual({
            error: "fleet: shell credential ingress canceled for 'defineAgent'",
            ok   : false
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
                        json: async () => ({ok: false, error: `upstream reflected ${reflectedSecret}`})
                    }),
                    getBrain       : async () => ({fleetPort: 8083, up: true}),
                    isTrustedSender: () => true
                }),
                result = await capability.request({}, {
                    method: 'defineAgent',
                    params: {githubUsername: 'alice', harnessType: 'codex'}
                });

            expect(result).toEqual({error: 'fleet: secret-bearing response rejected', ok: false});
            expect(JSON.stringify(result)).not.toContain(reflectedSecret)
        }
    })
});
