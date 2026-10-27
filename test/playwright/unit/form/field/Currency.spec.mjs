import {setup} from '../../../setup.mjs';

const appName = 'FormFieldCurrencyTest';

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
import Currency       from '../../../../../src/form/field/Currency.mjs';

test.describe('Neo.form.field.Currency', () => {
    const createField = () => Neo.create(Currency, {appName});

    let addedDomEventsStub = false;

    // Number fields communicate with the main thread during initialization.
    // Install a temporary stub only when the real service is unavailable.
    test.beforeAll(() => {
        const main = Neo.ns('Neo.main', true);

        if (!main.DomEvents) {
            main.DomEvents = {
                registerDisabledInputChars() {},
                unregisterDisabledInputChars() {}
            };

            addedDomEventsStub = true;
        }
    });

    // Remove only the stub installed by this test suite.
    test.afterAll(() => {
        if (addedDomEventsStub) {
            delete Neo.ns('Neo.main', true).DomEvents;
        }
    });

    test('inputValueAdjustor returns null for an empty string', () => {
        const field = createField();

        expect(field.inputValueAdjustor('')).toBe(null);
    });

    test('inputValueAdjustor converts an integer string to a number', () => {
        const field = createField();

        expect(field.inputValueAdjustor('12')).toBe(12);
    });

    test('inputValueAdjustor rounds decimal strings to two places', () => {
        const field = createField();

        expect(field.inputValueAdjustor('12.345')).toBe(12.35);
    });

    test('inputValueAdjustor preserves negative values', () => {
        const field = createField();

        expect(field.inputValueAdjustor('-5.5')).toBe(-5.5);
    });

    test('inputValueAdjustor supports scientific notation', () => {
        const field = createField();

        expect(field.inputValueAdjustor('1e3')).toBe(1000);
    });

    test('inputValueAdjustor preserves an existing number', () => {
        const field = createField();

        expect(field.inputValueAdjustor(3.5)).toBe(3.5);
    });

    test('inputValueAdjustor preserves the current floating-point rounding behavior', () => {
        const field = createField();

        expect(field.inputValueAdjustor('1.005')).toBe(1);
    });

    test('inputValueAdjustor returns NaN for invalid text', () => {
        const field = createField();

        expect(field.inputValueAdjustor('abc')).toBeNaN();
    });

    test('inputValueRenderer returns null for a null value', () => {
        const field = createField();

        expect(field.inputValueRenderer(null)).toBe(null);
    });

    test('inputValueRenderer formats integers with two decimal places', () => {
        const field = createField();

        expect(field.inputValueRenderer(5)).toBe('5.00');
    });

    test('inputValueRenderer preserves two decimal places', () => {
        const field = createField();

        expect(field.inputValueRenderer(1.5)).toBe('1.50');
    });

    test('inputValueRenderer rounds values to two decimal places', () => {
        const field = createField();

        expect(field.inputValueRenderer(0.125)).toBe('0.13');
    });

    test('uses the default maximum value and step size', () => {
        const field = createField();

        expect(field.maxValue).toBe(1000000);
        expect(field.stepSize).toBe(0.01);
    });

});
