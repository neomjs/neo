import {expect, test} from '../../fixtures.mjs';

const
    url    = '/examples/fileExplorer/index.html?theme=neo-theme-neo-dark',
    items  = '.fe-tree li.neo-list-item',
    detail = '.fe-detail';

/**
 * @summary The tree item that shows `name`, matched on its whole text.
 * @param {import('@playwright/test').Page} page
 * @param {String} name
 * @returns {import('@playwright/test').Locator}
 */
function item(page, name) {
    return page.locator(items).filter({has: page.getByText(name, {exact: true})})
}

/**
 * @summary The names the tree shows: rendered, and not hidden by the filter.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String[]>}
 */
function shown(page) {
    return page.$$eval(items, els => els.filter(el => el.offsetParent !== null).map(el => el.textContent))
}

/**
 * @summary The names a folder holds directly, or null while it renders no list.
 * @param {import('@playwright/test').Page} page
 * @param {String} name
 * @returns {Promise<String[]|null>}
 */
function inside(page, name) {
    return page.evaluate(({items, name}) => {
        const li = [...document.querySelectorAll(items)].find(el => el.textContent === name),
              ul = li?.nextElementSibling;

        return ul?.tagName === 'UL' ? [...ul.children].filter(el => el.tagName === 'LI').map(el => el.textContent) : null
    }, {items, name})
}

/**
 * @summary The file explorer example: a small web shop's folders and files on `Neo.tree.List` beside a detail pane.
 * The filter keeps the ancestors of a match, `logs` loads its listing when it first opens, an entry renames in place
 * and moves into another folder by drag, and the detail pane follows the entry it shows.
 */
