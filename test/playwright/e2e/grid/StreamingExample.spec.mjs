import {expect, test} from '../../fixtures.mjs';

const EXAMPLE_URL = '/examples/grid/streaming/index.html';

/**
 * @summary E2E verification for the 50,000-row streaming grid example via Neural Link.
 */
test.describe('Streaming 50,000 Grid Rows (Neural Link)', () => {
    test.setTimeout(90000);

    test('streams 50,000 rows, restarts from empty on Load again, and scrolls mid-stream without resetting', async ({page, neuralLink}) => {
        await page.goto(EXAMPLE_URL);

        const app = await neuralLink.connectToApp('Neo.examples.grid.streaming');

        await page.waitForSelector('.neo-grid-container', {state: 'visible', timeout: 30000});

        const [grid]   = await app.queryComponent({className: 'Neo.grid.Container'}, ['id', 'store.id', 'view.id']),
              storeId  = grid.properties['store.id'],
              viewId   = grid.properties['view.id'],
              status   = page.locator('.streaming-status-label'),
              progress = page.locator('.streaming-progress'),
              reload   = page.locator('.streaming-reload-button');

        await expect.poll(async () => app.getComponent(storeId, ['count', 'isStreaming']), {
            message: 'initial stream reaches 50,000 rows',
            timeout: 15000
        }).toMatchObject({count: 50000, isStreaming: false});

        await expect(status).toHaveText('50,000 / 50,000 rows');
        await expect(progress).toHaveAttribute('value', '50000');
        await expect(page.locator('.neo-grid-cell[data-field="settlementId"]').first()).toHaveText('STL-100001');

        // Observe the empty transition and status labels across Load again.
        await page.evaluate(() => {
            const label      = document.querySelector('.streaming-status-label'),
                  body       = document.querySelector('.neo-grid-body'),
                  countBound = () => body?.querySelectorAll('.neo-grid-row[data-record-id]').length ?? -1,
                  labels     = [],
                  rows       = [];

            window.__streamRestartTrace = {labels, rows};
            labels.push(label?.textContent?.trim() || '');
            rows.push(countBound());

            new MutationObserver(() => {
                labels.push(label?.textContent?.trim() || '');
                rows.push(countBound())
            }).observe(label, {characterData: true, childList: true, subtree: true});

            if (body) {
                new MutationObserver(() => {
                    rows.push(countBound())
                }).observe(body, {
                    attributeFilter: ['data-record-id', 'style'],
                    attributes     : true,
                    childList      : true,
                    subtree        : true
                })
            }
        });

        await reload.focus();
        await expect(reload).toBeFocused();
        await page.keyboard.press('Enter');

        let countBeforeScroll = 0;

        await expect.poll(async () => {
            const state = await app.getComponent(storeId, ['count', 'isStreaming']);

            if (state.isStreaming && state.count > 0 && state.count < 50000) {
                countBeforeScroll = state.count;
                return true
            }

            return false
        }, {message: 'Load again restarts with an active mid-flight stream', timeout: 10000}).toBe(true);

        await expect(page.locator('.neo-grid-row').first()).toBeVisible();
        await page.evaluate(id => {document.getElementById(id).scrollTop = 1200}, viewId);
        await expect.poll(async () => (await app.getComponent(viewId, ['scrollTop'])).scrollTop, {
            message: 'grid view scrolls mid-stream'
        }).toBeGreaterThan(0);

        // Wait for at least one subsequent batch to arrive while scrolled.
        await expect.poll(async () => (await app.getComponent(storeId, ['count'])).count, {
            message: 'more rows arrive after mid-stream scroll',
            timeout: 10000
        }).toBeGreaterThan(countBeforeScroll);

        expect((await app.getComponent(viewId, ['scrollTop'])).scrollTop).toBeGreaterThan(0);

        await expect.poll(async () => app.getComponent(storeId, ['count', 'isStreaming']), {
            message: 'reloaded stream completes at 50,000 rows',
            timeout: 15000
        }).toMatchObject({count: 50000, isStreaming: false});

        const trace = await page.evaluate(() => window.__streamRestartTrace);

        expect(trace.labels.some(text => /^0 \/ 50,000 rows$/.test(text))).toBe(true);
        expect(trace.rows.includes(0)).toBe(true);
        expect(trace.labels.some(text => text.startsWith('Streaming '))).toBe(true);
        await expect(status).toHaveText('50,000 / 50,000 rows')
    });

    test('observes mid-stream row selection and column sorting while chunks arrive', async ({page, neuralLink}, testInfo) => {
        await page.goto(EXAMPLE_URL);

        const app = await neuralLink.connectToApp('Neo.examples.grid.streaming');

        await page.waitForSelector('.neo-grid-container', {state: 'visible', timeout: 30000});

        const [grid]  = await app.queryComponent({className: 'Neo.grid.Container'}, ['body.id', 'id', 'store.id']),
              bodyId  = grid.properties['body.id'],
              storeId = grid.properties['store.id'];

        const rows = page.locator(`#${bodyId} .neo-grid-row[data-record-id]:visible`);
        await expect(rows.first()).toBeVisible();
        const initialRecordId = await rows.first().getAttribute('data-record-id');

        // Trigger a fresh stream once NL is connected so interactions land cleanly mid-stream.
        await page.locator('.streaming-reload-button').click();

        await expect.poll(async () => {
            const state          = await app.getComponent(storeId, ['count', 'isStreaming']),
                  currentFirstId = await rows.count() > 0
                      ? await rows.first().getAttribute('data-record-id', {timeout: 250}).catch(() => null)
                      : null;

            return state.isStreaming
                && state.count >= 250
                && state.count < 50000
                && Boolean(currentFirstId)
                && currentFirstId !== initialRecordId
        }, {message: 'fresh stream active mid-flight', timeout: 15000}).toBe(true);

        const targetRow = rows.first();
        await expect(targetRow).toBeVisible();

        const selectedRecordId = await targetRow.getAttribute('data-record-id');
        expect(selectedRecordId).toBeTruthy();

        await targetRow.click();
        await expect(page.locator(`#${bodyId} .neo-grid-row[data-record-id="${selectedRecordId}"]`)).toHaveClass(/neo-selected/);

        const midStreamBeforeSort = await app.getComponent(storeId, ['count', 'isStreaming']);
        expect(midStreamBeforeSort.isStreaming).toBe(true);
        expect(midStreamBeforeSort.count).toBeLessThan(50000);

        const amountHeader = page.locator('.neo-grid-header-button', {hasText: 'Amount'});
        await amountHeader.click();
        await expect(amountHeader).toHaveAttribute('aria-sort', 'ascending');

        const midStreamAfterSort = await app.getComponent(storeId, ['count', 'isStreaming', 'sorters']);
        expect(midStreamAfterSort.sorters.length).toBe(1);

        await expect.poll(async () => app.getComponent(storeId, ['count', 'isStreaming']), {
            message: 'stream finishes cleanly after mid-stream selection and sort',
            timeout: 15000
        }).toMatchObject({count: 50000, isStreaming: false});

        const amounts = await page.locator(`#${bodyId} .neo-grid-row .neo-grid-cell[data-field="amount"]`).allTextContents(),
              parsed  = amounts.map(text => Number(text.replace(/[^0-9.-]+/g, '')));

        for (let i = 1; i < parsed.length; i++) {
            expect(parsed[i]).toBeGreaterThanOrEqual(parsed[i - 1])
        }

        const selectionCount = await page.locator(`#${bodyId} .neo-grid-row.neo-selected`).count();

        const observation = {
            midStreamBeforeSort,
            midStreamAfterSortCount    : midStreamAfterSort.count,
            midStreamAfterSortStreaming: midStreamAfterSort.isStreaming,
            parsedVisibleSortedAmounts : parsed.slice(0, 6),
            selectedRecordId,
            selectionVisibleAfterSort  : selectionCount
        };

        console.log('[ac4-observation]', JSON.stringify(observation));

        await testInfo.attach('mid-stream-interaction-observation', {
            body       : JSON.stringify(observation, null, 2),
            contentType: 'application/json'
        })
    });

    test('390x844 mobile layout fits toolbars without horizontal overflow and toggles light/dark theme', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(EXAMPLE_URL);

        const app = await neuralLink.connectToApp('Neo.examples.grid.streaming');
        await page.waitForSelector('.neo-grid-row[data-record-id]', {state: 'visible', timeout: 30000});

        const [mainView]                           = await app.queryComponent({className: 'Neo.examples.grid.streaming.MainContainer'}, ['id']),
              [toolbarFits, footerFits, reloadBox] = await Promise.all([
                  page.locator('.streaming-toolbar').evaluate(node => node.scrollWidth <= node.clientWidth + 1),
                  page.locator('.streaming-footer-toolbar').evaluate(node => node.scrollWidth <= node.clientWidth + 1),
                  page.locator('.streaming-reload-button').boundingBox()
              ]);

        expect(toolbarFits).toBe(true);
        expect(footerFits).toBe(true);
        expect(reloadBox.x + reloadBox.width).toBeLessThanOrEqual(390);
        expect(reloadBox.y + reloadBox.height).toBeLessThanOrEqual(844);

        const themeButton = page.locator('.streaming-toolbar .neo-button');

        expect(await app.callMethod(mainView.id, 'getTheme', [])).toBe('neo-theme-neo-light');
        await expect(themeButton).toHaveText('Dark theme');
        await themeButton.click();
        await expect.poll(() => app.callMethod(mainView.id, 'getTheme', [])).toBe('neo-theme-neo-dark');
        await expect(page.locator('.neo-examples-grid-streaming')).toHaveClass(/neo-theme-neo-dark/);
        await expect(themeButton).toHaveText('Light theme');
        await themeButton.click();
        await expect.poll(() => app.callMethod(mainView.id, 'getTheme', [])).toBe('neo-theme-neo-light');
        await expect(page.locator('.neo-examples-grid-streaming')).toHaveClass(/neo-theme-neo-light/);
        await expect(themeButton).toHaveText('Dark theme')
    });
});
