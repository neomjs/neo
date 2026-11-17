import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The app's shared tooltip reaches targets outside its main view: a button in a dialog under
 * `document.body` shows the same tooltip a viewport button shows, whether or not the dialog has the viewport as its
 * `parentComponent`, and after the dialog hides, shows again, or is destroyed and opened anew. The real App Worker,
 * DOM and `Neo.manager.DomEvent` run here: the event path and the mouseenter check are observed, not modeled.
 */
const TOOLTIP  = '.neo-tooltip',
      VIEWPORT = '#tooltip-floating-root-viewport-target';

let driverCount = 0;

/**
 * Runs one `driver.mjs` action inside the App Worker; the counter makes every call a new module URL.
 * @param {import('@playwright/test').Page} page
 * @param {String} action
 * @param {Boolean} owned True for the dialog whose parentComponent is the viewport
 * @returns {Promise<void>}
 */
async function drive(page, action, owned) {
    const {success} = await page.evaluate(path => Neo.worker.App.loadModule({path}),
        `../../test/playwright/component/apps/tooltip-floating-root/driver.mjs?action=${action}&owner=${owned ? 1 : 0}&n=${++driverCount}`);

    expect(success, `the ${action} action reached the App Worker`).toBe(true)
}

/**
 * Hovers a target from outside it, then expects the one shared tooltip to show a text
 * @param {import('@playwright/test').Page} page
 * @param {String} selector
 * @param {String} text
 */
async function expectTooltip(page, selector, text) {
    await page.mouse.move(0, 0);
    await expect(page.locator(TOOLTIP), 'the tooltip of the previous hover is gone').toHaveCount(0);

    await page.locator(selector).hover();

    await expect(page.locator(TOOLTIP), 'one shared tooltip shows the target text').toHaveText(text);
    await expect(page.locator(TOOLTIP)).toHaveCount(1)
}

test.describe('Neo.tooltip.Base: the shared tooltip reaches dialogs under document.body', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/tooltip-floating-root/index.html');
        await page.waitForSelector(VIEWPORT, {state: 'visible'})
    });

    test('control: a viewport button shows the shared tooltip', async ({page}) => {
        await expectTooltip(page, VIEWPORT, 'Viewport tooltip')
    });

    for (const owned of [false, true]) {
        const kind   = owned ? 'owned' : 'unowned',
              dialog = `#tooltip-floating-root-${kind}`,
              target = `${dialog}-target`;

        test.describe(`a dialog ${owned ? 'with' : 'without'} the viewport as its parentComponent`, () => {
            test.beforeEach(async ({page}) => {
                await drive(page, 'open', owned);
                await page.waitForSelector(target, {state: 'visible'});

                // The shape under test: the dialog's DOM lies outside the main view's
                expect(await page.locator(dialog).evaluate(node => node.parentElement === document.body)).toBe(true)
            });

            test.afterEach(async ({page}) => {
                await drive(page, 'destroy', owned)
            });

            test('its button shows the tooltip the viewport button shows', async ({page}) => {
                await expectTooltip(page, target, `${kind} tooltip`);
                await expectTooltip(page, VIEWPORT, 'Viewport tooltip')
            });

            test('its button keeps the tooltip through hide, show, destroy and a new dialog', async ({page}) => {
                await test.step('hidden and shown again', async () => {
                    await drive(page, 'hide', owned);
                    await expect(page.locator(dialog)).toHaveCount(0);

                    await drive(page, 'show', owned);
                    await page.waitForSelector(target, {state: 'visible'});
                    await expectTooltip(page, target, `${kind} tooltip`)
                });

                await test.step('destroyed and opened anew', async () => {
                    // The pointer leaves first, as it does to reach a close button
                    await page.mouse.move(0, 0);
                    await expect(page.locator(TOOLTIP)).toHaveCount(0);

                    await drive(page, 'destroy', owned);
                    await expect(page.locator(dialog)).toHaveCount(0);

                    await drive(page, 'open', owned);
                    await page.waitForSelector(target, {state: 'visible'});
                    await expectTooltip(page, target, `${kind} tooltip`)
                })
            })
        })
    }
});
