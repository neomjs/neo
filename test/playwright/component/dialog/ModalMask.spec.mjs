import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A modal Dialog's mask leaves the page together with the dialog, including when a hide() lands with an
 * animated show's mount flight. The real App Worker, DOM and `Neo.main.DomAccess#syncModalMask` run here, so the
 * order of node removal and mask sync is observed rather than modeled.
 */
const DIALOG = '#dialog-modal-under-test',
      MASK   = '.neo-dialog-modal-mask';

let driverCount = 0;

/**
 * Runs one `driver.mjs` action inside the App Worker; the counter makes every call a new module URL.
 * @param {import('@playwright/test').Page} page
 * @param {String} action
 * @returns {Promise<void>}
 */
async function drive(page, action) {
    const {success} = await page.evaluate(path => Neo.worker.App.loadModule({path}),
        `../../test/playwright/component/apps/dialog-modal/driver.mjs?action=${action}&n=${++driverCount}`);

    expect(success, `the ${action} action reached the App Worker`).toBe(true)
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String>} The class of the element at the viewport's center, which an orphan mask covers
 */
const centerHit = page => page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.className || '');

test.describe('Neo.dialog.Base: the modal mask follows the dialog', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/dialog-modal/index.html');
        await page.waitForSelector('#dialog-modal-target', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        await drive(page, 'destroy')
    });

    test('control: a hide after the animated show settled removes the dialog and its mask', async ({page}) => {
        await drive(page, 'open');
        // The settled show is what inserts the mask
        await expect(page.locator(MASK)).toHaveCount(1);

        await drive(page, 'hide');

        await expect(page.locator(DIALOG)).toHaveCount(0);
        await expect(page.locator(MASK)).toHaveCount(0);
        expect(await centerHit(page)).not.toContain('neo-dialog-modal-mask')
    });

    test('a hide while the animated show is in flight removes the dialog and its mask', async ({page}) => {
        await drive(page, 'open');
        await page.waitForSelector(DIALOG, {state: 'attached'});

        await drive(page, 'hide');

        await expect(page.locator(DIALOG)).toHaveCount(0);
        await expect(page.locator(MASK)).toHaveCount(0);
        expect(await centerHit(page)).not.toContain('neo-dialog-modal-mask')
    });
});
