import {setup} from '../../../../setup.mjs';

const appName = 'FleetDispatchTest';

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

import {test, expect}                             from '@playwright/test';
import Neo                                        from '../../../../../../src/Neo.mjs';
import * as core                                  from '../../../../../../src/core/_export.mjs';
import {dispatchFleetRequest, FLEET_WIRE_METHODS} from '../../../../../../ai/services/fleet/dispatchFleetRequest.mjs';

// dispatchFleetRequest is the pure app↔fleet wire choke-point: it takes a {method, params} request,
// enforces the wire-level allowlist, forwards to an injected bridge stub, and normalizes to an
// {ok, result|error} envelope. No socket / transport needed to exercise it — the transport is a thin
// wrapper that only carries the request in + the envelope out.

test.describe('dispatchFleetRequest — the app↔fleet wire allowlist + routing choke-point', () => {
    let calls, bridge;

    test.beforeEach(() => {
        calls  = [];
        bridge = {
            defineAgent : p  => { calls.push(['defineAgent', p]); return {id: p.githubUsername}; },
            listAgents  : () => { calls.push(['listAgents']);     return [{id: 'a'}]; },
            getAgent    : id => { calls.push(['getAgent', id]);   return {id}; },
            startAgent  : async id => { calls.push(['startAgent', id]);   return {id, state: 'running'}; },
            stopAgent   : async id => { calls.push(['stopAgent', id]);    return {success: true, id}; },
            restartAgent: async id => { calls.push(['restartAgent', id]); return {id, state: 'running'}; },
            removeAgent : async id => { calls.push(['removeAgent', id]);  return {success: true, id}; },
            fleetStatus : () => { calls.push(['fleetStatus']); return [{id: 'a'}]; },
            setRepo     : payload => { calls.push(['setRepo', payload]); return {id: payload.id, metadata: {repo: payload}}; },
            setAvatar   : payload => { calls.push(['setAvatar', payload]); return {id: payload.id, metadata: {avatarUrl: payload.avatarUrl}}; },
            // resolver seams that MUST be unreachable over the wire (they return lifecycle-powerful singletons):
            getManager : () => { calls.push(['getManager']);  return {DANGER: 'lifecycle'}; },
            getRegistry: () => { calls.push(['getRegistry']); return {DANGER: 'registry'}; }
        };
    });

    test('routes an allowlisted method, forwards params, wraps {ok:true, result}', async () => {
        const res = await dispatchFleetRequest({method: 'defineAgent', params: {githubUsername: 'alice', harnessType: 'codex'}}, bridge);
        expect(res).toEqual({ok: true, result: {id: 'alice'}});
        expect(calls).toEqual([['defineAgent', {githubUsername: 'alice', harnessType: 'codex'}]]);
    });

    test('awaits async lifecycle operations', async () => {
        const res = await dispatchFleetRequest({method: 'startAgent', params: 'alice'}, bridge);
        expect(res).toEqual({ok: true, result: {id: 'alice', state: 'running'}});
        expect(calls).toEqual([['startAgent', 'alice']]);
    });

    test('routes setRepo, forwarding the single payload to the bridge (wire-compatible single-params)', async () => {
        const payload = {id: 'alice', cloneUrl: 'https://github.com/x/y.git', repoSlug: 'x/y'},
              res     = await dispatchFleetRequest({method: 'setRepo', params: payload}, bridge);

        expect(res).toEqual({ok: true, result: {id: 'alice', metadata: {repo: payload}}});
        expect(calls).toEqual([['setRepo', payload]]);
    });

    test('routes setAvatar, forwarding the single payload to the bridge', async () => {
        const payload = {id: 'alice', avatarUrl: 'https://cdn/x.png'},
              res     = await dispatchFleetRequest({method: 'setAvatar', params: payload}, bridge);

        expect(res).toEqual({ok: true, result: {id: 'alice', metadata: {avatarUrl: 'https://cdn/x.png'}}});
        expect(calls).toEqual([['setAvatar', payload]]);
    });

    test('rejects a method NOT on the wire allowlist without ever calling the bridge', async () => {
        for (const method of ['getManager', 'getRegistry', 'constructor', 'toString', '__proto__', 'resolveCredential', 'nope']) {
            const res = await dispatchFleetRequest({method, params: 'x'}, bridge);
            expect(res.ok).toBe(false);
            expect(res.error).toContain('not on the control surface');
        }
        // the dangerous resolver seams were never invoked — the wire allowlist stopped them first
        expect(calls).toEqual([]);
    });

    test('fails closed on a thrown op WITHOUT leaking the raw error / stack (sanitized, method-scoped)', async () => {
        const throwing = {startAgent: async () => { throw new Error('spawn failed at /internal/secret/path.mjs:42'); }};
        const res      = await dispatchFleetRequest({method: 'startAgent', params: 'alice'}, throwing);

        expect(res.ok).toBe(false);
        expect(res.error).toBe("fleet: 'startAgent' failed");
        expect(res.error).not.toContain('spawn failed');       // the raw message never crosses the wire
        expect(res.error).not.toContain('/internal/secret')    // no stack / internal-path leak
    });

    test('an absent request object fails closed, not throws', async () => {
        const res = await dispatchFleetRequest(undefined, bridge);
        expect(res.ok).toBe(false);
    });

    test('the wire allowlist is exactly the pane operations — no resolver seams', () => {
        expect([...FLEET_WIRE_METHODS].sort()).toEqual(
            ['defineAgent', 'fleetStatus', 'getAgent', 'listAgents', 'removeAgent', 'restartAgent', 'setAvatar', 'setRepo', 'startAgent', 'stopAgent'].sort()
        );
        expect(FLEET_WIRE_METHODS).not.toContain('getManager');
        expect(FLEET_WIRE_METHODS).not.toContain('getRegistry');
    });
});
