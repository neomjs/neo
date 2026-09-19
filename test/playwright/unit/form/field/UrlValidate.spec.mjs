import {setup} from '../../../setup.mjs';

const appName = 'FormFieldUrlValidateTest';

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
import Url            from '../../../../../src/form/field/Url.mjs';

/**
 * @summary Pins what `Neo.form.field.Url` accepts and rejects, and how it reports a rejection.
 *
 * Url takes the opposite route to Email: it sets a default `inputPattern` and leaves the checking to
 * `Neo.form.field.Text#validate`. These assertions run through `validate()` on a real field instance so
 * they cover the pattern and the path that applies it together.
 */
test.describe('Neo.form.field.Url — validate()', () => {
    const createField = config => Neo.create(Url, {appName, ...config});
    const pattern     = () => Neo.create(Url, {appName}).inputPattern;

    test('pattern accepts host, scheme, and path forms', () => {
        const re = pattern();

        for (const value of ['example.com', 'https://example.com', 'http://example.com', 'example.com/path/to/page', 'https://sub.example.com/x', 'example.com/path/']) {
            expect(re.test(value), `should accept ${JSON.stringify(value)}`).toBe(true)
        }
    });

    test('pattern rejects malformed values', () => {
        const re = pattern();

        for (const value of ['', 'https://example', 'localhost', 'example.com.', 'example.com/a b', 'ftp://example.com', 'https://example.com?q=1']) {
            expect(re.test(value), `should reject ${JSON.stringify(value)}`).toBe(false)
        }
    });

    test('validate() follows the pattern for a non-empty value', () => {
        const field = createField({value: 'example.com'});

        expect(field.validate()).toBe(true);
        expect(field._error).toBe(null);

        field.value = 'example.com/a b';

        expect(field.validate()).toBe(false);
        expect(field._error).toBe(field.errorTextInputPattern({inputPattern: field.inputPattern, maxLength: field.maxLength, minLength: field.minLength, valueLength: 'example.com/a b'.length}))
    });

    test('a bare host is accepted without a scheme', () => {
        expect(createField({value: 'neo.mjs'}).validate()).toBe(true)
    });

    test('an empty value alone is not invalid — required is what makes it so', () => {
        expect(createField({value: ''}).validate()).toBe(true);

        const required = createField({required: true, value: ''});

        expect(required.validate()).toBe(false);
        expect(required._error).toBe(required.errorTextRequired)
    });

    test('validate(false) sets the error text and validate(true) leaves it alone', () => {
        const silent = createField({value: 'not a url'});

        expect(silent.validate(true)).toBe(false);
        expect(silent._error).toBe(silent.errorTextInputPattern({inputPattern: silent.inputPattern, maxLength: silent.maxLength, minLength: silent.minLength, valueLength: 'not a url'.length}));
        expect(silent.cls).not.toContain('neo-invalid');

        const loud = createField({value: 'not a url'});

        expect(loud.validate(false)).toBe(false);
        expect(loud.cls).toContain('neo-invalid')
    });
});
