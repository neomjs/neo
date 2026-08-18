import {setup} from '../../../../../setup.mjs';

const appName = 'FleetActivityStreamTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import Instance       from '../../../../../../../src/manager/Instance.mjs';

test.describe('Fleet cockpit ActivityStream — bounded, backpressure-aware feed (#14606)', () => {
    let ActivityStream, boundActivity, coalesceActivity;

    const makeEvents = n => Array.from({length: n}, (_, i) => ({
        type      : 'a2a-activity',
        source    : 'memory-core:mailbox',
        agentId   : `agent-${i}`,
        occurredAt: `2026-07-04T1${i % 10}:${String(i % 60).padStart(2, '0')}:00.000Z`,
        payload   : {text: `event ${i}`}
    }));

    const rows = stream => stream.items.filter(item => item.cls.includes('fm-ev-row'));
    const fold = stream => stream.items.find(item => item.cls.includes('fm-stream-fold'));
    const head = stream => stream.items.find(item => item.cls.includes('fm-stream-head'));

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../apps/agentos/view/fleet/ActivityStream.mjs');
        ActivityStream   = mod.default;
        boundActivity    = mod.boundActivity;
        coalesceActivity = mod.coalesceActivity
    });

    test('boundActivity is the pure backpressure core — bound holds, overflow counted, newest-first', () => {
        // the load-bearing requirement: a 100-event burst yields a bounded window + an honest overflow count
        const {visible, overflowCount} = boundActivity(makeEvents(100), 15);
        expect(visible.length).toBe(15);
        expect(overflowCount).toBe(85);
        // newest-first: the most-recent event heads the window
        expect(visible[0].agentId).toBe('agent-99');
        expect(visible[14].agentId).toBe('agent-85');

        // edges: under-bound (no fold), exact-bound, empty, non-array, non-positive bound
        expect(boundActivity(makeEvents(3), 15)).toMatchObject({overflowCount: 0});
        expect(boundActivity(makeEvents(3), 15).visible.length).toBe(3);
        expect(boundActivity(makeEvents(15), 15).overflowCount).toBe(0);
        expect(boundActivity([], 15)).toEqual({visible: [], overflowCount: 0});
        expect(boundActivity(null, 15)).toEqual({visible: [], overflowCount: 0});
        expect(boundActivity(makeEvents(5), 0)).toEqual({visible: [], overflowCount: 5})
    });

    test('the component bounds the rendered DOM under a 100-event burst + renders the "N earlier events" fold', () => {
        const stream = Neo.create(ActivityStream, {appName, maxVisible: 15, events: makeEvents(100)});

        // bounded: the rendered event rows never exceed the window regardless of event volume
        expect(rows(stream).length).toBe(15);
        // honest overflow: the fold surfaces the folded EVENT count — never a silent drop
        expect(fold(stream)).toBeTruthy();
        expect(fold(stream).text).toBe('85 earlier events');

        stream.destroy()
    });

    test('a11y: the live feed is an aria-live log region so screen readers hear new rows (#14619)', () => {
        const stream = Neo.create(ActivityStream, {appName, events: makeEvents(3)});

        // a live-updating feed with no aria-live is silent to assistive tech — this makes it a named,
        // polite log region (announces new rows without interrupting)
        expect(stream.vdom['aria-live']).toBe('polite');
        expect(stream.vdom.role).toBe('log');
        expect(stream.vdom['aria-label']).toBe('Live fleet activity');

        // The region must PERSIST across feed updates — that is the whole point of a live region.
        // refreshFeed swaps CHILD items (removeAll + add), never the vdom root, so a returning event
        // must not silently drop the aria-live root (which would re-silence the "live" feed to screen
        // readers after the very first update — the exact failure mode the region exists to prevent).
        stream.events = makeEvents(5);
        expect(stream.vdom['aria-live']).toBe('polite');
        expect(stream.vdom.role).toBe('log');
        expect(stream.vdom['aria-label']).toBe('Live fleet activity');

        stream.destroy()
    });

    test('density re-freeze: coalesceActivity groups only PROVEN same-actor runs — the pure rule', () => {
        const at = seconds => `2026-07-04T10:00:${String(seconds).padStart(2, '0')}.000Z`;

        // a >2/min same-actor run (10s gaps) groups into ONE row carrying the count + newest event
        const run = coalesceActivity([
            {type: 'a2a-activity', agentId: 'vega', occurredAt: at(0),  payload: {text: 'one'}},
            {type: 'a2a-activity', agentId: 'vega', occurredAt: at(10), payload: {text: 'two'}},
            {type: 'pr-activity',  agentId: 'vega', occurredAt: at(20), payload: {text: 'three'}}
        ], 30000);
        expect(run.length).toBe(1);
        expect(run[0]).toMatchObject({agentId: 'vega', count: 3});
        expect(run[0].newest.payload.text).toBe('three');

        // a gap AT the threshold (30s = exactly 2/min) splits — coalescing is strictly-above-rate
        expect(coalesceActivity([
            {agentId: 'vega', occurredAt: at(0)},
            {agentId: 'vega', occurredAt: at(30)}
        ], 30000).length).toBe(2);

        // distinct actors never group, however tight the timestamps
        expect(coalesceActivity([
            {agentId: 'vega', occurredAt: at(0)},
            {agentId: 'ada',  occurredAt: at(1)}
        ], 30000).length).toBe(2);

        // unprovable membership never groups: a missing timestamp breaks the run on BOTH sides,
        // and anonymous events (no agentId) each stand alone
        expect(coalesceActivity([
            {agentId: 'vega', occurredAt: at(0)},
            {agentId: 'vega'},
            {agentId: 'vega', occurredAt: at(2)}
        ], 30000).length).toBe(3);
        expect(coalesceActivity([
            {occurredAt: at(0)},
            {occurredAt: at(1)}
        ], 30000).length).toBe(2);

        // non-array input degrades to an empty row set
        expect(coalesceActivity(null, 30000)).toEqual([])
    });

    test('density re-freeze: a same-actor burst renders as ONE grouped ×N row — one busy actor cannot flood the window', () => {
        const burst = Array.from({length: 5}, (_, i) => ({
            type      : 'a2a-activity',
            agentId   : 'neo-opus-vega',
            occurredAt: `2026-07-04T10:00:${String(i * 10).padStart(2, '0')}.000Z`,
            payload   : {text: `vega burst ${i}`}
        }));

        const stream = Neo.create(ActivityStream, {appName, events: [
            ...burst,
            {type: 'review-activity', agentId: 'neo-gpt', occurredAt: '2026-07-04T10:05:00.000Z', payload: {text: 'euclid single'}}
        ]});

        // 6 events → 2 rows: the run coalesced + the single (newest-first: the single leads)
        expect(rows(stream).length).toBe(2);

        const [single, grouped] = rows(stream);
        expect(single.cls).not.toContain('fm-ev-coalesced');
        expect(single.items.find(item => item.cls.includes('fm-ev-text')).text).toBe('euclid single');

        // the grouped row: ×N carries the run count, the NEWEST event carries text + chip kind
        expect(grouped.cls).toContain('fm-ev-coalesced');
        expect(grouped.items.find(item => item.cls.includes('fm-ev-text')).text).toBe('×5 · vega burst 4');

        stream.destroy()
    });

    test('density re-freeze: the 200-event ring drops oldest COUNTED, and the default window is 12 rows', () => {
        const stream = Neo.create(ActivityStream, {appName, events: makeEvents(500)});

        // the ring: the held events are capped at bufferSize (200) — memory bounded by construction
        expect(stream.events.length).toBe(200);
        // the window: density-frozen 12 rows by default
        expect(rows(stream).length).toBe(12);
        // the fold counts EVENTS beyond the glass: 188 folded rows (distinct actors → 1 event each)
        // + 300 ring-dropped = 488 — a drop is surfaced, never silent
        expect(fold(stream).text).toBe('488 earlier events');

        stream.destroy()
    });

    test('reactive ring: a runtime SHRINK re-bounds the HELD events with cumulative honest drop accounting; an invalid bound is refused', () => {
        const stream = Neo.create(ActivityStream, {appName, events: makeEvents(250)});

        // intake: 250 → 200 held / 50 dropped / 12 rows / 238 folded+dropped events
        expect(stream.events.length).toBe(200);
        expect(stream.droppedCount).toBe(50);
        expect(rows(stream).length).toBe(12);
        expect(fold(stream).text).toBe('238 earlier events');

        // the falsifier: shrinking the bound must re-bound the ALREADY-HELD payload — the ring is
        // reactive for real, not a render-only claim
        stream.bufferSize = 10;
        expect(stream.events.length).toBe(10);
        // drop accounting is cumulative within the payload: 50 intake + 190 shrink = 240 of the
        // original 250 are gone, and the fold says so (10 held ≤ 12-row window → nothing folded)
        expect(stream.droppedCount).toBe(240);
        expect(rows(stream).length).toBe(10);
        expect(fold(stream).text).toBe('240 earlier events');

        // zero/negative/non-finite bounds would DISABLE the ring (slice(-0) keeps everything) —
        // refused: the previous bound and the held events stay exactly as they were
        for (const bad of [0, -5, NaN, Infinity, 2.5]) {
            stream.bufferSize = bad;
            expect(stream.bufferSize).toBe(10);
            expect(stream.events.length).toBe(10)
        }

        // a fresh payload RESETS the accounting (replace semantics) against the shrunk bound
        stream.events = makeEvents(25);
        expect(stream.events.length).toBe(10);
        expect(stream.droppedCount).toBe(15);

        stream.destroy()
    });

    test('kind rendering delegates entirely to EventChip — unknown types still render a chip (neutral path)', () => {
        const stream = Neo.create(ActivityStream, {
            appName,
            events: [
                {type: 'pr-activity',           occurredAt: '2026-07-04T10:00:00.000Z', payload: {text: 'a'}},
                {type: 'totally-unknown-kind',  occurredAt: '2026-07-04T10:01:00.000Z', payload: {text: 'b'}}
            ]
        });

        // every row composes an EventChip (the chip is the only kind surface — zero local kind logic here)
        expect(stream.down({ntype: 'fm-event-chip'})).toBeTruthy();
        // the unknown-kind row still renders (EventChip's neutral fallback), never dropped
        expect(rows(stream).length).toBe(2);

        stream.destroy()
    });

    test('degrades honestly on adapter loss — a stale header, never a blanked feed', () => {
        const stream = Neo.create(ActivityStream, {appName, adapterState: 'stale', events: makeEvents(3)});

        expect(head(stream).cls).toContain('is-stale');
        // the rows still render — degrade surfaces the state, it does not blank the feed
        expect(rows(stream).length).toBe(3);

        stream.destroy()
    });

    test('event text reads the live-adapter payload subject, not just the fixture text field', () => {
        // the live A2A/PR/lane adapters carry the row text in payload.subject (fixtures use payload.text);
        // both must render meaningfully rather than falling to the "agentId · type" fallback
        const stream = Neo.create(ActivityStream, {
            appName,
            events: [{type: 'a2a-activity', agentId: 'neo-opus-vega', occurredAt: '2026-07-04T10:00:00.000Z', payload: {subject: '[lane-claim] #14606 activity live-binding'}}]
        });

        const textItem = rows(stream)[0].items.find(item => item.cls.includes('fm-ev-text'));
        expect(textItem.text).toBe('[lane-claim] #14606 activity live-binding');

        stream.destroy()
    });

    test('sample state labels a representative (source-not-wired) feed honestly — never "streaming"', () => {
        const stream = Neo.create(ActivityStream, {appName, adapterState: 'sample', events: makeEvents(3)});

        expect(head(stream).cls).toContain('is-sample');
        const stateItem = head(stream).items.find(item => item.cls.includes('fm-stream-state'));
        expect(stateItem.text).toBe('sample · live feed pending');
        expect(stateItem.text).not.toContain('streaming');   // a sample must never pose as live
        // the sample is shown, not blanked
        expect(rows(stream).length).toBe(3);

        stream.destroy()
    });
});


