import {expect, test} from '@playwright/test';

const HOME_URL = '/apps/portal/index.html#/home';

/**
 * Scrolls one of the home's snap pages into view and waits until its live preview has run.
 * @param {import('@playwright/test').Page} page
 * @param {String} selector The page's own class
 * @param {String} rendered A selector that only the running preview produces
 * @returns {Promise<import('@playwright/test').Locator>} The page's locator
 */
async function openPage(page, selector, rendered) {
    const section = page.locator(selector);

    await expect(section).toBeAttached({timeout: 30000});
    await section.evaluate(node => node.scrollIntoView());
    await expect(section.locator(rendered).first()).toBeVisible({timeout: 20000});

    return section
}

/**
 * @param {import('@playwright/test').Locator} section
 * @returns {Promise<Object>} The boxes of the page's editor and preview card, and the window's size
 */
function readLayout(section) {
    return section.evaluate(node => {
        const box = selector => {
            const rect = node.querySelector(selector)?.getBoundingClientRect();
            return rect && {bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top, width: rect.width}
        };

        return {
            card  : box('.neo-tab-body-container > :last-child'),
            editor: box('.neo-monaco-editor'),
            pane  : box('.page-live-preview'),
            window: {height: innerHeight, scrollWidth: document.documentElement.scrollWidth, width: innerWidth}
        }
    })
}

/**
 * @summary The home's two component pages: a grid and a scheduler, each built by the code shown beside it.
 * Covers what a unit test cannot see: both halves on screen inside one snap page, the preview following an edit,
 * the links to the other families, the wheel passing the code on its way down the page, and the phone layout.
 */
test.describe('Portal home: the grid and the scheduler beside their code', () => {
    test.setTimeout(90000);

    test('desktop: code and result share one snap page, an edit re-renders, and the families are linked', async ({page}) => {
        const errors = [];

        page.on('console',   message => {message.type() === 'error' && errors.push(message.text())});
        page.on('pageerror', error => errors.push(error.message));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(HOME_URL);

        const grid   = await openPage(page, '.portal-home-parts-grid', '.neo-grid-row'),
              layout = await readLayout(grid);

        // Both halves are on screen, the editor left of the result, and nothing leaves the window
        expect(layout.editor.width).toBeGreaterThan(400);
        expect(layout.card.width).toBeGreaterThan(400);
        expect(layout.editor.right).toBeLessThanOrEqual(layout.card.left + 2);
        expect(layout.pane.right).toBeLessThanOrEqual(layout.window.width);
        expect(layout.pane.bottom).toBeLessThanOrEqual(layout.window.height);

        await expect(grid.getByRole('heading', {level: 2})).toHaveText('Data Grid');
        await expect(grid.locator('.neo-grid-row').first()).toContainText('Account 1');

        // The whole snippet is readable without scrolling the editor
        const lines = await grid.getByRole('heading', {level: 3}).textContent();

        await expect(grid.locator('.view-line')).toHaveCount(Number(lines.match(/(\d+) Lines/)[1]));

        // The other families are one click away
        const links = await grid.locator('.portal-content-links a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));

        expect(links).toEqual([
            '#/examples/grid-table', '#/examples/forms', '#/examples/scheduler', '#/examples/gantt',
            '#/examples/board', '#/examples/calendar', '#/examples/dashboard'
        ]);

        // Changing the code changes the grid
        const editorId = await grid.locator('.neo-monaco-editor').getAttribute('id');

        await expect.poll(() => page.evaluate(id => Boolean(Neo.main.addon.MonacoEditor.map[id]?.getModel()), editorId)).toBe(true);
        await page.evaluate(id => {
            const editor = Neo.main.addon.MonacoEditor.map[id];

            editor.setValue(editor.getValue().replace('length: 50000', 'length: 3').replace("text: 'Sales'", "text: 'Turnover'"))
        }, editorId);

        await expect(grid.locator('.neo-grid-header-button', {hasText: 'Turnover'})).toBeVisible({timeout: 15000});
        await expect(grid.locator('.neo-grid-row', {hasText: 'Account'})).toHaveCount(3);

        // The wheel over the code moves the page on: the snippet has nothing left to scroll
        const home   = page.locator('.portal-home-maincontainer'),
              before = await home.evaluate(node => node.scrollTop);

        await page.mouse.move(layout.editor.left + 200, layout.editor.top + 200);
        await page.mouse.wheel(0, 900);
        await expect.poll(() => home.evaluate(node => node.scrollTop), {timeout: 10000}).toBeGreaterThan(before + 300);

        // The scheduler follows, built the same way
        const scheduler       = await openPage(page, '.portal-home-parts-scheduler', '.neo-timeline-bar'),
              schedulerLayout = await readLayout(scheduler);

        await expect(scheduler.getByRole('heading', {level: 3})).toHaveText('New in Engine 14');
        await expect(scheduler.locator('.neo-timeline-bar')).toHaveCount(14);
        expect(schedulerLayout.editor.right).toBeLessThanOrEqual(schedulerLayout.card.left + 2);
        expect(schedulerLayout.pane.right).toBeLessThanOrEqual(schedulerLayout.window.width);
        expect(schedulerLayout.pane.bottom).toBeLessThanOrEqual(schedulerLayout.window.height);

        // The keyboard moves the page on as well, once the page itself was clicked
        const atScheduler = await home.evaluate(node => node.scrollTop);

        await scheduler.locator('.portal-content-text > p').click();
        await page.keyboard.press('PageDown');
        await expect.poll(() => home.evaluate(node => node.scrollTop), {timeout: 10000}).toBeGreaterThan(atScheduler + 300);

        // Neither page asks for a file of the former demos
        const requested = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));

        expect(requested.filter(url => /\/apps\/colors\/|multiWindowHelix/.test(url))).toEqual([]);
        expect(errors).toEqual([])
    });

    test('phone: the pages fall back to tabs and stay inside the screen', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(HOME_URL);

        const grid   = await openPage(page, '.portal-home-parts-grid', '.neo-grid-row'),
              layout = await readLayout(grid);

        expect(layout.window.scrollWidth).toBeLessThanOrEqual(layout.window.width);
        expect(layout.pane.right).toBeLessThanOrEqual(layout.window.width);

        // Too narrow for both: the tabs are back, Preview in front
        await expect(grid.getByText('Source', {exact: true})).toBeVisible();
        await expect(grid.locator('.neo-monaco-editor')).toBeHidden();

        const scheduler = await openPage(page, '.portal-home-parts-scheduler', '.neo-timeline-bar');

        expect((await readLayout(scheduler)).window.scrollWidth).toBeLessThanOrEqual(layout.window.width)
    })
});
