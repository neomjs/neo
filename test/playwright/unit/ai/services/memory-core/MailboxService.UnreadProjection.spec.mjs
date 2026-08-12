import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'MailboxUnreadProjectionTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import                            '../../../../../../src/manager/Instance.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

/**
 * The unread projection must observe a committed `mark_read`.
 *
 * Receipt state is STORAGE-owned, never cache-owned: every write path (`mark_read`, the repair
 * pass, `countMessages`, the wake digest's background reader) already treats the SQLite row as
 * the authority — except `listMessages`, which resolved the per-recipient `DELIVERED_TO` edge
 * through the in-memory source index and believed its `readAt: null` forever when that
 * projection diverged from storage on a long-lived plane. Two live witnesses: a receipt-confirmed
 * mark invisible to the unread list for 27+ minutes, and a one-call `get_message` vs
 * `list_messages` discriminator reproduced on the deployed plane.
 *
 * Arms 1-2 pin the healthy shapes (clean + re-hydrated lifecycles). Arms 3-4 inject the two
 * divergence pathologies directly — a stale cached property and a source-index eviction — and
 * assert the storage-truth merge overrides both. Arm 5 pins the count-stability contract.
 */
test.describe.configure({mode: 'serial'});

test.describe('MailboxService — unread projection observes a committed mark_read (#17030)', () => {
    let MailboxService, GraphService, LifecycleService;

    const SENDER    = '@unread-projection-sender',
          RECIPIENT = '@unread-projection-recipient';

    test.beforeAll(async () => {
        GraphService     = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService   = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }

        GraphService.upsertNode({id: SENDER,    type: 'AgentIdentity', name: 'Unread Projection Sender',    properties: {accountType: 'agent'}});
        GraphService.upsertNode({id: RECIPIENT, type: 'AgentIdentity', name: 'Unread Projection Recipient', properties: {accountType: 'agent'}});
    });

    test.afterAll(() => {
        GraphService.removeNodes([SENDER, RECIPIENT]);
    });

    const asRecipient = callback => RequestContextService.run({agentIdentityNodeId: RECIPIENT}, callback);

    const sendBroadcast = async subject => {
        const sent = await RequestContextService.run({agentIdentityNodeId: SENDER}, () =>
            MailboxService.addMessage({to: 'AGENT:*', subject, body: 'unread projection fixture'}));

        return sent.messageId;
    };

    const listUnread = () => asRecipient(() => MailboxService.listMessages({status: 'unread', limit: 500}));

    /** The cached per-recipient DELIVERED_TO edge, exactly as the in-memory projection holds it. */
    const cachedDeliveryEdge = messageId =>
        GraphService.db.edges.items.find(edge =>
            (edge.source ?? edge.get?.('source')) === messageId &&
            (edge.type   ?? edge.get?.('type'))   === 'DELIVERED_TO' &&
            (edge.target ?? edge.get?.('target')) === RECIPIENT);

    const readAtOf = edge => {
        const props = edge?.properties ?? edge?.get?.('properties');
        return (typeof props === 'string' ? JSON.parse(props) : props)?.readAt ?? null;
    };

    /** Mutates cache-only (autoSave off, the in-repo idiom) so storage keeps the committed truth. */
    const corruptCacheEdgeToUnread = (edge, readAtSnapshot) => {
        const db          = GraphService.db,
              wasAutoSave = db.autoSave;

        db.autoSave = false;

        try {
            const props = edge.properties ?? edge.get?.('properties'),
                  next  = {...(typeof props === 'string' ? JSON.parse(props) : props), readAt: readAtSnapshot};

            if (edge.isRecord) {
                edge.set({properties: next});
            } else {
                edge.properties = next;
            }
        } finally {
            db.autoSave = wasAutoSave;
        }
    };

    test('arm 1 — clean round-trip: send → mark → get + unread list agree', async () => {
        const messageId = await sendBroadcast('arm 1: clean round-trip');

        const before = await listUnread();
        expect(before.messages.some(m => m.messageId === messageId)).toBe(true);

        const receipt = await asRecipient(() => MailboxService.markRead({messageId}));
        expect(receipt.status).toBe('read');

        const fetched = await asRecipient(() => MailboxService.getMessage({messageId}));
        expect(fetched.readAt).toBe(receipt.readAt);

        const after = await listUnread();
        expect(after.messages.find(m => m.messageId === messageId),
            'a committed mark must leave the unread list').toBeUndefined();
    });

    test('arm 2 — cache-drop realism: drop the in-memory store, re-hydrate, then mark → list', async () => {
        const messageId = await sendBroadcast('arm 2: rehydrated round-trip');

        const db = GraphService.db;

        // The restart/resync shape: drop every cached row and all vicinity bookkeeping, then let
        // the next read re-hydrate from storage. Storage is the same :memory: SQLite, so only the
        // in-memory layer resets.
        db.edges.clearSilent();
        db.nodes.clearSilent();
        db.vicinityLoadedNodes.clear();
        db.lastSyncId = db.storage.getLatestLogId();

        const before = await listUnread();
        expect(before.messages.some(m => m.messageId === messageId)).toBe(true);

        const receipt = await asRecipient(() => MailboxService.markRead({messageId}));
        expect(receipt.status).toBe('read');

        const after = await listUnread();
        expect(after.messages.find(m => m.messageId === messageId),
            'a committed mark must leave the unread list after re-hydration too').toBeUndefined();
    });

    test('arm 3 — FALSIFIER: a stale cached readAt:null must not outvote the committed storage receipt', async () => {
        const messageId = await sendBroadcast('arm 3: stale cache property');

        const receipt = await asRecipient(() => MailboxService.markRead({messageId}));
        expect(receipt.status).toBe('read');

        // Inject the live-plane pathology: the cached projection reverts to the send-time null
        // while storage keeps the committed receipt (the durable divergence both seats measured).
        const edge = cachedDeliveryEdge(messageId);
        expect(edge, 'fixture must hold a cached delivery edge').toBeTruthy();
        expect(readAtOf(edge)).toBe(receipt.readAt);

        corruptCacheEdgeToUnread(edge, null);
        expect(readAtOf(edge), 'the corruption itself must be in place').toBeNull();

        const after = await listUnread();
        expect(after.messages.find(m => m.messageId === messageId),
            'storage truth wins over a stale cached projection').toBeUndefined();

        const fetched = await asRecipient(() => MailboxService.getMessage({messageId}));
        expect(fetched.readAt).toBe(receipt.readAt);
    });

    test('arm 4 — FALSIFIER: a stale twin shadowing the fresh edge in the source index must not win', async () => {
        const messageId = await sendBroadcast('arm 4: stale index twin');

        const receipt = await asRecipient(() => MailboxService.markRead({messageId}));
        expect(receipt.status).toBe('read');

        // Inject the live-plane pathology at index granularity: an older same-identity object with
        // the send-time `readAt: null` iterates FIRST in the source index Set, so the list loop's
        // first-match takes it while the map (and `get_message`) hold the fresh copy. A bare
        // eviction is NOT the pathology — with sibling recipients' edges still indexed the message
        // would vanish entirely rather than list as unread.
        const db   = GraphService.db,
              edge = cachedDeliveryEdge(messageId);

        expect(edge, 'fixture must hold a cached delivery edge').toBeTruthy();

        const sourceSet = db.edges.indexMaps.get('source')?.get(messageId);
        expect(sourceSet?.has(edge), 'the fresh edge must start indexed').toBe(true);

        const twin = {
            id        : edge.id ?? edge.get?.('id'),
            source    : messageId,
            target    : RECIPIENT,
            type      : 'DELIVERED_TO',
            properties: {deliveredAt: receipt.readAt, readAt: null, deliveryKind: 'broadcast'}
        };

        sourceSet.delete(edge);
        sourceSet.add(twin); // stale twin iterates first
        sourceSet.add(edge); // fresh copy still present, second

        const after = await listUnread();
        expect(after.messages.find(m => m.messageId === messageId),
            'storage truth wins over a stale twin at index first-match').toBeUndefined();
    });

    test('arm 5 — totalCount is stable across consecutive reads absent writes', async () => {
        const first  = await listUnread(),
              second = await listUnread();

        expect(second.totalCount).toBe(first.totalCount);
        expect(second.messages.map(m => m.messageId)).toEqual(first.messages.map(m => m.messageId));
    });
});
