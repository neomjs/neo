import {setup} from '../../setup.mjs';

const appName = 'TimelineCalendarZoneTest';

setup({
    neoConfig: {allowVdomUpdatesInTests: true, unitTestMode: true, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import TimeAxis       from '../../../../src/timeline/TimeAxis.mjs';
import TimeAxisHeader from '../../../../src/timeline/TimeAxisHeader.mjs';

const hour = 3_600_000;
const utc  = value => new Date(value).toISOString();

for (const [hostZone, expectedOffset] of [
    ['UTC', 0], ['Europe/Berlin', -60], ['America/Los_Angeles', 480], ['Asia/Tokyo', -540]
]) test(`UTC shading, ticks and working-time math are host-independent (${hostZone})`, () => {
    const previousTZ = process.env.TZ;
    process.env.TZ = hostZone;
    let axis;
    try {
        // A fixed winter instant distinguishes all four hosts and detects a TZ change that did not take effect.
        expect(new Date('2026-11-12T12:00:00Z').getTimezoneOffset()).toBe(expectedOffset);
        axis = Neo.create(TimeAxis, {
            start      : '2026-11-12', end: '2026-11-19', timeZone: 'UTC', nonWorkingDates: ['2026-11-16'],
            snapMinutes: 1440, pxPerMinute: 1
        });

        const [shade] = axis.getNonWorkingRanges();
        expect([utc(axis.start), utc(axis.end)]).toEqual([utc('2026-11-12T00:00Z'), utc('2026-11-19T00:00Z')]);
        expect([shade.key, utc(shade.start), utc(shade.end), shade.x, shade.width]).toEqual([
            '2026-11-14', utc('2026-11-14T00:00Z'), utc('2026-11-17T00:00Z'), 2880, 4320
        ]);
        expect(axis.getTicks(undefined, undefined, 'day').map(t => utc(t.date))).toEqual(
            [12,13,14,15,16,17,18].map(day => utc(`2026-11-${day}T00:00Z`))
        );
        const fri = '2026-11-13T20:00Z', tue = '2026-11-17T20:00Z';
        expect(utc(axis.addWorkingMs(fri, 24 * hour))).toBe(utc(tue));
        expect(utc(axis.addWorkingMs(tue, -24 * hour))).toBe(utc(fri));
        expect(axis.diffWorkingMs(fri, tue)).toBe(24 * hour);
        expect(axis.diffWorkingMs(tue, fri)).toBe(-24 * hour);
        expect(utc(axis.snapToWorkingTime('2026-11-16T15:00Z', 1))).toBe(utc('2026-11-17T00:00Z'));
        expect(utc(axis.snapToWorkingTime('2026-11-16T15:00Z', -1))).toBe(utc('2026-11-14T00:00Z'));
        expect(utc(axis.snap('2026-11-13T12:01Z'))).toBe(utc('2026-11-14T00:00Z'));
    } finally {
        axis?.destroy();
        if (previousTZ === undefined) delete process.env.TZ;
        else process.env.TZ = previousTZ
    }
});

test('Berlin autumn day boundaries, shading and working milliseconds include the repeated hour', () => {
    const axis = Neo.create(TimeAxis, {
        timeZone      : 'Europe/Berlin', start: '2026-10-24T22:00Z', end: '2026-10-26T23:00Z',
        nonWorkingDays: [], nonWorkingDates: ['2026-10-25'], pxPerMinute: 1
    });

    try {
        const [sun, mon] = axis.getTicks(undefined, undefined, 'day');
        expect([utc(sun.date), utc(sun.endDate), sun.size, utc(mon.date), utc(mon.endDate)]).toEqual([
            utc('2026-10-24T22:00Z'), utc('2026-10-25T23:00Z'), 1500, utc('2026-10-25T23:00Z'), utc('2026-10-26T23:00Z')
        ]);
        const [shade] = axis.getNonWorkingRanges();
        expect([shade.key, utc(shade.start), utc(shade.end), shade.width]).toEqual([
            '2026-10-25', utc('2026-10-24T22:00Z'), utc('2026-10-25T23:00Z'), 1500
        ]);
        expect(utc(axis.snap('2026-10-25T11:01Z', 1440))).toBe(utc('2026-10-25T23:00Z'));
        axis.nonWorkingDates = ['2026-10-26'];
        expect(axis.diffWorkingMs(sun.date, sun.endDate)).toBe(25 * hour);
        expect(utc(axis.addWorkingMs(sun.date, 24 * hour))).toBe(utc('2026-10-25T22:00Z'));
    } finally { axis.destroy() }
});

test('day steps resolve the repeated wall time earlier, move a missing wall time forward and keep subsecond precision', () => {
    const axis = Neo.create(TimeAxis, {timeZone: 'Europe/Berlin'});

    try {
        // At 02:30 in Berlin the clock jumps ahead in March; it repeats that time at +02/+01 in October.
        expect(utc(axis.parseDayKey('2026-03-29', 2, 30))).toBe(utc('2026-03-29T01:30Z'));
        expect(utc(axis.parseDayKey('2026-10-25', 2, 30))).toBe(utc('2026-10-25T00:30Z'));
        expect(utc(axis.addTick(new Date('2026-03-28T01:30:42.337Z'), 'day', 1))).toBe('2026-03-29T01:30:42.337Z');
        expect(utc(axis.addTick(new Date('2026-10-24T00:30:42.337Z'), 'day', 1))).toBe('2026-10-25T00:30:42.337Z');
        expect(utc(axis.addTick(new Date('2026-10-25T00:30:42.337Z'), 'hour', 1))).toBe('2026-10-25T01:30:42.337Z');
        const repeated = new Date('2026-10-25T01:30:42.337Z');
        expect(utc(axis.addTick(repeated, 'day', 0))).toBe('2026-10-25T00:30:42.337Z');
        expect(utc(axis.addTick(repeated, 'minute', 0))).toBe(utc(repeated));
        expect(axis.dayKey(new Date('2026-10-24T22:10Z'))).toBe('2026-10-25');
        const springTicks = Neo.create(TimeAxis, {timeZone: 'Europe/Berlin', start: '2026-03-29',
            end: '2026-03-30', tickUnit: 'day', pxPerMinute: 1, nonWorkingDays: []});
        try {
            const [sunday] = springTicks.getTicks();
            expect([utc(sunday.date), utc(sunday.endDate), sunday.size]).toEqual([
                utc('2026-03-28T23:00Z'), utc('2026-03-29T22:00Z'), 1380
            ]);
        } finally { springTicks.destroy() }
    } finally { axis.destroy() }
});

test('calendar ticks seek to the visible window while preserving origin-anchored indices and month ends', () => {
    const axis   = Neo.create(TimeAxis, {timeZone: 'Europe/Berlin', start: '1990-01-31', end: '2030-03-01'});
    const start  = new Date('2026-02-27T12:00Z'), end = new Date('2026-03-06T12:00Z');
    const origin = axis.start, addTick = axis.addTick.bind(axis);
    let   calls  = 0;
    axis.addTick = (...args) => { calls++; return addTick(...args) };
    try {
        const near = axis.getTicks(origin, new Date(+origin + 7 * 24 * hour), 'day');
        expect(calls).toBe(near.length);
        for (const unit of ['day', 'week', 'month']) {
            const expected = [];
            for (let i = 0, tick = origin; tick < end; i++) {
                const next = addTick(origin, unit, i + 1);
                if (next > start) expected.push([i, +tick, +next]);
                tick = next
            }
            calls = 0;
            const actual = axis.getTicks(start, end, unit);
            expect(actual.map(t => [t.index, +t.date, +t.endDate])).toEqual(expected);
            expect(calls).toBeLessThanOrEqual(actual.length + 3)
        }
    } finally { axis.destroy() }
});

test('week and month ticks retain the originating civil time across DST and short months', () => {
    const axis = Neo.create(TimeAxis, {
        timeZone: 'Europe/Berlin', start: '2026-10-18T22:00Z', end: '2026-11-09T00:00Z'
    });
    const monthly = Neo.create(TimeAxis, {
        timeZone: 'Europe/Berlin', start: '2026-01-30T23:00Z', end: '2026-04-30T22:00Z'
    });
    const fixed = Neo.create(TimeAxis, {timeZone: 'UTC', start: '2026-01-31', end: '2026-04-01'});

    try {
        expect(axis.getTicks(undefined, undefined, 'week').slice(0, 3).map(t => utc(t.date))).toEqual(
            ['2026-10-18T22:00Z','2026-10-25T23:00Z','2026-11-01T23:00Z'].map(utc)
        );
        expect(monthly.getTicks(undefined, undefined, 'month').slice(0, 4).map(t => utc(t.date))).toEqual(
            ['2026-01-30T23:00Z','2026-02-27T23:00Z','2026-03-30T22:00Z','2026-04-29T22:00Z'].map(utc)
        );
        expect(fixed.getTicks(undefined, undefined, 'month').map(t => utc(t.date))).toEqual(
            ['2026-01-31T00:00Z','2026-02-28T00:00Z','2026-03-31T00:00Z'].map(utc)
        );
        expect(fixed.getTicks(undefined, undefined, 'week')[1].date.toISOString()).toBe(utc('2026-02-07T00:00Z'));
    } finally { axis.destroy(); monthly.destroy(); fixed.destroy() }
});

test('unset zone retains host day keys and invalid configuration leaves the active zone intact', () => {
    const axis = Neo.create(TimeAxis, {start: '2026-11-12', end: '2026-11-19'});

    try {
        expect(utc(axis.start)).toBe(utc(new Date(2026,10,12)));
        expect(utc(axis.parseDayKey('2026-03-29', 2, 30))).toBe(utc(new Date(2026,2,29,2,30)));
        axis.timeZone = 'Asia/Tokyo';
        expect(axis.dayKey(new Date('2026-11-12T16:00Z'))).toBe('2026-11-13');
        expect(() => { axis.timeZone = 'NoSuch/Zone' }).toThrow();
        expect(axis.timeZone).toBe('Asia/Tokyo');
        expect(axis.dayKey(new Date('2026-11-12T16:00Z'))).toBe('2026-11-13');
        axis.nonWorkingDays = [];
        axis.nonWorkingDates = [new Date('2026-11-12T16:00Z'), '2026-11-15'];
        expect(axis.nonWorkingDates).toEqual(['2026-11-13','2026-11-15']);
        axis.timeZone = 'UTC';
        expect(axis.nonWorkingDates).toEqual(['2026-11-12','2026-11-15']);
        expect(axis.isNonWorkingDate('2026-11-13')).toBe(false);
        expect(axis.isNonWorkingDate('2026-11-15')).toBe(true);
        axis.timeZone = null;
        expect(utc(axis.parseDayKey('2026-03-29', 2, 30))).toBe(utc(new Date(2026,2,29,2,30)));
    } finally { axis.destroy() }
});

test('default header hour labels and weekend shading use the common axis', () => {
    const axis = Neo.create(TimeAxis, {
        timeZone: 'Asia/Kathmandu', start: '2026-11-13T18:15Z', end: '2026-11-13T21:15Z',
        tickUnit: 'hour', pxPerMinute: 1
    });
    const header = Neo.create(TimeAxisHeader, {appName, timeAxis: axis, majorTickUnit: 'day',
        viewportWidth: 180, bufferPx: 0, showNonWorkingTime: true});

    try {
        const [major, minor] = header.vdom.cn;
        expect(major.cn[0].text).toBe('2026-11-14');
        expect(minor.cn.filter(n => n.cls.includes('neo-timeline-tick-minor')).map(n => n.text)).toEqual(['00:00','01:00','02:00']);
        expect(minor.cn.find(n => n.cls.includes('neo-timeline-non-working'))).toMatchObject({
            data: {dayKey: '2026-11-14'}, style: {width: '180px'}
        });
        axis.timeZone = 'UTC';
        const [updatedMajor, updatedMinor] = header.vdom.cn;
        expect(updatedMajor.cn[0].text).toBe('2026-11-13');
        expect(updatedMinor.cn.filter(n => n.cls.includes('neo-timeline-tick-minor')).map(n => n.text)).toEqual(['18:15','19:15','20:15']);
        expect(updatedMinor.cn.find(n => n.cls.includes('neo-timeline-non-working'))).toBeUndefined();
    } finally { header.destroy(); axis.destroy() }
});

test('zone changes preserve bound instants until both local-day bounds are reassigned', () => {
    const axis = Neo.create(TimeAxis, {timeZone: 'UTC', start: '2026-11-13', end: '2026-11-17'});
    let fresh;

    try {
        const before = [utc(axis.start), utc(axis.end)];
        axis.timeZone = 'Europe/Berlin';
        expect([utc(axis.start), utc(axis.end)]).toEqual(before);

        axis.set({timeZone: 'Europe/Berlin', start: '2026-11-13T00:00:00+02:00', end: '2026-11-17T00:00:00+02:00'});
        expect([utc(axis.start), utc(axis.end)]).toEqual(['2026-11-12T22:00:00.000Z', '2026-11-16T22:00:00.000Z']);

        axis.set({timeZone: 'Europe/Berlin', start: '2026-11-13', end: '2026-11-17'});
        fresh = Neo.create(TimeAxis, {timeZone: 'Europe/Berlin', start: '2026-11-13', end: '2026-11-17'});
        expect([utc(axis.start), utc(axis.end)]).toEqual([utc(fresh.start), utc(fresh.end)]);
        expect(axis.getTicks(undefined, undefined, 'day')).toEqual(fresh.getTicks(undefined, undefined, 'day'));
        expect(axis.getNonWorkingRanges()).toEqual(fresh.getNonWorkingRanges());
    } finally { axis.destroy(); fresh?.destroy() }
});
