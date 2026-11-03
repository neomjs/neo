import {setup} from '../../setup.mjs';

const appName = 'FormContainerSetErrorsTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import BaseContainer      from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import FormContainer      from '../../../../src/form/Container.mjs';
import TextField          from '../../../../src/form/field/Text.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import VDomUtil           from '../../../../src/util/VDom.mjs';

let runId = 0;

async function createFormFixture() {
    runId++;

    const form = Neo.create(FormContainer, {
        appName,
        id   : `test-form-container-${runId}`,
        items: [{
            module: TextField,
            id    : `test-field-email-${runId}`,
            name  : 'email',
            value : 'alice@example.com'
        }, {
            module   : BaseContainer,
            formGroup: 'profile',
            items    : [{
                module: TextField,
                id    : `test-field-username-${runId}`,
                name  : 'username',
                value : 'alice'
            }, {
                module   : BaseContainer,
                formGroup: 'contacts[0]',
                items    : [{
                    module: TextField,
                    id    : `test-field-phone-${runId}`,
                    name  : 'phone',
                    value : '12345'
                }]
            }]
        }, {
            module: TextField,
            id    : `test-field-unmapped-${runId}`,
            value : 'by-id-only'
        }]
    });

    await form.initVnode();
    form.mounted = true;

    return {
        form,
        emailField   : await form.getField('email'),
        usernameField: await form.getField('username'),
        phoneField   : await form.getField('phone'),
        idOnlyField  : await form.getField(`test-field-unmapped-${runId}`)
    };
}

function getErrorWrapper(field) {
    return VDomUtil.find(field.vdom, {cls: 'neo-textfield-error-wrapper'}).vdom;
}

test.describe('Neo.form.Container#setErrors', () => {
    test('sets multiple field errors across flat, nested formGroup, array path, and id-only fields without mutating caller input', async () => {
        const {form, emailField, usernameField, phoneField, idOnlyField} = await createFormFixture();

        expect(await form.isValid()).toBe(true);
        expect(await form.getFormState()).toBe('valid');

        const apiErrors = {
            email  : 'Email already registered',
            profile: {
                username: 'Username is reserved',
                contacts: [
                    {phone: 'Invalid country prefix'}
                ]
            },
            [idOnlyField.id]: 'Custom ID error'
        };

        await form.setErrors(apiErrors);

        // Caller payload must not be mutated by adjustTreeLeaves
        expect(apiErrors.email).toBe('Email already registered');
        expect(apiErrors.profile.username).toBe('Username is reserved');

        expect(emailField.error).toBe('Email already registered');
        expect(usernameField.error).toBe('Username is reserved');
        expect(phoneField.error).toBe('Invalid country prefix');
        expect(idOnlyField.error).toBe('Custom ID error');

        for (const [field, expectedText] of [
            [emailField,    'Email already registered'],
            [usernameField, 'Username is reserved'],
            [phoneField,    'Invalid country prefix'],
            [idOnlyField,   'Custom ID error']
        ]) {
            expect(field.clean).toBe(false);
            expect(field.cls).toContain('neo-invalid');
            const wrapper = getErrorWrapper(field);
            expect(wrapper.removeDom).toBe(false);
            expect(wrapper.cn[0].text).toBe(expectedText);
            expect(field.isValid()).toBe(false);
        }

        expect(await form.isValid()).toBe(false);
        expect(await form.getFormState()).toBe('invalid');

        form.destroy();
    });

    test('clears individual errors when setErrors passes null and restores valid form state when value is updated', async () => {
        const {form, emailField, usernameField} = await createFormFixture();

        await form.setErrors({
            email  : 'Email already registered',
            profile: {
                username: 'Username is reserved'
            }
        });

        expect(await form.isValid()).toBe(false);

        // Clear email error via setErrors({ email: null })
        await form.setErrors({
            email: null
        });

        expect(emailField.error).toBeNull();
        expect(emailField.cls).not.toContain('neo-invalid');
        expect(getErrorWrapper(emailField).removeDom).toBe(true);
        expect(emailField.isValid()).toBe(true);

        // Username still holds its server error
        expect(usernameField.error).toBe('Username is reserved');
        expect(await form.isValid()).toBe(false);

        // Updating username value triggers client-side re-validation and clears the server error
        usernameField.value = 'alice_new';

        expect(usernameField.error).toBeNull();
        expect(usernameField.cls).not.toContain('neo-invalid');
        expect(await form.isValid()).toBe(true);
        expect(await form.getFormState()).toBe('valid');

        form.destroy();
    });

    test('isValid() re-evaluates validator functions whose external condition changes while value is unchanged', async () => {
        let allowed = false;

        const field = Neo.create(TextField, {
            appName,
            name     : 'confirmPassword',
            value    : 'secret',
            validator: () => allowed || 'Passwords do not match'
        });

        expect(field.isValid()).toBe(false);
        expect(field.error).toBe('Passwords do not match');

        // External condition flips to valid while field.value remains unchanged
        allowed = true;

        expect(field.isValid()).toBe(true);
        expect(field.error).toBeNull();

        field.destroy();
    });
});
