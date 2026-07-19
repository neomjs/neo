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

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../../../src/Neo.mjs';
import * as core            from '../../../../../../src/core/_export.mjs';
import {installFleetBridge} from '../../../../../../src/ai/fleet/installFleetBridge.mjs';
import {FLEET_WIRE_METHODS} from '../../../../../../src/ai/fleet/fleetWireMethods.mjs';

// installFleetBridge is the App-Worker wiring that publishes globalThis.AgentOS.fleet.registryBridge.
// Tests inject a `target` object (instead of the real globalThis) + a stub `fetchImpl`, so the global
// slot + the fetch round-trip are asserted without touching the runtime global or the network.

const fleetUrl   = 'http://127.0.0.1:8083/fleet',
      testBearer = 'A'.repeat(43), // canonical FORMAT (client checks shape only; the server owns real verification)
      okFetch    = () => async () => ({json: async () => ({ok: true, result: null})});

test.describe('installFleetBridge — App-Worker wiring of the dev-server app<->fleet HTTP transport', () => {
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
                    return {ok: true, result: [{id: 'alice'}]}
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

    test('rejects mixed direct-browser and injected-shell transport ownership', () => {
        const send = async () => ({ok: true, result: null});

        expect(() => installFleetBridge({send, target: {}, url: fleetUrl})).toThrow(/mutually exclusive/);
        expect(() => installFleetBridge({bearerToken: testBearer, send, target: {}})).toThrow(/mutually exclusive/);
        expect(() => installFleetBridge({credentialIngress: 'shell', target: {}, url: fleetUrl})).toThrow(/requires an injected send/)
    });

    test('defineAgent POSTs {method, params} with the Authorization bearer + resolves the envelope result', async () => {
        const calls     = [];
        const fetchImpl = async (url, init) => { calls.push({url, init}); return {json: async () => ({ok: true, result: {id: 'alice'}})} };
        const target    = {};

        installFleetBridge({url: 'http://localhost:9191/fleet', bearerToken: testBearer, fetchImpl, target});
        const res = await target.AgentOS.fleet.registryBridge.defineAgent({githubUsername: 'alice', harnessType: 'codex'});

        expect(res).toEqual({id: 'alice'});
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('http://localhost:9191/fleet');
        expect(calls[0].init.method).toBe('POST');
        expect(calls[0].init.headers.Authorization).toBe(`Bearer ${testBearer}`);
        expect(JSON.parse(calls[0].init.body)).toEqual({method: 'defineAgent', params: {githubUsername: 'alice', harnessType: 'codex'}})
    });

    test('without a bearer every call rejects LOCALLY — the fail-closed unlaunched state sends no network traffic', async () => {
        const calls     = [];
        const fetchImpl = async (...args) => { calls.push(args); return {json: async () => ({ok: true, result: null})} };
        const target    = {};

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

    test('fails loud before publishing when the fleet endpoint is missing or invalid', () => {
        const install = url => () => installFleetBridge({url, fetchImpl: okFetch(), target: {}});

        expect(install()).toThrow('installFleetBridge requires an absolute loopback HTTP(S) fleet URL');
        expect(install('')).toThrow('installFleetBridge requires an absolute loopback HTTP(S) fleet URL');
        expect(install('not-a-url')).toThrow('installFleetBridge requires an absolute loopback HTTP(S) fleet URL');
        expect(install('file:///tmp/fleet')).toThrow('installFleetBridge requires an absolute loopback HTTP(S) fleet URL');
        expect(install('https://example.com/fleet')).toThrow('installFleetBridge requires an absolute loopback HTTP(S) fleet URL')
    });
});
