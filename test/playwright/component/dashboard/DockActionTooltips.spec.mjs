import {test, expect} from '@playwright/test';

/**
 * @summary The engine header actions and the rail's reveal pin name themselves on hover through the
 * app's shared tooltip, and the maximize toggle renames with its glyph.
 *
 * Rides the dock-maximize fixture: reload, maximize and close are enabled, pin projects on the edge
 * node, and `railed` sits auto-hidden on the right rail so the reveal overlay's pin exists. A
 * withdrawn action has no hover target, so every read happens after the container holds focus.
 *
 * Run: npx playwright test dashboard/DockActionTooltips -c test/playwright/playwright.config.component.mjs --workers=1
 */

const tabsNodeWith = (page, tabText) => page.locator('.neo-dashboard-dock-tabs', {
    has: page.locator(`.neo-tab-header-button:has-text("${tabText}")`)
});

const tabButton = (node, text) => node.locator('.neo-tab-header-button', {hasText: text});

const actionButton = (node, glyph) => node.locator(`.neo-tab-header-toolbar .neo-button:has([class*="${glyph}"])`);

/**
 * Hovers one control and waits for the app's shared tooltip — one node, mounted on show — to carry
 * the expected text. The pointer parks on a neutral spot first, so hovering the same control twice
 * (before and after a toggle) re-enters it and the singleton reconfigures.
 * @param {Object} page
 * @param {Object} locator
 * @param {String} text
 * @returns {Promise<void>}
 */
const expectTooltip = async (page, locator, text) => {
    await page.mouse.move(0, 0);
    await locator.hover();
    await expect(page.locator('.neo-tooltip'), `hovering shows "${text}"`).toHaveText(text)
};

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-maximize/index.html');
    await page.waitForSelector('#dock-maximize-workspace', {state: 'attached'});
    await page.waitForSelector('.neo-tab-header-button',   {state: 'visible'})
});

test.describe('dock header action tooltips', () => {
    test('every offered engine action names itself on hover, and maximize renames with its glyph', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();

        await expectTooltip(page, actionButton(main, 'fa-rotate-right'), 'Reload pane');
        await expectTooltip(page, actionButton(main, 'fa-times'),        'Close');

        const maximize = actionButton(main, 'fa-window-maximize');

        await expectTooltip(page, maximize, 'Maximize');
        await expect(maximize).toHaveAttribute('aria-label', 'maximize');

        await maximize.click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        // The toggle keeps its instance: the same node now carries the restore glyph, name and text.
        const restore = actionButton(main, 'fa-window-minimize');

        await expect(restore).toHaveCount(1);
        await expectTooltip(page, restore, 'Restore');
        await expect(restore).toHaveAttribute('aria-label', 'restore');

        await restore.click();
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0);

        await expectTooltip(page, actionButton(main, 'fa-window-maximize'), 'Maximize');
        await expect(actionButton(main, 'fa-window-maximize')).toHaveAttribute('aria-label', 'maximize')
    });

    test('unpin and the reveal overlay pin name themselves on hover', async ({page}) => {
        const edge = tabsNodeWith(page, 'Pinned');

        await tabButton(edge, 'Pinned').click();
        await expectTooltip(page, actionButton(edge, 'fa-thumbtack-slash'), 'Unpin into the rail');

        await page.locator('.neo-dashboard-dock-edge-rail').getByText('Railed').click();

        const overlay = page.locator('.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)');

        await expect(overlay).toHaveCount(1);
        await expectTooltip(page, overlay.getByRole('button', {name: 'Pin'}), 'Pin back into the layout')
    })
});
