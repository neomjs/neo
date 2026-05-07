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
import fs                    from 'fs-extra';
import path                  from 'path';
import Neo                   from '../../../../../../../../src/Neo.mjs';
import RequestContextService from '../../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

test.describe('Neo.ai.mcp.server.memory-core.services.MailboxService', () => {
    test.describe.configure({ mode: 'serial' });
    let MailboxService, GraphService, PermissionService, LifecycleService, buildMailboxDelta, originalAutoSave, mailboxAiConfig, originalMailboxPolicy;
    let dbPath;

    test.beforeAll(async () => {
        // Build an isolated tmp path for the database file tests
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        dbPath = path.join(tmpDir, `neo-mailbox-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        // Force temp file DB config instead of :memory: to prevent initialization race wipes
        mailboxAiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        mailboxAiConfig.storagePaths.graph = dbPath;

        // Load dynamically due to SQLite DB mount timing
        GraphService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        MailboxService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/MailboxService.mjs')).default;
        PermissionService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/PermissionService.mjs')).default;
        LifecycleService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;
        buildMailboxDelta = (await import('../../../../../../../../ai/mcp/server/memory-core/services/MemoryService.mjs')).buildMailboxDelta;

        // Pin this suite to strict-isolation mode (#10252). These tests predate the
        // config-gated default and assert `'blocked'`-mode behavior (Unauthorized
        // throws on ungranted DMs, reachable-counterparty trust-lift semantics).
        // Explicit pin preserves their invariants regardless of the library default
        // shipped in config.mjs. Symmetric restore in afterAll per symmetric-cleanup
        // discipline — Playwright `fullyParallel` interleaves across files even when
        // describe mode is `serial`, so cross-file mutation of the singleton Config
        // needs both-ends guards.
        mailboxAiConfig.data.mailbox ??= {};
        originalMailboxPolicy = mailboxAiConfig.data.mailbox.defaultReplyPolicy;
        mailboxAiConfig.data.mailbox.defaultReplyPolicy = 'blocked';

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }
        originalAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = true;
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('../util.mjs');
        await cleanupChromaManager();
        GraphService.db.autoSave = originalAutoSave;
        // Symmetric restore of the mailbox policy to whatever the library default
        // was before this suite ran.
        if (mailboxAiConfig?.data?.mailbox) {
            mailboxAiConfig.data.mailbox.defaultReplyPolicy = originalMailboxPolicy;
        }
        if (fs.existsSync(dbPath)) {
            try { fs.unlinkSync(dbPath); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-wal'); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-shm'); } catch (e) {}
        }
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
        GraphService.upsertNode({ id: '@alice', type: 'AGENT', name: 'Alice', properties: {} });
        GraphService.upsertNode({ id: '@bob', type: 'AGENT', name: 'Bob', properties: {} });
        GraphService.upsertNode({ id: 'AGENT:*', type: 'AGENT', name: 'Broadcast', properties: {} });
    });

    test('addMessage enforces identity and routes correctly', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const promise = RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.addMessage({ to: '@bob', subject: 'Hello', body: 'Test body' });
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
        expect(sentBy).toBe('@alice');
        expect(sentTo).toBe('@bob');
    });

    test('listMessages properly isolates by identity', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        // Alice sends to Bob
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'To Bob', body: 'Secret' });
        });
        
        // Alice sends to Broadcast
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:*', subject: 'To All', body: 'Public' });
        });

        // Bob reads
        const bobRes = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });
        
        expect(bobRes.messages.length).toBe(2);
        expect(bobRes.messages.find(m => m.subject === 'To Bob')).toBeDefined();
        expect(bobRes.messages.find(m => m.subject === 'To All')).toBeDefined();

        // Charlie (new agent) reads - should only see broadcast
        GraphService.upsertNode({ id: '@charlie', type: 'AGENT', name: 'Charlie', properties: {} });
        const charlieRes = await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });
        
        expect(charlieRes.messages.length).toBe(1);
        expect(charlieRes.messages[0].subject).toBe('To All');
    });

    test('getMessage enforces read-path isolation', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'Private', body: '123' });
            msgId = res.messageId;
        });

        // Bob can read
        const bobRead = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.getMessage({ messageId: msgId });
        });
        expect(bobRead.body).toBe('123');

        // Alice (sender) can read
        const aliceRead = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.getMessage({ messageId: msgId });
        });
        expect(aliceRead.body).toBe('123');

        // Charlie cannot read
        GraphService.upsertNode({ id: '@charlie', type: 'AGENT', name: 'Charlie', properties: {} });
        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await expect(MailboxService.getMessage({ messageId: msgId })).rejects.toThrow(/Unauthorized/);
        });
    });

    test('markRead updates the readAt property', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'Private', body: '123' });
            msgId = res.messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.markRead({ messageId: msgId });
            expect(res.readAt).toBeTruthy();
        });

        const node = GraphService.db.nodes.get(msgId);
        expect(node.properties.readAt).toBeTruthy();
    });

    test('listMessages outbox mode retrieves sent messages', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'Outbox Msg 1', body: '1' });
            await MailboxService.addMessage({ to: '@bob', subject: 'Outbox Msg 2', body: '2' });
            
            const outboxRes = await MailboxService.listMessages({ box: 'outbox' });
            expect(outboxRes.messages.length).toBe(2);
            expect(outboxRes.messages[0].from).toBe('@alice');
            expect(outboxRes.messages[0].to).toBe('@bob');
            
            const inboxRes = await MailboxService.listMessages({ box: 'inbox' });
            expect(inboxRes.messages.length).toBe(0);
        });
    });

    test('listMessages pagination (limit/offset) boundary', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            for (let i = 0; i < 5; i++) {
                const res = await MailboxService.addMessage({ to: '@bob', subject: `Msg ${i}`, body: '...' });
                GraphService.db.nodes.get(res.messageId).properties.sentAt = new Date(1000000000000 + i * 1000).toISOString();
            }
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
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

    test('listMessages filters by threadId and fromIdentity', async () => {
        GraphService.upsertNode({ id: '@charlie', type: 'AGENT', name: 'Charlie', properties: {} });
        GraphService.upsertNode({ id: 'thread-X', type: 'THREAD', name: 'Thread X', properties: {} });
        GraphService.upsertNode({ id: 'thread-Y', type: 'THREAD', name: 'Thread Y', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            await PermissionService.grantPermission({ to: '@charlie', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'A1', body: '...', partOfThread: 'thread-X' });
            await MailboxService.addMessage({ to: '@bob', subject: 'A2', body: '...', partOfThread: 'thread-Y' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'C1', body: '...', partOfThread: 'thread-X' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            // `fromIdentity` rather than `from` — the latter is blocked by AuthMiddleware
            // as a claim-of-authorship key. See #10174 and MailboxService JSDoc.
            const filterFrom = await MailboxService.listMessages({ fromIdentity: '@alice' });
            expect(filterFrom.messages.length).toBe(2);

            const filterThread = await MailboxService.listMessages({ threadId: 'thread-X' });
            expect(filterThread.messages.length).toBe(2);

            const filterBoth = await MailboxService.listMessages({ fromIdentity: '@alice', threadId: 'thread-X' });
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

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ 
                to: '@bob', 
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
        expect(node.properties.from).toBe('@alice');
        expect(node.properties.to).toBe('@bob');
        expect(node.properties.inReplyTo).toBe('MESSAGE:abc');
        expect(node.properties.partOfThread).toBe('THREAD:xyz');
        expect(node.properties.taggedConcepts).toEqual(['CONCEPT:test']);
        expect(node.properties.wakeSuppressed).toBe(false);

        let edges = GraphService.db.edges.items.filter(e => e.source === msgId);
        expect(edges.find(e => e.type === 'ORIGINATES_IN' && e.target === 'SESSION:123')).toBeDefined();
        expect(edges.find(e => e.type === 'RELATED_SESSION' && e.target === 'SESSION:456')).toBeDefined();
        expect(edges.find(e => e.type === 'REFERENCES_TICKET' && e.target === 'ISSUE:10168')).toBeDefined();
        expect(edges.find(e => e.type === 'IN_REPLY_TO' && e.target === 'MESSAGE:abc')).toBeDefined();
        expect(edges.find(e => e.type === 'PART_OF_THREAD' && e.target === 'THREAD:xyz')).toBeDefined();
        expect(edges.find(e => e.type === 'TAGGED_CONCEPT' && e.target === 'CONCEPT:test')).toBeDefined();
    });

    test('addMessage persists wakeSuppressed mailbox-only messages as unread inbox items', async () => {
        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to             : '@alice',
                subject        : 'Sunset handover',
                body           : 'handover payload',
                taggedConcepts : ['sunset-protocol-handover'],
                wakeSuppressed : true
            });
            msgId = res.messageId;

            const inbox = await MailboxService.listMessages({ status: 'unread' });
            expect(inbox.messages.map(msg => msg.messageId)).toContain(msgId);

            const message = await MailboxService.getMessage({ messageId: msgId });
            expect(message.wakeSuppressed).toBe(true);
            expect(message.readAt).toBeNull();
        });

        const node = GraphService.db.nodes.get(msgId);
        expect(node.properties.wakeSuppressed).toBe(true);
        expect(node.properties.taggedConcepts).toEqual(['sunset-protocol-handover']);
        expect(node.properties.from).toBe('@alice');
        expect(node.properties.to).toBe('@alice');
        expect(node.properties.readAt).toBeNull();
    });

    test('Reachable Counterparty exception permits replies without explicit grant', async () => {
        // Alice sends to Bob (alice can send to broadcast or we need to ensure alice can send)
        // Actually, to send initially, we need permission unless it is broadcast.
        // Let's grant Bob CAN_REPLY_TO Alice so Bob can start. No wait, Reachable Counterparty:
        // "if they ever sent us a message, we can reply"
        
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        // 1. Alice sends to Bob (allowed via explicit grant)
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'Hi Bob', body: 'body' });
        });

        // 2. Bob sends to Alice (no explicit grant, but Bob is replying to Alice)
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.addMessage({ to: '@alice', subject: 'Re: Hi Bob', body: 'body' });
            expect(res.status).toBe('sent');
        });
        
        // 3. Charlie tries to send to Alice (no grant, no history)
        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await expect(MailboxService.addMessage({ to: '@alice', subject: 'Spam', body: 'spam' })).rejects.toThrow(/Unauthorized/);
        });
    });

    test('#10179 broadcast recipient can DM-reply to broadcaster without explicit grant', async () => {
        // Bob broadcasts (always-permitted — broadcast bypasses the CAN_REPLY_TO gate).
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:*', subject: 'ping', body: 'body' });
        });

        // Alice — a broadcast recipient without explicit CAN_REPLY_TO — DM-replies to Bob.
        // Pre-fix, this was rejected with Unauthorized because the reachable-counterparty
        // iteration only matched SENT_TO edges whose target equaled the caller directly,
        // never the AGENT:* sentinel. Replicates the empirical 2026-04-22 Opus↔Gemini
        // handshake failure documented on PR #10177.
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'Re: ping', body: 'body' });
            expect(res.status).toBe('sent');
        });
    });

    test('#10179 unrelated broadcast does NOT grant DM access to non-broadcaster', async () => {
        GraphService.upsertNode({ id: '@ed', type: 'AGENT', name: 'Ed', properties: {} });

        // Ed broadcasts. Alice and Bob receive it but have no other substrate signal.
        await RequestContextService.run({ agentIdentityNodeId: '@ed' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:*', subject: 'from ed', body: 'body' });
        });

        // Alice tries to DM Bob — must still be rejected. Ed's broadcast grants DM access
        // *to Ed* for every authenticated recipient (per #10179 trust lift), but does not
        // transitively grant Alice reply-access to unrelated third parties. Validates the
        // guard's core invariant survives the broadcast-receipt extension.
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(MailboxService.addMessage({ to: '@bob', subject: 'Hi', body: 'body' })).rejects.toThrow(/Unauthorized/);
        });
    });

    test('Role-based addressing dispatch modes', async () => {
        GraphService.upsertNode({ id: 'role:librarian', type: 'ROLE', name: 'Librarian', properties: {} });
        GraphService.upsertNode({ id: 'human:tobiu', type: 'HUMAN', name: 'Tobias', properties: {} });

        // Any agent can dispatch to a role or human without CAN_REPLY_TO
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
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
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await expect(MailboxService.listMessages({ to: 'role:librarian' })).rejects.toThrow(/Unauthorized/);

            // Grant bob permission to read librarian role
            GraphService.linkNodes('@bob', 'role:librarian', 'CAN_READ_INBOX_OF', 1.0);

            const res = await MailboxService.listMessages({ to: 'role:librarian' });
            expect(res.messages.length).toBe(1);
            expect(res.messages[0].to).toBe('role:librarian');
        });
    });

    test('addMessage auto-emits TAGGED_CONCEPT edges via SemanticGraphExtractor', async () => {
        const SemanticGraphExtractor = (await import('../../../../../../../../ai/daemons/services/SemanticGraphExtractor.mjs')).default;

        // Mock the extractor to resolve immediately with predefined concepts
        const originalExtract = SemanticGraphExtractor.extractMessageConcepts;
        try {
            SemanticGraphExtractor.extractMessageConcepts = async (body) => {
                return ['CONCEPT:mcp-integration', 'CLASS:Neo.ai.mcp.server.memory-core.services.MailboxService'];
            };

            await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            });

            let msgId;
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({ to: '@bob', subject: 'Integration', body: 'Let us build MCP integrations' });
                msgId = res.messageId;
            });

            // The extractor runs asynchronously in a detached .then(), so we yield to the microtask queue
            await new Promise(resolve => setTimeout(resolve, 0));

            // Verify TAGGED_CONCEPT edges were created
            const edges = GraphService.db.edges.items.filter(e => e.source === msgId && e.type === 'TAGGED_CONCEPT');
            expect(edges.length).toBe(2);
            expect(edges.find(e => e.target === 'CONCEPT:mcp-integration')).toBeDefined();
            expect(edges.find(e => e.target === 'CLASS:Neo.ai.mcp.server.memory-core.services.MailboxService')).toBeDefined();

            // Verify nodes were created and have auto_extracted provenance
            const conceptNode = GraphService.db.nodes.get('CONCEPT:mcp-integration');
            expect(conceptNode).toBeDefined();
            expect(conceptNode.properties.auto_extracted).toBe(true);

        } finally {
            SemanticGraphExtractor.extractMessageConcepts = originalExtract;
        }
    });

    test('getHealthcheckPreview returns formatted mailbox metrics', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const m1 = await MailboxService.addMessage({ to: '@bob', subject: 'Msg 1', body: '...' });
            const m2 = await MailboxService.addMessage({ to: '@bob', subject: 'Msg 2', body: '...' });
            
            // artificially space them to ensure predictable sorting
            GraphService.db.nodes.get(m1.messageId).properties.sentAt = new Date(1000).toISOString();
            GraphService.db.nodes.get(m2.messageId).properties.sentAt = new Date(2000).toISOString();
        });

        // Test from Bob's perspective (Inbox)
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const preview = await MailboxService.getHealthcheckPreview();
            expect(preview.unreadCount).toBe(2);
            expect(preview.inbox.length).toBe(2);
            expect(preview.inbox[0].subject).toBe('Msg 2');
            expect(preview.outboxRecent.length).toBe(0);
        });

        // Test from Alice's perspective (Outbox)
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const preview = await MailboxService.getHealthcheckPreview();
            expect(preview.unreadCount).toBe(0);
            expect(preview.inbox.length).toBe(0);
            expect(preview.outboxRecent.length).toBe(2);
            expect(preview.outboxRecent[0].subject).toBe('Msg 2');
        });
        
        // Test no identity returns null
        const noIdentityPreview = await MailboxService.getHealthcheckPreview();
        expect(noIdentityPreview).toBeNull();
    });

    // ------------------------------------------------------------------
    // #10174 regression coverage — production-convention addressing
    //
    // The tests above use the `AGENT:<name>` test-fixture convention. Production seeds
    // AgentIdentity nodes under bare `@login` (per ai/scripts/seedAgentIdentities.mjs), and
    // `RequestContextService.getAgentIdentityNodeId()` returns that bare form. The divergence
    // between test and production conventions hid the SENT_TO cull bug for months — the
    // following block mirrors the REAL seed so end-to-end regressions catch it.
    // ------------------------------------------------------------------
    test.describe('#10174 production-convention addressing', () => {
        test.beforeEach(async () => {
            // Mirror the seedAgentIdentities.mjs convention + AGENT:* broadcast sentinel.
            GraphService.upsertNode({ id: '@opus',   type: 'AgentIdentity',     name: 'Opus',      properties: {} });
            GraphService.upsertNode({ id: '@gemini', type: 'AgentIdentity',     name: 'Gemini',    properties: {} });
            // (`AGENT:*` already seeded by the outer beforeEach — retained because production
            //  uses the same sentinel id and this test block validates its addressability.)
        });

        test('bare `@login` addressing persists SENT_TO edge and surfaces in inbox', async () => {
            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await PermissionService.grantPermission({ to: '@opus', scope: 'CAN_REPLY_TO' });
            });

            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                const res = await MailboxService.addMessage({ to: '@gemini', subject: 'direct ping', body: 'hello' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                // Core #10174 assertion: SENT_TO edge MUST persist. Pre-fix, GraphService.linkNodes
                // culled this silently because @gemini was a seeded AgentIdentity node — wait,
                // it should have worked. Actually: this specific case was the ONE that worked
                // pre-fix (bare `@login` IS the seeded form). The value of this test is as a
                // baseline against which the next two tests (`AGENT:@login` + `AGENT:*`) prove
                // the fix by not regressing what already worked.
                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                expect(sentToEdge.target).toBe('@gemini');
            });

            const inbox = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });
            expect(inbox.messages.length).toBe(1);
            expect(inbox.messages[0].subject).toBe('direct ping');
        });

        test('`AGENT:@login` prefixed form normalizes to bare `@login` SENT_TO target', async () => {
            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await PermissionService.grantPermission({ to: '@opus', scope: 'CAN_REPLY_TO' });
            });

            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                // The ambiguous tool-schema form — pre-fix, this was culled because the
                // literal 'AGENT:@gemini' string isn't a seeded node. Post-fix,
                // normalizeMailboxTarget strips the `AGENT:` prefix.
                const res = await MailboxService.addMessage({ to: 'AGENT:@gemini', subject: 'prefixed', body: 'body' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                // Must be the canonical bare `@login`, NOT the raw input `AGENT:@gemini`.
                expect(sentToEdge.target).toBe('@gemini');
            });

            // Recipient bound under bare `@gemini` sees the message via listMessages.
            const inbox = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });
            expect(inbox.messages.length).toBe(1);
            expect(inbox.messages[0].subject).toBe('prefixed');
        });

        test('#10259 missing `@` prefix auto-prepends to canonical `@login`', async () => {
            // The MORE COMMON typo case per tobi's polish request: author writes a bare
            // GitHub login (`gemini`) rather than the canonical `@`-prefixed form. Without
            // normalization, `linkNodes`' FK guard culls the SENT_TO edge because `gemini`
            // is not a seeded AgentIdentity node. With the prepend, it routes to the
            // canonical `@gemini` seed and the recipient sees the message.
            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await PermissionService.grantPermission({ to: '@opus', scope: 'CAN_REPLY_TO' });
            });

            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                const res = await MailboxService.addMessage({ to: 'gemini', subject: 'missing-prefix', body: 'body' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                // Must be the canonical `@`-prefixed form, NOT the raw bare input.
                expect(sentToEdge.target).toBe('@gemini');
            });

            const inbox = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });
            expect(inbox.messages.find(m => m.subject === 'missing-prefix')).toBeDefined();
        });

        test('#10259 missing-prefix normalization preserves canonical `@` and alternative schemes', async () => {
            // Load-bearing negative test: `@bob` should NOT be transformed to
            // `@@bob`. The `includes(':')` guard in normalizeMailboxTarget must
            // preserve the fixture path. Also covers `role:`/`human:` target patterns
            // by the same mechanism. Without this invariant, existing spec scenarios
            // seeded with `@alice` / `role:librarian` / `human:tobiu` would break.
            GraphService.upsertNode({ id: '@bob', type: 'AGENT', name: 'Bob', properties: {} });

            await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            });

            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({ to: '@bob', subject: 'fixture-preserved', body: 'body' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                expect(sentToEdge.target).toBe('@bob');  // unchanged
            });
        });

        test('#10259 accidental `@@login` double-prefix normalizes to canonical `@login`', async () => {
            // Defense-in-depth per #10259: if misformed automation or ID copy-paste
            // sends `to: '@@gemini'`, the normalizeMailboxTarget strip brings it back
            // to the canonical `@gemini` form before linkNodes' FK-style guard runs.
            // Without the strip, the SENT_TO edge gets culled because `@@gemini` is
            // not a seeded AgentIdentity node.
            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await PermissionService.grantPermission({ to: '@opus', scope: 'CAN_REPLY_TO' });
            });

            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                const res = await MailboxService.addMessage({ to: '@@gemini', subject: 'double-prefix', body: 'body' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                // Must be the canonical single-@ form, NOT the raw double-@ input.
                expect(sentToEdge.target).toBe('@gemini');
            });

            // Recipient bound under bare `@gemini` sees the message via listMessages.
            const inbox = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });
            expect(inbox.messages.find(m => m.subject === 'double-prefix')).toBeDefined();
        });

        test('`@me` alias normalizes to the sentBy identity (Future-Self Routing)', async () => {
            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                const res = await MailboxService.addMessage({ to: '@me', subject: 'note to self', body: 'body' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                expect(sentToEdge.target).toBe('@opus');
            });

            // Opus should see their own message in the inbox
            const inbox = await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });
            expect(inbox.messages.find(m => m.subject === 'note to self')).toBeDefined();
        });

        test('`@me` alias falls through when sentBy is absent', async () => {
            // Simulate missing identity context. The MailboxService guards against missing context
            // at the start of addMessage, so we expect an error to be thrown before normalization,
            // but if that guard is ever removed, the normalization safely falls through.
            await RequestContextService.run({ agentIdentityNodeId: null }, async () => {
                let error;
                try {
                    await MailboxService.addMessage({ to: '@me', subject: 'fallthrough', body: 'body' });
                } catch (e) {
                    error = e;
                }
                expect(error).toBeDefined();
                expect(error.message).toContain('no agent identity context bound');
            });
        });

        test('`AGENT:*` broadcast creates SENT_TO edge to the seeded sentinel and fans out', async () => {
            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                const res = await MailboxService.addMessage({ to: 'AGENT:*', subject: 'broadcast', body: 'body' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                // Pre-fix core bug: AGENT:* wasn't a seeded node, so linkNodes culled this edge,
                // and zero recipients saw the broadcast. Post-fix (seed script adds AGENT:* as
                // BroadcastSentinel), the edge persists and listMessages' `=== 'AGENT:*'` filter
                // fans it out to every authenticated inbox query.
                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                expect(sentToEdge.target).toBe('AGENT:*');
            });

            // Sender sees it in outbox
            const opusOutbox = await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                return await MailboxService.listMessages({ box: 'outbox' });
            });
            expect(opusOutbox.messages.length).toBe(1);

            // Every OTHER authenticated identity sees it in inbox via broadcast fan-out
            const geminiInbox = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });
            expect(geminiInbox.messages.length).toBe(1);
            expect(geminiInbox.messages[0].subject).toBe('broadcast');
        });

        test('buildMailboxDelta counts unread and surfaces latest preview for bound identity', async () => {
            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await PermissionService.grantPermission({ to: '@opus', scope: 'CAN_REPLY_TO' });
            });

            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                const first = await MailboxService.addMessage({ to: '@gemini', subject: 'one', body: '1' });
                // Force distinct sentAt so the ORDER BY ... LIMIT 1 is deterministic.
                GraphService.db.nodes.get(first.messageId).properties.sentAt = '2026-04-22T13:00:00.000Z';
                // Writes reflect through to SQLite via the upsert path used by addEdge → autoSave
                // but explicit properties updates need a direct storage push or we rely on the
                // in-memory store matching SQLite; since the test uses `:memory:` SQLite there's
                // no cross-process coherence to worry about.
                const second = await MailboxService.addMessage({ to: '@gemini', subject: 'two', body: '2' });
                GraphService.db.nodes.get(second.messageId).properties.sentAt = '2026-04-22T14:00:00.000Z';

                // Persist the patched sentAt to SQLite so the SELECT json_extract(...) read
                // matches. addMessage wrote the original sentAt; we patched the in-memory copy
                // but still need to write that through.
                GraphService.db.storage.db.prepare(`
                    UPDATE Nodes SET data = ? WHERE id = ?
                `).run(JSON.stringify(GraphService.db.nodes.get(first.messageId)),  first.messageId);
                GraphService.db.storage.db.prepare(`
                    UPDATE Nodes SET data = ? WHERE id = ?
                `).run(JSON.stringify(GraphService.db.nodes.get(second.messageId)), second.messageId);
            });

            const delta = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, () => {
                return buildMailboxDelta();
            });

            expect(delta).not.toBeNull();
            expect(delta.unreadCount).toBe(2);
            expect(delta.latestPreview).not.toBeNull();
            expect(delta.latestPreview.subject).toBe('two');  // newest-first ordering
            expect(delta.latestPreview.from).toBe('@opus');
            expect(delta.latestPreview.messageId).toMatch(/^MESSAGE:/);
        });

        test('buildMailboxDelta returns null when identity is unbound (single-tenant fallthrough)', async () => {
            // No agentIdentityNodeId = unbound context, the stdio single-tenant case.
            const delta = await RequestContextService.run({}, () => {
                return buildMailboxDelta();
            });
            expect(delta).toBeNull();
        });

        test('buildMailboxDelta includes broadcast messages in unread count for all recipients', async () => {
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                await MailboxService.addMessage({ to: 'AGENT:*', subject: 'hello all', body: 'broadcast body' });
            });

            // Gemini's delta counts the broadcast even though it wasn't directly addressed
            const delta = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, () => {
                return buildMailboxDelta();
            });
            expect(delta).not.toBeNull();
            expect(delta.unreadCount).toBe(1);
            expect(delta.latestPreview.subject).toBe('hello all');
        });

        test('BLOCKED_BY overrides CAN_REPLY_TO in blocked mode', async () => {
            // Bob grants Alice CAN_REPLY_TO
            await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
                // And then blocks her
                await PermissionService.grantPermission({ to: '@alice', scope: 'BLOCKED_BY' });
            });

            // Alice tries to DM Bob -> fails because BLOCKED_BY overrides
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                await expect(MailboxService.addMessage({ to: '@bob', subject: 'Fail', body: 'Blocked' }))
                    .rejects.toThrow('Unauthorized: @bob has blocked messages from @alice.');
            });

            // Broadcasts bypass BLOCKED_BY
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({ to: 'AGENT:*', subject: 'Broadcast', body: 'Passes' });
                expect(res.status).toBe('sent');
            });

            // Revoke the block
            await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                await PermissionService.revokePermission({ to: '@alice', scope: 'BLOCKED_BY' });
            });

            // Alice tries to DM Bob again -> succeeds because CAN_REPLY_TO remains
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({ to: '@bob', subject: 'Success', body: 'Unblocked' });
                expect(res.status).toBe('sent');
            });
        });
    });
});

/**
 * #10252: Mailbox reply policy — `'open'` mode behavior.
 *
 * Separate top-level describe so the config mutation + serial ordering are
 * self-contained. Mirrors the setup pattern of the parent suite (isolated tmp
 * SQLite + symmetric afterAll cleanup) but pins `defaultReplyPolicy: 'open'`
 * for the duration of these tests.
 *
 * Validates the three invariants of `'open'` mode:
 *   1. First-contact DM between two identities with no prior history and no
 *      `CAN_REPLY_TO` grant SUCCEEDS (the core UX deliverable).
 *   2. `PermissionService.grantPermission` remains callable and `CAN_REPLY_TO`
 *      edges remain graph-queryable — primitives unchanged, only enforcement
 *      path differs.
 *   3. Read-path scoping (`CAN_READ_INBOX_OF`) remains strict — reading
 *      another agent's inbox without a grant still throws Unauthorized.
 */
test.describe('Neo.ai.mcp.server.memory-core.services.MailboxService — open policy mode (#10252)', () => {
    test.describe.configure({ mode: 'serial' });
    let MailboxService, GraphService, PermissionService, LifecycleService, mailboxAiConfig, originalAutoSave, originalMailboxPolicy;
    let dbPath;

    test.beforeAll(async () => {
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        dbPath = path.join(tmpDir, `neo-mailbox-open-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        GraphService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        MailboxService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/MailboxService.mjs')).default;
        PermissionService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/PermissionService.mjs')).default;
        LifecycleService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;

        mailboxAiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        mailboxAiConfig.storagePaths.graph = dbPath;

        mailboxAiConfig.data.mailbox ??= {};
        originalMailboxPolicy = mailboxAiConfig.data.mailbox.defaultReplyPolicy;
        mailboxAiConfig.data.mailbox.defaultReplyPolicy = 'open';

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }
        originalAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = true;
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('../util.mjs');
        await cleanupChromaManager();
        GraphService.db.autoSave = originalAutoSave;
        if (mailboxAiConfig?.data?.mailbox) {
            mailboxAiConfig.data.mailbox.defaultReplyPolicy = originalMailboxPolicy;
        }
        if (fs.existsSync(dbPath)) {
            try { fs.unlinkSync(dbPath); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-wal'); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-shm'); } catch (e) {}
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
        GraphService.upsertNode({ id: '@charlie', type: 'AGENT', name: 'Charlie', properties: {} });
        GraphService.upsertNode({ id: 'AGENT:*', type: 'AGENT', name: 'Broadcast', properties: {} });
    });

    test('first-contact DM succeeds without grant or prior history', async () => {
        // Charlie sends to Alice with no CAN_REPLY_TO edge and no prior message history.
        // Strict mode would throw Unauthorized here (see the parent suite's Reachable-
        // Counterparty Trust test); open mode accepts the send.
        const res = await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, () => {
            return MailboxService.addMessage({ to: '@alice', subject: 'First contact', body: 'hi' });
        });

        expect(res.status).toBe('sent');
        expect(res.messageId).toMatch(/^MESSAGE:/);
    });

    test('grantPermission remains callable and edges remain graph-queryable', async () => {
        // Even in 'open' mode, operators can still explicitly grant CAN_REPLY_TO.
        // The edge is created and visible via listPermissions — only the enforcement
        // path on addMessage is bypassed.
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const result = await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            expect(result.success).toBe(true);
        });

        // Alice (the grantee) can list her capabilities and sees the grant.
        const perms = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, () => {
            return PermissionService.listPermissions();
        });

        expect(perms.capabilities).toContainEqual(expect.objectContaining({
            target: '@bob',
            scope : 'CAN_REPLY_TO'
        }));
    });

    test('read-path scoping stays strict — CAN_READ_INBOX_OF still enforced', async () => {
        // Bob sends Alice a message (allowed in open mode).
        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.addMessage({ to: '@alice', subject: 'inbox test', body: 'body' });
            msgId = res.messageId;
        });

        // Charlie tries to read Alice's inbox — should fail regardless of reply policy.
        // Open mode only relaxes the WRITE gate; read-path isolation is a separate
        // scope (`CAN_READ_INBOX_OF`) and stays strict per #10252's Out of Scope.
        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await expect(MailboxService.listMessages({ to: '@alice' })).rejects.toThrow(/Unauthorized/);
        });

        // Charlie also can't fetch the specific message by ID without the scope.
        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await expect(MailboxService.getMessage({ messageId: msgId })).rejects.toThrow(/Unauthorized/);
        });
    });

    test('broadcast sends and role/human targets behave identically in both modes', async () => {
        // Open mode does not change the always-allowed paths: broadcast sends,
        // self-sends, and role/human targets all continue to work regardless of policy.
        GraphService.upsertNode({ id: 'role:librarian', type: 'ROLE', name: 'Librarian', properties: {} });
        GraphService.upsertNode({ id: 'human:tobiu', type: 'HUMAN', name: 'Tobias', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const broadcast = await MailboxService.addMessage({ to: 'AGENT:*', subject: 'announce', body: 'body' });
            expect(broadcast.status).toBe('sent');

            const toRole = await MailboxService.addMessage({ to: 'role:librarian', subject: 'need book', body: 'body' });
            expect(toRole.status).toBe('sent');

            const toHuman = await MailboxService.addMessage({ to: 'human:tobiu', subject: 'fyi', body: 'body' });
            expect(toHuman.status).toBe('sent');
        });
    });

    test('BLOCKED_BY overrides default-allow in open mode', async () => {
        // Bob blocks Alice
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'BLOCKED_BY' });
        });

        // Alice tries to DM Bob -> fails because BLOCKED_BY overrides open mode default
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(MailboxService.addMessage({ to: '@bob', subject: 'Fail', body: 'Blocked' }))
                .rejects.toThrow('Unauthorized: @bob has blocked messages from @alice.');
        });

        // Bob can still DM Alice (directional block)
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.addMessage({ to: '@alice', subject: 'Passes', body: 'Directional' });
            expect(res.status).toBe('sent');
        });

        // Broadcasts bypass BLOCKED_BY
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: 'AGENT:*', subject: 'Broadcast', body: 'Passes' });
            expect(res.status).toBe('sent');
        });

        // Revoke the block
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.revokePermission({ to: '@alice', scope: 'BLOCKED_BY' });
        });

        // Alice tries to DM Bob again -> succeeds
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'Success', body: 'Unblocked' });
            expect(res.status).toBe('sent');
        });
    });

    // #10334 — A2A Task envelope primitive (Track 2 Phase 1).
    // Phase 1 stores the optional `task` field as opaque JSON and roundtrips it through
    // get_message + list_messages. State-machine semantics + RBAC enforcement layer on
    // top in Track 2B (#10338). Schema follows Option C hybrid: A2A spec subset + Neo
    // extensions (`expiresAt`, `Blocked`) per Discussion #10313 graduation. See
    // https://a2a-protocol.org/latest/specification/.
    test('#10334 task envelope: roundtrips through addMessage/getMessage/listMessages', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const taskPayload = {
            state: 'Submitted',
            input: {
                parts: [
                    { kind: 'text', text: 'Please review PR #N' },
                    { kind: 'data', data: { prNumber: 12345 } }
                ]
            },
            metadata: {
                sessionId: 'session-abc-123',
                relatedTickets: ['#10334', '#10311'],
                parentTask: null
            },
            expectedOutput: { shape: 'review', locationHint: 'post as PR comment' },
            budget: { deadline: '2026-04-30T00:00:00Z', maxTokens: 8000 },
            expiresAt: '2026-04-30T00:00:00Z'
        };

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to: '@bob',
                subject: 'Task delegation',
                body: 'See task envelope',
                task: taskPayload
            });
            msgId = res.messageId;
        });

        // Verify task stored on the MESSAGE node verbatim
        const node = GraphService.db.nodes.get(msgId);
        expect(node.properties.task).toEqual(taskPayload);

        // Verify getMessage returns task field
        const bobRead = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.getMessage({ messageId: msgId });
        });
        expect(bobRead.task).toEqual(taskPayload);
        expect(bobRead.body).toBe('See task envelope');

        // Verify listMessages includes task field in summary
        const bobList = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });
        const found = bobList.messages.find(m => m.messageId === msgId);
        expect(found).toBeDefined();
        expect(found.task).toEqual(taskPayload);
    });

    test('#10334 task envelope: backward-compatible — messages without task field unaffected', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to: '@bob', subject: 'Plain message', body: 'No task envelope'
            });
            msgId = res.messageId;
        });

        // Node should NOT have task property
        const node = GraphService.db.nodes.get(msgId);
        expect(node.properties.task).toBeUndefined();

        // getMessage return should NOT have task field
        const bobRead = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.getMessage({ messageId: msgId });
        });
        expect(bobRead.task).toBeUndefined();
        expect(bobRead.body).toBe('No task envelope');

        // listMessages summary should NOT have task field
        const bobList = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });
        const found = bobList.messages.find(m => m.messageId === msgId);
        expect(found.task).toBeUndefined();
    });
});

