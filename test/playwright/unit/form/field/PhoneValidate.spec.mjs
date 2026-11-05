import {setup} from '../../../setup.mjs';

const appName = 'FormFieldPhoneValidateTest';

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
import Phone          from '../../../../../src/form/field/Phone.mjs';

/**
 * @summary Validates formatted phone input through the field, including balanced international digit groups.
 */
test.describe('Neo.form.field.Phone validation', () => {
    const createField = config => Neo.create(Phone, {appName, ...config});

    test('accepts international groups and existing phone separators', () => {
        const field = createField();

        for (const value of [
            '+49 (151) 1234 567', '+49(151)1234567', '+491511234567',
            '(151) 1234 567', '+49 151 1234 567', '+49 (151)/1234.567-89',
            '030/123456', '030 /123456', '123 / 456', '1/'
        ]) {
            field.value = value;
            expect(field.validate(), value).toBe(true)
        }

        field.destroy()
    });

    test('rejects malformed groups, misplaced plus signs and nonnumeric text', () => {
        const field = createField();

        for (const value of [
            '(123', '123)', '+49 (151', '+49 151)', '+49 ()123',
            '((151))123', '+49 (1/51)123', '+49 (151)abc', 'abc',
            '++49151', '49+151', '+49--151', '+49  151', '+49-'
        ]) {
            field.value = value;
            expect(field.validate(false), value).toBe(false);
            expect(field._error).toBe('Not a valid phone number')
        }

        field.destroy()
    });

    test('clears the visible validation error after a valid edit', () => {
        const field = createField({value: '+49 (151'});

        expect(field.validate(false)).toBe(false);
        expect(field.cls).toContain('neo-invalid');

        field.value = '+49 (151) 1234 567';

        expect(field.validate(false)).toBe(true);
        expect(field.cls).not.toContain('neo-invalid');
        expect(field._error).toBeNull();
        expect(field.inputType).toBe('tel');
        expect(field.inputPatternDOM).toBe(false);

        field.destroy()
    });

    test('preserves inherited optional and required blank validation', () => {
        const field = createField();

        expect(field.validate()).toBe(true);
        field.required = true;
        expect(field.validate(false)).toBe(false);
        expect(field._error).toBe(field.errorTextRequired);

        field.destroy()
    });

    test('uses a caller-supplied pattern', () => {
        const field = createField({inputPattern: /^[0-9]{3}$/, value: '123'});

        expect(field.validate()).toBe(true);
        field.value = '+49 (151) 1234 567';
        expect(field.validate()).toBe(false);

        field.destroy()
    });
});
