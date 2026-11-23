import {expect, test} from '../../fixtures.mjs';

const DESKTOP = '/apps/webdesktop/index.html',
      ICON    = '.neo-desktop-launcher .neo-list-item:not(.neo-list-header)';

/**
 * @summary The launcher's reorder chords on the real main → app event path. The main thread's navigator and the
 * worker's key handler both receive every key, so a chord reorders without the navigator moving the focus, and a
 * plain arrow still moves it.
 */

/**
 * @param {Object} page
 * @returns {Promise<String[]>} The app labels in the launcher's order
 */
const labels = page => page.locator(`${ICON} .neo-desktop-app-label`).allInnerTexts();

/**
 * @param {Object} page
 * @returns {Promise<String|null>} The label of the focused app
 */
const focused = page => page.evaluate(() => document.activeElement?.querySelector('.neo-desktop-app-label')?.textContent ?? null);

test.describe('the launcher\'s reorder chords', () => {
    test.use({viewport: {width: 1440, height: 900}});

    test('Ctrl+Shift+Down moves an app within its group and keeps the focus; at the group\'s end it changes nothing, and a plain arrow still navigates', async ({page}) => {
        await page.goto(DESKTOP);
        await page.getByText('Alex Morgan', {exact: true}).click();
        await expect(page.locator(ICON).first()).toBeVisible();

        const before = await labels(page),
              moved  = ['Mail', 'Calendar', 'Messages', ...before.slice(3)];

        expect(before.slice(0, 4)).toEqual(['Mail', 'Messages', 'Calendar', 'Photos']);

        await page.locator(ICON).filter({hasText: 'Messages'}).click();
        await expect.poll(() => focused(page)).toBe('Messages');

        await page.keyboard.press('Control+Shift+ArrowDown');
        await expect.poll(() => labels(page)).toEqual(moved);
        await expect.poll(() => focused(page)).toBe('Messages');

        // Messages ends its group now: nothing moves, in either thread, however often the chord repeats
        await page.keyboard.press('Control+Shift+ArrowDown');
        await page.keyboard.press('Control+Shift+ArrowDown');
        await page.waitForTimeout(400);

        expect(await labels(page)).toEqual(moved);
        expect(await focused(page)).toBe('Messages');

        // The control: the same key without the chord is the navigator's, and it moves the focus on
        await page.keyboard.press('ArrowDown');
        await expect.poll(() => focused(page)).toBe('Photos')
    });
});
