import {setup} from '../../../setup.mjs';

const appName = 'FormFieldBaseRequiredTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import BaseField      from '../../../../../src/form/field/Base.mjs';
import CheckBox       from '../../../../../src/form/field/CheckBox.mjs';
import FileUpload     from '../../../../../src/form/field/FileUpload.mjs';
import Text           from '../../../../../src/form/field/Text.mjs';

/**
 * @summary Unit tests for Neo.form.field.Base required_ config inheritance, reactivity, and serialization.
 */
test.describe('Neo.form.field.Base#required_ (#4817)', () => {
    test('BaseField provides reactive required config, afterSetRequired validation hook, and toJSON serialization', () => {
        const validateCalls = [];

        class CustomBaseField extends BaseField {
            static config = {
                className: 'Test.Unit.Form.Field.BaseRequired.CustomBaseField'
            }

            validate(silent=true) {
                validateCalls.push(silent);
                return !this.required || Boolean(this.value)
            }
        }

        CustomBaseField = Neo.setupClass(CustomBaseField);

        const field = Neo.create(CustomBaseField, {
            appName,
            name: 'customField'
        });

        expect(field.required).toBe(false);
        expect(validateCalls).toEqual([]);
        expect(field.toJSON().required).toBe(false);

        field.required = true;

        expect(field.required).toBe(true);
        expect(validateCalls).toEqual([false]);
        expect(field.validate()).toBe(false);
        expect(field.toJSON().required).toBe(true);

        field.destroy()
    });

    test('CheckBox and Text inherit required_ and serialize required via BaseField#toJSON', () => {
        const checkBox = Neo.create(CheckBox, {
            appName,
            checked: false,
            name   : 'terms'
        });
        const textField = Neo.create(Text, {
            appName,
            name    : 'username',
            required: true
        });

        expect(checkBox.required).toBe(false);
        expect(checkBox.toJSON().required).toBe(false);

        checkBox.required = true;

        expect(checkBox.required).toBe(true);
        expect(checkBox.error).toBe(checkBox.errorTextRequired);
        expect(checkBox.toJSON().required).toBe(true);

        expect(textField.required).toBe(true);
        expect(textField.toJSON().required).toBe(true);

        checkBox.destroy();
        textField.destroy()
    });

    test('FileUpload inherits reactive required_ from BaseField and updates validity when toggled', () => {
        const upload = Neo.create(FileUpload, {
            appName,
            name: 'attachment'
        });

        expect(upload.required).toBe(false);
        expect(upload.isValid()).toBe(true);
        expect(upload.cls).not.toContain('neo-invalid');

        upload.required = true;

        expect(upload.required).toBe(true);
        expect(upload.isValid()).toBe(false);
        expect(upload.cls).toContain('neo-invalid');
        expect(upload.toJSON().required).toBe(true);

        upload.required = false;

        expect(upload.isValid()).toBe(true);
        expect(upload.cls).not.toContain('neo-invalid');

        upload.destroy()
    })
});
