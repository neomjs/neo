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
 * @summary Pins what `Neo.form.field.IBAN` accepts per `countryCode`, including electronic and print formats and unknown countries.
 *
 * `IBAN` reassigns `inputPattern` from `countryCodes` in `afterSetCountryCode`, supporting `AT`, `CH`, and `DE`
 * in both compact electronic format and 4-character grouped print format.
 */
test.describe('Neo.form.field.IBAN — validate() per countryCode', () => {
    const createField = config => Neo.create(IBAN, {appName, ...config});

    test('AT accepts 20-character Austrian IBANs (compact and grouped) and rejects invalid shapes', () => {
        const field = createField({countryCode: 'AT', value: 'AT611904300234573201'});

        expect(field.validate()).toBe(true);

        field.value = 'AT61 1904 3002 3457 3201';
        expect(field.validate(), 'AT should accept 4-character grouped print format').toBe(true);

        for (const value of [
            'AT61190430023457320',
            'AT6119043002345732012',
            'AT61190430023457320A',
            'DE89370400440532013000'
        ]) {
            field.value = value;
            expect(field.validate(), `AT should reject ${JSON.stringify(value)}`).toBe(false)
        }
    });

    test('CH accepts 21-character Swiss IBANs (5n + 12c, compact and grouped) and rejects invalid shapes', () => {
        const field = createField({countryCode: 'CH', value: 'CH9300762011623852957'});

        expect(field.validate()).toBe(true);

        field.value = 'CH93 0076 2011 6238 5295 7';
        expect(field.validate(), 'CH should accept 4-character grouped print format').toBe(true);

        field.value = 'CH9300762AB162385295Z';
        expect(field.validate(), 'CH should accept alphanumeric characters in the 12c account section').toBe(true);

        for (const value of [
            'CH930076A011623852957',
            'CH930076201162385295',
            'CH93007620116238529578',
            'DE89370400440532013000'
        ]) {
            field.value = value;
            expect(field.validate(), `CH should reject ${JSON.stringify(value)}`).toBe(false)
        }
    });

    test('DE accepts 22-character German IBANs (compact and grouped) and rejects invalid shapes', () => {
        const field = createField({countryCode: 'DE', value: 'DE89370400440532013000'});

        expect(field.validate()).toBe(true);

        field.value = 'DE89 3704 0044 0532 0130 00';
        expect(field.validate(), 'DE should accept 4-character grouped print format').toBe(true);

        for (const value of [
            'DE8937040044053201300',
            'DE893704004405320130001',
            'DE8937040044053201300A',
            'AT611904300234573201'
        ]) {
            field.value = value;
            expect(field.validate(), `DE should reject ${JSON.stringify(value)}`).toBe(false)
        }
    });

    test('changing countryCode updates the verdict and re-validates dirty fields', () => {
        const field = createField({countryCode: 'DE', value: 'DE89370400440532013000'});

        expect(field.validate(false)).toBe(true);
        expect(field.cls).not.toContain('neo-invalid');

        field.countryCode = 'AT';

        expect(field.validate()).toBe(false);
        expect(field.cls).toContain('neo-invalid');
        expect(field._error).toBe('Not a valid IBAN')
    });

    test('a country outside the map clears the pattern, so any non-empty value passes', () => {
        const field = createField({countryCode: 'US', value: 'DE89370400440532013000'});

        expect(field.countryCode).toBe('US');
        expect(field.inputPattern).toBe(null);
        expect(field.validate()).toBe(true)
    });

    test('countryField change events synchronize countryCode via countryKeyProperty', () => {
        let listener = null;

        const mockCountryField = {
            record: {id: 'DE'},
            value : 'Germany',
            on(cfg) {
                listener = cfg
            },
            un() {
                listener = null
            }
        };

        const field = createField({
            countryField: mockCountryField,
            value       : 'DE89370400440532013000'
        });

        expect(field.countryCode).toBe('DE');
        expect(field.validate()).toBe(true);

        listener.change.call(listener.scope, {
            component: mockCountryField,
            record   : {id: 'AT'},
            value    : 'Austria'
        });

        expect(field.countryCode).toBe('AT');
        expect(field.validate()).toBe(false);

        field.countryField = null;
        expect(listener).toBe(null)
    });
});
