import {setup} from '../../../../../../setup.mjs';

const appName = 'PermissionServiceTest';

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
import RequestContextService from '../../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

test.describe('Neo.ai.mcp.server.memory-core.services.PermissionService', () => {
    let PermissionService, GraphService, LifecycleService;

    test.beforeAll(async () => {
        GraphService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        PermissionService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/PermissionService.mjs')).default;
        LifecycleService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;

        const aiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        aiConfig.storagePaths.graph = ':memory:';

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }
    });

    test.beforeEach(async () => {
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
            }
        }

        GraphService.upsertNode({ id: 'AGENT:alice', type: 'AGENT', name: 'Alice', properties: {} });
        GraphService.upsertNode({ id: 'AGENT:bob', type: 'AGENT', name: 'Bob', properties: {} });
    });

    test('grantPermission creates a graph edge with correctly swapped source/target', async () => {
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            const res = await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_READ_INBOX_OF' });
            expect(res.success).toBe(true);
        });

        // The capability belongs to Alice, pointing at Bob
        const edges = GraphService.db.edges.items;
        expect(edges.length).toBe(1);
        expect(edges[0].source).toBe('AGENT:alice');
        expect(edges[0].target).toBe('AGENT:bob');
        expect(edges[0].type).toBe('CAN_READ_INBOX_OF');
    });

    test('revokePermission removes the granted edge', async () => {
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_READ_INBOX_OF' });
            expect(GraphService.db.edges.getCount()).toBe(1);

            const res = await PermissionService.revokePermission({ to: 'AGENT:alice', scope: 'CAN_READ_INBOX_OF' });
            expect(res.success).toBe(true);
            expect(GraphService.db.edges.getCount()).toBe(0);
        });
    });

    test('listPermissions shows capabilities and granted permissions', async () => {
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_READ_INBOX_OF' });
        });
        
        // Alice should have a capability to read Bob's inbox
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            const res = await PermissionService.listPermissions();
            expect(res.capabilities.length).toBe(1);
            expect(res.capabilities[0].target).toBe('AGENT:bob');
            expect(res.capabilities[0].scope).toBe('CAN_READ_INBOX_OF');
            expect(res.grantedToOthers.length).toBe(0);
        });

        // Bob should see he granted to Alice
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            const res = await PermissionService.listPermissions();
            expect(res.capabilities.length).toBe(0);
            expect(res.grantedToOthers.length).toBe(1);
            expect(res.grantedToOthers[0].grantedTo).toBe('AGENT:alice');
            expect(res.grantedToOthers[0].scope).toBe('CAN_READ_INBOX_OF');
        });
    });

    test('hasPermission validates correctly', async () => {
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_READ_INBOX_OF' });
        });

        // Alice checking against Bob
        expect(PermissionService.hasPermission('AGENT:alice', 'AGENT:bob', 'CAN_READ_INBOX_OF')).toBe(true);

        // Charlie checking against Bob
        expect(PermissionService.hasPermission('AGENT:charlie', 'AGENT:bob', 'CAN_READ_INBOX_OF')).toBe(false);

        // Bob checking against himself (always true)
        expect(PermissionService.hasPermission('AGENT:bob', 'AGENT:bob', 'CAN_READ_INBOX_OF')).toBe(true);

        // Checking against broadcast (always true)
        expect(PermissionService.hasPermission('AGENT:alice', 'AGENT:*', 'CAN_READ_INBOX_OF')).toBe(true);
    });
});
