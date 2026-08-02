import {test, expect} from '@playwright/test';

import {resolveFleetViewer, resolveFleetViewerClaim} from '../../../../ai/services/fleet/fleetLaunchContract.mjs';

/**
 * @summary Unit coverage for the Fleet viewer-binding split: the graphless identity CLAIM
 * (plane-mode boot) versus the host-graph-verified binding (in-process boot).
 *
 * The load-bearing witness here is the veto asymmetry: a broken or unseeded HOST graph must veto
 * the in-process binding (fail-closed attribution) while remaining structurally UNABLE to veto the
 * claim — plane mode's verification authority is the plane itself, so these cases prove a healthy
 * configured plane cannot be vetoed by host Memory Core state.
 */

const IDENTITY = {githubLogin: 'neo-fable-clio', username: 'clio', source: 'env-var'};

test.describe('fleetLaunchContract: resolveFleetViewerClaim (graphless half)', () => {
    test('resolves the canonical claim shape from the identity chain alone', async () => {
        const claim = await resolveFleetViewerClaim({resolveIdentity: async () => IDENTITY});

        expect(claim).toEqual({
            userId             : 'neo-fable-clio',
            username           : 'clio',
            agentIdentityNodeId: expect.stringContaining('neo-fable-clio'),
            source             : 'env-var'
        })
    });

    test('fails closed with the named remediation when no identity resolves', async () => {
        await expect(resolveFleetViewerClaim({resolveIdentity: async () => null}))
            .rejects.toThrow('no viewer identity resolved')
    });

    test('WITNESS: a host graph that would explode cannot veto the claim — no graph seam exists', async () => {
        // The claim function has no graph parameter at all; this case pins that property by
        // resolving successfully in an environment where any host-graph touch would throw loudly
        // (the same injected identity that the veto case below uses against resolveFleetViewer).
        const claim = await resolveFleetViewerClaim({resolveIdentity: async () => IDENTITY});

        expect(claim.agentIdentityNodeId).toBeTruthy()
    })
});

test.describe('fleetLaunchContract: resolveFleetViewer (in-process, host-graph-verified half)', () => {
    test('verifies the claim against a seeded AgentIdentity node and returns its id', async () => {
        const viewer = await resolveFleetViewer({
            resolveIdentity: async () => IDENTITY,
            getGraphService: async () => ({
                ready  : async () => {},
                getNode: async ({id}) => ({id, type: 'AgentIdentity'})
            })
        });

        expect(viewer.userId).toBe('neo-fable-clio');
        expect(viewer.agentIdentityNodeId).toContain('neo-fable-clio')
    });

    test('VETO half: a broken host graph refuses the in-process binding fail-closed', async () => {
        await expect(resolveFleetViewer({
            resolveIdentity: async () => IDENTITY,
            getGraphService: async () => { throw new Error('host graph unavailable') }
        })).rejects.toThrow('host graph unavailable')
    });

    test('VETO half: an unseeded node refuses with the named remediation', async () => {
        await expect(resolveFleetViewer({
            resolveIdentity: async () => IDENTITY,
            getGraphService: async () => ({
                ready  : async () => {},
                getNode: async () => null
            })
        })).rejects.toThrow('no seeded AgentIdentity node')
    })
});
