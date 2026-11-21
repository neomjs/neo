import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoPluginPrefixFieldUnitTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import MainPrefix     from '../../../../src/main/addon/PrefixField.mjs';
import TextField      from '../../../../src/form/field/Text.mjs';
import PrefixField    from '../../../../src/plugin/PrefixField.mjs';
import '../../../../src/manager/Instance.mjs';

/**
 * @summary Pins `Neo.plugin.PrefixField` RegExp flag preservation, programmatic `TextField#value` formatting,
 * and idempotent `Neo.main.addon.PrefixField` registration across owner mounts, config updates, and destroy.
 */
function createMaskedField(pluginConfig = {}, fieldConfig = {}) {
    return Neo.create(TextField, {
        appName : 'NeoPluginPrefixFieldUnitTest',
        windowId: 1,
        plugins : [{
            module : PrefixField,
            pattern: 'dd/mm/yyyy hh:mm',
            slots  : 'dmyh',
            ...pluginConfig
        }],
        ...fieldConfig
    })
}

test.describe('Neo.plugin.PrefixField (unit)', () => {
    let originalGetAddon;

    test.beforeEach(() => {
        originalGetAddon = Neo.currentWorker.getAddon
    });

    test.afterEach(() => {
        Neo.currentWorker.getAddon = originalGetAddon
    });

    test('shared-fixture parity: App-Worker plugin clean() and Main-Thread addon clean() agree across RegExp flags and masks', () => {
        const addon = Neo.create(MainPrefix);

        const fixtures = [
            {
                accept  : '[0-9A-Fa-f]',
                pattern : 'XX:XX:XX:XX:XX:XX',
                slots   : 'X',
                input   : '001A2B3C4D5E',
                expected: '00:1A:2B:3C:4D:5E'
            },
            {
                accept  : '[0-9A-Fa-f]',
                pattern : 'XX:XX:XX:XX:XX:XX',
                slots   : 'X',
                input   : '001a2b3c4d5e',
                expected: '00:1a:2b:3c:4d:5e'
            },
            {
                accept  : '[0-9A-Fa-f]',
                pattern : 'XX:XX:XX:XX:XX:XX',
                slots   : 'X',
                input   : 'GHIJKLMNOPQRSTUVWXYZghijklmnopqrstuvwxyz',
                expected: 'XX:XX:XX:XX:XX:XX'
            },
            {
                accept  : /[0-9a-f]/i,
                pattern : 'XX:XX:XX:XX:XX:XX',
                slots   : 'X',
                input   : '001a2B3c4D5e',
                expected: '00:1a:2B:3c:4D:5e'
            },
            {
                accept  : /[0-9a-f]/i,
                pattern : 'XX:XX:XX:XX:XX:XX',
                slots   : 'X',
                input   : 'GGZZ12',
                expected: '12:XX:XX:XX:XX:XX'
            },
            {
                accept  : null,
                pattern : '+1 (___) ___-____',
                slots   : '_',
                input   : 'abc5551234567xyz',
                expected: '+1 (555) 123-4567'
            },
            {
                accept  : '[A-Za-z0-9_]',
                pattern : '__-__-__-____',
                slots   : '_',
                input   : 'NEO14RC12026',
                expected: 'NE-O1-4R-C120'
            }
        ];

        for (const {accept, expected, input, pattern, slots} of fixtures) {
            const field   = createMaskedField({accept, pattern, slots}),
                  plugin  = field.getPlugin('prefixfield'),
                  payload = plugin.getAddonPayload(),
                  state   = {};

            addon.recalcState(state, payload);

            const workerOut = plugin.clean(input).join(''),
                  mainOut   = addon.clean(state, input).join('');

            expect(workerOut).toBe(expected);
            expect(mainOut).toBe(workerOut);

            field.destroy()
        }

        addon.destroy()
    });

    test('programmatic TextField value mutations format cleanly in Node without DOM round-trips', () => {
        const field = createMaskedField();

        field.value = '201120260930';
        expect(field.value).toBe('20/11/2026 09:30');

        field.value = '';
        expect(field.value).toBeNull();

        field.destroy()
    });

    test('registers Main addon on mount/remount, forwards config updates via setConfigs, and unregisters on destroy', async () => {
        const calls = [];

        Neo.currentWorker.getAddon = async (name, windowId) => {
            calls.push({op: 'getAddon', name, windowId});
            return {
                register  : payload => calls.push({op: 'register', ...payload}),
                setConfigs: payload => calls.push({op: 'setConfigs', ...payload}),
                unregister: payload => calls.push({op: 'unregister', ...payload})
            }
        };

        const field  = createMaskedField({accept: /[0-9a-f]/i, pattern: 'XX:XX', slots: 'X'}),
              plugin = field.getPlugin('prefixfield'),
              elId   = field.getInputElId();

        expect(calls.filter(c => c.op === 'register')).toHaveLength(0);

        field.mounted = true;
        await Promise.resolve();

        expect(calls).toContainEqual({
            op          : 'register',
            id          : elId,
            acceptSource: '[0-9a-f]',
            acceptFlags : 'i',
            pattern     : 'XX:XX',
            slots       : 'X',
            windowId    : 1
        });

        plugin.pattern = 'XX-XX';
        await Promise.resolve();

        expect(calls).toContainEqual({
            op          : 'setConfigs',
            id          : elId,
            acceptSource: '[0-9a-f]',
            acceptFlags : 'i',
            pattern     : 'XX-XX',
            slots       : 'X',
            windowId    : 1
        });

        field.mounted = false;
        field.mounted = true;
        await Promise.resolve();

        expect(calls.filter(c => c.op === 'register')).toHaveLength(2);

        field.destroy();
        await Promise.resolve();

        expect(calls).toContainEqual({op: 'unregister', id: elId, windowId: 1})
    });

    test('cross-window transfer unregisters InputMask from the old windowId and registers on the new windowId', async () => {
        const calls = [];

        Neo.currentWorker.getAddon = async (name, windowId) => {
            calls.push({op: 'getAddon', name, windowId});
            return {
                register  : payload => calls.push({op: 'register', ...payload}),
                setConfigs: payload => calls.push({op: 'setConfigs', ...payload}),
                unregister: payload => calls.push({op: 'unregister', ...payload})
            }
        };

        const field  = createMaskedField({accept: /[0-9a-f]/i, pattern: 'XX:XX', slots: 'X'}),
              plugin = field.getPlugin('prefixfield'),
              elId   = field.getInputElId();

        field.mounted = true;
        await Promise.resolve();

        calls.length   = 0;
        field.windowId = 2;
        await Promise.resolve();
        await Promise.resolve();

        expect(plugin.windowId).toBe(2);
        expect(calls).toContainEqual({op: 'unregister', id: elId, windowId: 1});
        expect(calls).toContainEqual({
            op          : 'register',
            id          : elId,
            acceptSource: '[0-9a-f]',
            acceptFlags : 'i',
            pattern     : 'XX:XX',
            slots       : 'X',
            windowId    : 2
        });

        calls.length = 0;
        field.destroy();
        await Promise.resolve();

        expect(calls).toContainEqual({op: 'unregister', id: elId, windowId: 2})
    })
});
