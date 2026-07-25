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
    let hadGraphDb = false;

    test.beforeAll(async () => {
        // Isolation is by construction. `storagePaths.graph` resolves `graphTest` (`:memory:`) and
        // `collections.*` resolve to per-process randomized `test-*` names, both under `UNIT_TEST_MODE`.
        // The removed writes carried two stale rationales: a temp file was said to beat `:memory:`
        // against "initialization race wipes" (the suite is green on `:memory:` across repeated runs),
        // and the collection names were said to prevent production wipes — Chroma isolates at the
        // database level (`databaseTest`) before any collection name is resolved.
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

        // @summary Enables autoSave for the duration of the test suite.
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

        await TestLifecycleHelper.cleanupGraphService(GraphService, LifecycleService, null, fs, 'clear');

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

    test('#15027 canonicalizes permission operands at every public boundary', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@@bob'}, async () => {
            await PermissionService.grantPermission({to: 'alice', scope: 'CAN_READ_INBOX_OF'});
        });

        const [edge] = GraphService.db.edges.items;
        expect(edge.source).toBe('@alice');
        expect(edge.target).toBe('@bob');

        GraphService.upsertNode({id: 'alice', type: 'AGENT', name: 'Legacy Alice', properties: {}});
        GraphService.upsertNode({id: '@@bob', type: 'AGENT', name: 'Legacy Bob', properties: {}});
        GraphService.db.edges.remove([edge]);
        GraphService.linkNodes('alice', '@@bob', 'CAN_READ_INBOX_OF', 1.0);

        expect(PermissionService.hasPermission('@@alice', 'bob', 'CAN_READ_INBOX_OF')).toBe(true);

        await RequestContextService.run({agentIdentityNodeId: '@@alice'}, async () => {
            const permissions = await PermissionService.listPermissions({forIdentity: 'alice'});
            expect(permissions.identity).toBe('@alice');
            expect(permissions.capabilities).toEqual([
                expect.objectContaining({target: '@bob', scope: 'CAN_READ_INBOX_OF'})
            ]);
        });

        await RequestContextService.run({agentIdentityNodeId: 'bob'}, async () => {
            await PermissionService.revokePermission({to: '@@alice', scope: 'CAN_READ_INBOX_OF'});
        });

        expect(GraphService.db.edges.getCount()).toBe(0);
    });

    test('listPermissions denies access when requesting for another identity', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(PermissionService.listPermissions({ forIdentity: '@bob' }))
                .rejects.toThrow('Unauthorized: Cannot enumerate permissions for @bob');
        });
    });

    test('listPermissions routes the unbound case through the named helper (#13488 GPT RA1)', async () => {
        // No agentIdentityNodeId bound -> the `if (!caller)` guard fires; the shared helper names
        // the attempted handle + remediation instead of the bare "no agent identity context bound".
        await RequestContextService.run({userId: 'unseeded-agent', source: 'env-var'}, async () => {
            let err;
            try {
                await PermissionService.listPermissions();
            } catch (e) {
                err = e;
            }
            expect(err).toBeDefined();
            expect(err.message).toContain('Cannot list permissions: no agent identity context bound');
            expect(err.message).toContain('unseeded-agent'); // proves the rich helper, not the bare string
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
