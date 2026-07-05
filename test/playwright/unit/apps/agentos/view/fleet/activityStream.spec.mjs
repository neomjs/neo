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
    let ActivityStream, boundActivity;

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
        ActivityStream = mod.default;
        boundActivity  = mod.boundActivity
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

    test('the component bounds the rendered DOM under a 100-event burst + renders the "N more" fold', () => {
        const stream = Neo.create(ActivityStream, {appName, maxVisible: 15, events: makeEvents(100)});

        // bounded: the rendered event rows never exceed the window regardless of event volume
        expect(rows(stream).length).toBe(15);
        // honest overflow: the fold surfaces the folded count — never a silent drop
        expect(fold(stream)).toBeTruthy();
        expect(fold(stream).text).toBe('85 more');

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
