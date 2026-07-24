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
 * `mark_read` / `archive_message` mutate the in-memory `DELIVERED_TO` edge unconditionally, then
 * persisted only when `db.autoSave` was set — while the tool returned `status: 'read'` either way.
 * An acknowledged write that was never persisted is a false receipt: the mark survives until the
 * process restarts and then silently reverts to unread.
 *
 * These specs assert durability **against storage**, not against a spy: after the call they read
 * the edge back through `storage.loadNodeVicinitySync` (bypassing the in-memory cache the mutation
 * always updates), which is the only way to tell "persisted" from "looked persisted".
 */
test.describe.configure({mode: 'serial'});

test.describe('MailboxService — receipt durability cannot outrun the durable write (#15821)', () => {
    let MailboxService, GraphService, LifecycleService;
    let originalAutoSave;

    const SENDER    = '@neo-opus-ada',
          RECIPIENT = '@neo-opus-grace';

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
    });

    test.afterAll(() => {
        // `autoSave` is `GraphService.db` instance state (not AiConfig) and the specs below toggle it,
        // so it is restored symmetrically. Nothing else needs teardown: the store is process-local
        // `:memory:`, so there is no file to unlink and no config path to hand back.
        if (GraphService?.db) {
            GraphService.db.autoSave = originalAutoSave;
        }
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

    const propertiesOf = edge => {
        const raw = edge?.properties ?? edge?.data?.properties;

        return typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    };

    /** Sends a broadcast as SENDER so RECIPIENT gets a per-recipient DELIVERED_TO edge. */
    const sendBroadcast = async subject => {
        const sent = await RequestContextService.run({agentIdentityNodeId: SENDER}, () =>
            MailboxService.addMessage({to: 'AGENT:*', subject, body: 'receipt durability fixture'}));

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
});
