import {setup} from '../../../../../../setup.mjs';

const appName = 'HealthServiceTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../../src/manager/Instance.mjs';

/**
 * @summary Coverage for the #10176 identity observability block in the healthcheck payload.
 *
 * The integration test (HealthService.healthcheck() end-to-end) requires ChromaDB + StorageRouter
 * + multiple service singletons. Those are out of scope here — this spec pins the PURE projection
 * logic via `buildIdentityBlock`, which is the load-bearing function for the AC shape contract.
 * Integration correctness is validated post-merge via empirical restart + healthcheck inspection.
 *
 * @see Neo.ai.mcp.server.memory-core.services.HealthService#buildIdentityBlock
 */
test.describe('HealthService #10176 — buildIdentityBlock', () => {
    let buildIdentityBlock;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../ai/mcp/server/memory-core/services/HealthService.mjs');
        buildIdentityBlock = mod.buildIdentityBlock;
    });

    test('null state projects to unresolved + unbound', () => {
        expect(buildIdentityBlock(null)).toEqual({
            source: 'unresolved',
            bound : false,
            nodeId: null
        });
    });

    test('explicit unresolved state (resolver yielded no userId) projects to unresolved + unbound', () => {
        // StdioIdentityResolver's failure mode: env-var missing AND gh-cli failed/timed-out.
        // Server.mjs may pass through the explicit shape or null — both paths land in the
        // same observable state. This covers the explicit-shape path.
        const state = {userId: null, agentIdentityNodeId: null, source: 'unresolved'};
        expect(buildIdentityBlock(state)).toEqual({
            source: 'unresolved',
            bound : false,
            nodeId: null
        });
    });

    test('env-var resolution with matching graph node projects to bound', () => {
        // The expected success shape for A2A operation: NEO_AGENT_IDENTITY env var pinned at
        // harness level, graph node seeded (#10232 boot-time self-seed), bindAgentIdentity
        // resolved the node at boot.
        const state = {
            userId             : 'neo-opus-4-7',
            agentIdentityNodeId: '@neo-opus-4-7',
            source             : 'env-var'
        };
        expect(buildIdentityBlock(state)).toEqual({
            source: 'env-var',
            bound : true,
            nodeId: '@neo-opus-4-7'
        });
    });

    test('gh-cli resolution with matching graph node projects to bound', () => {
        // Human-developer path or harness without NEO_AGENT_IDENTITY pin: gh CLI resolves
        // the authenticated login, graph has the seeded node, bindAgentIdentity succeeds.
        const state = {
            userId             : 'tobiu',
            agentIdentityNodeId: '@tobiu',
            source             : 'gh-cli'
        };
        expect(buildIdentityBlock(state)).toEqual({
            source: 'gh-cli',
            bound : true,
            nodeId: '@tobiu'
        });
    });

    test('resolved userId without graph node projects to unbound (seed-state failure signal)', () => {
        // Diagnostic shape: resolver worked (env-var or gh-cli yielded a login), but the
        // AgentIdentity graph node for that login doesn't exist. This is THE signal #10176
        // was filed to surface — operator immediately knows to run seedAgentIdentities.mjs
        // OR verify #10232 self-seed fired on boot.
        const state = {
            userId             : 'neo-opus-4-7',
            agentIdentityNodeId: null,
            source             : 'env-var'
        };
        expect(buildIdentityBlock(state)).toEqual({
            source: 'env-var',
            bound : false,
            nodeId: null
        });
    });

    test('missing source defaults to unresolved', () => {
        // Defense-in-depth: if a caller ever passes a state with userId but no source field
        // (shouldn't happen per StdioIdentityResolver contract, but guard against drift),
        // we project to the safe 'unresolved' value rather than undefined/leaked.
        const state = {
            userId             : 'neo-opus-4-7',
            agentIdentityNodeId: '@neo-opus-4-7'
            // no source
        };
        expect(buildIdentityBlock(state)).toEqual({
            source: 'unresolved',
            bound : true,
            nodeId: '@neo-opus-4-7'
        });
    });
});
