import {setup} from '../../setup.mjs';

const appName = 'CalendarEventsStoreTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import EventsStore    from '../../../../src/calendar/store/Events.mjs';

/**
 * @summary Unit tests for Neo.calendar.store.Events#getDayRecords
 */
test.describe('Neo.calendar.store.Events#getDayRecords', () => {
    let store;

    test.afterEach(() => store?.destroy());

    test('returns an event that starts and ends on the day', () => {
        const day = new Date(2026, 9, 15);

        store = Neo.create(EventsStore, {
            data: [{
                id       : 1,
                title    : 'Same-day event',
                startDate: new Date(2026, 9, 15, 9, 0),
                endDate  : new Date(2026, 9, 15, 10, 30)
            }]
        });

        const records = store.getDayRecords(day);

        expect(records).toHaveLength(1);
        expect(records[0].id).toBe(1);
        expect(records[0].title).toBe('Same-day event');
    });

    test('returns two same-day events added late-first sorted by startDate ascending', () => {
        const day = new Date(2026, 9, 15);

        store = Neo.create(EventsStore, {
            data: [{
                id       : 1,
                title    : 'late',
                startDate: new Date(2026, 9, 15, 14, 0),
                endDate  : new Date(2026, 9, 15, 15, 0)
            }, {
                id       : 2,
                title    : 'early',
                startDate: new Date(2026, 9, 15, 9, 0),
                endDate  : new Date(2026, 9, 15, 10, 0)
            }]
        });

        const records = store.getDayRecords(day);

        expect(records.map(record => record.title)).toEqual(['early', 'late']);
    });

    test('does not return an event that starts on the day and ends after midnight on either day', () => {
        const startDay = new Date(2026, 9, 15),
              endDay   = new Date(2026, 9, 16);

        store = Neo.create(EventsStore, {
            data: [{
                id       : 1,
                title    : 'Overnight event',
                startDate: new Date(2026, 9, 15, 22, 0),
                endDate  : new Date(2026, 9, 16, 2, 0)
            }]
        });

        expect(store.getDayRecords(startDay)).toEqual([]);
        expect(store.getDayRecords(endDay)).toEqual([]);
    });

    test('does not return an event on another day', () => {
        const targetDay = new Date(2026, 9, 15);

        store = Neo.create(EventsStore, {
            data: [{
                id       : 1,
                title    : 'Other-day event',
                startDate: new Date(2026, 9, 16, 9, 0),
                endDate  : new Date(2026, 9, 16, 10, 0)
            }]
        });

        expect(store.getDayRecords(targetDay)).toEqual([]);
    });

    test('returns an empty array for a day with no events', () => {
        const emptyDay = new Date(2026, 9, 15);

        store = Neo.create(EventsStore, {
            data: []
        });

        expect(store.getDayRecords(emptyDay)).toEqual([]);
    });
});
