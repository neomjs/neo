import {test, expect} from '@playwright/test';

let createdIds = [];

/**
 * @param {Object} page
 * @param {Object} config
 * @returns {Promise<String>} the created component's id
 */
async function createRadio(page, config) {
    const result = await page.evaluate(async config => Neo.worker.App.createNeoInstance({
        importPath: '../form/field/Radio.mjs',
        ntype     : 'radiofield',
        parentId  : 'component-test-viewport',
        labelWidth: 120,
        width     : 300,
        ...config
    }), config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`);
    }

    createdIds.push(result.id);

    return result.id
}

/**
 * What a USER clicks. The native `<input>` is styled to 0x0 inside the field's `<label>`, so the
 * label is the real click target and the only one Playwright can reach — clicking the input
 * directly fails on visibility.
 * @param {Object} page
 * @param {String} id
 * @returns {Object} the label locator
 */
function clickTarget(page, id) {
    return page.locator(`#${id} label`)
}

/**
 * The DOM `checked` PROPERTY — what `DeltaUpdates` writes for a void attribute, and what a user sees.
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Boolean>}
 */
function domChecked(page, id) {
    return page.locator(`#${id} input`).evaluate(node => node.checked)
}

/**
 * The component's `checked` config, in the App Worker.
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Boolean>}
 */
function configChecked(page, id) {
    return page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'checked'}), id)
}

/**
 * @summary Radio group exclusivity, split by who actually enforces which half.
 *
 * The browser enforces the DOM half on its own: same-name radios in one document are mutually
 * exclusive on a click AND on a `checked` property assignment, so a DOM-only arm passes with
 * `Radio#uncheckGroupItems()` deleted. What that method owns exclusively is the OTHER half — the
 * losing radio's `checked` CONFIG. Measured with the method disabled: the sibling's DOM reads
 * `false` while its config still reads `true`, a divergence nothing else repairs and nothing else
 * catches. The arms therefore assert both surfaces, and say which one is the discriminating read.
 */
test.describe('Neo.form.field.Radio — group exclusivity', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        for (const id of createdIds) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), id)
        }

        createdIds = []
    });

    test('clicking one radio leaves its same-name sibling unchecked in the DOM and in its config', async ({page}) => {
        const first  = await createRadio(page, {checked: true, labelText: 'group', name: 'colour', valueLabel: 'red',  value: 'red'}),
              second = await createRadio(page, {labelText: '', name: 'colour', valueLabel: 'blue', value: 'blue'});

        expect(await domChecked(page, first),  'the initially checked radio starts checked').toBe(true);
        expect(await domChecked(page, second), 'and its sibling starts unchecked').toBe(false);

        await clickTarget(page, second).click();

        await expect.poll(() => domChecked(page, first), {message: 'the previous selection is unchecked in the DOM'}).toBe(false);
        expect(await domChecked(page, second), 'and the clicked radio is checked').toBe(true);

        // The discriminating read: the DOM half above is the browser's, and holds without the engine
        await expect.poll(() => configChecked(page, first), {message: 'and its config agrees with the DOM'}).toBe(false);
        expect(await configChecked(page, second), 'as does the newly selected radio').toBe(true)
    });

    test('a config change with no click keeps the sibling config in step with the DOM', async ({page}) => {
        const first  = await createRadio(page, {labelText: 'group', name: 'colour', valueLabel: 'red', value: 'red'}),
              second = await createRadio(page, {checked: true, labelText: '', name: 'colour', valueLabel: 'blue', value: 'blue'});

        expect(await domChecked(page, second),    'the second radio starts checked in the DOM').toBe(true);
        expect(await configChecked(page, second), 'and in its config').toBe(true);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, checked: true}), first);

        // The browser grouping reaches this path too — a `checked` property write on one radio
        // unsets its same-name siblings, click or no click — so the DOM read below is NOT what
        // guards the engine. Measured with `uncheckGroupItems()` disabled: dom false, config TRUE.
        await expect.poll(() => domChecked(page, second), {message: 'the sibling is unchecked in the DOM'}).toBe(false);

        await expect.poll(() => configChecked(page, second), {message: 'and its config followed, rather than diverging silently'}).toBe(false);
        expect(await configChecked(page, first), 'while the newly selected radio is checked').toBe(true)
    });

    test('a radio in a different group is untouched on both surfaces', async ({page}) => {
        const colour = await createRadio(page, {checked: true, labelText: 'colour', name: 'colour', valueLabel: 'red', value: 'red'}),
              size   = await createRadio(page, {checked: true, labelText: 'size',   name: 'size',   valueLabel: 'big', value: 'big'}),
              blue   = await createRadio(page, {labelText: '', name: 'colour', valueLabel: 'blue', value: 'blue'});

        await clickTarget(page, blue).click();

        await expect.poll(() => configChecked(page, colour), {message: 'the same-name radio loses its config'}).toBe(false);
        expect(await domChecked(page, size),    'the other group keeps its DOM state').toBe(true);
        expect(await configChecked(page, size), 'and its config').toBe(true);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, checked: true}), colour);

        await expect.poll(() => configChecked(page, blue), {message: 'and the config path scopes to the group too'}).toBe(false);
        expect(await domChecked(page, size),    'the other group is still untouched in the DOM').toBe(true);
        expect(await configChecked(page, size), 'and in its config').toBe(true)
    })
});
