import {setup} from '../../../../setup.mjs';

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
import fs                    from 'fs-extra';
import path                  from 'path';
import Neo                   from '../../../../../../src/Neo.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

test.describe('Neo.ai.services.memory-core.PermissionService', () => {
    test.describe.configure({ mode: 'serial' });
    let PermissionService, GraphService, LifecycleService, originalAutoSave;
    let dbPath, originalDbPath, hadGraphDb = false;

    test.beforeAll(async () => {
        // Build an isolated tmp path for the database file tests
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        dbPath = path.join(tmpDir, `neo-permission-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        // Force temp file DB config instead of :memory: to prevent initialization race wipes
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        originalDbPath = aiConfig.storagePaths.graph;
        aiConfig.storagePaths.graph = dbPath;

        // Mock Chroma collections to prevent production data wipes (#10845 / #10867)
        if (!aiConfig.collections) aiConfig.collections = {};
        aiConfig.collections.memory = `test-memory-${process.pid}-${Date.now()}`;
        aiConfig.collections.session = `test-session-${process.pid}-${Date.now()}`;

        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        PermissionService = (await import('../../../../../../ai/services/memory-core/PermissionService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        const { TestLifecycleHelper } = await import('./util.mjs');

        if (GraphService.db) {
            hadGraphDb = true;
        }

        await TestLifecycleHelper.cleanupGraphService(GraphService, LifecycleService, null, null, 'clear');

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
            await GraphService.initAsync();
        }

        originalAutoSave = GraphService.db.autoSave;

        // @summary Enables autoSave for the duration of the test suite (#10256).
        // This is necessary because these tests assert SQLite state via direct queries.
        // Without autoSave = true, the memory-state and disk-state may diverge,
        // causing intermittent assertion failures in serial mode.
        GraphService.db.autoSave = true;
    });

    test.afterAll(async () => {
        const { cleanupChromaManager, TestLifecycleHelper } = await import('./util.mjs');
        await cleanupChromaManager();

        if (GraphService?.db) {
            GraphService.db.autoSave = originalAutoSave;
        }

        await TestLifecycleHelper.cleanupGraphService(GraphService, LifecycleService, dbPath, fs, 'clear');

        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        aiConfig.storagePaths.graph = originalDbPath;

        if (hadGraphDb) {
            await GraphService.initAsync();
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

        GraphService.upsertNode({ id: '@alice', type: 'AGENT', name: 'Alice', properties: {} });
        GraphService.upsertNode({ id: '@bob', type: 'AGENT', name: 'Bob', properties: {} });
    });

    test('grantPermission creates a graph edge with correctly swapped source/target', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_READ_INBOX_OF' });
            expect(res.success).toBe(true);
        });

        // The capability belongs to Alice, pointing at Bob
        const edges = GraphService.db.edges.items;
        expect(edges.length).toBe(1);
        expect(edges[0].source).toBe('@alice');
        expect(edges[0].target).toBe('@bob');
        expect(edges[0].type).toBe('CAN_READ_INBOX_OF');
    });

    test('revokePermission removes the granted edge', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_READ_INBOX_OF' });
            expect(GraphService.db.edges.getCount()).toBe(1);

            const res = await PermissionService.revokePermission({ to: '@alice', scope: 'CAN_READ_INBOX_OF' });
            expect(res.success).toBe(true);
            expect(GraphService.db.edges.getCount()).toBe(0);
        });
    });

    test('listPermissions shows capabilities and granted permissions', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_READ_INBOX_OF' });
        });

        // Alice should have a capability to read Bob's inbox
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await PermissionService.listPermissions();
            expect(res.capabilities.length).toBe(1);
            expect(res.capabilities[0].target).toBe('@bob');
            expect(res.capabilities[0].scope).toBe('CAN_READ_INBOX_OF');
            expect(res.grantedToOthers.length).toBe(0);
        });

        // Bob should see he granted to Alice
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await PermissionService.listPermissions();
            expect(res.capabilities.length).toBe(0);
            expect(res.grantedToOthers.length).toBe(1);
            expect(res.grantedToOthers[0].grantedTo).toBe('@alice');
            expect(res.grantedToOthers[0].scope).toBe('CAN_READ_INBOX_OF');
        });
    });

    test('hasPermission validates correctly', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_READ_INBOX_OF' });
        });

        // Alice checking against Bob
        expect(PermissionService.hasPermission('@alice', '@bob', 'CAN_READ_INBOX_OF')).toBe(true);

        // Charlie checking against Bob
        expect(PermissionService.hasPermission('@charlie', '@bob', 'CAN_READ_INBOX_OF')).toBe(false);

        // Bob checking against himself (always true)
        expect(PermissionService.hasPermission('@bob', '@bob', 'CAN_READ_INBOX_OF')).toBe(true);

        // Checking against broadcast (always true)
        expect(PermissionService.hasPermission('@alice', 'AGENT:*', 'CAN_READ_INBOX_OF')).toBe(true);
    });

    test('listPermissions denies access when requesting for another identity', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(PermissionService.listPermissions({ forIdentity: '@bob' }))
                .rejects.toThrow('Unauthorized: Cannot enumerate permissions for @bob');
        });
    });

    test('grantPermission preserves existing node type and does not overwrite it (resolves #10231)', async () => {
        // Pre-seed AGENT:* as a BroadcastSentinel
        GraphService.upsertNode({ id: 'AGENT:*', type: 'BroadcastSentinel', name: '*', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await PermissionService.grantPermission({ to: 'AGENT:*', scope: 'CAN_REPLY_TO' });
            expect(res.success).toBe(true);
        });

        // Assert type remains 'BroadcastSentinel'
        // A sibling SDK-import path can wrap GraphService methods async inside the same workers:1 process.
        const node = await GraphService.getNode({ id: 'AGENT:*' });
        expect(node.type).toBe('BroadcastSentinel');

        // Also assert in SQLite
        const rows = GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').all('AGENT:*');
        expect(JSON.parse(rows[0].data).label).toBe('BroadcastSentinel');
    });

    test('grantPermission throws when target does not exist (resolves #10231)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await expect(PermissionService.grantPermission({ to: '@phantom', scope: 'CAN_REPLY_TO' }))
                .rejects.toThrow('Cannot grant CAN_REPLY_TO to @phantom: target does not exist. Identity nodes must be pre-seeded via ai/scripts/setup/seedAgentIdentities.mjs.');
        });
    });
});
