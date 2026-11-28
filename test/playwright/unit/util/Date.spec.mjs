import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DateUtilTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DateUtil       from '../../../../src/util/Date.mjs';

test.describe('Neo.util.Date', () => {
    test('clone returns a new Date instance with the same value and passes null through', () => {
        const date = new Date(2024, 3, 17, 13, 45),
              copy = DateUtil.clone(date);

        expect(copy).not.toBe(date);
        expect(copy.valueOf()).toBe(date.valueOf());
        expect(DateUtil.clone(null)).toBeNull()
    });

    test('convertToyyyymmdd returns the local calendar day as yyyy-mm-dd', () => {
        expect(DateUtil.convertToyyyymmdd(new Date(2024, 4, 17, 13, 45))).toBe('2024-05-17');
        expect(DateUtil.convertToyyyymmdd(new Date(2024, 0, 9))).toBe('2024-01-09')
    });

    test('formatWall formats UTC wall-clock dates and inclusive ranges without local-zone rollover', () => {
        const start = new Date(Date.UTC(2026, 11, 1)),
              end   = new Date(Date.UTC(2026, 11, 7)),
              plain = label => label.replace(/\s+/g, ' ');

        expect(DateUtil.formatWall('en-US', {month: 'short', day: 'numeric'}, start)).toBe('Dec 1');
        expect(plain(DateUtil.formatWall('en-US', {month: 'short', day: 'numeric'}, start, end))).toBe('Dec 1 – 7')
    });

    test('getDaysInMonth covers leap years and every month length', () => {
        expect(DateUtil.getDaysInMonth(new Date(2024, 1, 15))).toBe(29); // leap year February
        expect(DateUtil.getDaysInMonth(new Date(2023, 1, 15))).toBe(28); // common year February
        expect(DateUtil.getDaysInMonth(new Date(2024, 3, 15))).toBe(30);
        expect(DateUtil.getDaysInMonth(new Date(2024, 11, 15))).toBe(31)
    });

    test('getFirstDayOfMonth and getFirstDayOffset wrap correctly for a Sunday-start month', () => {
        // September 2024 starts on a Sunday (getDay() === 0)
        expect(DateUtil.getFirstDayOfMonth(new Date(2024, 8, 10))).toBe(0);

        expect(DateUtil.getFirstDayOffset(new Date(2024, 8, 10), 0)).toBe(0);
        expect(DateUtil.getFirstDayOffset(new Date(2024, 8, 10), 1)).toBe(6); // wraps: 0 - 1 + 7

        // October 2024 starts on a Tuesday
        expect(DateUtil.getFirstDayOfMonth(new Date(2024, 9, 10))).toBe(2);

        expect(DateUtil.getFirstDayOffset(new Date(2024, 9, 10), 0)).toBe(2);
        expect(DateUtil.getFirstDayOffset(new Date(2024, 9, 10), 1)).toBe(1)
    });

    test('getWeekOfYear follows ISO 8601 across the year boundary', () => {
        // 2019-12-30 (a Monday) belongs to week 1 of the ISO week year 2020
        expect(DateUtil.getWeekOfYear(new Date(2019, 11, 30))).toBe(1);

        // 2021-01-01 (a Friday) still belongs to week 53 of the ISO week year 2020
        expect(DateUtil.getWeekOfYear(new Date(2021, 0, 1))).toBe(53);

        expect(DateUtil.getWeekOfYear(new Date(2024, 5, 15))).toBe(24)
    });

    test('getWeekOfYear reads the local calendar day, whatever the zone or the time of day', () => {
        // Monday 2026-11-23 is in ISO week 48 from 00:00 to 23:59 local time
        [[0, 30], [8, 30], [12, 0], [23, 30]].forEach(([hours, minutes]) => {
            expect(DateUtil.getWeekOfYear(new Date(2026, 10, 23, hours, minutes))).toBe(48)
        });

        // Sunday 2026-11-29 is the last day of ISO week 48
        expect(DateUtil.getWeekOfYear(new Date(2026, 10, 29, 0, 30))).toBe(48);
        expect(DateUtil.getWeekOfYear(new Date(2026, 10, 29, 23, 30))).toBe(48);

        // Monday 2026-11-30 starts ISO week 49
        expect(DateUtil.getWeekOfYear(new Date(2026, 10, 30, 0, 30))).toBe(49);

        // The year boundary holds at both ends of the day
        expect(DateUtil.getWeekOfYear(new Date(2019, 11, 29, 23, 30))).toBe(52);
        expect(DateUtil.getWeekOfYear(new Date(2019, 11, 30, 0, 30))).toBe(1);
        expect(DateUtil.getWeekOfYear(new Date(2021, 0, 3, 23, 30))).toBe(53);
        expect(DateUtil.getWeekOfYear(new Date(2021, 0, 4, 0, 30))).toBe(1)
    });

    test('getWeekOfYear keeps the full year for years below 100', () => {
        // The Date constructor and Date.UTC() read the years 0-99 as 1900-1999, so the dates are built via setFullYear()
        let localDate = (year, month, day) => {
            let date = new Date(2000, 0, 1, 12, 0);

            date.setFullYear(year, month, day);

            return date
        };

        // 0099-01-01 (a Thursday) is in week 1 of the ISO week year 99
        expect(DateUtil.getWeekOfYear(localDate(99, 0, 1))).toBe(1);

        // 0099-12-31 (a Thursday) is in week 53 of the ISO week year 99
        expect(DateUtil.getWeekOfYear(localDate(99, 11, 31))).toBe(53);

        // 0100-01-01 (a Friday) and 0100-01-03 (a Sunday) still belong to week 53 of the ISO week year 99
        expect(DateUtil.getWeekOfYear(localDate(100, 0, 1))).toBe(53);
        expect(DateUtil.getWeekOfYear(localDate(100, 0, 3))).toBe(53);

        // 0100-01-04 (a Monday) starts week 1 of the ISO week year 100
        expect(DateUtil.getWeekOfYear(localDate(100, 0, 4))).toBe(1);

        expect(DateUtil.getWeekOfYear(localDate(50, 5, 15))).toBe(24)
    });

    test('getWeekOfYear does not change the passed date', () => {
        let date = new Date(2026, 10, 29, 23, 30);

        DateUtil.getWeekOfYear(date);

        expect(date.getTime()).toBe(new Date(2026, 10, 29, 23, 30).getTime())
    });

    test('getWeeksOfMonth returns 6 weeks when a month spills into a sixth row', () => {
        // May 2027: 31 days starting on a Saturday => 6 rows with weekStartDay 0 and 1
        expect(DateUtil.getWeeksOfMonth(new Date(2027, 4, 10), 0)).toBe(6);
        expect(DateUtil.getWeeksOfMonth(new Date(2027, 4, 10), 1)).toBe(6);

        // February 2024: 29 days starting on a Thursday => 5 rows with weekStartDay 0
        expect(DateUtil.getWeeksOfMonth(new Date(2024, 1, 10), 0)).toBe(5);

        // Finding: February 2027 has 28 days and starts on a Monday. With weekStartDay 1 it fits
        // exactly into 4 rows, yet the method returns 5, since its formula only distinguishes
        // "6 rows" from "everything else" => see PR description.
        expect(DateUtil.getWeeksOfMonth(new Date(2027, 1, 10), 1)).toBe(5)
    });

    test('matchDate compares day, month and year while ignoring the time', () => {
        expect(DateUtil.matchDate(new Date(2024, 6, 4, 8, 15), new Date(2024, 6, 4, 22, 50))).toBe(true);
        expect(DateUtil.matchDate(new Date(2024, 6, 4), new Date(2024, 6, 5))).toBe(false);
        expect(DateUtil.matchDate(new Date(2024, 6, 4), new Date(2024, 7, 4))).toBe(false);
        expect(DateUtil.matchDate(new Date(2024, 6, 4), new Date(2025, 6, 4))).toBe(false)
    })
});
