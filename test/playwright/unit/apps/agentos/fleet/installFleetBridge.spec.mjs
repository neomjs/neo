import {setup} from '../../../../setup.mjs';

const appName = 'InstallFleetBridgeTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}          from '@playwright/test';
import Neo                     from '../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../src/core/_export.mjs';
import {createFleetCapability} from '../../../../../../harness/fleetCapability.mjs';
import {
    FLEET_LOCAL_TRANSPORT_ERRORS,
    installFleetBridge
} from '../../../../../../apps/agentos/fleet/installFleetBridge.mjs';
import {
    createFleetWireOffer,
    createFleetWireProtocolStamp,
    createFleetWireRequest,
    createFleetWireResponse,
    FLEET_CREDENTIAL_METHODS,
    FLEET_WIRE_CAPABILITIES,
    FLEET_WIRE_METHODS,
    FLEET_WIRE_RESPONSE_STATES,
    inspectFleetWireResponse
} from '../../../../../../apps/agentos/config/fleetWireMethods.mjs';

// installFleetBridge is the App-Worker wiring that publishes globalThis.AgentOS.fleet.registryBridge.
// Tests inject a `target` object (instead of the real globalThis) + a stub `fetchImpl`, so the global
// slot + the fetch round-trip are asserted without touching the runtime global or the network.

const fleetUrl   = 'http://127.0.0.1:8083/fleet',
      testBearer = 'A'.repeat(43), // canonical FORMAT (client checks shape only; the server owns real verification)
      okFetch    = () => async () => ({
          json: async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: null})
      });