test.describe('File explorer example', () => {
    test.setTimeout(60000);

    test('opens on the project, with Cart.mjs selected and shown', async ({page}) => {
        await page.goto(url);

        await expect(item(page, 'Cart.mjs')).toHaveClass(/neo-selected/);
        await expect(page.locator(detail)).toContainText('/src/components/Cart.mjs');
        await expect(page.locator(detail)).toContainText('JavaScript module');
        expect(await shown(page)).toContain('README.md')
    });

    test('the filter keeps the folders that hold a match', async ({page}) => {
        await page.goto(url);
        await expect(item(page, 'Cart.mjs')).toBeVisible();

        await page.locator('.file-explorer-viewport input').first().fill('cart');

        await expect.poll(() => shown(page)).toEqual(['src', 'components', 'Cart.mjs', 'tests', 'cart.spec.mjs'])
    });

    test('logs loads its listing the first time it opens, and only then', async ({page}) => {
        const requests = [];

        page.on('request', request => request.url().includes('/fileExplorer/logs.json') && requests.push(request.url()));

        await page.goto(url);
        await expect(item(page, 'logs')).toBeVisible();
        expect(await inside(page, 'logs')).toBeNull();
        expect(requests).toHaveLength(0);

        await item(page, 'logs').click();

        await expect.poll(async () => (await inside(page, 'logs'))?.length).toBe(365);
        expect(requests).toHaveLength(1);

        // Closed and opened again, it reads what it holds
        await item(page, 'logs').click();
        await expect.poll(() => inside(page, 'logs')).toBeNull();
        await item(page, 'logs').click();
        await expect.poll(async () => (await inside(page, 'logs'))?.length).toBe(365);
        expect(requests).toHaveLength(1)
    });

    test('the arrow keys move between entries, and Enter opens a folder', async ({page}) => {
        await page.goto(url);
        await expect(item(page, 'docs')).toBeVisible();

        await item(page, 'docs').click();
        await expect.poll(() => inside(page, 'docs')).toEqual(['architecture.md', 'getting-started.md']);

        await page.keyboard.press('ArrowDown');
        await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe('architecture.md');

        await page.keyboard.press('ArrowUp');
        await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe('docs');

        await page.keyboard.press('Enter');
        await expect.poll(() => inside(page, 'docs')).toBeNull()
    });

    test('an entry renames in place, by double-click or F2, and the detail pane follows', async ({page}) => {
        await page.goto(url);
        await expect(item(page, 'README.md')).toBeVisible();

        await item(page, 'README.md').click();
        await expect(page.locator(detail)).toContainText('/README.md');

        await item(page, 'README.md').dblclick();

        const editor = page.locator('.fe-tree li.neo-list-item-editing input');

        await editor.fill('NOTES.md');
        await page.keyboard.press('Enter');

        await expect(item(page, 'NOTES.md')).toHaveCount(1);
        await expect(page.locator(detail)).toContainText('/NOTES.md');

        await page.keyboard.press('F2');
        await expect(editor).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(editor).toHaveCount(0);
        await expect(item(page, 'NOTES.md')).toHaveCount(1)
    });

    test('a file moves into another folder by drag, and the detail pane follows', async ({page}) => {
        await page.goto(url);
        await expect(item(page, 'Button.mjs')).toBeVisible();

        await item(page, 'Button.mjs').click();
        await expect(page.locator(detail)).toContainText('/src/components/Button.mjs');

        const from = await item(page, 'Button.mjs').boundingBox(),
              to   = await item(page, 'pages').boundingBox();

        await page.mouse.move(from.x + 40, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + 44, from.y + from.height / 2 + 6, {steps: 4});
        await page.mouse.move(to.x + 50, to.y + to.height / 2, {steps: 20});
        await page.mouse.up();

        await expect(page.locator(detail)).toContainText('/src/pages/Button.mjs');
        expect(await inside(page, 'components')).not.toContain('Button.mjs');

        // pages stays closed under the drop; opened, it holds the file
        await item(page, 'pages').click();
        await expect.poll(() => inside(page, 'pages')).toContain('Button.mjs')
    });

    test('a file dropped into an unopened folder does not stand in for its listing', async ({page}) => {
        const requests = [];

        page.on('request', request => request.url().includes('/fileExplorer/logs.json') && requests.push(request.url()));

        // Tall enough to show README, the tree's last row, and logs at once
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(url);
        await expect(item(page, 'README.md')).toBeVisible();

        const from = await item(page, 'README.md').boundingBox(),
              to   = await item(page, 'logs').boundingBox();

        await page.mouse.move(from.x + 40, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + 44, from.y + from.height / 2 - 6, {steps: 4});
        // The whole tree's height to cross: small steps, so the zone reads every row on the way
        await page.mouse.move(to.x + 50, to.y + to.height / 2, {steps: 60});
        await page.mouse.up();

        await expect.poll(() => shown(page)).not.toContain('README.md');
        expect(requests).toHaveLength(0);

        // logs holds the dropped file, and still loads its own 365 the first time it opens
        await item(page, 'logs').click();
        await expect.poll(async () => (await inside(page, 'logs'))?.length).toBe(366);
        expect(await inside(page, 'logs')).toContain('README.md');
        expect(requests).toHaveLength(1)
    });

    test('renders Neo.component.EmptyState when no entry is shown across dark/light and narrow layout, then transitions back on selection', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 360, height: 800});
        await page.goto(url);
        const app = await neuralLink.connectToApp('Neo.examples.fileExplorer');

        await expect(page.locator(detail)).toContainText('/src/components/Cart.mjs');

        const [paneInfo]  = await app.queryComponent({className: 'Neo.examples.fileExplorer.DetailPane'}, ['id']),
              [emptyInfo] = await app.queryComponent({className: 'Neo.component.EmptyState'}, ['id', 'hidden', 'text', 'ui']);

        expect(emptyInfo.properties.hidden).toBe(true);
        expect(emptyInfo.properties.ui).toBe('plain');

        await app.setProperties(paneInfo.id, {details: null});

        const emptyNode = page.locator(`${detail} .neo-empty-state`);
        await expect(emptyNode).toBeVisible();
        await expect(emptyNode.locator('.neo-empty-state-title')).toHaveText('Select a file or a folder to see its details.');
        await expect(emptyNode.locator('.neo-empty-state-glyph')).toHaveCount(0);
        await expect(emptyNode.locator('button')).toHaveCount(0);

        const narrowFits = await emptyNode.evaluate(el => ({
            fits     : el.getBoundingClientRect().right <= window.innerWidth + 0.5,
            overflowX: el.scrollWidth > el.clientWidth + 1
        }));
        expect(narrowFits).toEqual({fits: true, overflowX: false});

        // Switch theme to neo-light and verify empty state remains legible
        await page.locator('.fe-header .neo-button').last().click();
        await expect(page.locator('.file-explorer-viewport')).toHaveClass(/neo-theme-neo-light/);
        await expect(emptyNode).toBeVisible();

        // Clicking an entry transitions cleanly back from EmptyState to populated details
        await item(page, 'README.md').click();
        await expect(emptyNode).toHaveCount(0);
        await expect(page.locator(detail)).toContainText('/README.md');
        await expect(page.locator(detail)).toContainText('Markdown')
    })
});
