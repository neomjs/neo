import {setup} from '../../../../../setup.mjs';

const appName = 'MailboxPaneTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../src/manager/Instance.mjs';
import MailboxPane     from '../../../../../../../apps/agentos/view/fleet/MailboxPane.mjs';

const CAPTURED_AT = '2026-07-16T12:00:00.000Z';
const NOW         = Date.parse('2026-07-16T12:00:30.000Z');

function wiredSnapshot(rows, page = {limit: 50, offset: 0, count: rows.length}) {
    return {
        capability: {source: 'memory-core:mailbox', state: 'wired', confidence: 'observed', capturedAt: CAPTURED_AT, reason: null},
        admission : {state: 'granted', viewerIdentity: '@tobiu', subjectAgentId: '@neo-opus-vega', checkedAt: CAPTURED_AT, reason: null},
        rows,
        page
    }
}

function row(overrides = {}) {
    return {
        messageId     : 'MESSAGE:base',
        subject       : 'a subject',
        from          : '@neo-gpt',
        recipientClass: 'agent',
        priority      : 'normal',
        status        : 'unread',
        taskState     : null,
        partOfThread  : null,
        relatedTickets: [],
        wakeSuppressed: false,
        sentAt        : '2026-07-16T11:00:00.000Z',
        readAt        : null,
        ...overrides
    }
}

function createPane(config = {}) {
    return Neo.create(MailboxPane, {
        appName,
        now: NOW,
        ...config
    })
}