test.describe('installFleetBridge — App-Worker wiring of the dev-server app<->fleet HTTP transport', () => {
    test('the selected flag: default install is unselected; the injector-style install stamps selected', () => {
        const targetDefault  = {},
              targetSelected = {};

        const bridgeDefault  = installFleetBridge({url: fleetUrl, fetchImpl: okFetch(), target: targetDefault});
        const bridgeSelected = installFleetBridge({url: fleetUrl, fetchImpl: okFetch(), selected: true, target: targetSelected});

        expect(Object.getOwnPropertyDescriptor(bridgeDefault, 'selected')).toMatchObject({enumerable: false, value: false});
        expect(Object.getOwnPropertyDescriptor(bridgeSelected, 'selected')).toMatchObject({enumerable: false, value: true});
    });

    test('publishes AgentOS.fleet.registryBridge with exactly the wire operations', () => {
        const target = {};
        const bridge = installFleetBridge({url: fleetUrl, fetchImpl: okFetch(), target});

        expect(target.AgentOS.fleet.registryBridge).toBe(bridge);
        expect(Object.keys(bridge).sort()).toEqual([...FLEET_WIRE_METHODS].sort());
        expect(bridge.credentialIngress).toBe('worker');
        expect(Object.getOwnPropertyDescriptor(bridge, 'credentialIngress')).toMatchObject({
            enumerable: false,
            value     : 'worker'
        })
    });

    test('accepts one injected packaged-shell sender and forwards the exact method envelope', async () => {
        const
            calls  = [],
            target = {},
            bridge = installFleetBridge({
                credentialIngress: 'shell',
                send             : async request => {
                    calls.push(request);
                    return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: [{id: 'alice'}]})
                },
                target
            }),
            result = await bridge.listAgents({status: 'running'});

        expect(result).toEqual([{id: 'alice'}]);
        expect(calls).toEqual([{method: 'listAgents', params: {status: 'running'}}]);
        expect(target.AgentOS.fleet.registryBridge).toBe(bridge);
        expect(bridge.credentialIngress).toBe('shell');
        expect(Object.keys(bridge).sort()).toEqual([...FLEET_WIRE_METHODS].sort());
        expect(Object.getOwnPropertyDescriptor(bridge, 'credentialIngress')).toMatchObject({
            enumerable: false,
            value     : 'shell'
        })
    });

    test('the packaged App Worker to Electron-main composition keeps protocol metadata main-owned', async () => {
        const
            event          = {sender: 'trusted'},
            ipcRequests    = [],
            serverRequests = [],
            capability     = createFleetCapability({
                bearerToken       : testBearer,
                createWireOffer   : createFleetWireOffer,
                createWireRequest : createFleetWireRequest,
                createWireResponse: createFleetWireResponse,
                credentialMethods : FLEET_CREDENTIAL_METHODS,
                fetchImpl         : async (url, init) => {
                    serverRequests.push({request: JSON.parse(init.body), url});

                    return {
                        json: async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {
                            result: [{id: 'alice'}]
                        })
                    }
                },
                getBrain           : async () => ({fleetPort: 9191, up: true}),
                inspectWireResponse: inspectFleetWireResponse,
                isTrustedSender    : candidate => candidate === event,
                responseStates     : FLEET_WIRE_RESPONSE_STATES,
                wireMethods        : FLEET_WIRE_METHODS
            }),
            bridge = installFleetBridge({
                credentialIngress: 'shell',
                send             : request => {
                    ipcRequests.push(request);
                    return capability.request(event, request)
                },
                target: {}
            });

        await expect(bridge.listAgents()).resolves.toEqual([{id: 'alice'}]);
        expect(ipcRequests).toEqual([{method: 'listAgents', params: undefined}]);
        expect(serverRequests).toEqual([{
            request: createFleetWireRequest('listAgents', undefined),
            url    : 'http://127.0.0.1:9191/fleet'
        }])
    });

    test('rejects mixed direct-browser and injected-shell transport ownership', () => {
        const send = async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: null});

        expect(() => installFleetBridge({send, target: {}, url: fleetUrl})).toThrow(/mutually exclusive/);
        expect(() => installFleetBridge({bearerToken: testBearer, send, target: {}})).toThrow(/mutually exclusive/);
        expect(() => installFleetBridge({credentialIngress: 'shell', target: {}, url: fleetUrl})).toThrow(/requires an injected send/)
    });

    test('defineAgent POSTs a main-owned protocol offer with the bearer + resolves the validated result', async () => {
        const calls     = [];
        const fetchImpl = async (url, init) => {
            calls.push({url, init});
            return {json: async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: {id: 'alice'}})}
        };
        const target = {};

        installFleetBridge({url: 'http://localhost:9191/fleet', bearerToken: testBearer, fetchImpl, target});
        const res = await target.AgentOS.fleet.registryBridge.defineAgent({githubUsername: 'alice', harnessType: 'codex'});

        expect(res).toEqual({id: 'alice'});
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('http://localhost:9191/fleet');
        expect(calls[0].init.method).toBe('POST');
        expect(calls[0].init.headers.Authorization).toBe(`Bearer ${testBearer}`);
        expect(JSON.parse(calls[0].init.body)).toEqual(
            createFleetWireRequest('defineAgent', {githubUsername: 'alice', harnessType: 'codex'})
        )
    });

    test('without a bearer every call rejects LOCALLY — the fail-closed unlaunched state sends no network traffic', async () => {
        const calls     = [];
        const fetchImpl = async (...args) => {
            calls.push(args);
            return {json: async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: null})}
        };
        const target = {};

        installFleetBridge({url: fleetUrl, fetchImpl, target});

        await expect(target.AgentOS.fleet.registryBridge.listAgents()).rejects.toThrow(/fleet bearer not injected/);
        expect(calls, 'no unauthenticated request may leave the worker').toHaveLength(0)
    });

    test('a malformed bearer is refused at install time', () => {
        for (const bad of ['short', `${testBearer}=`, testBearer.slice(0, 42) + '!']) {
            expect(() => installFleetBridge({url: fleetUrl, bearerToken: bad, fetchImpl: okFetch(), target: {}}),
                `bearer ${bad} must be refused`).toThrow(/canonical 32-byte/)
        }
    });

    test('credential-shaped query params on the fleet URL are refused — the secret never rides a URL', () => {
        for (const name of ['bearer', 'bearerToken', 'fleetBearer', 'token', 'authorization']) {
            expect(() => installFleetBridge({url: `http://127.0.0.1:8083/fleet?${name}=abc`, fetchImpl: okFetch(), target: {}}),
                `param ${name} must be refused`).toThrow(/never a query param/)
        }
    });

    test('is additive — preserves an existing AgentOS.neuralLink slot', () => {
        const target = {AgentOS: {neuralLink: {connectionBridge: {}}}};

        installFleetBridge({url: fleetUrl, fetchImpl: okFetch(), target});
        expect(target.AgentOS.neuralLink.connectionBridge).toBeDefined();
        expect(target.AgentOS.fleet.registryBridge).toBeDefined()
    });

    test('is idempotent — a second install re-publishes without throwing', () => {
        const target = {};

        installFleetBridge({url: fleetUrl, fetchImpl: okFetch(), target});
        const second = installFleetBridge({url: fleetUrl, fetchImpl: okFetch(), target});
        expect(target.AgentOS.fleet.registryBridge).toBe(second)
    });

    test('malformed, version-skewed, and capability-skewed replies never become pane data', async () => {
        const responses = [
            {ok: true, state: 'invented', protocol: createFleetWireProtocolStamp(), result: []},
            {ok: true, state: FLEET_WIRE_RESPONSE_STATES.ok, protocol: createFleetWireProtocolStamp()},
            createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {
                protocol: createFleetWireProtocolStamp(2),
                result  : []
            }),
            createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {
                protocol: createFleetWireProtocolStamp(1, [...FLEET_WIRE_CAPABILITIES, 'server-only']),
                result  : []
            }),
            {
                ...createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: []}),
                protocol: {...createFleetWireProtocolStamp(), ownerPrincipal: 'must-never-cross'}
            }
        ];

        for (const response of responses) {
            const bridge = installFleetBridge({
                credentialIngress: 'shell',
                send             : async () => response,
                target           : {}
            });

            await expect(bridge.listAgents()).rejects.toThrow(/malformed|unoffered/)
        }
    });

    test('transport and JSON-parser rejection text is never relayed into the pane', async () => {
        const secret  = 'raw-upstream-transport-secret';
        const bridges = [
            installFleetBridge({
                credentialIngress: 'shell',
                send             : async () => { throw new Error(secret) },
                target           : {}
            }),
            installFleetBridge({
                bearerToken: testBearer,
                fetchImpl  : async () => ({json: async () => { throw new Error(secret) }}),
                target     : {},
                url        : fleetUrl
            })
        ];

        for (const bridge of bridges) {
            await expect(bridge.listAgents()).rejects.toThrow('fleet: request transport failed');
            await expect(bridge.listAgents()).rejects.not.toThrow(secret)
        }
    });

    test('known local launch-state errors retain their bounded remediation', async () => {
        const bridge = installFleetBridge({
            credentialIngress: 'shell',
            send             : async () => { throw new Error(FLEET_LOCAL_TRANSPORT_ERRORS.noLiveWindow) },
            target           : {}
        });

        await expect(bridge.listAgents()).rejects.toThrow(FLEET_LOCAL_TRANSPORT_ERRORS.noLiveWindow)
    });

    test('fails loud before publishing when the fleet endpoint is missing or invalid', () => {
        const install = url => () => installFleetBridge({url, fetchImpl: okFetch(), target: {}});

        expect(install()).toThrow('installFleetBridge requires an absolute loopback HTTP(S) fleet URL');
        expect(install('')).toThrow('installFleetBridge requires an absolute loopback HTTP(S) fleet URL');
        expect(install('not-a-url')).toThrow('installFleetBridge requires an absolute loopback HTTP(S) fleet URL');
        expect(install('file:///tmp/fleet')).toThrow('installFleetBridge requires an absolute loopback HTTP(S) fleet URL');
        expect(install('https://example.com/fleet')).toThrow('installFleetBridge requires an absolute loopback HTTP(S) fleet URL')
    });
});
