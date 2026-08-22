import {setup} from '../../../../setup.mjs';

const appName = 'FleetLaunchContractTest';

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

import {test, expect}                                                     from '@playwright/test';
import Neo                                                                from '../../../../../../src/Neo.mjs';
import * as core                                                          from '../../../../../../src/core/_export.mjs';
import {isLocalBearerToken, generateLocalBearerToken}                     from '../../../../../../ai/mcp/server/shared/helpers/localBearer.mjs';
import {probeExistingFleetServer, resolveFleetBearer, resolveFleetViewer} from '../../../../../../ai/services/fleet/fleetLaunchContract.mjs';
import {startFleetBridgeServer}                                           from '../../../../../../ai/services/fleet/fleetBridgeServer.mjs';

/**
 * @summary The Fleet launch contract's three trust decisions, witnessed through injected seams.
 *
 * The inversion under test: where the memory-core stdio boot treats a missing identity as
 * single-tenant fallthrough, the Fleet launch FAILS CLOSED — an unbound viewer cannot attribute
 * admission, so it must not serve. And an occupied port is only ever reused after the incumbent
 * proves "same token, same viewer" through its authenticated probe.
 */
test.describe('fleetLaunchContract — viewer binding, bearer intake, reuse-or-refuse', () => {
    const seededGraph = nodes => async () => ({
        ready  : async () => {},
        getNode: async ({id}) => nodes[id] ?? null
    });

    test('resolveFleetViewer binds a seeded identity to the canonical node', async () => {
        const viewer = await resolveFleetViewer({
            resolveIdentity: async () => ({githubLogin: 'tobiu', username: 'Tobias Uhlig', source: 'env-var'}),
            getGraphService: seededGraph({'@tobiu': {id: '@tobiu', type: 'AgentIdentity'}})
        });

        expect(viewer).toEqual({userId: 'tobiu', username: 'Tobias Uhlig', agentIdentityNodeId: '@tobiu', source: 'env-var'})
    });

    test('an unresolved identity refuses startup with the remediation, never single-tenant fallthrough', async () => {
        await expect(resolveFleetViewer({
            resolveIdentity: async () => ({githubLogin: null, username: null, source: 'unresolved'}),
            getGraphService: seededGraph({})
        })).rejects.toThrow(/no viewer identity resolved.*NEO_AGENT_IDENTITY/s)
    });

    test('a resolved handle with NO seeded AgentIdentity node refuses startup, naming the fix', async () => {
        await expect(resolveFleetViewer({
            resolveIdentity: async () => ({githubLogin: 'ghost', username: 'Ghost', source: 'env-var'}),
            getGraphService: seededGraph({'@other': {id: '@other', type: 'AgentIdentity'}})
        })).rejects.toThrow(/no seeded AgentIdentity node @ghost.*seedAgentIdentities/s)
    });

    test('a node of the WRONG type is not an identity binding', async () => {
        await expect(resolveFleetViewer({
            resolveIdentity: async () => ({githubLogin: 'tobiu', username: 'T', source: 'gh-cli'}),
            getGraphService: seededGraph({'@tobiu': {id: '@tobiu', type: 'Concept'}})
        })).rejects.toThrow(/no seeded AgentIdentity node/)
    });

    test('resolveFleetBearer: canonical supplied value wins verbatim; absence generates canonical', () => {
        const supplied = generateLocalBearerToken();

        expect(resolveFleetBearer({suppliedToken: supplied})).toBe(supplied);

        const generated = resolveFleetBearer({});
        expect(isLocalBearerToken(generated)).toBe(true);
        expect(generated).not.toBe(supplied)
    });

    test('a malformed supplied bearer REFUSES startup instead of silently regenerating — and never echoes the value', () => {
        for (const bad of ['short', `${generateLocalBearerToken()}=`, 'x'.repeat(43)]) {
            let caught = null;

            try {
                resolveFleetBearer({suppliedToken: bad})
            } catch (error) {
                caught = error
            }

            expect(caught, `bearer ${bad} must refuse`).not.toBeNull();
            expect(caught.message).toContain('NEO_FLEET_BEARER');
            expect(caught.message, 'refusals must not echo credential material').not.toContain(bad)
        }
    });

    test('probe: a stubbed incumbent — wrong-token 401, wrong-viewer, non-JSON, unreachable all refuse with names', async () => {
        const base = {probeUrl: 'http://127.0.0.1:9/fleet/probe', bearerToken: generateLocalBearerToken(), agentIdentityNodeId: '@me'};

        const cases = [
            [{status: 401, ok: false},                                                        /rejected our bearer.*refusing silent reuse/s],
            [{status: 200, ok: true, json: async () => ({result: {agentIdentityNodeId: '@someone-else', pid: 7}})}, /wrong-viewer process/],
            [{status: 200, ok: true, json: async () => { throw new Error('nope') }},          /non-JSON body/],
            [{status: 503, ok: false},                                                        /HTTP 503/]
        ];

        for (const [response, pattern] of cases) {
            const outcome = await probeExistingFleetServer({...base, fetchImpl: async () => response});

            expect(outcome.reusable).toBe(false);
            expect(outcome.reason).toMatch(pattern)
        }

        const unreachable = await probeExistingFleetServer({...base, fetchImpl: async () => { throw new Error('ECONNREFUSED') }});

        expect(unreachable.reusable).toBe(false);
        expect(unreachable.reason).toContain('ECONNREFUSED')
    });

    test('probe against a REAL ingress: same token + same viewer reuses; a foreign token is refused by the live guard', async () => {
        const bearerToken = generateLocalBearerToken(),
              viewer      = {userId: 'probe-owner', username: 'Probe Owner', agentIdentityNodeId: '@probe-owner'};

        const server = await startFleetBridgeServer({
            port         : 0,
            bearerToken,
            viewerContext: viewer,
            runInContext : (context, fn) => fn(),
            dispatch     : async () => ({ok: true, result: null})
        });

        const probeUrl = `http://127.0.0.1:${server.address().port}/fleet/probe`;

        try {
            const same = await probeExistingFleetServer({probeUrl, bearerToken, agentIdentityNodeId: '@probe-owner'});

            expect(same.reusable).toBe(true);
            expect(same.viewer).toBe('@probe-owner');
            expect(same.pid).toBe(process.pid);

            const foreignToken = await probeExistingFleetServer({probeUrl, bearerToken: generateLocalBearerToken(), agentIdentityNodeId: '@probe-owner'});

            expect(foreignToken.reusable).toBe(false);
            expect(foreignToken.reason).toContain('rejected our bearer');

            const wrongViewer = await probeExistingFleetServer({probeUrl, bearerToken, agentIdentityNodeId: '@someone-else'});

            expect(wrongViewer.reusable).toBe(false);
            expect(wrongViewer.reason).toContain('wrong-viewer')
        } finally {
            await new Promise(resolve => server.close(resolve))
        }
    })
});
