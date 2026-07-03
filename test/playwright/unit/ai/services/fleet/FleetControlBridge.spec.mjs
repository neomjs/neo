import {setup} from '../../../../setup.mjs';

const appName = 'FleetControlBridgeTest';

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
import FleetControlBridge   from '../../../../../../ai/services/fleet/FleetControlBridge.mjs';
import FleetManager         from '../../../../../../ai/services/fleet/FleetManager.mjs';
import FleetRegistryService from '../../../../../../ai/services/fleet/FleetRegistryService.mjs';

// FleetControlBridge is a singleton — the default export is the instance. Its `registry` / `manager`
// are plain injectable-seam fields (the sibling FleetManager.lifecycleService precedent), so each test
// swaps in a recording stub and afterEach resets them to null — the shared singleton never leaks state
// between tests, and no real registry/manager (which would touch disk / spawn processes) is ever hit.

test.describe('Neo.ai.services.fleet.FleetControlBridge — capability allowlist over the two Brain singletons', () => {
    let calls, registryStub, managerStub;

    test.beforeEach(() => {
        calls = [];

        registryStub = {
            defineAgent: def => { calls.push(['defineAgent', def]); const {credential, ...pub} = def; return {id: def.id || def.githubUsername, ...pub}; },
            listAgents : ()  => { calls.push(['listAgents']);       return [{id: 'alice'}, {id: 'bob'}]; },
            getAgent   : id  => { calls.push(['getAgent', id]);     return {id}; }
        };

        managerStub = {
            startAgent     : async id => { calls.push(['startAgent', id]);   return {id, state: 'running'}; },
            stopAgent      : async id => { calls.push(['stopAgent', id]);    return {success: true, id, state: 'stopped'}; },
            restartAgent   : async id => { calls.push(['restartAgent', id]); return {id, state: 'running'}; },
            removeAgent    : async id => { calls.push(['removeAgent', id]);  return {success: true, id}; },
            fleetRepoStatus: ()       => { calls.push(['fleetRepoStatus']);  return [{id: 'alice', repo: 'clean'}]; },
            setRepo        : payload  => { calls.push(['setRepo', payload]);   return {id: payload.id, metadata: {repo: payload}}; },
            setAvatar      : payload  => { calls.push(['setAvatar', payload]); return {id: payload.id, metadata: {avatarUrl: payload.avatarUrl}}; }
        };

        FleetControlBridge.registry = registryStub;
        FleetControlBridge.manager  = managerStub;
    });

    test.afterEach(() => {
        FleetControlBridge.registry = null;
        FleetControlBridge.manager  = null;
    });

    // ---- delegation: the registry (define / list / get) half ----

    test('defineAgent forwards the definition verbatim to the registry and returns its public shape', () => {
        const def    = {githubUsername: 'alice', harnessType: 'codex', credential: 'ghp_secret'},
              result = FleetControlBridge.defineAgent(def);

        expect(calls).toEqual([['defineAgent', def]]);
        expect(result.githubUsername).toBe('alice');
        // the bridge adds no credential path of its own — it returns exactly the registry's public API result
        expect(result.credential).toBeUndefined();
    });

    test('listAgents delegates to the registry roster', () => {
        expect(FleetControlBridge.listAgents()).toEqual([{id: 'alice'}, {id: 'bob'}]);
        expect(calls).toEqual([['listAgents']]);
    });

    test('getAgent delegates by id', () => {
        expect(FleetControlBridge.getAgent('alice')).toEqual({id: 'alice'});
        expect(calls).toEqual([['getAgent', 'alice']]);
    });

    // ---- delegation: the lifecycle (start / stop / restart / remove / status) half ----

    test('startAgent delegates to the manager and resolves its lifecycle status', async () => {
        await expect(FleetControlBridge.startAgent('alice')).resolves.toEqual({id: 'alice', state: 'running'});
        expect(calls).toEqual([['startAgent', 'alice']]);
    });

    test('stopAgent delegates to the manager', async () => {
        await expect(FleetControlBridge.stopAgent('alice')).resolves.toEqual({success: true, id: 'alice', state: 'stopped'});
        expect(calls).toEqual([['stopAgent', 'alice']]);
    });

    test('restartAgent delegates to the manager', async () => {
        await expect(FleetControlBridge.restartAgent('alice')).resolves.toEqual({id: 'alice', state: 'running'});
        expect(calls).toEqual([['restartAgent', 'alice']]);
    });

    test('removeAgent delegates to the manager compose (stop + deregister)', async () => {
        await expect(FleetControlBridge.removeAgent('alice')).resolves.toEqual({success: true, id: 'alice'});
        expect(calls).toEqual([['removeAgent', 'alice']]);
    });

    test('setRepo delegates the single payload to the manager definition-update (fleet authority)', () => {
        const payload = {id: 'alice', cloneUrl: 'https://github.com/x/y.git', repoSlug: 'x/y'};
        expect(FleetControlBridge.setRepo(payload)).toEqual({id: 'alice', metadata: {repo: payload}});
        expect(calls).toEqual([['setRepo', payload]]);
    });

    test('setAvatar delegates the single payload to the manager definition-update (fleet authority)', () => {
        const payload = {id: 'alice', avatarUrl: 'https://cdn/x.png'};
        expect(FleetControlBridge.setAvatar(payload)).toEqual({id: 'alice', metadata: {avatarUrl: 'https://cdn/x.png'}});
        expect(calls).toEqual([['setAvatar', payload]]);
    });

    test('fleetStatus delegates to the manager repo-status aggregator', () => {
        expect(FleetControlBridge.fleetStatus()).toEqual([{id: 'alice', repo: 'clean'}]);
        expect(calls).toEqual([['fleetRepoStatus']]);
    });

    // ---- the security boundary: the allowlist OMITS the Brain-internal secret paths ----

    test('the surface exposes NO Brain-internal secret accessor (the capability allowlist)', () => {
        // A transport serves only the bridge's own methods, so these secret paths must not be reachable
        // on the surface — a forged pane request can then never decrypt a PAT or forge a bridge token.
        for (const secret of ['resolveCredential', 'mintBridgeToken', 'getSigningKey', 'getBridgePublicKey', 'getKey']) {
            expect(typeof FleetControlBridge[secret]).toBe('undefined');
        }
    });

    // ---- default resolution when no stub is injected ----

    test('getRegistry / getManager resolve to the Brain singletons when not injected', () => {
        FleetControlBridge.registry = null;
        FleetControlBridge.manager  = null;
        expect(FleetControlBridge.getRegistry()).toBe(FleetRegistryService);
        expect(FleetControlBridge.getManager()).toBe(FleetManager);
    });
});
