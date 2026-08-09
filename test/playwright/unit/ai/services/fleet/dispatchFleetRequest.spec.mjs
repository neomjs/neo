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
import {
    createFleetWireOffer,
    createFleetWireProtocolStamp,
    createFleetWireRequest,
    FLEET_WIRE_CAPABILITIES,
    FLEET_WIRE_RESPONSE_STATES
} from '../../../../../../ai/services/fleet/fleetWireMethods.mjs';

// dispatchFleetRequest is the pure app↔fleet wire choke-point: it selects a client-offered contract
// before method policy, forwards to an injected bridge stub, and emits one finite response state.
// No socket / transport is needed to exercise that ordering.

const wireRequest = (method, params) => createFleetWireRequest(method, params);

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
        const res = await dispatchFleetRequest(wireRequest('defineAgent', {githubUsername: 'alice', harnessType: 'codex'}), bridge);
        expect(res).toEqual({
            ok      : true,
            protocol: createFleetWireProtocolStamp(),
            result  : {id: 'alice'},
            state   : FLEET_WIRE_RESPONSE_STATES.ok
        });
        expect(calls).toEqual([['defineAgent', {githubUsername: 'alice', harnessType: 'codex'}]]);
    });

    test('awaits async lifecycle operations', async () => {
        const res = await dispatchFleetRequest(wireRequest('startAgent', 'alice'), bridge);
        expect(res).toMatchObject({ok: true, result: {id: 'alice', state: 'running'}, state: FLEET_WIRE_RESPONSE_STATES.ok});
        expect(calls).toEqual([['startAgent', 'alice']]);
    });

    test('routes setRepo, forwarding the single payload to the bridge (wire-compatible single-params)', async () => {
        const payload = {id: 'alice', cloneUrl: 'https://github.com/x/y.git', repoSlug: 'x/y'},
              res     = await dispatchFleetRequest(wireRequest('setRepo', payload), bridge);

        expect(res).toMatchObject({ok: true, result: {id: 'alice', metadata: {repo: payload}}, state: FLEET_WIRE_RESPONSE_STATES.ok});
        expect(calls).toEqual([['setRepo', payload]]);
    });

    test('routes configureAgent as one payload and preserves the domain outcome', async () => {
        const
            payload = {id: 'alice', harnessType: 'claude-code', mcpServers: {'memory-core': false}},
            res     = await dispatchFleetRequest(wireRequest('configureAgent', payload), bridge);

        expect(res).toMatchObject({
            ok    : true,
            result: {status: 'accepted', agent: {id: 'alice', harnessType: 'claude-code'}},
            state : FLEET_WIRE_RESPONSE_STATES.ok
        });
        expect(calls).toEqual([['configureAgent', payload]])
    });

    test('routes setAvatar, forwarding the single payload to the bridge', async () => {
        const payload = {id: 'alice', avatarUrl: 'https://cdn/x.png'},
              res     = await dispatchFleetRequest(wireRequest('setAvatar', payload), bridge);

        expect(res).toMatchObject({
            ok    : true,
            result: {id: 'alice', metadata: {avatarUrl: 'https://cdn/x.png'}},
            state : FLEET_WIRE_RESPONSE_STATES.ok
        });
        expect(calls).toEqual([['setAvatar', payload]]);
    });

    test('rejects a method NOT on the wire allowlist without ever calling the bridge', async () => {
        for (const method of ['getManager', 'getRegistry', 'constructor', 'toString', '__proto__', 'resolveCredential', 'nope']) {
            const res = await dispatchFleetRequest({method, params: 'x', protocol: createFleetWireOffer()}, bridge);
            expect(res.ok).toBe(false);
            expect(res.state).toBe(FLEET_WIRE_RESPONSE_STATES.unsupportedMethod);
            expect(res.error).toContain('not on the control surface');
        }
        // the dangerous resolver seams were never invoked — the wire allowlist stopped them first
        expect(calls).toEqual([]);
    });

    test('fails closed on a thrown op WITHOUT leaking the raw error / stack (sanitized, method-scoped)', async () => {
        const throwing = {startAgent: async () => { throw new Error('spawn failed at /internal/secret/path.mjs:42'); }};
        const res      = await dispatchFleetRequest(wireRequest('startAgent', 'alice'), throwing);

        expect(res.ok).toBe(false);
        expect(res.state).toBe(FLEET_WIRE_RESPONSE_STATES.operationFailed);
        expect(res.error).toBe("fleet: 'startAgent' failed");
        expect(res.error).not.toContain('spawn failed');       // the raw message never crosses the wire
        expect(res.error).not.toContain('/internal/secret')    // no stack / internal-path leak
    });

    test('an absent request object fails closed, not throws', async () => {
        const res = await dispatchFleetRequest(undefined, bridge);
        expect(res.ok).toBe(false);
        expect(res.state).toBe(FLEET_WIRE_RESPONSE_STATES.unsupportedProtocol);
        expect(calls).toEqual([])
    });

    test('version or required-capability skew closes before method lookup or bridge execution', async () => {
        const requests = [
            {method: 'listAgents', protocol: {versions: [999], capabilities: [...FLEET_WIRE_CAPABILITIES]}},
            {method: 'listAgents', protocol: {versions: [1], capabilities: ['method-schema-v1']}}
        ];

        const states = [];

        for (const request of requests) {
            const response = await dispatchFleetRequest(request, bridge);

            states.push(response.state);
            expect(response.ok).toBe(false)
        }

        expect(states).toEqual([
            FLEET_WIRE_RESPONSE_STATES.unsupportedProtocol,
            FLEET_WIRE_RESPONSE_STATES.unsupportedCapability
        ]);
        expect(calls).toEqual([])
    });

    test('resolveViewerIdentity routes over the wire — the whoami identity-bootstrap is a real pane-callable verb', async () => {
        bridge.resolveViewerIdentity = () => {
            calls.push(['resolveViewerIdentity']);
            return {ok: true, agentIdentityNodeId: '@stamped-viewer'}
        };

        const res = await dispatchFleetRequest(wireRequest('resolveViewerIdentity'), bridge);

        expect(res.ok).toBe(true);
        expect(res.result).toEqual({ok: true, agentIdentityNodeId: '@stamped-viewer'});
        expect(calls).toEqual([['resolveViewerIdentity']])
    });

    test('the wire allowlist is exactly the pane operations (+ bounded reads and explicit writes) — no resolver seams', () => {
        expect([...FLEET_WIRE_METHODS].sort()).toEqual(
            // fleet-agent operations (incl. the configureAgent scoped-config patch — never identity,
            // never credential) + the read-observe verbs (boot-identity fact + activity snapshot +
            // assembled roster DTO + viewer-bound catch-up history + one page of an agent's
            // session summaries + one agent's mailbox mirror + the whoami identity-bootstrap) plus
            // the two explicit write verbs. Catch-up mark is process-local only; compose persists
            // payload while the server stamps identity.
            ['composeOperatorMessage', 'configureAgent', 'connectTenant', 'defineAgent', 'fleetActivity', 'fleetHistory', 'fleetMailboxMirror', 'fleetMemories', 'fleetRoster', 'fleetRuntimeStatus', 'fleetStatus', 'fleetWakeRoutes', 'getAgent', 'getBootIdentity', 'listAgents', 'listTenants', 'markFleetCaughtUp', 'removeAgent', 'resolveViewerIdentity', 'restartAgent', 'setAvatar', 'setRepo', 'startAgent', 'stopAgent'].sort()
        );
        expect(FLEET_WIRE_METHODS).toContain('getBootIdentity');   // the read-observe verbs ride the wire; the lifecycle-write restart actuator does NOT (R3)
        expect(FLEET_WIRE_METHODS).toContain('fleetActivity');
        expect(FLEET_WIRE_METHODS).toContain('fleetHistory');
        expect(FLEET_WIRE_METHODS).toContain('fleetMemories');
        expect(FLEET_WIRE_METHODS).toContain('fleetRoster');
        // the decomposed per-seat wake-route read — bounded read-observe, no resolver seam
        expect(FLEET_WIRE_METHODS).toContain('fleetWakeRoutes');
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
