/**
 * @file test/playwright/unit/form/field/DateSubmitValue.spec.mjs
 * @summary Pins the two local↔UTC conversions in `form.field.Date#getSubmitValue()` — the noon-UTC
 * `submitDateObject` construction and the `isoDate` round-trip — in a runner whose timezone is NOT UTC.
 *
 * Why the zone is the instrument: where the offset is zero, a correct conversion and a missing one
 * compute the same answer for every input, so no additional test case can tell them apart. This spec
 * is therefore run by `playwright.config.unit-tz.mjs`, which pins a non-UTC zone before the clock is
 * first read. Under the default unit tier on a UTC runner these assertions still pass and prove
 * nothing, which is why this spec belongs to the timezone tier rather than being weakened to suit
 * a zone that cannot discriminate.
 */

import {setup} from '../../../setup.mjs';

const appName = 'DateSubmitValueTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import DateField      from '../../../../../src/form/field/Date.mjs';

const VALUE = '2024-05-17';

test.describe('Neo.form.field.Date — getSubmitValue() across the local/UTC boundary', () => {
    const createField = config => Neo.create(DateField, {appName, value: VALUE, ...config});

    test('the runner is not on UTC, so these assertions can fail', () => {
        // A guard on the instrument itself: on a zero offset every assertion below passes for the
        // right and the wrong implementation alike, so the suite would be green and empty.
        expect(new Date().getTimezoneOffset(), 'run this spec through playwright.config.unit-tz.mjs').not.toBe(0)
    });

    test('submitDateObject returns the value at NOON UTC, regardless of the runner zone', () => {
        const submitted = createField({submitDateObject: true}).getSubmitValue();

        expect(submitted).toBeInstanceOf(Date);

        // The zone-independent fact, and the one the noon literal exists to produce. Changing
        // `T12:00:00.000Z` to `T00:00:00.000Z` in the source fails exactly here.
        expect(submitted.toISOString()).toBe(`${VALUE}T12:00:00.000Z`)
    });

    test('noon UTC keeps the calendar day on the half-open interval [−12, +12)', () => {
        const submitted = createField({submitDateObject: true}).getSubmitValue(),
              localDay  = [
                  submitted.getFullYear(),
                  String(submitted.getMonth() + 1).padStart(2, '0'),
                  String(submitted.getDate()).padStart(2, '0')
              ].join('-'),
              // getTimezoneOffset is minutes WEST of UTC, so a +14 zone reports −840.
              offsetHours = -submitted.getTimezoneOffset() / 60;

        // The noon literal buys twelve hours of margin in each direction, and the interval it keeps
        // is HALF-OPEN: at exactly +12 noon UTC is already midnight of the next local day, while at
        // exactly −12 it is still midnight of the same one. A consumer reading the local day of this
        // Date is therefore off by one from +12 upwards — Tarawa, Apia, Chatham, Kiritimati — and
        // correct everywhere else. Pinned so the boundary is a known property rather than a surprise.
        offsetHours >= 12 || offsetHours < -12
            ? expect(localDay).not.toBe(VALUE)
            : expect(localDay).toBe(VALUE)
    });

    test('the [−12, +12) endpoints hold, independently of the runner zone', () => {
        // The arm above can only observe the one zone this process runs in, so its predicate was
        // wrong at both endpoints and still passed under +14 and −11 (@neo-gpt's falsifier on the
        // first head). This arm evaluates the boundary itself: the same noon-UTC instant, read at a
        // named offset, using UTC arithmetic rather than the runner's clock — so every endpoint is
        // exercised on every machine.
        const noonUtc = new Date(`${VALUE}T12:00:00.000Z`),

              // The local calendar day an observer at `offsetHours` would read off this instant.
              dayAt = offsetHours => new Date(noonUtc.getTime() + offsetHours * 3600000)
                  .toISOString().slice(0, 10);

        // Inside the interval — the day survives.
        for (const offsetHours of [-12, -11, -5, 0, 5.75, 11, 11.99]) {
            expect(dayAt(offsetHours), `offset ${offsetHours} should keep the day`).toBe(VALUE)
        }

        // At and beyond the upper endpoint — the day rolls forward. +12 is the first failing offset,
        // which is why the interval is half-open rather than symmetric.
        for (const offsetHours of [12, 12.75, 13, 14]) {
            expect(dayAt(offsetHours), `offset ${offsetHours} should roll the day forward`).not.toBe(VALUE)
        }

        // Below the lower endpoint the day rolls back, so −12 is included and −12.5 is not.
        expect(dayAt(-12.5)).not.toBe(VALUE)
    });

    test('isoDate round-trips the date-only string through UTC, not through local time', () => {
        const submitted = createField({isoDate: true}).getSubmitValue();

        expect(typeof submitted).toBe('string');

        // `new Date('yyyy-mm-dd')` is parsed as UTC by the language spec. Parsing it as local time
        // instead — the obvious "simplification" — shifts the instant by the runner's offset and
        // fails here, which is the whole point of running this spec off UTC.
        expect(submitted).toBe(`${VALUE}T00:00:00.000Z`)
    });

    test('neither conversion applies without its config', () => {
        expect(createField().getSubmitValue()).toBe(VALUE)
    })
});
