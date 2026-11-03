import {setup} from '../../../setup.mjs';

const appName = 'FormFieldIBANValidateTest';

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
import IBAN           from '../../../../../src/form/field/IBAN.mjs';

/**
 * @summary Pins what `Neo.form.field.IBAN` accepts and rejects per `countryCode` and via ISO 7064 MOD 97-10 check-digit verification.
 *
 * `IBAN` reassigns `inputPattern` from `countryCodes` in `afterSetCountryCode` (`AT`, `CH`, `DE` in both
 * compact electronic format and 4-character grouped print format) and enforces ISO 7064 MOD 97-10 check
 * digits in `validate()` across all non-empty values regardless of `countryCode`.
 */
test.describe('Neo.form.field.IBAN — validate() per countryCode and MOD 97-10 check digits', () => {
    const createField = config => Neo.create(IBAN, {appName, ...config});

    test('AT accepts 20-character Austrian IBANs with valid check digits and rejects invalid shapes or check digits', () => {
        const field = createField({countryCode: 'AT', value: 'AT611904300234573201'});

        expect(field.validate()).toBe(true);

        field.value = 'AT61 1904 3002 3457 3201';
        expect(field.validate(), 'AT should accept 4-character grouped print format').toBe(true);

        for (const value of [
            'AT61190430023457320',
            'AT6119043002345732012',
            'AT61190430023457320A',
            'AT001904300234573201',
            'DE89370400440532013000'
        ]) {
            field.value = value;
            expect(field.validate(), `AT should reject ${JSON.stringify(value)}`).toBe(false)
        }

        field.destroy()
    });

    test('CH accepts 21-character Swiss IBANs (5n + 12c) with valid check digits and rejects invalid shapes or check digits', () => {
        const field = createField({countryCode: 'CH', value: 'CH9300762011623852957'});

        expect(field.validate()).toBe(true);

        field.value = 'CH93 0076 2011 6238 5295 7';
        expect(field.validate(), 'CH should accept 4-character grouped print format').toBe(true);

        field.value = 'CH2200762AB162385295Z';
        expect(field.validate(), 'CH should accept alphanumeric characters in the 12c account section when check digits match').toBe(true);

        for (const value of [
            'CH930076A011623852957',
            'CH930076201162385295',
            'CH93007620116238529578',
            'CH9300762AB162385295Z',
            'DE89370400440532013000'
        ]) {
            field.value = value;
            expect(field.validate(), `CH should reject ${JSON.stringify(value)}`).toBe(false)
        }

        field.destroy()
    });

    test('DE accepts 22-character German IBANs with valid check digits and rejects corrupted check digits or shapes', () => {
        const field = createField({countryCode: 'DE', value: 'DE89370400440532013000'});

        expect(field.validate()).toBe(true);

        field.value = 'DE89 3704 0044 0532 0130 00';
        expect(field.validate(), 'DE should accept 4-character grouped print format').toBe(true);

        for (const value of [
            'DE00370400440532013000',
            'DE88370400440532013000',
            'DE89370400440532013001',
            'DE8937040044053201300',
            'DE893704004405320130001',
            'DE8937040044053201300A',
            'AT611904300234573201'
        ]) {
            field.value = value;
            expect(field.validate(), `DE should reject ${JSON.stringify(value)}`).toBe(false)
        }

        field.destroy()
    });

    test('changing countryCode updates the verdict and re-validates dirty fields', () => {
        const field = createField({countryCode: 'DE', value: 'DE89370400440532013000'});

        expect(field.validate(false)).toBe(true);
        expect(field.cls).not.toContain('neo-invalid');

        field.countryCode = 'AT';

        expect(field.validate()).toBe(false);
        expect(field.cls).toContain('neo-invalid');
        expect(field._error).toBe('Not a valid IBAN');

        field.destroy()
    });

    test('without a country-specific pattern (null or unmapped countryCode), MOD 97-10 still validates every non-empty value', () => {
        const field = createField({countryCode: 'US', value: 'DE89370400440532013000'});

        expect(field.countryCode).toBe('US');
        expect(field.inputPattern).toBe(null);
        expect(field.validate()).toBe(true);

        for (const value of [
            'DE00370400440532013000',
            'DE88370400440532013000',
            'DE89370400440532013001',
            'not-an-iban',
            '123456'
        ]) {
            field.value = value;
            expect(field.validate(false), `unmapped countryCode should still reject ${JSON.stringify(value)}`).toBe(false);
            expect(field._error).toBe('Not a valid IBAN')
        }

        field.destroy()
    });
});
