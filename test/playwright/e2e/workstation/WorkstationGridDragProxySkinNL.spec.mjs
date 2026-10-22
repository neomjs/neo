import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness that a Workstation grid's column-drag proxy keeps the instrument skin.
 *
 * The proxy mounts on `document.body`, outside `.workstation-viewport`, so the viewport's grid token
 * bridge never reaches it by inheritance. The assertions compare the live proxy's COMPUTED
 * paint with the source grid's, in both skins, so a palette retune stays green and only a proxy that
 * resolves the theme's defaults goes red.
 *
 * Run: NEO_E2E_PORT=8161 npx playwright test workstation/WorkstationGridDragProxySkinNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

const
    proxySelector  = 'body > .neo-grid-container.neo-dragproxy',
    sourceSelector = '.workstation-viewport .workstation-scale-pane';

/**
 * Drags the 100k Matrix grid's Throughput header with a real pointer, hands the live proxy to
 * `read`, then drops it back on its origin so the column order never changes.
 * @param {Object} page Playwright page
 * @param {Function} read
 * @returns {Promise<Object>}
 */
async function withColumnDrag(page, read) {
    const box = await page.locator(`${sourceSelector} .neo-grid-header-button`, {hasText: 'Throughput'}).first().boundingBox(),
          x   = box.x + box.width / 2,
          y   = box.y + box.height / 2;

    // A skin switch covers the page until it settles, and a press on that cover never reaches the header.
    await page.waitForFunction(([x, y]) => document.elementFromPoint(x, y)?.closest('.neo-grid-header-button'), [x, y]);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 12, y, {steps: 4});
    await page.mouse.move(x + 40, y, {steps: 6});
    await expect(page.locator(proxySelector)).toBeVisible();

    const result = await read(page);

    await page.mouse.move(x, y, {steps: 6});
    await page.mouse.up();
    await expect(page.locator(proxySelector)).toHaveCount(0);

    return result
}

/**
 * Reads the proxy's header and cell paint next to the source grid's. The source header is `State`,
 * left of the drag path, so no reading is taken from a hovered button.
 * @param {Object} page Playwright page
 * @returns {Promise<Object>}
 */
function readSkins(page) {
    return page.evaluate(([proxySelector, sourceSelector]) => {
        const proxy        = document.querySelector(proxySelector),
              source       = document.querySelector(sourceSelector),
              sourceHeader = [...source.querySelectorAll('.neo-grid-header-button')].find(button => button.textContent.trim() === 'State'),
              proxyHeader  = proxy.querySelector('.neo-grid-header-button'),
              sourceRows   = [...source.querySelectorAll('.neo-grid-row')],
              colIndex     = [...source.querySelectorAll('.neo-grid-header-button')].find(button => button.textContent.trim() === 'Throughput').getAttribute('aria-colindex'),
              paint        = node => {const style = getComputedStyle(node); return {background: style.backgroundColor, color: style.color}};

        return {
            header: {proxy: paint(proxyHeader), source: paint(sourceHeader)},
            cells : [...proxy.querySelectorAll('.neo-grid-row')].map((row, index) => ({
                proxy : paint(row.querySelector('.neo-grid-cell')).background,
                source: paint(sourceRows[index].querySelector(`.neo-grid-cell[aria-colindex="${colIndex}"]`) || sourceRows[index].querySelector('.neo-grid-cell')).background
            }))
        }
    }, [proxySelector, sourceSelector])
}

/**
 * @param {Object} skins readSkins() result
 * @param {String} label
 */
function assertProxyMatchesSource(skins, label) {
    expect(skins.header.proxy.background, `${label}: proxy header background`).toBe(skins.header.source.background);
    expect(skins.header.proxy.color,      `${label}: proxy header text color`).toBe(skins.header.source.color);
    expect(skins.cells.length,            `${label}: the proxy carries proxied cells`).toBeGreaterThan(0);
    expect(skins.cells.map(cell => cell.proxy), `${label}: each proxied cell background`).toEqual(skins.cells.map(cell => cell.source))
}

test.describe('Workstation — the grid column-drag proxy keeps the instrument skin', () => {
    for (const skin of ['dark', 'light']) {
        test(`a dragged Matrix column header paints like its source grid (${skin})`, async ({page}) => {
            await page.setViewportSize({width: 1440, height: 900});
            await page.goto('/apps/workstation/index.html');
            await page.waitForSelector(`${sourceSelector} .neo-grid-cell`, {timeout: 60000});

            if (skin === 'light') {
                await page.locator('.workstation-theme-button').click();
                await page.waitForFunction(
                    () => document.querySelector('.workstation-viewport')?.classList.contains('neo-theme-neo-light'),
                    null,
                    {timeout: 30000}
                )
            }

            assertProxyMatchesSource(await withColumnDrag(page, readSkins), skin)
        })
    }
});
