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
            defineAgent   : p  => { calls.push(['defineAgent', p]); return {id: p.githubUsername}; },
            configureAgent: p  => { calls.push(['configureAgent', p]); return {status: 'accepted', agent: {id: p.id, harnessType: p.harnessType}}; },
            listAgents    : () => { calls.push(['listAgents']);     return [{id: 'a'}]; },
            getAgent      : id => { calls.push(['getAgent', id]);   return {id}; },
            startAgent    : async id => { calls.push(['startAgent', id]);   return {id, state: 'running'}; },
            stopAgent     : async id => { calls.push(['stopAgent', id]);    return {success: true, id}; },
            restartAgent  : async id => { calls.push(['restartAgent', id]); return {id, state: 'running'}; },
            removeAgent   : async id => { calls.push(['removeAgent', id]);  return {success: true, id}; },
            fleetStatus   : () => { calls.push(['fleetStatus']); return [{id: 'a'}]; },
            setRepo       : payload => { calls.push(['setRepo', payload]); return {id: payload.id, metadata: {repo: payload}}; },
            setAvatar     : payload => { calls.push(['setAvatar', payload]); return {id: payload.id, metadata: {avatarUrl: payload.avatarUrl}}; },
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

    test('routes configureAgent as one payload and preserves the domain outcome', async () => {
        const
            payload = {id: 'alice', harnessType: 'claude-code', mcpServers: {'memory-core': false}},
            res     = await dispatchFleetRequest({method: 'configureAgent', params: payload}, bridge);

        expect(res).toEqual({
            ok    : true,
            result: {status: 'accepted', agent: {id: 'alice', harnessType: 'claude-code'}}
        });
        expect(calls).toEqual([['configureAgent', payload]])
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

    test('resolveViewerIdentity routes over the wire — the whoami identity-bootstrap is a real pane-callable verb', async () => {
        bridge.resolveViewerIdentity = () => {
            calls.push(['resolveViewerIdentity']);
            return {ok: true, agentIdentityNodeId: '@stamped-viewer'}
        };

        const res = await dispatchFleetRequest({method: 'resolveViewerIdentity'}, bridge);

        expect(res.ok).toBe(true);
        expect(res.result).toEqual({ok: true, agentIdentityNodeId: '@stamped-viewer'});
        expect(calls).toEqual([['resolveViewerIdentity']])
    });

    test('the wire allowlist is exactly the pane operations (+ bounded reads and explicit writes) — no resolver seams', () => {
        expect([...FLEET_WIRE_METHODS].sort()).toEqual(
            // fleet-agent operations (incl. the configureAgent scoped-config patch — never identity,
            // never credential) + the read-observe verbs (boot-identity fact + activity snapshot +
            // assembled roster DTO + viewer-bound catch-up history + one page of an agent's turn
            // memories + one agent's mailbox mirror + the whoami identity-bootstrap) plus the two
            // explicit write verbs. Catch-up mark is process-local only; compose persists payload
            // while the server stamps identity.
            ['composeOperatorMessage', 'configureAgent', 'connectTenant', 'defineAgent', 'fleetActivity', 'fleetHistory', 'fleetMailboxMirror', 'fleetMemories', 'fleetRoster', 'fleetRuntimeStatus', 'fleetStatus', 'getAgent', 'getBootIdentity', 'listAgents', 'listTenants', 'markFleetCaughtUp', 'removeAgent', 'resolveViewerIdentity', 'restartAgent', 'setAvatar', 'setRepo', 'startAgent', 'stopAgent'].sort()
        );
        expect(FLEET_WIRE_METHODS).toContain('getBootIdentity');   // the read-observe verbs ride the wire; the lifecycle-write restart actuator does NOT (R3)
        expect(FLEET_WIRE_METHODS).toContain('fleetActivity');
        expect(FLEET_WIRE_METHODS).toContain('fleetHistory');
        expect(FLEET_WIRE_METHODS).toContain('fleetMemories');
        expect(FLEET_WIRE_METHODS).toContain('fleetRoster');
        // the wire's first WRITE verb: compose rides the authenticated transport with a whitelisted
        // payload — the author is the server-stamped ambient identity, never a wire parameter
        expect(FLEET_WIRE_METHODS).toContain('composeOperatorMessage');
        expect(FLEET_WIRE_METHODS).toContain('markFleetCaughtUp');
        // a Node-side read verb the browser cannot NAME is not a seam: the omission fails closed and
        // SILENT (the pane's `typeof bridge.x !== 'function'` guard returns early), which reads
        // exactly like a wired-but-empty mailbox — the honest-looking failure this list prevents
        expect(FLEET_WIRE_METHODS).toContain('fleetMailboxMirror');
        expect(FLEET_WIRE_METHODS).not.toContain('getManager');
        expect(FLEET_WIRE_METHODS).not.toContain('getRegistry');
        expect(FLEET_WIRE_METHODS).not.toContain('getIdentityResolver');
        // the Brain/operator-only raw-launch write path must NEVER ride the wire — pairs with the
        // registry's defineAgent/updateAgent launch rejection (the mechanical security stop-line)
        expect(FLEET_WIRE_METHODS).not.toContain('setLaunchOverride');
        // ...and neither may its READ counterpart: getDefinition is the only surface carrying
        // metadata.launch (the public projection redacts it), so it stays off the wire too
        expect(FLEET_WIRE_METHODS).not.toContain('getDefinition');
        // the tenant-credential reader is Brain-internal only — the PAT must never be wire-reachable
        expect(FLEET_WIRE_METHODS).not.toContain('getCredential');
    });
});
