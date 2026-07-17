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

const fleetUrl = 'http://127.0.0.1:8083/fleet',
      okFetch  = () => async () => ({json: async () => ({ok: true, result: null})});

test.describe('installFleetBridge — App-Worker wiring of the dev-server app<->fleet HTTP transport', () => {
    test('publishes AgentOS.fleet.registryBridge with exactly the wire operations', () => {
        const target = {};
        const bridge = installFleetBridge({url: fleetUrl, fetchImpl: okFetch(), target});

        expect(target.AgentOS.fleet.registryBridge).toBe(bridge);
        expect(Object.keys(bridge).sort()).toEqual([...FLEET_WIRE_METHODS].sort())
    });

    test('defineAgent POSTs {method, params} to the fleet URL + resolves the envelope result', async () => {
        const calls     = [];
        const fetchImpl = async (url, init) => { calls.push({url, init}); return {json: async () => ({ok: true, result: {id: 'alice'}})} };
        const target    = {};

        installFleetBridge({url: 'http://localhost:9191/fleet', fetchImpl, target});
        const res = await target.AgentOS.fleet.registryBridge.defineAgent({githubUsername: 'alice', harnessType: 'codex'});

        expect(res).toEqual({id: 'alice'});
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('http://localhost:9191/fleet');
        expect(calls[0].init.method).toBe('POST');
        expect(JSON.parse(calls[0].init.body)).toEqual({method: 'defineAgent', params: {githubUsername: 'alice', harnessType: 'codex'}})
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
