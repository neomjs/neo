import { setup } from '../../../../../../setup.mjs';

const appName = 'MemoryServiceSchemaTest';

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

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../../../src/core/_export.mjs';
import MemoryService         from '../../../../../../../../ai/mcp/server/memory-core/services/MemoryService.mjs';
import StorageRouter         from '../../../../../../../../ai/mcp/server/memory-core/managers/StorageRouter.mjs';

/**
 * Validates the AGENT_MEMORY graph node payload structure to prevent hollow-success regressions
 * in heartbeat unread-count and sunset-detection logic.
 */
test.describe('MemoryService — AGENT_MEMORY Schema (#10620)', () => {
    let spyCollection;
    let originalGetMemoryCollection;
    let originalUpsertNode;
    let originalLinkNodes;
    let upsertNodeCalls = [];

    let GraphService;

    test.beforeAll(async () => {
        GraphService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
    });

    test.beforeEach(() => {
        upsertNodeCalls = [];
        spyCollection = {
            async add() {}
        };
        originalGetMemoryCollection = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection = async () => spyCollection;

        originalUpsertNode = GraphService.upsertNode;
        originalLinkNodes  = GraphService.linkNodes;

        GraphService.upsertNode = (node) => {
            upsertNodeCalls.push(node);
        };
        GraphService.linkNodes = () => {};
    });

    test.afterEach(() => {
        StorageRouter.getMemoryCollection = originalGetMemoryCollection;
        GraphService.upsertNode           = originalUpsertNode;
        GraphService.linkNodes            = originalLinkNodes;
    });

    test('addMemory canonicalizes profile-string agent to node-id graph identity', async () => {
        await MemoryService.addMemory({
            agent    : 'neo-gemini-3-1-pro',
            sessionId: 'session-xyz',
            prompt   : 'hello',
            thought  : 'thinking',
            response : 'hi'
        });

        expect(upsertNodeCalls).toHaveLength(1);
        const node = upsertNodeCalls[0];

        expect(node.type).toBe('AGENT_MEMORY');

        // Ensure the structured properties are present and correctly named
        expect(node.properties).toBeDefined();
        // Profile string 'neo-gemini-3-1-pro' should be canonicalized to '@neo-gemini-3-1-pro'
        expect(node.properties.agentIdentity).toBe('@neo-gemini-3-1-pro');
        expect(node.properties.sessionId).toBe('session-xyz');
        expect(typeof node.properties.timestamp).toBe('string');
    });

    test('addMemory preserves canonical node-id graph identity', async () => {
        await MemoryService.addMemory({
            agent    : '@neo-gemini-3-1-pro',
            sessionId: 'session-xyz',
            prompt   : 'hello',
            thought  : 'thinking',
            response : 'hi'
        });

        expect(upsertNodeCalls).toHaveLength(1);
        const node = upsertNodeCalls[0];

        expect(node.type).toBe('AGENT_MEMORY');
        expect(node.properties.agentIdentity).toBe('@neo-gemini-3-1-pro');
    });
});