test.describe('AgentOS.view.fleet.MailboxPane — the read-only S1 mailbox tab', () => {
    test('unobserved: no snapshot renders the honest not-wired state, never rows', () => {
        const pane = createPane();

        expect(pane.getPaneState()).toBe('unobserved');
        expect(pane.getReference('mailbox-state').text).toBe('Mailbox feed not wired');
        expect(pane.getReference('mailbox-state').hidden).toBeFalsy();
        expect(pane.getReference('mailbox-rows').hidden).toBe(true);
        expect(pane.getReference('mailbox-freshness').text).toBe('not observed — source not wired');
        expect(pane.store.getCount()).toBe(0);

        pane.destroy()
    });

    test('denied: a named denial carrying viewer + subject — never an empty-success', () => {
        const pane = createPane({
            snapshot: {
                capability: {state: 'degraded', confidence: 'none', capturedAt: CAPTURED_AT, reason: 'Unauthorized: no CAN_READ_INBOX_OF permission for @neo-opus-vega'},
                admission : {state: 'denied', viewerIdentity: '@neo-observer', subjectAgentId: '@neo-opus-vega', checkedAt: CAPTURED_AT, reason: 'Unauthorized: no CAN_READ_INBOX_OF permission for @neo-opus-vega'},
                rows      : [],
                page      : {limit: 50, offset: 0, count: 0}
            }
        });

        expect(pane.getPaneState()).toBe('denied');

        const stateCmp = pane.getReference('mailbox-state');
        expect(stateCmp.text).toContain('Access denied');
        expect(stateCmp.text).toContain('@neo-observer');
        expect(stateCmp.text).toContain('@neo-opus-vega');
        expect(stateCmp.cls).toContain('is-denied');
        // a denial NEVER shows a page window — that would fake a readable inbox
        expect(pane.getReference('mailbox-page').hidden).toBe(true);
        expect(pane.getReference('mailbox-rows').hidden).toBe(true);

        pane.destroy()
    });

    test('an unrecognized envelope fails CLOSED to unobserved — never a fabricated empty inbox', () => {
        // `empty` is a claim about the SUBJECT'S MAIL ("No active messages for @x") and may only be
        // made when the producer actually said so. A torn/unknown payload has no rows either, so a
        // bare length check renders a confident, honest-LOOKING empty inbox out of something the
        // pane never understood — the exact fail-open this pane's four honest states exist to kill.
        const unrecognized = [
            {},
            {capability: {state: 'wired'}},                       // producer half-answered
            {rows: null},                                         // torn
            {rows: 'MESSAGE:not-an-array'},                       // wrong type
            {admission: {state: 'granted'}, page: {limit: 50}}    // envelope without the rows array
        ];

        unrecognized.forEach(snapshot => {
            const pane = createPane({snapshot});

            expect(pane.getPaneState(), JSON.stringify(snapshot)).toBe('unobserved');
            expect(pane.getReference('mailbox-state').text).toContain('not wired');
            expect(pane.getReference('mailbox-rows').hidden).toBe(true);

            pane.destroy()
        });

        // the producer's OWN empty answer is still explicitly empty — the guard must not swallow it
        const honest = createPane({snapshot: {
            capability: {state: 'wired', confidence: 'observed', capturedAt: CAPTURED_AT, reason: null},
            admission : {state: 'granted', viewerIdentity: '@tobiu', subjectAgentId: '@neo-gpt', checkedAt: CAPTURED_AT, reason: null},
            page      : {limit: 50, offset: 0, count: 0},
            rows      : []
        }});

        expect(honest.getPaneState()).toBe('empty');
        honest.destroy()
    });

    test('degraded (non-admission) carries the adapter reason; empty is explicit, not blank', () => {
        const pane = createPane({
            snapshot: {
                capability: {state: 'degraded', confidence: 'none', capturedAt: CAPTURED_AT, reason: 'database not initialized'},
                admission : {state: 'unavailable', viewerIdentity: '@tobiu', subjectAgentId: '@neo-gpt', checkedAt: CAPTURED_AT, reason: 'database not initialized'},
                rows      : [],
                page      : {limit: 50, offset: 0, count: 0}
            }
        });

        expect(pane.getPaneState()).toBe('degraded');
        expect(pane.getReference('mailbox-state').text).toContain('database not initialized');

        pane.snapshot = wiredSnapshot([]);
        expect(pane.getPaneState()).toBe('empty');
        expect(pane.getReference('mailbox-state').text).toContain('No active messages');
        expect(pane.getReference('mailbox-rows').hidden).toBe(true);

        pane.destroy()
    });

    test('an adapter REFUSAL is never blamed on the source: the line names no cause it cannot know', () => {
        // The adapter's fail-closed refusals all arrive as admission 'unavailable' beside
        // capability 'degraded' — identical in shape to a real outage. The pane cannot tell them
        // apart and must not guess: "source degraded" would blame Memory Core for a refusal the
        // adapter made about the VIEWER. The owner's reason is the only honest content.
        const refusals = [
            'asserted viewerIdentity does not match the bound request identity',
            'mailbox mirror requires a bound request identity to attribute admission',
            'mailbox mirror requires one direct subjectAgentId — namespace targets are not admissible'
        ];

        refusals.forEach(reason => {
            const pane = createPane({
                snapshot: {
                    capability: {state: 'degraded', confidence: 'none', capturedAt: CAPTURED_AT, reason},
                    admission : {state: 'unavailable', viewerIdentity: null, subjectAgentId: null, checkedAt: CAPTURED_AT, reason},
                    rows      : [],
                    page      : {limit: 50, offset: 0, count: 0}
                }
            });

            const text = pane.getReference('mailbox-state').text;

            expect(pane.getPaneState()).toBe('degraded');
            expect(text, 'the owner reason is carried verbatim').toContain(reason);
            expect(text, 'no fabricated source-outage attribution').not.toContain('source degraded');
            // a refusal shows no rows and no page window — never a half-truth
            expect(pane.getReference('mailbox-rows').hidden).toBe(true);
            expect(pane.getReference('mailbox-page').hidden).toBe(true);

            pane.destroy()
        })
    });

    test('rows: newest-first flat-chrono, page bounds shown, fresh chip from capturedAt', () => {
        const pane = createPane({
            snapshot: wiredSnapshot([
                row({messageId: 'MESSAGE:old', subject: 'older', sentAt: '2026-07-16T10:00:00.000Z'}),
                row({messageId: 'MESSAGE:new', subject: 'newer', sentAt: '2026-07-16T11:30:00.000Z'})
            ], {limit: 50, offset: 0, count: 2})
        });

        expect(pane.getPaneState()).toBe('rows');
        expect(pane.getReference('mailbox-state').hidden).toBe(true);

        const rowsCmp = pane.getReference('mailbox-rows');
        expect(rowsCmp.hidden).toBe(false);
        expect(rowsCmp.vdom.cn).toHaveLength(2);
        expect(rowsCmp.vdom.cn[0].cn[0].cn[0].text).toBe('newer');
        expect(rowsCmp.vdom.cn[1].cn[0].cn[0].text).toBe('older');

        expect(pane.getReference('mailbox-page').text).toBe('1–2');
        // capturedAt is 30s old vs a 60s TTL → fresh
        expect(pane.getReference('mailbox-freshness').text).toContain('updated');

        pane.destroy()
    });

    test('thread-collapse: the NEWEST message heads the collapsed row over a +N earlier chip; toggle expands inline', () => {
        const pane = createPane({
            snapshot: wiredSnapshot([
                row({messageId: 'MESSAGE:t1', subject: 'thread oldest', partOfThread: 'THREAD:x', sentAt: '2026-07-16T09:00:00.000Z'}),
                row({messageId: 'MESSAGE:t3', subject: 'thread newest', partOfThread: 'THREAD:x', sentAt: '2026-07-16T11:00:00.000Z'}),
                row({messageId: 'MESSAGE:t2', subject: 'thread middle', partOfThread: 'THREAD:x', sentAt: '2026-07-16T10:00:00.000Z'}),
                row({messageId: 'MESSAGE:solo', subject: 'standalone', sentAt: '2026-07-16T11:45:00.000Z'})
            ], {limit: 50, offset: 0, count: 4})
        });

        const rowsCmp = pane.getReference('mailbox-rows');

        // standalone (newest overall) first, then ONE collapsed thread row
        expect(rowsCmp.vdom.cn).toHaveLength(2);
        expect(rowsCmp.vdom.cn[0].cn[0].cn[0].text).toBe('standalone');

        const collapsedHead = rowsCmp.vdom.cn[1];
        // Grace's steer pinned: the NEWEST thread message heads the collapsed row
        expect(collapsedHead.cn[0].cn[0].text).toBe('thread newest');
        expect(collapsedHead.cn[0].cn[1].text).toBe('+2 earlier');
        expect(collapsedHead.cls).toContain('fm-mail-thread-head');
        expect(collapsedHead.data).toEqual({threadId: 'THREAD:x'});

        // toggle = display-state navigation, never a data write
        const head = pane.store.get('MESSAGE:t3');
        head.threadCollapsed = false;
        pane.renderRows();

        const thread = rowsCmp.vdom.cn[1];
        expect(thread.cls).toContain('fm-mail-thread');
        expect(thread.cn).toHaveLength(3);
        expect(thread.cn[0].cn[0].cn[0].text).toBe('thread newest');
        expect(thread.cn[1].cn[0].cn[0].text).toBe('thread middle');
        expect(thread.cn[2].cn[0].cn[0].text).toBe('thread oldest');
        expect(thread.cn[1].cls).toContain('is-in-thread');

        pane.destroy()
    });

    test('STRUCTURAL read-only: zero mutation affordances anywhere in the vdom or the listener surface', () => {
        const pane = createPane({
            snapshot: wiredSnapshot([
                row({messageId: 'MESSAGE:a'}),
                row({messageId: 'MESSAGE:b', partOfThread: 'THREAD:y'}),
                row({messageId: 'MESSAGE:c', partOfThread: 'THREAD:y', sentAt: '2026-07-16T11:10:00.000Z'})
            ], {limit: 50, offset: 0, count: 3})
        });

        // 1. no MUTATION verb anywhere: no data-entry element, no mutation label. The bar is
        //    mutation, NOT interactivity — an earlier revision banned every control, which read as
        //    stricter but forced thread collapse onto a clickable div no keyboard user could
        //    operate. "Read-only" constrains what the operator can CHANGE, never whether they can
        //    reach what they can see; the one display-state toggle is a native button by design.
        const forbidden = /mark.?read|archive|delete|reply|send/i;
        const walk      = node => {
            if (!node || typeof node !== 'object') return;
            expect(['input', 'textarea', 'select', 'form', 'a']).not.toContain(node.tag);
            // the ONLY admissible control is the thread-collapse toggle — display state, not data
            node.tag === 'button' && expect(node.cls).toContain('fm-mail-thread-toggle');
            typeof node.text === 'string' && expect(forbidden.test(node.text)).toBe(false);
            (node.cn || []).forEach(walk)
        };
        walk(pane.getReference('mailbox-rows').vdom);
        walk(pane.getReference('mailbox-state').vdom);

        // 2. the single listener surface is the thread-collapse toggle — and it is delegated to the
        //    BUTTON, not the row: a row-wide listener is an interactive region with no tab stop
        const listeners = pane.getReference('mailbox-rows').domListeners;
        expect(listeners).toHaveLength(1);
        expect(listeners[0].delegate).toBe('.fm-mail-thread-toggle');

        // 3. the pane class itself exports no mutation verb
        Object.getOwnPropertyNames(Object.getPrototypeOf(pane)).forEach(name => {
            expect(forbidden.test(name)).toBe(false)
        });

        // 4. the tab stays countless: the title never renders a count
        expect(pane.getReference('mailbox-title').text).toBe('A2A Mailbox');

        pane.destroy()
    });

    test('a11y: thread collapse is a NATIVE button that names its state — not a clickable div', () => {
        const pane = createPane({
            snapshot: wiredSnapshot([
                row({messageId: 'MESSAGE:head', partOfThread: 'THREAD:z'}),
                row({messageId: 'MESSAGE:old', partOfThread: 'THREAD:z', sentAt: '2026-07-16T11:10:00.000Z'})
            ], {limit: 50, offset: 0, count: 2})
        });

        const findToggle = () => {
            let found;
            const walk = node => {
                if (!node || typeof node !== 'object') return;
                node.cls?.includes?.('fm-mail-thread-toggle') && (found = node);
                (node.cn || []).forEach(walk)
            };
            walk(pane.getReference('mailbox-rows').vdom);
            return found
        };

        const collapsed = findToggle();

        // a native <button> owns Enter/Space and a tab stop; a div owns neither, so the toggle was
        // mouse-only — the pane's ONLY affordance was unreachable by keyboard
        expect(collapsed.tag).toBe('button');
        expect(collapsed.type).toBe('button');
        expect(collapsed['aria-expanded']).toBe('false');
        expect(collapsed['aria-label']).toContain('Expand thread');

        // toggling re-renders the button with the INVERTED state named — not a stale label
        const head = pane.store.items.find(record => record.partOfThread === 'THREAD:z');
        head.threadCollapsed = false;
        pane.renderRows();

        const expanded = findToggle();
        expect(expanded.tag).toBe('button');
        expect(expanded['aria-expanded']).toBe('true');
        expect(expanded['aria-label']).toContain('Collapse thread');

        pane.destroy()
    });

    test('hostile subjects are DOUBLE-defended: the String field strips markup, the vdom is text-only', () => {
        const pane = createPane({
            snapshot: wiredSnapshot([
                row({messageId: 'MESSAGE:xss', subject: 'deploy <img src=x onerror=alert(1)> done'})
            ], {limit: 50, offset: 0, count: 1})
        });

        // layer 1: Neo's record layer strips tags from every String field (RecordFactory) —
        // markup never even reaches the view
        expect(pane.store.get('MESSAGE:xss').subject).toBe('deploy  done');

        // layer 2: the vdom carries text leaves only — no node anywhere renders html
        const walk = node => {
            if (!node || typeof node !== 'object') return;
            expect(node.html).toBe(undefined);
            (node.cn || []).forEach(walk)
        };
        walk(pane.getReference('mailbox-rows').vdom);
        expect(pane.getReference('mailbox-rows').vdom.cn[0].cn[0].cn[0].text).toBe('deploy  done');

        pane.destroy()
    });

    test('collapse display state: persists across no-change polls, resets when rows change; store dies with the pane', () => {
        const threadRows = () => [
            row({messageId: 'MESSAGE:h', partOfThread: 'THREAD:z', sentAt: '2026-07-16T11:00:00.000Z'}),
            row({messageId: 'MESSAGE:i', partOfThread: 'THREAD:z', sentAt: '2026-07-16T10:00:00.000Z'})
        ];
        const pane = createPane({snapshot: wiredSnapshot(threadRows(), {limit: 50, offset: 0, count: 2})});

        pane.store.get('MESSAGE:h').threadCollapsed = false;

        // an identical-rows poll (only capture time advanced): the store's data config
        // equality-gates on the unchanged payload, so the operator's expansion PERSISTS —
        // a refresh with nothing new never yanks an open thread shut
        const samePoll = wiredSnapshot(threadRows(), {limit: 50, offset: 0, count: 2});
        samePoll.capability.capturedAt = '2026-07-16T12:01:00.000Z';
        pane.snapshot = samePoll;
        expect(pane.store.get('MESSAGE:h').threadCollapsed).toBe(false);

        // a CHANGED row set (a new message landed): wholesale replace → fresh records →
        // thread heads collapsed again (display state is row-set-scoped, explicitly seeded)
        pane.snapshot = wiredSnapshot([
            row({messageId: 'MESSAGE:j', partOfThread: 'THREAD:z', sentAt: '2026-07-16T11:30:00.000Z'}),
            ...threadRows()
        ], {limit: 50, offset: 0, count: 3});
        expect(pane.store.get('MESSAGE:j').threadCollapsed).toBe(true);
        expect(pane.store.get('MESSAGE:h').threadCollapsed).toBe(true);

        const store = pane.store;
        pane.destroy();
        // Base.destroy wipes own properties past our explicit null — falsy is the contract
        expect(pane.store).toBeFalsy();
        expect(store.isDestroyed).toBe(true)
    });
});
