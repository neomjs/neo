import {setup} from '../../../../setup.mjs';

const appName = 'FormValidationMainContainerTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import '../../../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../../../src/vdom/Helper.mjs';
import MainContainer  from '../../../../../../examples/form/validation/MainContainer.mjs';

/**
 * @summary Creates the example page and hands back the parts the tests drive
 * @returns {Promise<Object>}
 */
async function createPage() {
    const page = Neo.create(MainContainer, {appName, applyBodyCls: false});

    await page.initVnode();
    page.mounted = true;

    return {
        page,
        button  : page.getReference('signup-button'),
        email   : page.getReference('email-field'),
        name    : page.getReference('name-field'),
        password: page.getReference('password-field'),
        problems: page.getReference('signup-problems'),
        repeat  : page.getReference('password-repeat-field'),
        result  : page.getReference('signup-result'),
        terms   : page.getReference('terms-field')
    }
}

/**
 * Fills every field with a valid value, engaging each one the way a visitor's typing would
 * @param {Object} parts
 */
function fillValidForm(parts) {
    parts.name.value     = 'Jane Doe';
    parts.email.value    = 'jane.doe@example.com';
    parts.password.value = 'correct horse battery';
    parts.repeat.value   = 'correct horse battery';
    parts.terms.checked  = true;

    ['name', 'email', 'password', 'passwordRepeat', 'terms'].forEach(name => parts.page.engagedFields.add(name))
}

test.describe('examples/form/validation MainContainer', () => {
    test('the button starts disabled and no problem is listed before the visitor types', async () => {
        const {page, button, problems} = await createPage();

        await page.updateValidationState();

        expect(button.disabled).toBe(true);
        expect(problems.html).toContain('Start typing');

        page.destroy()
    });

    test('a bad email joins the problem list as soon as it is typed, and leaves it once fixed', async () => {
        const parts = await createPage();

        parts.email.value = 'jane.doe@';
        parts.page.engagedFields.add('email');
        await parts.page.updateValidationState();

        expect(parts.email.error).toBe('Not a valid email address');
        expect(parts.problems.html).toContain('Not a valid email address');
        expect(parts.button.disabled).toBe(true);

        parts.email.value = 'jane.doe@example.com';
        await parts.page.updateValidationState();

        expect(parts.email.error).toBeNull();
        expect(parts.problems.html).not.toContain('Not a valid email address');

        parts.page.destroy()
    });

    test('a password that differs from its repeat is a problem of the repeat field', async () => {
        const parts = await createPage();

        fillValidForm(parts);
        parts.repeat.value = 'correct horse batter';
        await parts.page.updateValidationState();

        expect(parts.repeat.error).toBe('Passwords do not match');
        expect(parts.problems.html).toContain('Passwords do not match');
        expect(parts.button.disabled).toBe(true);

        parts.repeat.value = 'correct horse battery';
        await parts.page.updateValidationState();

        expect(parts.repeat.error).toBeNull();
        expect(parts.button.disabled).toBe(false);

        parts.page.destroy()
    });

    test('a fully valid form unlocks the button, and signing up shows the values with the password masked', async () => {
        const parts = await createPage();

        fillValidForm(parts);
        await parts.page.updateValidationState();

        expect(parts.button.disabled).toBe(false);
        expect(parts.problems.html).toContain('Nothing wrong');

        await parts.page.onSignUpClick();

        expect(parts.result.hidden).toBe(false);
        expect(parts.result.html).toContain('Jane Doe');
        expect(parts.result.html).toContain('jane.doe@example.com');
        expect(parts.result.html).toContain('21 characters');
        expect(parts.result.html).not.toContain('correct horse battery');

        parts.page.destroy()
    });

    test('an unchecked terms box keeps the button disabled and is listed once engaged', async () => {
        const parts = await createPage();

        fillValidForm(parts);
        parts.terms.checked = false;
        await parts.page.updateValidationState();

        expect(parts.terms.error).toBe('Required');
        expect(parts.problems.html).toContain('Terms');
        expect(parts.button.disabled).toBe(true);

        parts.page.destroy()
    });

    test('with everything else filled, an untouched terms box is named as still to fill in', async () => {
        const parts = await createPage();

        fillValidForm(parts);
        parts.terms.checked = false;
        parts.page.engagedFields.delete('terms');
        await parts.page.updateValidationState();

        expect(parts.button.disabled).toBe(true);
        expect(parts.problems.html).toContain('<strong>Still to fill in:</strong> Terms');
        expect(parts.problems.html).not.toContain('Nothing wrong');

        parts.page.destroy()
    });
});
