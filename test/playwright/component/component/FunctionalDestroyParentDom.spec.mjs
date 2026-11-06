import {test, expect} from '@playwright/test';

const CONTAINER  = 'destroy-parent-dom-container',
      FUNCTIONAL = 'destroy-parent-dom-functional',
      CLASSIC    = 'destroy-parent-dom-classic';

/**
 * @summary Creates an instance in the App Worker under the given parent.
 * @param {Object} page
 * @param {Object} config
 * @returns {Promise<void>}
 */
async function create(page, config) {
    const result = await page.evaluate(async config => Neo.worker.App.createNeoInstance(config), config);

    if (!result.success) {
        throw new Error(`Instance creation failed: ${result.error.message}`)
    }
}

/**
 * @summary Runs a component's own `destroy(true)` inside the page's App Worker, the call a component makes to
 * leave its parent itself (an owner's `remove()` is a different path).
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<void>}
 */
async function destroyFromInside(page, id) {
    const worker = page.workers().find(candidate => candidate.url().includes('/worker/App.mjs'));

    await worker.evaluate(id => globalThis.Neo.getComponent(id).destroy(true), id)
}

/**
 * @summary Pins, in a real browser, that `destroy(true)` takes a functional component's node out of the page,
 * as it does a classic component's. The parent's own vdom update is what removes it.
 */
test.describe('destroy(true) takes a component out of the page, functional or classic', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        await create(page, {importPath: '../container/Base.mjs', ntype: 'container', id: CONTAINER, parentId: 'component-test-viewport'});
        await create(page, {importPath: '../functional/button/Base.mjs', ntype: 'functional-button', id: FUNCTIONAL, parentId: CONTAINER, text: 'functional'});
        await create(page, {importPath: '../button/Base.mjs', ntype: 'button', id: CLASSIC, parentId: CONTAINER, text: 'classic'});

        await expect(page.locator(`#${FUNCTIONAL}`)).toHaveCount(1);
        await expect(page.locator(`#${CLASSIC}`)).toHaveCount(1)
    });

    test.afterEach(async ({page}) => {
        await page.evaluate(async id => Neo.worker.App.destroyNeoInstance(id), CONTAINER)
    });

    test('a functional child that destroys itself with updateParentVdom leaves the DOM', async ({page}) => {
        await destroyFromInside(page, FUNCTIONAL);

        await expect(page.locator(`#${FUNCTIONAL}`)).toHaveCount(0);
        await expect(page.locator(`#${CLASSIC}`), 'its sibling stays').toHaveCount(1)
    });

    test('a classic child does the same (control)', async ({page}) => {
        await destroyFromInside(page, CLASSIC);

        await expect(page.locator(`#${CLASSIC}`)).toHaveCount(0);
        await expect(page.locator(`#${FUNCTIONAL}`), 'its sibling stays').toHaveCount(1)
    })
});
