import {setup} from '../../../../setup.mjs';

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

import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import                            '../../../../../../src/manager/Instance.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

test.describe.configure({ mode: 'serial' });

test.describe('Neo.ai.services.memory-core.MailboxService', () => {
    let MailboxService, GraphService, PermissionService, LifecycleService, SwarmHeartbeatService, buildMailboxDelta, originalAutoSave, mailboxAiConfig, originalMailboxPolicy, readWalMessages, readPendingMessageWalRecords;
    let dbPath, messageWalDir;

    test.beforeAll(async () => {
        // Build an isolated tmp path for the database file tests
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        dbPath = path.join(tmpDir, `neo-mailbox-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        // Force temp file DB config instead of :memory: to prevent initialization race wipes
        mailboxAiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        mailboxAiConfig.storagePaths.graph = dbPath;
        if (!mailboxAiConfig.collections) mailboxAiConfig.collections = {};
        mailboxAiConfig.collections.memory = `test-memory-${Date.now()}`;
        mailboxAiConfig.collections.session = `test-session-${Date.now()}`;

        // Load dynamically due to SQLite DB mount timing
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        PermissionService = (await import('../../../../../../ai/services/memory-core/PermissionService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        SwarmHeartbeatService = (await import('../../../../../../ai/daemons/orchestrator/services/SwarmHeartbeatService.mjs')).default;
        buildMailboxDelta = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).buildMailboxDelta;
        const messageWalStore = await import('../../../../../../ai/services/memory-core/helpers/messageWalStore.mjs');
        readWalMessages              = messageWalStore.readWalMessages;
        readPendingMessageWalRecords = messageWalStore.readPendingMessageWalRecords;
        messageWalDir                = mailboxAiConfig.messageWal.dir;

        // Pin this suite to strict-isolation mode. These tests predate the
        // config-gated default and assert `'blocked'`-mode behavior (Unauthorized
        // throws on ungranted DMs, reachable-counterparty trust-lift semantics).
        // Explicit pin preserves their invariants regardless of the library default
        // shipped in the canonical template. Symmetric restore in afterAll per symmetric-cleanup
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
        const { cleanupChromaManager } = await import('./util.mjs');
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
        fs.removeSync(messageWalDir);
    });

    test.beforeEach(async () => {
        // Ensure a clean slate per test
        MailboxService.clearRelatedPullRequestStateCache();
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
            }
        }
        fs.removeSync(messageWalDir);

        // Seed agents
        GraphService.upsertNode({ id: '@alice', type: 'AGENT', name: 'Alice', properties: {} });
        GraphService.upsertNode({ id: '@bob', type: 'AGENT', name: 'Bob', properties: {} });
        GraphService.upsertNode({ id: 'AGENT:*', type: 'BroadcastSentinel', name: 'Broadcast', properties: {} });
    });

    function persistMessageNode(messageId) {
        GraphService.db.storage.db.prepare(`
            UPDATE Nodes SET data = ? WHERE id = ?
        `).run(JSON.stringify(GraphService.db.nodes.get(messageId)), messageId);
    }

    function clearGraphCacheWithoutStorageMutation() {
        GraphService.db.nodes.clear();
        GraphService.db.edges.clear();
        GraphService.db.vicinityLoadedNodes.clear();
        GraphService.db.lastAccessMap.clear();
    }

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

        const records = await readWalMessages({dir: messageWalDir});
        expect(records).toHaveLength(1);
        expect(records[0].id).toBe(res.messageId);
        expect(records[0].message.properties.subject).toBe('Hello');
        expect(records[0].routing).toMatchObject({sentBy: '@alice', to: '@bob', senderUserId: 'alice'});

        const pending = await readPendingMessageWalRecords({dir: messageWalDir});
        expect(pending).toHaveLength(0);
    });

    test('addMessage stamps the normalized canonical user_id, keeping @-form only as the sender label (#13578)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.addMessage({ to: '@bob', subject: 'Canon', body: 'body' });
        });

        const node = GraphService.db.nodes.get(res.messageId);
        // The user_id isolation column is the normalized form (no @); `from` stays the @-form sender label.
        expect(node.properties.userId).toBe('alice');
        expect(node.properties.from).toBe('@alice');

        // The pre-set mailbox edges carry the normalized user_id too (they bypass upsertNode's default stamp).
        const sentByEdge = GraphService.db.edges.items.find(e => e.source === res.messageId && e.type === 'SENT_BY');
        expect(sentByEdge.properties.userId).toBe('alice');
    });

    test('addMessage accepts durably when a required SENT_TO projection edge is culled (#13891)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const originalLinkNodes = GraphService.linkNodes;

        try {
            GraphService.linkNodes = function(source, target, relationship, weight, properties) {
                if (relationship === 'SENT_TO') {
                    return;
                }

                return originalLinkNodes.call(GraphService, source, target, relationship, weight, properties);
            };

            const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return await MailboxService.addMessage({
                    to     : '@bob',
                    subject: 'culled route',
                    body   : 'body'
                });
            });

            expect(res.status).toBe('sent');
            expect(res.projectionStatus).toBe('pending');
            expect(res.messageId).toMatch(/^MESSAGE:/);

            const records = await readWalMessages({dir: messageWalDir});
            expect(records).toHaveLength(1);
            expect(records[0].id).toBe(res.messageId);
            expect(records[0].message.properties.subject).toBe('culled route');
            expect(records[0].routing.to).toBe('@bob');

            const pending = await readPendingMessageWalRecords({dir: messageWalDir});
            expect(pending.map(record => record.id)).toEqual([res.messageId]);
        } finally {
            GraphService.linkNodes = originalLinkNodes;
        }
    });

    test('drainPendingMessageGraphProjections replays pending direct MESSAGE rows idempotently (#13892)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const originalLinkNodes = GraphService.linkNodes;
        let   res;

        try {
            GraphService.linkNodes = function(source, target, relationship, weight, properties) {
                if (relationship === 'SENT_TO') {
                    return;
                }

                return originalLinkNodes.call(GraphService, source, target, relationship, weight, properties);
            };

            res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return await MailboxService.addMessage({
                    to     : '@bob',
                    subject: 'replay me',
                    body   : 'body'
                });
            });
        } finally {
            GraphService.linkNodes = originalLinkNodes;
        }

        expect(res.projectionStatus).toBe('pending');
        expect((await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).map(record => record.id)).toEqual([res.messageId]);

        const firstDrain = await MailboxService.drainPendingMessageGraphProjections({ids: [res.messageId]});
        expect(firstDrain).toEqual({pending: 1, projected: 1, failed: 0});

        const secondDrain = await MailboxService.drainPendingMessageGraphProjections({ids: [res.messageId]});
        expect(secondDrain).toEqual({pending: 0, projected: 0, failed: 0});

        const sentTo = GraphService.db.edges.items.find(edge =>
            edge.source === res.messageId &&
            edge.type === 'SENT_TO' &&
            edge.target === '@bob'
        );

        expect(sentTo).toBeDefined();
        expect(await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).toHaveLength(0);
    });

    test('listMessages/getMessage repair projected direct messages after graph row loss (#14426)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.addMessage({
                to     : '@bob',
                subject: 'repair row loss',
                body   : 'durable body'
            });
        });

        expect(await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).toHaveLength(0);

        GraphService.db.storage.db.prepare('DELETE FROM Nodes WHERE id = ?').run(res.messageId);
        clearGraphCacheWithoutStorageMutation();

        const bobInbox = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.listMessages({status: 'all'});
        });

        expect(bobInbox.messages.map(message => message.messageId)).toContain(res.messageId);

        const repairedMessage = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.getMessage({messageId: res.messageId});
        });

        expect(repairedMessage.subject).toBe('repair row loss');
        expect(repairedMessage.body).toBe('durable body');
        expect(repairedMessage.readAt).toBeNull();

        const repairCheck = await MailboxService.repairMessageGraphIntegrity({ids: [res.messageId]});
        expect(repairCheck).toMatchObject({scanned: 1, intact: 1, repaired: 0, failed: 0});
    });

    test('healthy reads and targeted getMessage repair do not open unrelated WAL segments (#14426)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.addMessage({
                to     : '@bob',
                subject: 'bounded repair',
                body   : 'target body'
            });
        });

        const unrelatedSegment = path.join(messageWalDir, 'message-wal-2001-01-01.jsonl');
        fs.ensureDirSync(unrelatedSegment);

        try {
            const healthyInbox = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.listMessages({status: 'all'});
            });
            expect(healthyInbox.messages.map(message => message.messageId)).toContain(res.messageId);

            const healthyCount = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.countMessages({status: 'all'});
            });
            expect(healthyCount.count).toBe(1);

            GraphService.db.storage.db.prepare('DELETE FROM Nodes WHERE id = ?').run(res.messageId);
            clearGraphCacheWithoutStorageMutation();

            const repairedMessage = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.getMessage({messageId: res.messageId});
            });

            expect(repairedMessage.subject).toBe('bounded repair');
            expect(repairedMessage.body).toBe('target body');
        } finally {
            fs.removeSync(unrelatedSegment);
        }
    });

    test('post-sync canary: accepted unread self-message survives destructive graph clear (#14426)', async () => {
        const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.addMessage({
                to     : '@me',
                subject: 'post-sync canary',
                body   : 'still here'
            });
        });

        expect(await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).toHaveLength(0);

        await GraphService.db.storage.clear();
        clearGraphCacheWithoutStorageMutation();

        const count = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.countMessages({status: 'unread'});
        });

        expect(count.count).toBe(1);

        const inbox = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.listMessages({status: 'unread'});
        });

        expect(inbox.messages).toHaveLength(1);
        expect(inbox.messages[0]).toMatchObject({
            messageId: res.messageId,
            subject  : 'post-sync canary',
            from     : '@alice',
            to       : '@alice',
            readAt   : null
        });

        const message = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.getMessage({messageId: res.messageId});
        });

        expect(message.body).toBe('still here');
        expect(message.readAt).toBeNull();
    });

    test('drainPendingMessageGraphProjections leaves failed required-edge replay pending (#13892)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const originalLinkNodes = GraphService.linkNodes;

        try {
            GraphService.linkNodes = function(source, target, relationship, weight, properties) {
                if (relationship === 'SENT_TO') {
                    return;
                }

                return originalLinkNodes.call(GraphService, source, target, relationship, weight, properties);
            };

            const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return await MailboxService.addMessage({
                    to     : '@bob',
                    subject: 'still pending',
                    body   : 'body'
                });
            });

            expect(res.projectionStatus).toBe('pending');

            const summary = await MailboxService.drainPendingMessageGraphProjections({ids: [res.messageId]});
            expect(summary).toEqual({pending: 1, projected: 0, failed: 1});
            expect((await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).map(record => record.id)).toEqual([res.messageId]);
        } finally {
            GraphService.linkNodes = originalLinkNodes;
        }
    });

    test('addMessage accepts durably when a required broadcast DELIVERED_TO projection edge is culled (#13891)', async () => {
        const originalLinkNodes = GraphService.linkNodes;

        try {
            GraphService.linkNodes = function(source, target, relationship, weight, properties) {
                if (relationship === 'DELIVERED_TO') {
                    return;
                }

                return originalLinkNodes.call(GraphService, source, target, relationship, weight, properties);
            };

            const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return await MailboxService.addMessage({
                    to     : 'AGENT:*',
                    subject: 'culled broadcast',
                    body   : 'body'
                });
            });

            expect(res.status).toBe('sent');
            expect(res.projectionStatus).toBe('pending');
            expect(res.messageId).toMatch(/^MESSAGE:/);

            const records = await readWalMessages({dir: messageWalDir});
            expect(records).toHaveLength(1);
            expect(records[0].id).toBe(res.messageId);
            expect(records[0].routing.to).toBe('AGENT:*');
            expect(records[0].routing.broadcastRecipients).toEqual(expect.arrayContaining(['@bob']));
        } finally {
            GraphService.linkNodes = originalLinkNodes;
        }
    });

    test('broadcast replay uses WAL send-time audience snapshot, not the current graph audience (#13892)', async () => {
        GraphService.upsertNode({ id: '@charlie', type: 'AGENT', name: 'Charlie', properties: {} });

        const originalLinkNodes = GraphService.linkNodes;
        let   res;

        try {
            GraphService.linkNodes = function(source, target, relationship, weight, properties) {
                if (relationship === 'DELIVERED_TO') {
                    return;
                }

                return originalLinkNodes.call(GraphService, source, target, relationship, weight, properties);
            };

            res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return await MailboxService.addMessage({
                    to     : 'AGENT:*',
                    subject: 'snapshot broadcast',
                    body   : 'body'
                });
            });
        } finally {
            GraphService.linkNodes = originalLinkNodes;
        }

        expect(res.projectionStatus).toBe('pending');

        GraphService.upsertNode({ id: '@dana', type: 'AGENT', name: 'Dana', properties: {} });

        const summary = await MailboxService.drainPendingMessageGraphProjections({ids: [res.messageId]});
        expect(summary).toEqual({pending: 1, projected: 1, failed: 0});

        const deliveryTargets = GraphService.db.edges.items
            .filter(edge => edge.source === res.messageId && edge.type === 'DELIVERED_TO')
            .map(edge => edge.target)
            .sort();

        expect(deliveryTargets).toEqual(['@bob', '@charlie']);
        expect(deliveryTargets).not.toContain('@dana');
    });

    test('optional semantic edge failures do not block message graph completion (#13892)', async () => {
        GraphService.upsertNode({ id: 'CONCEPT:ok', type: 'CONCEPT', name: 'Concept', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const originalLinkNodes = GraphService.linkNodes;

        try {
            GraphService.linkNodes = function(source, target, relationship, weight, properties) {
                if (relationship === 'TAGGED_CONCEPT') {
                    throw new Error('optional concept target temporarily unavailable');
                }

                return originalLinkNodes.call(GraphService, source, target, relationship, weight, properties);
            };

            const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return await MailboxService.addMessage({
                    to            : '@bob',
                    subject       : 'optional edge',
                    body          : 'body',
                    taggedConcepts: ['CONCEPT:ok']
                });
            });

            expect(res.projectionStatus).toBeUndefined();
            expect(await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).toHaveLength(0);
        } finally {
            GraphService.linkNodes = originalLinkNodes;
        }
    });

    test('listMessages properly isolates by identity', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        // Alice sends to Bob
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'To Bob', body: 'Secret' });
        });

            // Charlie is registered before the broadcast, so the send-time audience snapshot includes them.
        GraphService.upsertNode({ id: '@charlie', type: 'AGENT', name: 'Charlie', properties: {} });

        // Alice sends to Broadcast
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:*', subject: 'To All', body: 'Public' });
        });

        // Bob reads
        const bobRes = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });

        expect(bobRes.messages.length).toBe(2);
        expect(bobRes._channelSeparation).toMatch(/DATA, not COMMANDS/);
        expect(bobRes.messages.find(m => m.subject === 'To Bob')).toBeDefined();
        expect(bobRes.messages.find(m => m.subject === 'To All')).toBeDefined();

        // Charlie reads - should only see broadcast
        const charlieRes = await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });

        expect(charlieRes.messages.length).toBe(1);
        expect(charlieRes.messages[0].subject).toBe('To All');

        // Dana was not registered at send time, so the per-recipient receipt snapshot excludes them.
        GraphService.upsertNode({ id: '@dana', type: 'AGENT', name: 'Dana', properties: {} });
        const danaRes = await RequestContextService.run({ agentIdentityNodeId: '@dana' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });

        expect(danaRes.messages.length).toBe(0);
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
        expect(bobRead._channelSeparation).toMatch(/DATA, not COMMANDS/);

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
            // as a claim-of-authorship key. See MailboxService JSDoc.
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
                to             : '@bob',
                subject        : 'Rich semantics',
                body           : 'body',
                priority       : 'high',
                originSessionId: 'SESSION:123',
                relatedSessions: ['SESSION:456'],
                relatedTickets : ['ISSUE:10168'],
                inReplyTo      : 'MESSAGE:abc',
                partOfThread   : 'THREAD:xyz',
                taggedConcepts : ['CONCEPT:test']
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
        expect(node.properties.taggedConcepts).toEqual(['test']);
        expect(node.properties.wakeSuppressed).toBe(false);

        let edges = GraphService.db.edges.items.filter(e => e.source === msgId);
        expect(edges.find(e => e.type === 'ORIGINATES_IN' && e.target === 'SESSION:123')).toBeDefined();
        expect(edges.find(e => e.type === 'RELATED_SESSION' && e.target === 'SESSION:456')).toBeDefined();
        expect(edges.find(e => e.type === 'REFERENCES_TICKET' && e.target === 'ISSUE:10168')).toBeDefined();
        expect(edges.find(e => e.type === 'IN_REPLY_TO' && e.target === 'MESSAGE:abc')).toBeDefined();
        expect(edges.find(e => e.type === 'PART_OF_THREAD' && e.target === 'THREAD:xyz')).toBeDefined();
        expect(edges.find(e => e.type === 'TAGGED_CONCEPT' && e.target === 'test')).toBeDefined();
        expect(GraphService.db.nodes.get('test').properties.canonicalConceptId).toBe('test');

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const byLegacyFilter = await MailboxService.listMessages({
                status        : 'all',
                taggedConcepts: ['CONCEPT:test']
            });

            expect(byLegacyFilter.messages.map(message => message.messageId)).toContain(msgId);
        });
    });

    test('addMessage persists wakeSuppressed mailbox-only messages as unread inbox items', async () => {
        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to            : '@alice',
                subject       : 'Sunset handover',
                body          : 'handover payload',
                taggedConcepts: ['sunset-protocol-handover'],
                wakeSuppressed: true
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

    test('addMessage rejects wakeSuppressed known-actionable direct lifecycle messages', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(MailboxService.addMessage({
                to            : '@bob',
                subject       : '[review][REQUEST_CHANGES] #13290 — close-target gate',
                body          : 'This must wake the PR author.',
                wakeSuppressed: true
            })).rejects.toThrow(/Cannot suppress wake for actionable direct lifecycle subject/);

            await expect(MailboxService.addMessage({
                to            : '@bob',
                subject       : 'urgent direct escalation',
                body          : 'High-priority direct messages must wake.',
                priority      : 'high',
                wakeSuppressed: true
            })).rejects.toThrow(/Cannot suppress wake for high-priority direct message/);
        });

        expect(GraphService.db.nodes.items.filter(node =>
            node.label === 'MESSAGE' &&
            node.properties?.wakeSuppressed === true
        )).toHaveLength(0);
    });

    test('addMessage rejects wakeSuppressed [lane-claim] broadcasts AND direct claims (collision-prevention, #14100)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            // The core collision case: a wake-suppressed lane-claim BROADCAST. isAllowedWakeSuppression
            // used to green-light every AGENT:* broadcast, so the claim never woke a mid-session peer.
            await expect(MailboxService.addMessage({
                to            : 'AGENT:*',
                subject       : '[lane-claim] #99999 — extract the foo helper',
                body          : 'Claiming the foo leaf.',
                wakeSuppressed: true
            })).rejects.toThrow(/Cannot suppress wake for collision-prone \[lane-claim\]/);

            // A direct lane-claim is equally collision-prone — the guard is subject-based, not broadcast-only.
            await expect(MailboxService.addMessage({
                to            : '@bob',
                subject       : '[lane-claim] #99998 — the bar leaf',
                body          : 'Claiming bar.',
                wakeSuppressed: true
            })).rejects.toThrow(/Cannot suppress wake for collision-prone \[lane-claim\]/);
        });

        expect(GraphService.db.nodes.items.filter(node =>
            node.label === 'MESSAGE' &&
            node.properties?.wakeSuppressed === true
        )).toHaveLength(0);
    });

    test('addMessage still allows wakeSuppressed non-claim FYI/progress broadcasts (the scoping that avoids the blanket-ban trap)', async () => {
        let msgId;

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            // The guard is scoped to [lane-claim]: plain awareness/progress broadcasts stay suppressible,
            // so noise-reduction for true FYI is preserved (the blanket-ban the ticket explicitly avoids).
            const res = await MailboxService.addMessage({
                to            : 'AGENT:*',
                subject       : '[lifecycle] 3 approvals acked — merge-eligible',
                body          : 'FYI lane-progress, no claim.',
                wakeSuppressed: true
            });
            msgId = res.messageId;
        });

        const node = GraphService.db.nodes.get(msgId);
        expect(node.properties.wakeSuppressed).toBe(true);
    });

    test('addMessage preserves explicit mailbox-only wakeSuppressed exceptions', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const baton = await MailboxService.addMessage({
                to            : '@bob',
                subject       : '[handoff] Lead Role Baton',
                body          : 'fromLead: @alice\ntoLead: @bob',
                taggedConcepts: ['lead-role-baton'],
                wakeSuppressed: true
            });

            const audit = await MailboxService.addMessage({
                to            : '@bob',
                subject       : '[alert] critical: errorRate 0.9 over threshold 0.1 (tenant tenant-x)',
                body          : 'KB audit alert.',
                priority      : 'high',
                wakeSuppressed: true
            });

            // A [lane-claim] now always wakes (collision-prevention); a TRUE awareness broadcast uses a
            // non-claim tag (lane-progress / FYI / ack) and stays suppressible — the scoping the guard preserves.
            const awareness = await MailboxService.addMessage({
                to            : 'AGENT:*',
                subject       : '[lane-progress] #13295 — non-overlapping awareness',
                body          : 'Broadcast awareness only.',
                wakeSuppressed: true
            });

            expect((await MailboxService.getMessage({ messageId: baton.messageId })).wakeSuppressed).toBe(true);
            expect((await MailboxService.getMessage({ messageId: audit.messageId })).wakeSuppressed).toBe(true);
            expect((await MailboxService.getMessage({ messageId: awareness.messageId })).wakeSuppressed).toBe(true);
        });
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
            // handshake failure documented by the reachable-counterparty regression history.
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
            // *to Ed* for every authenticated recipient (per reachable-counterparty trust lift), but does not
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
        let humanCount     = 0;
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

    test('#10180 AC4: countMessages matches listMessages.length for small inbox', async () => {
        // Pin equivalence between the direct-SQL count and the in-memory listMessages
        // length so future drift between the two paths surfaces as a test failure.
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'count-1', body: '...' });
            await MailboxService.addMessage({ to: '@bob', subject: 'count-2', body: '...' });
            await MailboxService.addMessage({ to: '@bob', subject: 'count-3', body: '...' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const list  = await MailboxService.listMessages({ box: 'inbox', status: 'unread' });
            const count = await MailboxService.countMessages({ box: 'inbox', status: 'unread' });

            expect(count.count).toBe(list.messages.length);
            expect(count.count).toBe(3);

            const allList  = await MailboxService.listMessages({ box: 'inbox', status: 'all' });
            const allCount = await MailboxService.countMessages({ box: 'inbox', status: 'all' });
            expect(allCount.count).toBe(allList.messages.length);
        });
    });

    test('#10180 AC3: countMessages returns correct value for inbox depth > 100 (no silent cap)', async () => {
        // Regression for the original 100-cap proxy pattern: getHealthcheckPreview
        // previously fetched `listMessages({limit: 100})` and counted unreads. An inbox
        // with > 100 unread messages would silently under-report. countMessages must
        // return the true value via direct SQL.
        const RECIPIENT    = '@countmany-bob';
        const SENDER       = '@countmany-alice';
        const TARGET_DEPTH = 150;

        // Seed agent identities matching the production convention.
        GraphService.upsertNode({ id: RECIPIENT, type: 'AgentIdentity', name: 'CountManyBob',   properties: { accountType: 'agent' } });
        GraphService.upsertNode({ id: SENDER,    type: 'AgentIdentity', name: 'CountManyAlice', properties: { accountType: 'agent' } });

        await RequestContextService.run({ agentIdentityNodeId: RECIPIENT }, async () => {
            await PermissionService.grantPermission({ to: SENDER, scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: SENDER }, async () => {
            for (let i = 0; i < TARGET_DEPTH; i++) {
                await MailboxService.addMessage({ to: RECIPIENT, subject: `bulk-${i}`, body: '...' });
            }
        });

        await RequestContextService.run({ agentIdentityNodeId: RECIPIENT }, async () => {
            const result = await MailboxService.countMessages({ box: 'inbox', status: 'unread' });
            expect(result.count).toBe(TARGET_DEPTH);
            expect(result.count).toBeGreaterThan(100); // explicit anti-regression assertion vs old proxy

            // getHealthcheckPreview now uses countMessages — should also be uncapped.
            const preview = await MailboxService.getHealthcheckPreview();
            expect(preview.unreadCount).toBe(TARGET_DEPTH);
            expect(preview.inbox.length).toBe(3); // preview-surface limit unchanged
        });
    });

    test('#10180 AC1: countMessages outbox counts SENT_BY edges from caller', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'out-1', body: '...' });
            await MailboxService.addMessage({ to: '@bob', subject: 'out-2', body: '...' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const outbox = await MailboxService.countMessages({ box: 'outbox' });
            expect(outbox.count).toBe(2);
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const outbox = await MailboxService.countMessages({ box: 'outbox' });
            expect(outbox.count).toBe(0); // Bob hasn't sent any
        });
    });

    test('#10180 AC1: countMessages throws on unbound identity', async () => {
        await expect(MailboxService.countMessages({ box: 'inbox', status: 'unread' }))
            .rejects.toThrow(/no agent identity context bound/);
    });

    test('#10180 cycle-1 hardening: countMessages rejects unsupported box values explicitly', async () => {
        // Per review feedback: previously, `if (box === 'outbox') ... else ...`
        // silently aliased `box='all'` (deferred per PR body) AND any typo to the inbox query —
        // returning a plausible but partial-result count. This regression pins fail-fast semantics
        // on unsupported enums so callers see the deferred-vs-implemented boundary at call-time
        // rather than receiving silent partial-results.
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await expect(MailboxService.countMessages({ box: 'all' }))
                .rejects.toThrow(/unsupported box value 'all'/);
            await expect(MailboxService.countMessages({ box: 'unknown-typo' }))
                .rejects.toThrow(/unsupported box value 'unknown-typo'/);
            await expect(MailboxService.countMessages({ box: '' }))
                .rejects.toThrow(/unsupported box value/);

            // Sanity: supported values still work after the guard
            await expect(MailboxService.countMessages({ box: 'inbox' })).resolves.toMatchObject({ count: expect.any(Number) });
            await expect(MailboxService.countMessages({ box: 'outbox' })).resolves.toMatchObject({ count: expect.any(Number) });
        });
    });

    test('#10148 AC1+AC4: archiveMessage hides direct-DM from default listMessages; includeArchived surfaces', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let messageId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const m = await MailboxService.addMessage({ to: '@bob', subject: 'archive-me', body: 'body' });
            messageId = m.messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            // Pre-archive: appears in default listMessages
            const before = await MailboxService.listMessages({ box: 'inbox' });
            expect(before.messages.some(m => m.messageId === messageId)).toBe(true);

            // Archive it
            const archiveResult = await MailboxService.archiveMessage({ messageId });
            expect(archiveResult.status).toBe('archived');
            expect(archiveResult.archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp shape
            expect(archiveResult.messageId).toBe(messageId);

            // Default listMessages now excludes it
            const after = await MailboxService.listMessages({ box: 'inbox' });
            expect(after.messages.some(m => m.messageId === messageId)).toBe(false);

            // includeArchived: true surfaces it with archivedAt in summary
            const withArchived = await MailboxService.listMessages({ box: 'inbox', includeArchived: true });
            const archived     = withArchived.messages.find(m => m.messageId === messageId);
            expect(archived).toBeDefined();
            expect(archived.archivedAt).toBe(archiveResult.archivedAt);
        });
    });

    test('#13091: countMessages excludes archived direct-DMs by default', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let archivedId;

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            archivedId = (await MailboxService.addMessage({ to: '@bob', subject: 'done', body: 'body' })).messageId;
            await MailboxService.addMessage({ to: '@bob', subject: 'still-open', body: 'body' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.archiveMessage({ messageId: archivedId });

            const list = await MailboxService.listMessages({ box: 'inbox', status: 'unread' });
            expect(list.messages.map(msg => msg.messageId)).not.toContain(archivedId);

            const count = await MailboxService.countMessages({ box: 'inbox', status: 'unread' });
            expect(count.count).toBe(list.messages.length);
            expect(count.count).toBe(1);

            const withArchived = await MailboxService.countMessages({
                box            : 'inbox',
                status         : 'unread',
                includeArchived: true
            });
            expect(withArchived.count).toBe(2);

            const preview = await MailboxService.getHealthcheckPreview();
            expect(preview.unreadCount).toBe(1);
            expect(preview.inbox.map(msg => msg.id)).not.toContain(archivedId);
        });
    });

    test('#13091: countMessages excludes archived per-recipient broadcasts by default', async () => {
        const
            senderIdentity   = '@neo-mailbox-archive-broadcast-sender',
            archivedIdentity = '@neo-mailbox-archive-broadcast-recipient',
            unreadIdentity   = '@neo-mailbox-archive-broadcast-unread';

        GraphService.upsertNode({ id: senderIdentity,   type: 'AgentIdentity', name: 'ArchiveBroadcastSender',    properties: { accountType: 'agent' } });
        GraphService.upsertNode({ id: archivedIdentity, type: 'AgentIdentity', name: 'ArchiveBroadcastRecipient', properties: { accountType: 'agent' } });
        GraphService.upsertNode({ id: unreadIdentity,   type: 'AgentIdentity', name: 'ArchiveBroadcastUnread',    properties: { accountType: 'agent' } });

        let messageId;

        await RequestContextService.run({ agentIdentityNodeId: senderIdentity }, async () => {
            messageId = (await MailboxService.addMessage({ to: 'AGENT:*', subject: 'broadcast done', body: 'body' })).messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: archivedIdentity }, async () => {
            await MailboxService.archiveMessage({ messageId });

            const list = await MailboxService.listMessages({ box: 'inbox', status: 'unread' });
            expect(list.messages.map(msg => msg.messageId)).not.toContain(messageId);

            const count = await MailboxService.countMessages({ box: 'inbox', status: 'unread' });
            expect(count.count).toBe(0);

            const withArchived = await MailboxService.countMessages({
                box            : 'inbox',
                status         : 'unread',
                includeArchived: true
            });
            expect(withArchived.count).toBe(1);
        });

        await RequestContextService.run({ agentIdentityNodeId: unreadIdentity }, async () => {
            const count = await MailboxService.countMessages({ box: 'inbox', status: 'unread' });
            expect(count.count).toBe(1);
        });
    });

    test('#10148 AC1: archiveMessage rejects non-recipient (sender + third-party)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        // Seed a third-party identity
        GraphService.upsertNode({ id: '@carol-archive', type: 'AgentIdentity', name: 'Carol', properties: { accountType: 'agent' } });

        let messageId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const m = await MailboxService.addMessage({ to: '@bob', subject: 'not-yours-to-archive', body: '...' });
            messageId = m.messageId;
        });

        // Sender (Alice) cannot archive Bob's inbox copy
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(MailboxService.archiveMessage({ messageId })).rejects.toThrow(/Unauthorized.*not the recipient/);
        });

        // Third-party (Carol) cannot archive either
        await RequestContextService.run({ agentIdentityNodeId: '@carol-archive' }, async () => {
            await expect(MailboxService.archiveMessage({ messageId })).rejects.toThrow(/Unauthorized.*not the recipient/);
        });

        // Recipient (Bob) still can — sanity-check the permission gate is recipient-specific not just deny-by-default
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.archiveMessage({ messageId });
            expect(res.status).toBe('archived');
        });
    });

    test('#10148 AC2+AC3: deleteMessage sender-side retraction replaces subject + body with placeholder, preserves thread edges', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        // Seed a thread: original message + a reply that references it via inReplyTo
        let originalId, replyId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const original = await MailboxService.addMessage({ to: '@bob', subject: 'original-content', body: 'sensitive-original-body' });
            originalId = original.messageId;
            const reply = await MailboxService.addMessage({ to: '@bob', subject: 're: original', body: 'reply body', inReplyTo: originalId });
            replyId = reply.messageId;
        });

        // Sender (Alice) retracts the original
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const result = await MailboxService.deleteMessage({ messageId: originalId });
            expect(result.status).toBe('retracted');
            expect(result.retracted).toBe(true);
            expect(result.messageId).toBe(originalId);
        });

        // Direct node inspection: subject + bodyText overwritten; retracted flag set
        const node = GraphService.db.nodes.get(originalId);
        expect(node.properties.retracted).toBe(true);
        expect(node.properties.subject).toBe('[retracted by sender]');
        expect(node.properties.bodyText).toBe('[retracted by sender]');

        // Thread context preserved: SENT_BY + SENT_TO + reply's inReplyTo edges survive
        const edgesFromOriginal = [];
        const edgesToOriginal   = [];
        for (const e of GraphService.db.edges.items) {
            if (GraphService.db.edges.items.constructor) {} // no-op, shape sanity
            const src = e.isRecord ? e.get('source') : e.source;
            const tgt = e.isRecord ? e.get('target') : e.target;
            const typ = e.isRecord ? e.get('type')   : e.type;
            if (src === originalId) edgesFromOriginal.push({type: typ, target: tgt});
            if (tgt === originalId) edgesToOriginal.push({type: typ, source: src});
        }
        // SENT_BY → @alice + SENT_TO → @bob both still present
        expect(edgesFromOriginal.some(e => e.type === 'SENT_BY'   && e.target === '@alice')).toBe(true);
        expect(edgesFromOriginal.some(e => e.type === 'SENT_TO'   && e.target === '@bob')).toBe(true);
        // Reply's IN_REPLY_TO edge still points at the retracted original — thread context intact
        expect(edgesToOriginal.some(e => e.source === replyId && (e.type === 'IN_REPLY_TO' || e.type === 'inReplyTo'))).toBe(true);

        // Receiver views the retracted message with placeholder subject + retracted flag
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const list             = await MailboxService.listMessages({ box: 'inbox' });
            const retractedSummary = list.messages.find(m => m.messageId === originalId);
            expect(retractedSummary).toBeDefined();
            expect(retractedSummary.subject).toBe('[retracted by sender]');
            expect(retractedSummary.retracted).toBe(true);

            // getMessage returns placeholder body + subject too
            const full = await MailboxService.getMessage({ messageId: originalId });
            expect(full.subject).toBe('[retracted by sender]');
            expect(full.body).toBe('[retracted by sender]');
        });
    });

    test('#10148 AC2: deleteMessage rejects non-sender (recipient + third-party)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        // Seed third-party
        GraphService.upsertNode({ id: '@carol-delete', type: 'AgentIdentity', name: 'CarolDelete', properties: { accountType: 'agent' } });

        let messageId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const m = await MailboxService.addMessage({ to: '@bob', subject: 'not-yours-to-delete', body: '...' });
            messageId = m.messageId;
        });

        // Recipient (Bob) cannot retract — only the sender can
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await expect(MailboxService.deleteMessage({ messageId })).rejects.toThrow(/Unauthorized.*only the sender can retract/);
        });

        // Third-party (Carol) cannot retract
        await RequestContextService.run({ agentIdentityNodeId: '@carol-delete' }, async () => {
            await expect(MailboxService.deleteMessage({ messageId })).rejects.toThrow(/Unauthorized.*only the sender can retract/);
        });

        // Sender (Alice) still can — sanity-check permission gate is sender-specific
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.deleteMessage({ messageId });
            expect(res.status).toBe('retracted');
        });
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
    // Regression coverage — production-convention addressing
    //
    // The tests above use the `AGENT:<name>` test-fixture convention. Production seeds
    // AgentIdentity nodes under bare `@login` (per ai/scripts/setup/seedAgentIdentities.mjs), and
    // `RequestContextService.getAgentIdentityNodeId()` returns that bare form. The divergence
    // between test and production conventions hid the SENT_TO cull bug for months — the
    // following block mirrors the REAL seed so end-to-end regressions catch it.
    // ------------------------------------------------------------------
    test.describe('#10174 production-convention addressing', () => {
        test.beforeEach(async () => {
            // Mirror the seedAgentIdentities.mjs convention + AGENT:* broadcast sentinel.
            GraphService.upsertNode({ id: '@opus',   type: 'AgentIdentity', name: 'Opus',   properties: { accountType: 'agent' } });
            GraphService.upsertNode({ id: '@gemini', type: 'AgentIdentity', name: 'Gemini', properties: { accountType: 'agent' } });
            GraphService.upsertNode({ id: '@gpt',    type: 'AgentIdentity', name: 'GPT',    properties: { accountType: 'agent' } });
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

                // Core production-convention assertion: SENT_TO edge MUST persist. Pre-fix, GraphService.linkNodes
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

        test('additional Claude identity routes by canonical identity while family alias stays ambiguous', async () => {
            GraphService.upsertNode({
                id        : '@neo-opus-4-7',
                type      : 'AgentIdentity',
                name      : 'Claude Opus 4.7',
                properties: {accountType: 'agent', modelFamily: 'claude'}
            });
            GraphService.upsertNode({
                id        : '@neo-opus-grace',
                type      : 'AgentIdentity',
                name      : 'Neo Claude Opus',
                properties: {accountType: 'agent', modelFamily: 'claude'}
            });

            await RequestContextService.run({ agentIdentityNodeId: '@neo-opus-grace' }, async () => {
                await PermissionService.grantPermission({ to: '@neo-opus-4-7', scope: 'CAN_REPLY_TO' });
            });

            await RequestContextService.run({ agentIdentityNodeId: '@neo-opus-4-7' }, async () => {
                const res = await MailboxService.addMessage({
                    to     : '@neo-opus-grace',
                    subject: 'additional Claude direct ping',
                    body   : 'Canonical same-family Claude address must remain routable.'
                });

                expect(res.status).toBe('sent');
                await expect(MailboxService.addMessage({
                    to     : 'AGENT:claude/opus',
                    subject: 'ambiguous Claude ping',
                    body   : 'Family alias must fail closed once two Claude identities exist.'
                })).rejects.toThrow(/Ambiguous 'to' alias.*modelFamily='claude'/);
            });

            const inbox = await RequestContextService.run({ agentIdentityNodeId: '@neo-opus-grace' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });

            expect(inbox.messages.map(message => message.subject)).toContain('additional Claude direct ping');
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
            // Defense-in-depth: if misformed automation or ID copy-paste
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

                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                expect(sentToEdge.target).toBe('AGENT:*');

                const deliveryTargets = GraphService.db.edges.items
                    .filter(e => e.source === messageId && e.type === 'DELIVERED_TO')
                    .map(e => e.target)
                    .sort();

                expect(deliveryTargets).toEqual(expect.arrayContaining(['@gemini', '@gpt']));
                expect(deliveryTargets).not.toContain('@opus');
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

        test('#11029 broadcast markRead updates only the caller delivery receipt', async () => {
            const
                senderIdentity = '@neo-mailbox-markread-sender',
                readIdentity   = '@neo-mailbox-markread-reader',
                unreadIdentity = '@neo-mailbox-markread-unread';

            let messageId;

            GraphService.upsertNode({ id: senderIdentity, type: 'AgentIdentity', name: 'MarkReadSender', properties: { accountType: 'agent' } });
            GraphService.upsertNode({ id: readIdentity,   type: 'AgentIdentity', name: 'MarkReadReader', properties: { accountType: 'agent' } });
            GraphService.upsertNode({ id: unreadIdentity, type: 'AgentIdentity', name: 'MarkReadUnread', properties: { accountType: 'agent' } });

            await RequestContextService.run({ agentIdentityNodeId: senderIdentity }, async () => {
                const res = await MailboxService.addMessage({ to: 'AGENT:*', subject: 'receipt split', body: 'body' });
                messageId = res.messageId;
            });

            await RequestContextService.run({ agentIdentityNodeId: readIdentity }, async () => {
                const before = await MailboxService.listMessages({ status: 'unread' });
                expect(before.messages.map(msg => msg.messageId)).toContain(messageId);

                const read = await MailboxService.markRead({ messageId });
                expect(read.status).toBe('read');

                const after = await MailboxService.listMessages({ status: 'unread' });
                expect(after.messages.map(msg => msg.messageId)).not.toContain(messageId);

                const full = await MailboxService.getMessage({ messageId });
                expect(full.readAt).toBe(read.readAt);
            });

            const messageNode = GraphService.db.nodes.get(messageId);
            expect(messageNode.properties.readAt).toBeNull();

            const geminiDelivery = GraphService.db.edges.items.find(e =>
                e.source === messageId && e.type === 'DELIVERED_TO' && e.target === readIdentity
            );
            const gptDelivery = GraphService.db.edges.items.find(e =>
                e.source === messageId && e.type === 'DELIVERED_TO' && e.target === unreadIdentity
            );

            expect(geminiDelivery.properties.readAt).toBeTruthy();
            expect(gptDelivery.properties.readAt).toBeNull();

            const gptUnread = await RequestContextService.run({ agentIdentityNodeId: unreadIdentity }, async () => {
                return await MailboxService.listMessages({ status: 'unread' });
            });
            expect(gptUnread.messages.map(msg => msg.messageId)).toContain(messageId);

            const geminiDelta = await RequestContextService.run({ agentIdentityNodeId: readIdentity }, () => buildMailboxDelta());
            const gptDelta    = await RequestContextService.run({ agentIdentityNodeId: unreadIdentity }, () => buildMailboxDelta());
            expect(geminiDelta.unreadCount).toBe(0);
            expect(gptDelta.unreadCount).toBe(1);

            try {
                SwarmHeartbeatService.identity = readIdentity;
                expect(await SwarmHeartbeatService.getUnreadCount()).toBe(0);
                SwarmHeartbeatService.identity = unreadIdentity;
                expect(await SwarmHeartbeatService.getUnreadCount()).toBe(1);
            } finally {
                SwarmHeartbeatService.identity = null;
            }
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
                persistMessageNode(first.messageId);
                persistMessageNode(second.messageId);
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

        test('#13091: buildMailboxDelta excludes archived direct-DMs from count and preview', async () => {
            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await PermissionService.grantPermission({ to: '@opus', scope: 'CAN_REPLY_TO' });
            });

            let visibleId, archivedId;

            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                visibleId = (await MailboxService.addMessage({ to: '@gemini', subject: 'visible', body: '1' })).messageId;
                GraphService.db.nodes.get(visibleId).properties.sentAt = '2026-04-22T13:00:00.000Z';
                persistMessageNode(visibleId);

                archivedId = (await MailboxService.addMessage({ to: '@gemini', subject: 'archived-newer', body: '2' })).messageId;
                GraphService.db.nodes.get(archivedId).properties.sentAt = '2026-04-22T14:00:00.000Z';
                persistMessageNode(archivedId);
            });

            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await MailboxService.archiveMessage({ messageId: archivedId });

                const delta = buildMailboxDelta();

                expect(delta).not.toBeNull();
                expect(delta.unreadCount).toBe(1);
                expect(delta.latestPreview.messageId).toBe(visibleId);
                expect(delta.latestPreview.subject).toBe('visible');
            });
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

        test('#13091: buildMailboxDelta excludes archived per-recipient broadcasts', async () => {
            const
                senderIdentity   = '@neo-mailbox-delta-broadcast-sender',
                archivedIdentity = '@neo-mailbox-delta-broadcast-recipient',
                unreadIdentity   = '@neo-mailbox-delta-broadcast-unread';

            GraphService.upsertNode({ id: senderIdentity,   type: 'AgentIdentity', name: 'DeltaBroadcastSender',    properties: { accountType: 'agent' } });
            GraphService.upsertNode({ id: archivedIdentity, type: 'AgentIdentity', name: 'DeltaBroadcastRecipient', properties: { accountType: 'agent' } });
            GraphService.upsertNode({ id: unreadIdentity,   type: 'AgentIdentity', name: 'DeltaBroadcastUnread',    properties: { accountType: 'agent' } });

            let visibleId, archivedId;

            await RequestContextService.run({ agentIdentityNodeId: senderIdentity }, async () => {
                visibleId = (await MailboxService.addMessage({ to: 'AGENT:*', subject: 'visible broadcast', body: '1' })).messageId;
                GraphService.db.nodes.get(visibleId).properties.sentAt = '2026-04-22T13:00:00.000Z';
                persistMessageNode(visibleId);

                archivedId = (await MailboxService.addMessage({ to: 'AGENT:*', subject: 'archived broadcast', body: '2' })).messageId;
                GraphService.db.nodes.get(archivedId).properties.sentAt = '2026-04-22T14:00:00.000Z';
                persistMessageNode(archivedId);
            });

            await RequestContextService.run({ agentIdentityNodeId: archivedIdentity }, async () => {
                await MailboxService.archiveMessage({ messageId: archivedId });

                const delta = buildMailboxDelta();

                expect(delta).not.toBeNull();
                expect(delta.unreadCount).toBe(1);
                expect(delta.latestPreview.messageId).toBe(visibleId);
                expect(delta.latestPreview.subject).toBe('visible broadcast');
            });

            const unreadDelta = await RequestContextService.run({ agentIdentityNodeId: unreadIdentity }, () => buildMailboxDelta());
            expect(unreadDelta.unreadCount).toBe(2);
            expect(unreadDelta.latestPreview.messageId).toBe(archivedId);
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

    // ------------------------------------------------------------------
    // Reject or resolve invalid `to:` in add_message instead of silent null-storage.
    //
    // Pre-fix the canonical `to:` field accepted any string, and `GraphService.linkNodes`
    // silently culled the SENT_TO edge when the target did not match a registered Node.
    // The MESSAGE node still stored the malformed value in its `to:` property; the missing
    // edge surfaced as `to: null` in `get_message` reads. Result: orphan messages invisible
    // to the intended recipient, breaking cross-skill A2A coordination.
    //
    // `validateMailboxTarget` (introduced in this PR) gates the failure surface: targets
    // that don't resolve to a real graph node OR an unambiguous `AGENT:<family>/<model>`
    // alias against `AgentIdentity.modelFamily` are rejected with a clear error.
    // ------------------------------------------------------------------
    test.describe('#11417 add_message reject/resolve invalid `to:`', () => {
        test('rejects unrecognized AGENT:<family>/<model> alias with explicit error', async () => {
            await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            });

            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                await expect(MailboxService.addMessage({
                    to     : 'AGENT:nonsense/blob',
                    subject: 'Should reject',
                    body   : 'Pre-#11417 this stored as to: null and orphaned the message.'
                })).rejects.toThrow(/Unrecognized 'to' format.*AGENT:nonsense\/blob/);
            });
        });

        test('resolves AGENT:<family>/<model> alias when exactly one AgentIdentity matches', async () => {
            // Seed an AgentIdentity with a unique modelFamily so the alias-resolve path can hit.
            GraphService.upsertNode({
                id        : '@neo-test-agent',
                type      : 'AgentIdentity',
                name      : 'Test Agent',
                properties: { modelFamily: 'testfamily', accountType: 'agent' }
            });

            await RequestContextService.run({ agentIdentityNodeId: '@neo-test-agent' }, async () => {
                await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            });

            const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return MailboxService.addMessage({
                    to     : 'AGENT:testfamily/anymodel',
                    subject: 'Alias-resolve path',
                    body   : 'AGENT:<family>/<model> should resolve when unambiguous.'
                });
            });

            expect(res.status).toBe('sent');

            // Verify the SENT_TO edge points at the resolved canonical identity, not null.
            let sentTo;
            for (const edge of GraphService.db.edges.items) {
                if (edge.source === res.messageId && edge.type === 'SENT_TO') {
                    sentTo = edge.target;
                }
            }
            expect(sentTo).toBe('@neo-test-agent');

            // Verify the MESSAGE node's to: property also carries the resolved canonical form,
            // not the alias and not null.
            const messageNode = GraphService.db.nodes.get(res.messageId);
            expect(messageNode.properties.to).toBe('@neo-test-agent');
        });

        test('rejects ambiguous AGENT:<family>/<model> alias when multiple AgentIdentities match', async () => {
            // Seed two AgentIdentities with the same modelFamily so the alias-resolve path
            // finds multiple candidates and rejects rather than picking arbitrarily.
            GraphService.upsertNode({
                id        : '@neo-test-a',
                type      : 'AgentIdentity',
                name      : 'Test A',
                properties: { modelFamily: 'multifam', accountType: 'agent' }
            });
            GraphService.upsertNode({
                id        : '@neo-test-b',
                type      : 'AgentIdentity',
                name      : 'Test B',
                properties: { modelFamily: 'multifam', accountType: 'agent' }
            });

            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                await expect(MailboxService.addMessage({
                    to     : 'AGENT:multifam/anymodel',
                    subject: 'Ambiguous',
                    body   : 'Multiple AgentIdentities match modelFamily=multifam'
                })).rejects.toThrow(/Ambiguous 'to' alias.*multifam/);
            });
        });
    });
});

/**
 * Mailbox reply policy — `'open'` mode behavior.
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
test.describe('Neo.ai.services.memory-core.MailboxService — open policy mode (#10252)', () => {
    test.describe.configure({ mode: 'serial' });
    let MailboxService, GraphService, PermissionService, LifecycleService, mailboxAiConfig, originalAutoSave, originalMailboxPolicy;
    let dbPath;

    test.beforeAll(async () => {
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        dbPath = path.join(tmpDir, `neo-mailbox-open-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        PermissionService = (await import('../../../../../../ai/services/memory-core/PermissionService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        mailboxAiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
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
        const { cleanupChromaManager } = await import('./util.mjs');
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
        MailboxService.clearRelatedPullRequestStateCache();
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
        GraphService.upsertNode({ id: 'AGENT:*', type: 'BroadcastSentinel', name: 'Broadcast', properties: {} });
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
        // scope (`CAN_READ_INBOX_OF`) and stays strict per the reply-policy boundary.
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

    // A2A Task envelope primitive.
    // Phase 1 stores the optional `task` field as opaque JSON and roundtrips it through
    // get_message + list_messages. State-machine semantics + RBAC enforcement layer on
    // top in the task state-machine layer. Schema follows Option C hybrid: A2A spec subset + Neo
    // extensions (`expiresAt`, `Blocked`) per the originating Discussion graduation. See
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
                sessionId     : 'session-abc-123',
                relatedTickets: ['#10334', '#10311'],
                parentTask    : null
            },
            expectedOutput: { shape: 'review', locationHint: 'post as PR comment' },
            budget        : { deadline: '2026-04-30T00:00:00Z', maxTokens: 8000 },
            expiresAt     : '2026-04-30T00:00:00Z'
        };

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to     : '@bob',
                subject: 'Task delegation',
                body   : 'See task envelope',
                task   : taskPayload
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

    test('#13411 related PR state echo: getMessage/listMessages surface live state', async () => {
        const threadId = 'thread-related-pr-live-state';
        GraphService.upsertNode({ id: threadId, type: 'THREAD', name: 'Related PR live state', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const originalResolvePullRequestState = MailboxService.resolvePullRequestState,
            calls                             = [];

        MailboxService.resolvePullRequestState = async (number) => {
            calls.push(number);

            return number === 13411
                ? { ticket: '#13411', number, state: 'OPEN', mergedAt: null }
                : null
        };

        try {
            let msgId;
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({
                    to            : '@bob',
                    subject       : 'Review request',
                    body          : 'Please review the PR.',
                    partOfThread  : threadId,
                    relatedTickets: ['#13411', '#13412']
                });
                msgId = res.messageId;
            });

            const bobRead = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.getMessage({ messageId: msgId });
            });
            expect(bobRead.relatedTickets).toEqual(['#13411', '#13412']);
            expect(bobRead.relatedPullRequests).toEqual([
                { ticket: '#13411', number: 13411, state: 'OPEN', mergedAt: null }
            ]);

            const bobList = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.listMessages({ status: 'all', threadId });
            });
            const found = bobList.messages.find(m => m.messageId === msgId);
            expect(found.relatedTickets).toEqual(['#13411', '#13412']);
            expect(found.relatedPullRequests).toEqual([
                { ticket: '#13411', number: 13411, state: 'OPEN', mergedAt: null }
            ]);
            expect(calls).toEqual([13411, 13412]);
        } finally {
            MailboxService.resolvePullRequestState = originalResolvePullRequestState;
        }
    });

    test('#13411 related PR state echo: fetch failure omits echo but keeps message', async () => {
        const threadId = 'thread-related-pr-fetch-failure';
        GraphService.upsertNode({ id: threadId, type: 'THREAD', name: 'Related PR fetch failure', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const originalResolvePullRequestState = MailboxService.resolvePullRequestState;
        let   calls                           = 0;
        MailboxService.resolvePullRequestState = async () => {
            calls++;
            return null
        };

        try {
            let msgId;
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({
                    to            : '@bob',
                    subject       : 'Review request',
                    body          : 'Please review the PR.',
                    partOfThread  : threadId,
                    relatedTickets: ['#13411']
                });
                msgId = res.messageId;
            });

            const bobRead = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.getMessage({ messageId: msgId });
            });
            expect(bobRead.relatedTickets).toEqual(['#13411']);
            expect(bobRead.relatedPullRequests).toBeUndefined();
            expect(bobRead.body).toBe('Please review the PR.');

            const bobList = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.listMessages({ status: 'all', threadId });
            });
            const found = bobList.messages.find(m => m.messageId === msgId);
            expect(found.relatedPullRequests).toBeUndefined();
            expect(calls).toBe(1);
        } finally {
            MailboxService.resolvePullRequestState = originalResolvePullRequestState;
        }
    });

    test('#13411 related PR state echo: cloud deployment mode skips GitHub CLI resolution', async () => {
        const originalResolvePullRequestState = MailboxService.resolvePullRequestState,
            originalDeploymentMode            = mailboxAiConfig.orchestrator.deploymentMode;
        let calls = 0;

        MailboxService.resolvePullRequestState = async (number) => {
            calls++;
            return { ticket: `#${number}`, number, state: 'OPEN', mergedAt: null }
        };
        mailboxAiConfig.orchestrator.deploymentMode = 'cloud';

        try {
            const states = await MailboxService.resolveRelatedPullRequestStates(['#13411']);
            expect(states).toEqual([]);
            expect(calls).toBe(0);
        } finally {
            mailboxAiConfig.orchestrator.deploymentMode = originalDeploymentMode;
            MailboxService.resolvePullRequestState = originalResolvePullRequestState;
        }
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
 * A2A_TASK state-machine + transition authority + idempotency claim-and-lock
 */
test.describe('Neo.ai.services.memory-core.MailboxService — A2A_TASK (#10338)', () => {
    test.describe.configure({ mode: 'serial' });
    let MailboxService, GraphService, PermissionService, LifecycleService, mailboxAiConfig, originalAutoSave;
    let dbPath;

    test.beforeAll(async () => {
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        dbPath = path.join(tmpDir, `neo-mailbox-a2a-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        PermissionService = (await import('../../../../../../ai/services/memory-core/PermissionService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        mailboxAiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
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
        const { cleanupChromaManager } = await import('./util.mjs');
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
        GraphService.upsertNode({ id: 'AGENT:*', type: 'BroadcastSentinel', name: 'Broadcast', properties: {} });

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
                to  : '@bob', subject: 'task', body: 'body',
                task: { state: 'InvalidState' }
            })).rejects.toThrow(/Invalid task state: InvalidState/);

            const res = await MailboxService.addMessage({
                to  : '@bob', subject: 'task', body: 'body',
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
                to  : '@bob', subject: 'task', body: 'body',
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
                to  : '@bob', subject: 'task2', body: 'body',
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
                to  : '@bob', subject: 'task3', body: 'body',
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
                to  : '@bob', subject: 'task', body: 'body',
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
                to  : 'AGENT:*', subject: 'task', body: 'body',
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
 * TTL/Expired sweeper — cron-driven stale-task transition to Expired state.
 *
 * Maintenance-role bulk operation that complements the agent-flow `transitionTask` from
 * Tests the atomic `UPDATE-WHERE` semantics, idempotency, opt-in `expiresAt`
 * gating, terminal-state preservation, and bulk multi-state transition.
 */
test.describe('Neo.ai.services.memory-core.MailboxService — TTL Sweeper (#10339)', () => {
    test.describe.configure({ mode: 'serial' });
    let MailboxService, GraphService, PermissionService, LifecycleService, mailboxAiConfig, originalAutoSave;
    let dbPath;

    test.beforeAll(async () => {
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        dbPath = path.join(tmpDir, `neo-mailbox-ttl-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        GraphService      = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService    = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        PermissionService = (await import('../../../../../../ai/services/memory-core/PermissionService.mjs')).default;
        LifecycleService  = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        mailboxAiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
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
        const { cleanupChromaManager } = await import('./util.mjs');
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
            // SENT_BY/SENT_TO edges. Default policy is `'open'` outside the strict-isolation pin window,
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
        const past            = '2020-01-01T00:00:00Z';
        const submittedId     = await seedTask({ state: 'Submitted',     expiresAt: past });
        const workingId       = await seedTask({ state: 'Working',       expiresAt: past });
        const inputRequiredId = await seedTask({ state: 'InputRequired', expiresAt: past });

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
        const id   = await seedTask({ state: 'Submitted', expiresAt: past });

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
        const id   = await seedTask({ state: 'Submitted', expiresAt: past });

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
        const id   = await seedTask({ state: 'Submitted', expiresAt: past });

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