/**
 * #10338: A2A_TASK state-machine + transition authority + idempotency claim-and-lock
 */
test.describe('Neo.ai.mcp.server.memory-core.services.MailboxService — A2A_TASK (#10338)', () => {
    test.describe.configure({ mode: 'serial' });
    let MailboxService, GraphService, PermissionService, LifecycleService, mailboxAiConfig, originalAutoSave;
    let dbPath;

    test.beforeAll(async () => {
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        dbPath = path.join(tmpDir, `neo-mailbox-a2a-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        GraphService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        MailboxService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/MailboxService.mjs')).default;
        PermissionService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/PermissionService.mjs')).default;
        LifecycleService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;

        mailboxAiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        mailboxAiConfig.storagePaths.graph = dbPath;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }
        originalAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = true;
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('../util.mjs');
        await cleanupChromaManager();
        GraphService.db.autoSave = originalAutoSave;
        if (fs.existsSync(dbPath)) {
            try { fs.unlinkSync(dbPath); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-wal'); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-shm'); } catch (e) {}
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
        GraphService.upsertNode({ id: '@charlie', type: 'AGENT', name: 'Charlie', properties: {} });
        GraphService.upsertNode({ id: 'AGENT:*', type: 'AGENT', name: 'Broadcast', properties: {} });
        
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            await PermissionService.grantPermission({ to: '@charlie', scope: 'CAN_REPLY_TO' });
        });
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await PermissionService.grantPermission({ to: '@bob', scope: 'CAN_REPLY_TO' });
            await PermissionService.grantPermission({ to: '@charlie', scope: 'CAN_REPLY_TO' });
        });
    });

    test('addMessage and transitionTask enforce state enum validation', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(MailboxService.addMessage({
                to: '@bob', subject: 'task', body: 'body',
                task: { state: 'InvalidState' }
            })).rejects.toThrow(/Invalid task state: InvalidState/);
            
            const res = await MailboxService.addMessage({
                to: '@bob', subject: 'task', body: 'body',
                task: { state: 'Submitted' }
            });
            
            await expect(MailboxService.transitionTask({
                taskId: res.messageId, newState: 'AlsoInvalid'
            })).rejects.toThrow(/Invalid new task state: AlsoInvalid/);
        });
    });

    test('RBAC Matrix: Originator and Assignee authority', async () => {
        let msgId;
        // Alice creates task for Bob
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to: '@bob', subject: 'task', body: 'body',
                task: { state: 'Submitted' }
            });
            msgId = res.messageId;
        });

        // Bob (Assignee) can transition Submitted -> Working
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.transitionTask({ taskId: msgId, newState: 'Working' });
            expect(res.success).toBe(true);
            expect(res.task.state).toBe('Working');
        });

        // Bob (Assignee) can transition Working -> InputRequired
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.transitionTask({ taskId: msgId, newState: 'InputRequired' });
            expect(res.success).toBe(true);
            expect(res.task.state).toBe('InputRequired');
        });

        // Alice (Originator) can transition InputRequired -> Working
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.transitionTask({ taskId: msgId, newState: 'Working' });
            expect(res.success).toBe(true);
            expect(res.task.state).toBe('Working');
        });
        
        // Bob (Assignee) can transition Working -> Completed
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.transitionTask({ taskId: msgId, newState: 'Completed' });
            expect(res.success).toBe(true);
            expect(res.task.state).toBe('Completed');
        });

        // Test Canceled by Originator
        let msg2Id;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to: '@bob', subject: 'task2', body: 'body',
                task: { state: 'Submitted' }
            });
            msg2Id = res.messageId;
            
            const trans = await MailboxService.transitionTask({ taskId: msg2Id, newState: 'Canceled' });
            expect(trans.success).toBe(true);
            expect(trans.task.state).toBe('Canceled');
        });
        
        // Test Failed by Assignee
        let msg3Id;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to: '@bob', subject: 'task3', body: 'body',
                task: { state: 'Submitted' }
            });
            msg3Id = res.messageId;
        });
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.transitionTask({ taskId: msg3Id, newState: 'Working' });
            const trans = await MailboxService.transitionTask({ taskId: msg3Id, newState: 'Failed' });
            expect(trans.success).toBe(true);
            expect(trans.task.state).toBe('Failed');
        });
    });

    test('Unauthorized transition attempts throw errors', async () => {
        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to: '@bob', subject: 'task', body: 'body',
                task: { state: 'Submitted' }
            });
            msgId = res.messageId;
        });

        // Alice (Originator) cannot transition Submitted -> Working
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(MailboxService.transitionTask({ taskId: msgId, newState: 'Working' }))
                .rejects.toThrow(/Unauthorized: @alice as originator cannot transition/);
        });

        // Bob (Assignee) cannot transition Submitted -> Canceled
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await expect(MailboxService.transitionTask({ taskId: msgId, newState: 'Canceled' }))
                .rejects.toThrow(/Unauthorized: @bob as assignee cannot transition/);
        });

        // Charlie (Unrelated) cannot transition anything
        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await expect(MailboxService.transitionTask({ taskId: msgId, newState: 'Working' }))
                .rejects.toThrow(/Unauthorized: @charlie is neither originator nor assignee/);
        });
    });

    test('Optimistic concurrency (claim-and-lock) handles race conditions', async () => {
        let msgId;
        // Broadcast task -> ANY agent could potentially be assignee
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to: 'AGENT:*', subject: 'task', body: 'body',
                task: { state: 'Submitted' }
            });
            msgId = res.messageId;
        });

        // Bob claims it
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const resBob = await MailboxService.transitionTask({ taskId: msgId, newState: 'Working' });
            expect(resBob.success).toBe(true);
        });

        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            // Charlie thinks it's still 'Submitted' (by mutating local in-memory representation)
            const node = GraphService.db.nodes.get(msgId);
            node.properties.task.state = 'Submitted';

            // But DB actually has 'Working'. Charlie's UPDATE will have changes === 0
            const resCharlie = await MailboxService.transitionTask({ taskId: msgId, newState: 'Working' });

            expect(resCharlie.success).toBe(false);
            expect(resCharlie.reason).toMatch(/Race lost: state changed to Working/);
        });
    });
});

/**
 * #10339: TTL/Expired sweeper — cron-driven stale-task transition to Expired state.
 *
 * Maintenance-role bulk operation that complements the agent-flow `transitionTask` from
 * #10338. Tests the atomic `UPDATE-WHERE` semantics, idempotency, opt-in `expiresAt`
 * gating, terminal-state preservation, and bulk multi-state transition.
 */
test.describe('Neo.ai.mcp.server.memory-core.services.MailboxService — TTL Sweeper (#10339)', () => {
    test.describe.configure({ mode: 'serial' });
    let MailboxService, GraphService, PermissionService, LifecycleService, mailboxAiConfig, originalAutoSave;
    let dbPath;

    test.beforeAll(async () => {
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        dbPath = path.join(tmpDir, `neo-mailbox-ttl-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        GraphService      = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        MailboxService    = (await import('../../../../../../../../ai/mcp/server/memory-core/services/MailboxService.mjs')).default;
        PermissionService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/PermissionService.mjs')).default;
        LifecycleService  = (await import('../../../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;

        mailboxAiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        mailboxAiConfig.storagePaths.graph = dbPath;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }
        originalAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = true;
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('../util.mjs');
        await cleanupChromaManager();
        GraphService.db.autoSave = originalAutoSave;
        if (fs.existsSync(dbPath)) {
            try { fs.unlinkSync(dbPath); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-wal'); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-shm'); } catch (e) {}
        }
    });

    test.beforeEach(async () => {
        // Defensive: prior describe may have left autoSave false. Without it, upsertNode
        // mutations don't propagate to SQLite synchronously and downstream FK checks fail.
        GraphService.db.autoSave = true;

        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
            }
        }

        // Seed identities under a TTL-suite-local prefix so cross-describe interleaving
        // (Playwright `fullyParallel` interleaves across files even with `mode: 'serial'`
        // per memory `feedback_symmetric_spec_cleanup`) cannot corrupt this suite's seeds.
        // Sweep itself bypasses RBAC; we only need identities for `addMessage` to attach
        // SENT_BY/SENT_TO edges. Default policy is `'open'` outside the #10174 pin window,
        // so no `CAN_REPLY_TO` grants are required.
        GraphService.upsertNode({ id: '@ttl-alice', type: 'AGENT', name: 'TTL-Alice', properties: {} });
        GraphService.upsertNode({ id: '@ttl-bob',   type: 'AGENT', name: 'TTL-Bob',   properties: {} });
    });

    /**
     * Helper: seed a task with a chosen state and expiresAt via addMessage. Returns msgId.
     */
    async function seedTask({ from = '@ttl-alice', to = '@ttl-bob', state, expiresAt }) {
        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: from }, async () => {
            const task = { state };
            if (expiresAt !== undefined) task.expiresAt = expiresAt;
            const res = await MailboxService.addMessage({
                to, subject: `t-${state}-${Math.random().toString(36).slice(2,7)}`, body: 'body', task
            });
            msgId = res.messageId;
        });
        return msgId;
    }

    test('sweep transitions Submitted/Working/InputRequired tasks past expiresAt to Expired', async () => {
        const past = '2020-01-01T00:00:00Z';
        const submittedId      = await seedTask({ state: 'Submitted',     expiresAt: past });
        const workingId        = await seedTask({ state: 'Working',       expiresAt: past });
        const inputRequiredId  = await seedTask({ state: 'InputRequired', expiresAt: past });

        // Sanity: seeds visible in cache pre-sweep, with proper task envelope. Diagnostic
        // assertions catch cross-spec contamination (e.g., agent identity nodes leaking
        // into the SQLite store) where our seed addMessage calls would silently fail and
        // leave msgIds undefined.
        expect(submittedId).toMatch(/^MESSAGE:/);
        const submittedSqlite = GraphService.db.storage.db.prepare(
            `SELECT json_extract(data, '$.properties.task.state') as state,
                    json_extract(data, '$.properties.task.expiresAt') as expiresAt
             FROM Nodes WHERE id = ?`
        ).get(submittedId);
        expect(submittedSqlite.state).toBe('Submitted');
        expect(submittedSqlite.expiresAt).toBe(past);

        const result = await MailboxService.sweepExpiredTasks();

        expect(result.success).toBe(true);
        expect(result.sweptCount).toBe(3);

        for (const id of [submittedId, workingId, inputRequiredId]) {
            const node = GraphService.db.nodes.get(id);
            expect(node).toBeTruthy();
            expect(node.properties.task.state).toBe('Expired');
            expect(node.properties.lastModifiedAt).toBeTruthy();
        }
    });

    test('sweep skips tasks without expiresAt (TTL is opt-in)', async () => {
        const noTtlId = await seedTask({ state: 'Submitted' });

        const result = await MailboxService.sweepExpiredTasks();

        expect(result.sweptCount).toBe(0);
        const node = GraphService.db.nodes.get(noTtlId);
        expect(node.properties.task.state).toBe('Submitted');
    });

    test('sweep skips tasks with future expiresAt', async () => {
        const futureId = await seedTask({ state: 'Submitted', expiresAt: '2099-12-31T23:59:59Z' });

        const result = await MailboxService.sweepExpiredTasks();

        expect(result.sweptCount).toBe(0);
        const node = GraphService.db.nodes.get(futureId);
        expect(node.properties.task.state).toBe('Submitted');
    });

    test('sweep skips already-terminal tasks (idempotent across terminal states)', async () => {
        const past = '2020-01-01T00:00:00Z';
        // Each terminal state. Even if expiresAt is past, terminal tasks must not be re-swept.
        const completedId = await seedTask({ state: 'Completed', expiresAt: past });
        const canceledId  = await seedTask({ state: 'Canceled',  expiresAt: past });
        const failedId    = await seedTask({ state: 'Failed',    expiresAt: past });
        const expiredId   = await seedTask({ state: 'Expired',   expiresAt: past });

        const result = await MailboxService.sweepExpiredTasks();

        expect(result.sweptCount).toBe(0);

        const completedNode = GraphService.db.nodes.get(completedId);
        const canceledNode  = GraphService.db.nodes.get(canceledId);
        const failedNode    = GraphService.db.nodes.get(failedId);
        const expiredNode   = GraphService.db.nodes.get(expiredId);

        expect(completedNode.properties.task.state).toBe('Completed');
        expect(canceledNode.properties.task.state).toBe('Canceled');
        expect(failedNode.properties.task.state).toBe('Failed');
        expect(expiredNode.properties.task.state).toBe('Expired');
    });

    test('sweep is idempotent across consecutive cycles', async () => {
        const past = '2020-01-01T00:00:00Z';
        const id = await seedTask({ state: 'Submitted', expiresAt: past });

        const first = await MailboxService.sweepExpiredTasks();
        expect(first.sweptCount).toBe(1);

        // Second cycle — task is already Expired; no further work
        const second = await MailboxService.sweepExpiredTasks();
        expect(second.sweptCount).toBe(0);

        const node = GraphService.db.nodes.get(id);
        expect(node.properties.task.state).toBe('Expired');
    });

    test('sweep updates lastModifiedAt atomically with state', async () => {
        const past = '2020-01-01T00:00:00Z';
        const id = await seedTask({ state: 'Submitted', expiresAt: past });

        const before = new Date().toISOString();
        const result = await MailboxService.sweepExpiredTasks();
        const after  = new Date().toISOString();

        expect(result.sweptCount).toBe(1);

        const node = GraphService.db.nodes.get(id);
        expect(node.properties.task.state).toBe('Expired');
        expect(node.properties.lastModifiedAt).toBeTruthy();
        // lastModifiedAt MUST sit between the test boundaries — proves it was updated
        // by THIS sweep cycle, not seeded from addMessage (which has no lastModifiedAt).
        expect(node.properties.lastModifiedAt >= before).toBe(true);
        expect(node.properties.lastModifiedAt <= after).toBe(true);
    });

    test('sweep does not require an identity context (maintenance role bypasses RBAC)', async () => {
        const past = '2020-01-01T00:00:00Z';
        const id = await seedTask({ state: 'Submitted', expiresAt: past });

        // Run sweep WITHOUT a RequestContextService.run wrapper — proves identity binding
        // is not consulted. Mirrors the cron-process invocation (no MCP request context).
        const result = await MailboxService.sweepExpiredTasks();

        expect(result.success).toBe(true);
        expect(result.sweptCount).toBe(1);
        const node = GraphService.db.nodes.get(id);
        expect(node.properties.task.state).toBe('Expired');
    });

    test('sweep handles mixed cohort — terminal + active + opt-in/out + future expiresAt', async () => {
        const past   = '2020-01-01T00:00:00Z';
        const future = '2099-12-31T23:59:59Z';

        const expiredCandidate = await seedTask({ state: 'Working',  expiresAt: past   });
        const futureCandidate  = await seedTask({ state: 'Working',  expiresAt: future });
        const noTtl            = await seedTask({ state: 'Working' });
        const alreadyTerminal  = await seedTask({ state: 'Completed', expiresAt: past  });

        const result = await MailboxService.sweepExpiredTasks();

        // Only the expiredCandidate matches all WHERE clauses
        expect(result.sweptCount).toBe(1);
        expect(GraphService.db.nodes.get(expiredCandidate).properties.task.state).toBe('Expired');
        expect(GraphService.db.nodes.get(futureCandidate).properties.task.state).toBe('Working');
        expect(GraphService.db.nodes.get(noTtl).properties.task.state).toBe('Working');
        expect(GraphService.db.nodes.get(alreadyTerminal).properties.task.state).toBe('Completed');
    });
});
