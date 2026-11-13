import {setup} from '../../setup.mjs';

const appName = 'TimeAxisTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import TimeAxis       from '../../../../src/timeline/TimeAxis.mjs';

test.describe('Neo.timeline.TimeAxis', () => {
    test('extends Neo.core.Base under the Neo.timeline.TimeAxis namespace', () => {
        expect(Neo.ns('Neo.timeline.TimeAxis')).toBe(TimeAxis);
        expect(core.Base.prototype.isPrototypeOf(TimeAxis.prototype)).toBe(true);
    });

    test('maps dates to pixel offsets and back via pxPerMinute and explicit size', () => {
        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 8, 0, 0, 0),
            end        : new Date(2026, 10, 9, 18, 0, 0, 0), // 10 hours = 600 minutes
            pxPerMinute: 2,
            snapMinutes: 15
        });

        expect(axis.totalMinutes).toBe(600);
        expect(axis.totalSize).toBe(1200);
        expect(axis.dateToOffset(new Date(2026, 10, 9, 10, 30, 0, 0))).toBe(300);
        expect(axis.dateToX(new Date(2026, 10, 9, 10, 30, 0, 0))).toBe(300);
        expect(axis.offsetToDate(300).getTime()).toBe(new Date(2026, 10, 9, 10, 30, 0, 0).getTime());
        expect(axis.xToDate(300).getTime()).toBe(new Date(2026, 10, 9, 10, 30, 0, 0).getTime());

        // Switching to explicit size overrides pxPerMinute dynamically
        axis.size = 600;
        expect(axis.effectivePxPerMinute).toBe(1);
        expect(axis.totalSize).toBe(600);
        expect(axis.dateToOffset(new Date(2026, 10, 9, 10, 30, 0, 0))).toBe(150);

        axis.destroy();
    });

    test('snaps and clamps dates and computes rangeFromOffsets with minimum duration', () => {
        const axis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 8, 0, 0, 0),
            end        : new Date(2026, 10, 9, 12, 0, 0, 0),
            pxPerMinute: 2,
            snapMinutes: 15
        });

        const unsnapped = new Date(2026, 10, 9, 8, 22, 0, 0);
        expect(axis.snap(unsnapped).getTime()).toBe(new Date(2026, 10, 9, 8, 15, 0, 0).getTime());

        const roundedUp = new Date(2026, 10, 9, 8, 23, 0, 0);
        expect(axis.snap(roundedUp).getTime()).toBe(new Date(2026, 10, 9, 8, 30, 0, 0).getTime());

        // Clamp before start and after end
        expect(axis.clamp(new Date(2026, 10, 9, 6, 0, 0, 0)).getTime()).toBe(axis.start.getTime());
        expect(axis.clamp(new Date(2026, 10, 9, 14, 0, 0, 0)).getTime()).toBe(axis.end.getTime());

        // rangeFromOffsets enforces minimum duration even when startOffset == endOffset
        const range = axis.rangeFromOffsets(60, 62, 30);
        expect(range.startDate.getTime()).toBe(new Date(2026, 10, 9, 8, 30, 0, 0).getTime());
        expect(range.endDate.getTime()).toBe(new Date(2026, 10, 9, 9, 0, 0, 0).getTime());

        axis.destroy();
    });

    test('projects only viewport-visible ticks across minute, hour, day, week, and month units', () => {
        const hourAxis = Neo.create(TimeAxis, {
            start      : new Date(2026, 10, 9, 0, 0, 0, 0),
            end        : new Date(2026, 10, 10, 0, 0, 0, 0),
            pxPerMinute: 1,
            tickUnit   : 'hour',
            tickStep   : 1
        });

        // Request only a 3-hour visible window [09:00, 12:00] out of 24 hours
        const visibleTicks = hourAxis.getTicks(
            new Date(2026, 10, 9, 9, 0, 0, 0),
            new Date(2026, 10, 9, 12, 0, 0, 0)
        );

        expect(visibleTicks.length).toBe(3);
        expect(visibleTicks[0].index).toBe(9);
        expect(visibleTicks[0].offset).toBe(540);
        expect(visibleTicks[0].size).toBe(60);
        expect(visibleTicks[2].index).toBe(11);
        hourAxis.destroy();

        // Multi-month axis starting on the 1st handles variable month lengths (Jan 31d, Feb 28d, Mar 31d)
        const monthAxis = Neo.create(TimeAxis, {
            start      : new Date(2026, 0, 1, 0, 0, 0, 0),
            end        : new Date(2026, 3, 1, 0, 0, 0, 0),
            pxPerMinute: 0.01,
            tickUnit   : 'month',
            tickStep   : 1
        });

        const monthTicks = monthAxis.getTicks();
        expect(monthTicks.length).toBe(3);
        expect(monthTicks[0].date.getMonth()).toBe(0);
        expect(monthTicks[1].date.getMonth()).toBe(1);
        expect(monthTicks[2].date.getMonth()).toBe(2);
        // February 2026 is shorter than January 2026
        expect(monthTicks[1].size).toBeLessThan(monthTicks[0].size);
        monthAxis.destroy();

        // Month ticks starting on a 29th–31st clamp short months without overflowing February and restore the anchor day
        const endOfMonthAxis = Neo.create(TimeAxis, {
            start      : new Date(2026, 0, 31, 0, 0, 0, 0),
            end        : new Date(2026, 5, 1, 0, 0, 0, 0),
            pxPerMinute: 0.01,
            tickUnit   : 'month',
            tickStep   : 1
        });

        const eomTicks = endOfMonthAxis.getTicks();
        expect(eomTicks.map(t => TimeAxis.dayKey(t.date))).toEqual([
            '2026-01-31',
            '2026-02-28',
            '2026-03-31',
            '2026-04-30',
            '2026-05-31'
        ]);
        endOfMonthAxis.destroy();
    });

    test('formats and parses timezone-safe local day keys without UTC-noon date drift', () => {
        const localDate = new Date(2026, 10, 9, 23, 45, 0, 0);
        const key       = TimeAxis.dayKey(localDate);

        expect(key).toBe('2026-11-09');

        const parsed = TimeAxis.parseDayKey(key, 14, 30);
        expect(parsed.getFullYear()).toBe(2026);
        expect(parsed.getMonth()).toBe(10);
        expect(parsed.getDate()).toBe(9);
        expect(parsed.getHours()).toBe(14);
        expect(parsed.getMinutes()).toBe(30);
    });

    test('detects when the visible range leaves a buffered projection', () => {
        const axis = Neo.create(TimeAxis, {
            start: new Date(2026, 10, 9), end: new Date(2026, 10, 10), pxPerMinute: 2
        });

        try {
            expect(TimeAxis.needsReprojection({hasProjectedWindow: false, timeAxis: axis})).toBe(true);
            expect(TimeAxis.needsReprojection({hasProjectedWindow: true, timeAxis: null})).toBe(true);
            expect(TimeAxis.needsReprojection({
                bufferPx  : 400, hasProjectedWindow: true, projectedMaxPx: 1000, projectedMinPx: 0,
                scrollLeft: 400, timeAxis: axis, viewportWidth: 600
            })).toBe(false);
            expect(TimeAxis.needsReprojection({
                bufferPx  : 400, hasProjectedWindow: true, projectedMaxPx: 1000, projectedMinPx: 0,
                scrollLeft: 401, timeAxis: axis, viewportWidth: 600
            })).toBe(true)
        } finally {
            axis.destroy()
        }
    });

    test('computes working-time calendar checks, snapping, working duration diffs, working offsets, and coalesced non-working ranges', () => {
        // Two-week window starting Monday 2026-11-09 00:00 local time with Wednesday 2026-11-11 as a holiday
        const axis = Neo.create(TimeAxis, {
            start          : TimeAxis.parseDayKey('2026-11-09', 0, 0),
            end            : TimeAxis.parseDayKey('2026-11-23', 0, 0),
            nonWorkingDates: ['2026-11-11'],
            nonWorkingDays : [0, 6],
            pxPerMinute    : 0.5,
            snapMinutes    : 30,
            tickStep       : 6,
            tickUnit       : 'hour'
        });

        expect(axis.hasWorkingCalendar()).toBe(true);
        expect(axis.isNonWorkingDate('2026-11-09')).toBe(false); // Monday
        expect(axis.isNonWorkingDate('2026-11-11')).toBe(true);  // Wednesday holiday
        expect(axis.isNonWorkingDate('2026-11-14')).toBe(true);  // Saturday
        expect(axis.isNonWorkingDate('2026-11-15')).toBe(true);  // Sunday
        expect(axis.isNonWorkingDate('2026-11-16')).toBe(false); // Next Monday

        // Forward and backward snapping across holiday (2026-11-11) and weekend (2026-11-14..2026-11-15)
        const wedNoon = TimeAxis.parseDayKey('2026-11-11', 12, 0);
        expect(TimeAxis.dayKey(axis.snapToWorkingTime(wedNoon, 1))).toBe('2026-11-12');
        expect(axis.snapToWorkingTime(wedNoon, 1).getHours()).toBe(0);
        expect(TimeAxis.dayKey(axis.snapToWorkingTime(wedNoon, -1))).toBe('2026-11-11');
        expect(axis.snapToWorkingTime(wedNoon, -1).getHours()).toBe(0);

        const sunAfternoon = TimeAxis.parseDayKey('2026-11-15', 15, 0);
        expect(TimeAxis.dayKey(axis.snapToWorkingTime(sunAfternoon, 1))).toBe('2026-11-16');
        expect(TimeAxis.dayKey(axis.snapToWorkingTime(sunAfternoon, -1))).toBe('2026-11-14');

        // Working duration diff across Mon 2026-11-09 00:00 -> Mon 2026-11-16 00:00 (7 calendar days - Wed holiday - Sat/Sun = 4 working days = 96h)
        const
            mon1 = TimeAxis.parseDayKey('2026-11-09', 0, 0),
            mon2 = TimeAxis.parseDayKey('2026-11-16', 0, 0),
            ms96 = 96 * 3_600_000;

        expect(axis.diffWorkingMs(mon1, mon2)).toBe(ms96);
        expect(axis.diffWorkingMs(mon2, mon1)).toBe(-ms96);

        // Round-trip addWorkingMs forward and backward across holiday and weekend
        const friNoon  = TimeAxis.parseDayKey('2026-11-13', 12, 0),
              plus24h  = axis.addWorkingMs(friNoon, 24 * 3_600_000),
              minus24h = axis.addWorkingMs(plus24h, -24 * 3_600_000);

        expect(TimeAxis.dayKey(plus24h)).toBe('2026-11-16');
        expect(plus24h.getHours()).toBe(12);
        expect(axis.diffWorkingMs(friNoon, plus24h)).toBe(24 * 3_600_000);
        expect(minus24h.getTime()).toBe(friNoon.getTime());

        // Coalesced non-working ranges in week 1 [2026-11-09, 2026-11-16]:
        // Range 0: 2026-11-11 (24h = 720px @ 0.5 px/min, x = 1440px)
        // Range 1: 2026-11-14..2026-11-16 (48h coalesced Sat+Sun = 1440px, x = 3600px)
        const ranges = axis.getNonWorkingRanges(mon1, mon2);
        expect(ranges.length).toBe(2);
        expect(ranges[0]).toMatchObject({key: '2026-11-11', x: 1440, width: 720});
        expect(ranges[1]).toMatchObject({key: '2026-11-14', x: 3600, width: 1440});

        // Guard when all 7 weekdays are marked non-working: never hangs, falls back cleanly
        axis.nonWorkingDays = [0, 1, 2, 3, 4, 5, 6];
        expect(axis.diffWorkingMs(mon1, mon2)).toBe(0);
        expect(axis.addWorkingMs(mon1, 3_600_000).getTime()).toBe(mon1.getTime() + 3_600_000);
        expect(axis.snapToWorkingTime(mon1, 1).getTime()).toBe(mon1.getTime());

        axis.destroy();
    });
});
