import {setup} from '../../../setup.mjs';

const appName = 'FormFieldZipCodeValidateTest';

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
import ZipCode        from '../../../../../src/form/field/ZipCode.mjs';

/**
 * @summary Pins what `Neo.form.field.ZipCode` accepts per country, including the country it does not know.
 *
 * ZipCode reassigns `inputPattern` from the static `countryCodes` map in `afterSetCountryCode`, so the
 * pattern a field validates against is a function of its `countryCode` rather than a class default.
 * `countryCodes` holds `AT`, `CH` and `DE` only; the not-in-the-map case is pinned here to what the
 * source actually does (`ZipCode.countryCodes[value] || null`) rather than to an assumption about it.
 */
test.describe('Neo.form.field.ZipCode — validate() per countryCode', () => {
    const createField = config => Neo.create(ZipCode, {appName, ...config});

    test('AT and CH accept four digits and reject everything else', () => {
        for (const countryCode of ['AT', 'CH']) {
            const field = createField({countryCode, value: '1234'});

            expect(field.validate(), `${countryCode} should accept 1234`).toBe(true);

            for (const value of ['123', '12345', '12345', 'abcd', '12a4']) {
                field.value = value;
                expect(field.validate(), `${countryCode} should reject ${JSON.stringify(value)}`).toBe(false)
            }
        }
    });

    test('DE accepts five digits and excludes the reserved edges', () => {
        const field = createField({countryCode: 'DE', value: '10115'});

        expect(field.validate()).toBe(true);

        // 01000 and 99999 are excluded by the pattern's negative lookahead, not by length.
        for (const value of ['01000', '99999', '1234', '123456', '00000']) {
            field.value = value;
            expect(field.validate(), `DE should reject ${JSON.stringify(value)}`).toBe(false)
        }

        field.value = '01067';
        expect(field.validate(), 'DE should accept 01067').toBe(true)
    });

    test('the same value changes verdict with the country', () => {
        const field = createField({countryCode: 'AT', value: '1234'});

        expect(field.validate(), 'four digits are valid for AT').toBe(true);

        field.countryCode = 'DE';

        expect(field.validate(), 'four digits are not valid for DE').toBe(false)
    });

    test('a country outside the map clears the pattern, so any non-empty value passes', () => {
        const field = createField({countryCode: 'US', value: '1234'});

        expect(field.countryCode).toBe('US');
        expect(field.inputPattern, 'US is not in countryCodes, so no pattern is applied').toBe(null);
        expect(field.validate(), 'with no pattern set, validation has nothing to reject').toBe(true);

        field.value = 'not a zip at all';

        expect(field.validate()).toBe(true)
    });

    test('an empty value alone is not invalid — required is what makes it so', () => {
        expect(createField({countryCode: 'DE', value: ''}).validate()).toBe(true);

        const required = createField({countryCode: 'DE', required: true, value: ''});

        expect(required.validate()).toBe(false);
        expect(required._error).toBe(required.errorTextRequired)
    });

    test('validate(false) sets the error text and validate(true) leaves it alone', () => {
        const silent = createField({countryCode: 'DE', value: '1234'});

        expect(silent.validate(true)).toBe(false);
        expect(silent._error).toBe(silent.errorTextInputPattern({inputPattern: silent.inputPattern, maxLength: silent.maxLength, minLength: silent.minLength, valueLength: 4}));
        expect(silent.cls).not.toContain('neo-invalid');

        const loud = createField({countryCode: 'DE', value: '1234'});

        expect(loud.validate(false)).toBe(false);
        expect(loud.cls).toContain('neo-invalid')
    });
});
