import {setup} from '../../../setup.mjs';

const appName = 'InputValueSyncCoveredTest';

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
import Container      from '../../../../../src/container/Base.mjs';
import TextField      from '../../../../../src/form/field/Text.mjs';
import VdomHelper     from '../../../../../src/vdom/Helper.mjs';

/**
 * @summary A text field's input value, when the user types while a render of a parent that covers the field is in
 * the air.
 *
 * `InputValueSync.spec.mjs` holds the field's own render open. Here the render in the air is the container's, at
 * `updateDepth: -1`, as a `grid.Row` renders over its cell editor: it lands with the field's vnode inside its own, and
 * `syncVnodeTree()` hands that vnode to the field. The arms read the `value` deltas every render sends, because a
 * value delta is a write over whatever the user typed in the meantime.
 */
test.describe('Neo.form.field.Text input value sync across a covering render in the air', () => {
    let counter = 0,
        container, field;

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

    /**
     * Starts a render of the container that covers the field and holds it open once it collected its payload. A
     * collection resets `updateDepth` to the class default, so each covering render asks for the full depth again.
     * @param {Function} [whilePending] Runs while the container's update is pending, so a field update merges into it
     * @returns {Promise<{batches: Object[][], inFlight: Function[]}>}
     */
    async function holdCoveringRender(whilePending) {
        const held = recordRenders(true);

        container.setSilent({cls: [`covering-render-${counter}`], updateDepth: -1});
        whilePending?.();
        container.update();

        await expect.poll(() => held.inFlight.length, {message: 'the covering render collected its payload'}).toBe(1);

        return held
    }

    /**
     * Releases the render in the air and waits until every render queued behind it ran.
     * @param {{inFlight: Function[]}} held
     * @returns {Promise<Object[][]>} the deltas of the renders after it
     */
    async function release(held) {
        const settled = recordRenders(false);

        held.inFlight.shift()();

        await expect.poll(() => settled.batches.length, {message: 'the renders queued behind it ran'}).toBeGreaterThan(0);
        await container.promiseUpdate();
        await field.promiseUpdate();

        return settled.batches
    }

    test.beforeEach(async () => {
        const id = `input-sync-covered-${Date.now()}-${counter++}`;

        container = Neo.create(Container, {
            appName,
            id,
            items: [{module: TextField, id: `${id}-field`, value: 'a'}]
        });

        field = container.items[0];

        await container.initVnode(true);
        container.mounted = true;

        await container.promiseUpdate()
    });

    test.afterEach(() => {
        VdomHelper.updateBatch = originalUpdateBatch;

        container?.destroy();
        container = field = null
    });

    test('a covering render that lands after the user typed sends no value the DOM already holds', async () => {
        const held = await holdCoveringRender();

        // The user types while the container's render is in the air
        field.onInputValueChange({value: 'ab'});
        field.onInputValueChange({value: 'abc'});

        const after = await release(held);

        expect(valueWrites([...held.batches, ...after]), 'the DOM held every value before any render wrote it').toEqual([])
    });

    test('CONTROL: a value set in code while a covering render is in the air still reaches the DOM', async () => {
        const held = await holdCoveringRender();

        field.onInputValueChange({value: 'ab'});
        field.value = 'xyz';

        expect(valueWrites(await release(held)), 'the value set in code is written').toEqual(['xyz'])
    });

    test('CONTROL: when the covering render writes the value itself, the next render restores what the user typed', async () => {
        // The field's change merges into the container's render, which then writes `xyz`
        const held = await holdCoveringRender(() => {field.value = 'xyz'});

        // Typed before that render landed: its delta then replaces the typed value in the DOM
        field.onInputValueChange({value: 'ab'});

        const after = await release(held);

        expect(valueWrites(held.batches), 'the covering render wrote its value').toEqual(['xyz']);
        expect(valueWrites(after), 'the next render puts back what the user typed').toEqual(['ab'])
    })
});
