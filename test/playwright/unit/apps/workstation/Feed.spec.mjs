import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'WorkstationFeedTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Feed           from '../../../../../apps/workstation/store/Feed.mjs';
import '../../../../../src/manager/Instance.mjs';

test.describe('Workstation feed producer', () => {
    let feed, intervals, registrations, clears, originalSetInterval, originalClearInterval;

    test.beforeEach(() => {
        intervals = new Map();
        registrations = clears = 0;
        originalSetInterval = globalThis.setInterval;
        originalClearInterval = globalThis.clearInterval;
        globalThis.setInterval = (callback, delay) => {
            const id = registrations++;
            intervals.set(id, {callback, delay});
            return id
        };
        globalThis.clearInterval = id => {
            clears++;
            intervals.delete(id)
        }
    });

    test.afterEach(() => {
        feed?.destroy();
        feed = null;
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval
    });

    test('borrowing stays dormant; repeated start owns one seeded producer and destroy retires it', () => {
        feed = Neo.create(Feed);
        expect(feed.count).toBe(0);
        expect(intervals.size).toBe(0);

        // A subscriber can synchronously ask the same owner to start while its seed is publishing.
        const release = feed.getConfig('sequence').subscribe({id: 'workstation-feed-start-witness', fn: () => feed.start()});
        feed.start();
        release();
        feed.start();
        expect(registrations).toBe(1);
        expect(intervals.size).toBe(1);
        expect(feed.count).toBe(25);
        expect(feed.sequence).toBe(25);
        expect(feed.batchCount).toBe(1);

        const interval = [...intervals.values()][0];
        expect(interval.delay).toBe(500);
        interval.callback();
        expect(feed.count).toBe(30);
        expect(feed.sequence).toBe(30);
        expect(feed.batchCount).toBe(2);

        feed.destroy();
        expect(intervals.size).toBe(0);
        expect(clears).toBe(1);
        feed.start();
        expect(registrations).toBe(1)
    });

    test('stop and restart preserve the sequence without repeating the seed, even after clearing records', () => {
        feed = Neo.create(Feed, {batchSize: 2, intervalMs: 75});
        feed.start();
        const stoppedCallback = [...intervals.values()][0].callback;
        feed.stop();
        feed.stop();
        expect(intervals.size).toBe(0);
        expect(clears).toBe(1);
        stoppedCallback();
        expect(feed.sequence).toBe(25);
        feed.clear();

        feed.start();
        expect(feed.count).toBe(0);
        expect(feed.sequence).toBe(25);
        expect(intervals.size).toBe(1);
        const interval = [...intervals.values()][0];
        expect(interval.delay).toBe(75);
        interval.callback();
        expect(feed.sequence).toBe(27);
        expect(feed.batchCount).toBe(2);
        expect(feed.items.map(record => record.id)).toEqual(['feed-00000027', 'feed-00000026'])
    });

    test('an already populated or manually produced feed gains no startup seed', () => {
        feed = Neo.create(Feed, {data: [{id: 'existing', name: 'existing'}]});
        feed.start();
        expect(feed.count).toBe(1);
        expect(feed.batchCount).toBe(0);
        feed.destroy();

        feed = Neo.create(Feed);
        feed.appendBatch(3);
        feed.start();
        expect(feed.count).toBe(3);
        expect(feed.sequence).toBe(3);
        expect(feed.batchCount).toBe(1);
        expect(intervals.size).toBe(1)
    });

    test('batches keep exact record values and newest-first cap while publishing one final sequence', () => {
        feed = Neo.create(Feed, {maxRecords: 5});
        const sequences = [],
              release   = feed.getConfig('sequence').subscribe({
                  id: 'workstation-feed-sequence-witness',
                  fn: () => sequences.push(feed.sequence)
              });

        try {
            expect(feed.appendBatch(8)).toBe(5);
            expect(sequences).toEqual([8]);
            expect(feed.batchCount).toBe(1);
            expect(feed.items.map(record => record.id)).toEqual([
                'feed-00000008', 'feed-00000007', 'feed-00000006', 'feed-00000005', 'feed-00000004'
            ]);
            expect(feed.get('feed-00000005').status).toBe('observed');
            const record = feed.get('feed-00000008');
            expect(record.name).toBe('runtime.event.8');
            expect(record.status).toBe('accepted');
            expect(record.counter).toBe(8);
            expect(record.value).toBe(3);
            expect(record.progress).toBe(3);
            expect(record.trend).toEqual([3, 12, 21, 30, 39, 48, 57, 66, 75, 84]);
            expect(record.timestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/);

            expect(feed.appendBatch(2)).toBe(5);
            expect(sequences).toEqual([8, 10]);
            expect(feed.batchCount).toBe(2);
            expect(feed.items.map(record => record.id)).toEqual([
                'feed-00000010', 'feed-00000009', 'feed-00000008', 'feed-00000007', 'feed-00000006'
            ])
        } finally {
            release()
        }
    })
});