test.describe('ActivityStream — the actor chip and the recipient piece (row identity rendering)', () => {
    let ActivityStream, proto;

    test.beforeAll(async () => {
        ActivityStream = (await import('../../../../../../../apps/agentos/view/fleet/ActivityStream.mjs')).default;
        proto          = ActivityStream.prototype
    });

    const host = directory => ({
              actorDirectory : directory,
              actorChipConfig: proto.actorChipConfig,
              recipientConfig: proto.recipientConfig,
              timeVdom       : proto.timeVdom,
              eventText      : proto.eventText,
              stallText      : proto.stallText
          });

    const a2aEvent = (over = {}) => ({
        type      : 'a2a-activity',
        agentId   : '@neo-fable-clio',
        occurredAt: '2026-08-18T10:00:00.000Z',
        payload   : {subject: 'ping', from: '@neo-fable-clio', to: '@neo-opus-ada', recipientClass: 'agent', ...over}
    });

    test('the actor chip renders the coalescing key: roster facts when known, handle-only when not, NOTHING when anonymous', () => {
        const h = host({'@neo-fable-clio': {avatarUrl: 'https://github.com/neo-fable-clio.png?size=80', displayName: 'Clio'}});

        const known = proto.actorChipConfig.call(h, {agentId: '@neo-fable-clio'});
        expect(known).toMatchObject({agentId: '@neo-fable-clio', avatarUrl: 'https://github.com/neo-fable-clio.png?size=80', label: 'Clio'});

        const unknown = proto.actorChipConfig.call(h, {agentId: '@neo-gpt'});
        expect(unknown).toMatchObject({agentId: '@neo-gpt', avatarUrl: null, label: null});

        // honest absence: an anonymous event composes NO chip, never a blank identity
        expect(proto.actorChipConfig.call(h, {agentId: null})).toBeNull()
    });

    test('the recipient piece: directed renders → @to, broadcast renders the distinct ⇒ fleet, non-A2A renders nothing', () => {
        const h = host({});

        const direct = proto.recipientConfig.call(h, a2aEvent());
        expect(direct.text).toBe('→ @neo-opus-ada');
        expect(direct.cls).toContain('is-direct');
        expect(direct.vdom.title).toBe('@neo-opus-ada');

        const broadcast = proto.recipientConfig.call(h, a2aEvent({to: 'AGENT:*', recipientClass: 'broadcast'}));
        expect(broadcast.text).toBe('⇒ fleet');
        expect(broadcast.cls).toContain('is-broadcast');

        expect(proto.recipientConfig.call(h, {type: 'pr-activity', payload: {}})).toBeNull();
        expect(proto.recipientConfig.call(h, a2aEvent({to: null, recipientClass: 'unknown'}))).toBeNull()
    });

    test('a lane-claim row is A2A enough for the recipient piece — the claim broadcast reads as one', () => {
        const claim = proto.recipientConfig.call(host({}), {type: 'lane-claim', payload: {to: 'AGENT:*', recipientClass: 'broadcast'}});

        expect(claim.text).toBe('⇒ fleet')
    });

    test('the row composes ONE line: time · kind · actor · recipient · text — the actor once per coalesced run', () => {
        const h   = host({'@neo-fable-clio': {displayName: 'Clio'}}),
              row = {agentId: '@neo-fable-clio', count: 3, newest: a2aEvent(), events: []},
              cfg = proto.rowConfig.call(h, row);

        // structural density bound: every cell is an inline hbox child; only the text flexes
        expect(cfg.layout.ntype).toBe('hbox');
        expect(cfg.items).toHaveLength(5);
        expect(cfg.items.filter(item => item.flex === 1)).toHaveLength(1);

        // the actor renders once beside the ×N count, the run key visible instead of implied
        expect(cfg.items[2]).toMatchObject({agentId: '@neo-fable-clio', label: 'Clio'});
        expect(cfg.items[4].text).toContain('×3');

        // an anonymous single event: no actor cell, the row shrinks by exactly that cell
        const anon = proto.rowConfig.call(h, {agentId: null, count: 1, newest: {type: 'pr-activity', payload: {text: 'x'}}, events: []});
        expect(anon.items).toHaveLength(3)
    });

    test('constructed, not borrowed: the recipient cell sets BOTH text and vdom — after real creation, both survive', () => {
        const stream = Neo.create(ActivityStream, {
            appName,
            actorDirectory: {'@neo-fable-clio': {displayName: 'Clio'}},
            events        : [a2aEvent()]
        });

        const row = stream.items.find(item => item.cls.includes('fm-ev-row'));

        // the five cells compose in order as REAL instances — a config literal cannot green this
        expect(row.items.map(item => item.className)).toEqual([
            'Neo.component.Base',           // time
            'AgentOS.view.fleet.EventChip', // kind
            'AgentOS.view.fleet.ActorChip', // actor — the coalescing key
            'Neo.component.Base',           // recipient
            'Neo.component.Base'            // text
        ]);

        // the merge the config assertions cannot see: recipientConfig is the one cell setting BOTH
        // `text` and `vdom` on one config while `set vdom` replaces wholesale — the citable hover
        // title and the arrow text must coexist on the constructed component, not just in the literal
        const recipient = row.items[3];
        expect(recipient.vdom.title).toBe('@neo-opus-ada');
        expect(recipient.text).toBe('→ @neo-opus-ada');
        expect(recipient.cls).toContain('is-direct');

        stream.destroy()
    })
});
