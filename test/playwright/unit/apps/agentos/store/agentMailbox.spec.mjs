import {setup} from '../../../../setup.mjs';

const appName = 'AgentMailboxStoreTest';

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

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../../../src/Neo.mjs';
import * as core         from '../../../../../../src/core/_export.mjs';
import MailboxMessage    from '../../../../../../apps/agentos/model/MailboxMessage.mjs';
import AgentMailboxStore from '../../../../../../apps/agentos/store/AgentMailbox.mjs';

/**
 * The mailbox tab's data plane: a pane-owned Store of adapter-contract rows. These specs pin the
 * store against the FROZEN row shape the Fleet mailbox read adapter emits — the store must accept
 * those rows verbatim (frozen inputs cloned, never mutated), key by the durable messageId, and
 * render-order newest-first. Read-only discipline: replacing wholesale is the ONLY write idiom.
 */
test.describe('AgentOS.store.AgentMailbox — the mailbox tab data plane', () => {
    function frozenAdapterRows() {
        // exactly the adapter's createMirrorRow shape, frozen like the real snapshot
        return Object.freeze([Object.freeze({
            messageId     : 'MESSAGE:older',
            subject       : '[lane-claim] producer arc',
            from          : '@neo-opus-grace',
            recipientClass: 'broadcast',
            priority      : 'normal',
            status        : 'read',
            taskState     : null,
            partOfThread  : null,
            relatedTickets: [15271],
            wakeSuppressed: false,
            sentAt        : '2026-07-16T10:00:00.000Z',
            readAt        : '2026-07-16T10:05:00.000Z'
        }), Object.freeze({
            messageId     : 'MESSAGE:newer',
            subject       : '[review-verdict] terminal',
            from          : '@neo-gpt-emmy',
            recipientClass: 'agent',
            priority      : 'high',
            status        : 'unread',
            taskState     : 'Submitted',
            partOfThread  : 'THREAD:15238',
            relatedTickets: [15233, 15238],
            wakeSuppressed: false,
            sentAt        : '2026-07-16T12:00:00.000Z',
            readAt        : null
        })])
    }

    test('applySnapshotRows accepts the frozen adapter rows verbatim, keyed by messageId, newest first', () => {
        const store = Neo.create(AgentMailboxStore);
        const rows  = frozenAdapterRows();

        store.applySnapshotRows(rows);

        expect(store.getCount()).toBe(2);
        // the sorter renders flat-chrono newest-first regardless of input order
        expect(store.items[0].messageId).toBe('MESSAGE:newer');
        expect(store.items[1].messageId).toBe('MESSAGE:older');
        // keyProperty is mirrored on the STORE (collection default 'id' would shadow the model)
        expect(store.get('MESSAGE:newer').from).toBe('@neo-gpt-emmy');
        // adapter facts survive field-for-field
        const record = store.get('MESSAGE:newer');
        expect(record.subject).toBe('[review-verdict] terminal');
        expect(record.partOfThread).toBe('THREAD:15238');
        expect(record.relatedTickets).toEqual([15233, 15238]);
        expect(record.status).toBe('unread');
        expect(record.taskState).toBe('Submitted');
        expect(record.readAt).toBe(null);
        // the frozen input array was cloned, never mutated
        expect(Object.isFrozen(rows)).toBe(true);
        expect(rows[0].threadCollapsed).toBe(undefined);

        store.destroy()
    });

    test('a new snapshot replaces wholesale — rows are timestamped facts, not merge targets', () => {
        const store = Neo.create(AgentMailboxStore);

        store.applySnapshotRows(frozenAdapterRows());
        expect(store.getCount()).toBe(2);

        store.applySnapshotRows([{
            messageId     : 'MESSAGE:third',
            subject       : 'fresh snapshot',
            from          : '@neo-fable',
            recipientClass: 'agent',
            status        : 'unread',
            sentAt        : '2026-07-16T13:00:00.000Z'
        }]);

        expect(store.getCount()).toBe(1);
        expect(store.items[0].messageId).toBe('MESSAGE:third');
        // display state initializes fresh: thread heads start collapsed by model default
        expect(store.items[0].threadCollapsed).toBe(true);

        store.applySnapshotRows(null);
        expect(store.getCount()).toBe(0);

        store.destroy()
    });

    test('the model contract: durable key, view-owned collapse default, null-surviving typeless fields', () => {
        expect(MailboxMessage.config.keyProperty).toBe('messageId');

        const store = Neo.create(AgentMailboxStore);

        store.applySnapshotRows([{
            messageId     : 'MESSAGE:bare',
            subject       : 'minimal row',
            from          : '@neo-gpt',
            recipientClass: 'agent',
            status        : 'unread',
            sentAt        : '2026-07-16T09:00:00.000Z'
        }]);

        const record = store.get('MESSAGE:bare');

        // typeless defaults survive as null / model defaults — never coerced or guessed
        expect(record.taskState).toBe(null);
        expect(record.partOfThread).toBe(null);
        expect(record.readAt).toBe(null);
        expect(record.priority).toBe(null);
        expect(record.wakeSuppressed).toBe(false);
        expect(record.threadCollapsed).toBe(true);

        store.destroy()
    });
});
