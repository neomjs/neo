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

const okFetch = () => async () => ({json: async () => ({ok: true, result: null})});

test.describe('installFleetBridge — App-Worker wiring of the dev-server app<->fleet HTTP transport', () => {
    test('publishes AgentOS.fleet.registryBridge with exactly the wire operations', () => {
        const target = {};
        const bridge = installFleetBridge({fetchImpl: okFetch(), target});

        expect(target.AgentOS.fleet.registryBridge).toBe(bridge);
        expect(Object.keys(bridge).sort()).toEqual([...FLEET_WIRE_METHODS].sort())
    });

    test('defineAgent POSTs {method, params} to the fleet URL + resolves the envelope result', async () => {
        const calls     = [];
        const fetchImpl = async (url, init) => { calls.push({url, init}); return {json: async () => ({ok: true, result: {id: 'alice'}})} };
        const target    = {};

        installFleetBridge({url: 'http://x/fleet', fetchImpl, target});
        const res = await target.AgentOS.fleet.registryBridge.defineAgent({githubUsername: 'alice', harnessType: 'codex'});

        expect(res).toEqual({id: 'alice'});
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('http://x/fleet');
        expect(calls[0].init.method).toBe('POST');
        expect(JSON.parse(calls[0].init.body)).toEqual({method: 'defineAgent', params: {githubUsername: 'alice', harnessType: 'codex'}})
    });

    test('is additive — preserves an existing AgentOS.neuralLink slot', () => {
        const target = {AgentOS: {neuralLink: {connectionBridge: {}}}};

        installFleetBridge({fetchImpl: okFetch(), target});
        expect(target.AgentOS.neuralLink.connectionBridge).toBeDefined();
        expect(target.AgentOS.fleet.registryBridge).toBeDefined()
    });

    test('is idempotent — a second install re-publishes without throwing', () => {
        const target = {};

        installFleetBridge({fetchImpl: okFetch(), target});
        const second = installFleetBridge({fetchImpl: okFetch(), target});
        expect(target.AgentOS.fleet.registryBridge).toBe(second)
    });
});
