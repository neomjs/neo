import {test, expect} from '@playwright/test';

/**
 * @summary A component rooted at `document.body` holds one mount flight at a time, and lands on the latest `hidden`.
 *
 * Showing a body-rooted component starts `initVnode(true)`, a vdom round trip. `hidden` can change again before
 * it lands: a combo's typeahead opens and re-filters its picker within a few milliseconds. A second show must
 * not start a second flight, which would insert a second node with the same id, and a hide must not be lost
 * to a `removeNode` sent before the node exists.
 *
 * The three `setConfigs` calls are fired without awaiting, so all of them reach the App Worker while the first
 * flight is in the air.
 */

/**
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Number>} How many nodes carry the id
 */
const countNodes = (page, id) => page.evaluate(id => document.querySelectorAll(`[id="${id}"]`).length, id);

/**
 * @param {Object} page
 * @returns {Promise<String>} The id of a container mounted at `document.body`, then hidden
 */
const mountThenHide = async page => {
    const {id} = await page.evaluate(() => Neo.worker.App.createNeoInstance({
        importPath: '../container/Base.mjs',
        ntype     : 'container',
        height    : 50,
        width     : 50
    }));

    await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    await page.evaluate(id => Neo.worker.App.setConfigs({id, hidden: true}), id);
    await expect(page.locator(`[id="${id}"]`)).toHaveCount(0);

    return id
};

test.describe('Neo.component.Base: one mount flight for a body-rooted component', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test('shown, hidden and shown inside one flight, it renders one node', async ({page}) => {
        const id = await mountThenHide(page);

        await page.evaluate(id => Promise.all([
            Neo.worker.App.setConfigs({id, hidden: false}),
            Neo.worker.App.setConfigs({id, hidden: true}),
            Neo.worker.App.setConfigs({id, hidden: false})
        ]), id);

        await expect(page.locator(`[id="${id}"]`), 'the flight lands the shown component').toHaveCount(1);
        await page.waitForTimeout(300);
        expect(await countNodes(page, id), 'no second flight inserts a second node').toBe(1)
    });

    test('shown and hidden inside one flight, it renders no node once the flight lands', async ({page}) => {
        const id = await mountThenHide(page);

        await page.evaluate(id => Promise.all([
            Neo.worker.App.setConfigs({id, hidden: false}),
            Neo.worker.App.setConfigs({id, hidden: true})
        ]), id);

        await expect.poll(() => countNodes(page, id), {message: 'the landed flight honours the later hide', timeout: 3000}).toBe(0);
        await page.waitForTimeout(300);
        expect(await countNodes(page, id), 'the hidden component stays out of the document').toBe(0)
    });

    test('control: the same steps awaited one by one keep one node', async ({page}) => {
        const id = await mountThenHide(page);

        for (const hidden of [false, true, false]) {
            await page.evaluate(({id, hidden}) => Neo.worker.App.setConfigs({id, hidden}), {id, hidden});
            await expect(page.locator(`[id="${id}"]`)).toHaveCount(hidden ? 0 : 1)
        }

        await page.waitForTimeout(300);
        expect(await countNodes(page, id)).toBe(1)
    })
});
