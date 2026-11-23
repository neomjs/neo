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

/**
 * @summary Unit tests for Neo.calendar.store.Events#getAllDayRecords
 */
test.describe('Neo.calendar.store.Events#getAllDayRecords', () => {
    let store;

    test.afterEach(() => store?.destroy());

    test('returns overlapping single-day and multi-day all-day events sorted by startDate ascending, excluding timed and out-of-range events', () => {
        const rangeStart = new Date(2026, 9, 12),
              rangeEnd   = new Date(2026, 9, 18);

        store = Neo.create(EventsStore, {
            data: [{
                id       : 1,
                title    : 'Late single all-day',
                allDay   : true,
                startDate: new Date(2026, 9, 16, 0, 0),
                endDate  : new Date(2026, 9, 16, 23, 59)
            }, {
                id       : 2,
                title    : 'Timed event',
                allDay   : false,
                startDate: new Date(2026, 9, 14, 9, 0),
                endDate  : new Date(2026, 9, 14, 10, 0)
            }, {
                id       : 3,
                title    : 'Before range',
                allDay   : true,
                startDate: new Date(2026, 9, 9, 0, 0),
                endDate  : new Date(2026, 9, 11, 23, 59)
            }, {
                id       : 4,
                title    : 'After range',
                allDay   : true,
                startDate: new Date(2026, 9, 19, 0, 0),
                endDate  : new Date(2026, 9, 20, 23, 59)
            }, {
                id       : 5,
                title    : 'Boundary overlap into start',
                allDay   : true,
                startDate: new Date(2026, 9, 10, 0, 0),
                endDate  : new Date(2026, 9, 13, 23, 59)
            }, {
                id       : 6,
                title    : 'Mid-range conference',
                allDay   : true,
                startDate: new Date(2026, 9, 13, 0, 0),
                endDate  : new Date(2026, 9, 15, 23, 59)
            }, {
                id       : 7,
                title    : 'Boundary overlap past end',
                allDay   : true,
                startDate: new Date(2026, 9, 18, 0, 0),
                endDate  : new Date(2026, 9, 20, 23, 59)
            }]
        });

        expect(store.getAllDayRecords(rangeStart, rangeEnd).map(record => record.id)).toEqual([5, 6, 1, 7]);
        expect(store.getAllDayRecords(new Date(2026, 9, 25), new Date(2026, 9, 26))).toEqual([])
    });
});
