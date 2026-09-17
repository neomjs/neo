import {test, expect} from '@playwright/test';

let componentId;

/**
 * @param {Object} page
 * @param {Object} config
 * @returns {Promise<String>} the created component's id
 */
async function createCheckBox(page, config) {
    const result = await page.evaluate(async config => Neo.worker.App.createNeoInstance({
        importPath: '../form/field/CheckBox.mjs',
        ntype     : 'checkboxfield',
        parentId  : 'component-test-viewport',
        labelText : 'My checkbox',
        labelWidth: 120,
        width     : 300,
        ...config
    }), config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`);
    }

    return result.id
}

/**
 * What a USER clicks. The native `<input>` is styled to 0x0 inside the field's `<label>`, so the
 * label is the real click target and the only one Playwright can reach.
 * @param {Object} page
 * @param {String} id
 * @returns {Object} the label locator
 */
function clickTarget(page, id) {
    return page.locator(`#${id} label`)
}

/**
 * The DOM `checked` PROPERTY. `checked` is a void attribute, so `Neo.main.DeltaUpdates` applies it
 * as `node.checked = value === 'true'` — a property write, which overrides user interaction. That is
 * why every assertion here reads the property rather than the attribute or the config.
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Boolean>}
 */
function domChecked(page, id) {
    return page.locator(`#${id} input`).evaluate(node => node.checked)
}

/**
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Boolean>}
 */
function configChecked(page, id) {
    return page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'checked'}), id)
}

/**
 * @summary A checkbox's checked state, in both directions and under a burst.
 *
 * The engine can write `checked` straight onto the DOM node as a property, so a render landing after
 * a click could in principle overrule the user. It does not, because `onInputValueChange()` assigns
 * `me.checked` from what the DOM reported: the vdom is already in agreement, and the next render
 * diffs a value against itself.
 *
 * What these arms do NOT guard, stated so nobody reads more into them: deleting the vnode-sync line
 * in `onInputValueChange()` leaves both of them green (measured). The vdom assignment on the line
 * below is what suppresses the delta, so the vnode write is not load-bearing for this path and no
 * arm here should pretend to hold it. What is guarded is the round trip in both directions, which
 * had no coverage at all — and the burst arm holds the parity a property write would break.
 */
test.describe('Neo.form.field.CheckBox', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
            componentId = null
        }
    });

    test('a click reaches the config, and a config change reaches the DOM property', async ({page}) => {
        componentId = await createCheckBox(page, {checked: false});

        expect(await domChecked(page, componentId),    'starts unchecked in the DOM').toBe(false);
        expect(await configChecked(page, componentId), 'and in its config').toBe(false);

        await clickTarget(page, componentId).click();

        await expect.poll(() => configChecked(page, componentId), {message: 'the click reached the App Worker'}).toBe(true);
        expect(await domChecked(page, componentId), 'and the DOM holds what the user did').toBe(true);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, checked: false}), componentId);

        await expect.poll(() => domChecked(page, componentId), {message: 'and a config change reaches the DOM property'}).toBe(false)
    });

    test('a burst of clicks leaves the DOM on the user\'s last state, with the config agreeing', async ({page}) => {
        componentId = await createCheckBox(page, {checked: false});

        const label = clickTarget(page, componentId);

        // Every click after the first lands while the previous render is still in the air. A render
        // that wrote its own `checked` on landing would win over the user — it is a property write —
        // and the document would come to rest on the wrong parity.
        for (let i = 0; i < 5; i++) {
            await label.click({delay: 0})
        }

        await expect.poll(() => domChecked(page, componentId), {message: 'five clicks from unchecked end checked'}).toBe(true);
        await expect.poll(() => configChecked(page, componentId), {message: 'and the config agrees with the document'}).toBe(true);

        for (let i = 0; i < 3; i++) {
            await label.click({delay: 0})
        }

        await expect.poll(() => domChecked(page, componentId), {message: 'three more, an odd count, end unchecked'}).toBe(false);
        await expect.poll(() => configChecked(page, componentId), {message: 'config still agreeing'}).toBe(false)
    })
});
