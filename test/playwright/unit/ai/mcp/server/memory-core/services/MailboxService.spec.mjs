import {setup} from '../../../../../../setup.mjs';

const appName = 'MailboxServiceTest';

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

test.describe('Neo.ai.mcp.server.memory-core.services.MailboxService', () => {
    let MailboxService, GraphService, PermissionService, LifecycleService;
    
    test.beforeAll(async () => {
        // Load dynamically due to SQLite DB mount timing
        GraphService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        MailboxService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/MailboxService.mjs')).default;
        PermissionService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/PermissionService.mjs')).default;
        LifecycleService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;

        // Force in-memory DB config
        const aiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        aiConfig.storagePaths.graph = ':memory:';

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }
    });

    test.afterAll(async () => {
        // cleanup if needed
    });

    test.beforeEach(async () => {
        // Ensure a clean slate per test
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
            }
        }

        // Seed agents
        GraphService.upsertNode({ id: 'AGENT:alice', type: 'AGENT', name: 'Alice', properties: {} });
        GraphService.upsertNode({ id: 'AGENT:bob', type: 'AGENT', name: 'Bob', properties: {} });
        GraphService.upsertNode({ id: 'AGENT:*', type: 'AGENT', name: 'Broadcast', properties: {} });
    });

    test('addMessage enforces identity and routes correctly', async () => {
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_REPLY_TO' });
        });

        const promise = RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            return await MailboxService.addMessage({ to: 'AGENT:bob', subject: 'Hello', body: 'Test body' });
        });
        let res = await promise;
        
        expect(res.status).toBe('sent');
        expect(res.messageId).toMatch(/^MESSAGE:/);

        const node = GraphService.db.nodes.get(res.messageId);
        expect(node.properties.subject).toBe('Hello');

        // Verify edges
        let sentBy, sentTo;
        for (const edge of GraphService.db.edges.items) {
            if (edge.source === res.messageId) {
                if (edge.type === 'SENT_BY') sentBy = edge.target;
                if (edge.type === 'SENT_TO') sentTo = edge.target;
            }
        }
        expect(sentBy).toBe('AGENT:alice');
        expect(sentTo).toBe('AGENT:bob');
    });

    test('listMessages properly isolates by identity', async () => {
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_REPLY_TO' });
        });

        // Alice sends to Bob
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:bob', subject: 'To Bob', body: 'Secret' });
        });
        
        // Alice sends to Broadcast
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:*', subject: 'To All', body: 'Public' });
        });

        // Bob reads
        const bobRes = await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });
        
        expect(bobRes.messages.length).toBe(2);
        expect(bobRes.messages.find(m => m.subject === 'To Bob')).toBeDefined();
        expect(bobRes.messages.find(m => m.subject === 'To All')).toBeDefined();

        // Charlie (new agent) reads - should only see broadcast
        GraphService.upsertNode({ id: 'AGENT:charlie', type: 'AGENT', name: 'Charlie', properties: {} });
        const charlieRes = await RequestContextService.run({ agentIdentityNodeId: 'AGENT:charlie' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });
        
        expect(charlieRes.messages.length).toBe(1);
        expect(charlieRes.messages[0].subject).toBe('To All');
    });

    test('getMessage enforces read-path isolation', async () => {
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            const res = await MailboxService.addMessage({ to: 'AGENT:bob', subject: 'Private', body: '123' });
            msgId = res.messageId;
        });

        // Bob can read
        const bobRead = await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            return await MailboxService.getMessage({ messageId: msgId });
        });
        expect(bobRead.body).toBe('123');

        // Alice (sender) can read
        const aliceRead = await RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            return await MailboxService.getMessage({ messageId: msgId });
        });
        expect(aliceRead.body).toBe('123');

        // Charlie cannot read
        GraphService.upsertNode({ id: 'AGENT:charlie', type: 'AGENT', name: 'Charlie', properties: {} });
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:charlie' }, async () => {
            await expect(MailboxService.getMessage({ messageId: msgId })).rejects.toThrow(/Unauthorized/);
        });
    });

    test('markRead updates the readAt property', async () => {
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            const res = await MailboxService.addMessage({ to: 'AGENT:bob', subject: 'Private', body: '123' });
            msgId = res.messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            const res = await MailboxService.markRead({ messageId: msgId });
            expect(res.readAt).toBeTruthy();
        });

        const node = GraphService.db.nodes.get(msgId);
        expect(node.properties.readAt).toBeTruthy();
    });
});
