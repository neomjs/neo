import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The tracks the tree list's playlist shows, in order.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String[]>}
 */
function playlist(page) {
    return page.$$eval('.tree-playlist .neo-list-item', els => els.map(el => el.textContent))
}

/**
 * @summary Drags a tree item by its exact text onto the playlist, in small steps, so the drag zone reads the way.
 * @param {import('@playwright/test').Page} page
 * @param {String} name
 */
async function dragToPlaylist(page, name) {
    const from = await page.locator('.tree-library li.neo-list-item').filter({has: page.getByText(name, {exact: true})}).first().boundingBox(),
          to   = await page.locator('.tree-playlist-drop').boundingBox();

    await page.mouse.move(from.x + 40, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 46, from.y + from.height / 2 + 4, {steps: 4});
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {steps: 25});
    await page.mouse.up()
}

/**
 * @summary The Trees group's two tiles: the tree list drags a track or a whole album into its playlist, and the tree
 * accordion names the setting it selects, which a phone keeps in view.
 */
test.describe('Tree tiles', () => {
    test.setTimeout(60000);

    test('a track, then an album, dragged into the playlist join it once', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/tree/index.html');
        await expect(page.locator('.tree-playlist .neo-list-item')).toHaveCount(2);

        await dragToPlaylist(page, 'Northbound');
        await expect.poll(() => playlist(page)).toContain('Northbound · 4:05 · The Paper Lanterns');

        // A track already on the playlist stays where it is
        await dragToPlaylist(page, 'Northbound');
        await page.waitForTimeout(300);
        expect(await playlist(page)).toHaveLength(3);

        // An album brings every track it holds
        await dragToPlaylist(page, 'Low Tide');
        await expect.poll(async () => (await playlist(page)).length).toBe(6);
        await expect(page.locator('.tree-playlist')).toContainText('Playlist · 6 tracks · 22:26')
    });

    test('the accordion opens a section, names the selected setting, and a phone keeps it in view', async ({page}) => {
        const panel = page.locator('.tree-settings-selection'),
              item  = name => page.locator('.neo-accordion-style li.neo-list-item').filter({hasText: name}).first();

        await page.setViewportSize({width: 390, height: 844});
        await page.goto('/examples/treeAccordion/index.html');
        await expect(panel).toContainText('Profile');

        // Notifications opens on a click, Account having opened first
        await expect(item('Quiet hours')).toBeHidden();
        await item('Notifications').click();
        await item('Quiet hours').click();

        await expect(panel).toContainText('Quiet hours');
        await expect(panel).toContainText('22:00 to 07:00');
        await expect(panel).toBeInViewport()
    });

    test('the keyboard picks the focused setting: the arrows move, Enter opens a section and selects a setting', async ({page}) => {
        const panel = page.locator('.tree-settings-selection'),
              item  = name => page.locator('.neo-accordion-style li.neo-list-item').filter({hasText: name}).first();

        await page.setViewportSize({width: 390, height: 844});
        await page.goto('/examples/treeAccordion/index.html');
        await item('Profile').click();
        await expect(panel).toContainText('Profile');

        // Password, Two-step sign-in, Notifications
        for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expect(item('Quiet hours')).toBeVisible();

        // Email, Mobile push, Quiet hours
        for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');

        await expect(panel).toContainText('Quiet hours');
        await expect(item('Quiet hours')).toHaveClass(/neo-selected/)
    })
});
