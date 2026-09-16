import {setup} from '../../../setup.mjs';

const appName = 'InputValueSyncTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false, // Required: Neo.vdom.Helper runs locally, so flights can be held open
        logVdomUpdateCollisions: false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import TextField      from '../../../../../src/form/field/Text.mjs';
import VdomHelper     from '../../../../../src/vdom/Helper.mjs';

/**
 * @summary A text field's input value, when the user types while one of its renders is in the air.
 *
 * `onInputValueChange()` writes what the DOM reports into the input's vnode, so the next diff has no value to send:
 * the DOM already holds it. A render collected before that report lands afterwards and brings the vnode it was
 * diffed against. The arms hold a render open between two reports and read the `value` deltas every render sends,
 * because a value delta is a write over whatever the user typed in the meantime.
 */
test.describe('Neo.form.field.Text input value sync across a render in the air', () => {
    let counter = 0,
        field;

    const originalUpdateBatch = VdomHelper.updateBatch;

    /**
     * Records the deltas of every render, holding each one open until its release is called when `hold` is true.
     * @param {Boolean} hold
     * @returns {{batches: Object[][], inFlight: Function[]}}
     */
    function recordRenders(hold) {
        const batches  = [],
              inFlight = [];

        VdomHelper.updateBatch = (...args) => {
            const result = originalUpdateBatch.apply(VdomHelper, args);

            batches.push(result.deltas);

            return hold ? new Promise(resolve => inFlight.push(() => resolve(result))) : result
        };

        return {batches, inFlight}
    }

    /**
     * @param {Object[][]} batches
     * @returns {String[]} every value a render wrote into the field's input, in render order
     */
    function valueWrites(batches) {
        const inputId = field.getInputElId();

        return batches.flat().filter(delta => delta.id === inputId && Object.hasOwn(delta.attributes || {}, 'value'))
            .map(delta => delta.attributes.value)
    }

    test.beforeEach(async () => {
        field = Neo.create(TextField, {appName, id: `input-sync-field-${Date.now()}-${counter++}`, value: 'a'});

        await field.initVnode(true);
        field.mounted = true;

        await field.promiseUpdate()
    });

    test.afterEach(() => {
        VdomHelper.updateBatch = originalUpdateBatch;

        field?.destroy();
        field = null
    });

    test('a render that lands after the user typed again sends no value the DOM already holds', async () => {
        const held = recordRenders(true);

        field.onInputValueChange({value: 'ab'});

        await expect.poll(() => held.inFlight.length, {message: 'the render for "ab" collected its payload'}).toBe(1);

        // The user types again while that render is in the air
        field.onInputValueChange({value: 'abc'});

        const settled = recordRenders(false);

        held.inFlight.shift()();

        await expect.poll(() => settled.batches.length, {message: 'the follow-up render ran'}).toBeGreaterThan(0);
        await field.promiseUpdate();

        expect(valueWrites([...held.batches, ...settled.batches]), 'the DOM held every value before any render wrote it').toEqual([])
    });

    test('CONTROL: a value set in code while a render is in the air still reaches the DOM', async () => {
        const held = recordRenders(true);

        field.onInputValueChange({value: 'ab'});

        await expect.poll(() => held.inFlight.length).toBe(1);

        field.value = 'xyz';

        const settled = recordRenders(false);

        held.inFlight.shift()();

        await expect.poll(() => settled.batches.length).toBeGreaterThan(0);
        await field.promiseUpdate();

        expect(valueWrites(settled.batches), 'the value set in code is written').toEqual(['xyz'])
    });

    test('CONTROL: when the render in the air writes the value itself, the next render restores what the user typed', async () => {
        const held = recordRenders(true);

        field.value = 'xyz';

        await expect.poll(() => held.inFlight.length, {message: 'the render writing "xyz" collected its payload'}).toBe(1);

        // Typed before that render landed: its delta then replaces the typed value in the DOM
        field.onInputValueChange({value: 'ab'});

        const settled = recordRenders(false);

        held.inFlight.shift()();

        await expect.poll(() => settled.batches.length).toBeGreaterThan(0);
        await field.promiseUpdate();

        expect(valueWrites(held.batches), 'the render in the air wrote its value').toEqual(['xyz']);
        expect(valueWrites(settled.batches), 'so the DOM shows "xyz", and the next render writes the typed value back').toEqual(['ab'])
    })
});
