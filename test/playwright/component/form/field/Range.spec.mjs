import {test, expect} from '@playwright/test';

let componentId;

/**
 * @summary Creates a range field in the empty test viewport and waits for its stylesheet: until `Range.css` applies,
 * the browser's own slider fills the input, and every measurement would read that instead.
 * @param {Object} page
 * @param {Object} [config]
 * @returns {Promise<String>} the created component's id
 */
async function createRangeField(page, config = {}) {
    const result = await page.evaluate(config => Neo.worker.App.createNeoInstance({
        importPath: '../form/field/Range.mjs',
        ntype     : 'rangefield',
        parentId  : 'component-test-viewport',
        flex      : 'none', // the test viewport is a stretching column: keep the field's own one-row height, as in a form
        labelText : 'Volume',
        labelWidth: 100,
        maxValue  : 100,
        minValue  : 0,
        value     : 60,
        width     : 300,
        ...config
    }), config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`)
    }

    await expect.poll(() => page.locator(`#${result.id} .neo-rangefield-input`).evaluate(input => getComputedStyle(input).appearance)).toBe('none');

    return result.id
}

/**
 * @summary Reads the label's and the input's boxes in viewport pixels.
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Object>} `{input, label}`, each with `left`, `top`, `bottom`, `width`, `height` and `middle`
 */
function readBoxes(page, id) {
    return page.locator(`#${id}`).evaluate(field => {
        const box = element => {
            const {left, top, bottom, width, height} = element.getBoundingClientRect();
            return {left, top, bottom, width, height, middle: top + height / 2}
        };

        return {
            input: box(field.querySelector('.neo-rangefield-input')),
            label: box(field.querySelector('.neo-textfield-label'))
        }
    })
}

test.describe('Neo.form.field.Range', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            const destroyedId = componentId;

            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), destroyedId);
            await expect(page.locator(`#${destroyedId}`)).toHaveCount(0);
            componentId = null
        }
    });

    // The thumb is 15 px tall. With appearance none, the input took its height from the track's negative margin: 0 px
    test('a left label: the input box holds the thumb, centred on the label', async ({page}) => {
        componentId = await createRangeField(page);

        await expect(page.locator(`#${componentId} .neo-rangefield-input`)).toBeVisible();

        const {input, label} = await readBoxes(page, componentId);

        expect(input.height).toBeGreaterThanOrEqual(15);
        expect(Math.abs(input.middle - label.middle)).toBeLessThanOrEqual(1)
    });

    test('a top label: the input box holds the thumb, below the label', async ({page}) => {
        componentId = await createRangeField(page, {labelPosition: 'top'});

        await expect(page.locator(`#${componentId}`)).toHaveClass(/label-top/);

        const {input, label} = await readBoxes(page, componentId);

        expect(input.height).toBeGreaterThanOrEqual(15);
        expect(input.top).toBeGreaterThanOrEqual(label.bottom)
    });

    // Guard: pointer input worked before the fix too, so this passes on both sides of it
    test('a click on the track sets the value at that point', async ({page}) => {
        componentId = await createRangeField(page);

        const {input, label} = await readBoxes(page, componentId);

        // The thumb's centre travels between the input's edges, inset by half its width
        await page.mouse.click(input.left + 7.5 + .25 * (input.width - 15), label.middle);

        await expect.poll(() => page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'value'}), componentId)).toBe(25)
    });
});
