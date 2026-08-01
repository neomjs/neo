import {setup} from '../../../../setup.mjs';

const appName = 'MailboxReceiptDurabilityTest';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import                            '../../../../../../src/manager/Instance.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

/**
 * A read receipt must not out-claim its durable write.
 *
 * `mark_read` / `archive_message` carry broadcast state on the per-recipient `DELIVERED_TO` edge
 * and direct-DM state on the shared `MESSAGE` node. Both mutations happen in memory first; their
 * receipts may claim unqualified success only after the matching carrier reached storage.
 *
 * These specs assert durability **against storage**, not against a spy: after the call they read
 * the matching node or edge back through `storage.loadNodeVicinitySync` (bypassing the in-memory
 * cache the mutation always updates), the only way to tell "persisted" from "looked persisted".
 */
test.describe.configure({mode: 'serial'});

test.describe('MailboxService — receipt durability cannot outrun the durable write (#15821, #15957)', () => {
    let MailboxService, GraphService, LifecycleService;
    let originalAutoSave;

    // Fixture-OWNED identities, not borrowed fleet members. This suite previously named
    // `@neo-opus-ada` / `@neo-opus-grace` — real identities it never created — so both send paths
    // depended on the ambient agent roster surviving whatever ran earlier in the worker:
    //
    //   `sendBroadcast` fans out over AgentIdentity nodes carrying `accountType: 'agent'`. An
    //   upstream spec that clears the graph empties that roster, `AGENT:*` reaches nobody, and the
    //   per-recipient DELIVERED_TO edge read back below is never written. It surfaced as "the
    //   receipt did not persist"; storage was never involved.
    //
    //   `sendDirect` is worse: `to: '@<identity>'` must resolve against a REGISTERED AgentIdentity
    //   node, so an empty roster fails that send outright rather than silently under-delivering.
    //
    // Seeding them here matches the sibling `MailboxService.spec.mjs`, which owns `@alice`/`@bob`
    // for exactly this reason. A test may only assert about identities it established.
    const SENDER    = '@receipt-durability-sender',
          RECIPIENT = '@receipt-durability-recipient';

    test.beforeAll(async () => {
        // No AiConfig mutation: what this suite discriminates is the SQLite storage boundary versus
        // the in-memory graph cache, NOT a file path. `storagePaths.graph` is a formula resolving
        // `graphTest` (`:memory:`) from `useUnitTestDatabase`/`UNIT_TEST_MODE` (configBase.mjs), so the
        // unit harness already hands this suite an isolated SQLite store by construction — and an
        // in-memory store is still storage, reached only via `loadNodeVicinitySync`. Writing the
        // shared config singleton here would leak this suite's state into every spec that reads it
        // afterwards — and would buy nothing the harness has not already provided.
        GraphService     = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService   = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }

        originalAutoSave = GraphService.db.autoSave;

        // Establish the endpoints this suite asserts about, so neither send path depends on the
        // ambient roster. `accountType: 'agent'` is what makes them broadcast-eligible.
        GraphService.upsertNode({id: SENDER,    type: 'AgentIdentity', name: 'Receipt Durability Sender',    properties: {accountType: 'agent'}});
        GraphService.upsertNode({id: RECIPIENT, type: 'AgentIdentity', name: 'Receipt Durability Recipient', properties: {accountType: 'agent'}});
    });

    test.afterAll(() => {
        // `autoSave` is `GraphService.db` instance state (not AiConfig) and the specs below toggle it,
        // so it is restored symmetrically. Nothing else needs teardown: the store is process-local
        // `:memory:`, so there is no file to unlink and no config path to hand back.
        if (GraphService?.db) {
            GraphService.db.autoSave = originalAutoSave;
        }

        // Remove exactly the two identities this suite created, and nothing else — left in place
        // they would add two recipients to every later `AGENT:*` fan-out in the worker, which is
        // the leave-state-behind defect this suite was itself a victim of.
        //
        // SCOPED removal, deliberately not a graph clear. Wholesale teardown was measured to be a
        // polluter in its own right — it empties the agent roster for every spec that follows in
        // the worker, which is what made this suite fail. Removing only what you created is the
        // opposite operation, not a smaller dose of the same one.
        //
        // UNGUARDED on purpose. `Database.removeNode` throws only on invalid input; removing an
        // absent-but-valid id is already a no-op, so there is no expected failure here to tolerate.
        // A catch would therefore suppress only real faults — invalid input, or a transaction/storage
        // failure — and each of those leaves two broadcast-eligible AgentIdentity rows in the shared
        // worker graph, joining every later `AGENT:*` fan-out. That is precisely the ambient-state
        // pollution this suite was a victim of, so swallowing it here would reintroduce the defect
        // from the teardown side.
        GraphService.removeNodes([SENDER, RECIPIENT]);
    });

    /** Reads the per-recipient DELIVERED_TO edge back FROM STORAGE, never from the in-memory cache. */
    const readReceiptFromStorage = (messageId, recipient) => {
        const vicinity = GraphService.db.storage.loadNodeVicinitySync([messageId]),
              edges    = vicinity?.edges || [];

        return edges.find(edge => {
            const source = edge.source ?? edge?.data?.source,
                  target = edge.target ?? edge?.data?.target,
                  type   = edge.type   ?? edge?.data?.type;

            return source === messageId && type === 'DELIVERED_TO' && target === recipient;
        }) || null;
    };

    /** Reads the direct-DM MESSAGE node back FROM STORAGE, never from the in-memory cache. */
    const readMessageFromStorage = messageId => {
        const vicinity = GraphService.db.storage.loadNodeVicinitySync([messageId]),
              nodes    = vicinity?.nodes || [];

        return nodes.find(node => (node.id ?? node?.data?.id) === messageId) || null;
    };

    const propertiesOf = record => {
        const raw = record?.properties ?? record?.data?.properties;

        return typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    };

    /** Sends a broadcast as SENDER so RECIPIENT gets a per-recipient DELIVERED_TO edge. */
    const sendBroadcast = async subject => {
        const sent = await RequestContextService.run({agentIdentityNodeId: SENDER}, () =>
            MailboxService.addMessage({to: 'AGENT:*', subject, body: 'receipt durability fixture'}));

        return sent.messageId;
    };

    /** Sends a direct message whose read/archive state rides the shared MESSAGE node. */
    const sendDirect = async subject => {
        const sent = await RequestContextService.run({agentIdentityNodeId: SENDER}, () =>
            MailboxService.addMessage({to: RECIPIENT, subject, body: 'direct receipt durability fixture'}));

        return sent.messageId;
    };

    /** Runs a mailbox call bound to RECIPIENT — identity is an AsyncLocalStorage scope, not a setter. */
    const asRecipient = callback => RequestContextService.run({agentIdentityNodeId: RECIPIENT}, callback);

    test('the receipt persists even with autoSave OFF — the gate was a category error', async () => {
        // `autoSave` exists to suppress LOAD-ECHO writes (bulk paths populating the cache FROM
        // storage). A read receipt is user-originated and can never be a load echo, so the old
        // gate silently discarded it. This is the assertion the fix exists for.
        const messageId = await sendBroadcast('durability: autoSave off');

        GraphService.db.autoSave = false;

        const receipt = await asRecipient(() => MailboxService.markRead({messageId}));

        expect(receipt.status).toBe('read');

        const stored = readReceiptFromStorage(messageId, RECIPIENT);

        expect(stored).not.toBeNull();
        // Read back from STORAGE: the in-memory edge always carries the readAt, so only this
        // discriminates a persisted mark from one that a restart would drop.
        expect(propertiesOf(stored).readAt).toBe(receipt.readAt);

        GraphService.db.autoSave = originalAutoSave;
    });

    test('the happy-path receipt shape is unchanged — no consumer sees a new field', async () => {
        // The fix must not alter what every existing caller already consumes.
        const messageId = await sendBroadcast('durability: happy path');

        GraphService.db.autoSave = true;

        const receipt = await asRecipient(() => MailboxService.markRead({messageId}));

        expect(Object.keys(receipt).sort()).toEqual(['messageId', 'readAt', 'status']);
        expect(receipt).not.toHaveProperty('durable');
        expect(receipt).not.toHaveProperty('warning');
        expect(propertiesOf(readReceiptFromStorage(messageId, RECIPIENT)).readAt).toBe(receipt.readAt);
    });

    test('a hydrated broadcast carrier persists its read state to storage', async () => {
        // Wake-subscription evaluation resolves delivery edges through Store#get(), which turns
        // their raw graph rows into Neo records before mark_read sees them. Exercise that live
        // representation explicitly: the raw-object setter path alone cannot prove this branch.
        const messageId = await sendBroadcast('durability: hydrated broadcast carrier');
        const stored    = readReceiptFromStorage(messageId, RECIPIENT);
        const edgeId    = stored?.id ?? stored?.data?.id;
        const hydrated  = GraphService.db.edges.get(edgeId);

        expect(hydrated?.isRecord).toBe(true);

        const receipt = await asRecipient(() => MailboxService.markRead({messageId}));

        expect(receipt.status).toBe('read');
        expect(propertiesOf(readReceiptFromStorage(messageId, RECIPIENT)).readAt).toBe(receipt.readAt);
    });

    test('with NO storage the receipt degrades honestly instead of asserting persistence', async () => {
        // The one state where the write genuinely cannot run. Previously indistinguishable from
        // success; now the caller is told, so a false ack is impossible rather than merely unlikely.
        const messageId   = await sendBroadcast('durability: no storage');
        const realStorage = GraphService.db.storage;

        try {
            GraphService.db.storage = null;

            const receipt = await asRecipient(() => MailboxService.markRead({messageId}));

            expect(receipt.durable).toBe(false);
            expect(receipt.warning).toMatch(/NOT persisted/);
            // The in-memory mutation is real for this process, so the readAt is still returned —
            // the receipt states exactly as much as it can back, and no more.
            expect(receipt.readAt).toBeTruthy();
        } finally {
            GraphService.db.storage = realStorage;
        }
    });

    test('archive_message carries the same fix — its write shape was identical', async () => {
        // `setDeliveryEdgeArchivedAt` mirrors the read setter by design and documents that mirroring,
        // so fixing only the read path would have left a documented twin defect behind.
        const messageId = await sendBroadcast('durability: archive twin');

        GraphService.db.autoSave = false;

        const receipt = await asRecipient(() => MailboxService.archiveMessage({messageId}));

        expect(receipt.status).toBe('archived');
        expect(propertiesOf(readReceiptFromStorage(messageId, RECIPIENT)).archivedAt).toBe(receipt.archivedAt);

        GraphService.db.autoSave = originalAutoSave;
    });

    test('archive degrades honestly with no storage too', async () => {
        const messageId   = await sendBroadcast('durability: archive no storage');
        const realStorage = GraphService.db.storage;

        try {
            GraphService.db.storage = null;

            const receipt = await asRecipient(() => MailboxService.archiveMessage({messageId}));

            expect(receipt.durable).toBe(false);
            expect(receipt.warning).toMatch(/archive_message/);
        } finally {
            GraphService.db.storage = realStorage;
        }
    });

    test('direct-DM mark_read persists with autoSave OFF and keeps the legacy receipt shape', async () => {
        const messageId = await sendDirect('durability: direct mark autoSave off');

        GraphService.db.autoSave = false;

        try {
            const receipt = await asRecipient(() => MailboxService.markRead({messageId}));

            expect(Object.keys(receipt).sort()).toEqual(['messageId', 'readAt', 'status']);
            expect(propertiesOf(readMessageFromStorage(messageId)).readAt).toBe(receipt.readAt);
        } finally {
            GraphService.db.autoSave = originalAutoSave;
        }
    });

    test('direct-DM mark_read degrades honestly with no storage', async () => {
        const messageId   = await sendDirect('durability: direct mark no storage');
        const realStorage = GraphService.db.storage;

        try {
            GraphService.db.storage = null;

            const receipt = await asRecipient(() => MailboxService.markRead({messageId}));

            expect(receipt.status).toBe('read');
            expect(receipt.durable).toBe(false);
            expect(receipt.warning).toMatch(/mark_read.*NOT persisted/);
        } finally {
            GraphService.db.storage = realStorage;
        }
    });

    test('direct-DM archive_message persists with autoSave OFF and keeps the legacy receipt shape', async () => {
        const messageId = await sendDirect('durability: direct archive autoSave off');

        GraphService.db.autoSave = false;

        try {
            const receipt = await asRecipient(() => MailboxService.archiveMessage({messageId}));

            expect(Object.keys(receipt).sort()).toEqual(['archivedAt', 'messageId', 'status']);
            expect(propertiesOf(readMessageFromStorage(messageId)).archivedAt).toBe(receipt.archivedAt);
        } finally {
            GraphService.db.autoSave = originalAutoSave;
        }
    });

    test('direct-DM archive_message degrades honestly with no storage', async () => {
        const messageId   = await sendDirect('durability: direct archive no storage');
        const realStorage = GraphService.db.storage;

        try {
            GraphService.db.storage = null;

            const receipt = await asRecipient(() => MailboxService.archiveMessage({messageId}));

            expect(receipt.status).toBe('archived');
            expect(receipt.durable).toBe(false);
            expect(receipt.warning).toMatch(/archive_message.*NOT persisted/);
        } finally {
            GraphService.db.storage = realStorage;
        }
    });
});
