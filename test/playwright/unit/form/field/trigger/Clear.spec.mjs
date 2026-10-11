import {setup} from '../../../../setup.mjs';

const appName = 'FormFieldTriggerClearTest';

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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import NumberField     from '../../../../../../src/form/field/Number.mjs';
import TextField       from '../../../../../../src/form/field/Text.mjs';

test.describe('Neo.form.field.trigger.Clear', () => {
    const removeMainStubs = [];

    test.beforeAll(() => {
        const main = Neo.ns('Neo.main', true);

        // NumberField registers disabled input chars with the main thread
        if (!main.DomEvents) {
            main.DomEvents = {registerDisabledInputChars: () => {}, unregisterDisabledInputChars: () => {}};
            removeMainStubs.push(() => delete main.DomEvents)
        }
    });

    test.afterAll(() => {
        removeMainStubs.splice(0).forEach(remove => remove())
    });

    [
        {value: 5,    hidden: false},
        {value: 0,    hidden: false},
        {value: 7,    hidden: false},
        {value: null, hidden: true}
    ].forEach(({value, hidden}) => {
        test(`NumberField value ${value} => clear trigger hidden: ${hidden}`, () => {
            const field   = Neo.create(NumberField, {appName, clearable: true}),
                  trigger = field.getTrigger('clear');

            field.value = value;

            expect(trigger.getHiddenState()).toBe(hidden);
            expect(trigger.hidden).toBe(hidden);

            field.destroy()
        })
    });

    [
        {value: '',  hidden: true},
        {value: 'x', hidden: false}
    ].forEach(({value, hidden}) => {
        test(`TextField value '${value}' => clear trigger hidden: ${hidden}`, () => {
            const field   = Neo.create(TextField, {appName, clearable: true}),
                  trigger = field.getTrigger('clear');

            field.value = value;

            expect(trigger.getHiddenState()).toBe(hidden);
            expect(trigger.hidden).toBe(hidden);

            field.destroy()
        })
    })
});
