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
import {createFleetRegistryBridge} from '../../../../../../ai/services/fleet/createFleetRegistryBridge.mjs';
import {
    createFleetWireProtocolStamp,
    createFleetWireRequest,
    createFleetWireResponse,
    FLEET_WIRE_CAPABILITIES,
    FLEET_WIRE_METHODS,
    FLEET_WIRE_RESPONSE_STATES
} from '../../../../../../ai/services/fleet/fleetWireMethods.mjs';

// createFleetRegistryBridge is the browser-side (App-Worker) factory: given a transport `send`, it
// returns the object the agentos pane resolves at globalThis.AgentOS.fleet.registryBridge. No live
// socket is needed — the transport `send` is injected as a recording/stub async fn, so the factory's
// contract (method surface + envelope unwrapping) is exercised in isolation.

test.describe('createFleetRegistryBridge — the browser-side pane bridge factory', () => {
    test('exposes exactly the wire-allowlisted operations — no more, no less', () => {
        const bridge = createFleetRegistryBridge(async () => createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: null}));
        expect(Object.keys(bridge).sort()).toEqual([...FLEET_WIRE_METHODS].sort());
    });

    test('defineAgent forwards a versioned offer through send + resolves the validated result', async () => {
        const sent   = [];
        const bridge = createFleetRegistryBridge(async req => {
            sent.push(req);
            return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: {id: 'alice'}})
        });
        const res = await bridge.defineAgent({githubUsername: 'alice', harnessType: 'codex'});

        expect(sent).toEqual([createFleetWireRequest('defineAgent', {githubUsername: 'alice', harnessType: 'codex'})]);
        expect(res).toEqual({id: 'alice'});
    });

    test('a lifecycle op forwards its id as params', async () => {
        const sent   = [];
        const bridge = createFleetRegistryBridge(async req => {
            sent.push(req);
            return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {result: {id: 'alice', state: 'running'}})
        });

        await bridge.startAgent('alice');
        expect(sent).toEqual([createFleetWireRequest('startAgent', 'alice')]);
    });

    test('configureAgent forwards its ONE curated intent as params', async () => {
        const
            sent   = [],
            intent = {id: 'alice', harnessType: 'claude-code', mcpServers: {'memory-core': false}},
            bridge = createFleetRegistryBridge(async req => {
                sent.push(req);
                return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {
                    result: {status: 'accepted', agent: {id: 'alice'}}
                })
            });

        await expect(bridge.configureAgent(intent)).resolves.toEqual({status: 'accepted', agent: {id: 'alice'}});
        expect(sent).toEqual([createFleetWireRequest('configureAgent', intent)])
    });

    test('a finite failure envelope rejects with the transport error (fail-closed for the pane)', async () => {
        const bridge = createFleetRegistryBridge(async () => createFleetWireResponse(
            FLEET_WIRE_RESPONSE_STATES.operationFailed,
            {error: 'spawn failed'}
        ));
        await expect(bridge.startAgent('alice')).rejects.toThrow('spawn failed');
    });

    test('malformed, version-skewed, and capability-skewed server responses never become data', async () => {
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
            const bridge = createFleetRegistryBridge(async () => response);

            await expect(bridge.listAgents()).rejects.toThrow(/malformed|unoffered/)
        }
    });

    test('transport rejection text is never relayed through the pane client', async () => {
        const secret = 'raw-upstream-transport-secret';
        const bridge = createFleetRegistryBridge(async () => {
            throw new Error(secret)
        });

        await expect(bridge.listAgents()).rejects.toThrow('fleet: request transport failed');
        await expect(bridge.listAgents()).rejects.not.toThrow(secret)
    });

    test('a caller-owned transport remedy stays bounded without relaying the rejected error', async () => {
        const
            secret = 'raw-upstream-credential-shaped-secret',
            remedy = "onboardPeer: Fleet owner is unreachable; start it with 'npm run ai:fleet-server' and re-run",
            bridge = createFleetRegistryBridge(async () => {
                throw new Error(secret)
            }, {transportFailureMessage: remedy});

        await expect(bridge.listAgents()).rejects.toThrow(remedy);
        await expect(bridge.listAgents()).rejects.not.toThrow(secret)
    });

    test('requires a transport send function', () => {
        expect(() => createFleetRegistryBridge()).toThrow('send(request) function is required');
        expect(() => createFleetRegistryBridge({})).toThrow();
    });
});
