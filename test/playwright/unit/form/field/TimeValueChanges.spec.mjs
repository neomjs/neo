/**
 * @file test/playwright/unit/form/field/TimeValueChanges.spec.mjs
 * @summary Pins that `form.field.Time` routes a list selection through the reactive `value` config
 * like any other change, and that an empty or unparseable value is a state the field holds rather
 * than one it throws on.
 */

import {setup} from '../../../setup.mjs';

const appName = 'TimeValueChangesTest';

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
import TimeField      from '../../../../../src/form/field/Time.mjs';

// Imported for their side effects, and they are what makes this file runnable on its own:
// `initVnode()` needs `Neo.vdom.Helper` and the DOM-API vnode creator registered, `Neo.get` needs
// the instance manager, and a `stateProvider` config needs `Neo.state.Provider`. Without them the
// file passes only when a sibling spec in the same worker happened to load them first.
import '../../../../../src/manager/Instance.mjs';
import '../../../../../src/state/Provider.mjs';
import '../../../../../src/vdom/Helper.mjs';
import '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';

test.describe('Neo.form.field.Time value changes', () => {
    let fields = [];

    /**
     * @param {Object} config
     * @returns {Promise<Neo.form.field.Time>}
     */
    const create = async config => {
        const field = Neo.create(TimeField, {appName, labelPosition: 'top', ...config});

        fields.push(field);

        await field.initVnode();
        field.mounted = true;
        field.getPicker();

        return field
    };

    test.afterEach(() => {
        fields.forEach(field => !field.isDestroyed && field.destroy());
        fields = []
    });

    test('a list selection reaches a value subscriber, as a programmatic set does', async () => {
        const field  = await create({value: '10:00'}),
              record = field.collection.items[3],
              picked = field.formatTime(record.value),
              seen   = [];

        field.getConfig('value').subscribe({id: 'time-value-changes', fn: (value, oldValue) => seen.push({value, oldValue})});

        field.onListItemClick({record});

        expect(seen, 'the list selection notified the subscriber').toEqual([{value: picked, oldValue: '10:00'}]);

        field.value = '09:00';

        expect(seen.at(-1), 'control: a programmatic set notifies it too').toEqual({value: '09:00', oldValue: picked})
    });

    test('a list selection reaches a two-way bound provider', async () => {
        const field    = await create({stateProvider: {data: {time: '10:00'}}, bind: {value: {key: 'time', twoWay: true}}}),
              provider = field.getStateProvider(),
              record   = field.collection.items[3];

        field.onListItemClick({record});

        expect(provider.getData('time'), 'the provider holds what the user picked').toBe(field.formatTime(record.value));

        field.value = '09:00';

        expect(provider.getData('time'), 'control: a programmatic set reaches it too').toBe('09:00')
    });

    test('re-selecting the current time changes nothing and fires no change', async () => {
        const field   = await create({value: '10:00'}),
              record  = field.collection.items[3],
              changes = [];

        field.on('change', ({value, oldValue}) => changes.push({value, oldValue}));

        field.onListItemClick({record});
        field.onListItemClick({record});
        field.onListItemClick({record});

        expect(changes, 'one real change, then nothing').toEqual([{value: field.formatTime(record.value), oldValue: '10:00'}])
    });

    test('a list selection does not re-select the item it came from', async () => {
        // The reason the original click path bypassed the setter: `afterSetValue` re-selects the
        // current list item while the picker is open, which would scroll and focus the very item the
        // user just clicked. The spy replaces the method before the picker opens, so the unit tier's
        // missing `DomAccess.align` never enters the arm.
        const field = await create({value: '10:00'}),
              calls = [];

        field.selectCurrentListItem = (...args) => calls.push(args);
        field.pickerIsMounted       = true;

        const opened = calls.length;

        field.onListItemClick({record: field.collection.items[3]});

        expect(opened, 'opening the picker selects the current item, as it always has').toBe(1);
        expect(calls.length, 'the click does not select it again').toBe(opened)
    });

    test('opening the picker on an empty field does not throw', async () => {
        // `Picker#onPickerHiddenChange` answers a shown picker with exactly this assignment. Driving
        // the trigger instead reaches the same line, but also runs the floating picker's `alignTo`,
        // whose `DomAccess.align` the unit tier does not have — an unrelated rejection that would
        // escape the arm and abort the file.
        const field = await create({value: null});

        expect(() => { field.pickerIsMounted = true }, 'opening the picker on an empty field').not.toThrow();
        expect(field.value).toBeNull()
    });

    test('an unparseable value is an empty value, not an exception', async () => {
        const field = await create({value: '10:00'});

        expect(() => { field.value = 'not a time' }, 'through value').not.toThrow();
        expect(field.value).toBeNull();

        field.value = '10:00';

        expect(() => { field.inputValue = 'not a time' }, 'through inputValue').not.toThrow();
        expect(field.value).toBeNull()
    })
})
