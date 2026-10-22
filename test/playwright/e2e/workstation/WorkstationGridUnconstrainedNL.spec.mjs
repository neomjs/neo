import {test, expect} from '../../fixtures.mjs';

/**
 * Round trip main thread → App Worker → main thread, in ms, or -1 without an answer within `limit` ms.
 * @param {import('@playwright/test').Page} page
 * @param {Number} limit
 * @returns {Promise<Number>}
 */
const pingAppWorker = (page, limit) => page.evaluate(limit => new Promise(resolve => {
    const start = performance.now(),
          timer = setTimeout(() => resolve(-1), limit);

    Neo.worker.App.getWorkerId().then(() => {
        clearTimeout(timer);
        resolve(performance.now() - start)
    })
}), limit);

/**
 * @summary A grid that no ancestor bounds keeps a window-sized viewport and pool.
 *
 * Makes the 100k Matrix pane content-sized from its grid up to its dock split, the state a dock layout leaves when
 * it drops the pane's size constraint. Before the fix the view measured the body's full scroll height (100,001 ×
 * 50 px), the body pooled a Row per record, and the App Worker stopped answering and then flooded duplicate row ids.
 *
 * Run: NEO_NL_PORT=<free port> npx playwright test workstation/WorkstationGridUnconstrainedNL -c test/playwright/playwright.config.e2e.mjs
 */
test.describe('Workstation — a grid without a size constraint', () => {
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 900, width: 1440}
    });

    test('the App Worker keeps answering and the Matrix pool stays window-sized', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-scale-pane .neo-grid-row', {timeout: 30000});

        const app      = await neuralLink.connectToApp('Workstation'),
              bodyId   = await page.evaluate(() => document.querySelector('.workstation-scale-pane .neo-grid-body').id),
              readBody = () => app.getComponent(bodyId, ['availableHeight', 'bufferRowRange', 'rowHeight', 'rowPoolSize']),
              before   = await readBody();

        expect(await pingAppWorker(page, 5000), 'control: the App Worker answers before the layout change').toBeGreaterThanOrEqual(0);

        await page.evaluate(() => {
            let element = document.querySelector('.workstation-scale-pane');

            while (!element.classList.contains('neo-dashboard-dock-split')) {
                element.style.flex   = 'none';
                element.style.height = 'auto';
                element = element.parentElement
            }
        });

        // The grid re-measures through its buffered resize observer; a wedged App Worker never reports back
        await expect.poll(async () => (await readBody()).availableHeight, {
            message: 'the App Worker reports the content-sized layout',
            timeout: 5000
        }).not.toBe(before.availableHeight);

        const body           = await readBody(),
              {innerHeight}  = await page.evaluate(() => ({innerHeight: window.innerHeight})),
              viewHeight     = await page.evaluate(() => document.querySelector('.workstation-scale-pane .neo-grid-view').getBoundingClientRect().height),
              windowPoolSize = Math.ceil(innerHeight / body.rowHeight) + 2 * body.bufferRowRange;

        expect(await pingAppWorker(page, 1000), 'the App Worker answers within 100 ms').toBeLessThan(100);
        expect(viewHeight, 'the view stays within its window').toBeLessThanOrEqual(innerHeight);
        expect(body.availableHeight, 'the body measures the bounded view').toBeLessThanOrEqual(innerHeight);
        expect(body.rowPoolSize, 'the pool covers what the window can show').toBeLessThanOrEqual(windowPoolSize);
        expect(await page.locator('.workstation-scale-pane .neo-grid-row').count(), 'the pane still renders its rows').toBeGreaterThan(0);
        expect(await app.getConsoleLogs('error', 'already existing id'), 'no row id is created twice').toEqual([])
    })
});
