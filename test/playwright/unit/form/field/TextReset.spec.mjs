import {setup} from '../../../setup.mjs';

const appName = 'TextFieldResetTest';

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
import VDomUtil       from '../../../../../src/util/VDom.mjs';

function getErrorWrapper(field) {
    return VDomUtil.find(field.vdom, {cls: 'neo-textfield-error-wrapper'}).vdom;
}

test.describe('Neo.form.field.Text#reset & #updateError (#3335)', () => {
    test('updateError(value, false) triggers exactly one VDOM update and updateError(value, true) is completely silent', async () => {
        const field = Neo.create(TextField, {
            appName,
            value: 'initial'
        });

        await field.initVnode();
        field.mounted = true;

        let   activeUpdates  = 0;
        const originalUpdate = field.update.bind(field);

        field.update = function(...args) {
            if (!this.silentVdomUpdate) {
                activeUpdates++;
            }
            return originalUpdate(...args);
        };

        // Silent updateError must not trigger an active VDOM update via me.cls = cls
        field.updateError('Silent error', true);
        expect(activeUpdates).toBe(0);
        expect(field.cls).toContain('neo-invalid');
        expect(getErrorWrapper(field).removeDom).toBe(false);

        // Non-silent updateError must batch cls + errorWrapper into a single VDOM update
        field.updateError('Visible error', false);
        expect(activeUpdates).toBe(1);
        expect(getErrorWrapper(field).cn[0].text).toBe('Visible error');

        field.destroy();
    });

    test('reset() triggers only one VDOM update, clears error state before firing change, and fires change at the end', async () => {
        const events = [];

        const field = Neo.create(TextField, {
            appName,
            minLength: 3,
            required : true,
            value    : 'Hello World'
        });

        await field.initVnode();
        field.mounted = true;

        // Simulate user interaction producing an invalid state
        field.clean = false;
        field.value = 'ab';

        expect(field.cls).toContain('neo-invalid');
        expect(getErrorWrapper(field).removeDom).toBe(false);

        const originalUpdate = field.update.bind(field);

        field.update = function(...args) {
            if (!this.silentVdomUpdate) {
                events.push({
                    type            : 'update',
                    cls             : [...this.cls],
                    errorRemoveDom  : getErrorWrapper(this).removeDom,
                    silentVdomUpdate: this.silentVdomUpdate,
                    value           : this.value
                });
            }
            return originalUpdate(...args);
        };

        field.on('change', ({value, oldValue}) => {
            events.push({
                type            : 'change',
                cls             : [...field.cls],
                clean           : field.clean,
                errorRemoveDom  : getErrorWrapper(field).removeDom,
                oldValue,
                silentVdomUpdate: field.silentVdomUpdate,
                value
            });
        });

        field.reset();

        expect(events.map(e => e.type)).toEqual(['update', 'change']);

        // At the moment the single VDOM update and the trailing change event fire, error state is already cleared
        expect(events[0].cls).not.toContain('neo-invalid');
        expect(events[0].errorRemoveDom).toBe(true);
        expect(events[0].value).toBeNull();

        expect(events[1].value).toBeNull();
        expect(events[1].oldValue).toBe('ab');
        expect(events[1].clean).toBe(true);
        expect(events[1].cls).not.toContain('neo-invalid');
        expect(events[1].errorRemoveDom).toBe(true);
        expect(events[1].silentVdomUpdate).toBe(0);

        field.destroy();
    });

    test('reset() clears error in a single VDOM update even when value was already null', async () => {
        const field = Neo.create(TextField, {
            appName,
            required: true,
            value   : null
        });

        await field.initVnode();
        field.mounted = true;

        // Non-silent validation on an empty required field marks it unclean and displays the error
        expect(field.validate(false)).toBe(false);
        expect(field.clean).toBe(false);
        expect(field.cls).toContain('neo-invalid');
        expect(getErrorWrapper(field).removeDom).toBe(false);

        let   activeUpdates  = 0;
        const originalUpdate = field.update.bind(field);

        field.update = function(...args) {
            if (!this.silentVdomUpdate) {
                activeUpdates++;
            }
            return originalUpdate(...args);
        };

        field.reset();

        expect(activeUpdates).toBe(1);
        expect(field.clean).toBe(true);
        expect(field.cls).not.toContain('neo-invalid');
        expect(getErrorWrapper(field).removeDom).toBe(true);

        field.destroy();
    });
});
