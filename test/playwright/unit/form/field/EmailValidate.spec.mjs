import {setup} from '../../../setup.mjs';

const appName = 'FormFieldEmailValidateTest';

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
import Email          from '../../../../../src/form/field/Email.mjs';

/**
 * @summary Pins what `Neo.form.field.Email` accepts and rejects, and how it reports a rejection.
 *
 * Email is the one of the three fields that owns its validation: it overrides `validate()` and tests
 * `Email.emailRegex` directly, rather than leaving an `inputPattern` for `Neo.form.field.Text` to apply.
 * Values are written out literally so a widened regex fails here instead of shipping.
 */
test.describe('Neo.form.field.Email — validate()', () => {
    const createField = config => Neo.create(Email, {appName, ...config});
    const pattern     = () => Email.emailRegex;

    test('pattern accepts well-formed addresses', () => {
        const re = pattern();

        for (const value of ['user@example.com', 'a@b.co', 'first.last@sub.mail.example.com', 'user+tag@example.com', 'A@EXAMPLE.COM']) {
            expect(re.test(value), `should accept ${JSON.stringify(value)}`).toBe(true)
        }
    });

    test('pattern rejects malformed addresses', () => {
        const re = pattern();

        for (const value of ['', 'plainaddress', 'user@.example.com', 'user@@example.com', 'a b@example.com', 'user@example.com.', '@example.com', 'user@']) {
            expect(re.test(value), `should reject ${JSON.stringify(value)}`).toBe(false)
        }
    });

    test('validate() follows the pattern for a non-empty value', () => {
        const field = createField({value: 'user@example.com'});

        expect(field.validate()).toBe(true);
        expect(field._error).toBe(null);

        field.value = 'user@example.com.';

        expect(field.validate()).toBe(false);
        expect(field._error).toBe(field.errorTextValidEmail)
    });

    test('an empty value alone is not invalid — required is what makes it so', () => {
        expect(createField({value: ''}).validate()).toBe(true);
        expect(createField({value: ''}).validate(false)).toBe(true);

        const required = createField({required: true, value: ''});

        expect(required.validate()).toBe(false);
        expect(required._error).toBe(required.errorTextRequired)
    });

    test('validate(false) sets the error text and validate(true) leaves it alone', () => {
        const silent = createField({value: 'nope'});

        expect(silent.validate(true)).toBe(false);
        expect(silent._error).toBe(silent.errorTextValidEmail);
        expect(silent.cls).not.toContain('neo-invalid');

        const loud = createField({value: 'nope'});

        expect(loud.validate(false)).toBe(false);
        expect(loud.cls).toContain('neo-invalid')
    });
});
