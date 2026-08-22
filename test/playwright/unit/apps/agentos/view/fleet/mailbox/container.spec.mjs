import {setup} from '../../../../../../setup.mjs';

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
import Neo             from '../../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../../src/manager/Instance.mjs';
import MailboxPane     from '../../../../../../../../apps/agentos/view/fleet/mailbox/Container.mjs';

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
        // Mirrors production: the pane always shows a drilled resident, and its record carries the
        // mailbox identity authority the snapshot's admitted subject is checked against. The default
        // matches `wiredSnapshot`'s subject — a pane whose record names a DIFFERENT resident (or no
        // resident at all) cannot prove the mail is his, and renders nothing. Tests opt into that by
        // passing their own record.
        record: {agentId: 'vega', githubUsername: 'neo-opus-vega'},
        ...config
    })
}

test.describe('AgentOS.view.fleet.mailbox.Container — the read-only S1 mailbox tab', () => {
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
            {admission: {state: 'granted'}, page: {limit: 50}},   // envelope without the rows array
            // reviewer's exact falsifiers: a bare rows array is NOT the producer's envelope. The
            // producer emits {capability, admission, rows, page} on EVERY state — its own degrades
            // included — so these came from somewhere else, and rendering them fabricates a mail
            // claim ("No active messages for @x" / a stranger's message list) from a shape the pane
            // never recognized.
            {rows: []},
            {rows: [row({messageId: 'MESSAGE:from-nowhere'})]},
            // each single missing member fails closed on its own
            {admission: {state: 'granted'}, rows: [], page: {limit: 50, offset: 0, count: 0}},
            {capability: {state: 'wired'}, rows: [], page: {limit: 50, offset: 0, count: 0}},
            {capability: {state: 'wired'}, admission: {state: 'granted'}, rows: []}
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
            admission : {state: 'granted', viewerIdentity: '@tobiu', subjectAgentId: '@neo-opus-vega', checkedAt: CAPTURED_AT, reason: null},
            page      : {limit: 50, offset: 0, count: 0},
            rows      : []
        }});

        expect(honest.getPaneState()).toBe('empty');
        honest.destroy()
    });

    test("a GRANTED snapshot about another resident never renders under this one's name", () => {
        // The reviewer's exact falsifier. The possession guard and the generation latch both protect
        // the SEQUENCE and neither reads the envelope: a granted snapshot for Vega assigned onto
        // Ada's pane satisfies every one of them, because Ada's record was already correct when it
        // landed. The envelope has to be asked who it is ABOUT.
        const ada = createPane({
            record  : {agentId: 'ada', githubUsername: 'neo-opus-ada'},
            snapshot: wiredSnapshot([row({messageId: 'MESSAGE:vega-private', subject: 'VEGA PRIVATE MAIL'})])
        });

        expect(ada.getPaneState(), "vega's mail must not render on ada's pane").toBe('unobserved');
        expect(ada.getReference('mailbox-rows').hidden).toBe(true);
        expect(JSON.stringify(ada.getReference('mailbox-rows').vdom)).not.toContain('VEGA PRIVATE MAIL');
        ada.destroy();

        // an EMPTY snapshot about someone else is equally inadmissible: rendering it would say
        // "No active messages for ada" on the strength of a read about vega
        const adaEmpty = createPane({
            record  : {agentId: 'ada', githubUsername: 'neo-opus-ada'},
            snapshot: wiredSnapshot([], {limit: 50, offset: 0, count: 0})
        });
        expect(adaEmpty.getPaneState()).toBe('unobserved');
        adaEmpty.destroy();

        // a DENIAL about someone else cannot be shown either — its sentence names the subject
        const adaDenied = createPane({
            record  : {agentId: 'ada', githubUsername: 'neo-opus-ada'},
            snapshot: {
                capability: {state: 'degraded', confidence: 'none', capturedAt: CAPTURED_AT, reason: 'Unauthorized: no CAN_READ_INBOX_OF permission for @neo-opus-vega'},
                admission : {state: 'denied', viewerIdentity: '@tobiu', subjectAgentId: '@neo-opus-vega', checkedAt: CAPTURED_AT, reason: 'Unauthorized: no CAN_READ_INBOX_OF permission for @neo-opus-vega'},
                rows      : [],
                page      : {limit: 50, offset: 0, count: 0}
            }
        });
        expect(adaDenied.getPaneState()).toBe('unobserved');
        adaDenied.destroy();

        // and a resident with NO identity authority is honestly unverifiable — never an implicit pass
        const unverifiable = createPane({
            record  : {agentId: 'custom-resident', githubUsername: null},
            snapshot: wiredSnapshot([row({messageId: 'MESSAGE:x'})])
        });
        expect(unverifiable.getPaneState()).toBe('unobserved');
        unverifiable.destroy()
    });

    test('degraded (non-admission) carries the adapter reason; empty is explicit, not blank', () => {
        const pane = createPane({
            snapshot: {
                capability: {state: 'degraded', confidence: 'none', capturedAt: CAPTURED_AT, reason: 'database not initialized'},
                admission : {state: 'unavailable', viewerIdentity: '@tobiu', subjectAgentId: '@neo-opus-vega', checkedAt: CAPTURED_AT, reason: 'database not initialized'},
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

        // the bounds now live in the range span, between their two transition controls
        expect(pane.getReference('mailbox-page-range').text).toBe('1–2');
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

    test('pagination TRANSITIONS: row 51 is reachable — the window can move, not just describe itself', () => {
        const pane  = createPane({snapshot: wiredSnapshot([row({messageId: 'MESSAGE:a'})], {limit: 50, offset: 0, count: 50, hasMore: true})}),
              fired = [];

        pane.on('pageRequest', data => fired.push(data.offset));

        const prev  = pane.getReference('mailbox-page-prev'),
              next  = pane.getReference('mailbox-page-next'),
              range = pane.getReference('mailbox-page-range');

        // the steps are COMPOSED controls, not hand-rolled tags: `button.Base` with the shipped
        // paging vocabulary (`fa fa-angle-*`, as toolbar.Paging uses). A raw {tag:'button'} would
        // reproduce the outcome and skip the primitive that owns disabled/icon/focus states.
        expect(prev.ntype).toBe('button');
        expect(next.ntype).toBe('button');
        expect(prev.iconCls).toBe('fa fa-angle-left');
        expect(next.iconCls).toBe('fa fa-angle-right');

        // page 1 of a FULL window: newer is disabled (this IS the edge), older is offered
        expect(prev.disabled).toBe(true);
        expect(next.disabled).toBe(false);
        expect(range.text).toBe('1–50');

        // the handler is wired UP to this view (the primitive resolves the string), and the pane
        // REQUESTS rather than fetching
        expect(next.handler).toBe('up.onNextPageClick');
        expect(prev.handler).toBe('up.onPrevPageClick');
        pane.onNextPageClick();
        expect(fired).toEqual([50]);

        // page 2, short (the producer ran out): older disables, newer opens, range reflects the window
        pane.snapshot = wiredSnapshot([row({messageId: 'MESSAGE:b'})], {limit: 50, offset: 50, count: 10, hasMore: false});
        expect(prev.disabled).toBe(false);
        expect(next.disabled, 'a short page is the producer saying it ran out').toBe(true);
        expect(range.text).toBe('51–60');

        pane.onPrevPageClick();
        expect(fired).toEqual([50, 0]);

        pane.destroy()
    });

    test('presence is not permission: only GRANTED over WIRED with a real page window is a mail claim', () => {
        // The reviewer's literal falsifier. Four members PRESENT is not the producer saying anything:
        // a `wired` capability beside an `unavailable` admission is a read that never happened, and
        // its zero rows mean "we could not look" — rendering that as "No active messages for @x"
        // reports the outcome of a read nobody performed.
        const notAMailClaim = [
            // reviewer's exact shape — reached `empty` before this fix
            {capability: {state: 'wired'}, admission: {state: 'unavailable', subjectAgentId: '@neo-opus-vega'}, page: {}, rows: []},
            // ...and the same shape WITH rows reached `rows`
            {capability: {state: 'wired'}, admission: {state: 'unavailable', subjectAgentId: '@neo-opus-vega'}, page: {}, rows: [row({messageId: 'MESSAGE:ghost'})]},
            // an unknown admission state is not granted either — the closed set is the producer's
            {capability: {state: 'wired'}, admission: {state: 'pending', subjectAgentId: '@neo-opus-vega'}, page: {limit: 50, offset: 0, count: 0}, rows: []},
            // a not-wired capability cannot carry a mail claim, whatever admission says
            {capability: {state: 'not-wired'}, admission: {state: 'granted', subjectAgentId: '@neo-opus-vega'}, page: {limit: 50, offset: 0, count: 0}, rows: []},
            // a PRESENT but empty page is `NaN–NaN` bounds and NaN offsets — a window invented from
            // absent numbers, rendered as fact beside the rows
            {capability: {state: 'wired'}, admission: {state: 'granted', subjectAgentId: '@neo-opus-vega'}, page: {}, rows: []},
            {capability: {state: 'wired'}, admission: {state: 'granted', subjectAgentId: '@neo-opus-vega'}, page: {limit: 'many', offset: 0, count: 0}, rows: []}
        ];

        notAMailClaim.forEach(snapshot => {
            const pane = createPane({snapshot});

            expect(pane.getPaneState(), JSON.stringify(snapshot)).toBe('unobserved');
            expect(pane.getReference('mailbox-rows').hidden).toBe(true);
            expect(pane.getReference('mailbox-page').hidden).toBe(true);

            pane.destroy()
        })
    });

    test('the freshness chip never claims currency it cannot place in time', () => {
        // Class audit, not a reported falsifier: every OTHER claim on this pane was fail-open at
        // least once today (empty from a torn envelope, empty from an unavailable admission), so the
        // chip is the last surface that renders a producer-derived assertion. It reads
        // `capability.capturedAt`; a snapshot whose timestamp is absent or unparseable must not
        // become "fresh" — that would be currency invented from a value nobody supplied.
        const unplaceable = [null, undefined, '', 'not-a-date', 12345, {}];

        unplaceable.forEach(capturedAt => {
            const pane = createPane({snapshot: {
                capability: {source: 'memory-core:mailbox', state: 'wired', confidence: 'observed', capturedAt, reason: null},
                admission : {state: 'granted', viewerIdentity: '@tobiu', subjectAgentId: '@neo-opus-vega', checkedAt: CAPTURED_AT, reason: null},
                page      : {limit: 50, offset: 0, count: 1},
                rows      : [row({messageId: 'MESSAGE:a'})]
            }});

            const chip = pane.getReference('mailbox-freshness');

            expect(chip.cls, `capturedAt=${JSON.stringify(capturedAt)} must not read as fresh`).not.toContain('is-fresh');
            expect(chip.text).toContain('not observed');
            // the ROWS still render — the producer authorized them; only the age claim is unknown
            expect(pane.getPaneState()).toBe('rows');

            pane.destroy()
        })
    });

    test('a11y: the icon-only page steps carry an accessible name AND a real disabled semantic', () => {
        const pane = createPane({snapshot: wiredSnapshot([row({messageId: 'MESSAGE:a'})], {limit: 50, offset: 0, count: 50, hasMore: true})}),
              prev = pane.getReference('mailbox-page-prev'),
              next = pane.getReference('mailbox-page-next');

        // a chevron IS the label to a sighted operator and nothing at all to anyone else
        expect(prev.vdom['aria-label']).toBe('Newer messages');
        expect(next.vdom['aria-label']).toBe('Older messages');

        // `component.Base.disabled` guarantees the neo-disabled CLASS and no aria-disabled. Without
        // the explicit ARIA state the closed edge is announced as ENABLED: the operator who most
        // needs the boundary to be honest is the one it lies to. Any native `disabled` projection
        // belongs to the Button layer and is deliberately not assumed here.
        expect(prev.disabled).toBe(true);
        expect(prev.vdom['aria-disabled']).toBe('true');
        expect(next.disabled).toBe(false);
        expect(next.vdom['aria-disabled'] ?? null, 'an open edge must not be announced as disabled').toBe(null);

        // and the semantics track the bounds, not just the first render
        pane.snapshot = wiredSnapshot([row({messageId: 'MESSAGE:b'})], {limit: 50, offset: 50, count: 10, hasMore: false});
        expect(prev.vdom['aria-disabled'] ?? null).toBe(null);
        expect(next.vdom['aria-disabled']).toBe('true');

        pane.destroy()
    });

    test('a DISABLED step refuses the request — the handler guard closes what the routed gates cannot', () => {
        // A ROUTED activation never gets this far: `.neo-disabled` sets `pointer-events: none`, and
        // `manager/DomEvent` breaks its listener walk on a disabled component for every non-resize
        // event — a keyboard Enter arrives as a click on that same route and stops there too. This
        // test enters the handler DIRECTLY, which is the one path those gates miss, since
        // `button.Base.onClick` never consults the config. So what is pinned here is the guard
        // against programmatic entry — NOT a claim that a real click or keypress reaches the
        // handler. Unguarded, stepping past the last page reads an empty window at a positive
        // offset. `aria-disabled` owns the announcement only; it does not remove focus or suppress
        // activation. The routed gates plus this direct-entry guard own refusal here, while any
        // native focus/activation behavior remains the Button layer's contract.
        const pane  = createPane({snapshot: wiredSnapshot([row({messageId: 'MESSAGE:a'})], {limit: 50, offset: 0, count: 50, hasMore: false})}),
              fired = [];

        pane.on('pageRequest', data => fired.push(data.offset));

        // page 1 AND the last page: both edges closed
        expect(pane.getReference('mailbox-page-prev').disabled).toBe(true);
        expect(pane.getReference('mailbox-page-next').disabled).toBe(true);

        // entering the handler directly: the routed gates are BYPASSED here, not defeated
        pane.onPrevPageClick();
        pane.onNextPageClick();

        expect(fired, 'a closed edge must refuse the request, not merely look shut').toEqual([]);

        pane.destroy()
    });

    test('a denial or degrade never fakes a page window', () => {
        const denied = createPane({snapshot: {
            capability: {state: 'degraded', confidence: 'none', capturedAt: CAPTURED_AT, reason: 'no grant'},
            admission : {state: 'denied', viewerIdentity: '@x', subjectAgentId: '@neo-opus-vega', checkedAt: CAPTURED_AT, reason: 'Unauthorized: no CAN_READ_INBOX_OF permission for @neo-gpt'},
            rows      : [],
            page      : {limit: 50, offset: 0, count: 0}
        }});

        // bounds + their transitions are hidden together: a window over data you cannot see is a lie
        expect(denied.getReference('mailbox-page').hidden).toBe(true);
        denied.destroy()
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
