import {setup} from '../../../setup.mjs';

const appName = 'TextFieldDisabledUnitTest';

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
import '../../../../../src/manager/Instance.mjs';
import Container              from '../../../../../src/container/Base.mjs';
import StateProvider          from '../../../../../src/state/Provider.mjs';
import ChipField              from '../../../../../src/form/field/Chip.mjs';
import CopyToClipboardTrigger from '../../../../../src/form/field/trigger/CopyToClipboard.mjs';
import DateField              from '../../../../../src/form/field/Date.mjs';
import TextArea               from '../../../../../src/form/field/TextArea.mjs';
import TextField              from '../../../../../src/form/field/Text.mjs';
import VNodeUtil              from '../../../../../src/util/VNode.mjs';

test.describe('Neo.form.field.Text#afterSetDisabled', () => {
    let instances;

    test.beforeEach(() => {
        instances = []
    });

    test.afterEach(() => {
        instances.forEach(instance => {
            if (instance && !instance.isDestroyed) {
                instance.destroy()
            }
        })
    });

    test('projects disabled onto the native input initially and toggles cleanly in a single VDOM update', async () => {
        const field = Neo.create(TextField, {
            appName,
            clearable: true,
            disabled : true,
            triggers : [CopyToClipboardTrigger],
            value    : 'Neo Workspace'
        });
        instances.push(field);

        await field.initVnode();
        field.mounted = true;

        expect(field.cls).toContain('neo-disabled');
        expect(field.getInputEl().disabled).toBe(true);
        expect(VNodeUtil.find(field.vnode, field.getInputElId())?.vnode?.attributes?.disabled).toBe('true');
        expect(field.getTrigger('clear')?.disabled).toBe(true);
        expect(field.getTrigger('copyToClipboard')?.disabled).toBe(true);

        let   activeUpdates = 0;
        const origUpdate    = field.update.bind(field);
        field.update = function(...args) {
            if (!this.silentVdomUpdate) {
                activeUpdates++
            }
            return origUpdate(...args)
        };

        // Re-enabling deletes the disabled key from VDOM/VNode and re-enables triggers in one update
        field.disabled = false;
        expect(activeUpdates).toBe(1);
        await field.promiseUpdate();
        expect(field.cls).not.toContain('neo-disabled');
        expect(field.getInputEl().disabled).toBeUndefined();
        expect(VNodeUtil.find(field.vnode, field.getInputElId())?.vnode?.attributes?.disabled).toBeUndefined();
        expect(field.getTrigger('clear')?.disabled).toBe(false);
        expect(field.getTrigger('copyToClipboard')?.disabled).toBe(false);

        // Simulate focused + hovered state with a hover-revealed trigger, then disable
        field.onFocusEnter({path: []});
        field.onMouseEnter({});
        const clearTrigger = field.getTrigger('clear'),
              copyTrigger  = field.getTrigger('copyToClipboard');
        copyTrigger.onMouseEnter();
        await field.promiseUpdate();
        expect(field.cls).toContain('neo-focus');
        expect(field.cls).toContain('neo-hovered');
        expect(copyTrigger.hidden).toBe(false);

        activeUpdates  = 0;
        field.disabled = true;
        expect(activeUpdates).toBe(1);
        await field.promiseUpdate();
        expect(field.cls).toContain('neo-disabled');
        expect(field.cls).not.toContain('neo-focus');
        expect(field.cls).not.toContain('neo-hovered');
        expect(field.getInputEl().disabled).toBe(true);
        expect(VNodeUtil.find(field.vnode, field.getInputElId())?.vnode?.attributes?.disabled).toBe('true');
        expect(clearTrigger.disabled).toBe(true);
        expect(copyTrigger.disabled).toBe(true);
        expect(copyTrigger.hidden).toBe(true);

        // Trigger clicks and hover entries are ignored while disabled
        copyTrigger.onMouseEnter();
        expect(copyTrigger.hidden).toBe(true);
        clearTrigger.onInternalClick({});
        clearTrigger.onTriggerClick({});
        expect(field.value).toBe('Neo Workspace');

        field.onFocusEnter({path: []});
        field.onMouseEnter({});
        expect(field.cls).not.toContain('neo-focus');
        expect(field.cls).not.toContain('neo-hovered')
    });

    test('updates native disabled via StateProvider bindings and preserves readOnly orthogonality', async () => {
        const host = Neo.create(Container, {
            appName,
            stateProvider: {
                module: StateProvider,
                data  : {connected: false}
            },
            items: [{
                module   : TextField,
                clearable: false,
                reference: 'bound-field',
                value    : 'Primary window closed',
                bind     : {
                    disabled: data => data.connected === false
                }
            }, {
                module   : TextField,
                readOnly : true,
                reference: 'readonly-field',
                value    : 'Locked copy'
            }]
        });
        instances.push(host);

        await host.initVnode();
        host.mounted = true;

        const boundField    = host.getReference('bound-field'),
              readOnlyField = host.getReference('readonly-field');

        expect(boundField.disabled).toBe(true);
        expect(boundField.getInputEl().disabled).toBe(true);
        expect(readOnlyField.disabled).toBe(false);
        expect(readOnlyField.getInputEl().readonly).toBe(true);
        expect(readOnlyField.getInputEl().disabled).toBeUndefined();

        host.getStateProvider().setData({connected: true});
        await boundField.promiseUpdate();
        expect(boundField.disabled).toBe(false);
        expect(boundField.getInputEl().disabled).toBeUndefined();

        host.getStateProvider().setData({connected: false});
        await boundField.promiseUpdate();
        expect(boundField.disabled).toBe(true);
        expect(boundField.getInputEl().disabled).toBe(true);

        // Disabling and re-enabling a readOnly field leaves readonly intact
        readOnlyField.disabled = true;
        await readOnlyField.promiseUpdate();
        expect(readOnlyField.getInputEl().disabled).toBe(true);
        expect(readOnlyField.getInputEl().readonly).toBe(true);
        readOnlyField.disabled = false;
        await readOnlyField.promiseUpdate();
        expect(readOnlyField.getInputEl().disabled).toBeUndefined();
        expect(readOnlyField.getInputEl().readonly).toBe(true)
    });

    test('projects disabled onto TextArea across inputTag transitions, Chip subclass chain, and DateTrigger tabIndex', async () => {
        const area = Neo.create(TextArea, {
            appName,
            disabled: true,
            value   : 'Notes'
        });
        const chip = Neo.create(ChipField, {
            appName,
            disabled: true
        });
        const date = Neo.create(DateField, {
            appName,
            disabled: true
        });
        instances.push(area, chip, date);

        await area.initVnode();
        area.mounted = true;

        expect(area.getInputEl().tag).toBe('textarea');
        expect(area.getInputEl().disabled).toBe(true);

        area.inputTag = 'input';
        await area.promiseUpdate();
        expect(area.getInputEl().tag).toBe('input');
        expect(area.getInputEl().disabled).toBe(true);

        area.disabled = false;
        await area.promiseUpdate();
        expect(area.getInputEl().disabled).toBeUndefined();

        expect(chip.getInputEl().disabled).toBe(true);
        chip.disabled = false;
        expect(chip.getInputEl().disabled).toBeUndefined();

        expect(date.getInputEl().disabled).toBe(true);
        expect(date.getTrigger('picker')?.vdom.tabIndex).toBe(-1);
        date.disabled = false;
        expect(date.getTrigger('picker')?.vdom.tabIndex).toBe(0)
    })
});
