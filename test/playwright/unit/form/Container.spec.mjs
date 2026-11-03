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

test.describe('Neo.form.Container#fieldDefaults', () => {
    test('applies fieldDefaults to direct and deeply nested fields while respecting explicit field configs, itemDefaults, and nested form precedence', async () => {
        runId++;

        const form = Neo.create(FormContainer, {
            appName,
            id           : `test-form-defaults-${runId}`,
            fieldDefaults: {
                clearable      : false,
                labelPosition  : 'inline',
                labelWidth     : 120,
                placeholderText: 'Default placeholder'
            },
            items: [{
                module: TextField,
                id    : `test-direct-field-${runId}`,
                name  : 'directField'
            }, {
                module      : BaseContainer,
                id          : `test-nested-container-${runId}`,
                itemDefaults: {
                    labelWidth: 160
                },
                items: [{
                    module: TextField,
                    id    : `test-nested-field-${runId}`,
                    name  : 'nestedField'
                }, {
                    module: BaseContainer,
                    items : [{
                        module         : TextField,
                        id             : `test-deep-override-field-${runId}`,
                        name           : 'deepOverrideField',
                        labelPosition  : 'top',
                        placeholderText: 'Custom placeholder'
                    }]
                }]
            }, {
                module       : FormContainer,
                id           : `test-inner-form-${runId}`,
                fieldDefaults: {
                    labelWidth: 200,
                    readOnly  : true
                },
                items: [{
                    module: BaseContainer,
                    items : [{
                        module: TextField,
                        id    : `test-inner-form-field-${runId}`,
                        name  : 'innerFormField'
                    }]
                }]
            }]
        });

        const directField       = await form.getField('directField');
        const nestedField       = await form.getField('nestedField');
        const deepOverrideField = await form.getField('deepOverrideField');
        const innerFormField    = await form.getField('innerFormField');
        const nestedContainer   = Neo.getComponent(`test-nested-container-${runId}`);

        // Non-field containers do not receive fieldDefaults
        expect(nestedContainer.placeholderText).toBeUndefined();

        // Direct field receives all form.fieldDefaults
        expect(directField.clearable).toBe(false);
        expect(directField.labelPosition).toBe('inline');
        expect(directField.labelWidth).toBe(120);
        expect(directField.placeholderText).toBe('Default placeholder');

        // Nested field inherits form.fieldDefaults, with immediate container itemDefaults taking precedence
        expect(nestedField.clearable).toBe(false);
        expect(nestedField.labelPosition).toBe('inline');
        expect(nestedField.labelWidth).toBe(160);
        expect(nestedField.placeholderText).toBe('Default placeholder');

        // Deeply nested field respects explicit field config over form.fieldDefaults
        expect(deepOverrideField.clearable).toBe(false);
        expect(deepOverrideField.labelPosition).toBe('top');
        expect(deepOverrideField.labelWidth).toBe(120);
        expect(deepOverrideField.placeholderText).toBe('Custom placeholder');

        // Inner form fieldDefaults override outer form fieldDefaults while inheriting non-overlapping outer defaults
        expect(innerFormField.clearable).toBe(false);
        expect(innerFormField.labelPosition).toBe('inline');
        expect(innerFormField.labelWidth).toBe(200);
        expect(innerFormField.placeholderText).toBe('Default placeholder');
        expect(innerFormField.readOnly).toBe(true);

        expect(form.toJSON().fieldDefaults).toEqual({
            clearable      : false,
            labelPosition  : 'inline',
            labelWidth     : 120,
            placeholderText: 'Default placeholder'
        });

        form.destroy();
    });

    test('applies fieldDefaults to dynamically added fields at any depth and propagates runtime fieldDefaults updates', async () => {
        runId++;

        const form = Neo.create(FormContainer, {
            appName,
            id           : `test-form-dynamic-${runId}`,
            fieldDefaults: {
                labelPosition  : 'inline',
                labelWidth     : 110,
                placeholderText: 'Dynamic default'
            },
            items: [{
                module: BaseContainer,
                id    : `test-dynamic-target-box-${runId}`,
                items : []
            }]
        });

        const targetBox = Neo.getComponent(`test-dynamic-target-box-${runId}`);

        // 1. Dynamically add field config directly to form
        const addedDirect = form.add({
            module    : TextField,
            id        : `test-dyn-direct-${runId}`,
            name      : 'dynDirect',
            labelWidth: 150
        });

        expect(addedDirect.labelPosition).toBe('inline');
        expect(addedDirect.labelWidth).toBe(150);
        expect(addedDirect.placeholderText).toBe('Dynamic default');

        // 2. Dynamically add field config to nested container
        const addedNested = targetBox.add({
            module: TextField,
            id    : `test-dyn-nested-${runId}`,
            name  : 'dynNested'
        });

        expect(addedNested.labelPosition).toBe('inline');
        expect(addedNested.labelWidth).toBe(110);
        expect(addedNested.placeholderText).toBe('Dynamic default');

        // 3. Dynamically add pre-instantiated field instance to nested container
        const detachedField = Neo.create(TextField, {
            appName,
            id           : `test-dyn-instance-${runId}`,
            name         : 'dynInstance',
            labelPosition: 'top'
        });

        targetBox.add(detachedField);

        expect(detachedField.labelPosition).toBe('top');
        expect(detachedField.labelWidth).toBe(110);
        expect(detachedField.placeholderText).toBe('Dynamic default');

        // 4. Dynamically add pre-instantiated container subtree containing a field
        const detachedBox = Neo.create(BaseContainer, {
            appName,
            id   : `test-detached-box-${runId}`,
            items: [{
                module: TextField,
                id    : `test-detached-box-field-${runId}`,
                name  : 'detachedBoxField'
            }]
        });

        form.add(detachedBox);
        const detachedBoxField = await form.getField('detachedBoxField');

        expect(detachedBoxField.labelPosition).toBe('inline');
        expect(detachedBoxField.labelWidth).toBe(110);
        expect(detachedBoxField.placeholderText).toBe('Dynamic default');

        // 5. Runtime update to form.fieldDefaults updates non-explicitly-configured properties on descendant fields
        form.fieldDefaults = {
            labelPosition  : 'inline',
            labelWidth     : 140,
            placeholderText: 'Updated runtime default',
            readOnly       : true
        };

        expect(addedDirect.labelWidth).toBe(150); // explicit on addedDirect
        expect(addedDirect.placeholderText).toBe('Updated runtime default');
        expect(addedDirect.readOnly).toBe(true);

        expect(addedNested.labelWidth).toBe(140);
        expect(addedNested.placeholderText).toBe('Updated runtime default');
        expect(addedNested.readOnly).toBe(true);

        expect(detachedField.labelPosition).toBe('top'); // explicit on detachedField
        expect(detachedField.labelWidth).toBe(140);

        form.destroy();
    });
});
