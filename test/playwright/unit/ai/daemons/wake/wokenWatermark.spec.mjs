import {test, expect}                      from '@playwright/test';
import {filterEventsByWatermark, maxLogId} from '../../../../../../ai/daemons/wake/wokenWatermark.mjs';

test.describe('wake wokenWatermark (#12850)', () => {
    test('filterEventsByWatermark keeps only events strictly above the watermark', () => {
        const events = [
            {messageId: 'a', logId: 10},
            {messageId: 'b', logId: 50},
            {messageId: 'c', logId: 51}
        ];

        expect(filterEventsByWatermark(events, 50).map(e => e.messageId)).toEqual(['c']);
        expect(filterEventsByWatermark(events, 0).map(e => e.messageId)).toEqual(['a', 'b', 'c']);
        expect(filterEventsByWatermark(events, 100)).toEqual([]);
    });

    test('filterEventsByWatermark conservatively KEEPS events without a finite logId (never withhold a genuine wake)', () => {
        const events = [
            {messageId: 'no-logid'},
            {messageId: 'null-logid', logId: null},
            {messageId: 'nan-logid', logId: 'x'},
            {messageId: 'old', logId: 5},
            {messageId: 'new', logId: 99}
        ];

        // Below-watermark numeric ids drop; logId-less ids survive as new.
        expect(filterEventsByWatermark(events, 50).map(e => e.messageId))
            .toEqual(['no-logid', 'null-logid', 'nan-logid', 'new']);
    });

    test('filterEventsByWatermark treats a non-finite watermark as 0 (keeps everything)', () => {
        const events = [{messageId: 'a', logId: 1}, {messageId: 'b', logId: 2}];

        expect(filterEventsByWatermark(events, undefined).map(e => e.messageId)).toEqual(['a', 'b']);
        expect(filterEventsByWatermark(events, NaN).map(e => e.messageId)).toEqual(['a', 'b']);
    });

    test('maxLogId returns the highest finite logId, or null when none', () => {
        expect(maxLogId([{logId: 3}, {logId: 99}, {logId: 12}])).toBe(99);
        expect(maxLogId([{logId: 7}])).toBe(7);
        expect(maxLogId([])).toBeNull();
        expect(maxLogId([{messageId: 'x'}, {logId: null}, {logId: 'nope'}])).toBeNull();
        // A 0 logId is finite and must win over null.
        expect(maxLogId([{logId: 0}])).toBe(0);
    });

    test('AC2 repro — a stale already-woken HIGH message is filtered out before it can spoof the digest priority', () => {
        // Recipient has already been woken through logId 100. A heavy-delta re-include re-queues an
        // OLD high-priority message (logId 42, still readAt=null so the readAt filter alone misses it)
        // alongside one genuinely-new normal message.
        const watermark = 100;
        const reincludedBacklog = [
            {type: 'message', messageId: 'm-stale-high', priority: 'high',   logId: 42},
            {type: 'message', messageId: 'm-new',        priority: 'normal', logId: 150}
        ];

        const survivors = filterEventsByWatermark(reincludedBacklog, watermark);

        // The stale HIGH message never reaches getHighestWakePriority → no spoofed-HIGH digest,
        // and the count reflects only the one genuinely-new message.
        expect(survivors.map(e => e.messageId)).toEqual(['m-new']);
        expect(survivors.some(e => e.priority === 'high')).toBe(false);
        expect(survivors.length).toBe(1);
    });

    test('AC4 regression — genuinely-new events (all types) above the watermark are never dropped', () => {
        const watermark = 200;
        const fresh = [
            {type: 'message',    messageId: 'm', logId: 201},
            {type: 'task',       taskId: 't',    logId: 202},
            {type: 'permission', scope: 'p',     logId: 203},
            {type: 'heartbeat',  pulseId: 'h',   logId: 204}
        ];

        expect(filterEventsByWatermark(fresh, watermark)).toHaveLength(4);
        expect(maxLogId(fresh)).toBe(204);
    });
});
