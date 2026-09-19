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

    test('noon UTC keeps the calendar day only between UTC−11 and UTC+12', () => {
        const submitted = createField({submitDateObject: true}).getSubmitValue(),
              localDay  = [
                  submitted.getFullYear(),
                  String(submitted.getMonth() + 1).padStart(2, '0'),
                  String(submitted.getDate()).padStart(2, '0')
              ].join('-'),
              // getTimezoneOffset is minutes WEST of UTC, so a +14 zone reports −840.
              offsetHours = -submitted.getTimezoneOffset() / 60;

        if (offsetHours > 12 || offsetHours < -11) {
            // Measured, not assumed: at +14 the noon-UTC instant lands on the NEXT local day.
            // The noon literal buys a ±12 margin and no more; a consumer that reads the local day
            // of this Date is off by one in Kiritimati, Apia and Chatham. Pinned so the boundary
            // is a known property rather than a surprise.
            expect(localDay).not.toBe(VALUE)
        } else {
            expect(localDay).toBe(VALUE)
        }
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
