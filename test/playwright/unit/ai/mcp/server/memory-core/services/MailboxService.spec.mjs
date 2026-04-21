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
    test.describe.configure({ mode: 'serial' });
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
        GraphService.db.autoSave = true;
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

    test('listMessages outbox mode retrieves sent messages', async () => {
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:bob', subject: 'Outbox Msg 1', body: '1' });
            await MailboxService.addMessage({ to: 'AGENT:bob', subject: 'Outbox Msg 2', body: '2' });
            
            const outboxRes = await MailboxService.listMessages({ box: 'outbox' });
            expect(outboxRes.messages.length).toBe(2);
            expect(outboxRes.messages[0].from).toBe('AGENT:alice');
            expect(outboxRes.messages[0].to).toBe('AGENT:bob');
            
            const inboxRes = await MailboxService.listMessages({ box: 'inbox' });
            expect(inboxRes.messages.length).toBe(0);
        });
    });

    test('listMessages pagination (limit/offset) boundary', async () => {
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            for (let i = 0; i < 5; i++) {
                await MailboxService.addMessage({ to: 'AGENT:bob', subject: `Msg ${i}`, body: '...' });
                await new Promise(r => setTimeout(r, 10)); // guarantee sorting order
            }
        });

        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            const page1 = await MailboxService.listMessages({ limit: 2, offset: 0 });
            expect(page1.messages.length).toBe(2);
            expect(page1.messages[0].subject).toBe('Msg 4'); // Sorted descending

            const page2 = await MailboxService.listMessages({ limit: 2, offset: 2 });
            expect(page2.messages.length).toBe(2);
            expect(page2.messages[0].subject).toBe('Msg 2');

            const page3 = await MailboxService.listMessages({ limit: 2, offset: 4 });
            expect(page3.messages.length).toBe(1);
            expect(page3.messages[0].subject).toBe('Msg 0');
        });
    });

    test('listMessages filters by threadId and from', async () => {
        GraphService.upsertNode({ id: 'AGENT:charlie', type: 'AGENT', name: 'Charlie', properties: {} });
        GraphService.upsertNode({ id: 'thread-X', type: 'THREAD', name: 'Thread X', properties: {} });
        GraphService.upsertNode({ id: 'thread-Y', type: 'THREAD', name: 'Thread Y', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_REPLY_TO' });
            await PermissionService.grantPermission({ to: 'AGENT:charlie', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:bob', subject: 'A1', body: '...', partOfThread: 'thread-X' });
            await MailboxService.addMessage({ to: 'AGENT:bob', subject: 'A2', body: '...', partOfThread: 'thread-Y' });
        });

        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:charlie' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:bob', subject: 'C1', body: '...', partOfThread: 'thread-X' });
        });

        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            const filterFrom = await MailboxService.listMessages({ from: 'AGENT:alice' });
            expect(filterFrom.messages.length).toBe(2);

            const filterThread = await MailboxService.listMessages({ threadId: 'thread-X' });
            expect(filterThread.messages.length).toBe(2);
            
            const filterBoth = await MailboxService.listMessages({ from: 'AGENT:alice', threadId: 'thread-X' });
            expect(filterBoth.messages.length).toBe(1);
            expect(filterBoth.messages[0].subject).toBe('A1');
        });
    });

    test('addMessage supports 6 new edge types and priority', async () => {
        GraphService.upsertNode({ id: 'SESSION:123', type: 'SESSION', name: 'S123', properties: {} });
        GraphService.upsertNode({ id: 'SESSION:456', type: 'SESSION', name: 'S456', properties: {} });
        GraphService.upsertNode({ id: 'ISSUE:10168', type: 'ISSUE', name: 'I10168', properties: {} });
        GraphService.upsertNode({ id: 'MESSAGE:abc', type: 'MESSAGE', name: 'MABC', properties: {} });
        GraphService.upsertNode({ id: 'THREAD:xyz', type: 'THREAD', name: 'TXYZ', properties: {} });
        GraphService.upsertNode({ id: 'CONCEPT:test', type: 'CONCEPT', name: 'CTest', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            const res = await MailboxService.addMessage({ 
                to: 'AGENT:bob', 
                subject: 'Rich semantics', 
                body: 'body',
                priority: 'high',
                originSessionId: 'SESSION:123',
                relatedSessions: ['SESSION:456'],
                relatedTickets: ['ISSUE:10168'],
                inReplyTo: 'MESSAGE:abc',
                partOfThread: 'THREAD:xyz',
                taggedConcepts: ['CONCEPT:test']
            });
            msgId = res.messageId;
            expect(res.priority).toBe('high');
        });

        const node = GraphService.db.nodes.get(msgId);
        expect(node.properties.priority).toBe('high');

        let edges = GraphService.db.edges.items.filter(e => e.source === msgId);
        expect(edges.find(e => e.type === 'ORIGINATES_IN' && e.target === 'SESSION:123')).toBeDefined();
        expect(edges.find(e => e.type === 'RELATED_SESSION' && e.target === 'SESSION:456')).toBeDefined();
        expect(edges.find(e => e.type === 'REFERENCES_TICKET' && e.target === 'ISSUE:10168')).toBeDefined();
        expect(edges.find(e => e.type === 'IN_REPLY_TO' && e.target === 'MESSAGE:abc')).toBeDefined();
        expect(edges.find(e => e.type === 'PART_OF_THREAD' && e.target === 'THREAD:xyz')).toBeDefined();
        expect(edges.find(e => e.type === 'TAGGED_CONCEPT' && e.target === 'CONCEPT:test')).toBeDefined();
    });

    test('Reachable Counterparty exception permits replies without explicit grant', async () => {
        // Alice sends to Bob (alice can send to broadcast or we need to ensure alice can send)
        // Actually, to send initially, we need permission unless it is broadcast.
        // Let's grant Bob CAN_REPLY_TO Alice so Bob can start. No wait, Reachable Counterparty:
        // "if they ever sent us a message, we can reply"
        
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await PermissionService.grantPermission({ to: 'AGENT:alice', scope: 'CAN_REPLY_TO' });
        });

        // 1. Alice sends to Bob (allowed via explicit grant)
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:bob', subject: 'Hi Bob', body: 'body' });
        });

        // 2. Bob sends to Alice (no explicit grant, but Bob is replying to Alice)
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            const res = await MailboxService.addMessage({ to: 'AGENT:alice', subject: 'Re: Hi Bob', body: 'body' });
            expect(res.status).toBe('sent');
        });
        
        // 3. Charlie tries to send to Alice (no grant, no history)
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:charlie' }, async () => {
            await expect(MailboxService.addMessage({ to: 'AGENT:alice', subject: 'Spam', body: 'spam' })).rejects.toThrow(/Unauthorized/);
        });
    });

    test('Role-based addressing dispatch modes', async () => {
        GraphService.upsertNode({ id: 'role:librarian', type: 'ROLE', name: 'Librarian', properties: {} });
        GraphService.upsertNode({ id: 'human:tobiu', type: 'HUMAN', name: 'Tobias', properties: {} });

        // Any agent can dispatch to a role or human without CAN_REPLY_TO
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:alice' }, async () => {
            await MailboxService.addMessage({ to: 'role:librarian', subject: 'Need book', body: 'body' });
            await MailboxService.addMessage({ to: 'human:tobiu', subject: 'Help', body: 'body' });
        });

        // Verify they were dispatched
        let librarianCount = 0;
        let humanCount = 0;
        for (const edge of GraphService.db.edges.items) {
            if (edge.type === 'SENT_TO') {
                if (edge.target === 'role:librarian') librarianCount++;
                if (edge.target === 'human:tobiu') humanCount++;
            }
        }
        expect(librarianCount).toBe(1);
        expect(humanCount).toBe(1);
        
        // Reading requires CAN_READ_INBOX_OF if the target isn't the caller
        await RequestContextService.run({ agentIdentityNodeId: 'AGENT:bob' }, async () => {
            await expect(MailboxService.listMessages({ to: 'role:librarian' })).rejects.toThrow(/Unauthorized/);
            
            // Grant bob permission to read librarian role
            GraphService.linkNodes('AGENT:bob', 'role:librarian', 'CAN_READ_INBOX_OF', 1.0);
            
            const res = await MailboxService.listMessages({ to: 'role:librarian' });
            expect(res.messages.length).toBe(1);
            expect(res.messages[0].to).toBe('role:librarian');
        });
    });
});

