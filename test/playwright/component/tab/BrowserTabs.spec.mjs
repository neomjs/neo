import {test, expect} from '@playwright/test';

/**
 * @summary The browser-style tab strip keeps its promises: the overflow menu reaches a hidden tab, "+" opens and
 * activates a tab, a tab's × closes it with the selection on a remaining tab, and a dragged tab lands in its new
 * place.
 *
 * Driven on `examples/tab/browser` with real clicks and a real pointer drag. The order is read from the rendered
 * headers, the selection from `aria-selected`.
 *
 * Run: npx playwright test component/tab/BrowserTabs -c test/playwright/playwright.config.component.mjs
 */

test.use({viewport: {height: 900, width: 1440}});

test.beforeEach(async ({page}) => {
    await page.goto('examples/tab/browser/index.html');
    await expect(page.locator('.neo-tab-overflow-control'), 'thirty tabs overflow the strip').toBeVisible({timeout: 30000})
});

/**
 * @param {Object} page
 * @returns {Promise<String[]>} The visible header titles, close mark removed
 */
function titles(page) {
    return page.locator('.neo-tab-header-button').evaluateAll(nodes => nodes.map(node => node.textContent.replace('×', '').trim()))
}

/**
 * @param {Object} page
 * @returns {Object} The selected header
 */
function selected(page) {
    return page.locator('.neo-tab-header-button[aria-selected="true"]')
}

test('the overflow menu reaches a hidden tab and activates it', async ({page}) => {
    expect(await titles(page), 'Playground, the 30th tab, does not fit').not.toContain('Playground');

    await page.getByRole('button', {name: 'More tabs'}).click();
    await page.getByText('Playground', {exact: true}).click();

    await expect(selected(page)).toContainText('Playground');
    await expect(page.locator('.neo-example-browser-page h2:visible')).toHaveText('Playground')
});

test('+ opens a new tab, and its × closes it with the selection on a remaining tab', async ({page}) => {
    await page.getByRole('button', {name: 'add tab'}).click();

    await expect(selected(page)).toContainText('New tab 1');

    await selected(page).locator('.neo-tab-close').click();

    await expect(page.locator('.neo-tab-header-button', {hasText: 'New tab 1'})).toHaveCount(0);
    await expect(selected(page)).toHaveCount(1)
});

test('a tab dragged along the strip lands at its new place', async ({page}) => {
    expect((await titles(page)).slice(0, 2)).toEqual(['Inbox (12)', 'Calendar']);

    const first  = await page.locator('.neo-tab-header-button').nth(0).boundingBox(),
          second = await page.locator('.neo-tab-header-button').nth(1).boundingBox();

    await page.mouse.move(first.x + 30, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(second.x + second.width - 10, second.y + second.height / 2, {steps: 20});
    await page.mouse.up();

    await expect.poll(async () => (await titles(page)).slice(0, 2)).toEqual(['Calendar', 'Inbox (12)'])
});
