import {setup} from '../../setup.mjs';

const appName = 'CalendarYearComponentTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import CalendarsStore from '../../../../src/calendar/store/Calendars.mjs';
import EventsStore    from '../../../../src/calendar/store/Events.mjs';
import YearComponent  from '../../../../src/calendar/view/YearComponent.mjs';

/**
 * @summary Unit tests for the week number column of Neo.calendar.view.YearComponent
 */
test.describe('Neo.calendar.view.YearComponent week numbers', () => {
    let component;

    test.beforeEach(() => {
        component = Neo.create(YearComponent, {
            appName,
            calendarStore: Neo.create(CalendarsStore),
            currentDate  : new Date(2026, 10, 15),
            eventStore   : Neo.create(EventsStore)
        })
    });

    test.afterEach(() => {
        component.destroy()
    });

    /**
     * @param {Number} weekStartDay
     * @param {Date} [monthDate]
     * @returns {Number[]} the week number shown on each of the six rows of the month
     */
    const getWeekNumbers = (weekStartDay, monthDate = new Date(2026, 10, 1, 23, 30)) => {
        component.weekStartDay = weekStartDay;

        return component.createMonthContent({cn: []}, monthDate).cn
            .filter(row => row.cls.includes('neo-calendar-week'))
            .map(row => row.cn[0].text)
    };

    test('weekStartDay 0 labels each row with the ISO week of its Monday to Saturday', () => {
        // November 2026 starts on a Sunday: Nov 1 is in ISO week 44, the rows after it in 45 to 49
        expect(getWeekNumbers(0).slice(0, 5)).toEqual([45, 46, 47, 48, 49])
    });

    test('weekStartDay 1 labels each row with its own ISO week', () => {
        // The rows start on Monday Oct 26 (ISO week 44) and on Monday Nov 30 (week 49)
        expect(getWeekNumbers(1)).toEqual([44, 45, 46, 47, 48, 49])
    });

    test('the labels do not depend on the time of day of the date the month is built from', () => {
        [0, 1].forEach(weekStartDay => {
            expect(getWeekNumbers(weekStartDay, new Date(2026, 10, 1, 0, 30)))
                .toEqual(getWeekNumbers(weekStartDay, new Date(2026, 10, 1, 23, 30)))
        })
    })
});
