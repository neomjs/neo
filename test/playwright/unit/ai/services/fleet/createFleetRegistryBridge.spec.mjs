import {setup} from '../../../../setup.mjs';

const appName = 'FleetClientBridgeTest';

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

import {test, expect}              from '@playwright/test';
import Neo                         from '../../../../../../src/Neo.mjs';
import * as core                   from '../../../../../../src/core/_export.mjs';
import {createFleetRegistryBridge} from '../../../../../../src/ai/fleet/createFleetRegistryBridge.mjs';
import {FLEET_WIRE_METHODS}        from '../../../../../../src/ai/fleet/fleetWireMethods.mjs';

// createFleetRegistryBridge is the browser-side (App-Worker) factory: given a transport `send`, it
// returns the object the agentos pane resolves at globalThis.AgentOS.fleet.registryBridge. No live
// socket is needed — the transport `send` is injected as a recording/stub async fn, so the factory's
// contract (method surface + envelope unwrapping) is exercised in isolation.

test.describe('createFleetRegistryBridge — the browser-side pane bridge factory', () => {
    test('exposes exactly the wire-allowlisted operations — no more, no less', () => {
        const bridge = createFleetRegistryBridge(async () => ({ok: true, result: null}));
        expect(Object.keys(bridge).sort()).toEqual([...FLEET_WIRE_METHODS].sort());
    });

    test('defineAgent forwards {method, params} through send + resolves the envelope result', async () => {
        const sent   = [];
        const bridge = createFleetRegistryBridge(async req => { sent.push(req); return {ok: true, result: {id: 'alice'}}; });
        const res    = await bridge.defineAgent({githubUsername: 'alice', harnessType: 'codex'});

        expect(sent).toEqual([{method: 'defineAgent', params: {githubUsername: 'alice', harnessType: 'codex'}}]);
        expect(res).toEqual({id: 'alice'});
    });

    test('a lifecycle op forwards its id as params', async () => {
        const sent   = [];
        const bridge = createFleetRegistryBridge(async req => { sent.push(req); return {ok: true, result: {id: 'alice', state: 'running'}}; });

        await bridge.startAgent('alice');
        expect(sent).toEqual([{method: 'startAgent', params: 'alice'}]);
    });

    test('an {ok:false} envelope rejects with the transport error (fail-closed for the pane)', async () => {
        const bridge = createFleetRegistryBridge(async () => ({ok: false, error: 'spawn failed'}));
        await expect(bridge.startAgent('alice')).rejects.toThrow('spawn failed');
    });

    test('requires a transport send function', () => {
        expect(() => createFleetRegistryBridge()).toThrow('send(request) function is required');
        expect(() => createFleetRegistryBridge({})).toThrow();
    });
});
