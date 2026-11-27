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
import ChipField     from '../../../../../src/form/field/Chip.mjs';
import Container     from '../../../../../src/container/Base.mjs';
import FormContainer from '../../../../../src/form/Container.mjs';
import StateProvider from '../../../../../src/state/Provider.mjs';
import TextArea      from '../../../../../src/form/field/TextArea.mjs';
import TextField     from '../../../../../src/form/field/Text.mjs';
import VNodeUtil     from '../../../../../src/util/VNode.mjs';

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

    test('projects disabled onto the native input, clears transient focus/hover in one VDOM update, and preserves programmatic APIs', async () => {
        const field = Neo.create(TextField, {
            appName,
            clearable           : true,
            clearToOriginalValue: true,
            disabled            : true,
            labelPosition       : 'inline',
            value               : 'Neo Workspace'
        });
        instances.push(field);

        await field.initVnode();
        // Keep pending inline-label measurements consistent with the seeded 84px cut-out.
        field.getDomRect = async () => ({width: 109});
        field.mounted = true;

        expect(field.cls).toContain('neo-disabled');
        expect(field.getInputEl().disabled).toBe(true);
        expect(VNodeUtil.find(field.vnode, field.getInputElId())?.vnode?.attributes?.disabled).toBe('true');

        // Programmatic field.value write while disabled updates both worker state and rendered VNode
        field.value = 'Programmatic audit';
        await field.promiseUpdate();
        expect(field.value).toBe('Programmatic audit');
        expect(field.getInputEl().value).toBe('Programmatic audit');
        expect(field.getInputEl().disabled).toBe(true);
        expect(VNodeUtil.find(field.vnode, field.getInputElId())?.vnode?.attributes?.value).toBe('Programmatic audit');

        // Callable application APIs (clear, reset) remain operational while disabled
        field.clear();
        await field.promiseUpdate();
        expect(field.value).toBe('Neo Workspace');

        field.value = 'Changed';
        await field.promiseUpdate();
        field.reset('Reset while disabled');
        await field.promiseUpdate();
        expect(field.value).toBe('Reset while disabled');

        let   activeUpdates = 0;
        const origUpdate    = field.update.bind(field);
        field.update = function(...args) {
            if (!this.silentVdomUpdate) {
                activeUpdates++
            }
            return origUpdate(...args)
        };

        // Re-enabling deletes the disabled key from VDOM/VNode in one update
        field.disabled = false;
        expect(activeUpdates).toBe(1);
        await field.promiseUpdate();
        expect(field.cls).not.toContain('neo-disabled');
        expect(field.getInputEl().disabled).toBeUndefined();
        expect(VNodeUtil.find(field.vnode, field.getInputElId())?.vnode?.attributes?.disabled).toBeUndefined();

        // Focused + hovered empty inline field clears focus/hover and inline cut-out width on runtime disable
        field.value               = null;
        field.centerBorderElWidth = 84;
        await field.promiseUpdate();
        field.onFocusEnter({path: []});
        field.onMouseEnter({});
        await field.promiseUpdate();
        expect(field.cls).toContain('neo-focus');
        expect(field.cls).toContain('neo-hovered');
        expect(field.getCenterBorderEl().width).toBe(84);

        activeUpdates  = 0;
        field.disabled = true;
        expect(activeUpdates).toBe(1);
        await field.promiseUpdate();
        expect(field.cls).toContain('neo-disabled');
        expect(field.cls).not.toContain('neo-focus');
        expect(field.cls).not.toContain('neo-hovered');
        expect(field.getCenterBorderEl().width).toBeUndefined();
        expect(field.getInputEl().disabled).toBe(true);
        expect(VNodeUtil.find(field.vnode, field.getInputElId())?.vnode?.attributes?.disabled).toBe('true')
    });

    test('updates disabled and value via StateProvider bindings and FormContainer#setValues while keeping readOnly separate', async () => {
        const form = Neo.create(FormContainer, {
            appName,
            stateProvider: {
                module: StateProvider,
                data  : {
                    connected  : false,
                    projectName: 'Primary window closed'
                }
            },
            items: [{
                module   : TextField,
                clearable: false,
                name     : 'projectName',
                reference: 'bound-field',
                bind     : {
                    disabled: data => data.connected === false,
                    value   : data => data.projectName
                }
            }, {
                module   : TextField,
                disabled : true,
                name     : 'notes',
                reference: 'form-disabled-field',
                value    : 'Initial note'
            }, {
                module   : TextField,
                readOnly : true,
                name     : 'lockedCopy',
                reference: 'readonly-field',
                value    : 'Locked copy'
            }]
        });
        instances.push(form);

        await form.initVnode();
        form.mounted = true;

        const boundField        = form.getReference('bound-field'),
              formDisabledField = form.getReference('form-disabled-field'),
              readOnlyField     = form.getReference('readonly-field');

        expect(boundField.disabled).toBe(true);
        expect(boundField.getInputEl().disabled).toBe(true);
        expect(boundField.value).toBe('Primary window closed');
        expect(readOnlyField.disabled).toBe(false);
        expect(readOnlyField.getInputEl().readonly).toBe(true);
        expect(readOnlyField.getInputEl().disabled).toBeUndefined();

        // StateProvider binding write while disabled updates both model/field value and VNode value
        form.getStateProvider().setData({projectName: 'Bound update while disabled'});
        await boundField.promiseUpdate();
        expect(boundField.disabled).toBe(true);
        expect(boundField.value).toBe('Bound update while disabled');
        expect(VNodeUtil.find(boundField.vnode, boundField.getInputElId())?.vnode?.attributes?.value).toBe('Bound update while disabled');

        // FormContainer#setValues updates a disabled field's value and rendered VNode
        await form.setValues({notes: 'Form setValues while disabled'});
        await formDisabledField.promiseUpdate();
        expect(formDisabledField.disabled).toBe(true);
        expect(formDisabledField.value).toBe('Form setValues while disabled');
        expect(VNodeUtil.find(formDisabledField.vnode, formDisabledField.getInputElId())?.vnode?.attributes?.value).toBe('Form setValues while disabled');

        form.getStateProvider().setData({connected: true});
        await boundField.promiseUpdate();
        expect(boundField.disabled).toBe(false);
        expect(boundField.getInputEl().disabled).toBeUndefined();

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

    test('projects disabled onto TextArea across inputTag transitions and Chip subclass chain', async () => {
        const area = Neo.create(TextArea, {
            appName,
            disabled: true,
            value   : 'Notes'
        });
        const chip = Neo.create(ChipField, {
            appName,
            disabled: true
        });
        instances.push(area, chip);

        await area.initVnode();
        area.mounted = true;

        expect(area.getInputEl().tag).toBe('textarea');
        expect(area.getInputEl().disabled).toBe(true);

        area.value = 'Programmatic textarea note';
        await area.promiseUpdate();
        expect(area.value).toBe('Programmatic textarea note');
        expect(area.getInputEl().text).toBe('Programmatic textarea note');
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
        expect(chip.getInputEl().disabled).toBeUndefined()
    });

    test('ignores stale inline centerBorderElWidth timers and getDomRect resolutions after width writes, disable, blur, or destroy', async () => {
        const flushAsync = async target => {
            for (let i = 0; i < 6; i++) {
                await Promise.resolve()
            }
            if (target?.isVdomUpdating) {
                await target.promiseUpdate()
            }
        };

        const origProtoTimeout      = TextField.prototype.timeout;
        let   releaseConstructTimer = null;

        TextField.prototype.timeout = function(delay) {
            if (delay === 20) {
                return new Promise(resolve => {
                    releaseConstructTimer = resolve
                })
            }
            return origProtoTimeout.call(this, delay)
        };

        let field;

        try {
            field = Neo.create(TextField, {
                appName,
                disabled     : true,
                labelPosition: 'inline',
                value        : 'Neo Workspace'
            });
            instances.push(field)
        } finally {
            TextField.prototype.timeout = origProtoTimeout
        }

        await field.initVnode();
        field.mounted = true;
        await flushAsync(field);

        field.disabled            = false;
        field.value               = null;
        field.centerBorderElWidth = 84;
        await flushAsync(field);
        field.onFocusEnter({path: []});
        await flushAsync(field);

        // Simulate the 20ms construct-time labelPosition timer landing mid-test in a loaded CI shard
        releaseConstructTimer?.();
        await flushAsync(field);

        expect(field.centerBorderElWidth).toBe(84);
        expect(field.getCenterBorderEl().width).toBe(84);

        // Runtime labelPosition -> 'inline' timer superseded by an explicit centerBorderElWidth write
        const origFieldTimeout    = field.timeout.bind(field);
        let   releaseRuntimeTimer = null;
        field.value             = 'Restored';
        field.labelPosition     = 'top';
        await flushAsync(field);

        field.timeout = delay => delay === 20
            ? new Promise(resolve => {releaseRuntimeTimer = resolve})
            : origFieldTimeout(delay);

        field.labelPosition = 'inline';
        field.timeout       = origFieldTimeout;

        field.centerBorderElWidth       = 92;
        field.getCenterBorderEl().width = 92;
        await flushAsync(field);

        releaseRuntimeTimer?.();
        await flushAsync(field);

        expect(field.centerBorderElWidth).toBe(92);
        expect(field.getCenterBorderEl().width).toBe(92);

        // Controlled in-flight getDomRect promises superseded by explicit write, disable, blur, and destroy
        const pendingRects = [];
        field.getDomRect   = () => new Promise(resolve => {
            pendingRects.push(resolve)
        });

        // 1. Explicit centerBorderElWidth write wins over an earlier in-flight getDomRect
        field.updateCenterBorderElWidth(false);
        expect(pendingRects).toHaveLength(1);
        field.centerBorderElWidth       = 84;
        field.getCenterBorderEl().width = 84;
        pendingRects.shift()({width: 1000});
        await flushAsync(field);
        expect(field.centerBorderElWidth).toBe(84);
        expect(field.getCenterBorderEl().width).toBe(84);

        // 2. Runtime disable on an empty inline field clears the cut-out and rejects an earlier in-flight getDomRect
        field.value = null;
        await flushAsync(field);
        field.onFocusEnter({path: []});
        await flushAsync(field);
        field.updateCenterBorderElWidth(false);
        expect(pendingRects).toHaveLength(1);
        field.disabled = true;
        await flushAsync(field);
        expect(field.getCenterBorderEl().width).toBeUndefined();
        pendingRects.shift()({width: 1000});
        await flushAsync(field);
        expect(field.getCenterBorderEl().width).toBeUndefined();

        // 3. Focus leave on an empty inline field clears the cut-out and rejects an earlier in-flight getDomRect
        field.disabled = false;
        await flushAsync(field);
        field.onFocusEnter({path: []});
        await flushAsync(field);
        field.updateCenterBorderElWidth(false);
        expect(pendingRects).toHaveLength(1);
        field.onFocusLeave({oldPath: []});
        await flushAsync(field);
        expect(field.getCenterBorderEl().width).toBeUndefined();
        pendingRects.shift()({width: 1000});
        await flushAsync(field);
        expect(field.getCenterBorderEl().width).toBeUndefined();

        // 4. Unmount + destroy while getDomRect is in flight neither mutates nor throws
        field.updateCenterBorderElWidth(false);
        expect(pendingRects).toHaveLength(1);
        field.mounted = false;
        field.destroy();
        pendingRects.shift()({width: 1000});
        await flushAsync(null)
    })
});
