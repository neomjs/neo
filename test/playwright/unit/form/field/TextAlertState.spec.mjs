import {setup} from '../../../setup.mjs';

const appName = 'TextFieldAlertStateTest';

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
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import TextField      from '../../../../../src/form/field/Text.mjs';
import VdomHelper     from '../../../../../src/vdom/Helper.mjs';

/**
 * @summary A required field in the alert state (`useAlertState`) is marked `neo-empty-required` exactly while its
 * value is empty.
 *
 * A paste or an autofill reaches the field as one input event. The class has to describe the value that event wrote,
 * not the value before it: while it stays on a filled field, an invalid entry shows its error in the alert color.
 */
test.describe('Neo.form.field.Text alert state follows the value (#21565)', () => {
    let field;

    test.beforeEach(async () => {
        field = Neo.create(TextField, {
            appName,
            labelText    : 'Work email',
            required     : true,
            useAlertState: true
        });

        await field.initVnode();
        field.mounted = true
    });

    test.afterEach(() => {
        field.destroy()
    });

    test('an empty required field starts in the alert state', () => {
        expect(field.cls).toContain('neo-empty-required')
    });

    test('one input event that fills the field leaves the alert state', () => {
        field.onInputValueChange({value: 'jane.doe@'}); // a paste: one event, the whole text

        expect(field.value).toBe('jane.doe@');
        expect(field.cls).toContain('neo-has-content');
        expect(field.cls).not.toContain('neo-empty-required')
    });

    test('one input event that clears the field returns to the alert state', () => {
        field.onInputValueChange({value: 'jane.doe@example.com'});
        field.onInputValueChange({value: ''});

        expect(field.value).toBeNull();
        expect(field.cls).toContain('neo-empty-required')
    });

    test('a value set by code leaves and re-enters the alert state', () => {
        field.value = 'jane.doe@example.com';
        expect(field.cls).not.toContain('neo-empty-required');

        field.value = null;
        expect(field.cls).toContain('neo-empty-required')
    });
});
